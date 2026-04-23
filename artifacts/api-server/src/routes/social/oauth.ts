import { Router } from "express";
import { randomBytes, createHmac } from "crypto";
import { db } from "@workspace/db";
import { socialAccountsTable, appSettingsTable, businessesTable, usersTable } from "@workspace/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { notifyInstagramAccountClaimed } from "../../services/telegram.service.js";
import { encryptToken, decryptToken } from "../../lib/tokenEncryption.js";
import { logger } from "../../lib/logger.js";
import { requireAuth } from "../../lib/auth.js";
import { getActiveBusinessId } from "../../lib/businesses.js";
import { auditLog, AuditAction } from "../../lib/audit.js";

const router = Router();

const GRAPH_API_BASE = "https://graph.facebook.com/v22.0";
const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";
const OAUTH_SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

// ── DB-backed pending OAuth sessions ───────────────────────────────────────
// Replaces the previous in-memory Map. Survives server restarts and is safe
// for multi-instance deployments.
// Schema: pending_oauth_sessions(session_id, user_id, business_id, pages_enc, expires_at)
// pages_enc = JSON array of { id, name, accessTokenEnc, igUsername?, igId? }
//   where accessTokenEnc is AES-encrypted with TOKEN_ENCRYPTION_KEY.

interface PageOption {
  id: string;
  name: string;
  accessTokenEnc: string; // encrypted
  igUsername?: string;
  igId?: string;
  tokenExpiresAt?: string; // ISO date — expiry of the page token (~60 days from connect)
}

async function savePendingOAuthSession(
  userId: number,
  businessId: number | null,
  pages: PageOption[],
): Promise<string> {
  const sessionId = randomBytes(20).toString("hex");
  const expiresAt = new Date(Date.now() + OAUTH_SESSION_TTL_MS);
  const pagesEnc = JSON.stringify(pages);
  await db.execute(sql`
    INSERT INTO pending_oauth_sessions (session_id, user_id, business_id, pages_enc, expires_at)
    VALUES (${sessionId}, ${userId}, ${businessId ?? null}, ${pagesEnc}, ${expiresAt.toISOString()})
    ON CONFLICT (session_id) DO NOTHING
  `);
  return sessionId;
}

async function getPendingOAuthSession(sessionId: string): Promise<{
  userId: number;
  businessId: number | null;
  pages: PageOption[];
} | null> {
  const rows = await db.execute(sql`
    SELECT user_id, business_id, pages_enc, expires_at
    FROM pending_oauth_sessions
    WHERE session_id = ${sessionId}
      AND expires_at > NOW()
    LIMIT 1
  `);
  const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
  if (!row) return null;
  const pages = JSON.parse(row.pages_enc as string) as PageOption[];
  return {
    userId: row.user_id as number,
    businessId: row.business_id as number | null,
    pages,
  };
}

async function deletePendingOAuthSession(sessionId: string): Promise<void> {
  await db.execute(sql`DELETE FROM pending_oauth_sessions WHERE session_id = ${sessionId}`);
}

// HMAC-signed stateless OAuth state — survives server restarts and works across dev/prod
// because both share TOKEN_ENCRYPTION_KEY. Format: base64(payload).signature
function getStateSecret(): string {
  return process.env["TOKEN_ENCRYPTION_KEY"] ?? process.env["JWT_SECRET"] ?? "eco-oauth-state-secret";
}

