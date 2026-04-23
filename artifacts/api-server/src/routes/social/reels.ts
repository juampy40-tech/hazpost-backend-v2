import { Router } from "express";
import { generateReelForVariant, getReelDownloadUrl, generateCarouselVideoForPost, generateCarouselVideoFromImages, generateReelVideoForPost, type CarouselTransition } from "../../services/reel.service.js";
import { ObjectStorageService } from "../../lib/objectStorage.js";
import { db } from "@workspace/db";
import { imageVariantsTable, postsTable } from "@workspace/db";
import { eq, desc, isNotNull, isNull, and, or, inArray } from "drizzle-orm";
import { createHash } from "crypto";
import type { Request } from "express";

const router = Router();

/** Returns a WHERE condition that scopes image_variants to the authenticated user.
 *  Admins bypass tenant scoping (undefined = no extra filter). */
function variantTenantCond(req: Request, variantId: number) {
  const idCond = eq(imageVariantsTable.id, variantId);
  if (req.user!.role === "admin") return idCond;
  return and(idCond, eq(imageVariantsTable.userId, req.user!.userId));
}

/** Returns a WHERE condition that scopes posts to the authenticated user. */
function postTenantCond(req: Request, postId: number) {
  const idCond = eq(postsTable.id, postId);
  if (req.user!.role === "admin") return idCond;
  return and(idCond, eq(postsTable.userId, req.user!.userId));
}

/**
 * POST /api/reels/variants/:variantId/generate
 * Generates a Ken Burns MP4 reel for the specified image variant.
 */
