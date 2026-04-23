import { Router } from "express";
import { db } from "@workspace/db";
import { postsTable, publishLogTable, socialAccountsTable, appSettingsTable, usersTable } from "@workspace/db";
import { eq, and, isNotNull, sql, desc, gte, lte } from "drizzle-orm";
import type { Request } from "express";
import { decryptToken } from "../../lib/tokenEncryption.js";
import { requireAdmin } from "../../lib/auth.js";
import { syncPublishedPostMetrics, refreshInstagramAudience } from "../../services/scheduler.service.js";
import { resolveIgIdFromPageApi } from "../../services/instagram.service.js";
import { getActiveBusinessId } from "../../lib/businesses.js";
import { logger } from "../../lib/logger.js";
import { fetchPostingSuggestionsInternal } from "../../lib/postingSchedule.js";

const router = Router();

function tenantCond(req: Request) {
  if (req.user!.role === "admin") return undefined;
  return eq(postsTable.userId, req.user!.userId);
}

/** Returns userId + businessId conditions for analytics queries.
 *  Applies to all users including admins — admins see their own active business data,
 *  not data from every user in the system.
 *
 *  Query param overrides (set by the frontend business selector):
 *    ?allBusinesses=1    → show all businesses for this user (no businessId filter)
 *    ?businessId=N       → show only business N (still scoped to the authenticated user)
 *    (default)           → use the user's active/default business
 */
async function tenantCondWithBusiness(req: Request) {
  const userId = req.user!.userId;
  const userCond = eq(postsTable.userId, userId);

  if (req.query.allBusinesses === "1") {
    return userCond;
  }

  const bizIdParam = req.query.businessId;
  if (bizIdParam !== undefined && !isNaN(Number(bizIdParam))) {
    return and(userCond, eq(postsTable.businessId, Number(bizIdParam)));
  }

  const bizId = await getActiveBusinessId(userId);
  if (bizId == null) return userCond;
  return and(userCond, eq(postsTable.businessId, bizId));
}