function generateOAuthState(platform: string, userId: number, businessId: number | null): string {
  const payload = Buffer.from(JSON.stringify({
    platform,
    userId,
    businessId,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
    nonce: randomBytes(8).toString("hex"),
  })).toString("base64url");
  const sig = createHmac("sha256", getStateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function validateOAuthState(state: string, expectedPlatform: string): { userId: number; businessId: number | null } | null {
  try {
    const dotIdx = state.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const payload = state.slice(0, dotIdx);
    const sig = state.slice(dotIdx + 1);
    const expectedSig = createHmac("sha256", getStateSecret()).update(payload).digest("hex");
    // Constant-time comparison to prevent timing attacks
    if (sig.length !== expectedSig.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    if (diff !== 0) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() > data.expiresAt) return null;
    if (data.platform !== expectedPlatform) return null;
    return { userId: data.userId, businessId: data.businessId ?? null };
  } catch {
    return null;
  }
}

function getBaseUrl(): string {
  if (process.env["APP_URL"]) return process.env["APP_URL"];
  const domain = process.env["REPLIT_DEV_DOMAIN"] ?? "";
  return domain ? `https://${domain}` : "http://localhost:8080";
}

// GET /auth/meta/redirect — generate Meta OAuth URL and redirect (requires authentication)
router.get("/meta/redirect", requireAuth, async (req, res) => {
  const [appIdRow] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "meta_app_id"));
  const appId = appIdRow?.value;

  if (!appId) {
    res.status(400).json({ error: "Meta App ID not configured. Set it in Settings > Platform Credentials." });
    return;
  }

  const userId = req.user!.userId;

  // VM-4b fix: prefer businessId passed by the frontend (settings page sends ?businessId=X
  // when the user has a specific business selected). Fall back to the DB default only when
  // the query param is absent — covers legacy / single-business users.
  const _bizRaw = Number(req.query.businessId);
  const bizFromQuery = (req.query.businessId && Number.isFinite(_bizRaw) && Number.isInteger(_bizRaw) && _bizRaw > 0) ? _bizRaw : null;
  if (bizFromQuery != null) {
    const [owned] = await db.select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.id, bizFromQuery), eq(businessesTable.userId, userId)))
      .limit(1);
    if (!owned) {
      // Admin bypass: admins can do OAuth on behalf of any business they manage
      const [userRecord] = await db.select({ role: usersTable.role })
        .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (userRecord?.role !== "admin") {
        res.status(403).json({ error: "businessId no pertenece al usuario autenticado" });
        return;
      }
      // Verify the business exists at all
      const [bizExists] = await db.select({ id: businessesTable.id, userId: businessesTable.userId })
        .from(businessesTable).where(eq(businessesTable.id, bizFromQuery)).limit(1);
      if (!bizExists) {
        res.status(404).json({ error: "Negocio no encontrado." });
        return;
      }
      logger.info({ adminUserId: userId, bizFromQuery }, "Meta OAuth: admin bypass — connecting on behalf of managed business");
    }
  }
  const businessId = bizFromQuery ?? await getActiveBusinessId(userId);

  const redirectUri = `${getBaseUrl()}/api/auth/meta/callback`;
  const scopes = "instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement,pages_manage_posts";
  const csrfState = generateOAuthState("meta", userId, businessId);

  const oauthUrl = `https://www.facebook.com/v22.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${csrfState}`;

  res.redirect(oauthUrl);
});

