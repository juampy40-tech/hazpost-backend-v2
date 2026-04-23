import { Router } from "express";
import { db } from "@workspace/db";
import { socialAccountsTable, appSettingsTable, businessesTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import type { Request } from "express";
import { UpdateSocialAccountBody, TestSocialAccountParams } from "@workspace/api-zod";
import { testInstagramConnection, resolveIgIdFromPageApi } from "../../services/instagram.service.js";
import { testTikTokConnection } from "../../services/tiktok.service.js";
import { testFacebookConnection } from "../../services/facebook.service.js";
import { encryptToken, decryptToken } from "../../lib/tokenEncryption.js";
import { requireAuth, requireAdmin } from "../../lib/auth.js";
import { checkAndRenewMetaToken } from "../../services/scheduler.service.js";
import { getActiveBusinessId } from "../../lib/businesses.js";
import { notifyLastAccountDisconnected } from "../../services/telegram.service.js";

const GRAPH_API_BASE = "https://graph.facebook.com/v20.0";

const router = Router();

const SAFE_FIELDS = {
  id: socialAccountsTable.id,
  platform: socialAccountsTable.platform,
  username: socialAccountsTable.username,
  connected: socialAccountsTable.connected,
  pageId: socialAccountsTable.pageId,
  tokenExpiresAt: socialAccountsTable.tokenExpiresAt,
  updatedAt: socialAccountsTable.updatedAt,
  businessId: socialAccountsTable.businessId,
};

/** Build the WHERE condition for the active user + active business */
async function tenantCond(req: Request) {
  const userId = req.user!.userId;
  const bizId = await getActiveBusinessId(userId);
  const userCond = eq(socialAccountsTable.userId, userId);
  if (bizId == null) return userCond;
  return and(userCond, eq(socialAccountsTable.businessId, bizId));
}

router.get("/", async (req, res) => {
  try {
    const cond = await tenantCond(req);
    const accounts = await db.select(SAFE_FIELDS).from(socialAccountsTable).where(cond);
    res.json(accounts);
  } catch {
    res.json([]);
  }
});

router.put("/", async (req, res) => {
  const body = UpdateSocialAccountBody.parse(req.body);
  const encryptedToken = body.accessToken ? encryptToken(body.accessToken) : undefined;

  const userId = req.user!.userId;
  const bizId = await getActiveBusinessId(userId);

  const platformCond = eq(socialAccountsTable.platform, body.platform);
  const userCond = eq(socialAccountsTable.userId, userId);
  const bizCond = bizId != null ? eq(socialAccountsTable.businessId, bizId) : userCond;
  const findCond = and(platformCond, userCond, bizCond);

  // Guard: page_id uniqueness — prevent the same Facebook Page from being linked to two
  // different businesses of the same user. This was the root cause of the bug where HazPost
  // posts published to ECO's Instagram (both had the same page_id=356577317549386).
  if (body.pageId && bizId != null) {
    const conflict = await db
      .select({ id: socialAccountsTable.id, businessId: socialAccountsTable.businessId })
      .from(socialAccountsTable)
      .where(and(
        eq(socialAccountsTable.userId, userId),
        eq(socialAccountsTable.platform, body.platform),
        eq(socialAccountsTable.pageId, body.pageId),
        ne(socialAccountsTable.businessId, bizId),
      ))
      .limit(1);
    if (conflict.length > 0) {
      res.status(409).json({
        error: `Este page_id ya está vinculado a otro negocio de tu cuenta. No se puede usar el mismo page_id para dos negocios distintos.`,
      });
      return;
    }
  }

  const existing = await db.select().from(socialAccountsTable).where(findCond);

  if (existing.length > 0) {
    const [account] = await db.update(socialAccountsTable).set({
      username: body.username,
      ...(encryptedToken ? { accessToken: encryptedToken } : {}),
      pageId: body.pageId,
      connected: "true",
      updatedAt: new Date(),
    }).where(findCond).returning(SAFE_FIELDS);
    res.json(account);
    return;
  }

  const [account] = await db.insert(socialAccountsTable).values({
    platform: body.platform,
    username: body.username,
    accessToken: encryptedToken ?? body.accessToken ?? "",
    pageId: body.pageId,
    connected: "true",
    userId,
    businessId: bizId,
  }).returning(SAFE_FIELDS);
  res.json(account);
});

router.post("/:platform/test", async (req, res) => {
  const { platform } = TestSocialAccountParams.parse({ platform: req.params.platform });
  const cond = await tenantCond(req);
  const platformCond = eq(socialAccountsTable.platform, platform);
  const [account] = await db.select().from(socialAccountsTable).where(and(platformCond, cond));

  if (!account?.accessToken) {
    res.json({ connected: false, message: "Cuenta no configurada. Por favor añade el token de acceso.", username: null });
    return;
  }

  const decryptedToken = decryptToken(account.accessToken);

  if (platform === "instagram") {
    const result = await testInstagramConnection(decryptedToken, account.pageId ?? "");
    // Only update ig_user_id when the live test found a POSITIVE result (non-null igId).
    // Never clear a manually-set ig_user_id based on a live API failure — Meta's API
    // is unreliable and may return null even when the account IS linked (e.g. Account Center
    // users, propagation delays). A null result from the test does NOT mean it's not linked.
    if (result.igId) {
      await db.update(socialAccountsTable)
        .set({ igUserId: result.igId, updatedAt: new Date() })
        .where(eq(socialAccountsTable.id, account.id));
    }
    res.json({
      connected: result.connected,
      instagramLinked: result.instagramLinked || !!account.igUserId,
      username: result.username,
      message: result.message,
    });
    return;
  }

  if (platform === "tiktok") {
    const result = await testTikTokConnection(decryptedToken);
    res.json(result);
    return;
  }

  if (platform === "facebook") {
    const userId = req.user!.userId;
    const result = await testFacebookConnection(userId);
    res.json({ connected: result.connected, username: result.pageName, message: result.message });
    return;
  }

  res.json({ connected: false, message: "Plataforma no reconocida", username: null });
});

/**
 * POST /social-accounts/meta/exchange-token
 * Accepts a short-lived user token from the API Explorer, exchanges it for a
 * long-lived page access token (~60 days), and saves it encrypted.
 */
router.post("/meta/exchange-token", async (req, res) => {
  const { userToken, pageId: chosenPageId } = req.body as { userToken?: string; pageId?: string };
  if (!userToken) {
    res.status(400).json({ success: false, error: "Se requiere el user token." });
    return;
  }

  const settings = await db.select().from(appSettingsTable);
  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  const appId     = settingsMap["meta_app_id"];
  const appSecret = settingsMap["meta_app_secret"];

  if (!appId || !appSecret) {
    res.status(400).json({ success: false, error: "Guarda primero el Meta App ID y App Secret en Configuración." });
    return;
  }

  const userId = req.user!.userId;
  const bizId = await getActiveBusinessId(userId);

  try {
    // 1. Exchange short-lived user token for long-lived user token (~60 days)
    const llRes = await fetch(
      `${GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(userToken)}`
    );
    const llData = await llRes.json() as { access_token?: string; expires_in?: number; error?: { message: string } };

    if (!llData.access_token || llData.error) {
      res.status(400).json({ success: false, error: llData.error?.message ?? "No se pudo canjear el token." });
      return;
    }

    const longLivedUserToken = llData.access_token;
    const expiresInSec = llData.expires_in ?? 5183944; // ~60 days

    // 2. Get page access tokens for all pages of this user.
    // Query BOTH instagram_business_account (Page Settings link) and
    // connected_instagram_account (Account Center link) — users may have used either.
    const pagesRes = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account,connected_instagram_account&access_token=${longLivedUserToken}`);
    const pagesData = await pagesRes.json() as { data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string }; connected_instagram_account?: { id: string } }> };
    const allPages = pagesData.data ?? [];

    if (allPages.length === 0) {
      res.status(400).json({ success: false, error: "No se encontró ninguna página asociada a esta cuenta." });
      return;
    }

    // Filter pages that have an Instagram account via either linking method
    const pagesWithIG = allPages.filter(p => p.instagram_business_account || p.connected_instagram_account);
    const candidates = pagesWithIG.length > 0 ? pagesWithIG : allPages;

    // If multiple candidates and user hasn't chosen yet → ask for selection
    if (candidates.length > 1 && !chosenPageId) {
      const pages = await Promise.all(
        candidates.map(async (p) => {
          // Prefer instagram_business_account; fall back to connected_instagram_account
          const igId = p.instagram_business_account?.id ?? p.connected_instagram_account?.id;
          let igUsername: string | undefined;
          if (igId) {
            try {
              const igRes = await fetch(
                `${GRAPH_API_BASE}/${igId}?fields=username&access_token=${p.access_token}`
              );
              const igData = await igRes.json() as { username?: string };
              if (igData.username) igUsername = `@${igData.username}`;
            } catch { /* ignore */ }
          }
          return { id: p.id, name: p.name, igUsername };
        })
      );
      res.json({ success: false, needsPageSelection: true, pages, userToken });
      return;
    }

    // Resolve the chosen page: if pageId was provided, it must match exactly
    if (chosenPageId) {
      const match = candidates.find(p => p.id === chosenPageId);
      if (!match) {
        res.status(400).json({ success: false, error: "La página seleccionada no es válida. Vuelve a intentarlo." });
        return;
      }
    }
    const connectedPage = chosenPageId ? candidates.find(p => p.id === chosenPageId)! : candidates[0];

    const pageToken   = connectedPage.access_token;
    const pageId      = connectedPage.id;
    const pageName    = connectedPage.name;
    const expiresAt   = new Date(Date.now() + expiresInSec * 1000);
    const encrypted   = encryptToken(pageToken);

    // 2b. Guard: page_id uniqueness across businesses.
    // Prevent the same Facebook Page from being linked to two different businesses of the same user.
    if (bizId != null) {
      for (const platform of ["instagram", "facebook"] as const) {
        const conflict = await db
          .select({ id: socialAccountsTable.id, businessId: socialAccountsTable.businessId })
          .from(socialAccountsTable)
          .where(and(
            eq(socialAccountsTable.userId, userId),
            eq(socialAccountsTable.platform, platform),
            eq(socialAccountsTable.pageId, pageId),
            ne(socialAccountsTable.businessId, bizId),
          ))
          .limit(1);
        if (conflict.length > 0) {
          res.status(409).json({
            success: false,
            error: `Este page_id ya está vinculado a otro negocio de tu cuenta (${platform}). Cada negocio debe usar una página de Facebook diferente.`,
          });
          return;
        }
      }
    }

    // 3. Upsert for both instagram and facebook — scoped to user + active business
    for (const platform of ["instagram", "facebook"] as const) {
      const platformCond = eq(socialAccountsTable.platform, platform);
      const userCond = eq(socialAccountsTable.userId, userId);
      const bizCond = bizId != null ? eq(socialAccountsTable.businessId, bizId) : userCond;
      const upsertCond = and(platformCond, userCond, bizCond);
      const existing = await db.select().from(socialAccountsTable).where(upsertCond);
      if (existing.length > 0) {
        await db.update(socialAccountsTable).set({
          accessToken: encrypted,
          pageId,
          connected: "true",
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        }).where(upsertCond);
      } else {
        const defaultUsername = platform === "facebook" ? pageName : `@${pageName.toLowerCase().replace(/\s+/g, "")}`;
        await db.insert(socialAccountsTable).values({
          platform,
          username: defaultUsername,
          accessToken: encrypted,
          pageId,
          connected: "true",
          tokenExpiresAt: expiresAt,
          userId,
          businessId: bizId,
        });
      }
    }

    // 4. Verify IG connection with new token — also updates the stored username and ig_user_id cache
    const igTest = await testInstagramConnection(pageToken, pageId);

    // ANTI-PATTERN: NUNCA borrar ig_user_id automáticamente cuando Meta devuelve null.
    // Meta puede devolver null por demoras de propagación o inconsistencias de Account Center.
    // Solo actualizar ig_user_id cuando tengamos un valor positivo confirmado.
    {
      const userCond2 = eq(socialAccountsTable.userId, userId);
      const bizCond2 = bizId != null ? eq(socialAccountsTable.businessId, bizId) : userCond2;
      await db.update(socialAccountsTable).set({
        ...(igTest.igId ? { igUserId: igTest.igId } : {}),
        ...(igTest.username ? { username: igTest.username } : {}),
        updatedAt: new Date(),
      }).where(and(eq(socialAccountsTable.platform, "instagram"), userCond2, bizCond2));
    }

    res.json({
      success: true,
      username: igTest.username,
      instagramLinked: igTest.instagramLinked,
      expiresAt: expiresAt.toISOString(),
      message: `Token de larga duración guardado. Expira el ${expiresAt.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message ?? "Error inesperado." });
  }
});

