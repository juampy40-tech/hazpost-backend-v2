import { Router, type IRouter } from "express";
import express from "express";
import healthRouter from "./health.js";
import nichesRouter from "./social/niches.js";
import { captionAddonsRouter } from "./social/caption-addons.js";
import postsRouter from "./social/posts.js";
import socialAccountsRouter from "./social/social-accounts.js";
import publishLogRouter from "./social/publish-log.js";
import settingsRouter from "./social/settings.js";
import oauthRouter from "./social/oauth.js";
import storageRouter from "./storage.js";
import analyticsRouter from "./social/analytics.js";
import backgroundsRouter from "./social/backgrounds.js";
import mediaRouter from "./social/media.js";
import reelsRouter from "./social/reels.js";
import musicRouter from "./music.js";
import landingsRouter from "./social/landings.js";
import brandRouter from "./brand.js";
import brandProfileRouter from "./brand-profile.js";
import locationsRouter from "./social/locations.js";
import userRouter from "./user.js";
import googleAuthRouter from "./auth-google.js";
import billingRouter from "./billing.js";
import fontsRouter from "./fonts.js";
import publishingScheduleRouter from "./social/publishing-schedule.js";
import chatbotRouter from "./chatbot.js";
import totpRouter from "./auth-totp.js";
import businessesRouter from "./businesses.js";
import adminPlansRouter from "./admin/plans.js";
import adminMetricsRouter from "./admin/metrics.js";
import adminAffiliatesRouter from "./admin/affiliates.js";
import adminAuditRouter from "./admin/audit.js";
import adminBackgroundsMasterRouter from "./admin/backgrounds-master.js";
import adminIndustryGroupsRouter from "./admin/industry-groups.js";
import adminUserStatsRouter from "./admin/user-stats.js";
import adminAffiliateCodesRouter from "./admin/affiliate-codes.js";
import adminReferralsRouter from "./admin/referrals-settings.js";
import adminBenefitCatalogRouter from "./admin/benefit-catalog.js";
import adminVouchersRouter from "./admin/vouchers.js";
import adminAffiliateSettingsRouter from "./admin/affiliate-settings.js";
import adminHazpostBackendRouter from "./admin/hazpost-backend.js";
import adminContentTemplatesRouter from "./admin/content-templates.js";
import contentTemplatesRouter from "./content-templates.js";
import vouchersRouter, { publicVouchersRouter } from "./vouchers.js";
import supportRouter from "./support.js";
import alertsRouter from "./alerts.js";
import billingPackagesRouter from "./billing/packages.js";
import referralsRouter from "./referrals.js";
import affiliatesRouter from "./affiliates.js";
import creditsRouter from "./social/credits.js";
import analyzeWebsiteRouter from "./analyze-website.js";
import elementsRouter from "./elements.js";
import compositionPresetsRouter from "./composition-presets.js";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { authRateLimit, aiGenerationRateLimit, forgotPasswordRateLimit, chatbotRateLimit, totpRateLimit } from "../lib/rateLimits.js";
import { INDUSTRY_CATALOG } from "../lib/industries.js";
import type { IndustryAiContext } from "../lib/industries.js";
import { invalidateIndustryContextCache } from "../lib/industryAiContext.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { plansTable, appSettingsTable, planBenefitCatalogTable, customIndustriesTable, customSubIndustriesTable } from "@workspace/db";
import { asc, eq as drizzleEq, inArray as drizzleInArray } from "drizzle-orm";
import { DEFAULT_COSTS } from "../lib/creditCosts.js";
import { getCurrentTrm, computeCopPrice } from "../services/trm.service.js";

// Scoped large-body middleware: only applied to upload-heavy routes.
// Keeps the global limit small (10mb in app.ts) to limit DoS surface.
const uploadBodyParser = express.json({ limit: "120mb" });

const router: IRouter = Router();