// GET /auth/meta/callback — exchange code for access token (public — called by Meta)
router.get("/meta/callback", async (req, res) => {
  const { code, error: oauthError, state } = req.query as Record<string, string>;

  if (oauthError) {
    res.redirect(`/settings?error=${encodeURIComponent("Meta authorization denied")}`);
    return;
  }

  const stateData = state ? validateOAuthState(state, "meta") : null;
  if (!stateData) {
    res.redirect(`/settings?error=${encodeURIComponent("Invalid or expired OAuth state. Please try connecting again.")}`);
    return;
  }
  const { userId: oauthUserId, businessId: oauthBusinessId } = stateData;

  if (!code) {
    res.redirect(`/settings?error=${encodeURIComponent("No authorization code received from Meta")}`);
    return;
  }

  try {
    const [appIdRow] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "meta_app_id"));
    const [appSecretRow] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "meta_app_secret"));

    const appId = appIdRow?.value;
    const appSecret = appSecretRow?.value;

    if (!appId || !appSecret) {
      res.redirect(`/settings?error=${encodeURIComponent("Meta App ID or Secret not configured")}`);
      return;
    }

    const redirectUri = `${getBaseUrl()}/api/auth/meta/callback`;

    const tokenRes = await fetch(
      `${GRAPH_API_BASE}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };

    if (!tokenData.access_token || tokenData.error) {
      res.redirect(`/settings?error=${encodeURIComponent(tokenData.error?.message || "Failed to obtain access token from Meta")}`);
      return;
    }

    // Exchange for long-lived token (~60 days). Fail-hard on error — never fall back to
    // the short-lived token (1-2h) because that causes users to lose their connection daily.
    const longLivedRes = await fetch(
      `${GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longLivedData = await longLivedRes.json() as {
      access_token?: string;
      expires_in?: number;
      error?: { message: string; type?: string; code?: number };
    };

    if (!longLivedData.access_token || longLivedData.error) {
      logger.error(
        { error: longLivedData.error, userId: oauthUserId },
        "Meta OAuth: long-lived token exchange failed — aborting connection (refusing to save short-lived token)"
      );
      res.redirect(`/settings?error=${encodeURIComponent(
        longLivedData.error?.message
          ?? "No se pudo obtener el token de larga duración de Meta. Intenta reconectar."
      )}`);
      return;
    }

    const finalToken = longLivedData.access_token;
    const tokenExpiresInSec = longLivedData.expires_in ?? 5_183_944; // ~60 days default
    const tokenExpiresAt = new Date(Date.now() + tokenExpiresInSec * 1000);

    logger.info(
      { userId: oauthUserId, expiresInSec: tokenExpiresInSec, expiresAt: tokenExpiresAt.toISOString() },
      "Meta OAuth: long-lived token obtained successfully"
    );

    // Fetch ALL pages the user administers (with Instagram business account info).
    // Request both instagram_business_account (Page-Settings link) and
    // connected_instagram_account (Account Center link) — users may have used either path.
    const pagesRes = await fetch(
      `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account,connected_instagram_account&access_token=${finalToken}`
    );
    const pagesData = await pagesRes.json() as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string };
        connected_instagram_account?: { id: string };
      }>;
    };

    const pages = pagesData.data ?? [];

    if (pages.length === 0) {
      res.redirect(`/settings?error=${encodeURIComponent("No se encontraron Páginas de Facebook administradas por esta cuenta. Asegúrate de ser administrador de tu Página.")}`);
      return;
    }

    // Enrich ALL pages with Instagram username (for display in selector).
    // Resolution order:
    //   1. instagram_business_account (Page Settings link) — from /me/accounts user token
    //   2. connected_instagram_account  (Account Center link) — from /me/accounts user token
    //   3. Fallback: direct page query with page token for both fields
    // Users may have connected via Account Center (connected_instagram_account) or via
    // Page Settings (instagram_business_account). Both IDs work for publishing.
    const enriched: PageOption[] = await Promise.all(
      pages.map(async (p) => {
        let igId = p.instagram_business_account?.id ?? p.connected_instagram_account?.id;

        // Fallback: query the page directly with its own page access token
        if (!igId && p.access_token) {
          try {
            const pageRes = await fetch(
              `${GRAPH_API_BASE}/${p.id}?fields=instagram_business_account,connected_instagram_account&access_token=${p.access_token}`
            );
            const pageData = await pageRes.json() as {
              instagram_business_account?: { id: string };
              connected_instagram_account?: { id: string };
              error?: { message: string; code?: number };
            };
            if (!pageData.error) {
              igId = pageData.instagram_business_account?.id ?? pageData.connected_instagram_account?.id;
            }
            logger.info({
              pageId: p.id,
              igIdFromUserToken: p.instagram_business_account?.id ?? p.connected_instagram_account?.id ?? null,
              igIdFromPageToken: pageData.instagram_business_account?.id ?? pageData.connected_instagram_account?.id ?? null,
              pageDataError: pageData.error ?? null,
              resolvedSoFar: igId ?? null,
            }, "Meta OAuth: instagram_business_account lookup per page");
          } catch (e) {
            logger.warn({ pageId: p.id, err: String(e) }, "Meta OAuth: page token IG lookup threw exception");
          }
        }

        // Fallback 2: /{page_id}/instagram_accounts with PAGE token
        // Works for some Account Center connections
        if (!igId && p.access_token) {
          try {
            const igAccRes = await fetch(
              `${GRAPH_API_BASE}/${p.id}/instagram_accounts?access_token=${p.access_token}`
            );
            const igAccData = await igAccRes.json() as {
              data?: Array<{ id: string; username?: string }>;
              error?: { message: string; code?: number };
            };
            const firstIg = igAccData.data?.[0];
            if (!igAccData.error && firstIg?.id) {
              igId = firstIg.id;
            }
            logger.info({
              pageId: p.id,
              instagramAccountsEndpoint: igAccData.data?.map(a => a.id) ?? null,
              instagramAccountsError: igAccData.error ?? null,
              resolvedFromInstagramAccounts: igId ?? null,
            }, "Meta OAuth: /instagram_accounts (page token) fallback lookup");
          } catch (e) {
            logger.warn({ pageId: p.id, err: String(e) }, "Meta OAuth: /instagram_accounts (page token) fallback threw exception");
          }
        }

        // Fallback 3: /{page_id}/instagram_accounts with USER token (finalToken)
        // Account Center connections linked to the user's personal profile (not the page)
        // don't surface via the page token. The user token has direct access to those IG accounts.
        if (!igId) {
          try {
            const igAccUserRes = await fetch(
              `${GRAPH_API_BASE}/${p.id}/instagram_accounts?access_token=${finalToken}`
            );
            const igAccUserData = await igAccUserRes.json() as {
              data?: Array<{ id: string; username?: string }>;
              error?: { message: string; code?: number };
            };
            const firstIgUser = igAccUserData.data?.[0];
            if (!igAccUserData.error && firstIgUser?.id) {
              igId = firstIgUser.id;
            }
            logger.info({
              pageId: p.id,
              instagramAccountsUserToken: igAccUserData.data?.map(a => a.id) ?? null,
              instagramAccountsUserTokenError: igAccUserData.error ?? null,
              resolvedFromUserToken: igId ?? null,
            }, "Meta OAuth: /instagram_accounts (user token) fallback lookup");
          } catch (e) {
            logger.warn({ pageId: p.id, err: String(e) }, "Meta OAuth: /instagram_accounts (user token) fallback threw exception");
          }
        }

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
        return {
          id: p.id,
          name: p.name,
          accessTokenEnc: encryptToken(p.access_token), // encrypted before storing
          igUsername,
          igId,
          tokenExpiresAt: tokenExpiresAt.toISOString(),
        };
      })
    );

    // ── ALWAYS show page selector — never auto-connect ───────────────────────
    // This prevents connecting the wrong page silently (the root cause of IG_NOT_LINKED bugs).
    const sessionId = await savePendingOAuthSession(oauthUserId, oauthBusinessId, enriched);

    logger.info({ oauthUserId, oauthBusinessId, pageCount: enriched.length, sessionId },
      "Meta OAuth: pages fetched — redirecting to page selector (always)");

    res.redirect(`/settings?oauth_pending=${sessionId}`);
  } catch (err) {
    logger.error({ err }, "Meta OAuth callback error");
    res.redirect(`/settings?error=${encodeURIComponent("Error inesperado durante la autorización de Meta. Intenta de nuevo.")}`);
  }
});

