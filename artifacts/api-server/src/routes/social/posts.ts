import { Router } from "express";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { postsTable, imageVariantsTable, nichesTable, publishLogTable, subscriptionsTable, brandProfilesTable, businessesTable, plansTable, businessElementsTable, socialAccountsTable, usersTable } from "@workspace/db";
import { auditLog, AuditAction } from "../../lib/audit.js";
import { eq, and, sql, inArray, asc, gt, isNull, or } from "drizzle-orm";
import { getActiveBusinessId } from "../../lib/businesses.js";
import type { Request } from "express";
import {
  GetPostsQueryParams,
  CreatePostBody,
  GenerateBulkPostsBody,
  GetPostParams,
  UpdatePostParams,
  UpdatePostBody,
  DeletePostParams,
  ApprovePostParams,
  RejectPostParams,
  RegenerateCaptionParams,
  GenerateImageVariantParams,
  GenerateImageVariantBody,
  ApplySuggestionParams,
  ApplySuggestionBody,
  GenerateExtraPostsBody,
} from "@workspace/api-zod";
import { requireEmailVerified } from "../../lib/auth.js";
import { resolveUserTimezone } from "../../lib/timezone.js";
import { generateCaption, generateBulkPosts, generateExtraPosts, generateImagesForPostsBg, generatePostImage, generateImageWithElement, applyOverlays, applySuggestion, checkHeadlineSpelling, checkCaptionSpelling, suggestHeadlines, extractCaptionHook, cropTo4by5, shouldCropTo4by5, evaluateCaptionImprovements, rethemeCaption, reapplyOverlaysForPosts, pickHashtags, pickHashtagsTiktok, analyzeReferenceImage, getBusinessSavedRefStyle, applyCompositionLayers } from "../../services/ai.service.js";
import type { LogoPosition, LogoColor, TextStyle, TextPosition, ImageFilter, ElementPosition } from "../../services/ai.service.js";
import { ObjectStorageService } from "../../lib/objectStorage.js";
const _storage = new ObjectStorageService();
import { mediaLibraryTable } from "@workspace/db";
import { publishPost, BOGOTA_UTC_OFFSET_H, OPTIMAL_HOURS, getNextOptimalSlot } from "../../services/scheduler.service.js";
import { tenantFilterCol } from "../../lib/tenant.js";
import { getCreditCosts, creditCostOf, checkAndDeductCredits, checkAndDeductCreditsInTx, snapshotCredits, reserveCredits, refundCredits } from "../../lib/creditCosts.js";
import { capsFromSnapshot, buildPlanSnapshot } from "../../lib/planCaps.js";
import { estimateElementAICost } from "../../lib/generationCosts.js";
import sharp from "sharp";
import { notifyApprovedPostNoAccounts } from "../../services/telegram.service.js";
import { recordApprovalSignal, recordVisualSignal } from "../../services/learning.service.js";

/** Loads cached GPT-4o vision analyses of saved reference images from the user's brand profile.
 *  Returns a combined string to append to the topic/briefing, or "" if none saved. */
async function loadSavedReferenceAnalyses(userId: number): Promise<string> {
  try {
    const [profile] = await db
      .select({ referenceImages: brandProfilesTable.referenceImages })
      .from(brandProfilesTable)
      .where(eq(brandProfilesTable.userId, userId))
      .limit(1);
    if (!profile?.referenceImages) return "";
    const images = JSON.parse(profile.referenceImages) as Array<{ analysis?: string }>;
    const analyses = images.map(img => img.analysis?.trim()).filter(Boolean);
    return analyses.length > 0 ? analyses.join("\n---\n") : "";
  } catch {
    return "";
  }
}

const router = Router();

// ── Post-number helpers ────────────────────────────────────────────────────────
/**
 * Computes and reserves the next post_number for a business inside a transaction.
 * Uses a pg_advisory_xact_lock on the business ID to prevent concurrent inserts
 * from assigning the same number. The caller must perform the INSERT inside the
 * same transaction (tx) to keep the lock scope tight.
 */
async function nextPostNumberInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  bizId: number,
): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${bizId})`);
  const rows = await tx.execute(sql`
    SELECT COALESCE(MAX(post_number), 0) + 1 AS next FROM posts WHERE business_id = ${bizId}
  `);
  return ((rows as unknown as Array<{ next: number }>)[0]?.next) ?? 1;
}

/**
 * Assigns sequential post_numbers to a batch of newly created posts (bulk/extra generation).
 * Uses a single atomic CTE UPDATE so there is no window between reading MAX and writing,
 * even without the advisory lock. The advisory lock is kept as an extra safety net.
 * Posts already having a post_number (e.g. from a startup backfill) are skipped.
 */
async function assignBatchPostNumbers(postIds: number[], bizId: number): Promise<void> {
  if (postIds.length === 0) return;
  const sorted = [...postIds].sort((a, b) => a - b);
  // Only process posts that still have NULL post_number to avoid double-assignment
  const idsLiteral = sorted.join(",");
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${bizId})`);
    // Single atomic CTE: compute base from posts NOT in this batch, then rank batch posts
    await tx.execute(sql.raw(`
      WITH
        base AS (
          SELECT COALESCE(MAX(post_number), 0) AS maxn
          FROM posts
          WHERE business_id = ${bizId}
            AND post_number IS NOT NULL
            AND id NOT IN (${idsLiteral})
        ),
        ranked AS (
          SELECT id,
                 ROW_NUMBER() OVER (ORDER BY id) + (SELECT maxn FROM base) AS new_num
          FROM (SELECT unnest(ARRAY[${idsLiteral}]::int[]) AS id) t
        )
      UPDATE posts p
      SET post_number = r.new_num
      FROM ranked r
      WHERE p.id = r.id
        AND p.post_number IS NULL
    `));
  });
}

// ── Generation lock: prevents a user from triggering 2 simultaneous generation runs ──
// Key = userId, Value = timestamp when the lock was acquired (for auto-expiry after 3 min)
const generationLocks = new Map<number, number>();
const LOCK_TTL_MS = 3 * 60 * 1000; // 3 minutes max

function acquireGenerationLock(userId: number): boolean {
  const now = Date.now();
  const existing = generationLocks.get(userId);
  if (existing && now - existing < LOCK_TTL_MS) return false; // already running
  generationLocks.set(userId, now);
  return true;
}
function releaseGenerationLock(userId: number) {
  generationLocks.delete(userId);
}

/**
 * Resizes a rawBackground base64 image to match the target post's required aspect ratio.
 * - Story / Reel → portrait (1024×1536 for TikTok-only, 1024×1280 for Instagram/both)
 * - Image / Carousel → square feed (1024×1024)
 * If the source already has the correct orientation, the original string is returned unchanged.
 */
async function fitRawBgToPost(
  rawBg: string,
  post: { contentType: string | null; platform: string | null },
): Promise<string> {
  const ct = post.contentType ?? "image";
  const pl = post.platform ?? "";
  const targetIsPortrait = ct === "reel" || ct === "story";

  // Apply EXIF auto-rotation first so dimensions are read post-normalization.
  // Images from mobile cameras store pixels in landscape but have an EXIF tag that says
  // "rotate 90°". Calling .rotate() without args applies the tag and strips it, so
  // downstream dimension checks and resize operations see the correct w/h.
  const rawBuf = Buffer.from(rawBg, "base64");
  const normalizedBuf = await sharp(rawBuf).rotate().jpeg({ quality: 92 }).toBuffer();
  const normalizedBg = normalizedBuf.toString("base64");
  const buf = normalizedBuf;
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const srcIsPortrait = h > w;

  if (targetIsPortrait === srcIsPortrait) return normalizedBg; // already correct orientation

  let targetW: number;
  let targetH: number;
  if (targetIsPortrait) {
    // Need portrait — 4:5 for Instagram/both, 9:16 for TikTok-only
    const want4by5 = pl === "instagram" || pl === "both";
    targetW = 1024;
    targetH = want4by5 ? 1280 : 1536;
  } else {
    // Need square feed
    targetW = 1024;
    targetH = 1024;
  }

  const resized = await sharp(buf)
    .resize(targetW, targetH, { fit: "cover", position: "centre" })
    .jpeg({ quality: 92 })
    .toBuffer();
  return resized.toString("base64");
}

function tenantFilter(req: Request) {
  return tenantFilterCol(postsTable.userId, req);
}

async function getPostWithVariants(postId: number, userId?: number, isAdmin = true) {
  const cond = isAdmin ? eq(postsTable.id, postId) : and(eq(postsTable.id, postId), eq(postsTable.userId, userId!));
  const [post] = await db.select().from(postsTable).where(cond);
  if (!post) return null;
  const [imageVariants, publishLogs] = await Promise.all([
    db.select().from(imageVariantsTable).where(eq(imageVariantsTable.postId, postId)),
    db.select({
      id: publishLogTable.id,
      platform: publishLogTable.platform,
      status: publishLogTable.status,
      postUrl: publishLogTable.postUrl,
      errorMessage: publishLogTable.errorMessage,
      publishedAt: publishLogTable.publishedAt,
      source: publishLogTable.source,
    }).from(publishLogTable).where(eq(publishLogTable.postId, postId)).orderBy(publishLogTable.publishedAt),
  ]);
  let niche = null;
  if (post.nicheId) {
    const [n] = await db.select().from(nichesTable).where(eq(nichesTable.id, post.nicheId));
    niche = n ?? null;
  }
  return { ...post, imageVariants, niche, publishLogs };
}

/** Tenant-scoped post lookup: admin sees all, regular users only see their own posts. */
async function getTenantPost(id: number, req: Request) {
  const tf = req.user!.role === "admin" ? undefined : eq(postsTable.userId, req.user!.userId);
  const [post] = await db.select().from(postsTable).where(
    tf ? and(eq(postsTable.id, id), tf) : eq(postsTable.id, id)
  );
  return post ?? null;
}

/** Tenant-scoped WHERE condition for post ID. */
function tenantPostCond(id: number, req: Request) {
  const tf = req.user!.role === "admin" ? undefined : eq(postsTable.userId, req.user!.userId);
  return tf ? and(eq(postsTable.id, id), tf) : eq(postsTable.id, id);
}

router.get("/", async (req, res) => {
  // slim=1 → skip image data (used by calendar for fast loading)
  const slim = req.query.slim === '1';

  // Admin-only scope controls:
  //   ?scope=all       → see all users' posts (admin panel / "Todos los usuarios")
  //   ?userId=123      → see posts from a specific user (admin filtering)
  //   (default)        → see only your own posts (even for admin)
  const isAdmin = req.user!.role === 'admin';
  const scopeAll  = req.query.scope === 'all' && isAdmin;
  const targetUid = req.query.userId ? Number(req.query.userId) : null;
  const scopeUser = isAdmin && targetUid && !isNaN(targetUid) ? targetUid : null;

  // allBusinesses=1 → skip active-business filter, show ALL businesses of the user.
  // Available to any authenticated user (not admin-only). Ignored when scope=all.
  const allBusinesses = req.query.allBusinesses === '1' && !scopeAll;

  // businessId=N → filter by a specific business (any user, validated by ownership).
  // Ignored when scope=all or allBusinesses=1.
  const reqBizId = req.query.businessId ? Number(req.query.businessId) : null;
  const filterByBizId = !scopeAll && !allBusinesses && reqBizId && !isNaN(reqBizId) ? reqBizId : null;

  // status supports comma-separated values: ?status=pending_approval,scheduled
  const rawStatus = req.query.status as string | undefined;
  const statusList = rawStatus ? rawStatus.split(',').map(s => s.trim()).filter(Boolean) : [];

  const params = GetPostsQueryParams.parse({
    platform: req.query.platform,
    nicheId: req.query.nicheId ? Number(req.query.nicheId) : undefined,
  });

  let query = db.select().from(postsTable);
  const conditions = [];
  // Resolve user filter: none (all) / specific userId / own posts
  const effectiveUserId = scopeAll ? null : (scopeUser ?? req.user!.userId);
  if (effectiveUserId != null) conditions.push(eq(postsTable.userId, effectiveUserId));

  // Business filter — three modes:
  //   allBusinesses=1  → skip business filter (show all user's businesses)
  //   businessId=N     → filter by specific business (ownership validated below)
  //   default          → scope to activeBusinessId (single-business / legacy behavior)
  if (allBusinesses) {
    // No business filter — all businesses of effectiveUserId are included
  } else if (filterByBizId != null) {
    // Validate ownership: the requested business must belong to the effective user
    const ownerUserId = effectiveUserId ?? req.user!.userId;
    const [ownedBiz] = await db.select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.id, filterByBizId), eq(businessesTable.userId, ownerUserId)))
      .limit(1);
    if (!ownedBiz) {
      return res.status(403).json({ error: "Negocio no encontrado o no pertenece a tu cuenta" });
    }
    conditions.push(eq(postsTable.businessId, filterByBizId));
  } else if (!scopeAll && effectiveUserId != null) {
    // Default: scope to active business only
    const bizId = await getActiveBusinessId(effectiveUserId);
    if (bizId != null) {
      conditions.push(eq(postsTable.businessId, bizId));
    }
  }

  if (statusList.length === 1)       conditions.push(eq(postsTable.status, statusList[0]));
  else if (statusList.length > 1)    conditions.push(inArray(postsTable.status, statusList));
  if (params.platform) conditions.push(eq(postsTable.platform, params.platform));
  if (params.nicheId) conditions.push(eq(postsTable.nicheId, params.nicheId));

  const posts = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(postsTable.scheduledAt)
    : await query.orderBy(postsTable.scheduledAt);

  if (posts.length === 0) { res.json([]); return; }

  const postIds = posts.map(p => p.id);

  if (slim) {
    // Load only id/style/variantIndex for all posts in ONE query — no base64 blobs, no N+1
    const allVariants = await db
      .select({ id: imageVariantsTable.id, postId: imageVariantsTable.postId, style: imageVariantsTable.style, variantIndex: imageVariantsTable.variantIndex })
      .from(imageVariantsTable)
      .where(inArray(imageVariantsTable.postId, postIds));
    const variantsByPost = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      if (!variantsByPost.has(v.postId)) variantsByPost.set(v.postId, []);
      variantsByPost.get(v.postId)!.push(v);
    }
    res.json(posts.map(post => ({ ...post, imageVariants: variantsByPost.get(post.id) ?? [], niche: null })));
    return;
  }

  // Full mode: load all variants in ONE query (still no N+1) and all niches in one query
  const allVariants = await db.select().from(imageVariantsTable).where(inArray(imageVariantsTable.postId, postIds));
  const variantsByPost = new Map<number, typeof allVariants>();
  for (const v of allVariants) {
    if (!variantsByPost.has(v.postId)) variantsByPost.set(v.postId, []);
    variantsByPost.get(v.postId)!.push(v);
  }
  const nicheIds = [...new Set(posts.map(p => p.nicheId).filter((id): id is number => id != null))];
  const niches = nicheIds.length > 0 ? await db.select().from(nichesTable).where(inArray(nichesTable.id, nicheIds)) : [];
  const nicheMap = new Map(niches.map(n => [n.id, n]));
  const postsWithVariants = posts.map(post => ({
    ...post,
    imageVariants: variantsByPost.get(post.id) ?? [],
    niche: post.nicheId ? (nicheMap.get(post.nicheId) ?? null) : null,
  }));

  res.json(postsWithVariants);
});

router.post("/", async (req, res) => {
  const body = CreatePostBody.parse(req.body);
  const isAdmin = req.user!.role === "admin";
  if (body.nicheId != null && !isAdmin) {
    const [ownedNiche] = await db.select({ id: nichesTable.id }).from(nichesTable)
      .where(and(eq(nichesTable.id, body.nicheId), eq(nichesTable.userId, req.user!.userId)));
    if (!ownedNiche) return res.status(404).json({ error: "Niche no encontrado" });
  }
  const createBizId = await getActiveBusinessId(req.user!.userId);
  const post = await db.transaction(async tx => {
    const postNumber = createBizId != null ? await nextPostNumberInTx(tx, createBizId) : null;
    const [inserted] = await tx.insert(postsTable).values({
      nicheId: body.nicheId,
      platform: body.platform ?? "both",
      contentType: body.contentType ?? "image",
      slideCount: body.slideCount ?? null,
      caption: body.caption,
      hashtags: body.hashtags ?? "",
      hashtagsTiktok: body.hashtagsTiktok ?? "",
      status: "draft",
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      userId: req.user!.userId,
      businessId: createBizId ?? undefined,
      postNumber,
    }).returning();
    return inserted;
  });
  res.status(201).json({ ...post, imageVariants: [], niche: null });
});

