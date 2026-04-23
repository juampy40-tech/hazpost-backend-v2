import { Router } from "express";
import { db } from "@workspace/db";
import { compositionPresetsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

/** Verifica que el negocio pertenece al usuario autenticado */
async function assertBizOwner(userId: number, businessId: number): Promise<boolean> {
  const [biz] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId)))
    .limit(1);
  return !!biz;
}

router.get("/", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const bizId = req.query.businessId ? parseInt(req.query.businessId as string) : null;
    if (!bizId) {
      res.status(400).json({ error: "businessId requerido" });
      return;
    }

    const owned = await assertBizOwner(uid, bizId);
    if (!owned) {
      res.status(403).json({ error: "Acceso denegado al negocio" });
      return;
    }

    const presets = await db
      .select()
      .from(compositionPresetsTable)
      .where(and(eq(compositionPresetsTable.userId, uid), eq(compositionPresetsTable.businessId, bizId)))
      .orderBy(compositionPresetsTable.createdAt);

    res.json({ presets });
  } catch {
    res.status(500).json({ error: "Error obteniendo presets" });
  }
});

router.post("/", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const { businessId, name, configJson } = req.body as {
      businessId?: number;
      name?: string;
      configJson?: unknown;
    };

    if (!businessId || !name || !configJson) {
      res.status(400).json({ error: "businessId, name y configJson son requeridos" });
      return;
    }

    const owned = await assertBizOwner(uid, businessId);
    if (!owned) {
      res.status(403).json({ error: "Acceso denegado al negocio" });
      return;
    }

    const [preset] = await db
      .insert(compositionPresetsTable)
      .values({
        userId: uid,
        businessId,
        name: name.trim().slice(0, 80),
        configJson,
        isDefault: false,
      })
      .returning();

    res.status(201).json({ preset });
  } catch {
    res.status(500).json({ error: "Error creando preset" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const id = parseInt(req.params.id);
    const { name, configJson } = req.body as { name?: string; configJson?: unknown };

    const updates: Partial<{ name: string; configJson: unknown; updatedAt: Date }> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name.trim().slice(0, 80);
    if (configJson !== undefined) updates.configJson = configJson;

    const [updated] = await db
      .update(compositionPresetsTable)
      .set(updates)
      .where(and(eq(compositionPresetsTable.id, id), eq(compositionPresetsTable.userId, uid)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Preset no encontrado" });
      return;
    }

    res.json({ preset: updated });
  } catch {
    res.status(500).json({ error: "Error actualizando preset" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const id = parseInt(req.params.id);

    const [deleted] = await db
      .delete(compositionPresetsTable)
      .where(and(eq(compositionPresetsTable.id, id), eq(compositionPresetsTable.userId, uid)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Preset no encontrado" });
      return;
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error eliminando preset" });
  }
});

router.post("/:id/set-default", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const id = parseInt(req.params.id);

    const [preset] = await db
      .select()
      .from(compositionPresetsTable)
      .where(and(eq(compositionPresetsTable.id, id), eq(compositionPresetsTable.userId, uid)))
      .limit(1);

    if (!preset) {
      res.status(404).json({ error: "Preset no encontrado" });
      return;
    }

    await db
      .update(compositionPresetsTable)
      .set({ isDefault: false })
      .where(
        and(
          eq(compositionPresetsTable.userId, uid),
          eq(compositionPresetsTable.businessId, preset.businessId)
        )
      );

    const [updated] = await db
      .update(compositionPresetsTable)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(compositionPresetsTable.id, id), eq(compositionPresetsTable.userId, uid)))
      .returning();

    res.json({ preset: updated });
  } catch {
    res.status(500).json({ error: "Error estableciendo preset por defecto" });
  }
});

export default router;
