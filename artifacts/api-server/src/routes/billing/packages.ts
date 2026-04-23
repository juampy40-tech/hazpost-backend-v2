import { Router } from "express";
import { db } from "@workspace/db";
import { subscriptionsTable, creditPurchasesTable, appSettingsTable, businessesTable, nichesTable, plansTable, industryGroupsTable } from "@workspace/db";
import { eq, inArray, and, sql as drizzleSql } from "drizzle-orm";
import { requireAdmin } from "../../lib/auth.js";
import { getCurrentTrm, computeCopPrice } from "../../services/trm.service.js";
import { auditLog, AuditAction } from "../../lib/audit.js";

const router = Router();

const PACK_KEY = "credit_pack_100";

/** Reads the credit pack config from app_settings (admin-editable).
 *  priceCop is computed dynamically: round(TRM × priceUsd × 1.05). */
async function loadCreditPackConfig() {
  const keys = ["credit_pack_price_usd", "credit_pack_credits"];
  const [rows, trm] = await Promise.all([
    db.select().from(appSettingsTable).where(inArray(appSettingsTable.key, keys)),
    getCurrentTrm(),
  ]);
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value;
  const priceUsd = parseFloat(m["credit_pack_price_usd"] ?? "19.99");
  return {
    priceUsd,
    priceCop:     computeCopPrice(priceUsd, trm),
    creditsAdded: parseInt(m["credit_pack_credits"] ?? "100", 10),
  };
}

/** GET /api/billing/packages — list available extra packages for the current plan */
router.get("/packages", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)).limit(1);
    const plan = sub?.plan ?? "free";

    let packages: object[] = [];
    if (plan !== "free") {
      const cfg = await loadCreditPackConfig();
      packages = [{
        key:          PACK_KEY,
        name:         "Paquete de créditos",
        description:  `${cfg.creditsAdded} créditos extra para cualquier tipo de contenido`,
        priceUsd:     cfg.priceUsd,
        priceCop:     cfg.priceCop,
        creditsAdded: cfg.creditsAdded,
        reelsAdded:   0,
      }];
    }

    res.json({
      packages,
      plan,
      credits: {
        remaining:      sub?.creditsRemaining ?? 0,
        total:          sub?.creditsTotal     ?? 0,
        reelsRemaining: sub?.reelsRemaining   ?? 0,
        reelsTotal:     sub?.reelsTotal       ?? 0,
      },
    });
  } catch {
    res.status(500).json({ error: "Error al obtener paquetes" });
  }
});

/** POST /api/billing/buy-extra — record a credit package purchase */
router.post("/buy-extra", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { packageKey, wompiTransactionId } = req.body;
    if (!packageKey) return res.status(400).json({ error: "packageKey es requerido" });

    const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)).limit(1);
    const plan = sub?.plan ?? "free";

    if (plan === "free") {
      return res.status(403).json({ error: "El plan Gratis no puede comprar paquetes. Actualiza tu plan." });
    }

    if (packageKey !== PACK_KEY) {
      return res.status(404).json({ error: "Paquete no encontrado" });
    }

    // Read current admin-configured values at purchase time
    const cfg = await loadCreditPackConfig();

    const [purchase] = await db.insert(creditPurchasesTable).values({
      userId,
      packageKey,
      priceUsd:    cfg.priceUsd,
      priceCop:    cfg.priceCop,
      creditsAdded: cfg.creditsAdded,
      reelsAdded:  0,
      wompiTransactionId: null, // Never trust client-provided transaction ID
      status:      "pending",
    }).returning();

    res.json({ purchase, message: "Paquete registrado — pendiente de confirmación de pago" });
  } catch (err) {
    console.error("[buy-extra]", err);
    res.status(500).json({ error: "Error al procesar compra" });
  }
});

/** POST /api/billing/confirm-purchase/:id — admin-only: confirm and apply credits for a purchase.
 *  In production this is called by the Wompi webhook handler (or admin) only — never by end users. */
