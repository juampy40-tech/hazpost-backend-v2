import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { FONT_CATALOG } from "@/lib/fonts";
import {
  FALLBACK_TZ,
  toLocalDatetimeInput,
  toBogotaLocal,
  localDatetimeInputToUtc,
  bogotaLocalToUtc,
} from "@/lib/timezone";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, horizontalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdatePost, useApprovePost, useRejectPost, useRegenerateCaption, useGenerateImageVariant, useApplySuggestion, useDeletePost } from "@workspace/api-client-react";
import { useBusinessPosts } from "@/hooks/useBusinessPosts";
import { getGetPostsQueryKey } from "@workspace/api-client-react";
// useGetPost is used for loading the current post's full image data individually (slim list + full individual)
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Check, X, RefreshCw, Instagram, PlaySquare, ChevronLeft, ChevronRight, Image as ImageIcon, Sparkles, Film, LayoutGrid, BookImage, Wand2, Download, AlertTriangle, CheckCircle, Trash2, Save, CalendarClock, ArrowUp, ArrowDown, Upload, Video, Camera, FolderOpen, Plus, Layers, MapPin, Info, Copy, Edit2, Globe, Tag, MessageSquarePlus, ChevronDown, RotateCcw, RotateCw, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { IG_CAPTION_LIMIT, IG_CAPTION_WARN_THRESHOLD, TIKTOK_CAPTION_LIMIT, TIKTOK_CAPTION_WARN_THRESHOLD } from "@/lib/socialLimits";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";

type SpellResult = { hasErrors: boolean; corrected: string; explanation: string } | null;

type DiffToken = { word: string; type: 'same' | 'wrong' | 'fix' | 'newline' };

/** Compares two texts word-by-word and returns tokens tagged as same/wrong/fix/newline.
 *  Preserves line structure by treating newlines as explicit tokens. */
function buildWordDiff(original: string, corrected: string): DiffToken[] {
  // Tokenize: split each line then insert 'newline' tokens between them
  const tokenize = (text: string): DiffToken[] => {
    const lines = text.split('\n');
    const tokens: DiffToken[] = [];
    lines.forEach((line, li) => {
      if (li > 0) tokens.push({ word: '\n', type: 'newline' });
      line.split(/[ \t]+/).filter(w => w.length > 0).forEach(w => {
        tokens.push({ word: w, type: 'same' });
      });
    });
    return tokens;
  };

  const origTokens = tokenize(original);
  const corrTokens = tokenize(corrected);
  const result: DiffToken[] = [];

  let i = 0, j = 0;
  while (i < origTokens.length || j < corrTokens.length) {
    const o = origTokens[i];
    const c = corrTokens[j];

    // Both are newlines → emit one newline
    if (o?.type === 'newline' && c?.type === 'newline') {
      result.push({ word: '\n', type: 'newline' });
      i++; j++;
    }
    // Only original has newline → consume it
    else if (o?.type === 'newline') {
      result.push({ word: '\n', type: 'newline' });
      i++;
    }
    // Only corrected has newline → consume it
    else if (c?.type === 'newline') {
      result.push({ word: '\n', type: 'newline' });
      j++;
    }
    // Both are words
    else {
      const ow = o?.word ?? '';
      const cw = c?.word ?? '';
      const normalize = (w: string) => w.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
      if (normalize(ow) === normalize(cw)) {
        result.push({ word: ow || cw, type: 'same' });
        i++; j++;
      } else {
        if (ow) result.push({ word: ow, type: 'wrong' });
        if (cw) result.push({ word: cw, type: 'fix' });
        i++; j++;
      }
    }
  }
  return result;
}

const STYLE_COLORS: Record<string, string> = {
  cinema:    '#F59E0B',
  neon:      '#22D3EE',
  bloque:    '#EF4444',
  eco:       '#0077FF',
  duotono:   '#A855F7',
  titanio:   '#94A3B8',
  editorial: '#F1F5F9',
};


const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Rotates a base64 JPEG image by the given degrees using an in-memory canvas.
 * No server round-trip needed — purely client-side. */
function rotateBase64Image(base64: string, degrees: 90 | -90 | 180): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const swap = degrees === 90 || degrees === -90;
      const canvas = document.createElement("canvas");
      canvas.width  = swap ? h : w;
      canvas.height = swap ? w : h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas ctx unavailable")); return; }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      resolve(dataUrl.split(",")[1] ?? "");
    };
    img.onerror = reject;
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

/** Lazy-loading thumbnail for slide-library items (uses /api/backgrounds/:id/thumb) */
function BgThumbImg({ id, alt, className }: { id: number; alt: string; className: string }) {
  const [thumb, setThumb] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        fetch(`${BASE}/api/backgrounds/${id}/thumb`, { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d?.thumbnail && !cancelled) setThumb(`data:image/jpeg;base64,${d.thumbnail}`); })
          .catch(() => {});
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => { cancelled = true; observer.disconnect(); };
  }, [id]);
  return (
    <div ref={ref} className="w-full h-full">
      {thumb
        ? <img src={thumb} alt={alt} className={className} />
        : <div className="w-full h-full flex items-center justify-center bg-neutral-900"><ImageIcon className="w-6 h-6 text-white/15" /></div>
      }
    </div>
  );
}


