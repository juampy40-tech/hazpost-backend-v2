import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { usersTable, subscriptionsTable, nichesTable, postsTable, socialAccountsTable, mediaLibraryTable, landingPagesTable, imageVariantsTable, passwordResetTokensTable, brandProfilesTable, businessesTable, publishLogTable, contentHistoryTable, publishingSchedulesTable, plansTable } from "@workspace/db";
import { eq, isNull, isNotNull, and, gt, lt, sql } from "drizzle-orm";
import {
  signToken, hashPassword, comparePassword,
  setAuthCookie, clearAuthCookie, requireAuth, requireAdmin,
  invalidateActiveCache, invalidateEmailVerifiedCache, invalidateTrialCache,
} from "../lib/auth.js";
import { resolveUserTimezone } from "../lib/timezone.js";
import { signPreAuthToken, isDeviceTrusted } from "./auth-totp.js";
import { verifySync } from "otplib";
import { auditLog, AuditAction } from "../lib/audit.js";
import { buildPlanSnapshot } from "../lib/planCaps.js";

const router = Router();

/** Check if the first admin needs to be created */
async function getOrCreateBootstrapStatus() {
  const users = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  return { hasUsers: users.length > 0 };
}

/**
 * POST /api/user/register
 * First user is always admin. Subsequent users are role=user.
 */
function isStrongPassword(p: string): boolean {
  return p.length >= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[^a-zA-Z0-9]/.test(p);
}

router.post("/register", async (req, res) => {
  const { email, password, displayName, referralCode, affiliateCode, selectedPlan, logoUrl, primaryColor } = req.body as {
    email?: string; password?: string; displayName?: string; referralCode?: string; affiliateCode?: string; selectedPlan?: string; logoUrl?: string; primaryColor?: string;
  };
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial" });
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) {
    const biz = await db.select({ onboardingCompleted: businessesTable.onboardingCompleted })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, existing[0].id), eq(businessesTable.isDefault, true)))
      .limit(1);
    const completed = biz.length > 0 && biz[0].onboardingCompleted === true;
    if (!completed) {
      return res.status(409).json({
        error: "Ya iniciaste un registro con este correo pero no lo completaste.",
        code: "incomplete_registration",
      });
    }
    return res.status(409).json({ error: "Ya existe una cuenta con ese email" });
  }

  const { hasUsers } = await getOrCreateBootstrapStatus();
  const role = hasUsers ? "user" : "admin";
  // First user (admin) gets agency plan; others get free by default.
  // New users always start on free plan; selectedPlan is returned as pendingPlan to the client,
  // which redirects them to Wompi checkout immediately after registration to activate the chosen plan.
  // Credits and entitlements for paid plans are applied by the Wompi webhook upon payment confirmation.
  const plan = hasUsers ? "free" : "agency";

  const passwordHash = await hashPassword(password);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    passwordHash,
    role,
    plan,
    displayName: displayName || email.split("@")[0],
    emailVerified: false,
    emailVerificationToken: verificationToken,
    emailVerificationExpiry: verificationExpiry,
  }).returning();

  // Create default subscription for the new user — read full plan config from DB
  const [planRow] = await db.select().from(plansTable).where(eq(plansTable.key, plan)).limit(1);
  const credits = planRow?.creditsPerMonth ?? 40;
  const lockedPlanConfig = planRow ? buildPlanSnapshot(planRow) : null;
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);
  await db.insert(subscriptionsTable).values({
    userId: user.id,
    plan,
    status: "active",
    creditsRemaining: credits,
    creditsTotal: credits,
    lockedPlanConfig,
    periodEnd,
  });

  // Create default business for the new user so logo/firma/font save correctly from day 1
  const cleanLogoUrl = logoUrl?.trim() || null;
  const cleanColor = primaryColor?.trim() || null;
  const [newBiz] = await db.insert(businessesTable).values({
    userId: user.id,
    name: displayName?.trim() || email.split("@")[0],
    isDefault: true,
    sortOrder: 0,
    ...(cleanLogoUrl ? { logoUrl: cleanLogoUrl } : {}),
    ...(cleanColor ? { primaryColor: cleanColor } : {}),
  }).returning().catch(() => [undefined]);

  // Seed starter niches for the new business so the bulk generator works from day 1
  if (newBiz) {
    await db.insert(nichesTable).values([
      { name: "Tips y consejos",          description: "Contenido educativo con tips prácticos para la audiencia objetivo del negocio.", keywords: "tips, consejos, educativo, aprendizaje", active: true, userId: user.id, businessId: newBiz.id },
      { name: "Testimonios y resultados", description: "Casos de éxito, reseñas de clientes y resultados reales obtenidos.",           keywords: "testimonios, resultados, éxito, clientes", active: true, userId: user.id, businessId: newBiz.id },
      { name: "Productos y servicios",    description: "Presentación de los productos, servicios y propuesta de valor del negocio.",    keywords: "productos, servicios, oferta, valor",   active: true, userId: user.id, businessId: newBiz.id },
    ]).catch(() => {});
  }

  // Save initial brand data (logo + primary color) to brand_profiles if provided at registration
  if (cleanLogoUrl || cleanColor) {
    await db.insert(brandProfilesTable).values({
      userId: user.id,
      companyName: displayName?.trim() || email.split("@")[0],
      logoUrl: cleanLogoUrl,
      primaryColor: cleanColor,
      onboardingStep: 0,
      onboardingCompleted: false,
    }).onConflictDoUpdate({
      target: brandProfilesTable.userId,
      set: {
        ...(cleanLogoUrl ? { logoUrl: cleanLogoUrl } : {}),
        ...(cleanColor ? { primaryColor: cleanColor } : {}),
        updatedAt: new Date(),
      },
    }).catch(() => {});
  }

  // Handle referral code (fire & forget — never blocks registration)
  if (referralCode) {
    (async () => {
      try {
        // Check referral system is enabled before proceeding
        const settingsRow = await db.execute(sql`SELECT is_enabled FROM referral_settings WHERE id = 1 LIMIT 1`);
        const refSystemEnabled = settingsRow.rows.length === 0 || Boolean((settingsRow.rows[0] as { is_enabled: boolean }).is_enabled);
        if (!refSystemEnabled) return;

        // Check new user is eligible to be referred (can_be_referred flag)
        const newUserRow = await db.execute(sql`SELECT can_be_referred FROM users WHERE id = ${user.id} LIMIT 1`);
        const canBeReferred = newUserRow.rows.length === 0 || (newUserRow.rows[0] as { can_be_referred: boolean }).can_be_referred !== false;
        if (!canBeReferred) return;

        // Find the referrer by their referral code
        const refResult = await db.execute(sql`
          SELECT id, can_refer FROM users WHERE my_referral_code = ${referralCode.toUpperCase()} LIMIT 1
        `);
        if (refResult.rows.length > 0) {
          const { id: referrerId, can_refer } = refResult.rows[0] as { id: number; can_refer: boolean };
          if (referrerId !== user.id && can_refer !== false) {
            // Save the code used by the new user
            await db.execute(sql`UPDATE users SET used_referral_code = ${referralCode.toUpperCase()} WHERE id = ${user.id}`);
            // Create a pending conversion record (credits awarded on paid subscription via billing webhook)
            await db.execute(sql`
              INSERT INTO referral_conversions (referrer_id, referred_user_id, used_code, status)
              VALUES (${referrerId}, ${user.id}, ${referralCode.toUpperCase()}, 'pending')
              ON CONFLICT (referred_user_id) DO NOTHING
            `);
          }
        }
      } catch { /* ignore referral errors — registration already succeeded */ }
    })();
  }

  // Handle affiliate code (fire & forget — never blocks registration)
  if (affiliateCode) {
    (async () => {
      try {
        const cleanCode = affiliateCode.trim().toUpperCase();
        // Validate: code must be active AND not expired (created_at + duration_months)
        const codeResult = await db.execute(sql`
          SELECT id
          FROM affiliate_codes
          WHERE code = ${cleanCode}
            AND is_active = true
            AND NOW() <= created_at + (duration_months * INTERVAL '1 month')
          LIMIT 1
        `);
        if (codeResult.rows.length > 0) {
          const codeId = (codeResult.rows[0] as { id: number }).id;
          // Look up plan price for commission attribution
          const planPrice = await db.execute(sql`
            SELECT price_usd FROM plans WHERE key = ${plan} AND is_active = true LIMIT 1
          `);
          const amountUsd = planPrice.rows.length > 0
            ? Number((planPrice.rows[0] as { price_usd: number }).price_usd)
            : null;
          // ON CONFLICT ensures each user can only have one affiliate code association
          await db.execute(sql`
            INSERT INTO affiliate_conversions (code_id, user_id, plan, amount_usd, registered_at)
            VALUES (${codeId}, ${user.id}, ${plan}, ${amountUsd}, NOW())
            ON CONFLICT (user_id) DO NOTHING
          `);
        }
      } catch { /* ignore affiliate code errors — registration already succeeded */ }
    })();
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role, plan: user.plan });
  setAuthCookie(res, token);

  // Send verification email (fire & forget — response is returned before email completes)
  sendVerificationEmail(user.email, user.displayName, verificationToken).then(result => {
    if (!result.ok) {
      req.log.error({ event: "verification_email_failed", to: user.email, status: result.status, body: result.body, error: result.error }, "[email] Resend failed at registration");
    } else {
      req.log.info({ event: "verification_email_sent", to: user.email }, "[email] Verification email sent at registration");
    }
  }).catch(() => {});

  return res.status(201).json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, plan: user.plan, emailVerified: false },
    token,
    // If the user selected a paid plan during registration, signal the frontend to start checkout.
    pendingPlan: selectedPlan && selectedPlan !== "free" && selectedPlan !== plan ? selectedPlan : undefined,
  });
});