/**
 * POST /social-accounts/meta/refresh-token
 * Admin-only: manually trigger the Meta token renewal check.
 */
router.post("/meta/refresh-token", requireAuth, requireAdmin, async (_req, res) => {
  try {
    await checkAndRenewMetaToken();
    res.json({ success: true, message: "Revisión de token Meta ejecutada. Revisa Telegram para el resultado." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message ?? "Error inesperado." });
  }
});

/**
 * Checks whether a business still has connected social accounts.
 * If none remain, fires a proactive Telegram alert.
 * Fire-and-forget: errors are silenced so the disconnect response is never blocked.
 */
async function alertIfNoAccountsRemain(businessId: number, userId: number): Promise<void> {
  try {
    const remaining = await db
      .select({ id: socialAccountsTable.id })
      .from(socialAccountsTable)
      .where(and(
        eq(socialAccountsTable.userId, userId),
        eq(socialAccountsTable.businessId, businessId),
        eq(socialAccountsTable.connected, "true"),
      ))
      .limit(1);

    if (remaining.length > 0) return;

    const [biz] = await db
      .select({ name: businessesTable.name })
      .from(businessesTable)
      .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId)))
      .limit(1);

    const bizName = biz?.name ?? `negocio #${businessId}`;
    notifyLastAccountDisconnected(bizName, businessId, userId).catch(() => {});
  } catch {
    // Never block the response due to a notification error
  }
}

