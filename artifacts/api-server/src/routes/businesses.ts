import { Router, type RequestHandler } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { businessesTable, plansTable, subscriptionsTable, nichesTable, industryGroupsTable, usersTable, postsTable, customSubIndustriesTable } from "@workspace/db";
import { eq, and, asc, count, sql } from "drizzle-orm";
import { auditLog, AuditAction } from "../lib/audit.js";
import { validateBase64Mime } from "../lib/fileScanner.js";
import { getCurrentTrm, computeCopPrice } from "../services/trm.service.js";
import { getSubcategories } from "../lib/industries.js";
import { invalidateIndustryContextCache } from "../lib/industryAiContext.js";
import { analyzeWebsite } from "./analyze-website.js";
import { comparePassword } from "../lib/auth.js";
import { decryptToken } from "../lib/tokenEncryption.js";
import { verifySync } from "otplib";

// ── Business-deletion email OTP (for OAuth users without password) ──────────
const BIZ_DELETE_OTP_COOLDOWN_MS = 60 * 1000;
const BIZ_DELETE_OTP_EXPIRY_MS = 10 * 60 * 1000;
const bizDeleteOtpStore = new Map<string, { hash: string; expiry: Date }>();
const bizDeleteOtpRateLimit = new Map<string, number>();

function sha256hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function sendBizDeleteOtpEmail(email: string, bizName: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const html = `
    <div style="font-family:Poppins,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#fff;border-radius:16px;">
      <h1 style="margin:0 0 4px;font-size:28px;"><span style="color:#fff;">haz</span><span style="color:#00C2FF;">post</span></h1>
      <p style="color:#888;font-size:13px;margin:0 0 24px;">hazpost.app — Haz más, publica mejor.</p>
      <h2 style="font-size:20px;color:#ff9800;margin:0 0 12px;">Confirmación para desactivar negocio</h2>
      <p style="color:#ccc;line-height:1.6;">Recibiste este correo porque solicitaste desactivar el negocio <strong>${bizName}</strong>. Usa el siguiente código para confirmar.</p>
      <div style="margin:28px 0;text-align:center;background:#1a1000;border:2px solid #ff9800;border-radius:12px;padding:24px;">
        <p style="margin:0 0 8px;font-size:13px;color:#888;">Tu código de confirmación (válido 10 minutos):</p>
        <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#ff9800;">${otp}</span>
      </div>
      <div style="padding:16px;background:#111;border-radius:10px;border:1px solid #222;">
        <p style="margin:0;font-size:12px;color:#666;">Si no solicitaste este cambio, ignora este correo. Nadie más puede completar esta acción sin este código.</p>
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
        subject: "Código de confirmación — desactivar negocio",
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
      body: JSON.stringify({ from: "hazpost <noreply@hazpost.app>", to: [email], subject: "Código de confirmación — desactivar negocio", html }),
    });
    return { ok: resp.ok, error: resp.ok ? undefined : await resp.text().catch(() => "") };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Sanitizes a subIndustries array against the static catalog + approved custom subs
 * for the given industry. Unknown entries are silently removed.
 * Returns the filtered array (may be empty if no valid entries remain).
 */
async function sanitizeSubIndustriesArray(industry: string | null | undefined, subs: string[]): Promise<string[]> {
  if (!industry || subs.length === 0) return subs;
  const staticSubs = getSubcategories(industry).map(s => s.name.toLowerCase());
  // Skip DB lookup if all are in static catalog (fast path)
  const allStatic = subs.every(s => staticSubs.includes(s.toLowerCase()));
  if (allStatic) return subs;
  // Fetch approved custom subs for this industry
  const customRows = await db
    .select({ name: customSubIndustriesTable.name })
    .from(customSubIndustriesTable)
    .where(and(eq(customSubIndustriesTable.industryName, industry), eq(customSubIndustriesTable.status, "approved")));
  const customNames = new Set(customRows.map(r => r.name.toLowerCase()));
  return subs.filter(s => staticSubs.includes(s.toLowerCase()) || customNames.has(s.toLowerCase()));
}

/**
 * Validates that subIndustry belongs to the given industry.
 * Returns an error string if invalid, null if valid.
 */
function validateSubIndustry(industry: string | null | undefined, subIndustry: string | null | undefined): string | null {
  if (!subIndustry || !industry) return null;
  const subs = getSubcategories(industry);
  if (subs.length === 0) return null; // industry has no subcategories — any value ok
  if (!subs.some(s => s.name === subIndustry)) {
    return `La sub-industria "${subIndustry}" no es válida para la industria "${industry}".`;
  }
  return null;
}

/**
 * Resolves industryGroupSlug for a given industry name using keyword matching
 * against the active industry_groups table. Updates the business immediately at write-time.
 * Returns null if no matching group is found.
 */
async function resolveIndustryGroupSlug(industryName: string | null | undefined): Promise<string | null> {
  if (!industryName) return null;
  const groups = await db
    .select({ slug: industryGroupsTable.slug, keywords: industryGroupsTable.keywords })
    .from(industryGroupsTable)
    .where(eq(industryGroupsTable.active, true));
  const lower = industryName.toLowerCase();
  for (const group of groups) {
    let keywords: string[] = [];
    try { keywords = JSON.parse(group.keywords) as string[]; } catch { continue; }
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) return group.slug;
  }
  return null;
}

const STARTER_NICHES = [
  { name: "Tips y consejos",         description: "Contenido educativo con tips prácticos para la audiencia objetivo del negocio.", keywords: "tips, consejos, educativo, aprendizaje" },
  { name: "Testimonios y resultados", description: "Casos de éxito, reseñas de clientes y resultados reales obtenidos.",           keywords: "testimonios, resultados, éxito, clientes" },
  { name: "Productos y servicios",    description: "Presentación de los productos, servicios y propuesta de valor del negocio.",    keywords: "productos, servicios, oferta, valor" },
];

const router = Router();

/** GET /api/businesses — list all businesses for the logged-in user */
router.get("/", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const businesses = await db.select().from(businessesTable)
      .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, true)))
      .orderBy(asc(businessesTable.sortOrder), asc(businessesTable.createdAt));
    res.json({ businesses });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener negocios" });
  }
});

/**
 * POST /api/businesses/upload-logo
 * Validates a logo image (mime check + 2MB size limit) and returns it as logoUrl.
 * Mirrors the onboarding logo upload pattern — frontend calls this endpoint, uses
 * the returned logoUrl, and falls back to the raw base64 on error.
 * Body: { imageData: "data:image/...;base64,..." }
 */
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
router.post("/upload-logo", async (req, res) => {
  try {
    const { imageData } = req.body as { imageData?: string };
    if (!imageData || !imageData.startsWith("data:image")) {
      return res.status(400).json({ error: "imageData must be a base64 image data URI" });
    }
    const b64 = imageData.split(",")[1] ?? "";
    if (Buffer.byteLength(b64, "base64") > MAX_LOGO_BYTES) {
      return res.status(413).json({ error: "Logo demasiado grande (máx 2 MB)" });
    }
    const scan = await validateBase64Mime(b64);
    if (!scan.ok) {
      return res.status(400).json({ error: `Imagen inválida: ${scan.error}` });
    }
    return res.json({ logoUrl: imageData });
  } catch {
    res.status(500).json({ error: "Error al procesar el logo" });
  }
});

/**
 * POST /api/businesses/analyze-reference-image
 * Stateless endpoint: compresses and analyzes a reference image with GPT-4o vision.
 * Does NOT store anything — just returns { base64, analysis } for the caller to collect.
 * Used by the business creation form before the business exists in the DB.
 */
router.post("/analyze-reference-image", async (req, res) => {
  try {
    const { imageDataUri } = req.body as { imageDataUri?: string };
    if (!imageDataUri || !imageDataUri.startsWith("data:image")) {
      return res.status(400).json({ error: "Se requiere imageDataUri (data URI de imagen)" });
    }

    const sharp = (await import("sharp")).default;
    const { analyzeReferenceImage } = await import("../services/ai.service.js");

    const REFERENCE_IMAGE_MAX_SIZE = 768;
    const base64Data = imageDataUri.split(",")[1] ?? "";
    const inputBuffer = Buffer.from(base64Data, "base64");

    let compressedBase64: string;
    try {
      const compressedBuffer = await sharp(inputBuffer)
        .resize(REFERENCE_IMAGE_MAX_SIZE, REFERENCE_IMAGE_MAX_SIZE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      compressedBase64 = `data:image/jpeg;base64,${compressedBuffer.toString("base64")}`;
    } catch {
      return res.status(400).json({ error: "No se pudo procesar la imagen. Asegúrate de que sea una imagen válida." });
    }

    let analysis = "";
    try {
      analysis = await analyzeReferenceImage(compressedBase64) ?? "";
    } catch {
      // Analysis is non-fatal — image is still useful without text description
    }

    return res.json({ base64: compressedBase64, analysis, addedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: "Error al analizar imagen" });
  }
});

/** POST /api/businesses — create a new business */
router.post("/", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { name, industry, subIndustry, subIndustries: rawSubIndustriesPost, description,
      brandTone, audienceDescription, defaultLocation,
      primaryColor, secondaryColor, logoUrl, brandFont, website, referenceImages,
    } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "El nombre del negocio es obligatorio" });

    // Normalize subIndustries array (multi-select); derive legacy subIndustry from first element
    const subIndustriesArrPost: string[] | undefined = rawSubIndustriesPost !== undefined
      ? (Array.isArray(rawSubIndustriesPost) ? rawSubIndustriesPost.filter((s: unknown) => typeof s === "string" && (s as string).trim()) : undefined)
      : undefined;
    const resolvedSubIndustryPost = subIndustriesArrPost !== undefined
      ? (subIndustriesArrPost[0]?.trim() ?? null)
      : (subIndustry?.trim() ?? null);

    // Validate logo if provided as base64 data URL
    if (typeof logoUrl === "string" && logoUrl.startsWith("data:")) {
      const b64 = logoUrl.split(",")[1] ?? "";
      const scan = await validateBase64Mime(b64);
      if (!scan.ok) return res.status(400).json({ error: `logoUrl inválido: ${scan.error}` });
    }

    // Check how many businesses the plan allows (base limit + paid extra slots for this user)
    const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)).limit(1);
    const plan = sub?.plan ?? "free";
    const [planDef] = await db.select().from(plansTable).where(eq(plansTable.key, plan));
    const extraSlots = sub?.extraBusinessSlots ?? 0;
    // Prefer the locked snapshot (what the user paid for); fall back to live plansTable for old subs
    const effectiveBizAllowed = sub?.lockedPlanConfig?.businessesAllowed ?? planDef?.businessesAllowed ?? 1;
    const maxBusinesses = effectiveBizAllowed + extraSlots;

    const existingCount = await db.$count(businessesTable,
      and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, true))
    );
    if (existingCount >= maxBusinesses) {
      // Agency/Business plans: offer paid extra business slot instead of hard block
      if ((plan === "agency" || plan === "business") && planDef && planDef.extraBusinessPriceUsd > 0) {
        const trm = await getCurrentTrm();
        return res.status(402).json({
          error: "Has alcanzado el límite de negocios de tu plan. Puedes agregar uno más por un pago adicional.",
          needsPayment: true,
          priceUsd: planDef.extraBusinessPriceUsd,
          priceCop:  computeCopPrice(planDef.extraBusinessPriceUsd, trm),
          priceAnnualUsd: planDef.extraBusinessPriceAnnualUsd ?? 0,
          priceAnnualCop: planDef.extraBusinessPriceAnnualUsd ? computeCopPrice(planDef.extraBusinessPriceAnnualUsd, trm) : 0,
          extraCredits: planDef.extraBusinessCredits ?? (plan === "agency" ? 220 : 100),
          maxBusinesses,
          plan,
        });
      }
      return res.status(403).json({
        error: `Tu plan ${planDef?.name ?? plan} permite máximo ${maxBusinesses} negocio(s). Actualiza tu plan para agregar más.`,
        maxBusinesses,
        plan,
      });
    }

    // First business created is set as default
    const isFirstBusiness = existingCount === 0;

    // Validate/sanitize sub-industry selection
    let sanitizedSubIndustriesPost = subIndustriesArrPost;
    if (subIndustriesArrPost !== undefined) {
      // Server-side catalog check: silently remove unknown entries to enforce catalog integrity
      sanitizedSubIndustriesPost = await sanitizeSubIndustriesArray(industry, subIndustriesArrPost);
    } else {
      const subErr = validateSubIndustry(industry, resolvedSubIndustryPost);
      if (subErr) return res.status(400).json({ error: subErr });
    }
    // Re-derive first element after sanitization
    const resolvedSubIndustryPostFinal = sanitizedSubIndustriesPost !== undefined
      ? (sanitizedSubIndustriesPost[0]?.trim() ?? null)
      : resolvedSubIndustryPost;

    // Resolve industryGroupSlug at write-time (no waiting for next startup backfill)
    const industryGroupSlug = await resolveIndustryGroupSlug(industry);

    const [business] = await db.insert(businessesTable).values({
      userId,
      name: name.trim(),
      industry: industry?.trim() ?? null,
      subIndustry: resolvedSubIndustryPostFinal,
      ...(sanitizedSubIndustriesPost !== undefined ? { subIndustries: JSON.stringify(sanitizedSubIndustriesPost) } : {}),
      description: description?.trim() ?? null,
      // Optional enrichment fields from the creation form
      ...(brandTone           ? { brandTone }                                                   : {}),
      ...(audienceDescription ? { audienceDescription }                                         : {}),
      ...(defaultLocation     ? { defaultLocation }                                             : {}),
      ...(primaryColor        ? { primaryColor }                                                : {}),
      ...(secondaryColor      ? { secondaryColor }                                              : {}),
      ...(logoUrl             ? { logoUrl }                                                     : {}),
      ...(brandFont           ? { brandFont }                                                   : {}),
      ...(website             ? { website: website || null }                                    : {}),
      ...(referenceImages     ? { referenceImages: JSON.stringify(Array.isArray(referenceImages) ? referenceImages.slice(0, 5) : []) } : {}),
      isDefault: isFirstBusiness,
      sortOrder: existingCount,
      ...(industryGroupSlug ? { industryGroupSlug } : {}),
    }).returning();

    await db.insert(nichesTable).values(
      STARTER_NICHES.map(n => ({ ...n, active: true, userId, businessId: business.id }))
    ).catch(() => {});

    res.status(201).json({ business });
  } catch (err) {
    res.status(500).json({ error: "Error al crear negocio" });
  }
});

/** PUT /api/businesses/:id — update a business */
const updateBusinessHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    const { name, industry, subIndustry, subIndustries: rawSubIndustries, description, slogan, brandTone, audienceDescription, defaultLocation,
      chatbotKnowledge, logoUrl, logoUrls, primaryColor, secondaryColor,
      defaultSignatureText, defaultShowSignature, brandFont, brandTextStyle, website, referenceImages, country, timezone } = req.body;

    // Normalize subIndustries: accepts string[] from frontend or legacy string
    const subIndustriesArray: string[] | undefined = rawSubIndustries !== undefined
      ? (Array.isArray(rawSubIndustries) ? rawSubIndustries.filter((s: unknown) => typeof s === "string" && s.trim()) : undefined)
      : undefined;
    // Derive legacy subIndustry from array (first element) for backward compat
    const resolvedSubIndustry = subIndustriesArray !== undefined
      ? (subIndustriesArray[0]?.trim() ?? null)
      : subIndustry;

    const [existing] = await db.select().from(businessesTable)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)));
    if (!existing) return res.status(404).json({ error: "Negocio no encontrado" });

    // Si logoUrl contiene un data URL base64, validar los magic bytes antes de persistir
    if (typeof logoUrl === "string" && logoUrl.startsWith("data:")) {
      const b64 = logoUrl.split(",")[1] ?? "";
      const scan = await validateBase64Mime(b64);
      if (!scan.ok) {
        return res.status(400).json({ error: `logoUrl inválido: ${scan.error}` });
      }
    }

    // Validate country against allowed LATAM + Spain whitelist (if provided)
    if (country !== undefined && country !== null && country !== "") {
      const ALLOWED_COUNTRIES = new Set([
        "CO","MX","AR","ES","PE","CL","VE","EC","BO","PY","UY","CR","PA","DO","GT","HN","SV","NI","CU","PR",
      ]);
      if (!ALLOWED_COUNTRIES.has(String(country))) {
        return res.status(400).json({ error: `País no válido: ${country}. Use uno de: CO, MX, AR, ES, PE, CL, VE, EC, BO, PY, UY, CR, PA, DO, GT, HN, SV, NI, CU, PR` });
      }
    }

    // Validate business timezone (IANA string) if provided
    const VALID_BIZ_TIMEZONES = new Set([
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
    if (timezone !== undefined && timezone !== null && timezone !== "") {
      if (!VALID_BIZ_TIMEZONES.has(String(timezone))) {
        return res.status(400).json({ error: `Zona horaria no válida: ${timezone}` });
      }
    }

    // Validate/sanitize sub-industry selection
    const effectiveIndustry = industry !== undefined ? industry : existing.industry;
    let sanitizedSubIndustriesArray = subIndustriesArray;
    if (subIndustriesArray !== undefined) {
      // Server-side catalog check: silently remove unknown entries to enforce catalog integrity
      sanitizedSubIndustriesArray = await sanitizeSubIndustriesArray(effectiveIndustry, subIndustriesArray);
    } else {
      const effectiveSubIndustry = resolvedSubIndustry !== undefined ? (resolvedSubIndustry || null) : existing.subIndustry;
      const subErr = validateSubIndustry(effectiveIndustry, effectiveSubIndustry);
      if (subErr) return res.status(400).json({ error: subErr });
    }
    // Re-derive first element after sanitization
    const resolvedSubIndustryFinal = sanitizedSubIndustriesArray !== undefined
      ? (sanitizedSubIndustriesArray[0]?.trim() ?? null)
      : resolvedSubIndustry;

    // Resolve industryGroupSlug at write-time when industry is being updated
    let industryGroupSlugUpdate: Record<string, string | null> = {};
    if (industry !== undefined) {
      const newSlug = await resolveIndustryGroupSlug(industry);
      industryGroupSlugUpdate = { industryGroupSlug: newSlug };
    }

    const [updated] = await db.update(businessesTable)
      .set({
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(industry !== undefined ? { industry } : {}),
        ...(resolvedSubIndustryFinal !== undefined ? { subIndustry: resolvedSubIndustryFinal } : subIndustry !== undefined ? { subIndustry: subIndustry || null } : {}),
        ...(sanitizedSubIndustriesArray !== undefined ? { subIndustries: JSON.stringify(sanitizedSubIndustriesArray) } : {}),
        ...industryGroupSlugUpdate,
        ...(description !== undefined ? { description } : {}),
        ...(slogan !== undefined ? { slogan: typeof slogan === "string" ? slogan.slice(0, 150) : slogan } : {}),
        ...(brandTone !== undefined ? { brandTone } : {}),
        ...(audienceDescription !== undefined ? { audienceDescription } : {}),
        ...(defaultLocation !== undefined ? { defaultLocation } : {}),
        ...(chatbotKnowledge !== undefined ? { chatbotKnowledge } : {}),
        ...(logoUrl !== undefined ? { logoUrl } : {}),
        ...(primaryColor !== undefined ? { primaryColor } : {}),
        ...(secondaryColor !== undefined ? { secondaryColor } : {}),
        ...(defaultSignatureText !== undefined ? { defaultSignatureText: defaultSignatureText === "" ? null : defaultSignatureText } : {}),
        ...(defaultShowSignature !== undefined ? { defaultShowSignature: Boolean(defaultShowSignature) } : {}),
        ...(brandFont !== undefined ? { brandFont } : {}),
        ...(brandTextStyle !== undefined
          ? { brandTextStyle: brandTextStyle || null }
          : {}),
        ...(logoUrls !== undefined ? { logoUrls } : {}),
        ...(website !== undefined ? { website: website || null } : {}),
        ...(country !== undefined ? { country: country || null } : {}),
        ...(timezone !== undefined ? { timezone: timezone || null } : {}),
        ...(referenceImages !== undefined ? {
        referenceImages: (() => {
          const imgs = Array.isArray(referenceImages) ? referenceImages : [];
          const clamped = imgs.slice(0, 5);
          return JSON.stringify(clamped);
        })(),
      } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)))
      .returning();

    // Invalidar caché de ai_context si la industria cambió (sincronización: perfil → IA)
    if (industry !== undefined) {
      invalidateIndustryContextCache(industry);
    }

    auditLog({
      userId,
      businessId: id,
      action: AuditAction.BUSINESS_CONFIG_UPDATED,
      entityType: "business",
      entityId: id,
      metadata: { fields: Object.keys(req.body).filter(k => req.body[k] !== undefined) },
      req,
    });

    res.json({ business: updated });
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar negocio" });
  }
};

router.put("/:id", updateBusinessHandler);
router.patch("/:id", updateBusinessHandler);

/** POST /api/businesses/:id/set-active — switch the active/default business */
router.post("/:id/set-active", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);

    const [target] = await db.select().from(businessesTable)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)));
    if (!target) return res.status(404).json({ error: "Negocio no encontrado" });

    // Clear all isDefault flags for this user
    await db.update(businessesTable)
      .set({ isDefault: false })
      .where(eq(businessesTable.userId, userId));

    // Set the selected one as default
    await db.update(businessesTable)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)));

    res.json({ success: true, activeBusinessId: id });
  } catch (err) {
    res.status(500).json({ error: "Error al cambiar negocio activo" });
  }
});

/**
 * POST /api/businesses/:id/send-delete-code
 * Sends a 6-digit OTP via email for OAuth users (no password, no TOTP) who need
 * to confirm business deletion. Rate-limited to 1 per 60 s.
 */
router.post("/:id/send-delete-code", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const bizId = Number(req.params.id);
    if (!bizId || isNaN(bizId)) return res.status(400).json({ error: "ID inválido" });

    const key = `${userId}:${bizId}`;
    const lastSent = bizDeleteOtpRateLimit.get(key) ?? 0;
    const now = Date.now();
    if (now - lastSent < BIZ_DELETE_OTP_COOLDOWN_MS) {
      const wait = Math.ceil((BIZ_DELETE_OTP_COOLDOWN_MS - (now - lastSent)) / 1000);
      return res.status(429).json({ error: `Espera ${wait} segundos antes de solicitar otro código.`, retryAfterSeconds: wait });
    }

    const [userRow] = await db
      .select({ email: usersTable.email, passwordHash: usersTable.passwordHash, totpEnabled: usersTable.totpEnabled })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!userRow) return res.status(404).json({ error: "Usuario no encontrado" });
    if (userRow.passwordHash || userRow.totpEnabled) {
      return res.status(400).json({ error: "Este endpoint es solo para cuentas OAuth sin contraseña ni 2FA" });
    }

    const [biz] = await db.select({ name: businessesTable.name })
      .from(businessesTable).where(and(eq(businessesTable.id, bizId), eq(businessesTable.userId, userId))).limit(1);
    if (!biz) return res.status(404).json({ error: "Negocio no encontrado" });

    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const expiry = new Date(now + BIZ_DELETE_OTP_EXPIRY_MS);
    bizDeleteOtpStore.set(key, { hash: sha256hex(otp), expiry });
    bizDeleteOtpRateLimit.set(key, now);

    const emailResult = await sendBizDeleteOtpEmail(userRow.email, biz.name, otp);
    if (!emailResult.ok) {
      bizDeleteOtpStore.delete(key);
      bizDeleteOtpRateLimit.delete(key);
      return res.status(502).json({ error: "No se pudo enviar el código. Intenta de nuevo." });
    }

    return res.json({ success: true, sentTo: userRow.email.replace(/(.{2}).+(@.+)/, "$1***$2") });
  } catch {
    res.status(500).json({ error: "Error al enviar código" });
  }
});

/**
 * DELETE /api/businesses/:id — deactivate (or hard-delete if no posts) a business.
 *
 * Security verification (one of the following, in priority order):
 *   1. password + TOTP (if user has TOTP enabled)
 *   2. password only (if user has no TOTP)
 *   3. emailCode (if user is OAuth without password/TOTP — must call send-delete-code first)
 *
 * Behavior:
 *   - If business has 0 posts: hard-deletes the row from the DB.
 *   - If business has any posts: soft-deactivates (is_active=false), data preserved.
 *   - Rejects if this is the user's only active business.
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const { confirmPassword, totpCode, emailCode } = req.body as {
      confirmPassword?: string;
      totpCode?: string;
      emailCode?: string;
    };

    const [userRow] = await db
      .select({ email: usersTable.email, passwordHash: usersTable.passwordHash, totpEnabled: usersTable.totpEnabled, totpSecret: usersTable.totpSecret })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!userRow) return res.status(404).json({ error: "Usuario no encontrado" });

    const hasPassword = !!userRow.passwordHash;
    const hasTotp = !!(userRow.totpEnabled && userRow.totpSecret);
    const isOAuthOnly = !hasPassword && !hasTotp;

    if (isOAuthOnly) {
      // — Email OTP path (OAuth users without password or TOTP) —
      if (!emailCode) return res.status(400).json({ error: "EMAIL_CODE_REQUIRED", message: "Solicita un código de verificación por correo para continuar." });
      const key = `${userId}:${id}`;
      const stored = bizDeleteOtpStore.get(key);
      if (!stored) return res.status(400).json({ error: "No hay un código activo. Solicita uno nuevo." });
      if (new Date() > stored.expiry) {
        bizDeleteOtpStore.delete(key);
        return res.status(400).json({ error: "El código expiró. Solicita uno nuevo." });
      }
      if (sha256hex(emailCode) !== stored.hash) return res.status(401).json({ error: "Código de verificación incorrecto." });
      bizDeleteOtpStore.delete(key);
    } else if (hasTotp && !hasPassword) {
      // — TOTP-only path (has 2FA but no password, e.g., OAuth user who enabled TOTP) —
      if (!totpCode) return res.status(400).json({ error: "TOTP_REQUIRED", message: "Ingresa el código de Google Authenticator para continuar." });
      let secret: string;
      try { secret = decryptToken(userRow.totpSecret!); }
      catch { return res.status(500).json({ error: "Error interno de verificación 2FA." }); }
      const valid = verifySync({ token: totpCode, secret, window: 2 }) as unknown as boolean;
      if (!valid) return res.status(401).json({ error: "Código de Google Authenticator incorrecto." });
    } else {
      // — Password (+ optional TOTP) path —
      if (!confirmPassword) return res.status(400).json({ error: "Debes confirmar tu contraseña para desactivar un negocio." });
      const validPassword = await comparePassword(confirmPassword, userRow.passwordHash!);
      if (!validPassword) return res.status(401).json({ error: "Contraseña incorrecta." });
      if (hasTotp) {
        if (!totpCode) return res.status(400).json({ error: "TOTP_REQUIRED", message: "Ingresa el código de Google Authenticator." });
        let secret: string;
        try { secret = decryptToken(userRow.totpSecret!); }
        catch { return res.status(500).json({ error: "Error interno de verificación 2FA." }); }
        const valid = verifySync({ token: totpCode, secret, window: 2 }) as unknown as boolean;
        if (!valid) return res.status(401).json({ error: "Código de Google Authenticator incorrecto." });
      }
    }

    // — Business validation —
    const [existing] = await db.select().from(businessesTable)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)));
    if (!existing) return res.status(404).json({ error: "Negocio no encontrado" });

    if (existing.isActive) {
      // Cannot inactivate the last active business
      const activeCount = await db.$count(businessesTable,
        and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, true))
      );
      if (activeCount <= 1) {
        return res.status(400).json({ error: "No puedes desactivar tu único negocio activo. Crea otro negocio primero o contacta a soporte." });
      }
    }

    // Count posts associated with this business to decide soft vs hard delete
    const [postCountRow] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(postsTable)
      .where(and(eq(postsTable.businessId, id), eq(postsTable.userId, userId)));
    const postCount = postCountRow?.cnt ?? 0;

    let message: string;

    if (postCount === 0) {
      // Hard-delete: no posts exist, no recoverable data — remove row completely
      await db.delete(businessesTable)
        .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)));

      // Preserve invariant: at least one active default business per user
      if (existing.isDefault) {
        const [next] = await db.select().from(businessesTable)
          .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, true)))
          .orderBy(asc(businessesTable.sortOrder))
          .limit(1);
        if (next) {
          await db.update(businessesTable)
            .set({ isDefault: true })
            .where(eq(businessesTable.id, next.id));
        }
      }
      message = `"${existing.name}" eliminado permanentemente (no tenía publicaciones).`;
    } else {
      // Soft-delete: posts exist — mark inactive, data preserved for future reactivation
      await db.update(businessesTable)
        .set({ isActive: false, isDefault: false, updatedAt: new Date() })
        .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)));

      // If it was the default active business, promote the next active one
      if (existing.isDefault && existing.isActive) {
        const [next] = await db.select().from(businessesTable)
          .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, true)))
          .orderBy(asc(businessesTable.sortOrder))
          .limit(1);
        if (next) {
          await db.update(businessesTable)
            .set({ isDefault: true })
            .where(eq(businessesTable.id, next.id));
        }
      }
      message = `"${existing.name}" desactivado. Sus ${postCount} publicaciones y datos se conservan. Puedes reactivarlo cuando tengas un slot disponible.`;
    }

    await auditLog({
      userId,
      businessId: id,
      action: AuditAction.BUSINESS_DELETED,
      entityType: "business",
      entityId: id,
      metadata: { businessName: existing.name, wasDefault: existing.isDefault, wasActive: existing.isActive, postCount, hardDeleted: postCount === 0 },
      req,
    });

    res.json({ success: true, message, hardDeleted: postCount === 0, postCount });
  } catch {
    res.status(500).json({ error: "Error al eliminar negocio" });
  }
});

/** GET /api/businesses/inactive — list inactive businesses for the logged-in user */
router.get("/inactive", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const businesses = await db.select({
      id: businessesTable.id,
      name: businessesTable.name,
      industry: businessesTable.industry,
      subIndustry: businessesTable.subIndustry,
      description: businessesTable.description,
      logoUrl: businessesTable.logoUrl,
      isActive: businessesTable.isActive,
      isDefault: businessesTable.isDefault,
      updatedAt: businessesTable.updatedAt,
    })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, false)))
      .orderBy(asc(businessesTable.updatedAt));
    res.json({ businesses });
  } catch {
    res.status(500).json({ error: "Error al obtener negocios inactivos" });
  }
});

/** POST /api/businesses/:id/reactivate — reactivate an inactive business if a slot is available */
router.post("/:id/reactivate", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    // Verify ownership (any is_active state — we're reactivating)
    const [biz] = await db.select().from(businessesTable)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)))
      .limit(1);
    if (!biz) return res.status(404).json({ error: "Negocio no encontrado" });
    if (biz.isActive) return res.status(400).json({ error: "El negocio ya está activo" });

    // Check slot availability: COUNT(activos) < plan.businessesAllowed + extra_business_slots
    const [sub] = await db.select({
      plan: subscriptionsTable.plan,
      extraBusinessSlots: subscriptionsTable.extraBusinessSlots,
      lockedPlanConfig: subscriptionsTable.lockedPlanConfig,
    })
      .from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
      .limit(1);

    const [planDef] = sub?.plan
      ? await db.select().from(plansTable).where(eq(plansTable.key, sub.plan)).limit(1)
      : [];

    const extraSlots = sub?.extraBusinessSlots ?? 0;
    // Prefer the locked snapshot (what the user paid for); fall back to live plansTable for old subs
    const effectiveReactivateBizAllowed = sub?.lockedPlanConfig?.businessesAllowed ?? planDef?.businessesAllowed ?? 1;
    const maxBusinesses = effectiveReactivateBizAllowed + extraSlots;

    const [activeCount] = await db
      .select({ val: count() })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, true)));

    if ((activeCount?.val ?? 0) >= maxBusinesses) {
      const trm = await getCurrentTrm();
      const extraPriceUsd = planDef?.extraBusinessPriceUsd ?? 0;
      const extraPriceCop = computeCopPrice(extraPriceUsd, trm);
      return res.status(402).json({
        error: "NO_SLOT_AVAILABLE",
        message: `Ya tienes ${activeCount?.val ?? 0} negocios activos (límite de tu plan: ${maxBusinesses}). Compra un slot adicional para reactivar este negocio.`,
        extraSlotPriceUsd: extraPriceUsd,
        extraSlotPriceCop: extraPriceCop,
      });
    }

    await db.update(businessesTable)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)));

    await auditLog({
      userId,
      businessId: id,
      action: AuditAction.BUSINESS_REACTIVATED,
      entityType: "business",
      entityId: id,
      metadata: { businessName: biz.name },
      req,
    });

    res.json({ success: true, message: `"${biz.name}" reactivado correctamente.` });
  } catch {
    res.status(500).json({ error: "Error al reactivar negocio" });
  }
});

/** POST /api/businesses/:id/analyze-website — analyze a business's website with AI */
router.post("/:id/analyze-website", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") return res.status(400).json({ error: "URL requerida" });

    // Verify ownership — the business must belong to the authenticated user
    const [biz] = await db.select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId), eq(businessesTable.isActive, true)))
      .limit(1);
    if (!biz) return res.status(403).json({ error: "Negocio no encontrado o sin permiso" });

    const result = await analyzeWebsite(url);
    return res.json(result);
  } catch {
    return res.json({ description: null, audience: null, tone: null, primaryColor: null });
  }
});

/** GET /api/businesses/:id/auto-gen — get auto-generation settings for a business */
router.get("/:id/auto-gen", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const [biz] = await db
      .select({
        autoGenerationEnabled: businessesTable.autoGenerationEnabled,
        generationFrequency: businessesTable.generationFrequency,
        name: businessesTable.name,
      })
      .from(businessesTable)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId), eq(businessesTable.isActive, true)))
      .limit(1);

    if (!biz) return res.status(403).json({ error: "Negocio no encontrado o sin permiso" });

    return res.json({
      autoGenerationEnabled: biz.autoGenerationEnabled,
      generationFrequency: biz.generationFrequency,
      businessName: biz.name,
    });
  } catch {
    return res.status(500).json({ error: "Error al obtener configuración" });
  }
});

/** PUT /api/businesses/:id/auto-gen — update auto-generation settings for a business */
router.put("/:id/auto-gen", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const { autoGenerationEnabled, generationFrequency } = req.body as {
      autoGenerationEnabled?: boolean;
      generationFrequency?: string;
    };

    const [biz] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId), eq(businessesTable.isActive, true)))
      .limit(1);

    if (!biz) return res.status(403).json({ error: "Negocio no encontrado o sin permiso" });

    if (generationFrequency !== undefined && !["7", "15", "30"].includes(generationFrequency)) {
      return res.status(400).json({ error: "Frecuencia inválida — valores permitidos: '7', '15', '30'" });
    }

    const patch: Partial<typeof businessesTable.$inferInsert> = { updatedAt: new Date() };
    if (typeof autoGenerationEnabled === "boolean") patch.autoGenerationEnabled = autoGenerationEnabled;
    if (generationFrequency) patch.generationFrequency = generationFrequency;

    const [updated] = await db
      .update(businessesTable)
      .set(patch)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)))
      .returning({
        autoGenerationEnabled: businessesTable.autoGenerationEnabled,
        generationFrequency: businessesTable.generationFrequency,
        name: businessesTable.name,
      });

    return res.json({
      autoGenerationEnabled: updated.autoGenerationEnabled,
      generationFrequency: updated.generationFrequency,
      businessName: updated.name,
    });
  } catch {
    return res.status(500).json({ error: "Error al guardar configuración" });
  }
});

/** PUT /api/businesses/auto-gen/disable-all — disable auto-generation for ALL active businesses of the current user.
 *  NOTE: Must be declared before /:id so "disable-all" isn't captured as a business id.
 */
router.put("/auto-gen/disable-all", async (req, res) => {
  try {
    const userId = req.user!.userId;

    const updated = await db
      .update(businessesTable)
      .set({ autoGenerationEnabled: false, updatedAt: new Date() })
      .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, true)))
      .returning({ id: businessesTable.id });

    return res.json({ disabled: updated.length });
  } catch {
    return res.status(500).json({ error: "Error al deshabilitar la auto-generación" });
  }
});

/** GET /api/businesses/:id — get a single business by id (must belong to the authenticated user).
 *  IMPORTANT: Placed last so static routes (/inactive, /analyze-website, etc.) match before /:id.
 */
router.get("/:id", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const [biz] = await db.select().from(businessesTable)
      .where(and(eq(businessesTable.id, id), eq(businessesTable.userId, userId)))
      .limit(1);
    if (!biz) return res.status(404).json({ error: "Negocio no encontrado" });
    return res.json({ business: biz });
  } catch {
    return res.status(500).json({ error: "Error al obtener el negocio" });
  }
});

export default router;