// Public routes — no auth required
// Rate-limit auth endpoints to slow brute-force and credential-stuffing attacks.
router.post("/user/login", authRateLimit);
router.post("/user/register", authRateLimit);
router.post("/auth/login", authRateLimit);
router.post("/auth/register", authRateLimit);
router.post("/user/forgot-password", forgotPasswordRateLimit);
router.post("/auth/forgot-password", forgotPasswordRateLimit);
router.use("/user", userRouter);      // login, register, bootstrap (legacy path)
router.use("/users", userRouter);     // /api/users/me (REST-canonical path)
router.use("/auth", oauthRouter);     // OAuth flow (Meta, TikTok)
router.use("/auth", googleAuthRouter); // Google OAuth flow
router.use("/auth", userRouter);      // /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/me (standard path)
router.use(healthRouter);             // health checks

// Music — admin-only mutation routes use requireAdmin internally; no global requireAuth needed
// because GET /music/* (list, stream, file) must be accessible in the browser without auth.
router.use("/music", musicRouter);
router.use("/analyze-website", analyzeWebsiteRouter);

/** Resolve a plan feature entry into a display text string using the benefit catalog.
 *  Returns null if the feature is disabled or resolves to an empty string.
 */
function resolvePublicFeatureText(
  f: unknown,
  catalogMap: Map<string, { labelTemplate: string; hasValue: boolean; isAuto: boolean }>,
  autoValues: Record<string, string> = {}
): string | null {
  if (!f || typeof f !== "object") return typeof f === "string" && (f as string).trim() ? (f as string) : null;
  const obj = f as Record<string, unknown>;
  if (typeof obj.catalogKey === "string") {
    if (obj.enabled === false) return null;
    const cat = catalogMap.get(obj.catalogKey);
    if (!cat) return typeof obj.text === "string" && obj.text ? obj.text : null;
    const val = cat.isAuto
      ? (autoValues[obj.catalogKey] ?? (typeof obj.value === "string" ? obj.value : ""))
      : (typeof obj.value === "string" ? obj.value : "");
    return cat.labelTemplate.replace("{value}", val).trim() || null;
  }
  if (obj.enabled === false) return null;
  return typeof obj.text === "string" && obj.text ? obj.text : null;
}

