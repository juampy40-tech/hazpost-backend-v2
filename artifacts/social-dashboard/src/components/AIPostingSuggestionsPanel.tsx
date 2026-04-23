import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw, Lightbulb, ChevronDown } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DaySuggestion { num: number; name: string; }
interface ContentSuggestion { days: DaySuggestion[]; hours: string[]; source: "ai" | "default"; tip: string; weeklyTarget: { min: number; max: number }; }
interface PostingSuggestions {
  hasRealData: boolean;
  aiSlotsCount: number;
  suggestions: {
    instagram: Record<string, ContentSuggestion>;
    tiktok: Record<string, ContentSuggestion>;
  };
}

const CT_META: Record<string, { icon: string; label: string; igColor: string; tkColor: string }> = {
  reel:     { icon: "🎬", label: "Reels",      igColor: "from-pink-500/20 to-rose-500/10 border-pink-500/30",     tkColor: "from-cyan-500/20 to-sky-500/10 border-cyan-500/30" },
  image:    { icon: "📷", label: "Fotos",      igColor: "from-purple-500/20 to-pink-500/10 border-purple-500/30", tkColor: "from-blue-500/20 to-sky-500/10 border-blue-500/30" },
  carousel: { icon: "🎠", label: "Carruseles", igColor: "from-orange-500/20 to-amber-500/10 border-orange-500/30", tkColor: "from-teal-500/20 to-cyan-500/10 border-teal-500/30" },
  story:    { icon: "📖", label: "Historias",  igColor: "from-fuchsia-500/20 to-pink-500/10 border-fuchsia-500/30", tkColor: "from-indigo-500/20 to-blue-500/10 border-indigo-500/30" },
};

const CT_ORDER = ["reel", "image", "carousel", "story"];

function CompactCard({ ct, data, platform }: { ct: string; data: ContentSuggestion; platform: "instagram" | "tiktok" }) {
  const meta = CT_META[ct] ?? { icon: "📌", label: ct, igColor: "border-border/30", tkColor: "border-border/30" };
  const gradClass = platform === "instagram" ? meta.igColor : meta.tkColor;
  const dayColor = platform === "instagram" ? "bg-pink-500/15 text-pink-300 border-pink-500/25" : "bg-cyan-500/15 text-cyan-300 border-cyan-500/25";

  return (
    <div className={`bg-gradient-to-br ${gradClass} border rounded-lg p-2 flex flex-col gap-1.5 min-w-0`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold text-foreground/90 flex items-center gap-1 truncate">
          <span>{meta.icon}</span>
          <span className="truncate">{meta.label}</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {data.weeklyTarget && (
            <span className="text-[9px] font-semibold text-muted-foreground/80 whitespace-nowrap">
              {data.weeklyTarget.min}–{data.weeklyTarget.max}/sem
            </span>
          )}
          {data.source === "ai" && (
            <Sparkles className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
          )}
        </div>
      </div>

      {/* Days — abbreviated */}
      <div className="flex flex-wrap gap-0.5">
        {data.days.map(d => (
          <span key={d.num} className={`text-[9px] font-semibold px-1 py-0.5 rounded border ${dayColor}`}>
            {d.name.slice(0, 3)}
          </span>
        ))}
      </div>

      {/* Hours */}
      <div className="flex flex-wrap gap-0.5">
        {data.hours.map(h => (
          <span key={h} className="text-[9px] text-muted-foreground bg-white/5 border border-border/20 px-1 py-0.5 rounded">
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AIPostingSuggestionsPanel({ collapsible = true }: { collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);

  const { data: suggData, isLoading, isError, refetch } = useQuery<PostingSuggestions>({
    queryKey: ["posting-suggestions"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/analytics/posting-suggestions`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("suggestions error");
      return r.json();
    },
    staleTime: 10 * 60_000,
    enabled: open,
  });

  return (
    <div className="rounded-xl border border-primary/20 bg-black/20 overflow-hidden">
      {collapsible ? (
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary/80 hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <Lightbulb className="w-4 h-4 text-[#0077FF] shrink-0" />
          <span>Sugerencias de publicación — IA</span>
          <ChevronDown className={`w-4 h-4 ml-auto transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-primary/10">
          <Lightbulb className="w-4 h-4 text-[#0077FF]" />
          <span className="text-sm font-semibold text-primary/80">Sugerencias de publicación — IA</span>
        </div>
      )}

      {open && (
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-xs">Cargando sugerencias…</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
              <span className="text-xs text-center">No se pudieron cargar las sugerencias.</span>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reintentar
              </button>
            </div>
          ) : suggData ? (
            <>
              {/* Source badge */}
              <div className={`flex items-center gap-1.5 text-[10px] rounded px-2 py-1 ${
                suggData.hasRealData
                  ? "text-emerald-400 bg-emerald-400/10 border border-emerald-400/20"
                  : "text-muted-foreground bg-white/5 border border-border/20"
              }`}>
                <Sparkles className="w-3 h-3 shrink-0" />
                {suggData.hasRealData
                  ? `Horarios según tu audiencia real (${suggData.aiSlotsCount} franjas analizadas)`
                  : "Horarios estándar — conecta Instagram para personalizar"}
              </div>

              {/* 4-column grid: fila 1 = Instagram, fila 2 = TikTok */}
              <div className="space-y-1">
                {/* Encabezados de columna */}
                <div className="flex gap-1.5 pl-[3.75rem]">
                  {CT_ORDER.map(ct => (
                    <div key={ct} className="flex-1 text-center text-[9px] text-muted-foreground/60 font-semibold">
                      {CT_META[ct]?.icon} {CT_META[ct]?.label}
                    </div>
                  ))}
                </div>

                {/* Fila Instagram */}
                {suggData.suggestions.instagram && Object.keys(suggData.suggestions.instagram).length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <div className="flex flex-col items-center gap-0.5 text-[9px] font-bold text-pink-300 pt-2 w-14 shrink-0">
                      <span>📸</span><span>IG</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 flex-1 min-w-0">
                      {CT_ORDER.map(ct => {
                        const data = suggData.suggestions.instagram[ct];
                        if (!data) return <div key={ct} className="rounded-lg border border-border/10 bg-white/3 p-2 opacity-20 flex items-center justify-center text-[10px]">{CT_META[ct]?.icon ?? "—"}</div>;
                        return <CompactCard key={ct} ct={ct} data={data} platform="instagram" />;
                      })}
                    </div>
                  </div>
                )}

                {/* Fila TikTok */}
                {suggData.suggestions.tiktok && Object.keys(suggData.suggestions.tiktok).length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <div className="flex flex-col items-center gap-0.5 text-[9px] font-bold text-cyan-300 pt-2 w-14 shrink-0">
                      <span>🎵</span><span>TK</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 flex-1 min-w-0">
                      {CT_ORDER.map(ct => {
                        const data = suggData.suggestions.tiktok[ct];
                        if (!data) return <div key={ct} className="rounded-lg border border-border/10 bg-white/3 p-2 opacity-20 flex items-center justify-center text-[10px]">{CT_META[ct]?.icon ?? "—"}</div>;
                        return <CompactCard key={ct} ct={ct} data={data} platform="tiktok" />;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