/**
 * POST /api/user/login
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos" });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    return res.status(401).json({ error: "Email o contraseña incorrectos" });
  }
  if (user.deletedAt) {
    invalidateActiveCache(user.id);
    return res.status(401).json({ error: "Cuenta eliminada. Contacta soporte." });
  }
  if (user.isActive !== "true") {
    return res.status(403).json({ error: "Cuenta desactivada. Contacta al administrador." });
  }

  if (!user.passwordHash) {
    return res.status(401).json({ error: "Esta cuenta usa Google. Entra con el botón 'Continuar con Google'." });
  }
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Email o contraseña incorrectos" });
  }

  // ── TOTP 2FA check ────────────────────────────────────────────────────────
  if (user.totpEnabled) {
    // Check if this browser/device is already trusted (cookie set after previous TOTP success)
    const trusted = await isDeviceTrusted(req, user.id);
    if (!trusted) {
      // Unknown device — require TOTP code
      const preAuthToken = signPreAuthToken(user.id, user.email);
      return res.json({ totpRequired: true, preAuthToken });
    }
    // Trusted device — proceed without TOTP challenge
  }
  // ─────────────────────────────────────────────────────────────────────────

  const token = signToken({ userId: user.id, email: user.email, role: user.role, plan: user.plan });
  setAuthCookie(res, token);

  auditLog({ userId: user.id, action: AuditAction.LOGIN_SUCCESS, metadata: { method: "password" }, req });

  return res.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, plan: user.plan },
    token,
  });
});

/**
 * POST /api/user/logout
 */
router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true });
});

/**
 * GET /api/user/me — current user info + subscription
 */
router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    displayName: usersTable.displayName,
    role: usersTable.role,
    plan: usersTable.plan,
    aiCredits: usersTable.aiCredits,
    onboardingStep: usersTable.onboardingStep,
    createdAt: usersTable.createdAt,
    emailVerified: usersTable.emailVerified,
    avatarUrl: usersTable.avatarUrl,
    timezone: usersTable.timezone,
    brandCountry: usersTable.brandCountry,
  }).from(usersTable).where(eq(usersTable.id, req.user!.userId));

  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const [subscription] = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id))
    .orderBy(subscriptionsTable.createdAt)
    .limit(1);

  const resolvedTimezone = resolveUserTimezone({ timezone: user.timezone, brandCountry: user.brandCountry });

  return res.json({
    user: { ...user, timezone: resolvedTimezone },
    subscription: subscription ?? null,
  });
});