router.post("/generate-bulk", requireEmailVerified, async (req, res) => {
  const body = GenerateBulkPostsBody.parse(req.body);
  if (!Number.isInteger(body.days) || body.days < 7 || body.days > 999) {
    res.status(400).json({ error: "days must be an integer between 7 and 999" });
    return;
  }

  // ── Plan capability enforcement ─────────────────────────────────────────────
  const uid = req.user!.userId;
  const userPlanKey = req.user!.plan ?? "free";

  // Resolve user timezone (IANA) for timezone-aware scheduling
  const [userTzRow] = await db
    .select({ timezone: usersTable.timezone, brandCountry: usersTable.brandCountry })
    .from(usersTable).where(eq(usersTable.id, uid)).limit(1);
  const userTimezone = resolveUserTimezone(userTzRow ?? {});

  // Read subscription snapshot first; fall back to live plansTable for pre-snapshot subs
  const [userSub] = await db.select({ lockedPlanConfig: subscriptionsTable.lockedPlanConfig })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, uid), eq(subscriptionsTable.status, "active")))
    .limit(1);
  const [userPlan] = await db.select({
    bulkMaxPosts:        plansTable.bulkMaxPosts,
    allowedContentTypes: plansTable.allowedContentTypes,
  }).from(plansTable).where(eq(plansTable.key, userPlanKey)).limit(1);

  const liveCaps = buildPlanSnapshot({
    creditsPerMonth:    0,
    bulkMaxPosts:       userPlan?.bulkMaxPosts       ?? 0,
    allowedContentTypes: userPlan?.allowedContentTypes ?? ["image", "story"],
    businessesAllowed:  1,
    reelsPerMonth:      0,
  });
  const effectiveCaps = capsFromSnapshot(userSub?.lockedPlanConfig ?? null, liveCaps);
  const planBulkMax        = effectiveCaps.bulkMaxPosts;
  const planAllowedTypes   = effectiveCaps.allowedContentTypes;

  // 0 = bulk scheduling disabled for this plan
  if (planBulkMax === 0) {
    res.status(403).json({ error: "Tu plan no incluye generación masiva de posts.", code: "bulk_not_allowed" });
    return;
  }

  // Clamp days to the plan's bulk max
  const effectiveDays = Math.min(body.days, planBulkMax);

  // Anti-concurrent lock
  if (!acquireGenerationLock(uid)) {
    res.status(429).json({ error: "Ya hay una generación en curso. Espera a que termine antes de iniciar otra." });
    return;
  }

  // Filter requested content types to those allowed by the plan.
  // When contentTypes is omitted by the client, default to plan-allowed types directly
  // (avoids false 403 when the plan restricts to types not in the historical default list).
  const requestedTypes = body.contentTypes ?? planAllowedTypes;
  const bulkContentTypes = requestedTypes.filter(t => planAllowedTypes.includes(t));
  if (bulkContentTypes.length === 0) {
    releaseGenerationLock(uid);
    res.status(403).json({
      error: `Tu plan solo permite los tipos: ${planAllowedTypes.join(", ")}. Ninguno de los tipos solicitados está disponible.`,
      allowedContentTypes: planAllowedTypes,
      code: "content_type_not_allowed",
    });
    return;
  }

  // Niche check — user must have at least one active niche (or provide a custom topic)
  if (!body.customTopic?.trim() && (!body.nicheIds || body.nicheIds.length === 0)) {
    const [firstNiche] = await db.select({ id: nichesTable.id }).from(nichesTable)
      .where(and(eq(nichesTable.active, true), eq(nichesTable.userId, uid))).limit(1);
    if (!firstNiche) {
      releaseGenerationLock(uid);
      res.status(400).json({ error: "no_niches", message: "Primero configura al menos un nicho en la página de Nichos para poder generar contenido." });
      return;
    }
  }

  let bulkBizId: number | null | undefined;
  let bulkPostIds: number[] = [];
  let bulkStoppedByCredits = false;
  let bulkReserved = 0;
  let bulkActualCreditsUsed = 0;
  try {
    // ── ISOLATION GUARD: verify businessId ownership before any AI call ─────
    // If the client sends a businessId that doesn't belong to this user (e.g. stale
    // frontend state holding the admin's businessId), using it would load niches and
    // brand context from another tenant → cross-user content contamination.
    if (body.businessId != null) {
      const [ownedBiz] = await db
        .select({ id: businessesTable.id })
        .from(businessesTable)
        .where(and(
          eq(businessesTable.id, body.businessId),
          eq(businessesTable.userId, uid),
          eq(businessesTable.isActive, true),
        ))
        .limit(1);
      if (!ownedBiz) {
        releaseGenerationLock(uid);
        console.error(`[generate-bulk] ISOLATION GUARD: user ${uid} attempted to generate for businessId=${body.businessId} which they do not own`);
        res.status(403).json({ error: "No tienes acceso a este negocio.", code: "business_not_owned" });
        return;
      }
    }

    // Phase 1a: DB-only prep — fetch saved styles (no AI calls yet)
    let enrichedTopic = body.customTopic;
    let bulkRefStyle: string | undefined;
    const bulkBizIdForRef = body.businessId ?? await getActiveBusinessId(uid);
    if (!body.referenceImageBase64 && bulkBizIdForRef != null) {
      const savedRefStyle = await getBusinessSavedRefStyle(bulkBizIdForRef, uid);
      if (savedRefStyle) {
        bulkRefStyle = savedRefStyle;
        enrichedTopic = enrichedTopic
          ? `${enrichedTopic}\n\nEstilo visual de referencia guardado: ${savedRefStyle}`
          : `Estilo visual de referencia guardado: ${savedRefStyle}`;
      }
    }
    const savedAnalyses = await loadSavedReferenceAnalyses(uid);
    if (savedAnalyses) {
      enrichedTopic = enrichedTopic
        ? `${enrichedTopic}\n\nEstilos visuales guardados del usuario:\n${savedAnalyses}`
        : `Estilos visuales guardados del usuario:\n${savedAnalyses}`;
    }

    bulkBizId = body.businessId ?? await getActiveBusinessId(uid);
    let bulkImageJobs: Awaited<ReturnType<typeof generateBulkPosts>>["imageJobs"] = [];

    // Phase 1b: Atomic upfront credit reservation (SELECT FOR UPDATE) — BEFORE any AI call.
    // Computes affordableCount (how many posts the user can afford) and deducts the
    // worst-case cost upfront. Surplus is refunded after generation completes.
    // This guarantees NO AI token is spent when credits are exhausted.
    const BULK_ESTIMATED_POSTS = effectiveDays * 2;
    const bulkReservation = await reserveCredits(uid, BULK_ESTIMATED_POSTS, bulkContentTypes);
    if (!bulkReservation.ok) {
      releaseGenerationLock(uid);
      res.status(402).json({
        error: `Créditos insuficientes. Tienes ${bulkReservation.creditsHad} crédito${bulkReservation.creditsHad !== 1 ? "s" : ""} pero este tipo cuesta ${bulkReservation.maxCostPerPost} crédito${bulkReservation.maxCostPerPost !== 1 ? "s" : ""}.`,
        creditsRemaining: bulkReservation.creditsHad,
        plan: req.user!.plan,
      });
      return;
    }
    bulkReserved = bulkReservation.reserved;
    const bulkAffordableMax = bulkReservation.affordableCount;

    // Phase 1c: Analyze reference image (AI call) — AFTER credit reservation.
    if (body.referenceImageBase64) {
      const styleDescription = await analyzeReferenceImage(body.referenceImageBase64);
      if (styleDescription) {
        bulkRefStyle = styleDescription;
        enrichedTopic = enrichedTopic
          ? `${enrichedTopic}\n\nEstilo visual de referencia: ${styleDescription}`
          : `Estilo visual de referencia: ${styleDescription}`;
        // Fire-and-forget: record reference image visual intent as a learning signal
        void recordVisualSignal({
          userId: uid,
          businessId: bulkBizIdForRef ?? null,
          signalType: "reference_image",
          imageDescription: styleDescription,
        });
      }
    }

    // Phase 1d: AI generation — credits pre-reserved; each post insert is direct (no extra deduct).
    // Credits were already deducted atomically by reserveCredits upfront.
    // Surplus (reserved − actual cost) is refunded after loop completes.
    ({ postIds: bulkPostIds, imageJobs: bulkImageJobs, stoppedByCredits: bulkStoppedByCredits, actualCreditsUsed: bulkActualCreditsUsed } = await generateBulkPosts(
      effectiveDays,
      body.nicheIds ?? [],
      body.platform ?? "both",
      bulkContentTypes,
      enrichedTopic,
      body.startDate,
      false,
      uid,
      bulkBizId ?? undefined,
      bulkAffordableMax, // cap to affordableCount from reservation
      true,  // creditsPreReserved=true → credits already deducted, just insert
      userTimezone,
    ));

    // Phase 1e: Refund surplus (reserved − actual cost used).
    const bulkSurplus = bulkReserved - bulkActualCreditsUsed;
    if (bulkSurplus > 0) {
      await refundCredits(uid, bulkSurplus).catch(err =>
        console.error("[generate-bulk] Failed to refund surplus credits:", err)
      );
    }

    // Stamp userId and businessId on all newly created posts (safety net for any missed INSERTs)
    if (bulkPostIds.length > 0) {
      await db.update(postsTable).set({
        userId: uid,
        ...(bulkBizId != null ? { businessId: bulkBizId } : {}),
      }).where(inArray(postsTable.id, bulkPostIds));
      if (bulkBizId != null) {
        await assignBatchPostNumbers(bulkPostIds, bulkBizId);
      }
    }

    const posts = await Promise.all(bulkPostIds.map(id => getPostWithVariants(id)));
    res.status(201).json({
      posts: posts.filter(Boolean),
      generated: posts.length,
      days: effectiveDays,
      ...(effectiveDays < body.days ? { clamped: true, requestedDays: body.days, clampedTo: effectiveDays, message: `Días reducidos a ${effectiveDays} (límite de tu plan).` } : {}),
      imagesGenerating: true,
      ...(bulkStoppedByCredits ? { partial: true, message: "Generación parcial: se detuvó cuando se agotaron los créditos." } : {}),
    });

    // Phase 2: generate images in background
    const taggedBulkJobs = bulkImageJobs.map(j => ({
      ...j,
      userId: uid,
      businessId: bulkBizId ?? undefined,
      ...(bulkRefStyle && !j.imageScene ? { batchRefStyle: bulkRefStyle } : {}),
    }));
    generateImagesForPostsBg(taggedBulkJobs).catch(err =>
      console.error("[BG] Image generation error:", err)
    );
  } catch (err) {
    // Compensating refund: return any reserved-but-unspent credits on any failure.
    if (bulkReserved > 0 && bulkActualCreditsUsed < bulkReserved) {
      refundCredits(uid, bulkReserved - bulkActualCreditsUsed).catch(refundErr =>
        console.error("[generate-bulk] Failed to refund credits on error:", refundErr)
      );
    }
    releaseGenerationLock(uid);
    throw err;
  }
  releaseGenerationLock(uid);
});

