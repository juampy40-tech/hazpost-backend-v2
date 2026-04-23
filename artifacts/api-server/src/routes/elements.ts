import { Router } from "express";
import { db } from "@workspace/db";
import { businessElementsTable, businessesTable } from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { applyCompositionLayers, type ElementPosition } from "../services/ai.service.js";

const router = Router();
const storage = new ObjectStorageService();

/** Validates that businessId belongs to userId. Returns false if not. */
async function assertBizOwner(userId: number, businessId: number): Promise<boolean> {
  const [biz] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId)))
    .limit(1);
  return !!biz;
}

async function analyzeElement(elementId: number, storageKey: string): Promise<void> {
  try {
    const file = await storage.getObjectEntityFile(storageKey);
    const response = await storage.downloadObject(file);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString("base64");

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 150,
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente de arte. Describe este elemento visual en 2-3 frases: " +
            "qué es, sus colores dominantes, forma y estilo. Sé conciso y descriptivo. " +
            "Responde solo con la descripción, sin títulos ni listas.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe este elemento visual:" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" } },
          ],
        },
      ],
    });

    const analysis = gptResponse.choices[0]?.message?.content?.trim() ?? "";

    await db
      .update(businessElementsTable)
      .set({ analysis, analysisStatus: "done" })
      .where(eq(businessElementsTable.id, elementId));

    console.log(`[elements] análisis completado para elementId=${elementId}`);
  } catch (err) {
    console.error(`[elements] error analizando elementId=${elementId}:`, err);
    await db
      .update(businessElementsTable)
      .set({ analysisStatus: "error" })
      .where(eq(businessElementsTable.id, elementId));
  }
}

router.post("/upload-url", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const bizId = req.body.businessId ? parseInt(req.body.businessId) : null;
    if (!bizId) {
      res.status(400).json({ error: "businessId requerido" });
      return;
    }
    if (!(await assertBizOwner(uid, bizId))) {
      res.status(403).json({ error: "El negocio no pertenece a este usuario" });
      return;
    }

    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);

    res.json({ uploadURL, objectPath });
  } catch {
    res.status(500).json({ error: "Error generando URL de subida" });
  }
});

router.post("/", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const { businessId, name, storageKey } = req.body as {
      businessId?: number;
      name?: string;
      storageKey?: string;
    };

    if (!businessId || !name || !storageKey) {
      res.status(400).json({ error: "businessId, name y storageKey son requeridos" });
      return;
    }
    // Validate storageKey format: must be an object path, not an arbitrary URL or traversal attempt
    const cleanKey = storageKey.trim();
    if (
      cleanKey.length < 5 || cleanKey.length > 500 ||
      cleanKey.includes("://") || cleanKey.includes("..") || (cleanKey.startsWith("/") && !cleanKey.startsWith("/objects/"))
    ) {
      res.status(400).json({ error: "storageKey inválido" });
      return;
    }
    if (!(await assertBizOwner(uid, businessId))) {
      res.status(403).json({ error: "El negocio no pertenece a este usuario" });
      return;
    }

    const [element] = await db
      .insert(businessElementsTable)
      .values({
        userId: uid,
        businessId,
        name: name.trim().slice(0, 100),
        storageKey: cleanKey,
        analysisStatus: "pending",
      })
      .returning();

    res.status(201).json({ element });

    analyzeElement(element!.id, cleanKey).catch(() => {});
  } catch {
    res.status(500).json({ error: "Error guardando elemento" });
  }
});

