import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { getAffiliateDefaults } from "./affiliate-settings.js";

const router = Router();

/** GET /api/admin/affiliates — list all affiliate applications */
router.get("/", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT aa.id, aa.user_id, aa.name, aa.email, aa.social_url, aa.audience_size,
             aa.description, aa.status, aa.commission_pct, aa.duration_months,
             aa.affiliate_code, aa.created_at, aa.reviewed_at,
             COUNT(rc.id) AS conversions
      FROM affiliate_applications aa
      LEFT JOIN referral_conversions rc
        ON rc.used_code = aa.affiliate_code AND rc.status = 'credited'
      GROUP BY aa.id
      ORDER BY aa.created_at DESC
    `);
    return res.json({ affiliates: result.rows });
  } catch (err) {
    logger.error({ err }, "GET /admin/affiliates error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/**
 * PATCH /api/admin/affiliates/:id
 * Approve or reject an affiliate application.
 * Body (approve): { action: "approve", commission_pct, duration_months, affiliate_code }
 * Body (reject):  { action: "reject" }
 */
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const { action, commission_pct, duration_months, affiliate_code } = req.body as {
    action?: string;
    commission_pct?: number;
    duration_months?: number;
    affiliate_code?: string;
  };

  if (action === "approve") {
    const globalDefaults = await getAffiliateDefaults();
    const pct = Number(commission_pct ?? globalDefaults.default_commission_pct);
    const months = Number(duration_months ?? globalDefaults.default_duration_months);
    if (pct < 1 || pct > 100) return res.status(400).json({ error: "Comisión debe ser entre 1% y 100%" });
    if (months < 1 || months > 60) return res.status(400).json({ error: "Duración debe ser entre 1 y 60 meses" });

    // Auto-generate affiliate code if not provided
    let code = (affiliate_code ?? "").trim().toUpperCase();
    if (!code) {
      const [row] = (await db.execute(sql`SELECT name FROM affiliate_applications WHERE id = ${id}`)).rows as Array<{ name: string }>;
      const base = (row?.name ?? "HP").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6);
      code = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Check code uniqueness
    const existing = await db.execute(sql`
      SELECT id FROM affiliate_applications WHERE affiliate_code = ${code} AND id != ${id}
    `);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `El código "${code}" ya está en uso por otro afiliado` });
    }

    await db.execute(sql`
      UPDATE affiliate_applications
      SET status = 'approved',
          commission_pct = ${pct},
          duration_months = ${months},
          affiliate_code = ${code},
          reviewed_at = NOW()
      WHERE id = ${id}
    `);

    logger.info({ id, pct, months, code }, "Affiliate approved");
    return res.json({ ok: true, affiliate_code: code });
  }

  if (action === "reject") {
    await db.execute(sql`
      UPDATE affiliate_applications
      SET status = 'rejected', reviewed_at = NOW()
      WHERE id = ${id}
    `);
    logger.info({ id }, "Affiliate rejected");
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "action debe ser 'approve' o 'reject'" });
});

export default router;