/** GET /api/user/bootstrap — tells frontend if any users exist yet */
router.get("/bootstrap", async (_req, res) => {
  const { hasUsers } = await getOrCreateBootstrapStatus();
  return res.json({ hasUsers });
});

const VALID_IANA_TIMEZONES = new Set([
  "America/Bogota","America/Mexico_City","America/Argentina/Buenos_Aires","America/Lima",
  "America/Santiago","America/Caracas","America/Guayaquil","America/La_Paz","America/Asuncion",
  "America/Montevideo","America/Costa_Rica","America/Panama","America/Santo_Domingo",
  "America/Guatemala","America/Tegucigalpa","America/El_Salvador","America/Managua",
  "America/Havana","America/Puerto_Rico","America/Sao_Paulo","America/Manaus",
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Phoenix","America/Anchorage","Pacific/Honolulu",
  "America/Toronto","America/Vancouver","America/Halifax",
  "Europe/Madrid","Europe/Paris","Europe/London","Europe/Berlin","Europe/Rome",
  "Europe/Amsterdam","Europe/Brussels","Europe/Lisbon","Europe/Zurich","Europe/Vienna",
  "Europe/Warsaw","Europe/Prague","Europe/Stockholm","Europe/Oslo","Europe/Helsinki",
  "Europe/Athens","Europe/Bucharest","Europe/Moscow","Europe/Istanbul",
  "Africa/Cairo","Africa/Lagos","Africa/Nairobi","Africa/Casablanca","Africa/Johannesburg",
  "Asia/Dubai","Asia/Riyadh","Asia/Jerusalem","Asia/Kolkata","Asia/Karachi",
  "Asia/Dhaka","Asia/Bangkok","Asia/Singapore","Asia/Shanghai","Asia/Tokyo",
  "Asia/Seoul","Asia/Hong_Kong","Asia/Jakarta","Asia/Manila","Asia/Taipei",
  "Australia/Sydney","Australia/Melbourne","Australia/Brisbane","Australia/Perth",
  "Pacific/Auckland","Pacific/Fiji","UTC",
]);

const patchMeSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(1).optional(),
  avatarUrl: z.string().max(1000).optional(),
  timezone: z.string().max(60).optional().nullable(),
});

/**
 * PATCH /api/users/me (also /api/user/me) — update current user's personal data
 * Accepts: { displayName?, email?, currentPassword?, newPassword? }
 */
router.patch("/me", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  const parsed = patchMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const { displayName, email, currentPassword, newPassword, avatarUrl, timezone } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const updates: Partial<typeof usersTable.$inferInsert> = {};

  if (displayName !== undefined) {
    if (!displayName.trim()) return res.status(400).json({ error: "El nombre no puede estar vacío" });
    updates.displayName = displayName.trim();
  }

  if (email !== undefined) {
    const normalized = email.toLowerCase().trim();
    if (!normalized || !normalized.includes("@")) return res.status(400).json({ error: "Email inválido" });
    if (normalized !== user.email) {
      const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalized));
      if (existing) return res.status(409).json({ error: "Ese email ya está en uso" });
      updates.email = normalized;
    }
  }

  if (newPassword !== undefined) {
    if (!currentPassword) return res.status(400).json({ error: "Ingresa tu contraseña actual para cambiarla" });
    if (!user.passwordHash) return res.status(400).json({ error: "No puedes cambiar la contraseña en cuentas Google" });
    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Contraseña actual incorrecta" });
    if (!isStrongPassword(newPassword)) return res.status(400).json({ error: "La nueva contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial" });
    updates.passwordHash = await hashPassword(newPassword);
  }

  if (avatarUrl !== undefined) {
    updates.avatarUrl = avatarUrl;
  }

  if (timezone !== undefined) {
    if (timezone !== null && timezone !== "" && !VALID_IANA_TIMEZONES.has(timezone)) {
      return res.status(400).json({ error: `Zona horaria no válida: ${timezone}` });
    }
    updates.timezone = timezone === "" ? null : (timezone ?? null);
  }

  if (Object.keys(updates).length === 0) {
    return res.json({ user: { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl, timezone: user.timezone } });
  }

  updates.updatedAt = new Date();
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning({
    id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl, timezone: usersTable.timezone,
  });

  if (updates.email) invalidateActiveCache(userId);
  return res.json({ user: updated });
});

// ─── Email verification ────────────────────────────────────────────────────────

/**
 * GET /api/user/verify-email?token=xxx — verifies email using token from email link
 */
router.get("/verify-email", async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).json({ error: "Token requerido" });

  const [user] = await db.select({
    id: usersTable.id, email: usersTable.email, emailVerificationToken: usersTable.emailVerificationToken,
    emailVerificationExpiry: usersTable.emailVerificationExpiry, emailVerified: usersTable.emailVerified,
  }).from(usersTable).where(eq(usersTable.emailVerificationToken, token)).limit(1);

  if (!user) return res.status(400).json({ error: "Token inválido o ya usado" });
  if (user.emailVerified) return res.json({ success: true, alreadyVerified: true });
  if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
    return res.status(400).json({ error: "El enlace expiró. Solicita uno nuevo." });
  }

  await db.update(usersTable).set({
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));

  // Invalidate cache so requireEmailVerified middleware picks up the new state immediately
  invalidateEmailVerifiedCache(user.id);

  return res.json({ success: true });
});

// In-memory rate limiter: 1 resend per 5 minutes per user
const resendRateLimits = new Map<number, number>();
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