// ── Email notification when an Instagram account is claimed by another user ───
async function sendAccountClaimedEmail(to: string, igUsername: string, businessName: string): Promise<void> {
  try {
    const appUrl = (process.env.APP_URL ?? "https://hazpost.app").replace(/\/$/, "");
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#222;">
        <h2 style="color:#d97706;">Tu cuenta de Instagram fue desvinculada</h2>
        <p>La cuenta <strong>@${igUsername}</strong> del negocio <strong>"${businessName}"</strong>
        fue reclamada por otro usuario mediante una nueva autorización con Facebook.</p>
        <p>Esto significa que ese usuario autenticó la página de Facebook vinculada a esa cuenta de Instagram,
        lo que indica que tienen acceso de administrador a dicha página.</p>
        <p>Si esto fue un error, contacta a nuestro soporte.</p>
        <p>Si quieres reconectar otra cuenta de Instagram a tu negocio:</p>
        <p><a href="${appUrl}/settings" style="color:#0077FF;">Ir a Configuración → Cuentas Sociales</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
        <p style="font-size:12px;color:#999;">hazpost · Este es un correo automático, no respondas a este mensaje.</p>
      </div>
    `;
    const smtpPass = process.env.SMTP_PASSWORD;
    if (smtpPass) {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: "smtp.hostinger.com", port: 587, secure: false,
        auth: { user: "noreply@hazpost.app", pass: smtpPass },
      });
      await transporter.sendMail({
        from: '"hazpost" <noreply@hazpost.app>', to,
        subject: "Tu cuenta de Instagram fue desvinculada · hazpost",
        html,
      });
      return;
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ from: "hazpost <noreply@hazpost.app>", to: [to], subject: "Tu cuenta de Instagram fue desvinculada · hazpost", html }),
      });
    }
  } catch { /* fire & forget — never block the OAuth flow */ }
}

// ── Shared helper: save a Meta page connection to DB ─────────────────────────
async function connectMetaPage({
  userId,
  businessId,
  fbPageId,
  rawToken,
  igUsername,
  igId,
  tokenExpiresAt,
  confirmTransfer = false,
}: {
  userId: number;
  businessId: number | null;
  fbPageId: string;
  rawToken: string;
  igUsername: string;
  igId?: string | null;
  tokenExpiresAt?: Date | null;
  confirmTransfer?: boolean;
}) {
  // Guard: page_id cross-user conflict (VM-3)
  // If another user already has this page, "last OAuth wins" — the new OAuth proves
  // ownership of the Facebook page. Revoke the previous connection and notify the old owner
  // via Telegram, email (fallback), and in-platform alert.
  if (fbPageId) {
    const [conflictRow] = await db
      .select({
        id: socialAccountsTable.id,
        prevUserId: socialAccountsTable.userId,
        prevBusinessId: socialAccountsTable.businessId,
        prevUsername: socialAccountsTable.username,
        prevEmail: usersTable.email,
        prevBusinessName: businessesTable.name,
      })
      .from(socialAccountsTable)
      .leftJoin(usersTable, eq(usersTable.id, socialAccountsTable.userId))
      .leftJoin(businessesTable, eq(businessesTable.id, socialAccountsTable.businessId))
      .where(and(
        ne(socialAccountsTable.userId, userId),
        eq(socialAccountsTable.platform, "instagram"),
        eq(socialAccountsTable.pageId, fbPageId),
      ))
      .limit(1);

    if (conflictRow) {
      const prevUserId = conflictRow.prevUserId;
      const prevUsername = conflictRow.prevUsername ?? igUsername;
      const prevBusinessName = conflictRow.prevBusinessName ?? `Negocio #${conflictRow.prevBusinessId}`;
      const prevEmail = conflictRow.prevEmail;

      logger.info(
        { newUserId: userId, prevUserId, pageId: fbPageId, igUsername },
        "Meta OAuth: cross-user page claim — revoking previous owner's connection"
      );

      // 1. Revoke the previous connection
      await db.delete(socialAccountsTable).where(eq(socialAccountsTable.id, conflictRow.id));

      // 2. Telegram notification (fire & forget)
      if (prevUserId) {
        notifyInstagramAccountClaimed(prevUserId, prevUsername, prevBusinessName).catch(() => {});
      }

      // 3. Email fallback if user has no Telegram (check is inside notify fn; send email always as belt+suspenders)
      if (prevEmail) {
        sendAccountClaimedEmail(prevEmail, prevUsername, prevBusinessName).catch(() => {});
      }

      // 4. In-platform alert
      if (prevUserId) {
        db.execute(sql`
          INSERT INTO platform_alerts (user_id, type, title, message, metadata)
          VALUES (
            ${prevUserId},
            'account_claimed',
            'Tu cuenta de Instagram fue desvinculada',
            ${'La cuenta @' + prevUsername + ' del negocio "' + prevBusinessName + '" fue reclamada por otro usuario mediante una nueva autorización con Facebook. Si fue un error, contacta a soporte.'},
            ${'{"igUsername":"' + prevUsername + '","businessName":"' + prevBusinessName + '"}'}
          )
        `).catch(() => {});
      }
    }

    // Conflict detection: same user, same page_id, but DIFFERENT business.
    // Require explicit user confirmation before transferring — avoids silent moves
    // caused by accidental business selection ("error de dedo").
    if (businessId != null) {
      const [samePage] = await db
        .select({
          id: socialAccountsTable.id,
          businessId: socialAccountsTable.businessId,
          businessName: businessesTable.name,
        })
        .from(socialAccountsTable)
        .leftJoin(businessesTable, eq(businessesTable.id, socialAccountsTable.businessId))
        .where(and(
          eq(socialAccountsTable.userId, userId),
          eq(socialAccountsTable.platform, "instagram"),
          eq(socialAccountsTable.pageId, fbPageId),
          ne(socialAccountsTable.businessId, businessId),
        ))
        .limit(1);
      if (samePage) {
        if (!confirmTransfer) {
          // Ask the user to confirm before moving the connection
          throw Object.assign(new Error("PAGE_TRANSFER_REQUIRED"), {
            statusCode: 409,
            transferConflict: {
              fromBusinessId: samePage.businessId,
              fromBusinessName: samePage.businessName ?? `Negocio #${samePage.businessId}`,
              toBusinessId: businessId,
              accountId: samePage.id,
            },
          });
        }
        // User confirmed — execute the transfer
        logger.info(
          { userId, fromBusinessId: samePage.businessId, toBusinessId: businessId, pageId: fbPageId },
          "Meta OAuth: transferring page connection to new business (user confirmed)"
        );
        await db.update(socialAccountsTable)
          .set({ businessId, updatedAt: new Date() })
          .where(eq(socialAccountsTable.id, samePage.id));
        // After transfer, no need to insert/update again below — connection already moved.
        return;
      }
    }
  }

  const encryptedToken = encryptToken(rawToken);
  const bizCond = businessId != null ? eq(socialAccountsTable.businessId, businessId) : eq(socialAccountsTable.userId, userId);
  const existing = await db.select().from(socialAccountsTable)
    .where(and(eq(socialAccountsTable.platform, "instagram"), eq(socialAccountsTable.userId, userId), bizCond));
  if (existing.length > 0) {
    await db.update(socialAccountsTable).set({
      accessToken: encryptedToken,
      pageId: fbPageId || existing[0].pageId,
      username: igUsername || existing[0].username,
      // Never clear a previously-set ig_user_id with null — if OAuth doesn't return an igId
      // (Meta API inconsistency), preserve the existing DB value. Only update if we have a
      // positive result. Same anti-pattern rule as test endpoint and refresh-ig (16 abr 2026).
      igUserId: igId ?? existing[0].igUserId ?? null,
      // Always overwrite tokenExpiresAt when reconnecting — ensures stale NULL values are fixed.
      tokenExpiresAt: tokenExpiresAt ?? null,
      connected: "true",
      updatedAt: new Date(),
    }).where(and(eq(socialAccountsTable.platform, "instagram"), eq(socialAccountsTable.userId, userId), bizCond));
  } else {
    await db.insert(socialAccountsTable).values({
      userId,
      businessId,
      platform: "instagram",
      username: igUsername || "instagram",
      accessToken: encryptedToken,
      pageId: fbPageId,
      igUserId: igId ?? null,
      tokenExpiresAt: tokenExpiresAt ?? null,
      connected: "true",
    });
  }

  auditLog({
    userId,
    businessId,
    action: AuditAction.SOCIAL_ACCOUNT_CONNECTED,
    entityType: "social_account",
    metadata: { platform: "instagram", pageId: fbPageId, igUsername },
  });
}