// POST /generate-extra
// Generates exactly `count` additional posts (max 30) filling the next available
// calendar slots — not limited to a fixed window. Useful when the calendar is
// already full for the next N days and you want to add more posts beyond.
router.post("/generate-extra", requireEmailVerified, async (req, res) => {
  const body = GenerateExtraPostsBody.parse(req.body);
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > 20) {
    res.status(400).json({ error: "count must be an integer between 1 and 20" });
    return;
  }

  // ── Plan capability enforcement ─────────────────────────────────────────────
  const uid = req.user!.userId;
  const extraPlanKey = req.user!.plan ?? "free";

  // Resolve user timezone (IANA) for timezone-aware scheduling
  const [extraUserTzRow] = await db
    .select({ timezone: usersTable.timezone, brandCountry: usersTable.brandCountry })
    .from(usersTable).where(eq(usersTable.id, uid)).limit(1);
  const extraUserTimezone = resolveUserTimezone(extraUserTzRow ?? {});

  // Read subscription snapshot first; fall back to live plansTable for pre-snapshot subs
  const [extraSub] = await db.select({ lockedPlanConfig: subscriptionsTable.lockedPlanConfig })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, uid), eq(subscriptionsTable.status, "active")))
    .limit(1);
  const [extraUserPlan] = await db.select({
    allowedContentTypes: plansTable.allowedContentTypes,
    elementAiEnabled:    plansTable.elementAiEnabled,
  }).from(plansTable).where(eq(plansTable.key, extraPlanKey)).limit(1);

  const extraLiveCaps = buildPlanSnapshot({
    creditsPerMonth:     0,
    bulkMaxPosts:        0,
    allowedContentTypes: extraUserPlan?.allowedContentTypes ?? ["image", "story"],
    businessesAllowed:   1,
    reelsPerMonth:       0,
    elementAiEnabled:    extraUserPlan?.elementAiEnabled ?? false,
  });
  const extraEffectiveCaps  = capsFromSnapshot(extraSub?.lockedPlanConfig ?? null, extraLiveCaps);
  const extraPlanAllowedTypes = extraEffectiveCaps.allowedContentTypes;

  // ── Anti-concurrent lock ────────────────────────────────────────────────────
  if (!acquireGenerationLock(uid)) {
    res.status(429).json({ error: "Ya hay una generación en curso. Espera a que termine antes de iniciar otra." });
    return;
  }

  // Filter content types to allowed by plan.
  // Default to plan-allowed types when client omits contentTypes (avoids false 403 on restrictive plans).
  const requestedExtraTypes = body.contentTypes ?? extraPlanAllowedTypes;
  const extraContentTypes = requestedExtraTypes.filter(t => extraPlanAllowedTypes.includes(t));
  if (extraContentTypes.length === 0) {
    releaseGenerationLock(uid);
    res.status(403).json({
      error: `Tu plan solo permite los tipos: ${extraPlanAllowedTypes.join(", ")}. Ninguno de los tipos solicitados está disponible.`,
      allowedContentTypes: extraPlanAllowedTypes,
      code: "content_type_not_allowed",
    });
    return;
  }

  // Niche check — user must have at least one active niche (or provide a custom topic)
  if (!body.customTopic?.trim()) {
    const [firstNiche] = await db.select({ id: nichesTable.id }).from(nichesTable)
      .where(and(eq(nichesTable.active, true), eq(nichesTable.userId, uid))).limit(1);
    if (!firstNiche) {
      releaseGenerationLock(uid);
      res.status(400).json({ error: "no_niches", message: "Primero configura al menos un nicho en la página de Nichos para poder generar contenido." });
      return;
    }
  }

  let extraPostIds: number[] = [];
  let extraImageJobs: Awaited<ReturnType<typeof generateExtraPosts>>["imageJobs"] = [];
  let extraSearchedDays = 0;
  let extraStoppedByCredits = false;
  let extraReserved = 0;
  let extraActualCreditsUsed = 0;
  let extraElementAiReserved = 0;

  try {
    // ── ISOLATION GUARD: verify businessId ownership before any AI call ─────
    if (body.businessId != null) {
      const [ownedExtraBiz] = await db
        .select({ id: businessesTable.id })
        .from(businessesTable)
        .where(and(
          eq(businessesTable.id, body.businessId),
          eq(businessesTable.userId, uid),
          eq(businessesTable.isActive, true),
        ))
        .limit(1);
      if (!ownedExtraBiz) {
        releaseGenerationLock(uid);
        console.error(`[generate-extra] ISOLATION GUARD: user ${uid} attempted to generate for businessId=${body.businessId} which they do not own`);
        res.status(403).json({ error: "No tienes acceso a este negocio.", code: "business_not_owned" });
        return;
      }
    }

    // Phase 1a: DB-only prep — fetch saved styles (no AI calls yet)
    let enrichedExtraTopic = body.customTopic;
    let extraRefStyle: string | undefined;
    const extraBizId = body.businessId ?? await getActiveBusinessId(uid);
    if (!body.referenceImageBase64 && extraBizId != null) {
      const savedRefStyle = await getBusinessSavedRefStyle(extraBizId, uid);
      if (savedRefStyle) {
        extraRefStyle = savedRefStyle;
        enrichedExtraTopic = enrichedExtraTopic
          ? `${enrichedExtraTopic}\n\nEstilo visual de referencia guardado: ${savedRefStyle}`
          : `Estilo visual de referencia guardado: ${savedRefStyle}`;
      }
    }
    const savedExtraAnalyses = await loadSavedReferenceAnalyses(uid);
    if (savedExtraAnalyses) {
      enrichedExtraTopic = enrichedExtraTopic
        ? `${enrichedExtraTopic}\n\nEstilos visuales guardados del usuario:\n${savedExtraAnalyses}`
        : `Estilos visuales guardados del usuario:\n${savedExtraAnalyses}`;
    }

    // ── Phase 1a-element: Validate element AI request (ownership + pending guard) ──
    // Runs before any credit reservation so we fail fast on invalid input.
    const useElementAi = body.useDeepElementAI === true && body.elementId != null;
    let extraElementBuffer: Buffer | null = null;
    let extraDbElement: (typeof businessElementsTable.$inferSelect) | null = null;
    let elementAiCreditCost = 0;

    if (useElementAi) {
      if (!extraEffectiveCaps.elementAiEnabled) {
        releaseGenerationLock(uid);
        res.status(403).json({
          error: "Tu plan actual no incluye 'IA integra el elemento'. Actualiza tu plan para usar esta función.",
          code: "element_ai_not_allowed",
        });
        return;
      }

      // businessId is required for element ownership check — cannot proceed without it
      if (extraBizId == null) {
        releaseGenerationLock(uid);
        res.status(400).json({ error: "Debes tener un negocio activo para usar IA integra el elemento" });
        return;
      }

      const [dbEl] = await db.select().from(businessElementsTable).where(
        and(
          eq(businessElementsTable.id, Number(body.elementId)),
          eq(businessElementsTable.userId, uid),
          eq(businessElementsTable.businessId, extraBizId),
        )
      ).limit(1);

      if (!dbEl) {
        releaseGenerationLock(uid);
        res.status(404).json({ error: "Elemento no encontrado o no pertenece a este negocio" });
        return;
      }
      if (dbEl.analysisStatus === "pending") {
        releaseGenerationLock(uid);
        res.status(400).json({ error: "El análisis del elemento está pendiente. Espera a que finalice antes de usar IA integra el elemento.", code: "element_pending" });
        return;
      }

      try {
        const file = await _storage.getObjectEntityFile(dbEl.storageKey);
        const dl = await _storage.downloadObject(file);
        extraElementBuffer = Buffer.from(await dl.arrayBuffer());
        extraDbElement = dbEl;
      } catch {
        releaseGenerationLock(uid);
        res.status(500).json({ error: "No se pudo cargar el elemento desde almacenamiento" });
        return;
      }

      const elementCosts = await getCreditCosts();
      elementAiCreditCost = elementCosts.elementAi;
    }

    // Phase 1b: Atomic upfront credit reservation (SELECT FOR UPDATE) — BEFORE any AI call.
    // Computes affordableCount and deducts worst-case cost upfront. Surplus refunded after.
    // This guarantees NO AI token is spent when credits are exhausted.
    const extraReservation = await reserveCredits(uid, body.count, extraContentTypes);
    if (!extraReservation.ok) {
      releaseGenerationLock(uid);
      res.status(402).json({
        error: `Créditos insuficientes. Tienes ${extraReservation.creditsHad} crédito${extraReservation.creditsHad !== 1 ? "s" : ""} pero este tipo cuesta ${extraReservation.maxCostPerPost} crédito${extraReservation.maxCostPerPost !== 1 ? "s" : ""}.`,
        creditsRemaining: extraReservation.creditsHad,
        plan: req.user!.plan,
      });
      return;
    }
    extraReserved = extraReservation.reserved;
    const extraAffordableMax = extraReservation.affordableCount;

    // ── Phase 1b-element: Reserve elementAi credits atomically BEFORE any AI call ──
    // Spec §3.2: "Deducción atómica: costo base + elementAi créditos".
    // If insufficient, refund base credits and hard-fail (no silent skip).
    if (useElementAi && extraDbElement && extraElementBuffer) {
      const elementAiTotal = elementAiCreditCost * extraAffordableMax;
      const deductResult = await db.execute(sql`
        UPDATE subscriptions
        SET credits_remaining = credits_remaining - ${elementAiTotal}
        WHERE id = (SELECT id FROM subscriptions WHERE user_id = ${uid} ORDER BY id DESC LIMIT 1)
          AND credits_remaining >= ${elementAiTotal}
      `);
      const deducted = ((deductResult as unknown as { rowCount?: number }).rowCount ?? 0) > 0;
      if (!deducted) {
        await refundCredits(uid, extraReserved).catch(() => {});
        extraReserved = 0;
        releaseGenerationLock(uid);
        res.status(402).json({
          error: `Créditos insuficientes para 'IA integra el elemento'. Necesitas ${elementAiTotal} créditos adicionales (${elementAiCreditCost} por imagen × ${extraAffordableMax} posts).`,
          code: "element_ai_insufficient_credits",
        });
        return;
      }
      extraElementAiReserved = elementAiTotal;
    }

    // Phase 1c: Analyze reference image (AI call) — AFTER credit reservation.
    if (body.referenceImageBase64) {
      const styleDescription = await analyzeReferenceImage(body.referenceImageBase64);
      if (styleDescription) {
        extraRefStyle = styleDescription;
        enrichedExtraTopic = enrichedExtraTopic
          ? `${enrichedExtraTopic}\n\nEstilo visual de referencia: ${styleDescription}`
          : `Estilo visual de referencia: ${styleDescription}`;
        // Fire-and-forget: record reference image visual intent as a learning signal
        void recordVisualSignal({
          userId: uid,
          businessId: extraBizId ?? null,
          signalType: "reference_image",
          imageDescription: styleDescription,
        });
      }
    }

    // Phase 1d: AI generation — credits pre-reserved; each post insert is direct (no extra deduct).
    // Credits were already deducted atomically by reserveCredits upfront.
    // Surplus (reserved − actual cost) is refunded after loop completes.
    const genResult = await generateExtraPosts(
      Math.min(body.count, extraAffordableMax), // cap to what credits can afford
      body.nicheIds ?? [],
      body.platform ?? "both",
      extraContentTypes,
      enrichedExtraTopic,
      false,
      uid,
      extraBizId ?? undefined,
      true, // creditsPreReserved=true → credits already deducted, just insert
      extraUserTimezone,
    );

    extraPostIds = genResult.postIds;
    extraImageJobs = genResult.imageJobs;
    extraSearchedDays = genResult.searchedDays;
    extraStoppedByCredits = genResult.stoppedByCredits;
    extraActualCreditsUsed = genResult.actualCreditsUsed;

    // Phase 1e: Refund surplus (reserved − actual cost used).
    const extraSurplus = extraReserved - extraActualCreditsUsed;
    if (extraSurplus > 0) {
      await refundCredits(uid, extraSurplus).catch(err =>
        console.error("[generate-extra] Failed to refund surplus credits:", err)
      );
    }

    // Stamp userId and businessId on all newly created posts (safety net)
    if (extraPostIds.length > 0) {
      await db.update(postsTable).set({
        userId: uid,
        ...(extraBizId != null ? { businessId: extraBizId } : {}),
      }).where(inArray(postsTable.id, extraPostIds));
      if (extraBizId != null) {
        await assignBatchPostNumbers(extraPostIds, extraBizId);
      }
    }

    // ── Phase 1e-element: Refund surplus elementAi credits (reserved upfront for extraAffordableMax,
    // but only extraPostIds.length posts were actually created — refund the difference).
    if (extraElementAiReserved > 0 && extraPostIds.length < extraAffordableMax) {
      const elementAiSurplus = elementAiCreditCost * (extraAffordableMax - extraPostIds.length);
      if (elementAiSurplus > 0) {
        await refundCredits(uid, elementAiSurplus).catch(err =>
          console.error("[generate-extra] Failed to refund element AI surplus:", err)
        );
      }
    }

    const posts = await Promise.all(extraPostIds.map(id => getPostWithVariants(id)));
    res.status(201).json({
      posts: posts.filter(Boolean),
      generated: posts.length,
      count: body.count,
      searchedDays: extraSearchedDays,
      imagesGenerating: true,
      ...(extraStoppedByCredits ? { partial: true, message: "Generación parcial: se detuvó cuando se agotaron los créditos." } : {}),
      ...(extraElementAiReserved > 0 && extraPostIds.length > 0 ? { elementAiGenerating: true } : {}),
    });

    const taggedExtraJobs = extraImageJobs.map(j => ({
      ...j,
      userId: uid,
      businessId: extraBizId ?? undefined,
      ...(extraRefStyle && !j.imageScene ? { batchRefStyle: extraRefStyle } : {}),
    }));
    generateImagesForPostsBg(taggedExtraJobs).catch(err =>
      console.error("[BG] generate-extra image error:", err)
    );
    // Element AI variants — only when credits were atomically reserved upfront and bizId is valid
    if (extraElementAiReserved > 0 && extraDbElement && extraElementBuffer && extraPostIds.length > 0 && extraBizId != null) {
      generateElementAiVariantsBg(
        extraPostIds,
        extraElementBuffer,
        extraDbElement,
        extraBizId,
        uid,
        elementAiCreditCost,
      ).catch(err => console.error("[BG] generate-extra element AI error:", err));
    }
  } catch (err) {
    // Compensating refund: return any reserved-but-unspent credits on any failure.
    if (extraReserved > 0 && extraActualCreditsUsed < extraReserved) {
      refundCredits(uid, extraReserved - extraActualCreditsUsed).catch(refundErr =>
        console.error("[generate-extra] Failed to refund credits on error:", refundErr)
      );
    }
    if (extraElementAiReserved > 0) {
      refundCredits(uid, extraElementAiReserved).catch(refundErr =>
        console.error("[generate-extra] Failed to refund element AI credits on error:", refundErr)
      );
    }
    releaseGenerationLock(uid);
    throw err;
  }
  releaseGenerationLock(uid);
});

/**
 * Background helper: for each postId, generates an element-AI variant and inserts it
 * as image_variants(style='element_ai'). Refunds elementAiCreditCostPerPost per failed post.
 * Called from /generate-extra when useDeepElementAI=true after credits are deducted.
 */
async function generateElementAiVariantsBg(
  postIds: number[],
  elementBuffer: Buffer,
  element: typeof businessElementsTable.$inferSelect,
  bizId: number,
  userId: number,
  elementAiCreditCostPerPost: number,
): Promise<void> {
  if (!bizId || bizId <= 0) {
    console.error("[generateElementAiVariantsBg] Invalid bizId — aborting to prevent orphan records");
    return;
  }
  const genCostStr = estimateElementAICost().toFixed(4);
  const [bizRow] = await db
    .select({ industryGroupSlug: businessesTable.industryGroupSlug, industry: businessesTable.industry })
    .from(businessesTable)
    .where(eq(businessesTable.id, bizId))
    .limit(1);
  const baseNicheContext = bizRow?.industry ?? "";
  const industryGroupSlug = bizRow?.industryGroupSlug ?? null;

  for (const postId of postIds) {
    try {
      const [postRow] = await db
        .select({ contentType: postsTable.contentType, platform: postsTable.platform, nicheId: postsTable.nicheId })
        .from(postsTable)
        .where(eq(postsTable.id, postId))
        .limit(1);

      let nicheContext = baseNicheContext;
      if (postRow?.nicheId) {
        const [niche] = await db.select({ name: nichesTable.name }).from(nichesTable).where(eq(nichesTable.id, postRow.nicheId)).limit(1);
        if (niche?.name) nicheContext = niche.name;
      }

      const result = await generateImageWithElement(
        elementBuffer,
        element.analysis ?? undefined,
        nicheContext,
        "photorealistic",
        postRow?.contentType ?? "post",
        userId,
        bizId,
        postRow?.platform ?? undefined,
        undefined,
        "top-right" as LogoPosition,
        "white" as LogoColor,
        "cinema" as TextStyle,
        "bottom" as TextPosition,
        "medium",
        "none" as ImageFilter,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
      );

      await db.insert(imageVariantsTable).values({
        postId,
        userId,
        businessId:        bizId,
        industryGroupSlug,
        imageData:         result.imageData,
        rawBackground:     result.rawBackground,
        style:             "element_ai",
        mimeType:          "image/png",
        overlayLogoPosition:   "top-right" as LogoPosition,
        overlayLogoColor:      "white" as LogoColor,
        overlayCaptionHook:    null,
        overlayTextStyle:      "cinema" as TextStyle,
        overlayTextPosition:   "bottom" as TextPosition,
        overlayTextSize:       "medium",
        overlayFilter:         "none" as ImageFilter,
        overlayElementConfigs: [{ elementId: element.id, position: "none", sizePercent: 0 }],
      });

      await db.update(postsTable)
        .set({ generationCostUsd: sql`COALESCE(generation_cost_usd, 0) + ${genCostStr}::numeric` })
        .where(eq(postsTable.id, postId));

    } catch (err) {
      console.error(`[generateElementAiVariantsBg] Error for postId=${postId}:`, err);
      await refundCredits(userId, elementAiCreditCostPerPost).catch(refErr =>
        console.error(`[generateElementAiVariantsBg] Failed to refund credits for postId=${postId}:`, refErr)
      );
    }
  }
}

// POST /retry-missing-images
// Finds all pending/scheduled posts with 0 image variants and re-triggers image generation.
// Safe to call multiple times — only processes posts with zero existing variants.
router.post("/reapply-overlays", async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const scheduled = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(inArray(postsTable.status, ["scheduled", "approved"]));
  const ids = scheduled.map(p => p.id);
  if (ids.length === 0) { res.json({ updated: 0, errors: 0, message: "No hay posts programados." }); return; }
  const result = await reapplyOverlaysForPosts(ids);
  res.json({ ...result, message: `Overlays reaplicados: ${result.updated} variantes actualizadas, ${result.errors} errores.` });
});

router.post("/retry-missing-images", async (req, res) => {
  const log = (req as any).log ?? console;
  // LEFT JOIN: posts with no image_variants row will have iv.id = NULL
  const tf = tenantFilter(req);
  const rows = await db
    .select({ post: postsTable, variantId: imageVariantsTable.id })
    .from(postsTable)
    .leftJoin(imageVariantsTable, eq(imageVariantsTable.postId, postsTable.id))
    .where(tf ? and(inArray(postsTable.status, ["pending_approval", "scheduled"]), tf) : inArray(postsTable.status, ["pending_approval", "scheduled"]));

  // Keep only posts where the join returned null (no variants)
  const seen = new Set<number>();
  const postsWithoutImages = rows
    .filter(r => r.variantId === null && !seen.has(r.post.id) && seen.add(r.post.id) !== undefined)
    .map(r => r.post);

  if (postsWithoutImages.length === 0) {
    log.info("[retry-missing-images] no posts without images found");
    res.json({ retrying: 0, message: "Todos los posts ya tienen imágenes." });
    return;
  }

  // Load niches for the posts that need them
  const nicheIds = [...new Set(postsWithoutImages.map(p => p.nicheId).filter((id): id is number => id != null))];
  const niches = nicheIds.length > 0 ? await db.select().from(nichesTable).where(inArray(nichesTable.id, nicheIds)) : [];
  const nicheMap = new Map(niches.map(n => [n.id, n]));

  // Credit check per post — deduct individually, skip posts whose owner has no credits
  const imageJobs: Array<{
    postId: number; userId?: number; businessId?: number; nicheContextShort: string;
    captionHook: string; contentType: string; styleIdx: number; slideCount: number; platform: string;
  }> = [];
  let skippedNoCredits = 0;

  for (let i = 0; i < postsWithoutImages.length; i++) {
    const post = postsWithoutImages[i];
    const contentType = post.contentType ?? "image";

    // Only check/deduct if we know the owner
    if (post.userId != null) {
      const deduct = await checkAndDeductCredits(post.userId, contentType);
      if (!deduct.ok) {
        log.info(`[retry-missing-images] skipping post ${post.id} — user ${post.userId} has insufficient credits (${deduct.creditsHad} < ${deduct.cost})`);
        skippedNoCredits++;
        continue;
      }
    }

    const niche = post.nicheId ? nicheMap.get(post.nicheId) : null;
    const nicheContextShort = niche
      ? `${niche.name} - ${niche.keywords}`
      : post.caption?.slice(0, 120) ?? "Contenido de redes sociales";
    imageJobs.push({
      postId: post.id,
      userId: post.userId ?? undefined,
      businessId: post.businessId ?? undefined,
      nicheContextShort,
      captionHook: extractCaptionHook(post.caption ?? ""),
      contentType,
      styleIdx: i,
      slideCount: post.slideCount ?? 4,
      platform: post.platform ?? "both",
    });
  }

  if (imageJobs.length === 0) {
    res.json({ retrying: 0, skippedNoCredits, message: `Sin créditos suficientes para regenerar imágenes (${skippedNoCredits} post(s) omitidos).` });
    return;
  }

  log.info(`[retry-missing-images] queuing ${imageJobs.length} jobs (${skippedNoCredits} skipped — no credits): ${imageJobs.map(j => `post${j.postId}(${j.contentType})`).join(", ")}`);
  res.json({ retrying: imageJobs.length, skippedNoCredits, message: `Generando imágenes para ${imageJobs.length} post(s) en segundo plano${skippedNoCredits > 0 ? ` (${skippedNoCredits} omitidos por créditos insuficientes)` : ""}...` });

  // Fire and forget — images generate after response is sent
  setImmediate(() => {
    generateImagesForPostsBg(imageJobs)
      .then(() => log.info(`[retry-missing-images] BG done — ${imageJobs.length} jobs`))
      .catch(err => log.error({ err }, `[retry-missing-images] BG error`));
  });
});

