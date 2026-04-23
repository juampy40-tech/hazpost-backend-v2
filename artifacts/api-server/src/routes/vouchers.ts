import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { signToken, setAuthCookie, invalidateTrialCache, normalizePlanKey } from "../lib/auth.js";

// ── Public router (no auth required) ────────────────────────────────────────
export const publicVouchersRouter = Router();

/** GET /api/vouchers/validate/:code — verificar si un código es válido (público) */
publicVouchersRouter.get("/validate/:code", async (req, res) => {
  const code = (req.params.code ?? "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "Código requerido" });

  try {
    const result = await db.execute(sql`
      SELECT id, code, trial_plan, trial_days, bonus_credits, max_uses, current_uses, is_active, expires_at, description
      FROM voucher_codes
      WHERE code = ${code}
      LIMIT 1
    `);

    if (result.rows.length === 0) return res.status(404).json({ valid: false, error: "Código no encontrado" });

    const v = result.rows[0] as {
      id: number;
      code: string;
      trial_plan: string | null;
      trial_days: number;
      bonus_credits: number;
      max_uses: number | null;
      current_uses: number;
      is_active: boolean;
      expires_at: string | null;
      description: string | null;
    };

    if (!v.is_active) return res.json({ valid: false, error: "Este código ya no está activo" });
    if (v.expires_at && new Date(v.expires_at) < new Date()) {
      return res.json({ valid: false, error: "Este código ha expirado" });
    }
    if (v.max_uses !== null && v.current_uses >= v.max_uses) {
      return res.json({ valid: false, error: "Este código ha alcanzado su límite de usos" });
    }

    return res.json({
      valid: true,
      code: v.code,
      trial_plan: v.trial_plan,
      trial_days: v.trial_days,
      bonus_credits: v.bonus_credits,
      description: v.description,
    });
  } catch (err) {
    logger.error({ err }, "GET /vouchers/validate error");
    return res.status(500).json({ error: "Error interno" });
  }
});

// ── Protected router (requireAuth applied at route registration) ──────────────
const router = Router();

/**
 * POST /api/vouchers/redeem — canjear un voucher (requiere auth)
 *
 * DESIGN NOTE: Trial model uses plan_trials as a pure overlay.
 * users.plan is NEVER mutated during redeem or expiry — it always reflects
 * the user's real paid/base subscription. The effective plan is computed at
 * request time by auth.ts resolveEffectivePlan(), which reads plan_trials.
 */
router.post("/redeem", async (req, res) => {
  const userId = req.user!.userId;
  const code = ((req.body as { code?: string }).code ?? "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "Código requerido" });

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Lock voucher row for atomic check + increment
      const vResult = await tx.execute(sql`
        SELECT id, code, trial_plan, trial_days, bonus_credits, max_uses, current_uses, is_active, expires_at
        FROM voucher_codes
        WHERE code = ${code}
        FOR UPDATE
        LIMIT 1
      `);

      if (vResult.rows.length === 0) throw Object.assign(new Error("Código no encontrado"), { status: 404 });

      const v = vResult.rows[0] as {
        id: number;
        trial_plan: string | null;
        trial_days: number;
        bonus_credits: number;
        max_uses: number | null;
        current_uses: number;
        is_active: boolean;
        expires_at: string | null;
      };

      if (!v.is_active) throw Object.assign(new Error("Este código ya no está activo"), { status: 400 });
      if (v.expires_at && new Date(v.expires_at) < new Date()) {
        throw Object.assign(new Error("Este código ha expirado"), { status: 400 });
      }
      if (v.max_uses !== null && v.current_uses >= v.max_uses) {
        throw Object.assign(new Error("Este código ha alcanzado su límite de usos"), { status: 400 });
      }

      // 2. Check if user already redeemed this voucher
      const alreadyUsed = await tx.execute(sql`
        SELECT id FROM voucher_redemptions WHERE voucher_id = ${v.id} AND user_id = ${userId} LIMIT 1
      `);
      if (alreadyUsed.rows.length > 0) {
        throw Object.assign(new Error("Ya canjeaste este código anteriormente"), { status: 409 });
      }

      // 3. Fetch user data (email/role for JWT) — do NOT read users.plan as base for trial
      //    original_plan is preserved from any existing trial record to prevent elevation
      const userResult = await tx.execute(sql`
        SELECT u.id, u.email, u.role, u.plan,
               COALESCE(pt.original_plan, u.plan) AS true_base_plan
        FROM users u
        LEFT JOIN plan_trials pt ON pt.user_id = u.id
        WHERE u.id = ${userId}
        LIMIT 1
      `);
      if (userResult.rows.length === 0) throw Object.assign(new Error("Usuario no encontrado"), { status: 404 });

      const user = userResult.rows[0] as { id: number; email: string; role: string; plan: string; true_base_plan: string };

      // 4. Normalize the trial plan key (resolves aliases like "negocio" → "business").
      //    Normalization happens here so the correct key is saved in plan_trials AND
      //    used for the credits reset below — no alias ever reaches the DB.
      const trialPlan = v.trial_plan ? normalizePlanKey(v.trial_plan) : null;

      // 4a. Apply subscription credits.
      //    DESIGN: when a trial plan is granted, we RESET the subscription to the plan's
      //    full monthly allowance (+ any bonus_credits on top). This guarantees the user
      //    immediately experiences the trial plan's credit ceiling regardless of their
      //    previous balance. Without a trial plan, bonus_credits are simply added.
      if (trialPlan) {
        const planRow = await tx.execute(sql`
          SELECT credits_per_month FROM plans WHERE key = ${trialPlan} LIMIT 1
        `);
        if (planRow.rows.length === 0) {
          throw Object.assign(
            new Error(`El plan "${trialPlan}" del voucher no existe. Contacta al administrador.`),
            { status: 400 }
          );
        }
        const planMonthly = (planRow.rows[0] as { credits_per_month: number }).credits_per_month;
        const newCredits = planMonthly + v.bonus_credits;
        await tx.execute(sql`
          UPDATE subscriptions
          SET credits_remaining = ${newCredits},
              credits_total     = ${newCredits}
          WHERE user_id = ${userId}
        `);
      } else if (v.bonus_credits > 0) {
        await tx.execute(sql`
          UPDATE subscriptions
          SET credits_remaining = credits_remaining + ${v.bonus_credits},
              credits_total     = credits_total + ${v.bonus_credits}
          WHERE user_id = ${userId}
        `);
      }

      // 5. Apply plan trial — insert into plan_trials ONLY (never mutate users.plan)
      let trialEnd: Date | null = null;
      if (trialPlan) {
        trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + v.trial_days);

        await tx.execute(sql`
          INSERT INTO plan_trials (user_id, original_plan, trial_plan, trial_end)
          VALUES (${userId}, ${user.true_base_plan}, ${trialPlan}, ${trialEnd.toISOString()})
          ON CONFLICT (user_id) DO UPDATE SET
            trial_plan  = EXCLUDED.trial_plan,
            trial_end   = GREATEST(plan_trials.trial_end, EXCLUDED.trial_end),
            trial_start = NOW()
        `);
        // NOTE: original_plan is intentionally NOT updated on conflict — preserves true base
      }

      // 6. Record redemption + increment uses atomically in same TX
      await tx.execute(sql`
        INSERT INTO voucher_redemptions (voucher_id, user_id) VALUES (${v.id}, ${userId})
      `);
      await tx.execute(sql`
        UPDATE voucher_codes SET current_uses = current_uses + 1 WHERE id = ${v.id}
      `);

      return { v, user, trialPlan, trialEnd };
    });

    const { v, user, trialPlan, trialEnd } = result;

    // Invalidate trial cache so requireAuth picks up new state immediately
    invalidateTrialCache(userId);

    logger.info({ userId, code, trial_plan: trialPlan, bonus_credits: v.bonus_credits }, "Voucher redeemed");

    // Issue new JWT with trial_plan so client reflects it immediately.
    // users.plan is unchanged — JWT plan is intentionally set to trial_plan for display only;
    // actual capability resolution remains driven by plan_trials overlay in requireAuth.
    const effectivePlan = trialPlan ?? user.plan;
    const token = signToken({ userId, email: user.email, role: user.role, plan: effectivePlan });
    setAuthCookie(res, token);

    return res.json({
      ok: true,
      bonus_credits: v.bonus_credits,
      trial_plan: trialPlan,
      trial_days: trialPlan ? v.trial_days : 0,
      trial_end: trialEnd?.toISOString() ?? null,
      new_plan: effectivePlan,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Error interno";
    if (status !== 500) return res.status(status).json({ error: message });
    logger.error({ err }, "POST /vouchers/redeem error");
    return res.status(500).json({ error: "Error interno" });
  }
});

