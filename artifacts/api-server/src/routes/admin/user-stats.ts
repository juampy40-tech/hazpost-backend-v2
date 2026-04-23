import { Router } from "express";
import { db } from "@workspace/db";
import { postsTable, subscriptionsTable, plansTable, appSettingsTable, socialAccountsTable, publishLogTable, businessesTable } from "@workspace/db";
import { eq, and, gte, sql, desc, inArray, not } from "drizzle-orm";
import { DEFAULT_COSTS } from "../../lib/creditCosts.js";
import { testInstagramConnection } from "../../services/instagram.service.js";
import { decryptToken } from "../../lib/tokenEncryption.js";
import { notifyLastAccountDisconnected } from "../../services/telegram.service.js";

const router = Router();

const COST_KEYS = [
  "credit_cost_image",
  "credit_cost_story",
  "credit_cost_carousel",
  "credit_cost_reel",
  "credit_cost_element_ai",
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
    elementAi: isFinite(m["credit_cost_element_ai"]) ? m["credit_cost_element_ai"] : DEFAULT_COSTS.elementAi,
  };
}

function costFor(costs: { image: number; story: number; carousel: number; reel: number }, type: string) {
  if (type === "reel")     return costs.reel;
  if (type === "carousel") return costs.carousel;
  if (type === "story")    return costs.story;
  return costs.image;
}

/** GET /api/admin/users/:id/stats
 *  Returns post counts by type, last publication, credit usage, and platform cost breakdown.
 */
router.get("/:id/stats", async (req, res) => {
  const targetId = Number(req.params.id);
  if (!isFinite(targetId)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    const costs = await loadCosts();

    // All-time post counts by content_type + cost breakdown
    const [typeCounts, lastPub, monthPosts, elementAiResult] = await Promise.all([
      db.select({
        contentType: postsTable.contentType,
        count:        sql<number>`count(*)::int`,
        totalCostUsd: sql<string>`COALESCE(SUM(${postsTable.generationCostUsd}), 0)`,
      })
      .from(postsTable)
      .where(eq(postsTable.userId, targetId))
      .groupBy(postsTable.contentType),

      db.select({ publishedAt: postsTable.publishedAt })
        .from(postsTable)
        .where(and(eq(postsTable.userId, targetId), sql`${postsTable.publishedAt} IS NOT NULL`))
        .orderBy(desc(postsTable.publishedAt))
        .limit(1),

      db.select({ contentType: postsTable.contentType })
        .from(postsTable)
        .where(and(
          eq(postsTable.userId, targetId),
          gte(postsTable.createdAt, new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
        )),

      db.execute(sql`
        SELECT COUNT(DISTINCT post_id)::int AS count
        FROM image_variants
        WHERE user_id = ${targetId} AND style = 'element_ai'
      `),
    ]);

    const elementAiPostCount: number = Number(
      (elementAiResult.rows[0] as { count: number } | undefined)?.count ?? 0
    );

    const creditsUsedThisMonth = monthPosts.reduce(
      (sum, p) => sum + costFor(costs, p.contentType),
      0
    );

    // User's subscription
    const [sub] = await db
      .select({ creditsRemaining: subscriptionsTable.creditsRemaining, creditsTotal: subscriptionsTable.creditsTotal, plan: subscriptionsTable.plan })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, targetId))
      .limit(1);

    // Plan info
    const planKey = sub?.plan ?? "free";
    const [plan] = await db
      .select({ name: plansTable.name, creditsPerMonth: plansTable.creditsPerMonth })
      .from(plansTable)
      .where(eq(plansTable.key, planKey))
      .limit(1);

    // Build type map
    const byType: Record<string, number> = {};
    const costByType: Record<string, number> = {};
    for (const row of typeCounts) {
      byType[row.contentType] = row.count;
      costByType[row.contentType] = Number(row.totalCostUsd);
    }
    const totalPosts = Object.values(byType).reduce((s, v) => s + v, 0);
    const totalCostUsd = Object.values(costByType).reduce((s, v) => s + v, 0);

    res.json({
      byType: {
        image:     byType["image"]    ?? 0,
        story:     byType["story"]    ?? 0,
        carousel:  byType["carousel"] ?? 0,
        reel:      byType["reel"]     ?? 0,
        elementAi: elementAiPostCount,
      },
      costByType: {
        image:    costByType["image"]    ?? 0,
        story:    costByType["story"]    ?? 0,
        carousel: costByType["carousel"] ?? 0,
        reel:     costByType["reel"]     ?? 0,
      },
      elementAiCreditsUsed: elementAiPostCount * costs.elementAi,
      totalCostUsd,
      totalPosts,
      lastPublishedAt:      lastPub?.[0]?.publishedAt ?? null,
      creditsUsedThisMonth,
      creditsRemaining:     sub?.creditsRemaining ?? 0,
      creditsTotal:         sub?.creditsTotal     ?? 0,
      planKey,
      planName:             plan?.name            ?? planKey,
      planCreditsPerMonth:  plan?.creditsPerMonth ?? 0,
      costs,
    });
  } catch {
    res.status(500).json({ error: "Error al obtener estadísticas del usuario" });
  }
});

