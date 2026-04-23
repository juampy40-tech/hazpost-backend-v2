import { Router } from "express";
import { db } from "@workspace/db";
import { plansTable, appSettingsTable } from "@workspace/db";
import { eq, asc, inArray, sql } from "drizzle-orm";
import { invalidateCreditCostsCache, getCreditCosts, DEFAULT_COSTS } from "../../lib/creditCosts.js";
import { getCurrentTrm, computeCopPrice, getTrmCacheInfo } from "../../services/trm.service.js";

const router = Router();

const CREDIT_COST_KEYS = [
  "credit_cost_image",
  "credit_cost_story",
  "credit_cost_carousel",
  "credit_cost_reel",
  "credit_cost_element_ai",
] as const;

async function loadCreditCostSettings() {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(inArray(appSettingsTable.key, [...CREDIT_COST_KEYS]));
  const map: Record<string, number> = {};
  for (const r of rows) map[r.key] = Number(r.value);
  return {
    image:     isFinite(map["credit_cost_image"])       ? map["credit_cost_image"]       : DEFAULT_COSTS.image,
    story:     isFinite(map["credit_cost_story"])       ? map["credit_cost_story"]       : DEFAULT_COSTS.story,
    carousel:  isFinite(map["credit_cost_carousel"])    ? map["credit_cost_carousel"]    : DEFAULT_COSTS.carousel,
    reel:      isFinite(map["credit_cost_reel"])        ? map["credit_cost_reel"]        : DEFAULT_COSTS.reel,
    elementAi: isFinite(map["credit_cost_element_ai"]) ? map["credit_cost_element_ai"]  : DEFAULT_COSTS.elementAi,
  };
}

/** GET /api/admin/plans — list all plans + credit pack config + credit costs per type + current TRM */
router.get("/", async (_req, res) => {
  try {
    const [plans, packSettings, packCredits, packReels, creditCosts, trm] = await Promise.all([
      db.select().from(plansTable).orderBy(asc(plansTable.sortOrder)),
      db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "credit_pack_price_usd")),
      db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "credit_pack_credits")),
      db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "credit_pack_reels")),
      loadCreditCostSettings(),
      getCurrentTrm(),
    ]);

    const { fetchedAt } = getTrmCacheInfo();

    // Enrich each plan with computed COP prices so the admin can see the live value.
    // The original priceCop / priceAnnualCop DB columns are kept as-is for reference.
    const plansWithDynamicCop = plans.map(p => ({
      ...p,
      computedPriceCop:             computeCopPrice(p.priceUsd, trm),
      computedPriceAnnualCop:       p.priceAnnualUsd ? computeCopPrice(p.priceAnnualUsd, trm) : 0,
      computedExtraBusinessPriceCop: computeCopPrice(p.extraBusinessPriceUsd, trm),
    }));

    const packPriceUsd = Number(packSettings[0]?.value ?? 19.99);
    const creditPack = {
      priceUsd: packPriceUsd,
      priceCop: computeCopPrice(packPriceUsd, trm),
      credits:  Number(packCredits[0]?.value ?? 100),
      reels:    Number(packReels[0]?.value   ?? 0),
    };

    res.json({
      plans: plansWithDynamicCop,
      creditPack,
      creditCosts,
      trm,
      trmFetchedAt: fetchedAt?.toISOString() ?? null,
    });
  } catch {
    res.status(500).json({ error: "Error al obtener planes" });
  }
});

type LegacyFeature   = { text: string; enabled: boolean };
type CatalogFeature  = { catalogKey: string; enabled: boolean; value: string | null };
type PlanFeature     = LegacyFeature | CatalogFeature;

/** Validates and sanitises the descriptionJson payload from admin input.
 *  Supports both legacy { text, enabled } and catalog-based { catalogKey, enabled, value } formats.
 */
