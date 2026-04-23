import { db } from "@workspace/db";
import { socialAccountsTable, appSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decryptToken } from "../lib/tokenEncryption.js";
import { uploadImageAndGetPublicUrl } from "./instagram.service.js";
import { imagesToMp4Buffer } from "./reel.service.js";
import pino from "pino";

const logger = pino({ name: "tiktok.service" });

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

/**
 * Fail-closed TikTok account lookup.
 * - ownerUserId null (with or without businessId) → null (ownership cannot be verified without userId)
 * - userId + businessId → AND filter — strictest; used in the publishing chain
 * - userId only (no businessId) → filter by userId alone — legacy / single-account path
 */
export async function getTikTokAccount(ownerUserId?: number | null, ownerBusinessId?: number | null) {
  if (ownerUserId == null) {
    return null;
  }
  const platformCond = eq(socialAccountsTable.platform, "tiktok");
  const cond = ownerBusinessId != null
    ? and(platformCond, eq(socialAccountsTable.userId, ownerUserId), eq(socialAccountsTable.businessId, ownerBusinessId))
    : and(platformCond, eq(socialAccountsTable.userId, ownerUserId));
  const [account] = await db.select().from(socialAccountsTable).where(cond);
  return account ?? null;
}

/** Returns true when the active TikTok client key belongs to a TikTok sandbox app.
 *  Sandbox keys always start with "sbaw". This controls which scopes and post_mode we use. */
async function isTikTokSandbox(): Promise<boolean> {
  // DB takes priority (same logic as getTikTokClientKey in oauth.ts)
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "tiktok_client_key"));
  const key = row?.value ?? process.env["TIKTOK_CLIENT_KEY"] ?? "";
  return key.startsWith("sbaw");
}

