import { Router } from "express";
import { processChat, listChatConversations, getConversationMessages } from "../services/chatbot.service.js";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// ─── Public: widget sends messages here ──────────────────────────────────────

router.post("/message", async (req, res) => {
  try {
    const { sessionId, message, visitorName } = req.body as {
      sessionId?: string;
      message?: string;
      visitorName?: string;
    };

    if (!sessionId || typeof sessionId !== "string" || sessionId.trim().length < 8) {
      return res.status(400).json({ error: "sessionId inválido" });
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "message requerido" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Mensaje demasiado largo" });
    }

    const result = await processChat(sessionId.trim(), message.trim(), visitorName?.trim());

    return res.json({
      reply: result.reply,
      conversationId: result.conversationId,
    });
  } catch (err) {
    console.error("[Chatbot] Error:", err);
    return res.status(500).json({ error: "Error interno del chatbot" });
  }
});

// ─── Admin: list all chatbot conversations ────────────────────────────────────

router.get("/conversations", requireAdmin, async (_req, res) => {
  try {
    const convs = await listChatConversations(100);
    return res.json(convs);
  } catch (err) {
    console.error("[Chatbot] Error listing conversations:", err);
    return res.status(500).json({ error: "Error listando conversaciones" });
  }
});

router.get("/conversations/:id/messages", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const msgs = await getConversationMessages(id);
    return res.json(msgs);
  } catch (err) {
    console.error("[Chatbot] Error fetching messages:", err);
    return res.status(500).json({ error: "Error cargando mensajes" });
  }
});

export default router;
