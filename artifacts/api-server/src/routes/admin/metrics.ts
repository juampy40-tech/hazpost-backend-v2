import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const PLAN_PRICES_COP: Record<string, number> = {
  free: 0,
  starter: 29900,
  business: 69900,
  agency: 199900,
};

router.get("/", async (_req, res) => {
  try {
    const now = new Date();
    const ago7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── Users by plan & status ────────────────────────────────────────────────
    const usersByPlan = await db.execute(sql`
      SELECT u.plan, u.is_active AS status, COUNT(*)::int AS cnt
      FROM users u
      GROUP BY u.plan, u.is_active
    `);

    // ── New users ─────────────────────────────────────────────────────────────
    const newUsers7d = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= ${ago7.toISOString()}
    `);
    const newUsers30d = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= ${ago30.toISOString()}
    `);

    // ── Credits issued & consumed ─────────────────────────────────────────────
    const credits = await db.execute(sql`
      SELECT
        COALESCE(SUM(credits_total), 0)::int     AS issued,
        COALESCE(SUM(credits_total - credits_remaining), 0)::int AS consumed,
        COALESCE(AVG(credits_remaining)::int, 0) AS avg_remaining
      FROM subscriptions
      WHERE status = 'active'
    `);

    // ── Posts generated ───────────────────────────────────────────────────────
    const postsTotal   = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM posts`);
    const posts7d      = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM posts WHERE created_at >= ${ago7.toISOString()}`);
    const posts30d     = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM posts WHERE created_at >= ${ago30.toISOString()}`);

    // ── Images generated ──────────────────────────────────────────────────────
    const imagesTotal = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM image_variants`);

    // ── Businesses ────────────────────────────────────────────────────────────
    const businesses = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM businesses`);

    // ── Posts per day (last 30 days) for sparkline ────────────────────────────
    const postsPerDay = await db.execute(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Bogota')::text AS day,
        COUNT(*)::int AS cnt
      FROM posts
      WHERE created_at >= ${ago30.toISOString()}
      GROUP BY 1
      ORDER BY 1
    `);

    // ── New users per day (last 30 days) ─────────────────────────────────────
    const usersPerDay = await db.execute(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Bogota')::text AS day,
        COUNT(*)::int AS cnt
      FROM users
      WHERE created_at >= ${ago30.toISOString()}
      GROUP BY 1
      ORDER BY 1
    `);

    // ── Subscription statuses ─────────────────────────────────────────────────
    const subStatuses = await db.execute(sql`
      SELECT status, COUNT(*)::int AS cnt
      FROM subscriptions
      GROUP BY status
    `);

    // ── Referral conversions ──────────────────────────────────────────────────
    const referrals = await db.execute(sql`
      SELECT status, COUNT(*)::int AS cnt
      FROM referral_conversions
      GROUP BY status
    `);

    // ── Affiliate applications ────────────────────────────────────────────────
    const affiliates = await db.execute(sql`
      SELECT status, COUNT(*)::int AS cnt
      FROM affiliate_applications
      GROUP BY status
    `);

    // ── MRR estimate ──────────────────────────────────────────────────────────
    const planRows = (usersByPlan.rows as Array<{ plan: string; status: string; cnt: number }>)
      .filter(r => r.status === "active");
    const mrr = planRows.reduce((sum, r) => sum + (PLAN_PRICES_COP[r.plan] ?? 0) * r.cnt, 0);
    const paidUsers = planRows.filter(r => r.plan !== "free").reduce((s, r) => s + r.cnt, 0);
    const freeUsers = planRows.filter(r => r.plan === "free").reduce((s, r) => s + r.cnt, 0);
    const totalActive = planRows.reduce((s, r) => s + r.cnt, 0);
    const conversionRate = totalActive > 0 ? Math.round((paidUsers / totalActive) * 100) : 0;

    const creditRow = credits.rows[0] as { issued: number; consumed: number; avg_remaining: number };

    res.json({
      mrr,
      paidUsers,
      freeUsers,
      totalActive,
      conversionRate,
      newUsers7d: (newUsers7d.rows[0] as { cnt: number }).cnt,
      newUsers30d: (newUsers30d.rows[0] as { cnt: number }).cnt,
      credits: {
        issued: creditRow.issued,
        consumed: creditRow.consumed,
        avgRemaining: creditRow.avg_remaining,
        utilizationPct: creditRow.issued > 0
          ? Math.round((creditRow.consumed / creditRow.issued) * 100)
          : 0,
      },
      posts: {
        total:  (postsTotal.rows[0] as { cnt: number }).cnt,
        last7d: (posts7d.rows[0] as { cnt: number }).cnt,
        last30d:(posts30d.rows[0] as { cnt: number }).cnt,
      },
      images: {
        total: (imagesTotal.rows[0] as { cnt: number }).cnt,
      },
      businesses: (businesses.rows[0] as { cnt: number }).cnt,
      planBreakdown: usersByPlan.rows as Array<{ plan: string; status: string; cnt: number }>,
      subStatuses: subStatuses.rows as Array<{ status: string; cnt: number }>,
      referrals: {
        rows: referrals.rows as Array<{ status: string; cnt: number }>,
        total: (referrals.rows as Array<{ cnt: number }>).reduce((s, r) => s + r.cnt, 0),
      },
      affiliates: {
        rows: affiliates.rows as Array<{ status: string; cnt: number }>,
        total: (affiliates.rows as Array<{ cnt: number }>).reduce((s, r) => s + r.cnt, 0),
      },
      postsPerDay: postsPerDay.rows as Array<{ day: string; cnt: number }>,
      usersPerDay: usersPerDay.rows as Array<{ day: string; cnt: number }>,
    });
  } catch (err) {
    console.error("[admin/metrics]", err);
    res.status(500).json({ error: "Error cargando métricas" });
  }
});

// ── Generation Costs ─────────────────────────────────────────────────────────

type Period = "today" | "week" | "biweekly" | "month";

function getPeriodBounds(period: Period): { from: Date; to: Date; seriesStart: Date; seriesDays: number } {
  const now = new Date();

  // Compute start of "today" in Bogotá time (UTC-5)
  const bogotaOffset = -5 * 60 * 60 * 1000;
  const bogotaMs = now.getTime() + bogotaOffset;
  const bogotaDate = new Date(bogotaMs);
  const todayStartBogota = new Date(
    Date.UTC(bogotaDate.getUTCFullYear(), bogotaDate.getUTCMonth(), bogotaDate.getUTCDate())
  );
  // Shift back to UTC
  const todayStart = new Date(todayStartBogota.getTime() - bogotaOffset);

  const monthStart = new Date(Date.UTC(
    bogotaDate.getUTCFullYear(), bogotaDate.getUTCMonth(), 1
  ) - bogotaOffset);

  let from: Date;
  if (period === "today") {
    from = todayStart;
  } else if (period === "week") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "biweekly") {
    from = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  } else {
    // month: desde el 1ro del mes en Bogotá
    from = monthStart;
  }

  // Serie temporal: 7 días para today/week, 30 días para biweekly/month
  const seriesDays = (period === "today" || period === "week") ? 7 : 30;
  const seriesStart = new Date(now.getTime() - seriesDays * 24 * 60 * 60 * 1000);

  return { from, to: now, seriesStart, seriesDays };
}

router.get("/generation-costs", async (req, res) => {
  const period = (req.query.period as string) || "today";
  if (!["today", "week", "biweekly", "month"].includes(period)) {
    res.status(400).json({ error: "period inválido. Use: today|week|biweekly|month" });
    return;
  }

  try {
    const { from, to, seriesStart, seriesDays } = getPeriodBounds(period as Period);

    // Por tipo de contenido en el período
    // AVG sobre COALESCE para que filas con NULL (previas a Task #134) cuenten como $0.00
    const byType = await db.execute(sql`
      SELECT
        content_type                                            AS type,
        COUNT(*)::int                                           AS count,
        SUM(COALESCE(generation_cost_usd, 0))                  AS total_cost_usd,
        SUM(COALESCE(generation_cost_usd, 0)) / COUNT(*)       AS avg_cost_usd
      FROM posts
      WHERE created_at >= ${from.toISOString()}
        AND created_at <  ${to.toISOString()}
        AND content_type IS NOT NULL
      GROUP BY content_type
      ORDER BY content_type
    `);

    // Serie temporal — últimos 30 días, agrupada por día y tipo
    const timeSeries = await db.execute(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Bogota')::text  AS date,
        content_type,
        COUNT(*)::int                                          AS count,
        COALESCE(SUM(generation_cost_usd), 0)                 AS cost_usd
      FROM posts
      WHERE created_at >= ${seriesStart.toISOString()}
        AND content_type IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    type ByTypeRow = { type: string; count: number; total_cost_usd: number; avg_cost_usd: number };
    type TsRow     = { date: string; content_type: string; count: number; cost_usd: number };

    const byTypeRows = byType.rows as ByTypeRow[];
    const totalCount   = byTypeRows.reduce((s, r) => s + r.count, 0);
    const totalCostUsd = byTypeRows.reduce((s, r) => s + Number(r.total_cost_usd), 0);

    // Pivot de serie temporal por día
    const tsMap: Record<string, { date: string; [k: string]: number | string; costUsd: number }> = {};
    for (const row of timeSeries.rows as TsRow[]) {
      if (!tsMap[row.date]) tsMap[row.date] = { date: row.date, costUsd: 0 };
      tsMap[row.date][row.content_type] = row.count;
      tsMap[row.date].costUsd = Number(tsMap[row.date].costUsd) + Number(row.cost_usd);
    }
    const timeSeriesArray = Object.values(tsMap).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string)
    );

    // Costo element_ai: imágenes generadas con "IA integra el elemento" (style='element_ai' en image_variants).
    // Su costo USD YA está stamped en posts.generation_cost_usd (en generate-with-element y
    // generateElementAiVariantsBg), por lo que totalCostUsd y totalCount NO incluyen esta fila
    // para evitar doble conteo. Se muestra como fila informativa de desglose solamente.
    const elementAiResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM image_variants
      WHERE style = 'element_ai'
        AND created_at >= ${from.toISOString()}
        AND created_at <  ${to.toISOString()}
    `);
    const elementAiCount = Number((elementAiResult.rows[0] as { cnt: number })?.cnt ?? 0);
    const ELEMENT_AI_UNIT_COST = 0.040;
    // Fila informativa: siempre incluida (count puede ser 0), no se suma a totals
    // porque el costo USD ya está stamped en posts.generation_cost_usd
    const elementAiRow = [{
      type:         "element_ai",
      count:        elementAiCount,
      totalCostUsd: Number((elementAiCount * ELEMENT_AI_UNIT_COST).toFixed(4)),
      avgCostUsd:   ELEMENT_AI_UNIT_COST,
      informational: true,
    }];

    res.json({
      period,
      from: from.toISOString(),
      to:   to.toISOString(),
      seriesDays,
      byType: [
        ...byTypeRows.map(r => ({
          type:         r.type,
          count:        r.count,
          totalCostUsd: Number(Number(r.total_cost_usd).toFixed(4)),
          avgCostUsd:   Number(Number(r.avg_cost_usd).toFixed(4)),
        })),
        ...elementAiRow,
      ],
      // totalCount y totalCostUsd vienen de posts — element_ai ya está incluido en posts.generation_cost_usd
      totalCount:   totalCount,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      timeSeries: timeSeriesArray,
    });
  } catch (err) {
    console.error("[admin/metrics/generation-costs]", err);
    res.status(500).json({ error: "Error cargando costos de generación" });
  }
});

export default router;
