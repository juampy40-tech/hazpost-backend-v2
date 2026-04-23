import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET or TOKEN_ENCRYPTION_KEY environment variable is required");
}

/**
 * Normaliza alias de planes (nombres en español u obsoletos) al key real de la tabla `plans`.
 * Se aplica al resolver trials para que un voucher creado con "negocio" funcione igual que "business".
 */
export function normalizePlanKey(key: string): string {
  const aliases: Record<string, string> = {
    negocio:     "business",
    emprendedor: "starter",
    agencia:     "agency",
    gratis:      "free",
    pro:         "business",
  };
  return aliases[key.toLowerCase()] ?? key;
}
const COOKIE_NAME = "hz_token";
const EXPIRES_IN = "30d";

export interface AuthPayload {
  userId: number;
  email: string;
  role: string;
  plan: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * Short-lived in-memory cache for user account status.
 * Avoids a DB round-trip on every authenticated request while still
 * revoking access within 5 minutes of an admin deactivating or trashing a user.
 */
const activeCache = new Map<number, { active: boolean; deleted: boolean; exp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

type UserStatus = { active: boolean; deleted: boolean };

async function getUserStatus(userId: number): Promise<UserStatus> {
  const now = Date.now();
  const cached = activeCache.get(userId);
  if (cached && cached.exp > now) return { active: cached.active, deleted: cached.deleted };

  const [user] = await db
    .select({ isActive: usersTable.isActive, deletedAt: usersTable.deletedAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const deleted = user?.deletedAt != null;
  const active = !deleted && user?.isActive === "true";
  activeCache.set(userId, { active, deleted, exp: now + CACHE_TTL_MS });
  return { active, deleted };
}

/** Call after admin changes isActive or deletedAt so the cache doesn't serve stale data. */
export function invalidateActiveCache(userId: number): void {
  activeCache.delete(userId);
}

/**
 * Cache for trial plan resolution. Stores the effective plan together with the JWT plan
 * that was in effect at cache time. If the JWT plan changes (e.g. admin update, billing
 * change, re-login), the cache is automatically invalidated on the next request.
 * This prevents stale plan authorization after plan mutations unrelated to trials.
 */
const trialCache = new Map<number, { effectivePlan: string; jwtPlanAtCacheTime: string; checkedAt: number }>();

/** Call after a voucher is redeemed or trial changes so the cache is refreshed. */
export function invalidateTrialCache(userId: number): void {
  trialCache.delete(userId);
}

/**
 * Resolves the effective plan for a user by checking plan_trials.
 * If a trial has expired, restores the original plan in DB and issues a new JWT.
 *
 * Cache strategy: valid for CACHE_TTL_MS but ONLY when the current JWT plan matches
 * what was in effect when we last cached. Any plan change from the JWT side (billing,
 * admin, re-login) triggers an immediate cache miss and a fresh DB check.
 */
async function resolveEffectivePlan(userId: number, jwtPlan: string, res: Response): Promise<string> {
  const now = Date.now();
  const cached = trialCache.get(userId);

  // Cache hit: still within TTL AND JWT plan hasn't changed since last check
  if (cached && (now - cached.checkedAt) < CACHE_TTL_MS && cached.jwtPlanAtCacheTime === jwtPlan) {
    return cached.effectivePlan;
  }

  try {
    const result = await db.execute(sql`
      SELECT original_plan, trial_plan, trial_end FROM plan_trials WHERE user_id = ${userId} LIMIT 1
    `);

    if (result.rows.length === 0) {
      // No active trial — effective plan equals JWT plan
      trialCache.set(userId, { effectivePlan: jwtPlan, jwtPlanAtCacheTime: jwtPlan, checkedAt: now });
      return jwtPlan;
    }

    const trial = result.rows[0] as { original_plan: string; trial_plan: string; trial_end: string };
    const trialEnd = new Date(trial.trial_end);

    if (trialEnd < new Date(now)) {
      // Trial expired — remove the overlay row ONLY; users.plan is never mutated by trials
      await db.execute(sql`DELETE FROM plan_trials WHERE user_id = ${userId}`);

      // Read the real base plan from users table (unchanged since trials never touch it)
      const userResult = await db.execute(sql`SELECT email, role, plan FROM users WHERE id = ${userId} LIMIT 1`);
      const basePlan = userResult.rows.length > 0
        ? (userResult.rows[0] as { plan: string }).plan
        : jwtPlan; // fallback to JWT plan if DB read fails

      trialCache.set(userId, { effectivePlan: basePlan, jwtPlanAtCacheTime: basePlan, checkedAt: now });

      // Issue a new JWT so the client immediately reflects the base plan
      if (userResult.rows.length > 0) {
        const u = userResult.rows[0] as { email: string; role: string; plan: string };
        const newToken = signToken({ userId, email: u.email, role: u.role, plan: u.plan });
        setAuthCookie(res, newToken);
      }
      return basePlan;
    }

    // Active trial — effective plan is the trial plan regardless of JWT plan.
    // Normalize alias keys (e.g. "negocio" → "business") so capability lookups always find a matching plan row.
    const effectiveTrialPlan = normalizePlanKey(trial.trial_plan);
    trialCache.set(userId, { effectivePlan: effectiveTrialPlan, jwtPlanAtCacheTime: jwtPlan, checkedAt: now });
    return effectiveTrialPlan;
  } catch {
    // On DB error, fall back to JWT plan so requests aren't blocked
    return jwtPlan;
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.clearCookie("eco_token", { path: "/" });
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[COOKIE_NAME] ?? req.cookies?.["eco_token"];
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

/** Middleware: requires a valid JWT AND an active account. Also resolves plan trials. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Sesión expirada o inválida" });
    return;
  }
  req.user = payload;

  Promise.all([
    getUserStatus(payload.userId),
    resolveEffectivePlan(payload.userId, payload.plan, res),
  ]).then(([status, effectivePlan]) => {
    // Trashed users are blocked first (highest priority gate)
    if (status.deleted) {
      invalidateActiveCache(payload.userId);
      res.status(401).json({ error: "Cuenta eliminada. Contacta soporte." });
      return;
    }
    if (!status.active) {
      res.status(403).json({ error: "Cuenta desactivada. Contacta al administrador." });
      return;
    }
    // Override plan with effective plan (may differ from JWT if trial is active/expired)
    req.user = { ...payload, plan: effectivePlan };
    next();
  }).catch(() => {
    next();
  });
}

/** Middleware: parses JWT if present but does not block unauthenticated requests */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) req.user = payload;
  }
  next();
}

/** Middleware: requires admin role */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Acceso denegado — se requiere rol admin" });
      return;
    }
    next();
  });
}

