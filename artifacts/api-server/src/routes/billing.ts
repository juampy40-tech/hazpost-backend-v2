import { Router } from "express";
import { db, usersTable, plansTable, subscriptionsTable, planBenefitCatalogTable, businessesTable, creditPurchasesTable, appSettingsTable } from "@workspace/db";
import { eq, asc, and, count, sql } from "drizzle-orm";
import crypto from "crypto";
import { getCurrentTrm, computeCopPrice, getTrmCacheInfo } from "../services/trm.service.js";
import { auditLog, AuditAction } from "../lib/audit.js";
import { buildPlanSnapshot } from "../lib/planCaps.js";

const router = Router();

/**
 * Pending cart items type (serialised as JSONB in pending_cart_orders table).
 */
type PendingCartItem =
  | { type: "credit_pack"; packageKey: string }
  | { type: "extra_business"; pendingBusiness?: { name: string; industry?: string }; reactivateBusinessId?: number }
  | { type: "plan_change"; targetPlan: string; annual?: boolean };

/** Persist a pending cart order in the DB for durable webhook reconciliation. */
async function savePendingCart(reference: string, userId: number, items: PendingCartItem[]) {
  await db.execute(sql`
    INSERT INTO pending_cart_orders (reference, user_id, items)
    VALUES (${reference}, ${userId}, ${JSON.stringify(items)}::jsonb)
    ON CONFLICT (reference) DO NOTHING
  `);
  // Lazily purge expired entries
  await db.execute(sql`DELETE FROM pending_cart_orders WHERE expires_at < NOW()`).catch(() => {});
}

/** Retrieve and delete a pending cart order from DB (idempotent). */
async function takePendingCart(reference: string): Promise<{ userId: number; items: PendingCartItem[] } | null> {
  const rows = await db.execute(sql`
    DELETE FROM pending_cart_orders WHERE reference = ${reference} AND expires_at >= NOW()
    RETURNING user_id, items
  `);
  const row = (rows as unknown as { rows: { user_id: number; items: unknown }[] }).rows[0];
  if (!row) return null;
  return { userId: row.user_id, items: row.items as PendingCartItem[] };
}

/**
 * Apply purchased cart items directly to the database.
 * Called for $0 carts (immediately) and from the Wompi webhook (after APPROVED).
 */