router.get("/summary", async (req, res) => {
  const tc = await tenantCondWithBusiness(req);

  const [statusCounts] = await db
    .select({
      total:     sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${postsTable.status} = 'published')::int`,
      scheduled: sql<number>`count(*) filter (where ${postsTable.status} = 'scheduled')::int`,
      pending:   sql<number>`count(*) filter (where ${postsTable.status} = 'pending_approval')::int`,
      failed:    sql<number>`count(*) filter (where ${postsTable.status} = 'failed')::int`,
    })
    .from(postsTable)
    .where(tc);

  const byPlatform = await db
    .select({
      platform: postsTable.platform,
      count:    sql<number>`count(*)::int`,
      likes:    sql<number>`coalesce(sum(${postsTable.likes}), 0)::int`,
      comments: sql<number>`coalesce(sum(${postsTable.comments}), 0)::int`,
      shares:   sql<number>`coalesce(sum(${postsTable.shares}), 0)::int`,
      reach:    sql<number>`coalesce(sum(${postsTable.reach}), 0)::int`,
      saves:    sql<number>`coalesce(sum(${postsTable.saves}), 0)::int`,
    })
    .from(postsTable)
    .where(tc ? and(eq(postsTable.status, "published"), tc) : eq(postsTable.status, "published"))
    .groupBy(postsTable.platform);

  const byContentType = await db
    .select({
      contentType: postsTable.contentType,
      count:       sql<number>`count(*)::int`,
      likes:       sql<number>`coalesce(sum(${postsTable.likes}), 0)::int`,
      comments:    sql<number>`coalesce(sum(${postsTable.comments}), 0)::int`,
      shares:      sql<number>`coalesce(sum(${postsTable.shares}), 0)::int`,
      reach:       sql<number>`coalesce(sum(${postsTable.reach}), 0)::int`,
      saves:       sql<number>`coalesce(sum(${postsTable.saves}), 0)::int`,
    })
    .from(postsTable)
    .where(tc ? and(eq(postsTable.status, "published"), tc) : eq(postsTable.status, "published"))
    .groupBy(postsTable.contentType);

  const byDayOfWeek = await db
    .select({
      day:    sql<number>`extract(dow from ${postsTable.publishedAt})::int`,
      count:  sql<number>`count(*)::int`,
      likes:  sql<number>`coalesce(sum(${postsTable.likes}), 0)::int`,
      reach:  sql<number>`coalesce(sum(${postsTable.reach}), 0)::int`,
    })
    .from(postsTable)
    .where(tc ? and(eq(postsTable.status, "published"), isNotNull(postsTable.publishedAt), tc) : and(eq(postsTable.status, "published"), isNotNull(postsTable.publishedAt)))
    .groupBy(sql`extract(dow from ${postsTable.publishedAt})`);

  const byHour = await db
    .select({
      hour:   sql<number>`extract(hour from ${postsTable.publishedAt} at time zone 'America/Bogota')::int`,
      count:  sql<number>`count(*)::int`,
      likes:  sql<number>`coalesce(sum(${postsTable.likes}), 0)::int`,
    })
    .from(postsTable)
    .where(tc ? and(eq(postsTable.status, "published"), isNotNull(postsTable.publishedAt), tc) : and(eq(postsTable.status, "published"), isNotNull(postsTable.publishedAt)))
    .groupBy(sql`extract(hour from ${postsTable.publishedAt} at time zone 'America/Bogota')`);

  // Top posts ordered by computed engagement rate (likes + saves*2 + comments) / reach
  const topPosts = await db
    .select({
      id:          postsTable.id,
      platform:    postsTable.platform,
      contentType: postsTable.contentType,
      caption:     postsTable.caption,
      hashtags:    postsTable.hashtags,
      likes:       postsTable.likes,
      comments:    postsTable.comments,
      shares:      postsTable.shares,
      reach:       postsTable.reach,
      saves:       postsTable.saves,
      publishedAt: postsTable.publishedAt,
    })
    .from(postsTable)
    .where(tc ? and(eq(postsTable.status, "published"), isNotNull(postsTable.likes), tc) : and(eq(postsTable.status, "published"), isNotNull(postsTable.likes)))
    .orderBy(
      desc(
        sql`case when coalesce(${postsTable.reach}, 0) > 0
          then (coalesce(${postsTable.likes}, 0) + coalesce(${postsTable.saves}, 0) * 2 + coalesce(${postsTable.comments}, 0))::float / ${postsTable.reach}
          else coalesce(${postsTable.likes}, 0)::float end`
      )
    )
    .limit(5);

  const publishLog = await db
    .select({
      platform: publishLogTable.platform,
      status:   publishLogTable.status,
      count:    sql<number>`count(*)::int`,
    })
    .from(publishLogTable)
    .where(tc ? eq(publishLogTable.userId, req.user!.userId) : undefined)
    .groupBy(publishLogTable.platform, publishLogTable.status);

  const totalEngagement = byPlatform.reduce((acc, p) => ({
    likes:    acc.likes    + (p.likes    ?? 0),
    comments: acc.comments + (p.comments ?? 0),
    shares:   acc.shares   + (p.shares   ?? 0),
    reach:    acc.reach    + (p.reach    ?? 0),
    saves:    acc.saves    + (p.saves    ?? 0),
  }), { likes: 0, comments: 0, shares: 0, reach: 0, saves: 0 });

  // Enrich byPlatform with engagement rate
  const byPlatformEnriched = byPlatform.map(p => {
    const score = (p.likes ?? 0) + (p.saves ?? 0) * 2 + (p.comments ?? 0);
    const er = (p.reach ?? 0) > 0 ? Math.round((score / p.reach!) * 1000) / 10 : 0;
    return { ...p, engagementRate: er };
  });

  res.json({
    overview: { ...statusCounts, ...totalEngagement },
    byPlatform: byPlatformEnriched,
    byContentType,
    byDayOfWeek,
    byHour,
    topPosts,
    publishLog,
  });
});

router.patch("/posts/:id/metrics", async (req, res) => {
  const id = Number(req.params.id);
  const tc = tenantCond(req);
  const cond = tc ? and(eq(postsTable.id, id), tc) : eq(postsTable.id, id);
  const { likes, comments, shares, reach, saves } = req.body;
  const [updated] = await db
    .update(postsTable)
    .set({
      ...(likes    != null && { likes:    Number(likes) }),
      ...(comments != null && { comments: Number(comments) }),
      ...(shares   != null && { shares:   Number(shares) }),
      ...(reach    != null && { reach:    Number(reach) }),
      ...(saves    != null && { saves:    Number(saves) }),
      updatedAt: new Date(),
    })
    .where(cond)
    .returning();
  if (!updated) return res.status(404).json({ error: "Post not found" });
  return res.json(updated);
});

// GET /analytics/publishing-cadence — posts per week for the last 12 weeks (Bogotá timezone)
router.get("/publishing-cadence", async (req, res) => {
  try {
    const tc = await tenantCondWithBusiness(req);
    const rows = await db
      .select({
        week:  sql<string>`to_char(date_trunc('week', ${postsTable.publishedAt} at time zone 'America/Bogota'), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
        contentType: postsTable.contentType,
      })
      .from(postsTable)
      .where(
        tc
          ? and(eq(postsTable.status, "published"), isNotNull(postsTable.publishedAt), gte(postsTable.publishedAt, sql`now() - interval '12 weeks'`), tc)
          : and(eq(postsTable.status, "published"), isNotNull(postsTable.publishedAt), gte(postsTable.publishedAt, sql`now() - interval '12 weeks'`))
      )
      .groupBy(
        sql`date_trunc('week', ${postsTable.publishedAt} at time zone 'America/Bogota')`,
        postsTable.contentType
      )
      .orderBy(sql`date_trunc('week', ${postsTable.publishedAt} at time zone 'America/Bogota')`);

    // Group by week, aggregate counts
    const byWeek: Record<string, { week: string; total: number; byType: Record<string, number> }> = {};
    for (const row of rows) {
      if (!byWeek[row.week]) byWeek[row.week] = { week: row.week, total: 0, byType: {} };
      byWeek[row.week].total += row.count;
      byWeek[row.week].byType[row.contentType] = (byWeek[row.week].byType[row.contentType] ?? 0) + row.count;
    }

    const weeks = Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week));

    // Current week count
    const [currentWeek] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postsTable)
      .where(
        tc
          ? and(eq(postsTable.status, "published"), isNotNull(postsTable.publishedAt), gte(postsTable.publishedAt, sql`date_trunc('week', now() at time zone 'America/Bogota')`), tc)
          : and(eq(postsTable.status, "published"), isNotNull(postsTable.publishedAt), gte(postsTable.publishedAt, sql`date_trunc('week', now() at time zone 'America/Bogota')`))
      );

    const totalPublished = weeks.reduce((s, w) => s + w.total, 0);
    const avgPerWeek = weeks.length > 0 ? Math.round((totalPublished / weeks.length) * 10) / 10 : 0;

    res.json({
      weeks,
      currentWeekCount: currentWeek?.count ?? 0,
      avgPerWeek,
      totalInPeriod: totalPublished,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error interno" });
  }
});

