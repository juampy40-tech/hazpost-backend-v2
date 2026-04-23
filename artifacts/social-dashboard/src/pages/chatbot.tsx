import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Code2, Copy, Check, Flame, User, Bot, ChevronRight, BookOpen, Save, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const API = import.meta.env.VITE_API_URL ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatConversation {
  id: number;
  sessionId: string;
  createdAt: string;
  messageCount: number;
  lastMessage: string;
  isHot: boolean;
}

interface ChatMessage {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  return `hace ${Math.round(diff / 86400)} d`;
}

// ─── Widget Code ──────────────────────────────────────────────────────────────

const WIDGET_CODE = `<!-- HazPost Chat Widget — pega esto antes de </body> en tu web -->
<script src="https://hazpost.app/eco-chat-widget.js"></script>`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatbotPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [knowledge, setKnowledge] = useState("");
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [loadingKnowledge, setLoadingKnowledge] = useState(true);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConversations(); loadKnowledge(); }, []);
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadConversations() {
    setLoadingConvs(true);
    try {
      const res = await fetch(`${API}/api/chatbot/conversations`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingConvs(false);
    }
  }

  async function loadMessages(conv: ChatConversation) {
    setSelectedConv(conv);
    setLoadingMsgs(true);
    try {
      const res = await fetch(`${API}/api/chatbot/conversations/${conv.id}/messages`, { credentials: "include" });
      if (res.ok) setMessages(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function loadKnowledge() {
    setLoadingKnowledge(true);
    try {
      const res = await fetch(`${API}/api/settings`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as Record<string, string>;
        setKnowledge(data["chatbot_knowledge"] ?? "");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingKnowledge(false);
    }
  }

  async function saveKnowledge() {
    setSavingKnowledge(true);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatbot_knowledge: knowledge }),
      });
      if (res.ok) {
        toast({ title: "Conocimiento guardado", description: "El chatbot lo usará en sus próximas respuestas." });
      } else {
        toast({ title: "Error al guardar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setSavingKnowledge(false);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(WIDGET_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast({ title: "Código copiado", description: "Pégalo en WordPress antes del </body>" });
  }

  const hotCount = conversations.filter(c => c.isHot).length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0077FF] to-[#00C2FF] flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chatbot IA</h1>
          <p className="text-sm text-gray-500">Asistente virtual para tus prospectos</p>
        </div>
        <div className="ml-auto flex gap-2">
          {hotCount > 0 && (
            <Badge className="bg-orange-500 text-white gap-1">
              <Flame className="w-3 h-3" /> {hotCount} lead{hotCount !== 1 ? "s" : ""} caliente{hotCount !== 1 ? "s" : ""}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={loadConversations}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
        </div>
      </div>

      {/* Install Banner — admin only */}
      {isAdmin && (
        <Card className="border-[#0077FF]/30 bg-gradient-to-r from-[#0077FF]/5 to-[#00C2FF]/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Code2 className="w-4 h-4 text-[#0077FF]" />
              Instalar en tu sitio web (WordPress)
            </CardTitle>
            <CardDescription>Copia este código y pégalo en tu WordPress antes del &lt;/body&gt;</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-sm overflow-x-auto font-mono leading-relaxed">
                {WIDGET_CODE}
              </pre>
              <Button
                size="sm"
                className="absolute top-3 right-3 gap-1"
                onClick={copyCode}
                variant="secondary"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              En WordPress: <strong>Apariencia → Editor de temas → footer.php</strong> (o usa el plugin "Insert Headers and Footers")
            </p>
          </CardContent>
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversations List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">
              Conversaciones ({conversations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingConvs ? (
              <div className="p-6 text-center text-sm text-gray-400">Cargando...</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Aún no hay conversaciones.<br />Instala el widget en tu sitio web para empezar.
              </div>
            ) : (
              <div className="divide-y max-h-[480px] overflow-y-auto">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => loadMessages(conv)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedConv?.id === conv.id ? "bg-[#0077FF]/5 border-l-2 border-[#0077FF]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${conv.isHot ? "bg-orange-500" : "bg-gray-400"}`}>
                          {conv.isHot ? <Flame className="w-4 h-4" /> : <User className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium text-gray-700 truncate">
                              Visitante #{conv.id}
                            </span>
                            {conv.isHot && <Badge className="text-[10px] h-4 px-1 bg-orange-500 text-white">🔥 Hot</Badge>}
                          </div>
                          <p className="text-xs text-gray-400 truncate">{conv.lastMessage || "Sin mensajes"}</p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-[10px] text-gray-400">{timeAgo(conv.createdAt)}</span>
                        <div className="text-[10px] text-gray-400">{conv.messageCount} msg</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message Viewer */}
        <Card className="lg:col-span-2">
          {selectedConv ? (
            <>
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      Conversación #{selectedConv.id}
                      {selectedConv.isHot && <Badge className="ml-2 bg-orange-500 text-white text-xs">🔥 Lead caliente</Badge>}
                    </CardTitle>
                    <CardDescription className="text-xs">{timeAgo(selectedConv.createdAt)} · {selectedConv.messageCount} mensajes</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[400px] overflow-y-auto p-4 space-y-3 bg-gray-50">
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center h-full text-sm text-gray-400">Cargando...</div>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0077FF] to-[#00C2FF] flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Bot className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-[#0077FF] text-white rounded-br-sm"
                            : "bg-white text-gray-800 rounded-bl-sm shadow-sm"
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-blue-100" : "text-gray-400"}`}>
                            {new Date(msg.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        {msg.role === "user" && (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <User className="w-3.5 h-3.5 text-gray-500" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={msgEndRef} />
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-full min-h-[300px]">
              <div className="text-center text-gray-400">
                <ChevronRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Selecciona una conversación para verla</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Knowledge Base — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="w-4 h-4 text-[#0077FF]" />
              Base de conocimiento
            </CardTitle>
            <CardDescription>
              Agrega preguntas frecuentes, respuestas, objeciones comunes, o cualquier información que quieras que el chatbot sepa. El bot la usará en sus respuestas automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Conocimiento adicional para el chatbot</Label>
              <Textarea
                value={knowledge}
                onChange={e => setKnowledge(e.target.value)}
                placeholder={`Ejemplos:\n\nQ: ¿Tienen garantía post-instalación?\nA: Sí, ofrecemos 1 año de mantenimiento incluido y soporte técnico por 5 años.\n\nQ: ¿Atienden a empresas en Bogotá?\nA: Por ahora solo atendemos Cali y el Valle del Cauca.\n\nNota importante: los descuentos solo aplican en proyectos >5 kWp.`}
                rows={8}
                className="mt-1.5 font-mono text-sm"
                disabled={loadingKnowledge}
              />
              <p className="text-xs text-gray-400 mt-1">El bot lee esto antes de cada respuesta. Escribe en formato pregunta-respuesta para mejores resultados.</p>
            </div>
            <Button onClick={saveKnowledge} disabled={savingKnowledge} className="gap-2 bg-[#0077FF] hover:bg-[#0066DD]">
              {savingKnowledge ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar conocimiento
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