router.post("/variants/:variantId/generate", async (req, res) => {
  const variantId = Number(req.params.variantId);
  if (!Number.isFinite(variantId)) {
    return res.status(400).json({ error: "Invalid variantId" });
  }

  const [variant] = await db
    .select({ id: imageVariantsTable.id })
    .from(imageVariantsTable)
    .where(variantTenantCond(req, variantId));
  if (!variant) return res.status(404).json({ error: "Variant not found" });

  try {
    const objectPath = await generateReelForVariant(variantId);
    const url = await getReelDownloadUrl(variantId);
    return res.json({ ok: true, objectPath, url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reels] generation failed:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/reels/variants/:variantId/url
 * Returns a presigned download URL for an existing reel.
 */
router.get("/variants/:variantId/url", async (req, res) => {
  const variantId = Number(req.params.variantId);
  if (!Number.isFinite(variantId)) {
    return res.status(400).json({ error: "Invalid variantId" });
  }

  const [variant] = await db
    .select({ id: imageVariantsTable.id })
    .from(imageVariantsTable)
    .where(variantTenantCond(req, variantId));
  if (!variant) return res.status(404).json({ error: "Variant not found" });

  try {
    const url = await getReelDownloadUrl(variantId);
    if (!url) {
      return res.status(404).json({ error: "No reel generated yet" });
    }
    return res.json({ ok: true, url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/reels/variants/:variantId/status
 * Returns the reel status for the variant (none | ready).
 */
router.get("/variants/:variantId/status", async (req, res) => {
  const variantId = Number(req.params.variantId);
  if (!Number.isFinite(variantId)) {
    return res.status(400).json({ error: "Invalid variantId" });
  }

  try {
    const [variant] = await db
      .select({ reelObjectPath: imageVariantsTable.reelObjectPath })
      .from(imageVariantsTable)
      .where(variantTenantCond(req, variantId));

    if (!variant) return res.status(404).json({ error: "Variant not found" });
    if (!variant.reelObjectPath) return res.json({ status: "none" });
    // Devolver también la URL temporal para que el frontend pueda previsualizarla
    try {
      const storage = new ObjectStorageService();
      const url = await storage.getObjectEntityGetURL(variant.reelObjectPath, 3600);
      return res.json({ status: "ready", url });
    } catch {
      return res.json({ status: "ready", url: null });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * DELETE /api/reels/variants/:variantId/reel
 * Clears the reel video for the specified variant (sets reelObjectPath = null).
 * The user can call this to "deselect" a generated or uploaded reel video.
 */
router.delete("/variants/:variantId/reel", async (req, res) => {
  const variantId = Number(req.params.variantId);
  if (!Number.isFinite(variantId)) return res.status(400).json({ error: "Invalid variantId" });
  try {
    const [variant] = await db
      .select({ id: imageVariantsTable.id })
      .from(imageVariantsTable)
      .where(variantTenantCond(req, variantId));
    if (!variant) return res.status(404).json({ error: "Variant not found" });
    await db.update(imageVariantsTable)
      .set({ reelObjectPath: null, mimeType: null })
      .where(eq(imageVariantsTable.id, variantId));
    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * POST /api/reels/variants/:variantId/upload-video
 * Accepts a base64-encoded video (MP4 or MOV) and stores it in object storage
 * as the reel video for this variant, replacing any existing one.
 * Body: { data: string (base64), mimeType: string }
 */
router.post("/variants/:variantId/upload-video", async (req, res) => {
  const variantId = Number(req.params.variantId);
  if (!Number.isFinite(variantId)) return res.status(400).json({ error: "Invalid variantId" });

  const { data, mimeType = "video/mp4" } = req.body ?? {};
  if (!data || typeof data !== "string") return res.status(400).json({ error: "Campo 'data' requerido (base64 del video)" });

  const ALLOWED_MIME = ["video/mp4", "video/quicktime", "video/webm", "video/mpeg"];
  if (!ALLOWED_MIME.includes(mimeType)) return res.status(400).json({ error: "Solo se aceptan videos MP4, MOV o WebM" });

  const MAX_BYTES = 200 * 1024 * 1024; // 200 MB
  const videoBuffer = Buffer.from(data, "base64");
  if (videoBuffer.length > MAX_BYTES) return res.status(413).json({ error: "El video supera el límite de 200 MB" });

  const [variant] = await db
    .select({ id: imageVariantsTable.id })
    .from(imageVariantsTable)
    .where(variantTenantCond(req, variantId));
  if (!variant) return res.status(404).json({ error: "Variante no encontrada" });

  try {
    const storage = new ObjectStorageService();
    const uploadUrl = await storage.getObjectEntityUploadURL();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType, "Content-Length": String(videoBuffer.length) },
      body: videoBuffer,
    });
    if (!uploadRes.ok) throw new Error(`Error al subir a storage: ${uploadRes.status}`);

    const objectPath = storage.normalizeObjectEntityPath(uploadUrl);
    await db.update(imageVariantsTable)
      .set({ reelObjectPath: objectPath, mimeType })
      .where(eq(imageVariantsTable.id, variantId));

    const url = await storage.getObjectEntityGetURL(objectPath, 3600);
    return res.json({ ok: true, objectPath, url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reels] video upload failed:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * POST /api/reels/posts/:postId/carousel
 * Generates a carousel-as-video from post image variants.
 */
router.post("/posts/:postId/carousel", async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    return res.status(400).json({ error: "Invalid postId" });
  }

  const [post] = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(postTenantCond(req, postId));
  if (!post) return res.status(404).json({ error: "Post not found" });

  try {
    const result = await generateCarouselVideoForPost(postId);
    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reels] carousel generation failed:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * POST /api/reels/posts/:postId/generate-reel
 * Generates a multi-scene vertical Reel (9:16) from all slide variants.
 */
router.post("/posts/:postId/generate-reel", async (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isFinite(postId)) {
    return res.status(400).json({ error: "Invalid postId" });
  }

  const [post] = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(postTenantCond(req, postId));
  if (!post) return res.status(404).json({ error: "Post not found" });

  const { transition, music, musicTrackId, musicTrackUrl, variantOrder } = req.body ?? {};
  try {
    const result = await generateReelVideoForPost(postId, { transition, music, musicTrackId: musicTrackId ? Number(musicTrackId) : undefined, musicTrackUrl, variantOrder: Array.isArray(variantOrder) ? variantOrder.map(Number) : undefined });
    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reels] multi-scene reel generation failed:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/reels/slide-library?limit=24
 * Returns recent image variants as thumbnails for the Reel Studio.
 * Scoped to the authenticated user's own variants.
 */
router.get("/slide-library", async (req, res) => {
  // Fetch more rows than the limit so we can deduplicate before trimming
  const limit = Math.min(Number(req.query.limit ?? 300), 500);
  try {
    const uid = req.user!.userId;
    // Always scope to the authenticated user — no admin bypass.
    // Admin users should only see their own images in the slide library, same as any other user.
    // Using the INNER JOIN with postsTable already in the query, we can resolve legacy rows
    // where image_variants.user_id = NULL by checking postsTable.user_id instead.
    const userCond = or(
      eq(imageVariantsTable.userId, uid),
      and(isNull(imageVariantsTable.userId), eq(postsTable.userId, uid)),
    );
    // Only show variants that have a clean rawBackground (no logo/text overlay).
    // This excludes: images soft-deleted via bulk-delete (rawBackground = null),
    // and legacy variants that only have imageData (already composited with branding).
    const baseCond = isNotNull(imageVariantsTable.rawBackground);
    const whereCond = and(baseCond, userCond);

    const rows = await db
      .select({
        variantId: imageVariantsTable.id,
        postId: postsTable.id,
        caption: postsTable.caption,
        contentType: postsTable.contentType,
        style: imageVariantsTable.style,
        hook: imageVariantsTable.overlayCaptionHook,
        rawBackground: imageVariantsTable.rawBackground,
        rawBackgroundHash: imageVariantsTable.rawBackgroundHash,
        libraryUseCount: imageVariantsTable.libraryUseCount,
        likes: postsTable.likes,
        comments: postsTable.comments,
        saves: postsTable.saves,
        reach: postsTable.reach,
      })
      .from(imageVariantsTable)
      .innerJoin(postsTable, eq(postsTable.id, imageVariantsTable.postId))
      .where(whereCond)
      .orderBy(desc(imageVariantsTable.id))
      .limit(limit * 3); // fetch extra to survive deduplication

    // Deduplicate by rawBackgroundHash (or a fast prefix fingerprint when hash is missing)
    const seen = new Set<string>();
    const deduped = rows.filter(row => {
      // Key: stored hash > on-the-fly SHA-256 of first 200 chars of rawBackground > variantId
      const key =
        row.rawBackgroundHash ??
        (row.rawBackground
          ? createHash("sha256").update(row.rawBackground.slice(0, 500)).digest("hex")
          : String(row.variantId));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);

    // Return metadata only — no thumbnail generation here.
    // Thumbnails are fetched lazily by the frontend via GET /api/backgrounds/:id/thumb.
    // This prevents memory/timeout issues with large libraries (200+ images).
    const slides = deduped.map((row) => {
      let erPct: number | null = null;
      if (row.reach && row.reach > 0) {
        erPct = Math.round(((row.likes ?? 0) + (row.saves ?? 0) * 2 + (row.comments ?? 0)) / row.reach * 1000) / 10;
      }
      return {
        variantId: row.variantId,
        postId: row.postId,
        caption: (row.caption ?? "").slice(0, 60),
        hook: row.hook ?? "",
        contentType: row.contentType,
        style: row.style,
        thumbnail: null, // fetched lazily by frontend via /api/backgrounds/:id/thumb
        libraryUseCount: row.libraryUseCount ?? 0,
        erPct,
      };
    });

    return res.json({ slides });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reels] slide-library error:", msg);
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/reels/carousel-from-images
 * Generates a carousel video from caller-supplied slides (max 10).
 * When loading by variantId, strictly scopes to the authenticated user's variants.
 */
router.post("/carousel-from-images", async (req, res) => {
  const body = req.body as {
    images?: string[];
    slides?: Array<{ b64?: string; variantId?: number }>;
    transition?: CarouselTransition;
    music?: string;
    captions?: unknown[];
    closingSlide?: { enabled?: unknown; showBullets?: unknown; bullets?: unknown[]; cta?: unknown };
    postId?: number;
  };

  let images: string[] = [];

  if (Array.isArray(body.images) && body.images.length > 0) {
    images = body.images.slice(0, 10);
  } else if (Array.isArray(body.slides) && body.slides.length > 0) {
    const slidesToProcess = body.slides.slice(0, 10);

    const variantIds = slidesToProcess
      .filter((s) => s.variantId && !s.b64)
      .map((s) => s.variantId as number);

    const variantMap = new Map<number, string>();
    if (variantIds.length > 0) {
      const isAdmin = req.user!.role === "admin";
      const idsCond = inArray(imageVariantsTable.id, variantIds);
      const userScopedCond = isAdmin
        ? idsCond
        : and(idsCond, eq(imageVariantsTable.userId, req.user!.userId));
      const variants = await db
        .select({ id: imageVariantsTable.id, imageData: imageVariantsTable.imageData })
        .from(imageVariantsTable)
        .where(userScopedCond);
      for (const v of variants) {
        if (v.imageData) variantMap.set(v.id, v.imageData);
      }
    }

    for (const slide of slidesToProcess) {
      if (slide.b64) {
        images.push(slide.b64);
      } else if (slide.variantId) {
        const imgData = variantMap.get(slide.variantId);
        if (imgData) images.push(imgData);
      }
    }
  } else {
    return res.status(400).json({ error: "slides or images array required" });
  }

  if (images.length === 0) {
    return res.status(400).json({ error: "No valid slides found" });
  }

  try {
    const allowedTransitions: CarouselTransition[] = [
      "hardcut",
      "dissolve", "fadeblack", "fadewhite", "fadegrays", "hblur",
      "wipeleft", "wiperight", "smoothleft", "smoothright", "coverleft", "coverright", "revealleft", "revealright",
      "zoomin", "circleopen", "circleclose", "squeezev", "squeezeh", "pixelize",
      "radial", "diagtl", "diagtr", "wipetl", "wipetr", "vertopen", "horzopen",
      "hlwind", "hrwind", "vuwind", "vdwind", "slideleft", "slideright",
    ];
    const transition: CarouselTransition = allowedTransitions.includes(body.transition as CarouselTransition)
      ? (body.transition as CarouselTransition)
      : "hardcut";
    const allowedMusic = ["none", "electronica", "corporativa", "institucional"];
    const music = allowedMusic.includes(body.music ?? "") ? (body.music ?? "none") : "none";

    const captions: (string | null | undefined)[] | undefined =
      Array.isArray(body.captions) ? body.captions.map((c: unknown) => typeof c === "string" ? c : null) : undefined;

    const closingSlide = body.closingSlide && typeof body.closingSlide === "object"
      ? {
          enabled: Boolean(body.closingSlide.enabled),
          showBullets: body.closingSlide.showBullets !== false,
          bullets: Array.isArray(body.closingSlide.bullets)
            ? (body.closingSlide.bullets as unknown[]).filter((b): b is string => typeof b === "string" && !!(b as string).trim())
            : [],
          cta: typeof body.closingSlide.cta === "string" ? body.closingSlide.cta : "SIMULA TU AHORRO GRATIS",
        }
      : undefined;

    const musicTrackId = body.musicTrackId ? Number(body.musicTrackId) : undefined;
    const musicTrackUrl = typeof body.musicTrackUrl === "string" ? body.musicTrackUrl : undefined;
    const result = await generateCarouselVideoFromImages(images, { transition, music, musicTrackId, musicTrackUrl, captions, closingSlide });

    // If a postId was provided, link the generated video to the first variant of that post
    // so it appears in the "Imágenes generadas" gallery and can be selected for scheduling.
    const postId = body.postId ? Number(body.postId) : undefined;
    if (postId && Number.isFinite(postId)) {
      try {
        const isAdmin = req.user!.role === "admin";
        const postOwnerCond = isAdmin
          ? eq(imageVariantsTable.postId, postId)
          : and(eq(imageVariantsTable.postId, postId), eq(imageVariantsTable.userId, req.user!.userId));
        const [firstVariant] = await db
          .select({ id: imageVariantsTable.id })
          .from(imageVariantsTable)
          .where(postOwnerCond)
          .orderBy(imageVariantsTable.id)
          .limit(1);
        if (firstVariant) {
          await db
            .update(imageVariantsTable)
            .set({ reelObjectPath: result.objectPath, mimeType: "video/mp4" })
            .where(eq(imageVariantsTable.id, firstVariant.id));
        }
      } catch (linkErr) {
        console.warn("[reels] carousel-from-images: could not link to post variant:", linkErr);
      }
    }

    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reels] custom carousel failed:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/reels/slide-library/:variantId/raw
 * Returns the rawBackground (no-overlay) base64 for a specific slide library item.
 */
router.get("/slide-library/:variantId/raw", async (req, res) => {
  const variantId = Number(req.params.variantId);
  if (!variantId || isNaN(variantId)) return res.status(400).json({ error: "Invalid variantId" });
  try {
    const isAdmin = req.user!.role === "admin";
    const cond = isAdmin
      ? eq(imageVariantsTable.id, variantId)
      : and(eq(imageVariantsTable.id, variantId), eq(imageVariantsTable.userId, req.user!.userId));
    const [row] = await db.select({
      rawBackground: imageVariantsTable.rawBackground,
      style: imageVariantsTable.style,
    }).from(imageVariantsTable).where(cond).limit(1);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({ rawBackground: row.rawBackground, style: row.style });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /api/reels/slide-library/:variantId
 * Removes an image variant from the slide library (scoped to current user; admin bypasses).
 */
router.delete("/slide-library/:variantId", async (req, res) => {
  const variantId = Number(req.params.variantId);
  if (!variantId || isNaN(variantId)) return res.status(400).json({ error: "Invalid variantId" });
  try {
    const cond = variantTenantCond(req, variantId);
    const deleted = await db.delete(imageVariantsTable).where(cond).returning({ id: imageVariantsTable.id });
    if (!deleted.length) return res.status(404).json({ error: "Variant not found or access denied" });
    return res.json({ ok: true, deleted: deleted[0].id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reels] delete slide-library error:", msg);
    return res.status(500).json({ error: msg });
  }
});

export default router;
