import { Router } from "express";
import { db, brandProfilesTable, businessesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { ObjectPermission } from "../lib/objectAcl.js";
import sharp from "sharp";
import { analyzeReferenceImage } from "../services/ai.service.js";
import { analyzeWebsite } from "./analyze-website.js";
import { invalidateIndustryContextCache } from "../lib/industryAiContext.js";

const MAX_REFERENCE_IMAGES = 5;
const REFERENCE_IMAGE_MAX_SIZE = 768; // px (longest side)

interface ReferenceImageEntry {
  base64: string;   // compressed JPEG data URI for display
  analysis: string; // GPT-4o vision description for AI use
  addedAt: string;  // ISO date
}

function normalizeSubIndustries(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (typeof item !== "string") continue;
    const name = item.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    cleaned.push(name);
  }

  return cleaned.slice(0, 20);
}

function applySubIndustryUpdates(updates: Record<string, unknown>, value: unknown) {
  const arr = normalizeSubIndustries(value);
  updates.subIndustry = arr.length > 0 ? arr.join(", ") : null;
  updates.subIndustries = JSON.stringify(arr);
}

const router = Router();
const objectStorage = new ObjectStorageService();

/**
 * GET /api/brand-profile
 * Returns the brand profile for the authenticated user.
 */
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const [profile] = await db.select().from(brandProfilesTable).where(eq(brandProfilesTable.userId, userId)).limit(1);
  return res.json({ profile: profile ?? null });
});

/**
 * PUT /api/brand-profile
 * Upsert brand profile for the authenticated user.
 * Accepts partial updates — only provided fields are updated.
 */
router.put("/", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const body = req.body as Record<string, unknown>;

  const allowedFields = new Set([
    "companyName", "slogan", "industry", "subIndustry", "subIndustries", "country", "city", "website",
    "logoUrl", "logoUrls", "primaryColor", "secondaryColor", "businessDescription",
    "brandFont", "brandFontUrl",
    "audienceDescription", "brandTone", "referenceImages",
    "defaultLocation",
    "onboardingStep", "onboardingCompleted",
  ]);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(body)) {
    if (!allowedFields.has(key)) continue;
    // Basic type/range validation per field
    if (key === "onboardingStep") {
      const step = Number(value);
      if (!Number.isInteger(step) || step < 0 || step > 5) continue;
      updates[key] = step;
    } else if (key === "onboardingCompleted") {
      // Normalize to strict boolean
      if (value === true || value === "true") updates[key] = true;
      else if (value === false || value === "false") updates[key] = false;
      // Ignore invalid values
    } else if (key === "subIndustry" || key === "subIndustries") {
      // Centralized multi-subcategory support.
      // Accepts legacy comma-separated subIndustry OR modern subIndustries array,
      // stores both formats so old and new parts of HazPost keep working.
      applySubIndustryUpdates(updates, value);
    } else if (key === "slogan" && typeof value === "string") {
      updates[key] = value.slice(0, 150);
    } else if (typeof value === "string" && value.length > 5000) {
      // Prevent excessively long text from being stored
      updates[key] = value.slice(0, 5000);
    } else {
      updates[key] = value;
    }
  }

  const [existing] = await db.select({
    id: brandProfilesTable.id,
    onboardingStep: brandProfilesTable.onboardingStep,
    onboardingCompleted: brandProfilesTable.onboardingCompleted,
  }).from(brandProfilesTable).where(eq(brandProfilesTable.userId, userId)).limit(1);

  // For completed profiles, never lower the stored onboardingStep during navigation —
  // only allow it to advance (max). This prevents re-triggering the wizard when editing.
  if (existing && (existing.onboardingCompleted === true || existing.onboardingCompleted === "true")) {
    if ("onboardingStep" in updates && typeof updates.onboardingStep === "number") {
      updates.onboardingStep = Math.max(existing.onboardingStep ?? 0, updates.onboardingStep);
    }
  }

  let profile;
  if (existing) {
    [profile] = await db.update(brandProfilesTable)
      .set(updates)
      .where(eq(brandProfilesTable.userId, userId))
      .returning();
  } else {
    [profile] = await db.insert(brandProfilesTable)
      .values({ userId, ...updates })
      .returning();
  }

  // Mirror all brand fields into the default business so getBrandContextBlock (which reads businesses)
  // always has up-to-date data — covers Google OAuth path, onboarding, and manual profile edits.
  // Note: brand_profiles.businessDescription → businesses.description (different column names).
  const bizUpdates: Record<string, unknown> = {};
  if ("logoUrl" in updates)             bizUpdates.logoUrl = updates.logoUrl;
  if ("logoUrls" in updates)            bizUpdates.logoUrls = updates.logoUrls;
  if ("primaryColor" in updates)        bizUpdates.primaryColor = updates.primaryColor;
  if ("secondaryColor" in updates)      bizUpdates.secondaryColor = updates.secondaryColor;
  if ("industry" in updates)            bizUpdates.industry = updates.industry;
  if ("subIndustry" in updates)         bizUpdates.subIndustry = updates.subIndustry;
  if ("subIndustries" in updates)       bizUpdates.subIndustries = updates.subIndustries;
  if ("slogan" in updates)              bizUpdates.slogan = updates.slogan;
  if ("businessDescription" in updates) bizUpdates.description = updates.businessDescription;
  if ("audienceDescription" in updates) bizUpdates.audienceDescription = updates.audienceDescription;
  if ("brandTone" in updates)           bizUpdates.brandTone = updates.brandTone;
  if ("brandFont" in updates)           bizUpdates.brandFont = updates.brandFont;
  if ("defaultLocation" in updates)     bizUpdates.defaultLocation = updates.defaultLocation;
  // Mirror referenceImages so generateImagesForPostsBg (which reads businesses.referenceImages)
  // always receives the GPT-4o-analyzed entries — not just plain base64 strings.
  if ("referenceImages" in updates)     bizUpdates.referenceImages = updates.referenceImages;
  // Mirror website URL so getBrandContextBlock (businesses path) can include it.
  if ("website" in updates)             bizUpdates.website = updates.website;
  if (Object.keys(bizUpdates).length > 0) {
    await db.update(businessesTable)
      .set(bizUpdates)
      .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isDefault, true)))
      .catch(() => {});
  }

  // Invalidar caché de ai_context si la industria o subcategorías cambiaron (sincronización: perfil → IA)
  if ("industry" in updates && typeof updates.industry === "string") {
    invalidateIndustryContextCache(updates.industry);
  }
  if ("subIndustry" in updates && typeof updates.industry === "string") {
    invalidateIndustryContextCache(updates.industry);
  }

  return res.json({ profile });
});

