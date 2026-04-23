import { db } from "@workspace/db";
import { socialAccountsTable, appSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decryptToken } from "../lib/tokenEncryption.js";
import { notifyInstagramAuthError } from "./telegram.service.js";
import sharp from "sharp";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// ── Instagram caption character limit ─────────────────────────────────────────
// Re-exported from the central constants file — see skill instagram-caption-limits.
export { IG_CAPTION_LIMIT } from "../lib/socialLimits.js";
import { IG_CAPTION_LIMIT } from "../lib/socialLimits.js";

// ── Meta auth-error Telegram notification throttle ────────────────────────────
// Prevents sending repeated alerts when a batch of posts all fail with the same
// expired token. One alert per user every 24 hours at most.
const _authErrorAlertThrottle = new Map<number, number>(); // userId → last alert ms
const AUTH_ALERT_COOLDOWN_MS   = 24 * 60 * 60 * 1000;     // 24 hours

// Auth error pattern: Meta error codes #10 (permission) and #190 (invalid token)
const META_AUTH_ERROR_RE = /\(#10\)|\(#190\)|OAuthException/i;

/**
 * Checks if `errorMsg` contains a Meta auth error (#10 or #190) and sends a
 * Telegram alert to the user, throttled to once per 24 hours.
 * Uses a two-layer throttle: in-memory (fast path) + DB-backed (durable across
 * server restarts and consistent across multi-instance deployments).
 * Exported so that callers (e.g. scheduler) can use it with the full DB postId.
 */
export async function maybeNotifyMetaAuthError(
  userId: number | null | undefined,
  postId: number | null | undefined,
  errorMsg: string | null | undefined,
): Promise<void> {
  if (!userId || !errorMsg) return;
  if (!META_AUTH_ERROR_RE.test(errorMsg)) return;

  const now = Date.now();

  // Fast path: in-memory check avoids a DB round-trip for the common case
  const memLast = _authErrorAlertThrottle.get(userId) ?? 0;
  if (now - memLast < AUTH_ALERT_COOLDOWN_MS) return;

  // Durable path: read last-sent timestamp from DB for restart resilience
  const settingsKey = `meta_auth_alert_sent:${userId}`;
  try {
    const [row] = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, settingsKey));
    if (row) {
      const dbLast = parseInt(row.value, 10);
      if (!isNaN(dbLast) && now - dbLast < AUTH_ALERT_COOLDOWN_MS) {
        _authErrorAlertThrottle.set(userId, dbLast); // sync in-memory from DB
        return;
      }
    }
  } catch { /* DB error — fall through and send alert rather than suppress it */ }

  // Persist the new timestamp before sending (best-effort; non-fatal if it fails)
  _authErrorAlertThrottle.set(userId, now);
  try {
    await db
      .insert(appSettingsTable)
      .values({ key: settingsKey, value: String(now) })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: String(now) },
      });
  } catch { /* non-critical — alert is sent regardless */ }

  notifyInstagramAuthError(userId, postId ?? undefined).catch(() => {});
}

const GRAPH_API_BASE = "https://graph.facebook.com/v22.0";

// ── Temporary disk-based image store for Instagram publishing ─────────────────
// Instagram's crawlers have known issues with GCS signed URLs (complex query params,
// header mismatches). We serve images through our own public endpoint instead.
//
// Files are written to /tmp/instagram-temp/ so they survive server restarts.
// Each file uses the pattern: <uuid>.<expiryTimestampMs>
// This avoids any in-memory state and is resilient to deploys/restarts.
// Images expire after 2 hours and are cleaned up by a periodic sweep.
const TEMP_DIR = "/tmp/instagram-temp";

// Ensure the directory exists on startup (idempotent)
fs.mkdirSync(TEMP_DIR, { recursive: true });

function tempFilePath(id: string, expiry: number): string {
  return path.join(TEMP_DIR, `${id}.${expiry}`);
}

