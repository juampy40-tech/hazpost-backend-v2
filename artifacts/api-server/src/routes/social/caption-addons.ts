import { Router } from "express";
import { db } from "@workspace/db";
import { captionAddonsTable, type NewCaptionAddon } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getActiveBusinessId } from "../../lib/businesses.js";
import type { Request } from "express";

const router = Router();

router.get("/", async (req: Request, res) => {
  try {
    const userId = req.user!.userId;
    const bizId = await getActiveBusinessId(userId);

    const conditions = bizId != null
      ? [eq(captionAddonsTable.businessId, bizId)]
      : [eq(captionAddonsTable.userId, userId)];

    const addons = await db.select().from(captionAddonsTable)
      .where(and(...conditions))
      .orderBy(captionAddonsTable.createdAt);

    res.json(addons);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener textos adicionales" });
  }
});

router.post("/", async (req: Request, res): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const bizId = await getActiveBusinessId(userId);
    const { name, keywords, text, position, active } = req.body;

    if (!name?.trim()) { res.status(400).json({ error: "El nombre es requerido" }); return; }
    if (!text?.trim()) { res.status(400).json({ error: "El texto es requerido" }); return; }

    const [addon] = await db.insert(captionAddonsTable).values({
      userId,
      ...(bizId != null ? { businessId: bizId } : {}),
      name: name.trim(),
      keywords: keywords?.trim() ?? "",
      text: text.trim(),
      position: position === "before" ? "before" : "after",
      active: active !== false,
    }).returning();

    res.status(201).json(addon);
  } catch (err) {
    res.status(500).json({ error: "Error al crear texto adicional" });
  }
});

router.put("/:id", async (req: Request, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const userId = req.user!.userId;
    const bizId = await getActiveBusinessId(userId);
    const { name, keywords, text, position, active } = req.body;

    const cond = bizId != null
      ? and(eq(captionAddonsTable.id, id), eq(captionAddonsTable.businessId, bizId))
      : and(eq(captionAddonsTable.id, id), eq(captionAddonsTable.userId, userId));

    const updates: Partial<NewCaptionAddon> & { updatedAt: Date } = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (keywords !== undefined) updates.keywords = keywords.trim();
    if (text !== undefined) updates.text = text.trim();
    if (position !== undefined) updates.position = position === "before" ? "before" : "after";
    if (active !== undefined) updates.active = Boolean(active);

    const [addon] = await db.update(captionAddonsTable).set(updates).where(cond).returning();
    if (!addon) { res.status(404).json({ error: "Texto adicional no encontrado" }); return; }

    res.json(addon);
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar texto adicional" });
  }
});

router.delete("/:id", async (req: Request, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user!.userId;
    const bizId = await getActiveBusinessId(userId);

    const cond = bizId != null
      ? and(eq(captionAddonsTable.id, id), eq(captionAddonsTable.businessId, bizId))
      : and(eq(captionAddonsTable.id, id), eq(captionAddonsTable.userId, userId));

    await db.delete(captionAddonsTable).where(cond);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar texto adicional" });
  }
});

export { router as captionAddonsRouter };