function buildVerificationHtml(name: string, verifyUrl: string): string {
  return `
    <div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#fff;border-radius:16px;">
      <h1 style="margin:0 0 4px;font-size:28px;"><span style="color:#fff;">haz</span><span style="color:#00C2FF;">post</span></h1>
      <p style="color:#888;font-size:13px;margin:0 0 24px;">hazpost.app — Haz más, publica mejor.</p>
      <h2 style="font-size:20px;color:#fff;margin:0 0 12px;">¡Hola, ${name}! 👋</h2>
      <p style="color:#ccc;line-height:1.6;">Para activar tu cuenta y acceder a todas las funciones, confirma que este correo te pertenece.</p>
      <div style="margin:28px 0;text-align:center;">
        <a href="${verifyUrl}" style="display:inline-block;padding:16px 36px;background:linear-gradient(135deg,#0077FF,#00C2FF);color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">✅ Confirmar mi correo</a>
      </div>
      <div style="padding:16px;background:#111;border-radius:10px;border:1px solid #222;">
        <p style="margin:0;font-size:12px;color:#666;">Este enlace expira en <strong style="color:#aaa;">24 horas</strong>. Si no creaste esta cuenta, ignora este correo.</p>
      </div>
      <p style="color:#555;font-size:12px;margin-top:24px;">hazpost.app · Si el botón no funciona, copia este enlace: ${verifyUrl}</p>
    </div>
  `;
}

async function sendVerificationEmail(
  email: string,
  displayName: string | null,
  verificationToken: string,
): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  const name = displayName || email.split("@")[0];
  const appUrl = process.env.APP_URL || "https://hazpost.app";
  const verifyUrl = `${appUrl}/verify-email?token=${verificationToken}`;
  const html = buildVerificationHtml(name, verifyUrl);

  // ── Primary: Hostinger SMTP (noreply@hazpost.app) ─────────────────────────
  const smtpPass = process.env.SMTP_PASSWORD;
  if (smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.hostinger.com",
        port: 587,
        secure: false,
        auth: { user: "noreply@hazpost.app", pass: smtpPass },
      });
      await transporter.sendMail({
        from: '"hazpost" <noreply@hazpost.app>',
        to: email,
        subject: "Confirma tu correo en hazpost ✉️",
        html,
      });
      return { ok: true, status: 250 };
    } catch (err) {
      return { ok: false, error: `SMTP: ${String(err)}` };
    }
  }

  // ── Fallback: Resend API ──────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "No SMTP_PASSWORD and no RESEND_API_KEY set" };
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: "hazpost <noreply@hazpost.app>", to: [email], subject: "Confirma tu correo en hazpost ✉️", html }),
    });
    const body = await resp.text().catch(() => "");
    return { ok: resp.ok, status: resp.status, body };
  } catch (err) {
    return { ok: false, error: `Resend: ${String(err)}` };
  }
}

/**
 * POST /api/user/resend-verification — resend verification email (auth required)
 * Rate-limited: 1 request per 5 minutes per user.
 */
router.post("/resend-verification", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  // Rate limit check
  const lastSent = resendRateLimits.get(userId) ?? 0;
  const now = Date.now();
  if (now - lastSent < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
    return res.status(429).json({
      error: `Espera ${waitSec} segundos antes de solicitar otro correo de verificación.`,
      retryAfterSeconds: waitSec,
    });
  }

  const [user] = await db.select({
    id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName,
    emailVerified: usersTable.emailVerified,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (user.emailVerified) return res.json({ success: true, alreadyVerified: true });

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(usersTable).set({
    emailVerificationToken: verificationToken,
    emailVerificationExpiry: verificationExpiry,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));

  // Record rate limit timestamp before sending (prevents re-use even if send fails)
  resendRateLimits.set(userId, Date.now());

  // Send email and log the result for production diagnostics
  const emailResult = await sendVerificationEmail(user.email, user.displayName, verificationToken);
  if (!emailResult.ok) {
    req.log.error({
      event: "verification_email_failed",
      to: user.email,
      status: emailResult.status,
      body: emailResult.body,
      error: emailResult.error,
    }, "[email] Resend failed to send verification email");
  } else {
    req.log.info({ event: "verification_email_sent", to: user.email, status: emailResult.status }, "[email] Verification email sent OK");
  }

  return res.json({ success: true, emailSent: emailResult.ok });
});

// ─── Password reset ────────────────────────────────────────────────────────────

async function sendResetEmail(email: string, resetLink: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "hazpost <noreply@hazpost.app>",
        to: [email],
        subject: "Recupera tu contraseña — hazpost",
        html: `
          <div style="font-family:Poppins,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#0077FF">hazpost</h2>
            <p>Recibiste este correo porque solicitaste restablecer tu contraseña.</p>
            <p>Haz clic en el botón para crear una nueva contraseña. Este enlace vence en <strong>1 hora</strong>.</p>
            <a href="${resetLink}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#0077FF;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Restablecer contraseña</a>
            <p style="color:#666;font-size:13px;">Si no solicitaste esto, ignora este correo. Tu contraseña no cambiará.</p>
            <p style="color:#aaa;font-size:12px;">hazpost.app — Social media con IA</p>
          </div>
        `,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * POST /api/user/forgot-password
 * Generates a 1-hour reset token and (if RESEND_API_KEY is set) sends an email.
 * Always returns a generic success message to prevent email enumeration.
 * The reset link is NEVER included in the API response.
 */
router.post("/forgot-password", async (req, res) => {
  const GENERIC_OK = { message: "Si ese email existe en el sistema, recibirás instrucciones en tu correo." };

  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: "Email requerido" });

  const [user] = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

  // Always return the same generic response to avoid email enumeration
  if (!user) return res.json(GENERIC_OK);

  // Invalidate any previous tokens for this user
  await db.update(passwordResetTokensTable)
    .set({ used: true })
    .where(and(eq(passwordResetTokensTable.userId, user.id), eq(passwordResetTokensTable.used, false)));

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({ userId: user.id, token, expiresAt });

  const origin = req.headers.origin || `https://${req.headers.host}`;
  const base = process.env.FRONTEND_URL || origin;
  const resetLink = `${base}/reset-password?token=${token}`;

  const emailSent = await sendResetEmail(user.email, resetLink);

  // In development without email configured, log the link server-side only
  if (!emailSent && process.env.NODE_ENV !== "production") {
    console.log(`[DEV] Password reset link for ${user.email}: ${resetLink}`);
  }

  // Never expose the token or reset link in the response
  return res.json(GENERIC_OK);
});

