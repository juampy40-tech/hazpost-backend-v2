import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Image as ImageIcon, ImageOff, Layers, Film, LayoutGrid, Loader2, ArrowLeft, ArrowRight, Database, Search, Sparkles, CheckCircle2, Camera, Upload, RefreshCw, Trash2, Video, Music, Type, Play, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BgRow = {
  id: number;
  postId: number;
  style: string;
  prompt: string;
  libraryUseCount: number;
  createdAt: string;
  contentType: string | null;
  caption: string | null;
  industryGroupSlug: string | null;
  groupDisplayName: string | null;
  isOwn: boolean;
};

type MediaItem = {
  id: number;
  type: string;
  mimeType: string;
  filename: string;
  label: string;
  createdAt: string;
};

type MusicTrack = {
  id: number;
  title: string;
  artist: string;
  duration: number;
  genre: string;
  sourceUrl: string;
};

type CustomFont = {
  id: string;
  name: string;
  family: string;
  mimeType: string;
  uploadedAt: string;
};

const STYLE_FILTER = [
  { value: "all", label: "Todos" },
  { value: "photorealistic", label: "Foto" },
  { value: "graphic", label: "Gráfico" },
  { value: "infographic", label: "Infografía" },
];

const CONTENT_TYPE_ICON: Record<string, React.ReactNode> = {
  image:     <ImageIcon className="w-3.5 h-3.5" />,
  reel:      <Film className="w-3.5 h-3.5" />,
  carousel:  <LayoutGrid className="w-3.5 h-3.5" />,
  story:     <Layers className="w-3.5 h-3.5" />,
};

const STYLE_LABEL: Record<string, string> = {
  photorealistic: "Foto",
  graphic:        "Gráfico",
  infographic:    "Infografía",
};

