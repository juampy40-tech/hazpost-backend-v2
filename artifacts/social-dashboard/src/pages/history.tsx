import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetPublishLog } from "@workspace/api-client-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ExternalLink, CheckCircle2, XCircle, MinusCircle, Instagram, PlaySquare, Globe,
  Download, Copy, RefreshCw, Image as ImageIcon, Search, Film, LayoutGrid,
  Bot, Smartphone, BookImage, Link2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PLATFORM_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  instagram: { icon: <Instagram className="w-3 h-3" />, label: "Instagram", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  tiktok:    { icon: <PlaySquare className="w-3 h-3" />, label: "TikTok",    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  facebook:  { icon: <Globe className="w-3 h-3" />,     label: "Facebook",  color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
};

const CONTENT_TYPE_META: Record<string, { icon: React.ReactNode; label: string }> = {
  image:    { icon: <ImageIcon className="w-3 h-3" />,   label: "Imagen" },
  reel:     { icon: <Film className="w-3 h-3" />,        label: "Reel" },
  carousel: { icon: <LayoutGrid className="w-3 h-3" />,  label: "Carrusel" },
};

function SourceBadge({ source }: { source?: string | null }) {
  if (source === "manual") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-300">
        <Smartphone className="w-2.5 h-2.5" /> Manual
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
      <Bot className="w-2.5 h-2.5" /> Auto
    </span>
  );
}

function PostCard({ log }: { log: any }) {
  const { toast } = useToast();
  const [imgError, setImgError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [markingPublished, setMarkingPublished] = useState(false);
  const [markedDone, setMarkedDone] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const platformMeta = PLATFORM_META[log.platform] ?? PLATFORM_META.instagram;
  const contentTypeMeta = log.contentType ? (CONTENT_TYPE_META[log.contentType] ?? null) : null;
  const imageUrl = log.postId && log.postId > 0 ? `${BASE}/api/posts/${log.postId}/image` : null;

  const handleCopyCaption = () => {
    if (!log.caption) return;
    const text = log.hashtags ? `${log.caption}\n\n${log.hashtags}` : log.caption;
    navigator.clipboard.writeText(text);
    toast({ title: "✓ Copiado", description: "Caption y hashtags listos para pegar." });
  };

  const slideCount: number = log.slideCount ?? 1;
  const isReel = log.contentType === "reel";
  const [downloadingVideo, setDownloadingVideo] = useState(false);

  const handleDownload = async () => {
    if (!log.postId || log.postId < 0) return;

    // Reels: fetch presigned URL from object storage then trigger download
    if (isReel) {
      setDownloadingVideo(true);
      try {
        const res = await fetch(`${BASE}/api/posts/${log.postId}/video`, { credentials: "include" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast({ title: "Sin video", description: err.error || "No hay video guardado para este reel.", variant: "destructive" });
          return;
        }
        const { url } = await res.json();
        const a = document.createElement("a");
        a.href = url;
        a.download = `hazpost-reel-${log.postId}.mp4`;
        a.target = "_blank";
        a.click();
      } catch {
        toast({ title: "Error", description: "No se pudo obtener el video.", variant: "destructive" });
      } finally {
        setDownloadingVideo(false);
      }
      return;
    }

    // Images / carousels: download JPEG(s)
    if (!imageUrl) return;
    if (slideCount > 1) {
      for (let i = 0; i < slideCount; i++) {
        const a = document.createElement("a");
        a.href = `${BASE}/api/posts/${log.postId}/image/${i}`;
        a.download = `hazpost-${log.postId}-slide${i + 1}.jpg`;
        a.click();
      }
    } else {
      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = `hazpost-${log.postId}.jpg`;
      a.click();
    }
  };

  const handleRetry = async () => {
    if (!log.postId || log.postId < 0) return;
    setRetrying(true);
    try {
      const res = await fetch(`${BASE}/api/posts/${log.postId}/retry`, { method: "POST" });
      const data = await res.json();
      if (data.status === "published") {
        toast({ title: "¡Publicado!", description: "El post fue publicado exitosamente." });
      } else {
        toast({ title: "Reintentando", description: "Post programado para reintentar." });
      }
    } catch {
      toast({ title: "Error", description: "No se pudo reintentar.", variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  const handleMarkPublished = async () => {
    if (!log.id || log.id < 0) return;
    setMarkingPublished(true);
    try {
      const res = await fetch(`${BASE}/api/publish-log/${log.id}/mark-published`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      setMarkedDone(true);
      toast({ title: "✓ Marcado como publicado", description: "El historial refleja la publicación manual." });
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar.", variant: "destructive" });
    } finally {
      setMarkingPublished(false);
    }
  };

  return (
    <Card className="glass-card overflow-hidden group hover:border-primary/20 transition-all duration-200">
      <div className="flex gap-0">
        {/* Thumbnail */}
        <div
          className="w-24 shrink-0 relative bg-black/40 cursor-pointer"
          style={{ minHeight: 96 }}
          onClick={() => setExpanded(e => !e)}
        >
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt="Post"
              className="w-full h-full object-cover"
              style={{ aspectRatio: "1/1" }}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-24 flex items-center justify-center">
              <ImageIcon className="w-7 h-7 text-white/10" />
            </div>
          )}
          {/* Status dot */}
          <div className="absolute top-1 left-1">
            {log.status === "published"
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
              : log.status === "crossposted"
              ? <Link2 className="w-3.5 h-3.5 text-violet-400 drop-shadow-[0_0_4px_rgba(167,139,250,0.8)]" />
              : log.status === "skipped"
              ? <MinusCircle className="w-3.5 h-3.5 text-muted-foreground/60" />
              : <XCircle className="w-3.5 h-3.5 text-destructive" />
            }
          </div>
        </div>

        {/* Content */}
        <CardContent className="flex-1 p-2.5 space-y-1.5 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-1 flex-wrap">
            {log.postNumber != null && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border border-primary/30 bg-primary/10 text-primary tabular-nums">
                #{log.postNumber}
              </span>
            )}
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${platformMeta.color}`}>
              {platformMeta.icon} {platformMeta.label}
            </span>
            {contentTypeMeta && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-border/40 text-muted-foreground bg-white/5">
                {contentTypeMeta.icon} {contentTypeMeta.label}
              </span>
            )}
            <SourceBadge source={log.source} />
            <span className="ml-auto text-[9px] text-muted-foreground shrink-0">
              {log.publishedAt ? format(parseISO(log.publishedAt), "dd MMM · HH:mm", { locale: es }) : "—"}
            </span>
          </div>

          {/* Caption */}
          {log.caption && (
            <p
              className={`text-xs text-foreground/80 leading-snug cursor-pointer select-none ${expanded ? "" : "line-clamp-2"}`}
              onClick={() => setExpanded(e => !e)}
            >
              {log.caption}
            </p>
          )}

          {/* Error / Skip / Crosspost message */}
          {log.status === "failed" && log.errorMessage && (() => {
            const isIgNotLinked = log.errorMessage.includes("[IG_NOT_LINKED]");
            if (isIgNotLinked) {
              return (
                <p className="text-[10px] text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-0.5 flex items-center gap-1 flex-wrap">
                  ⚠ Instagram no vinculado —{" "}
                  <a href="/settings" className="underline underline-offset-2 hover:text-amber-300 transition-colors">
                    Reconectar en Configuración
                  </a>
                  {" "}· Asegúrate de que tu cuenta sea Business o Creadora
                </p>
              );
            }
            return (
              <p className="text-[10px] text-destructive/80 bg-destructive/5 border border-destructive/20 rounded px-2 py-0.5 line-clamp-1" title={log.errorMessage}>
                ⚠ {log.errorMessage}
              </p>
            );
          })()}
          {log.status === "skipped" && (
            <p className="text-[10px] text-muted-foreground/60 bg-white/5 border border-border/20 rounded px-2 py-0.5 line-clamp-1">
              — Omitido (pendiente App Review de Meta)
            </p>
          )}
          {log.status === "crossposted" && (
            <p className="text-[10px] text-violet-400/80 bg-violet-500/5 border border-violet-500/20 rounded px-2 py-0.5 flex items-center gap-1">
              <Link2 className="w-2.5 h-2.5 shrink-0" /> Via Instagram — activa &quot;Compartir en Facebook&quot; en tu app de Instagram
            </p>
          )}

          {/* Hashtags (collapsed) */}
          {log.hashtags && expanded && (
            <p className="text-[10px] text-primary/50 leading-relaxed">{log.hashtags}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 pt-0.5">
            {(imageUrl || isReel) && log.postId > 0 && (
              <button
                onClick={handleDownload}
                disabled={downloadingVideo}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-primary/10 disabled:opacity-50"
              >
                {downloadingVideo
                  ? <><RefreshCw className="w-3 h-3 animate-spin" /> Descargando…</>
                  : <><Download className="w-3 h-3" /> {isReel ? "Descargar video" : "Descargar"}</>
                }
              </button>
            )}
            {log.caption && (
              <button
                onClick={handleCopyCaption}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-primary/10"
              >
                <Copy className="w-3 h-3" /> Copiar caption
              </button>
            )}
            {log.postUrl && (
              <a
                href={log.postUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-secondary transition-colors px-1.5 py-0.5 rounded hover:bg-secondary/10 ml-auto"
              >
                Ver en red <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {(log.status === "failed" && !markedDone) && log.postId > 0 && (
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={handleRetry}
                  disabled={retrying || markingPublished}
                  className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors px-1.5 py-0.5 rounded hover:bg-amber-400/10"
                >
                  <RefreshCw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} /> Reintentar
                </button>
                {log.id > 0 && (
                  <button
                    onClick={handleMarkPublished}
                    disabled={retrying || markingPublished}
                    className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors px-1.5 py-0.5 rounded hover:bg-emerald-400/10"
                    title="Lo publiqué manualmente — marcar como publicado"
                  >
                    {markingPublished
                      ? <RefreshCw className="w-3 h-3 animate-spin" />
                      : <CheckCircle2 className="w-3 h-3" />
                    } Publicado a mano
                  </button>
                )}
              </div>
            )}
            {markedDone && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400/70 ml-auto">
                <CheckCircle2 className="w-3 h-3" /> Marcado como publicado
              </span>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

const FILTER_BUTTONS = {
  platform: [
    { value: "all",       label: "Todas las plataformas" },
    { value: "instagram", label: "Instagram" },
    { value: "tiktok",    label: "TikTok" },
    { value: "facebook",  label: "Facebook" },
  ],
  source: [
    { value: "all",    label: "Todas las fuentes" },
    { value: "auto",   label: "🤖 Auto-publicadas" },
    { value: "manual", label: "📱 Manuales" },
  ],
  status: [
    { value: "all",         label: "Todos los estados" },
    { value: "published",   label: "✓ Exitosas" },
    { value: "crossposted", label: "↗ Via Instagram" },
    { value: "failed",      label: "✗ Fallidas" },
  ],
  contentType: [
    { value: "all",      label: "Todos los tipos" },
    { value: "image",    label: "Imagen" },
    { value: "reel",     label: "Reel" },
    { value: "carousel", label: "Carrusel" },
  ],
};

function FilterBar({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
            value === opt.value
              ? "bg-primary/20 text-primary border-primary/50"
              : "bg-black/20 text-muted-foreground border-border/30 hover:border-border/60"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function History() {
  const { data: logs, isLoading, refetch, isFetching } = useGetPublishLog({ limit: 300 });
  const { toast } = useToast();

  const [filterPlatform, setFilterPlatform]     = useState("all");
  const [filterStatus, setFilterStatus]         = useState("all");
  const [filterSource, setFilterSource]         = useState("all");
  const [filterContentType, setFilterContentType] = useState("all");
  const [search, setSearch]                     = useState("");

  const all = logs ?? [];

  const filtered = useMemo(() => {
    return all.filter(l => {
      if (filterPlatform !== "all" && l.platform !== filterPlatform) return false;
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (filterSource !== "all") {
        const src = (l as any).source ?? "auto";
        if (src !== filterSource) return false;
      }
      if (filterContentType !== "all" && (l as any).contentType !== filterContentType) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!l.caption?.toLowerCase().includes(q) && !l.hashtags?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [all, filterPlatform, filterStatus, filterSource, filterContentType, search]);

  const stats = useMemo(() => ({
    total:       all.length,
    auto:        all.filter(l => !((l as any).source) || (l as any).source === "auto").length,
    manual:      all.filter(l => (l as any).source === "manual").length,
    exitosos:    all.filter(l => l.status === "published" || l.status === "crossposted").length,
    fallidos:    all.filter(l => l.status === "failed").length,
    crossposted: all.filter(l => l.status === "crossposted").length,
  }), [all]);

  const handleCopyAll = () => {
    const text = filtered
      .filter(l => l.caption)
      .map(l => l.hashtags ? `${l.caption}\n${l.hashtags}` : l.caption)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    toast({ title: "✓ Copiados", description: `${filtered.filter(l => l.caption).length} captions copiados al portapapeles.` });
  };

  return (
    <div className="space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookImage className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-display font-bold text-foreground drop-shadow-[0_0_15px_rgba(0,201,83,0.3)]">
              Biblioteca de Publicaciones
            </h1>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Aquí encuentras todo el contenido que ya fue publicado en tus redes sociales. Puedes descargar las imágenes o ver cuándo y en qué plataforma se publicó cada post.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-muted-foreground hover:text-primary shrink-0"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Total",      value: stats.total,    color: "text-foreground" },
          { label: "Auto",       value: stats.auto,     color: "text-emerald-400" },
          { label: "Manuales",   value: stats.manual,   color: "text-violet-400" },
          { label: "Exitosas",   value: stats.exitosos, color: "text-primary" },
          { label: "Fallidas",   value: stats.fallidos, color: "text-destructive" },
        ].map(s => (
          <Card key={s.label} className="glass-card">
            <CardContent className="p-3 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por caption o hashtag…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-black/30 border border-border/40 rounded-xl pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <FilterBar value={filterPlatform}     onChange={setFilterPlatform}     options={FILTER_BUTTONS.platform} />
        <div className="flex gap-3 flex-wrap">
          <FilterBar value={filterSource}      onChange={setFilterSource}      options={FILTER_BUTTONS.source} />
          <div className="w-px bg-border/20" />
          <FilterBar value={filterStatus}      onChange={setFilterStatus}      options={FILTER_BUTTONS.status} />
        </div>
        <FilterBar value={filterContentType}  onChange={setFilterContentType}  options={FILTER_BUTTONS.contentType} />
      </div>

      {/* Bulk copy */}
      {filtered.length > 0 && filtered.some(l => l.caption) && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{filtered.length} publicaciones</p>
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg border border-border/30 hover:border-primary/40 hover:bg-primary/5"
          >
            <Copy className="w-3.5 h-3.5" /> Copiar todos los captions
          </button>
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="glass-card overflow-hidden">
              <div className="flex gap-0">
                <div className="w-24 h-24 bg-white/5 animate-pulse shrink-0" />
                <CardContent className="flex-1 p-3 space-y-2">
                  <div className="h-3 bg-white/5 animate-pulse rounded w-40" />
                  <div className="h-3 bg-white/5 animate-pulse rounded w-full" />
                  <div className="h-3 bg-white/5 animate-pulse rounded w-3/4" />
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <BookImage className="w-8 h-8 opacity-20" />
            <p className="text-sm">
              {all.length === 0
                ? "La biblioteca está vacía — publica tu primer contenido para verlo aquí."
                : "Ninguna publicación coincide con los filtros."}
            </p>
            {all.length > 0 && (
              <button
                onClick={() => { setFilterPlatform("all"); setFilterStatus("all"); setFilterSource("all"); setFilterContentType("all"); setSearch(""); }}
                className="text-xs text-primary hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((log: any) => (
            <PostCard key={`${log.id}-${log.postId}`} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}