/**
 * POST /api/user/reset-password
 * Validates the token and sets a new password.
 */
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) return res.status(400).json({ error: "Token y contraseña son requeridos" });
  if (password.length < 8) return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });

  const [record] = await db.select().from(passwordResetTokensTable)
    .where(and(
      eq(passwordResetTokensTable.token, token),
      eq(passwordResetTokensTable.used, false),
      gt(passwordResetTokensTable.expiresAt, new Date()),
    ));

  if (!record) return res.status(400).json({ error: "El enlace es inválido o ya expiró. Solicita uno nuevo." });

  const passwordHash = await hashPassword(password);
  await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, record.userId));
  await db.update(passwordResetTokensTable).set({ used: true }).where(eq(passwordResetTokensTable.id, record.id));

  return res.json({ success: true, message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
});

// ─── Admin routes ──────────────────────────────────────────────────────────────

/**
 * GET /api/user/admin/users — list all users (admin only)
 * Query param: ?withStats=true → includes post counts + platform cost per user
 */
router.get("/admin/users", requireAdmin, async (req, res) => {
  const withStats = req.query.withStats === "true";

  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    displayName: usersTable.displayName,
    role: usersTable.role,
    plan: usersTable.plan,
    isActive: usersTable.isActive,
    emailVerified: usersTable.emailVerified,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(isNull(usersTable.deletedAt)).orderBy(usersTable.createdAt);

  const subscriptions = await db.select().from(subscriptionsTable);
  const subMap = new Map(subscriptions.map(s => [s.userId, s]));

  let statsMap: Map<number, { image: number; story: number; carousel: number; reel: number; totalPosts: number; totalCostUsd: number }> = new Map();

  if (withStats) {
    const postStats = await db.select({
      userId:       postsTable.userId,
      contentType:  postsTable.contentType,
      count:        sql<number>`count(*)::int`,
      costUsd:      sql<string>`COALESCE(SUM(${postsTable.generationCostUsd}), 0)`,
    })
      .from(postsTable)
      .groupBy(postsTable.userId, postsTable.contentType);

    for (const row of postStats) {
      if (row.userId == null) continue;
      const existing = statsMap.get(row.userId) ?? { image: 0, story: 0, carousel: 0, reel: 0, totalPosts: 0, totalCostUsd: 0 };
      const type = row.contentType as "image" | "story" | "carousel" | "reel";
      if (type in existing) existing[type] = row.count;
      existing.totalPosts += row.count;
      existing.totalCostUsd += Number(row.costUsd);
      statsMap.set(row.userId, existing);
    }
  }

  const ZERO_STATS = { image: 0, story: 0, carousel: 0, reel: 0, totalPosts: 0, totalCostUsd: 0 };

  return res.json({ users: users.map(u => ({
    ...u,
    status: u.isActive === "true" ? "active" : "inactive",
    subscription: subMap.get(u.id) ?? null,
    ...(withStats && u.role !== "admin" ? { postStats: statsMap.get(u.id) ?? ZERO_STATS } : {}),
  })) });
});

/**
 * POST /api/user/admin/users/:id/force-verify — mark email as verified (admin only)
 */
router.post("/admin/users/:id/force-verify", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: "ID inválido" });

  const [user] = await db.update(usersTable)
    .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, email: usersTable.email, emailVerified: usersTable.emailVerified });

  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  invalidateEmailVerifiedCache(userId);
  return res.json({ success: true, user });
});

/**
 * PUT /api/user/admin/users/:id — update user plan/role/active (admin only)
 */
router.put("/admin/users/:id", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { plan, role, isActive, periodEnd, credits, creditsTotal } = req.body as {
    plan?: string; role?: string; isActive?: string; periodEnd?: string;
    credits?: number; creditsTotal?: number;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (plan) updates.plan = plan;
  if (role) updates.role = role;
  if (isActive !== undefined) updates.isActive = isActive;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  if (isActive !== undefined) invalidateActiveCache(userId);
  if (plan || role) invalidateTrialCache(userId);

  // Update subscription
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)).limit(1);
  if (plan || periodEnd || credits !== undefined || creditsTotal !== undefined) {
    const resolvedPlan = plan ?? sub?.plan ?? "free";
    // Read credits from DB so admin changes to plan.credits_per_month are respected
    const [adminPlanRow] = await db.select({ creditsPerMonth: plansTable.creditsPerMonth })
      .from(plansTable).where(eq(plansTable.key, resolvedPlan)).limit(1);
    const defaultCredits = adminPlanRow?.creditsPerMonth ?? 40;
    const resolvedPeriodEnd = periodEnd ? new Date(periodEnd) : undefined;
    const resolvedCreditsRemaining = credits !== undefined ? credits : (plan ? defaultCredits : undefined);
    const resolvedCreditsTotal = creditsTotal !== undefined ? creditsTotal : (plan ? defaultCredits : undefined);

    if (sub) {
      const subUpdates: Record<string, unknown> = { updatedAt: new Date(), status: "active" };
      if (plan) subUpdates.plan = resolvedPlan;
      if (resolvedCreditsRemaining !== undefined) subUpdates.creditsRemaining = resolvedCreditsRemaining;
      if (resolvedCreditsTotal !== undefined) subUpdates.creditsTotal = resolvedCreditsTotal;
      if (resolvedPeriodEnd) subUpdates.periodEnd = resolvedPeriodEnd;
      await db.update(subscriptionsTable).set(subUpdates).where(eq(subscriptionsTable.userId, userId));
    } else {
      const cr = resolvedCreditsRemaining ?? defaultCredits;
      const ct = resolvedCreditsTotal ?? defaultCredits;
      const defaultPeriodEnd = resolvedPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(subscriptionsTable).values({ userId, plan: resolvedPlan, status: "active", creditsRemaining: cr, creditsTotal: ct, periodEnd: defaultPeriodEnd });
    }
  }

  return res.json({ success: true, user });
});

/**
 * PATCH /api/user/admin/users/:id/email — change user email (admin only)
 * Preserves all user data; only updates the email field.
 */
