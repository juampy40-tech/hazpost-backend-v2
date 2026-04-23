import { Router } from "express";
import { db } from "@workspace/db";
import { planBenefitCatalogTable, plansTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

/** GET /api/admin/benefit-catalog — list all catalog items ordered by sort_order */
router.get("/", async (_req, res) => {
  try {
    const items = await db
      .select()
      .from(planBenefitCatalogTable)
      .orderBy(asc(planBenefitCatalogTable.sortOrder), asc(planBenefitCatalogTable.id));
    return res.json({ catalog: items });
  } catch {
    return res.status(500).json({ error: "Error al obtener catálogo de beneficios" });
  }
});

/** POST /api/admin/benefit-catalog — create a new catalog item */
router.post("/", async (req, res) => {
  try {
    const { key, labelTemplate, hasValue, isAuto, sortOrder } = req.body;

    if (!key || typeof key !== "string" || !/^[a-z0-9_]+$/.test(key)) {
      return res.status(400).json({ error: "key debe ser alfanumérico_guión_bajo" });
    }
    if (!labelTemplate || typeof labelTemplate !== "string") {
      return res.status(400).json({ error: "labelTemplate es requerido" });
    }

    const [created] = await db
      .insert(planBenefitCatalogTable)
      .values({
        key:           key.slice(0, 100),
        labelTemplate: labelTemplate.slice(0, 500),
        hasValue:      Boolean(hasValue),
        isAuto:        Boolean(isAuto),
        sortOrder:     Number(sortOrder ?? 0),
      })
      .returning();

    return res.json({ item: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("duplicate key") || msg.includes("unique")) {
      return res.status(409).json({ error: "Ya existe un beneficio con ese key" });
    }
    return res.status(500).json({ error: "Error al crear beneficio" });
  }
});

/** PUT /api/admin/benefit-catalog/:id — update a catalog item */
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const { labelTemplate, hasValue, isAuto, sortOrder } = req.body;

    const set: Record<string, unknown> = {};
    if (labelTemplate !== undefined) set.labelTemplate = String(labelTemplate).slice(0, 500);
    if (hasValue     !== undefined) set.hasValue       = Boolean(hasValue);
    if (isAuto       !== undefined) set.isAuto         = Boolean(isAuto);
    if (sortOrder    !== undefined) set.sortOrder      = Number(sortOrder);

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ error: "Nada que actualizar" });
    }

    const [updated] = await db
      .update(planBenefitCatalogTable)
      .set(set)
      .where(eq(planBenefitCatalogTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Beneficio no encontrado" });
    return res.json({ item: updated });
  } catch {
    return res.status(500).json({ error: "Error al actualizar beneficio" });
  }
});

/** DELETE /api/admin/benefit-catalog/:id — delete a catalog item (only if not referenced by any plan) */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const [item] = await db
      .select()
      .from(planBenefitCatalogTable)
      .where(eq(planBenefitCatalogTable.id, id));
    if (!item) return res.status(404).json({ error: "Beneficio no encontrado" });

    // Check if any plan references this catalogKey in their descriptionJson.features
    const inUse = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM plans
      WHERE description_json IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(description_json->'features') AS f
          WHERE f->>'catalogKey' = ${item.key}
            AND (f->>'enabled')::boolean = true
        )
    `);
    const count = Number((inUse as { rows?: Array<{ cnt: string }> }).rows?.[0]?.cnt ?? 0);
    if (count > 0) {
      return res.status(409).json({
        error: `Este beneficio está activo en ${count} plan(es). Desactívalo de los planes primero.`,
      });
    }

    await db.delete(planBenefitCatalogTable).where(eq(planBenefitCatalogTable.id, id));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Error al eliminar beneficio" });
  }
});

export default router;
