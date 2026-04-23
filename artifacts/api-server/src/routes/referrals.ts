import { Router } from "express";
import crypto from "crypto";
import { db, pool } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

function generateReferralCode(userId: number): string {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `R${userId}${random}`;
}

export interface ReferralSettingsFull {
  is_enabled: boolean;
  referrer_credits: number;
  referee_credits: number;
  referrer_free_days: number;
  referee_free_days: number;
  min_plan_for_bonus: string;
  max_activation_days: number;
  max_referrals_per_user: number;
  referrer_unlocks: Record<string, boolean>;
  referee_unlocks: Record<string, boolean>;
}

const DEFAULT_SETTINGS: ReferralSettingsFull = {
  is_enabled: true, referrer_credits: 30, referee_credits: 10,
  referrer_free_days: 0, referee_free_days: 0, min_plan_for_bonus: "starter",
  max_activation_days: 60, max_referrals_per_user: 0,
  referrer_unlocks: {}, referee_unlocks: {},
};

/** Helper: load referral settings from DB (with defaults if table/row not ready) */
export async function getReferralSettings(): Promise<ReferralSettingsFull> {
  try {
    const result = await db.execute(sql`SELECT * FROM referral_settings WHERE id = 1 LIMIT 1`);
    if (result.rows.length > 0) {
      const row = result.rows[0] as Record<string, unknown>;
      return {
        is_enabled:             Boolean(row.is_enabled ?? true),
        referrer_credits:       Number(row.referrer_credits   ?? 30),
        referee_credits:        Number(row.referee_credits    ?? 10),
        referrer_free_days:     Number(row.referrer_free_days ?? 0),
        referee_free_days:      Number(row.referee_free_days  ?? 0),
        min_plan_for_bonus:     String(row.min_plan_for_bonus  ?? "starter"),
        max_activation_days:    Number(row.max_activation_days    ?? 60),
        max_referrals_per_user: Number(row.max_referrals_per_user ?? 0),
        referrer_unlocks:       (typeof row.referrer_unlocks === "object" && row.referrer_unlocks ? row.referrer_unlocks : {}) as Record<string, boolean>,
        referee_unlocks:        (typeof row.referee_unlocks  === "object" && row.referee_unlocks  ? row.referee_unlocks  : {}) as Record<string, boolean>,
      };
    }
  } catch { /* fallback to defaults */ }
  return { ...DEFAULT_SETTINGS };
}

/** Plan ordering for min_plan_for_bonus enforcement */
const PLAN_ORDER: Record<string, number> = {
  free: 0, starter: 1, business: 2, agency: 3,
};

function planMeetsMinimum(userPlan: string, minPlan: string): boolean {
  const userLevel = PLAN_ORDER[userPlan?.toLowerCase()] ?? 0;
  const minLevel  = PLAN_ORDER[minPlan?.toLowerCase()]  ?? 1;
  return userLevel >= minLevel;
}