// Public plans endpoint — no auth required; used by registration page and public pricing.
router.get("/plans", async (_req, res) => {
  try {
    const costKeys = ["credit_cost_image", "credit_cost_story", "credit_cost_carousel", "credit_cost_reel", "credit_cost_element_ai", "credit_pack_price_usd", "credit_pack_credits"];
    const [plans, costRows, trm, catalogRows] = await Promise.all([
      db.select().from(plansTable).where(drizzleEq(plansTable.isActive, true)).orderBy(asc(plansTable.sortOrder)),
      db.select().from(appSettingsTable).where(drizzleInArray(appSettingsTable.key, costKeys)),
      getCurrentTrm(),
      db.select().from(planBenefitCatalogTable).orderBy(asc(planBenefitCatalogTable.sortOrder)),
    ]);

    const cm: Record<string, number> = {};
    for (const r of costRows) cm[r.key] = Number(r.value);
    const creditCosts = {
      image:     isFinite(cm["credit_cost_image"])       ? cm["credit_cost_image"]       : DEFAULT_COSTS.image,
      story:     isFinite(cm["credit_cost_story"])       ? cm["credit_cost_story"]       : DEFAULT_COSTS.story,
      carousel:  isFinite(cm["credit_cost_carousel"])    ? cm["credit_cost_carousel"]    : DEFAULT_COSTS.carousel,
      reel:      isFinite(cm["credit_cost_reel"])        ? cm["credit_cost_reel"]        : DEFAULT_COSTS.reel,
      elementAi: isFinite(cm["credit_cost_element_ai"]) ? cm["credit_cost_element_ai"] : DEFAULT_COSTS.elementAi,
    };

    const catalogMap = new Map(catalogRows.map(c => [c.key, c]));

    const plansWithCop = plans.map(p => {
      const autoValues: Record<string, string> = {
        ai_credits:           String(p.creditsPerMonth),
        reels_per_month:      String(p.reelsPerMonth),
        businesses:           String(p.businessesAllowed),
        extra_business_addon: p.extraBusinessPriceUsd && p.extraBusinessPriceUsd > 0
          ? `$${p.extraBusinessPriceUsd.toFixed(2)} USD/mes`
          : "",
      };
      const rawFeatures = (p.descriptionJson as { features?: unknown[] } | null)?.features ?? [];
      // Try catalog-based features first (enabled only). If none are enabled, fall back to
      // legacy text entries so the landing always shows meaningful content.
      const enabledCatalogFeatures = rawFeatures
        .filter(f => f && typeof f === "object" && typeof (f as Record<string, unknown>).catalogKey === "string"
          && (f as Record<string, unknown>).enabled !== false)
        .map(f => resolvePublicFeatureText(f, catalogMap, autoValues))
        .filter((t): t is string => t !== null && t.length > 0);

      const resolvedFeatures = enabledCatalogFeatures.length > 0
        ? enabledCatalogFeatures
        : rawFeatures
            .filter(f => !f || typeof f !== "object" || typeof (f as Record<string, unknown>).catalogKey !== "string")
            .map(f => resolvePublicFeatureText(f, catalogMap, autoValues))
            .filter((t): t is string => t !== null && t.length > 0);
      return {
        ...p,
        extraBusinessPriceCop: computeCopPrice(p.extraBusinessPriceUsd, trm),
        resolvedFeatures,
      };
    });

    const creditPack = {
      priceUsd: isFinite(cm["credit_pack_price_usd"]) && cm["credit_pack_price_usd"] > 0 ? cm["credit_pack_price_usd"] : 0,
      credits:  isFinite(cm["credit_pack_credits"])   && cm["credit_pack_credits"]   > 0 ? cm["credit_pack_credits"]   : 0,
    };

    res.json({ plans: plansWithCop, creditCosts, creditPack });
  } catch {
    res.status(500).json({ error: "Error al obtener planes" });
  }
});

// 1-hour in-memory cache for GET /api/industries.
// Invalidated on every successful custom industry or custom sub-industry insert.
let industriesCachePayload: unknown | null = null;
let industriesCacheAt = 0;
const INDUSTRIES_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export function invalidateIndustriesCache() {
  industriesCachePayload = null;
  industriesCacheAt = 0;
}

// Public industries catalog — no auth required; used by registration, settings, and AI pipeline.
// Merges static catalog + approved custom industries as top-level entries.
// Also merges approved custom sub-industries into each industry's subcategory list.
router.get("/industries", async (_req, res) => {
  // Serve from cache when fresh
  if (industriesCachePayload && Date.now() - industriesCacheAt < INDUSTRIES_CACHE_TTL_MS) {
    return res.json(industriesCachePayload);
  }
  try {
    const [customRows, customSubRows] = await Promise.all([
      db.select({ name: customIndustriesTable.name, slug: customIndustriesTable.slug })
        .from(customIndustriesTable)
        .where(drizzleEq(customIndustriesTable.status, "approved")),
      db.select({ industryName: customSubIndustriesTable.industryName, name: customSubIndustriesTable.name, slug: customSubIndustriesTable.slug })
        .from(customSubIndustriesTable)
        .where(drizzleEq(customSubIndustriesTable.status, "approved")),
    ]);

    // Build a map of industry_name → custom sub-industries
    const customSubMap = new Map<string, { name: string; slug: string }[]>();
    for (const r of customSubRows) {
      const arr = customSubMap.get(r.industryName) ?? [];
      arr.push({ name: r.name, slug: r.slug });
      customSubMap.set(r.industryName, arr);
    }

    // Merge custom sub-industries into static catalog entries
    const mergedCatalog = INDUSTRY_CATALOG.map(entry => {
      const extraSubs = customSubMap.get(entry.name) ?? [];
      if (extraSubs.length === 0) return entry;
      const existingSlugs = new Set(entry.subcategories.map(s => s.slug));
      const newSubs = extraSubs.filter(s => !existingSlugs.has(s.slug));
      return { ...entry, subcategories: [...entry.subcategories, ...newSubs] };
    });

    const staticNames = new Set(INDUSTRY_CATALOG.map(e => e.name.toLowerCase()));
    const uniqueCustom = customRows.filter(r => !staticNames.has(r.name.toLowerCase()));

    // Custom industries are merged as top-level selectable entries (no subcategories).
    const customEntries = uniqueCustom.map(r => ({
      name: r.name,
      slug: r.slug,
      subcategories: customSubMap.get(r.name) ?? [] as { name: string; slug: string }[],
    }));

    const payload = { industries: [...mergedCatalog, ...customEntries] };
    industriesCachePayload = payload;
    industriesCacheAt = Date.now();
    res.json(payload);
  } catch {
    res.json({ industries: INDUSTRY_CATALOG });
  }
});