// GET /auth/meta/pending-pages/:sessionId — return the list of pages for user to pick
// Auth required so we can cross-check the userId in the session
router.get("/meta/pending-pages/:sessionId", requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const session = await getPendingOAuthSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Sesión expirada o no encontrada. Vuelve a hacer clic en 'Autorizar con Meta'." });
    return;
  }
  if (session.userId !== req.user!.userId) {
    res.status(403).json({ error: "No autorizado." });
    return;
  }
  // Return page list without tokens (only display data)
  res.json({
    pages: session.pages.map(p => ({
      id: p.id,
      name: p.name,
      igUsername: p.igUsername,
      hasInstagram: !!p.igId,
    })),
  });
});

// POST /auth/meta/select-page — complete the OAuth with the chosen page
router.post("/meta/select-page", requireAuth, async (req, res) => {
  const { sessionId, pageId, confirmTransfer } = req.body as { sessionId?: string; pageId?: string; confirmTransfer?: boolean };
  if (!sessionId || !pageId) {
    res.status(400).json({ error: "Se requiere sessionId y pageId." });
    return;
  }

  const session = await getPendingOAuthSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Sesión expirada (30 min). Vuelve a hacer clic en 'Autorizar con Meta'." });
    return;
  }
  if (session.userId !== req.user!.userId) {
    res.status(403).json({ error: "No autorizado." });
    return;
  }

  const chosenPage = session.pages.find(p => p.id === pageId);
  if (!chosenPage) {
    res.status(400).json({ error: "Página no encontrada en la sesión." });
    return;
  }

  try {
    const rawToken = decryptToken(chosenPage.accessTokenEnc);
    await connectMetaPage({
      userId: session.userId,
      businessId: session.businessId,
      fbPageId: chosenPage.id,
      rawToken,
      igUsername: chosenPage.igUsername ?? "",
      igId: chosenPage.igId ?? null,
      tokenExpiresAt: chosenPage.tokenExpiresAt ? new Date(chosenPage.tokenExpiresAt) : null,
      confirmTransfer: !!confirmTransfer,
    });

    // Delete session after successful connection
    await deletePendingOAuthSession(sessionId);

    logger.info(
      { userId: session.userId, businessId: session.businessId, pageId, igUsername: chosenPage.igUsername, igId: chosenPage.igId },
      "Meta OAuth: page selected and connected by user"
    );

    res.json({ success: true, username: chosenPage.igUsername ?? chosenPage.name });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string; transferConflict?: unknown };
    if (e.statusCode === 409 && e.transferConflict) {
      // Return conflict details so the frontend can show a confirmation dialog
      res.status(409).json({ error: e.message, transferConflict: e.transferConflict });
      return;
    }
    res.status(e.statusCode ?? 500).json({ error: e.message ?? "Error al conectar la página." });
  }
});