router.patch("/admin/users/:id/email", requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Email inválido" });

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (existing.length > 0 && existing[0].id !== targetId) {
    return res.status(409).json({ error: "Ese email ya está en uso por otra cuenta" });
  }

  const [updated] = await db.update(usersTable).set({
    email: normalizedEmail,
    emailVerified: true,
    emailVerificationToken: null,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, targetId)).returning({
    id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName,
  });

  if (!updated) return res.status(404).json({ error: "Usuario no encontrado" });
  invalidateEmailVerifiedCache(targetId);
  return res.json({ success: true, user: updated });
});

/**
 * DELETE /api/user/admin/users/:id — move user to trash (soft-delete).
 * Data is preserved. Use /purge to permanently delete.
 */
router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!targetId || isNaN(targetId)) return res.status(400).json({ error: "ID inválido" });
  if (targetId === req.user!.userId) return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });

  const [target] = await db.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role, deletedAt: usersTable.deletedAt })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });
  if (target.role === "admin") return res.status(400).json({ error: "No se puede eliminar otro administrador" });
  if (target.deletedAt) return res.status(400).json({ error: "El usuario ya está en la papelera" });

  await db.update(usersTable)
    .set({ deletedAt: new Date(), isActive: "false", updatedAt: new Date() })
    .where(eq(usersTable.id, targetId));
  // Cascade-deactivate all businesses of the deleted user so the scheduler
  // and image generation queue don't continue processing them.
  await db.update(businessesTable)
    .set({ isActive: false, autoGenerationEnabled: false })
    .where(eq(businessesTable.userId, targetId));
  invalidateActiveCache(targetId);

  return res.json({ success: true, trashed: target.email });
});

// ─── Delete-account 3-tier confirmation (Task #178) ──────────────────────────

const TOTP_WINDOW = 2;

function verifyTotp(token: string, secret: string): boolean {
  try {
    const result = verifySync({ token, secret, window: TOTP_WINDOW }) as unknown;
    if (typeof result === "boolean") return result;
    return (result as { valid?: boolean })?.valid === true;
  } catch {
    return false;
  }
}

function sha256hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const masked = local.length <= 2 ? local[0] + "***" : local.slice(0, 2) + "***";
  return masked + "@" + domain;
}

// Rate limiter: max 1 OTP send per 60 s per user
const deleteOtpRateLimit = new Map<number, number>();
const DELETE_OTP_COOLDOWN_MS = 60 * 1000;
const DELETE_OTP_EXPIRY_MS = 10 * 60 * 1000;

async function sendDeleteOtpEmail(email: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const html = `
    <div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#fff;border-radius:16px;">
      <h1 style="margin:0 0 4px;font-size:28px;"><span style="color:#fff;">haz</span><span style="color:#00C2FF;">post</span></h1>
      <p style="color:#888;font-size:13px;margin:0 0 24px;">hazpost.app — Haz más, publica mejor.</p>
      <h2 style="font-size:20px;color:#ff4444;margin:0 0 12px;">Confirmación de eliminación de cuenta</h2>
      <p style="color:#ccc;line-height:1.6;">Recibiste este correo porque solicitaste eliminar tu cuenta. Usa el siguiente código para confirmar la acción.</p>
      <div style="margin:28px 0;text-align:center;background:#1a0a0a;border:2px solid #ff4444;border-radius:12px;padding:24px;">
        <p style="margin:0 0 8px;font-size:13px;color:#888;">Tu código de confirmación (válido 10 minutos):</p>
        <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#ff4444;">${otp}</span>
      </div>
      <div style="padding:16px;background:#111;border-radius:10px;border:1px solid #222;">
        <p style="margin:0;font-size:12px;color:#666;">Si no solicitaste eliminar tu cuenta, ignora este correo. Nadie más puede completar esta acción sin este código.</p>
      </div>
    </div>
  `;

  const smtpPass = process.env.SMTP_PASSWORD;
  if (smtpPass) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: "smtp.hostinger.com", port: 587, secure: false,
        auth: { user: "noreply@hazpost.app", pass: smtpPass },
      });
      await transporter.sendMail({
        from: '"hazpost" <noreply@hazpost.app>',
        to: email,
        subject: "Código de confirmación — eliminar cuenta",
        html,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `SMTP: ${String(err)}` };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "No SMTP_PASSWORD and no RESEND_API_KEY" };
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: "hazpost <noreply@hazpost.app>", to: [email], subject: "Código de confirmación — eliminar cuenta", html }),
    });
    return { ok: resp.ok, error: resp.ok ? undefined : await resp.text().catch(() => "") };
  } catch (err) {
    return { ok: false, error: `Resend: ${String(err)}` };
  }
}

/**
 * GET /api/user/delete-account/method
 * Returns which confirmation method the user must use:
 *   "totp"     — 2FA is enabled → require TOTP code
 *   "password" — has password but no 2FA → require current password
 *   "email"    — OAuth-only user (no password, no 2FA) → send OTP to email
 */
