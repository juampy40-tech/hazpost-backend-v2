import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { normalizePlanKey } from "../../lib/auth.js";

const router = Router();

/** GET /api/admin/vouchers — listar todos los vouchers */
router.get("/", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        vc.*,
        COUNT(vr.id) AS redemption_count
      FROM voucher_codes vc
      LEFT JOIN voucher_redemptions vr ON vr.voucher_id = vc.id
      GROUP BY vc.id
      ORDER BY vc.created_at DESC
    `);
    return res.json({ vouchers: result.rows });
  } catch (err) {
    logger.error({ err }, "GET /admin/vouchers error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** POST /api/admin/vouchers — crear nuevo voucher */
router.post("/", async (req, res) => {
  const {
    code,
    trial_plan,
    trial_days,
    bonus_credits,
    max_uses,
    description,
    expires_at,
    is_active,
  } = req.body as {
    code?: string;
    trial_plan?: string;
    trial_days?: number;
    bonus_credits?: number;
    max_uses?: number | null;
    description?: string;
    expires_at?: string | null;
    is_active?: boolean;
  };

  const cleanCode = (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!cleanCode || cleanCode.length < 3 || cleanCode.length > 50) {
    return res.status(400).json({ error: "El código debe tener entre 3 y 50 caracteres alfanuméricos" });
  }

  const days = Number(trial_days ?? 30);
  const credits = Number(bonus_credits ?? 0);
  if (days < 1 || days > 365) return res.status(400).json({ error: "Los días de prueba deben ser entre 1 y 365" });
  if (credits < 0) return res.status(400).json({ error: "Los créditos no pueden ser negativos" });

  const validPlans = ["free", "starter", "negocio", "emprendedor", "business", "agency"];
  if (trial_plan && !validPlans.includes(trial_plan)) {
    return res.status(400).json({ error: "Plan no válido" });
  }
  const normalizedTrialPlan = trial_plan ? normalizePlanKey(trial_plan) : null;

  try {
    const existing = await db.execute(sql`SELECT id FROM voucher_codes WHERE code = ${cleanCode}`);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `El código "${cleanCode}" ya existe` });
    }

    const result = await db.execute(sql`
      INSERT INTO voucher_codes (code, trial_plan, trial_days, bonus_credits, max_uses, description, expires_at, is_active)
      VALUES (
        ${cleanCode},
        ${normalizedTrialPlan},
        ${days},
        ${credits},
        ${max_uses ?? null},
        ${description ?? null},
        ${expires_at ?? null},
        ${is_active ?? true}
      )
      RETURNING *
    `);
    logger.info({ code: cleanCode, trial_plan, days, credits }, "Voucher created");
    return res.status(201).json({ ok: true, voucher: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "POST /admin/vouchers error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** PATCH /api/admin/vouchers/:id — editar voucher */
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "ID inválido" });

  const {
    trial_plan,
    trial_days,
    bonus_credits,
    max_uses,
    description,
    expires_at,
    is_active,
  } = req.body as {
    trial_plan?: string | null;
    trial_days?: number;
    bonus_credits?: number;
    max_uses?: number | null;
    description?: string;
    expires_at?: string | null;
    is_active?: boolean;
  };

  const normalizedPatchTrialPlan = trial_plan != null ? normalizePlanKey(trial_plan) : trial_plan;

  try {
    await db.execute(sql`
      UPDATE voucher_codes SET
        trial_plan    = COALESCE(${normalizedPatchTrialPlan ?? null}, trial_plan),
        trial_days    = COALESCE(${trial_days ?? null}, trial_days),
        bonus_credits = COALESCE(${bonus_credits ?? null}, bonus_credits),
        max_uses      = ${max_uses !== undefined ? max_uses : sql`max_uses`},
        description   = COALESCE(${description ?? null}, description),
        expires_at    = ${expires_at !== undefined ? expires_at : sql`expires_at`},
        is_active     = COALESCE(${is_active ?? null}, is_active),
        updated_at    = NOW()
      WHERE id = ${id}
    `);
    logger.info({ id }, "Voucher updated");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "PATCH /admin/vouchers error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** DELETE /api/admin/vouchers/:id — eliminar voucher */
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "ID inválido" });

  try {
    await db.execute(sql`DELETE FROM voucher_codes WHERE id = ${id}`);
    logger.info({ id }, "Voucher deleted");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /admin/vouchers error");
    return res.status(500).json({ error: "Error interno" });
  }
});

export default router;