// ─── Email verification cache ─────────────────────────────────────────────────
const emailVerifiedCache = new Map<number, { verified: boolean; exp: number }>();

async function isEmailVerified(userId: number): Promise<boolean> {
  const now = Date.now();
  const cached = emailVerifiedCache.get(userId);
  if (cached && cached.exp > now) return cached.verified;

  const [user] = await db
    .select({ emailVerified: usersTable.emailVerified })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const verified = user?.emailVerified === true;
  emailVerifiedCache.set(userId, { verified, exp: now + CACHE_TTL_MS });
  return verified;
}

/** Call after a user verifies their email so the cache is refreshed immediately. */
export function invalidateEmailVerifiedCache(userId: number): void {
  emailVerifiedCache.delete(userId);
}

/**
 * Middleware: requires the authenticated user to have a verified email.
 * Returns 403 with code EMAIL_NOT_VERIFIED if not verified.
 * Admin users are always allowed through.
 * Must be placed AFTER requireAuth in the middleware chain.
 */
export function requireEmailVerified(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  // Admins bypass email verification requirement
  if (req.user.role === "admin") {
    next();
    return;
  }

  isEmailVerified(req.user.userId)
    .then(verified => {
      if (!verified) {
        res.status(403).json({
          error: "EMAIL_NOT_VERIFIED",
          message: "Debes verificar tu correo electrónico para usar esta función.",
        });
        return;
      }
      next();
    })
    .catch(() => {
      // Fail closed: on DB error return 503 rather than allowing unverified users through
      res.status(503).json({ error: "No se pudo verificar el estado del correo. Intenta de nuevo." });
    });
}
