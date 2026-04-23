import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getAffiliateDefaults } from "./affiliate-settings.js";

const router = Router();

interface AffiliateCodeRow {
  id: number;
  code: string;
  commission_pct: number;
  duration_months: number;
  email: string;
  notes: string | null;
  is_active: boolean;
  is_expired: boolean;
  created_at: string;
  updated_at: string;
  conversions: number;
  total_commission_usd: number | null;
}

/**
 * GET /api/admin/affiliate-codes
 * Lists all codes with conversion counts, commission totals, and expiry status.
 */
router.get("/", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        ac.id,
        ac.code,
        ac.commission_pct,
        ac.duration_months,
        ac.email,
        ac.notes,
        ac.is_active,
        ac.created_at,
        ac.updated_at,
        NOW() > (ac.created_at + (ac.duration_months * INTERVAL '1 month')) AS is_expired,
        COUNT(aconv.id)::int                                               AS conversions,
        SUM(aconv.amount_usd * ac.commission_pct / 100.0)                 AS total_commission_usd
      FROM affiliate_codes ac
      LEFT JOIN affiliate_conversions aconv ON aconv.code_id = ac.id
      GROUP BY ac.id
      ORDER BY ac.created_at DESC
    `);
    return res.json(result.rows as AffiliateCodeRow[]);
  } catch (err) {
    return res.status(500).json({ error: "Error al cargar códigos de afiliado" });
  }
});

/**
 * POST /api/admin/affiliate-codes
 * Create a new affiliate code.
 */
router.post("/", async (req, res) => {
  const { code, commission_pct, duration_months, email, notes } = req.body as {
    code?: string;
    commission_pct?: number;
    duration_months?: number;
    email?: string;
    notes?: string;
  };

  if (!code || !email) {
    return res.status(400).json({ error: "Código y email son requeridos" });
  }
  const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, "");
  if (cleanCode.length < 3 || cleanCode.length > 30) {
    return res.status(400).json({ error: "El código debe tener entre 3 y 30 caracteres alfanuméricos" });
  }
  if (!cleanCode.startsWith("A")) {
    return res.status(400).json({ error: "El código de afiliado debe empezar con la letra A" });
  }
  const globalDefaults = await getAffiliateDefaults();
  const pct = Number(commission_pct ?? globalDefaults.default_commission_pct);
  const months = Number(duration_months ?? globalDefaults.default_duration_months);
  if (pct < 1 || pct > 100) {
    return res.status(400).json({ error: "Comisión debe ser entre 1 y 100%" });
  }
  if (months < 1 || months > 60) {
    return res.status(400).json({ error: "Duración debe ser entre 1 y 60 meses" });
  }

  try {
    const existing = await db.execute(sql`SELECT id FROM affiliate_codes WHERE code = ${cleanCode}`);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Ya existe un código con ese nombre" });
    }

    const result = await db.execute(sql`
      INSERT INTO affiliate_codes (code, commission_pct, duration_months, email, notes, is_active)
      VALUES (${cleanCode}, ${pct}, ${months}, ${email.trim().toLowerCase()}, ${notes?.trim() ?? null}, true)
      RETURNING *
    `);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Error al crear código de afiliado" });
  }
});

/**
 * PUT /api/admin/affiliate-codes/:id
 * Update a code (commission, months, email, notes, is_active).
 */
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  // Fetch existing row first so partial payloads don't reset unspecified fields
  const existing = await db.execute(sql`SELECT * FROM affiliate_codes WHERE id = ${id} LIMIT 1`);
  if (existing.rows.length === 0) return res.status(404).json({ error: "Código no encontrado" });
  const current = existing.rows[0] as AffiliateCodeRow;

  const { commission_pct, duration_months, email, notes, is_active } = req.body as {
    commission_pct?: number;
    duration_months?: number;
    email?: string;
    notes?: string;
    is_active?: boolean;
  };

  const pct     = commission_pct  !== undefined ? Number(commission_pct)  : current.commission_pct;
  const months  = duration_months !== undefined ? Number(duration_months) : current.duration_months;
  const newEmail    = email     !== undefined ? email.trim().toLowerCase()    : current.email;
  const newNotes    = notes     !== undefined ? (notes.trim() || null)        : current.notes;
  const newIsActive = is_active !== undefined ? is_active                    : current.is_active;

  if (pct < 1 || pct > 100) return res.status(400).json({ error: "Comisión debe ser entre 1 y 100%" });
  if (months < 1 || months > 60) return res.status(400).json({ error: "Duración debe ser entre 1 y 60 meses" });

  try {
    const result = await db.execute(sql`
      UPDATE affiliate_codes
      SET commission_pct  = ${pct},
          duration_months = ${months},
          email           = ${newEmail},
          notes           = ${newNotes},
          is_active       = ${newIsActive},
          updated_at      = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Error al actualizar código" });
  }
});

/**
 * DELETE /api/admin/affiliate-codes/:id
 * Delete a code (cascades to affiliate_conversions).
 */
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  try {
    await db.execute(sql`DELETE FROM affiliate_codes WHERE id = ${id}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Error al eliminar código" });
  }
});

/**
 * GET /api/admin/affiliate-codes/:id/conversions
 * Returns all users that registered using this code, with commission per conversion.
 */
router.get("/:id/conversions", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  try {
    const result = await db.execute(sql`
      SELECT
        aconv.id,
        aconv.user_id,
        aconv.plan,
        aconv.amount_usd,
        aconv.registered_at,
        u.email        AS user_email,
        u.display_name AS user_name,
        ROUND((COALESCE(aconv.amount_usd, 0) * ac.commission_pct / 100.0)::numeric, 2) AS commission_usd
      FROM affiliate_conversions aconv
      JOIN affiliate_codes ac ON ac.id = aconv.code_id
      LEFT JOIN users u ON u.id = aconv.user_id
      WHERE aconv.code_id = ${id}
      ORDER BY aconv.registered_at DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: "Error al cargar conversiones" });
  }
});

/**
 * GET /api/admin/affiliate-codes/:id/stats
 * Aggregate stats: total conversions, total revenue, accumulated commission.
 */
router.get("/:id/stats", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  try {
    const codeResult = await db.execute(sql`
      SELECT * FROM affiliate_codes WHERE id = ${id} LIMIT 1
    `);
    if (codeResult.rows.length === 0) return res.status(404).json({ error: "Código no encontrado" });
    const code = codeResult.rows[0] as AffiliateCodeRow;

    const statsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                           AS total_conversions,
        COALESCE(SUM(amount_usd), 0)::real                                     AS total_revenue_usd,
        COALESCE(SUM(amount_usd * ${code.commission_pct} / 100.0), 0)::real   AS total_commission_usd
      FROM affiliate_conversions
      WHERE code_id = ${id}
    `);

    return res.json({
      code,
      stats: statsResult.rows[0],
    });
  } catch (err) {
    return res.status(500).json({ error: "Error al cargar estadísticas" });
  }
});

export default router;