// POST /:id/retry-image — retry image generation for a single specific post
router.post("/:id/retry-image", async (req, res) => {
  const log = (req as any).log ?? console;
  const postId = parseInt(req.params.id, 10);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const cond = tenantPostCond(postId, req);
  const [post] = await db.select().from(postsTable).where(cond);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  // Only retry posts that have no images OR only error variants
  const variants = await db.select().from(imageVariantsTable).where(eq(imageVariantsTable.postId, postId));
  const hasReadyImage = variants.some(v => v.imageData && v.generationStatus !== "error");
  if (hasReadyImage) { res.json({ retrying: false, message: "El post ya tiene imágenes." }); return; }

  // Credit handling for retry:
  // - If post.creditsRefunded = true → image previously failed and credits were returned.
  //   This retry is FREE — skip deduction and reset the flag.
  // - Otherwise → charge normally (post never had a failed image, or was retried successfully before).
  // Admin may trigger retries on any post; the cost always goes to the POST OWNER, not the actor.
  const contentTypeForRetry = post.contentType ?? "image";
  const retryChargeUserId = post.userId ?? req.user!.userId;

  // Track whether credits were actually charged for this retry run.
  // When false, generateImagesForPostsBg must NOT call refundImageFailure on failure
  // (no credit was deducted, so nothing to return — prevents credit-minting exploit).
  let retryChargedCredits = true;

  if (!post.creditsRefunded) {
    const retryDeduct = await checkAndDeductCredits(retryChargeUserId, contentTypeForRetry);
    if (!retryDeduct.ok) {
      res.status(402).json({
        error: `Créditos insuficientes. Tienes ${retryDeduct.creditsHad} crédito${retryDeduct.creditsHad !== 1 ? "s" : ""} pero este tipo cuesta ${retryDeduct.cost} crédito${retryDeduct.cost !== 1 ? "s" : ""}.`,
        creditsRemaining: retryDeduct.creditsHad,
        plan: req.user!.plan,
      });
      return;
    }
  } else {
    retryChargedCredits = false; // free retry — credits already returned on prior failure
    log.info(`[retry-image] post ${postId} credits_refunded=true — retry is free, resetting flag`);
  }

  // Delete any stuck error/pending variants so the retry starts clean,
  // and reset credits_refunded so the next failure triggers a fresh refund.
  await db.update(postsTable).set({ creditsRefunded: false }).where(eq(postsTable.id, postId));
  if (variants.length > 0) {
    await db.delete(imageVariantsTable).where(eq(imageVariantsTable.postId, postId));
  }

  const niche = post.nicheId
    ? (await db.select().from(nichesTable).where(eq(nichesTable.id, post.nicheId)))[0]
    : null;
  const nicheContextShort = niche
    ? `${niche.name} - ${niche.keywords}`
    : post.caption?.slice(0, 120) ?? "Contenido de redes sociales";

  const job = {
    postId: post.id,
    userId: post.userId ?? undefined,
    businessId: post.businessId ?? undefined,
    nicheContextShort,
    captionHook: extractCaptionHook(post.caption ?? ""),
    contentType: contentTypeForRetry,
    styleIdx: 0,
    slideCount: post.slideCount ?? 4,
    platform: post.platform ?? "both",
    chargedCredits: retryChargedCredits,
  };

  log.info(`[retry-image] starting image generation for post ${postId} (${job.contentType}/${job.platform})`);
  res.json({ retrying: true, message: "Generación de imagen iniciada — espera 2-3 min." });

  setImmediate(() => {
    generateImagesForPostsBg([job])
      .then(() => log.info(`[retry-image] done — post ${postId}`))
      .catch(err => log.error({ err }, `[retry-image] error — post ${postId}`));
  });
});

// POST /:id/regenerate-hashtags — generate and save hashtags for a post that has none
router.post("/:id/regenerate-hashtags", async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }
  const cond = tenantPostCond(postId, req);
  const [post] = await db.select().from(postsTable).where(cond);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  // Load user's defaultLocation from brand profile
  const [bp] = await db.select({ defaultLocation: brandProfilesTable.defaultLocation })
    .from(brandProfilesTable).where(eq(brandProfilesTable.userId, post.userId ?? req.user!.userId)).limit(1);
  const defaultLocation = bp?.defaultLocation ?? null;

  const hashtags     = pickHashtags(defaultLocation);
  const hashtagsTiktok = pickHashtagsTiktok(defaultLocation);

  await db.update(postsTable).set({ hashtags, hashtagsTiktok }).where(eq(postsTable.id, postId));
  res.json({ hashtags, hashtagsTiktok });
});

// GET /next-slot?platform=instagram&excludeId=42
// Returns the next available strategy slot for the given platform (used by the approval UI).
// MUST be declared before GET /:id so Express doesn't treat "next-slot" as an id.
router.get("/next-slot", async (req, res) => {
  try {
    const platform  = typeof req.query.platform === "string" ? req.query.platform : "instagram";
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : 0;
    const scheduledAt = await getNextAvailableSlot(platform, excludeId, req.user!.userId, req.user!.role === "admin");
    res.json({ scheduledAt: scheduledAt.toISOString() });
  } catch (err) {
    console.error("next-slot error:", err);
    res.status(500).json({ error: "Could not compute next slot" });
  }
});

// GET /next-slot-per-platform?contentType=reel&excludeId=42
// Returns next available strategy slot PER PLATFORM for "both"-type posts.
// Respects the content type so a reel only blocks reel slots (not carousel/image days).
// MUST be declared before GET /:id.
router.get("/next-slot-per-platform", async (req, res) => {
  try {
    const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "image";
    const excludeId   = req.query.excludeId ? Number(req.query.excludeId) : 0;
    const isAdmin     = req.user!.role === "admin";
    const userId      = req.user!.userId;

    const [igSlot, tkSlot] = await Promise.all([
      getNextSlotForPlatformAndType("instagram", contentType, excludeId, userId, isAdmin),
      getNextSlotForPlatformAndType("tiktok",    contentType, excludeId, userId, isAdmin),
    ]);
    res.json({ instagram: igSlot.toISOString(), tiktok: tkSlot.toISOString() });
  } catch (err) {
    console.error("next-slot-per-platform error:", err);
    res.status(500).json({ error: "Could not compute per-platform slots" });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = GetPostParams.parse({ id: Number(req.params.id) });
  const isAdmin = req.user!.role === "admin";
  const post = await getPostWithVariants(id, req.user!.userId, isAdmin);
  if (!post) return res.status(404).json({ error: "Post not found" });
  return res.json(post);
});

router.put("/:id", async (req, res) => {
  const { id } = UpdatePostParams.parse({ id: Number(req.params.id) });
  const body = UpdatePostBody.parse(req.body);
  const isAdminPut = req.user!.role === "admin";
  if (body.nicheId != null && !isAdminPut) {
    const [ownedNiche] = await db.select({ id: nichesTable.id }).from(nichesTable)
      .where(and(eq(nichesTable.id, body.nicheId), eq(nichesTable.userId, req.user!.userId)));
    if (!ownedNiche) return res.status(404).json({ error: "Niche no encontrado" });
  }
  const tf = tenantFilter(req);
  const cond = tf ? and(eq(postsTable.id, id), tf) : eq(postsTable.id, id);
  const [post] = await db.update(postsTable).set({
    ...(body.caption !== undefined && { caption: body.caption }),
    ...(body.hashtags !== undefined && { hashtags: body.hashtags }),
    ...(body.hashtagsTiktok !== undefined && { hashtagsTiktok: body.hashtagsTiktok }),
    ...(body.platform !== undefined && { platform: body.platform }),
    ...(body.contentType !== undefined && { contentType: body.contentType }),
    ...(body.slideCount !== undefined && { slideCount: body.slideCount }),
    ...(body.nicheId !== undefined && { nicheId: body.nicheId }),
    ...(body.scheduledAt === null ? { scheduledAt: null } : body.scheduledAt !== undefined ? { scheduledAt: new Date(body.scheduledAt) } : {}),
    ...(body.scheduledAtInstagram === null ? { scheduledAtInstagram: null } : body.scheduledAtInstagram !== undefined ? { scheduledAtInstagram: new Date(body.scheduledAtInstagram) } : {}),
    ...(body.scheduledAtTiktok === null ? { scheduledAtTiktok: null } : body.scheduledAtTiktok !== undefined ? { scheduledAtTiktok: new Date(body.scheduledAtTiktok) } : {}),
    ...(body.selectedImageVariant !== undefined && { selectedImageVariant: body.selectedImageVariant }),
    ...(body.status !== undefined && { status: body.status }),
    ...("locationId" in body && { locationId: body.locationId ?? null }),
    ...("locationName" in body && { locationName: body.locationName ?? null }),
    updatedAt: new Date(),
  }).where(cond).returning();
  if (!post) return res.status(404).json({ error: "Post not found" });

  // Si el usuario reagendó el post (cambió la hora o el status a "scheduled"),
  // limpiar los registros failed en publish_log para que el scheduler
  // pueda volver a encontrarlo en el próximo ciclo.
  const isRescheduling =
    body.scheduledAt !== undefined ||
    body.scheduledAtInstagram !== undefined ||
    body.scheduledAtTiktok !== undefined ||
    body.status === "scheduled";
  if (isRescheduling) {
    await db.delete(publishLogTable).where(
      and(
        eq(publishLogTable.postId, post.id),
        eq(publishLogTable.status, "failed"),
      )
    );
  }

  const isAdmin = req.user!.role === "admin";
  const result = await getPostWithVariants(post.id, req.user!.userId, isAdmin);
  return res.json(result);
});

// Platform schedule for rescheduling after deletions
const PLATFORM_FEED_DAYS: Record<string, number[]> = {
  instagram: [1, 3, 5, 6],  // Mon, Wed, Fri, Sat
  tiktok:    [2, 4, 6, 0],  // Tue, Thu, Sat, Sun
};
const PLATFORM_STORY_DAYS: Record<string, number[]> = {
  instagram: [1, 2, 3, 4, 5], // Mon–Fri
  tiktok:    [1, 3, 5],        // Mon, Wed, Fri
};
// Optimal Bogotá hour per platform for the next-slot suggestion (UTC = Bogotá + 5)
const PLATFORM_BOGOTA_HOUR: Record<string, number> = {
  instagram: 8,   // 8:00 Bogotá → 13:00 UTC
  tiktok:    19,  // 19:00 Bogotá → 00:00 UTC next day (handled below)
};
const RESCHEDULE_FEED_HOURS = [7, 12, 19];

/**
 * Finds the next available strategy slot for the given platform.
 * Checks existing pending/scheduled posts for the platform and skips occupied days.
 * @param platform - "instagram" | "tiktok" | "both"
 * @param excludePostId - exclude this post ID from the occupied-days check (the post being approved)
 */
async function getNextAvailableSlot(platform: string, excludePostId: number, userId: number, isAdmin = false): Promise<Date> {
  // For "both" posts use the union of both platforms' feed days (Mon-Sun all covered)
  const feedDays: number[] =
    platform === "both"
      ? [...new Set([...PLATFORM_FEED_DAYS.instagram, ...PLATFORM_FEED_DAYS.tiktok])]
      : (PLATFORM_FEED_DAYS[platform] ?? PLATFORM_FEED_DAYS.instagram);

  // Fetch pending/scheduled posts for this tenant only
  const statusCond = inArray(postsTable.status, ["pending_approval", "scheduled"]);
  const tenantCond = isAdmin ? statusCond : and(statusCond, eq(postsTable.userId, userId));
  const existing = await db
    .select({ id: postsTable.id, scheduledAt: postsTable.scheduledAt, platform: postsTable.platform })
    .from(postsTable)
    .where(tenantCond);

  // Build set of occupied calendar days for this platform
  const occupiedDays = new Set<string>();
  for (const p of existing) {
    if (p.id === excludePostId || !p.scheduledAt) continue;
    // "both" posts collide with every platform; specific posts collide only with same platform or "both"
    const relevant =
      platform === "both"
        ? true
        : (p.platform === platform || p.platform === "both");
    if (relevant) {
      const d = new Date(p.scheduledAt);
      occupiedDays.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
    }
  }

  // Walk forward day by day until we find a free strategy slot (up to 120 days)
  // Use UTC arithmetic — server runs in UTC, Colombia is UTC-5 (BOGOTA_UTC_OFFSET_H = 5)
  const nowUtcMs = Date.now();
  const todayUtcMidnight = new Date(nowUtcMs);
  todayUtcMidnight.setUTCHours(0, 0, 0, 0);

  // First optimal UTC hour = OPTIMAL_HOURS[0] (8am Bogotá) + 5 = 13:00 UTC
  const defaultUtcHour = OPTIMAL_HOURS[0] + BOGOTA_UTC_OFFSET_H;

  for (let offset = 1; offset <= 120; offset++) {
    const candidate = new Date(todayUtcMidnight);
    candidate.setUTCDate(todayUtcMidnight.getUTCDate() + offset);
    // Day-of-week must be UTC-based
    const dow = candidate.getUTCDay();
    const key = `${candidate.getUTCFullYear()}-${candidate.getUTCMonth()}-${candidate.getUTCDate()}`;
    if (feedDays.includes(dow) && !occupiedDays.has(key)) {
      candidate.setUTCHours(defaultUtcHour, 0, 0, 0);
      return candidate;
    }
  }

  // Fallback: tomorrow at first optimal Bogotá hour
  const fallback = new Date(todayUtcMidnight);
  fallback.setUTCDate(todayUtcMidnight.getUTCDate() + 1);
  fallback.setUTCHours(defaultUtcHour, 0, 0, 0);
  return fallback;
}

/**
 * Finds the next available strategy slot for a SPECIFIC platform (not "both"),
 * considering only posts of the SAME content type.
 * This means a day with a carousel does NOT block a reel slot.
 */
async function getNextSlotForPlatformAndType(
  specificPlatform: "instagram" | "tiktok",
  contentType: string,
  excludePostId: number,
  userId: number,
  isAdmin = false,
): Promise<Date> {
  const isStory  = contentType === "story";
  const stratDays = isStory
    ? (PLATFORM_STORY_DAYS[specificPlatform] ?? PLATFORM_STORY_DAYS.instagram)
    : (PLATFORM_FEED_DAYS[specificPlatform]  ?? PLATFORM_FEED_DAYS.instagram);

  // Fetch posts of the SAME type for this platform (or "both") — pending/scheduled only
  const statusCond = inArray(postsTable.status, ["pending_approval", "scheduled"]);
  const tenantCond = isAdmin
    ? and(statusCond, eq(postsTable.contentType, contentType))
    : and(statusCond, eq(postsTable.contentType, contentType), eq(postsTable.userId, userId));

  const existing = await db
    .select({ id: postsTable.id, scheduledAt: postsTable.scheduledAt, platform: postsTable.platform,
              scheduledAtInstagram: postsTable.scheduledAtInstagram, scheduledAtTiktok: postsTable.scheduledAtTiktok })
    .from(postsTable)
    .where(tenantCond);

  // Build set of occupied days for this specific platform + contentType
  const occupiedDays = new Set<string>();
  for (const p of existing) {
    if (p.id === excludePostId) continue;
    // For instagram: check scheduledAtInstagram or scheduledAt (for instagram-only posts)
    // For tiktok: check scheduledAtTiktok or scheduledAt (for tiktok-only posts)
    const relevant = p.platform === specificPlatform || p.platform === "both";
    if (!relevant) continue;
    const dateToUse =
      specificPlatform === "instagram"
        ? (p.scheduledAtInstagram ?? (p.platform === "instagram" ? p.scheduledAt : null))
        : (p.scheduledAtTiktok    ?? (p.platform === "tiktok"    ? p.scheduledAt : null));
    if (!dateToUse) continue;
    const d = new Date(dateToUse);
    occupiedDays.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  }

  // Bogotá hour → UTC hour (handle midnight crossover for TikTok 19h)
  const bogotaHour = PLATFORM_BOGOTA_HOUR[specificPlatform] ?? 8;
  const utcHour = (bogotaHour + BOGOTA_UTC_OFFSET_H) % 24;
  // If bogotaHour + 5 >= 24, the UTC time lands the NEXT calendar day —
  // we add the offset to the candidate AFTER finding the strategy day.
  const crossesMidnight = bogotaHour + BOGOTA_UTC_OFFSET_H >= 24;

  const todayUtcMidnight = new Date();
  todayUtcMidnight.setUTCHours(0, 0, 0, 0);

  for (let offset = 1; offset <= 120; offset++) {
    const candidate = new Date(todayUtcMidnight);
    candidate.setUTCDate(todayUtcMidnight.getUTCDate() + offset);
    const dow = candidate.getUTCDay();
    const key = `${candidate.getUTCFullYear()}-${candidate.getUTCMonth()}-${candidate.getUTCDate()}`;
    if (stratDays.includes(dow) && !occupiedDays.has(key)) {
      // Set UTC hour — if crosses midnight, the Bogotá day is candidate but UTC is candidate+1
      if (crossesMidnight) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
      }
      candidate.setUTCHours(utcHour, 0, 0, 0);
      return candidate;
    }
  }

  // Fallback: day after tomorrow
  const fallback = new Date(todayUtcMidnight);
  fallback.setUTCDate(todayUtcMidnight.getUTCDate() + 2);
  fallback.setUTCHours(utcHour, 0, 0, 0);
  return fallback;
}

async function rescheduleAfterDeletion(platform: string, deletedScheduledAt: Date, userId: number, isAdmin = false): Promise<void> {
  const feedDays = PLATFORM_FEED_DAYS[platform] ?? PLATFORM_FEED_DAYS.instagram;

  // Get all future active posts for this platform, scoped to the owner (unless admin)
  const userCond = isAdmin ? undefined : eq(postsTable.userId, userId);
  const futurePosts = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(and(
      eq(postsTable.platform, platform),
      inArray(postsTable.status, ["pending_approval", "scheduled"]),
      gt(postsTable.scheduledAt, deletedScheduledAt),
      userCond
    ))
    .orderBy(asc(postsTable.scheduledAt));

  if (futurePosts.length === 0) return;

  // Start assigning from the deleted post's calendar day
  const startDate = new Date(deletedScheduledAt);
  startDate.setHours(0, 0, 0, 0);

  let feedSlot = 0;
  let dayOffset = 0;
  const newDates: Date[] = [];

  while (newDates.length < futurePosts.length && dayOffset < 365) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + dayOffset);
    const dow = date.getDay();

    if (feedDays.includes(dow)) {
      const hour = RESCHEDULE_FEED_HOURS[feedSlot % RESCHEDULE_FEED_HOURS.length];
      feedSlot++;
      const scheduled = new Date(date);
      scheduled.setHours(hour, 0, 0, 0);
      newDates.push(scheduled);
    }
    dayOffset++;
  }

  for (let i = 0; i < futurePosts.length && i < newDates.length; i++) {
    await db.update(postsTable)
      .set({ scheduledAt: newDates[i], updatedAt: new Date() })
      .where(eq(postsTable.id, futurePosts[i].id));
  }
}

