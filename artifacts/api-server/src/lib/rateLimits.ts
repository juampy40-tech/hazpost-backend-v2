import { rateLimit } from "express-rate-limit";
import type { Request } from "express";

/** Auth endpoints: max 10 requests/minute per IP to slow brute-force attacks. */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera un minuto antes de intentar de nuevo." },
  skipSuccessfulRequests: false,
});

/** Forgot-password: max 5 requests/15min per IP — avoids email spam abuse. */
export const forgotPasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes de recuperación. Espera 15 minutos." },
  skipSuccessfulRequests: false,
});

/** Chatbot public endpoint: max 30 messages/minute per IP — avoids chatbot abuse from bots. */
export const chatbotRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados mensajes. Espera un momento antes de continuar." },
});

/**
 * AI generation endpoints: max 20 requests/minute per authenticated user.
 * These routes always run after requireAuth, so req.user is always present.
 * Keying by userId avoids IPv6 issues with IP-based keying.
 */
export const aiGenerationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Límite de generación alcanzado. Espera un minuto antes de continuar." },
  keyGenerator: (req: Request) => {
    const userId = (req as Request & { user?: { userId: number } }).user?.userId;
    return `user:${userId ?? "anon"}`;
  },
  validate: { ip: false },
});

/**
 * TOTP 2FA login: max 5 attempts per 5 minutes per IP.
 * TOTP codes are 6 digits (1,000,000 possibilities) but only ~5 valid at any moment
 * (window=2 → ±2 time steps of 30s). Without throttling an attacker could brute-force
 * the valid window quickly. 5 attempts/5min makes that infeasible.
 */
export const totpRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de verificación. Espera 5 minutos antes de intentar de nuevo." },
  skipSuccessfulRequests: true,
});

/**
 * Landing page lead capture: max 3 submissions per 10 minutes per IP.
 * Prevents automated spam bots from flooding the leads table.
 */
export const leadCaptureRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados envíos. Por favor espera antes de intentar de nuevo." },
});