/**
 * POST /api/brand-profile/remove-logo-bg
 * Downloads the user's logo from object storage, removes the white/light background
 * using sharp, uploads the resulting transparent PNG, and updates logoUrl.
 */
router.post("/remove-logo-bg", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  // Accept specific logoUrl from body (multi-logo), or fall back to primary from DB
  const bodyLogoUrl = (req.body as { logoUrl?: string }).logoUrl ?? null;
  let targetLogoUrl: string | null = bodyLogoUrl;

  if (!targetLogoUrl) {
    const [profile] = await db.select({ logoUrl: brandProfilesTable.logoUrl })
      .from(brandProfilesTable)
      .where(eq(brandProfilesTable.userId, userId))
      .limit(1);
    targetLogoUrl = profile?.logoUrl ?? null;
  }

  if (!targetLogoUrl) {
    return res.status(400).json({ error: "No hay logo guardado para procesar." });
  }

  try {
    const normalizedPath = objectStorage.normalizeObjectEntityPath(targetLogoUrl);
    let objectFile;
    try {
      objectFile = await objectStorage.getObjectEntityFile(normalizedPath);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "El logo no fue encontrado en el almacenamiento." });
      }
      throw err;
    }

    // Ownership check: verify the requesting user owns this object
    const canProcess = await objectStorage.canAccessObjectEntity({
      userId: String(userId),
      objectFile,
      requestedPermission: ObjectPermission.WRITE,
    });
    if (!canProcess) {
      return res.status(403).json({ error: "No tienes permiso para modificar este logo." });
    }

    const downloadResponse = await objectStorage.downloadObject(objectFile);
    const inputBuffer = Buffer.from(await downloadResponse.arrayBuffer());

    // Convert to RGBA raw pixels so we can manipulate alpha per-pixel
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    const threshold = 240; // pixels above this value in all channels are treated as "white"
    const tolerance = 30;  // how close to white to consider for edge feathering

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (r >= threshold && g >= threshold && b >= threshold) {
        // Fully transparent for clear white pixels
        pixels[i + 3] = 0;
      } else if (r >= threshold - tolerance && g >= threshold - tolerance && b >= threshold - tolerance) {
        // Semi-transparent for near-white (feathered edge)
        const brightness = Math.min(r, g, b);
        const alpha = Math.round(((threshold - brightness) / tolerance) * 255);
        pixels[i + 3] = Math.min(pixels[i + 3], alpha);
      }
    }

    const processedBuffer = await sharp(Buffer.from(pixels), {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();

    // Upload processed PNG to a new object in storage
    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const newObjectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

    await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "image/png", "Content-Length": String(processedBuffer.length) },
      body: processedBuffer,
    });

    // Only update DB logoUrl if no specific logo was passed in body (legacy / primary logo flow)
    if (!bodyLogoUrl) {
      await db.update(brandProfilesTable)
        .set({ logoUrl: newObjectPath, updatedAt: new Date() })
        .where(eq(brandProfilesTable.userId, userId));
    }

    return res.json({ logoUrl: newObjectPath });
  } catch (err) {
    console.error("[remove-logo-bg] error:", err);
    return res.status(500).json({ error: "No se pudo procesar el logo." });
  }
});

