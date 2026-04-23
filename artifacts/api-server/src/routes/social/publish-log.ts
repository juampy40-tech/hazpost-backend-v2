import { Router } from "express";
import { db } from "@workspace/db";
import { publishLogTable, postsTable } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import { GetPublishLogQueryParams } from "@workspace/api-zod";
import { getActiveBusinessId } from "../../lib/businesses.js";

const router = Router();

router.get("/", async (req, res) => {
  const params = GetPublishLogQueryParams.parse({
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });

  const limit = params.limit ?? 200;
  const userId = req.user!.userId;

  // Always scope to active business so switching businesses filters the history correctly.
  // Even admin users only see the history of their currently active business.
  const bizId = await getActiveBusinessId(userId);

  const userCond = eq(postsTable.userId, userId);
  const bizCond = bizId != null ? eq(postsTable.businessId, bizId) : undefined;
  const tenantCond = bizCond ? and(userCond, bizCond) : userCond;

  // 1. All publish_log entries (auto + manual that went through mark-manual)
  const logsQuery = db
    .select({
      id: publishLogTable.id,
      postId: publishLogTable.postId,
      platform: publishLogTable.platform,
      status: publishLogTable.status,
      postUrl: publishLogTable.postUrl,
      errorMessage: publishLogTable.errorMessage,
      publishedAt: publishLogTable.publishedAt,
      source: publishLogTable.source,
      caption: postsTable.caption,
      hashtags: postsTable.hashtags,
      contentType: postsTable.contentType,
      slideCount: postsTable.slideCount,
      postNumber: postsTable.postNumber,
    })
    .from(publishLogTable)
    .leftJoin(postsTable, eq(publishLogTable.postId, postsTable.id))
    .orderBy(desc(publishLogTable.publishedAt))
    .limit(limit);

  const logs = await logsQuery.where(tenantCond);

  // 2. Posts with status='published' that have NO publish_log entry (legacy orphans)
  const loggedPostIds = [...new Set(logs.map(l => l.postId).filter(Boolean))];

  const orphanQuery = db
    .select({
      id: sql<number>`-${postsTable.id}`,  // synthetic negative ID to avoid collision
      postId: postsTable.id,
      platform: postsTable.platform,
      status: sql<string>`'published'`,
      postUrl: sql<string | null>`null`,
      errorMessage: sql<string | null>`null`,
      publishedAt: postsTable.updatedAt,
      source: sql<string>`'manual'`,
      caption: postsTable.caption,
      hashtags: postsTable.hashtags,
      contentType: postsTable.contentType,
      slideCount: postsTable.slideCount,
      postNumber: postsTable.postNumber,
    })
    .from(postsTable)
    .where(
      loggedPostIds.length > 0
        ? and(sql`${postsTable.status} = 'published'`, sql`${postsTable.id} NOT IN (${sql.join(loggedPostIds.map(id => sql`${id}`), sql`, `)})`, tenantCond)
        : and(sql`${postsTable.status} = 'published'`, tenantCond)
    );

  const orphans = await orphanQuery;

  const combined = [...logs, ...orphans].sort(
    (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
  );

  res.json(combined);
});

// PATCH /api/publish-log/:id/mark-published
// Marks a failed publish-log entry as manually published and syncs the post status.
router.patch("/:id/mark-published", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id) || id < 1) { res.status(400).json({ error: "ID inválido" }); return; }

  const requestingUserId = req.user!.userId;
  const isAdmin = req.user!.role === "admin";

  // Verify ownership: join through postsTable to ensure the log belongs to this user
  const [log] = await db
    .select({ id: publishLogTable.id, postId: publishLogTable.postId, status: publishLogTable.status, postUserId: postsTable.userId })
    .from(publishLogTable)
    .leftJoin(postsTable, eq(publishLogTable.postId, postsTable.id))
    .where(eq(publishLogTable.id, id));

  if (!log) {
    res.status(404).json({ error: "Entrada de historial no encontrada" });
    return;
  }

  // Enforce tenant isolation: non-admin users can only update their own log entries
  if (!isAdmin && log.postUserId !== requestingUserId) {
    res.status(403).json({ error: "No autorizado" });
    return;
  }

  // Update the log entry: mark as published, source = manual, clear error
  await db.update(publishLogTable).set({
    status: "published",
    source: "manual",
    errorMessage: null,
    publishedAt: new Date(),
  }).where(eq(publishLogTable.id, id));

  // Also update the post itself to published so it no longer appears as failed
  if (log.postId > 0) {
    await db.update(postsTable).set({
      status: "published",
      publishedAt: new Date(),
    }).where(eq(postsTable.id, log.postId));
  }

  res.json({ ok: true });
});

export default router;