// Resolve TikTok credentials: env vars first, then DB
async function getTikTokClientKey(): Promise<string | null> {
  // DB takes priority so the admin can switch between sandbox/production from the settings UI
  // without needing to change the environment secret.
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "tiktok_client_key"));
  if (row?.value) return row.value;
  return process.env["TIKTOK_CLIENT_KEY"] ?? null;
}

async function getTikTokClientSecret(): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "tiktok_client_secret"));
  if (row?.value) return row.value;
  return process.env["TIKTOK_CLIENT_SECRET"] ?? null;
}

// GET /auth/tiktok/check-scopes — admin diagnostic: qué scopes tiene el token guardado en DB
router.get("/tiktok/check-scopes", requireAuth, async (req, res) => {
  try {
    const [account] = await db.select().from(socialAccountsTable)
      .where(eq(socialAccountsTable.platform, "tiktok"));
    if (!account) {
      res.json({ error: "No TikTok account connected" });
      return;
    }
    const { decryptToken } = await import("../../lib/tokenEncryption.js");
    const accessToken = decryptToken(account.accessToken);
    // Query TikTok for token info via userinfo
    const r = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await r.json() as Record<string, unknown>;
    // Also try to get token expiry via query.creator_info which includes scopes
    const clientKey = await getTikTokClientKey();
    const clientSecret = await getTikTokClientSecret();
    let tokenInfo: Record<string, unknown> | null = null;
    if (clientKey && clientSecret) {
      const tr = await fetch("https://open.tiktokapis.com/v2/oauth/get_token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: "client_credentials" }),
      });
      if (tr.ok) tokenInfo = await tr.json() as Record<string, unknown>;
    }
    res.json({ account: { username: account.username, businessId: account.businessId }, tiktokUserInfo: data, tokenInfo });
  } catch (err) {
    res.json({ error: String(err) });
  }
});