async function applyCartItems(
  userId: number,
  items: PendingCartItem[],
  plans: { key: string; creditsPerMonth: number; priceUsd?: number | null; extraBusinessPriceUsd?: number | null; priceCop?: number; priceAnnualCop?: number | null }[],
  trm: number,
  settingsMap: Record<string, string>,
) {
  for (const item of items) {
    if (item.type === "credit_pack") {
      const creditsToAdd = parseInt(settingsMap["credit_pack_credits"] ?? "100", 10);
      const [sub] = await db.select({ creditsRemaining: subscriptionsTable.creditsRemaining })
        .from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
        .limit(1);
      const newCredits = (sub?.creditsRemaining ?? 0) + creditsToAdd;
      await db.update(subscriptionsTable)
        .set({ creditsRemaining: newCredits })
        .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")));
      await db.update(usersTable)
        .set({ aiCredits: newCredits })
        .where(eq(usersTable.id, userId));

    } else if (item.type === "extra_business") {
      // Defense-in-depth: re-verify that the current plan supports purchasable extra slots
      const [currentSub] = await db
        .select({ plan: subscriptionsTable.plan, extraBusinessSlots: subscriptionsTable.extraBusinessSlots })
        .from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
        .limit(1);
      const currentPlanKey = currentSub?.plan ?? "free";
      const currentPlanData = plans.find(p => p.key === currentPlanKey);
      if ((currentPlanData?.extraBusinessPriceUsd ?? 0) <= 0) {
        // Plan does not support extra business slots — skip silently (already blocked at cart-checkout)
        continue;
      }

      // Increment extra slot quota
      const [sub] = await db.select({ extraBusinessSlots: subscriptionsTable.extraBusinessSlots })
        .from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
        .limit(1);
      await db.update(subscriptionsTable)
        .set({ extraBusinessSlots: (sub?.extraBusinessSlots ?? 0) + 1 })
        .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")));

      if (item.reactivateBusinessId) {
        // Reactivate an existing inactive business (ownership + inactive-state verified)
        const [existing] = await db.select({ id: businessesTable.id })
          .from(businessesTable)
          .where(and(
            eq(businessesTable.id, item.reactivateBusinessId),
            eq(businessesTable.userId, userId),
            eq(businessesTable.isActive, false),
          ))
          .limit(1);
        if (existing) {
          await db.update(businessesTable)
            .set({ isActive: true, updatedAt: new Date() })
            .where(eq(businessesTable.id, existing.id));
        }
      } else {
        // Create a new business if name was provided
        const bizName = item.pendingBusiness?.name?.trim();
        if (bizName) {
          await db.insert(businessesTable).values({
            userId,
            name: bizName,
            industry: item.pendingBusiness?.industry ?? null,
            isDefault: false,
            isActive: true,
            onboardingCompleted: false,
            showHazpostBadge: false,
            autoGenerationEnabled: false,
            generationFrequency: "15",
            sortOrder: 0,
          });
        }
      }

    } else if (item.type === "plan_change") {
      const targetPlan = plans.find(p => p.key === item.targetPlan);
      if (!targetPlan) continue;

      // Apply plan upgrade — caller is responsible for payment confirmation
      const now = new Date();
      const [currentSub] = await db
        .select({
          plan: subscriptionsTable.plan,
          creditsRemaining: subscriptionsTable.creditsRemaining,
          periodStart: subscriptionsTable.periodStart,
          periodEnd: subscriptionsTable.periodEnd,
        })
        .from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
        .limit(1);

      const currentPlan = plans.find(p => p.key === (currentSub?.plan ?? "free"));

      // Use proration-aware credit calculation (mirrors webhook upgrade logic)
      let additionalCredits: number;
      let newPeriodEnd: Date;

      const isAnnualTarget = item.annual === true && (targetPlan.priceAnnualCop ?? 0) > 0;

      if (currentSub?.periodStart) {
        // Proration path: calculate how many extra credits to add for remaining cycle
        const prorResult = calcProration({
          currentPriceCop: currentPlan?.priceCop ?? 0,
          currentPriceAnnualCop: currentPlan?.priceAnnualCop ?? 0,
          newPriceCop: targetPlan.priceCop ?? 0,
          newPriceAnnualCop: targetPlan.priceAnnualCop ?? 0,
          newCreditsPerMonth: targetPlan.creditsPerMonth,
          periodStart: new Date(currentSub.periodStart),
          periodEnd: currentSub.periodEnd ? new Date(currentSub.periodEnd) : null,
          wantsAnnual: isAnnualTarget,
        });
        additionalCredits = prorResult.creditsToAdd;
        // Annual upgrade → fresh 365-day period; monthly proration → keep current periodEnd
        newPeriodEnd = isAnnualTarget
          ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
          : (currentSub.periodEnd ? new Date(currentSub.periodEnd) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
      } else {
        // No existing period (e.g., upgrading from free): additive credit difference
        additionalCredits = Math.max(0, targetPlan.creditsPerMonth - (currentPlan?.creditsPerMonth ?? 0));
        const durationDays = isAnnualTarget ? 365 : 30;
        newPeriodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      }

      const newCredits = (currentSub?.creditsRemaining ?? 0) + additionalCredits;

      await db.update(usersTable)
        .set({ plan: item.targetPlan, aiCredits: newCredits })
        .where(eq(usersTable.id, userId));
      await db.update(subscriptionsTable)
        .set({
          plan: item.targetPlan,
          creditsRemaining: newCredits,
          creditsTotal: targetPlan.creditsPerMonth,
          lockedPlanConfig: buildPlanSnapshot(targetPlan),
          pendingDowngradePlan: null,
          pendingDowngradeAt: null,
          periodEnd: newPeriodEnd,
          updatedAt: now,
        })
        .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")));
    }
  }
}

const PLAN_POPULAR: Record<string, boolean> = {
  starter: false,
  business: true,
  agency: false,
};

type AutoKeyMap = Record<string, string | undefined>;

/** Build the auto-value map for a plan: is_auto catalog keys → plan field value as string. */
function buildAutoValues(plan: { creditsPerMonth: number; reelsPerMonth: number; businessesAllowed: number; extraBusinessPriceUsd?: number }): AutoKeyMap {
  const map: AutoKeyMap = {
    ai_credits:      String(plan.creditsPerMonth),
    reels_per_month: String(plan.reelsPerMonth),
    businesses:      String(plan.businessesAllowed),
  };
  if (plan.extraBusinessPriceUsd && plan.extraBusinessPriceUsd > 0) {
    map.extra_business_addon = `$${plan.extraBusinessPriceUsd}/mes`;
  }
  return map;
}

/** Resolve a plan feature entry into a display text string using the catalog.
 *  For is_auto catalog items the value is derived from autoValues (plan fields).
 *  Falls back to feature.text when the catalogKey is not found in the catalog.
 */
function resolveFeatureText(
  f: unknown,
  catalogMap: Map<string, { labelTemplate: string; hasValue: boolean; isAuto: boolean }>,
  autoValues: AutoKeyMap = {}
): string | null {
  if (!f || typeof f !== "object") return typeof f === "string" ? f : null;
  const obj = f as Record<string, unknown>;

  // New catalog-based format: { catalogKey, enabled, value }
  if (typeof obj.catalogKey === "string") {
    if (obj.enabled === false) return null;
    const cat = catalogMap.get(obj.catalogKey);
    if (!cat) {
      // Catalog item deleted — fallback to stored snapshot text if available
      const fallback = typeof obj.text === "string" ? obj.text : null;
      return fallback || null;
    }
    // is_auto: derive value from plan fields, ignore stored value
    const val = cat.isAuto
      ? (autoValues[obj.catalogKey] ?? (typeof obj.value === "string" ? obj.value : ""))
      : (typeof obj.value === "string" ? obj.value : "");
    return cat.labelTemplate.replace("{value}", val).trim() || null;
  }

  // Legacy format: { text, enabled }
  if (obj.enabled === false) return null;
  return typeof obj.text === "string" && obj.text ? obj.text : null;
}

/** Load all active plans from the DB, enriched with dynamic COP prices (TRM × USD × 1.05). */
async function loadPlans() {
  const [rows, trm] = await Promise.all([
    db.select().from(plansTable).where(eq(plansTable.isActive, true)).orderBy(asc(plansTable.sortOrder)),
    getCurrentTrm(),
  ]);
  return rows.map(p => ({
    ...p,
    priceCop:                    computeCopPrice(p.priceUsd, trm),
    priceAnnualCop:              p.priceAnnualUsd ? computeCopPrice(p.priceAnnualUsd, trm) : 0,
    extraBusinessPriceCop:       computeCopPrice(p.extraBusinessPriceUsd, trm),
    extraBusinessPriceAnnualCop: p.extraBusinessPriceAnnualUsd ? computeCopPrice(p.extraBusinessPriceAnnualUsd, trm) : 0,
  }));
}

/** GET /api/billing/plans — public list of plans (reads from DB) */
router.get("/plans", async (_req, res) => {
  try {
    const [rows, catalogRows] = await Promise.all([
      loadPlans(),
      db.select().from(planBenefitCatalogTable).orderBy(asc(planBenefitCatalogTable.sortOrder)),
    ]);

    const catalogMap = new Map(catalogRows.map(c => [c.key, c]));

    const plans = rows.map(p => {
      const autoValues = buildAutoValues(p);
      const rawFeatures = (p.descriptionJson as { features?: unknown[] } | null)?.features ?? [];
      // Use enabled catalog features when any exist; fall back to legacy text otherwise.
      const enabledCatalogFeats = rawFeatures
        .filter(f => f && typeof f === "object" && typeof (f as Record<string, unknown>).catalogKey === "string"
          && (f as Record<string, unknown>).enabled !== false)
        .map(f => resolveFeatureText(f, catalogMap, autoValues))
        .filter((t): t is string => t !== null && t.length > 0);
      const features = enabledCatalogFeats.length > 0
        ? enabledCatalogFeats
        : rawFeatures
            .filter(f => !f || typeof f !== "object" || typeof (f as Record<string, unknown>).catalogKey !== "string")
            .map(f => resolveFeatureText(f, catalogMap, autoValues))
            .filter((t): t is string => t !== null && t.length > 0);

      return {
        id: p.key,
        key: p.key,
        name: p.name,
        price_cop: p.priceCop,
        price_usd: p.priceUsd,
        price_annual_usd: p.priceAnnualUsd ?? 0,
        price_annual_cop: p.priceAnnualCop ?? 0,
        extra_business_price_usd: p.extraBusinessPriceUsd,
        extra_business_price_cop: p.extraBusinessPriceCop,
        extraBusinessPriceUsd: p.extraBusinessPriceUsd,
        extraBusinessPriceCop: p.extraBusinessPriceCop,
        extraBusinessPriceAnnualUsd: p.extraBusinessPriceAnnualUsd ?? 0,
        extraBusinessPriceAnnualCop: p.extraBusinessPriceAnnualCop ?? 0,
        ai_credits: p.creditsPerMonth,
        reels_per_month: p.reelsPerMonth,
        businesses_allowed: p.businessesAllowed,
        businessesAllowed: p.businessesAllowed,
        duration_days: p.durationDays,
        features,
        popular: PLAN_POPULAR[p.key] ?? false,
      };
    });
    return res.json({ plans });
  } catch {
    return res.status(500).json({ error: "Error al cargar planes" });
  }
});

/** GET /api/billing/trm — current TRM (COP/USD exchange rate) used for plan pricing */
router.get("/trm", async (_req, res) => {
  try {
    const trm = await getCurrentTrm();
    const { fetchedAt } = getTrmCacheInfo();
    return res.json({ trm, fetchedAt: fetchedAt?.toISOString() ?? null });
  } catch {
    return res.status(500).json({ error: "Error al obtener TRM" });
  }
});

// ─── Proration helpers ────────────────────────────────────────────────────────

interface ProrationResult {
  prorationAmountCop: number;
  creditsToAdd: number;
  isFree: boolean;
  daysRemaining: number;
  breakdown: {
    cycleType: string;
    daysOrMonthsUsed: number;
    daysOrMonthsRemaining: number;
    unusedCurrentValue: number;
    /** Alias for unusedCurrentValue — matches the documented API contract */
    currentPlanValue: number;
    newPlanCost: number;
  };
}

function calcProration(opts: {
  currentPriceCop: number;
  currentPriceAnnualCop: number;
  newPriceCop: number;
  newPriceAnnualCop: number;
  newCreditsPerMonth: number;
  periodStart: Date;
  periodEnd: Date | null | undefined;
  wantsAnnual: boolean;
}): ProrationResult {
  const {
    currentPriceCop,
    currentPriceAnnualCop,
    newPriceCop,
    newPriceAnnualCop,
    newCreditsPerMonth,
    periodStart,
    periodEnd,
    wantsAnnual,
  } = opts;

  const now = new Date();
  const periodDaysTotal = periodEnd
    ? Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
    : 30;
  const isCurrentAnnual = periodDaysTotal > 60;

  const daysRemaining = periodEnd
    ? Math.max(0, Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const daysUsed = Math.max(0, Math.round((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)));

  let prorationAmountCop: number;
  let creditsToAdd: number;
  let cycleType: string;
  let daysOrMonthsUsed: number;
  let daysOrMonthsRemaining: number;
  let unusedCurrentValue: number;
  let newPlanCost: number;

  if (isCurrentAnnual) {
    const monthsUsed = Math.ceil(daysUsed / 30);
    const monthsRemaining = Math.max(0, 12 - monthsUsed);
    const annualCopCurrent = currentPriceAnnualCop > 0 ? currentPriceAnnualCop : currentPriceCop * 12;
    unusedCurrentValue = Math.round((annualCopCurrent / 12) * monthsRemaining);

    if (wantsAnnual && newPriceAnnualCop > 0) {
      cycleType = "annual_to_annual";
      daysOrMonthsUsed = monthsUsed;
      daysOrMonthsRemaining = monthsRemaining;
      newPlanCost = Math.round((newPriceAnnualCop / 12) * monthsRemaining);
      prorationAmountCop = Math.max(0, newPlanCost - unusedCurrentValue);
      creditsToAdd = Math.round((newCreditsPerMonth / 12) * monthsRemaining);
    } else {
      cycleType = "annual_to_monthly";
      daysOrMonthsUsed = daysUsed;
      daysOrMonthsRemaining = daysRemaining;
      newPlanCost = Math.round((newPriceCop / 30) * daysRemaining);
      prorationAmountCop = Math.max(0, newPlanCost - unusedCurrentValue);
      creditsToAdd = Math.round((newCreditsPerMonth / 30) * daysRemaining);
    }
  } else {
    const unusedCurrentValueMonthly = Math.round((currentPriceCop / 30) * daysRemaining);
    unusedCurrentValue = unusedCurrentValueMonthly;
    daysOrMonthsUsed = daysUsed;
    daysOrMonthsRemaining = daysRemaining;

    if (wantsAnnual && newPriceAnnualCop > 0) {
      // Monthly → Annual: discount unused monthly value from full annual price.
      // Credits proportional to remaining days in current monthly cycle (new annual credits
      // accumulate monthly from the next reset; only top up the current remaining period).
      cycleType = "monthly_to_annual";
      newPlanCost = newPriceAnnualCop;
      prorationAmountCop = Math.max(0, newPriceAnnualCop - unusedCurrentValue);
      creditsToAdd = Math.round((newCreditsPerMonth / 30) * daysRemaining);
    } else {
      cycleType = "monthly_to_monthly";
      newPlanCost = Math.round((newPriceCop / 30) * daysRemaining);
      prorationAmountCop = Math.max(0, newPlanCost - unusedCurrentValue);
      creditsToAdd = Math.round((newCreditsPerMonth / 30) * daysRemaining);
    }
  }

  return {
    prorationAmountCop,
    creditsToAdd,
    isFree: prorationAmountCop <= 0,
    daysRemaining,
    breakdown: {
      cycleType,
      daysOrMonthsUsed,
      daysOrMonthsRemaining,
      unusedCurrentValue,
      currentPlanValue: unusedCurrentValue,
      newPlanCost,
    },
  };
}

/** GET /api/billing/prorate-upgrade — calculate proration for an upgrade (no side effects) */
router.get("/prorate-upgrade", async (req, res) => {
  const user = req.user!;
  const { planId, annual } = req.query as { planId?: string; annual?: string };
  if (!planId) return res.status(400).json({ error: "planId es requerido" });
  const wantsAnnual = annual === "true";

  const plans = await loadPlans();
  const newPlan = plans.find(p => p.key === planId);
  if (!newPlan) return res.status(404).json({ error: "Plan no encontrado" });

  const [row] = await db
    .select({
      plan: usersTable.plan,
      periodStart: subscriptionsTable.periodStart,
      periodEnd: subscriptionsTable.periodEnd,
    })
    .from(usersTable)
    .leftJoin(subscriptionsTable, and(
      eq(subscriptionsTable.userId, usersTable.id),
      eq(subscriptionsTable.status, "active"),
    ))
    .where(eq(usersTable.id, user.userId))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

  const currentPlan = plans.find(p => p.key === row.plan);
  if (!currentPlan) return res.status(400).json({ error: "Plan actual no encontrado" });

  if ((newPlan.priceCop ?? 0) <= (currentPlan.priceCop ?? 0)) {
    return res.status(400).json({ error: "Solo se permiten upgrades de plan" });
  }

  // No active subscription → treat as full price
  if (!row.periodStart) {
    const fullCop = wantsAnnual ? (newPlan.priceAnnualCop ?? 0) : newPlan.priceCop;
    return res.json({
      prorationAmountCop: fullCop,
      creditsToAdd: newPlan.creditsPerMonth,
      isFree: false,
      daysRemaining: 0,
      breakdown: {
        cycleType: "new_subscription",
        daysOrMonthsUsed: 0,
        daysOrMonthsRemaining: 0,
        unusedCurrentValue: 0,
        currentPlanValue: 0,
        newPlanCost: fullCop,
      },
    });
  }

  const result = calcProration({
    currentPriceCop: currentPlan.priceCop,
    currentPriceAnnualCop: currentPlan.priceAnnualCop ?? 0,
    newPriceCop: newPlan.priceCop,
    newPriceAnnualCop: newPlan.priceAnnualCop ?? 0,
    newCreditsPerMonth: newPlan.creditsPerMonth,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    wantsAnnual,
  });

  return res.json(result);
});

/** POST /api/billing/apply-free-proration — apply proration upgrade when amount ≤ 0 (no payment needed) */
router.post("/apply-free-proration", async (req, res) => {
  const user = req.user!;
  const { planId, annual } = req.body as { planId?: string; annual?: boolean };
  if (!planId) return res.status(400).json({ error: "planId es requerido" });
  const wantsAnnual = annual === true;

  const plans = await loadPlans();
  const newPlan = plans.find(p => p.key === planId);
  if (!newPlan) return res.status(404).json({ error: "Plan no encontrado" });

  const [row] = await db
    .select({
      plan: usersTable.plan,
      aiCredits: usersTable.aiCredits,
      creditsRemaining: subscriptionsTable.creditsRemaining,
      periodStart: subscriptionsTable.periodStart,
      periodEnd: subscriptionsTable.periodEnd,
    })
    .from(usersTable)
    .leftJoin(subscriptionsTable, and(
      eq(subscriptionsTable.userId, usersTable.id),
      eq(subscriptionsTable.status, "active"),
    ))
    .where(eq(usersTable.id, user.userId))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

  const currentPlan = plans.find(p => p.key === row.plan);
  if (!currentPlan) return res.status(400).json({ error: "Plan actual no encontrado" });

  if ((newPlan.priceCop ?? 0) <= (currentPlan.priceCop ?? 0)) {
    return res.status(400).json({ error: "Solo se permiten upgrades" });
  }

  if (!row.periodStart) return res.status(400).json({ error: "Sin suscripción activa" });

  const result = calcProration({
    currentPriceCop: currentPlan.priceCop,
    currentPriceAnnualCop: currentPlan.priceAnnualCop ?? 0,
    newPriceCop: newPlan.priceCop,
    newPriceAnnualCop: newPlan.priceAnnualCop ?? 0,
    newCreditsPerMonth: newPlan.creditsPerMonth,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    wantsAnnual,
  });

  if (!result.isFree) {
    return res.status(402).json({ error: "Este upgrade requiere pago", prorationAmountCop: result.prorationAmountCop });
  }

  const currentCredits = row.creditsRemaining ?? row.aiCredits ?? 0;
  const newCredits = currentCredits + result.creditsToAdd;
  const now = new Date();
  const isAnnualTarget = wantsAnnual && (newPlan.priceAnnualCop ?? 0) > 0;
  const newPeriodEnd = isAnnualTarget
    ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    : row.periodEnd;

  await db.update(usersTable)
    .set({ plan: planId, aiCredits: newCredits })
    .where(eq(usersTable.id, user.userId));

  await db.update(subscriptionsTable)
    .set({
      plan: planId,
      creditsRemaining: newCredits,
      creditsTotal: newPlan.creditsPerMonth,
      lockedPlanConfig: buildPlanSnapshot(newPlan),
      pendingDowngradePlan: null,
      pendingDowngradeAt: null,
      ...(newPeriodEnd ? { periodEnd: newPeriodEnd } : {}),
      updatedAt: now,
    })
    .where(and(eq(subscriptionsTable.userId, user.userId), eq(subscriptionsTable.status, "active")));

  return res.json({
    ok: true,
    message: `¡Actualización gratuita al plan ${newPlan.name}! Se añadieron ${result.creditsToAdd} créditos.`,
    plan: planId,
    aiCredits: newCredits,
    creditsAdded: result.creditsToAdd,
    effective: "immediate",
  });
});

/** POST /api/billing/checkout — create Wompi checkout link */
router.post("/checkout", async (req, res) => {
  const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
  const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;

  if (!WOMPI_PUBLIC_KEY || !WOMPI_PRIVATE_KEY) {
    return res.status(503).json({ error: "Pagos no configurados. Contacta a soporte@eco-col.com para activar tu plan." });
  }

  const { planId, annual, proration } = req.body as { planId?: string; annual?: boolean; proration?: boolean };
  const plans = await loadPlans();
  const plan = plans.find(p => p.key === planId);
  if (!plan) return res.status(400).json({ error: "Plan no encontrado" });

  const useAnnual = annual === true && (plan.priceAnnualCop ?? 0) > 0;
  const user = req.user!;

  // Enforce upgrade-only: reject checkout for plans ≤ current plan (non-admin)
  if (user.role !== "admin") {
    const [userRow] = await db
      .select({ plan: usersTable.plan })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .limit(1);
    const currentUserPlan = plans.find(p => p.key === (userRow?.plan ?? "free"));
    if ((plan.priceUsd ?? 0) <= (currentUserPlan?.priceUsd ?? 0)) {
      return res.status(400).json({
        error: "Solo puedes contratar planes de mayor precio. Los downgrades no están disponibles.",
      });
    }
  }

  let amountInCents: number;
  let reference: string;

  if (proration === true) {
    // Calculate prorated amount for this user's current subscription
    const [row] = await db
      .select({
        plan: usersTable.plan,
        periodStart: subscriptionsTable.periodStart,
        periodEnd: subscriptionsTable.periodEnd,
      })
      .from(usersTable)
      .leftJoin(subscriptionsTable, and(
        eq(subscriptionsTable.userId, usersTable.id),
        eq(subscriptionsTable.status, "active"),
      ))
      .where(eq(usersTable.id, user.userId))
      .limit(1);

    const currentPlan = plans.find(p => p.key === (row?.plan ?? "free"));

    if (row?.periodStart && currentPlan) {
      const result = calcProration({
        currentPriceCop: currentPlan.priceCop,
        currentPriceAnnualCop: currentPlan.priceAnnualCop ?? 0,
        newPriceCop: plan.priceCop,
        newPriceAnnualCop: plan.priceAnnualCop ?? 0,
        newCreditsPerMonth: plan.creditsPerMonth,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        wantsAnnual: useAnnual,
      });
      if (result.isFree) {
        return res.status(400).json({ error: "Este upgrade no requiere pago. Usa apply-free-proration." });
      }
      amountInCents = result.prorationAmountCop * 100;
    } else {
      amountInCents = useAnnual ? (plan.priceAnnualCop ?? 0) * 100 : plan.priceCop * 100;
    }

    const suffix = useAnnual ? "_PRO_ANN" : "_PRO";
    reference = `ECO-${user.userId}-${planId}${suffix}-${Date.now()}`;
  } else {
    amountInCents = useAnnual ? (plan.priceAnnualCop ?? 0) * 100 : plan.priceCop * 100;
    reference = useAnnual
      ? `ECO-${user.userId}-${planId}_ANN-${Date.now()}`
      : `ECO-${user.userId}-${planId}-${Date.now()}`;
  }

  const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET ?? "";
  const integrityString = `${reference}${amountInCents}COP${WOMPI_INTEGRITY_SECRET}`;
  const signature = crypto.createHash("sha256").update(integrityString).digest("hex");

  const checkoutUrl = new URL("https://checkout.wompi.co/p/");
  checkoutUrl.searchParams.set("public-key", WOMPI_PUBLIC_KEY);
  checkoutUrl.searchParams.set("currency", "COP");
  checkoutUrl.searchParams.set("amount-in-cents", String(amountInCents));
  checkoutUrl.searchParams.set("reference", reference);
  checkoutUrl.searchParams.set("signature:integrity", signature);
  checkoutUrl.searchParams.set("customer-data:email", user.email ?? "");
  checkoutUrl.searchParams.set(
    "redirect-url",
    `${process.env.FRONTEND_URL ?? ""}/billing/success?plan=${planId}${useAnnual ? "&billing=annual" : ""}${proration ? "&proration=true" : ""}`,
  );

  return res.json({ checkoutUrl: checkoutUrl.toString(), reference, annual: useAnnual, proration: proration === true });
});

/** POST /api/billing/webhook — Wompi event webhook */
router.post("/webhook", async (req, res) => {
  const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET;
  if (!WOMPI_EVENTS_SECRET) return res.status(200).json({ ok: true });

  const body = req.body as {
    event?: string;
    data?: { transaction?: { reference?: string; status?: string; amount_in_cents?: number } };
    signature?: { properties?: string[]; checksum?: string; timestamp?: number };
  };

  // Verify Wompi webhook signature
  if (body.signature) {
    const { properties = [], checksum, timestamp } = body.signature;
    const propsConcat = (properties).map(p => {
      const parts = p.split(".");
      let val: unknown = body.data;
      for (const part of parts) val = (val as Record<string, unknown>)?.[part];
      return val ?? "";
    }).join("");
    const toHash = `${propsConcat}${timestamp}${WOMPI_EVENTS_SECRET}`;
    const expectedHash = crypto.createHash("sha256").update(toHash).digest("hex");
    if (expectedHash !== checksum) {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  if (body.event === "transaction.updated" && body.data?.transaction?.status === "APPROVED") {
    const reference = body.data.transaction.reference ?? "";

    // ── Cart order reconciliation (cart_${userId}_${ts}) ──
    if (reference.startsWith("cart_")) {
      const pending = await takePendingCart(reference);
      if (pending) {
        const plans = await loadPlans();
        const trm = await getCurrentTrm();
        const settingsRows = await db.select().from(appSettingsTable);
        const settingsMap: Record<string, string> = {};
        for (const r of settingsRows) settingsMap[r.key] = r.value;
        await applyCartItems(pending.userId, pending.items, plans, trm, settingsMap);
        await auditLog({ userId: pending.userId, action: AuditAction.CART_CHECKOUT_CREATED, metadata: { reference, event: "webhook_applied" }, req });
      }
      return res.json({ ok: true });
    }

    // Reference formats (plan checkout):
    //   ECO-{userId}-{planId}-{ts}           regular monthly
    //   ECO-{userId}-{planId}_ANN-{ts}       annual
    //   ECO-{userId}-{planId}_PRO-{ts}       prorated monthly
    //   ECO-{userId}-{planId}_PRO_ANN-{ts}   prorated annual
    const parts = reference.split("-");
    if (parts.length >= 3) {
      const userId = Number(parts[1]);
      const rawPlanId = parts[2];

      // Parse suffixes: order matters — check _PRO_ANN before _ANN
      const isProration = rawPlanId.includes("_PRO");
      let isAnnual = false;
      let planId = rawPlanId;

      if (planId.endsWith("_PRO_ANN")) {
        isAnnual = true;
        planId = planId.slice(0, -8);
      } else if (planId.endsWith("_ANN")) {
        isAnnual = true;
        planId = planId.slice(0, -4);
      } else if (planId.endsWith("_PRO")) {
        planId = planId.slice(0, -4);
      }

      const plans = await loadPlans();
      const plan = plans.find(p => p.key === planId);

      if (plan && userId) {
        const [currentUserRow] = await db
          .select({ plan: usersTable.plan, aiCredits: usersTable.aiCredits })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);

        const [subRow] = await db
          .select({
            creditsRemaining: subscriptionsTable.creditsRemaining,
            periodStart: subscriptionsTable.periodStart,
            periodEnd: subscriptionsTable.periodEnd,
          })
          .from(subscriptionsTable)
          .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
          .limit(1);

        const currentPlan = plans.find(p => p.key === (currentUserRow?.plan ?? "free"));
        const now = new Date();

        // Defense-in-depth: skip application if reference somehow encodes a downgrade
        // (shouldn't happen since checkout enforces upgrade-only, but safe to guard here)
        if ((plan.priceUsd ?? 0) < (currentPlan?.priceUsd ?? 0)) {
          return res.json({ ok: true, skipped: "downgrade_reference" });
        }

        let additionalCredits: number;
        let newPeriodEnd: Date;

        if (isProration && subRow?.periodStart) {
          const prorResult = calcProration({
            currentPriceCop: currentPlan?.priceCop ?? 0,
            currentPriceAnnualCop: currentPlan?.priceAnnualCop ?? 0,
            newPriceCop: plan.priceCop,
            newPriceAnnualCop: plan.priceAnnualCop ?? 0,
            newCreditsPerMonth: plan.creditsPerMonth,
            periodStart: subRow.periodStart,
            periodEnd: subRow.periodEnd,
            wantsAnnual: isAnnual,
          });
          additionalCredits = prorResult.creditsToAdd;

          // Annual target → 365 days; monthly target → keep current period
          const isAnnualTarget = isAnnual && (plan.priceAnnualCop ?? 0) > 0;
          newPeriodEnd = isAnnualTarget
            ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
            : (subRow.periodEnd ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
        } else {
          // Full upgrade: additive credit difference
          additionalCredits = Math.max(0, plan.creditsPerMonth - (currentPlan?.creditsPerMonth ?? 0));
          const durationDays = isAnnual ? 365 : (plan.durationDays ?? 30);
          newPeriodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        }

        const baseCredits = subRow?.creditsRemaining ?? currentUserRow?.aiCredits ?? 0;
        const newCredits = baseCredits + additionalCredits;

        await db.update(usersTable)
          .set({ plan: planId, aiCredits: newCredits })
          .where(eq(usersTable.id, userId));

        await db.update(subscriptionsTable)
          .set({
            plan: planId,
            creditsRemaining: newCredits,
            creditsTotal: plan.creditsPerMonth,
            lockedPlanConfig: buildPlanSnapshot(plan),
            pendingDowngradePlan: null,
            pendingDowngradeAt: null,
            periodEnd: newPeriodEnd,
            updatedAt: now,
          })
          .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")));

        import("./referrals.js").then(({ creditReferral }) => creditReferral(userId, planId)).catch(() => {});
      }
    }
  }

  return res.json({ ok: true });
});

/**
 * Shared handler: get current user plan & credits.
 * Exposed at GET /api/billing/me AND GET /api/subscriptions/me.
 */
async function handleGetMe(req: import("express").Request, res: import("express").Response) {
  const user = req.user!;
  const [row] = await db
    .select({
      plan: usersTable.plan,
      aiCredits: usersTable.aiCredits,
      creditsRemaining: subscriptionsTable.creditsRemaining,
      creditsTotal: subscriptionsTable.creditsTotal,
      pendingDowngradePlan: subscriptionsTable.pendingDowngradePlan,
      pendingDowngradeAt: subscriptionsTable.pendingDowngradeAt,
      pendingDowngradeBusinessIds: subscriptionsTable.pendingDowngradeBusinessIds,
      extraBusinessSlots: subscriptionsTable.extraBusinessSlots,
      periodStart: subscriptionsTable.periodStart,
      periodEnd: subscriptionsTable.periodEnd,
    })
    .from(usersTable)
    .leftJoin(subscriptionsTable, and(
      eq(subscriptionsTable.userId, usersTable.id),
      eq(subscriptionsTable.status, "active"),
    ))
    .where(eq(usersTable.id, user.userId))
    .limit(1);
  if (!row) return res.status(404).json({ error: "User not found" });

  const canonicalCredits = row.creditsRemaining ?? row.aiCredits;

  const plans = await loadPlans();
  const planDetails = plans.find(p => p.key === user.plan) ?? null;
  return res.json({
    plan: user.plan,
    aiCredits: canonicalCredits,
    creditsRemaining: canonicalCredits,
    creditsTotal: row.creditsTotal ?? planDetails?.creditsPerMonth ?? 0,
    pendingDowngradePlan: row.pendingDowngradePlan ?? null,
    pendingDowngradeAt: row.pendingDowngradeAt ?? null,
    pendingDowngradeBusinessIds: (row.pendingDowngradeBusinessIds as number[] | null) ?? [],
    extraBusinessSlots: row.extraBusinessSlots ?? 0,
    periodStart: row.periodStart ?? null,
    periodEnd: row.periodEnd ?? null,
    planDetails: planDetails ? {
      id: planDetails.key,
      name: planDetails.name,
      price_cop: planDetails.priceCop,
      price_usd: planDetails.priceUsd,
      price_annual_usd: planDetails.priceAnnualUsd ?? 0,
      price_annual_cop: planDetails.priceAnnualCop ?? 0,
      ai_credits: planDetails.creditsPerMonth,
      reels_per_month: planDetails.reelsPerMonth,
      businesses_allowed: planDetails.businessesAllowed,
      duration_days: planDetails.durationDays,
      element_ai_enabled: planDetails.elementAiEnabled ?? false,
      features: await (async () => {
        const catRows = await db.select().from(planBenefitCatalogTable).orderBy(asc(planBenefitCatalogTable.sortOrder));
        const catMap = new Map(catRows.map(c => [c.key, c]));
        const autoVals = buildAutoValues(planDetails);
        const rawF = (planDetails.descriptionJson as { features?: unknown[] } | null)?.features ?? [];
        const hasCat = rawF.some(f => f && typeof f === "object" && typeof (f as Record<string, unknown>).catalogKey === "string");
        const toResolve = hasCat ? rawF.filter(f => f && typeof f === "object" && typeof (f as Record<string, unknown>).catalogKey === "string") : rawF;
        return toResolve
          .map(f => resolveFeatureText(f, catMap, autoVals))
          .filter((t): t is string => t !== null && t.length > 0);
      })(),
    } : null,
  });
}

/** GET /api/billing/me — current user plan & credits */
router.get("/me", handleGetMe);

/**
 * Shared handler: change subscription plan.
 * Exposed at POST /api/billing/change-plan AND POST /api/subscriptions/change.
 *
 * Rules:
 *  - Upgrade: requires payment (non-admin). Returns 402 + requiresCheckout.
 *  - Downgrade: blocked for non-admin. Admin can downgrade immediately.
 *  - Same price: apply immediately.
 */
async function handleChangePlan(req: import("express").Request, res: import("express").Response) {
  const user = req.user!;
  const { planId } = req.body as { planId?: string };
  if (!planId) return res.status(400).json({ error: "planId es requerido" });

  const plans = await loadPlans();
  const newPlan = plans.find(p => p.key === planId);
  if (!newPlan) return res.status(404).json({ error: "Plan no encontrado" });

  const [currentUser] = await db
    .select({ plan: usersTable.plan, aiCredits: usersTable.aiCredits })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .limit(1);
  if (!currentUser) return res.status(404).json({ error: "Usuario no encontrado" });

  const currentPlan = plans.find(p => p.key === currentUser.plan);
  const currentPriceUsd = currentPlan?.priceUsd ?? 0;
  const newPriceUsd = newPlan.priceUsd;
  const now = new Date();

  const isUpgrade = newPriceUsd > currentPriceUsd;
  const isNotUpgrade = newPriceUsd <= currentPriceUsd;

  // Non-admin: reject any change that isn't a strict upgrade (includes lateral and downgrades)
  if (isNotUpgrade && user.role !== "admin") {
    return res.status(400).json({
      error: newPriceUsd < currentPriceUsd
        ? "Los downgrades no están disponibles. Tu plan se mantiene hasta el fin de tu ciclo de facturación."
        : "No puedes cambiar a un plan del mismo precio. Usa el checkout para subir de plan.",
    });
  }

  // Non-admin upgrade requires payment
  if (isUpgrade && user.role !== "admin") {
    return res.status(402).json({
      error: "Para activar un plan superior debes realizar el pago. Usa el checkout.",
      requiresCheckout: true,
    });
  }

  // Admin force-upgrade: apply immediately with additive credits
  if (isUpgrade && user.role === "admin") {
    const additionalCredits = newPlan.creditsPerMonth - (currentPlan?.creditsPerMonth ?? 0);
    const newCredits = Math.max(0, currentUser.aiCredits + additionalCredits);
    await db.update(usersTable)
      .set({ plan: planId, aiCredits: newCredits })
      .where(eq(usersTable.id, user.userId));
    await db.update(subscriptionsTable)
      .set({ plan: planId, creditsRemaining: newCredits, creditsTotal: newPlan.creditsPerMonth, lockedPlanConfig: buildPlanSnapshot(newPlan), updatedAt: now, pendingDowngradePlan: null, pendingDowngradeAt: null })
      .where(and(eq(subscriptionsTable.userId, user.userId), eq(subscriptionsTable.status, "active")));
    return res.json({ ok: true, message: `Plan actualizado a ${newPlan.name}. Créditos añadidos: +${Math.max(0, additionalCredits)}.`, plan: planId, aiCredits: newCredits, effective: "immediate" });
  }

  // Admin force-downgrade: apply immediately
  if (newPriceUsd < currentPriceUsd && user.role === "admin") {
    const newCredits = Math.min(currentUser.aiCredits, newPlan.creditsPerMonth);
    await db.update(usersTable)
      .set({ plan: planId, aiCredits: newCredits })
      .where(eq(usersTable.id, user.userId));
    await db.update(subscriptionsTable)
      .set({ plan: planId, creditsRemaining: newCredits, creditsTotal: newPlan.creditsPerMonth, lockedPlanConfig: buildPlanSnapshot(newPlan), updatedAt: now, pendingDowngradePlan: null, pendingDowngradeAt: null })
      .where(and(eq(subscriptionsTable.userId, user.userId), eq(subscriptionsTable.status, "active")));
    return res.json({ ok: true, message: `Plan cambiado a ${newPlan.name} (inmediato — admin).`, plan: planId, aiCredits: newCredits, effective: "immediate" });
  }

  // Same price (lateral move): apply immediately
  const newCredits = Math.min(currentUser.aiCredits, newPlan.creditsPerMonth);
  await db.update(usersTable)
    .set({ plan: planId, aiCredits: newCredits })
    .where(eq(usersTable.id, user.userId));
  await db.update(subscriptionsTable)
    .set({ plan: planId, creditsRemaining: newCredits, creditsTotal: newPlan.creditsPerMonth, lockedPlanConfig: buildPlanSnapshot(newPlan), updatedAt: now })
    .where(and(eq(subscriptionsTable.userId, user.userId), eq(subscriptionsTable.status, "active")));

  return res.json({ ok: true, message: `Plan actualizado a ${newPlan.name}.`, plan: planId, aiCredits: newCredits, effective: "immediate" });
}

/** POST /api/billing/change-plan — change subscription plan */
router.post("/change-plan", handleChangePlan);

/** POST /api/billing/change — alias for /change-plan (subscriptions API contract) */
router.post("/change", handleChangePlan);

/* ──────────────────────────────────────────────────────────────────────────
   SCHEDULE DOWNGRADE — user-initiated, takes effect at period_end
   ────────────────────────────────────────────────────────────────────────── */

/**
 * POST /api/billing/schedule-downgrade
 * Queues a downgrade to a lower plan. The change takes effect when the
 * current billing period ends (handled by the scheduler at 01:00 Bogotá).
 *
 * Body: {
 *   targetPlan: string,
 *   keepBusinessIds: number[],   — business IDs to keep active; others become inactive
 *   primaryBusinessId: number,   — the is_default business after the change
 * }
 * userId is ALWAYS from JWT — never from body.
 */
router.post("/schedule-downgrade", async (req, res) => {
  const userId = req.user!.userId;
  const { targetPlan, keepBusinessIds, primaryBusinessId } = req.body as {
    targetPlan?: string;
    keepBusinessIds?: number[];
    primaryBusinessId?: number;
  };

  if (!targetPlan) return res.status(400).json({ error: "targetPlan es requerido" });

  const plans = await loadPlans();
  const newPlan = plans.find(p => p.key === targetPlan);
  if (!newPlan) return res.status(400).json({ error: "Plan no encontrado" });

  const [userRow] = await db
    .select({ plan: usersTable.plan })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!userRow) return res.status(404).json({ error: "Usuario no encontrado" });

  const currentPlan = plans.find(p => p.key === (userRow.plan ?? "free"));
  if (!currentPlan) return res.status(400).json({ error: "Plan actual no encontrado" });

  const isDowngrade = (newPlan.priceUsd ?? 0) < (currentPlan.priceUsd ?? 0);
  if (!isDowngrade) {
    return res.status(400).json({ error: "Solo puedes programar downgrades (planes de menor precio). Para upgrades usa la opción de pago inmediato." });
  }

  const [sub] = await db
    .select({ id: subscriptionsTable.id, periodEnd: subscriptionsTable.periodEnd, extraBusinessSlots: subscriptionsTable.extraBusinessSlots })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
    .limit(1);

  if (!sub?.periodEnd) {
    return res.status(400).json({ error: "No tienes una suscripción activa con fecha de vencimiento. Contacta a soporte." });
  }

  // Validate keepBusinessIds count does not exceed the new plan's effective limit
  const rawIds: number[] = Array.isArray(keepBusinessIds) ? keepBusinessIds.map(Number).filter(n => !isNaN(n) && n > 0) : [];
  const extraSlots = sub.extraBusinessSlots ?? 0;
  const effectiveLimit = (newPlan.businessesAllowed ?? 1) + extraSlots;

  // Fetch ALL user businesses (active and inactive) to validate ownership
  // Users can include inactive businesses in their selection to reactivate them during downgrade
  const userAllBusinesses = await db
    .select({ id: businessesTable.id, isActive: businessesTable.isActive })
    .from(businessesTable)
    .where(eq(businessesTable.userId, userId));
  const userAllIds = new Set(userAllBusinesses.map(b => b.id));
  const userActiveIds = new Set(userAllBusinesses.filter(b => b.isActive).map(b => b.id));

  // All keepBusinessIds must belong to the user (active or inactive)
  const invalidIds = rawIds.filter(id => !userAllIds.has(id));
  if (invalidIds.length > 0) {
    return res.status(400).json({
      error: `Los siguientes IDs de negocio no te pertenecen: ${invalidIds.join(", ")}.`,
    });
  }

  // If active businesses > effective limit, user must explicitly select which to keep
  if (userActiveIds.size > effectiveLimit && rawIds.length === 0) {
    return res.status(400).json({
      error: `El plan ${newPlan.name} permite hasta ${effectiveLimit} negocio(s). Debes seleccionar cuáles conservar.`,
    });
  }

  const ids = rawIds.length > 0 ? rawIds : Array.from(userActiveIds);
  if (ids.length > effectiveLimit) {
    return res.status(400).json({
      error: `El plan ${newPlan.name} permite hasta ${effectiveLimit} negocio(s). Selecciona máximo ${effectiveLimit}.`,
    });
  }

  // primaryBusinessId must be in keepBusinessIds (or defaults to first)
  const primaryId = typeof primaryBusinessId === "number" && ids.includes(primaryBusinessId) ? primaryBusinessId : ids[0] ?? null;
  const orderedIds = primaryId && ids.includes(primaryId)
    ? [primaryId, ...ids.filter(id => id !== primaryId)]
    : ids;

  await db.update(subscriptionsTable)
    .set({
      pendingDowngradePlan: targetPlan,
      pendingDowngradeAt: sub.periodEnd,
      pendingDowngradeBusinessIds: orderedIds,
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")));

  await auditLog({
    userId,
    action: AuditAction.DOWNGRADE_SCHEDULED,
    metadata: { targetPlan, keepBusinessIds: orderedIds, primaryBusinessId: orderedIds[0], effectiveFrom: sub.periodEnd },
    req,
  });

  return res.json({
    success: true,
    message: `Cambio a plan ${newPlan.name} programado para el ${new Date(sub.periodEnd).toLocaleDateString("es-CO")}.`,
    pendingDowngradePlan: targetPlan,
    pendingDowngradeAt: sub.periodEnd,
    keepBusinessIds: orderedIds,
  });
});

/**
 * DELETE /api/billing/schedule-downgrade
 * Cancels a previously scheduled downgrade.
 */
router.delete("/schedule-downgrade", async (req, res) => {
  const userId = req.user!.userId;

  const [sub] = await db
    .select({ id: subscriptionsTable.id, pendingDowngradePlan: subscriptionsTable.pendingDowngradePlan })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
    .limit(1);

  if (!sub?.pendingDowngradePlan) {
    return res.status(400).json({ error: "No tienes ningún cambio de plan programado." });
  }

  await db.update(subscriptionsTable)
    .set({ pendingDowngradePlan: null, pendingDowngradeAt: null, pendingDowngradeBusinessIds: [], updatedAt: new Date() })
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")));

  await auditLog({
    userId,
    action: AuditAction.DOWNGRADE_CANCELLED,
    metadata: { cancelledPlan: sub.pendingDowngradePlan },
    req,
  });

  return res.json({ success: true, message: "Cambio de plan cancelado. Tu plan actual continúa." });
});

/* ──────────────────────────────────────────────────────────────────────────
   CART CHECKOUT — unified payment for multiple items
   ────────────────────────────────────────────────────────────────────────── */

type CartItem =
  | { type: "credit_pack"; packageKey: string }
  | { type: "extra_business"; pendingBusiness: { name: string; industry?: string }; reactivateBusinessId?: number; annual?: boolean }
  | { type: "plan_change"; targetPlan: string; annual?: boolean };

/**
 * POST /api/billing/cart-checkout
 * Unified checkout for a cart of billing items.
 * Items are validated and summed; a single Wompi checkout link is generated
 * for the total monetary amount. Free items are noted in the response.
 * userId is ALWAYS from JWT.
 */
router.post("/cart-checkout", async (req, res) => {
  const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
  const WOMPI_INTEGRITY_SECRET_CART = process.env.WOMPI_INTEGRITY_SECRET ?? "";

  const userId = req.user!.userId;
  const { items } = req.body as { items?: CartItem[] };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El carrito está vacío." });
  }

  const [sub] = await db
    .select({
      plan: subscriptionsTable.plan,
      extraBusinessSlots: subscriptionsTable.extraBusinessSlots,
      periodStart: subscriptionsTable.periodStart,
      periodEnd: subscriptionsTable.periodEnd,
    })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
    .limit(1);

  const plans = await loadPlans();
  const currentPlanKey = sub?.plan ?? "free";
  const currentPlan = plans.find(p => p.key === currentPlanKey);
  const trm = await getCurrentTrm();

  // Load app_settings once for all credit_pack items
  const settingsRows = await db.select().from(appSettingsTable);
  const settingsMap: Record<string, string> = {};
  for (const r of settingsRows) settingsMap[r.key] = r.value;

  let totalUsd = 0;
  let totalCopOverride = 0; // sum of COP line-items (used for proration-priced items)
  const lineItems: { label: string; priceUsd: number; priceCop: number }[] = [];

  for (const item of items) {
    if (item.type === "credit_pack") {
      const priceUsd = parseFloat(settingsMap["credit_pack_price_usd"] ?? "19.99");
      const priceCop = computeCopPrice(priceUsd, trm);
      totalUsd += priceUsd;
      totalCopOverride += priceCop;
      lineItems.push({ label: "Paquete de créditos", priceUsd, priceCop });
    } else if (item.type === "extra_business") {
      const plan = plans.find(p => p.key === currentPlanKey);
      const monthlyPriceUsd = plan?.extraBusinessPriceUsd ?? 0;

      // Reject if the current plan does not support purchasable extra business slots
      if (monthlyPriceUsd <= 0) {
        return res.status(400).json({
          error: "Tu plan actual no permite comprar negocios adicionales.",
          code: "EXTRA_BUSINESS_NOT_AVAILABLE",
        });
      }

      const priceUsd = item.annual && (plan?.extraBusinessPriceAnnualUsd ?? 0) > 0
        ? (plan?.extraBusinessPriceAnnualUsd ?? 0)
        : monthlyPriceUsd;
      const priceCop = computeCopPrice(priceUsd, trm);
      totalUsd += priceUsd;
      totalCopOverride += priceCop;
      lineItems.push({ label: `Negocio adicional: ${item.pendingBusiness?.name ?? "Nuevo"}`, priceUsd, priceCop });
    } else if (item.type === "plan_change") {
      const targetPlan = plans.find(p => p.key === item.targetPlan);
      if (!targetPlan) continue;

      // Enforce upgrade-only: reject downgrades/same-plan via cart — use schedule-downgrade instead
      const currentPriceUsd = currentPlan?.priceUsd ?? 0;
      const targetPriceUsd = item.annual && (targetPlan.priceAnnualUsd ?? 0) > 0
        ? (targetPlan.priceAnnualUsd ?? 0) / 12
        : (targetPlan.priceUsd ?? 0);
      if (targetPriceUsd <= currentPriceUsd) {
        return res.status(400).json({
          error: "Los cambios de plan a un plan igual o inferior deben programarse via schedule-downgrade.",
          code: "USE_SCHEDULE_DOWNGRADE",
        });
      }

      // Calculate proration amount (same logic as /api/billing/checkout with proration=true)
      const prorationResult = calcProration({
        currentPriceCop: currentPlan?.priceCop ?? 0,
        currentPriceAnnualCop: currentPlan?.priceAnnualCop ?? 0,
        newPriceCop: targetPlan.priceCop ?? 0,
        newPriceAnnualCop: targetPlan.priceAnnualCop ?? 0,
        newCreditsPerMonth: targetPlan.creditsPerMonth,
        periodStart: sub?.periodStart ? new Date(sub.periodStart) : new Date(),
        periodEnd: sub?.periodEnd ? new Date(sub.periodEnd) : null,
        wantsAnnual: item.annual ?? false,
      });

      const prorationCop = prorationResult.prorationAmountCop;
      const prorationUsd = prorationCop / trm;
      totalUsd += prorationUsd;
      totalCopOverride += prorationCop;
      lineItems.push({ label: `Plan ${targetPlan.name}${item.annual ? " (anual)" : ""} (upgrade)`, priceUsd: prorationUsd, priceCop: prorationCop });
    }
  }

  // Use pre-summed COP line items (more accurate for proration-priced items like plan_change)
  const totalCop = totalCopOverride || computeCopPrice(totalUsd, trm);
  const pendingItems: PendingCartItem[] = items as PendingCartItem[];

  await auditLog({
    userId,
    action: AuditAction.CART_CHECKOUT_CREATED,
    metadata: { items: items.map(i => i.type), totalUsd, totalCop, lineItems },
    req,
  });

  // ── $0 cart: apply items immediately ──
  if (totalUsd <= 0) {
    await applyCartItems(userId, pendingItems, plans, trm, settingsMap);
    return res.json({
      success: true,
      checkoutUrl: null,
      totalUsd,
      totalCop,
      lineItems,
      itemsProcessed: items.map(i => i.type),
      note: "Los cambios han sido aplicados exitosamente.",
    });
  }

  // ── No Wompi keys configured ──
  if (!WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET_CART) {
    return res.json({
      success: false,
      checkoutUrl: null,
      totalUsd,
      totalCop,
      lineItems,
      itemsProcessed: [],
      note: "Pagos no configurados. Contacta a soporte@hazpost.app.",
    });
  }

  // ── Paid cart: persist pending order durably in DB, generate Wompi checkout ──
  const reference = `cart_${userId}_${Date.now()}`;
  await savePendingCart(reference, userId, pendingItems);

  const amountInCents = Math.round(totalCop * 100);
  const integrityString = `${reference}${amountInCents}COP${WOMPI_INTEGRITY_SECRET_CART}`;
  const signature = crypto.createHash("sha256").update(integrityString).digest("hex");

  const checkoutUrl = new URL("https://checkout.wompi.co/p/");
  checkoutUrl.searchParams.set("public-key", WOMPI_PUBLIC_KEY);
  checkoutUrl.searchParams.set("currency", "COP");
  checkoutUrl.searchParams.set("amount-in-cents", String(amountInCents));
  checkoutUrl.searchParams.set("reference", reference);
  checkoutUrl.searchParams.set("signature:integrity", signature);
  checkoutUrl.searchParams.set("redirect-url", `${process.env.FRONTEND_URL ?? ""}/billing?cart=success`);

  return res.json({ success: true, checkoutUrl: checkoutUrl.toString(), totalUsd, totalCop, lineItems, reference, itemsProcessed: items.map(i => i.type) });
});

export default router;