router.post("/confirm-purchase/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { wompiTransactionId, status } = req.body;
    const [purchase] = await db.select().from(creditPurchasesTable).where(eq(creditPurchasesTable.id, Number(id)));
    if (!purchase) return res.status(404).json({ error: "Compra no encontrada" });
    if (purchase.status === "completed") return res.json({ message: "Ya confirmada" });

    await db.update(creditPurchasesTable)
      .set({ status, wompiTransactionId: wompiTransactionId ?? purchase.wompiTransactionId, updatedAt: new Date() })
      .where(eq(creditPurchasesTable.id, Number(id)));

    if (status === "completed") {
      const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, purchase.userId)).limit(1);
      if (sub) {
        await db.update(subscriptionsTable).set({
          creditsRemaining: sub.creditsRemaining + purchase.creditsAdded,
          creditsTotal:     sub.creditsTotal     + purchase.creditsAdded,
          updatedAt:        new Date(),
        }).where(eq(subscriptionsTable.userId, purchase.userId));
      }
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Error al confirmar compra" });
  }
});

/** Starter niches auto-assigned when a new business is created via the extra-slot purchase. */
const EXTRA_BIZ_STARTER_NICHES = [
  { name: "Tips y consejos",         description: "Contenido educativo con tips prácticos para la audiencia objetivo del negocio.", keywords: "tips, consejos, educativo, aprendizaje" },
  { name: "Testimonios y resultados", description: "Casos de éxito, reseñas de clientes y resultados reales obtenidos.",           keywords: "testimonios, resultados, éxito, clientes" },
  { name: "Productos y servicios",    description: "Presentación de los productos, servicios y propuesta de valor del negocio.",    keywords: "productos, servicios, oferta, valor" },
];

/** Resolves industryGroupSlug by matching industry name against active industry_groups keywords. */
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

/**
 * POST /api/billing/buy-extra-business
 *
 * Purchases one extra business slot for the authenticated user and immediately creates
 * the requested business. ISOLATION GUARANTEE: every DB operation is scoped to
 * userId = req.user!.userId (JWT-verified). The request body cannot influence which
 * user or subscription is modified.
 *
 * Flow:
 * 1. Validate plan supports extra businesses (agency | business).
 * 2. Record the purchase in credit_purchases (pending — confirmed by admin/Wompi later).
 * 3. In a single transaction:
 *    a. Increment subscriptions.extra_business_slots for THIS user only.
 *    b. Add extra credits to subscriptions.credits_remaining + credits_total.
 *    c. Create the requested business scoped to THIS user.
 *    d. Seed starter niches scoped to THIS user + the new business ID.
 * 4. Log to audit_logs.
 */