export default function Backgrounds() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [styleFilter, setStyleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const mediaUploadRef = useRef<HTMLInputElement | null>(null);

  const [isUploadingMusic, setIsUploadingMusic] = useState(false);
  const [musicUploadError, setMusicUploadError] = useState<string | null>(null);
  const musicUploadRef = useRef<HTMLInputElement | null>(null);

  const [isUploadingFont, setIsUploadingFont] = useState(false);
  const [fontUploadError, setFontUploadError] = useState<string | null>(null);
  const [pendingDeleteBgId, setPendingDeleteBgId] = useState<number | null>(null);
  const [pendingDeleteMediaId, setPendingDeleteMediaId] = useState<number | null>(null);
  const fontUploadRef = useRef<HTMLInputElement | null>(null);

  const { id: activeBusinessId, name: activeBusinessName, loaded: bizLoaded } = useActiveBusiness();
  const fromApproval = new URLSearchParams(window.location.search).get("from") === "approval";

  const { data: rows = [], isLoading } = useQuery<BgRow[]>({
    queryKey: ["backgrounds", activeBusinessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/backgrounds?businessId=${activeBusinessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando fondos");
      return res.json();
    },
    enabled: bizLoaded && !!activeBusinessId,
  });

  const { data: mediaItems = [], isLoading: isLoadingMedia } = useQuery<MediaItem[]>({
    queryKey: ["media-library", activeBusinessId],
    queryFn: async () => {
      const url = activeBusinessId
        ? `${BASE}/api/media?type=image&businessId=${activeBusinessId}`
        : `${BASE}/api/media?type=image`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando fotos");
      return res.json();
    },
    enabled: bizLoaded,
  });

  const { data: customTracks = [] } = useQuery<MusicTrack[]>({
    queryKey: ["music-custom"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/music?genre=personalizado`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.tracks ?? data ?? []).filter((t: MusicTrack) => t.sourceUrl?.startsWith("media:"));
    },
  });

  const { data: customFonts = [] } = useQuery<CustomFont[]>({
    queryKey: ["custom-fonts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/fonts`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.fonts ?? [];
    },
  });

  const unusedCount = rows.filter(r => (r.libraryUseCount ?? 0) === 0).length;

  const filtered = rows.filter((r) => {
    const matchStyle = styleFilter === "all" || r.style === styleFilter;
    const matchSearch = !search.trim() || (r.prompt ?? "").toLowerCase().includes(search.toLowerCase()) || (r.caption ?? "").toLowerCase().includes(search.toLowerCase());
    const matchUnused = !unusedOnly || (r.libraryUseCount ?? 0) === 0;
    return matchStyle && matchSearch && matchUnused;
  });

  const filteredOwn      = filtered.filter(r => r.isOwn);
  const filteredIndustry = filtered.filter(r => !r.isOwn);
  const industryGroupName = filteredIndustry[0]?.groupDisplayName ?? rows.find(r => !r.isOwn)?.groupDisplayName ?? "tu sector";

  const filteredMedia = mediaItems.filter(m => {
    if (!search.trim()) return true;
    return (m.filename ?? "").toLowerCase().includes(search.toLowerCase()) || (m.label ?? "").toLowerCase().includes(search.toLowerCase());
  });

  function useBackground(bgId: number) {
    navigate(`/approval?bgVariantId=${bgId}`);
  }

  function useMediaBackground(mediaId: number) {
    navigate(`/approval?mediaId=${mediaId}`);
  }

  const handleMediaUpload = async (file: File) => {
    setIsUploadingMedia(true);
    setUploadError(null);
    try {
      if (file.size > 20 * 1024 * 1024) {
        setUploadError("La imagen es demasiado grande. Máximo 20MB.");
        return;
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${BASE}/api/media`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          label: "",
          data: base64,
          type: "image",
          businessId: activeBusinessId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al subir" }));
        setUploadError(err.error ?? "Error al subir la imagen");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["media-library"] });
    } catch {
      setUploadError("Error al leer el archivo. Intenta de nuevo.");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleDeleteMedia = (id: number) => setPendingDeleteMediaId(id);
  const confirmDeleteMedia = async () => {
    if (!pendingDeleteMediaId) return;
    await fetch(`${BASE}/api/media/${pendingDeleteMediaId}`, { method: "DELETE", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["media-library"] });
    setPendingDeleteMediaId(null);
  };

  const handleDeleteBg = (id: number) => setPendingDeleteBgId(id);
  const confirmDeleteBg = async () => {
    if (!pendingDeleteBgId) return;
    try {
      const res = await fetch(`${BASE}/api/backgrounds/${pendingDeleteBgId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error(d.error || "Error al eliminar el fondo");
      }
      queryClient.invalidateQueries({ queryKey: ["backgrounds"] });
    } catch {
      console.error("Error de red al eliminar el fondo");
    } finally {
      setPendingDeleteBgId(null);
    }
  };

  const handleMusicUpload = async (file: File) => {
    setIsUploadingMusic(true);
    setMusicUploadError(null);
    try {
      if (file.size > 30 * 1024 * 1024) {
        setMusicUploadError("El archivo de audio es demasiado grande. Máximo 30 MB.");
        return;
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const title = file.name.replace(/\.[^/.]+$/, "");
      const res = await fetch(`${BASE}/api/music/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: base64, filename: file.name, mimeType: file.type, title }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al subir" }));
        setMusicUploadError(err.error ?? "Error al subir el audio");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["music-custom"] });
    } catch {
      setMusicUploadError("Error al leer el archivo. Intenta de nuevo.");
    } finally {
      setIsUploadingMusic(false);
    }
  };

  const handleDeleteTrack = async (id: number) => {
    if (!confirm("¿Eliminar esta pista de música personalizada?")) return;
    await fetch(`${BASE}/api/music/${id}`, { method: "DELETE", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["music-custom"] });
  };

  const handleFontUpload = async (file: File) => {
    setIsUploadingFont(true);
    setFontUploadError(null);
    try {
      if (file.size > 5 * 1024 * 1024) {
        setFontUploadError("El archivo de tipografía es demasiado grande. Máximo 5 MB.");
        return;
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const name = file.name.replace(/\.[^/.]+$/, "");
      const res = await fetch(`${BASE}/api/fonts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: base64, filename: file.name, mimeType: file.type, name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al subir" }));
        setFontUploadError(err.error ?? "Error al subir la tipografía");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["custom-fonts"] });
    } catch {
      setFontUploadError("Error al leer el archivo. Intenta de nuevo.");
    } finally {
      setIsUploadingFont(false);
    }
  };

  const handleDeleteFont = async (id: string) => {
    if (!confirm("¿Eliminar esta tipografía personalizada?")) return;
    await fetch(`${BASE}/api/fonts/${id}`, { method: "DELETE", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["custom-fonts"] });
  };

  return (
    <div className="space-y-6 pb-8">
      {/* ── Delete confirmations ── */}
      <AlertDialog open={pendingDeleteBgId !== null} onOpenChange={o => { if (!o) setPendingDeleteBgId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este fondo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el fondo de tu biblioteca. No afecta los posts ya publicados, pero no podrás volver a reutilizarlo. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteBg} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingDeleteMediaId !== null} onOpenChange={o => { if (!o) setPendingDeleteMediaId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta foto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta foto se eliminará de tu biblioteca de medios. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMedia} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground drop-shadow-[0_0_15px_rgba(0,119,255,0.4)]">
            Biblioteca de Fondos
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Aquí guardas los recursos visuales de tu marca: fondos generados por IA, fotos reales de tus instalaciones, música propia y tipografías personalizadas. Todo lo que subas o generes aquí se puede reutilizar en cualquier post sin costo adicional.
          </p>
          {activeBusinessName && (
            <p className="text-sm text-primary/80 font-medium mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-primary/60" />
              {activeBusinessName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {fromApproval && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/approval")}
              className="gap-1.5 border-border/40 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a la Cola
            </Button>
          )}
          {unusedCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span><span className="font-bold">{unusedCount}</span> sin usar</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-black/30 border border-border/30 rounded-lg px-4 py-2.5">
            <Database className="w-4 h-4 text-primary" />
            <span className="font-bold text-primary">{rows.length}</span> fondos IA ·&nbsp;
            <span className="font-bold text-secondary">{mediaItems.length}</span> fotos reales
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {STYLE_FILTER.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStyleFilter(value)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                styleFilter === value
                  ? "bg-primary/15 border-primary text-primary"
                  : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setUnusedOnly(!unusedOnly)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
            unusedOnly
              ? "bg-emerald-400/15 border-emerald-400 text-emerald-400"
              : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Sin usar
        </button>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descripción o nombre…"
            className="pl-8 h-9 bg-black/30 border-border/40 text-sm"
          />
        </div>
      </div>

      {/* ── Fotos Reales de Instalaciones ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-secondary" />
            <h2 className="text-lg font-display font-semibold text-secondary">Fotos Reales</h2>
            <span className="text-xs text-muted-foreground bg-secondary/10 border border-secondary/20 rounded-full px-2 py-0.5">
              {mediaItems.length} foto{mediaItems.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {uploadError && (
              <p className="text-xs text-red-400">{uploadError}</p>
            )}
            <input
              ref={mediaUploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) { handleMediaUpload(file); e.target.value = ""; }
              }}
            />
            <Button
              size="sm"
              onClick={() => mediaUploadRef.current?.click()}
              disabled={isUploadingMedia}
              variant="outline"
              className="h-8 text-xs gap-1.5 border-secondary/40 text-secondary hover:bg-secondary/10"
            >
              {isUploadingMedia
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Subiendo...</>
                : <><Upload className="w-3 h-3" /> Subir foto</>}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-1.5">Sube fotos de tus instalaciones, equipos o productos. Podrás usarlas como fondo en cualquier publicación desde la cola de aprobación.</p>

        {isLoadingMedia ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando fotos…
          </div>
        ) : filteredMedia.length === 0 ? (
          <button
            onClick={() => mediaUploadRef.current?.click()}
            className="w-full py-10 border-2 border-dashed border-border/30 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground/50 hover:border-secondary/40 hover:text-secondary/70 transition-colors"
          >
            <Camera className="w-8 h-8 opacity-40" />
            <p className="text-sm">Sube fotos de tus instalaciones para usarlas como fondos</p>
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredMedia.map(media => (
              <MediaCard
                key={media.id}
                media={media}
                onUse={() => useMediaBackground(media.id)}
                onDelete={() => handleDeleteMedia(media.id)}
              />
            ))}
            {/* Upload shortcut */}
            <button
              onClick={() => mediaUploadRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border/30 flex flex-col items-center justify-center gap-2 text-muted-foreground/40 hover:border-secondary/40 hover:text-secondary/60 transition-colors"
            >
              <Upload className="w-6 h-6" />
              <span className="text-[10px]">Agregar foto</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Fondos Generados por IA ── */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-display font-semibold text-primary">Generados por IA</h2>
          <span className="text-xs text-muted-foreground bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
            {rows.length} fondo{rows.length !== 1 ? "s" : ""}
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando biblioteca…
          </div>
        ) : rows.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-20 text-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                Aún no hay fondos generados. Genera tu primer post para empezar a construir la biblioteca.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ── Nivel 1: Mis fondos ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">Mis fondos</span>
                <span className="text-xs text-muted-foreground bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                  {filteredOwn.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Fondos creados por ti. Se reutilizan gratis en publicaciones futuras.</p>
              {filteredOwn.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 italic py-4 text-center">
                  {rows.filter(r => r.isOwn).length === 0
                    ? "Aún no tienes fondos propios. Genera tu primer post para empezar."
                    : "Ningún fondo propio coincide con los filtros."}
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredOwn.map((bg) => (
                    <BgCard key={bg.id} bg={bg} onUse={() => useBackground(bg.id)} onDelete={() => handleDeleteBg(bg.id)} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Nivel 2: Fondos del sector (otros países) ── */}
            {rows.some(r => !r.isOwn) && (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Fondos del sector — {industryGroupName}</span>
                  <span className="text-xs text-muted-foreground bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
                    {filteredIndustry.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Fondos de negocios de tu misma industria en otros países — úsalos como inspiración. Para ver esta sección, configura tu país en Configuración.</p>
                {filteredIndustry.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 italic py-4 text-center">
                    Ningún fondo del sector coincide con los filtros.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredIndustry.map((bg) => (
                      <BgCard key={bg.id} bg={bg} onUse={() => useBackground(bg.id)} onDelete={() => handleDeleteBg(bg.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Música Corporativa Propia ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-purple-400" />
            <h2 className="text-lg font-display font-semibold text-purple-400">Música Propia</h2>
            <span className="text-xs text-muted-foreground bg-purple-400/10 border border-purple-400/20 rounded-full px-2 py-0.5">
              {customTracks.length} pista{customTracks.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {musicUploadError && <p className="text-xs text-red-400">{musicUploadError}</p>}
            <input
              ref={musicUploadRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) { handleMusicUpload(file); e.target.value = ""; }
              }}
            />
            <Button
              size="sm"
              onClick={() => musicUploadRef.current?.click()}
              disabled={isUploadingMusic}
              variant="outline"
              className="h-8 text-xs gap-1.5 border-purple-400/40 text-purple-400 hover:bg-purple-400/10"
            >
              {isUploadingMusic
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Subiendo...</>
                : <><Upload className="w-3 h-3" /> Subir jingle</>}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-1.5">Sube música o jingles propios (.mp3, .wav) para usarlos en tus Reels. Si no subes nada, el sistema usa música de la biblioteca general.</p>

        {customTracks.length === 0 ? (
          <button
            onClick={() => musicUploadRef.current?.click()}
            className="w-full py-8 border-2 border-dashed border-border/30 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground/50 hover:border-purple-400/40 hover:text-purple-400/70 transition-colors"
          >
            <Music className="w-7 h-7 opacity-40" />
            <p className="text-sm">Sube tu jingle o música corporativa (MP3, WAV, OGG — máx. 30 MB)</p>
          </button>
        ) : (
          <div className="space-y-2">
            {customTracks.map(track => (
              <div key={track.id} className="flex items-center gap-3 bg-black/30 border border-purple-400/20 rounded-xl px-4 py-3 hover:border-purple-400/40 transition-colors">
                <div className="w-8 h-8 rounded-full bg-purple-400/15 flex items-center justify-center shrink-0">
                  <Play className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{track.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{track.duration}s</span>
                    <span>·</span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-purple-400/30 text-purple-400/80">Personalizado</Badge>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTrack(track.id)}
                  className="text-muted-foreground/40 hover:text-red-400 transition-colors p-1"
                  title="Eliminar pista"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {/* Upload shortcut row */}
            <button
              onClick={() => musicUploadRef.current?.click()}
              className="w-full py-3 border border-dashed border-border/20 rounded-xl flex items-center justify-center gap-2 text-muted-foreground/40 hover:border-purple-400/30 hover:text-purple-400/60 transition-colors text-xs"
            >
              <Upload className="w-3.5 h-3.5" /> Agregar otra pista
            </button>
          </div>
        )}
      </div>

      {/* ── Tipografías Personalizadas ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-amber-400" />
            <h2 className="text-lg font-display font-semibold text-amber-400">Tipografías Propias</h2>
            <span className="text-xs text-muted-foreground bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
              {customFonts.length} tipografía{customFonts.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {fontUploadError && <p className="text-xs text-red-400">{fontUploadError}</p>}
            <input
              ref={fontUploadRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) { handleFontUpload(file); e.target.value = ""; }
              }}
            />
            <Button
              size="sm"
              onClick={() => fontUploadRef.current?.click()}
              disabled={isUploadingFont}
              variant="outline"
              className="h-8 text-xs gap-1.5 border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
            >
              {isUploadingFont
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Subiendo...</>
                : <><Upload className="w-3 h-3" /> Subir tipografía</>}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-1.5">Sube fuentes corporativas (.ttf, .otf) para que la IA las use en el texto de tus publicaciones. Ideal para mantener la identidad visual de tu marca.</p>

        {customFonts.length === 0 ? (
          <button
            onClick={() => fontUploadRef.current?.click()}
            className="w-full py-8 border-2 border-dashed border-border/30 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground/50 hover:border-amber-400/40 hover:text-amber-400/70 transition-colors"
          >
            <Type className="w-7 h-7 opacity-40" />
            <p className="text-sm">Sube tu tipografía corporativa (TTF, OTF, WOFF — máx. 5 MB)</p>
            <p className="text-xs opacity-60">Se usará en las imágenes generadas al seleccionar "Mi fuente"</p>
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {customFonts.map(font => (
              <div key={font.id} className="flex items-center gap-3 bg-black/30 border border-amber-400/20 rounded-xl px-4 py-3 hover:border-amber-400/40 transition-colors">
                <div className="w-8 h-8 rounded-full bg-amber-400/15 flex items-center justify-center shrink-0 text-lg font-bold text-amber-400">
                  Aa
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{font.name}</p>
                  <p className="text-[10px] text-muted-foreground">{font.mimeType.replace("font/", "").toUpperCase()}</p>
                </div>
                <button
                  onClick={() => handleDeleteFont(font.id)}
                  className="text-muted-foreground/40 hover:text-red-400 transition-colors p-1"
                  title="Eliminar tipografía"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {/* Upload shortcut */}
            <button
              onClick={() => fontUploadRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 border border-dashed border-border/20 rounded-xl text-muted-foreground/40 hover:border-amber-400/30 hover:text-amber-400/60 transition-colors text-xs"
            >
              <Upload className="w-3.5 h-3.5" /> Agregar tipografía
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaCard({ media, onUse, onDelete }: { media: MediaItem; onUse: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [thumbData, setThumbData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadThumb = () => {
    if (thumbData || loading) return;
    setLoading(true);
    fetch(`${BASE}/api/media/${media.id}`)
      .then(r => r.json())
      .then(d => setThumbData(d.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const dateStr = media.createdAt
    ? format(parseISO(media.createdAt), "d MMM yyyy", { locale: es })
    : "";

  return (
    <div
      className="group relative rounded-xl overflow-hidden border border-secondary/30 bg-black/40 cursor-pointer transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,119,255,0.25)] hover:border-secondary/60"
      onMouseEnter={() => { setHovered(true); loadThumb(); }}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="aspect-square relative overflow-hidden bg-neutral-900">
        {thumbData ? (
          <img
            src={`data:${media.mimeType};base64,${thumbData}`}
            alt={media.filename}
            className={`w-full h-full object-cover transition-transform duration-500 ${hovered ? "scale-105" : "scale-100"}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {loading
              ? <RefreshCw className="w-5 h-5 text-white/30 animate-spin" />
              : <Camera className="w-8 h-8 text-white/20" />}
          </div>
        )}

        {/* "Real photo" badge */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-secondary/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
          <Camera className="w-2.5 h-2.5" />
          Real
        </div>

        {/* Hover overlay */}
        <div className={`absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}>
          <Button
            size="sm"
            onClick={onUse}
            className="gap-1.5 shadow-lg bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold"
          >
            Usar como fondo <ArrowRight className="w-3.5 h-3.5" />
          </Button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="flex items-center gap-1 text-[10px] text-red-400/80 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Eliminar
          </button>
        </div>
      </div>

      <div className="p-2.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-secondary/30 text-secondary/80 font-semibold gap-1">
            <Camera className="w-2.5 h-2.5" /> Foto real
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
          {media.label || media.filename}
        </p>
        <p className="text-[10px] text-muted-foreground/50">{dateStr}</p>
      </div>
    </div>
  );
}

function BgCard({ bg, onUse, onDelete }: { bg: BgRow; onUse: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [preview, setPreview] = useState(false);
  const [fullSrc, setFullSrc] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [lazyThumb, setLazyThumb] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let loaded = false;
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loaded && !lazyThumb) {
          loaded = true;
          observer.disconnect();
          setThumbLoading(true);
          fetch(`${BASE}/api/backgrounds/${bg.id}/thumb`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d?.thumbnail) {
                setLazyThumb(`data:image/jpeg;base64,${d.thumbnail}`);
              } else {
                setThumbError(true);
              }
            })
            .catch(() => setThumbError(true))
            .finally(() => setThumbLoading(false));
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg.id]);

  const thumbSrc = lazyThumb;
  const dateStr = bg.createdAt
    ? format(parseISO(bg.createdAt), "d MMM yyyy", { locale: es })
    : "";
  const useCount = bg.libraryUseCount ?? 0;
  const isUnused = useCount === 0;

  const openPreview = async () => {
    setPreview(true);
    if (!fullSrc) {
      setLoadingFull(true);
      try {
        const res = await fetch(`${BASE}/api/backgrounds/${bg.id}`);
        const d = await res.json();
        if (d.rawBackground) setFullSrc(`data:image/jpeg;base64,${d.rawBackground}`);
      } catch { /* silent */ }
      finally { setLoadingFull(false); }
    }
  };

  return (
    <>
      {/* ── Thumbnail card ── */}
      <div
        ref={cardRef}
        className={`group relative rounded-xl overflow-hidden border bg-black/40 cursor-pointer transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,119,255,0.25)] ${
          isUnused ? "border-emerald-400/30 hover:border-emerald-400/60" : "border-border/30 hover:border-primary/50"
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={openPreview}
      >
        <div className="aspect-square relative overflow-hidden bg-neutral-900">
          {thumbError ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-black/40">
              <ImageOff className="w-6 h-6 text-white/20" />
              <span className="text-[9px] text-white/20">No disponible</span>
              {bg.isOwn && (
                <button
                  onClick={e => { e.stopPropagation(); onDelete(); }}
                  className="flex items-center gap-1 mt-1 text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Eliminar
                </button>
              )}
            </div>
          ) : thumbSrc ? (
            <img
              src={thumbSrc}
              alt="Fondo generado"
              className={`w-full h-full object-cover transition-transform duration-500 ${hovered ? "scale-105" : "scale-100"}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {thumbLoading
                ? <div className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                : <ImageIcon className="w-8 h-8 text-white/20" />}
            </div>
          )}

          {isUnused && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-emerald-400/90 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              <Sparkles className="w-2.5 h-2.5" /> Nuevo
            </div>
          )}
          {!isUnused && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/70 text-white/70 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-white/10">
              <CheckCircle2 className="w-2.5 h-2.5 text-primary/70" /> {useCount}× usado
            </div>
          )}

          <div className={`absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}>
            <span className="text-white/90 text-xs font-semibold bg-black/60 px-3 py-1.5 rounded-lg">Ver imagen</span>
            {bg.isOwn && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="flex items-center gap-1 text-[10px] text-red-400/80 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Eliminar
              </button>
            )}
          </div>
        </div>

        <div className="p-2 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {bg.style && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/30 text-primary/80 font-semibold">
                {STYLE_LABEL[bg.style] ?? bg.style}
              </Badge>
            )}
            {bg.contentType && CONTENT_TYPE_ICON[bg.contentType] && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-border/40 text-muted-foreground gap-1">
                {CONTENT_TYPE_ICON[bg.contentType]}{bg.contentType}
              </Badge>
            )}
            {!bg.isOwn && bg.groupDisplayName && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400/40 text-amber-400/80 font-semibold">
                Otra {bg.groupDisplayName}
              </Badge>
            )}
          </div>
          {bg.prompt && (
            <p className="text-[10px] text-muted-foreground leading-tight line-clamp-1">
              {bg.prompt.slice(0, 80)}
            </p>
          )}
        </div>
      </div>

      {/* ── Full-size preview modal ── */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreview(false)}
        >
          <div
            className="relative bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative aspect-square w-full bg-black">
              {loadingFull ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : fullSrc ? (
                <img src={fullSrc} alt="Fondo completo" className="w-full h-full object-cover" />
              ) : thumbSrc ? (
                <img src={thumbSrc} alt="Fondo" className="w-full h-full object-cover" />
              ) : null}
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {bg.style && (
                  <Badge variant="outline" className="border-primary/30 text-primary/80 font-semibold">
                    {STYLE_LABEL[bg.style] ?? bg.style}
                  </Badge>
                )}
                {bg.contentType && CONTENT_TYPE_ICON[bg.contentType] && (
                  <Badge variant="outline" className="border-border/40 text-muted-foreground gap-1">
                    {CONTENT_TYPE_ICON[bg.contentType]}{bg.contentType}
                  </Badge>
                )}
                {isUnused ? (
                  <Badge className="bg-emerald-400/20 text-emerald-400 border-emerald-400/30">
                    <Sparkles className="w-3 h-3 mr-1" /> Nuevo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 mr-1 text-primary/70" /> {useCount}× usado
                  </Badge>
                )}
              </div>
              {bg.prompt && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{bg.prompt}</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  className={`flex-1 gap-1.5 font-bold ${isUnused ? "bg-emerald-500 hover:bg-emerald-600 text-black" : "bg-primary hover:bg-primary/90 text-white"}`}
                  onClick={() => { setPreview(false); onUse(); }}
                >
                  Usar este fondo <ArrowRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" onClick={() => setPreview(false)} className="border-border/40">
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400 shrink-0"
                  onClick={() => { setPreview(false); onDelete(); }}
                  title="Eliminar fondo"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