router.get("/delete-account/method", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const [user] = await db.select({
    totpEnabled: usersTable.totpEnabled,
    passwordHash: usersTable.passwordHash,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  let method: "totp" | "password" | "email";
  if (user.totpEnabled) method = "totp";
  else if (user.passwordHash) method = "password";
  else method = "email";

  // Expose explicit booleans so callers can distinguish "TOTP-only" from "password + TOTP".
  // The `method` field is kept for backward compatibility with existing callers.
  return res.json({
    method,
    hasPassword: !!user.passwordHash,
    hasTotp: !!user.totpEnabled,
  });
});

/**
 * POST /api/user/delete-account/send-code
 * Generates a 6-digit OTP, stores its sha256 hash in DB, and sends it via email.
 * Only valid for OAuth users (method = "email"). Rate-limited to 1 per 60 s.
 */
router.post("/delete-account/send-code", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  const lastSent = deleteOtpRateLimit.get(userId) ?? 0;
  const now = Date.now();
  if (now - lastSent < DELETE_OTP_COOLDOWN_MS) {
    const waitSec = Math.ceil((DELETE_OTP_COOLDOWN_MS - (now - lastSent)) / 1000);
    return res.status(429).json({ error: `Espera ${waitSec} segundos antes de solicitar otro código.`, retryAfterSeconds: waitSec });
  }

  const [user] = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    role: usersTable.role,
    passwordHash: usersTable.passwordHash,
    totpEnabled: usersTable.totpEnabled,
    deletedAt: usersTable.deletedAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (user.role === "admin") return res.status(400).json({ error: "El administrador no puede eliminar su propia cuenta" });
  if (user.deletedAt) return res.status(400).json({ error: "Tu cuenta ya está en proceso de eliminación" });
  if (user.totpEnabled || user.passwordHash) {
    return res.status(400).json({ error: "Este endpoint es solo para cuentas OAuth sin contraseña" });
  }

  const otpNum = crypto.randomInt(0, 1_000_000);
  const otp = String(otpNum).padStart(6, "0");
  const otpHash = sha256hex(otp);
  const otpExpiry = new Date(now + DELETE_OTP_EXPIRY_MS);

  await db.update(usersTable)
    .set({ deleteOtpHash: otpHash, deleteOtpExpiry: otpExpiry, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  deleteOtpRateLimit.set(userId, now);

  const emailResult = await sendDeleteOtpEmail(user.email, otp);
  if (!emailResult.ok) {
    req.log?.error?.({ event: "delete_otp_email_failed", to: user.email, error: emailResult.error }, "[email] Delete OTP email failed");
    // Roll back the OTP so the rate limit window can be retried honestly
    await db.update(usersTable)
      .set({ deleteOtpHash: null, deleteOtpExpiry: null })
      .where(eq(usersTable.id, userId));
    deleteOtpRateLimit.delete(userId);
    return res.status(502).json({ error: "No se pudo enviar el código por correo. Intenta de nuevo en unos minutos." });
  }

  return res.json({ success: true, sentTo: maskEmail(user.email) });
});

/**
 * POST /api/user/delete-account — user self-deletes their own account (soft-delete → admin trash).
 * 3-tier confirmation:
 *   - TOTP enabled  → body.code must be valid TOTP token
 *   - Password user → body.code must be current password
 *   - OAuth-only    → body.code must be the 6-digit email OTP
 * Admins cannot self-delete.
 */
router.post("/delete-account", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { code } = req.body as { code?: string };

  const [user] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    email: usersTable.email,
    passwordHash: usersTable.passwordHash,
    totpEnabled: usersTable.totpEnabled,
    totpSecret: usersTable.totpSecret,
    deleteOtpHash: usersTable.deleteOtpHash,
    deleteOtpExpiry: usersTable.deleteOtpExpiry,
    deletedAt: usersTable.deletedAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (user.role === "admin") return res.status(400).json({ error: "El administrador no puede eliminar su propia cuenta" });
  if (user.deletedAt) return res.status(400).json({ error: "Tu cuenta ya está en proceso de eliminación" });

  const codeStr = typeof code === "string" ? code.trim() : "";
  if (!codeStr) return res.status(400).json({ error: "Se requiere un código de confirmación" });

  // ── Tier 1: TOTP ──────────────────────────────────────────────────────────
  if (user.totpEnabled) {
    if (!user.totpSecret) return res.status(500).json({ error: "Configuración 2FA inválida" });
    const valid = verifyTotp(codeStr, user.totpSecret);
    if (!valid) return res.status(401).json({ error: "Código de Google Authenticator incorrecto" });
  }
  // ── Tier 2: Password ──────────────────────────────────────────────────────
  else if (user.passwordHash) {
    const valid = await comparePassword(codeStr, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  // ── Tier 3: Email OTP ─────────────────────────────────────────────────────
  else {
    if (!user.deleteOtpHash || !user.deleteOtpExpiry) {
      return res.status(400).json({ error: "Primero solicita el código de verificación por correo" });
    }
    if (new Date() > user.deleteOtpExpiry) {
      return res.status(401).json({ error: "El código expiró. Solicita uno nuevo." });
    }
    const inputHash = sha256hex(codeStr);
    if (inputHash !== user.deleteOtpHash) {
      return res.status(401).json({ error: "Código incorrecto" });
    }
    // Invalidate OTP immediately after use
    await db.update(usersTable)
      .set({ deleteOtpHash: null, deleteOtpExpiry: null })
      .where(eq(usersTable.id, userId));
  }

  await db.update(usersTable)
    .set({ deletedAt: new Date(), isActive: "false", updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
  invalidateActiveCache(userId);

  return res.json({ success: true });
});

/**
 * GET /api/user/admin/users/trash — list users in the trash (soft-deleted)
 */
router.get("/admin/users/trash", requireAdmin, async (req, res) => {
  const trashedUsers = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    displayName: usersTable.displayName,
    role: usersTable.role,
    plan: usersTable.plan,
    createdAt: usersTable.createdAt,
    deletedAt: usersTable.deletedAt,
  }).from(usersTable).where(isNotNull(usersTable.deletedAt)).orderBy(usersTable.deletedAt);

  return res.json({ users: trashedUsers });
});

/**
 * POST /api/user/admin/users/:id/restore — restore a user from the trash
 */
router.post("/admin/users/:id/restore", requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!targetId || isNaN(targetId)) return res.status(400).json({ error: "ID inválido" });

  const [target] = await db.select({ id: usersTable.id, email: usersTable.email, deletedAt: usersTable.deletedAt })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!target.deletedAt) return res.status(400).json({ error: "El usuario no está en la papelera" });

  await db.update(usersTable)
    .set({ deletedAt: null, isActive: "true", updatedAt: new Date() })
    .where(eq(usersTable.id, targetId));
  invalidateActiveCache(targetId);

  return res.json({ success: true, restored: target.email });
});

/**
 * DELETE /api/user/admin/users/:id/purge — permanently delete a user from the trash (irreversible)
 */