router.delete("/:id", async (req, res) => {
  const { id } = DeletePostParams.parse({ id: Number(req.params.id) });
  const tf = tenantFilter(req);
  const cond = tf ? and(eq(postsTable.id, id), tf) : eq(postsTable.id, id);

  // Fetch post info before deleting (need platform + scheduledAt for rescheduling + ownership check)
  const [post] = await db.select().from(postsTable).where(cond);
  if (!post) return res.status(404).json({ error: "Post not found" });

  // Capa 1: Record rejection signal BEFORE deleting the post so FK (post_id → posts) is satisfied.
  // ON DELETE SET NULL in niche_approval_signals will null out post_id automatically after deletion.
  // Only draft/pending_approval posts represent an explicit "I don't want this content" signal.
  if (post.nicheId != null && (post.status === "draft" || post.status === "pending_approval")) {
    try {
      await recordApprovalSignal({
        userId: req.user!.userId,
        businessId: post.businessId ?? null,
        postId: id,
        nicheId: post.nicheId,
        signal: "rejected",
      });
    } catch {
      // Non-blocking: signal failure must never interrupt the deletion flow
    }
  }

  await db.delete(imageVariantsTable).where(eq(imageVariantsTable.postId, id));
  await db.delete(postsTable).where(cond);

  // Audit trail: record who deleted the post, when, and key metadata for traceability.
  // user_id is always set here (authenticated route) — a NULL user_id in audit_logs
  // for POST_DELETED would indicate an unauthorized automatic deletion (bug).
  auditLog({
    userId: req.user!.userId,
    businessId: post.businessId ?? undefined,
    action: AuditAction.POST_DELETED,
    entityType: "post",
    entityId: id,
    metadata: {
      platform: post.platform,
      contentType: post.contentType,
      status: post.status,
      postNumber: post.postNumber ?? null,
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
    },
    req,
  });

  // Reschedule subsequent posts to fill the gap
  if (post?.scheduledAt && post?.platform) {
    await rescheduleAfterDeletion(post.platform, post.scheduledAt, req.user!.userId, req.user!.role === "admin").catch(() => {});
  }

  res.json({ success: true, message: "Post deleted" });
});

router.post("/:id/approve", requireEmailVerified, async (req, res) => {
  const { id } = ApprovePostParams.parse({ id: Number(req.params.id) });
  const tf = tenantFilter(req);
  const cond = tf ? and(eq(postsTable.id, id), tf) : eq(postsTable.id, id);
  const [post] = await db.update(postsTable).set({ status: "scheduled", updatedAt: new Date() }).where(cond).returning();
  if (!post) return res.status(404).json({ error: "Post not found" });
  const isAdmin = req.user!.role === "admin";
  const result = await getPostWithVariants(post.id, req.user!.userId, isAdmin);
  res.json(result); // intentional: fire-and-forget work below

  // Capa 1: Record approval signal — user explicitly approved this post for scheduling.
  if (post.nicheId != null) {
    recordApprovalSignal({
      userId: req.user!.userId,
      businessId: post.businessId ?? null,
      postId: post.id,
      nicheId: post.nicheId,
      signal: "approved",
    }).catch(() => {});
  }

  // Fire-and-forget: check if the business has any connected social accounts.
  // If not, send a proactive Telegram alert so the user knows the post won't publish.
  if (post.businessId != null && post.userId != null) {
    (async () => {
      try {
        const [hasAccount] = await db
          .select({ id: socialAccountsTable.id })
          .from(socialAccountsTable)
          .where(
            and(
              eq(socialAccountsTable.businessId, post.businessId!),
              eq(socialAccountsTable.connected, "true"),
            )
          )
          .limit(1);

        if (!hasAccount) {
          const [biz] = await db
            .select({ name: businessesTable.name })
            .from(businessesTable)
            .where(eq(businessesTable.id, post.businessId!))
            .limit(1);
          const businessName = biz?.name ?? `Negocio ${post.businessId}`;
          await notifyApprovedPostNoAccounts(post.id, post.postNumber, businessName, post.userId!);
        }
      } catch (err) {
        console.error("[approve] Error checking social accounts for Telegram alert:", err);
      }
    })();
  }

  // Auto-generate TikTok 9:16 variant in background for "both" platform portrait posts.
  // Uses the originalRawBackground (pre-crop 9:16) stored during initial image generation.
  // Saves result to tiktokImageData on the selected variant — no new AI generation cost.
  if (post.platform === "both" && shouldCropTo4by5(post.contentType ?? "", "both")) {
    const variants = await db.select().from(imageVariantsTable).where(eq(imageVariantsTable.postId, id));
    const selected = variants.find(v => v.id === post.selectedImageVariant) || variants[0];
    if (selected?.originalRawBackground && !selected.tiktokImageData) {
      // Read the exact overlay params stored when this variant was generated.
      // Falls back to sensible defaults only for legacy variants without stored params.
      const logoPos    = (selected.overlayLogoPosition  ?? "top-right") as Parameters<typeof applyOverlays>[1];
      const logoCol    = (selected.overlayLogoColor     ?? "white")     as Parameters<typeof applyOverlays>[2];
      const txtStyle   = (selected.overlayTextStyle     ?? "eco")       as Parameters<typeof applyOverlays>[4];
      const txtPos     = (selected.overlayTextPosition  ?? "bottom")    as Parameters<typeof applyOverlays>[5];
      const txtSize    = selected.overlayTextSize ?? "medium";
      const storedFilt = (selected.overlayFilter ?? "none") as ImageFilter;
      const storedFont = selected.overlayFont ?? undefined;
      const storedFont2 = selected.overlayFont2 ?? undefined;
      const storedTitleColor1 = selected.overlayTitleColor1 ?? undefined;
      const storedTitleColor2 = selected.overlayTitleColor2 ?? undefined;
      // null stored = was explicitly stored (undefined = old variant without stored value)
      const storedSignatureText = selected.overlaySignatureText !== null ? selected.overlaySignatureText : undefined;
      const storedShowSignature = selected.overlayShowSignature !== null ? selected.overlayShowSignature !== "false" : undefined;
      const storedCustomLogoUrl = selected.overlayCustomLogoUrl ?? undefined;

      // If the variant already has its hook stored, use it; otherwise extract from caption.
      const hookPromise = Promise.resolve(
        selected.overlayCaptionHook ?? extractCaptionHook(post.caption ?? "")
      );

      hookPromise
        .then(captionHook =>
          applyOverlays(selected.originalRawBackground!, logoPos, logoCol, captionHook, txtStyle, txtPos, txtSize, storedFilt, storedFont, undefined, storedTitleColor1, post.businessId ?? undefined, post.userId ?? undefined, storedTitleColor2, storedSignatureText, storedShowSignature, storedCustomLogoUrl, undefined, post.contentType ?? undefined, storedFont2)
        )
        .then(tiktokImageData =>
          db.update(imageVariantsTable)
            .set({ tiktokImageData })
            .where(eq(imageVariantsTable.id, selected.id))
        )
        .catch(err => console.error("[BG] TikTok variant generation error:", err));
    }
  }
  return;
});

router.post("/:id/reject", async (req, res) => {
  const { id } = RejectPostParams.parse({ id: Number(req.params.id) });
  const cond = tenantPostCond(id, req);
  const [post] = await db.update(postsTable).set({ status: "rejected", updatedAt: new Date() }).where(cond).returning();
  if (!post) return res.status(404).json({ error: "Post not found" });
  const isAdmin = req.user!.role === "admin";
  const result = await getPostWithVariants(post.id, req.user!.userId, isAdmin);
  res.json(result);

  // Capa 1: Explicit rejection signal — user rejected this niche/content from the approval queue.
  if (post.nicheId != null) {
    recordApprovalSignal({
      userId: req.user!.userId,
      businessId: post.businessId ?? null,
      postId: post.id,
      nicheId: post.nicheId,
      signal: "rejected",
    }).catch(() => {});
  }
  return;
});

router.post("/:id/retry", requireEmailVerified, async (req, res) => {
  const { id } = ApprovePostParams.parse({ id: Number(req.params.id) });
  const post = await getTenantPost(id, req);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const allowedStatuses = ["failed", "scheduled", "published"];
  if (!allowedStatuses.includes(post.status ?? "")) {
    return res.status(400).json({ error: "Solo se pueden reintentar posts fallidos, programados o con plataformas pendientes" });
  }

  // If the post is "published", only retry platforms that specifically failed
  if (post.status === "published") {
    const failedLogs = await db
      .select()
      .from(publishLogTable)
      .where(and(eq(publishLogTable.postId, id), eq(publishLogTable.status, "failed")));

    if (failedLogs.length === 0) {
      return res.status(400).json({ error: "Este post ya fue publicado correctamente en todas las plataformas" });
    }

    // Retry each failed platform individually
    for (const log of failedLogs) {
      const platform = log.platform as "instagram" | "tiktok";
      if (platform === "instagram" || platform === "tiktok") {
        await publishPost(id, platform);
      }
    }

    const isAdmin = req.user!.role === "admin";
    const result = await getPostWithVariants(id, req.user!.userId, isAdmin);
    return res.json(result);
  }

  // Normal retry for failed/scheduled posts
  await db.update(postsTable).set({ status: "scheduled", updatedAt: new Date() }).where(eq(postsTable.id, id));
  await publishPost(id);
  const isAdmin = req.user!.role === "admin";
  const result = await getPostWithVariants(id, req.user!.userId, isAdmin);
  return res.json(result);
});

// POST /:id/mark-published — marca un post fallido como publicado manualmente
router.post("/:id/mark-published", requireEmailVerified, async (req, res) => {
  const { id } = ApprovePostParams.parse({ id: Number(req.params.id) });
  const post = await getTenantPost(id, req);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const allowedStatuses = ["failed", "scheduled", "pending_approval", "rejected"];
  if (!allowedStatuses.includes(post.status ?? "")) {
    return res.status(400).json({ error: "Este post ya fue publicado o no puede marcarse como publicado manualmente" });
  }

  await db.update(postsTable).set({
    status: "published",
    publishedAt: post.publishedAt ?? new Date(),
    updatedAt: new Date(),
  }).where(eq(postsTable.id, id));

  await auditLog({
    userId: req.user!.userId,
    action: AuditAction.POST_UPDATED,
    entityType: "post",
    entityId: String(id),
    metadata: { action: "mark-published-manual", prevStatus: post.status },
  });

  return res.json({ success: true });
});

router.post("/:id/regenerate-caption", async (req, res) => {
  const { id } = RegenerateCaptionParams.parse({ id: Number(req.params.id) });
  const post = await getTenantPost(id, req);
  if (!post) return res.status(404).json({ error: "Post not found" });

  // Credit check — caption regeneration costs the same as the post's content type (min 1).
  // Always charge the POST OWNER, not the actor (admin may regenerate on behalf of users).
  const capChargeUserId = post.userId ?? req.user!.userId;
  const capContentType = post.contentType ?? "image";
  const capCredit = await checkAndDeductCredits(capChargeUserId, capContentType);
  if (!capCredit.ok) {
    return res.status(402).json({
      error: `Créditos insuficientes. El dueño del post tiene ${capCredit.creditsHad} crédito${capCredit.creditsHad !== 1 ? "s" : ""} pero este tipo cuesta ${capCredit.cost} crédito${capCredit.cost !== 1 ? "s" : ""}.`,
      creditsRemaining: capCredit.creditsHad,
      cost: capCredit.cost,
    });
  }

  // V_CAP_1 FIX: nicheContext por defecto era "energía solar..." (ECO-específico).
  // Si el post no tiene nicheId, usar contexto genérico neutro que no asuma industria.
  let nicheContext = "marketing digital y generación de contenido para negocios en Colombia";
  if (post.nicheId) {
    const [niche] = await db.select().from(nichesTable).where(eq(nichesTable.id, post.nicheId));
    if (niche) nicheContext = `${niche.name}: ${niche.description}. Keywords: ${niche.keywords}`;
  }

  // V_CAP_2 FIX: pasar businessId del post — sin él, getBrandContextBlock usa legacy brand_profiles
  // que devuelve el perfil de ECO para userId=1, inyectando contexto de ECO en posts de HazPost.
  let generatedCaption: { caption: string; hashtags: string; hashtagsTiktok: string };
  try {
    generatedCaption = await generateCaption(
      nicheContext, post.platform, "image",
      undefined, req.user!.userId, undefined,
      post.businessId ?? undefined,
    );
  } catch (capGenErr) {
    // Refund the deducted credit if the AI call fails — post owner should not be charged
    const capRefundCosts = await getCreditCosts();
    const capRefundAmt = creditCostOf(capContentType, capRefundCosts);
    await db.update(subscriptionsTable)
      .set({ creditsRemaining: sql`${subscriptionsTable.creditsRemaining} + ${capRefundAmt}` })
      .where(eq(subscriptionsTable.userId, capChargeUserId))
      .catch(() => {});
    throw capGenErr;
  }
  const { caption, hashtags, hashtagsTiktok } = generatedCaption;
  const cond = tenantPostCond(id, req);
  const [updated] = await db.update(postsTable).set({ caption, hashtags, hashtagsTiktok, updatedAt: new Date() }).where(cond).returning();
  const isAdmin = req.user!.role === "admin";
  const result = await getPostWithVariants(updated!.id, req.user!.userId, isAdmin);
  return res.json(result);
});

// Spell-check a headline in Spanish before image generation
router.post("/check-headline", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) return res.json({ hasErrors: false, corrected: "", explanation: "" });
  const result = await checkHeadlineSpelling(text.trim());
  return res.json(result);
});

// Spell-check a full post caption (ignores emojis and hashtags, focuses on spelling/accents/grammar)
router.post("/check-caption", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) return res.json({ hasErrors: false, corrected: "", explanation: "" });
  const result = await checkCaptionSpelling(text.trim());
  return res.json(result);
});

// POST /posts/:id/suggest-headlines — AI generates 5 punchy image headline options
router.post("/:id/suggest-headlines", async (req, res) => {
  const postId = Number(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: "ID inválido" });

  const post = await getTenantPost(postId, req);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });
  if (!post.caption?.trim()) return res.status(400).json({ error: "El post no tiene caption aún. Genera un caption primero." });

  const headlines = await suggestHeadlines(post.caption, post.platform, post.contentType);
  return res.json({ headlines });
});

router.post("/:id/apply-suggestion", async (req, res) => {
  const { id } = ApplySuggestionParams.parse({ id: Number(req.params.id) });
  const { instruction } = ApplySuggestionBody.parse(req.body);

  const post = await getTenantPost(id, req);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const suggBizId = await getActiveBusinessId(req.user!.userId);
  const improvedCaption = await applySuggestion(post.caption, instruction, req.user!.userId, suggBizId ?? undefined);
  const cond = tenantPostCond(id, req);
  await db.update(postsTable).set({ caption: improvedCaption, updatedAt: new Date() }).where(cond);

  return res.json({ caption: improvedCaption });
});

/**
 * PATCH /api/posts/:id/variants/:variantId/overlay-params
 * Persist the approval-queue overlay settings for a variant without regenerating it.
 * Called when the user changes brand colors / firma in the UI and hits Approve.
 */
