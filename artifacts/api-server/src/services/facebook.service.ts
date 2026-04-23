import { uploadImageAndGetPublicUrl, getInstagramAccount } from "./instagram.service.js";
import { decryptToken } from "../lib/tokenEncryption.js";

const GRAPH_API_BASE = "https://graph.facebook.com/v22.0";

/**
 * Facebook Page uses the same Page Access Token and Page ID as Instagram.
 * The Instagram service already stores these under platform = "instagram".
 */
export async function getFacebookPageCredentials(ownerUserId?: number | null, ownerBusinessId?: number | null) {
  const account = await getInstagramAccount(ownerUserId, ownerBusinessId);
  if (!account?.accessToken || !account?.pageId) return null;
  return {
    accessToken: decryptToken(account.accessToken),
    pageId: account.pageId,
  };
}

export async function testFacebookConnection(ownerUserId?: number | null): Promise<{ connected: boolean; pageName: string | null; message: string }> {
  const creds = await getFacebookPageCredentials(ownerUserId);
  if (!creds) return { connected: false, pageName: null, message: "Credenciales de Instagram/Facebook no configuradas" };

  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${creds.pageId}?fields=name,fan_count&access_token=${creds.accessToken}`
    );
    const data = await res.json() as { name?: string; fan_count?: number; error?: { message: string } };
    if (!res.ok || data.error) {
      return { connected: false, pageName: null, message: data.error?.message || "Error al conectar con la Página de Facebook" };
    }
    return { connected: true, pageName: data.name ?? null, message: `Página "${data.name}" conectada (${data.fan_count ?? 0} seguidores)` };
  } catch {
    return { connected: false, pageName: null, message: "Error de red al verificar Facebook" };
  }
}

export async function publishToFacebook(
  imageBase64: string,
  caption: string,
  hashtags: string,
  carouselImages?: string[],       // all slide base64 images (ordered) — used for carousel posts
  locationId?: string | null,      // Facebook Page Place ID for geo-tagging
  ownerUserId?: number | null,     // post owner's userId for tenant-scoped credential lookup
  ownerBusinessId?: number | null, // post owner's businessId for strict per-business account isolation
): Promise<{ postId: string | null; postUrl: string | null; error: string | null }> {
  const creds = await getFacebookPageCredentials(ownerUserId, ownerBusinessId);
  if (!creds) {
    return { postId: null, postUrl: null, error: "Página de Facebook no configurada para este negocio — conecta Instagram Business primero" };
  }

  const isCarousel = Array.isArray(carouselImages) && carouselImages.length > 1;

  try {
    const fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;

    // ── CAROUSEL (multi-photo) PUBLISHING ─────────────────────────────────────
    if (isCarousel) {
      // Step 1: upload each slide as an unpublished photo to get media_fbids
      const photoIds: string[] = [];
      for (const b64 of carouselImages!) {
        const imageUrl = await uploadImageAndGetPublicUrl(b64);
        if (!imageUrl) {
          return { postId: null, postUrl: null, error: "No se pudo subir una imagen para Facebook" };
        }
        const photoRes = await fetch(`${GRAPH_API_BASE}/${creds.pageId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: imageUrl,
            published: false,
            access_token: creds.accessToken,
          }),
        });
        const photoData = await photoRes.json() as { id?: string; error?: { message: string } };
        if (!photoData.id || photoData.error) {
          const errMsg = photoData.error?.message || "Error subiendo foto a Facebook";
          if (errMsg.includes("pages_manage_posts") || errMsg.includes("(#200)")) {
            return { postId: null, postUrl: null, error: "SKIP:pages_manage_posts no aprobado — requiere App Review de Meta" };
          }
          return { postId: null, postUrl: null, error: errMsg };
        }
        photoIds.push(photoData.id);
      }

      // Step 2: publish a multi-photo post with all media IDs
      const carouselFeedBody: Record<string, unknown> = {
        message: fullCaption,
        attached_media: photoIds.map(id => ({ media_fbid: id })),
        access_token: creds.accessToken,
      };
      if (locationId) carouselFeedBody.place = locationId;

      const feedRes = await fetch(`${GRAPH_API_BASE}/${creds.pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(carouselFeedBody),
      });
      const feedData = await feedRes.json() as { id?: string; error?: { message: string } };
      if (!feedRes.ok || feedData.error) {
        const errMsg = feedData.error?.message || "Error publicando carrusel en Facebook";
        if (errMsg.includes("pages_manage_posts") || errMsg.includes("(#200)")) {
          return { postId: null, postUrl: null, error: "SKIP:pages_manage_posts no aprobado — requiere App Review de Meta" };
        }
        return { postId: null, postUrl: null, error: errMsg };
      }
      return {
        postId: feedData.id ?? null,
        postUrl: feedData.id ? `https://www.facebook.com/${feedData.id}` : null,
        error: null,
      };
    }

    // ── SINGLE IMAGE PUBLISHING ────────────────────────────────────────────────
    const imageUrl = await uploadImageAndGetPublicUrl(imageBase64);
    if (!imageUrl) {
      return { postId: null, postUrl: null, error: "No se pudo subir la imagen para Facebook" };
    }

    const singleBody: Record<string, string> = {
      url: imageUrl,
      message: fullCaption,
      access_token: creds.accessToken,
    };
    if (locationId) singleBody.place = locationId;

    const res = await fetch(`${GRAPH_API_BASE}/${creds.pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(singleBody),
    });

    const data = await res.json() as { id?: string; post_id?: string; error?: { message: string } };

    if (!res.ok || data.error) {
      const errMsg = data.error?.message || "Error publicando foto en Facebook";
      if (errMsg.includes("pages_manage_posts") || errMsg.includes("(#200)")) {
        return { postId: null, postUrl: null, error: "SKIP:pages_manage_posts no aprobado — requiere App Review de Meta" };
      }
      return { postId: null, postUrl: null, error: errMsg };
    }

    const fbPostId = data.post_id || data.id || null;
    return {
      postId: fbPostId,
      postUrl: fbPostId ? `https://www.facebook.com/permalink.php?story_fbid=${fbPostId.split("_")[1]}&id=${creds.pageId}` : null,
      error: null,
    };
  } catch (err) {
    return { postId: null, postUrl: null, error: `Error inesperado al publicar en Facebook: ${err}` };
  }
}