/** GET /api/admin/users/:id/social-diagnostic
 *  Returns all social accounts for a user with diagnostic status.
 *  Admins use this to identify IG_NOT_LINKED and other connection issues.
 */
router.get("/:id/social-diagnostic", async (req, res) => {
  const targetId = Number(req.params.id);
  if (!isFinite(targetId)) return res.status(400).json({ error: "ID inválido" });

  try {
    const accounts = await db
      .select({
        id: socialAccountsTable.id,
        platform: socialAccountsTable.platform,
        username: socialAccountsTable.username,
        pageId: socialAccountsTable.pageId,
        igUserId: socialAccountsTable.igUserId,
        connected: socialAccountsTable.connected,
        hasToken: sql<boolean>`${socialAccountsTable.accessToken} IS NOT NULL`,
        tokenExpiresAt: socialAccountsTable.tokenExpiresAt,
        businessId: socialAccountsTable.businessId,
        updatedAt: socialAccountsTable.updatedAt,
      })
      .from(socialAccountsTable)
      .where(eq(socialAccountsTable.userId, targetId))
      .orderBy(socialAccountsTable.platform);

    // Last publish_log entry per platform (to show recent activity)
    const recentLogs = await db
      .select({
        platform: publishLogTable.platform,
        status: publishLogTable.status,
        errorMessage: publishLogTable.errorMessage,
        publishedAt: publishLogTable.publishedAt,
      })
      .from(publishLogTable)
      .where(
        sql`${publishLogTable.postId} IN (
          SELECT id FROM posts WHERE user_id = ${targetId}
        )`
      )
      .orderBy(desc(publishLogTable.publishedAt))
      .limit(20);

    // Aggregate: last result per platform
    const lastByPlatform: Record<string, { status: string; errorMessage: string | null; publishedAt: Date | null }> = {};
    for (const log of recentLogs) {
      if (!lastByPlatform[log.platform]) {
        lastByPlatform[log.platform] = {
          status: log.status,
          errorMessage: log.errorMessage,
          publishedAt: log.publishedAt,
        };
      }
    }

    res.json({ accounts, lastByPlatform });
  } catch {
    res.status(500).json({ error: "Error al obtener diagnóstico de cuentas sociales" });
  }
});

/** POST /api/admin/users/:id/social-accounts/instagram/refresh-ig
 *  Re-queries Meta API to resolve ig_user_id for the user's Instagram account.
 *  Use after the user links their Instagram Business to their Facebook Page on Meta.
 *  Does NOT require the user to redo OAuth — it reuses the stored page access token.
 */
router.post("/:id/social-accounts/instagram/refresh-ig", async (req, res) => {
  const targetId = Number(req.params.id);
  if (!isFinite(targetId)) return res.status(400).json({ error: "ID inválido" });

  try {
    const [account] = await db
      .select()
      .from(socialAccountsTable)
      .where(and(
        eq(socialAccountsTable.userId, targetId),
        eq(socialAccountsTable.platform, "instagram"),
      ))
      .limit(1);

    if (!account?.accessToken) {
      return res.status(404).json({ error: "No hay cuenta de Instagram configurada para este usuario." });
    }

    const decryptedToken = decryptToken(account.accessToken);
    const result = await testInstagramConnection(decryptedToken, account.pageId ?? "");

    // Only update ig_user_id if Meta returned a positive result.
    // NEVER clear an existing manually-set ig_user_id when Meta API fails or returns null —
    // same anti-pattern as the test endpoint bug (15 abr 2026).
    if (result.igId) {
      await db
        .update(socialAccountsTable)
        .set({ igUserId: result.igId, updatedAt: new Date() })
        .where(eq(socialAccountsTable.id, account.id));
    }

    res.json({
      igUserId: result.igId ?? account.igUserId ?? null,
      instagramLinked: result.instagramLinked || !!account.igUserId,
      username: result.username,
      message: result.message,
    });
  } catch {
    res.status(500).json({ error: "Error al refrescar conexión de Instagram" });
  }
});