router.patch("/:id/variants/:variantId/overlay-params", async (req, res) => {
  const postId    = Number(req.params.id);
  const variantId = Number(req.params.variantId);
  if (isNaN(postId) || isNaN(variantId)) return res.status(400).json({ error: "Invalid ids" });

  const post = await getTenantPost(postId, req);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const { titleColor1, titleColor2, signatureText, showSignature, customLogoUrl } = req.body as {
    titleColor1?: string;
    titleColor2?: string;
    signatureText?: string;
    showSignature?: boolean;
    customLogoUrl?: string | null;
  };

  const [updated] = await db.update(imageVariantsTable)
    .set({
      ...(titleColor1 !== undefined ? { overlayTitleColor1: titleColor1 } : {}),
      ...(titleColor2 !== undefined ? { overlayTitleColor2: titleColor2 } : {}),
      ...(signatureText !== undefined ? { overlaySignatureText: signatureText } : {}),
      ...(showSignature !== undefined ? { overlayShowSignature: String(showSignature) } : {}),
      // null explicitly clears the custom logo; undefined means "not provided" (no-op)
      ...(customLogoUrl !== undefined ? { overlayCustomLogoUrl: customLogoUrl ?? null } : {}),
    })
    .where(and(eq(imageVariantsTable.id, variantId), eq(imageVariantsTable.postId, postId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Variant not found" });
  return res.json({ ok: true });
});

router.delete("/:id/variants/:variantId", async (req, res) => {
  const postId    = Number(req.params.id);
  const variantId = Number(req.params.variantId);
  if (isNaN(postId) || isNaN(variantId)) return res.status(400).json({ error: "Invalid ids" });

  // Verify ownership before deleting
  const post = await getTenantPost(postId, req);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const deleted = await db.delete(imageVariantsTable)
    .where(and(eq(imageVariantsTable.id, variantId), eq(imageVariantsTable.postId, postId)))
    .returning();

  if (!deleted.length) return res.status(404).json({ error: "Variant not found" });

  // If the deleted variant was the selected one, clear the selection
  if (post.selectedImageVariant === variantId) {
    const cond = tenantPostCond(postId, req);
    await db.update(postsTable).set({ selectedImageVariant: null }).where(cond);
  }

  return res.json({ ok: true });
});

router.post("/:id/generate-image-variant", async (req, res) => {
  try {
    const { id } = GenerateImageVariantParams.parse({ id: Number(req.params.id) });
    const body = GenerateImageVariantBody.parse(req.body);

    const post = await getTenantPost(id, req);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const existingVariants = await db.select().from(imageVariantsTable).where(eq(imageVariantsTable.postId, id));
    const nextIndex = existingVariants.length;

    // V_GEN_1 FIX: default was ECO-specific — load industry from business when no niche is assigned
    let nicheContext = "contenido para negocios en Colombia";
    if (post.nicheId) {
      const [niche] = await db.select().from(nichesTable).where(eq(nichesTable.id, post.nicheId));
      if (niche) nicheContext = `${niche.name} - ${niche.keywords}`;
    } else if (post.businessId) {
      const [biz] = await db
        .select({ industry: businessesTable.industry, name: businessesTable.name })
        .from(businessesTable)
        .where(and(eq(businessesTable.id, post.businessId), eq(businessesTable.userId, req.user!.userId)))
        .limit(1);
      if (biz?.industry) nicheContext = biz.industry;
      else if (biz?.name) nicheContext = `Negocio: ${biz.name}`;
    }

    const style = body.style as "photorealistic" | "graphic" | "infographic";
    const logoPosition = (body.logoPosition ?? "top-right") as LogoPosition;
    const logoColor = (body.logoColor ?? "white") as LogoColor;
    // V_GEN_2 FIX: default was "eco" — use "cinema" as neutral default for all non-ECO businesses
    const textStyle = (body.textStyle ?? "cinema") as TextStyle;
    const textPosition = (body.textPosition ?? "bottom") as TextPosition;
    const textSize = body.textSize ?? "medium";
    const imageFilter = (body.overlayFilter ?? "none") as ImageFilter;
    const overlayFontPreset = body.overlayFont;
    const overlayFont2Preset = body.overlayFont2;
    // Brand color + firma params from approval queue UI
    const titleColor1 = body.titleColor1 ?? undefined;
    const titleColor2 = body.titleColor2 ?? undefined;
    // undefined = "not provided" → applyOverlays falls back to resolveBrandTagline
    // empty string "" = explicitly no signature
    const signatureText = body.signatureText !== undefined ? body.signatureText : undefined;
    const showSignature = body.showSignature !== undefined ? body.showSignature : undefined;
    // Custom logo override — null = clear stored custom logo and use business default
    const customLogoUrl = body.customLogoUrl !== undefined ? (body.customLogoUrl ?? null) : undefined;
    // Use custom headline if provided, otherwise extract from caption
    const captionHook = body.customHeadline?.trim()
      || (post.caption
        ? post.caption.split("\n")[0].replace(/[\u{1F000}-\u{1FFFF}]/gu, "").replace(/[#@]/g, "").trim().slice(0, 60)
        : undefined);

    let imageData: string;
    let rawBackground: string | undefined;
    let originalRawBackground: string | undefined;

    if (body.reuseVariantId != null) {
      // Reuse existing background from same post — no DALL-E call
      const [sourceVariant] = await db.select().from(imageVariantsTable)
        .where(and(eq(imageVariantsTable.id, body.reuseVariantId), eq(imageVariantsTable.postId, id)));
      if (!sourceVariant?.rawBackground) {
        return res.status(400).json({ error: "Este fondo no tiene versión guardada. Genera una imagen nueva primero." });
      }
      rawBackground = sourceVariant.rawBackground;
      imageData = await applyOverlays(rawBackground, logoPosition, logoColor, captionHook, textStyle, textPosition, textSize, imageFilter, overlayFontPreset, undefined, titleColor1, post.businessId ?? undefined, post.userId ?? undefined, titleColor2, signatureText, showSignature, customLogoUrl, undefined, post.contentType ?? undefined, overlayFont2Preset);
    } else if (body.libraryBgVariantId != null) {
      // Reuse a background from the library — scoped to the authenticated user (admin bypass)
      const isAdminUser = req.user!.role === "admin";
      const libCond = isAdminUser
        ? eq(imageVariantsTable.id, body.libraryBgVariantId)
        : and(eq(imageVariantsTable.id, body.libraryBgVariantId), eq(imageVariantsTable.userId, req.user!.userId));
      const [sourceVariant] = await db.select().from(imageVariantsTable).where(libCond);
      if (!sourceVariant?.rawBackground) {
        return res.status(404).json({ error: "Fondo de biblioteca no encontrado o sin imagen guardada." });
      }
      // Auto-resize if the library bg orientation doesn't match the target post format
      rawBackground = await fitRawBgToPost(sourceVariant.rawBackground, post);
      imageData = await applyOverlays(rawBackground, logoPosition, logoColor, captionHook, textStyle, textPosition, textSize, imageFilter, overlayFontPreset, undefined, titleColor1, post.businessId ?? undefined, post.userId ?? undefined, titleColor2, signatureText, showSignature, customLogoUrl, undefined, post.contentType ?? undefined, overlayFont2Preset);
      // Increment usage counter on the source variant
      await db.update(imageVariantsTable)
        .set({ libraryUseCount: sql`${imageVariantsTable.libraryUseCount} + 1` })
        .where(eq(imageVariantsTable.id, body.libraryBgVariantId));
    } else if (body.mediaId != null) {
      // Use an uploaded photo/image from the media library — scoped to the authenticated user (admin bypass)
      const isAdminUser = req.user!.role === "admin";
      const mediaCond = isAdminUser
        ? eq(mediaLibraryTable.id, body.mediaId)
        : and(eq(mediaLibraryTable.id, body.mediaId), eq(mediaLibraryTable.userId, req.user!.userId));
      const [mediaItem] = await db.select().from(mediaLibraryTable).where(mediaCond);
      if (!mediaItem?.data) {
        return res.status(404).json({ error: "Elemento de galería no encontrado." });
      }
      if (mediaItem.type !== "image") {
        return res.status(400).json({ error: "Solo se pueden usar imágenes (no videos) como fondo." });
      }
      // Auto-resize if the photo orientation doesn't match the target post format
      rawBackground = await fitRawBgToPost(mediaItem.data, post);
      imageData = await applyOverlays(rawBackground, logoPosition, logoColor, captionHook, textStyle, textPosition, textSize, imageFilter, overlayFontPreset, undefined, titleColor1, post.businessId ?? undefined, post.userId ?? undefined, titleColor2, signatureText, showSignature, customLogoUrl, undefined, post.contentType ?? undefined, overlayFont2Preset);
    } else {
      // ── Async path: DALL-E generation (gpt-image-1 takes 40-70s) ──────────────
      // 1. Atomically check and deduct 1 credit (image cost) before queuing.
      // Always charge the POST OWNER, not the actor — admin may trigger generation on behalf of users.
      const variantChargeUserId = post.userId ?? req.user!.userId;
      const variantContentType = post.contentType ?? "image";
      const variantCredit = await checkAndDeductCredits(variantChargeUserId, variantContentType);
      if (!variantCredit.ok) {
        return res.status(402).json({
          error: `Créditos insuficientes. El dueño del post tiene ${variantCredit.creditsHad} crédito${variantCredit.creditsHad !== 1 ? "s" : ""} pero este tipo cuesta ${variantCredit.cost} crédito${variantCredit.cost !== 1 ? "s" : ""}.`,
          creditsRemaining: variantCredit.creditsHad,
          cost: variantCredit.cost,
        });
      }

      // 2. Insert pending placeholder so frontend can poll
      const [pendingVariant] = await db.insert(imageVariantsTable).values({
        userId: req.user!.userId,
        postId: id,
        variantIndex: nextIndex,
        imageData: "",
        style,
        prompt: nicheContext,
        overlayLogoPosition: logoPosition,
        overlayLogoColor: logoColor,
        overlayCaptionHook: captionHook ?? null,
        overlayTextStyle: textStyle,
        overlayTextPosition: textPosition,
        overlayTextSize: textSize,
        overlayFont: overlayFontPreset && overlayFontPreset !== "default" ? overlayFontPreset : null,
        overlayFont2: overlayFont2Preset && overlayFont2Preset !== "default" ? overlayFont2Preset : null,
        overlayFilter: imageFilter !== "none" ? imageFilter : null,
        overlayTitleColor1: titleColor1 ?? null,
        overlayTitleColor2: titleColor2 ?? null,
        overlaySignatureText: signatureText ?? null,
        overlayShowSignature: showSignature !== undefined ? String(showSignature) : null,
        overlayCustomLogoUrl: customLogoUrl ?? null,
        generationStatus: "pending",
      }).returning();

      // 4. Resolve enriched instruction BEFORE responding so we can warn the client if
      //    reference-image analysis fails (analyzeReferenceImage returns "" on error).
      // Priority: manual upload (body.referenceImageBase64) > saved business ref images > none
      // Signal attribution: always use the POST OWNER (post.userId), not the actor.
      // Admin users may trigger generation on behalf of other users, and signals must be
      // attributed to the real learning subject — same pattern as credit charging above.
      const bgUserId = post.userId ?? req.user!.userId;
      const bgBizId = post.businessId ?? (await getActiveBusinessId(bgUserId)) ?? undefined;
      let enrichedInstruction = body.customInstruction;
      let referenceImageWarning = false;
      if (body.referenceImageBase64) {
        try {
          const styleDesc = await analyzeReferenceImage(body.referenceImageBase64);
          if (styleDesc) {
            enrichedInstruction = enrichedInstruction
              ? `${enrichedInstruction}\n\nEstilo visual de referencia: ${styleDesc}`
              : `Estilo visual de referencia: ${styleDesc}`;
            // Fire-and-forget: record reference image as a visual signal for learning
            void recordVisualSignal({
              userId: bgUserId,
              businessId: post.businessId ?? null,
              postId: id,
              signalType: "reference_image",
              imageDescription: styleDesc,
            });
          } else {
            // analyzeReferenceImage returned "" — analysis failed silently
            referenceImageWarning = true;
            console.warn("[img-gen] analyzeReferenceImage returned empty — generation will proceed without reference style");
          }
        } catch (refErr) {
          referenceImageWarning = true;
          console.error("[img-gen] analyzeReferenceImage failed, continuing without style desc:", refErr);
        }
      } else if (bgBizId != null) {
        // Fallback: apply saved business reference images when no manual image was uploaded
        try {
          const savedRefStyle = await getBusinessSavedRefStyle(bgBizId, bgUserId);
          if (savedRefStyle) {
            enrichedInstruction = enrichedInstruction
              ? `${enrichedInstruction}\n\nEstilo visual de referencia guardado: ${savedRefStyle}`
              : `Estilo visual de referencia guardado: ${savedRefStyle}`;
          }
        } catch (savedRefErr) {
          console.error("[img-gen] getBusinessSavedRefStyle failed, continuing without saved ref:", savedRefErr);
        }
      }

      // 5. Return 202 immediately — client polls until generationStatus = "ready"
      //    Include referenceImageWarning so the client can show feedback when analysis failed.
      res.status(202).json({ ...pendingVariant, ...(referenceImageWarning ? { referenceImageWarning: true } : {}) });

      // Fire-and-forget: record style choices as a visual learning signal
      void recordVisualSignal({
        userId: bgUserId,
        businessId: post.businessId ?? null,
        postId: id,
        signalType: "style_regen",
        style,
        overlayFilter: imageFilter !== "none" ? imageFilter : null,
        textStyle,
        overlayFont: overlayFontPreset && overlayFontPreset !== "default" ? overlayFontPreset : null,
        logoPosition,
      });

      // 6. Generate DALL-E image in background (does NOT block HTTP response)
      // bgChargeUserId mirrors variantChargeUserId for consistent refund on failure.
      const bgChargeUserId = variantChargeUserId;
      const bgPostId = id;
      const bgVariantId = pendingVariant.id;
      setImmediate(async () => {
        try {
          const result = await generatePostImage(nicheContext, style, post.contentType ?? "image", undefined, enrichedInstruction, logoPosition, captionHook, logoColor, textStyle, textPosition, textSize, post.platform ?? undefined, undefined, undefined, undefined, imageFilter, bgUserId, undefined, titleColor1, bgBizId, titleColor2, signatureText, showSignature, customLogoUrl, overlayFontPreset, undefined, overlayFont2Preset);
          const bgRawBgHash = result.rawBackground
            ? createHash("sha256").update(result.rawBackground).digest("hex")
            : null;
          await db.update(imageVariantsTable)
            .set({
              imageData: result.imageData,
              rawBackground: result.rawBackground ?? null,
              originalRawBackground: result.originalRawBackground ?? null,
              rawBackgroundHash: bgRawBgHash,
              generationStatus: "ready",
            })
            .where(eq(imageVariantsTable.id, bgVariantId));
          console.log(`[img-gen] variant ${bgVariantId} ready for post ${bgPostId}`);
        } catch (bgErr) {
          console.error(`[img-gen] variant ${bgVariantId} failed:`, bgErr);
          const errMsg = bgErr instanceof Error ? bgErr.message : String(bgErr);
          await db.update(imageVariantsTable)
            .set({ generationStatus: "error", generationError: errMsg.slice(0, 500) })
            .where(eq(imageVariantsTable.id, bgVariantId));
          // Refund the deducted credit on failure — refund goes to the POST OWNER, matching deduction above.
          const refundCosts = await getCreditCosts();
          const refundAmount = creditCostOf(post.contentType, refundCosts);
          await db.update(subscriptionsTable)
            .set({ creditsRemaining: sql`${subscriptionsTable.creditsRemaining} + ${refundAmount}` })
            .where(eq(subscriptionsTable.userId, bgChargeUserId));
        }
      });
      return; // response already sent
    }

    // ── Synchronous paths (reuse bg / library / media — no DALL-E) ───────────
    const isFreshDallE = false; // credit was never needed — all fast paths are free of DALL-E cost

    // Compute SHA-256 of rawBackground for deduplication in the slide library
    const rawBackgroundHash = rawBackground
      ? createHash("sha256").update(rawBackground).digest("hex")
      : null;

    const [variant] = await db.insert(imageVariantsTable).values({
      userId: req.user!.userId,
      postId: id,
      variantIndex: nextIndex,
      imageData: imageData!,
      rawBackground,
      originalRawBackground,
      rawBackgroundHash,
      style,
      prompt: nicheContext,
      overlayLogoPosition: logoPosition,
      overlayLogoColor: logoColor,
      overlayCaptionHook: captionHook ?? null,
      overlayTextStyle: textStyle,
      overlayTextPosition: textPosition,
      overlayTextSize: textSize,
      overlayFont: overlayFontPreset && overlayFontPreset !== "default" ? overlayFontPreset : null,
      overlayFont2: overlayFont2Preset && overlayFont2Preset !== "default" ? overlayFont2Preset : null,
      overlayFilter: imageFilter !== "none" ? imageFilter : null,
      overlayTitleColor1: titleColor1 ?? null,
      overlayTitleColor2: titleColor2 ?? null,
      overlaySignatureText: signatureText ?? null,
      overlayShowSignature: showSignature !== undefined ? String(showSignature) : null,
      overlayCustomLogoUrl: customLogoUrl ?? null,
      generationStatus: "ready",
    }).returning();

    void isFreshDallE; // unused, kept for symmetry

    // Record style choices as a visual learning signal for sync paths (reuse/library/media).
    // Fires for all successful overlay applications — not just DALL-E — so style preference
    // is learned even when the user reuses or imports a background.
    void recordVisualSignal({
      userId: post.userId ?? req.user!.userId,
      businessId: post.businessId ?? null,
      postId: id,
      signalType: "style_regen",
      style,
      overlayFilter: imageFilter !== "none" ? imageFilter : null,
      textStyle,
      overlayFont: overlayFontPreset && overlayFontPreset !== "default" ? overlayFontPreset : null,
      logoPosition,
    });

    return res.status(201).json(variant);
  } catch (err: unknown) {
    const isZod = (err as { name?: string })?.name === "ZodError";
    req.log?.error({ err }, "generate-image-variant failed");
    const message = err instanceof Error ? err.message : "Error interno";
    return res.status(isZod ? 400 : 500).json({ error: isZod ? (err as { errors: unknown }).errors : message });
  }
});

// POST /posts/:id/reorder-slides
// Receives an ordered array of variant IDs and updates each variant's variantIndex.
// Safe to call multiple times — idempotent (sets exact index regardless of current value).
router.post("/:id/reorder-slides", async (req, res) => {
  const postId = Number(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

  const postCheck = await getTenantPost(postId, req);
  if (!postCheck) return res.status(404).json({ error: "Post no encontrado" });

  const { variantIds } = req.body as { variantIds?: number[] };
  if (!Array.isArray(variantIds) || variantIds.length === 0) {
    return res.status(400).json({ error: "variantIds debe ser un array no vacío" });
  }

  // Verify all variants belong to this post
  const variants = await db.select({ id: imageVariantsTable.id })
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.postId, postId));
  const validIds = new Set(variants.map(v => v.id));
  const invalid = variantIds.filter(id => !validIds.has(id));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Variants no pertenecen a este post: ${invalid.join(", ")}` });
  }

  // Update each variant's variantIndex to match the requested order.
  // Every variant in the carousel is a slide — no orphan concept.
  // Variants NOT in variantIds keep their current index (they remain as slides).
  for (let i = 0; i < variantIds.length; i++) {
    await db.update(imageVariantsTable)
      .set({ variantIndex: i })
      .where(eq(imageVariantsTable.id, variantIds[i]));
  }

  const result = await getPostWithVariants(postId);
  return res.json(result);
});

// POST /posts/:id/add-raw-slide
// Creates a new image variant from a media library item with NO overlays applied.
// The raw file (image or video) is stored as-is and appears immediately as a carousel slide.
router.post("/:id/add-raw-slide", async (req, res) => {
  const postId = Number(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

  const postCheck = await getTenantPost(postId, req);
  if (!postCheck) return res.status(404).json({ error: "Post no encontrado" });

  const { mediaId } = req.body as { mediaId?: number };
  if (!mediaId) return res.status(400).json({ error: "mediaId requerido" });

  const isAdminSlide = req.user!.role === "admin";
  const slideCond = isAdminSlide
    ? eq(mediaLibraryTable.id, mediaId)
    : and(eq(mediaLibraryTable.id, mediaId), eq(mediaLibraryTable.userId, req.user!.userId));
  const [media] = await db.select().from(mediaLibraryTable).where(slideCond);
  if (!media) return res.status(404).json({ error: "Media no encontrado" });

  // Normalize EXIF orientation for images (defensive — covers old uploads stored before this fix)
  let slideData = media.data;
  let slideMime = media.mimeType ?? "image/jpeg";
  if (media.type === "image") {
    const rawBuf = Buffer.from(slideData, "base64");
    const normalizedBuf = await sharp(rawBuf).rotate().jpeg({ quality: 92 }).toBuffer();
    slideData = normalizedBuf.toString("base64");
    slideMime = "image/jpeg";
  }

  const existingVariants = await db
    .select({ variantIndex: imageVariantsTable.variantIndex })
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.postId, postId));

  const nextIndex = existingVariants.reduce((max, v) => Math.max(max, v.variantIndex ?? 0), -1) + 1;

  const [variant] = await db.insert(imageVariantsTable).values({
    postId,
    userId: req.user!.userId,
    variantIndex: nextIndex,
    imageData: slideData,
    rawBackground: slideData,
    mimeType: slideMime,
    style: "raw_upload",
    prompt: media.filename || "uploaded",
  }).returning();

  return res.status(201).json(variant);
});

// POST /posts/:id/variants/:variantId/rotate
// Rotates a variant's rawBackground (and imageData for raw_upload) by the given degrees.
// For non-raw_upload variants: rotates rawBackground then re-applies overlays.
// Body: { degrees: 90 | -90 | 180 }
router.post("/:id/variants/:variantId/rotate", requireEmailVerified, async (req, res) => {
  const postId = Number(req.params.id);
  const variantId = Number(req.params.variantId);
  if (isNaN(postId) || isNaN(variantId)) return res.status(400).json({ error: "IDs inválidos" });

  const postCheck = await getTenantPost(postId, req);
  if (!postCheck) return res.status(404).json({ error: "Post no encontrado" });

  const degrees = Number(req.body.degrees ?? 90);
  if (![90, -90, 180].includes(degrees)) return res.status(400).json({ error: "degrees debe ser 90, -90 o 180" });

  const [variant] = await db.select().from(imageVariantsTable).where(
    and(eq(imageVariantsTable.id, variantId), eq(imageVariantsTable.postId, postId))
  );
  if (!variant) return res.status(404).json({ error: "Variante no encontrada" });

  // Guard: only image variants can be rotated — videos are not supported
  if (variant.mimeType?.startsWith("video/")) {
    return res.status(400).json({ error: "La rotación no está disponible para variantes de video." });
  }

  // Rotate the rawBackground (or imageData for raw_upload)
  const srcBase64 = variant.rawBackground ?? variant.imageData;
  const srcBuf = Buffer.from(srcBase64, "base64");
  const rotatedBuf = await sharp(srcBuf).rotate(degrees).jpeg({ quality: 92 }).toBuffer();
  const rotatedBase64 = rotatedBuf.toString("base64");

  let newImageData: string;
  if (variant.style === "raw_upload") {
    newImageData = rotatedBase64;
  } else {
    newImageData = await applyOverlays(
      rotatedBase64,
      (variant.overlayLogoPosition as LogoPosition | undefined) ?? "top-right",
      (variant.overlayLogoColor as LogoColor | undefined) ?? "white",
      variant.overlayCaptionHook ?? undefined,
      (variant.overlayTextStyle as TextStyle | undefined) ?? "cinema",
      (variant.overlayTextPosition as TextPosition | undefined) ?? "bottom",
      variant.overlayTextSize ?? "medium",
      (variant.overlayFilter as import("../../services/ai.service.js").ImageFilter | undefined) ?? "none",
      variant.overlayFont ?? undefined,
      undefined,
      variant.overlayTitleColor1 ?? undefined,
      variant.businessId ?? undefined,
      variant.userId ?? undefined,
      variant.overlayTitleColor2 ?? undefined,
      variant.overlaySignatureText ?? undefined,
      variant.overlayShowSignature === "true",
      variant.overlayCustomLogoUrl ?? undefined,
      undefined,
      postCheck.contentType ?? undefined,
      variant.overlayFont2 ?? undefined,
    );
  }

  const [updated] = await db.update(imageVariantsTable)
    .set({
      rawBackground: rotatedBase64,
      imageData: newImageData,
    })
    .where(eq(imageVariantsTable.id, variantId))
    .returning();

  return res.json(updated);
});

// POST /posts/:id/evaluate-caption
// Asks the AI to score the current caption (1-10) and return 2-3 concrete improvement suggestions.
// This is non-destructive — it never modifies the caption, only gives feedback.
router.post("/:id/evaluate-caption", async (req, res) => {
  const postId = Number(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

  const post = await getTenantPost(postId, req);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });
  if (!post.caption?.trim()) return res.status(400).json({ error: "El post no tiene caption para evaluar" });

  const evalUserId = post.userId ?? req.user!.userId;
  const evalBizId  = post.businessId ?? undefined;
  const result = await evaluateCaptionImprovements(post.caption, post.platform, post.contentType, evalUserId, evalBizId);
  return res.json(result);
});

// POST /posts/:id/retheme
// Completely rewrites the caption of a post around a new topic provided by the user.
// Body: { topic: string } — a brief description of the new subject matter.
// Generates a fresh caption using the brand template + performance learning,
// previews it in the response and updates the post in DB so the user can review it.
router.post("/:id/retheme", async (req, res) => {
  const postId = Number(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

  const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
  if (!topic) return res.status(400).json({ error: "Debes indicar el nuevo tema para el post." });
  if (topic.length > 500) return res.status(400).json({ error: "El tema no puede superar 500 caracteres." });

  const post = await getTenantPost(postId, req);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });

  const rethemeBizId = await getActiveBusinessId(req.user!.userId);
  const { caption } = await rethemeCaption(topic, post.platform ?? "instagram", post.contentType ?? "image", req.user!.userId, rethemeBizId ?? undefined);
  if (!caption?.trim()) return res.status(500).json({ error: "La IA no pudo generar un caption. Intenta de nuevo." });

  const cond = tenantPostCond(postId, req);
  await db.update(postsTable).set({ caption, updatedAt: new Date() }).where(cond);

  return res.json({ caption });
});

// POST /posts/fix-portrait-logos — re-applies overlays on all portrait-format (reel/story)
// scheduled posts using the corrected Instagram safe-zone logo positioning.
router.post("/fix-portrait-logos", async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const scheduled = await db
    .select()
    .from(postsTable)
    .where(inArray(postsTable.status, ["scheduled", "pending_approval"]));

  const portraitPosts = scheduled.filter(p =>
    p.contentType === "reel" || p.contentType === "story"
  );

  let fixed = 0;
  const errors: string[] = [];

  for (const post of portraitPosts) {
    try {
      const variants = await db
        .select()
        .from(imageVariantsTable)
        .where(eq(imageVariantsTable.postId, post.id));

      for (const variant of variants) {
        if (!variant.rawBackground) continue;

        // Re-apply overlays with the corrected safe-zone positioning
        const newImageData = await applyOverlays(
          variant.rawBackground,
          "top-right",
          "white",
          undefined,
          (variant.style ?? "cinema") as TextStyle,
          "bottom",
          "medium",
          "none",
          undefined,
          undefined,
          undefined,
          post.businessId ?? undefined,
          post.userId ?? undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          post.contentType ?? undefined
        );

        await db
          .update(imageVariantsTable)
          .set({ imageData: newImageData })
          .where(eq(imageVariantsTable.id, variant.id));
      }
      fixed++;
    } catch (err: unknown) {
      errors.push(`Post #${post.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.json({ fixed, total: portraitPosts.length, errors });
});

// POST /posts/fix-portrait-ratio
// Crops all portrait Instagram-bound image variants from 9:16 → 4:5 (1024×1280)
// and re-applies overlays. Safe to run multiple times — skips already-4:5 images.
router.post("/fix-portrait-ratio", async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const posts = await db
    .select()
    .from(postsTable)
    .where(inArray(postsTable.status, ["scheduled", "pending_approval"]));

  // Only Instagram-bound portrait content needs the ratio fix
  const targetPosts = posts.filter(p =>
    shouldCropTo4by5(p.contentType ?? "", p.platform ?? "")
  );

  let fixed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const post of targetPosts) {
    try {
      const variants = await db
        .select()
        .from(imageVariantsTable)
        .where(eq(imageVariantsTable.postId, post.id));

      for (const variant of variants) {
        if (!variant.rawBackground) { skipped++; continue; }

        // Crop rawBackground to 4:5 (no-op if already 4:5)
        const croppedBg = await cropTo4by5(variant.rawBackground);

        // Re-apply overlays on the (now 4:5) background
        const newImageData = await applyOverlays(
          croppedBg,
          "top-right",
          "white",
          undefined,
          (variant.style ?? "cinema") as TextStyle,
          "bottom",
          "medium",
          "none",
          undefined,
          undefined,
          undefined,
          post.businessId ?? undefined,
          post.userId ?? undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          post.contentType ?? undefined
        );

        await db
          .update(imageVariantsTable)
          .set({ rawBackground: croppedBg, imageData: newImageData })
          .where(eq(imageVariantsTable.id, variant.id));

        fixed++;
      }
    } catch (err: unknown) {
      errors.push(`Post #${post.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.json({
    fixed,
    skipped,
    total: targetPosts.length,
    errors,
    message: `${fixed} variante(s) convertida(s) a 4:5. ${skipped} omitida(s) (sin rawBackground).`,
  });
});

// GET /posts/:id/video — returns a presigned download URL for the reel video of this post
// The video is already stored in object storage (no re-generation needed).
router.get("/:id/video", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const post = await getTenantPost(id, req);
  if (!post) { res.status(404).json({ error: "Post no encontrado" }); return; }

  // Find the variant with a reel video (reelObjectPath set)
  const variants = await db
    .select({ id: imageVariantsTable.id, reelObjectPath: imageVariantsTable.reelObjectPath })
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.postId, id));

  const reelVariant = variants.find(v => v.reelObjectPath);
  if (!reelVariant?.reelObjectPath) {
    res.status(404).json({ error: "No hay video disponible para este post" });
    return;
  }

  try {
    const { ObjectStorageService } = await import("../../lib/objectStorage.js");
    const storage = new ObjectStorageService();
    // Presigned URL valid for 1 hour — enough for any download
    const url = await storage.getObjectEntityGetURL(reelVariant.reelObjectPath, 3600);
    res.json({ ok: true, url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// GET /posts/:id/image — serve the selected image variant as JPEG for download/preview
router.get("/:id/image", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).send("ID inválido"); return; }

  const post = await getTenantPost(id, req);
  if (!post) { res.status(404).send("Post no encontrado"); return; }

  const variants = await db.select().from(imageVariantsTable).where(eq(imageVariantsTable.postId, id));
  const selected = variants.find(v => v.id === post.selectedImageVariant) ?? variants[0];
  if (!selected?.imageData) { res.status(404).send("Imagen no disponible"); return; }

  const buf = Buffer.from(selected.imageData, "base64");
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Disposition", `attachment; filename="eco-post-${id}.jpg"`);
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

// GET /posts/:id/image/:slideIndex — serve a specific carousel slide (0-based index) as JPEG
router.get("/:id/image/:slideIndex", async (req, res) => {
  const id = Number(req.params.id);
  const slideIndex = Number(req.params.slideIndex);
  if (isNaN(id) || isNaN(slideIndex)) { res.status(400).send("ID o índice inválido"); return; }

  const postCheck = await getTenantPost(id, req);
  if (!postCheck) { res.status(404).send("Post no encontrado"); return; }

  const variants = await db
    .select()
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.postId, id))
    .orderBy(imageVariantsTable.variantIndex);

  const slide = variants[slideIndex];
  if (!slide?.imageData) { res.status(404).send("Slide no disponible"); return; }

  const buf = Buffer.from(slide.imageData, "base64");
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Disposition", `attachment; filename="eco-post-${id}-slide${slideIndex + 1}.jpg"`);
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

// POST /posts/block-day
// Creates a "manually published" placeholder for a given date so the scheduler
// treats that day as already occupied and won't generate a new post for it.
router.post("/block-day", async (req, res) => {
  const { date, platform } = req.body as { date?: string; platform?: string };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Formato de fecha inválido. Usa YYYY-MM-DD" });
    return;
  }
  const plat = platform ?? "both";
  // Store at 17:00 UTC = 12:00 Bogotá so it occupies the noon feed slot
  const scheduledAt = new Date(`${date}T17:00:00.000Z`);
  const blockBizId = await getActiveBusinessId(req.user!.userId);
  const blockUserId = req.user!.userId;
  const post = await db.transaction(async tx => {
    const postNumber = blockBizId != null ? await nextPostNumberInTx(tx, blockBizId) : null;
    const [inserted] = await tx.insert(postsTable).values({
      platform: plat,
      contentType: "image",
      caption: "📌 Publicado manualmente (fuera de la plataforma)",
      hashtags: "",
      hashtagsTiktok: "",
      status: "published",
      scheduledAt,
      slideCount: 1,
      nicheId: null,
      userId: blockUserId,
      businessId: blockBizId ?? undefined,
      postNumber,
    }).returning();
    return inserted;
  });

  if (!post) { res.status(500).json({ error: "Error creando el marcador" }); return; }

  await db.insert(publishLogTable).values({
    postId: post.id,
    platform: plat,
    status: "published",
    source: "manual",
    userId: req.user!.userId,
  }).catch(() => {});

  res.json({ ok: true, postId: post.id });
});

// POST /posts/create-manual
// Creates a post with user-supplied caption + DALL-E image prompt.
// The caption is used as-is (no AI rewrite). Image is generated in the background
// using the user's exact prompt, with the ECO logo overlay applied on top.
router.post("/create-manual", requireEmailVerified, async (req, res) => {
  const { caption, imagePrompt, platform, contentType } = req.body as {
    caption?: string;
    imagePrompt?: string;
    platform?: string;
    contentType?: string;
  };

  if (!caption?.trim()) {
    res.status(400).json({ error: "El caption es obligatorio" });
    return;
  }
  if (!platform || !["instagram", "tiktok", "facebook", "both"].includes(platform)) {
    res.status(400).json({ error: "Plataforma inválida. Usa: instagram, tiktok, facebook, both" });
    return;
  }
  const type = contentType && ["image", "reel", "carousel", "story"].includes(contentType) ? contentType : "image";
  const manualUserId = req.user!.userId;
  const willGenerateImage = Boolean(imagePrompt?.trim());

  // Find next available slot (checks slots up to 120 days ahead to avoid duplicates)
  const MAX_SEARCH_DAYS = 120;
  const FEED_HOURS_UTC = [13, 17, 23]; // 8am, 12pm, 6pm Bogotá
  let scheduledAt: Date | null = null;
  const searchFrom = new Date();
  for (let dayOffset = 0; dayOffset <= MAX_SEARCH_DAYS && !scheduledAt; dayOffset++) {
    for (const utcHour of FEED_HOURS_UTC) {
      const candidate = new Date(searchFrom);
      candidate.setUTCDate(searchFrom.getUTCDate() + dayOffset);
      candidate.setUTCHours(utcHour, 0, 0, 0);
      if (candidate <= searchFrom) continue;
      // Check if slot is already taken for this tenant
      const isAdminUser = req.user!.role === "admin";
      const slotUserCond = isAdminUser ? undefined : eq(postsTable.userId, req.user!.userId);
      const existing = await db
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(and(
          eq(postsTable.scheduledAt, candidate),
          eq(postsTable.platform, platform),
          inArray(postsTable.status, ["pending_approval", "scheduled", "approved", "published"]),
          slotUserCond
        ))
        .limit(1);
      if (existing.length === 0) { scheduledAt = candidate; break; }
    }
  }
  if (!scheduledAt) scheduledAt = getNextOptimalSlot();

  // Extract first non-empty line for the image hook overlay
  const captionHook = caption.trim().split(/\n/).map(l => l.replace(/^[\p{Emoji}\s]+/u, "").trim()).find(l => l.length > 5)?.slice(0, 120) ?? caption.trim().slice(0, 80);
  const manualBizId = await getActiveBusinessId(manualUserId);

  // If image will be generated, credit check + deduction runs inside the same DB
  // transaction as the post insert — guaranteeing atomicity. If insufficient credits,
  // the transaction throws with code "INSUFFICIENT_CREDITS" and rolls back.
  let post: { id: number } | undefined;
  try {
    post = await db.transaction(async tx => {
      if (willGenerateImage) {
        await checkAndDeductCreditsInTx(tx, manualUserId, type);
      }
      const postNumber = manualBizId != null ? await nextPostNumberInTx(tx, manualBizId) : null;
      const [inserted] = await tx.insert(postsTable).values({
        platform,
        contentType: type,
        caption: caption.trim(),
        hashtags: "",
        hashtagsTiktok: "",
        status: "pending_approval",
        scheduledAt,
        slideCount: 1,
        nicheId: null,
        userId: manualUserId,
        businessId: manualBizId ?? undefined,
        postNumber,
      }).returning({ id: postsTable.id });
      return inserted;
    });
  } catch (txErr) {
    const err = txErr as { code?: string; creditsHad?: number; cost?: number };
    if (err.code === "INSUFFICIENT_CREDITS") {
      res.status(402).json({
        error: `Créditos insuficientes. Tienes ${err.creditsHad ?? 0} crédito${(err.creditsHad ?? 0) !== 1 ? "s" : ""} pero este tipo cuesta ${err.cost ?? 1} crédito${(err.cost ?? 1) !== 1 ? "s" : ""}.`,
        creditsRemaining: err.creditsHad ?? 0,
        plan: req.user!.plan,
      });
      return;
    }
    throw txErr;
  }

  if (!post) { res.status(500).json({ error: "Error creando el post" }); return; }

  res.status(201).json({
    postId: post.id,
    scheduledAt,
    imagesGenerating: willGenerateImage,
  });

  // Record DALL-E prompt intent as a learning signal whenever it was provided,
  // regardless of whether generation proceeds. The user's visual intent is meaningful
  // even when generation is skipped (e.g., no credits at the time).
  if (imagePrompt?.trim()) {
    void recordVisualSignal({
      userId: manualUserId,
      businessId: manualBizId ?? null,
      postId: post.id,
      signalType: "manual_prompt",
      imageDescription: imagePrompt.trim().slice(0, 500),
    });
  }

  // Generate image in background if prompt was provided (credit already deducted atomically above)
  // Signal already recorded above — here we just queue the DALL-E generation.
  if (willGenerateImage && imagePrompt?.trim()) {
    generateImagesForPostsBg([{
      postId: post.id,
      nicheContextShort: "manual post",
      captionHook,
      contentType: type,
      styleIdx: 0,
      slideCount: 1,
      platform,
      customImagePrompt: imagePrompt.trim(),
    }]).catch(err => console.error("[create-manual] image error:", err));
  }
});

// POST /posts/:id/mark-manual
/**
 * PATCH /posts/:id/variants/:variantId/apply-elements
 *
 * Applies element composition layers onto a variant's rawBackground,
 * re-applies existing text/logo overlays, and saves the new imageData.
 * Stores element configs in overlay_element_configs.
 */
router.patch("/:id/variants/:variantId/apply-elements", requireEmailVerified, async (req, res) => {
  const postId = Number(req.params.id);
  const variantId = Number(req.params.variantId);
  if (isNaN(postId) || isNaN(variantId)) return res.status(400).json({ error: "IDs inválidos" });

  const postCheck = await getTenantPost(postId, req);
  if (!postCheck) return res.status(404).json({ error: "Post no encontrado" });

  const [variant] = await db.select().from(imageVariantsTable).where(
    and(eq(imageVariantsTable.id, variantId), eq(imageVariantsTable.postId, postId))
  );
  if (!variant) return res.status(404).json({ error: "Variante no encontrada" });
  if (variant.mimeType?.startsWith("video/")) {
    return res.status(400).json({ error: "No se pueden aplicar elementos a variantes de video" });
  }

  const rawBg = variant.rawBackground ?? variant.imageData;
  if (!rawBg) return res.status(400).json({ error: "La variante no tiene imagen de fondo" });

  const uid = req.user!.userId;
  const bizId = variant.businessId;
  // Strict guard: elements are always scoped to a business — reject variants without one
  if (!bizId) return res.status(400).json({ error: "La variante no tiene negocio asignado — no se pueden aplicar elementos" });

  const {
    elements: elementConfigs = [],
    skipLogo = false,
    skipText = false,
  } = req.body as {
    elements?: { elementId: number; position: string; sizePercent: number }[];
    skipLogo?: boolean;
    skipText?: boolean;
  };

  if (elementConfigs.length > 5) {
    return res.status(400).json({ error: "Máximo 5 elementos por imagen", code: "element_layer_limit" });
  }

  // Resolve element images from object storage (verify ownership with strict bizId)
  const resolvedElements: { elementId: number; position: ElementPosition; sizePercent: number; buffer: Buffer }[] = [];
  if (elementConfigs.length > 0) {
    const ids = elementConfigs.map(e => e.elementId);
    const dbElements = await db.select().from(businessElementsTable).where(
      and(inArray(businessElementsTable.id, ids), eq(businessElementsTable.userId, uid), eq(businessElementsTable.businessId, bizId))
    );
    const elMap = new Map(dbElements.map(e => [e.id, e]));
    for (const cfg of elementConfigs) {
      const dbEl = elMap.get(cfg.elementId);
      if (!dbEl) continue;
      try {
        const file = await _storage.getObjectEntityFile(dbEl.storageKey);
        const dl = await _storage.downloadObject(file);
        const buf = Buffer.from(await dl.arrayBuffer());
        resolvedElements.push({ elementId: cfg.elementId, position: cfg.position as ElementPosition, sizePercent: cfg.sizePercent, buffer: buf });
      } catch {
        /* skip element if storage fails */
      }
    }
  }

  // Apply ONLY elements on rawBackground — logo and text are handled later by applyOverlays
  const composedBg = await applyCompositionLayers(rawBg, {
    logo: { enabled: false },
    text: { enabled: false },
    elements: resolvedElements,
  });

  // Re-apply existing text/logo overlays to get the final imageData
  // skipLogo=true → pass undefined for bizId and customLogoUrl (no logo drawn)
  // skipText=true → pass undefined for captionHook (no text drawn)
  const newImageData = await applyOverlays(
    composedBg,
    (variant.overlayLogoPosition as LogoPosition | undefined) ?? "top-right",
    (variant.overlayLogoColor as LogoColor | undefined) ?? "white",
    skipText ? undefined : (variant.overlayCaptionHook ?? undefined),
    (variant.overlayTextStyle as TextStyle | undefined) ?? "cinema",
    (variant.overlayTextPosition as TextPosition | undefined) ?? "bottom",
    variant.overlayTextSize ?? "medium",
    (variant.overlayFilter as ImageFilter | undefined) ?? "none",
    variant.overlayFont ?? undefined,
    undefined,
    variant.overlayTitleColor1 ?? undefined,
    skipLogo ? undefined : (bizId ?? undefined),
    uid,
    variant.overlayTitleColor2 ?? undefined,
    variant.overlaySignatureText ?? undefined,
    variant.overlayShowSignature === "true",
    skipLogo ? undefined : (variant.overlayCustomLogoUrl ?? undefined),
    undefined,
    variant.overlayFont2 ?? undefined,
  );

  const [updated] = await db.update(imageVariantsTable)
    .set({
      imageData: newImageData,
      overlayElementConfigs: elementConfigs.length > 0 ? elementConfigs : null,
    })
    .where(eq(imageVariantsTable.id, variantId))
    .returning();

  return res.json({ imageData: newImageData, variant: updated });
});

// ── Generate with element (IA integra el elemento) ────────────────────────────────────────────────
/**
 * POST /:id/generate-with-element
 *
 * Genera una nueva variante de imagen para el post usando gpt-image-1 (multimodal edit).
 * El elemento de marca actúa como referencia visual; la IA lo integra en la escena.
 *
 * Guard de plan: capsFromSnapshot(lockedPlanConfig, liveCaps).elementAiEnabled = true.
 * Costo de créditos: credit_cost_element_ai (default 3 cr) + credit_cost_image (1 cr) = 4 cr total.
 * Costo de generación: $0.040 USD — sumado a posts.generation_cost_usd al completar.
 */
router.post("/:id/generate-with-element", requireEmailVerified, async (req, res) => {
  const postId = Number(req.params.id);
  if (isNaN(postId)) return res.status(400).json({ error: "ID inválido" });

  const post = await getTenantPost(postId, req);
  if (!post) return res.status(404).json({ error: "Post no encontrado" });

  const uid = req.user!.userId;

  // ── Verificar plan (snapshot-based) ──────────────────────────────────────────
  const [sub] = await db
    .select({ planKey: subscriptionsTable.planKey, lockedPlanConfig: subscriptionsTable.lockedPlanConfig })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, uid), eq(subscriptionsTable.status, "active")))
    .limit(1);

  const [planRow] = await db
    .select({ elementAiEnabled: plansTable.elementAiEnabled })
    .from(plansTable)
    .where(eq(plansTable.key, sub?.planKey ?? ""))
    .limit(1);

  const liveCaps = buildPlanSnapshot({
    creditsPerMonth: 0,
    bulkMaxPosts: 0,
    allowedContentTypes: [],
    businessesAllowed: 1,
    reelsPerMonth: 0,
    elementAiEnabled: planRow?.elementAiEnabled ?? false,
  });
  const caps = capsFromSnapshot(sub?.lockedPlanConfig ?? null, liveCaps);
  if (!caps.elementAiEnabled) {
    return res.status(403).json({
      error: "Tu plan actual no incluye 'IA integra el elemento'. Actualiza tu plan para usar esta función.",
      code: "element_ai_not_allowed",
    });
  }

  // ── Extraer y tipar parámetros del body ──────────────────────────────────────
  const { elementId, skipLogo = false, skipText = false } = req.body as {
    elementId: number;
    skipLogo?: boolean;
    skipText?: boolean;
  };
  const captionHook        = req.body.captionHook as string | undefined;
  const style              = (req.body.style        ?? "photorealistic") as "photorealistic" | "graphic" | "infographic";
  const logoPosition       = (req.body.logoPosition ?? "top-right")      as LogoPosition;
  const logoColor          = (req.body.logoColor    ?? "white")           as LogoColor;
  const textStyle          = (req.body.textStyle    ?? "cinema")          as TextStyle;
  const textPosition       = (req.body.textPosition ?? "bottom")          as TextPosition;
  const textSize           = (req.body.textSize     ?? "medium")          as string;
  const imageFilter        = (req.body.imageFilter  ?? "none")            as ImageFilter;

  if (!elementId || isNaN(Number(elementId))) {
    return res.status(400).json({ error: "elementId es requerido" });
  }

  // ── Verificar businessId del post ─────────────────────────────────────────────
  const [postRow] = await db
    .select({ businessId: postsTable.businessId, nicheId: postsTable.nicheId, contentType: postsTable.contentType, platform: postsTable.platform })
    .from(postsTable)
    .where(eq(postsTable.id, postId))
    .limit(1);
  const bizId = postRow?.businessId;
  if (!bizId) return res.status(400).json({ error: "El post no tiene negocio asignado" });

  // ── Cargar elemento (verificar propiedad: userId + businessId) ────────────────
  const [dbElement] = await db
    .select()
    .from(businessElementsTable)
    .where(and(
      eq(businessElementsTable.id, Number(elementId)),
      eq(businessElementsTable.userId, uid),
      eq(businessElementsTable.businessId, bizId),
    ))
    .limit(1);
  if (!dbElement) return res.status(404).json({ error: "Elemento no encontrado o no pertenece a este negocio" });
  if (dbElement.analysisStatus === "pending") {
    return res.status(400).json({ error: "El análisis del elemento está pendiente. Espera a que finalice antes de usar IA integra el elemento.", code: "element_pending" });
  }

  // ── Cargar buffer del elemento desde Object Storage ───────────────────────────
  let elementBuffer: Buffer;
  try {
    const file = await _storage.getObjectEntityFile(dbElement.storageKey);
    const dl = await _storage.downloadObject(file);
    elementBuffer = Buffer.from(await dl.arrayBuffer());
  } catch {
    return res.status(500).json({ error: "No se pudo cargar el elemento desde almacenamiento" });
  }

  // ── Obtener contexto de nicho y industryGroupSlug ─────────────────────────────
  const [bizRow] = await db
    .select({ industryGroupSlug: businessesTable.industryGroupSlug, industry: businessesTable.industry })
    .from(businessesTable)
    .where(eq(businessesTable.id, bizId))
    .limit(1);

  let nicheContext = bizRow?.industry ?? "";
  if (postRow?.nicheId) {
    const [niche] = await db.select({ name: nichesTable.name }).from(nichesTable).where(eq(nichesTable.id, postRow.nicheId)).limit(1);
    if (niche?.name) nicheContext = niche.name;
  }
  const industryGroupSlug = bizRow?.industryGroupSlug ?? null;

  // ── Reservar créditos: deducción atómica upfront (base image + elementAi) ────
  // generate-with-element siempre genera exactamente 1 imagen, así que deducimos
  // base+elementAi juntos de forma atómica con UPDATE condicional (≥ totalCredits).
  const costs = await getCreditCosts();
  const totalCredits = costs.elementAi + costs.image;
  const deductResult = await db.execute(sql`
    UPDATE subscriptions
    SET credits_remaining = credits_remaining - ${totalCredits}
    WHERE id = (SELECT id FROM subscriptions WHERE user_id = ${uid} ORDER BY id DESC LIMIT 1)
      AND credits_remaining >= ${totalCredits}
  `);
  const creditDeducted = ((deductResult as unknown as { rowCount?: number }).rowCount ?? 0) > 0;
  if (!creditDeducted) {
    return res.status(402).json({
      error: `Créditos insuficientes para 'IA integra el elemento'. Necesitas ${totalCredits} créditos (${costs.image} base + ${costs.elementAi} element IA).`,
      code: "insufficient_credits",
    });
  }

  // ── Generar imagen ────────────────────────────────────────────────────────────
  let result: { imageData: string; rawBackground: string };
  try {
    result = await generateImageWithElement(
      elementBuffer,
      dbElement.analysis ?? undefined,
      nicheContext,
      style,
      postRow?.contentType ?? "post",
      uid,
      bizId,
      postRow?.platform ?? undefined,
      skipText ? undefined : captionHook,
      logoPosition,
      logoColor,
      textStyle,
      textPosition,
      textSize,
      imageFilter,
      undefined,    // accentColor — usar color de marca del negocio (cargado dentro de la fn)
      undefined,    // titleColor2
      undefined,    // brandTagline — resuelto internamente desde el perfil de marca
      undefined,    // showSignature — resuelto internamente
      undefined,    // overlayFont
      undefined,    // overlayFont2
      skipLogo,
    );
  } catch (err) {
    await refundCredits(uid, totalCredits);
    console.error("[generate-with-element] Error generando imagen:", err);
    return res.status(500).json({ error: "Error generando imagen con IA. Por favor intenta de nuevo." });
  }

  // ── Insertar variante en image_variants ──────────────────────────────────────
  // userId: estampado obligatorio para tenant-scoping (Regla 6, backgrounds-library-rules)
  // overlayElementConfigs: almacena elementId fuente para trazabilidad
  const [inserted] = await db.insert(imageVariantsTable).values({
    postId,
    userId:            uid,
    businessId:        bizId,
    industryGroupSlug,
    imageData:         result.imageData,
    rawBackground:     result.rawBackground,
    style:             "element_ai",
    mimeType:          "image/png",
    overlayLogoPosition: logoPosition,
    overlayLogoColor:    logoColor,
    overlayCaptionHook:  skipText ? null : (captionHook ?? null),
    overlayTextStyle:    textStyle,
    overlayTextPosition: textPosition,
    overlayTextSize:     textSize,
    overlayFilter:       imageFilter,
    overlayElementConfigs: [{ elementId: Number(elementId), position: "none", sizePercent: 0 }],
  }).returning();

  // ── Sumar costo de generación al post (Task #293 §5) ──────────────────────────
  const elementAiCostStr = estimateElementAICost().toFixed(4);
  await db.update(postsTable)
    .set({ generationCostUsd: sql`COALESCE(generation_cost_usd, 0) + ${elementAiCostStr}::numeric` })
    .where(eq(postsTable.id, postId));

  return res.status(201).json({ variant: inserted });
});

// Marks a post as manually published and creates a publish_log entry so it appears in the library
router.post("/:id/mark-manual", requireEmailVerified, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const post = await getTenantPost(id, req);
  if (!post) { res.status(404).json({ error: "Post no encontrado" }); return; }

  // Update post status
  const cond = tenantPostCond(id, req);
  await db.update(postsTable).set({ status: "published", scheduledAt: null }).where(cond);

  // Create publish_log entry with source=manual
  await db.insert(publishLogTable).values({
    postId: id,
    userId: req.user!.userId,
    platform: post.platform,
    status: "published",
    source: "manual",
  });

  res.json({ ok: true });
});

export default router;