// Validate and register a custom industry (campo "Otro").
// Auth required: ensures only real users add industries (not bots).
// Flow: fuzzy match → GPT real/invented check → INSERT with ai_context auto-generated.
router.post("/industries/validate-custom", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!rawName || rawName.length < 2) {
      return res.status(400).json({ error: "El nombre de la industria es requerido (mínimo 2 caracteres)." });
    }
    if (rawName.length > 120) {
      return res.status(400).json({ error: "El nombre de la industria es demasiado largo (máximo 120 caracteres)." });
    }

    const normalizedInput = rawName.toLowerCase();

    // 1. Fuzzy match against static catalog
    const allStaticNames = INDUSTRY_CATALOG.flatMap(e => [
      e.name,
      ...e.subcategories.map(s => s.name),
    ]);
    const suggestion = allStaticNames.find(n => {
      const nl = n.toLowerCase();
      return nl.includes(normalizedInput) || normalizedInput.includes(nl.substring(0, Math.min(nl.length, 8)));
    });
    if (suggestion) {
      return res.json({ action: "suggest", suggestion });
    }

    // 2. Check if custom industry already exists (case-insensitive)
    const existing = await db
      .select()
      .from(customIndustriesTable)
      .where(drizzleEq(customIndustriesTable.status, "approved"))
      .limit(200);

    const matchExisting = existing.find(r => r.name.toLowerCase() === normalizedInput);
    if (matchExisting) {
      return res.json({ action: "already_exists", industry: { name: matchExisting.name, slug: matchExisting.slug } });
    }

    // 3. GPT validation: is this a real industry?
    let isReal = false;
    let aiContext: IndustryAiContext | null = null;
    try {
      const validationResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Eres un validador de industrias y sectores económicos para una plataforma de marketing. Responde solo con JSON válido.",
          },
          {
            role: "user",
            content: `¿Es "${rawName}" una industria, sector económico o tipo de negocio real y legítimo?

Si es real, genera también un contexto para ayudar a la IA a crear mejores posts de marketing para este tipo de negocio.

Responde con este JSON exacto:
{
  "isReal": true/false,
  "reason": "breve explicación",
  "aiContext": {
    "description": "descripción breve del tipo de negocio (1-2 oraciones)",
    "content_topics": ["tema 1", "tema 2", "tema 3", "tema 4", "tema 5"],
    "recommended_tone": "descripción del tono recomendado",
    "audience": "descripción de la audiencia objetivo",
    "content_formats": ["formato 1", "formato 2", "formato 3"],
    "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
  }
}

Si isReal es false, aiContext puede ser null.`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const parsed = JSON.parse(validationResp.choices[0]?.message?.content ?? "{}") as {
        isReal?: boolean;
        reason?: string;
        aiContext?: IndustryAiContext | null;
      };
      isReal = parsed.isReal === true;
      aiContext = parsed.aiContext ?? null;
    } catch {
      return res.status(500).json({ error: "No se pudo validar la industria. Intenta de nuevo." });
    }

    if (!isReal) {
      return res.json({ action: "invalid", reason: "No reconocemos esa industria. Por favor escribe el nombre real de tu sector económico o tipo de negocio." });
    }

    // 4. Insert into custom_industries
    const slug = rawName.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 80);

    let inserted;
    try {
      [inserted] = await db
        .insert(customIndustriesTable)
        .values({
          name: rawName,
          slug,
          aiContext: aiContext ? JSON.stringify(aiContext) : null,
          status: "approved",
          suggestedBy: userId,
        })
        .onConflictDoNothing()
        .returning();
    } catch {
      return res.status(500).json({ error: "Error al registrar la industria. Intenta de nuevo." });
    }

    invalidateIndustryContextCache(rawName);
    invalidateIndustriesCache(); // Bust industries list cache so new custom industry appears immediately

    return res.json({
      action: "added",
      industry: inserted ?? { name: rawName, slug },
    });
  } catch {
    res.status(500).json({ error: "Error interno al procesar la industria." });
  }
});