/** GET /api/referrals — get my referral code + stats + settings */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const [user] = await db
      .select({ myReferralCode: usersTable.myReferralCode })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    let code = user?.myReferralCode;

    // Auto-generate code if user doesn't have one yet
    if (!code) {
      code = generateReferralCode(userId);
      await db.execute(sql`
        UPDATE users SET my_referral_code = ${code} WHERE id = ${userId}
      `);
    }

    // Get referral stats from referral_conversions
    const stats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')  AS pending_count,
        COUNT(*) FILTER (WHERE status = 'credited') AS credited_count,
        COALESCE(SUM(credits_awarded) FILTER (WHERE status = 'credited'), 0) AS total_credits_earned,
        COUNT(*)                                     AS total_referrals
      FROM referral_conversions
      WHERE referrer_id = ${userId}
    `);

    const row = stats.rows[0] as {
      pending_count: string;
      credited_count: string;
      total_credits_earned: string;
      total_referrals: string;
    };

    const settings = await getReferralSettings();
    const appUrl = process.env.APP_URL || "https://hazpost.app";
    const referralUrl = `${appUrl}/register?ref=${code}`;

    return res.json({
      code,
      referralUrl,
      stats: {
        totalReferrals:     parseInt(row.total_referrals     ?? "0"),
        pendingReferrals:   parseInt(row.pending_count       ?? "0"),
        creditedReferrals:  parseInt(row.credited_count      ?? "0"),
        totalCreditsEarned: parseInt(row.total_credits_earned ?? "0"),
      },
      settings: {
        isEnabled:        settings.is_enabled,
        referrerCredits:  settings.referrer_credits,
        refereeCredits:   settings.referee_credits,
        referrerFreeDays: settings.referrer_free_days,
        refereeFreeDays:  settings.referee_free_days,
        minPlanForBonus:  settings.min_plan_for_bonus,
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /referrals error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** GET /api/referrals/my-code — alias for convenience */
router.get("/my-code", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  try {
    const [user] = await db.select({ myReferralCode: usersTable.myReferralCode }).from(usersTable).where(eq(usersTable.id, userId));
    let code = user?.myReferralCode;
    if (!code) {
      code = generateReferralCode(userId);
      await db.execute(sql`UPDATE users SET my_referral_code = ${code} WHERE id = ${userId}`);
    }
    const appUrl = process.env.APP_URL || "https://hazpost.app";
    return res.json({ code, referralUrl: `${appUrl}/register?ref=${code}` });
  } catch (err) {
    logger.error({ err }, "GET /referrals/my-code error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/**
 * POST /api/referrals/apply — validate and record a referral code during onboarding.
 * Body: { code: string }
 * Returns: { valid: boolean, referrerId?: number }
 */
router.post("/apply", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { code } = req.body as { code?: string };
  if (!code?.trim()) return res.status(400).json({ error: "Código requerido" });

  const upperCode = code.trim().toUpperCase();
  try {
    const settings = await getReferralSettings();
    if (!settings.is_enabled) return res.status(400).json({ error: "El programa de referidos está pausado" });

    // Verify user hasn't already used a code
    const me = await db.execute(sql`SELECT used_referral_code, can_be_referred FROM users WHERE id = ${userId} LIMIT 1`);
    const myData = me.rows[0] as { used_referral_code: string | null; can_be_referred: boolean };
    if (myData?.used_referral_code) return res.status(400).json({ error: "Ya usaste un código de referido" });
    if (myData?.can_be_referred === false) return res.status(400).json({ error: "No puedes usar códigos de referido" });

    const refResult = await db.execute(sql`SELECT id, can_refer FROM users WHERE my_referral_code = ${upperCode} LIMIT 1`);
    if (!refResult.rows.length) return res.status(404).json({ error: "Código inválido" });
    const { id: referrerId, can_refer } = refResult.rows[0] as { id: number; can_refer: boolean };
    if (referrerId === userId) return res.status(400).json({ error: "No puedes referirte a ti mismo" });
    if (can_refer === false) return res.status(400).json({ error: "Este código ya no está disponible" });

    await db.execute(sql`UPDATE users SET used_referral_code = ${upperCode} WHERE id = ${userId}`);
    await db.execute(sql`
      INSERT INTO referral_conversions (referrer_id, referred_user_id, used_code, status)
      VALUES (${referrerId}, ${userId}, ${upperCode}, 'pending')
      ON CONFLICT (referred_user_id) DO NOTHING
    `);

    logger.info({ referrerId, referredUserId: userId }, "Referral code applied at signup");
    return res.json({ valid: true, referrerId });
  } catch (err) {
    logger.error({ err }, "POST /referrals/apply error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** GET /api/referrals/conversions — list my referral conversions */
router.get("/conversions", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const result = await db.execute(sql`
      SELECT
        rc.id,
        rc.status,
        rc.credits_awarded,
        rc.referee_credits_awarded,
        rc.created_at,
        rc.credited_at,
        u.email        AS referred_email,
        u.display_name AS referred_name
      FROM referral_conversions rc
      JOIN users u ON u.id = rc.referred_user_id
      WHERE rc.referrer_id = ${userId}
      ORDER BY rc.created_at DESC
      LIMIT 50
    `);
    return res.json({ conversions: result.rows });
  } catch (err) {
    logger.error({ err }, "GET /referrals/conversions error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/**
 * Called internally from billing webhook when a referred user activates a paid plan.
 * Enforces: is_enabled, min_plan_for_bonus, max_activation_days, max_referrals_per_user.
 * Awards (inside a DB transaction with row lock to prevent duplicate processing):
 *   - referrer_credits + referrer_free_days + referrer_unlocks for the referrer
 *   - referee_credits  + referee_free_days  + referee_unlocks  for the referred user
 */
export async function creditReferral(referredUserId: number, paidPlan: string): Promise<void> {
  try {
    const settings = await getReferralSettings();

    if (!settings.is_enabled) {
      logger.info({ referredUserId }, "Referral system disabled — skipping credit");
      return;
    }

    // Enforce min_plan_for_bonus before opening any DB transaction
    if (!planMeetsMinimum(paidPlan, settings.min_plan_for_bonus)) {
      logger.info({ referredUserId, paidPlan, minPlan: settings.min_plan_for_bonus }, "Plan below minimum for referral bonus — skipping");
      return;
    }

    // Acquire a dedicated connection from the pool so all statements share a single pg session.
    // This guarantees real transaction atomicity and makes FOR UPDATE SKIP LOCKED effective.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock the pending conversion row for this referred user (SKIP LOCKED = idempotent on retries)
      const lockResult = await client.query<{ id: number; referrer_id: number }>(
        `SELECT id, referrer_id
         FROM referral_conversions
         WHERE referred_user_id = $1
           AND status = 'pending'
           AND created_at >= NOW() - ($2 * INTERVAL '1 day')
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [referredUserId, settings.max_activation_days],
      );

      if (!lockResult.rows.length) {
        await client.query("ROLLBACK");
        logger.info({ referredUserId }, "No pending referral conversion found (within window or already processing)");
        return;
      }

      const { id: conversionId, referrer_id: referrerId } = lockResult.rows[0];

      // Check referrals per user limit (0 = unlimited)
      if (settings.max_referrals_per_user > 0) {
        const countResult = await client.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM referral_conversions WHERE referrer_id = $1 AND status = 'credited'",
          [referrerId],
        );
        const credited = countResult.rows[0].count;
        if (credited >= settings.max_referrals_per_user) {
          await client.query("ROLLBACK");
          logger.info({ referrerId, credited, limit: settings.max_referrals_per_user }, "Referral limit reached — skipping");
          return;
        }
      }

      const referrerCredits = settings.referrer_credits;
      const refereeCredits  = settings.referee_credits;

      // — Credit referrer (PostgreSQL-safe subquery pattern, no ORDER BY/LIMIT in UPDATE) —
      if (referrerCredits > 0) {
        await client.query(
          `UPDATE subscriptions
           SET credits_remaining = credits_remaining + $1,
               credits_total     = credits_total + $1
           WHERE id = (SELECT id FROM subscriptions WHERE user_id = $2 ORDER BY id DESC LIMIT 1)`,
          [referrerCredits, referrerId],
        );
        await client.query("UPDATE users SET ai_credits = ai_credits + $1 WHERE id = $2", [referrerCredits, referrerId]);
      }
      if (settings.referrer_free_days > 0) {
        await client.query(
          `UPDATE subscriptions
           SET period_end = GREATEST(COALESCE(period_end, NOW()), NOW()) + ($1 * INTERVAL '1 day')
           WHERE id = (SELECT id FROM subscriptions WHERE user_id = $2 ORDER BY id DESC LIMIT 1)`,
          [settings.referrer_free_days, referrerId],
        );
      }

      // — Credit referee (referred user) —
      if (refereeCredits > 0) {
        await client.query(
          `UPDATE subscriptions
           SET credits_remaining = credits_remaining + $1,
               credits_total     = credits_total + $1
           WHERE id = (SELECT id FROM subscriptions WHERE user_id = $2 ORDER BY id DESC LIMIT 1)`,
          [refereeCredits, referredUserId],
        );
        await client.query("UPDATE users SET ai_credits = ai_credits + $1 WHERE id = $2", [refereeCredits, referredUserId]);
      }
      if (settings.referee_free_days > 0) {
        await client.query(
          `UPDATE subscriptions
           SET period_end = GREATEST(COALESCE(period_end, NOW()), NOW()) + ($1 * INTERVAL '1 day')
           WHERE id = (SELECT id FROM subscriptions WHERE user_id = $2 ORDER BY id DESC LIMIT 1)`,
          [settings.referee_free_days, referredUserId],
        );
      }

      // — Apply feature unlocks (JSONB merge) —
      const referrerUnlocks = settings.referrer_unlocks;
      const refereeUnlocks  = settings.referee_unlocks;

      if (Object.keys(referrerUnlocks).length > 0) {
        await client.query(
          "UPDATE users SET feature_unlocks = COALESCE(feature_unlocks, '{}'::jsonb) || $1::jsonb WHERE id = $2",
          [JSON.stringify(referrerUnlocks), referrerId],
        );
      }

      if (Object.keys(refereeUnlocks).length > 0) {
        await client.query(
          "UPDATE users SET feature_unlocks = COALESCE(feature_unlocks, '{}'::jsonb) || $1::jsonb WHERE id = $2",
          [JSON.stringify(refereeUnlocks), referredUserId],
        );
      }

      // Mark conversion as credited — this is the last step (status transitions only on full success)
      await client.query(
        `UPDATE referral_conversions
         SET status = 'credited', credits_awarded = $1, referee_credits_awarded = $2, credited_at = NOW()
         WHERE id = $3`,
        [referrerCredits, refereeCredits, conversionId],
      );

      await client.query("COMMIT");

      logger.info({
        referrerId, referredUserId, referrerCredits, refereeCredits,
        referrerFreeDays: settings.referrer_free_days, refereeFreeDays: settings.referee_free_days,
        referrerUnlocks, refereeUnlocks, paidPlan,
      }, "Referral credited atomically via dedicated pg client");
    } catch (innerErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err, referredUserId }, "Failed to credit referral");
  }
}

/**
 * @deprecated Use creditReferral(userId, plan) instead.
 * Kept for backward compatibility with any existing callers.
 */
export async function creditReferrer(referredUserId: number): Promise<void> {
  // Try to get the user's current plan for min_plan_for_bonus enforcement
  try {
    const userRow = await db.execute(sql`SELECT plan FROM users WHERE id = ${referredUserId} LIMIT 1`);
    const plan = (userRow.rows[0] as { plan?: string })?.plan ?? "starter";
    return creditReferral(referredUserId, plan);
  } catch {
    return creditReferral(referredUserId, "starter");
  }
}

export default router;