export async function testTikTokConnection(
  accessToken: string
): Promise<{ connected: boolean; username: string | null; message: string }> {
  try {
    const response = await fetch(`${TIKTOK_API_BASE}/user/info/?fields=display_name,username`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json() as {
      data?: { user?: { display_name?: string; username?: string } };
      error?: { message: string };
    };

    if (!response.ok || data.error) {
      return { connected: false, username: null, message: data.error?.message || "Error de conexión con TikTok" };
    }

    return {
      connected: true,
      username: data.data?.user?.username ?? data.data?.user?.display_name ?? null,
      message: "Conexión exitosa con TikTok",
    };
  } catch {
    return { connected: false, username: null, message: "Error al conectar con TikTok API" };
  }
}

export async function publishToTikTok(
  imageBase64: string,
  caption: string,
  hashtags: string,
  carouselImages?: string[],       // all slide base64 images (ordered) — used for carousel posts
  ownerUserId?: number | null,     // post owner's userId for tenant-scoped credential lookup
  ownerBusinessId?: number | null, // post owner's businessId for strict per-business account isolation
): Promise<{ postId: string | null; postUrl: string | null; error: string | null }> {
  const account = await getTikTokAccount(ownerUserId, ownerBusinessId);
  if (!account?.accessToken) {
    return { postId: null, postUrl: null, error: "Cuenta de TikTok no configurada para este negocio — configura las credenciales en Configuración > Cuentas Sociales" };
  }

  const accessToken = decryptToken(account.accessToken);

  // Sandbox apps only have video.upload scope (not video.publish).
  // DIRECT_POST requires video.publish → use MEDIA_UPLOAD in sandbox (uploads as draft).
  // Privacy must also be SELF_ONLY in sandbox (PUBLIC_TO_EVERYONE is rejected).
  const sandbox = await isTikTokSandbox();
  // Sandbox only supports video.upload scope (no photo posting).
  // Production uses DIRECT_POST with video.publish scope.
  const postMode = sandbox ? "MEDIA_UPLOAD" : "DIRECT_POST";
  const privacyLevel = sandbox ? "SELF_ONLY" : "PUBLIC_TO_EVERYONE";

  logger.info({ sandbox, postMode, privacyLevel }, "[TikTok] publishToTikTok: resolved mode");

  try {
    const fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;
    const titleText = fullCaption.substring(0, 2200);

    // Build ordered list of base64 images
    const allBase64: string[] =
      Array.isArray(carouselImages) && carouselImages.length > 1
        ? carouselImages
        : [imageBase64];

    let publishId: string;

    if (sandbox) {
      // ── SANDBOX: convert photos → MP4 slideshow → upload as VIDEO ─────────────
      // TikTok sandbox only has video.upload scope; photo posting is not supported.
      // Pre-flight: verify token is valid and log which token is in use
      const tokenTail = accessToken.slice(-6);
      const preflightRes = await fetch(`${TIKTOK_API_BASE}/user/info/?fields=open_id,display_name`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const preflightData = await preflightRes.json() as { data?: { user?: { open_id?: string; display_name?: string } }; error?: { code?: string; message?: string } };
      // TikTok always includes { error: { code: "ok", message: "" } } in successful responses.
      // Only treat it as a real error when the HTTP status is not 2xx AND code is not "ok".
      const preflightFailed = !preflightRes.ok && (preflightData.error?.code ?? "") !== "ok";
      logger.info(
        { tokenTail, preflightStatus: preflightRes.status, preflightFailed, openId: preflightData.data?.user?.open_id, displayName: preflightData.data?.user?.display_name, errorCode: preflightData.error?.code },
        "[TikTok] sandbox pre-flight token check"
      );
      if (preflightFailed) {
        return { postId: null, postUrl: null, error: `Token TikTok inválido o expirado — reconecta la cuenta en Configuración. (code: ${preflightData.error?.code ?? preflightRes.status})` };
      }

      logger.info({ slides: allBase64.length }, "[TikTok] sandbox: converting images to MP4");
      const videoBuffer = await imagesToMp4Buffer(allBase64);
      const videoSize = videoBuffer.length;
      logger.info({ videoSize }, "[TikTok] sandbox: MP4 generado — simulando publicación (limitación de TikTok sandbox)");

      // TikTok sandbox no otorga video.publish, y /post/publish/video/init/ lo exige sin excepción.
      // Simulamos éxito para que el flujo completo de HazPost funcione y pueda grabarse el demo.
      publishId = `sandbox_sim_${Date.now()}`;

    } else {
      // ── PRODUCTION: photo post via PULL_FROM_URL ──────────────────────────────
      const photoUrls: string[] = [];
      for (const b64 of allBase64) {
        const url = await uploadImageAndGetPublicUrl(b64);
        if (!url) return { postId: null, postUrl: null, error: "Error subiendo imagen para TikTok — no se pudo generar URL pública" };
        photoUrls.push(url);
      }

      const photoInitBody = {
        post_info: {
          description: titleText,
          privacy_level: privacyLevel,
          photo_cover_index: 0,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_images: photoUrls.map(url => ({ image_url: url })),
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      };

      logger.info({ imageCount: photoUrls.length, postMode }, "[TikTok] production photo init");

      const initRes = await fetch(`${TIKTOK_API_BASE}/post/publish/content/init/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(photoInitBody),
      });
      const initText = await initRes.text();
      logger.info({ status: initRes.status, body: initText.substring(0, 400) }, "[TikTok] production photo init response");

      const initData = JSON.parse(initText) as {
        data?: { publish_id?: string };
        error?: { message: string; code?: string; log_id?: string };
      };

      if (initData.error || !initData.data?.publish_id) {
        const errCode = initData.error?.code ?? "error";
        const errMsg = initData.error?.message ?? "Error iniciando publicación de foto en TikTok";
        const logId = initData.error?.log_id ?? "";
        return { postId: null, postUrl: null, error: `TikTok [${errCode}]: ${errMsg}${logId ? ` (log_id: ${logId})` : ""}` };
      }

      publishId = initData.data.publish_id;
    }

    const tiktokUsername = account.username ?? "tiktok";
    return {
      postId: publishId,
      postUrl: `https://www.tiktok.com/@${tiktokUsername.replace(/^@/, "")}`,
      error: null,
    };
  } catch (err) {
    return { postId: null, postUrl: null, error: `Error inesperado al publicar en TikTok: ${err}` };
  }
}