// Validate and register a custom sub-industry (campo "Otro" en sub-industria).
// Auth required. Flow: exact-match → fuzzy → GPT validation → INSERT into custom_sub_industries.
/**
 * Word-overlap fuzzy: returns true only when strictly more than half of the
 * shorter name's significant words (>2 chars) appear in the other name.
 * This avoids false positives like "instalación residencial" matching
 * "instalación de cargadores para carros eléctricos" (only 1 of 2 words match → 0.5, not >0.5).
 */
function wordOverlapFuzzy(a: string, b: string): boolean {
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return false;
  const shorter = wa.length <= wb.length ? wa : wb;
  const longer  = wa.length <= wb.length ? wb : wa;
  const matches = shorter.filter(w => longer.some(lw => lw === w || lw.includes(w) || w.includes(lw)));
  return matches.length / shorter.length > 0.5;
}

router.post("/industries/validate-custom-sub", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const industryName = typeof req.body?.industryName === "string" ? req.body.industryName.trim() : "";
    const rawName = typeof req.body?.subIndustryName === "string" ? req.body.subIndustryName.trim() : "";
    const forceSkipFuzzy = req.body?.forceSkipFuzzy === true;
    if (!industryName) return res.status(400).json({ error: "industryName es requerido." });
    if (!rawName || rawName.length < 2) return res.status(400).json({ error: "El nombre de la sub-industria es requerido (mínimo 2 caracteres)." });
    if (rawName.length > 120) return res.status(400).json({ error: "El nombre es demasiado largo (máximo 120 caracteres)." });

    const normalizedInput = rawName.toLowerCase();

    // 1. Exact-match in static catalog subcategories for this industry
    const industryEntry = INDUSTRY_CATALOG.find(e => e.name === industryName);
    const staticSubs = industryEntry?.subcategories ?? [];
    const staticMatch = staticSubs.find(s => s.name.toLowerCase() === normalizedInput);
    if (staticMatch) {
      return res.json({ action: "already_exists", industry: { name: staticMatch.name, slug: staticMatch.slug } });
    }

    // 2. Fuzzy match against static sub-industries (skip if user already said "No, es diferente")
    if (!forceSkipFuzzy) {
      const staticFuzzy = staticSubs.find(s => wordOverlapFuzzy(s.name, rawName));
      if (staticFuzzy) {
        return res.json({ action: "suggest", suggestion: staticFuzzy.name });
      }
    }

    // 3. Check custom_sub_industries for this industry
    const existing = await db
      .select({ name: customSubIndustriesTable.name, slug: customSubIndustriesTable.slug })
      .from(customSubIndustriesTable)
      .where(drizzleEq(customSubIndustriesTable.industryName, industryName));

    const existingMatch = existing.find(r => r.name.toLowerCase() === normalizedInput);
    if (existingMatch) {
      return res.json({ action: "already_exists", industry: { name: existingMatch.name, slug: existingMatch.slug } });
    }

    if (!forceSkipFuzzy) {
      const existingFuzzy = existing.find(r => wordOverlapFuzzy(r.name, rawName));
      if (existingFuzzy) {
        return res.json({ action: "suggest", suggestion: existingFuzzy.name });
      }
    }

    // 4. GPT validation: is this a real sub-industry within the given parent industry?
    let isReal = false;
    let reason = "";
    let suggestedName: string | null = null;
    try {
      const validationResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Eres un validador de sub-industrias para una plataforma de marketing. Responde solo con JSON válido.",
          },
          {
            role: "user",
            content: `¿Es "${rawName}" una sub-industria o especialidad real y legítima dentro del sector "${industryName}"?

Responde con este JSON exacto:
{
  "isReal": true/false,
  "reason": "breve explicación",
  "normalizedName": "nombre normalizado en español con mayúsculas correctas, o null si no es real"
}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      const parsed = JSON.parse(validationResp.choices[0]?.message?.content ?? "{}") as {
        isReal?: boolean;
        reason?: string;
        normalizedName?: string | null;
      };
      isReal = parsed.isReal === true;
      reason = parsed.reason ?? "";
      suggestedName = parsed.normalizedName ?? null;
    } catch {
      return res.status(500).json({ error: "No se pudo validar la sub-industria. Intenta de nuevo." });
    }

    if (!isReal) {
      return res.json({ action: "invalid", reason: reason || `"${rawName}" no es una especialidad reconocida dentro de ${industryName}.` });
    }

    const finalName = suggestedName?.trim() || rawName;
    const slug = finalName.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 80);

    // 5. Insert (conflict on slug = already exists from another industry)
    const [inserted] = await db
      .insert(customSubIndustriesTable)
      .values({ industryName, name: finalName, slug, status: "approved", suggestedBy: userId })
      .onConflictDoNothing()
      .returning();

    // If insert was a no-op (slug collision from another industry's approved entry), fetch the existing row
    if (!inserted) {
      const [colliding] = await db
        .select({ name: customSubIndustriesTable.name, slug: customSubIndustriesTable.slug })
        .from(customSubIndustriesTable)
        .where(drizzleEq(customSubIndustriesTable.slug, slug));
      return res.json({
        action: "already_exists",
        industry: colliding ?? { name: finalName, slug },
      });
    }

    invalidateIndustriesCache(); // Bust industries list cache so new custom sub appears immediately

    return res.json({
      action: "added",
      industry: inserted,
    });
  } catch {
    res.status(500).json({ error: "Error interno al procesar la sub-industria." });
  }
});

// Public chatbot endpoint — no auth, called from eco-col.com WordPress
// Rate-limited to prevent abuse.
router.post("/chatbot/message", chatbotRateLimit);
router.use("/chatbot", chatbotRouter);

// TOTP 2FA routes — individual routes inside carry their own requireAuth as needed
// POST /api/auth/totp/login is intentionally public (uses short-lived pre-auth token)
// Rate-limited to prevent brute-force of 6-digit TOTP codes.
router.post("/auth/totp/login", totpRateLimit);
router.use("/auth/totp", totpRouter);

// Public temp image endpoint for Instagram publishing.
// Meta's crawlers fetch images directly — must be public, no auth.
router.get("/media/temp/:id", async (req, res) => {
  const { getTempImage } = await import("../services/instagram.service.js");
  const buffer = getTempImage(req.params.id);
  if (!buffer) return res.status(404).json({ error: "Not found or expired" });
  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "public, max-age=7200");
  res.set("Content-Length", String(buffer.length));
  return res.send(buffer);
});

// Protected routes — JWT required
router.use("/brand", requireAuth, brandRouter);
router.use("/brand-profile", requireAuth, brandProfileRouter);
router.use("/niches", requireAuth, nichesRouter);
router.use("/caption-addons", requireAuth, captionAddonsRouter);
router.use("/backgrounds", requireAuth, uploadBodyParser, backgroundsRouter);
router.use("/media", requireAuth, uploadBodyParser, mediaRouter);
// Rate-limit AI generation routes (posts) per-user to limit AI abuse.
router.post("/posts/generate-bulk", requireAuth, aiGenerationRateLimit);
router.post("/posts/generate-extra", requireAuth, aiGenerationRateLimit);
router.use("/posts", requireAuth, uploadBodyParser, postsRouter);
router.use("/social-accounts", requireAuth, socialAccountsRouter);
router.use("/publish-log", requireAuth, publishLogRouter);
router.use("/settings", requireAdmin, settingsRouter);
router.use("/analytics", requireAuth, analyticsRouter);
router.use("/reels", requireAuth, uploadBodyParser, reelsRouter);
// Rate-limit AI landing page generation endpoints.
router.post("/landings", requireAuth, aiGenerationRateLimit);
router.post("/landings/:id/generate-hero", requireAuth, aiGenerationRateLimit);
router.post("/landings/:id/regenerate", requireAuth, aiGenerationRateLimit);
router.use("/landings", requireAuth, landingsRouter);
router.use("/locations", requireAuth, locationsRouter);
router.use("/billing", requireAuth, billingRouter);
router.use("/billing", requireAuth, billingPackagesRouter);
// Alias: /api/subscriptions/me → /api/billing/me, /api/subscriptions/change → /api/billing/change-plan
router.use("/subscriptions", requireAuth, billingRouter);
router.use("/businesses", requireAuth, businessesRouter);
router.use("/admin/plans", requireAdmin, adminPlansRouter);
router.use("/admin/metrics", requireAdmin, adminMetricsRouter);
router.use("/admin/affiliates", requireAdmin, adminAffiliatesRouter);
router.use("/admin/audit-logs", requireAdmin, adminAuditRouter);
router.use("/admin/backgrounds-master", requireAdmin, adminBackgroundsMasterRouter);
router.use("/admin/industry-groups", requireAdmin, adminIndustryGroupsRouter);
router.use("/admin/users", requireAdmin, adminUserStatsRouter);
router.use("/admin/affiliate-codes", requireAdmin, adminAffiliateCodesRouter);
// Alias: also accessible under /admin/affiliates/codes for API contract compatibility
router.use("/admin/affiliates/codes", requireAdmin, adminAffiliateCodesRouter);
router.use("/admin/referrals", requireAdmin, adminReferralsRouter);
router.use("/admin/benefit-catalog", requireAdmin, adminBenefitCatalogRouter);
router.use("/admin/vouchers", requireAdmin, adminVouchersRouter);
router.use("/admin/affiliate-settings", requireAdmin, adminAffiliateSettingsRouter);
router.use("/admin/hazpost-backend", requireAdmin, adminHazpostBackendRouter);
router.use("/admin/content-templates", requireAdmin, adminContentTemplatesRouter);
router.use("/content-templates", contentTemplatesRouter);
router.use("/vouchers", publicVouchersRouter);
router.use("/vouchers", requireAuth, vouchersRouter);
router.use("/support", supportRouter);
router.use("/alerts", requireAuth, alertsRouter);
router.use("/referrals", requireAuth, referralsRouter);
router.use("/affiliates", requireAuth, affiliatesRouter);
router.use("/credits", requireAuth, creditsRouter);
router.use("/elements", requireAuth, uploadBodyParser, elementsRouter);
router.use("/composition-presets", requireAuth, compositionPresetsRouter);
router.use("/fonts", requireAuth, uploadBodyParser, fontsRouter);
router.use("/publishing-schedule", requireAuth, publishingScheduleRouter);
router.use(requireAuth, storageRouter);

export default router;