/**
 * DELETE /social-accounts/:platform
 * User-facing: disconnect (permanently remove) a social account.
 * For Meta platforms (instagram/facebook) both are removed together since they
 * share the same page token.
 * After deletion, fires a proactive Telegram alert if the business has no remaining
 * connected accounts — giving the user time to reconnect before posts start failing.
 */
router.delete("/:platform", async (req, res) => {
  const platform = req.params.platform as string;
  if (!["instagram", "facebook", "tiktok"].includes(platform)) {
    res.status(400).json({ error: "Plataforma inválida. Usa: instagram, facebook, tiktok." });
    return;
  }

  const userId = req.user!.userId;
  const bizId = await getActiveBusinessId(userId);

  try {
    const userCond = eq(socialAccountsTable.userId, userId);
    const bizCond = bizId != null ? eq(socialAccountsTable.businessId, bizId) : userCond;

    let deletedCount = 0;

    if (platform === "instagram" || platform === "facebook") {
      // Instagram and Facebook share the same Meta page token — always delete both together.
      const deleted = await db
        .delete(socialAccountsTable)
        .where(and(
          userCond,
          bizCond,
          sql`${socialAccountsTable.platform} IN ('instagram', 'facebook')`,
        ))
        .returning({ id: socialAccountsTable.id });
      deletedCount = deleted.length;
    } else {
      const deleted = await db
        .delete(socialAccountsTable)
        .where(and(userCond, bizCond, eq(socialAccountsTable.platform, platform)))
        .returning({ id: socialAccountsTable.id });
      deletedCount = deleted.length;
    }

    // Proactive alert: only trigger if rows were actually removed and the business
    // now has zero connected accounts. Skip on no-op deletes to avoid spurious alerts.
    if (bizId != null && deletedCount > 0) {
      await alertIfNoAccountsRemain(bizId, userId);
    }

    res.json({ ok: true, message: `Cuenta de ${platform} desconectada correctamente.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Error al desconectar la cuenta." });
  }
});

export default router;
