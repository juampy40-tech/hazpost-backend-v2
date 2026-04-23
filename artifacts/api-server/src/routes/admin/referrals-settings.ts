import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../../lib/logger.js";

const router = Router();

/** Available feature unlock keys */
export const FEATURE_UNLOCK_KEYS = [
  "extra_niche",        // 1 extra niche slot beyond plan limit
  "watermark_removal",  // Remove HazPost watermark from generated content
  "priority_generation",// Priority queue for AI content generation
  "custom_domain",      // Allow linking a custom domain to landing pages
] as const;

export type FeatureUnlockMap = Partial<Record<typeof FEATURE_UNLOCK_KEYS[number], boolean>>;

interface ReferralSettings {
  id: number;
  is_enabled: boolean;
  referrer_credits: number;
  referee_credits: number;
  referrer_free_days: number;
  referee_free_days: number;
  min_plan_for_bonus: string;
  max_activation_days: number;
  max_referrals_per_user: number;
  referrer_unlocks: FeatureUnlockMap;
  referee_unlocks: FeatureUnlockMap;
  updated_at: string;
}

function sanitizeUnlocks(raw: unknown): FeatureUnlockMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const safe: FeatureUnlockMap = {};
  for (const key of FEATURE_UNLOCK_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") safe[key] = v;
  }
  return safe;
}

/** GET /api/admin/referrals/settings */
router.get("/settings", async (_req, res) => {
  try {
    const result = await db.execute(sql`SELECT * FROM referral_settings WHERE id = 1 LIMIT 1`);
    if (result.rows.length === 0) {
      return res.json({
        id: 1, is_enabled: true, referrer_credits: 30, referee_credits: 10,
        referrer_free_days: 0, referee_free_days: 0, min_plan_for_bonus: "starter",
        max_activation_days: 60, max_referrals_per_user: 0,
        referrer_unlocks: {}, referee_unlocks: {}, updated_at: null,
      });
    }
    return res.json(result.rows[0] as ReferralSettings);
  } catch (err) {
    logger.error({ err }, "GET /admin/referrals/settings error");
    return res.status(500).json({ error: "Error al cargar configuración" });
  }
});

/** PUT /api/admin/referrals/settings */
router.put("/settings", async (req, res) => {
  const {
    is_enabled, referrer_credits, referee_credits,
    referrer_free_days, referee_free_days, min_plan_for_bonus,
    max_activation_days, max_referrals_per_user,
    referrer_unlocks, referee_unlocks,
  } = req.body as Partial<ReferralSettings>;

  const enabled      = is_enabled              !== undefined ? Boolean(is_enabled) : true;
  const refererCr    = Math.max(0, Math.min(500, Number(referrer_credits   ?? 30)));
  const refereeCr    = Math.max(0, Math.min(500, Number(referee_credits    ?? 10)));
  const refererDays  = Math.max(0, Math.min(365, Number(referrer_free_days ?? 0)));
  const refereeDays  = Math.max(0, Math.min(365, Number(referee_free_days  ?? 0)));
  const minPlan      = ["free", "starter", "business", "agency"].includes(min_plan_for_bonus as string)
    ? min_plan_for_bonus as string : "starter";
  const maxDays      = Math.max(1, Math.min(365, Number(max_activation_days    ?? 60)));
  const maxReferrals = Math.max(0, Math.min(9999, Number(max_referrals_per_user ?? 0)));
  const refererUnlocks = JSON.stringify(sanitizeUnlocks(referrer_unlocks ?? {}));
  const refereeUnlocks = JSON.stringify(sanitizeUnlocks(referee_unlocks  ?? {}));

  try {
    const result = await db.execute(sql`
      INSERT INTO referral_settings (
        id, is_enabled, referrer_credits, referee_credits,
        referrer_free_days, referee_free_days, min_plan_for_bonus,
        max_activation_days, max_referrals_per_user,
        referrer_unlocks, referee_unlocks, updated_at
      ) VALUES (
        1, ${enabled}, ${refererCr}, ${refereeCr},
        ${refererDays}, ${refereeDays}, ${minPlan},
        ${maxDays}, ${maxReferrals},
        ${refererUnlocks}::jsonb, ${refereeUnlocks}::jsonb, NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        is_enabled              = EXCLUDED.is_enabled,
        referrer_credits        = EXCLUDED.referrer_credits,
        referee_credits         = EXCLUDED.referee_credits,
        referrer_free_days      = EXCLUDED.referrer_free_days,
        referee_free_days       = EXCLUDED.referee_free_days,
        min_plan_for_bonus      = EXCLUDED.min_plan_for_bonus,
        max_activation_days     = EXCLUDED.max_activation_days,
        max_referrals_per_user  = EXCLUDED.max_referrals_per_user,
        referrer_unlocks        = EXCLUDED.referrer_unlocks,
        referee_unlocks         = EXCLUDED.referee_unlocks,
        updated_at              = NOW()
      RETURNING *
    `);
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "PUT /admin/referrals/settings error");
    return res.status(500).json({ error: "Error al guardar configuración" });
  }
});