/** Locate the file for a given UUID regardless of its expiry suffix. */
function findTempFile(id: string): { filePath: string; expiry: number } | null {
  try {
    const entries = fs.readdirSync(TEMP_DIR);
    for (const entry of entries) {
      const [fileId, expiryStr] = entry.split(".");
      if (fileId === id) {
        return { filePath: path.join(TEMP_DIR, entry), expiry: Number(expiryStr) };
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function getTempImage(id: string): Buffer | null {
  const found = findTempFile(id);
  if (!found) return null;
  if (Date.now() > found.expiry) {
    try { fs.unlinkSync(found.filePath); } catch { /* ignore */ }
    return null;
  }
  try {
    return fs.readFileSync(found.filePath);
  } catch {
    return null;
  }
}

// Clean up expired temp images every 5 minutes
setInterval(() => {
  try {
    const now = Date.now();
    const entries = fs.readdirSync(TEMP_DIR);
    for (const entry of entries) {
      const parts = entry.split(".");
      const expiry = Number(parts[parts.length - 1]);
      if (!isNaN(expiry) && now > expiry) {
        try { fs.unlinkSync(path.join(TEMP_DIR, entry)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}, 5 * 60 * 1000);

// ── Dimension constants ────────────────────────────────────────────────────────
const STORY_W = 1080;
const STORY_H = 1920;
const FEED_W  = 1080;
const FEED_H  = 1080;

/**
 * Resizes a base64 image to the optimal dimensions for the given content type.
 * - story       → 1080 × 1920 (9:16 portrait, letterbox with black bars — preserves full content)
 * - reel        → 1080 × 1920 (9:16 portrait, crop-fill center — reels are video; image is thumbnail)
 * - image/other → 1080 × 1080 (1:1 square, crop-fill center)
 * Returns a new base64 string (JPEG).
 */
async function resizeForContentType(
  imageBase64: string,
  contentType: string | null | undefined,
): Promise<string> {
  try {
    const input = Buffer.from(imageBase64, "base64");

    if (contentType === "story") {
      // Letterbox: fit entire image in 1080×1920 with black bars on top/bottom (no content cropped)
      const resized = await sharp(input)
        .resize(STORY_W, STORY_H, {
          fit: "contain",
          position: "centre",
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .jpeg({ quality: 92 })
        .toBuffer();
      return resized.toString("base64");
    }

    // Reel thumbnail or regular image: crop-fill to correct canvas
    const targetW = contentType === "reel" ? STORY_W : FEED_W;
    const targetH = contentType === "reel" ? STORY_H : FEED_H;
    const resized = await sharp(input)
      .resize(targetW, targetH, { fit: "cover", position: "centre" })
      .jpeg({ quality: 92 })
      .toBuffer();
    return resized.toString("base64");
  } catch {
    // If resize fails for any reason, return original so publishing can still proceed
    return imageBase64;
  }
}

/**
 * Publishes a video reel to Instagram using the Reels API.
 * Requires a public video URL (presigned or CDN).
 */
export async function publishReelToInstagram(
  videoUrl: string,
  caption: string,
  hashtags: string,
  ownerUserId?: number | null,
  ownerBusinessId?: number | null,
): Promise<{ postId: string | null; postUrl: string | null; error: string | null; errorCode?: string }> {
  const account = await getInstagramAccount(ownerUserId, ownerBusinessId);
  if (!account?.accessToken || !account?.pageId) {
    return { postId: null, postUrl: null, error: "Cuenta de Instagram no configurada para este negocio — configura las credenciales en Configuración > Cuentas Sociales" };
  }
  const accessToken = decryptToken(account.accessToken);

  try {
    // Resolve IG Business Account ID — DB cache first, Meta API fallback
    const igId = await resolveIgUserId(account, accessToken);
    if (!igId) {
      return { postId: null, postUrl: null, errorCode: "instagram_not_linked", error: "[IG_NOT_LINKED] La página de Facebook conectada no tiene una cuenta de Instagram Business o Creadora vinculada. Ve a Configuración → Cuentas Sociales y reconecta tu cuenta." };
    }

    let fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;
    if (fullCaption.length > IG_CAPTION_LIMIT) {
      console.warn(`[IG SAFETY NET] publishReelToInstagram: caption truncated from ${fullCaption.length} to ${IG_CAPTION_LIMIT} chars (userId=${ownerUserId}, businessId=${ownerBusinessId}). Layers 1 & 2 did not catch this.`);
      fullCaption = fullCaption.slice(0, IG_CAPTION_LIMIT);
    }

    // Step 1: create Reel media container
    const reelRes = await fetch(`${GRAPH_API_BASE}/${igId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: fullCaption,
        share_to_feed: true,
        access_token: accessToken,
      }),
    });
    const reelData = await reelRes.json() as { id?: string; error?: { message: string } };
    if (!reelData.id || reelData.error) {
      return { postId: null, postUrl: null, error: reelData.error?.message || "Error creando contenedor de Reel en Instagram" };
    }

    // Step 2: poll until ready
    const pollErr = await pollContainerReady(reelData.id, accessToken);
    if (pollErr) return { postId: null, postUrl: null, error: pollErr };

    // Step 3: publish
    const publishRes = await fetch(`${GRAPH_API_BASE}/${igId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: reelData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
    if (!publishData.id || publishData.error) {
      return { postId: null, postUrl: null, error: publishData.error?.message || "Error publicando Reel en Instagram" };
    }

    return { postId: publishData.id, postUrl: `https://www.instagram.com/reel/${publishData.id}`, error: null };
  } catch (err) {
    return { postId: null, postUrl: null, error: `Error inesperado publicando Reel: ${err}` };
  }
}

/**
 * Fail-closed Instagram account lookup.
 * - userId null (with or without businessId) → null (ownership cannot be verified without userId)
 * - userId + businessId → AND filter — strictest; used in the publishing chain
 * - userId only (no businessId) → filter by userId alone — legacy / single-account path
 *
 * Prevents cross-business contamination when the same user owns multiple businesses
 * with different Instagram accounts (e.g. ECO biz=1 and HazPost biz=2, both userId=1).
 */
export async function getInstagramAccount(userId?: number | null, businessId?: number | null) {
  if (userId == null) {
    // Fail closed: without a userId we cannot verify ownership — return null regardless of businessId
    return null;
  }
  const platformCond = eq(socialAccountsTable.platform, "instagram");
  const cond = businessId != null
    ? and(platformCond, eq(socialAccountsTable.userId, userId), eq(socialAccountsTable.businessId, businessId))
    : and(platformCond, eq(socialAccountsTable.userId, userId));
  const [account] = await db.select().from(socialAccountsTable).where(cond);
  return account ?? null;
}

/**
 * Resolves the Instagram Business Account ID for a connected social account.
 * Priority: 1) DB cache (ig_user_id column), 2) Meta Graph API live lookup.
 * If the live lookup succeeds and the cache was empty, persists the ID to DB
 * so subsequent calls skip the API round-trip.
 * Returns null if neither source can provide the ID (page has no IG Business/Creator account).
 */
export async function resolveIgUserId(
  account: { id: number; igUserId?: string | null; pageId?: string | null },
  accessToken: string,
): Promise<string | null> {
  // 1. Use cached value from DB if present
  if (account.igUserId) return account.igUserId;
  // 2. Live lookup via Meta Graph API — delegates to resolveIgIdFromPageApi which
  // tries all three methods: instagram_business_account, connected_instagram_account,
  // and /{page_id}/instagram_accounts (Account Center fallback, 18 abr 2026).
  if (!account.pageId) return null;
  try {
    const igId = await resolveIgIdFromPageApi(account.pageId, accessToken);
    // ANTI-PATTERN: NUNCA escribir null en ig_user_id — si Meta no devuelve el IG,
    // preservar el valor ya guardado en DB. Solo actualizar cuando tengamos un ID real.
    if (igId) {
      await db.update(socialAccountsTable)
        .set({ igUserId: igId, updatedAt: new Date() })
        .where(eq(socialAccountsTable.id, account.id));
    }
    return igId;
  } catch {
    return null;
  }
}

/**
 * LOW-LEVEL helper: queries the Meta Graph API for the Instagram Business/Creator
 * Account ID linked to a Facebook Page.
 *
 * ALWAYS call this instead of doing an inline fetch with only instagram_business_account.
 * Meta has TWO ways users can link Instagram to a Facebook Page:
 *   1. instagram_business_account — linked via Page Settings (the "old" flow)
 *   2. connected_instagram_account — linked via Account Center (the "new" flow)
 *
 * Querying only one of the two fields silently fails for users who used the other path.
 * This function queries BOTH and returns whichever is present.
 *
 * Returns null on any error (network, token invalid, no IG linked) so callers can
 * decide whether to skip silently or surface an error.
 */
export async function resolveIgIdFromPageApi(
  pageId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account,connected_instagram_account&access_token=${accessToken}`
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      instagram_business_account?: { id: string };
      connected_instagram_account?: { id: string };
      error?: { message: string; code?: number };
    };
    if (data.error) return null;
    const igId = data.instagram_business_account?.id ?? data.connected_instagram_account?.id;
    if (igId) return igId;

    // Fallback: /{page_id}/instagram_accounts — catches Account Center connections
    // that don't surface in instagram_business_account or connected_instagram_account
    const accRes = await fetch(
      `${GRAPH_API_BASE}/${pageId}/instagram_accounts?access_token=${accessToken}`
    );
    if (!accRes.ok) return null;
    const accData = await accRes.json() as {
      data?: Array<{ id: string }>;
      error?: { message: string; code?: number };
    };
    if (accData.error || !accData.data?.length) return null;
    return accData.data[0].id;
  } catch {
    return null;
  }
}

/**
 * Writes the image to disk and returns a public URL served through our own API.
 *
 * Why not GCS signed URLs?
 * Meta/Instagram crawlers fail to fetch GCS signed URLs because they include
 * complex query params (X-Goog-Signature, X-Goog-Credential, etc.) that cause
 * mismatched headers and "Only photo or video can be accepted as media type" errors.
 * Serving through our own /api/media/temp/:id endpoint gives Instagram a clean,
 * reliable URL with proper Content-Type: image/jpeg headers.
 *
 * Files are stored on disk (/tmp/instagram-temp/) so they survive server restarts
 * and deployments — unlike the previous in-memory Map approach which lost images
 * when the server restarted mid-publish.
 *
 * Images expire automatically after 2 hours via the periodic disk cleanup sweep.
 */
export async function uploadImageAndGetPublicUrl(imageBase64: string): Promise<string | null> {
  try {
    if (!imageBase64) return null;
    const id = randomUUID();
    const expiry = Date.now() + 2 * 60 * 60 * 1000;
    const buffer = Buffer.from(imageBase64, "base64");
    if (buffer.length === 0) return null;
    fs.writeFileSync(tempFilePath(id, expiry), buffer);
    const appUrl = (process.env.APP_URL ?? "https://hazpost.app").replace(/\/$/, "");
    return `${appUrl}/api/media/temp/${id}`;
  } catch {
    return null;
  }
}

export async function testInstagramConnection(
  accessToken: string,
  pageId: string
): Promise<{ connected: boolean; instagramLinked: boolean; username: string | null; igId: string | null; message: string; canPublish?: boolean }> {
  try {
    // Check both instagram_business_account (Page Settings) and connected_instagram_account (Account Center)
    const response = await fetch(
      `${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account,connected_instagram_account&access_token=${accessToken}`
    );
    const data = await response.json() as {
      instagram_business_account?: { id: string };
      connected_instagram_account?: { id: string };
      error?: { message: string };
    };

    if (!response.ok || data.error) {
      return { connected: false, instagramLinked: false, username: null, igId: null, message: data.error?.message || "Error de conexión con Meta" };
    }

    let igAccountId = data.instagram_business_account?.id ?? data.connected_instagram_account?.id;

    // Fallback: /{page_id}/instagram_accounts — catches Account Center connections
    // not returned by instagram_business_account or connected_instagram_account
    if (!igAccountId) {
      try {
        const accRes = await fetch(
          `${GRAPH_API_BASE}/${pageId}/instagram_accounts?access_token=${accessToken}`
        );
        const accData = await accRes.json() as {
          data?: Array<{ id: string }>;
          error?: { message: string };
        };
        if (!accData.error && accData.data?.length) {
          igAccountId = accData.data[0].id;
        }
      } catch { /* ignore — treat as no IG linked */ }
    }

    if (!igAccountId) {
      return {
        connected: false,
        instagramLinked: false,
        username: null,
        igId: null,
        message: "Facebook conectado ✓, Instagram no detectado — asegúrate de que tu cuenta sea Business o Creadora y esté vinculada a tu Página de Facebook",
      };
    }

    const igRes = await fetch(
      `${GRAPH_API_BASE}/${igAccountId}?fields=username,permitted_tasks&access_token=${accessToken}`
    );
    const igData = await igRes.json() as { username?: string; permitted_tasks?: string[]; error?: { message: string } };

    // Check if the token has instagram_content_publish permission.
    // permitted_tasks includes "CREATE_CONTENT" when the token has publish rights.
    // If permitted_tasks is undefined (old API behavior), assume true to avoid false negatives.
    const canPublish = igData.permitted_tasks == null
      ? true
      : igData.permitted_tasks.includes("CREATE_CONTENT");

    const publishMsg = canPublish
      ? "Facebook ✓ · Instagram ✓ — Conexión exitosa"
      : "Facebook ✓ · Instagram ✓ (solo lectura) — El token NO tiene permiso de publicación (instagram_content_publish). Desconecta y vuelve a Autorizar con Meta para obtener el permiso.";

    return {
      connected: canPublish,
      instagramLinked: true,
      username: igData.username ?? null,
      igId: igAccountId,
      canPublish,
      message: publishMsg,
    };
  } catch {
    return { connected: false, instagramLinked: false, username: null, igId: null, message: "Error al conectar con Meta Graph API" };
  }
}

/**
 * Polls a media container until it is FINISHED, ERROR, or EXPIRED.
 * Returns null on success, or an error string on failure/timeout.
 */
async function pollContainerReady(
  containerId: string,
  accessToken: string,
  maxWaitMs = 90_000,
  pollIntervalMs = 5_000,
): Promise<string | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    const statusRes = await fetch(
      `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const statusData = await statusRes.json() as { status_code?: string; error?: { message: string } };
    if (statusData.error) return statusData.error.message;
    if (statusData.status_code === "FINISHED") return null;
    if (statusData.status_code === "ERROR" || statusData.status_code === "EXPIRED") {
      return `El contenedor de media falló con estado: ${statusData.status_code}`;
    }
  }
  return "Tiempo de espera agotado: Instagram no terminó de procesar la imagen (>90s)";
}

export async function publishToInstagram(
  imageBase64: string,
  caption: string,
  hashtags: string,
  carouselImages?: string[],       // all slide base64 images (ordered) — used for carousel posts
  locationId?: string | null,      // Instagram location ID for geo-tagging
  ownerUserId?: number | null,     // post owner's userId for tenant-scoped credential lookup
  contentType?: string | null,     // "image" | "carousel" | "story" | "reel"
  ownerBusinessId?: number | null, // post owner's businessId for strict per-business account isolation
): Promise<{ postId: string | null; postUrl: string | null; error: string | null; errorCode?: string }> {
  const account = await getInstagramAccount(ownerUserId, ownerBusinessId);
  if (!account?.accessToken || !account?.pageId) {
    return { postId: null, postUrl: null, error: "Cuenta de Instagram no configurada para este negocio — configura las credenciales en Configuración > Cuentas Sociales" };
  }

  const accessToken = decryptToken(account.accessToken);

  try {
    // Resolve IG Business Account ID — DB cache first, Meta API fallback
    const igId = await resolveIgUserId(account, accessToken);
    if (!igId) {
      return {
        postId: null,
        postUrl: null,
        errorCode: "instagram_not_linked",
        error: "[IG_NOT_LINKED] La página de Facebook conectada no tiene una cuenta de Instagram Business o Creadora vinculada. Ve a Configuración → Cuentas Sociales y reconecta tu cuenta.",
      };
    }

    let fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;
    if (fullCaption.length > IG_CAPTION_LIMIT) {
      console.warn(`[IG SAFETY NET] publishToInstagram: caption truncated from ${fullCaption.length} to ${IG_CAPTION_LIMIT} chars (userId=${ownerUserId}, businessId=${ownerBusinessId}). Layers 1 & 2 did not catch this.`);
      fullCaption = fullCaption.slice(0, IG_CAPTION_LIMIT);
    }
    const isCarousel = Array.isArray(carouselImages) && carouselImages.length > 1;

    // ── STORY PUBLISHING ───────────────────────────────────────────────────────
    // Instagram Stories use media_type=STORIES. Captions and locations are not
    // supported by the API for stories and are silently ignored.
    if (contentType === "story") {
      const storyImage = await resizeForContentType(imageBase64, "story");
      const imageUrl = await uploadImageAndGetPublicUrl(storyImage);
      if (!imageUrl) {
        return {
          postId: null, postUrl: null,
          error: "No se pudo subir la imagen al almacenamiento para la historia.",
        };
      }

      const storyRes = await fetch(`${GRAPH_API_BASE}/${igId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          media_type: "STORIES",
          access_token: accessToken,
        }),
      });
      const storyData = await storyRes.json() as { id?: string; error?: { message: string } };

      if (!storyData.id || storyData.error) {
        return {
          postId: null, postUrl: null,
          error: storyData.error?.message || "Error creando contenedor de historia en Instagram",
        };
      }

      const storyPollErr = await pollContainerReady(storyData.id, accessToken);
      if (storyPollErr) return { postId: null, postUrl: null, error: storyPollErr };

      const storyPublishRes = await fetch(`${GRAPH_API_BASE}/${igId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: storyData.id, access_token: accessToken }),
      });
      const storyPublishData = await storyPublishRes.json() as { id?: string; error?: { message: string } };

      if (!storyPublishData.id || storyPublishData.error) {
        return {
          postId: null, postUrl: null,
          error: storyPublishData.error?.message || "Error publicando historia en Instagram",
        };
      }

      return {
        postId: storyPublishData.id,
        postUrl: `https://www.instagram.com/stories/${storyPublishData.id}`,
        error: null,
      };
    }

    // ── CAROUSEL PUBLISHING ────────────────────────────────────────────────────
    if (isCarousel) {
      // Step 1: upload all slide images and create child media containers in parallel
      const slideResults = await Promise.all(
        carouselImages!.map(async (b64) => {
          const imageUrl = await uploadImageAndGetPublicUrl(b64);
          if (!imageUrl) return { error: "No se pudo subir una imagen al almacenamiento" } as { error: string };

          const res = await fetch(`${GRAPH_API_BASE}/${igId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: imageUrl,
              is_carousel_item: true,
              access_token: accessToken,
            }),
          });
          const data = await res.json() as { id?: string; error?: { message: string } };
          if (!data.id || data.error) {
            return { error: data.error?.message || "Error creando item de carrusel en Instagram" } as { error: string };
          }
          return { containerId: data.id };
        })
      );

      for (const r of slideResults) {
        if ("error" in r) return { postId: null, postUrl: null, error: r.error };
      }

      // Step 2: poll each child container until ready (sequential to avoid rate limits)
      for (const r of slideResults) {
        if (!("containerId" in r)) continue;
        const err = await pollContainerReady(r.containerId, accessToken);
        if (err) return { postId: null, postUrl: null, error: err };
      }

      const childIds = slideResults.map(r => ("containerId" in r ? r.containerId : ""));

      // Step 3: create the carousel container
      const carouselBody: Record<string, string> = {
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption: fullCaption,
        access_token: accessToken,
      };
      // Only pass real Facebook location IDs (custom: prefix = user-typed text, not a real ID)
      if (locationId && !locationId.startsWith("custom:") && !locationId.startsWith("osm:")) carouselBody.location_id = locationId;

      const carouselRes = await fetch(`${GRAPH_API_BASE}/${igId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(carouselBody),
      });
      const carouselData = await carouselRes.json() as { id?: string; error?: { message: string } };
      if (!carouselData.id || carouselData.error) {
        return {
          postId: null,
          postUrl: null,
          error: carouselData.error?.message || "Error creando contenedor de carrusel en Instagram",
        };
      }

      // Step 4: poll carousel container until ready
      const carouselErr = await pollContainerReady(carouselData.id, accessToken, 120_000);
      if (carouselErr) return { postId: null, postUrl: null, error: carouselErr };

      // Step 5: publish
      const publishRes = await fetch(`${GRAPH_API_BASE}/${igId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: carouselData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
      if (!publishData.id || publishData.error) {
        return { postId: null, postUrl: null, error: publishData.error?.message || "Error publicando carrusel en Instagram" };
      }
      return { postId: publishData.id, postUrl: `https://www.instagram.com/p/${publishData.id}`, error: null };
    }

    // ── SINGLE IMAGE PUBLISHING ────────────────────────────────────────────────
    const resizedImage = await resizeForContentType(imageBase64, contentType);
    const imageUrl = await uploadImageAndGetPublicUrl(resizedImage);
    if (!imageUrl) {
      return {
        postId: null,
        postUrl: null,
        error: "No se pudo subir la imagen al almacenamiento. Verifica que Object Storage esté configurado.",
      };
    }

    const singleBody: Record<string, string> = {
      image_url: imageUrl,
      caption: fullCaption,
      access_token: accessToken,
    };
    // Only pass real Facebook location IDs (custom: prefix = user-typed text, not a real ID)
    if (locationId && !locationId.startsWith("custom:") && !locationId.startsWith("osm:")) singleBody.location_id = locationId;

    const mediaRes = await fetch(`${GRAPH_API_BASE}/${igId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(singleBody),
    });
    const mediaData = await mediaRes.json() as { id?: string; error?: { message: string } };

    if (!mediaData.id || mediaData.error) {
      return {
        postId: null,
        postUrl: null,
        error: mediaData.error?.message || "Error creando media container en Instagram",
      };
    }

    const pollErr = await pollContainerReady(mediaData.id, accessToken);
    if (pollErr) return { postId: null, postUrl: null, error: pollErr };

    const publishRes = await fetch(`${GRAPH_API_BASE}/${igId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: mediaData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json() as { id?: string; error?: { message: string } };

    if (!publishData.id || publishData.error) {
      return {
        postId: null,
        postUrl: null,
        error: publishData.error?.message || "Error publicando en Instagram",
      };
    }

    return {
      postId: publishData.id,
      postUrl: `https://www.instagram.com/p/${publishData.id}`,
      error: null,
    };
  } catch (err) {
    return { postId: null, postUrl: null, error: `Error inesperado al publicar en Instagram: ${err}` };
  }
}