// GET /auth/tiktok/redirect — generate TikTok OAuth URL and redirect (requires authentication)
router.get("/tiktok/redirect", requireAuth, async (req, res) => {
  const clientKey = await getTikTokClientKey();

  if (!clientKey) {
    res.status(400).json({ error: "TikTok Client Key not configured. Add TIKTOK_CLIENT_KEY to Secrets." });
    return;
  }

  const userId = req.user!.userId;

  // VM-4b fix: prefer businessId passed by the frontend (same pattern as Meta redirect).
  const _bizRawTk = Number(req.query.businessId);
  const bizFromQueryTk = (req.query.businessId && Number.isFinite(_bizRawTk) && Number.isInteger(_bizRawTk) && _bizRawTk > 0) ? _bizRawTk : null;
  if (bizFromQueryTk != null) {
    const [ownedTk] = await db.select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.id, bizFromQueryTk), eq(businessesTable.userId, userId)))
      .limit(1);
    if (!ownedTk) {
      res.status(403).json({ error: "businessId no pertenece al usuario autenticado" });
      return;
    }
  }
  const businessId = bizFromQueryTk ?? await getActiveBusinessId(userId);

  const redirectUri = `${getBaseUrl()}/api/auth/tiktok/callback`;
  // Sandbox apps (sbaw keys) only support user.info.basic + video.upload — video.publish is not
  // available in TikTok sandbox and causes OAuth to fail. Production requests all three scopes.
  const isSandbox = clientKey.startsWith("sbaw");
  const scopes = isSandbox
    ? "user.info.basic,video.upload"
    : "user.info.basic,video.publish,video.upload";
  const csrfState = generateOAuthState("tiktok", userId, businessId);

  const oauthUrl = `https://www.tiktok.com/v2/auth/authorize?client_key=${encodeURIComponent(clientKey)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${csrfState}`;

  res.redirect(oauthUrl);
});