/** Collapsible panel to completely retheme a post's caption via AI. */
function RethemePanel({ postId, onApplied }: { postId: number; onApplied: (caption: string) => void }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`${BASE}/api/posts/${postId}/retheme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const body = await res.json() as { caption?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Error generando el nuevo caption");
      setPreview(body.caption ?? "");
    } catch (err) {
      toast({ title: "Error al cambiar tema", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!preview) return;
    onApplied(preview);
    setPreview(null);
    setTopic("");
    setOpen(false);
    toast({ title: "Tema actualizado", description: "El nuevo caption ya está cargado. Revísalo y aprueba cuando estés listo." });
  };

  const handleDiscard = () => {
    setPreview(null);
  };

  return (
    <div className="mt-3 border-t border-border/30 pt-4">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setPreview(null); }}
        className="flex items-center gap-2 text-sm text-orange-400/80 hover:text-orange-400 transition-colors w-full"
      >
        <Wand2 className="w-4 h-4" />
        <span className="font-medium">Cambiar tema del post</span>
        <span className="ml-auto text-[10px] text-muted-foreground font-normal">
          {open ? "▲ cerrar" : "▼ abrir"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Describe el nuevo tema en una o dos frases. La IA generará un caption completamente nuevo manteniendo la plantilla de marca, el formato y la plataforma.
          </p>
          <div className="flex gap-2">
            <textarea
              value={topic}
              onChange={e => { setTopic(e.target.value); setPreview(null); }}
              placeholder='Ej: "Combo de productos o servicio específico que quieres destacar para tu audiencia"'
              rows={3}
              maxLength={500}
              className="flex-1 text-sm bg-background/40 border border-border/40 rounded-lg p-3 text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-orange-400/40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={loading || !topic.trim()}
              className="bg-orange-500/20 border border-orange-500/30 text-orange-300 hover:bg-orange-500/30 gap-1.5"
            >
              {loading
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generando...</>
                : <><Sparkles className="w-3.5 h-3.5" /> Generar nuevo caption</>
              }
            </Button>
            <span className="text-[10px] text-muted-foreground">{topic.length}/500</span>
          </div>

          {preview !== null && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 space-y-3">
              <p className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold">Vista previa — nuevo caption generado</p>
              <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">{preview}</p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleApply}
                  className="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Usar este caption
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Regenerar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDiscard}
                  className="text-muted-foreground hover:text-red-400 gap-1.5"
                >
                  <X className="w-3.5 h-3.5" /> Descartar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                Si lo usas, el caption se cargará en el editor para que puedas revisarlo antes de aprobar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sortable reel slide thumbnail (for pre-generation ordering) ───────────────
function SortableReelSlide({ id, index, imageData }: { id: number; index: number; imageData?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative flex-shrink-0 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing border-2 border-border/30 hover:border-primary/50 transition-colors"
      title={`Escena ${index + 1} — arrastra para reordenar`}
    >
      <div className="w-[52px] h-[80px] bg-black/40 flex items-center justify-center">
        {imageData ? (
          <img
            src={`data:image/jpeg;base64,${imageData}`}
            alt={`Escena ${index + 1}`}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="text-muted-foreground text-xs">#{id}</span>
        )}
      </div>
      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-[9px] text-white font-bold leading-none">
        {index + 1}
      </div>
    </div>
  );
}

export default function Approval() {
  const { user } = useAuth();
  const userTz = user?.timezone ?? FALLBACK_TZ;
  const { id: globalBizId, loaded: globalBizLoaded } = useActiveBusiness();
  const [location, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialPostId = searchParams.get('post');
  const initialBgVariantId = searchParams.get('bgVariantId');
  const initialMediaId = searchParams.get('mediaId');

  // Library background — loaded when arriving from /backgrounds (AI-generated bg)
  const [libraryBg, setLibraryBg] = useState<{ id: number; rawBackground: string; style: string; prompt: string } | null>(null);

  useEffect(() => {
    if (!initialBgVariantId) return;
    fetch(`${BASE}/api/backgrounds/${initialBgVariantId}`)
      .then(r => r.json())
      .then(data => {
        if (data.rawBackground) setLibraryBg({ id: data.id, rawBackground: data.rawBackground, style: data.style, prompt: data.prompt });
      })
      .catch(() => {});
  }, [initialBgVariantId]);

  // Media background — loaded when arriving from /backgrounds (real uploaded photo)
  const [libraryMedia, setLibraryMedia] = useState<{ id: number; filename: string; label: string; mimeType: string; data: string } | null>(null);
  // True when libraryMedia.data has been locally rotated and not yet persisted to the server
  const [isLibraryMediaRotated, setIsLibraryMediaRotated] = useState(false);
  const [isRotatingLibraryMedia, setIsRotatingLibraryMedia] = useState(false);
  const [isRotatingVariant, setIsRotatingVariant] = useState(false);

  // ── Inline background library drawer ───────────────────────────────────────
  const [bgDrawerOpen, setBgDrawerOpen] = useState(false);
  const [bgSelectMode, setBgSelectMode] = useState(false);
  const [bgSelectedIds, setBgSelectedIds] = useState<Set<number>>(new Set());
  const [bgBulkDeleting, setBgBulkDeleting] = useState(false);
  const [bgItems, setBgItems] = useState<{id: number; style: string; contentType: string | null; caption: string | null; libraryUseCount: number | null; thumbnail: string | null}[]>([]);
  const [bgItemsLoaded, setBgItemsLoaded] = useState(false);
  // loadingPickId tracks which bg is being fetched for selection (full-size)
  const [loadingPickId, setLoadingPickId] = useState<number | null>(null);
  const [deletingBgId, setDeletingBgId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Format filter for the bg library drawer
  const [bgFormatFilter, setBgFormatFilter] = useState<"all" | "portrait" | "feed">("all");

  const fetchBgItems = async (force = false) => {
    if (bgItemsLoaded && !force) return;
    try {
      const res = await fetch(`${BASE}/api/reels/slide-library?limit=300`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        const items = (d.slides ?? []).map((s: { variantId: number; style: string; contentType: string | null; caption: string | null; libraryUseCount: number; thumbnail: string | null }) => ({
          id: s.variantId, style: s.style, contentType: s.contentType,
          caption: s.caption, libraryUseCount: s.libraryUseCount, thumbnail: s.thumbnail,
        }));
        setBgItems(items);
        setBgItemsLoaded(true);
      }
    } catch {}
  };

  const fetchBizElements = async (businessId: number) => {
    setBizElementsLoading(true);
    try {
      const [elemRes, presetRes] = await Promise.all([
        fetch(`${BASE}/api/elements?businessId=${businessId}`, { credentials: "include" }),
        fetch(`${BASE}/api/composition-presets?businessId=${businessId}`, { credentials: "include" }),
      ]);
      if (elemRes.ok) {
        const d = await elemRes.json();
        setBizElements(d.elements ?? []);
      }
      if (presetRes.ok) {
        const d = await presetRes.json();
        const presets: { id: number; name: string; configJson: { logo?: { enabled: boolean }; text?: { enabled: boolean }; elements?: { elementId: number; position: string; sizePercent: number }[] }; isDefault: boolean }[] = d.presets ?? [];
        setCompPresets(presets);
        // Auto-load default preset layers if panel is freshly opened with no active layers
        const def = presets.find(p => p.isDefault);
        if (def) {
          setActiveElementLayers(Array.isArray(def.configJson?.elements) ? def.configJson.elements : []);
          if (def.configJson?.logo !== undefined) setCompLogoEnabled(def.configJson.logo.enabled ?? true);
          if (def.configJson?.text !== undefined) setCompTextEnabled(def.configJson.text.enabled ?? true);
        }
      }
    } catch {
      setBizElements([]);
    } finally {
      setBizElementsLoading(false);
    }
  };

  const handleElementUploadApproval = async () => {
    const bizId = activeBusinessIdRef.current;
    if (!elUploadFile || !elUploadName.trim() || !bizId) return;
    setElUploading(true);
    try {
      const urlRes = await fetch(`${BASE}/api/elements/upload-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: bizId }),
      });
      if (!urlRes.ok) {
        throw new Error("Error generando URL de subida");
      }
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": elUploadFile.type },
        body: elUploadFile,
      });
      if (!uploadRes.ok) throw new Error("Error subiendo el archivo");
      const createRes = await fetch(`${BASE}/api/elements`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: bizId, name: elUploadName.trim(), storageKey: objectPath }),
      });
      if (!createRes.ok) {
        const createErr = await createRes.json().catch(() => ({})) as { message?: string };
        throw new Error(createErr.message ?? "Error registrando el elemento");
      }
      const createData = await createRes.json() as { element?: { id: number } };
      await fetchBizElements(bizId);
      setElUploadFile(null);
      setElUploadPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      setElUploadName("");
      setShowElUploadWidget(false);
      if (createData.element?.id) setElemLibSelectedId(createData.element.id);
      toast({ title: "Elemento subido", description: "El elemento se está analizando con IA." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo subir el elemento.", variant: "destructive" });
    } finally {
      setElUploading(false);
    }
  };

  const handleDeleteElement = async (elId: number) => {
    const bizId = activeBusinessIdRef.current;
    if (!bizId) return;
    setElDeletingId(elId);
    try {
      const res = await fetch(`${BASE}/api/elements/${elId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Error eliminando el elemento");
      }
      setActiveElementLayers(prev => prev.filter(l => l.elementId !== elId));
      await fetchBizElements(bizId);
      toast({ title: "Elemento eliminado" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo eliminar.", variant: "destructive" });
    } finally {
      setElDeletingId(null);
    }
  };

  const handleRenameElement = async (elId: number, newName: string) => {
    const trimmed = newName.trim().slice(0, 100);
    if (!trimmed) return;
    try {
      const res = await fetch(`${BASE}/api/elements/${elId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Error renombrando el elemento");
      }
      setBizElements(prev => prev.map(el => el.id === elId ? { ...el, name: trimmed } : el));
      setElRenamingId(null);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo renombrar.", variant: "destructive" });
    }
  };

  const handlePickBg = async (id: number, style: string, caption: string | null) => {
    // Always fetch the full-size original (no logo, no text) for actual use
    setLoadingPickId(id);
    try {
      const res = await fetch(`${BASE}/api/reels/slide-library/${id}/raw`, { credentials: "include" });
      if (!res.ok) {
        // Fallback to backgrounds API
        const res2 = await fetch(`${BASE}/api/backgrounds/${id}`);
        if (!res2.ok) return;
        const d = await res2.json();
        if (!d.rawBackground) return;
        const label = caption?.split('\n')[0]?.replace(/[#@\s]+/g, ' ').trim().slice(0, 60) || style;
        setLibraryBg({ id, rawBackground: d.rawBackground, style, prompt: label });
        setBgDrawerOpen(false);
        return;
      }
      const d = await res.json();
      if (!d.rawBackground) return;
      const label = caption?.split('\n')[0]?.replace(/[#@\s]+/g, ' ').trim().slice(0, 60) || style;
      setLibraryBg({ id, rawBackground: d.rawBackground, style, prompt: label });
      setBgDrawerOpen(false);
    } catch {
    } finally {
      setLoadingPickId(null);
    }
  };

  const handleDeleteFromDrawer = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(id);
  };

  const confirmDeleteBg = async (id: number) => {
    setConfirmDeleteId(null);
    setDeletingBgId(id);
    try {
      const res = await fetch(`${BASE}/api/backgrounds/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setBgItems(prev => prev.filter(item => item.id !== id));
      }
    } catch {}
    finally { setDeletingBgId(null); }
  };

  const handleBulkDeleteBg = async () => {
    const ids = Array.from(bgSelectedIds);
    if (ids.length === 0) return;
    setBgBulkDeleting(true);
    try {
      const res = await fetch(`${BASE}/api/backgrounds/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setBgItems(prev => prev.filter(item => !bgSelectedIds.has(item.id)));
        setBgSelectedIds(new Set());
        setBgSelectMode(false);
        toast({ title: `🗑 ${ids.length} foto${ids.length > 1 ? "s" : ""} eliminada${ids.length > 1 ? "s" : ""} de tu biblioteca` });
      } else {
        toast({ title: "Error al eliminar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de conexión", variant: "destructive" });
    } finally {
      setBgBulkDeleting(false);
    }
  };

  const handleShareWhatsApp = async () => {
    const caption = [currentPost?.caption, currentPost?.hashtags].filter(Boolean).join("\n\n");
    const text = `${caption}${caption ? "\n\n" : ""}📲 Publicado con hazpost`;
    const rawB64 = activeImage?.imageData;
    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    const imgB64 = rawB64?.includes(",") ? rawB64.split(",")[1] : rawB64;

    if (imgB64 && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
      try {
        const byteArr = Uint8Array.from(atob(imgB64), c => c.charCodeAt(0));
        const blob = new Blob([byteArr], { type: "image/jpeg" });
        const file = new File([blob], "eco-post.jpg", { type: "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text });
          return;
        }
      } catch { /* fall through */ }
    }
    if (imgB64) {
      try {
        const byteArr = Uint8Array.from(atob(imgB64), c => c.charCodeAt(0));
        const blob = new Blob([byteArr], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "eco-post.jpg";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch { /* ignore download errors */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  useEffect(() => {
    if (!initialMediaId) return;
    fetch(`${BASE}/api/media/${initialMediaId}`)
      .then(r => r.json())
      .then(data => {
        if (data.data) { setLibraryMedia({ id: data.id, filename: data.filename, label: data.label, mimeType: data.mimeType, data: data.data }); setIsLibraryMediaRotated(false); }
      })
      .catch(() => {});
  }, [initialMediaId]);

  // slim=1 → loads only metadata + variant ids (no base64 images) — much faster for polling
  const { data: posts, isLoading, refetch } = useBusinessPosts({ status: 'pending_approval,scheduled', slim: '1' });

  // Full image data for the currently viewed post — loaded individually so we never download all images at once
  const [currentPostFull, setCurrentPostFull] = useState<any>(null);
  const [_isLoadingFull, setIsLoadingFull] = useState(false);
  const queryClient = useQueryClient();

  // Plan capabilities — used to show lock icon on "IA integra el elemento" when plan doesn't include it
  const { data: subscriptionMe } = useQuery<{ planDetails?: { element_ai_enabled?: boolean } | null }>({
    queryKey: ["subscriptions/me"],
    queryFn: () => fetch(`${BASE}/api/subscriptions/me`, { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
  const planHasElementAi = subscriptionMe?.planDetails?.element_ai_enabled ?? false;

  const { data: plansData } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => fetch(`${BASE}/api/plans`).then(r => r.json()),
    staleTime: 60_000,
  });

  // Re-fetches a single post's full data and updates currentPostFull — called after image mutations
  const refreshCurrentPost = useCallback((postId: number) => {
    fetch(`${BASE}/api/posts/${postId}`)
      .then(r => r.json())
      .then(data => setCurrentPostFull(data))
      .catch(() => {});
  }, []);
  const { toast } = useToast();

  const updatePost = useUpdatePost();
  const approvePost = useApprovePost();
  const rejectPost = useRejectPost();
  const regenerateCaption = useRegenerateCaption();
  const generateImageVariant = useGenerateImageVariant();
  const applySuggestion = useApplySuggestion();

  // Fetch active business info once
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${BASE}/api/businesses`, { credentials: "include" });
        const d = await r.json();
        let list: { id: number; isDefault: boolean; brandTextStyle?: string | null; brandFont?: string | null; logoUrl?: string | null; logoUrls?: string | null; name?: string; primaryColor?: string | null; secondaryColor?: string | null; defaultLocation?: string | null; defaultSignatureText?: string | null; defaultShowSignature?: boolean | null }[] = d.businesses ?? [];
        // Auto-create default business for existing users who have none (legacy accounts)
        if (list.length === 0) {
          try {
            const createRes = await fetch(`${BASE}/api/businesses`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Mi negocio" }),
            });
            if (createRes.ok) {
              const { business } = await createRes.json() as { business: { id: number; isDefault: boolean } };
              list = [business];
            }
          } catch (_e) { /* non-fatal */ }
        }
        // Build id→name map so resolvePostHandle can look up post-specific business names
        const nameMap: Record<number, string> = {};
        for (const b of list) { if (b.name) nameMap[b.id] = b.name; }
        setBusinessNameMap(nameMap);

        const active = list.find(b => b.isDefault) ?? list[0];
        if (active) {
          activeBusinessIdRef.current = active.id;
          if (active.brandTextStyle) {
            setTextStyle(active.brandTextStyle);
            setSavedTextStyle(active.brandTextStyle);
          }
          if (active.logoUrl) {
            const resolved = active.logoUrl.startsWith("/objects/")
              ? `${BASE}/api/storage/objects/${active.logoUrl.slice("/objects/".length)}`
              : active.logoUrl;
            setActiveBusinessLogoUrl(resolved);
            setActiveBusinessLogoPath(active.logoUrl);
            setOverlayLogoUrl(resolved);
            setOverlayLogoPath(active.logoUrl);
            // Collect all stored logos for the business (parsed from logoUrls JSON)
            try {
              // extras may contain "" sentinel for empty fixed slots
              const extras: string[] = JSON.parse(active.logoUrls ?? "[]");
              // Slots: [primaryLogoUrl, extras[0], extras[1]] — "" = empty slot
              const slots: (string | null)[] = [
                active.logoUrl || null,
                (extras[0] || null),
                (extras[1] || null),
              ];
              setBusinessLogoStoragePaths(slots);
              const all = slots.filter(Boolean) as string[];
              const browserUrls = all.map(u => u.startsWith("/objects/")
                ? `${BASE}/api/storage/objects/${u.slice("/objects/".length)}`
                : u
              );
              setBusinessLogoOptions(browserUrls);
            } catch {
              setBusinessLogoOptions([resolved]);
              setBusinessLogoStoragePaths([active.logoUrl, null, null]);
            }
          }
          if (active.name) setActiveBusinessName(active.name);
          // Compute fallback firma = "BusinessName, City"
          const firmaParts = [active.name, active.defaultLocation].filter(Boolean);
          const defaultFirma = firmaParts.join(", ");
          if (active.primaryColor) {
            bizDefaultTitleColor1.current = active.primaryColor;
            setTitleColor1(active.primaryColor);
          }
          if (active.secondaryColor) {
            bizDefaultTitleColor2.current = active.secondaryColor;
            setTitleColor2(active.secondaryColor);
          }
          // Use stored signature override if available; fall back to name+location
          // Use || so that empty string ("") also falls back to the default firma
          const resolvedSignature = active.defaultSignatureText || defaultFirma;
          if (resolvedSignature) {
            bizDefaultSignatureText.current = resolvedSignature;
            setSignatureText(resolvedSignature);
          }
          // Restore default show-signature preference
          if (active.defaultShowSignature === false) {
            setShowSignature(false);
          }
          // Rehydrate overlayFont from saved business brandFont
          if (active.brandFont) {
            setOverlayFont(active.brandFont);
          }
        }
      } catch (_e) { /* non-fatal */ }
    })();
  }, []);

  // Fetch social accounts — also re-fetches when user returns to tab (e.g. after connecting from Settings)
  useEffect(() => {
    const refetch = () => {
      fetch(`${BASE}/api/social-accounts`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((d: unknown) => {
          if (Array.isArray(d)) setSocialAccounts(d);
          else if (d !== null && typeof d === "object" && Array.isArray((d as Record<string, unknown>).accounts)) {
            setSocialAccounts((d as Record<string, unknown>).accounts as typeof socialAccounts);
          }
          setSocialAccountsLoaded(true);
        })
        .catch(() => { setSocialAccountsLoaded(true); });
    };
    refetch();
    const onVisible = () => { if (!document.hidden) refetch(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const deleteVariant = useMutation({
    mutationFn: async ({ postId, variantId }: { postId: number; variantId: number }) => {
      const res = await fetch(`${BASE}/api/posts/${postId}/variants/${variantId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("No se pudo eliminar la imagen");
    },
    onSuccess: (_data, variables) => {
      // Remove the deleted variant from the carousel order immediately (before the fetch refresh)
      setSlideOrder(prev => prev.filter(id => id !== variables.variantId));
      setPreviewSlideId(prev => prev === variables.variantId ? null : prev);
      queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
      refreshCurrentPost(variables.postId);
      toast({ title: "Imagen eliminada" });
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedCaption, setEditedCaption] = useState("");
  const [editedHashtags, setEditedHashtags] = useState("");
  const [editedHashtagsTiktok, setEditedHashtagsTiktok] = useState("");
  const [localCustomText, setLocalCustomText] = useState("");
  const [localCustomTextPosition, setLocalCustomTextPosition] = useState<"before" | "after">("after");
  // Caption addons panel (inline management inside "Texto del Post" card)
  const [addonsList, setAddonsList] = useState<any[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [addonsSaving, setAddonsSaving] = useState(false);
  const [addonsDeleting, setAddonsDeleting] = useState<number | null>(null);
  const [addonsModalOpen, setAddonsModalOpen] = useState(false);
  const [addonsEditing, setAddonsEditing] = useState<any | null>(null);
  const [addonsForm, setAddonsForm] = useState<{ name: string; keywords: string; text: string; position: "before" | "after"; active: boolean }>({ name: "", keywords: "", text: "", position: "after", active: true });
  const [showAddonsPanel, setShowAddonsPanel] = useState(false);
  const [editedPlatform, setEditedPlatform] = useState<string>("both");
  const [editedLocationId, setEditedLocationId] = useState<string>("");
  const [editedLocationName, setEditedLocationName] = useState<string>("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<{ id: string; name: string; subtitle?: string }[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [defaultLocationFromProfile, setDefaultLocationFromProfile] = useState<string>("");
  const [locationUseForHashtags, setLocationUseForHashtags] = useState<boolean>(() => {
    const saved = localStorage.getItem("hz_loc_use_for_hashtags");
    return saved !== null ? saved === "true" : true;
  });
  const setAndPersistLocationUseForHashtags = (v: boolean) => {
    setLocationUseForHashtags(v);
    localStorage.setItem("hz_loc_use_for_hashtags", String(v));
  };
  const [locationSaveAsDefault, setLocationSaveAsDefault] = useState<boolean>(() => {
    const saved = localStorage.getItem("hz_loc_save_as_default");
    return saved !== null ? saved === "true" : false;
  });
  const setAndPersistLocationSaveAsDefault = (v: boolean) => {
    setLocationSaveAsDefault(v);
    localStorage.setItem("hz_loc_save_as_default", String(v));
  };
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [suggestionText, setSuggestionText] = useState("");
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [imageInstruction, setImageInstruction] = useState("");
  const [showImageInstruction, setShowImageInstruction] = useState(false);
  const [referenceImageBase64, setReferenceImageBase64] = useState<string>("");
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>("");
  const [isConvertingRefImage, setIsConvertingRefImage] = useState(false);

  // Composition elements panel
  const [showElementsPanel, setShowElementsPanel] = useState(false);
  const [bizElements, setBizElements] = useState<{ id: number; name: string; storageKey: string; thumbUrl?: string; analysisStatus?: string }[]>([]);
  const [bizElementsLoading, setBizElementsLoading] = useState(false);
  const [activeElementLayers, setActiveElementLayers] = useState<{ elementId: number; position: string; sizePercent: number }[]>([]);
  const [applyingElements, setApplyingElements] = useState(false);
  const [generatingElementAi, setGeneratingElementAi] = useState(false);
  const [useDeepElementAiApproval, setUseDeepElementAiApproval] = useState(false);
  const [compPresets, setCompPresets] = useState<{ id: number; name: string; configJson: { logo?: { enabled: boolean }; text?: { enabled: boolean }; elements?: { elementId: number; position: string; sizePercent: number }[] }; isDefault: boolean }[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [compLogoEnabled, setCompLogoEnabled] = useState(true);
  const [compTextEnabled, setCompTextEnabled] = useState(true);
  const [elUploadFile, setElUploadFile] = useState<File | null>(null);
  const [elUploadPreview, setElUploadPreview] = useState<string | null>(null);
  const [elUploadName, setElUploadName] = useState("");
  const [elUploading, setElUploading] = useState(false);
  const [showElUploadWidget, setShowElUploadWidget] = useState(false);
  const [elDeletingId, setElDeletingId] = useState<number | null>(null);
  const [elRenamingId, setElRenamingId] = useState<number | null>(null);
  const [elRenameValue, setElRenameValue] = useState("");

  // Biblioteca de elementos panel — for IA+Elemento generation (separate from composition overlay panel)
  const [showElemLibraryPanel, setShowElemLibraryPanel] = useState(false);
  const [elemLibSelectedId, setElemLibSelectedId] = useState<number | null>(null);

  useEffect(() => {
    return () => { if (elUploadPreview) URL.revokeObjectURL(elUploadPreview); };
  }, [elUploadPreview]);

  const [socialAccounts, setSocialAccounts] = useState<Array<{ id: number; platform: string; username: string | null; businessId: number | null; connected?: string }>>([]);
  const [socialAccountsLoaded, setSocialAccountsLoaded] = useState(false);
  const [businessNameMap, setBusinessNameMap] = useState<Record<number, string>>({});
  const [activeBusinessName, setActiveBusinessName] = useState<string>("");
  const [activeBusinessLogoUrl, setActiveBusinessLogoUrl] = useState<string>("");
  const [overlayLogoUrl, setOverlayLogoUrl] = useState<string>("");
  const [activeBusinessLogoPath, setActiveBusinessLogoPath] = useState<string>("");
  const [overlayLogoPath, setOverlayLogoPath] = useState<string>("");
  const [businessLogoOptions, setBusinessLogoOptions] = useState<string[]>([]);

  // Refs for business defaults — used to reset overlay controls when switching to a variant
  // that has no stored overlay params (legacy variants generated before this feature)
  const bizDefaultTitleColor1 = useRef<string>("#FFFFFF");
  const bizDefaultTitleColor2 = useRef<string>("#0077FF");
  const bizDefaultSignatureText = useRef<string>("");
  const activeBusinessIdRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customHeadline, setCustomHeadline] = useState("");
  const [imageStyle, setImageStyle] = useState<"photorealistic" | "graphic" | "infographic">("photorealistic");
  const [logoPosition, setLogoPosition] = useState<"bottom-right" | "bottom-left" | "top-right" | "top-left">("top-right");
  const [logoColor, setLogoColor] = useState<"white" | "blue" | "icon">("white");
  const [textStyle, setTextStyle] = useState<string>("cinema");
  const [savedTextStyle, setSavedTextStyle] = useState<string>("cinema");
  const [imageFilter, setImageFilter] = useState<"none" | "warm" | "cool" | "dramatic" | "vintage" | "dark" | "vivid" | "haze">("none");
  const [overlayFont, setOverlayFont] = useState<string>("default");
  const [overlayFont2, setOverlayFont2] = useState<string | null>(null);
  const [showFont2Selector, setShowFont2Selector] = useState<boolean>(false);
  const [customFont2Input, setCustomFont2Input] = useState<string>("");
  const [textPosition, setTextPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [textSize, setTextSize] = useState<"small" | "sm" | "medium" | "large">("medium");

  // Brand color + firma overlay controls
  const [titleColor1, setTitleColor1] = useState<string>("#FFFFFF");
  const [titleColor2, setTitleColor2] = useState<string>("#0077FF");
  const [showSignature, setShowSignature] = useState<boolean>(true);
  const [signatureText, setSignatureText] = useState<string>("");

  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save brand overlay preferences (colors, signature, font) to the active business
  useEffect(() => {
    const bizId = activeBusinessIdRef.current;
    if (!bizId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveStatus("saving");
    autoSaveTimerRef.current = setTimeout(() => {
      // brandFont: persist the selected overlayFont key so bulk generation picks it up.
      // Explicitly send null when "default" to clear any previously saved font.
      const brandFont = (overlayFont && overlayFont !== "default") ? overlayFont : null;
      const brandTextStyle = (textStyle && textStyle !== "cinema") ? textStyle : null;
      fetch(`${BASE}/api/businesses/${bizId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryColor: titleColor1,
          secondaryColor: titleColor2,
          defaultSignatureText: signatureText,
          defaultShowSignature: showSignature,
          brandFont,
          brandTextStyle,
        }),
      })
        .then(r => {
          if (r.ok) {
            setAutoSaveStatus("saved");
            bizDefaultTitleColor1.current = titleColor1;
            bizDefaultTitleColor2.current = titleColor2;
            setSavedTextStyle(textStyle);
            if (autoSaveStatusTimerRef.current) clearTimeout(autoSaveStatusTimerRef.current);
            autoSaveStatusTimerRef.current = setTimeout(() => setAutoSaveStatus("idle"), 2500);
          } else {
            setAutoSaveStatus("idle");
          }
        })
        .catch(() => setAutoSaveStatus("idle"));
    }, 900);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (autoSaveStatusTimerRef.current) clearTimeout(autoSaveStatusTimerRef.current);
    };
  }, [titleColor1, titleColor2, signatureText, showSignature, overlayFont, textStyle]);

  // Reschedule: date string in "YYYY-MM-DDTHH:mm" (Bogotá local, UTC-5)
  // For "both" platform posts these are set independently; for single-platform posts, only rescheduleDate is used.
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleIgDate, setRescheduleIgDate] = useState(""); // Instagram-only schedule
  const [rescheduleTkDate, setRescheduleTkDate] = useState(""); // TikTok-only schedule

  // Headline spell check state
  const [spellResult, setSpellResult] = useState<SpellResult>(null);
  const [isCheckingSpell, setIsCheckingSpell] = useState(false);

  // AI headline suggestions
  const [headlineSuggestions, setHeadlineSuggestions] = useState<string[]>([]);
  const [isLoadingHeadlines, setIsLoadingHeadlines] = useState(false);
  const [captionEval, setCaptionEval] = useState<{ score: number; suggestions: string[] } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const spellDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headlineJustCorrectedRef = useRef(false);

  // Caption spell check state
  const [captionSpellResult, setCaptionSpellResult] = useState<SpellResult>(null);
  const [isCheckingCaptionSpell, setIsCheckingCaptionSpell] = useState(false);
  const captionSpellDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionJustCorrectedRef = useRef(false);
  const [captionSaved, setCaptionSaved] = useState(false);

  // Carousel slide reorder state
  const [slideOrder, setSlideOrder] = useState<number[]>([]); // variant IDs in display order
  const [slideOrderDirty, setSlideOrderDirty] = useState(false);
  const [isSavingSlideOrder, setIsSavingSlideOrder] = useState(false);
  const [previewSlideId, setPreviewSlideId] = useState<number | null>(null); // which slide shows in phone
  const lastInitPostId = useRef<number | null>(null); // tracks which post's slideOrder was last initialized
  const slideOrderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce for auto-save

  // Reel generation state
  const [reelGenerating, setReelGenerating] = useState(false);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [reelVariantId, setReelVariantId] = useState<number | null>(null); // variant for which reel was generated
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const mainVideoRefDesktop = useRef<HTMLVideoElement | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [reelSlideOrder, setReelSlideOrder] = useState<number[]>([]); // variant IDs in desired reel order
  const lastReelInitPostId = useRef<number | null>(null);
  const reelDndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  // Reel video upload (user uploads their own MP4)
  const [reelVideoUploading, setReelVideoUploading] = useState(false);
  const [reelVideoUploadUrl, setReelVideoUploadUrl] = useState<string | null>(null);
  const [reelVideoUploadVariantId, setReelVideoUploadVariantId] = useState<number | null>(null);

  // ── Reel Studio — mix library + uploads into a custom carousel video ──
  type StudioSlide = { key: string; name: string; preview: string; b64?: string; variantId?: number; erPct?: number | null; contentType?: string; caption?: string };
  type LibrarySlide = { variantId: number; postId: number; caption: string; hook: string; contentType: string; style: string; thumbnail: string; erPct: number | null };
  type StudioTransition =
    | "hardcut"
    | "dissolve" | "fadeblack" | "fadewhite" | "fadegrays" | "hblur"
    | "wipeleft" | "wiperight" | "smoothleft" | "smoothright" | "coverleft" | "coverright" | "revealleft" | "revealright"
    | "zoomin" | "circleopen" | "circleclose" | "squeezev" | "squeezeh" | "pixelize"
    | "radial" | "diagtl" | "diagtr" | "wipetl" | "wipetr" | "vertopen" | "horzopen"
    | "hlwind" | "hrwind" | "vuwind" | "vdwind" | "slideleft" | "slideright";
  type StudioMusic = "none" | "electronica" | "corporativa" | "institucional";
  const [studioOpen, setStudioOpen] = useState(false);
  const [reelMode, setReelMode] = useState<'kenburns' | 'studio'>('kenburns');
  const [studioTab, setStudioTab] = useState<"upload" | "library" | "post">("post");
  const [studioSlides, setStudioSlides] = useState<StudioSlide[]>([]);
  const [library, setLibrary] = useState<LibrarySlide[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [studioGenerating, setStudioGenerating] = useState(false);
  const [studioVideoUrl, setStudioVideoUrl] = useState<string | null>(null);
  const [studioTransition, setStudioTransition] = useState<StudioTransition>("wipeleft");
  const [studioMusic, setStudioMusic] = useState<StudioMusic>("none");
  // Library track selection (overrides studioMusic when set)
  type LibraryMusicTrack = { id: number; title: string; artist: string; genre: string; mood: string; sourceUrl: string; duration: number; usageCount: number; isProtected: boolean; tags: string; isTrending: boolean; energyLevel: string };
  const [musicLibrary, setMusicLibrary] = useState<LibraryMusicTrack[]>([]);
  const [musicLibraryLoading, setMusicLibraryLoading] = useState(false);
  const [studioMusicTrackId, setStudioMusicTrackId] = useState<number | null>(null);
  const [studioMusicTrackUrl, setStudioMusicTrackUrl] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [hasMusicKey, setHasMusicKey] = useState(false);
  const [musicSyncing, setMusicSyncing] = useState(false);
  const [musicGenreFilter, setMusicGenreFilter] = useState<string>("trending");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showMoreTransitions, setShowMoreTransitions] = useState(false);
  const [studioClosingSlide, setStudioClosingSlide] = useState({
    enabled: false,
    showBullets: true,
    bullets: ["Tu mejor decisión", "Calidad garantizada", "Servicio profesional"],
    cta: "SIMULA TU AHORRO GRATIS",
  });
  const studioInputRef = useRef<HTMLInputElement | null>(null);

  // ── Reel Studio text review ──
  const [showStudioReview, setShowStudioReview] = useState(false);
  const [showFinalCaption, setShowFinalCaption] = useState(false);
  const [studioSpellChecking, setStudioSpellChecking] = useState(false);
  const [studioSpellResult, setStudioSpellResult] = useState<SpellResult>(null);

  // Media library state — uploaded real photos and videos
  type MediaItem = { id: number; type: string; mimeType: string; filename: string; label: string; createdAt: string };
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const mediaUploadRef = useRef<HTMLInputElement | null>(null);
  const reelVideoUploadRef = useRef<HTMLInputElement | null>(null);
  // Direct background upload — "Subir fondo" button in the image editor row
  const bgUploadRef = useRef<HTMLInputElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const customFontUploadRef = useRef<HTMLInputElement | null>(null);
  const customMusicUploadRef = useRef<HTMLInputElement | null>(null);
  const refImageInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingDirectBg, setIsUploadingDirectBg] = useState(false);
  const [isUploadingCustomFont, setIsUploadingCustomFont] = useState(false);
  const [customFontError, setCustomFontError] = useState<string | null>(null);
  const [customFonts, setCustomFonts] = useState<{ id: string; name: string; family: string }[]>([]);
  const [customFontInput, setCustomFontInput] = useState<string>("");
  const [businessLogoStoragePaths, setBusinessLogoStoragePaths] = useState<(string | null)[]>([null, null, null]);
  const [isUploadingCustomMusic, setIsUploadingCustomMusic] = useState(false);
  const [customMusicError, setCustomMusicError] = useState<string | null>(null);
  // Thumbnail cache: id → base64 data string (loaded on hover)
  const [mediaThumbCache, setMediaThumbCache] = useState<Record<number, string>>({});
  const [loadingThumbs, setLoadingThumbs] = useState<Set<number>>(new Set());

  const loadMediaThumb = useCallback((id: number) => {
    if (mediaThumbCache[id] || loadingThumbs.has(id)) return;
    setLoadingThumbs(prev => new Set([...prev, id]));
    fetch(`${BASE}/api/media/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.data) setMediaThumbCache(prev => ({ ...prev, [id]: d.data }));
      })
      .catch(() => {})
      .finally(() => setLoadingThumbs(prev => { const s = new Set(prev); s.delete(id); return s; }));
  }, [mediaThumbCache, loadingThumbs]);

  // Fetch media library items — scoped al negocio activo (strictOwnerFilter en backend)
  useEffect(() => {
    const bizId = activeBusinessIdRef.current;
    const url = bizId != null
      ? `${BASE}/api/media?businessId=${bizId}`
      : `${BASE}/api/media`;
    fetch(url, { credentials: "include" })
      .then(r => r.json())
      .then((data: MediaItem[]) => setMediaItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch music library on mount
  const loadMusicLibrary = useCallback(async () => {
    setMusicLibraryLoading(true);
    try {
      const [tracksRes, statusRes] = await Promise.all([
        fetch(`${BASE}/api/music`),
        fetch(`${BASE}/api/music/status`),
      ]);
      if (tracksRes.ok) {
        const data = await tracksRes.json();
        setMusicLibrary(data.tracks || []);
      }
      if (statusRes.ok) {
        const st = await statusRes.json();
        setHasMusicKey(st.hasPixabayKey);
      }
    } catch {}
    setMusicLibraryLoading(false);
  }, []);

  useEffect(() => { loadMusicLibrary(); }, []);

  // ── Resolve social handle for the post preview — never hardcode @eco.sas ──
  // Priority: 1) linked social account for the post's businessId+platform
  //           2) the post's own business name (from businessNameMap)
  //           3) "@tunegocio" (safe generic fallback — never another tenant's handle)
  const resolvePostHandle = (post: any): string => {
    if (!post) return "@tunegocio";
    const platform: string = post.platform === "tiktok" ? "tiktok" : "instagram";
    const bizId: number | null = post.businessId ?? null;
    const match = socialAccounts.find(
      a => a.platform === platform && (bizId == null || a.businessId === bizId)
    );
    if (match?.username) return `@${match.username.replace(/^@/, "")}`;
    const bizName = bizId != null ? (businessNameMap[bizId] ?? null) : null;
    if (bizName) return `@${bizName.toLowerCase().replace(/\s+/g, "").slice(0, 20)}`;
    return "@tunegocio";
  };

  // ── Returns true if a business has at least one connected social account ──
  // Single source of truth — mirrors the scheduler guard: connected='true' only.
  const hasConnectedAccount = (bizId: number | null | undefined): boolean => {
    if (bizId == null) return false;
    return socialAccounts.some(a => a.businessId === bizId && a.connected === "true");
  };

  // ── Derived computed values — declared here so ALL effects below can safely reference them ──
  // (Moving these above effects avoids a temporal-dead-zone crash in the production bundle)
  const allPosts = posts || [];
  const pendingQueue = allPosts.filter((p: any) => p.status === 'pending_approval');
  const requestedPost = initialPostId ? allPosts.find((p: any) => p.id === Number(initialPostId)) : undefined;
  const allPendingPosts = requestedPost ? [requestedPost] : pendingQueue;
  let currentPost = allPendingPosts[currentIndex];
  // Use full post data (with imageData) for image rendering; slim list only has variant ids
  const fullVariants = currentPostFull?.imageVariants ?? [];
  // selectedVariant stores variant.id (unique PK) — never variantIndex which can repeat
  const activeImage = (() => {
    if (currentPost?.contentType === "carousel") {
      const previewId = previewSlideId ?? slideOrder[0] ?? null;
      if (previewId) {
        const found = fullVariants.find((v: any) => v.id === previewId);
        if (found) return found;
      }
    }
    return fullVariants.find((v: any) => v.id === selectedVariant)
      ?? fullVariants.find((v: any) => !!v.imageData);
  })();

  // Auto-fetch reel URL when the active variant already has a saved reel.
  // This ensures the video preview and "listo" badge appear when navigating
  // to a post that was generated in a previous session.
  // We check the active variant first; if it has no reel, we scan all other
  // variants of the post (Reel Studio saves to the first variant, not necessarily
  // the currently selected one).
  useEffect(() => {
    if (!activeImage?.id) return;
    // Reset so we don't flash old reel from a different variant
    setReelUrl(null);
    setReelVariantId(null);
    const isReel = currentPost?.contentType === "reel" || currentPost?.contentType === "story";
    if (!isReel) return;

    const checkVariant = (vid: number): Promise<{ url: string; id: number } | null> =>
      fetch(`${BASE}/api/reels/variants/${vid}/status`)
        .then(r => r.ok ? r.json() : null)
        .then(data => (data?.status === "ready" && data?.url) ? { url: data.url, id: vid } : null)
        .catch(() => null);

    const activeId = activeImage.id;
    checkVariant(activeId).then(async result => {
      if (result) {
        setReelUrl(result.url);
        setReelVariantId(result.id);
      } else {
        // Active variant has no reel — scan other variants (Reel Studio saves to first variant)
        const otherIds = (fullVariants as any[])
          .map((v: any) => v.id)
          .filter((id: number) => id !== activeId);
        for (const vid of otherIds) {
          const r = await checkVariant(vid);
          if (r) { setReelUrl(r.url); setReelVariantId(r.id); break; }
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImage?.id, currentPost?.contentType, fullVariants.length]);

  // Rehydrate brand color + firma controls from the stored overlay params of the active variant.
  // When the variant has no stored params, always reset to business defaults.
  useEffect(() => {
    if (!activeImage) return;
    // Color 1: use stored value or reset to business default
    setTitleColor1(activeImage.overlayTitleColor1 ?? bizDefaultTitleColor1.current);
    // Color 2: use stored value or reset to business default
    setTitleColor2(activeImage.overlayTitleColor2 ?? bizDefaultTitleColor2.current);
    // showSignature: use stored value or default to true
    if (activeImage.overlayShowSignature !== null && activeImage.overlayShowSignature !== undefined) {
      setShowSignature(activeImage.overlayShowSignature !== "false");
    } else {
      setShowSignature(true);
    }
    // signatureText: use stored value or reset to business default
    if (activeImage.overlaySignatureText !== null && activeImage.overlaySignatureText !== undefined) {
      setSignatureText(activeImage.overlaySignatureText);
    } else {
      setSignatureText(bizDefaultSignatureText.current);
    }
    // overlayLogoPath: if variant has a stored custom logo, rehydrate the editor state
    if (activeImage.overlayCustomLogoUrl) {
      const storedPath = activeImage.overlayCustomLogoUrl as string;
      const browserUrl = storedPath.startsWith("/objects/")
        ? `${BASE}/api/storage/objects/${storedPath.slice("/objects/".length)}`
        : storedPath;
      setOverlayLogoUrl(browserUrl);
      setOverlayLogoPath(storedPath);
    } else {
      // No custom logo stored — reset to business default
      setOverlayLogoUrl(activeBusinessLogoUrl);
      setOverlayLogoPath(activeBusinessLogoPath);
    }
    // overlayFont2: rehydrate from stored variant; reset selector state accordingly
    const storedFont2 = activeImage.overlayFont2 as string | null | undefined;
    if (storedFont2) {
      setOverlayFont2(storedFont2);
      setShowFont2Selector(true);
    } else {
      setOverlayFont2(null);
      setShowFont2Selector(false);
      setCustomFont2Input("");
    }
    // Auto-apply default composition preset when image changes
    setActiveElementLayers([]);
    setCompLogoEnabled(true);
    setCompTextEnabled(true);
    const defPreset = compPresets.find(p => p.isDefault);
    if (defPreset) {
      setActiveElementLayers(Array.isArray(defPreset.configJson?.elements) ? defPreset.configJson.elements : []);
      if (defPreset.configJson?.logo !== undefined) setCompLogoEnabled(defPreset.configJson.logo.enabled ?? true);
      if (defPreset.configJson?.text !== undefined) setCompTextEnabled(defPreset.configJson.text.enabled ?? true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImage?.id]);

  // Fetch custom fonts (uploaded by the user) on mount
  const loadCustomFonts = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/fonts`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCustomFonts(Array.isArray(data?.fonts) ? data.fonts : []);
      }
    } catch {}
  }, []);

  useEffect(() => { loadCustomFonts(); }, []);


  const handleSyncMusicLibrary = async () => {
    setMusicSyncing(true);
    try {
      const res = await fetch(`${BASE}/api/music/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ genres: "all" }) });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `Biblioteca sincronizada`, description: `${data.added} nuevos tracks agregados, ${data.skipped} ya existían.` });
        await loadMusicLibrary();
      } else {
        toast({ title: "Error al sincronizar", description: data.error || "Verifica tu clave Pixabay en las variables de entorno (PIXABAY_API_KEY)", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de conexión", variant: "destructive" });
    }
    setMusicSyncing(false);
  };

  /** Resolve the playable URL for a track.
   * - Relative /api/... paths: prepend the BASE URL for browser access
   * - External https:// URLs (SoundHelix, FMA CDN, etc.): use directly */
  const resolveTrackUrl = (track: LibraryMusicTrack): string => {
    if (track.sourceUrl.startsWith("/api/")) {
      return `${BASE}${track.sourceUrl}`;
    }
    return track.sourceUrl;
  };

  const handlePlayTrack = (track: LibraryMusicTrack) => {
    if (playingTrackId === track.id) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
      return;
    }
    const playUrl = resolveTrackUrl(track);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = playUrl;
      audioRef.current.play().catch(() => {});
    } else {
      const audio = new Audio(playUrl);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingTrackId(null);
    }
    setPlayingTrackId(track.id);
  };

  const handleSelectMusicTrack = (track: LibraryMusicTrack) => {
    setStudioMusicTrackId(track.id);
    setStudioMusicTrackUrl(track.sourceUrl);
    setStudioMusic("none");
    fetch(`${BASE}/api/music/${track.id}/use`, { method: "PATCH" }).catch(() => {});
  };

  const handleClearMusicTrack = () => {
    setStudioMusicTrackId(null);
    setStudioMusicTrackUrl(null);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingTrackId(null);
  };

  const genreIcon: Record<string, string> = {
    corporativa: "🏢", electrónica: "⚡", latina: "🌴", pop: "🎵", ambiente: "🌊", ambient: "🌊",
    cinematic: "🎬", funk: "🎸", acústica: "🎻", jazz: "🎷", soul: "🎤", urbano: "🏙️", general: "🎶",
    trap: "🔫", "lo-fi": "☕", phonk: "💀", house: "🔊", dance: "💃", lofi: "☕",
  };
  const GENRE_FILTERS = [
    { key: "trending", label: "🔥 Trending" },
    { key: "all",      label: "Todos" },
    { key: "trap",     label: "🔫 Trap" },
    { key: "lo-fi",    label: "☕ Lo-Fi" },
    { key: "phonk",    label: "💀 Phonk" },
    { key: "house",    label: "🔊 House" },
    { key: "electrónica", label: "⚡ EDM" },
    { key: "latina",   label: "🌴 Latina" },
    { key: "cinematic",label: "🎬 Cine" },
    { key: "corporativa", label: "🏢 Corp" },
    { key: "ambient",  label: "🌊 Ambient" },
  ];

  /**
   * Infer preferred music genre from caption tone/keywords.
   * Mapping (acceptance criteria):
   *   energético / acción     → trap / electrónica
   *   oscuro / peligroso      → phonk
   *   relajado / inspiracional → lo-fi   ← inspirational maps to lo-fi (calming uplift)
   *   informativo / educativo → house    ← informational maps to house (neutral energy)
   *   tropical / latina       → latina
   *   corporativo / profesional → cinematic ← corporate maps to cinematic (premium feel)
   *   ambiental / emocional   → ambient
   *   fiesta / club           → electrónica
   */
  const inferMusicGenre = (caption: string): string => {
    const t = (caption || "").toLowerCase();
    // Energético/acción → trap
    if (/trap|drill|street|calle|gang|swag|flex|grind|hustle|night|noct|energía|energy|activ/i.test(t)) return "trap";
    // Oscuro/peligroso → phonk
    if (/phonk|drift|dark|oscur|sombr|villain|peligr/i.test(t)) return "phonk";
    // Relajado/inspiracional → lo-fi (calming uplift)
    if (/relax|chill|estudi|focus|concentra|calma|paz|tranquil|medita|lo.?fi|lofi|inspira|motiva|esperanza|superaci/i.test(t)) return "lo-fi";
    // Informativo/educativo → house (moderate neutral energy)
    if (/tip|dato|consejo|guía|guia|aprende|aprend|informe|información|informaci|educat|conocimient|cómo|como hacer|how to|explicaci/i.test(t)) return "house";
    // Tropical/latina → latina
    if (/tropical|salsa|reggaeton|cumbia|reggae|caribeñ|latin|dembow|cali|colombia/i.test(t)) return "latina";
    // Corporativo/profesional → cinematic (premium/epic feel)
    if (/empresa|negocio|corporat|liderazgo|profesional|marca|servicio|solución|logro|éxito|triunf|power|fuerza|épic|epic/i.test(t)) return "cinematic";
    // Club/fiesta/EDM → electrónica
    if (/club|party|fiesta|baile|dance|dj|rave|bass drop|edm|electro|synth|techno|future|neon|digital/i.test(t)) return "electrónica";
    // Ambiental/emocional → ambient
    if (/amor|love|soul|feel|emoción|sentim|corazón|jazz|blues|atmosfer|natural|paisaje/i.test(t)) return "ambient";
    return "trending";
  };

  const handleMediaUpload = async (file: File) => {
    setIsUploadingMedia(true);
    setMediaError(null);
    try {
      const fileType = file.type.startsWith("video/") ? "video" : "image";
      const maxMB = fileType === "video" ? 80 : 20;
      if (file.size > maxMB * 1024 * 1024) {
        setMediaError(`El archivo es demasiado grande. Máximo ${maxMB}MB para ${fileType === "video" ? "videos" : "imágenes"}.`);
        return;
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
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
          type: fileType,
          businessId: activeBusinessIdRef.current ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al subir" }));
        setMediaError(err.error ?? "Error al subir el archivo");
        return;
      }
      const saved: MediaItem = await res.json();
      setMediaItems(prev => [saved, ...prev]);
      toast({ title: fileType === "video" ? "Video subido" : "Foto subida", description: file.name });
    } catch {
      setMediaError("Error al leer el archivo. Intenta de nuevo.");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleDeleteMedia = async (id: number) => {
    if (!confirm("¿Eliminar este archivo de la galería?")) return;
    await fetch(`${BASE}/api/media/${id}`, { method: "DELETE" });
    setMediaItems(prev => prev.filter(m => m.id !== id));
  };

  // Direct background upload — "Subir fondo" in the image editor.
  // For carousel posts: immediately adds the file as a new raw slide (no overlays).
  // For any post: also loads the file as libraryMedia so "Usar foto real" is available for adding overlays.
  const handleDirectBgUpload = async (file: File) => {
    const fileType = file.type.startsWith("video/") ? "video" : "image";
    const maxMB = fileType === "video" ? 80 : 20;
    if (file.size > maxMB * 1024 * 1024) {
      toast({ title: "Archivo muy grande", description: `Máximo ${maxMB}MB para ${fileType === "video" ? "videos" : "imágenes"}.`, variant: "destructive" });
      return;
    }
    setIsUploadingDirectBg(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 1. Save to media library
      const mediaRes = await fetch(`${BASE}/api/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, label: "", data: base64, type: fileType }),
      });
      if (!mediaRes.ok) {
        toast({ title: "Error al subir", description: "No se pudo guardar el archivo.", variant: "destructive" });
        return;
      }
      const saved: MediaItem = await mediaRes.json();
      setMediaItems(prev => [saved, ...prev]);

      // 2. If there is a current post, add immediately as a raw slide (no overlays)
      if (currentPost?.id) {
        const slideRes = await fetch(`${BASE}/api/posts/${currentPost.id}/add-raw-slide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId: saved.id }),
        });
        if (slideRes.ok) {
          const newVariant = await slideRes.json();
          // Append to carousel order and show it immediately in the preview
          setSlideOrder(prev => [...prev, newVariant.id]);
          setPreviewSlideId(newVariant.id);
          refreshCurrentPost(currentPost.id);
          toast({
            title: fileType === "video" ? "🎬 Video agregado como slide" : "📷 Foto agregada como slide",
            description: "Puedes reordenarla o agregarle logo y texto con el botón \"Usar foto real\".",
          });
          // Also load into libraryMedia banner so the user can optionally apply ECO overlays
          setLibraryMedia({ id: saved.id, filename: saved.filename, label: saved.label, mimeType: saved.mimeType, data: base64 }); setIsLibraryMediaRotated(false);
          return;
        }
      }

      // Fallback (no post selected): just show the banner
      setLibraryMedia({ id: saved.id, filename: saved.filename, label: saved.label, mimeType: saved.mimeType, data: base64 }); setIsLibraryMediaRotated(false);
      toast({ title: fileType === "video" ? "Video listo" : "Foto lista", description: "Ajusta el título y las herramientas y luego toca \"Usar foto real\"." });
    } catch {
      toast({ title: "Error", description: "No se pudo leer el archivo.", variant: "destructive" });
    } finally {
      setIsUploadingDirectBg(false);
    }
  };

  // Upload custom font from approval page
  const handleCustomFontUpload = async (file: File) => {
    setCustomFontError(null);
    if (!file.name.match(/\.(ttf|otf|woff|woff2)$/i)) {
      setCustomFontError("Formato no compatible. Usa TTF, OTF, WOFF o WOFF2.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCustomFontError("Máximo 5 MB por tipografía.");
      return;
    }
    setIsUploadingCustomFont(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      const res = await fetch(`${BASE}/api/fonts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: base64 }),
      });
      if (!res.ok) throw new Error("upload failed");
      const saved = await res.json();
      // POST /api/fonts returns { ok: true, font: { id, name, family, mimeType } }
      const font = saved?.font ?? saved;
      setCustomFonts(prev => [...prev, font]);
      // Auto-select this font in the editor (custom_<id>)
      setTextStyle(`custom_${font.id}` as typeof textStyle);
      toast({ title: "Tipografía cargada", description: `"${font.name}" está seleccionada.` });
    } catch {
      setCustomFontError("No se pudo subir la tipografía. Intenta de nuevo.");
    } finally {
      setIsUploadingCustomFont(false);
    }
  };

  // Save a specific logo slot (0=primary, 1=variant2, 2=variant3) to the backend
  const saveLogoSlot = async (slotIdx: number, newPath: string | null, newBrowserUrl: string | null) => {
    const bizId = activeBusinessIdRef.current;
    if (!bizId) return;

    const newPaths = [...businessLogoStoragePaths];
    newPaths[slotIdx] = newPath;
    setBusinessLogoStoragePaths(newPaths);

    const newUrls = [...businessLogoOptions];
    while (newUrls.length < 3) newUrls.push("");
    if (newBrowserUrl !== null) newUrls[slotIdx] = newBrowserUrl; else newUrls[slotIdx] = "";
    setBusinessLogoOptions(newUrls.filter(Boolean));

    // Slot 0 = primary logoUrl, slots 1+2 go into logoUrls JSON array
    // Use empty string as sentinel for empty slots to preserve fixed slot positions
    const primaryPath = newPaths[0] ?? null;
    const extraPaths = [newPaths[1] ?? "", newPaths[2] ?? ""];

    // If slot 0 changed, also update the active/default logo state
    if (slotIdx === 0) {
      setActiveBusinessLogoUrl(newBrowserUrl ?? "");
      setActiveBusinessLogoPath(newPath ?? "");
      if (!overlayLogoPath || overlayLogoPath === businessLogoStoragePaths[0]) {
        setOverlayLogoUrl(newBrowserUrl ?? "");
        setOverlayLogoPath(newPath ?? "");
      }
    }

    try {
      await fetch(`${BASE}/api/businesses/${bizId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: primaryPath,
          logoUrls: JSON.stringify(extraPaths),
        }),
      });
    } catch { /* non-critical */ }
  };

  // Upload custom music / jingle from approval page
  const handleCustomMusicUpload = async (file: File) => {
    setCustomMusicError(null);
    if (!file.type.startsWith("audio/")) {
      setCustomMusicError("Formato no compatible. Usa MP3, WAV u OGG.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setCustomMusicError("Máximo 20 MB por pista.");
      return;
    }
    setIsUploadingCustomMusic(true);
    try {
      // Backend expects JSON { data: base64, filename, mimeType, title }
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${BASE}/api/music/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: base64,
          filename: file.name,
          mimeType: file.type || "audio/mpeg",
          title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        }),
      });
      if (!res.ok) throw new Error("upload failed");
      const saved = await res.json();
      // POST /api/music/upload returns { ok: true, track: {...} }
      const track = saved?.track ?? saved;
      setMusicLibrary(prev => [track, ...prev]);
      setStudioMusicTrackId(track.id);
      setStudioMusicTrackUrl(track.sourceUrl ?? null);
      toast({ title: "🎵 Jingle cargado", description: `"${track.title}" seleccionado para este video.` });
    } catch {
      setCustomMusicError("No se pudo subir el audio. Intenta de nuevo.");
    } finally {
      setIsUploadingCustomMusic(false);
    }
  };

  // Debounced spell check when headline changes
  useEffect(() => {
    setSpellResult(null);
    if (spellDebounceRef.current) clearTimeout(spellDebounceRef.current);
    if (headlineJustCorrectedRef.current) { headlineJustCorrectedRef.current = false; return; }
    if (!customHeadline.trim() || customHeadline.trim().length < 4) return;
    spellDebounceRef.current = setTimeout(async () => {
      setIsCheckingSpell(true);
      try {
        const res = await fetch(`${BASE}/api/posts/check-headline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: customHeadline.trim() }),
        });
        const data: SpellResult = await res.json();
        setSpellResult(data);
      } catch { /* silently ignore */ }
      finally { setIsCheckingSpell(false); }
    }, 900);
    return () => { if (spellDebounceRef.current) clearTimeout(spellDebounceRef.current); };
  }, [customHeadline]);

  // Debounced spell check for caption (1.5 s delay — captions are longer)
  useEffect(() => {
    setCaptionSpellResult(null);
    if (captionSpellDebounceRef.current) clearTimeout(captionSpellDebounceRef.current);
    if (captionJustCorrectedRef.current) { captionJustCorrectedRef.current = false; return; }
    if (!editedCaption.trim() || editedCaption.trim().length < 10) return;
    captionSpellDebounceRef.current = setTimeout(async () => {
      setIsCheckingCaptionSpell(true);
      try {
        const res = await fetch(`${BASE}/api/posts/check-caption`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: editedCaption.trim() }),
        });
        const data: SpellResult = await res.json();
        setCaptionSpellResult(data);
      } catch { /* silently ignore */ }
      finally { setIsCheckingCaptionSpell(false); }
    }, 1500);
    return () => { if (captionSpellDebounceRef.current) clearTimeout(captionSpellDebounceRef.current); };
  }, [editedCaption]);

  // Debounced location search (800ms delay)
  useEffect(() => {
    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
    const q = locationQuery.trim();
    if (!q || q.length < 2) { setLocationResults([]); setLocationDropdownOpen(false); return; }
    // If the query matches the currently selected location name, don't re-search
    if (q === editedLocationName && editedLocationId) { setLocationDropdownOpen(false); return; }
    locationDebounceRef.current = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const res = await fetch(`${BASE}/api/locations/search?q=${encodeURIComponent(q)}`);
        const data = await res.json() as { id: string; name: string }[];
        setLocationResults(Array.isArray(data) ? data.slice(0, 8) : []);
        setLocationDropdownOpen(true);
      } catch { setLocationResults([]); }
      finally { setLocationSearching(false); }
    }, 800);
    return () => { if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current); };
  }, [locationQuery]);

  // Fetch defaultLocation from brand profile once on mount
  useEffect(() => {
    fetch(`${BASE}/api/brand-profile`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const loc = data?.defaultLocation ?? "";
        setDefaultLocationFromProfile(loc);
        if (loc && localStorage.getItem("hz_loc_save_as_default") === null) {
          setAndPersistLocationSaveAsDefault(true);
        }
      })
      .catch(() => {});
  }, []);

  // When defaultLocation arrives from server and the current post still has no location, auto-fill
  useEffect(() => {
    if (!defaultLocationFromProfile) return;
    if (editedLocationId || editedLocationName) return; // post already has a location, don't override
    setLocationQuery(prev => prev || defaultLocationFromProfile);
  }, [defaultLocationFromProfile]);

  // Generate multi-scene Reel (if post has 2+ slides) or single Ken Burns reel
  const handleGenerateReel = async () => {
    if (!activeImage?.id || !currentPost?.id || reelGenerating) return;
    setReelGenerating(true);
    setReelUrl(null);
    setReelVariantId(activeImage.id);
    const isMultiSlide = (currentPost.imageVariants?.length ?? 0) > 1;
    try {
      let res: Response;
      if (isMultiSlide) {
        // New: stitch all reel slides into a vertical multi-scene video
        res = await fetch(`${BASE}/api/reels/posts/${currentPost.id}/generate-reel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transition: "dissolve",
            music: "electronica",
            variantOrder: reelSlideOrder.length > 0 ? reelSlideOrder : undefined,
          }),
        });
      } else {
        // Legacy: single-image Ken Burns effect
        res = await fetch(`${BASE}/api/reels/variants/${activeImage.id}/generate`, { method: "POST" });
      }
      const data = await res.json();
      if (res.ok && data.url) {
        setReelUrl(data.url);
        const desc = isMultiSlide
          ? `${data.slideCount} escenas · ${Math.round(data.slideCount * 4.5)}s · Hook → Problema → Solución → CTA`
          : "Video con efecto Ken Burns. Descárgalo arriba.";
        toast({ title: "🎬 Reel listo", description: desc });
        queryClient.invalidateQueries({ queryKey: ["posts"] });
      } else {
        toast({ title: "Error generando reel", description: data.error || "Intenta de nuevo.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de conexión", description: "No se pudo generar el reel.", variant: "destructive" });
    } finally {
      setReelGenerating(false);
    }
  };

  // Upload user's own MP4/MOV video for a Reel variant
  const handleReelVideoUpload = async (file: File) => {
    if (!activeImage?.id) return;
    const ALLOWED = ["video/mp4", "video/quicktime", "video/webm"];
    if (!ALLOWED.includes(file.type)) {
      toast({ title: "Formato no admitido", description: "Solo MP4, MOV o WebM.", variant: "destructive" });
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast({ title: "Video muy grande", description: "El límite es 200 MB.", variant: "destructive" });
      return;
    }
    setReelVideoUploading(true);
    setReelVideoUploadVariantId(activeImage.id);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? result); // strip data:... prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${BASE}/api/reels/variants/${activeImage.id}/upload-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: b64, mimeType: file.type }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setReelVideoUploadUrl(data.url);
        toast({ title: "✅ Video subido", description: "Tu video quedó guardado y se publicará como Reel en el horario programado." });
        queryClient.invalidateQueries({ queryKey: ["posts"] });
      } else {
        toast({ title: "Error subiendo video", description: data.error || "Intenta de nuevo.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de conexión", description: "No se pudo subir el video.", variant: "destructive" });
    } finally {
      setReelVideoUploading(false);
    }
  };

  const handleStudioImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const readers = files.map(
      (file) =>
        new Promise<StudioSlide>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            resolve({
              key: `upload-${Date.now()}-${Math.random()}`,
              name: file.name,
              preview: dataUrl,
              b64: dataUrl.split(",")[1],
            });
          };
          reader.readAsDataURL(file);
        })
    );
    Promise.all(readers).then((imgs) => {
      setStudioSlides((prev) => [...prev, ...imgs].slice(0, 10));
    });
    e.target.value = "";
  };

  const moveStudioSlide = (index: number, dir: -1 | 1) => {
    setStudioSlides((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleLibrarySlide = (lib: LibrarySlide) => {
    setStudioSlides((prev) => {
      const existing = prev.findIndex((s) => s.variantId === lib.variantId);
      if (existing >= 0) return prev.filter((_, i) => i !== existing);
      if (prev.length >= 10) {
        toast({ title: "Máximo 10 slides", variant: "destructive" });
        return prev;
      }
      return [
        ...prev,
        {
          key: `lib-${lib.variantId}`,
          name: lib.hook || lib.caption.slice(0, 30) || `Slide ${lib.variantId}`,
          preview: `data:image/jpeg;base64,${lib.thumbnail}`,
          variantId: lib.variantId,
          erPct: lib.erPct,
          contentType: lib.contentType,
        },
      ];
    });
  };

  const fetchLibrary = async () => {
    if (loadingLibrary || library.length > 0) return;
    setLoadingLibrary(true);
    try {
      const res = await fetch(`${BASE}/api/reels/slide-library?limit=300`);
      const data = await res.json();
      if (res.ok) setLibrary(data.slides ?? []);
    } catch {
      toast({ title: "Error cargando biblioteca", variant: "destructive" });
    } finally {
      setLoadingLibrary(false);
    }
  };

  const handleGenerateStudio = async () => {
    if (studioSlides.length === 0 || studioGenerating) return;
    setStudioGenerating(true);
    setStudioVideoUrl(null);
    try {
      const res = await fetch(`${BASE}/api/reels/carousel-from-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: studioSlides.map((s) => ({ b64: s.b64, variantId: s.variantId })),
          transition: studioTransition,
          music: studioMusicTrackId ? "none" : studioMusic,
          musicTrackId: studioMusicTrackId ?? undefined,
          musicTrackUrl: studioMusicTrackUrl ?? undefined,
          captions: studioSlides.map((s) => s.caption ?? ""),
          closingSlide: studioClosingSlide,
          postId: currentPost?.id ?? undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setStudioVideoUrl(data.url);
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        const durSec = studioTransition === "hardcut"
          ? data.slideCount * 5
          : Math.round((data.slideCount - 1) * 4.6 + 5);
        const transLabel: Record<string, string> = {
          hardcut: "✂️ Corte", wipeleft: "📖 Libro", wiperight: "📖 Libro →", dissolve: "✨ Disolución",
          slideleft: "◀ Slide", slideright: "▶ Slide", fadeblack: "⬛ Fade negro", fadewhite: "⬜ Fade blanco",
          fadegrays: "🎞 Fade gris", hblur: "💨 Blur", smoothleft: "◀ Suave", smoothright: "▶ Suave",
          coverleft: "📱 Cover", coverright: "📱 Cover →", revealleft: "🎭 Reveal", revealright: "🎭 Reveal →",
          zoomin: "🔍 Zoom", circleopen: "⭕ Círculo", circleclose: "🔴 Cierre", squeezev: "⬆ Squeeze",
          squeezeh: "↔ Squeeze", pixelize: "🟫 Pixel", radial: "🌀 Radial", diagtl: "↖ Diagonal",
          diagtr: "↗ Diagonal", wipetl: "↖ Wipe", wipetr: "↗ Wipe", vertopen: "⬆↓ Cortina",
          horzopen: "↔ Cortina", hlwind: "🌬 Viento H", hrwind: "🌬 Viento →", vuwind: "🌬 Viento ↑", vdwind: "🌬 Viento ↓",
        };
        const selectedLibTrack = studioMusicTrackId ? musicLibrary.find(t => t.id === studioMusicTrackId) : null;
        const musicLabel: Record<string, string> = { none: "", institucional: " · 🎵 Institucional", electronica: " · 🎵 Electrónica", corporativa: " · 🏢 Corporativa" };
        const musicLabelStr = selectedLibTrack ? ` · 🎵 ${selectedLibTrack.title}` : (musicLabel[studioMusic] ?? "");
        toast({
          title: "🎬 Video listo",
          description: `${data.slideCount} slides · ~${durSec}s · ${transLabel[data.transition] ?? data.transition}${musicLabelStr} · 1080×1350`,
        });
      } else {
        toast({ title: "Error generando video", description: data.error || "Intenta de nuevo.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de conexión", variant: "destructive" });
    } finally {
      setStudioGenerating(false);
    }
  };

  // Opens the review panel and resets the previous spell result
  const openStudioReview = () => {
    setStudioSpellResult(null);
    setShowStudioReview(true);
  };

  // Runs AI spell check on all Reel Studio text fields combined
  const handleStudioSpellCheck = async () => {
    const lines: string[] = [];
    studioSlides.forEach((s, i) => {
      if (s.caption?.trim()) lines.push(`Slide ${i + 1}: ${s.caption.trim()}`);
    });
    if (studioClosingSlide.enabled) {
      if (studioClosingSlide.showBullets) {
        studioClosingSlide.bullets.forEach((b, i) => {
          if (b.trim()) lines.push(`Bullet ${i + 1}: ${b.trim()}`);
        });
      }
      if (studioClosingSlide.cta.trim()) lines.push(`CTA: ${studioClosingSlide.cta.trim()}`);
    }
    const combined = lines.join("\n");
    if (!combined) return;
    setStudioSpellChecking(true);
    setStudioSpellResult(null);
    try {
      const res = await fetch(`${BASE}/api/posts/check-headline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combined }),
      });
      const data: SpellResult = await res.json();
      setStudioSpellResult(data);
    } catch { /* silently ignore */ }
    finally { setStudioSpellChecking(false); }
  };

  // Download a base64 image as a file
  const downloadImage = (base64Data: string, filename: string) => {
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (posts && posts.length > 0) {
      if (initialPostId) {
        // When navigating to a specific post, always show it at index 0
        setCurrentIndex(0);
      }
    }
  }, [posts, initialPostId]);

  useEffect(() => {
    if (currentPost) {
      setEditedCaption(currentPost.caption || "");
      setEditedHashtags(currentPost.hashtags || "");
      setEditedHashtagsTiktok(currentPost.hashtagsTiktok || "");
      // Auto-generate hashtags if the post has none (old posts created before the feature)
      if (!currentPost.hashtags && !currentPost.hashtagsTiktok) {
        fetch(`${BASE}/api/posts/${currentPost.id}/regenerate-hashtags`, { method: "POST" })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.hashtags)     setEditedHashtags(data.hashtags);
            if (data?.hashtagsTiktok) setEditedHashtagsTiktok(data.hashtagsTiktok);
          })
          .catch(() => {});
      }
      // Use variant.id (unique) — never variantIndex which can repeat after deletions
      const firstId = currentPost.imageVariants?.[0]?.id ?? 0;
      setSelectedVariant(currentPost.selectedImageVariant ?? firstId);
      setEditedPlatform("both");  // Always default to publish on all platforms
      setCaptionEval(null); // Reset AI analysis when switching posts
      // Auto-suggest music genre based on caption tone (only if no track is selected yet).
      // Explicit preference set in the Reel generator overrides the caption-based inference.
      if (!studioMusicTrackId) {
        const generatorHint = localStorage.getItem("eco:reelMusicGenreHint") || "";
        const suggested = generatorHint || inferMusicGenre(currentPost.caption || "");
        setMusicGenreFilter(suggested);
      }
      // Location: restore saved values; if post has none, auto-fill from the user's default location
      const savedLocName = currentPost.locationName || "";
      const savedLocId   = currentPost.locationId   || "";
      setEditedLocationId(savedLocId);
      setEditedLocationName(savedLocName);
      // If the post has no location yet and the user has a defaultLocation saved, pre-fill the query
      // so the search debounce kicks in automatically and shows the dropdown for quick selection.
      setLocationQuery(savedLocName || defaultLocationFromProfile || "");
      setLocationResults([]);
      setLocationDropdownOpen(false);

      if (currentPost.status === "scheduled") {
        // Scheduled posts: show the already-confirmed date(s)
        const igDate = currentPost.scheduledAtInstagram;
        const tkDate = currentPost.scheduledAtTiktok;
        // For "both" platform posts use per-platform fields, falling back to scheduledAt
        setRescheduleIgDate(igDate ? toBogotaLocal(new Date(igDate))
          : currentPost.scheduledAt ? toBogotaLocal(new Date(currentPost.scheduledAt)) : "");
        setRescheduleTkDate(tkDate ? toBogotaLocal(new Date(tkDate))
          : currentPost.scheduledAt ? toBogotaLocal(new Date(currentPost.scheduledAt)) : "");
        setRescheduleDate(currentPost.scheduledAt ? toBogotaLocal(new Date(currentPost.scheduledAt)) : "");
        return;
      } else {
        // Pending posts: prefill from already-assigned dates if present; only fetch next-slot
        // if a date field is truly absent. Stale async responses are discarded via cancelled flag.
        const platform = currentPost.platform || "instagram";
        const preIgDate = currentPost.scheduledAtInstagram ?? undefined;
        const preTkDate = currentPost.scheduledAtTiktok ?? undefined;

        if (platform === "both") {
          // Resolve each network independently: per-platform date ?? generic scheduledAt ?? fetch
          const igValue = preIgDate ?? currentPost.scheduledAt ?? null;
          const tkValue = preTkDate ?? currentPost.scheduledAt ?? null;
          setRescheduleIgDate(igValue ? toBogotaLocal(new Date(igValue)) : "");
          setRescheduleTkDate(tkValue ? toBogotaLocal(new Date(tkValue)) : "");
          setRescheduleDate(igValue ? toBogotaLocal(new Date(igValue))
            : tkValue ? toBogotaLocal(new Date(tkValue)) : "");
          // Only fetch next-slot when at least one field has no date at all
          if (!igValue || !tkValue) {
            let cancelled = false;
            const ct = currentPost.contentType ?? "image";
            fetch(`${BASE}/api/posts/next-slot-per-platform?contentType=${encodeURIComponent(ct)}&excludeId=${currentPost.id}`)
              .then(r => r.json())
              .then((data: { instagram?: string; tiktok?: string }) => {
                if (cancelled) return;
                // Only fill fields that are still empty (user may have typed in the meantime)
                if (!igValue && data.instagram) {
                  setRescheduleIgDate(prev => prev === "" ? toBogotaLocal(new Date(data.instagram!)) : prev);
                  setRescheduleDate(prev => prev === "" ? toBogotaLocal(new Date(data.instagram!)) : prev);
                }
                if (!tkValue && data.tiktok) {
                  setRescheduleTkDate(prev => prev === "" ? toBogotaLocal(new Date(data.tiktok!)) : prev);
                }
              })
              .catch(() => { /* keep prefilled values */ });
            return () => { cancelled = true; };
          }
          return;
        } else {
          // Single-platform: prefill from scheduledAt if present; fetch next-slot only if absent
          if (currentPost.scheduledAt) {
            setRescheduleDate(toBogotaLocal(new Date(currentPost.scheduledAt)));
            return;
          } else {
            setRescheduleDate("");
            let cancelled = false;
            fetch(`${BASE}/api/posts/next-slot?platform=${encodeURIComponent(platform)}&excludeId=${currentPost.id}`)
              .then(r => r.json())
              .then((data: { scheduledAt?: string }) => {
                if (cancelled) return;
                // Only fill if still empty (user may have typed before fetch resolved)
                if (data.scheduledAt) {
                  setRescheduleDate(prev => prev === "" ? toBogotaLocal(new Date(data.scheduledAt!)) : prev);
                }
              })
              .catch(() => { /* keep empty */ });
            return () => { cancelled = true; };
          }
        }
      }
    }
    return;
  }, [currentPost?.id]);

  // Load full image data for the currently viewed post (with imageData) — only one post at a time
  useEffect(() => {
    if (!currentPost?.id) { setCurrentPostFull(null); return; }
    // Clear stale data IMMEDIATELY so rawVariants becomes [] during the transition.
    // This prevents the carousel slideOrder from being initialized with the wrong post's
    // variants (race condition: currentPost changes before currentPostFull is updated).
    setCurrentPostFull(null);
    setHeadlineSuggestions([]);
    setUseDeepElementAiApproval(false);
    setIsLoadingFull(true);
    fetch(`${BASE}/api/posts/${currentPost.id}`)
      .then(r => r.json())
      .then(data => { setCurrentPostFull(data); setIsLoadingFull(false); })
      .catch(() => setIsLoadingFull(false));
  }, [currentPost?.id]);

  // Carousel slide order: initialize/re-init based on currentPostFull changes.
  // Depending on currentPostFull (not rawVariants.length) prevents the stale-data race where
  // the init fires with the previous post's variants before setCurrentPostFull(null) takes effect.
  // Deletions are handled directly in deleteVariant.onSuccess.
  const rawVariants = currentPostFull?.imageVariants ?? [];
  useEffect(() => {
    if (!currentPost || currentPost.contentType !== "carousel") return;
    // Guard: wait for data to load AND ensure it belongs to the current post (prevents stale init)
    if (!currentPostFull || currentPostFull.id !== currentPost.id) return;
    if (rawVariants.length === 0) return;
    const isNewPost = lastInitPostId.current !== currentPost.id;
    if (isNewPost || slideOrder.length === 0) {
      // Every variant in the gallery is a slide — include all, sorted by variantIndex
      const sorted = [...rawVariants].sort((a: any, b: any) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
      setSlideOrder(sorted.map((v: any) => v.id));
      setSlideOrderDirty(false);
      setPreviewSlideId(sorted[0]?.id ?? null);
      lastInitPostId.current = currentPost.id;
    }
  }, [currentPostFull]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reel slide order: initialize when switching to a multi-slide reel/story post
  useEffect(() => {
    if (!currentPost || (currentPost.contentType !== "reel" && currentPost.contentType !== "story")) return;
    if (!currentPostFull || currentPostFull.id !== currentPost.id) return;
    if (rawVariants.length < 2) return;
    const isNewPost = lastReelInitPostId.current !== currentPost.id;
    if (isNewPost || reelSlideOrder.length === 0) {
      const sorted = [...rawVariants].sort((a: any, b: any) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
      setReelSlideOrder(sorted.map((v: any) => v.id));
      lastReelInitPostId.current = currentPost.id;
    }
  }, [currentPostFull]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 8s while the current post has no images — polls single post only (not all)
  const currentHasNoImages = currentPost && (!currentPost.imageVariants || currentPost.imageVariants.length === 0);
  // Poll every 3s if any variant is in "pending" generationStatus (async DALL-E in progress)
  const hasPendingVariants = (currentPostFull?.imageVariants ?? []).some((v: any) => v.generationStatus === "pending");
  // Detect when ALL variants ended up in "error" (e.g. server restart killed generation mid-flight)
  // In that case, show the retry button immediately instead of waiting 8+ min for "stuck" detection
  const currentActiveImages = (currentPostFull?.imageVariants ?? []).filter((v: any) => v.imageData);
  const hasOnlyErrorVariants =
    (currentPostFull?.imageVariants ?? []).length > 0 &&
    currentActiveImages.length === 0 &&
    (currentPostFull?.imageVariants ?? []).every((v: any) => v.generationStatus === "error");
  const [pollCount, setPollCount]               = useState(0);
  const [pendingPollCount, setPendingPollCount] = useState(0);
  const [retryingImages, setRetryingImages]     = useState(false);
  const [variantWarningOpen, setVariantWarningOpen] = useState(false);
  const [pendingVariantInstruction, setPendingVariantInstruction] = useState<string | undefined>(undefined);

  // Reset poll counts and collapsible states whenever the current post changes
  useEffect(() => {
    setPollCount(0);
    setPendingPollCount(0);
    setShowFinalCaption(false);
    // Reset dual-font selector — will be rehydrated from activeImage once loaded
    setOverlayFont2(null);
    setShowFont2Selector(false);
    setCustomFont2Input("");
  }, [currentPost?.id]);

  // Reset localCustomText from niche whenever the full post data loads/changes
  useEffect(() => {
    if (!currentPostFull) return;
    const niche = currentPostFull.niche;
    setLocalCustomText(niche?.customText ?? "");
    setLocalCustomTextPosition((niche?.customTextPosition as "before" | "after") ?? "after");
  }, [currentPostFull?.id]);

  // Poll every 8s when post has ZERO images (generation didn't start or failed silently)
  useEffect(() => {
    if (!currentHasNoImages || !currentPost?.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${BASE}/api/posts/${currentPost.id}`);
        const fullData = await res.json();
        if (fullData.imageVariants?.length > 0) {
          setCurrentPostFull(fullData);
          setPollCount(0);
          refetch();
        } else {
          setPollCount(c => c + 1);
        }
      } catch { setPollCount(c => c + 1); }
    }, 8000);
    return () => clearInterval(interval);
  }, [currentHasNoImages, currentPost?.id, refetch]);

  // Poll every 3s when any variant is in "pending" generationStatus (async DALL-E in progress)
  // Increments pendingPollCount so we can detect if generation got stuck after 2 min.
  useEffect(() => {
    if (!hasPendingVariants || !currentPost?.id) return;
    setPendingPollCount(0); // reset when we start polling for this post
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${BASE}/api/posts/${currentPost.id}`);
        const fullData = await res.json();
        const stillPending = (fullData.imageVariants ?? []).some((v: any) => v.generationStatus === "pending");
        setCurrentPostFull(fullData);
        if (!stillPending) {
          refetch();
          setPendingPollCount(0);
          toast({ title: "Imagen lista", description: "Tu imagen fue generada exitosamente." });
        } else {
          setPendingPollCount(c => c + 1);
        }
      } catch { setPendingPollCount(c => c + 1); }
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingVariants, currentPost?.id]);

  // IMAGE_STUCK_THRESHOLD: 30 polls × 8s = ~4 min with no image → show retry UI
  const IMAGE_STUCK_POLLS    = 30;
  // PENDING_STUCK_THRESHOLD: 160 polls × 3s = 8 min with pending variant → show retry UI
  // Images are generated serially; with many posts the last ones can wait 10-30+ min.
  const PENDING_STUCK_POLLS  = 160;

  // Also detect stuck based on variant/post creation time (catches stuck posts on page load,
  // without waiting 8 min of polls)
  const oldestPendingAge = (() => {
    const pv = (currentPostFull?.imageVariants ?? []).find((v: any) => v.generationStatus === "pending");
    if (!pv?.createdAt) return 0;
    return Date.now() - new Date(pv.createdAt).getTime();
  })();
  const oldestNoImageAge = (() => {
    if (!currentHasNoImages) return 0;
    // Usar createdAt del post (NO scheduledAt — que puede ser fecha futura)
    const ref = (currentPost as any)?.createdAt ?? (currentPost as any)?.created_at;
    if (!ref) return 0;
    return Date.now() - new Date(ref).getTime();
  })();

  const imageIsStuck  = currentHasNoImages && (pollCount >= IMAGE_STUCK_POLLS || oldestNoImageAge > 6 * 60 * 1000);
  const pendingIsStuck = hasPendingVariants && (pendingPollCount >= PENDING_STUCK_POLLS || oldestPendingAge > 8 * 60 * 1000);

  const handleSaveDefaultLocation = async (locationStr: string) => {
    try {
      const loc = locationStr.trim();
      const res = await fetch(`${BASE}/api/brand-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultLocation: loc || null }),
      });
      if (res.ok) {
        setDefaultLocationFromProfile(loc);
        toast({
          title: loc ? `Ubicación guardada: ${loc}` : "Ubicación eliminada",
          description: loc ? "La IA usará esta ciudad en hashtags y menciones." : "No se agregarán hashtags de ciudad.",
        });
        if (currentPost?.id) {
          const hRes = await fetch(`${BASE}/api/posts/${currentPost.id}/regenerate-hashtags`, { method: "POST" });
          if (hRes.ok) {
            const hData = await hRes.json();
            if (hData?.hashtags)      setEditedHashtags(hData.hashtags);
            if (hData?.hashtagsTiktok) setEditedHashtagsTiktok(hData.hashtagsTiktok);
          }
        }
      } else {
        toast({ title: "Error al guardar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    }
  };

  const handleRegenerateHashtagsOnly = async () => {
    if (!currentPost?.id) return;
    try {
      const hRes = await fetch(`${BASE}/api/posts/${currentPost.id}/regenerate-hashtags`, { method: "POST" });
      if (hRes.ok) {
        const hData = await hRes.json();
        if (hData?.hashtags)      setEditedHashtags(hData.hashtags);
        if (hData?.hashtagsTiktok) setEditedHashtagsTiktok(hData.hashtagsTiktok);
      }
    } catch { /* silent */ }
  };

  const handleLocationSelected = (name: string) => {
    if (locationSaveAsDefault) {
      void handleSaveDefaultLocation(name);
    } else if (locationUseForHashtags) {
      void handleRegenerateHashtagsOnly();
    }
  };

  const handleLocationCleared = () => {
    if (locationSaveAsDefault) void handleSaveDefaultLocation("");
  };

  const handleRetryMissingImages = async () => {
    setRetryingImages(true);
    try {
      // Use single-post endpoint when we have a specific post, bulk fallback otherwise
      const url = currentPost?.id
        ? `${BASE}/api/posts/${currentPost.id}/retry-image`
        : `${BASE}/api/posts/retry-missing-images`;
      const res = await fetch(url, { method: "POST" });
      if (res.ok) {
        toast({ title: "Reintentando imágenes", description: "Generación reiniciada — espera 2-3 min." });
        setPollCount(0);
        setPendingPollCount(0);
        // Wait 3s then force-refetch to show any pending variant
        setTimeout(() => { refetch(); }, 3000);
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error al reintentar", description: (body as any).error ?? "Inténtalo de nuevo", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setRetryingImages(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < allPendingPosts.length - 1) {
      setCurrentIndex(c => c + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(c => c - 1);
    }
  };

  const isScheduled = currentPost?.status === 'scheduled';

  // Caption length guard for Instagram (limit applies to caption + "\n\n" + hashtags)
  const isOverIgCaptionLimit =
    editedPlatform !== "tiktok" &&
    (editedCaption.length + (editedHashtags ? 2 + editedHashtags.length : 0)) > IG_CAPTION_LIMIT;

  const deletePost = useDeletePost();
  const handleDelete = () => {
    if (!currentPost) return;
    if (!window.confirm("¿Eliminar este post? Los siguientes se reprogramarán automáticamente.")) return;
    deletePost.mutate({ id: currentPost.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
        toast({ title: "Post eliminado", description: "Los siguientes posts fueron reprogramados." });
        if (initialPostId) navigate("/approval"); // Back to queue if came from calendar
        else setCurrentIndex(i => Math.max(0, i - 1));
      },
      onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
    });
  };

  const buildSchedulePayload = () => {
    const isBoth = (editedPlatform || currentPost?.platform) === "both";
    if (isBoth && (rescheduleIgDate || rescheduleTkDate)) {
      // Per-platform scheduling (using user's timezone)
      const igUtc = rescheduleIgDate ? bogotaLocalToUtc(rescheduleIgDate, userTz) : undefined;
      const tkUtc = rescheduleTkDate ? bogotaLocalToUtc(rescheduleTkDate, userTz) : undefined;
      // Use the earlier of the two as the canonical scheduledAt for backward compat
      const canonical = igUtc ?? tkUtc;
      return {
        ...(canonical ? { scheduledAt: canonical } : {}),
        ...(igUtc ? { scheduledAtInstagram: igUtc } : {}),
        ...(tkUtc ? { scheduledAtTiktok: tkUtc } : {}),
      };
    }
    // Single-platform: just use rescheduleDate (using user's timezone)
    return rescheduleDate ? { scheduledAt: bogotaLocalToUtc(rescheduleDate, userTz) } : {};
  };

  const buildFinalCaption = () => {
    const trimmed = localCustomText.trim();
    if (!trimmed) return editedCaption;
    return localCustomTextPosition === "before"
      ? `${trimmed}\n\n${editedCaption}`
      : `${editedCaption}\n\n${trimmed}`;
  };

  // ── Caption Addons inline management ────────────────────────────────────
  const fetchAddons = useCallback(async () => {
    try {
      setAddonsLoading(true);
      const res = await fetch(`${BASE}/api/caption-addons`, { credentials: "include" });
      if (res.ok) setAddonsList(await res.json());
    } catch { /* silent */ } finally { setAddonsLoading(false); }
  }, []);

  useEffect(() => { fetchAddons(); }, [fetchAddons]);

  const openAddonsModal = (addon: any = null) => {
    setAddonsEditing(addon);
    setAddonsForm(addon
      ? { name: addon.name, keywords: addon.keywords, text: addon.text, position: addon.position === "before" ? "before" : "after", active: addon.active }
      : { name: "", keywords: "", text: "", position: "after", active: true });
    setAddonsModalOpen(true);
  };

  const saveAddon = async (): Promise<void> => {
    if (!addonsForm.name.trim() || !addonsForm.text.trim()) {
      toast({ title: "Nombre y texto son requeridos", variant: "destructive" });
      return;
    }
    setAddonsSaving(true);
    try {
      const url = addonsEditing ? `${BASE}/api/caption-addons/${addonsEditing.id}` : `${BASE}/api/caption-addons`;
      const res = await fetch(url, {
        method: addonsEditing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addonsForm),
      });
      if (!res.ok) throw new Error();
      toast({ title: addonsEditing ? "Texto actualizado" : "Texto creado" });
      setAddonsModalOpen(false);
      fetchAddons();
    } catch { toast({ title: "Error al guardar", variant: "destructive" }); }
    finally { setAddonsSaving(false); }
  };

  const toggleAddonActive = async (addon: any): Promise<void> => {
    try {
      await fetch(`${BASE}/api/caption-addons/${addon.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !addon.active }),
      });
      fetchAddons();
    } catch { toast({ title: "Error al actualizar estado", variant: "destructive" }); }
  };

  const deleteAddon = async (addon: any): Promise<void> => {
    if (!window.confirm(`¿Eliminar "${addon.name}"?`)) return;
    setAddonsDeleting(addon.id);
    try {
      await fetch(`${BASE}/api/caption-addons/${addon.id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Texto eliminado" });
      fetchAddons();
    } catch { toast({ title: "Error al eliminar", variant: "destructive" }); }
    finally { setAddonsDeleting(null); }
  };
  // ────────────────────────────────────────────────────────────────────────

  const handleSaveScheduled = () => {
    if (!currentPost) return;
    const extraDate = buildSchedulePayload();
    updatePost.mutate({
      id: currentPost.id,
      data: { caption: buildFinalCaption(), hashtags: editedHashtags, hashtagsTiktok: editedHashtagsTiktok, selectedImageVariant: selectedVariant, platform: editedPlatform, locationId: editedLocationId || null, locationName: editedLocationName || null, ...extraDate } as any,
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
        toast({ title: "Cambios guardados", description: "El post sigue programado con tus ediciones." });
      },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const hasAnyScheduledDate = () => {
    if (!currentPost) return false;
    // A date is set if we're sending one via the picker OR the post already has one
    const payload = buildSchedulePayload();
    const payloadHasDate = Object.keys(payload).some(k => k.toLowerCase().includes("scheduled"));
    const postHasDate = !!(
      currentPost.scheduledAt ||
      currentPost.scheduledAtInstagram ||
      currentPost.scheduledAtTiktok
    );
    return payloadHasDate || postHasDate;
  };

  const handleApprove = async () => {
    if (!currentPost) return;
    if (isScheduled) { handleSaveScheduled(); return; }

    // Validate: must have a date before approving
    if (!hasAnyScheduledDate()) {
      toast({
        title: "⚠ Fecha y hora requeridas",
        description: "Debes establecer una fecha y hora de publicación antes de aprobar el post.",
        variant: "destructive",
      });
      return;
    }

    // Await overlay params persistence before proceeding so there is no race risk
    if (selectedVariant) {
      try {
        const overlayParamsBody: Record<string, unknown> = { titleColor1, titleColor2, signatureText, showSignature };
        // Send null to explicitly clear stale custom logo when user reverted to business default
        overlayParamsBody.customLogoUrl = (overlayLogoPath && overlayLogoPath !== activeBusinessLogoPath)
          ? overlayLogoPath
          : null;
        await fetch(`${BASE}/api/posts/${currentPost.id}/variants/${selectedVariant}/overlay-params`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(overlayParamsBody),
        });
      } catch { /* non-critical — proceed with approve even if this fails */ }
    }

    const extraDate = buildSchedulePayload();
    updatePost.mutate({
      id: currentPost.id,
      data: {
        caption: buildFinalCaption(),
        hashtags: editedHashtags,
        hashtagsTiktok: editedHashtagsTiktok,
        selectedImageVariant: selectedVariant,
        platform: editedPlatform,
        locationId: editedLocationId || null,
        locationName: editedLocationName || null,
        ...extraDate,
      } as any
    }, {
      onSuccess: () => {
        approvePost.mutate({ id: currentPost.id }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
            queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
            toast({ title: "Post Aprobado", description: "El post fue programado para publicarse." });
            if (currentIndex >= allPendingPosts.length - 1) {
              setCurrentIndex(Math.max(0, allPendingPosts.length - 2));
            }
          }
        });
      }
    });
  };

  // Rotate libraryMedia purely client-side (canvas, no network cost).
  // Sets isLibraryMediaRotated=true so "Usar foto real" knows it must persist first.
  const handleRotateLibraryMedia = async (degrees: 90 | -90 | 180) => {
    if (!libraryMedia?.data) return;
    setIsRotatingLibraryMedia(true);
    try {
      const rotated = await rotateBase64Image(libraryMedia.data, degrees);
      setLibraryMedia(prev => prev ? { ...prev, data: rotated } : null);
      setIsLibraryMediaRotated(true);
    } catch {
      toast({ title: "Error", description: "No se pudo rotar la imagen", variant: "destructive" });
    } finally {
      setIsRotatingLibraryMedia(false);
    }
  };

  // Rotate an existing variant on the server (for raw_upload and overlay variants alike)
  const handleRotateVariant = async (degrees: 90 | -90 | 180) => {
    if (!currentPost?.id || !activeImage?.id) return;
    setIsRotatingVariant(true);
    try {
      const resp = await fetch(`${BASE}/api/posts/${currentPost.id}/variants/${activeImage.id}/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ degrees }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(typeof e.error === "string" ? e.error : "Error al rotar");
      }
      queryClient.invalidateQueries({ queryKey: [`/api/posts/${currentPost.id}/variants`] });
      queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Error al rotar", variant: "destructive" });
    } finally {
      setIsRotatingVariant(false);
    }
  };

  const handleGenerateNewVariant = (instruction?: string, forceHeadline?: string, reuseVariantId?: number, libraryBgVariantId?: number, mediaId?: number) => {
    if (!currentPost) return;
    const headlineToUse = forceHeadline !== undefined ? forceHeadline : customHeadline.trim();
    // Capture which carousel slide we're targeting right now (closed-over value before async)
    const targetSlideId = currentPost.contentType === "carousel" ? previewSlideId : null;
    generateImageVariant.mutate({
      id: currentPost.id,
      data: {
        style: imageStyle,
        logoPosition,
        logoColor,
        textStyle,
        textPosition,
        textSize,
        overlayFilter: imageFilter !== "none" ? imageFilter : undefined,
        ...(overlayFont && overlayFont !== "default" ? { overlayFont } : {}),
        ...(overlayFont2 && overlayFont2 !== "default" ? { overlayFont2 } : {}),
        ...(instruction ? { customInstruction: instruction } : {}),
        ...(headlineToUse ? { customHeadline: headlineToUse } : {}),
        ...(reuseVariantId != null ? { reuseVariantId } : {}),
        ...(libraryBgVariantId != null ? { libraryBgVariantId } : {}),
        ...(mediaId != null ? { mediaId } : {}),
        ...(referenceImageBase64 ? { referenceImageBase64 } : {}),
        // Send null to clear stale override when user switched back to business default logo
        customLogoUrl: (overlayLogoPath && overlayLogoPath !== activeBusinessLogoPath) ? overlayLogoPath : null,
        titleColor1,
        titleColor2,
        showSignature,
        signatureText: signatureText || undefined,
      }
    }, {
      onSuccess: (newVariant) => {
        queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
        if (currentPost?.id) refreshCurrentPost(currentPost.id);
        setImageInstruction("");
        setReferenceImageBase64("");
        setReferenceImagePreview("");
        setShowImageInstruction(false);
        // For carousel posts: every generated image is a new slide — always append at the end.
        // The user can then reorder or delete it from the panel.
        if (currentPost?.contentType === "carousel" && newVariant?.id) {
          setSlideOrder(prev => [...prev, newVariant.id]);
          setPreviewSlideId(newVariant.id);
        }
        const isPending = (newVariant as any)?.generationStatus === "pending";
        const desc = isPending
          ? "Generando imagen con IA… puede tardar entre 1 y 2 minutos. Aparecerá automáticamente."
          : mediaId != null
          ? "Foto real aplicada como fondo con logo y texto encima."
          : libraryBgVariantId != null
          ? "Fondo de biblioteca aplicado con nuevos overlays — sin costo de generación."
          : reuseVariantId != null
          ? "Overlay aplicado sobre el mismo fondo — sin costo de generación."
          : `Nueva imagen lista — estilo ${imageStyle}, logo ${logoColor} ${logoPosition.replace("-", " ")}.`;
        toast({ title: isPending ? "Generando imagen…" : "Imagen Lista", description: desc });
        if (newVariant?.referenceImageWarning) {
          toast({
            title: "Imagen de referencia no analizada",
            description: "No pudimos analizar tu imagen de referencia. La imagen se generará sin ese estilo — puedes intentar con otra foto.",
            variant: "destructive",
          });
        }
      },
      onError: () => {
        toast({ title: "Error", description: "No se pudo generar la imagen.", variant: "destructive" });
      }
    });
  };

  const handleReject = () => {
    if (!currentPost) return;

    if (isScheduled) {
      // For scheduled posts: move back to pending_approval
      updatePost.mutate({ id: currentPost.id, data: { status: 'pending_approval' } as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
          toast({ title: "Vuelto a pendiente", description: "El post está de nuevo en la cola de aprobación." });
          navigate("/approval");
        }
      });
      return;
    }

    rejectPost.mutate({ id: currentPost.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
        toast({ title: "Post Rechazado", variant: "destructive" });
        if (currentIndex >= allPendingPosts.length - 1) {
          setCurrentIndex(Math.max(0, allPendingPosts.length - 2));
        }
      }
    });
  };

  const handleApplySuggestion = () => {
    if (!currentPost || !suggestionText.trim()) return;
    applySuggestion.mutate({ id: currentPost.id, data: { instruction: suggestionText } }, {
      onSuccess: (result: { caption: string }) => {
        setEditedCaption(result.caption);
        setSuggestionText("");
        setShowSuggestion(false);
        setCaptionEval(null); // Reset eval — caption changed
        toast({ title: "Sugerencia Aplicada", description: "El texto fue ajustado con tu indicación." });
      },
      onError: () => {
        toast({ title: "Error", description: "No se pudo aplicar la sugerencia.", variant: "destructive" });
      }
    });
  };

  const handleEvaluateCaption = async () => {
    if (!currentPost?.id) return;
    setIsEvaluating(true);
    setCaptionEval(null);
    try {
      const res = await fetch(`${BASE}/api/posts/${currentPost.id}/evaluate-caption`, { method: "POST" });
      if (!res.ok) throw new Error("Error al evaluar");
      const data = await res.json();
      setCaptionEval(data);
    } catch {
      toast({ title: "Error", description: "No se pudo analizar el caption.", variant: "destructive" });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleMarkManualPublish = async () => {
    if (!currentPost) return;
    try {
      const res = await fetch(`${BASE}/api/posts/${currentPost.id}/mark-manual`, { method: "POST" });
      if (!res.ok) throw new Error("Error al marcar");
      toast({
        title: "📱 Marcado como publicado",
        description: "Guardado en la Biblioteca de Publicaciones como publicación manual.",
      });
      queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
      if (allPendingPosts.length > 1) {
        setCurrentIndex(Math.min(currentIndex, allPendingPosts.length - 2));
      }
    } catch {
      toast({ title: "Error al actualizar estado", variant: "destructive" });
    }
  };

  const handleSaveCaption = () => {
    if (!currentPost) return;
    updatePost.mutate({
      id: currentPost.id,
      data: { caption: buildFinalCaption(), hashtags: editedHashtags, hashtagsTiktok: editedHashtagsTiktok, platform: editedPlatform },
    }, {
      onSuccess: () => {
        setCaptionSaved(true);
        setTimeout(() => setCaptionSaved(false), 2500);
        queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
        toast({ title: "Copy guardado", description: "Los cambios fueron guardados correctamente." });
      },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const handleRegenerate = () => {
    if (!currentPost) return;
    regenerateCaption.mutate({ id: currentPost.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
        toast({ title: "Texto Regenerado" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(0,201,83,0.5)]"></div>
      </div>
    );
  }

  if (allPendingPosts.length === 0 || !currentPost) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-6">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shadow-[0_0_30px_rgba(0,201,83,0.2)]">
          <Check className="w-7 h-7 text-primary drop-shadow-[0_0_8px_rgba(0,201,83,0.8)]" />
        </div>
        <div>
          <h2 className="text-xl font-display font-bold text-foreground leading-tight mb-1">Cola Vacía</h2>
          <p className="text-sm text-muted-foreground">Todo el contenido ha sido revisado.</p>
        </div>
        <button
          onClick={() => navigate("/generate")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/20 border border-primary/40 text-primary font-semibold text-sm hover:bg-primary/30 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          Ir al Generador Masivo →
        </button>
      </div>
    );
  }


  const saveSlideOrder = async (postId: number, variantIds: number[]) => {
    if (variantIds.length === 0) return;
    setIsSavingSlideOrder(true);
    try {
      const res = await fetch(`${BASE}/api/posts/${postId}/reorder-slides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantIds }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const updated = await res.json();
      setCurrentPostFull(updated);
      setSlideOrderDirty(false);
      queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
    } catch {
      toast({ title: "Error", description: "No se pudo guardar el orden.", variant: "destructive" });
    } finally {
      setIsSavingSlideOrder(false);
    }
  };

  // Swap slide at index i with slide at index j — auto-saves after 800ms idle
  const swapSlides = (i: number, j: number) => {
    setSlideOrder(prev => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      // Schedule auto-save with debounce
      if (slideOrderSaveTimer.current) clearTimeout(slideOrderSaveTimer.current);
      if (currentPost) {
        slideOrderSaveTimer.current = setTimeout(() => saveSlideOrder(currentPost.id, next), 800);
      }
      return next;
    });
    setSlideOrderDirty(true);
  };

  const handleSaveSlideOrder = async () => {
    if (!currentPost || slideOrder.length === 0) return;
    if (slideOrderSaveTimer.current) clearTimeout(slideOrderSaveTimer.current);
    await saveSlideOrder(currentPost.id, slideOrder);
  };

  // Slide names for carousel positions
  const SLIDE_LABELS: Record<number, string> = {
    0: "Portada",
    1: "El Problema",
    2: "La Solución",
    3: "Los Números",
    4: "CTA Final",
  };

  return (
    <>
    <div className="h-full flex flex-col pb-8">
      {/* Banner for scheduled posts reviewed from calendar */}
      {isScheduled && currentPost.scheduledAt && (
        <div className="flex items-center gap-3 mb-4 shrink-0 px-4 py-3 rounded-xl border border-secondary/40 bg-secondary/10">
          <div className="w-2 h-2 rounded-full bg-secondary animate-pulse shrink-0" />
          <p className="text-sm text-secondary font-medium flex-1">
            Post <strong>programado</strong>. Edita el texto o imagen y pulsa <strong>Guardar</strong>.
            Cambia la fecha en el campo de abajo. También puedes devolverlo a pendiente o eliminarlo.
          </p>
        </div>
      )}

      {/* Platform publish status — shown when the post has been attempted on one or more platforms */}
      {(currentPostFull?.publishLogs?.length ?? 0) > 0 && (() => {
        const logs: { id: number; platform: string; status: string; postUrl?: string | null; errorMessage?: string | null; publishedAt: string }[] = currentPostFull!.publishLogs;
        const platformLabel: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
        const latestByPlatform = logs.reduce<Record<string, typeof logs[0]>>((acc, log) => {
          if (!acc[log.platform] || new Date(log.publishedAt) > new Date(acc[log.platform].publishedAt)) {
            acc[log.platform] = log;
          }
          return acc;
        }, {});
        const entries = Object.values(latestByPlatform);
        const anyFailed = entries.some(l => l.status === "failed");
        return (
          <div className={`flex flex-wrap items-center gap-2 mb-4 shrink-0 px-4 py-3 rounded-xl border ${anyFailed ? "border-destructive/40 bg-destructive/5" : "border-green-500/30 bg-green-500/5"}`}>
            <span className="text-xs font-semibold text-muted-foreground mr-1">Publicado en:</span>
            {entries.map(log => {
              const isPub = log.status === "published";
              const isFail = log.status === "failed";
              const color = isPub ? "text-green-500" : isFail ? "text-destructive" : "text-yellow-500";
              const icon = isPub ? "✓" : isFail ? "✗" : "~";
              return (
                <span key={log.platform} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${isPub ? "border-green-500/30 bg-green-500/10" : isFail ? "border-destructive/30 bg-destructive/10" : "border-yellow-500/30 bg-yellow-500/10"} ${color}`} title={log.errorMessage ?? log.status}>
                  <span>{icon}</span>
                  {log.postUrl ? (
                    <a href={log.postUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">{platformLabel[log.platform] ?? log.platform}</a>
                  ) : (
                    <span>{platformLabel[log.platform] ?? log.platform}</span>
                  )}
                </span>
              );
            })}
            {anyFailed && (
              <span className="text-xs text-destructive ml-1 leading-snug">
                {entries.filter(l => l.status === "failed").map(l => l.errorMessage?.replace(/^SKIP:\s*/, "")).filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        );
      })()}

      {/* Banner: resumen de posts en cola que fallarán por negocio sin cuentas */}
      {(() => {
        if (!socialAccountsLoaded || allPendingPosts.length === 0 || isScheduled) return null;
        const failBizIds = new Set<number>(
          allPendingPosts
            .filter((p: any) => !hasConnectedAccount(p.businessId))
            .map((p: any) => p.businessId as number)
        );
        if (failBizIds.size === 0) return null;
        const failCount = allPendingPosts.filter((p: any) => failBizIds.has(p.businessId)).length;
        const bizNames = [...failBizIds]
          .map(id => businessNameMap[id] ?? `Negocio #${id}`)
          .join(", ");
        return (
          <div className="flex items-start gap-3 mb-3 shrink-0 px-4 py-3 rounded-xl border border-orange-500/40 bg-orange-500/8">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-orange-300 font-medium leading-snug">
                {failCount === 1 ? '1 post en la cola' : `${failCount} posts en la cola`} no se publicarán automáticamente.
              </p>
              <p className="text-xs text-orange-400/70 mt-1 leading-snug">
                {bizNames} {failBizIds.size === 1 ? 'no tiene' : 'no tienen'} cuentas de redes sociales conectadas.{' '}
                <a href="/settings" className="underline underline-offset-2 hover:text-orange-300 transition-colors">Conectar en Configuración →</a>
              </p>
            </div>
          </div>
        );
      })()}

      {/* Banner: negocio activo sin cuentas sociales conectadas */}
      {(() => {
        // Use the post's businessId when available; otherwise fall back to the global active business.
        // This correctly handles edge cases where a post might belong to a different business.
        const warnBizId = currentPost?.businessId ?? globalBizId;
        const warnBizName = (warnBizId != null && businessNameMap[warnBizId]) ? businessNameMap[warnBizId] : (activeBusinessName || "Este negocio");
        // Wait for both business context AND social accounts to load before evaluating.
        // Avoids transient false-positive warning while the accounts fetch is in-flight.
        if (!globalBizLoaded || !socialAccountsLoaded || warnBizId == null) return null;
        // Mirrors the scheduler guard: only accounts with connected='true' count as active.
        // Stale/disconnected rows won't suppress the warning (consistent with V-SCHEDULER logic).
        if (hasConnectedAccount(warnBizId)) return null;
        return (
          <div className="flex items-start gap-3 mb-4 shrink-0 px-4 py-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-yellow-300 font-medium leading-snug">
                {warnBizName} no tiene cuentas de redes sociales conectadas.
                Los posts que apruebes se programarán pero <strong>no se publicarán automáticamente</strong>.
              </p>
              <p className="text-xs text-yellow-400/70 mt-1">
                Ve a <a href="/settings" className="underline underline-offset-2 hover:text-yellow-300 transition-colors">Configuración → Cuentas Sociales</a> para conectar Instagram o TikTok.
              </p>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 shrink-0 gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-3xl font-display font-bold text-foreground truncate">
            {isScheduled ? 'Revisión de Post' : 'Cola de Aprobación'}
          </h1>
          {activeBusinessName && (
            <p className="text-xs text-primary/70 font-medium mt-0.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60" />
              {activeBusinessName}
            </p>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-muted-foreground text-xs sm:text-sm">
              {currentIndex + 1} de {allPendingPosts.length}
            </p>
            <span className="text-xs font-mono bg-white/10 border border-white/20 text-white/60 px-2 py-0.5 rounded-full" title="Número del post en este negocio">
              #{currentPost.postNumber ?? currentPost.id}
            </span>
            {Object.keys(businessNameMap).length > 1 && currentPost.businessId != null && businessNameMap[currentPost.businessId] && (
              <span className="text-[10px] font-medium bg-primary/15 border border-primary/30 text-primary px-2 py-0.5 rounded-full truncate max-w-[120px]" title={`Negocio: ${businessNameMap[currentPost.businessId]}`}>
                {businessNameMap[currentPost.businessId]}
              </span>
            )}
            {/* Badge: post sin cuentas conectadas — no se publicará */}
            {socialAccountsLoaded && !hasConnectedAccount(currentPost.businessId) && (
              <a
                href="/settings"
                title="Este negocio no tiene cuentas de redes sociales conectadas. Haz clic para configurar."
                className="inline-flex items-center gap-1 text-[10px] font-medium bg-orange-500/15 border border-orange-500/40 text-orange-300 px-2 py-0.5 rounded-full hover:bg-orange-500/25 transition-colors"
              >
                <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                Sin cuentas
              </a>
            )}
            {/* Content type selector — clickable pills */}
            {(() => {
              const types: { id: string; icon: React.ReactNode; label: string }[] = [
                { id: "image",    icon: <ImageIcon className="w-3 h-3" />,    label: "Imagen"   },
                { id: "carousel", icon: <LayoutGrid className="w-3 h-3" />,   label: "Carrusel" },
                { id: "reel",     icon: <Film className="w-3 h-3" />,         label: "Reel"     },
                { id: "story",    icon: <BookImage className="w-3 h-3" />,    label: "Historia" },
              ];
              return (
                <div className="flex items-center gap-1 flex-wrap">
                  {types.map((t) => {
                    const active = (currentPost.contentType ?? "image") === t.id;
                    return (
                      <button
                        key={t.id}
                        title={`Cambiar tipo a ${t.label}`}
                        onClick={() => updatePost.mutate({ id: currentPost.id, data: { contentType: t.id } })}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 min-h-[28px] rounded-full border font-medium transition-all ${
                          active
                            ? t.id === "reel"     ? "bg-primary/20 border-primary/50 text-primary" :
                              t.id === "carousel" ? "bg-secondary/20 border-secondary/50 text-secondary" :
                              t.id === "story"    ? "bg-purple-500/20 border-purple-500/50 text-purple-300" :
                              "bg-white/10 border-white/30 text-foreground"
                            : "border-border/30 text-muted-foreground/50 hover:text-muted-foreground hover:border-border/50"
                        }`}
                      >
                        {t.icon} {t.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            {/* Hint: what the content type pills do */}
            <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/50 mt-1">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-blue-400/60" />
              <span>Toca un formato para cambiar el tipo de post. Imagen = cuadrada, Carrusel = varias diapositivas, Reel = video corto, Historia = vertical 9:16 para Instagram Stories.</span>
            </div>
          </div>
        </div>
        {/* Desktop navigation — hidden on mobile (sticky bar handles navigation) */}
        <div className="hidden sm:flex items-center gap-2 bg-card p-1 rounded-lg border border-border/50 shrink-0">
          <Button variant="ghost" size="icon" onClick={handlePrev} disabled={currentIndex === 0} className="min-w-[36px] min-h-[36px]"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium px-4">{currentIndex + 1} / {allPendingPosts.length}</span>
          <Button variant="ghost" size="icon" onClick={handleNext} disabled={currentIndex === allPendingPosts.length - 1} className="min-w-[36px] min-h-[36px]"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0">
        {/* Left Column: Mockup */}
        <div className="lg:col-span-5 flex flex-col items-center gap-3 lg:sticky lg:top-0 h-full overflow-y-auto no-scrollbar pb-8">

          {/* ── Móvil: imagen a pantalla completa con swipe y flechas superpuestas (< sm) ── */}
          <div
            className="sm:hidden w-full relative rounded-2xl overflow-hidden bg-black shadow-2xl"
            style={{
              aspectRatio: currentPost.contentType === "reel" || currentPost.contentType === "story" ? "9/16" : "1/1",
              maxHeight: "65vh",
            }}
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null) return;
              const diff = touchStartX.current - e.changedTouches[0].clientX;
              if (Math.abs(diff) > 50) {
                if (diff > 0 && currentIndex < allPendingPosts.length - 1) handleNext();
                else if (diff < 0 && currentIndex > 0) handlePrev();
              }
              touchStartX.current = null;
            }}
          >
            {/* Reel with saved video → show from object storage URL */}
            {reelUrl && reelVariantId === activeImage?.id ? (
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <video
                  ref={mainVideoRef}
                  key={reelUrl}
                  src={reelUrl}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  playsInline autoPlay
                  onPlay={() => setIsVideoPlaying(true)}
                  onPause={() => setIsVideoPlaying(false)}
                  onEnded={() => setIsVideoPlaying(false)}
                />
                <button
                  onClick={() => {
                    const v = mainVideoRef.current;
                    if (!v) return;
                    if (v.paused) { v.play(); } else { v.pause(); }
                  }}
                  style={{
                    position: "absolute", bottom: 8, right: 8,
                    background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%",
                    width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", backdropFilter: "blur(4px)",
                  }}
                  title={isVideoPlaying ? "Pausar" : "Reproducir"}
                >
                  {isVideoPlaying
                    ? <span style={{ color: "#fff", fontSize: 14 }}>⏸</span>
                    : <span style={{ color: "#fff", fontSize: 14 }}>▶</span>
                  }
                </button>
              </div>
            ) : activeImage?.imageData ? (
              activeImage.mimeType?.startsWith("video/") ? (
                <video
                  src={`data:${activeImage.mimeType};base64,${activeImage.imageData}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  controls playsInline
                />
              ) : (
                <img
                  src={`data:image/jpeg;base64,${activeImage.imageData}`}
                  alt="Post visual"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )
            ) : (imageIsStuck || pendingIsStuck || hasOnlyErrorVariants) ? (
              <div className="w-full h-full min-h-[280px] bg-neutral-900 flex flex-col items-center justify-center gap-3 p-4">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
                <span className="text-xs text-amber-300 font-medium text-center">
                  {hasOnlyErrorVariants ? "Imagen interrumpida" : pendingIsStuck ? "Más de 8 min en cola" : "Imagen tardó más de lo esperado"}
                </span>
                <span className="text-[10px] text-white/40 text-center px-2">
                  {hasOnlyErrorVariants
                    ? "El servidor se reinició durante la generación. Reintentar no descuenta créditos."
                    : pendingIsStuck
                    ? "Puede que haya fallado. Reintentar es gratuito — no descuenta créditos."
                    : "Tu contenido fue generado. La imagen puede estar lista — reintentar es gratuito."}
                </span>
                <button
                  onClick={handleRetryMissingImages}
                  disabled={retryingImages}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary px-4 py-2 rounded-full disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${retryingImages ? "animate-spin" : ""}`} />
                  {retryingImages ? "Reintentando..." : "Reintentar imagen (gratis)"}
                </button>
              </div>
            ) : (
              <div className="w-full h-full min-h-[280px] bg-neutral-900 flex flex-col items-center justify-center gap-2 px-4">
                <div className="w-8 h-8 border-2 border-primary/60 border-t-primary rounded-full animate-spin" />
                <span className="text-xs text-primary/70 font-medium text-center">
                  {hasPendingVariants
                    ? `Imagen en cola${pendingPollCount > 0 ? ` · ${Math.round(pendingPollCount * 3 / 60)}m` : "…"}`
                    : `Generando imagen${pollCount > 0 ? ` · ${Math.round(pollCount * 8 / 60)}m` : "…"}`}
                </span>
                <span className="text-[9px] text-white/30 text-center leading-tight max-w-[160px]">
                  {hasPendingVariants
                    ? "Las imágenes se generan en cola — 1-2 min por imagen."
                    : "Comunicándose con DALL-E…"}
                </span>
              </div>
            )}
            {/* Flechas de navegación superpuestas */}
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 bg-black/55 backdrop-blur-sm rounded-full flex items-center justify-center text-white disabled:opacity-20 active:scale-90 transition-transform"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === allPendingPosts.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 bg-black/55 backdrop-blur-sm rounded-full flex items-center justify-center text-white disabled:opacity-20 active:scale-90 transition-transform"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
            {/* Badge de plataforma */}
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/65 backdrop-blur-sm rounded-full px-2.5 py-1">
              {currentPost.platform === "tiktok"
                ? <PlaySquare className="w-3 h-3 text-white/80" />
                : <Instagram className="w-3 h-3 text-white/80" />}
              <span className="text-[10px] font-medium text-white/80">{resolvePostHandle(currentPost)}</span>
            </div>
            {/* Badge de tipo */}
            <div className="absolute top-3 right-3 bg-black/65 backdrop-blur-sm rounded-full px-2.5 py-1">
              <span className="text-[10px] font-medium text-white/60 capitalize">{currentPost.contentType ?? "imagen"}</span>
            </div>
          </div>

          {/* ── Desktop: marco de teléfono (≥ sm) ── */}
          <div className="hidden sm:block w-full max-w-[320px] bg-black rounded-[40px] border-[8px] border-neutral-900 overflow-hidden relative shadow-[0_0_30px_rgba(0,0,0,0.5)]" style={{ height: "660px" }}>
            {/* Phone Notch */}
            <div className="absolute top-0 inset-x-0 h-6 bg-neutral-900 rounded-b-3xl w-40 mx-auto z-20"></div>

            <div className="absolute inset-0 bg-background flex flex-col z-10">
              {/* App Header */}
              <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 shrink-0 bg-black/50 backdrop-blur-md z-20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#0A1525] flex items-center justify-center border border-white/20 overflow-hidden">
                    {activeBusinessLogoUrl
                      ? <img src={activeBusinessLogoUrl} alt={activeBusinessName} className="w-6 h-6 object-contain" />
                      : <span className="text-xs">🏢</span>}
                  </div>
                  <div>
                    <div className="font-bold text-xs leading-none">@{(activeBusinessName || "negocio").toLowerCase().replace(/\s+/g, "")}</div>
                    <div className="text-[9px] text-white/50 leading-none mt-0.5">{activeBusinessName || "Tu negocio"}</div>
                  </div>
                </div>
                {currentPost.platform === 'tiktok'
                  ? <PlaySquare className="w-4 h-4 text-white/40" />
                  : <Instagram className="w-4 h-4 text-white/40" />}
              </div>

              {/* Image — fixed height so it never overflows the phone frame */}
              <div
                className="shrink-0 bg-black overflow-hidden"
                style={{
                  width: "100%",
                  height: currentPost.contentType === "reel" || currentPost.contentType === "story" ? "360px" : "304px",
                  position: "relative",
                }}
              >
                {/* Reel with saved video → use presigned URL from object storage */}
                {reelUrl && reelVariantId === activeImage?.id ? (
                  <div style={{ position: "relative", width: "100%", height: "100%" }}>
                    <video
                      ref={mainVideoRefDesktop}
                      key={reelUrl}
                      src={reelUrl}
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", maxWidth: "100%", maxHeight: "100%" }}
                      playsInline autoPlay muted
                      onPlay={() => setIsVideoPlaying(true)}
                      onPause={() => setIsVideoPlaying(false)}
                      onEnded={() => setIsVideoPlaying(false)}
                    />
                    <button
                      onClick={() => {
                        const v = mainVideoRefDesktop.current;
                        if (!v) return;
                        if (v.paused) { v.play(); } else { v.pause(); }
                      }}
                      style={{
                        position: "absolute", bottom: 8, right: 8,
                        background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%",
                        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", backdropFilter: "blur(4px)",
                      }}
                      title={isVideoPlaying ? "Pausar" : "Reproducir"}
                    >
                      {isVideoPlaying
                        ? <span style={{ color: "#fff", fontSize: 13 }}>⏸</span>
                        : <span style={{ color: "#fff", fontSize: 13 }}>▶</span>
                      }
                    </button>
                  </div>
                ) : activeImage?.imageData ? (
                  activeImage.mimeType?.startsWith("video/") ? (
                    <video
                      src={`data:${activeImage.mimeType};base64,${activeImage.imageData}`}
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", maxWidth: "100%", maxHeight: "100%" }}
                      controls
                      loop
                      playsInline
                    />
                  ) : (
                  <img
                    src={`data:image/jpeg;base64,${activeImage.imageData}`}
                    alt="Post visual"
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", maxWidth: "100%", maxHeight: "100%" }}
                  />
                  )
                
                ) : (imageIsStuck || pendingIsStuck || hasOnlyErrorVariants) ? (
                  <div style={{ width: "100%", height: "100%" }} className="bg-gradient-to-br from-neutral-900 to-neutral-800 flex flex-col items-center justify-center gap-3 px-4">
                    <AlertTriangle className="w-8 h-8 text-amber-400" />
                    <span className="text-[10px] text-amber-300 font-medium text-center">
                      {hasOnlyErrorVariants ? "Imagen interrumpida" : pendingIsStuck ? "Más de 8 min en cola" : "Imagen tardó más de lo esperado"}
                    </span>
                    <span className="text-[9px] text-white/40 text-center">
                      {hasOnlyErrorVariants
                        ? "El servidor se reinició. Reintentar no descuenta créditos."
                        : pendingIsStuck
                        ? "Puede que haya fallado. Reintentar es gratuito."
                        : "Tu contenido fue generado. Reintentar imagen es gratuito."}
                    </span>
                    <button
                      onClick={handleRetryMissingImages}
                      disabled={retryingImages}
                      className="flex items-center gap-1.5 text-[9px] font-semibold text-white bg-primary/80 hover:bg-primary px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                    >
                      {retryingImages
                        ? <><RefreshCw className="w-3 h-3 animate-spin" />Reintentando...</>
                        : <><RefreshCw className="w-3 h-3" />Reintentar (gratis)</>
                      }
                    </button>
                    <button
                      onClick={() => { setPollCount(0); setPendingPollCount(0); refetch(); }}
                      className="text-[9px] text-white/30 hover:text-white/60 transition-colors underline"
                    >
                      Seguir esperando
                    </button>
                  </div>
                ) : (
                  <div style={{ width: "100%", height: "100%" }} className="bg-gradient-to-br from-neutral-900 to-neutral-800 flex flex-col items-center justify-center gap-2">
                    <div className="w-8 h-8 border-2 border-primary/60 border-t-primary rounded-full animate-spin" />
                    <span className="text-[10px] text-primary/70 font-medium text-center px-3">
                      {hasPendingVariants
                        ? `En cola${pendingPollCount > 0 ? ` · ${Math.round(pendingPollCount * 3 / 60)}m` : "…"}`
                        : `Generando${pollCount > 0 ? ` · ${Math.round(pollCount * 8 / 60)}m` : "…"}`}
                    </span>
                    <button
                      onClick={() => refetch()}
                      className="text-[9px] text-white/30 hover:text-white/60 transition-colors underline"
                    >
                      Actualizar
                    </button>
                  </div>
                )}
              </div>

              {/* Carousel slide indicators — modern line-style, below logo area */}
              {currentPost.contentType === "carousel" && slideOrder.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 py-2 bg-black/50 shrink-0">
                  {slideOrder.map((variantId, idx) => (
                    <button
                      key={variantId}
                      onClick={() => setPreviewSlideId(variantId)}
                      title={`Slide ${idx + 1}`}
                      style={{
                        width: previewSlideId === variantId ? 20 : 10,
                        height: 3,
                        borderRadius: 2,
                        background: previewSlideId === variantId
                          ? "#00C2FF"
                          : "rgba(255,255,255,0.22)",
                        transition: "all 0.25s ease",
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Caption — scrollable, never grows into the image */}
              <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="p-3 space-y-1.5">
                  <div className="flex gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-full bg-white/10"></div>
                    <div className="w-5 h-5 rounded-full bg-white/10"></div>
                  </div>
                  <p className="text-[11px] leading-relaxed whitespace-pre-wrap line-clamp-6">
                    <span className="font-bold mr-1">{resolvePostHandle(currentPost)}</span>
                    {editedCaption}
                  </p>
                  <p className="text-[10px] text-secondary leading-relaxed line-clamp-2">
                    {editedPlatform === "tiktok" && editedHashtagsTiktok ? editedHashtagsTiktok : editedHashtags}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Download button — below phone frame */}
          {activeImage?.imageData && (
            <div className="w-[320px] flex flex-col gap-2 mt-2">
              <Button
                onClick={() => downloadImage(
                  activeImage.imageData!,
                  `eco-${currentPost.platform}-${currentPost.contentType}-${new Date().toISOString().slice(0,10)}.jpg`
                )}
                className="w-full bg-secondary/10 text-secondary border border-secondary/30 hover:bg-secondary/20 gap-2"
                variant="outline"
              >
                <Download className="w-4 h-4" />
                {(() => {
                  const ct = currentPost.contentType;
                  const pl = currentPost.platform;
                  const isPortrait = ct === "reel" || ct === "story";
                  if (isPortrait && (pl === "instagram" || pl === "both")) return "Descargar imagen (4:5 · 1024×1280)";
                  if (isPortrait && pl === "tiktok") return "Descargar imagen (9:16 · 1024×1536)";
                  return "Descargar imagen (1:1 · 1024×1024)";
                })()}
              </Button>

              {/* Reel mode selector + content */}
              {(currentPost.contentType === "reel" || currentPost.contentType === "story") && (
                <div className="space-y-2">
                  {/* Mode tabs — ALWAYS visible, user can switch at any time */}
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted/20 border border-border/30">
                    <button
                      onClick={() => setReelMode('kenburns')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-semibold transition-all ${reelMode === 'kenburns' ? 'bg-card shadow-sm text-foreground border border-border/40' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                      <span>Auto-generar</span>
                    </button>
                    <button
                      onClick={() => setReelMode('studio')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-semibold transition-all ${reelMode === 'studio' ? 'bg-card shadow-sm text-violet-400 border border-violet-400/30' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Film className="w-3.5 h-3.5 shrink-0" />
                      <span>Reel Studio</span>
                    </button>
                  </div>

                  {reelMode === 'kenburns' && <>
                  {/* Reel slide order — drag to reorder before generating */}
                  {reelSlideOrder.length > 1 && (
                    <div className="rounded-xl border border-border/30 bg-white/2 p-2.5 space-y-2">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
                        <Film className="w-3 h-3" /> Orden de escenas · arrastra para reordenar
                      </p>
                      <DndContext
                        sensors={reelDndSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event: DragEndEvent) => {
                          const { active, over } = event;
                          if (over && active.id !== over.id) {
                            setReelSlideOrder(prev => {
                              const oldIdx = prev.indexOf(Number(active.id));
                              const newIdx = prev.indexOf(Number(over.id));
                              return arrayMove(prev, oldIdx, newIdx);
                            });
                          }
                        }}
                      >
                        <SortableContext items={reelSlideOrder} strategy={horizontalListSortingStrategy}>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {reelSlideOrder.map((variantId, idx) => {
                              const variant = fullVariants.find((v: any) => v.id === variantId) as any;
                              return (
                                <SortableReelSlide
                                  key={variantId}
                                  id={variantId}
                                  index={idx}
                                  imageData={variant?.imageData ?? undefined}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                      <button
                        onClick={() => {
                          const sorted = [...rawVariants].sort((a: any, b: any) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
                          setReelSlideOrder(sorted.map((v: any) => v.id));
                        }}
                        className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground underline transition-colors"
                      >
                        Restablecer orden original
                      </button>
                    </div>
                  )}

                  <Button
                    onClick={handleGenerateReel}
                    disabled={reelGenerating}
                    className="w-full gap-2"
                    style={{
                      background: reelGenerating ? undefined : "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                      borderColor: "#7c3aed55",
                      color: "white",
                    }}
                    variant="outline"
                  >
                    {reelGenerating
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generando reel (~30s)...</>
                      : (reelUrl && reelVariantId === activeImage.id) || activeImage.mimeType?.startsWith("video/")
                        ? <><RefreshCw className="w-4 h-4" /> 🎬 Regenerar Video Reel</>
                        : <><Film className="w-4 h-4" /> 🎬 Generar Video Reel</>
                    }
                  </Button>

                  {/* Badge de estado del video — visible siempre que haya reel guardado */}
                  {/* When both videos exist, show a chooser header */}
                  {reelUrl && reelVariantId != null && studioVideoUrl && (
                    <p className="text-[10px] text-center font-semibold text-amber-400">
                      🎬 Tienes 2 versiones — elige cuál publicar
                    </p>
                  )}

                  {/* Ken Burns reel badge */}
                  {reelUrl && reelVariantId != null && (
                    <div
                      className="w-full rounded-lg border px-3 py-2.5 flex flex-col gap-1.5"
                      style={{ borderColor: "#00C85355", background: "#00C85312" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#00C853" }}>
                          <span>✅</span>
                          <span>{studioVideoUrl ? "Reel Ken Burns — seleccionado" : "Video listo para publicación"}</span>
                        </div>
                        <button
                          onClick={async () => {
                            if (!reelVariantId) return;
                            await fetch(`${BASE}/api/reels/variants/${reelVariantId}/reel`, { method: "DELETE", credentials: "include" });
                            setReelUrl(null);
                            setReelVariantId(null);
                            toast({ title: "Video quitado", description: "Puedes generar otro o aprobar sin video." });
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                          title="No usar este video"
                        >
                          Quitar
                        </button>
                      </div>
                      <p className="text-[10px] leading-relaxed" style={{ color: "#00C85399" }}>
                        {studioVideoUrl
                          ? "Este es el video Ken Burns. Pulsa \"Quitar\" si prefieres usar el Studio."
                          : "Este video se publicará automáticamente como Reel en la fecha programada. Si no lo quieres usar, pulsa \"Quitar\"."
                        }
                      </p>
                      <a
                        href={reelUrl}
                        download={`eco-reel-${new Date().toISOString().slice(0,10)}.mp4`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-[11px] font-medium transition-colors hover:underline"
                        style={{ color: "#00C853" }}
                      >
                        <Download className="w-3 h-3" /> Descargar Ken Burns MP4
                      </a>
                    </div>
                  )}

                  {/* Reel Studio video badge */}
                  {studioVideoUrl && (
                    <div
                      className="w-full rounded-lg border px-3 py-2.5 flex flex-col gap-1.5"
                      style={{ borderColor: reelUrl ? "#7c3aed55" : "#00C85355", background: reelUrl ? "#7c3aed12" : "#00C85312" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: reelUrl ? "#a78bfa" : "#00C853" }}>
                          <span>{reelUrl ? "🎬" : "✅"}</span>
                          <span>{reelUrl ? "Reel Studio — disponible" : "Reel Studio listo para publicación"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {reelUrl && (
                            <button
                              onClick={() => {
                                // Swap: make studio the active published reel
                                // Keep reelVariantId so deletion still works for cleanup
                                setReelUrl(studioVideoUrl);
                                setStudioVideoUrl(null);
                                toast({ title: "✅ Reel Studio seleccionado", description: "Se publicará el video del Reel Studio." });
                              }}
                              className="text-[10px] px-2 py-0.5 rounded border border-violet-400/50 text-violet-300 hover:bg-violet-500/10 transition-colors font-medium"
                            >
                              Usar este
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setStudioVideoUrl(null);
                              toast({ title: "Video Studio quitado" });
                            }}
                            className="text-[10px] px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                      <video
                        key={studioVideoUrl!}
                        src={studioVideoUrl!}
                        controls
                        playsInline
                        style={{
                          width: "100%",
                          borderRadius: 6,
                          maxHeight: 200,
                          background: "#000",
                          display: "block",
                        }}
                      />
                      <p className="text-[10px] leading-relaxed" style={{ color: reelUrl ? "#a78bfa99" : "#00C85399" }}>
                        {reelUrl
                          ? "Pulsa \"Usar este\" para publicar el Studio en lugar del Ken Burns."
                          : "Este video se publicará automáticamente como Reel en la fecha programada."
                        }
                      </p>
                      <a
                        href={studioVideoUrl}
                        download={`eco-reel-studio-${new Date().toISOString().slice(0,10)}.mp4`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-[11px] font-medium transition-colors hover:underline"
                        style={{ color: reelUrl ? "#a78bfa" : "#00C853" }}
                      >
                        <Download className="w-3 h-3" /> Descargar Reel Studio MP4
                      </a>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground text-center">
                    {(currentPost.imageVariants?.length ?? 0) > 1
                      ? `Video 9:16 · ${(currentPost.imageVariants?.length ?? 4) * 5}s · 4 escenas (Hook → Problema → Solución → CTA) · MP4`
                      : "Video 1080×1920 · 20s · 5 tomas Ken Burns · MP4"
                    }
                  </p>

                  {/* ── User uploads their own video ── */}
                  <div className="border-t border-border/30 pt-2 mt-1">
                    <p className="text-[10px] text-muted-foreground text-center mb-2">
                      ¿Tienes tu propio video? Súbelo directamente
                    </p>
                    <input
                      ref={reelVideoUploadRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { handleReelVideoUpload(f); e.target.value = ""; }
                      }}
                    />
                    <button
                      onClick={() => reelVideoUploadRef.current?.click()}
                      disabled={reelVideoUploading || reelGenerating}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition-colors border-border/40 bg-black/20 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {reelVideoUploading && reelVideoUploadVariantId === activeImage.id
                        ? <><RefreshCw className="w-4 h-4 animate-spin" /> Subiendo video…</>
                        : <><Upload className="w-4 h-4" /> Subir mi video (.mp4 · .mov · máx 200 MB)</>
                      }
                    </button>
                    {reelVideoUploadUrl && reelVideoUploadVariantId === activeImage.id && (
                      <p className="text-[10px] text-primary text-center mt-1">
                        ✅ Video guardado — se publicará como Reel en el horario programado
                      </p>
                    )}
                  </div>
                  </>}
                </div>
              )}

              {!((currentPost.contentType === "reel" || currentPost.contentType === "story") && !activeImage.mimeType?.startsWith("video/")) && (
                <p className="text-[10px] text-muted-foreground text-center">
                  JPEG de alta calidad · apta para impresión, vallas y medios digitales
                </p>
              )}
            </div>
          )}

          {/* ── 🎬 Reel Studio — controlled by mode tab selector above ── */}
          {reelMode === 'studio' && (currentPost.contentType === "reel" || currentPost.contentType === "story") && (
          <div className="rounded-xl border border-violet-500/20 bg-card/40 overflow-hidden">
            <div className="px-4 pb-4 pt-3 space-y-3">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={studioInputRef}
                  className="hidden"
                  onChange={handleStudioImagesSelect}
                />

                {/* Tab switcher */}
                <div className="flex rounded-lg overflow-hidden border border-border/40 text-xs">
                  <button
                    onClick={() => setStudioTab("post")}
                    className={`flex-1 py-2 font-medium transition-colors ${studioTab === "post" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}
                  >
                    📸 Este post
                  </button>
                  <button
                    onClick={() => { setStudioTab("library"); fetchLibrary(); }}
                    className={`flex-1 py-2 font-medium transition-colors ${studioTab === "library" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}
                  >
                    📚 Biblioteca
                  </button>
                  <button
                    onClick={() => setStudioTab("upload")}
                    className={`flex-1 py-2 font-medium transition-colors ${studioTab === "upload" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}
                  >
                    📤 Subir
                  </button>
                </div>

                {/* "Este post" tab — current post's generated variants */}
                {studioTab === "post" && (() => {
                  const sortedVariants = [...fullVariants].sort((a: any, b: any) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
                  if (sortedVariants.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground text-center py-6">
                        Genera imágenes para este post primero
                      </p>
                    );
                  }
                  return (
                    <>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Toca para agregar al video · Toca de nuevo para quitar
                      </p>
                      <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                        {sortedVariants.map((v: any) => {
                          const selected = studioSlides.some((s) => s.variantId === v.id);
                          const preview = v.imageData ? `data:image/jpeg;base64,${v.imageData}` : "";
                          if (!preview) return null;
                          return (
                            <button
                              key={v.id}
                              onClick={() => {
                                if (selected) {
                                  setStudioSlides((prev) => prev.filter((s) => s.variantId !== v.id));
                                } else {
                                  const label = v.overlayCaptionHook
                                    ? String(v.overlayCaptionHook).slice(0, 28)
                                    : `Variante ${(v.variantIndex ?? 0) + 1}`;
                                  setStudioSlides((prev) => [
                                    ...prev,
                                    { key: `post-${v.id}`, name: label, preview, variantId: v.id },
                                  ]);
                                }
                              }}
                              className={`relative aspect-[4/5] rounded overflow-hidden border-2 transition-all ${selected ? "border-violet-400 ring-1 ring-violet-400/50" : "border-transparent hover:border-border/60"}`}
                            >
                              <img src={preview} alt="" className="w-full h-full object-cover" />
                              {selected && (
                                <div className="absolute inset-0 bg-violet-600/30 flex items-center justify-center">
                                  <Check className="w-5 h-5 text-white drop-shadow" />
                                </div>
                              )}
                              <span className="absolute top-0.5 right-0.5 text-[7px] bg-black/60 text-white px-0.5 rounded">
                                {(v.variantIndex ?? 0) + 1}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                {/* Upload tab */}
                {studioTab === "upload" && (
                  <button
                    onClick={() => studioInputRef.current?.click()}
                    className="w-full h-16 border-2 border-dashed border-border/50 rounded-lg text-xs text-muted-foreground hover:border-violet-400/60 hover:text-foreground transition-colors flex flex-col items-center justify-center gap-1"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Seleccionar imágenes propias</span>
                    <span className="text-[10px]">Se agregan al final de la lista de slides</span>
                  </button>
                )}

                {/* Library tab */}
                {studioTab === "library" && (
                  <div>
                    {loadingLibrary ? (
                      <div className="flex items-center justify-center h-24 text-xs text-muted-foreground gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando biblioteca...
                      </div>
                    ) : library.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Sin imágenes generadas aún</p>
                    ) : (
                      <>
                        <p className="text-[10px] text-muted-foreground mb-2">
                          Toca para agregar · Verde = mayor ER · Toca de nuevo para quitar
                        </p>
                        <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                          {library.map((lib) => {
                            const selected = studioSlides.some((s) => s.variantId === lib.variantId);
                            const erColor = lib.erPct === null ? "" : lib.erPct >= 3 ? "text-green-400" : lib.erPct >= 1 ? "text-yellow-400" : "text-red-400";
                            const libIsPortrait = lib.contentType === "story" || lib.contentType === "reel";
                            const formatIcon = lib.contentType === "reel" ? "🎬" : lib.contentType === "story" ? "📱" : lib.contentType === "carousel" ? "🎞" : "📷";
                            return (
                              <button
                                key={lib.variantId}
                                onClick={() => toggleLibrarySlide(lib)}
                                className={`relative rounded overflow-hidden border-2 transition-all ${selected ? "border-violet-400 ring-1 ring-violet-400/50" : "border-transparent hover:border-border/60"} ${libIsPortrait ? "aspect-[9/16]" : "aspect-[4/5]"}`}
                              >
                                <BgThumbImg
                                  id={lib.variantId}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                                {selected && (
                                  <div className="absolute inset-0 bg-violet-600/30 flex items-center justify-center">
                                    <Check className="w-5 h-5 text-white drop-shadow" />
                                  </div>
                                )}
                                {lib.erPct !== null && (
                                  <span className={`absolute bottom-0 left-0 right-0 text-[8px] font-bold text-center bg-black/60 py-0.5 ${erColor}`}>
                                    {lib.erPct}% ER
                                  </span>
                                )}
                                <span className="absolute top-0.5 right-0.5 text-[7px] bg-black/60 text-white px-0.5 rounded">
                                  {formatIcon}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Selected slides list — shared between all tabs */}
                {studioSlides.length > 0 && (() => {
                  const n = studioSlides.length;
                  const durSec = studioTransition === "hardcut" ? n * 5 : Math.round((n - 1) * 4.6 + 5);
                  return (
                  <div className="space-y-1.5 pt-1 border-t border-border/30">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                      Orden del video — {n} slide{n !== 1 ? "s" : ""} · ~{durSec}s
                    </p>
                    {studioSlides.map((slide, i) => (
                      <div key={slide.key} className="rounded-lg bg-muted/30 p-1.5 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-4 text-center font-mono shrink-0">{i + 1}</span>
                          <img src={slide.preview} alt="" className="w-9 h-9 object-cover rounded shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] truncate">{slide.name}</p>
                            <div className="flex gap-1">
                              {slide.erPct !== null && slide.erPct !== undefined && (
                                <p className={`text-[9px] ${slide.erPct >= 3 ? "text-green-400" : slide.erPct >= 1 ? "text-yellow-400" : "text-red-400"}`}>ER {slide.erPct}%</p>
                              )}
                              {slide.variantId === undefined && (
                                <p className="text-[9px] text-blue-400">Tu imagen</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => moveStudioSlide(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button onClick={() => moveStudioSlide(i, 1)} disabled={i === studioSlides.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button onClick={() => setStudioSlides((prev) => prev.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-destructive/20 text-destructive">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        {/* Caption input for this slide */}
                        <input
                          type="text"
                          spellCheck={true}
                          placeholder={`Texto slide ${i + 1} (opcional)`}
                          value={slide.caption ?? ""}
                          onChange={(e) => setStudioSlides((prev) => prev.map((s, j) => j === i ? { ...s, caption: e.target.value } : s))}
                          className="w-full text-[10px] bg-background/50 border border-border/30 rounded px-2 py-0.5 placeholder:text-muted-foreground/50 focus:outline-none focus:border-violet-500/50"
                          maxLength={80}
                        />
                      </div>
                    ))}
                    {/* Closing slide editor */}
                    <div className="border border-blue-500/20 rounded-lg p-2 space-y-1.5 bg-blue-500/5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wide">🏁 Slide de cierre</p>
                        <button
                          onClick={() => setStudioClosingSlide((prev) => ({ ...prev, enabled: !prev.enabled }))}
                          className={`text-[10px] px-2 py-0.5 rounded border font-medium transition-all ${
                            studioClosingSlide.enabled
                              ? "border-blue-400 bg-blue-500/20 text-blue-300"
                              : "border-border/40 text-muted-foreground hover:border-blue-400/50"
                          }`}
                        >
                          {studioClosingSlide.enabled ? "✓ Activado" : "Activar"}
                        </button>
                      </div>
                      {studioClosingSlide.enabled && (
                        <>
                          {/* CTA — shown first and independently of bullets */}
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-blue-400/70 shrink-0 font-semibold">Botón CTA:</span>
                            <input
                              type="text"
                              spellCheck={true}
                              value={studioClosingSlide.cta}
                              onChange={(e) => setStudioClosingSlide((prev) => ({ ...prev, cta: e.target.value }))}
                              className="flex-1 text-[10px] bg-blue-500/10 border border-blue-500/30 rounded px-2 py-0.5 text-blue-300 focus:outline-none focus:border-blue-500/60 font-medium"
                              maxLength={40}
                            />
                          </div>
                          {/* Bullets — completely independent of CTA */}
                          <div className="border-t border-blue-500/10 pt-1.5 space-y-0.5">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[9px] text-blue-400/60">Bullets de beneficios (máx 4):</p>
                              <button
                                onClick={() => setStudioClosingSlide((prev) => ({ ...prev, showBullets: !prev.showBullets }))}
                                className={`text-[9px] px-2 py-0.5 rounded border font-medium transition-all ${
                                  studioClosingSlide.showBullets
                                    ? "border-blue-400/50 bg-blue-500/15 text-blue-300"
                                    : "border-border/40 text-muted-foreground hover:border-blue-400/30"
                                }`}
                              >
                                {studioClosingSlide.showBullets ? "✓ Visibles" : "Ocultos"}
                              </button>
                            </div>
                            {studioClosingSlide.showBullets && (
                              <>
                                {studioClosingSlide.bullets.map((b, bi) => (
                                  <div key={bi} className="flex gap-1 items-center">
                                    <span className="text-[9px] text-blue-400/80 w-3 shrink-0">▌</span>
                                    <input
                                      type="text"
                                      spellCheck={true}
                                      value={b}
                                      onChange={(e) => setStudioClosingSlide((prev) => ({
                                        ...prev,
                                        bullets: prev.bullets.map((bb, bj) => bj === bi ? e.target.value : bb),
                                      }))}
                                      className="flex-1 text-[10px] bg-background/50 border border-blue-500/20 rounded px-2 py-0.5 focus:outline-none focus:border-blue-500/50"
                                      maxLength={50}
                                    />
                                    <button
                                      onClick={() => setStudioClosingSlide((prev) => ({ ...prev, bullets: prev.bullets.filter((_, bj) => bj !== bi) }))}
                                      className="text-muted-foreground/50 hover:text-destructive"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                                {studioClosingSlide.bullets.length < 4 && (
                                  <button
                                    onClick={() => setStudioClosingSlide((prev) => ({ ...prev, bullets: [...prev.bullets, ""] }))}
                                    className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground ml-4"
                                  >
                                    + Añadir bullet
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  );
                })()}

                {/* Transition selector + Generate button */}
                {studioSlides.length > 0 && (() => {
                  const n = studioSlides.length;
                  const durSec = studioTransition === "hardcut" ? n * 5 : Math.round((n - 1) * 4.6 + 5);
                  return (
                    <>
                      {/* Music selector — Library Gallery */}
                      <div className="border-t border-border/30 pt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">🎵 Música de fondo</p>
                          <div className="flex items-center gap-1">
                            {studioMusicTrackId && (
                              <button onClick={handleClearMusicTrack} className="text-[9px] text-red-400 hover:text-red-300 border border-red-400/30 px-1.5 py-0.5 rounded">✕ Sin música</button>
                            )}
                            {hasMusicKey && (
                              <button
                                onClick={handleSyncMusicLibrary}
                                disabled={musicSyncing}
                                className="text-[9px] text-blue-400 hover:text-blue-300 border border-blue-400/30 px-1.5 py-0.5 rounded disabled:opacity-50"
                                title="Sincronizar más pistas con Pixabay"
                              >
                                {musicSyncing ? "⏳ Sync…" : "🔄 Más pistas"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Upload custom jingle */}
                        <input
                          ref={customMusicUploadRef}
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { handleCustomMusicUpload(f); e.target.value = ""; } }}
                        />
                        <button
                          onClick={() => customMusicUploadRef.current?.click()}
                          disabled={isUploadingCustomMusic}
                          className="w-full flex items-center justify-center gap-2 h-8 rounded-lg border border-dashed border-border/50 hover:border-emerald-500/50 bg-black/20 hover:bg-emerald-500/5 text-xs text-muted-foreground hover:text-emerald-300 transition-all disabled:opacity-50"
                        >
                          {isUploadingCustomMusic
                            ? <span className="flex items-center gap-1"><span className="animate-spin">⏳</span> Subiendo audio…</span>
                            : <span>🎙 Subir mi jingle o música propia (MP3 · WAV)</span>
                          }
                        </button>
                        {customMusicError && (
                          <p className="text-[10px] text-red-400">{customMusicError}</p>
                        )}

                        {/* Currently selected track */}
                        {studioMusicTrackId && (() => {
                          const sel = musicLibrary.find(t => t.id === studioMusicTrackId);
                          return sel ? (
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-400/40">
                              <span className="text-base">{genreIcon[sel.genre] ?? "🎵"}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-semibold text-emerald-300 truncate">{sel.title}</p>
                                <p className="text-[9px] text-muted-foreground truncate">{sel.artist}</p>
                              </div>
                              <button onClick={() => handlePlayTrack(sel)} className="text-emerald-400 hover:text-emerald-300 flex-shrink-0">
                                {playingTrackId === sel.id ? "⏸" : "▶"}
                              </button>
                            </div>
                          ) : null;
                        })()}

                        {/* Genre filter chips */}
                        {musicLibrary.length > 0 && (() => {
                          const inferredGenre = inferMusicGenre(editedCaption);
                          const isAutoSuggested = !studioMusicTrackId && musicGenreFilter === inferredGenre && inferredGenre !== "trending";
                          return (
                            <div className="space-y-0.5">
                              {isAutoSuggested && (
                                <p className="text-[8px] text-blue-400/70 px-0.5 flex items-center gap-1">
                                  ✨ Sugerido por tu contenido
                                </p>
                              )}
                              <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                                {GENRE_FILTERS.map(f => (
                                  <button
                                    key={f.key}
                                    onClick={() => setMusicGenreFilter(f.key)}
                                    className={`flex-shrink-0 text-[9px] px-2 py-0.5 rounded-full border transition-all ${
                                      musicGenreFilter === f.key
                                        ? "bg-blue-500/30 border-blue-400/60 text-blue-300"
                                        : "border-border/40 text-muted-foreground hover:border-border/70 hover:text-foreground"
                                    }`}
                                  >{f.label}</button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Library tracks grid */}
                        {musicLibraryLoading ? (
                          <p className="text-[10px] text-muted-foreground text-center py-2">Cargando biblioteca…</p>
                        ) : musicLibrary.length === 0 ? (
                          <div className="text-center py-3 space-y-1">
                            <p className="text-[10px] text-muted-foreground">Biblioteca vacía</p>
                            <p className="text-[9px] text-muted-foreground/60">Intenta recargar la página</p>
                          </div>
                        ) : (() => {
                          const filtered = musicGenreFilter === "trending"
                            ? musicLibrary.filter(t => t.isTrending)
                            : musicGenreFilter === "all"
                              ? musicLibrary
                              : musicLibrary.filter(t => t.genre === musicGenreFilter);
                          return (
                            <div className="max-h-44 overflow-y-auto space-y-0.5 pr-0.5">
                              {musicGenreFilter === "trending" && filtered.length > 0 && (
                                <p className="text-[9px] text-orange-400/80 font-semibold uppercase tracking-wide px-1 pb-0.5">🔥 En tendencia ahora</p>
                              )}
                              {filtered.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground text-center py-2">Sin pistas en este género</p>
                              ) : filtered.map((track) => {
                                const isSelected = studioMusicTrackId === track.id;
                                const isPlaying  = playingTrackId === track.id;
                                return (
                                  <div
                                    key={track.id}
                                    onClick={() => handleSelectMusicTrack(track)}
                                    className={`group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-all ${
                                      isSelected
                                        ? "bg-emerald-500/20 border border-emerald-400/40"
                                        : "hover:bg-muted/40 border border-transparent"
                                    }`}
                                  >
                                    <span className="text-xs flex-shrink-0">{genreIcon[track.genre] ?? "🎵"}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1">
                                        <p className={`text-[10px] font-medium truncate ${isSelected ? "text-emerald-300" : "text-foreground/80"}`}>{track.title}</p>
                                        {track.isTrending && <span className="text-[8px] text-orange-400 flex-shrink-0">🔥</span>}
                                      </div>
                                      <p className="text-[9px] text-muted-foreground truncate">
                                        {track.artist} · <span className="capitalize">{track.genre}</span>
                                        {track.energyLevel === "high" && <span className="ml-1 text-red-400/70">↑</span>}
                                        {track.energyLevel === "low"  && <span className="ml-1 text-blue-400/70">↓</span>}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {track.usageCount > 0 && (
                                        <span className="text-[8px] text-amber-400">{track.usageCount}x</span>
                                      )}
                                      {track.isProtected && <span className="text-[8px]">🔒</span>}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handlePlayTrack(track); }}
                                        className={`text-[10px] px-1 py-0.5 rounded transition-all ${isPlaying ? "text-emerald-400" : "text-muted-foreground group-hover:text-foreground"}`}
                                      >
                                        {isPlaying ? "⏸" : "▶"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Synthetic fallback options */}
                        <div className="border-t border-border/20 pt-1.5">
                          <p className="text-[9px] text-muted-foreground/50 mb-1">O usa las pistas sintetizadas:</p>
                          <div className="flex flex-wrap gap-1">
                            {([
                              { id: "none",        label: "🔇 Silencio"  },
                              { id: "electronica", label: "⚡ Electrónica" },
                              { id: "corporativa", label: "🏢 Corporativa" },
                            ] as { id: StudioMusic; label: string }[]).map((m) => (
                              <button
                                key={m.id}
                                onClick={() => { setStudioMusic(m.id); handleClearMusicTrack(); }}
                                className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                                  !studioMusicTrackId && studioMusic === m.id
                                    ? "border-violet-400/60 bg-violet-500/15 text-violet-300"
                                    : "border-border/30 bg-muted/20 text-muted-foreground hover:border-border/60 hover:text-foreground"
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Transition selector */}
                      <div className="border-t border-border/30 pt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Transición entre slides</p>
                          <button
                            onClick={() => setShowMoreTransitions(!showMoreTransitions)}
                            className="text-[10px] text-violet-400 hover:text-violet-300 underline"
                          >
                            {showMoreTransitions ? "Ver menos" : "Ver todos"}
                          </button>
                        </div>
                        {/* Main transitions */}
                        {[
                          {
                            group: "⭐ Populares",
                            items: [
                              { id: "wipeleft",  label: "📖 Libro"    },
                              { id: "zoomin",    label: "🔍 Zoom"     },
                              { id: "circleopen",label: "⭕ Círculo"  },
                              { id: "pixelize",  label: "🟫 Pixel"    },
                              { id: "hblur",     label: "💨 Blur"     },
                              { id: "dissolve",  label: "✨ Disolver"  },
                              { id: "hardcut",   label: "✂️ Corte"    },
                            ],
                          },
                          ...showMoreTransitions ? [
                            {
                              group: "📖 Página",
                              items: [
                                { id: "wiperight",   label: "📖 Libro →"  },
                                { id: "smoothleft",  label: "◀ Suave"    },
                                { id: "smoothright", label: "▶ Suave →"  },
                                { id: "coverleft",   label: "📱 Cover"    },
                                { id: "coverright",  label: "📱 Cover →" },
                                { id: "revealleft",  label: "🎭 Reveal"   },
                                { id: "revealright", label: "🎭 Reveal →" },
                              ],
                            },
                            {
                              group: "⚡ Explosión",
                              items: [
                                { id: "circleclose", label: "🔴 Cierre"    },
                                { id: "squeezev",    label: "⬆ Squeeze"   },
                                { id: "squeezeh",    label: "↔ Squeeze"   },
                                { id: "vertopen",    label: "↕ Cortina V" },
                                { id: "horzopen",    label: "↔ Cortina H" },
                              ],
                            },
                            {
                              group: "🌀 Geométrico",
                              items: [
                                { id: "radial",    label: "🌀 Radial"   },
                                { id: "diagtl",    label: "↖ Diagonal" },
                                { id: "diagtr",    label: "↗ Diagonal" },
                                { id: "wipetl",    label: "↖ Wipe"     },
                                { id: "wipetr",    label: "↗ Wipe"     },
                              ],
                            },
                            {
                              group: "🌬 Viento",
                              items: [
                                { id: "hlwind",   label: "🌬 Viento ←" },
                                { id: "hrwind",   label: "🌬 Viento →" },
                                { id: "vuwind",   label: "🌬 Viento ↑" },
                                { id: "vdwind",   label: "🌬 Viento ↓" },
                              ],
                            },
                            {
                              group: "🎞 Fade",
                              items: [
                                { id: "fadeblack", label: "⬛ Fade negro" },
                                { id: "fadewhite", label: "⬜ Fade blanco" },
                                { id: "fadegrays", label: "🎞 Fade gris"  },
                                { id: "slideleft", label: "◀ Slide"       },
                                { id: "slideright",label: "▶ Slide →"     },
                              ],
                            },
                          ] : [],
                        ].map((group) => (
                          <div key={group.group} className="space-y-0.5">
                            {showMoreTransitions && (
                              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-medium">{group.group}</p>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {group.items.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => setStudioTransition(t.id as StudioTransition)}
                                  className={`text-[10px] px-2 py-1 rounded-md border transition-all font-medium ${
                                    studioTransition === t.id
                                      ? "border-violet-400 bg-violet-500/20 text-violet-300"
                                      : "border-border/40 bg-muted/30 text-muted-foreground hover:border-border/70 hover:text-foreground"
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={studioGenerating ? undefined : openStudioReview}
                        disabled={studioGenerating}
                        className="w-full gap-2"
                        style={{
                          background: studioGenerating ? undefined : "linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)",
                          color: "white",
                        }}
                        variant="outline"
                      >
                        {studioGenerating
                          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generando video ({n} slides)...</>
                          : <><CheckCircle className="w-4 h-4" /> Revisar y Generar · {n} slides · ~{durSec}s</>
                        }
                      </Button>

                      {studioVideoUrl && (
                        <a
                          href={studioVideoUrl}
                          download={`eco-reel-studio-${new Date().toISOString().slice(0, 10)}.mp4`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition-colors"
                          style={{ borderColor: "#7c3aed55", background: "#7c3aed10", color: "#a78bfa" }}
                        >
                          <Download className="w-4 h-4" /> Descargar Reel Studio MP4
                        </a>
                      )}
                      <p className="text-[10px] text-muted-foreground text-center">1080×1350 · 5s/slide · zoom suave · texto intacto</p>
                    </>
                  );
                })()}

                {studioSlides.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center pb-1">
                    Agrega slides desde las imágenes del post, la biblioteca o sube las tuyas
                  </p>
                )}
            </div>
          </div>
          )}
        </div>

        {/* Right Column: Editor */}
        <div className="lg:col-span-7 flex flex-col gap-6 h-full overflow-y-auto pr-2 no-scrollbar">
          <Card className="glass-card shrink-0">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <Label className="text-lg font-display text-primary flex items-center gap-2">
                  Texto del Post
                  {regenerateCaption.isPending && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {isCheckingCaptionSpell && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                  {captionSpellResult && !captionSpellResult.hasErrors && !isCheckingCaptionSpell && (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  )}
                  {captionSpellResult?.hasErrors && !isCheckingCaptionSpell && (
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                  )}
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveCaption}
                    disabled={updatePost.isPending}
                    className={captionSaved
                      ? "border-green-500/50 text-green-400 bg-green-500/10"
                      : "border-primary/30 text-primary hover:bg-primary/10"}
                  >
                    {captionSaved
                      ? <><CheckCircle className="w-3 h-3 mr-2" /> Guardado</>
                      : updatePost.isPending
                      ? <><RefreshCw className="w-3 h-3 mr-2 animate-spin" /> Guardando...</>
                      : <><Save className="w-3 h-3 mr-2" /> Guardar</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerateCaption.isPending} className="border-secondary/30 text-secondary hover:bg-secondary/10">
                    <RefreshCw className="w-3 h-3 mr-2" /> Reescribir con IA
                  </Button>
                </div>
              </div>
              <Textarea 
                value={editedCaption} 
                onChange={e => { setEditedCaption(e.target.value); setCaptionSpellResult(null); }} 
                className={`min-h-[150px] bg-black/40 text-base leading-relaxed focus-visible:ring-primary transition-colors ${
                captionSpellResult?.hasErrors
                  ? "border-red-500/70 ring-1 ring-red-500/30"
                  : captionSpellResult && !captionSpellResult.hasErrors
                  ? "border-green-500/50"
                  : "border-border/50"
              }`}
              />

              {/* IG character counter — only shown for instagram/both posts */}
              {editedPlatform !== "tiktok" && (() => {
                const totalIgChars = editedCaption.length + (editedHashtags ? 2 + editedHashtags.length : 0);
                const isNear = !isOverIgCaptionLimit && totalIgChars > IG_CAPTION_WARN_THRESHOLD;
                return (
                  <>
                    <p className={`mt-1 text-[11px] text-right font-mono transition-colors ${
                      isOverIgCaptionLimit ? "text-red-400 font-semibold" : isNear ? "text-yellow-400" : "text-muted-foreground"
                    }`}>
                      {totalIgChars.toLocaleString()} / {IG_CAPTION_LIMIT.toLocaleString()} chars Instagram
                    </p>
                    {isOverIgCaptionLimit && (
                      <div className="mt-2 rounded-xl border-2 border-red-500/60 bg-red-500/10 p-3 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-red-300 leading-snug">
                          Caption demasiado larga — edítala antes de aprobar. Instagram rechaza posts con más de {IG_CAPTION_LIMIT.toLocaleString()} caracteres (caption + hashtags). Te sobran <strong>{totalIgChars - IG_CAPTION_LIMIT}</strong> caracteres.
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* TikTok character counter — only shown for tiktok posts */}
              {editedPlatform === "tiktok" && (() => {
                const tiktokHashtags = editedHashtagsTiktok || editedHashtags;
                const totalTikTokChars = editedCaption.length + (tiktokHashtags ? 2 + tiktokHashtags.length : 0);
                const isOver = totalTikTokChars > TIKTOK_CAPTION_LIMIT;
                const isNear = !isOver && totalTikTokChars > TIKTOK_CAPTION_WARN_THRESHOLD;
                return (
                  <>
                    <p className={`mt-1 text-[11px] text-right font-mono transition-colors ${
                      isOver ? "text-yellow-400 font-semibold" : isNear ? "text-yellow-400" : "text-muted-foreground"
                    }`}>
                      {totalTikTokChars.toLocaleString()} / {TIKTOK_CAPTION_LIMIT.toLocaleString()} chars TikTok
                    </p>
                    {isOver && (
                      <div className="mt-2 rounded-xl border-2 border-yellow-500/60 bg-yellow-500/10 p-3 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-yellow-300 leading-snug">
                          Caption supera el límite de TikTok — el backend truncará automáticamente los últimos <strong>{totalTikTokChars - TIKTOK_CAPTION_LIMIT}</strong> caracteres al publicar.
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Caption spell check — loading indicator */}
              {isCheckingCaptionSpell && (
                <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Verificando ortografía…
                </p>
              )}

              {/* Caption spell check — errors panel */}
              {captionSpellResult?.hasErrors && !isCheckingCaptionSpell && (
                <div className="mt-3 rounded-xl border-2 border-red-500/60 bg-red-500/10 p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm font-bold text-red-300">Errores ortográficos — corrige antes de aprobar</p>
                  </div>

                  {/* Explanation */}
                  <p className="text-[12px] text-red-200/80 leading-relaxed">{captionSpellResult.explanation}</p>

                  {/* Word diff */}
                  <div className="rounded-lg bg-black/40 border border-red-500/20 p-3 leading-loose text-[12px] font-mono whitespace-pre-wrap">
                    {buildWordDiff(editedCaption, captionSpellResult.corrected).map((token, i) => (
                      token.type === 'newline' ? (
                        <br key={i} />
                      ) : token.type === 'wrong' ? (
                        <span key={i} className="bg-red-500/30 text-red-300 line-through rounded px-0.5 mx-0.5">{token.word}</span>
                      ) : token.type === 'fix' ? (
                        <span key={i} className="bg-green-500/25 text-green-300 font-semibold rounded px-0.5 mx-0.5">{token.word}</span>
                      ) : (
                        <span key={i}> {token.word} </span>
                      )
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        captionJustCorrectedRef.current = true;
                        setEditedCaption(captionSpellResult.corrected);
                        setCaptionSpellResult({ hasErrors: false, corrected: captionSpellResult.corrected, explanation: "" });
                        updatePost.mutate({ id: currentPost.id, data: { caption: captionSpellResult.corrected } as any });
                      }}
                      className="flex-1 h-8 text-[12px] bg-green-600/80 hover:bg-green-600 text-white border-0 gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Aplicar corrección
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px] border-red-500/40 text-red-400/70 hover:bg-red-500/10 hover:text-red-300 px-3"
                      onClick={() => {
                        captionJustCorrectedRef.current = true;
                        setCaptionSpellResult({ ...captionSpellResult, hasErrors: false });
                      }}
                    >
                      Ignorar de todas formas
                    </Button>
                  </div>
                </div>
              )}

              {/* All-clear */}
              {captionSpellResult && !captionSpellResult.hasErrors && !isCheckingCaptionSpell && (
                <p className="mt-1.5 text-[11px] text-green-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3" /> Sin errores ortográficos
                </p>
              )}
              
              {/* Custom text per niche — editable per post */}
              <div className="mt-3 rounded-lg border border-border/40 bg-black/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground font-medium">Texto adicional del tema</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setLocalCustomTextPosition("before")}
                      className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${localCustomTextPosition === "before" ? "bg-primary/20 border-primary/50 text-primary" : "border-border/40 text-muted-foreground hover:border-border/70"}`}
                    >
                      Antes
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalCustomTextPosition("after")}
                      className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${localCustomTextPosition === "after" ? "bg-primary/20 border-primary/50 text-primary" : "border-border/40 text-muted-foreground hover:border-border/70"}`}
                    >
                      Después
                    </button>
                  </div>
                </div>
                <Textarea
                  value={localCustomText}
                  onChange={e => setLocalCustomText(e.target.value)}
                  placeholder="Texto que se añadirá al caption al aprobar (opcional)"
                  className="min-h-[60px] bg-black/40 text-xs border-border/50 focus-visible:ring-primary resize-none"
                />
                {localCustomText.trim() && (
                  <div className="rounded-md border border-border/30 bg-black/40 p-2.5">
                    <p className="text-[10px] text-muted-foreground mb-1">Vista previa del caption final:</p>
                    <p className="text-[11px] text-foreground/80 whitespace-pre-wrap leading-relaxed">
                      {localCustomTextPosition === "before"
                        ? `${localCustomText.trim()}\n\n${editedCaption}`
                        : `${editedCaption}\n\n${localCustomText.trim()}`}
                    </p>
                  </div>
                )}
              </div>

              {/* ── Textos Adicionales — gestión inline ───────────────────── */}
              <div className="mt-3 rounded-lg border border-border/40 bg-black/20">
                {/* Header — always visible */}
                <button
                  type="button"
                  onClick={() => setShowAddonsPanel(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                    <MessageSquarePlus className="w-3.5 h-3.5 text-primary/70" />
                    Textos Adicionales
                    {addonsList.length > 0 && (
                      <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                        {addonsList.filter(a => a.active).length} activo{addonsList.filter(a => a.active).length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/60 transition-transform ${showAddonsPanel ? "rotate-180" : ""}`} />
                </button>

                {/* Expandable content */}
                {showAddonsPanel && (
                  <div className="border-t border-border/30 px-3 pb-3 pt-2 space-y-2">
                    {addonsLoading ? (
                      <p className="text-[11px] text-muted-foreground text-center py-2">
                        <RefreshCw className="w-3 h-3 animate-spin inline mr-1" /> Cargando…
                      </p>
                    ) : addonsList.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/60 text-center py-2">
                        Sin textos adicionales — los textos configurados aquí se aplican automáticamente al generar posts.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {addonsList.map(addon => (
                          <div
                            key={addon.id}
                            className={`flex items-start gap-2 rounded-md border px-2.5 py-2 transition-all ${addon.active ? "border-border/40 bg-black/30" : "border-border/20 bg-black/10 opacity-50"}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <span className="text-[11px] font-medium">{addon.name}</span>
                                {!addon.keywords?.trim() ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] border border-green-500/40 text-green-400 rounded px-1 py-0.5">
                                    <Globe className="w-2 h-2" /> Universal
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] border border-blue-500/40 text-blue-400 rounded px-1 py-0.5 max-w-[120px] truncate">
                                    <Tag className="w-2 h-2 shrink-0" /> {addon.keywords}
                                  </span>
                                )}
                                <span className="text-[9px] text-muted-foreground/50">
                                  {addon.position === "before" ? "↑ antes" : "↓ después"}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground/70 line-clamp-1 whitespace-pre-wrap">{addon.text}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Switch
                                checked={addon.active}
                                onCheckedChange={() => toggleAddonActive(addon)}
                                className="scale-[0.65] origin-right"
                              />
                              <button
                                type="button"
                                onClick={() => openAddonsModal(addon)}
                                className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteAddon(addon)}
                                disabled={addonsDeleting === addon.id}
                                className="p-1 rounded hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-400 transition-colors"
                              >
                                {addonsDeleting === addon.id
                                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                                  : <Trash2 className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openAddonsModal()}
                      className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/30 py-1.5 text-[11px] text-primary/70 hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Agregar texto adicional
                    </button>
                  </div>
                )}
              </div>
              {/* ─────────────────────────────────────────────────────────── */}

              <div className="mt-4">
                <Label className="text-sm text-muted-foreground mb-1 block">
                  Hashtags Instagram / Facebook
                  <span className="ml-2 text-[10px] text-muted-foreground/60">hasta 30</span>
                </Label>
                <Input 
                  value={editedHashtags} 
                  onChange={e => setEditedHashtags(e.target.value)}
                  className="bg-black/40 border-border/50 text-secondary"
                />
              </div>

              {(editedPlatform === "tiktok" || editedPlatform === "both") && (
                <div className="mt-3">
                  <Label className="text-sm text-muted-foreground mb-1 block flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-black text-white text-[9px] font-bold leading-none">TK</span>
                    Hashtags TikTok
                    <span className="ml-1 text-[10px] text-muted-foreground/60">máx 5 — enfocados y de alto alcance</span>
                  </Label>
                  <Input 
                    value={editedHashtagsTiktok} 
                    onChange={e => setEditedHashtagsTiktok(e.target.value)}
                    placeholder="Ej: #tuMarca #Colombia #Emprendimiento #Negocios #Viral"
                    className="bg-black/40 border-border/50 text-secondary"
                  />
                  {editedHashtagsTiktok.split(/\s+/).filter(t => t.startsWith("#")).length > 5 && (
                    <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                      ⚠ TikTok recomienda máximo 5 hashtags para mejor alcance
                    </p>
                  )}
                </div>
              )}

              {/* Location tagging — unified field */}
              <div className="mt-4 relative">
                <Label className="text-sm text-muted-foreground mb-2 block flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Ubicación
                </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    value={locationQuery}
                    onChange={e => {
                      setLocationQuery(e.target.value);
                      if (!e.target.value.trim()) { setEditedLocationId(""); setEditedLocationName(""); }
                    }}
                    placeholder="Buscar lugar, ej: Cali"
                    className="bg-black/40 border-border/50 text-secondary flex-1"
                    onFocus={() => { if (locationResults.length > 0) setLocationDropdownOpen(true); }}
                    onBlur={() => setTimeout(() => setLocationDropdownOpen(false), 200)}
                  />
                  {locationSearching && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
                  {editedLocationId && !locationSearching && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditedLocationId("");
                        setEditedLocationName("");
                        setLocationQuery("");
                        setLocationResults([]);
                        setLocationDropdownOpen(false);
                        handleLocationCleared();
                      }}
                      className="text-muted-foreground hover:text-secondary transition-colors shrink-0"
                      title="Quitar ubicación"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {editedLocationId && (
                  <p className="text-[11px] text-[#0077FF] mt-1.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {editedLocationName}
                  </p>
                )}
                {!editedLocationId && defaultLocationFromProfile && (
                  <p className="text-[11px] text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Ciudad actual: <span className="text-muted-foreground font-medium ml-0.5">{defaultLocationFromProfile}</span>
                  </p>
                )}
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="loc-use-hashtags"
                      checked={locationUseForHashtags}
                      onCheckedChange={v => setAndPersistLocationUseForHashtags(!!v)}
                      className="h-3.5 w-3.5"
                    />
                    <label htmlFor="loc-use-hashtags" className="text-[11px] text-muted-foreground cursor-pointer select-none">
                      Usar para hashtags de este post
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="loc-save-as-default"
                      checked={locationSaveAsDefault}
                      onCheckedChange={v => setAndPersistLocationSaveAsDefault(!!v)}
                      className="h-3.5 w-3.5"
                    />
                    <label htmlFor="loc-save-as-default" className="text-[11px] text-muted-foreground cursor-pointer select-none">
                      Guardar como predeterminada para futuros posts
                    </label>
                  </div>
                </div>
                {locationDropdownOpen && locationResults.length > 0 && (
                  <ul className="absolute z-50 left-0 right-0 mt-1 bg-zinc-900 border border-border/60 rounded-md shadow-xl max-h-52 overflow-y-auto">
                    {locationResults.map(loc => (
                      <li key={loc.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-white/10 transition-colors flex items-start gap-2.5"
                          onMouseDown={() => {
                            setEditedLocationId(loc.id);
                            const displayName = loc.subtitle ? `${loc.name}, ${loc.subtitle}` : loc.name;
                            setEditedLocationName(displayName);
                            setLocationQuery(loc.name);
                            setLocationResults([]);
                            setLocationDropdownOpen(false);
                            handleLocationSelected(loc.name);
                          }}
                        >
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-[#0077FF] mt-0.5" />
                          <span className="flex flex-col min-w-0">
                            <span className="text-sm text-secondary leading-tight truncate">{loc.name}</span>
                            {loc.subtitle && (
                              <span className="text-[11px] text-muted-foreground leading-tight truncate">{loc.subtitle}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {locationDropdownOpen && locationResults.length === 0 && !locationSearching && locationQuery.trim().length >= 2 && (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-[11px] text-muted-foreground">No se encontraron lugares en Instagram para "{locationQuery}".</p>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 transition-colors font-medium"
                      onClick={() => {
                        const name = locationQuery.trim();
                        setEditedLocationId(`custom:${name}`);
                        setEditedLocationName(name);
                        setLocationDropdownOpen(false);
                        handleLocationSelected(name);
                      }}
                    >
                      <MapPin className="w-3 h-3" />
                      Guardar "{locationQuery.trim()}" como ubicación de texto
                    </button>
                  </div>
                )}
              </div>

              {/* Inline AI Suggestion */}
              <div className="mt-4 border-t border-border/30 pt-4">
                <button
                  type="button"
                  onClick={() => setShowSuggestion(s => !s)}
                  className="flex items-center gap-2 text-sm text-secondary/80 hover:text-secondary transition-colors w-full"
                >
                  <Wand2 className="w-4 h-4" />
                  <span className="font-medium">Mejorar una parte con IA</span>
                  <span className="ml-auto text-xs text-muted-foreground">{showSuggestion ? "Ocultar" : "Expandir"}</span>
                </button>
                {showSuggestion && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Describe qué parte quieres cambiar. La IA aplica solo ese cambio y deja el resto intacto.</p>
                    <Textarea
                      placeholder='Ej: "El primer párrafo suena muy técnico, hazlo más conversacional" o "Agrega más emoción al cierre" o "El CTA final no engancha, cámbialo"'
                      value={suggestionText}
                      onChange={e => setSuggestionText(e.target.value)}
                      className="min-h-[80px] bg-black/40 border-secondary/30 text-sm leading-relaxed focus-visible:ring-secondary placeholder:text-muted-foreground/50"
                    />
                    <Button
                      onClick={handleApplySuggestion}
                      disabled={!suggestionText.trim() || applySuggestion.isPending}
                      className="w-full bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/30"
                      variant="outline"
                    >
                      {applySuggestion.isPending
                        ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Aplicando cambio...</>
                        : <><Wand2 className="w-4 h-4 mr-2" /> Aplicar sugerencia</>
                      }
                    </Button>
                  </div>
                )}
              </div>

              {/* Caption AI Analysis — score + concrete improvement suggestions */}
              <div className="mt-3 border-t border-border/30 pt-4">
                <button
                  type="button"
                  onClick={handleEvaluateCaption}
                  disabled={isEvaluating || !currentPost?.caption?.trim()}
                  className="flex items-center gap-2 text-sm text-primary/80 hover:text-primary transition-colors w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isEvaluating
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <span className="text-base leading-none">🔍</span>
                  }
                  <span className="font-medium">{isEvaluating ? "Analizando caption..." : "Analizar caption con IA"}</span>
                  {captionEval && !isEvaluating && (
                    <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                      captionEval.score >= 8 ? "bg-primary/20 text-primary" :
                      captionEval.score >= 6 ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>
                      {captionEval.score}/10
                    </span>
                  )}
                </button>
                {captionEval && !isEvaluating && (
                  <div className="mt-3 space-y-2">
                    <div className={`text-xs font-semibold px-3 py-1.5 rounded-md ${
                      captionEval.score >= 8 ? "bg-primary/10 text-primary" :
                      captionEval.score >= 6 ? "bg-yellow-500/10 text-yellow-400" :
                      "bg-red-500/10 text-red-400"
                    }`}>
                      {captionEval.score >= 8
                        ? `Score ${captionEval.score}/10 — Listo para publicar`
                        : captionEval.score >= 6
                        ? `Score ${captionEval.score}/10 — Necesita ajustes menores`
                        : `Score ${captionEval.score}/10 — Necesita trabajo`
                      }
                    </div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Sugerencias de mejora:</p>
                    <ul className="space-y-2">
                      {captionEval.suggestions.map((s, i) => (
                        <li key={i} className="flex gap-2 text-xs text-foreground/80 leading-relaxed">
                          <span className="text-primary shrink-0 mt-0.5">→</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-muted-foreground/60 pt-1">
                      Usa "Mejorar con IA" de arriba para aplicar cualquiera de estas sugerencias.
                    </p>
                  </div>
                )}
              </div>

              {/* Cambiar tema del post */}
              <RethemePanel postId={currentPost.id} onApplied={(newCaption) => {
                setEditedCaption(newCaption);
                queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
              }} />
            </CardContent>
          </Card>

          {/* Platform Selector */}
          <Card className="glass-card shrink-0">
            <CardContent className="p-6">
              <Label className="text-lg font-display text-primary mb-4 block">Plataforma de Publicación</Label>
              <p className="text-[11px] text-muted-foreground mb-3 -mt-1">
                Instagram siempre publica también en Facebook (misma cuenta Meta).
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "both",      label: "Todas",     sublabel: "IG + TK + FB", icon: null,      color: "text-primary" },
                  { value: "instagram", label: "Instagram", sublabel: "IG + FB",       icon: Instagram, color: "text-[#E1306C]" },
                  { value: "tiktok",    label: "TikTok",    sublabel: "solo",           icon: PlaySquare, color: "text-white" },
                ].map(({ value, label, sublabel, icon: Icon, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEditedPlatform(value)}
                    className={`flex items-center gap-2.5 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                      editedPlatform === value
                        ? "border-primary bg-primary/10 text-primary shadow-[0_0_10px_rgba(0,201,83,0.2)]"
                        : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
                    }`}
                  >
                    {Icon
                      ? <Icon className={`w-4 h-4 ${editedPlatform === value ? "text-primary" : color}`} />
                      : value === "facebook"
                        ? <span className={`font-bold text-base leading-none ${editedPlatform === value ? "text-primary" : color}`}>f</span>
                        : <span className="text-xs font-bold leading-none">✦</span>
                    }
                    <span>{label}</span>
                    <span className="text-[10px] opacity-60">{sublabel}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Carousel Slide Reorder — only shown for carousel posts with multiple slides */}
          {currentPost.contentType === "carousel" && slideOrder.length > 1 && (
            <Card className="glass-card shrink-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-lg font-display text-secondary flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    Orden del Carrusel
                  </Label>
                  <div className="flex items-center gap-2">
                    {slideOrderDirty && (
                      <button
                        onClick={() => {
                          const sorted = [...fullVariants].sort((a: any, b: any) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
                          setSlideOrder(sorted.map((v: any) => v.id));
                          setSlideOrderDirty(false);
                          setPreviewSlideId(sorted[0]?.id ?? null);
                        }}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline transition-colors"
                      >
                        Restablecer
                      </button>
                    )}
                    <Button
                      size="sm"
                      onClick={handleSaveSlideOrder}
                      disabled={!slideOrderDirty || isSavingSlideOrder}
                      className={`h-7 text-xs transition-all ${
                        slideOrderDirty
                          ? "bg-secondary/20 border-secondary/50 text-secondary hover:bg-secondary/30"
                          : "opacity-40 cursor-not-allowed bg-white/5 border-border/30 text-muted-foreground"
                      } border`}
                      variant="outline"
                    >
                      {isSavingSlideOrder
                        ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Guardando...</>
                        : slideOrderDirty
                        ? <><Save className="w-3 h-3 mr-1.5" />Guardar Orden</>
                        : <><Check className="w-3 h-3 mr-1.5" />Orden guardado</>
                      }
                    </Button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground/70 mb-4 -mt-1">
                  Toca un slide para previsualizarlo en el teléfono. Usa las flechas para cambiar el orden. Pulsa <strong>Guardar Orden</strong> para aplicar.
                </p>

                <div className="flex flex-col gap-2">
                  {slideOrder.map((variantId, idx) => {
                    const variant = fullVariants.find((v: any) => v.id === variantId) as any;
                    const isPreview = previewSlideId === variantId;
                    const isFirst = idx === 0;
                    const isLast = idx === slideOrder.length - 1;
                    return (
                      <div
                        key={variantId}
                        className={`flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${
                          isPreview
                            ? "border-secondary/60 bg-secondary/10 shadow-[0_0_10px_rgba(0,119,255,0.15)]"
                            : "border-border/30 bg-white/3 hover:border-border/60 hover:bg-white/5"
                        }`}
                        onClick={() => setPreviewSlideId(variantId)}
                      >
                        {/* Slide number badge */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isPreview ? "bg-secondary text-secondary-foreground" : "bg-white/10 text-white/60"
                        }`}>
                          {idx + 1}
                        </div>

                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-border/30">
                          {variant?.imageData ? (
                            variant.mimeType?.startsWith("video/") ? (
                              <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-[9px] text-white/50">▶</span>
                                  <span className="text-[8px] text-white/30">video</span>
                                </div>
                              </div>
                            ) : (
                            <img
                              src={`data:image/jpeg;base64,${variant.imageData}`}
                              alt={`Slide ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            )
                          ) : (
                            <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-white/20" />
                            </div>
                          )}
                        </div>

                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold leading-tight ${isPreview ? "text-secondary" : "text-foreground"}`}>
                            {idx === 0 ? "Portada" : `Slide ${idx + 1}`}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {SLIDE_LABELS[variant?.variantIndex ?? idx] ?? `Posición original ${(variant?.variantIndex ?? idx) + 1}`}
                          </p>
                        </div>

                        {/* Up/Down controls */}
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); swapSlides(idx, idx - 1); }}
                            disabled={isFirst}
                            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                              isFirst
                                ? "text-white/10 cursor-not-allowed"
                                : "text-white/40 hover:text-secondary hover:bg-secondary/10"
                            }`}
                            title="Mover arriba"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); swapSlides(idx, idx + 1); }}
                            disabled={isLast}
                            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                              isLast
                                ? "text-white/10 cursor-not-allowed"
                                : "text-white/40 hover:text-secondary hover:bg-secondary/10"
                            }`}
                            title="Mover abajo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Preview indicator */}
                        {isPreview && (
                          <div className="shrink-0 text-[9px] text-secondary font-bold uppercase tracking-wider">
                            Preview
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Dot navigator */}
                <div className="flex items-center justify-center gap-1.5 mt-4">
                  {slideOrder.map((variantId, idx) => (
                    <button
                      key={variantId}
                      onClick={() => setPreviewSlideId(variantId)}
                      className={`rounded-full transition-all ${
                        previewSlideId === variantId
                          ? "w-4 h-2 bg-secondary"
                          : "w-2 h-2 bg-white/20 hover:bg-white/40"
                      }`}
                      title={`Slide ${idx + 1}`}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Image Editor */}
          <Card className="glass-card shrink-0">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-display text-primary flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Editar Imagen
                </Label>
                {currentPost.contentType === "carousel" && previewSlideId != null && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/20 text-secondary font-medium border border-secondary/30">
                    Slide {(slideOrder.indexOf(previewSlideId) + 1) || "?"}
                  </span>
                )}
              </div>

              {/* Style selector */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Estilo visual</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "photorealistic", label: "📸 Foto" },
                    { value: "graphic", label: "🎨 Gráfico" },
                    { value: "infographic", label: "📊 Info" },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setImageStyle(value)}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                        imageStyle === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logo: posición + estilo juntos */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Logo del negocio — posición y estilo</p>
                <div className="flex gap-2">
                  {/* Posición 2x2 */}
                  <div className="grid grid-cols-2 gap-1.5 flex-1">
                    {([
                      { value: "top-left",     label: "↖ Arr. Izq." },
                      { value: "top-right",    label: "↗ Arr. Der." },
                      { value: "bottom-left",  label: "↙ Abj. Izq." },
                      { value: "bottom-right", label: "↘ Abj. Der." },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLogoPosition(value)}
                        className={`py-2 px-2 rounded-lg border text-[11px] font-medium transition-all ${
                          logoPosition === value
                            ? "border-secondary bg-secondary/10 text-secondary"
                            : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="w-px bg-border/40 self-stretch" />

                  {/* Estilo: blanco / azul / ícono — con vista previa del logo del negocio */}
                  <div className="flex flex-col gap-1.5 w-[100px]">
                    {([
                      { value: "white", label: "Logo 1", bg: "bg-gray-800" },
                      { value: "blue",  label: "Logo 2", bg: "bg-gray-900" },
                      { value: "icon",  label: "Logo 3", bg: "bg-gray-900" },
                    ] as const).map(({ value, label, bg }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLogoColor(value)}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all ${
                          logoColor === value
                            ? "border-secondary bg-secondary/10 text-secondary"
                            : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
                        }`}
                      >
                        <span className={`w-8 h-6 rounded flex items-center justify-center flex-shrink-0 ${bg}`}>
                          {activeBusinessLogoUrl
                            ? <img src={activeBusinessLogoUrl} alt={label} className="w-7 h-5 object-contain" />
                            : <span className="text-[10px] text-white/40">🏢</span>}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Text style */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Estilo de tipografía</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "eco",       emoji: "🌐", label: "Clásico Web",  desc: "Inter · clásico y limpio" },
                    { value: "cinema",    emoji: "🎬", label: "Cinema",    desc: "Fondo oscuro · texto blanco cinemático" },
                    { value: "neon",      emoji: "💡", label: "Neon",      desc: "Outline neón · fondo oscuro transparente" },
                    { value: "bloque",    emoji: "🟦", label: "Bloque",    desc: "Caja sólida de color + texto bold" },
                    { value: "duotono",   emoji: "🎨", label: "Duotono",   desc: "Blanco + última línea en azul de marca" },
                    { value: "titanio",   emoji: "✨", label: "Titanio",   desc: "Degradado blanco → cian · neón" },
                    { value: "editorial", emoji: "📰", label: "Editorial", desc: "Barra oscura + última línea en azul de marca" },
                  ] as const).map(({ value, emoji, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTextStyle(value)}
                      className={`py-2 px-2 rounded-lg border text-left transition-all ${
                        textStyle === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <span className="text-base">{emoji}</span>
                        {savedTextStyle === value && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-primary/20 text-primary leading-none shrink-0">
                            ★ Pred.
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold block">{label}</span>
                      <span className="text-[10px] opacity-60 leading-tight block">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>


              {/* ── Filtro de imagen ── */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Filtro de imagen</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { value: "none",     label: "Original",  color: "bg-white/10",           border: "border-white/20",       dot: "bg-white/40"     },
                    { value: "warm",     label: "Cálido",    color: "bg-orange-500/15",       border: "border-orange-500/30",  dot: "bg-orange-400"   },
                    { value: "cool",     label: "Frío",      color: "bg-blue-500/15",         border: "border-blue-500/30",    dot: "bg-blue-400"     },
                    { value: "dramatic", label: "Dramático", color: "bg-neutral-900/40",      border: "border-neutral-500/30", dot: "bg-neutral-300"  },
                    { value: "vintage",  label: "Vintage",   color: "bg-amber-700/15",        border: "border-amber-700/30",   dot: "bg-amber-500"    },
                    { value: "dark",     label: "Oscuro",    color: "bg-slate-900/50",        border: "border-slate-600/40",   dot: "bg-slate-400"    },
                    { value: "vivid",    label: "Vívido",    color: "bg-fuchsia-600/15",      border: "border-fuchsia-500/30", dot: "bg-fuchsia-400"  },
                    { value: "haze",     label: "Neblina",   color: "bg-sky-200/15",          border: "border-sky-300/30",     dot: "bg-sky-200"      },
                  ] as const).map(({ value, label, color, border, dot }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setImageFilter(value)}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-[10px] font-medium transition-all ${color} ${
                        imageFilter === value
                          ? `${border} ring-1 ring-primary/60 text-foreground`
                          : `${border} text-muted-foreground hover:text-foreground`
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${dot} ${imageFilter === value ? "ring-2 ring-primary/70" : ""}`} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font selector — catálogo completo desde lib/fonts */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Tipografía del texto</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(() => {
                    const base = FONT_CATALOG;
                    const activeKey = overlayFont && overlayFont !== "default" && !overlayFont.startsWith("custom_text:") ? overlayFont : null;
                    const visible = activeKey && !base.some(f => f.key === activeKey)
                      ? [...base, { key: activeKey, label: activeKey.charAt(0).toUpperCase() + activeKey.slice(1), family: "sans-serif", category: "sans" as const }]
                      : base;
                    return visible;
                  })().map(({ key, label, family }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOverlayFont(key)}
                      className={`py-2 px-2 rounded-lg border text-xs transition-all ${
                        overlayFont === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
                      }`}
                      style={{ fontFamily: family, fontWeight: 700 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Custom font text input */}
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Ej: Nunito, Roboto Condensed…"
                    value={customFontInput}
                    onChange={e => setCustomFontInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && customFontInput.trim()) {
                        setOverlayFont(`custom_text:${customFontInput.trim()}`);
                      }
                    }}
                    className="flex-1 h-8 rounded-lg border border-border/40 bg-black/40 px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customFontInput.trim()) setOverlayFont(`custom_text:${customFontInput.trim()}`);
                    }}
                    className="h-8 px-3 rounded-lg border border-border/40 bg-black/30 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
                  >
                    Usar
                  </button>
                </div>
                {/* Upload custom font file */}
                <input
                  ref={customFontUploadRef}
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { handleCustomFontUpload(f); e.target.value = ""; } }}
                />
                <button
                  onClick={() => customFontUploadRef.current?.click()}
                  disabled={isUploadingCustomFont}
                  className="mt-1.5 w-full flex items-center justify-center gap-2 h-8 rounded-lg border border-dashed border-border/50 hover:border-primary/50 bg-black/20 hover:bg-primary/5 text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                >
                  {isUploadingCustomFont
                    ? <span className="flex items-center gap-1"><span className="animate-spin">⏳</span> Subiendo fuente…</span>
                    : <span>Aa · Subir tipografía (TTF · OTF · WOFF)</span>
                  }
                </button>
                {customFontError && <p className="text-[10px] text-red-400 mt-1">{customFontError}</p>}
              </div>

              {/* Segunda fuente — toggle */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Segunda tipografía <span className="text-muted-foreground/50">(líneas 2+)</span></p>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showFont2Selector;
                      setShowFont2Selector(next);
                      if (!next) { setOverlayFont2(null); setCustomFont2Input(""); }
                    }}
                    className={`h-6 px-2 rounded-md border text-[10px] font-bold transition-all ${showFont2Selector ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"}`}
                  >
                    {showFont2Selector ? "✕ Quitar" : "+ Añadir"}
                  </button>
                </div>
                {showFont2Selector && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(() => {
                        const base = FONT_CATALOG;
                        const activeKey2 = overlayFont2 && overlayFont2 !== "default" && !overlayFont2.startsWith("custom_text:") ? overlayFont2 : null;
                        const visible2 = activeKey2 && !base.some(f => f.key === activeKey2)
                          ? [...base, { key: activeKey2, label: activeKey2.charAt(0).toUpperCase() + activeKey2.slice(1), family: "sans-serif", category: "sans" as const }]
                          : base;
                        return visible2;
                      })().map(({ key, label, family }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setOverlayFont2(key)}
                          className={`py-2 px-2 rounded-lg border text-xs transition-all ${overlayFont2 === key ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"}`}
                          style={{ fontFamily: family, fontWeight: 700 }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Ej: Pacifico, Caveat…"
                        value={customFont2Input}
                        onChange={e => setCustomFont2Input(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && customFont2Input.trim()) {
                            setOverlayFont2(`custom_text:${customFont2Input.trim()}`);
                          }
                        }}
                        className="flex-1 h-8 rounded-lg border border-border/40 bg-black/40 px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button
                        type="button"
                        onClick={() => { if (customFont2Input.trim()) setOverlayFont2(`custom_text:${customFont2Input.trim()}`); }}
                        className="h-8 px-3 rounded-lg border border-border/40 bg-black/30 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
                      >
                        Usar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Text position + size */}
              <div className="flex gap-3">
                {/* Vertical position */}
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">Posición del texto</p>
                  <div className="flex gap-1.5">
                    {([
                      { value: "top",    label: "↑ Arriba" },
                      { value: "center", label: "⬛ Centro" },
                      { value: "bottom", label: "↓ Abajo"  },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTextPosition(value)}
                        className={`flex-1 py-2 px-1 rounded-lg border text-[11px] font-medium transition-all ${
                          textPosition === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="w-px bg-border/40 self-stretch mt-5" />

                {/* Font size */}
                <div className="w-[140px]">
                  <p className="text-xs text-muted-foreground mb-2">Tamaño</p>
                  <div className="flex gap-1">
                    {([
                      { value: "small",  label: "S",  px: "text-[10px]" },
                      { value: "sm",     label: "SM", px: "text-[12px]" },
                      { value: "medium", label: "M",  px: "text-[14px]" },
                      { value: "large",  label: "L",  px: "text-[18px]" },
                    ] as const).map(({ value, label, px }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTextSize(value)}
                        className={`flex-1 py-2 rounded-lg border font-bold transition-all ${px} ${
                          textSize === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/40 text-muted-foreground hover:border-border hover:bg-white/5"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Logo del negocio — 3 ranuras fijas con auto-guardado ── */}
              <div className="space-y-2 rounded-xl border border-border/40 p-3 bg-white/[0.02]">
                <p className="text-xs font-semibold text-foreground/80">Logos del negocio</p>
                <div className="grid grid-cols-3 gap-2">
                  {([0, 1, 2] as const).map((slotIdx) => {
                    const storagePath = businessLogoStoragePaths[slotIdx] ?? null;
                    const browserUrl = storagePath
                      ? (storagePath.startsWith("/objects/")
                          ? `${BASE}/api/storage/objects/${storagePath.slice("/objects/".length)}`
                          : storagePath)
                      : null;
                    const isActive = overlayLogoUrl === browserUrl && !!browserUrl;
                    const slotLabel = slotIdx === 0 ? "Variante 1 (predeterminada)" : `Variante ${slotIdx + 1}`;
                    return (
                      <div key={slotIdx} className="flex flex-col gap-1">
                        <span className="text-[9px] text-muted-foreground text-center">{slotLabel}</span>
                        <label className={`relative w-full aspect-square rounded-lg border-2 flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-all ${
                          isActive
                            ? "border-primary ring-1 ring-primary bg-primary/5"
                            : browserUrl
                              ? "border-border/50 bg-black/30 hover:border-primary/40"
                              : "border-dashed border-border/40 bg-black/20 hover:border-primary/50 hover:bg-white/5"
                        }`}>
                          {browserUrl ? (
                            <>
                              <img
                                src={browserUrl}
                                alt={slotLabel}
                                className="w-full h-full object-contain p-1"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setOverlayLogoUrl(browserUrl);
                                  setOverlayLogoPath(storagePath ?? "");
                                }}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  saveLogoSlot(slotIdx, null, null);
                                  if (overlayLogoUrl === browserUrl) {
                                    const fallback = businessLogoStoragePaths.find((p, i) => i !== slotIdx && p);
                                    if (fallback) {
                                      const fbUrl = fallback.startsWith("/objects/")
                                        ? `${BASE}/api/storage/objects/${fallback.slice("/objects/".length)}`
                                        : fallback;
                                      setOverlayLogoUrl(fbUrl);
                                      setOverlayLogoPath(fallback);
                                    } else {
                                      setOverlayLogoUrl("");
                                      setOverlayLogoPath("");
                                    }
                                  }
                                }}
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-[9px] text-white/70 hover:bg-red-500/80 hover:text-white transition-all"
                                title="Quitar logo"
                              >×</button>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                              <span className="text-[9px] text-muted-foreground mt-0.5">Subir</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              e.target.value = "";
                              try {
                                const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
                                  method: "POST",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: file.name, contentType: file.type }),
                                });
                                if (!urlRes.ok) throw new Error("upload-url");
                                const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
                                const uploadRes = await fetch(uploadURL, {
                                  method: "PUT",
                                  headers: { "Content-Type": file.type },
                                  body: file,
                                });
                                if (!uploadRes.ok) throw new Error("upload");
                                const newBrowserUrl = objectPath.startsWith("/objects/")
                                  ? `${BASE}/api/storage/objects/${objectPath.slice("/objects/".length)}`
                                  : objectPath;
                                await saveLogoSlot(slotIdx, objectPath, newBrowserUrl);
                                setOverlayLogoUrl(newBrowserUrl);
                                setOverlayLogoPath(objectPath);
                              } catch {
                                toast({ title: "Error", description: "No se pudo subir el logo.", variant: "destructive" });
                              }
                            }}
                          />
                        </label>
                        {browserUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setOverlayLogoUrl(browserUrl);
                              setOverlayLogoPath(storagePath ?? "");
                            }}
                            className={`text-[9px] text-center transition-colors ${isActive ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {isActive ? "✓ Activo" : "Usar"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Colores de marca + Firma ── */}
              <div className="space-y-3 rounded-xl border border-border/40 p-3 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground/80">Colores de marca</p>
                  {autoSaveStatus === "saved" && (
                    <span className="text-[10px] text-green-400/80 font-medium transition-opacity">✓ Preferencias guardadas</span>
                  )}
                  {autoSaveStatus === "saving" && (
                    <span className="text-[10px] text-muted-foreground animate-pulse">Guardando…</span>
                  )}
                </div>

                {/* Color pickers row */}
                <div className="flex gap-3">
                  {/* titleColor1 */}
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1">Color principal del texto</label>
                    <div className="flex items-center gap-1.5 h-9 rounded-lg border border-border/50 bg-black/40 px-2">
                      <input
                        type="color"
                        value={titleColor1}
                        onChange={e => setTitleColor1(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent flex-shrink-0"
                        title="Color principal"
                      />
                      <input
                        type="text"
                        value={titleColor1}
                        onChange={e => {
                          const v = e.target.value.trim();
                          setTitleColor1(v);
                        }}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (/^#[0-9A-Fa-f]{6}$/.test(v)) setTitleColor1(v);
                          else setTitleColor1(titleColor1);
                        }}
                        maxLength={7}
                        placeholder="#FFFFFF"
                        className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-muted-foreground uppercase focus:text-foreground focus:outline-none"
                      />
                    </div>
                  </div>
                  {/* titleColor2 */}
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1">Color de acento / degradado</label>
                    <div className="flex items-center gap-1.5 h-9 rounded-lg border border-border/50 bg-black/40 px-2">
                      <input
                        type="color"
                        value={titleColor2}
                        onChange={e => setTitleColor2(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent flex-shrink-0"
                        title="Color secundario"
                      />
                      <input
                        type="text"
                        value={titleColor2}
                        onChange={e => {
                          const v = e.target.value.trim();
                          setTitleColor2(v);
                        }}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (/^#[0-9A-Fa-f]{6}$/.test(v)) setTitleColor2(v);
                          else setTitleColor2(titleColor2);
                        }}
                        maxLength={7}
                        placeholder="#0077FF"
                        className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-muted-foreground uppercase focus:text-foreground focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Firma */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] text-muted-foreground">Firma en la imagen</label>
                    <button
                      type="button"
                      onClick={() => setShowSignature(v => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showSignature ? "bg-primary" : "bg-border/60"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${showSignature ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                  {showSignature && (
                    <input
                      type="text"
                      value={signatureText}
                      onChange={e => setSignatureText(e.target.value)}
                      placeholder="Ej. Cali, Colombia"
                      className="w-full h-9 rounded-lg border border-border/50 bg-black/40 px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  )}
                </div>
              </div>

              {/* Custom headline */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Titular personalizado en la imagen</p>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const activeVariant = (currentPostFull?.imageVariants ?? []).find((v: any) => v.id === selectedVariant) ?? (currentPostFull?.imageVariants ?? [])[0];
                      const hook = activeVariant?.overlayCaptionHook;
                      return hook ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px] text-muted-foreground hover:bg-muted gap-1"
                          onClick={() => { setCustomHeadline(hook); setSpellResult(null); setHeadlineSuggestions([]); }}
                          title="Usar el titular que tiene la imagen activa"
                        >
                          <Copy className="w-3 h-3" />
                          Usar título actual
                        </Button>
                      ) : null;
                    })()}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1"
                    disabled={isLoadingHeadlines || !currentPost?.caption?.trim()}
                    onClick={async () => {
                      if (!currentPost?.id) return;
                      setIsLoadingHeadlines(true);
                      setHeadlineSuggestions([]);
                      try {
                        const res = await fetch(`${BASE}/api/posts/${currentPost.id}/suggest-headlines`, { method: "POST" });
                        const data = await res.json() as { headlines?: string[]; error?: string };
                        if (data.headlines?.length) setHeadlineSuggestions(data.headlines);
                      } finally {
                        setIsLoadingHeadlines(false);
                      }
                    }}
                  >
                    {isLoadingHeadlines
                      ? <RefreshCw className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />
                    }
                    {isLoadingHeadlines ? "Generando..." : "Sugerir titulares"}
                  </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mb-2">Escribe el texto exacto que quieres que aparezca como headline — deja vacío para usar el titular del caption.</p>

                {/* AI headline suggestions */}
                {headlineSuggestions.length > 0 && (
                  <div className="mb-2 space-y-1">
                    <p className="text-[10px] text-primary/70 font-medium mb-1.5">Haz clic para usar un titular:</p>
                    <div className="flex flex-col gap-1.5">
                      {headlineSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { setCustomHeadline(s); setSpellResult(null); setHeadlineSuggestions([]); }}
                          className="text-left w-full px-3 py-2 rounded-md border border-primary/30 bg-primary/5 hover:bg-primary/15 hover:border-primary/60 transition-colors text-[11px] font-bold uppercase tracking-wide text-foreground/90"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setHeadlineSuggestions([])}
                      className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground mt-0.5"
                    >
                      Cerrar sugerencias
                    </button>
                  </div>
                )}

                <div className="relative">
                  <Input
                    value={customHeadline}
                    onChange={e => { setCustomHeadline(e.target.value); setSpellResult(null); }}
                    placeholder='Ej: "¿CUÁNTO PAGAS DE ENERGÍA? TE BAJAMOS EL 20%"'
                    className={`bg-black/40 border-border/50 text-sm font-semibold uppercase tracking-wide pr-8 ${spellResult?.hasErrors ? "border-yellow-500/70" : ""}`}
                    maxLength={80}
                  />
                  {isCheckingSpell && (
                    <RefreshCw className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
                  )}
                  {spellResult && !isCheckingSpell && !spellResult.hasErrors && customHeadline.trim() && (
                    <CheckCircle className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-500" />
                  )}
                  {spellResult?.hasErrors && !isCheckingSpell && (
                    <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-yellow-400" />
                  )}
                </div>

                {/* Spell check warning */}
                {spellResult?.hasErrors && (
                  <div className="mt-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-yellow-300 mb-0.5">Error ortográfico detectado</p>
                        <p className="text-[11px] text-yellow-200/80">{spellResult.explanation}</p>
                        <p className="text-[11px] text-white font-semibold mt-1.5 uppercase tracking-wide">
                          Sugerencia: &ldquo;{spellResult.corrected}&rdquo;
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-[11px] border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/20"
                        onClick={() => { headlineJustCorrectedRef.current = true; setCustomHeadline(spellResult.corrected); setSpellResult({ hasErrors: false, corrected: spellResult.corrected, explanation: "" }); }}
                      >
                        ✓ Aplicar corrección
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 h-7 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => setSpellResult({ ...spellResult, hasErrors: false })}
                      >
                        Ignorar y continuar
                      </Button>
                    </div>
                  </div>
                )}

                {customHeadline.trim() && !spellResult?.hasErrors && !isCheckingSpell && (
                  <p className="text-[10px] text-secondary mt-1">✓ La próxima imagen usará este titular personalizado</p>
                )}
              </div>

              {/* Custom instruction — primary image control */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5" />
                  Describe la imagen que quieres
                </p>
                <Textarea
                  value={imageInstruction}
                  onChange={e => setImageInstruction(e.target.value)}
                  placeholder='Ej: "familia feliz en piscina con paneles en el techo", "oficina moderna con cargadores EV en el parqueadero", "jacuzzi exterior con paneles solares al fondo"...'
                  className="min-h-[80px] bg-black/40 border-primary/20 text-sm resize-none placeholder:text-white/30"
                />
                {imageInstruction.trim() && (
                  <p className="text-[10px] text-primary/80">✓ La IA seguirá esta descripción exactamente al generar la imagen</p>
                )}

                {/* Reference image upload — prominent style guide for DALL-E */}
                <div className="mt-1">
                  <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    Imagen de referencia <span className="normal-case font-normal text-white/35">(opcional)</span>
                  </p>
                  {referenceImagePreview ? (
                    <div className="rounded-lg border-2 border-secondary/60 bg-secondary/10 p-3 flex items-start gap-3">
                      <img
                        src={referenceImagePreview}
                        alt="Imagen de referencia"
                        className="w-16 h-16 rounded-md object-cover shrink-0 border-2 border-secondary/50 shadow-lg"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-0.5">✓ Referencia cargada</p>
                        <p className="text-[10px] text-white/60 leading-relaxed">La IA analizará el estilo, colores y composición de esta imagen para replicarlos.</p>
                        <button
                          onClick={() => { setReferenceImageBase64(""); setReferenceImagePreview(""); }}
                          className="mt-1.5 text-[10px] text-red-400/70 hover:text-red-400 transition-colors flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> Quitar imagen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => refImageInputRef.current?.click()}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-white/20 hover:border-secondary/60 hover:bg-secondary/5 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-md bg-white/5 group-hover:bg-secondary/10 border border-white/10 group-hover:border-secondary/40 flex items-center justify-center shrink-0 transition-all">
                        <ImageIcon className="w-5 h-5 text-white/30 group-hover:text-secondary/80 transition-colors" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-semibold text-white/60 group-hover:text-white/90 transition-colors">Subir imagen de referencia</p>
                        <p className="text-[10px] text-white/35 group-hover:text-white/50 transition-colors">La IA copiará el estilo, colores y composición</p>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Generate button — blocked when there's an unresolved spell error */}
              {spellResult?.hasErrors ? (
                <div className="space-y-2">
                  <Button
                    disabled
                    className="w-full bg-yellow-500/10 text-yellow-400/60 border border-yellow-500/30 cursor-not-allowed"
                    variant="outline"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Corrige el titular antes de generar
                  </Button>
                  <p className="text-[10px] text-yellow-400/70 text-center">
                    Aplica la corrección o haz clic en "Ignorar y continuar" para forzar.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Library background banner — AI-generated bg from /backgrounds */}
                  {libraryBg && (
                    <div className="flex items-center gap-2.5 p-2 rounded-lg border border-primary/40 bg-primary/8">
                      <img
                        src={`data:image/jpeg;base64,${libraryBg.rawBackground}`}
                        alt="Fondo de biblioteca"
                        className="w-10 h-10 rounded object-cover shrink-0 border border-primary/30"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wide">Fondo de biblioteca listo</p>
                        <p className="text-[9px] text-muted-foreground truncate">{libraryBg.prompt?.slice(0, 60) || libraryBg.style}</p>
                      </div>
                      <button onClick={() => setLibraryBg(null)} className="text-muted-foreground hover:text-foreground text-xs p-1">✕</button>
                    </div>
                  )}
                  {/* Real photo banner — media item from /backgrounds */}
                  {libraryMedia && (
                    <div className="flex items-center gap-2.5 p-2 rounded-lg border border-secondary/40 bg-secondary/8">
                      <img
                        src={`data:${libraryMedia.mimeType};base64,${libraryMedia.data}`}
                        alt="Foto real"
                        className="w-10 h-10 rounded object-cover shrink-0 border border-secondary/30"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-secondary uppercase tracking-wide">Foto real lista</p>
                        <p className="text-[9px] text-muted-foreground truncate">{libraryMedia.label || libraryMedia.filename}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleRotateLibraryMedia(-90)}
                          disabled={isRotatingLibraryMedia}
                          className="text-muted-foreground hover:text-secondary p-1 rounded hover:bg-secondary/10 transition-colors"
                          title="Rotar 90° a la izquierda"
                        >
                          {isRotatingLibraryMedia ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleRotateLibraryMedia(90)}
                          disabled={isRotatingLibraryMedia}
                          className="text-muted-foreground hover:text-secondary p-1 rounded hover:bg-secondary/10 transition-colors"
                          title="Rotar 90° a la derecha"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setLibraryMedia(null); setIsLibraryMediaRotated(false); }} className="text-muted-foreground hover:text-foreground text-xs p-1">✕</button>
                      </div>
                    </div>
                  )}
                  {/* ── Fila 1: acciones primarias — siempre visibles ── */}
                  <div className="flex gap-2">
                    {/* Priority: real photo > library bg > same bg > placeholder */}
                    {libraryMedia ? (
                      <Button
                        onClick={async () => {
                          if (!libraryMedia) return;
                          // If the photo was rotated locally, persist the rotated version to DB first
                          // so the backend fetches the correct orientation when applying overlays.
                          if (isLibraryMediaRotated) {
                            try {
                              const patchResp = await fetch(`${BASE}/api/media/${libraryMedia.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ data: libraryMedia.data }),
                              });
                              if (patchResp.ok) {
                                setIsLibraryMediaRotated(false);
                              } else {
                                toast({
                                  title: "Advertencia",
                                  description: "No se pudo guardar la rotación. La imagen se generará, pero puede aparecer sin la rotación aplicada.",
                                  variant: "destructive",
                                });
                                return; // Do not generate with wrong orientation
                              }
                            } catch {
                              toast({
                                title: "Advertencia",
                                description: "Error de red al guardar la rotación. Inténtalo de nuevo.",
                                variant: "destructive",
                              });
                              return;
                            }
                          }
                          handleGenerateNewVariant(undefined, undefined, undefined, undefined, libraryMedia.id);
                        }}
                        disabled={generateImageVariant.isPending || isCheckingSpell}
                        className="flex-1 bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/40"
                        variant="outline"
                        title="Aplica tipografía y logo del negocio sobre la foto real subida — sin DALL-E"
                      >
                        {generateImageVariant.isPending
                          ? <RefreshCw className="w-4 h-4 animate-spin" />
                          : <><Camera className="w-4 h-4 mr-1.5" />Usar foto real</>
                        }
                      </Button>
                    ) : libraryBg ? (
                      <Button
                        onClick={() => handleGenerateNewVariant(undefined, undefined, undefined, libraryBg.id)}
                        disabled={generateImageVariant.isPending || isCheckingSpell}
                        className="flex-1 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/40"
                        variant="outline"
                        title="Aplica texto y logo sobre el fondo de la biblioteca — sin costo DALL-E"
                      >
                        {generateImageVariant.isPending
                          ? <RefreshCw className="w-4 h-4 animate-spin" />
                          : <><BookImage className="w-4 h-4 mr-1.5" />Usar biblioteca</>
                        }
                      </Button>
                    ) : activeImage?.rawBackground ? (
                      <Button
                        onClick={() => handleGenerateNewVariant(undefined, undefined, activeImage.id)}
                        disabled={generateImageVariant.isPending || isCheckingSpell}
                        className="flex-1 bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/30"
                        variant="outline"
                        title="Aplica los cambios de letra/logo sobre el mismo fondo sin generar nueva imagen"
                      >
                        {generateImageVariant.isPending
                          ? <RefreshCw className="w-4 h-4 animate-spin" />
                          : <><ImageIcon className="w-4 h-4 mr-1.5" />Mismo fondo</>
                        }
                      </Button>
                    ) : activeImage ? (
                      <div className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-white/40 leading-tight">
                        <ImageIcon className="w-3.5 h-3.5 shrink-0 opacity-50" />
                        <span>Genera "Nueva imagen" primero para activar "Mismo fondo"</span>
                      </div>
                    ) : null}
                    {/* Upload own photo as background — skips DALL-E entirely */}
                    <Button
                      onClick={() => bgUploadRef.current?.click()}
                      disabled={generateImageVariant.isPending || isUploadingDirectBg}
                      className="flex-1 bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/30"
                      variant="outline"
                      title="Sube una foto propia para usarla como fondo — sin DALL-E"
                    >
                      {isUploadingDirectBg
                        ? <><RefreshCw className="w-4 h-4 animate-spin mr-1.5" />Subiendo...</>
                        : <><Upload className="w-4 h-4 mr-1.5" />Subir foto</>
                      }
                    </Button>
                    {/* Generate brand-new DALL-E image — always visible in row 1 */}
                    <Button
                      onClick={() => {
                        setPendingVariantInstruction(imageInstruction || undefined);
                        setVariantWarningOpen(true);
                      }}
                      disabled={generateImageVariant.isPending || isCheckingSpell || isConvertingRefImage}
                      className="flex-1 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                      variant="outline"
                    >
                      {generateImageVariant.isPending
                        ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generando...</>
                        : isCheckingSpell
                        ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Verificando...</>
                        : isConvertingRefImage
                        ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Procesando imagen...</>
                        : <><Sparkles className="w-4 h-4 mr-1.5" />Crear imagen</>
                      }
                    </Button>
                  </div>
                  {/* ── Fila 2: bibliotecas ── */}
                  <div className="flex gap-2">
                    {/* Background library picker button */}
                    <Button
                      onClick={() => { setBgDrawerOpen(true); fetchBgItems(true); }}
                      disabled={generateImageVariant.isPending}
                      variant="outline"
                      className="flex-1 gap-1.5 border-border/30 text-muted-foreground hover:text-primary hover:border-primary/40"
                      title="Biblioteca de fondos IA — elige un fondo ya generado sin logo ni texto"
                    >
                      <Layers className="w-4 h-4" />
                      Biblioteca de fondos
                    </Button>
                    {/* Element library button — opens IA+Elemento generation panel */}
                    <Button
                      onClick={() => {
                        const bizId = activeBusinessIdRef.current;
                        setShowElemLibraryPanel(v => {
                          if (!v && bizId) fetchBizElements(bizId);
                          return !v;
                        });
                        setShowElementsPanel(false);
                        setElemLibSelectedId(null);
                      }}
                      disabled={generateImageVariant.isPending}
                      variant="outline"
                      className={`flex-1 gap-1.5 border-border/30 transition-colors ${showElemLibraryPanel ? "text-fuchsia-400 border-fuchsia-500/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/15" : "text-muted-foreground hover:text-fuchsia-400 hover:border-fuchsia-500/40"}`}
                      title="Biblioteca de elementos — integra un elemento de tu marca con IA"
                    >
                      <Sparkles className="w-4 h-4" />
                      Biblioteca de elementos
                    </Button>
                  </div>
                  {/* Rotation controls for any image variant with a stored rawBackground (images only, not videos) */}
                  {activeImage?.rawBackground && !activeImage?.mimeType?.startsWith("video/") && !libraryMedia && (
                    <div className="flex items-center gap-2 justify-center py-1">
                      <span className="text-[10px] text-muted-foreground/60">Rotar imagen:</span>
                      <button
                        onClick={() => handleRotateVariant(-90)}
                        disabled={isRotatingVariant}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-secondary px-2 py-1 rounded border border-border/30 hover:border-secondary/40 bg-white/5 hover:bg-secondary/10 transition-colors disabled:opacity-50"
                        title="Rotar 90° a la izquierda"
                      >
                        {isRotatingVariant ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        <span>90° izq</span>
                      </button>
                      <button
                        onClick={() => handleRotateVariant(90)}
                        disabled={isRotatingVariant}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-secondary px-2 py-1 rounded border border-border/30 hover:border-secondary/40 bg-white/5 hover:bg-secondary/10 transition-colors disabled:opacity-50"
                        title="Rotar 90° a la derecha"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>90° der</span>
                      </button>
                      <button
                        onClick={() => handleRotateVariant(180)}
                        disabled={isRotatingVariant}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-secondary px-2 py-1 rounded border border-border/30 hover:border-secondary/40 bg-white/5 hover:bg-secondary/10 transition-colors disabled:opacity-50"
                        title="Rotar 180°"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>180°</span>
                      </button>
                    </div>
                  )}
                  {/* ─── Composition Elements Panel ─── */}
                  {activeImage?.rawBackground && !activeImage?.mimeType?.startsWith("video/") && !libraryMedia && selectedVariant > 0 && (
                    <div className="border border-border/25 rounded-lg overflow-hidden mt-1">
                      <button
                        onClick={() => {
                          const bizId = activeBusinessIdRef.current;
                          setShowElementsPanel(v => {
                            if (!v && bizId) fetchBizElements(bizId);
                            return !v;
                          });
                          setShowElemLibraryPanel(false);
                          setElemLibSelectedId(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                          Superponer elemento (overlay)
                          {activeElementLayers.length > 0 && (
                            <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${activeElementLayers.length >= 5 ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"}`}>{activeElementLayers.length}/5</span>
                          )}
                        </span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showElementsPanel ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9"/></svg>
                      </button>

                      {showElementsPanel && (
                        <div className="px-3 pb-3 space-y-3 border-t border-border/20">
                          {/* Layer toggles: logo + text */}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => setCompLogoEnabled(v => !v)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] transition-all ${compLogoEnabled ? "border-primary/50 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground/50 line-through"}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
                              Logo
                            </button>
                            <button
                              onClick={() => setCompTextEnabled(v => !v)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] transition-all ${compTextEnabled ? "border-primary/50 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground/50 line-through"}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
                              Texto
                            </button>
                          </div>
                          {bizElementsLoading ? (
                            <div className="flex items-center justify-center py-4 gap-2 text-[11px] text-muted-foreground">
                              <RefreshCw className="w-3 h-3 animate-spin" />Cargando elementos…
                            </div>
                          ) : bizElements.length === 0 ? (
                            /* ── Empty state: upload widget inline ── */
                            <div className="space-y-2 py-2">
                              <p className="text-[10px] text-muted-foreground/60 text-center">
                                Sube tu primer elemento de marca (PNG recomendado con fondo transparente)
                              </p>
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <span className="flex-1 truncate text-[10px] text-muted-foreground/70 bg-white/5 border border-border/30 rounded px-2 py-1.5">
                                  {elUploadFile ? elUploadFile.name : "Elegir imagen…"}
                                </span>
                                <span className="text-[10px] px-2 py-1.5 rounded border border-border/40 bg-white/5 hover:bg-white/10 text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                                  Buscar
                                </span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    setElUploadFile(f);
                                    setElUploadPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
                                    setElUploadName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                              {elUploadPreview && (
                                <img src={elUploadPreview} alt="Vista previa" className="w-12 h-12 object-contain rounded border border-border/30 bg-white/5 flex-shrink-0" />
                              )}
                              {elUploadFile && (
                                <input
                                  type="text"
                                  value={elUploadName}
                                  onChange={e => setElUploadName(e.target.value.slice(0, 60))}
                                  placeholder="Nombre del elemento"
                                  className="w-full text-[10px] bg-white/5 border border-border/30 rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                                />
                              )}
                              <button
                                onClick={handleElementUploadApproval}
                                disabled={!elUploadFile || !elUploadName.trim() || elUploading}
                                className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1.5 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {elUploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>}
                                {elUploading ? "Subiendo…" : "Subir elemento"}
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap gap-2 pt-2">
                                {bizElements.map(el => {
                                  const inLayer = activeElementLayers.some(l => l.elementId === el.id);
                                  const isDeleting = elDeletingId === el.id;
                                  return (
                                    <div key={el.id} className="relative group/el">
                                      {/* Main toggle button */}
                                      <button
                                        title={el.name}
                                        disabled={isDeleting}
                                        onClick={() => {
                                          if (inLayer) {
                                            setActiveElementLayers(prev => prev.filter(l => l.elementId !== el.id));
                                          } else if (activeElementLayers.length < 5) {
                                            setActiveElementLayers(prev => [...prev, { elementId: el.id, position: "bottom-right", sizePercent: 25 }]);
                                          } else {
                                            toast({ title: "Límite alcanzado", description: "Máximo 5 elementos por imagen. Quita uno para agregar otro.", variant: "destructive" });
                                          }
                                        }}
                                        className={`relative w-12 h-12 rounded-md border-2 overflow-hidden transition-all ${isDeleting ? "opacity-40" : ""} ${inLayer ? "border-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]" : "border-border/30 hover:border-border/60"}`}
                                      >
                                        {el.thumbUrl ? (
                                          <img src={el.thumbUrl} alt={el.name} className="w-full h-full object-contain bg-white/5" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center bg-white/5 text-[8px] text-muted-foreground px-0.5 text-center leading-tight">{el.name.slice(0, 8)}</div>
                                        )}
                                        {inLayer && (
                                          <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                          </div>
                                        )}
                                      </button>
                                      {/* Delete button — appears on hover */}
                                      <button
                                        title="Eliminar elemento"
                                        onClick={e => { e.stopPropagation(); handleDeleteElement(el.id); }}
                                        disabled={isDeleting}
                                        className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-destructive/80 hover:bg-destructive text-white flex items-center justify-center opacity-0 group-hover/el:opacity-100 transition-opacity z-10 disabled:cursor-not-allowed"
                                      >
                                        {isDeleting
                                          ? <RefreshCw className="w-2 h-2 animate-spin" />
                                          : <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                        }
                                      </button>
                                      {/* Rename button — appears on hover */}
                                      <button
                                        title="Renombrar elemento"
                                        onClick={e => { e.stopPropagation(); setElRenamingId(el.id); setElRenameValue(el.name); }}
                                        className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-full bg-background/90 border border-border/50 hover:border-primary/50 text-muted-foreground hover:text-primary flex items-center justify-center opacity-0 group-hover/el:opacity-100 transition-opacity z-10"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Rename inline input */}
                              {elRenamingId !== null && (
                                <div className="flex items-center gap-1.5 mt-1 border border-border/20 rounded p-1.5">
                                  <span className="text-[9px] text-muted-foreground/60 shrink-0">Nombre:</span>
                                  <input
                                    type="text"
                                    value={elRenameValue}
                                    onChange={e => setElRenameValue(e.target.value.slice(0, 100))}
                                    autoFocus
                                    className="flex-1 text-[10px] bg-white/5 border border-border/30 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary/50"
                                    onKeyDown={e => {
                                      if (e.key === "Enter") handleRenameElement(elRenamingId, elRenameValue);
                                      if (e.key === "Escape") setElRenamingId(null);
                                    }}
                                  />
                                  <button
                                    onClick={() => handleRenameElement(elRenamingId, elRenameValue)}
                                    disabled={!elRenameValue.trim()}
                                    className="text-[9px] px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                                  >
                                    OK
                                  </button>
                                  <button
                                    onClick={() => setElRenamingId(null)}
                                    className="text-[9px] px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}

                              {/* ── Inline upload: add more elements ── */}
                              {!showElUploadWidget ? (
                                <button
                                  onClick={() => setShowElUploadWidget(true)}
                                  className="flex items-center gap-1 text-[9px] text-muted-foreground/60 hover:text-primary transition-colors py-0.5"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                                  Subir elemento
                                </button>
                              ) : (
                                <div className="space-y-1.5 border border-border/20 rounded p-2">
                                  <label className="flex items-center gap-2 cursor-pointer group">
                                    <span className="flex-1 truncate text-[10px] text-muted-foreground/70 bg-white/5 border border-border/30 rounded px-2 py-1">
                                      {elUploadFile ? elUploadFile.name : "Elegir imagen…"}
                                    </span>
                                    <span className="text-[10px] px-2 py-1 rounded border border-border/40 bg-white/5 hover:bg-white/10 text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                                      Buscar
                                    </span>
                                    <input
                                      type="file"
                                      accept="image/png,image/jpeg,image/webp"
                                      className="hidden"
                                      onChange={e => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        setElUploadFile(f);
                                        setElUploadPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
                                        setElUploadName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                  {elUploadPreview && (
                                    <img src={elUploadPreview} alt="Vista previa" className="w-12 h-12 object-contain rounded border border-border/30 bg-white/5 flex-shrink-0" />
                                  )}
                                  {elUploadFile && (
                                    <input
                                      type="text"
                                      value={elUploadName}
                                      onChange={e => setElUploadName(e.target.value.slice(0, 60))}
                                      placeholder="Nombre del elemento"
                                      className="w-full text-[10px] bg-white/5 border border-border/30 rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                                    />
                                  )}
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={handleElementUploadApproval}
                                      disabled={!elUploadFile || !elUploadName.trim() || elUploading}
                                      className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      {elUploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                                      {elUploading ? "Subiendo…" : "Subir"}
                                    </button>
                                    <button
                                      onClick={() => { setShowElUploadWidget(false); setElUploadFile(null); setElUploadPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); setElUploadName(""); }}
                                      className="text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Preset controls */}
                              {compPresets.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] text-muted-foreground/60 shrink-0">Presets:</span>
                                  {compPresets.map(p => (
                                    <span key={p.id} className="flex items-center gap-0.5">
                                      <button
                                        onClick={() => {
                                          setActiveElementLayers(Array.isArray(p.configJson?.elements) ? p.configJson.elements : []);
                                          if (p.configJson?.logo !== undefined) setCompLogoEnabled(p.configJson.logo.enabled ?? true);
                                          if (p.configJson?.text !== undefined) setCompTextEnabled(p.configJson.text.enabled ?? true);
                                        }}
                                        className={`text-[9px] px-2 py-0.5 rounded-l border transition-colors ${p.isDefault ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:border-primary/30 hover:text-primary"}`}
                                      >
                                        {p.name}
                                      </button>
                                      <button
                                        title={p.isDefault ? "Predeterminado actual" : "Marcar como predeterminado"}
                                        onClick={async () => {
                                          const resp = await fetch(`${BASE}/api/composition-presets/${p.id}/set-default`, { method: "POST", credentials: "include" });
                                          if (resp.ok) {
                                            setCompPresets(prev => prev.map(x => ({ ...x, isDefault: x.id === p.id })));
                                          }
                                        }}
                                        className={`text-[10px] px-1 py-0.5 rounded-r border-y border-r transition-colors ${p.isDefault ? "border-primary/40 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground/40 hover:text-amber-400"}`}
                                      >
                                        ★
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Save as preset */}
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={newPresetName}
                                  onChange={e => setNewPresetName(e.target.value)}
                                  placeholder="Nombre del preset…"
                                  className="flex-1 text-[9px] bg-background/80 border border-border/30 rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/40"
                                />
                                <button
                                  disabled={!newPresetName.trim() || savingPreset}
                                  onClick={async () => {
                                    const bizId = activeBusinessIdRef.current;
                                    if (!bizId || !newPresetName.trim()) return;
                                    setSavingPreset(true);
                                    try {
                                      const resp = await fetch(`${BASE}/api/composition-presets`, {
                                        method: "POST",
                                        credentials: "include",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ businessId: bizId, name: newPresetName.trim(), configJson: { logo: { enabled: compLogoEnabled }, text: { enabled: compTextEnabled }, elements: activeElementLayers } }),
                                      });
                                      if (resp.ok) {
                                        const d = await resp.json();
                                        setCompPresets(prev => [...prev, d.preset]);
                                        setNewPresetName("");
                                        toast({ title: "Preset guardado", description: `"${newPresetName.trim()}" guardado correctamente.` });
                                      }
                                    } catch {}
                                    finally { setSavingPreset(false); }
                                  }}
                                  className="text-[9px] px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors disabled:opacity-40 shrink-0"
                                >
                                  {savingPreset ? "…" : "Guardar"}
                                </button>
                              </div>

                              {activeElementLayers.length > 0 && (
                                <div className="space-y-2">
                                  {activeElementLayers.map((layer, idx) => {
                                    const el = bizElements.find(e => e.id === layer.elementId);
                                    return (
                                      <div key={layer.elementId} className="bg-white/5 rounded-md p-2 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[100px]">{el?.name ?? `#${layer.elementId}`}</span>
                                          <button
                                            onClick={() => setActiveElementLayers(prev => prev.filter((_, i) => i !== idx))}
                                            className="text-[9px] text-destructive/60 hover:text-destructive transition-colors"
                                          >✕</button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] text-muted-foreground/60 w-12 shrink-0">Posición</span>
                                          <select
                                            value={layer.position}
                                            onChange={e => setActiveElementLayers(prev => prev.map((l, i) => i === idx ? { ...l, position: e.target.value } : l))}
                                            className="flex-1 text-[9px] bg-background/80 border border-border/30 rounded px-1 py-0.5 text-foreground"
                                          >
                                            {["top-left","top-center","top-right","center-left","center","center-right","bottom-left","bottom-center","bottom-right"].map(p => (
                                              <option key={p} value={p}>{p}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] text-muted-foreground/60 w-12 shrink-0">Tamaño</span>
                                          <input
                                            type="range"
                                            min={10}
                                            max={60}
                                            value={layer.sizePercent}
                                            onChange={e => setActiveElementLayers(prev => prev.map((l, i) => i === idx ? { ...l, sizePercent: Number(e.target.value) } : l))}
                                            className="flex-1 accent-primary"
                                          />
                                          <span className="text-[9px] text-muted-foreground/60 w-7 text-right">{layer.sizePercent}%</span>
                                        </div>
                                      </div>
                                    );
                                  })}


                                  <button
                                    disabled={applyingElements}
                                    onClick={async () => {
                                      if (!selectedVariant || !currentPost?.id) return;
                                      setApplyingElements(true);
                                      try {
                                        const resp = await fetch(
                                          `${BASE}/api/posts/${currentPost.id}/variants/${selectedVariant}/apply-elements`,
                                          {
                                            method: "PATCH",
                                            credentials: "include",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ elements: activeElementLayers, skipLogo: !compLogoEnabled, skipText: !compTextEnabled }),
                                          }
                                        );
                                        if (resp.ok) {
                                          await queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
                                          toast({ title: "✅ Capas aplicadas", description: "La imagen fue recompuesta con los elementos seleccionados." });
                                          setActiveElementLayers([]);
                                          setShowElementsPanel(false);
                                        } else {
                                          const err = await resp.json().catch(() => ({}));
                                          toast({ title: "Error", description: err.error ?? "No se pudieron aplicar las capas", variant: "destructive" });
                                        }
                                      } catch {
                                        toast({ title: "Error de red", description: "No se pudo conectar con el servidor", variant: "destructive" });
                                      } finally {
                                        setApplyingElements(false);
                                      }
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded-md bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 transition-colors disabled:opacity-50"
                                  >
                                    {applyingElements
                                      ? <><RefreshCw className="w-3 h-3 animate-spin" />Aplicando…</>
                                      : <><Layers className="w-3 h-3" />Aplicar capas</>
                                    }
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── Biblioteca de elementos panel (IA+Elemento generation) ─── */}
                  {showElemLibraryPanel && currentPost && (
                    <div className="border border-fuchsia-500/20 rounded-lg overflow-hidden mt-1">
                      <div className="flex items-center justify-between px-3 py-2 bg-fuchsia-500/5 border-b border-fuchsia-500/15">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-fuchsia-300">
                          <Sparkles className="w-3 h-3" />
                          Biblioteca de elementos — IA integra el elemento
                        </span>
                        <button
                          onClick={() => { setShowElemLibraryPanel(false); setElemLibSelectedId(null); }}
                          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="px-3 pb-3 space-y-3">
                        <p className="text-[10px] text-muted-foreground/60 pt-2 leading-relaxed">
                          Selecciona un elemento de tu biblioteca y la IA generará una nueva imagen con ese elemento integrado en la escena{(plansData as { creditCosts?: { elementAi?: number; image?: number } } | undefined)?.creditCosts?.elementAi != null ? (<> (<span className="text-fuchsia-400 font-medium">{((plansData as { creditCosts?: { elementAi?: number; image?: number } })?.creditCosts?.elementAi ?? 0) + ((plansData as { creditCosts?: { image?: number } })?.creditCosts?.image ?? 1)} créditos</span>)</>) : ""}.
                        </p>

                        {bizElementsLoading ? (
                          <div className="flex items-center justify-center py-4 gap-2 text-[11px] text-muted-foreground">
                            <RefreshCw className="w-3 h-3 animate-spin" />Cargando elementos…
                          </div>
                        ) : bizElements.length === 0 ? (
                          <div className="space-y-2 py-2">
                            <p className="text-[10px] text-muted-foreground/60 text-center">
                              Sin elementos en la biblioteca. Sube tu primer elemento (PNG con fondo transparente recomendado).
                            </p>
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <span className="flex-1 truncate text-[10px] text-muted-foreground/70 bg-white/5 border border-border/30 rounded px-2 py-1.5">
                                {elUploadFile ? elUploadFile.name : "Elegir imagen…"}
                              </span>
                              <span className="text-[10px] px-2 py-1.5 rounded border border-border/40 bg-white/5 hover:bg-white/10 text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">Buscar</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  setElUploadFile(f);
                                  setElUploadPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
                                  setElUploadName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            {elUploadPreview && (
                              <img src={elUploadPreview} alt="Vista previa" className="w-12 h-12 object-contain rounded border border-border/30 bg-white/5" />
                            )}
                            {elUploadFile && (
                              <input
                                type="text"
                                value={elUploadName}
                                onChange={e => setElUploadName(e.target.value.slice(0, 60))}
                                placeholder="Nombre del elemento"
                                className="w-full text-[10px] bg-white/5 border border-border/30 rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                              />
                            )}
                            <button
                              onClick={handleElementUploadApproval}
                              disabled={!elUploadFile || !elUploadName.trim() || elUploading}
                              className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1.5 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {elUploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                              {elUploading ? "Subiendo…" : "Subir elemento"}
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Elements grid — select one for IA generation */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {bizElements.map(el => {
                                const isSelected = elemLibSelectedId === el.id;
                                const isDeleting = elDeletingId === el.id;
                                const isPending = el.analysisStatus === "pending";
                                return (
                                  <div key={el.id} className="relative group/ell">
                                    <button
                                      title={isPending ? `${el.name} — analizando…` : el.name}
                                      disabled={isDeleting || generatingElementAi}
                                      onClick={() => setElemLibSelectedId(isSelected ? null : el.id)}
                                      className={`relative w-12 h-12 rounded-md border-2 overflow-hidden transition-all ${isDeleting ? "opacity-40" : ""} ${
                                        isSelected
                                          ? "border-fuchsia-500/70 shadow-[0_0_8px_rgba(217,70,219,0.35)]"
                                          : "border-border/30 hover:border-border/60"
                                      }`}
                                    >
                                      {el.thumbUrl ? (
                                        <img src={el.thumbUrl} alt={el.name} className="w-full h-full object-contain bg-white/5" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5 text-[8px] text-muted-foreground px-0.5 text-center leading-tight">{el.name.slice(0, 8)}</div>
                                      )}
                                      {isSelected && (
                                        <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-fuchsia-500 rounded-full flex items-center justify-center">
                                          <svg xmlns="http://www.w3.org/2000/svg" width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                        </div>
                                      )}
                                      {isPending && (
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                          <RefreshCw className="w-3 h-3 text-white/60 animate-spin" />
                                        </div>
                                      )}
                                    </button>
                                    {/* Delete button */}
                                    <button
                                      title="Eliminar elemento"
                                      onClick={e => { e.stopPropagation(); handleDeleteElement(el.id); if (elemLibSelectedId === el.id) setElemLibSelectedId(null); }}
                                      disabled={isDeleting || generatingElementAi}
                                      className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-destructive/80 hover:bg-destructive text-white flex items-center justify-center opacity-0 group-hover/ell:opacity-100 transition-opacity z-10 disabled:cursor-not-allowed"
                                    >
                                      {isDeleting ? <RefreshCw className="w-2 h-2 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                                    </button>
                                    {/* Rename button */}
                                    <button
                                      title="Renombrar elemento"
                                      onClick={e => { e.stopPropagation(); setElRenamingId(el.id); setElRenameValue(el.name); }}
                                      className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-full bg-background/90 border border-border/50 hover:border-primary/50 text-muted-foreground hover:text-primary flex items-center justify-center opacity-0 group-hover/ell:opacity-100 transition-opacity z-10"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Rename inline input */}
                            {elRenamingId !== null && (
                              <div className="flex items-center gap-1.5 border border-border/20 rounded p-1.5">
                                <span className="text-[9px] text-muted-foreground/60 shrink-0">Nombre:</span>
                                <input
                                  type="text"
                                  value={elRenameValue}
                                  onChange={e => setElRenameValue(e.target.value.slice(0, 100))}
                                  autoFocus
                                  className="flex-1 text-[10px] bg-white/5 border border-border/30 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary/50"
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleRenameElement(elRenamingId, elRenameValue);
                                    if (e.key === "Escape") setElRenamingId(null);
                                  }}
                                />
                                <button onClick={() => handleRenameElement(elRenamingId, elRenameValue)} disabled={!elRenameValue.trim()} className="text-[9px] px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40">OK</button>
                                <button onClick={() => setElRenamingId(null)} className="text-[9px] px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                              </div>
                            )}

                            {/* Upload more elements */}
                            {!showElUploadWidget ? (
                              <button
                                onClick={() => setShowElUploadWidget(true)}
                                className="flex items-center gap-1 text-[9px] text-muted-foreground/60 hover:text-primary transition-colors py-0.5"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                                Subir elemento nuevo
                              </button>
                            ) : (
                              <div className="space-y-1.5 border border-border/20 rounded p-2">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                  <span className="flex-1 truncate text-[10px] text-muted-foreground/70 bg-white/5 border border-border/30 rounded px-2 py-1">
                                    {elUploadFile ? elUploadFile.name : "Elegir imagen…"}
                                  </span>
                                  <span className="text-[10px] px-2 py-1 rounded border border-border/40 bg-white/5 hover:bg-white/10 text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">Buscar</span>
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={e => {
                                      const f = e.target.files?.[0];
                                      if (!f) return;
                                      setElUploadFile(f);
                                      setElUploadPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
                                      setElUploadName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                                {elUploadPreview && (
                                  <img src={elUploadPreview} alt="Vista previa" className="w-12 h-12 object-contain rounded border border-border/30 bg-white/5" />
                                )}
                                {elUploadFile && (
                                  <input
                                    type="text"
                                    value={elUploadName}
                                    onChange={e => setElUploadName(e.target.value.slice(0, 60))}
                                    placeholder="Nombre del elemento"
                                    className="w-full text-[10px] bg-white/5 border border-border/30 rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                                  />
                                )}
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={handleElementUploadApproval}
                                    disabled={!elUploadFile || !elUploadName.trim() || elUploading}
                                    className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {elUploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                                    {elUploading ? "Subiendo…" : "Subir"}
                                  </button>
                                  <button
                                    onClick={() => { setShowElUploadWidget(false); setElUploadFile(null); setElUploadPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); setElUploadName(""); }}
                                    className="text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground transition-colors"
                                  >Cancelar</button>
                                </div>
                              </div>
                            )}

                            {/* IA generation — shown when element is selected */}
                            {elemLibSelectedId !== null && (() => {
                              const selEl = bizElements.find(e => e.id === elemLibSelectedId);
                              const isPending = selEl?.analysisStatus === "pending";
                              const locked = !planHasElementAi;
                              const elementAiBaseCost = (plansData as { creditCosts?: { elementAi?: number; image?: number } } | undefined)?.creditCosts?.elementAi ?? null;
                              const elementAiCrCost = elementAiBaseCost != null ? elementAiBaseCost + ((plansData as { creditCosts?: { image?: number } } | undefined)?.creditCosts?.image ?? 1) : null;
                              return (
                                <div className="border border-fuchsia-500/25 rounded-lg p-2.5 space-y-2 bg-fuchsia-500/5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] text-fuchsia-300 font-medium flex items-center gap-1.5">
                                      <Sparkles className="w-3 h-3" />
                                      {selEl?.name ?? `Elemento #${elemLibSelectedId}`}
                                    </span>
                                    {elementAiCrCost != null && <span className="text-[10px] text-fuchsia-400 font-semibold">{elementAiCrCost} créditos</span>}
                                  </div>
                                  {isPending && (
                                    <p className="text-[10px] text-amber-400/80 flex items-center gap-1.5">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      Analizando elemento… espera unos segundos antes de generar.
                                    </p>
                                  )}
                                  {locked && (
                                    <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
                                      <Lock className="w-3 h-3" />
                                      Tu plan actual no incluye IA integra el elemento. Actualiza tu plan para usar esta función.
                                    </p>
                                  )}
                                  {!locked && !isPending && (
                                    <button
                                      disabled={generatingElementAi}
                                      onClick={async () => {
                                        if (!currentPost?.id || !elemLibSelectedId) return;
                                        setGeneratingElementAi(true);
                                        try {
                                          const resp = await fetch(
                                            `${BASE}/api/posts/${currentPost.id}/generate-with-element`,
                                            {
                                              method: "POST",
                                              credentials: "include",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ elementId: elemLibSelectedId }),
                                            }
                                          );
                                          if (resp.ok) {
                                            await queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
                                            toast({ title: "✨ Imagen generada con IA", description: "Nueva variante creada con el elemento integrado en la escena." });
                                            setElemLibSelectedId(null);
                                            setShowElemLibraryPanel(false);
                                          } else {
                                            const err = await resp.json().catch(() => ({}));
                                            if (err.code === "element_ai_not_allowed") {
                                              toast({ title: "Plan insuficiente", description: "Actualiza tu plan para usar IA integra el elemento.", variant: "destructive" });
                                            } else if (err.code === "insufficient_credits") {
                                              toast({ title: "Créditos insuficientes", description: err.error ?? (elementAiCrCost != null ? `Necesitas ${elementAiCrCost} créditos para esta operación.` : "Créditos insuficientes"), variant: "destructive" });
                                            } else {
                                              toast({ title: "Error", description: err.error ?? "No se pudo generar la imagen", variant: "destructive" });
                                            }
                                          }
                                        } catch {
                                          toast({ title: "Error de red", description: "No se pudo conectar con el servidor", variant: "destructive" });
                                        } finally {
                                          setGeneratingElementAi(false);
                                        }
                                      }}
                                      className="w-full flex items-center justify-center gap-1.5 text-[11px] py-2 rounded-md bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/30 transition-colors disabled:opacity-40 font-medium"
                                    >
                                      {generatingElementAi ? (
                                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Generando con IA…</>
                                      ) : (
                                        <><Sparkles className="w-3.5 h-3.5" />Integrar con IA{elementAiCrCost != null ? ` (${elementAiCrCost} créditos)` : ""}</>
                                      )}
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {(libraryMedia || libraryBg || activeImage?.rawBackground) && (
                    <p className="text-[10px] text-white/35 text-center">
                      {libraryMedia
                        ? "\"Usar foto real\" aplica tipografía y logo del negocio sobre tu foto — sin DALL-E"
                        : libraryBg
                        ? "\"Usar biblioteca\" aplica tipografía y logo sobre el fondo guardado — sin DALL-E"
                        : "\"Mismo fondo\" aplica tipografía, logo y posición sin llamar a DALL-E"}
                    </p>
                  )}

                </div>
              )}

              {/* Variants grid — pick which image to use */}
              {fullVariants.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {currentPost.contentType === "carousel"
                      ? "Slides del carrusel — toca para previsualizarlo y editarlo"
                      : "Imágenes generadas — toca para seleccionar"
                    }
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {fullVariants.map((variant: any) => {
                      const isSelected = selectedVariant === variant.id;
                      const isCarouselSlide = currentPost.contentType === "carousel" && slideOrder.includes(variant.id);
                      const isActiveSlide = currentPost.contentType === "carousel" && previewSlideId === variant.id;
                      const styleColor = STYLE_COLORS[variant.style ?? ''] ?? '#0077FF';
                      const borderStyle = isActiveSlide
                        ? { borderColor: "#0077FF", boxShadow: "0 0 16px rgba(0,119,255,0.5), 0 0 4px rgba(0,119,255,0.3)" }
                        : isSelected
                        ? { borderColor: styleColor, boxShadow: `0 0 16px ${styleColor}66, 0 0 4px ${styleColor}44` }
                        : { borderColor: `${styleColor}50`, boxShadow: `0 0 0px transparent` };
                      return (
                        <div key={variant.id} className="flex flex-col gap-1">
                          <div
                            onClick={() => {
                              if (variant.generationStatus === "pending") return;
                              setSelectedVariant(isSelected ? -1 : variant.id);
                              // For carousels: clicking ANY variant previews it in the phone + targets it for editing
                              // (regardless of whether it's already in slideOrder)
                              if (currentPost.contentType === "carousel") {
                                setPreviewSlideId(variant.id);
                              }
                            }}
                            className={`rounded-lg overflow-hidden border-2 transition-all relative aspect-square ${variant.generationStatus === "pending" ? "cursor-wait" : "cursor-pointer hover:brightness-110"}`}
                            style={borderStyle}
                          >
                            {variant.generationStatus === "pending" ? (
                              <div className="w-full h-full bg-neutral-900 flex flex-col items-center justify-center gap-2">
                                <div className="w-6 h-6 border-2 border-primary/60 border-t-primary rounded-full animate-spin" />
                                <span className="text-[9px] text-muted-foreground/70 text-center px-1">Generando…</span>
                              </div>
                            ) : variant.generationStatus === "error" ? (
                              <div className="w-full h-full bg-red-950/40 flex flex-col items-center justify-center gap-1 p-1">
                                <span className="text-lg">⚠️</span>
                                <span className="text-[8px] text-red-400 text-center">Error al generar</span>
                              </div>
                            ) : variant.imageData ? (
                              variant.mimeType?.startsWith("video/") ? (
                                <div className="w-full h-full bg-neutral-800 flex flex-col items-center justify-center gap-1">
                                  <span className="text-xl text-white/40">▶</span>
                                  <span className="text-[9px] text-white/25">video</span>
                                </div>
                              ) : (
                              <img src={`data:image/jpeg;base64,${variant.imageData}`} alt="Variant" className="w-full h-full object-cover" />
                              )
                            ) : (
                              <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                                <ImageIcon className="w-6 h-6 text-white/20" />
                              </div>
                            )}
                            {isCarouselSlide && (
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold text-white shadow">
                                {slideOrder.indexOf(variant.id) + 1}
                              </div>
                            )}
                            {!isCarouselSlide && isSelected && (
                              <div
                                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: styleColor }}
                              >
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            {variant.imageData && (
                              <button
                                onClick={e => { e.stopPropagation(); downloadImage(variant.imageData!, `eco-variante-${variant.variantIndex + 1}-${variant.style}.jpg`); }}
                                className="absolute top-1.5 left-1.5 w-6 h-6 bg-black/70 hover:bg-secondary/80 rounded-full flex items-center justify-center transition-colors"
                                title="Descargar esta variante"
                              >
                                <Download className="w-3 h-3 text-white" />
                              </button>
                            )}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (confirm("¿Eliminar esta imagen?")) {
                                  deleteVariant.mutate({ postId: currentPost.id, variantId: variant.id });
                                }
                              }}
                              disabled={deleteVariant.isPending}
                              className="absolute bottom-1 right-1 w-6 h-6 bg-black/70 hover:bg-red-600/90 rounded-full flex items-center justify-center transition-colors"
                              title="Eliminar esta imagen"
                            >
                              <Trash2 className="w-3 h-3 text-white" />
                            </button>
                          </div>
                          <div className="flex items-center gap-1 px-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: styleColor }} />
                            <span className="text-[9px] uppercase tracking-widest truncate" style={{ color: styleColor }}>
                              {variant.style}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Galería de Medios Reales ── */}
          <Card className="glass-card shrink-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-lg font-display text-primary flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Galería de Medios Reales
                </Label>
                <div className="flex items-center gap-2">
                  {/* Filter tabs */}
                  {(["all", "image", "video"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setMediaFilter(f)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        mediaFilter === f
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "border-border/30 text-muted-foreground hover:border-border/60 hover:text-foreground"
                      }`}
                    >
                      {f === "all" ? "Todo" : f === "image" ? "Fotos" : "Videos"}
                    </button>
                  ))}
                  {/* Upload button */}
                  <input
                    ref={mediaUploadRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) { handleMediaUpload(file); e.target.value = ""; }
                    }}
                  />
                  {/* Direct bg upload (from image editor row) */}
                  <input
                    ref={bgUploadRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) { handleDirectBgUpload(file); e.target.value = ""; }
                    }}
                  />
                  {/* Reference image upload — for "Nueva imagen" style guidance */}
                  <input
                    ref={refImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const srcDataUri = ev.target?.result as string;
                        // Show original as preview (browser handles display natively)
                        setReferenceImagePreview(srcDataUri);
                        // GPT-4o Vision only supports JPEG/PNG/GIF/WebP — convert all formats
                        // (including AVIF, HEIC, TIFF) to JPEG via Canvas API before storing.
                        // Block generation until conversion completes to avoid race condition.
                        setIsConvertingRefImage(true);
                        const img = new Image();
                        img.onload = () => {
                          try {
                            const canvas = document.createElement("canvas");
                            // Cap to 1280px to keep the payload small for GPT-4o Vision
                            const MAX_REF_DIM = 1280;
                            let cw = img.naturalWidth;
                            let ch = img.naturalHeight;
                            if (cw > MAX_REF_DIM || ch > MAX_REF_DIM) {
                              const scale = MAX_REF_DIM / Math.max(cw, ch);
                              cw = Math.round(cw * scale);
                              ch = Math.round(ch * scale);
                            }
                            canvas.width = cw;
                            canvas.height = ch;
                            const ctx = canvas.getContext("2d");
                            if (ctx) {
                              ctx.drawImage(img, 0, 0, cw, ch);
                              setReferenceImageBase64(canvas.toDataURL("image/jpeg", 0.85));
                            } else {
                              setReferenceImageBase64(srcDataUri); // fallback
                            }
                          } catch {
                            setReferenceImageBase64(srcDataUri); // fallback
                          } finally {
                            setIsConvertingRefImage(false);
                          }
                        };
                        img.onerror = () => {
                          setReferenceImageBase64(srcDataUri); // fallback
                          setIsConvertingRefImage(false);
                        };
                        img.src = srcDataUri;
                      };
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => mediaUploadRef.current?.click()}
                    disabled={isUploadingMedia}
                    className="h-7 text-xs gap-1.5 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
                    variant="outline"
                  >
                    {isUploadingMedia
                      ? <><RefreshCw className="w-3 h-3 animate-spin" /> Subiendo...</>
                      : <><Upload className="w-3 h-3" /> Subir</>}
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground/70 mb-4 -mt-1">
                Sube fotos y videos de instalaciones reales, trabajos terminados y equipos. Las fotos se pueden usar como fondo de cualquier publicación con logo y texto encima.
              </p>

              {mediaError && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mediaError}
                  <button onClick={() => setMediaError(null)} className="ml-auto text-red-300/60 hover:text-red-300">✕</button>
                </div>
              )}

              {/* Upload drop zone when gallery is empty */}
              {mediaItems.length === 0 && !isUploadingMedia && (
                <button
                  onClick={() => mediaUploadRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-border/40 rounded-xl text-muted-foreground hover:border-primary/40 hover:text-primary/80 transition-colors"
                >
                  <FolderOpen className="w-10 h-10 opacity-40" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Galería vacía</p>
                    <p className="text-xs mt-1 opacity-70">Haz clic aquí para subir tu primera foto o video</p>
                  </div>
                </button>
              )}

              {/* Media grid */}
              {mediaItems.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {mediaItems
                    .filter(m => mediaFilter === "all" || m.type === mediaFilter)
                    .map(media => {
                      const isImage = media.type === "image";
                      const thumbData = mediaThumbCache[media.id] ?? null;
                      const loadingThumb = loadingThumbs.has(media.id);

                      return (
                        <div key={media.id} className="flex flex-col gap-1 group relative" onMouseEnter={() => isImage && loadMediaThumb(media.id)}>
                          {/* Thumbnail area */}
                          <div className="relative aspect-square rounded-xl overflow-hidden border border-border/30 bg-neutral-900 cursor-pointer hover:brightness-110 transition-all">
                            {isImage ? (
                              thumbData ? (
                                <img
                                  src={`data:${media.mimeType};base64,${thumbData}`}
                                  alt={media.filename}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  {loadingThumb
                                    ? <RefreshCw className="w-5 h-5 text-white/30 animate-spin" />
                                    : <ImageIcon className="w-6 h-6 text-white/20" />}
                                </div>
                              )
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-neutral-900">
                                <Video className="w-7 h-7 text-blue-400/70" />
                                <span className="text-[9px] text-muted-foreground text-center px-1 truncate w-full">{media.filename}</span>
                              </div>
                            )}

                            {/* Type badge */}
                            <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${
                              isImage ? "bg-primary/80 text-white" : "bg-blue-500/80 text-white"
                            }`}>
                              {isImage ? "Foto" : "Video"}
                            </div>

                            {/* Delete button */}
                            <button
                              onClick={() => handleDeleteMedia(media.id)}
                              className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/70 hover:bg-red-600/90 rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                              title="Eliminar de la galería"
                            >
                              <Trash2 className="w-2.5 h-2.5 text-white" />
                            </button>

                            {/* "Use as background" overlay for images */}
                            {isImage && currentPost && (
                              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="sm"
                                  onClick={() => handleGenerateNewVariant(undefined, undefined, undefined, undefined, media.id)}
                                  disabled={generateImageVariant.isPending}
                                  className="h-7 text-[11px] bg-primary hover:bg-primary/90 text-white gap-1.5 shadow-lg"
                                >
                                  {generateImageVariant.isPending
                                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                                    : <Plus className="w-3 h-3" />}
                                  Usar como fondo
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Filename label */}
                          <p className="text-[9px] text-muted-foreground/70 truncate px-0.5" title={media.filename}>
                            {media.filename}
                          </p>
                        </div>
                      );
                    })}

                  {/* Add more shortcut */}
                  <button
                    onClick={() => mediaUploadRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-border/30 flex flex-col items-center justify-center gap-2 text-muted-foreground/40 hover:border-primary/40 hover:text-primary/60 transition-colors"
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-[9px]">Subir más</span>
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reschedule picker — per-platform for "both" posts */}
          {currentPost && (() => {
            const isBoth = (editedPlatform || currentPost.platform) === "both";
            const isIG   = (editedPlatform || currentPost.platform) === "instagram";
            const isTK   = (editedPlatform || currentPost.platform) === "tiktok";
            const neitherDateSet = !hasAnyScheduledDate();

            if (isBoth) {
              const igMissing = !rescheduleIgDate && !currentPost.scheduledAtInstagram && !currentPost.scheduledAt;
              const tkMissing = !rescheduleTkDate && !currentPost.scheduledAtTiktok && !currentPost.scheduledAt;
              const bothMissing = igMissing && tkMissing;
              return (
                <div className="space-y-2 shrink-0">
                  {bothMissing && (
                    <p className="text-[11px] text-amber-400 flex items-center gap-1.5 px-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Pon fecha y hora en al menos una red para poder aprobar
                    </p>
                  )}
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${igMissing && !tkMissing ? 'border-amber-500/40 bg-amber-500/5' : 'border-[#E1306C]/30 bg-[#E1306C]/5'}`}>
                    <span className="text-sm shrink-0">📸</span>
                    <span className={`text-xs font-medium whitespace-nowrap ${igMissing && !tkMissing ? 'text-amber-400' : 'text-[#E1306C]/90'}`}>
                      Instagram{igMissing ? <span className="ml-1 text-[9px] text-amber-400/80">(no publicará)</span> : ""}
                    </span>
                    <input
                      type="datetime-local"
                      value={rescheduleIgDate}
                      onChange={e => setRescheduleIgDate(e.target.value)}
                      className={`flex-1 min-w-0 bg-transparent border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none [color-scheme:dark] ${igMissing ? 'border-amber-500/40 focus:border-amber-400' : 'border-border/40 focus:border-[#E1306C]/60'}`}
                    />
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${tkMissing && !igMissing ? 'border-amber-500/40 bg-amber-500/5' : 'border-[#69C9D0]/30 bg-[#69C9D0]/5'}`}>
                    <span className="text-sm shrink-0">🎵</span>
                    <span className={`text-xs font-medium whitespace-nowrap ${tkMissing && !igMissing ? 'text-amber-400' : 'text-[#69C9D0]/90'}`}>
                      TikTok{tkMissing ? <span className="ml-1 text-[9px] text-amber-400/80">(no publicará)</span> : ""}
                    </span>
                    <input
                      type="datetime-local"
                      value={rescheduleTkDate}
                      onChange={e => setRescheduleTkDate(e.target.value)}
                      className={`flex-1 min-w-0 bg-transparent border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none [color-scheme:dark] ${tkMissing ? 'border-amber-500/40 focus:border-amber-400' : 'border-border/40 focus:border-[#69C9D0]/60'}`}
                    />
                  </div>
                </div>
              );
            }
            return (
              <div className="shrink-0 space-y-1">
                {neitherDateSet && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1.5 px-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Debes establecer una fecha y hora para aprobar
                  </p>
                )}
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${neitherDateSet ? 'border-amber-500/50 bg-amber-500/5' : 'border-border/40 bg-white/5'}`}>
                  <CalendarClock className={`w-4 h-4 shrink-0 ${neitherDateSet ? 'text-amber-400' : 'text-muted-foreground'}`} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {isIG ? "📸 Instagram" : isTK ? "🎵 TikTok" : "Fecha de publicación"}
                  </span>
                  <input
                    type="datetime-local"
                    value={rescheduleDate}
                    onChange={e => setRescheduleDate(e.target.value)}
                    className={`flex-1 bg-transparent border rounded-md px-2 py-1 text-sm text-foreground focus:outline-none [color-scheme:dark] ${neitherDateSet ? 'border-amber-500/40 focus:border-amber-400' : 'border-border/50 focus:border-primary/60'}`}
                  />
                </div>
              </div>
            );
          })()}

          {/* Spell-check blocker notice */}
          {captionSpellResult?.hasErrors && !isCheckingCaptionSpell && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">
                Corrige los errores ortográficos del texto antes de aprobar, o haz clic en <strong>"Ignorar de todas formas"</strong>.
              </p>
            </div>
          )}

          {isScheduled ? (
            /* Scheduled post actions: 4 buttons — hidden on mobile (sticky bar handles actions) */
            <div className="hidden sm:grid grid-cols-4 gap-2 shrink-0 mt-auto pt-4 border-t border-border/30">
              <Button
                size="lg"
                variant="destructive"
                onClick={handleDelete}
                disabled={deletePost.isPending || updatePost.isPending}
                className="h-14 flex-col gap-0.5 text-xs border bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </Button>
              <Button
                size="lg"
                onClick={handleReject}
                disabled={updatePost.isPending}
                className="h-14 flex-col gap-0.5 text-xs border bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
              >
                <RefreshCw className="w-4 h-4" />
                Pendiente
              </Button>
              <Button
                size="lg"
                onClick={handleMarkManualPublish}
                disabled={updatePost.isPending}
                className="h-14 flex-col gap-0.5 text-xs bg-emerald-600/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/25 hover:border-emerald-400/60 hover:text-emerald-200 transition-all"
              >
                <span className="text-base leading-none">📱</span>
                Manual
              </Button>
              <Button
                size="lg"
                onClick={handleApprove}
                disabled={updatePost.isPending || (captionSpellResult?.hasErrors === true && !isCheckingCaptionSpell) || isOverIgCaptionLimit}
                className={`h-14 flex-col gap-0.5 text-xs text-primary-foreground shadow-[0_0_20px_rgba(0,119,255,0.3)] transition-all ${(captionSpellResult?.hasErrors || isOverIgCaptionLimit) ? "bg-primary/30 opacity-50 cursor-not-allowed" : "bg-primary hover:bg-primary/90"}`}
              >
                <Save className="w-4 h-4" />
                Guardar
              </Button>
            </div>
          ) : (
            /* Pending approval actions: 4 buttons — hidden on mobile (sticky bar handles actions) */
            <div className="hidden sm:grid grid-cols-4 gap-2 shrink-0 mt-auto pt-4 border-t border-border/30">
              <Button
                size="lg"
                variant="destructive"
                onClick={handleDelete}
                disabled={deletePost.isPending || updatePost.isPending || approvePost.isPending || rejectPost.isPending}
                className="h-14 flex-col gap-0.5 text-xs border bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </Button>
              <Button
                size="lg"
                onClick={handleReject}
                disabled={updatePost.isPending || approvePost.isPending || rejectPost.isPending}
                className="h-14 flex-col gap-0.5 text-xs border bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
              >
                <RefreshCw className="w-4 h-4" />
                Pendiente
              </Button>
              <Button
                size="lg"
                onClick={handleMarkManualPublish}
                disabled={updatePost.isPending || approvePost.isPending || rejectPost.isPending}
                className="h-14 flex-col gap-0.5 text-xs bg-emerald-600/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/25 hover:border-emerald-400/60 hover:text-emerald-200 transition-all"
              >
                <span className="text-base leading-none">📱</span>
                Manual
              </Button>
              <Button
                size="lg"
                onClick={handleApprove}
                disabled={
                  updatePost.isPending || approvePost.isPending || rejectPost.isPending ||
                  (captionSpellResult?.hasErrors === true && !isCheckingCaptionSpell) ||
                  isOverIgCaptionLimit
                }
                className={`h-14 flex-col gap-0.5 text-xs text-primary-foreground shadow-[0_0_20px_rgba(0,119,255,0.3)] transition-all ${
                  (captionSpellResult?.hasErrors || isOverIgCaptionLimit)
                    ? "bg-primary/30 hover:bg-primary/30 cursor-not-allowed opacity-50"
                    : "bg-primary hover:bg-primary/90"
                }`}
              >
                <Check className="w-4 h-4" />
                Aprobar
              </Button>
            </div>
          )}
          {/* ── WhatsApp share ── */}
          {currentPost && (
            <button
              onClick={handleShareWhatsApp}
              className="hidden sm:flex items-center justify-center gap-2 rounded-xl border border-[#25D366]/30 bg-[#25D366]/8 hover:bg-[#25D366]/15 hover:border-[#25D366]/50 text-[#25D366] text-xs font-medium py-2.5 px-4 transition-all mt-1 w-full cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Compartir por WhatsApp
            </button>
          )}
          {/* Mobile spacer — keeps content above sticky action bar */}
          <div className="h-16 sm:hidden" />
        </div>
      </div>
    </div>

    {/* ── Mobile: barra de acciones fija en la parte inferior ── */}
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/50 px-3 py-2 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="w-11 h-11 flex items-center justify-center rounded-xl border border-border/50 bg-card text-foreground disabled:opacity-30 active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-[10px] font-medium text-muted-foreground w-7 text-center shrink-0">
          {currentIndex + 1}/{allPendingPosts.length}
        </span>
        <button
          onClick={handleNext}
          disabled={currentIndex === allPendingPosts.length - 1}
          className="w-11 h-11 flex items-center justify-center rounded-xl border border-border/50 bg-card text-foreground disabled:opacity-30 active:scale-95 transition-transform"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        {isScheduled ? (
          <>
            <button
              onClick={handleReject}
              disabled={updatePost.isPending}
              className="flex-1 h-14 flex flex-col items-center justify-center rounded-xl border bg-amber-500/10 text-amber-400 border-amber-500/30 gap-0.5 text-xs font-medium active:scale-95 transition-transform disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Pendiente
            </button>
            <button
              onClick={handleApprove}
              disabled={updatePost.isPending || (captionSpellResult?.hasErrors === true && !isCheckingCaptionSpell) || isOverIgCaptionLimit}
              className="flex-1 h-14 flex flex-col items-center justify-center rounded-xl gap-0.5 text-xs font-semibold text-white bg-primary shadow-[0_0_16px_rgba(0,119,255,0.35)] active:scale-95 transition-transform disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Guardar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={updatePost.isPending || approvePost.isPending || rejectPost.isPending}
              className="flex-1 h-14 flex flex-col items-center justify-center rounded-xl border bg-destructive/10 text-destructive border-destructive/30 gap-0.5 text-xs font-medium active:scale-95 transition-transform disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              Rechazar
            </button>
            <button
              onClick={handleApprove}
              disabled={updatePost.isPending || approvePost.isPending || rejectPost.isPending || (captionSpellResult?.hasErrors === true && !isCheckingCaptionSpell) || isOverIgCaptionLimit}
              className="flex-1 h-14 flex flex-col items-center justify-center rounded-xl gap-0.5 text-xs font-semibold text-white bg-primary shadow-[0_0_16px_rgba(0,119,255,0.35)] active:scale-95 transition-transform disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Aprobar
            </button>
          </>
        )}
      </div>
    </div>

    {/* ── Reel Studio: modal de revisión de texto ── */}
    {showStudioReview && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="p-5 space-y-4">

            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <CheckCircle className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Revisión de texto obligatoria</p>
                <p className="text-[11px] text-muted-foreground">Corrige antes de generar. Los textos se usan en el video final.</p>
              </div>
            </div>

            {/* Slide captions */}
            {studioSlides.some(s => s.caption?.trim()) && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Textos de slides</p>
                {studioSlides.map((s, i) =>
                  s.caption?.trim() ? (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground w-14 shrink-0 text-right">Slide {i + 1}</span>
                      <input
                        type="text"
                        spellCheck={true}
                        value={s.caption ?? ""}
                        onChange={(e) => setStudioSlides(prev => prev.map((ss, j) => j === i ? { ...ss, caption: e.target.value } : ss))}
                        className="flex-1 text-xs bg-background border border-border/60 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20"
                        maxLength={80}
                      />
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* Closing slide bullets + CTA */}
            {studioClosingSlide.enabled && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Slide de cierre</p>
                {studioClosingSlide.bullets.map((b, bi) => (
                  <div key={bi} className="flex items-center gap-2">
                    <span className="text-[9px] text-blue-400/80 w-14 shrink-0 text-right">Bullet {bi + 1}</span>
                    <input
                      type="text"
                      spellCheck={true}
                      value={b}
                      onChange={(e) => setStudioClosingSlide(prev => ({
                        ...prev,
                        bullets: prev.bullets.map((bb, bj) => bj === bi ? e.target.value : bb),
                      }))}
                      className="flex-1 text-xs bg-background border border-blue-500/20 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                      maxLength={50}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-blue-400 w-14 shrink-0 text-right font-semibold">CTA</span>
                  <input
                    type="text"
                    spellCheck={true}
                    value={studioClosingSlide.cta}
                    onChange={(e) => setStudioClosingSlide(prev => ({ ...prev, cta: e.target.value }))}
                    className="flex-1 text-xs bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-1.5 text-blue-300 font-semibold focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20"
                    maxLength={40}
                  />
                </div>
              </div>
            )}

            {/* IA spell check */}
            <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground font-medium">Verificación ortográfica (IA)</p>
                <button
                  onClick={handleStudioSpellCheck}
                  disabled={studioSpellChecking}
                  className="text-[10px] px-3 py-1 rounded-full border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-all disabled:opacity-50 flex items-center gap-1 font-medium"
                >
                  {studioSpellChecking
                    ? <><RefreshCw className="w-3 h-3 animate-spin" /> Verificando...</>
                    : <><Sparkles className="w-3 h-3" /> Verificar con IA</>
                  }
                </button>
              </div>

              {!studioSpellResult && !studioSpellChecking && (
                <p className="text-[10px] text-muted-foreground/60 italic">Haz clic en "Verificar con IA" para detectar errores ortográficos y gramaticales.</p>
              )}

              {studioSpellResult && !studioSpellChecking && (
                studioSpellResult.hasErrors ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-yellow-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <p className="text-[11px] font-medium">Se encontraron posibles errores</p>
                    </div>
                    <p className="text-[10px] text-yellow-200/80 leading-relaxed">{studioSpellResult.explanation}</p>
                    <div className="mt-1 p-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Texto sugerido:</p>
                      <p className="text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed">{studioSpellResult.corrected}</p>
                    </div>
                    <p className="text-[9px] text-muted-foreground/60 italic">Edita los campos de arriba con las correcciones, luego confirma.</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-green-400">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <p className="text-[11px] font-medium">Todo correcto — sin errores detectados</p>
                  </div>
                )
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStudioReview(false)}
                className="flex-1 gap-1.5"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Volver a editar
              </Button>
              <Button
                size="sm"
                onClick={() => { setShowStudioReview(false); handleGenerateStudio(); }}
                className="flex-1 gap-1.5"
                style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)", color: "white" }}
              >
                <Film className="w-3.5 h-3.5" />
                {studioSpellResult?.hasErrors ? "Generar de todas formas" : "Confirmar y Generar"}
              </Button>
            </div>

          </div>
        </div>
      </div>
    )}

    <Sheet open={bgDrawerOpen} onOpenChange={(open) => {
      setBgDrawerOpen(open);
      if (!open) { setBgSelectMode(false); setBgSelectedIds(new Set()); }
    }}>
      <SheetContent side="bottom" className="h-[82vh] flex flex-col bg-neutral-950 border-t border-border/40">
        <SheetHeader className="shrink-0 pb-2 border-b border-border/20">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Layers className="w-4 h-4 text-primary" />
              Biblioteca de fondos — sin logo ni texto
            </SheetTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setBgDrawerOpen(false); navigate("/backgrounds?from=approval"); }}
                className="text-[11px] px-2.5 py-1 rounded-full border border-primary/50 text-primary hover:bg-primary/10 transition-all font-medium"
                title="Ir a Biblioteca de Fondos para generar nuevos"
              >
                + Generar nuevo fondo
              </button>
              <button
                onClick={() => fetchBgItems(true)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                title="Actualizar biblioteca"
              >
                ↻ Actualizar
              </button>
            <button
              onClick={() => { setBgSelectMode(m => !m); setBgSelectedIds(new Set()); }}
              className={`text-[11px] px-3 py-1 rounded-full border font-medium transition-all ${
                bgSelectMode
                  ? "bg-red-500/20 border-red-500/60 text-red-400"
                  : "border-border/40 text-muted-foreground hover:border-border/70 hover:text-foreground"
              }`}
            >
              {bgSelectMode ? "✕ Cancelar" : "Seleccionar para borrar"}
            </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {bgSelectMode
              ? `${bgSelectedIds.size > 0 ? `${bgSelectedIds.size} seleccionada${bgSelectedIds.size > 1 ? "s" : ""}` : "Toca las fotos que quieres eliminar"}`
              : "Haz clic para seleccionar · los fondos de formato diferente se adaptan automáticamente"
            }
          </p>
        </SheetHeader>

        {/* Format filter tabs */}
        {bgItemsLoaded && bgItems.length > 0 && (() => {
          const currentIsPortrait = currentPost?.contentType === "story" || currentPost?.contentType === "reel";
          const portraitCount = bgItems.filter(i => i.contentType === "story" || i.contentType === "reel").length;
          const feedCount = bgItems.filter(i => i.contentType !== "story" && i.contentType !== "reel").length;
          return (
            <div className="shrink-0 flex items-center gap-1.5 pt-2 pb-1 flex-wrap">
              {([
                { key: "all", label: `Todos (${bgItems.length})` },
                { key: "portrait", label: `📱 Historia/Reel (${portraitCount})` },
                { key: "feed", label: `📷 Feed (${feedCount})` },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setBgFormatFilter(tab.key)}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-all font-medium ${
                    bgFormatFilter === tab.key
                      ? "bg-primary/20 border-primary/60 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-border/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {currentPost && (
                <span className="ml-auto text-[9px] text-muted-foreground/60 italic">
                  Post actual: {currentIsPortrait ? "📱 Historia/Reel" : "📷 Feed"}
                  {bgFormatFilter === "all" && " · formato distinto se adapta auto"}
                </span>
              )}
            </div>
          );
        })()}

        <div className="flex-1 overflow-y-auto mt-2">
          {!bgItemsLoaded ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <RefreshCw className="w-7 h-7 animate-spin text-primary/60" />
              <p className="text-sm">Cargando biblioteca…</p>
            </div>
          ) : bgItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
              <Layers className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">Aún no hay fondos guardados</p>
              <p className="text-xs opacity-60 text-center max-w-xs">Los fondos son escenas sin logo ni texto que puedes reutilizar en tus posts.</p>
              <button
                onClick={() => { setBgDrawerOpen(false); navigate("/backgrounds?from=approval"); }}
                className="text-xs px-4 py-2 rounded-full border border-primary/50 text-primary hover:bg-primary/10 transition-all font-medium"
              >
                + Generar fondos en Biblioteca de Fondos →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 pb-8 px-1">
              {bgItems.filter(item => {
                const isPortrait = item.contentType === "story" || item.contentType === "reel";
                if (bgFormatFilter === "portrait") return isPortrait;
                if (bgFormatFilter === "feed") return !isPortrait;
                return true;
              }).map(item => {
                const label = item.caption?.split('\n')[0]?.replace(/[^\w\s,.:;!?áéíóúÁÉÍÓÚñÑ-]/g, '').replace(/[#@]/g, '').trim().slice(0, 45) || item.style;
                const isPicking = loadingPickId === item.id;
                const isDeleting = deletingBgId === item.id;
                const itemIsPortrait = item.contentType === "story" || item.contentType === "reel";
                const currentIsPortrait = currentPost?.contentType === "story" || currentPost?.contentType === "reel";
                const formatMismatch = currentPost != null && itemIsPortrait !== currentIsPortrait;
                const formatBadge = itemIsPortrait ? "📱" : "📷";
                const formatLabel = itemIsPortrait
                  ? (item.contentType === "story" ? "Historia" : "Reel")
                  : (item.contentType === "carousel" ? "Carrusel" : "Feed");
                const isSelected = bgSelectedIds.has(item.id);
                return (
                  <div key={item.id} className="group relative aspect-square">
                    <button
                      disabled={!bgSelectMode && (loadingPickId !== null || isDeleting)}
                      className={`w-full h-full relative rounded-lg overflow-hidden border bg-neutral-900 transition-all ${
                        bgSelectMode
                          ? isSelected
                            ? "border-red-400 ring-2 ring-red-400/60"
                            : "border-border/30 hover:border-red-400/50"
                          : "hover:shadow-lg hover:shadow-primary/10 disabled:opacity-60 border-border/30 hover:border-primary/70"
                      }`}
                      onClick={() => {
                        if (bgSelectMode) {
                          setBgSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        } else {
                          handlePickBg(item.id, item.style, item.caption);
                        }
                      }}
                    >
                      <BgThumbImg
                        id={item.id}
                        alt={label}
                        className={`w-full h-full object-cover transition-transform duration-300 ${bgSelectMode && isSelected ? "scale-95 opacity-80" : "group-hover:scale-105"}`}
                      />
                      {/* Loading / deleting overlay */}
                      {(isPicking || isDeleting) && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <RefreshCw className="w-6 h-6 text-white animate-spin" />
                        </div>
                      )}
                      {/* Select mode: checkbox overlay */}
                      {bgSelectMode && (
                        <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected ? "bg-red-500 border-red-500" : "bg-black/40 border-white/60"
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}
                      {/* Format badge — top-right */}
                      {!bgSelectMode && (
                        <div className={`absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded font-bold leading-none ${
                          formatMismatch
                            ? "bg-amber-500/90 text-black"
                            : "bg-black/60 text-white/80"
                        }`}>
                          {formatBadge} {formatLabel}
                          {formatMismatch && " ↔"}
                        </div>
                      )}
                      {/* Hover overlay with info — only in normal mode */}
                      {!bgSelectMode && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <div className="absolute bottom-0 inset-x-0 px-2 py-1.5">
                            <p className="text-[9px] text-white/90 leading-tight line-clamp-2">{label}</p>
                            {(item.libraryUseCount ?? 0) > 0 && (
                              <p className="text-[8px] text-primary/80 mt-0.5">Usado {item.libraryUseCount}x</p>
                            )}
                            {formatMismatch && (
                              <p className="text-[8px] text-amber-400 mt-0.5">Se adaptará al formato automáticamente</p>
                            )}
                          </div>
                        </div>
                      )}
                      {/* "Seleccionar" check on hover — only in normal mode */}
                      {!bgSelectMode && !isPicking && !isDeleting && (
                        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                    {/* Delete button — shows on group hover, only in normal mode */}
                    {!bgSelectMode && !isPicking && !isDeleting && confirmDeleteId !== item.id && (
                      <button
                        className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-red-600/80 hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Eliminar fondo"
                        onClick={e => handleDeleteFromDrawer(item.id, e)}
                      >
                        <Trash2 className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
                    {/* Inline delete confirmation overlay — no native confirm(), only in normal mode */}
                    {!bgSelectMode && confirmDeleteId === item.id && (
                      <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center gap-1.5 rounded-lg p-2">
                        <p className="text-[9px] text-white font-semibold text-center leading-tight">¿Eliminar este fondo?</p>
                        <div className="flex gap-1.5">
                          <button
                            className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold transition-colors"
                            onClick={e => { e.stopPropagation(); confirmDeleteBg(item.id); }}
                          >Sí</button>
                          <button
                            className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-[9px] font-bold transition-colors"
                            onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                          >No</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Bulk delete bar — visible in select mode when items are chosen ── */}
        {bgSelectMode && (
          <div className="shrink-0 border-t border-border/30 pt-3 pb-2 px-1 flex items-center gap-3">
            <button
              onClick={() => setBgSelectedIds(prev => {
                const visible = bgItems.filter(item => {
                  const isPortrait = item.contentType === "story" || item.contentType === "reel";
                  if (bgFormatFilter === "portrait") return isPortrait;
                  if (bgFormatFilter === "feed") return !isPortrait;
                  return true;
                });
                return new Set(visible.map(i => i.id));
              })}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70 transition-all"
            >
              Seleccionar todas
            </button>
            <button
              onClick={() => setBgSelectedIds(new Set())}
              disabled={bgSelectedIds.size === 0}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70 transition-all disabled:opacity-40"
            >
              Quitar selección
            </button>
            <div className="ml-auto">
              {bgSelectedIds.size === 0 ? (
                <p className="text-[11px] text-muted-foreground/60 italic">Ninguna seleccionada</p>
              ) : (
                <button
                  onClick={handleBulkDeleteBg}
                  disabled={bgBulkDeleting}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-[12px] font-semibold transition-all"
                >
                  {bgBulkDeleting
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Eliminando…</>
                    : <><Trash2 className="w-3.5 h-3.5" /> Eliminar {bgSelectedIds.size} foto{bgSelectedIds.size > 1 ? "s" : ""}</>
                  }
                </button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>

    {/* ── Caption Addons Dialog (inline approval queue) ─────────────────── */}
    <Dialog open={addonsModalOpen} onOpenChange={setAddonsModalOpen}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>{addonsEditing ? "Editar texto adicional" : "Nuevo texto adicional"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
          <div>
            <Label htmlFor="addon-name">Nombre <span className="text-destructive">*</span></Label>
            <Input
              id="addon-name"
              placeholder="Ej: Contacto Paneles Solares"
              value={addonsForm.name}
              onChange={e => setAddonsForm(f => ({ ...f, name: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="addon-keywords">Palabras clave</Label>
            <Input
              id="addon-keywords"
              placeholder="Ej: panel solar, energía solar — vacío = aplica a TODOS"
              value={addonsForm.keywords}
              onChange={e => setAddonsForm(f => ({ ...f, keywords: e.target.value }))}
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Si el tema del post contiene alguna de estas palabras, este texto se activa.
              <span className="text-green-400 font-medium"> Vacío = aplica a todos los posts.</span>
            </p>
          </div>
          <div>
            <Label htmlFor="addon-text">Texto adicional <span className="text-destructive">*</span></Label>
            <Textarea
              id="addon-text"
              placeholder="Ej: 📞 Llámanos al 300-123-4567 para cotización gratis."
              value={addonsForm.text}
              onChange={e => setAddonsForm(f => ({ ...f, text: e.target.value }))}
              className="mt-1 min-h-[90px] max-h-[220px] resize-y"
            />
          </div>
          <div>
            <Label>Posición</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                variant={addonsForm.position === "before" ? "default" : "outline"}
                size="sm"
                onClick={() => setAddonsForm(f => ({ ...f, position: "before" }))}
                className="flex-1 text-xs"
              >
                Antes del texto IA
              </Button>
              <Button
                type="button"
                variant={addonsForm.position === "after" ? "default" : "outline"}
                size="sm"
                onClick={() => setAddonsForm(f => ({ ...f, position: "after" }))}
                className="flex-1 text-xs"
              >
                Después del texto IA
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="addon-active"
              checked={addonsForm.active}
              onCheckedChange={v => setAddonsForm(f => ({ ...f, active: v }))}
            />
            <Label htmlFor="addon-active" className="cursor-pointer">Activo</Label>
          </div>
          {addonsForm.text.trim() && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide mb-2">Vista previa del caption final</p>
              <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto">
                {addonsForm.position === "before"
                  ? `${addonsForm.text.trim()}\n\n[...texto generado por la IA...]`
                  : `[...texto generado por la IA...]\n\n${addonsForm.text.trim()}`}
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="shrink-0 pt-2 border-t border-border/30">
          <Button variant="outline" onClick={() => setAddonsModalOpen(false)}>Cancelar</Button>
          <Button onClick={saveAddon} disabled={addonsSaving}>
            {addonsSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
            {addonsEditing ? "Guardar cambios" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* ─────────────────────────────────────────────────────────────────── */}

    {/* Aviso antes de generar nueva imagen con DALL-E */}
    <Dialog open={variantWarningOpen} onOpenChange={setVariantWarningOpen}>
      <DialogContent className="bg-card border border-border/60 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground text-base">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            Generar nueva imagen
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Esto consumirá <span className="font-semibold text-foreground">1 crédito</span> de tu plan para generar una nueva imagen con IA.
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-400 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              ¿Ya revisaste la <strong>Biblioteca de Fondos</strong>? Puedes reutilizar imágenes existentes sin gastar créditos.
            </span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2 pt-1">
          <Button
            variant="outline"
            className="border-border/60 text-muted-foreground hover:bg-white/5"
            onClick={() => { setVariantWarningOpen(false); navigate("/backgrounds"); }}
          >
            Ir a Biblioteca
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              setVariantWarningOpen(false);
              handleGenerateNewVariant(pendingVariantInstruction);
            }}
          >
            Sí, generar nueva imagen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </>
  );
}