/** GET /api/admin/referrals/history */
router.get("/history", async (req, res) => {
  const page  = Math.max(1, Number(req.query.page  ?? 1));
  const limit = Math.min(100, Math.max(10, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;

  try {
    const [rows, total] = await Promise.all([
      db.execute(sql`
        SELECT
          rc.id,
          rc.status,
          rc.credits_awarded              AS referrer_credits_awarded,
          rc.referee_credits_awarded,
          rc.created_at,
          rc.credited_at,
          rc.used_code,
          referrer.id                     AS referrer_id,
          referrer.email                  AS referrer_email,
          referrer.display_name           AS referrer_name,
          referred.id                     AS referred_id,
          referred.email                  AS referred_email,
          referred.display_name           AS referred_name,
          referred.plan                   AS referred_plan
        FROM referral_conversions rc
        JOIN users referrer ON referrer.id = rc.referrer_id
        JOIN users referred ON referred.id = rc.referred_user_id
        ORDER BY rc.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM referral_conversions`),
    ]);

    return res.json({
      history: rows.rows,
      total: (total.rows[0] as { count: number }).count,
      page,
      limit,
    });
  } catch (err) {
    logger.error({ err }, "GET /admin/referrals/history error");
    return res.status(500).json({ error: "Error al cargar historial" });
  }
});

// ── Referral Codes (custom per-code overrides) ────────────────────────────────

interface ReferralCodeRow {
  id: number;
  code: string;
  referrer_credits: number;
  referee_credits: number;
  referrer_free_days: number;
  referee_free_days: number;
  min_plan_for_bonus: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  conversions: number;
}

/** GET /api/admin/referrals/codes — list all custom referral codes */
router.get("/codes", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        rc.id,
        rc.code,
        rc.referrer_credits,
        rc.referee_credits,
        rc.referrer_free_days,
        rc.referee_free_days,
        rc.min_plan_for_bonus,
        rc.description,
        rc.is_active,
        rc.created_at,
        rc.updated_at,
        COUNT(conv.id)::int AS conversions
      FROM referral_codes rc
      LEFT JOIN referral_conversions conv ON conv.used_code = rc.code
      GROUP BY rc.id
      ORDER BY rc.created_at DESC
    `);
    return res.json(result.rows as ReferralCodeRow[]);
  } catch (err) {
    logger.error({ err }, "GET /admin/referrals/codes error");
    return res.status(500).json({ error: "Error al cargar códigos de referido" });
  }
});

/** POST /api/admin/referrals/codes — create a new custom referral code */
router.post("/codes", async (req, res) => {
  const {
    code, referrer_credits, referee_credits,
    referrer_free_days, referee_free_days,
    min_plan_for_bonus, description,
  } = req.body as Partial<ReferralCodeRow>;

  const rawCode = (code ?? "").trim().toUpperCase();
  if (!rawCode || !/^[A-Z0-9_-]{2,50}$/.test(rawCode)) {
    return res.status(400).json({ error: "Código inválido (2-50 chars: letras, números, guion, guion bajo)" });
  }
  const minPlan = ["free", "starter", "business", "agency"].includes(min_plan_for_bonus as string)
    ? min_plan_for_bonus as string : "starter";

  try {
    const result = await db.execute(sql`
      INSERT INTO referral_codes (
        code, referrer_credits, referee_credits,
        referrer_free_days, referee_free_days,
        min_plan_for_bonus, description
      ) VALUES (
        ${rawCode},
        ${Math.max(0, Math.min(500, Number(referrer_credits ?? 0)))},
        ${Math.max(0, Math.min(500, Number(referee_credits ?? 0)))},
        ${Math.max(0, Math.min(365, Number(referrer_free_days ?? 0)))},
        ${Math.max(0, Math.min(365, Number(referee_free_days ?? 0)))},
        ${minPlan},
        ${description?.trim() ?? null}
      )
      RETURNING *
    `);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return res.status(409).json({ error: `El código "${rawCode}" ya existe` });
    }
    logger.error({ err }, "POST /admin/referrals/codes error");
    return res.status(500).json({ error: "Error al crear código" });
  }
});

/** PATCH /api/admin/referrals/codes/:id — partial update of a custom referral code */
router.patch("/codes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "ID inválido" });

  try {
    // Load existing row first to support partial updates (omitted fields keep current value)
    const existing = await db.execute(sql`SELECT * FROM referral_codes WHERE id = ${id} LIMIT 1`);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Código no encontrado" });
    const cur = existing.rows[0] as ReferralCodeRow;

    const body = req.body as Partial<ReferralCodeRow>;
    const refererCr    = "referrer_credits"   in body ? Math.max(0, Math.min(500, Number(body.referrer_credits))) : cur.referrer_credits;
    const refereeCr    = "referee_credits"    in body ? Math.max(0, Math.min(500, Number(body.referee_credits))) : cur.referee_credits;
    const refererDays  = "referrer_free_days" in body ? Math.max(0, Math.min(365, Number(body.referrer_free_days))) : cur.referrer_free_days;
    const refereeDays  = "referee_free_days"  in body ? Math.max(0, Math.min(365, Number(body.referee_free_days))) : cur.referee_free_days;
    const minPlan      = "min_plan_for_bonus" in body && ["free", "starter", "business", "agency"].includes(body.min_plan_for_bonus as string)
      ? body.min_plan_for_bonus as string : cur.min_plan_for_bonus;
    const desc         = "description" in body ? (body.description?.trim() ?? null) : cur.description;
    const active       = "is_active"  in body ? Boolean(body.is_active) : cur.is_active;

    const result = await db.execute(sql`
      UPDATE referral_codes SET
        referrer_credits   = ${refererCr},
        referee_credits    = ${refereeCr},
        referrer_free_days = ${refererDays},
        referee_free_days  = ${refereeDays},
        min_plan_for_bonus = ${minPlan},
        description        = ${desc},
        is_active          = ${active},
        updated_at         = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "PATCH /admin/referrals/codes/:id error");
    return res.status(500).json({ error: "Error al actualizar código" });
  }
});

/** DELETE /api/admin/referrals/codes/:id — delete a code only if it has no conversions */
router.delete("/codes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "ID inválido" });

  try {
    // Guard: cannot delete if used in any conversion
    const codeRow = await db.execute(sql`SELECT code FROM referral_codes WHERE id = ${id} LIMIT 1`);
    if (codeRow.rows.length === 0) return res.status(404).json({ error: "Código no encontrado" });
    const { code } = codeRow.rows[0] as { code: string };

    const usageCheck = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM referral_conversions WHERE used_code = ${code}
    `);
    const cnt = (usageCheck.rows[0] as { cnt: number }).cnt;
    if (cnt > 0) {
      return res.status(409).json({ error: `No se puede eliminar: el código tiene ${cnt} conversión(es) registrada(s)` });
    }

    await db.execute(sql`DELETE FROM referral_codes WHERE id = ${id}`);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /admin/referrals/codes/:id error");
    return res.status(500).json({ error: "Error al eliminar código" });
  }
});

export default router;
