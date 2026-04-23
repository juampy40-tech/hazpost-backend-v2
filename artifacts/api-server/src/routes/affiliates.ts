import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import { getAffiliateDefaults } from "./admin/affiliate-settings.js";

const router = Router();

/** GET /api/affiliates/settings — configuración pública del programa de afiliados */
router.get("/settings", requireAuth, async (_req, res) => {
  try {
    const defaults = await getAffiliateDefaults();
    return res.json({
      default_commission_pct: defaults.default_commission_pct,
      default_duration_months: defaults.default_duration_months,
    });
  } catch (err) {
    logger.error({ err }, "GET /affiliates/settings error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** GET /api/affiliates/status — my affiliate application status */
router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const result = await db.execute(sql`
      SELECT id, status, commission_pct, affiliate_code, created_at, reviewed_at
      FROM affiliate_applications
      WHERE user_id = ${userId}
      LIMIT 1
    `);
    if (!result.rows.length) {
      return res.json({ application: null });
    }
    return res.json({ application: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "GET /affiliates/status error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** POST /api/affiliates/apply — submit affiliate application */
router.post("/apply", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { name, email, socialUrl, audienceSize, description } = req.body as {
      name?: string;
      email?: string;
      socialUrl?: string;
      audienceSize?: string;
      description?: string;
    };

    if (!name || !email) {
      return res.status(400).json({ error: "Nombre y email son requeridos" });
    }

    // Check if already applied
    const existing = await db.execute(sql`
      SELECT id, status FROM affiliate_applications WHERE user_id = ${userId} LIMIT 1
    `);
    if (existing.rows.length > 0) {
      const app = existing.rows[0] as { status: string };
      if (app.status === "pending") {
        return res.status(409).json({ error: "Ya tienes una solicitud pendiente de revisión" });
      }
      if (app.status === "approved") {
        return res.status(409).json({ error: "Ya eres afiliado de HazPost" });
      }
    }

    await db.execute(sql`
      INSERT INTO affiliate_applications (user_id, name, email, social_url, audience_size, description, status)
      VALUES (${userId}, ${name}, ${email}, ${socialUrl ?? null}, ${audienceSize ?? null}, ${description ?? null}, 'pending')
      ON CONFLICT (user_id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        social_url = EXCLUDED.social_url,
        audience_size = EXCLUDED.audience_size,
        description = EXCLUDED.description,
        status = 'pending',
        reviewed_at = NULL
    `);

    logger.info({ userId, name }, "New affiliate application submitted");
    return res.json({ success: true, message: "Solicitud enviada. Te contactaremos en 48 horas." });
  } catch (err) {
    logger.error({ err }, "POST /affiliates/apply error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** GET /api/affiliates/leaderboard — top affiliates (public stats) */
router.get("/leaderboard", requireAuth, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT aa.name, aa.affiliate_code, aa.commission_pct,
             COUNT(rc.id) AS conversions
      FROM affiliate_applications aa
      LEFT JOIN referral_conversions rc ON rc.used_code = aa.affiliate_code AND rc.status = 'credited'
      WHERE aa.status = 'approved'
      GROUP BY aa.id
      ORDER BY conversions DESC
      LIMIT 10
    `);
    return res.json({ leaderboard: result.rows });
  } catch (err) {
    logger.error({ err }, "GET /affiliates/leaderboard error");
    return res.status(500).json({ error: "Error interno" });
  }
});

export default router;
