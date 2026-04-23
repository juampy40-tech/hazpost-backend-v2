import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

const router = Router();

/** Shared helper: returns the current global affiliate defaults from DB (falls back to safe defaults). */
export async function getAffiliateDefaults(): Promise<{
  default_commission_pct: number;
  default_duration_months: number;
  min_payout_usd: number;
}> {
  try {
    const result = await db.execute(sql`
      SELECT default_commission_pct, default_duration_months, min_payout_usd
      FROM affiliate_settings WHERE id = 1 LIMIT 1
    `);
    if (result.rows.length > 0) {
      const r = result.rows[0] as { default_commission_pct: number; default_duration_months: number; min_payout_usd: number };
      return {
        default_commission_pct: Number(r.default_commission_pct) || 20,
        default_duration_months: Number(r.default_duration_months) || 6,
        min_payout_usd: Number(r.min_payout_usd) || 50,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { default_commission_pct: 20, default_duration_months: 6, min_payout_usd: 50 };
}

/** GET /api/admin/affiliate-settings — obtener configuración global del programa */
router.get("/", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM affiliate_settings WHERE id = 1 LIMIT 1
    `);
    if (result.rows.length === 0) {
      return res.json({
        id: 1,
        default_commission_pct: 20,
        default_duration_months: 6,
        min_payout_usd: 50,
        is_program_open: true,
        program_description: "",
      });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "GET /admin/affiliate-settings error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** PUT /api/admin/affiliate-settings — actualizar configuración global */
router.put("/", async (req, res) => {
  const {
    default_commission_pct,
    default_duration_months,
    min_payout_usd,
    is_program_open,
    program_description,
  } = req.body as {
    default_commission_pct?: number;
    default_duration_months?: number;
    min_payout_usd?: number;
    is_program_open?: boolean;
    program_description?: string;
  };

  const pct = Number(default_commission_pct ?? 20);
  const months = Number(default_duration_months ?? 6);
  const minPayout = Number(min_payout_usd ?? 50);

  if (pct < 1 || pct > 100) return res.status(400).json({ error: "Comisión debe ser entre 1% y 100%" });
  if (months < 1 || months > 60) return res.status(400).json({ error: "Duración debe ser entre 1 y 60 meses" });
  if (minPayout < 0) return res.status(400).json({ error: "Monto mínimo no puede ser negativo" });

  try {
    await db.execute(sql`
      INSERT INTO affiliate_settings (id, default_commission_pct, default_duration_months, min_payout_usd, is_program_open, program_description, updated_at)
      VALUES (1, ${pct}, ${months}, ${minPayout}, ${is_program_open ?? true}, ${program_description ?? ""}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        default_commission_pct  = EXCLUDED.default_commission_pct,
        default_duration_months = EXCLUDED.default_duration_months,
        min_payout_usd          = EXCLUDED.min_payout_usd,
        is_program_open         = EXCLUDED.is_program_open,
        program_description     = EXCLUDED.program_description,
        updated_at              = NOW()
    `);
    logger.info({ pct, months, minPayout }, "Affiliate global settings updated");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "PUT /admin/affiliate-settings error");
    return res.status(500).json({ error: "Error interno" });
  }
});

export default router;
