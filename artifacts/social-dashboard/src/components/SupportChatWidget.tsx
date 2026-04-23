import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Loader2, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API = import.meta.env.VITE_API_URL ?? "";

interface Msg {
  id: number;
  senderRole: "user" | "admin";
  content: string;
  createdAt: string;
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export default function SupportChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Don't show for non-logged-in or admin users (admins use the admin panel)
  if (!user || user.role === "admin") return null;

  const fetchMessages = async (markRead = false) => {
    try {
      const r = await fetch(`${API}/api/support/messages`, { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setMessages(d.messages ?? []);
      if (markRead) setUnread(0);
    } catch {}
  };

  const fetchUnread = async () => {
    try {
      const r = await fetch(`${API}/api/support/unread`, { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setUnread(d.unread ?? 0);
    } catch {}
  };

  // Poll for unread count when closed, messages when open
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (open) {
      setLoading(true);
      fetchMessages(true).finally(() => setLoading(false));
      pollRef.current = setInterval(() => fetchMessages(true), 8000);
    } else {
      fetchUnread();
      pollRef.current = setInterval(fetchUnread, 15000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      const r = await fetch(`${API}/api/support/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (r.ok) {
        const d = await r.json();
        setMessages(prev => [...prev, d.message]);
      }
    } catch {}
    setSending(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#00C2FF] text-white shadow-[0_0_20px_rgba(0,194,255,0.5)] flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="Soporte HazPost"
      >
        {open ? <ChevronDown className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 flex flex-col rounded-2xl border border-[#00C2FF]/30 bg-[#0a0a0f] shadow-[0_0_40px_rgba(0,194,255,0.15)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#00C2FF]/10 border-b border-[#00C2FF]/20">
            <div className="w-8 h-8 rounded-full bg-[#00C2FF] flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Soporte HazPost</p>
              <p className="text-[11px] text-[#00C2FF]/70">El equipo te responde pronto</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[260px] max-h-[360px]">
            {loading && messages.length === 0 && (
              <div className="flex justify-center pt-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#00C2FF]/50" />
              </div>
            )}

            {!loading && messages.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <MessageCircle className="w-8 h-8 text-[#00C2FF]/30 mx-auto" />
                <p className="text-xs text-muted-foreground">
                  ¿Tienes una duda o inquietud?<br />Escríbenos, estamos aquí para ayudarte.
                </p>
              </div>
            )}

            {messages.map(m => (
              <div key={m.id} className={`flex ${m.senderRole === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                    m.senderRole === "user"
                      ? "bg-[#00C2FF] text-white rounded-br-sm"
                      : "bg-white/10 text-white rounded-bl-sm"
                  }`}
                >
                  {m.senderRole === "admin" && (
                    <p className="text-[10px] font-semibold text-[#00C2FF]/80 mb-0.5">Equipo HazPost</p>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className={`text-[10px] mt-1 ${m.senderRole === "user" ? "text-white/60 text-right" : "text-white/40"}`}>
                    {timeLabel(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-white/10 flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Escribe tu mensaje…"
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-muted-foreground resize-none focus:outline-none focus:border-[#00C2FF]/50 transition-colors"
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-xl bg-[#00C2FF] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#00C2FF]/90 transition-colors shrink-0 self-end"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
