import { Router } from "express";
import { db } from "@workspace/db";
import { nichesTable, postsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateNicheBody, GetNicheParams, UpdateNicheParams, UpdateNicheBody, DeleteNicheParams } from "@workspace/api-zod";
import { runNicheInsightsReport } from "../../services/scheduler.service.js";
import { requireAdmin } from "../../lib/auth.js";
import { getActiveBusinessId } from "../../lib/businesses.js";
import { tenantFilterCol } from "../../lib/tenant.js";
import type { Request } from "express";

const router = Router();

function tenantFilter(req: Request) {
  return tenantFilterCol(nichesTable.userId, req);
}

router.get("/", async (req, res) => {
  // ?scope=all → admin-only: returns every niche in the system (for admin panel)
  const scopeAll = req.query.scope === "all" && req.user!.role === "admin";
  if (scopeAll) {
    const niches = await db.select().from(nichesTable).orderBy(nichesTable.createdAt);
    return res.json(niches);
  }

  // Normal mode: filter by userId + active businessId (applies to both admin and regular users)
  const userId = req.user!.userId;
  const bizId = await getActiveBusinessId(userId);
  const conditions = [eq(nichesTable.userId, userId)];
  if (bizId != null) {
    conditions.push(eq(nichesTable.businessId, bizId));
  }
  const niches = await db.select().from(nichesTable)
    .where(and(...conditions))
    .orderBy(nichesTable.createdAt);
  res.json(niches);
});

router.post("/", async (req, res) => {
  const body = CreateNicheBody.parse(req.body);
  const userId = req.user!.userId;
  const bizId = await getActiveBusinessId(userId);
  const [niche] = await db.insert(nichesTable).values({
    name: body.name,
    description: body.description ?? "",
    keywords: body.keywords ?? "",
    active: body.active ?? true,
    userId,
    ...(bizId != null && { businessId: bizId }),
    ...(body.customText != null && { customText: body.customText }),
    ...(body.customTextPosition != null && { customTextPosition: body.customTextPosition }),
  }).returning();
  res.status(201).json(niche);
});

router.get("/:id", async (req, res) => {
  const { id } = GetNicheParams.parse({ id: Number(req.params.id) });
  const tf = tenantFilter(req);
  const cond = tf ? and(eq(nichesTable.id, id), tf) : eq(nichesTable.id, id);
  const [niche] = await db.select().from(nichesTable).where(cond);
  if (!niche) return res.status(404).json({ error: "Niche not found" });
  return res.json(niche);
});

router.put("/:id", async (req, res) => {
  const { id } = UpdateNicheParams.parse({ id: Number(req.params.id) });
  const body = UpdateNicheBody.parse(req.body);
  const tf = tenantFilter(req);
  const cond = tf ? and(eq(nichesTable.id, id), tf) : eq(nichesTable.id, id);
  const [niche] = await db.update(nichesTable).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.keywords !== undefined && { keywords: body.keywords }),
    ...(body.active !== undefined && { active: body.active }),
    ...("customText" in body && { customText: body.customText ?? null }),
    ...(body.customTextPosition !== undefined && { customTextPosition: body.customTextPosition }),
    updatedAt: new Date(),
  }).where(cond).returning();
  if (!niche) return res.status(404).json({ error: "Niche not found" });
  return res.json(niche);
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteNicheParams.parse({ id: Number(req.params.id) });
  const tf = tenantFilter(req);
  const cond = tf ? and(eq(nichesTable.id, id), tf) : eq(nichesTable.id, id);
  await db.delete(nichesTable).where(cond);
  res.json({ success: true, message: "Niche deleted" });
});

/**
 * POST /api/niches/suggest
 * Asks the AI to suggest up to 6 new niches for the current user.
 * Combines coverage-gap analysis (global catalogue they haven't activated)
 * with performance-based patterns (segments similar to their best-performing niches).
 * Returns suggestions only — nothing is saved until the user approves.
 */
router.post("/suggest", async (req, res) => {
  try {
    const { suggestNichesForUser } = await import("../../services/ai.service.js");
    // businessId is optional: if provided, scopes suggestions to that business.
    // This prevents niche contamination in multi-business accounts.
    const businessId = typeof req.body?.businessId === "number" ? req.body.businessId : undefined;
    const suggestions = await suggestNichesForUser(req.user!.userId, businessId);
    res.json({ suggestions });
  } catch (err) {
    console.error("[POST /niches/suggest]", err);
    res.status(500).json({ error: "No se pudieron generar sugerencias. Intenta de nuevo." });
  }
});

/**
 * POST /api/niches/insights/run
 * Manually triggers the weekly niche performance report + AI suggestions.
 * Sends result to Telegram and returns the analysis JSON.
 */
router.post("/insights/run", requireAdmin, async (req, res) => {
  try {
    const { analyzeAndSuggestNiches } = await import("../../services/ai.service.js");
    const { notifyNicheInsights } = await import("../../services/telegram.service.js");
    const analysis = await analyzeAndSuggestNiches();
    void notifyNicheInsights(analysis);
    res.json({ ok: true, analysis });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
