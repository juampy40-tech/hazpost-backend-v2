import { Router } from "express";
import { db } from "@workspace/db";
import {
  postsTable,
  subscriptionsTable,
  plansTable,
  appSettingsTable,
} from "@workspace/db";
import { eq, and, desc, gte, inArray, sql } from "drizzle-orm";
import { DEFAULT_COSTS } from "../../lib/creditCosts.js";
import { getActiveBusinessId } from "../../lib/businesses.js";

const router = Router();

const COST_KEYS = [
  "credit_cost_image",
  "credit_cost_story",
  "credit_cost_carousel",
  "credit_cost_reel",
] as const;

async function loadCosts() {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(inArray(appSettingsTable.key, [...COST_KEYS]));
  const m: Record<string, number> = {};
  for (const r of rows) m[r.key] = Number(r.value);
  return {
    image:    isFinite(m["credit_cost_image"])    ? m["credit_cost_image"]    : DEFAULT_COSTS.image,
    story:    isFinite(m["credit_cost_story"])    ? m["credit_cost_story"]    : DEFAULT_COSTS.story,
    carousel: isFinite(m["credit_cost_carousel"]) ? m["credit_cost_carousel"] : DEFAULT_COSTS.carousel,
    reel:     isFinite(m["credit_cost_reel"])     ? m["credit_cost_reel"]     : DEFAULT_COSTS.reel,
  };
}

type CostMap = { image: number; story: number; carousel: number; reel: number };

function costFor(costs: CostMap, contentType: string): number {
  if (contentType === "reel")     return costs.reel;
  if (contentType === "carousel") return costs.carousel;
  if (contentType === "story")    return costs.story;
  return costs.image;
}

/** GET /api/credits/summary
 *  Returns current credit status + plan info for the authenticated user.
 */
router.get("/summary", async (req, res) => {
  try {
    const userId = req.user!.userId;

    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId))
      .limit(1);

    const planKey = sub?.plan ?? "free";

    const [plan] = await db
      .select()
      .from(plansTable)
      .where(eq(plansTable.key, planKey))
      .limit(1);

    const costs = await loadCosts();

    // Compute actual credits used this month from posts generated (month-bounded)
    const bizId = await getActiveBusinessId(userId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthWhere = bizId != null
      ? and(eq(postsTable.userId, userId), eq(postsTable.businessId, bizId), gte(postsTable.createdAt, monthStart))
      : and(eq(postsTable.userId, userId), gte(postsTable.createdAt, monthStart));

    const monthPosts = await db
      .select({ contentType: postsTable.contentType })
      .from(postsTable)
      .where(monthWhere);

    const creditsUsedThisMonth = monthPosts.reduce(
      (sum, p) => sum + costFor(costs, p.contentType),
      0
    );

    res.json({
      creditsRemaining:    sub?.creditsRemaining    ?? 0,
      creditsTotal:        sub?.creditsTotal        ?? 0,
      creditsUsedThisMonth,
      plan:                planKey,
      planName:            plan?.name               ?? planKey,
      planPriceUsd:        plan?.priceUsd           ?? 0,
      costs,
    });
  } catch {
    res.status(500).json({ error: "Error al obtener resumen de créditos" });
  }
});

/** GET /api/credits/history?page=1&limit=30
 *  Returns paginated list of credit consumption events (posts generated),
 *  filtered by the user's active business.
 */
router.get("/history", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const page   = Math.max(1, Number(req.query.page  ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const offset = (page - 1) * limit;

    const bizId = await getActiveBusinessId(userId);
    const costs = await loadCosts();

    // Only show posts from the last 12 months
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);

    const baseWhere = bizId != null
      ? and(eq(postsTable.userId, userId), eq(postsTable.businessId, bizId), gte(postsTable.createdAt, since))
      : and(eq(postsTable.userId, userId), gte(postsTable.createdAt, since));

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(postsTable)
      .where(baseWhere);

    const total = countRow?.total ?? 0;

    const rows = await db
      .select({
        id:          postsTable.id,
        contentType: postsTable.contentType,
        platform:    postsTable.platform,
        niche:       postsTable.niche,
        status:      postsTable.status,
        createdAt:   postsTable.createdAt,
      })
      .from(postsTable)
      .where(baseWhere)
      .orderBy(desc(postsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const history = rows.map(r => ({
      id:          r.id,
      contentType: r.contentType,
      platform:    r.platform,
      niche:       r.niche,
      status:      r.status,
      creditsUsed: costFor(costs, r.contentType),
      createdAt:   r.createdAt,
    }));

    res.json({
      history,
      costs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch {
    res.status(500).json({ error: "Error al obtener historial de créditos" });
  }
});

export default router;