/**
 * GET /api/brand-profile/admin/all
 * Returns onboarding completion + company info for all users (admin only).
 */
router.get("/admin/all", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  const profiles = await db.select({
    userId: brandProfilesTable.userId,
    onboardingStep: brandProfilesTable.onboardingStep,
    onboardingCompleted: brandProfilesTable.onboardingCompleted,
    companyName: brandProfilesTable.companyName,
    industry: brandProfilesTable.industry,
    country: brandProfilesTable.country,
    city: brandProfilesTable.city,
    website: brandProfilesTable.website,
    audienceDescription: brandProfilesTable.audienceDescription,
    brandTone: brandProfilesTable.brandTone,
    businessDescription: brandProfilesTable.businessDescription,
    updatedAt: brandProfilesTable.updatedAt,
    websiteAnalyzedAt: brandProfilesTable.websiteAnalyzedAt,
  }).from(brandProfilesTable);

  return res.json({ profiles });
});

/**
 * GET /api/brand-profile/admin/:userId
 * Returns full brand profile for a specific user (admin only).
 */
router.get("/admin/:userId", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  const userId = Number(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ error: "ID de usuario inválido" });
  const [profile] = await db.select().from(brandProfilesTable).where(eq(brandProfilesTable.userId, userId)).limit(1);
  return res.json({ profile: profile ?? null });
});

/**
 * GET /api/brand-profile/reference-images
 * Returns saved reference images (up to 5) for the authenticated user.
 */
router.get("/reference-images", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const [profile] = await db
    .select({ referenceImages: brandProfilesTable.referenceImages })
    .from(brandProfilesTable)
    .where(eq(brandProfilesTable.userId, userId))
    .limit(1);

  let images: ReferenceImageEntry[] = [];
  if (profile?.referenceImages) {
    try {
      images = JSON.parse(profile.referenceImages);
    } catch {
      images = [];
    }
  }
  return res.json({ images });
});

/**
 * POST /api/brand-profile/reference-images
 * Adds a reference image (max 5). Compresses and analyzes it with GPT-4o vision.
 * Body: { imageDataUri: string } — data:image/... base64 URI
 */
