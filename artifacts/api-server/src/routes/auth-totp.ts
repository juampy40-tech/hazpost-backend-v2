/**
 * TOTP (Google Authenticator) 2FA routes
 *
 * Flow:
 *   Setup:   POST /api/auth/totp/setup          → returns secret + QR code URI
 *            POST /api/auth/totp/verify-setup    → validates first code → enables TOTP
 *   Use:     Login checks device cookie first:
 *              - Trusted device → issues JWT directly (no TOTP needed)
 *              - Unknown device → returns { totpRequired: true, preAuthToken }
 *            POST /api/auth/totp/login           → validates code + optionally trusts device
 *   Disable: POST /api/auth/totp/disable        → validates code → disables TOTP + clears trusted devices
 *   Status:  GET  /api/auth/totp/status         → { enabled, trustedDeviceCount }
 *   Devices: GET  /api/auth/totp/devices        → list trusted devices
 *            DELETE /api/auth/totp/devices/:id  → revoke one trusted device
 *            DELETE /api/auth/totp/devices      → revoke all trusted devices
 */
import { Router } from "express";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db, usersTable, trustedDevicesTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { requireAuth, signToken, setAuthCookie } from "../lib/auth.js";

const TOTP_WINDOW = 2;

const verify = ({ token, secret }: { token: string; secret: string }): boolean => {
  try {
    const result = verifySync({ token, secret, window: TOTP_WINDOW }) as any;
    if (typeof result === "boolean") return result;
    return result?.valid === true;
  } catch {
    return false;
  }
};

const router = Router();

const APP_NAME = "hazpost";
const JWT_SECRET = process.env.JWT_SECRET || process.env.TOKEN_ENCRYPTION_KEY || "";
const PRE_AUTH_EXPIRES = "5m";
const DEVICE_COOKIE = "eco_device";
const DEVICE_TRUST_DAYS = 30;

interface PreAuthPayload {
  preAuth: true;
  userId: number;
  email: string;
}

export function signPreAuthToken(userId: number, email: string): string {
  return jwt.sign({ preAuth: true, userId, email } as PreAuthPayload, JWT_SECRET, { expiresIn: PRE_AUTH_EXPIRES });
}

export function verifyPreAuthToken(token: string): PreAuthPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as PreAuthPayload;
    if (!payload.preAuth) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Derive a human-readable device name from User-Agent */
function deviceNameFromUA(ua: string): string {
  if (!ua) return "Dispositivo desconocido";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X/i.test(ua)) {
    if (/Chrome/i.test(ua)) return "Mac — Chrome";
    if (/Firefox/i.test(ua)) return "Mac — Firefox";
    if (/Safari/i.test(ua)) return "Mac — Safari";
    return "Mac";
  }
  if (/Windows/i.test(ua)) {
    if (/Chrome/i.test(ua)) return "Windows — Chrome";
    if (/Firefox/i.test(ua)) return "Windows — Firefox";
    if (/Edge/i.test(ua)) return "Windows — Edge";
    return "Windows";
  }
  if (/Linux/i.test(ua)) return "Linux";
  return "Otro dispositivo";
}

/**
 * Checks if the incoming request has a valid trusted-device cookie for the given user.
 * If valid, refreshes the lastUsedAt timestamp.
 */
export async function isDeviceTrusted(req: import("express").Request, userId: number): Promise<boolean> {
  const token = req.cookies?.[DEVICE_COOKIE];
  if (!token) return false;
  const now = new Date();
  const [device] = await db.select({ id: trustedDevicesTable.id })
    .from(trustedDevicesTable)
    .where(and(
      eq(trustedDevicesTable.deviceToken, token),
      eq(trustedDevicesTable.userId, userId),
      gt(trustedDevicesTable.expiresAt, now),
    ))
    .limit(1);
  if (!device) return false;
  // Refresh lastUsedAt silently
  db.update(trustedDevicesTable)
    .set({ lastUsedAt: now })
    .where(eq(trustedDevicesTable.id, device.id))
    .catch(() => {});
  return true;
}

/** Sets a trusted-device cookie and stores it in DB */
async function trustDevice(
  res: import("express").Response,
  userId: number,
  ua: string,
): Promise<void> {
  const deviceToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000);
  const deviceName = deviceNameFromUA(ua);
  await db.insert(trustedDevicesTable).values({ userId, deviceToken, deviceName, expiresAt });
  res.cookie(DEVICE_COOKIE, deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

// ─── Status ───────────────────────────────────────────────────────────────────

router.get("/status", requireAuth, async (req, res) => {
  const [user] = await db.select({ totpEnabled: usersTable.totpEnabled })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  const now = new Date();
  const devices = await db.select({ id: trustedDevicesTable.id })
    .from(trustedDevicesTable)
    .where(and(
      eq(trustedDevicesTable.userId, req.user!.userId),
      gt(trustedDevicesTable.expiresAt, now),
    ));
  res.json({ enabled: user?.totpEnabled ?? false, trustedDeviceCount: devices.length });
});

// ─── Trusted devices list ─────────────────────────────────────────────────────

router.get("/devices", requireAuth, async (req, res) => {
  const now = new Date();
  const currentToken = req.cookies?.[DEVICE_COOKIE];
  const devices = await db.select({
    id: trustedDevicesTable.id,
    deviceName: trustedDevicesTable.deviceName,
    lastUsedAt: trustedDevicesTable.lastUsedAt,
    expiresAt: trustedDevicesTable.expiresAt,
    deviceToken: trustedDevicesTable.deviceToken,
  })
    .from(trustedDevicesTable)
    .where(and(
      eq(trustedDevicesTable.userId, req.user!.userId),
      gt(trustedDevicesTable.expiresAt, now),
    ));
  res.json(devices.map(d => ({
    id: d.id,
    deviceName: d.deviceName,
    lastUsedAt: d.lastUsedAt,
    expiresAt: d.expiresAt,
    isCurrent: d.deviceToken === currentToken,
  })));
});

router.delete("/devices/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(trustedDevicesTable)
    .where(and(eq(trustedDevicesTable.id, id), eq(trustedDevicesTable.userId, req.user!.userId)));
  res.json({ success: true });
});

