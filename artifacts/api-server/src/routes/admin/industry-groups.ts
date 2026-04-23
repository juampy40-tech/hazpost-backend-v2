import { Router } from "express";
import { db } from "@workspace/db";
import { industryGroupsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

/**
 * GET /api/admin/industry-groups
 * Lista todos los grupos de industria.
 */
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(industryGroupsTable)
      .orderBy(asc(industryGroupsTable.displayName));
    const parsed = rows.map(r => ({
      ...r,
      keywords: (() => { try { return JSON.parse(r.keywords); } catch { return []; } })(),
    }));
    return res.json(parsed);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/admin/industry-groups
 * Crea un nuevo grupo de industria.
 * Body: { slug, displayName, keywords? }
 */
router.post("/", async (req, res) => {
  try {
    const { slug, displayName, keywords } = req.body ?? {};
    if (!slug || !displayName) return res.status(400).json({ error: "slug and displayName are required" });
    const safeSlug = String(slug).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const kw: string[] = Array.isArray(keywords) ? keywords.map(String) : [];
    const [created] = await db.insert(industryGroupsTable).values({
      slug: safeSlug,
      displayName: String(displayName),
      keywords: JSON.stringify(kw),
    }).returning();
    return res.status(201).json({ ...created, keywords: kw });
  } catch (err) {
    if (String(err).includes("unique")) return res.status(409).json({ error: "Slug already exists" });
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * PUT /api/admin/industry-groups/:slug
 * Actualiza displayName y/o keywords de un grupo.
 * Body: { displayName?, keywords? }
 */
router.put("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { displayName, keywords } = req.body ?? {};
    const updates: Record<string, string> = {};
    if (displayName != null) updates.displayName = String(displayName);
    if (Array.isArray(keywords)) updates.keywords = JSON.stringify(keywords.map(String));
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
    const [updated] = await db.update(industryGroupsTable).set(updates).where(eq(industryGroupsTable.slug, slug)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json({ ...updated, keywords: (() => { try { return JSON.parse(updated.keywords); } catch { return []; } })() });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * DELETE /api/admin/industry-groups/:slug
 * Elimina un grupo (no borra los image_variants asociados — solo queda sin grupo).
 */
router.delete("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const [deleted] = await db.delete(industryGroupsTable).where(eq(industryGroupsTable.slug, slug)).returning();
    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true, slug });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