router.post("/reference-images", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { imageDataUri } = req.body as { imageDataUri?: string };
  if (!imageDataUri || !imageDataUri.startsWith("data:image")) {
    return res.status(400).json({ error: "Se requiere imageDataUri (data URI de imagen)" });
  }

  // Load existing images
  const [profile] = await db
    .select({ referenceImages: brandProfilesTable.referenceImages })
    .from(brandProfilesTable)
    .where(eq(brandProfilesTable.userId, userId))
    .limit(1);

  let images: ReferenceImageEntry[] = [];
  if (profile?.referenceImages) {
    try { images = JSON.parse(profile.referenceImages); } catch { images = []; }
  }

  if (images.length >= MAX_REFERENCE_IMAGES) {
    return res.status(400).json({ error: `Máximo ${MAX_REFERENCE_IMAGES} imágenes de referencia permitidas. Elimina una para agregar otra.` });
  }

  // Compress image with sharp (resize to max 768px, JPEG 80%)
  let compressedBase64: string;
  try {
    const base64Data = imageDataUri.split(",")[1];
    const inputBuffer = Buffer.from(base64Data, "base64");
    const compressedBuffer = await sharp(inputBuffer)
      .resize(REFERENCE_IMAGE_MAX_SIZE, REFERENCE_IMAGE_MAX_SIZE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    compressedBase64 = `data:image/jpeg;base64,${compressedBuffer.toString("base64")}`;
  } catch (err) {
    console.error("[reference-images] Compression error:", err);
    return res.status(400).json({ error: "No se pudo procesar la imagen. Asegúrate de que sea una imagen válida." });
  }

  // Analyze with GPT-4o vision
  let analysis = "";
  try {
    analysis = await analyzeReferenceImage(compressedBase64) ?? "";
  } catch (err) {
    console.error("[reference-images] Analysis error (non-fatal):", err);
    analysis = "";
  }

  images.push({ base64: compressedBase64, analysis, addedAt: new Date().toISOString() });

  // Save back to DB
  const updated = JSON.stringify(images);
  if (profile) {
    await db.update(brandProfilesTable)
      .set({ referenceImages: updated, updatedAt: new Date() })
      .where(eq(brandProfilesTable.userId, userId));
  } else {
    await db.insert(brandProfilesTable)
      .values({ userId, referenceImages: updated });
  }

  // Mirror to default business so generateImagesForPostsBg picks up analyzed entries
  await db.update(businessesTable)
    .set({ referenceImages: updated })
    .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isDefault, true)))
    .catch(() => {});

  return res.json({ images, added: true });
});

/**
 * DELETE /api/brand-profile/reference-images/:index
 * Removes the reference image at the given index.
 */
router.delete("/reference-images/:index", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({ error: "Índice inválido" });
  }

  const [profile] = await db
    .select({ referenceImages: brandProfilesTable.referenceImages })
    .from(brandProfilesTable)
    .where(eq(brandProfilesTable.userId, userId))
    .limit(1);

  let images: ReferenceImageEntry[] = [];
  if (profile?.referenceImages) {
    try { images = JSON.parse(profile.referenceImages); } catch { images = []; }
  }

  if (index >= images.length) {
    return res.status(404).json({ error: "Imagen no encontrada en esa posición" });
  }

  images.splice(index, 1);
  const updated = JSON.stringify(images);

  await db.update(brandProfilesTable)
    .set({ referenceImages: updated, updatedAt: new Date() })
    .where(eq(brandProfilesTable.userId, userId));

  // Mirror to default business
  await db.update(businessesTable)
    .set({ referenceImages: updated })
    .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isDefault, true)))
    .catch(() => {});

  return res.json({ images, removed: true });
});

/**
 * POST /api/brand-profile/admin/:userId/reanalyze
 * Admin-only: re-analyzes the website of a user and updates their brand profile
 * with the new brandTone and audienceDescription returned by AI.
 */