router.delete("/devices", requireAuth, async (req, res) => {
  await db.delete(trustedDevicesTable).where(eq(trustedDevicesTable.userId, req.user!.userId));
  res.clearCookie(DEVICE_COOKIE, { path: "/" });
  res.json({ success: true });
});

// ─── Setup ────────────────────────────────────────────────────────────────────

router.post("/setup", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({ email: usersTable.email, totpEnabled: usersTable.totpEnabled })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (user.totpEnabled) return res.status(400).json({ error: "Google Authenticator ya está activado. Desactívalo primero." });

    const secret = generateSecret();
    const otpAuthUri = generateURI({ secret, label: user.email, issuer: APP_NAME, type: "totp" });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUri);

    await db.update(usersTable)
      .set({ totpSecret: secret, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));

    res.json({ secret, qrCodeDataUrl, otpAuthUri });
  } catch (err) {
    console.error("[totp/setup]", err);
    res.status(500).json({ error: "Error al generar configuración 2FA" });
  }
});

// ─── Verify setup ─────────────────────────────────────────────────────────────

router.post("/verify-setup", requireAuth, async (req, res) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) return res.status(400).json({ error: "Código requerido" });

    const [user] = await db.select({ totpSecret: usersTable.totpSecret, totpEnabled: usersTable.totpEnabled })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user?.totpSecret) return res.status(400).json({ error: "No hay configuración pendiente. Ejecuta el setup primero." });
    if (user.totpEnabled) return res.status(400).json({ error: "2FA ya está activado" });

    const isValid = verify({ token: code.trim(), secret: user.totpSecret });
    if (!isValid) return res.status(400).json({ error: "Código incorrecto. Verifica la hora de tu dispositivo y vuelve a intentar." });

    await db.update(usersTable)
      .set({ totpEnabled: true, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));

    // Automatically trust the current device upon first activation
    await trustDevice(res, req.user!.userId, req.headers["user-agent"] ?? "");

    res.json({ success: true, message: "Google Authenticator activado correctamente" });
  } catch (err) {
    console.error("[totp/verify-setup]", err);
    res.status(500).json({ error: "Error al activar 2FA" });
  }
});

// ─── Disable ──────────────────────────────────────────────────────────────────

router.post("/disable", requireAuth, async (req, res) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) return res.status(400).json({ error: "Código de Google Authenticator requerido para desactivar" });

    const [user] = await db.select({ totpSecret: usersTable.totpSecret, totpEnabled: usersTable.totpEnabled })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user?.totpEnabled) return res.status(400).json({ error: "2FA no está activado" });
    if (!user.totpSecret) return res.status(400).json({ error: "Configuración inválida" });

    const isValid = verify({ token: code.trim(), secret: user.totpSecret });
    if (!isValid) return res.status(400).json({ error: "Código incorrecto" });

    await db.update(usersTable)
      .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));

    // Revoke all trusted devices when 2FA is disabled
    await db.delete(trustedDevicesTable).where(eq(trustedDevicesTable.userId, req.user!.userId));
    res.clearCookie(DEVICE_COOKIE, { path: "/" });

    res.json({ success: true, message: "Google Authenticator desactivado" });
  } catch (err) {
    console.error("[totp/disable]", err);
    res.status(500).json({ error: "Error al desactivar 2FA" });
  }
});

// ─── Login (post-password TOTP verification) ──────────────────────────────────

router.post("/login", async (req, res) => {
  try {
    const { preAuthToken, code, trustDevice: trust } = req.body as {
      preAuthToken?: string;
      code?: string;
      trustDevice?: boolean;
    };
    if (!preAuthToken || !code) return res.status(400).json({ error: "Token y código son requeridos" });

    const pre = verifyPreAuthToken(preAuthToken);
    if (!pre) return res.status(401).json({ error: "Token de verificación inválido o expirado. Inicia sesión nuevamente." });

    const [user] = await db.select({
      id: usersTable.id, email: usersTable.email, role: usersTable.role, plan: usersTable.plan,
      totpSecret: usersTable.totpSecret, totpEnabled: usersTable.totpEnabled,
    }).from(usersTable).where(eq(usersTable.id, pre.userId)).limit(1);

    if (!user || !user.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ error: "Configuración 2FA no válida" });
    }

    const isValid = verify({ token: code.trim(), secret: user.totpSecret });
    if (!isValid) return res.status(400).json({ error: "Código incorrecto. El código cambia cada 30 segundos." });

    const token = signToken({ userId: user.id, email: user.email, role: user.role, plan: user.plan });
    setAuthCookie(res, token);

    // Optionally trust this device for 30 days
    if (trust) {
      await trustDevice(res, user.id, req.headers["user-agent"] ?? "");
    }

    res.json({ success: true, user: { id: user.id, email: user.email, role: user.role, plan: user.plan } });
  } catch (err) {
    console.error("[totp/login]", err);
    res.status(500).json({ error: "Error al verificar código 2FA" });
  }
});

export default router;
