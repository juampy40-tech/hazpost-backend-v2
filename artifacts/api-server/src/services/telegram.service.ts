import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { NicheAnalysisResult } from "./ai.service.js";

const TELEGRAM_API = "https://api.telegram.org/bot";

/** Escape characters that have special meaning in Telegram HTML parse mode. */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/** Reads the global admin Telegram config from app_settings. */
async function getAdminTelegramConfig(): Promise<TelegramConfig | null> {
  const rows = await db.select().from(appSettingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const botToken = map["telegram_bot_token"];
  const chatId = map["telegram_chat_id"];

  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/**
 * Reads the Telegram config for a specific user from the users table.
 * Uses raw SQL because the columns are added via startup migration, not drizzle schema.
 * Returns null if the user has no bot configured.
 */
export async function getTelegramConfigForUser(userId: number): Promise<TelegramConfig | null> {
  const result = await db.execute(
    sql`SELECT telegram_bot_token, telegram_chat_id FROM users WHERE id = ${userId} LIMIT 1`
  );
  const row = result.rows[0] as { telegram_bot_token?: string; telegram_chat_id?: string } | undefined;

  if (!row?.telegram_bot_token || !row?.telegram_chat_id) return null;
  return { botToken: row.telegram_bot_token, chatId: row.telegram_chat_id };
}

async function sendMessage(config: TelegramConfig, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${TELEGRAM_API}${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      logger.warn(`Telegram sendMessage failed: ${data.description}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`Telegram network error: ${err}`);
    return false;
  }
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  facebook: "🔵",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

/**
 * Notify when a post is successfully published to one or more platforms.
 * Sends to the user's own Telegram bot. If not configured, silences (no fallback to admin).
 */
export async function notifyPostPublished(
  postId: number,
  caption: string,
  successPlatforms: string[],
  failedPlatforms: string[],
  userId?: number,
): Promise<void> {
  if (userId == null) {
    logger.warn(`[Telegram] notifyPostPublished called without userId for post #${postId} — falling back to admin config`);
  }
  const config = userId != null
    ? await getTelegramConfigForUser(userId)
    : await getAdminTelegramConfig();
  if (!config) return;

  const captionPreview = escHtml(caption.length > 120 ? caption.slice(0, 117) + "…" : caption);
  const successLines = successPlatforms
    .map(p => `  ${PLATFORM_ICONS[p] ?? "▸"} ${escHtml(PLATFORM_LABELS[p] ?? p)}`)
    .join("\n");
  const failLines = failedPlatforms
    .map(p => `  ⚠️ ${escHtml(PLATFORM_LABELS[p] ?? p)}`)
    .join("\n");

  const allOk = failedPlatforms.length === 0;

  const lines: string[] = [
    allOk
      ? `✅ <b>Post #${postId} publicado exitosamente</b>`
      : `⚠️ <b>Post #${postId} publicado con errores</b>`,
    ``,
    `<b>Plataformas:</b>`,
    successLines,
    ...(failLines ? [``, `<b>Fallaron:</b>`, failLines] : []),
    ``,
    `<i>"${captionPreview}"</i>`,
    ``,
    `<code>hazpost · ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: true })}</code>`,
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * Notify when a post fails to publish on ALL platforms.
 * Sends to the user's own Telegram bot. If not configured, silences (no fallback to admin).
 */
export async function notifyPostFailed(
  postId: number,
  caption: string,
  platform: string,
  errorMessage: string,
  userId?: number,
): Promise<void> {
  if (userId == null) {
    logger.warn(`[Telegram] notifyPostFailed called without userId for post #${postId} — falling back to admin config`);
  }
  const config = userId != null
    ? await getTelegramConfigForUser(userId)
    : await getAdminTelegramConfig();
  if (!config) return;

  const captionPreview = escHtml(caption.length > 80 ? caption.slice(0, 77) + "…" : caption);
  const errorPreview = escHtml(errorMessage.length > 150 ? errorMessage.slice(0, 147) + "…" : errorMessage);

  const lines: string[] = [
    `❌ <b>Post #${postId} falló al publicar</b>`,
    ``,
    `${PLATFORM_ICONS[platform] ?? "▸"} <b>Plataforma:</b> ${escHtml(PLATFORM_LABELS[platform] ?? platform)}`,
    `<b>Error:</b> <code>${errorPreview}</code>`,
    ``,
    `<i>"${captionPreview}"</i>`,
    ``,
    `<b>Acción requerida:</b> Revisa el Post Log en hazpost.`,
    ``,
    `<code>hazpost · ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: true })}</code>`,
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * Notify when the auto-generation job creates new posts.
 * System-level alert: uses admin global config.
 */
export async function notifyAutoGenerated(count: number, daysAhead: number): Promise<void> {
  const config = await getAdminTelegramConfig();
  if (!config) return;

  const lines: string[] = [
    `🤖 <b>Generación automática completada</b>`,
    ``,
    `📅 <b>${count} posts nuevos</b> creados para los próximos <b>${daysAhead} días</b>.`,
    `Estado: <i>pendiente de aprobación</i> — revísalos en la sección de Aprobación.`,
    ``,
    `<code>hazpost · ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: true })}</code>`,
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * Weekly niche insights: top performers, underperformers, and AI-suggested new niches.
 * System-level alert: uses admin global config.
 */
export async function notifyNicheInsights(analysis: NicheAnalysisResult): Promise<void> {
  const config = await getAdminTelegramConfig();
  if (!config) return;

  const fmt = (n: number) => n.toFixed(2);
  const medal = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

  const topLines = analysis.topNiches.length > 0
    ? analysis.topNiches.map((n, i) =>
        `  ${medal[i] ?? "•"} <b>${escHtml(n.nicheName)}</b> — ER ${fmt(n.avgER)}% · ${n.postCount} posts · reach avg ${n.avgReach.toLocaleString("es-CO")}`
      ).join("\n")
    : "  <i>Aún no hay suficientes métricas publicadas.</i>";

  const bottomLines = analysis.bottomNiches.length > 0
    ? analysis.bottomNiches.map(n =>
        `  ⚠️ <b>${escHtml(n.nicheName)}</b> — ER ${fmt(n.avgER)}% · ${n.postCount} posts`
      ).join("\n")
    : "  <i>No hay nichos con bajo rendimiento aún.</i>";

  const suggLines = analysis.suggestions.length > 0
    ? analysis.suggestions.map((s, i) =>
        `  ${i + 1}. <b>${escHtml(s.nombre)}</b>\n     ${escHtml(s.razon)}\n     <i>${s.palabrasClave.slice(0, 2).map(escHtml).join(", ")}</i>`
      ).join("\n\n")
    : "  <i>Sin sugerencias disponibles esta semana.</i>";

  const lines: string[] = [
    `📊 <b>Reporte semanal de nichos</b>`,
    ``,
    `🏆 <b>Top nichos por engagement (ER%)</b>`,
    topLines,
    ``,
    `📉 <b>Nichos con menor rendimiento</b>`,
    bottomLines,
    ``,
    `💡 <b>Nichos sugeridos por IA para agregar</b>`,
    suggLines,
    ``,
    `<code>hazpost · ${escHtml(analysis.generatedAt)}</code>`,
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * Send a test notification to verify the bot configuration.
 */
export async function sendTestNotification(botToken: string, chatId: string): Promise<{ ok: boolean; error?: string }> {
  const lines: string[] = [
    `🟢 <b>¡Conexión exitosa!</b>`,
    ``,
    `Tu bot de hazpost está correctamente configurado.`,
    `Recibirás notificaciones aquí cuando:`,
    `  📸 Se publique un post exitosamente`,
    `  ❌ Un post falle al publicar`,
    `  🤖 El sistema genere contenido automáticamente`,
    ``,
    `<code>hazpost · Bot activo</code>`,
  ];

  try {
    const res = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Notify when a chatbot visitor is identified as a hot lead.
 * System-level alert: uses admin global config.
 */
export async function notifyChatLeadHot(
  conversationId: number,
  visitorName: string,
  conversationText: string,
): Promise<void> {
  const config = await getAdminTelegramConfig();
  if (!config) return;

  const preview = escHtml(conversationText.length > 800 ? conversationText.slice(0, 797) + "…" : conversationText);

  const text = [
    `🔥 <b>LEAD CALIENTE</b>`,
    ``,
    `<b>Visitante:</b> ${escHtml(visitorName)}`,
    `<b>Conversación #${conversationId}</b>`,
    ``,
    preview,
    ``,
    `👉 <b>Revisar en dashboard → Chatbot</b>`,
  ].join("\n");

  await sendMessage(config, text);
}

/**
 * Notify when a Meta token is renewed, expiring soon, or renewal failed.
 * Priority: user's own bot → admin global fallback.
 */
export async function notifyMetaTokenAlert(
  status: "renewed" | "expiring_soon" | "renewal_failed",
  expiresAt: Date,
  daysLeft: number,
  userId?: number,
): Promise<void> {
  let config: TelegramConfig | null = null;

  if (userId != null) {
    config = await getTelegramConfigForUser(userId);
  }
  if (!config) {
    config = await getAdminTelegramConfig();
  }
  if (!config) return;

  const emoji = status === "renewed" ? "🔄" : status === "expiring_soon" ? "⚠️" : "❌";
  const titles: Record<typeof status, string> = {
    renewed: "Token Meta renovado automáticamente",
    expiring_soon: "Token Meta próximo a expirar",
    renewal_failed: "Error al renovar token Meta automáticamente",
  };

  const dateStr = expiresAt.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Bogota" });

  const lines = [
    `${emoji} <b>${titles[status]}</b>`,
    ``,
    `📅 Expira: <b>${dateStr}</b>`,
    `⏳ Días restantes: <b>${daysLeft}</b>`,
    ...(userId != null ? [`👤 Usuario ID: <b>${userId}</b>`] : []),
    ...(status !== "renewed"
      ? [``, `🔧 Ir a <b>Ajustes → Cuentas Sociales → Meta</b> y re-conecta el token manualmente.`]
      : [``, `✅ No se requiere acción.`]),
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * Alert sent when an Instagram post fails with an auth error (#10 or #190).
 * Tells the user their Meta token is invalid and they must reconnect.
 */
export async function notifyInstagramAuthError(
  userId: number,
  postId?: number,
): Promise<void> {
  let config: TelegramConfig | null = await getTelegramConfigForUser(userId);
  if (!config) config = await getAdminTelegramConfig();
  if (!config) return;

  const lines = [
    `🔐 <b>Error de autenticación Meta al publicar</b>`,
    ``,
    `Instagram rechazó el token de acceso (error #10 o #190).`,
    ...(postId != null ? [`📌 Post ID: <b>${postId}</b>`] : []),
    `👤 Usuario ID: <b>${userId}</b>`,
    ``,
    `🔧 Ve a <b>Ajustes → Cuentas Sociales → Meta</b> y vuelve a conectar tu cuenta para restaurar la publicación automática.`,
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * In-memory rate limiter: tracks the last notification time per businessId
 * to avoid sending duplicate "no social accounts" alerts for the same business
 * in a single scheduler cycle (or within 1 hour).
 */
const noSocialAccountAlertedAt = new Map<number, number>();
const NO_SOCIAL_ACCOUNT_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Notify when a post fails because the business has no connected social accounts.
 * Lookup: uses the user's own Telegram bot when userId is provided; falls back to
 * the admin global bot when userId is absent. Silences if no config is found at all.
 * Rate-limited per businessId: at most once per hour to avoid spam when multiple
 * posts from the same business fail in the same scheduler cycle.
 *
 * @param postId - The ID of the failed post
 * @param postNumber - The human-readable post number (sequential per-business counter)
 * @param businessName - The name of the business
 * @param businessId - Used for rate limiting
 * @param userId - The owner of the post (used for Telegram config lookup)
 */
export async function notifyNoSocialAccount(
  postId: number,
  postNumber: number | null | undefined,
  businessName: string,
  businessId: number,
  userId?: number,
): Promise<void> {
  const now = Date.now();
  const lastAlerted = noSocialAccountAlertedAt.get(businessId);
  if (lastAlerted != null && now - lastAlerted < NO_SOCIAL_ACCOUNT_ALERT_COOLDOWN_MS) {
    logger.info(`[Telegram] notifyNoSocialAccount rate-limited for businessId=${businessId} — skipping`);
    return;
  }
  const config = userId != null
    ? await getTelegramConfigForUser(userId)
    : await getAdminTelegramConfig();
  if (!config) return;

  noSocialAccountAlertedAt.set(businessId, now);

  const appUrl = (process.env.APP_URL ?? "https://hazpost.app").replace(/\/$/, "");
  const settingsUrl = `${appUrl}/settings`;

  const postLabel = postNumber != null ? `#${postNumber}` : `ID ${postId}`;
  const bizLabel = escHtml(businessName);

  const lines: string[] = [
    `⚠️ <b>Post ${postLabel} de "${bizLabel}" no se publicó</b>`,
    ``,
    `Este negocio no tiene cuentas de redes sociales conectadas.`,
    `El post fue marcado como fallido y no se reintentará automáticamente.`,
    ``,
    `🔧 <b>Acción requerida:</b>`,
    `Conecta Instagram (o TikTok) para restaurar la publicación:`,
    `👉 <a href="${settingsUrl}">Ir a Configuración → Cuentas Sociales</a>`,
    ``,
    `<code>hazpost · ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: true })}</code>`,
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * Proactive alert sent the moment a business disconnects its last active social account.
 * Fires immediately — before any post fails — so the user has time to reconnect.
 * Uses the same per-business rate limit as notifyNoSocialAccount (1 hour) to avoid spam
 * if the endpoint is called multiple times in quick succession.
 *
 * @param businessName - Display name of the business
 * @param businessId   - Used for rate limiting
 * @param userId       - Owner of the business (used for Telegram config lookup)
 */
export async function notifyLastAccountDisconnected(
  businessName: string,
  businessId: number,
  userId: number,
): Promise<void> {
  const now = Date.now();
  const lastAlerted = noSocialAccountAlertedAt.get(businessId);
  if (lastAlerted != null && now - lastAlerted < NO_SOCIAL_ACCOUNT_ALERT_COOLDOWN_MS) {
    logger.info(`[Telegram] notifyLastAccountDisconnected rate-limited for businessId=${businessId} — skipping`);
    return;
  }

  let config: TelegramConfig | null = await getTelegramConfigForUser(userId);
  if (!config) config = await getAdminTelegramConfig();
  if (!config) return;

  noSocialAccountAlertedAt.set(businessId, now);

  const appUrl = (process.env.APP_URL ?? "https://hazpost.app").replace(/\/$/, "");
  const settingsUrl = `${appUrl}/settings`;
  const bizLabel = escHtml(businessName);

  const lines: string[] = [
    `🔌 <b>"${bizLabel}" se quedó sin cuentas conectadas</b>`,
    ``,
    `Desconectaste la última cuenta de redes sociales de este negocio.`,
    `<b>Los próximos posts programados fallarán</b> si no reconectas antes de que llegue su hora de publicación.`,
    ``,
    `🔧 <b>Reconecta ahora para evitar interrupciones:</b>`,
    `👉 <a href="${settingsUrl}">Ir a Configuración → Cuentas Sociales</a>`,
    ``,
    `<code>hazpost · ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: true })}</code>`,
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * Proactive alert sent the moment a post is approved for a business with no connected accounts.
 * Warns the user that the post is now scheduled but will not be published until accounts are linked.
 * Does NOT use a rate limiter — each approval is a deliberate user action and deserves its own alert.
 *
 * @param postId       - The ID of the approved post
 * @param postNumber   - The human-readable post number
 * @param businessName - Display name of the business
 * @param userId       - Owner of the post (used for Telegram config lookup)
 */
export async function notifyApprovedPostNoAccounts(
  postId: number,
  postNumber: number | null | undefined,
  businessName: string,
  userId: number,
): Promise<void> {
  let config: TelegramConfig | null = await getTelegramConfigForUser(userId);
  if (!config) config = await getAdminTelegramConfig();
  if (!config) return;

  const appUrl = (process.env.APP_URL ?? "https://hazpost.app").replace(/\/$/, "");
  const settingsUrl = `${appUrl}/settings`;

  const postLabel = postNumber != null ? `#${postNumber}` : `ID ${postId}`;
  const bizLabel = escHtml(businessName);

  const lines: string[] = [
    `⚠️ <b>Post ${postLabel} aprobado, pero no se publicará</b>`,
    ``,
    `El post de <b>"${bizLabel}"</b> fue programado exitosamente,`,
    `pero este negocio <b>no tiene cuentas de redes sociales conectadas</b>.`,
    ``,
    `El post quedará en estado <i>programado</i> hasta que conectes una cuenta.`,
    `Si no conectas antes de la hora de publicación, el scheduler lo marcará como fallido.`,
    ``,
    `🔧 <b>Acción requerida:</b>`,
    `Conecta Instagram o TikTok para que se publique automáticamente:`,
    `👉 <a href="${settingsUrl}">Ir a Configuración → Cuentas Sociales</a>`,
    ``,
    `<code>hazpost · ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: true })}</code>`,
  ];

  await sendMessage(config, lines.join("\n"));
}

/**
 * Notify the PREVIOUS owner that their Instagram account was claimed by a new user via OAuth.
 * The new user authenticated directly with Facebook, proving ownership of the page.
 * Uses user's own Telegram bot; falls back to admin global bot.
 */
export async function notifyInstagramAccountClaimed(
  prevUserId: number,
  igUsername: string,
  businessName: string,
): Promise<void> {
  let config: TelegramConfig | null = await getTelegramConfigForUser(prevUserId);
  if (!config) config = await getAdminTelegramConfig();
  if (!config) return;

  const appUrl = (process.env.APP_URL ?? "https://hazpost.app").replace(/\/$/, "");
  const settingsUrl = `${appUrl}/settings`;

  const lines = [
    `🔌 <b>Tu cuenta de Instagram fue desvinculada</b>`,
    ``,
    `La cuenta <b>@${escHtml(igUsername)}</b> del negocio <b>"${escHtml(businessName)}"</b>`,
    `fue reclamada por otro usuario mediante una nueva autorización con Facebook.`,
    ``,
    `Si esto fue un error, contacta al soporte de hazpost.`,
    `Si quieres reconectar otra cuenta, puedes hacerlo desde Configuración:`,
    `👉 <a href="${settingsUrl}">Ir a Configuración → Cuentas Sociales</a>`,
    ``,
    `<code>hazpost · ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: true })}</code>`,
  ];

  await sendMessage(config, lines.join("\n"));
}

export async function detectChatId(botToken: string): Promise<{ chatId: string | null; firstName?: string; error?: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}${botToken}/getUpdates?limit=10&timeout=0`);
    const data = await res.json() as {
      ok: boolean;
      result?: { message?: { chat: { id: number; first_name?: string; username?: string } } }[];
      description?: string;
    };

    if (!data.ok) return { chatId: null, error: data.description };
    if (!data.result || data.result.length === 0) {
      return { chatId: null, error: "No se encontraron mensajes. Envíale /start a tu bot primero." };
    }

    const lastUpdate = data.result[data.result.length - 1];
    const chat = lastUpdate?.message?.chat;
    if (!chat) return { chatId: null, error: "No se pudo extraer el Chat ID. Envía un mensaje al bot e intenta de nuevo." };

    return { chatId: String(chat.id), firstName: chat.first_name ?? chat.username };
  } catch (err) {
    return { chatId: null, error: String(err) };
  }
}