router.post("/admin/:userId/reanalyze", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "userId inválido" });

  const [profile] = await db
    .select({
      website: brandProfilesTable.website,
    })
    .from(brandProfilesTable)
    .where(eq(brandProfilesTable.userId, userId))
    .limit(1);

  if (!profile) return res.status(404).json({ error: "Perfil de marca no encontrado para este usuario" });
  if (!profile.website) return res.status(400).json({ error: "El usuario no tiene sitio web configurado" });

  const websiteUrl = Array.isArray(profile.website) ? profile.website[0] : profile.website;
  if (!websiteUrl) return res.status(400).json({ error: "El usuario no tiene sitio web configurado" });

  const result = await analyzeWebsite(websiteUrl);

  const hasAnyField = result.tone || result.audience || result.description;
  if (!hasAnyField) {
    return res.json({
      ok: false,
      warning: "El sitio web no devolvió información útil. Verifica que la URL sea accesible y tenga contenido.",
      updated: { brandTone: null, audienceDescription: null, businessDescription: null },
    });
  }

  const now = new Date();
  const profileUpdates: Record<string, unknown> = { updatedAt: now, websiteAnalyzedAt: now };
  if (result.tone) profileUpdates.brandTone = result.tone;
  if (result.audience) profileUpdates.audienceDescription = result.audience;
  if (result.description) profileUpdates.businessDescription = result.description;

  await db
    .update(brandProfilesTable)
    .set(profileUpdates)
    .where(eq(brandProfilesTable.userId, userId));

  // Mirror tone and audience to the user's default business for consistency
  const businessUpdates: Record<string, unknown> = {};
  if (result.tone) businessUpdates.brandTone = result.tone;
  if (result.audience) businessUpdates.audienceDescription = result.audience;
  if (Object.keys(businessUpdates).length > 0) {
    await db
      .update(businessesTable)
      .set(businessUpdates)
      .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isDefault, true)))
      .catch(() => {});
  }

  return res.json({
    ok: true,
    updated: {
      brandTone: result.tone ?? null,
      audienceDescription: result.audience ?? null,
      businessDescription: result.description ?? null,
    },
  });
});

/**
 * PATCH /api/brand-profile/admin/:userId
 * Admin-only: manually update brandTone, audienceDescription, companyName and/or businessDescription for a user.
 */
router.patch("/admin/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "userId inválido" });

  const body = req.body as Record<string, unknown>;
  const rawTone = body.brandTone;
  const rawAudience = body.audienceDescription;
  const rawCompanyName = body.companyName;
  const rawBusinessDescription = body.businessDescription;

  if (rawTone === undefined && rawAudience === undefined && rawCompanyName === undefined && rawBusinessDescription === undefined) {
    return res.status(400).json({ error: "Se requiere al menos un campo: brandTone, audienceDescription, companyName o businessDescription" });
  }
  if (rawTone !== undefined && typeof rawTone !== "string") {
    return res.status(400).json({ error: "brandTone debe ser texto" });
  }
  if (rawAudience !== undefined && typeof rawAudience !== "string") {
    return res.status(400).json({ error: "audienceDescription debe ser texto" });
  }
  if (rawCompanyName !== undefined && typeof rawCompanyName !== "string") {
    return res.status(400).json({ error: "companyName debe ser texto" });
  }
  if (rawBusinessDescription !== undefined && typeof rawBusinessDescription !== "string") {
    return res.status(400).json({ error: "businessDescription debe ser texto" });
  }

  const brandTone = rawTone as string | undefined;
  const audienceDescription = rawAudience as string | undefined;
  const companyName = rawCompanyName as string | undefined;
  const businessDescription = rawBusinessDescription as string | undefined;

  const [existing] = await db
    .select({ id: brandProfilesTable.id })
    .from(brandProfilesTable)
    .where(eq(brandProfilesTable.userId, userId))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Perfil de marca no encontrado para este usuario" });

  const profileUpdates: Record<string, unknown> = { updatedAt: new Date() };
  if (brandTone !== undefined) profileUpdates.brandTone = brandTone.slice(0, 500);
  if (audienceDescription !== undefined) profileUpdates.audienceDescription = audienceDescription.slice(0, 2000);
  if (companyName !== undefined) profileUpdates.companyName = companyName.slice(0, 300);
  if (businessDescription !== undefined) profileUpdates.businessDescription = businessDescription.slice(0, 5000);

  await db.update(brandProfilesTable).set(profileUpdates).where(eq(brandProfilesTable.userId, userId));

  // Mirror to default business for consistency
  const businessUpdates: Record<string, unknown> = {};
  if (brandTone !== undefined) businessUpdates.brandTone = brandTone.slice(0, 500);
  if (audienceDescription !== undefined) businessUpdates.audienceDescription = audienceDescription.slice(0, 2000);
  if (businessDescription !== undefined) businessUpdates.description = businessDescription.slice(0, 5000);
  if (Object.keys(businessUpdates).length > 0) {
    await db
      .update(businessesTable)
      .set(businessUpdates)
      .where(and(eq(businessesTable.userId, userId), eq(businessesTable.isDefault, true)))
      .catch(() => {});
  }

  return res.json({ ok: true, updated: profileUpdates });
});

export default router;

