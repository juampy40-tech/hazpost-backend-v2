/**
 * HazPost Chatbot Service
 *
 * Widget flotante de IA para sitios web — atiende prospectos 24/7.
 *
 * Features:
 * - Responde preguntas sobre la marca usando el perfil configurado y la base de conocimiento
 * - Detecta "lead caliente" y notifica por Telegram con la conversación completa
 * - Persiste conversaciones en DB (tabla conversations + messages)
 * - Base de conocimiento ampliable desde el panel admin → Chatbot IA
 */

import { db } from "@workspace/db";
import { conversations, messages, appSettingsTable, brandProfilesTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { notifyChatLeadHot } from "./telegram.service.js";
import { buildEnhancedIndustryContext } from "../lib/industryAiContext.js";

// ─── Lead Detection ───────────────────────────────────────────────────────────

const HOT_LEAD_SIGNALS = [
  "precio", "cotización", "cuánto cuesta", "cuanto vale", "visita", "instalar en mi",
  "mi casa", "mi negocio", "mi empresa", "mi local", "quiero instalar", "quiero contratar",
  "cuándo pueden", "cuando pueden", "agendar", "cita", "reunión", "llamar", "financiación",
  "crédito", "cuota", "pagar a plazos", "decidí", "decidi", "ya quiero", "avanzar",
  "comparando", "otro proveedor", "factura alta", "factura de energía", "cuánto ahorro"
];

function isHotLead(message: string): boolean {
  const lower = message.toLowerCase();
  return HOT_LEAD_SIGNALS.some(signal => lower.includes(signal));
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

export async function getOrCreateSession(sessionId: string): Promise<number> {
  // Session ID used as conversation title with prefix to identify chatbot convos
  const title = `chatbot:${sessionId}`;

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.title, title))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({ title, userId: null })
    .returning({ id: conversations.id });

  return created.id;
}

async function getHistory(conversationId: number): Promise<Array<{ role: string; content: string }>> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(20);

  return rows;
}

async function saveMessages(conversationId: number, userMsg: string, assistantMsg: string): Promise<void> {
  await db.insert(messages).values([
    { conversationId, role: "user", content: userMsg },
    { conversationId, role: "assistant", content: assistantMsg },
  ]);
}

// ─── Dynamic system prompt from brand profile ─────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  try {
    // Load brand profile (first available — the main configured brand)
    const [profile] = await db
      .select({
        companyName: brandProfilesTable.companyName,
        industry: brandProfilesTable.industry,
        subIndustry: brandProfilesTable.subIndustry,
        subIndustries: brandProfilesTable.subIndustries,
        audienceDescription: brandProfilesTable.audienceDescription,
        defaultLocation: brandProfilesTable.defaultLocation,
        brandTone: brandProfilesTable.brandTone,
      })
      .from(brandProfilesTable)
      .limit(1);

    // Load extra knowledge added from admin panel
    const [knowledgeRow] = await db
      .select({ value: appSettingsTable.value })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "chatbot_knowledge"));

    const knowledge = knowledgeRow?.value?.trim();
    const extraKnowledge = knowledge && knowledge.length > 5
      ? `

═══ INFORMACIÓN ADICIONAL DE LA EMPRESA ═══
${knowledge}`
      : "";

    const companyName = profile?.companyName || "nuestra empresa";
    const industry    = profile?.industry    || "";
    const subIndustrySource = profile?.subIndustries || profile?.subIndustry || "";
    const industryContext = buildEnhancedIndustryContext(industry, subIndustrySource) || industry;
    const audience    = profile?.audienceDescription || "";
    const location    = profile?.defaultLocation || "";
    const tone        = profile?.brandTone   || "profesional y amigable";

    const brandLines = [
      industryContext ? `Industria y especialidad: ${industryContext}` : "",
      audience        ? `Público objetivo: ${audience}` : "",
      location        ? `Ubicación: ${location}` : "",
      tone            ? `Tono de comunicación: ${tone}` : "",
    ].filter(Boolean).join("
");

    return `Eres el asistente virtual de ${companyName}. Tu misión es responder preguntas de visitantes con claridad, honestidad y en el tono de la marca — y convertirlos en clientes potenciales calificados.

${brandLines ? `CONTEXTO DE LA MARCA:
${brandLines}` : ""}${extraKnowledge}

INSTRUCCIONES:
• Sé cálido, directo y útil — nunca genérico ni robótico
• Respuestas breves (máximo 3-4 párrafos)
• Usa la industria y las especialidades del negocio para responder con ejemplos más concretos
• Si preguntan algo que no sabes, sé honesto y sugiere contactar a la empresa directamente
• Si muestran interés real en comprar o contratar, anima a dar el siguiente paso (contacto, visita, demo)
• Responde siempre en el idioma en que te hablen`;
  } catch {
    return "Eres un asistente virtual útil y amigable. Responde preguntas de visitantes con claridad y honestidad. Sé conciso (máximo 3 párrafos) y sugiere contactar a la empresa si no sabes algo.";
  }
}

// ─── Main Chat Function ───────────────────────────────────────────────────────

export async function processChat(
  sessionId: string,
  userMessage: string,
  visitorName?: string,
): Promise<{ reply: string; isHotLead: boolean; conversationId: number }> {

  const conversationId = await getOrCreateSession(sessionId);
  const history = await getHistory(conversationId);
  const systemContent = await buildSystemPrompt();

  const apiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent },
    ...history.map(h => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    max_completion_tokens: 500,
    messages: apiMessages,
  });

  const reply = response.choices[0]?.message?.content?.trim() ?? "Disculpa, tuve un problema técnico. ¿Puedes repetir tu pregunta?";

  await saveMessages(conversationId, userMessage, reply);

  const hotLead = isHotLead(userMessage) || isHotLead(reply);

  if (hotLead) {
    const conversationText = [
      ...history.map(h => `${h.role === "user" ? "👤 Visitante" : "🤖 Chatbot IA"}: ${h.content}`),
      `👤 Visitante: ${userMessage}`,
      `🤖 Chatbot IA: ${reply}`,
    ].join("

");

    await notifyChatLeadHot(conversationId, visitorName ?? "Visitante anónimo", conversationText).catch(() => {});
  }

  return { reply, isHotLead: hotLead, conversationId };
}

// ─── Admin: List conversations ─────────────────────────────────────────────────

export async function listChatConversations(limit = 50): Promise<Array<{
  id: number;
  sessionId: string;
  createdAt: Date;
  messageCount: number;
  lastMessage: string;
  isHot: boolean;
}>> {
  const convs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.title, conversations.title)) // all
    .orderBy(desc(conversations.createdAt))
    .limit(limit);

  const chatbotConvs = convs.filter(c => c.title.startsWith("chatbot:"));

  const results = await Promise.all(chatbotConvs.map(async (conv) => {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.createdAt))
      .limit(10);

    const lastMsg = msgs[0];
    const allText = msgs.map(m => m.content).join(" ").toLowerCase();
    const isHot = HOT_LEAD_SIGNALS.some(s => allText.includes(s));

    return {
      id: conv.id,
      sessionId: conv.title.replace("chatbot:", ""),
      createdAt: conv.createdAt,
      messageCount: msgs.length,
      lastMessage: lastMsg?.content?.slice(0, 120) ?? "",
      isHot,
    };
  }));

  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getConversationMessages(conversationId: number) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}
