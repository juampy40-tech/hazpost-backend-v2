import { Router } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { sendTestNotification, detectChatId } from "../../services/telegram.service.js";
import { requireAuth } from "../../lib/auth.js";

const router = Router();

const SECRET_KEYS = new Set([
  "meta_app_secret",
  "tiktok_client_secret",
  "telegram_bot_token",
]);

function maskSecrets(settingsMap: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(settingsMap)) {
    if (SECRET_KEYS.has(key)) {
      result[key] = value ? "••••••••" : "";
    } else {
      result[key] = value;
    }
  }
  return result;
}

router.get("/", async (req, res) => {
  const settings = await db.select().from(appSettingsTable);
  const settingsMap: Record<string, string> = {};
  for (const s of settings) {
    settingsMap[s.key] = s.value;
  }
  // Merge TikTok env var credentials into response so the UI detects them
  // even when not manually saved to DB.
  if (process.env["TIKTOK_CLIENT_KEY"] && !settingsMap["tiktok_client_key"]) {
    settingsMap["tiktok_client_key"] = process.env["TIKTOK_CLIENT_KEY"];
  }
  if (process.env["TIKTOK_CLIENT_SECRET"] && !settingsMap["tiktok_client_secret"]) {
    settingsMap["tiktok_client_secret"] = process.env["TIKTOK_CLIENT_SECRET"];
  }
  res.json(maskSecrets(settingsMap));
});

router.put("/", async (req, res) => {
  const body = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    if (SECRET_KEYS.has(key) && (!value || value === "••••••••")) continue;
    const existing = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
    if (existing.length > 0) {
      await db.update(appSettingsTable).set({ value, updatedAt: new Date() }).where(eq(appSettingsTable.key, key));
    } else {
      await db.insert(appSettingsTable).values({ key, value });
    }
  }
  const all = await db.select().from(appSettingsTable);
  const settingsMap: Record<string, string> = {};
  for (const s of all) {
    settingsMap[s.key] = s.value;
  }
  res.json(maskSecrets(settingsMap));
});

/**
 * GET /api/settings/telegram
 * Returns the Telegram config for the authenticated user (token is masked).
 */
router.get("/telegram", requireAuth, async (req, res) => {
  const userId = Number(req.user?.id);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const result = await db.execute(
    sql`SELECT telegram_bot_token, telegram_chat_id FROM users WHERE id = ${userId} LIMIT 1`
  );
  const row = result.rows[0] as { telegram_bot_token?: string | null; telegram_chat_id?: string | null } | undefined;

  res.json({
    telegram_bot_token: row?.telegram_bot_token ? "••••••••" : "",
    telegram_chat_id: row?.telegram_chat_id ?? "",
    configured: !!(row?.telegram_bot_token && row?.telegram_chat_id),
  });
});

/**
 * PUT /api/settings/telegram
 * Saves telegram_bot_token and/or telegram_chat_id for the authenticated user.
 * Skips the token update if the masked placeholder is sent.
 */
router.put("/telegram", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const body = req.body as { telegram_bot_token?: string; telegram_chat_id?: string };

  const newToken = body.telegram_bot_token;
  const newChatId = body.telegram_chat_id;

  if (newToken && newToken !== "••••••••") {
    await db.execute(sql`UPDATE users SET telegram_bot_token = ${newToken} WHERE id = ${userId}`);
  }
  if (newChatId !== undefined) {
    await db.execute(
      sql`UPDATE users SET telegram_chat_id = ${newChatId || null} WHERE id = ${userId}`
    );
  }

  const result = await db.execute(
    sql`SELECT telegram_bot_token, telegram_chat_id FROM users WHERE id = ${userId} LIMIT 1`
  );
  const row = result.rows[0] as { telegram_bot_token?: string | null; telegram_chat_id?: string | null } | undefined;

  res.json({
    telegram_bot_token: row?.telegram_bot_token ? "••••••••" : "",
    telegram_chat_id: row?.telegram_chat_id ?? "",
    configured: !!(row?.telegram_bot_token && row?.telegram_chat_id),
  });
});

/**
 * POST /api/settings/test-telegram
 * Sends a test notification using the user's own saved bot credentials.
 * Body values override saved values (useful for testing before saving).
 */
router.post("/test-telegram", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const body = req.body as { botToken?: string; chatId?: string };

  const userResult = await db.execute(
    sql`SELECT telegram_bot_token, telegram_chat_id FROM users WHERE id = ${userId} LIMIT 1`
  );
  const userRow = userResult.rows[0] as { telegram_bot_token?: string | null; telegram_chat_id?: string | null } | undefined;

  const botToken = (body.botToken && body.botToken !== "••••••••") ? body.botToken : (userRow?.telegram_bot_token ?? undefined);
  const chatId = body.chatId || (userRow?.telegram_chat_id ?? undefined);

  if (!botToken || !chatId) {
    res.status(400).json({ ok: false, error: "Falta el Bot Token o el Chat ID." });
    return;
  }

  const result = await sendTestNotification(botToken, chatId);
  res.json(result);
});

/**
 * POST /api/settings/detect-telegram-chat-id
 * Calls getUpdates on the user's bot to auto-detect their Chat ID.
 */
router.post("/detect-telegram-chat-id", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const body = req.body as { botToken?: string };

  let botToken = (body.botToken && body.botToken !== "••••••••") ? body.botToken : undefined;

  if (!botToken) {
    const userResult = await db.execute(
      sql`SELECT telegram_bot_token FROM users WHERE id = ${userId} LIMIT 1`
    );
    const userRow = userResult.rows[0] as { telegram_bot_token?: string | null } | undefined;
    botToken = userRow?.telegram_bot_token ?? undefined;
  }

  if (!botToken) {
    res.status(400).json({ chatId: null, error: "Guarda primero el Bot Token." });
    return;
  }

  const result = await detectChatId(botToken);
  res.json(result);
});

export default router;