/** POST /api/admin/users/:id/social-accounts/instagram/set-ig-id
 *  Manually override the ig_user_id for a user's Instagram account.
 *  Use when Meta's API fails to return instagram_business_account / connected_instagram_account
 *  and you can visually confirm the IG account ID from the Meta OAuth dialog or Graph Explorer.
 *  The ID can be obtained from the Meta OAuth dialog (shown when the user selects their IG account)
 *  or from: graph.facebook.com/{page_id}?fields=instagram_business_account,connected_instagram_account
 */
router.post("/:id/social-accounts/instagram/set-ig-id", async (req, res) => {
  const targetId = Number(req.params.id);
  if (!isFinite(targetId)) return res.status(400).json({ error: "ID inválido" });

  const { igUserId } = req.body as { igUserId?: string };
  if (!igUserId || !/^\d+$/.test(igUserId.trim())) {
    return res.status(400).json({ error: "igUserId debe ser un número (el ID de la cuenta de Instagram Business/Creator)." });
  }

  try {
    const [account] = await db
      .select()
      .from(socialAccountsTable)
      .where(and(
        eq(socialAccountsTable.userId, targetId),
        eq(socialAccountsTable.platform, "instagram"),
      ))
      .limit(1);

    if (!account) {
      return res.status(404).json({ error: "No hay cuenta de Instagram configurada para este usuario." });
    }

    await db
      .update(socialAccountsTable)
      .set({ igUserId: igUserId.trim(), updatedAt: new Date() })
      .where(eq(socialAccountsTable.id, account.id));

    res.json({ ok: true, igUserId: igUserId.trim(), message: `IG ID actualizado a ${igUserId.trim()} para ${account.username ?? "la cuenta"}.` });
  } catch {
    res.status(500).json({ error: "Error al actualizar ig_user_id" });
  }
});

/** DELETE /api/admin/users/:id/social-accounts/:platform
 *  Removes a social account connection for a user, forcing them to reconnect.
 *  Use when the user connected the wrong Facebook Page and needs to start fresh.
 *  Also sends a proactive Telegram alert to the user for each affected business
 *  that ends up with zero connected accounts after the deletion.
 */
router.delete("/:id/social-accounts/:platform", async (req, res) => {
  const targetId = Number(req.params.id);
  const platform = req.params.platform as string;
  if (!isFinite(targetId)) return res.status(400).json({ error: "ID inválido" });
  if (!["instagram", "facebook", "tiktok"].includes(platform)) {
    return res.status(400).json({ error: "Plataforma inválida. Usa: instagram, facebook, tiktok." });
  }

  try {
    // Snapshot the affected business IDs before deletion so we can check them after.
    const affectedPlatforms = (platform === "instagram" || platform === "facebook")
      ? ["instagram", "facebook"]
      : [platform];

    const affectedRows = await db
      .select({ businessId: socialAccountsTable.businessId })
      .from(socialAccountsTable)
      .where(and(
        eq(socialAccountsTable.userId, targetId),
        sql`${socialAccountsTable.platform} IN (${sql.join(affectedPlatforms.map(p => sql`${p}`), sql`, `)})`,
      ));
    const affectedBizIds = [...new Set(affectedRows.map(r => r.businessId).filter((id): id is number => id != null))];

    // For Meta: instagram and facebook share the same page — delete both together
    let deletedCount = 0;
    if (platform === "instagram" || platform === "facebook") {
      const deleted = await db
        .delete(socialAccountsTable)
        .where(and(
          eq(socialAccountsTable.userId, targetId),
          sql`${socialAccountsTable.platform} IN ('instagram', 'facebook')`,
        ))
        .returning({ id: socialAccountsTable.id });
      deletedCount = deleted.length;
    } else {
      const deleted = await db
        .delete(socialAccountsTable)
        .where(and(
          eq(socialAccountsTable.userId, targetId),
          eq(socialAccountsTable.platform, platform),
        ))
        .returning({ id: socialAccountsTable.id });
      deletedCount = deleted.length;
    }

    // Proactive alert: only fire if rows were actually removed and at least one
    // business now has zero connected accounts — avoids spurious alerts on no-op deletes.
    if (deletedCount > 0 && affectedBizIds.length > 0) {
      Promise.all(affectedBizIds.map(async (bizId) => {
        try {
          const remaining = await db
            .select({ id: socialAccountsTable.id })
            .from(socialAccountsTable)
            .where(and(
              eq(socialAccountsTable.userId, targetId),
              eq(socialAccountsTable.businessId, bizId),
              eq(socialAccountsTable.connected, "true"),
            ))
            .limit(1);
          if (remaining.length > 0) return;

          const [biz] = await db
            .select({ name: businessesTable.name })
            .from(businessesTable)
            .where(and(eq(businessesTable.id, bizId), eq(businessesTable.userId, targetId)))
            .limit(1);
          const bizName = biz?.name ?? `negocio #${bizId}`;
          await notifyLastAccountDisconnected(bizName, bizId, targetId);
        } catch { /* silently ignore per-business errors */ }
      })).catch(() => {});
    }

    if (platform === "instagram" || platform === "facebook") {
      return res.json({ ok: true, message: "Conexión de Instagram y Facebook eliminada. El usuario debe reconectar su cuenta de Meta." });
    }
    res.json({ ok: true, message: `Conexión de ${platform} eliminada. El usuario debe reconectar.` });
  } catch {
    res.status(500).json({ error: "Error al eliminar cuenta social" });
  }
});

