import { Router } from "express";
import { db } from "@workspace/db";
import { mediaLibraryTable, businessesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import type { Request } from "express";
import { validateBase64Mime } from "../../lib/fileScanner.js";
import { strictOwnerFilter } from "../../lib/tenant.js";
import sharp from "sharp";

const router = Router();

// GET /api/media — list all uploaded media for the authenticated user + business
// Optional query: ?type=image|video  ?businessId=<id>
router.get("/", async (req, res) => {
  try {
    const typeFilter = req.query.type as string | undefined;
    const bizId = req.query.businessId ? Number(req.query.businessId) : null;

    // strictOwnerFilter: sin admin bypass — userId siempre requerido
    // Si viene businessId, filtrar también por él; si no, mostrar todos los medios del usuario
    const filter = strictOwnerFilter(
      mediaLibraryTable.userId,
      req,
      bizId != null ? mediaLibraryTable.businessId : undefined,
      bizId,
    );

    let rows = await db.select({
      id: mediaLibraryTable.id,
      type: mediaLibraryTable.type,
      mimeType: mediaLibraryTable.mimeType,
      filename: mediaLibraryTable.filename,
      label: mediaLibraryTable.label,
      businessId: mediaLibraryTable.businessId,
      createdAt: mediaLibraryTable.createdAt,
    }).from(mediaLibraryTable).where(filter).orderBy(desc(mediaLibraryTable.createdAt));

    if (typeFilter === "image" || typeFilter === "video") {
      rows = rows.filter(r => r.type === typeFilter);
    }

    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    res.status(500).json({ error: msg });
  }
});

// GET /api/media/:id — get a single item including its data (base64)
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  // Strict owner check — solo userId (no businessId) para acceso individual
  const filter = strictOwnerFilter(mediaLibraryTable.userId, req);
  const cond = and(eq(mediaLibraryTable.id, id), filter);
  const [item] = await db.select().from(mediaLibraryTable).where(cond);
  if (!item) return res.status(404).json({ error: "No encontrado" });
  return res.json(item);
});

// POST /api/media — upload a new image or video
// Body: { filename, mimeType, label, data (base64), type ('image'|'video'), businessId? }
router.post("/", async (req, res) => {
  try {
    const { filename, mimeType, label, data, type, businessId } = req.body as {
      filename?: string;
      mimeType?: string;
      label?: string;
      data?: string;
      type?: string;
      businessId?: number;
    };

    if (!data?.trim()) return res.status(400).json({ error: "Campo 'data' requerido (base64)" });
    if (!["image", "video"].includes(type ?? "image")) {
      return res.status(400).json({ error: "Tipo debe ser 'image' o 'video'" });
    }

    // Validar businessId: si se proporciona debe ser un entero positivo válido y pertenecer al usuario.
    // Valores malformados (string, NaN, 0) → 400 fail-closed (no silently fallback a null).
    let validatedBizId: number | null = null;
    if (businessId !== undefined && businessId !== null) {
      const parsedBizId = Number(businessId);
      if (!Number.isInteger(parsedBizId) || parsedBizId <= 0) {
        return res.status(400).json({ error: "businessId debe ser un entero positivo válido" });
      }
      const uid = req.user!.userId;
      const [biz] = await db.select({ id: businessesTable.id })
        .from(businessesTable)
        .where(and(eq(businessesTable.id, parsedBizId), eq(businessesTable.userId, uid)))
        .limit(1);
      if (!biz) return res.status(403).json({ error: "Negocio no válido o no te pertenece" });
      validatedBizId = biz.id;
    }

    const scanResult = await validateBase64Mime(data.trim());
    if (!scanResult.ok) {
      return res.status(400).json({ error: scanResult.error });
    }

    // Normalize EXIF orientation for images
    let normalizedData = data.trim();
    const isImageUpload = (type ?? "image") === "image";
    if (isImageUpload) {
      const buf = Buffer.from(normalizedData, "base64");
      const normalized = await sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer();
      normalizedData = normalized.toString("base64");
    }

    const [inserted] = await db.insert(mediaLibraryTable).values({
      userId: req.user!.userId,
      businessId: validatedBizId,
      type: (type ?? "image") as "image" | "video",
      mimeType: isImageUpload ? "image/jpeg" : (mimeType ?? "image/jpeg"),
      filename: filename ?? "upload",
      label: label ?? "",
      data: normalizedData,
    }).returning({
      id: mediaLibraryTable.id,
      type: mediaLibraryTable.type,
      mimeType: mediaLibraryTable.mimeType,
      filename: mediaLibraryTable.filename,
      label: mediaLibraryTable.label,
      businessId: mediaLibraryTable.businessId,
      createdAt: mediaLibraryTable.createdAt,
    });

    return res.status(201).json(inserted);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return res.status(500).json({ error: msg });
  }
});

// PATCH /api/media/:id — update label and/or image data of a media item
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  const { label, data } = req.body as { label?: string; data?: string };
  const filter = strictOwnerFilter(mediaLibraryTable.userId, req);
  const cond = and(eq(mediaLibraryTable.id, id), filter);

  const updates: { label?: string; data?: string; mimeType?: string } = {};
  if (label !== undefined) updates.label = label;
  if (data !== undefined) {
    const buf = Buffer.from(data, "base64");
    const normalized = await sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer();
    updates.data = normalized.toString("base64");
    updates.mimeType = "image/jpeg";
  }

  const [updated] = await db.update(mediaLibraryTable)
    .set(updates)
    .where(cond)
    .returning({ id: mediaLibraryTable.id, label: mediaLibraryTable.label });
  if (!updated) return res.status(404).json({ error: "No encontrado" });
  return res.json(updated);
});

// DELETE /api/media/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  const filter = strictOwnerFilter(mediaLibraryTable.userId, req);
  const cond = and(eq(mediaLibraryTable.id, id), filter);
  const deleted = await db.delete(mediaLibraryTable)
    .where(cond)
    .returning({ id: mediaLibraryTable.id });
  if (!deleted.length) return res.status(404).json({ error: "No encontrado" });
  return res.json({ ok: true });
});

export default router;
