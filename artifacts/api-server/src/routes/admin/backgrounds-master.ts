import { Router } from "express";
import { db } from "@workspace/db";
import { imageVariantsTable, postsTable, industryGroupsTable } from "@workspace/db";
import { eq, isNotNull, and, desc, asc, like, ilike } from "drizzle-orm";

const router = Router();

/**
 * GET /api/admin/backgrounds-master
 * Biblioteca Master — admin only, ve TODOS los fondos sin filtro de tenant.
 * Query params:
 *   page      — número de página (default 1)
 *   limit     — items por página (default 50, max 200)
 *   slug      — filtrar por industryGroupSlug exacto
 *   search    — búsqueda parcial en prompt / style
 */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1") || 1);
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? "50") || 50));
    const offset = (page - 1) * limit;
    const slugFilter = req.query.slug as string | undefined;
    const search = req.query.search as string | undefined;

    const conditions = [isNotNull(imageVariantsTable.rawBackground)];
    if (slugFilter) conditions.push(eq(imageVariantsTable.industryGroupSlug, slugFilter));
    if (search) {
      conditions.push(
        // drizzle OR — ilike on prompt or style
        ilike(imageVariantsTable.prompt, `%${search}%`)
      );
    }
    const where = and(...conditions);

    const rows = await db
      .select({
        id: imageVariantsTable.id,
        userId: imageVariantsTable.userId,
        businessId: imageVariantsTable.businessId,
        postId: imageVariantsTable.postId,
        style: imageVariantsTable.style,
        prompt: imageVariantsTable.prompt,
        libraryUseCount: imageVariantsTable.libraryUseCount,
        industryGroupSlug: imageVariantsTable.industryGroupSlug,
        createdAt: imageVariantsTable.createdAt,
        contentType: postsTable.contentType,
      })
      .from(imageVariantsTable)
      .leftJoin(postsTable, eq(imageVariantsTable.postId, postsTable.id))
      .where(where)
      .orderBy(asc(imageVariantsTable.industryGroupSlug), desc(imageVariantsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const groups = await db
      .select({ slug: industryGroupsTable.slug, displayName: industryGroupsTable.displayName })
      .from(industryGroupsTable)
      .orderBy(asc(industryGroupsTable.displayName));

    const groupMap = new Map(groups.map(g => [g.slug, g.displayName]));

    const enriched = rows.map(r => ({
      ...r,
      groupDisplayName: r.industryGroupSlug ? (groupMap.get(r.industryGroupSlug) ?? r.industryGroupSlug) : null,
    }));

    res.json({ data: enriched, page, limit, industryGroups: groups });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * DELETE /api/admin/backgrounds-master/:id
 * Admin hard-clears rawBackground (soft-delete from library) for any background.
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [row] = await db
      .select({ id: imageVariantsTable.id })
      .from(imageVariantsTable)
      .where(and(eq(imageVariantsTable.id, id), isNotNull(imageVariantsTable.rawBackground)));
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.update(imageVariantsTable)
      .set({ rawBackground: null, rawBackgroundHash: null })
      .where(eq(imageVariantsTable.id, id));
    return res.json({ success: true, id });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