router.post("/buy-extra-business", async (req, res) => {
  // SECURITY: userId is ALWAYS from the JWT — never from req.body.
  const userId = req.user!.userId;

  try {
    const { pendingBusiness, annual } = req.body as {
      pendingBusiness?: { name?: string; industry?: string; subIndustry?: string; description?: string };
      annual?: boolean;
    };

    if (!pendingBusiness?.name?.trim()) {
      return res.status(400).json({ error: "El nombre del negocio es obligatorio" });
    }

    // 1. Read plan + plan definition — scoped to THIS user.
    const [sub] = await db.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId))
      .limit(1);
    const plan = sub?.plan ?? "free";

    if (plan !== "agency" && plan !== "business") {
      return res.status(403).json({ error: "Tu plan no permite negocios adicionales pagados. Actualiza a plan Negocio o Agencia." });
    }

    const [planDef] = await db.select().from(plansTable).where(eq(plansTable.key, plan));
    const priceUsdMonthly  = planDef?.extraBusinessPriceUsd ?? 0;
    const priceUsdAnnual   = planDef?.extraBusinessPriceAnnualUsd ?? 0;
    const extraCredits     = planDef?.extraBusinessCredits ?? (plan === "agency" ? 220 : 100);

    if (priceUsdMonthly <= 0) {
      return res.status(400).json({ error: "Este plan no tiene configurado un precio para negocios adicionales." });
    }

    const useAnnual = Boolean(annual) && priceUsdAnnual > 0;
    const priceUsd  = useAnnual ? priceUsdAnnual : priceUsdMonthly;
    const trm       = await getCurrentTrm();
    const priceCop  = computeCopPrice(priceUsd, trm);

    // 2. Record the purchase (pending — Wompi confirmation applies credits externally).
    //    packageKey is scoped to the plan to keep audit trail clean.
    const packageKey = `extra_business_slot_${plan}_${useAnnual ? "annual" : "monthly"}`;
    const [purchase] = await db.insert(creditPurchasesTable).values({
      userId,                     // THIS user — never from body
      packageKey,
      priceUsd,
      priceCop,
      creditsAdded: extraCredits,
      reelsAdded:   0,
      postsAdded:   0,
      status:       "pending",    // Will be confirmed by admin/Wompi webhook
      wompiTransactionId: null,
    }).returning();

    // 3. Atomic transaction: expand slot + add credits + create business + seed niches.
    //    ALL operations are anchored to userId from JWT.
    const industryGroupSlug = await resolveIndustryGroupSlug(pendingBusiness.industry);
    const existingCount = await db.$count(businessesTable,
      and(eq(businessesTable.userId, userId), eq(businessesTable.isActive, true))
    );

    let newBusiness: { id: number; name: string } | undefined;
    await db.transaction(async (tx) => {
      // a. Increment extra_business_slots for THIS user only — uses WHERE user_id = userId.
      await tx.update(subscriptionsTable)
        .set({
          extraBusinessSlots: drizzleSql`extra_business_slots + 1`,
          creditsRemaining:   drizzleSql`credits_remaining + ${extraCredits}`,
          creditsTotal:       drizzleSql`credits_total + ${extraCredits}`,
          updatedAt:          new Date(),
        })
        .where(eq(subscriptionsTable.userId, userId));

      // b. Create the business — userId from JWT, never from body.
      const [biz] = await tx.insert(businessesTable).values({
        userId,                                         // JWT-scoped
        name:               pendingBusiness.name!.trim(),
        industry:           pendingBusiness.industry?.trim() ?? null,
        subIndustry:        pendingBusiness.subIndustry?.trim() ?? null,
        description:        pendingBusiness.description?.trim() ?? null,
        isDefault:          existingCount === 0,
        sortOrder:          existingCount,
        ...(industryGroupSlug ? { industryGroupSlug } : {}),
      }).returning();
      newBusiness = biz;

      // c. Seed starter niches — both userId AND businessId are scoped to THIS user's business.
      await tx.insert(nichesTable).values(
        EXTRA_BIZ_STARTER_NICHES.map(n => ({
          ...n,
          active:     true,
          userId,                // JWT-scoped
          businessId: biz.id,    // just created, belongs to this user
        }))
      ).onConflictDoNothing();
    });

    // 4. Audit log — non-blocking.
    void auditLog({
      userId,
      businessId: newBusiness?.id,
      action: AuditAction.EXTRA_BUSINESS_SLOT_PURCHASED,
      entityType: "extra_business_slot",
      entityId: purchase.id,
      metadata: {
        plan,
        packageKey,
        priceUsd,
        priceCop,
        extraCredits,
        annual: useAnnual,
        businessName: pendingBusiness.name,
      },
    });

    return res.status(201).json({
      success:      true,
      business:     newBusiness,
      purchaseId:   purchase.id,
      creditsAdded: extraCredits,
      message:      `Negocio creado. Se agendó el cobro de $${priceUsd.toFixed(2)} USD. Los +${extraCredits} créditos ya están disponibles.`,
    });
  } catch (err) {
    console.error("[buy-extra-business]", err);
    return res.status(500).json({ error: "Error al procesar la compra del negocio adicional" });
  }
});

export default router;