function validateDescriptionJson(raw: unknown): { description: string; badge: string | null; features: PlanFeature[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("descriptionJson must be an object");
  }
  const obj = raw as Record<string, unknown>;

  const description = typeof obj.description === "string" ? obj.description.slice(0, 255) : "";
  const badge       = typeof obj.badge       === "string" ? obj.badge.slice(0, 100) || null : null;

  let features: PlanFeature[] = [];
  if (Array.isArray(obj.features)) {
    features = obj.features
      .filter(f => f && typeof f === "object")
      .map((f: Record<string, unknown>): PlanFeature | null => {
        const enabled = typeof f.enabled === "boolean" ? f.enabled : true;
        // Catalog-based feature
        if (typeof f.catalogKey === "string" && f.catalogKey) {
          return {
            catalogKey: f.catalogKey.slice(0, 100),
            enabled,
            value: typeof f.value === "string" ? f.value.slice(0, 255) : null,
          };
        }
        // Legacy free-text feature
        const text = typeof f.text === "string" ? f.text.slice(0, 255) : "";
        if (!text) return null;
        return { text, enabled };
      })
      .filter((f): f is PlanFeature => f !== null)
      .slice(0, 50);
  }

  return { description, badge, features };
}

const ALL_CONTENT_TYPES = ["image", "story", "carousel", "reel"] as const;

/** PUT /api/admin/plans/:key — update a plan's editable fields */
router.put("/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const {
      name,
      priceUsd,
      priceCop,
      priceAnnualUsd,
      priceAnnualCop,
      creditsPerMonth,
      reelsPerMonth,
      businessesAllowed,
      durationDays,
      extraBusinessPriceUsd,
      extraBusinessCredits,
      extraBusinessPriceAnnualUsd,
      extraBusinessPriceAnnualCop,
      isActive,
      sortOrder,
      descriptionJson,
      // New capability fields
      bulkMaxPosts,
      allowedContentTypes,
      includesBusinessPlan,
      elementAiEnabled,
    } = req.body;

    // Validate allowedContentTypes if provided
    let sanitisedAllowedTypes: string[] | undefined;
    if (allowedContentTypes !== undefined) {
      if (!Array.isArray(allowedContentTypes)) {
        return res.status(400).json({ error: "allowedContentTypes debe ser un array" });
      }
      sanitisedAllowedTypes = (allowedContentTypes as string[]).filter(t =>
        ALL_CONTENT_TYPES.includes(t as typeof ALL_CONTENT_TYPES[number])
      );
      if (sanitisedAllowedTypes.length === 0) {
        sanitisedAllowedTypes = ["image", "story"];
      }
    }

    const [existing] = await db.select().from(plansTable).where(eq(plansTable.key, key));
    if (!existing) return res.status(404).json({ error: "Plan no encontrado" });

    // Changes to plan conditions (credits, features) apply only to NEW subscriptions
    // and RENEWALS. Active subscriptions retain their lockedPlanConfig snapshot.
    const [updated] = await db.transaction(async (tx) => {
      // When elementAiEnabled is toggled and no explicit descriptionJson is provided,
      // auto-sync descriptionJson.features so the catalog entry stays in sync.
      let resolvedDescriptionJson: unknown = undefined;
      if (descriptionJson !== undefined) {
        resolvedDescriptionJson = validateDescriptionJson(descriptionJson);
      } else if (elementAiEnabled !== undefined) {
        const [cur] = await tx.select({ descriptionJson: plansTable.descriptionJson }).from(plansTable).where(eq(plansTable.key, key)).limit(1);
        if (cur?.descriptionJson) {
          type FeatureEntry = { catalogKey?: string; enabled?: boolean; [k: string]: unknown };
          const dj = cur.descriptionJson as { features?: FeatureEntry[] };
          const features: FeatureEntry[] = Array.isArray(dj.features) ? [...dj.features] : [];
          const idx = features.findIndex(f => f?.catalogKey === "element_ai_integration");
          if (Boolean(elementAiEnabled)) {
            if (idx >= 0) features[idx] = { ...features[idx], enabled: true };
            else features.push({ catalogKey: "element_ai_integration", enabled: true });
          } else {
            if (idx >= 0) features[idx] = { ...features[idx], enabled: false };
          }
          resolvedDescriptionJson = validateDescriptionJson({ ...dj, features });
        }
      }

      const result = await tx
        .update(plansTable)
        .set({
          ...(name                        !== undefined ? { name }                                                          : {}),
          ...(priceUsd                    !== undefined ? { priceUsd:                    Number(priceUsd) }                 : {}),
          ...(priceCop                    !== undefined ? { priceCop:                    Number(priceCop) }                 : {}),
          ...(priceAnnualUsd              !== undefined ? { priceAnnualUsd:              Number(priceAnnualUsd) }           : {}),
          ...(priceAnnualCop              !== undefined ? { priceAnnualCop:              Number(priceAnnualCop) }           : {}),
          ...(creditsPerMonth             !== undefined ? { creditsPerMonth:             Number(creditsPerMonth) }          : {}),
          ...(reelsPerMonth               !== undefined ? { reelsPerMonth:               Number(reelsPerMonth) }            : {}),
          ...(businessesAllowed           !== undefined ? { businessesAllowed:           Number(businessesAllowed) }        : {}),
          ...(durationDays                !== undefined ? { durationDays:               Number(durationDays) }             : {}),
          ...(extraBusinessPriceUsd       !== undefined ? { extraBusinessPriceUsd:       Number(extraBusinessPriceUsd) }    : {}),
          ...(extraBusinessCredits        !== undefined ? { extraBusinessCredits:        Number(extraBusinessCredits) }     : {}),
          ...(extraBusinessPriceAnnualUsd !== undefined ? { extraBusinessPriceAnnualUsd: Number(extraBusinessPriceAnnualUsd) } : {}),
          ...(extraBusinessPriceAnnualCop !== undefined ? { extraBusinessPriceAnnualCop: Number(extraBusinessPriceAnnualCop) } : {}),
          ...(isActive                    !== undefined ? { isActive:                    Boolean(isActive) }               : {}),
          ...(sortOrder                   !== undefined ? { sortOrder:                   Number(sortOrder) }               : {}),
          ...(bulkMaxPosts                !== undefined ? { bulkMaxPosts:                Math.max(0, Number(bulkMaxPosts)) }: {}),
          ...(sanitisedAllowedTypes       !== undefined ? { allowedContentTypes: sanitisedAllowedTypes }                   : {}),
          ...(includesBusinessPlan        !== undefined ? { includesBusinessPlan:        Boolean(includesBusinessPlan) }   : {}),
          ...(elementAiEnabled           !== undefined ? { elementAiEnabled:            Boolean(elementAiEnabled) }        : {}),
          ...(resolvedDescriptionJson !== undefined ? { descriptionJson: resolvedDescriptionJson } : {}),
          updatedAt: new Date(),
        })
        .where(eq(plansTable.key, key))
        .returning();

      return result;
    });

    res.json({ plan: updated });
  } catch {
    res.status(500).json({ error: "Error al actualizar plan" });
  }
});

