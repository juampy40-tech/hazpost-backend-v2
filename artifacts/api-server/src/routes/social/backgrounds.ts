import { Router } from "express";
import { db } from "@workspace/db";
import { imageVariantsTable, postsTable, industryGroupsTable } from "@workspace/db";
import { eq, isNotNull, isNull, and, desc, asc, inArray, sql } from "drizzle-orm";
import type { Request } from "express";
import { tenantFilterVariantsJoined, tenantFilterVariants, tenantLibraryFilter, tenantLibraryAccessFilter } from "../../lib/tenant.js";
import sharp from "sharp";
import { createHash } from "crypto";

const router = Router();

/**
 * In-memory thumbnail cache: versioned key "v2:{id}" → base64 JPEG at max 400px wide, quality 80.
 * Version prefix ensures stale entries from previous thumbnail params (600px/q96) never hit
 * on a live process that started with the old code. Bump "v2" → "v3" on next size/quality change.
 */
const thumbCache = new Map<string, string>();
const THUMB_CACHE_VERSION = "v2";

/**
 * Resize a base64 JPEG/PNG to at most 400px wide (preserving aspect ratio), quality 80.
 * ~55% lighter than the previous 600px/q96 setting — noticeably faster grid load.
 * 400px is sufficient for the thumbnail grid; full image served via /raw.
 */