router.get("/", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const bizId = req.query.businessId ? parseInt(req.query.businessId as string) : null;
    if (!bizId) {
      res.status(400).json({ error: "businessId requerido" });
      return;
    }
    if (!(await assertBizOwner(uid, bizId))) {
      res.status(403).json({ error: "El negocio no pertenece a este usuario" });
      return;
    }

    const elements = await db
      .select()
      .from(businessElementsTable)
      .where(and(eq(businessElementsTable.userId, uid), eq(businessElementsTable.businessId, bizId)))
      .orderBy(asc(businessElementsTable.sortOrder), asc(businessElementsTable.createdAt));

    res.json({ elements });
  } catch {
    res.status(500).json({ error: "Error obteniendo elementos" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const id = parseInt(req.params.id);
    const { name, sortOrder } = req.body as { name?: string; sortOrder?: number };

    const updates: Partial<{ name: string; sortOrder: number }> = {};
    if (name !== undefined) updates.name = name.trim().slice(0, 100);
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [updated] = await db
      .update(businessElementsTable)
      .set(updates)
      .where(and(eq(businessElementsTable.id, id), eq(businessElementsTable.userId, uid)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Elemento no encontrado" });
      return;
    }

    res.json({ element: updated });
  } catch {
    res.status(500).json({ error: "Error actualizando elemento" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const id = parseInt(req.params.id);

    const [element] = await db
      .select()
      .from(businessElementsTable)
      .where(and(eq(businessElementsTable.id, id), eq(businessElementsTable.userId, uid)))
      .limit(1);

    if (!element) {
      res.status(404).json({ error: "Elemento no encontrado" });
      return;
    }

    await db
      .delete(businessElementsTable)
      .where(and(eq(businessElementsTable.id, id), eq(businessElementsTable.userId, uid)));

    try {
      const file = await storage.getObjectEntityFile(element.storageKey);
      await file.delete();
    } catch {
      console.warn(`[elements] no se pudo borrar objeto ${element.storageKey} del storage`);
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error eliminando elemento" });
  }
});

/**
 * POST /api/elements/apply-layers
 *
 * Applies composition layers (elements, logo, text) onto a raw background image
 * using Sharp — sin regenerar DALL-E.
 *
 * Body:
 * {
 *   rawBackground: string,          // base64 de la imagen limpia
 *   businessId: number,             // para validar ownership de elementos
 *   elements: [{ elementId, position, sizePercent }],
 *   logo: { enabled, logoBase64? }, // logoBase64 = base64 del logo del negocio (env. frontend)
 *   text: { enabled, headline?, style?, position? }
 * }
 */
router.post("/apply-layers", async (req, res) => {
  try {
    const uid = req.user!.userId;
    const {
      rawBackground,
      businessId,
      elements: elementConfigs = [],
      logo,
      text,
    } = req.body as {
      rawBackground: string;
      businessId: number;
      elements?: { elementId: number; position: string; sizePercent: number }[];
      logo?: { enabled: boolean; logoBase64?: string };
      text?: { enabled: boolean; headline?: string; style?: string; position?: string; accentColor?: string; titleColor2?: string };
    };

    if (!rawBackground || !businessId) {
      res.status(400).json({ error: "rawBackground y businessId son requeridos" });
      return;
    }

    const elementIds = elementConfigs.map(e => e.elementId).filter(Boolean);

    let resolvedElements: { elementId: number; position: ElementPosition; sizePercent: number; buffer: Buffer }[] = [];

    if (elementIds.length > 0) {
      const dbElements = await db
        .select()
        .from(businessElementsTable)
        .where(
          and(
            inArray(businessElementsTable.id, elementIds),
            eq(businessElementsTable.userId, uid),
            eq(businessElementsTable.businessId, businessId)
          )
        );

      const elementMap = new Map(dbElements.map(e => [e.id, e]));

      for (const cfg of elementConfigs) {
        const dbEl = elementMap.get(cfg.elementId);
        if (!dbEl) continue;
        try {
          const file = await storage.getObjectEntityFile(dbEl.storageKey);
          const response = await storage.downloadObject(file);
          const buffer = Buffer.from(await response.arrayBuffer());
          resolvedElements.push({
            elementId: cfg.elementId,
            position: cfg.position as ElementPosition,
            sizePercent: cfg.sizePercent,
            buffer,
          });
        } catch {
          console.warn(`[elements/apply-layers] no se pudo cargar elemento ${cfg.elementId}`);
        }
      }
    }

    const logoBuffer = logo?.enabled && logo.logoBase64
      ? Buffer.from(logo.logoBase64, "base64")
      : null;

    const result = await applyCompositionLayers(rawBackground, {
      logo: logo?.enabled
        ? { enabled: true, buffer: logoBuffer }
        : { enabled: false },
      text: text?.enabled
        ? {
            enabled: true,
            headline: text.headline,
            style: text.style,
            position: text.position,
            accentColor: text.accentColor,
            titleColor2: text.titleColor2,
          }
        : { enabled: false },
      elements: resolvedElements,
    });

    res.json({ imageData: result });
  } catch {
    res.status(500).json({ error: "Error aplicando capas de composición" });
  }
});

export default router;