/** PUT /api/admin/plans/credit-pack/config — update credit pack global config */
router.put("/credit-pack/config", async (req, res) => {
  try {
    const { priceUsd, credits, reels } = req.body;

    const upsert = async (k: string, value: string) => {
      await db
        .insert(appSettingsTable)
        .values({ key: k, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
    };

    if (priceUsd !== undefined) await upsert("credit_pack_price_usd", String(Number(priceUsd)));
    if (credits  !== undefined) await upsert("credit_pack_credits",   String(Number(credits)));
    if (reels    !== undefined) await upsert("credit_pack_reels",     String(Number(reels)));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al actualizar paquete de créditos" });
  }
});

/** PUT /api/admin/plans/credit-costs — update per-type credit costs globally */
router.put("/credit-costs/config", async (req, res) => {
  try {
    const { image, story, carousel, reel, elementAi } = req.body;

    const upsert = async (k: string, value: string) => {
      await db
        .insert(appSettingsTable)
        .values({ key: k, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
    };

    if (image     !== undefined) await upsert("credit_cost_image",     String(Number(image)));
    if (story     !== undefined) await upsert("credit_cost_story",     String(Number(story)));
    if (carousel  !== undefined) await upsert("credit_cost_carousel",  String(Number(carousel)));
    if (reel      !== undefined) await upsert("credit_cost_reel",      String(Number(reel)));
    if (elementAi !== undefined) await upsert("credit_cost_element_ai", String(Number(elementAi)));

    invalidateCreditCostsCache();

    // Sync the updated costs into plans.credit_costs_json so the DB model reflects the change
    const updatedCosts = await getCreditCosts();
    await db.execute(
      sql`UPDATE plans SET credit_costs_json = ${JSON.stringify(updatedCosts)}::jsonb`
    );

    res.json({ ok: true, creditCosts: updatedCosts });
  } catch {
    res.status(500).json({ error: "Error al actualizar costos de créditos" });
  }
});

export default router;