async function makeThumbnail(id: number, base64: string): Promise<string> {
  const cacheKey = `${THUMB_CACHE_VERSION}:${id}`;
  if (thumbCache.has(cacheKey)) return thumbCache.get(cacheKey)!;
  const buf = Buffer.from(base64, "base64");
  const thumb = await sharp(buf).resize(400, null, { withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const result = thumb.toString("base64");
  thumbCache.set(cacheKey, result);
  return result;
}

// Tenant filters para image_variants se delegan a lib/tenant.ts:
//   tenantFilterVariantsJoined(req) — para routes que hacen JOIN con postsTable
//   tenantFilterVariants(req)       — para routes sin JOIN a postsTable (usa subquery)
// La lógica legacy (userId=NULL) está centralizada allí.

// GET /api/backgrounds  → metadata only (no thumbnail data in list response).
// Thumbnails are fetched lazily by the frontend via GET /api/backgrounds/:id/thumb.
// Applies industry-based tenant isolation: own backgrounds + same industry_group_slug from others.
// ?businessId=X to scope the industry context to a specific business (defaults to user's default business).
router.get("/", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const parsedBizId = req.query.businessId ? parseInt(req.query.businessId as string) : undefined;
    const bizId = parsedBizId !== undefined && isNaN(parsedBizId) ? undefined : parsedBizId;
    const tf = await tenantLibraryFilter(req, bizId);

    const rows = await db
      .select({
        id: imageVariantsTable.id,
        postId: imageVariantsTable.postId,
        style: imageVariantsTable.style,
        prompt: imageVariantsTable.prompt,
        libraryUseCount: imageVariantsTable.libraryUseCount,
        createdAt: imageVariantsTable.createdAt,
        industryGroupSlug: imageVariantsTable.industryGroupSlug,
        userId: imageVariantsTable.userId,
        contentType: postsTable.contentType,
        caption: postsTable.caption,
      })
      .from(imageVariantsTable)
      .leftJoin(postsTable, eq(imageVariantsTable.postId, postsTable.id))
      .where(and(isNotNull(imageVariantsTable.rawBackground), tf))
      .orderBy(
        // N1 (propios) SIEMPRE antes que N2 (industria)
        sql`CASE WHEN ${imageVariantsTable.userId} = ${uid} THEN 0 ELSE 1 END`,
        // N1: menos usadas primero (asc) — N2: más usadas primero (desc, más probadas)
        sql`CASE WHEN ${imageVariantsTable.userId} = ${uid} THEN ${imageVariantsTable.libraryUseCount} END ASC NULLS LAST`,
        sql`CASE WHEN ${imageVariantsTable.userId} != ${uid} THEN ${imageVariantsTable.libraryUseCount} END DESC NULLS LAST`,
        desc(imageVariantsTable.createdAt)
      );

    const groups = await db
      .select({ slug: industryGroupsTable.slug, displayName: industryGroupsTable.displayName })
      .from(industryGroupsTable);
    const groupMap = new Map(groups.map(g => [g.slug, g.displayName]));

    const enriched = rows.map(r => ({
      id: r.id,
      postId: r.postId,
      style: r.style,
      prompt: r.prompt,
      libraryUseCount: r.libraryUseCount,
      createdAt: r.createdAt,
      contentType: r.contentType,
      caption: r.caption,
      industryGroupSlug: r.industryGroupSlug,
      groupDisplayName: r.industryGroupSlug ? (groupMap.get(r.industryGroupSlug) ?? r.industryGroupSlug) : null,
      isOwn: r.userId === uid,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/backgrounds/:id/thumb → thumbnail (fast, cached)
// Uses rawBackground when available (clean, no logo/text); falls back to imageData for older
// variants that were stored before rawBackground was introduced.
// Uses ACCESS filter (userId = uid) — not the strict businessId LIST filter — so thumbnails
// load correctly regardless of which business is currently active.
router.get("/:id/thumb", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cacheKey = `${THUMB_CACHE_VERSION}:${id}`;
    if (thumbCache.has(cacheKey)) {
      return res.json({ thumbnail: thumbCache.get(cacheKey) });
    }
    const tf = await tenantLibraryAccessFilter(req);
    const cond = and(eq(imageVariantsTable.id, id), tf);
    const [row] = await db
      .select({
        id: imageVariantsTable.id,
        rawBackground: imageVariantsTable.rawBackground,
        imageData: imageVariantsTable.imageData,
      })
      .from(imageVariantsTable)
      .where(cond);
    // Prefer rawBackground (clean) — fall back to imageData for legacy variants
    const source = row?.rawBackground ?? row?.imageData;
    if (!source) return res.status(404).json({ error: "Not found" });
    const thumbnail = await makeThumbnail(id, source);
    return res.json({ thumbnail });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// GET /api/backgrounds/:id/raw  → serve raw image bytes (JPEG) for embedding in landing pages etc.
// Uses ACCESS filter (userId = uid) — permissive, same as /thumb. Business context not needed here.
router.get("/:id/raw", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).end();
    const tf = await tenantLibraryAccessFilter(req);
    const cond = and(eq(imageVariantsTable.id, id), tf);
    const [row] = await db
      .select({ rawBackground: imageVariantsTable.rawBackground, mimeType: imageVariantsTable.mimeType })
      .from(imageVariantsTable)
      .where(cond);
    if (!row?.rawBackground) return res.status(404).end();
    const buf = Buffer.from(row.rawBackground, "base64");
    res.setHeader("Content-Type", row.mimeType ?? "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.send(buf);
  } catch (err) {
    return res.status(500).end();
  }
});

// DELETE /api/backgrounds/bulk  → permanently delete multiple backgrounds by id array
// Body: { ids: number[] }
// STRICT owner-only: only deletes items where user_id = authenticated user, no admin bypass.
// Use /api/admin/backgrounds-master/:id for admin deletions.
router.delete("/bulk", async (req, res) => {
  try {
    const ids: number[] = (req.body?.ids ?? []).map(Number).filter((n: number) => !isNaN(n));
    if (ids.length === 0) return res.status(400).json({ error: "No ids provided" });
    const uid = req.user!.userId;
    const cond = and(inArray(imageVariantsTable.id, ids), eq(imageVariantsTable.userId, uid));
    await db.update(imageVariantsTable)
      .set({ rawBackground: null, rawBackgroundHash: null })
      .where(cond);
    ids.forEach(id => thumbCache.delete(id));
    return res.json({ success: true, deleted: ids.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/backgrounds/:id  → clear rawBackground (soft-delete from library)
// STRICT owner-only: user_id must match authenticated user. No admin bypass.
// Use /api/admin/backgrounds-master/:id for admin deletions.
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const uid = req.user!.userId;
    const [row] = await db
      .select({ id: imageVariantsTable.id })
      .from(imageVariantsTable)
      .where(and(eq(imageVariantsTable.id, id), eq(imageVariantsTable.userId, uid)));
    if (!row) return res.status(404).json({ error: "Not found or not your background" });
    await db.update(imageVariantsTable)
      .set({ rawBackground: null, rawBackgroundHash: null })
      .where(eq(imageVariantsTable.id, id));
    thumbCache.delete(id);
    return res.json({ success: true, id });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/backgrounds/rehash → backfill rawBackgroundHash for variants that lack it
router.post("/rehash", async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const rows = await db
      .select({ id: imageVariantsTable.id, rawBackground: imageVariantsTable.rawBackground })
      .from(imageVariantsTable)
      .where(and(isNotNull(imageVariantsTable.rawBackground), isNull(imageVariantsTable.rawBackgroundHash)));

    let updated = 0;
    for (const row of rows) {
      if (!row.rawBackground) continue;
      const hash = createHash("sha256").update(row.rawBackground).digest("hex");
      await db.update(imageVariantsTable).set({ rawBackgroundHash: hash }).where(eq(imageVariantsTable.id, row.id));
      updated++;
    }
    return res.json({ updated, total: rows.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/backgrounds/deduplicate → remove duplicate rawBackgrounds (same hash, keep 1 per hash)
router.post("/deduplicate", async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    // First run a rehash pass to ensure all rows have hashes
    const unhashed = await db
      .select({ id: imageVariantsTable.id, rawBackground: imageVariantsTable.rawBackground })
      .from(imageVariantsTable)
      .where(and(isNotNull(imageVariantsTable.rawBackground), isNull(imageVariantsTable.rawBackgroundHash)));
    for (const row of unhashed) {
      if (!row.rawBackground) continue;
      const hash = createHash("sha256").update(row.rawBackground).digest("hex");
      await db.update(imageVariantsTable).set({ rawBackgroundHash: hash }).where(eq(imageVariantsTable.id, row.id));
    }

    // Fetch all variants with a hash, group by hash
    const all = await db
      .select({ id: imageVariantsTable.id, rawBackgroundHash: imageVariantsTable.rawBackgroundHash, libraryUseCount: imageVariantsTable.libraryUseCount })
      .from(imageVariantsTable)
      .where(isNotNull(imageVariantsTable.rawBackgroundHash))
      .orderBy(desc(imageVariantsTable.libraryUseCount));

    const grouped = new Map<string, typeof all>();
    for (const row of all) {
      if (!row.rawBackgroundHash) continue;
      if (!grouped.has(row.rawBackgroundHash)) grouped.set(row.rawBackgroundHash, []);
      grouped.get(row.rawBackgroundHash)!.push(row);
    }

    const toDelete: number[] = [];
    for (const [, group] of grouped) {
      if (group.length <= 1) continue;
      // Keep the one with highest libraryUseCount (first after ORDER BY DESC), delete the rest
      const [, ...dupes] = group;
      toDelete.push(...dupes.map(d => d.id));
    }

    if (toDelete.length > 0) {
      await db.update(imageVariantsTable)
        .set({ rawBackground: null, rawBackgroundHash: null })
        .where(inArray(imageVariantsTable.id, toDelete));
      for (const id of toDelete) thumbCache.delete(id);
    }

    return res.json({ removed: toDelete.length, hashGroups: grouped.size });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// GET /api/backgrounds/:id → full background data (raw background for preview).
// Uses ACCESS filter (userId = uid) — permissive, business-agnostic — same rationale as /thumb.
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const tf = await tenantLibraryAccessFilter(req);
    const cond = and(eq(imageVariantsTable.id, id), tf);
    const [row] = await db
      .select({
        id: imageVariantsTable.id,
        postId: imageVariantsTable.postId,
        rawBackground: imageVariantsTable.rawBackground,
        style: imageVariantsTable.style,
        prompt: imageVariantsTable.prompt,
        libraryUseCount: imageVariantsTable.libraryUseCount,
        createdAt: imageVariantsTable.createdAt,
        contentType: postsTable.contentType,
        caption: postsTable.caption,
      })
      .from(imageVariantsTable)
      .leftJoin(postsTable, eq(imageVariantsTable.postId, postsTable.id))
      .where(cond);

    if (!row || !row.rawBackground) {
      return res.status(404).json({ error: "Background not found" });
    }
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