/** GET /api/admin/users/:id/businesses
 *  Lists all businesses for a user with post counts and activity data.
 *  Used by admin to identify and clean up test/duplicate businesses.
 */
router.get("/:id/businesses", async (req, res) => {
  const targetId = Number(req.params.id);
  if (!isFinite(targetId)) return res.status(400).json({ error: "ID inválido" });

  try {
    const rows = await db
      .select({
        id: businessesTable.id,
        name: businessesTable.name,
        industry: businessesTable.industry,
        isActive: businessesTable.isActive,
        autoGenerationEnabled: businessesTable.autoGenerationEnabled,
        createdAt: businessesTable.createdAt,
        postCount: sql<number>`(SELECT COUNT(*)::int FROM posts WHERE business_id = ${businessesTable.id})`,
        lastPostAt: sql<string | null>`(SELECT MAX(created_at) FROM posts WHERE business_id = ${businessesTable.id})`,
        hasLogo: sql<boolean>`(${businessesTable.logoUrl} IS NOT NULL)`,
      })
      .from(businessesTable)
      .where(eq(businessesTable.userId, targetId))
      .orderBy(desc(businessesTable.createdAt));

    res.json({ businesses: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: "Error al listar negocios" });
  }
});

/** POST /api/admin/users/:id/businesses/deactivate-bulk
 *  Deactivates a list of business IDs for the user, disabling auto-generation too.
 *  Safety guards: cannot deactivate IDs that don't belong to the user; requires at least 1 business to remain active.
 *  Body: { businessIds: number[] }
 */
router.post("/:id/businesses/deactivate-bulk", async (req, res) => {
  const targetId = Number(req.params.id);
  if (!isFinite(targetId)) return res.status(400).json({ error: "ID inválido" });

  const { businessIds } = req.body as { businessIds?: number[] };
  if (!Array.isArray(businessIds) || businessIds.length === 0) {
    return res.status(400).json({ error: "Se requiere businessIds: number[]" });
  }
  const ids = businessIds.map(Number).filter(isFinite);
  if (ids.length === 0) return res.status(400).json({ error: "IDs inválidos" });

  try {
    // Verify ownership: all requested IDs must belong to the target user
    const owned = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, targetId), inArray(businessesTable.id, ids)));

    if (owned.length !== ids.length) {
      return res.status(403).json({ error: "Algunos IDs no pertenecen al usuario" });
    }

    // Safety: the user must have at least one business NOT in the deactivation list
    const allBizIds = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.userId, targetId));

    const remainingActive = allBizIds.filter(b => !ids.includes(b.id));
    if (remainingActive.length === 0) {
      return res.status(400).json({ error: "No se puede desactivar todos los negocios — debe quedar al menos uno activo" });
    }

    // Deactivate: set isActive=false, autoGenerationEnabled=false
    await db
      .update(businessesTable)
      .set({ isActive: false, autoGenerationEnabled: false })
      .where(and(eq(businessesTable.userId, targetId), inArray(businessesTable.id, ids)));

    res.json({ ok: true, deactivated: ids.length, remaining: remainingActive.length });
  } catch (e) {
    res.status(500).json({ error: "Error al desactivar negocios" });
  }
});

export default router;