/** GET /api/vouchers/my-trial — obtener info del trial activo del usuario */
router.get("/my-trial", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const result = await db.execute(sql`
      SELECT pt.trial_plan, pt.original_plan, pt.trial_start, pt.trial_end, u.plan AS base_plan, u.email, u.role
      FROM plan_trials pt
      JOIN users u ON u.id = pt.user_id
      WHERE pt.user_id = ${userId}
      LIMIT 1
    `);

    if (result.rows.length === 0) return res.json({ active: false });

    const row = result.rows[0] as {
      trial_plan: string;
      original_plan: string;
      trial_start: string;
      trial_end: string;
      base_plan: string;
      email: string;
      role: string;
    };

    const now = new Date();
    const end = new Date(row.trial_end);

    if (end < now) {
      // Trial expired — only remove the overlay row; users.plan is untouched
      await db.execute(sql`DELETE FROM plan_trials WHERE user_id = ${userId}`);
      invalidateTrialCache(userId);

      // Issue new JWT using users.plan (the real base plan, never mutated by trials)
      const token = signToken({ userId, email: row.email, role: row.role, plan: row.base_plan });
      setAuthCookie(res, token);

      return res.json({ active: false, expired: true, base_plan: row.base_plan });
    }

    return res.json({
      active: true,
      trial_plan: normalizePlanKey(row.trial_plan),
      original_plan: row.original_plan,
      trial_start: row.trial_start,
      trial_end: row.trial_end,
      days_remaining: Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    });
  } catch (err) {
    logger.error({ err }, "GET /vouchers/my-trial error");
    return res.status(500).json({ error: "Error interno" });
  }
});

export default router;