router.delete("/admin/users/:id/purge", requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!targetId || isNaN(targetId)) return res.status(400).json({ error: "ID inválido" });
  if (targetId === req.user!.userId) return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });

  const [target] = await db.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role, deletedAt: usersTable.deletedAt })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });
  if (target.role === "admin") return res.status(400).json({ error: "No se puede eliminar otro administrador" });
  if (!target.deletedAt) return res.status(400).json({ error: "El usuario no está en la papelera. Muévelo a la papelera antes de purgarlo." });

  const userPosts = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.userId, targetId));
  if (userPosts.length > 0) {
    const postIds = userPosts.map(p => p.id);
    const { inArray } = await import("drizzle-orm");
    await db.delete(imageVariantsTable).where(inArray(imageVariantsTable.postId, postIds)).catch(() => {});
    await db.delete(publishLogTable).where(inArray(publishLogTable.postId, postIds)).catch(() => {});
  }

  await db.delete(postsTable).where(eq(postsTable.userId, targetId)).catch(() => {});
  await db.delete(nichesTable).where(eq(nichesTable.userId, targetId)).catch(() => {});
  await db.delete(socialAccountsTable).where(eq(socialAccountsTable.userId, targetId)).catch(() => {});
  await db.delete(mediaLibraryTable).where(eq(mediaLibraryTable.userId, targetId)).catch(() => {});
  await db.delete(landingPagesTable).where(eq(landingPagesTable.userId, targetId)).catch(() => {});
  await db.delete(brandProfilesTable).where(eq(brandProfilesTable.userId, targetId)).catch(() => {});
  await db.delete(businessesTable).where(eq(businessesTable.userId, targetId)).catch(() => {});
  await db.delete(contentHistoryTable).where(eq(contentHistoryTable.userId, targetId)).catch(() => {});
  await db.delete(publishingSchedulesTable).where(eq(publishingSchedulesTable.userId, targetId)).catch(() => {});
  await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, targetId)).catch(() => {});
  await db.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, targetId)).catch(() => {});
  await db.delete(usersTable).where(eq(usersTable.id, targetId));
  invalidateActiveCache(targetId);

  return res.json({ success: true, purged: target.email });
});

/**
 * POST /api/user/admin/users — create a new user directly (admin only)
 */
router.post("/admin/users", requireAdmin, async (req, res) => {
  const { email, password, displayName, plan, role, periodEnd } = req.body as {
    email?: string; password?: string; displayName?: string; plan?: string; role?: string; periodEnd?: string;
  };
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son requeridos" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese email" });
  }

  const resolvedPlan = plan || "free";
  const resolvedRole = role || "user";
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    passwordHash,
    role: resolvedRole,
    plan: resolvedPlan,
    displayName: displayName || email.split("@")[0],
  }).returning();

  // Read full plan config from DB to snapshot capabilities at subscription creation
  const [adminCreatePlanRow] = await db.select().from(plansTable).where(eq(plansTable.key, resolvedPlan)).limit(1);
  const credits = adminCreatePlanRow?.creditsPerMonth ?? 40;
  const adminLockedConfig = adminCreatePlanRow ? buildPlanSnapshot(adminCreatePlanRow) : null;
  const resolvedPeriodEnd = periodEnd ? new Date(periodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(subscriptionsTable).values({
    userId: user.id,
    plan: resolvedPlan,
    status: "active",
    creditsRemaining: credits,
    creditsTotal: credits,
    lockedPlanConfig: adminLockedConfig,
    periodEnd: resolvedPeriodEnd,
  });

  return res.status(201).json({ success: true, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, plan: user.plan } });
});

/**
 * POST /api/user/admin/users/:id/grant-credits — additively grant (or deduct) credits (admin only)
 * Body: { amount: number, reason?: string }
 * Positive amount = add credits. Negative = deduct.
 */
router.post("/admin/users/:id/grant-credits", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: "ID inválido" });
  const { amount } = req.body as { amount?: number };
  if (typeof amount !== "number" || amount === 0) return res.status(400).json({ error: "amount debe ser un número distinto de cero" });

  // Single atomic SQL — no read-then-write race condition.
  // GREATEST(..., 0) prevents negative balances.
  const result = await db.execute(sql`
    UPDATE subscriptions
    SET
      credits_remaining = GREATEST(credits_remaining + ${amount}, 0),
      credits_total     = GREATEST(credits_total     + ${amount}, 0),
      updated_at        = NOW()
    WHERE user_id = ${userId}
    RETURNING credits_remaining, credits_total
  `);

  if (!result.rows.length) return res.status(404).json({ error: "Suscripción no encontrada para este usuario" });
  const row = result.rows[0] as { credits_remaining: number; credits_total: number };
  return res.json({ success: true, creditsRemaining: row.credits_remaining, creditsTotal: row.credits_total });
});

/**
 * POST /api/user/admin/users/:id/claim-legacy — assign all null-userId records to a specific user (admin only)
 */
router.post("/admin/users/:id/claim-legacy", requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.id);
  const [target] = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, targetUserId));
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });

  const results: Record<string, number> = {};

  const postsRes = await db.update(postsTable).set({ userId: targetUserId }).where(isNull(postsTable.userId)).returning({ id: postsTable.id });
  results.posts = postsRes.length;

  const nichesRes = await db.update(nichesTable).set({ userId: targetUserId }).where(isNull(nichesTable.userId)).returning({ id: nichesTable.id });
  results.niches = nichesRes.length;

  const accountsRes = await db.update(socialAccountsTable).set({ userId: targetUserId }).where(isNull(socialAccountsTable.userId)).returning({ id: socialAccountsTable.id });
  results.socialAccounts = accountsRes.length;

  const mediaRes = await db.update(mediaLibraryTable).set({ userId: targetUserId }).where(isNull(mediaLibraryTable.userId)).returning({ id: mediaLibraryTable.id });
  results.media = mediaRes.length;

  const landingsRes = await db.update(landingPagesTable).set({ userId: targetUserId }).where(isNull(landingPagesTable.userId)).returning({ id: landingPagesTable.id });
  results.landings = landingsRes.length;

  const variantsRes = await db.update(imageVariantsTable).set({ userId: targetUserId }).where(isNull(imageVariantsTable.userId)).returning({ id: imageVariantsTable.id });
  results.imageVariants = variantsRes.length;

  return res.json({ success: true, assignedTo: target.email, results });
});

export default router;