// POST /analytics/sync-metrics — manually trigger a sync of published IG post metrics (admin only)
router.post("/sync-metrics", requireAdmin, async (_req, res) => {
  try {
    const result = await syncPublishedPostMetrics();
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    res.status(500).json({ error: msg });
  }
});

/** Read audience snapshot for the caller's active business.
 *  Prefers the business-scoped key (audience_snapshot_biz_N).
 *  Falls back to the legacy "audience_snapshot" key for backward compatibility
 *  until the scheduler runs and writes the business-scoped snapshot.
 */
async function getAudienceSnapshot(userId: number): Promise<string | null> {
  const bizId = await getActiveBusinessId(userId);
  if (bizId != null) {
    const bizKey = `audience_snapshot_biz_${bizId}`;
    const [bizSnap] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, bizKey));
    if (bizSnap) return bizSnap.value;
  }
  // Legacy fallback
  const [legacySnap] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "audience_snapshot"));
  return legacySnap?.value ?? null;
}

// POST /analytics/refresh-audience — manually trigger an audience snapshot refresh (admin only)
router.post("/refresh-audience", requireAdmin, async (req, res) => {
  try {
    await refreshInstagramAudience();
    const value = await getAudienceSnapshot(req.user!.userId);
    res.json({ success: true, snapshot: value ? JSON.parse(value) : null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    res.status(500).json({ error: msg });
  }
});

// GET /analytics/audience-snapshot — get the latest cached audience snapshot (admin only)
router.get("/audience-snapshot", async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Acceso restringido a administradores" });
  try {
    const value = await getAudienceSnapshot(req.user!.userId);
    if (!value) return res.status(404).json({ error: "No hay snapshot de audiencia guardado aún" });
    return res.json(JSON.parse(value));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return res.status(500).json({ error: msg });
  }
});

// GET /analytics/instagram-audience
// Fetches follower count + online-hours breakdown from Meta Graph API
// Used to determine real optimal posting windows for ECO's audience
router.get("/instagram-audience", async (req, res) => {
  try {
    const GRAPH = "https://graph.facebook.com/v22.0";

    // 1. Get Instagram account credentials — scoped to authenticated user (admin sees any account)
    const isAdmin = req.user?.role === "admin";
    const ownerUserId = req.user?.userId ?? null;
    const platformCond = eq(socialAccountsTable.platform, "instagram");
    const accountCond = isAdmin ? platformCond : and(platformCond, eq(socialAccountsTable.userId, ownerUserId!));
    const [igAccount] = await db.select().from(socialAccountsTable).where(accountCond);
    if (!igAccount?.accessToken || !igAccount?.pageId) {
      return res.status(400).json({ error: "Cuenta de Instagram no configurada" });
    }

    const token = decryptToken(igAccount.accessToken);
    const pageId = igAccount.pageId;

    // 2. Resolve IG Business/Creator Account ID — checks both instagram_business_account
    // (Page Settings link) and connected_instagram_account (Account Center link).
    const igId = await resolveIgIdFromPageApi(pageId!, token);
    if (!igId) return res.status(400).json({ error: "No hay cuenta de Instagram Business o Creadora vinculada a esta Página (ni vía Page Settings ni vía Account Center)" });

    // 3. Basic account info: username, followers, media count
    const infoRes = await fetch(
      `${GRAPH}/${igId}?fields=username,name,followers_count,media_count,biography,website&access_token=${token}`
    );
    const info = await infoRes.json() as {
      username?: string; name?: string; followers_count?: number;
      media_count?: number; biography?: string; website?: string; error?: { message: string };
    };

    // 4. Online followers by hour — "when are your followers online?" (day × hour grid)
    // Meta returns: data[0].values = [ { value: {Sun:{0:N,1:N,...,23:N}, Mon:{...}, ...} } ]
    const onlineRes = await fetch(
      `${GRAPH}/${igId}/insights?metric=online_followers&period=lifetime&access_token=${token}`
    );
    const onlineData = await onlineRes.json() as {
      data?: { name: string; values: { value: Record<string, Record<string, number>> }[] }[];
      error?: { message: string };
    };

    // 5. Recent impressions by hour (last 30 days)
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - (30 * 24 * 3600);
    const impressionsRes = await fetch(
      `${GRAPH}/${igId}/insights?metric=impressions&period=day&since=${thirtyDaysAgo}&until=${now}&access_token=${token}`
    );
    const impressionsData = await impressionsRes.json() as {
      data?: { name: string; period: string; values: { value: number; end_time: string }[] }[];
      error?: { message: string };
    };

    // 6. Audience demographic data
    const audienceRes = await fetch(
      `${GRAPH}/${igId}/insights?metric=audience_gender_age,audience_country,audience_city&period=lifetime&access_token=${token}`
    );
    const audienceData = await audienceRes.json() as {
      data?: { name: string; values: { value: Record<string, number> }[] }[];
      error?: { message: string };
    };

    return res.json({
      account: info,
      igBusinessId: igId,
      onlineFollowers: onlineData.data ?? null,
      onlineFollowersError: onlineData.error?.message ?? null,
      impressions: impressionsData.data ?? null,
      impressionsError: impressionsData.error?.message ?? null,
      audience: audienceData.data ?? null,
      audienceError: audienceData.error?.message ?? null,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Error interno" });
  }
});

// GET /analytics/content-insights
// Computes plain-language insights from real published post metrics so the dashboard
// can show "¿Qué está funcionando?" and the AI can bias towards winning patterns.
router.get("/content-insights", async (req, res) => {
  try {
    const tc = await tenantCondWithBusiness(req);
    const rows = await db
      .select({
        id: postsTable.id,
        caption: postsTable.caption,
        contentType: postsTable.contentType,
        platform: postsTable.platform,
        likes: postsTable.likes,
        saves: postsTable.saves,
        reach: postsTable.reach,
        comments: postsTable.comments,
        shares: postsTable.shares,
        publishedAt: postsTable.publishedAt,
      })
      .from(postsTable)
      .where(tc ? and(eq(postsTable.status, "published"), tc) : eq(postsTable.status, "published"))
      .orderBy(desc(postsTable.publishedAt))
      .limit(60);

    const hasMetrics = rows.filter(r => (r.likes ?? 0) + (r.saves ?? 0) + (r.reach ?? 0) + (r.comments ?? 0) > 0);

    if (hasMetrics.length < 1) {
      return res.json({ hasData: false, minRequired: 1, published: rows.length });
    }

    // --- Engagement score per post ---
    const scored = hasMetrics.map(r => {
      const likes   = r.likes   ?? 0;
      const saves   = r.saves   ?? 0;
      const reach   = r.reach   ?? 0;
      const comments = r.comments ?? 0;
      const rawScore = likes + saves * 2 + comments;
      const rate = reach > 0 ? rawScore / reach : 0;
      return { ...r, rawScore, rate };
    });

    // --- By content type ---
    const byType: Record<string, { total: number; reach: number; count: number; examples: string[] }> = {};
    for (const r of scored) {
      const t = r.contentType ?? "image";
      if (!byType[t]) byType[t] = { total: 0, reach: 0, count: 0, examples: [] };
      byType[t].total += r.rawScore;
      byType[t].reach += r.reach ?? 0;
      byType[t].count++;
      if (byType[t].examples.length < 2 && r.caption?.trim()) {
        byType[t].examples.push(r.caption.split("\n")[0].slice(0, 80));
      }
    }
    const typeRanking = Object.entries(byType)
      .map(([type, d]) => ({
        type,
        avgRate: d.reach > 0 ? d.total / d.reach : d.count > 0 ? d.total / d.count : 0,
        count: d.count,
        examples: d.examples,
      }))
      .sort((a, b) => b.avgRate - a.avgRate);

    // --- Top 3 posts ---
    const top3 = [...scored]
      .sort((a, b) => b.rate - a.rate || b.rawScore - a.rawScore)
      .slice(0, 3)
      .map(r => ({
        id: r.id,
        hook: (r.caption ?? "").split("\n")[0].replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim().slice(0, 80),
        contentType: r.contentType,
        likes: r.likes,
        saves: r.saves,
        reach: r.reach,
        rate: Math.round(r.rate * 1000) / 10, // as percentage × 10
      }));

    // --- Best day of week ---
    const byDay: Record<number, number> = {};
    for (const r of scored) {
      if (!r.publishedAt) continue;
      const day = new Date(r.publishedAt).getDay();
      byDay[day] = (byDay[day] ?? 0) + r.rawScore;
    }
    const bestDay = Object.entries(byDay).sort(([, a], [, b]) => b - a)[0];
    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

    // --- Trend (last 10 vs previous 10) ---
    let trendPct = 0;
    if (scored.length >= 20) {
      const recent = scored.slice(0, 10).reduce((s, r) => s + r.rawScore, 0);
      const older  = scored.slice(10, 20).reduce((s, r) => s + r.rawScore, 0);
      trendPct = older > 0 ? Math.round(((recent - older) / older) * 100) : 0;
    }

    return res.json({
      hasData: true,
      postsAnalyzed: hasMetrics.length,
      typeRanking,
      top3,
      bestDay: bestDay ? { day: Number(bestDay[0]), name: dayNames[Number(bestDay[0])] } : null,
      trendPct,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Error interno" });
  }
});

// GET /analytics/hashtag-insights
// Correlates each hashtag with the engagement of posts that used it.
// Parses space-separated hashtag strings from every post (all statuses with hashtags).
// Published posts with metrics get a weighted engagement score; others contribute only to frequency.
router.get("/hashtag-insights", async (req, res) => {
  try {
    const tc = await tenantCondWithBusiness(req);
    const rows = await db
      .select({
        id:          postsTable.id,
        hashtags:    postsTable.hashtags,
        status:      postsTable.status,
        likes:       postsTable.likes,
        comments:    postsTable.comments,
        saves:       postsTable.saves,
        reach:       postsTable.reach,
        shares:      postsTable.shares,
        publishedAt: postsTable.publishedAt,
      })
      .from(postsTable)
      .where(tc ? and(sql`${postsTable.hashtags} is not null and ${postsTable.hashtags} != ''`, tc) : sql`${postsTable.hashtags} is not null and ${postsTable.hashtags} != ''`);

    // Pool classification — mirrors pickHashtags() pools in ai.service.ts
    const POOL_MAP: Record<string, string> = {
      "#ECOcol": "brand", "#SimulaConECO": "brand", "#ENERGYCAPITALOPERATION": "brand",
      "#ECOenergía": "brand", "#AhorraConECO": "brand",
      "#Cali": "local", "#CaliColombia": "local", "#CaliSostiene": "local",
      "#ValledelCauca": "local", "#CaliEmpresarial": "local", "#Yumbo": "local",
      "#Jamundí": "local", "#CaliBella": "local", "#CaliPotencia": "local",
      "#PanelesSolares": "solar", "#EnergíaSolarCali": "solar", "#SolarColombia": "solar",
      "#PPAEcosolar": "solar", "#PanelesCali": "solar", "#FacturaCero": "solar",
      "#AhorraConElSol": "solar", "#EnergíaGratis": "solar", "#CeroInversión": "solar",
      "#VehículosEléctricos": "ev", "#CargadoresEV": "ev", "#EVColombia": "ev",
      "#MovilidadEléctrica": "ev", "#BeneficiosTributariosEV": "ev", "#ElectricCar": "ev",
      "#Sostenibilidad": "trending", "#EnergíaLimpia": "trending", "#CambioclimáticoColombia": "trending",
      "#FuturoVerde": "trending", "#EmpresasSostenibles": "trending", "#NegocioVerde": "trending",
      "#InversiónInteligente": "trending", "#AhorroColombia": "trending",
    };

    type TagStats = {
      tag: string; pool: string;
      frequency: number;
      engagedPosts: number;
      totalScore: number;
      totalReach: number;
      avgEngagementRate: number;
    };

    const stats: Record<string, TagStats> = {};

    for (const row of rows) {
      const tags = (row.hashtags ?? "").split(/\s+/).map(t => t.trim()).filter(t => t.startsWith("#"));
      const hasMetrics = (row.likes ?? 0) + (row.saves ?? 0) + (row.reach ?? 0) > 0;
      const score = (row.likes ?? 0) + (row.saves ?? 0) * 2 + (row.comments ?? 0);
      const reach = row.reach ?? 0;

      for (const tag of tags) {
        if (!stats[tag]) {
          stats[tag] = {
            tag,
            pool: POOL_MAP[tag] ?? "other",
            frequency: 0,
            engagedPosts: 0,
            totalScore: 0,
            totalReach: 0,
            avgEngagementRate: 0,
          };
        }
        stats[tag].frequency++;
        if (hasMetrics) {
          stats[tag].engagedPosts++;
          stats[tag].totalScore += score;
          stats[tag].totalReach += reach;
        }
      }
    }

    // Compute avg engagement rate for each tag
    for (const s of Object.values(stats)) {
      s.avgEngagementRate = s.totalReach > 0
        ? s.totalScore / s.totalReach
        : s.engagedPosts > 0
        ? s.totalScore / s.engagedPosts
        : 0;
    }

    const allTags = Object.values(stats);
    const hasEngagementData = allTags.some(t => t.engagedPosts > 0);

    // Sort: by engagement rate if data available, else by frequency
    const sorted = [...allTags].sort((a, b) =>
      hasEngagementData
        ? b.avgEngagementRate - a.avgEngagementRate || b.frequency - a.frequency
        : b.frequency - a.frequency
    );

    const top = sorted.slice(0, 20);

    // Pool breakdown — which pool has the best avg engagement
    const byPool: Record<string, { pool: string; count: number; totalRate: number; avgRate: number; tags: string[] }> = {};
    for (const t of allTags) {
      if (!byPool[t.pool]) byPool[t.pool] = { pool: t.pool, count: 0, totalRate: 0, avgRate: 0, tags: [] };
      byPool[t.pool].count++;
      byPool[t.pool].totalRate += t.avgEngagementRate;
      byPool[t.pool].tags.push(t.tag);
    }
    for (const p of Object.values(byPool)) {
      p.avgRate = p.count > 0 ? p.totalRate / p.count : 0;
    }

    // Recommendation tiers (only when engagement data exists)
    const tierThreshold = hasEngagementData
      ? { alwaysUse: sorted[0]?.avgEngagementRate * 0.6, test: sorted[0]?.avgEngagementRate * 0.3 }
      : null;

    const withTiers = top.map(t => ({
      ...t,
      tier: tierThreshold
        ? t.avgEngagementRate >= tierThreshold.alwaysUse
          ? "top"
          : t.avgEngagementRate >= tierThreshold.test
          ? "mid"
          : "low"
        : "unknown",
    }));

    res.json({
      hasData: rows.length > 0,
      hasEngagementData,
      totalPostsWithHashtags: rows.length,
      totalUniqueTags: allTags.length,
      top: withTiers,
      byPool: Object.values(byPool).sort((a, b) => b.avgRate - a.avgRate),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error interno" });
  }
});

// GET /analytics/posting-suggestions
// Returns optimal posting days and hours per platform and content type.
// Delegates to fetchPostingSuggestionsInternal (lib/postingSchedule.ts) — misma función
// que usa el scheduler, garantizando que panel y generación automática usen la misma fuente.
router.get("/posting-suggestions", async (req, res) => {
  try {
    const tc     = tenantCond(req);
    const userId = req.user!.userId;
    const result = await fetchPostingSuggestionsInternal(userId, tc);
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "[posting-suggestions] handler error");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Error interno" });
  }
});

// ─── POST /email-report — send analytics summary email to the authenticated user ──
router.post("/email-report", async (req, res) => {
  const userId = req.user!.userId;
  const { period, businessName: reqBizName, businessId: bodyBizId, allBusinesses: bodyAllBiz } =
    req.body as { period?: string; businessName?: string; businessId?: number; allBusinesses?: boolean };

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(503).json({ error: "Email service not configured" });

  const [userRow] = await db
    .select({ email: usersTable.email, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!userRow?.email) return res.status(404).json({ error: "User email not found" });

  // Build the tenant condition using body params (POST endpoint — businessId/allBusinesses come from body)
  const userCond = eq(postsTable.userId, userId);
  const tc = await (async () => {
    if (bodyAllBiz) return userCond;
    if (bodyBizId != null && !isNaN(Number(bodyBizId))) {
      return and(userCond, eq(postsTable.businessId, Number(bodyBizId)));
    }
    const bizId = await getActiveBusinessId(userId);
    return bizId != null ? and(userCond, eq(postsTable.businessId, bizId)) : userCond;
  })();

  const [overview] = await db
    .select({
      total:     sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${postsTable.status} = 'published')::int`,
      scheduled: sql<number>`count(*) filter (where ${postsTable.status} = 'scheduled')::int`,
      failed:    sql<number>`count(*) filter (where ${postsTable.status} = 'failed')::int`,
      likes:     sql<number>`coalesce(sum(${postsTable.likes}), 0)::int`,
      reach:     sql<number>`coalesce(sum(${postsTable.reach}), 0)::int`,
      comments:  sql<number>`coalesce(sum(${postsTable.comments}), 0)::int`,
      saves:     sql<number>`coalesce(sum(${postsTable.saves}), 0)::int`,
    })
    .from(postsTable)
    .where(tc);

  const bizName = bodyAllBiz ? "Todos tus negocios" : (reqBizName ?? userRow.displayName ?? "Tu negocio");
  const periodStr = period ?? new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const successRate = overview.total > 0 ? Math.round((overview.published / overview.total) * 100) : 0;
  const engagementScore = (overview.likes ?? 0) + (overview.saves ?? 0) * 2 + (overview.comments ?? 0);
  const er = (overview.reach ?? 0) > 0 ? (Math.round((engagementScore / overview.reach) * 1000) / 10).toFixed(1) : "0";

  const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("es-CO");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Reporte Analytics — ${bizName}</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:linear-gradient(135deg,#00c253,#00c2ff);height:4px;border-radius:2px 2px 0 0;"></div>
    <div style="background:#1e293b;padding:32px;border-radius:0 0 12px 12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:28px;font-weight:900;color:#fff;">haz</span><span style="font-size:28px;font-weight:900;color:#00c2ff;">post</span>
        <p style="color:#64748b;font-size:12px;margin:4px 0 0 0;">Social Media con IA</p>
      </div>
      <h1 style="font-size:20px;font-weight:700;color:#f1f5f9;text-align:center;margin:0 0 4px 0;">Reporte de Analytics</h1>
      <p style="text-align:center;color:#94a3b8;font-size:14px;margin:0 0 24px 0;">${bizName} &mdash; ${periodStr}</p>
      <div style="background:#0f172a;border-radius:8px;padding:24px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid #1e293b;">
            <th style="text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;padding:0 0 10px 0;">Métrica</th>
            <th style="text-align:right;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;padding:0 0 10px 0;">Valor</th>
          </tr></thead>
          <tbody>
            <tr style="border-bottom:1px solid #1e293b;"><td style="padding:10px 0;color:#94a3b8;font-size:14px;">Posts publicados</td><td style="padding:10px 0;text-align:right;color:#00c253;font-weight:700;font-size:14px;">${fmt(overview.published)}</td></tr>
            <tr style="border-bottom:1px solid #1e293b;"><td style="padding:10px 0;color:#94a3b8;font-size:14px;">Tasa de éxito</td><td style="padding:10px 0;text-align:right;color:#f1f5f9;font-weight:600;font-size:14px;">${successRate}%</td></tr>
            <tr style="border-bottom:1px solid #1e293b;"><td style="padding:10px 0;color:#94a3b8;font-size:14px;">Alcance total</td><td style="padding:10px 0;text-align:right;color:#00c2ff;font-weight:700;font-size:14px;">${fmt(overview.reach)}</td></tr>
            <tr style="border-bottom:1px solid #1e293b;"><td style="padding:10px 0;color:#94a3b8;font-size:14px;">Likes totales</td><td style="padding:10px 0;text-align:right;color:#f472b6;font-weight:700;font-size:14px;">${fmt(overview.likes)}</td></tr>
            <tr style="border-bottom:1px solid #1e293b;"><td style="padding:10px 0;color:#94a3b8;font-size:14px;">Comentarios</td><td style="padding:10px 0;text-align:right;color:#f1f5f9;font-weight:600;font-size:14px;">${fmt(overview.comments)}</td></tr>
            <tr><td style="padding:10px 0;color:#94a3b8;font-size:14px;">Tasa de engagement</td><td style="padding:10px 0;text-align:right;color:#a78bfa;font-weight:700;font-size:14px;">${er}%</td></tr>
          </tbody>
        </table>
      </div>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="https://hazpost.app/analytics" style="display:inline-block;background:linear-gradient(135deg,#00c253,#00c2ff);color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Ver reporte completo →</a>
      </div>
      <p style="color:#475569;font-size:12px;text-align:center;margin:0;">Recibiste este correo porque tu cuenta tiene activados los reportes automáticos.<br>hazpost.app &mdash; IA para tus redes sociales</p>
    </div>
  </div>
</body></html>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: "HazPost <reportes@hazpost.app>",
        to: userRow.email,
        subject: `📊 Reporte de Analytics — ${bizName} (${periodStr})`,
        html,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(502).json({ error: `Resend error: ${body}` });
    }
    return res.json({ ok: true, sentTo: userRow.email });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