// GET /auth/tiktok/callback — exchange code for TikTok access token (public — called by TikTok)
router.get("/tiktok/callback", async (req, res) => {
  const { code, error: oauthError, state } = req.query as Record<string, string>;

  if (oauthError) {
    res.redirect(`/settings?error=${encodeURIComponent("TikTok authorization denied")}`);
    return;
  }

  const tiktokStateData = state ? validateOAuthState(state, "tiktok") : null;
  if (!tiktokStateData) {
    res.redirect(`/settings?error=${encodeURIComponent("Invalid or expired OAuth state. Please try connecting again.")}`);
    return;
  }
  const { userId: tiktokUserId, businessId: tiktokBusinessId } = tiktokStateData;

  if (!code) {
    res.redirect(`/settings?error=${encodeURIComponent("No authorization code received from TikTok")}`);
    return;
  }

  try {
    const clientKey = await getTikTokClientKey();
    const clientSecret = await getTikTokClientSecret();

    if (!clientKey || !clientSecret) {
      res.redirect(`/settings?error=${encodeURIComponent("TikTok Client Key or Secret not configured. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to Secrets.")}`);
      return;
    }

    const redirectUri = `${getBaseUrl()}/api/auth/tiktok/callback`;

    const tokenRes = await fetch(`${TIKTOK_API_BASE}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json() as {
      access_token?: string;
      open_id?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      data?: { access_token?: string; open_id?: string };
      error?: string;
      error_description?: string;
      message?: string;
    };

    const accessToken = tokenData.access_token ?? tokenData.data?.access_token;

    logger.info(
      { scope: tokenData.scope ?? "(no scope field)", openId: tokenData.open_id ?? tokenData.data?.open_id },
      "[TikTok OAuth] scopes granted by TikTok"
    );

    if (!accessToken) {
      const errMsg = tokenData.error_description ?? tokenData.message ?? tokenData.error ?? "Failed to obtain access token from TikTok";
      logger.error({ tokenData }, "TikTok token exchange failed");
      res.redirect(`/settings?error=${encodeURIComponent(errMsg)}`);
      return;
    }

    // Fetch user info
    const userRes = await fetch(`${TIKTOK_API_BASE}/user/info/?fields=open_id,display_name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userRes.json() as { data?: { user?: { open_id?: string; display_name?: string } }; error?: { code?: string } };
    const username = userData.data?.user?.display_name ?? "@user";

    // Encrypt token before storing
    const encryptedAccessToken = encryptToken(accessToken);

    // Upsert TikTok account — scoped to userId + businessId
    const bizCond = tiktokBusinessId != null ? eq(socialAccountsTable.businessId, tiktokBusinessId) : eq(socialAccountsTable.userId, tiktokUserId);
    const existing = await db.select().from(socialAccountsTable)
      .where(and(eq(socialAccountsTable.platform, "tiktok"), eq(socialAccountsTable.userId, tiktokUserId), bizCond));
    if (existing.length > 0) {
      await db.update(socialAccountsTable).set({
        accessToken: encryptedAccessToken,
        connected: "true",
        username,
        updatedAt: new Date(),
      }).where(and(eq(socialAccountsTable.platform, "tiktok"), eq(socialAccountsTable.userId, tiktokUserId), bizCond));
    } else {
      await db.insert(socialAccountsTable).values({
        userId: tiktokUserId,
        businessId: tiktokBusinessId,
        platform: "tiktok",
        username,
        accessToken: encryptedAccessToken,
        connected: "true",
      });
    }

    auditLog({
      userId: tiktokUserId,
      businessId: tiktokBusinessId,
      action: AuditAction.SOCIAL_ACCOUNT_CONNECTED,
      entityType: "social_account",
      metadata: { platform: "tiktok" },
    });

    res.redirect("/settings?success=tiktok_connected");
  } catch {
    res.redirect(`/settings?error=${encodeURIComponent("Unexpected error durante TikTok OAuth")}`);
  }
});

export default router;
