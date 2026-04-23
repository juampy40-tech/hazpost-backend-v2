import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useGetNiches, useGenerateExtraPosts, getGetPostsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Sparkles, Instagram, PlaySquare, Zap, Loader2, Image as ImageIcon, Film, LayoutGrid, BookImage, Info, Wand2, Plus, PlusCircle, ChevronDown, AlertTriangle, CreditCard, FileText, ChevronRight, Lock, Layers, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const TEMPLATE_TYPE_ICONS: Record<string, React.ReactNode> = {
  image:    <ImageIcon className="w-3 h-3" />,
  reel:     <Film className="w-3 h-3" />,
  carousel: <LayoutGrid className="w-3 h-3" />,
  story:    <BookImage className="w-3 h-3" />,
};

const TEMPLATE_TYPE_LABEL: Record<string, string> = {
  image: "Imagen", reel: "Reel", carousel: "Carrusel", story: "Historia",
};

const CONTENT_TYPES = [
  { value: "image",    label: "Imagen",   description: "Foto estática (feed)",  icon: ImageIcon  },
  { value: "reel",     label: "Reel",     description: "Video corto vertical",   icon: Film       },
  { value: "carousel", label: "Carrusel", description: "3-5 diapositivas PPA",   icon: LayoutGrid },
  { value: "story",    label: "Historia", description: "Story efímero 9:16",     icon: BookImage  },
];

const REEL_MUSIC_GENRES = [
  { value: "",           label: "Auto-detectar" },
  { value: "trap",       label: "Trap / Hip-Hop" },
  { value: "lo-fi",      label: "Lo-Fi / Chill" },
  { value: "phonk",      label: "Phonk" },
  { value: "house",      label: "House / EDM" },
  { value: "latina",     label: "Latina / Urbano" },
  { value: "cinematic",  label: "Cinematográfico" },
  { value: "ambient",    label: "Ambiental" },
  { value: "corporativa", label: "Corporativo" },
];


export default function Generate() {
  const { data: niches, isLoading: nichesLoading } = useGetNiches();
  const generateExtra = useGenerateExtraPosts();
  const activeBusiness = useActiveBusiness();
  const activeBusinessId = activeBusiness.id;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [platform, setPlatform] = useState<string>("both");
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(["image", "reel", "carousel", "story"]);
  const [selectedNiches, setSelectedNiches] = useState<number[]>([]);
  const [extraCount, setExtraCount] = useState<number>(5);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [noNichesDialogOpen, setNoNichesDialogOpen] = useState(false);
  const [customTopic, setCustomTopic] = useState<string>("");
  const [reelMusicGenre, setReelMusicGenre] = useState<string>(
    () => localStorage.getItem("eco:reelMusicGenreHint") || ""
  );
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null);
  const [useDeepElementAI, setUseDeepElementAI] = useState(false);
  const [elUploadFile, setElUploadFile] = useState<File | null>(null);
  const [elUploadPreview, setElUploadPreview] = useState<string | null>(null);
  const [elUploadName, setElUploadName] = useState("");
  const [elUploading, setElUploading] = useState(false);
  const [elDeletingId, setElDeletingId] = useState<number | null>(null);
  const [elRenamingId, setElRenamingId] = useState<number | null>(null);
  const [elRenameValue, setElRenameValue] = useState("");

  const [socialAccounts, setSocialAccounts] = useState<Array<{ id: number; platform: string; username: string | null; businessId: number | null; connected?: string }>>([]);
  const [socialAccountsLoaded, setSocialAccountsLoaded] = useState(false);

  useEffect(() => {
    return () => { if (elUploadPreview) URL.revokeObjectURL(elUploadPreview); };
  }, [elUploadPreview]);

  useEffect(() => {
    return () => {
      setSelectedElementId(null);
      setUseDeepElementAI(false);
    };
  }, []);

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

  const { data: billingData } = useQuery({
    queryKey: ["billing-packages"],
    queryFn: () => fetch(`${BASE}/api/billing/packages`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });
  const { data: plansData } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => fetch(`${BASE}/api/plans`).then(r => r.json()),
    staleTime: 60_000,
  });

  // Subscription plan — used to check if element_ai_integration is enabled
  const { data: subscriptionMe } = useQuery<{ planDetails?: { element_ai_enabled?: boolean } | null }>({
    queryKey: ["subscriptions/me"],
    queryFn: () => fetch(`${BASE}/api/subscriptions/me`, { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
  const planHasElementAi = subscriptionMe?.planDetails?.element_ai_enabled ?? false;

  // Business elements — loaded when business is available and user opens the element section
  const { data: bizElementsData } = useQuery<{ elements: { id: number; name: string; analysisStatus?: string; thumbUrl?: string }[] }>({
    queryKey: ["biz-elements", activeBusinessId],
    queryFn: () => fetch(`${BASE}/api/elements?businessId=${activeBusinessId}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
    enabled: !!activeBusinessId,
  });
  const bizElements = bizElementsData?.elements ?? [];

  const industryName = activeBusiness.industry ?? null;
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["content-templates", industryName],
    queryFn: () => {
      const qs = industryName
        ? `?industryName=${encodeURIComponent(industryName)}`
        : "";
      return fetch(`${BASE}/api/content-templates${qs}`).then(r => r.json());
    },
    staleTime: 5 * 60_000,
    enabled: showTemplatePanel,
  });
  const templates: Array<{
    id: number; title: string; description: string; postType: string;
    tone: string; suggestedTopic: string; hashtags: string;
    industryName: string;
  }> = templatesData?.templates ?? [];

  function applyTemplate(t: typeof templates[0]) {
    setCustomTopic(t.suggestedTopic);
    if (t.postType) setSelectedContentTypes([t.postType]);
    setShowTemplatePanel(false);
    toast({ title: `Plantilla "${t.title}" aplicada`, description: "El tema fue copiado al briefing. Ajústalo si lo necesitas." });
  }

  const creditsRemaining: number = billingData?.credits?.remaining ?? 0;

  const TYPE_LABELS: Record<string, string> = {
    image: "Imágenes", reel: "Reels", carousel: "Carruseles", story: "Historias",
  };
  const CREDIT_COST: Record<string, number> = {
    image:    plansData?.creditCosts?.image    ?? 1,
    story:    plansData?.creditCosts?.story    ?? 1,
    carousel: plansData?.creditCosts?.carousel ?? 5,
    reel:     plansData?.creditCosts?.reel     ?? 6,
  };
  const typeBreakdown: { type: string; label: string; count: number; creditCost: number }[] = (() => {
    const types = selectedContentTypes.length > 0 ? selectedContentTypes : ["image"];
    const base = Math.floor(extraCount / types.length);
    const remainder = extraCount % types.length;
    return types.map((t, i) => ({
      type: t,
      label: TYPE_LABELS[t] ?? t,
      count: base + (i < remainder ? 1 : 0),
      creditCost: CREDIT_COST[t] ?? 1,
    })).filter(t => t.count > 0);
  })();
  const elementAiCostPerImage = plansData?.creditCosts?.elementAi ?? null;
  const elementAiImageCount = (useDeepElementAI && selectedElementId != null)
    ? (typeBreakdown.find(t => t.type === "image")?.count ?? 0)
    : 0;
  const elementAiExtraCost = elementAiImageCount * (elementAiCostPerImage ?? 0);
  const totalCredits = typeBreakdown.reduce((s, t) => s + t.count * t.creditCost, 0) + elementAiExtraCost;
  const creditsAfter = Math.max(0, creditsRemaining - totalCredits);
  const notEnoughCredits = creditsRemaining < totalCredits;

  const activeNiches = niches?.filter(n => n.active) || [];

  const handleReelMusicGenre = (v: string) => {
    setReelMusicGenre(v);
    if (v) localStorage.setItem("eco:reelMusicGenreHint", v);
    else localStorage.removeItem("eco:reelMusicGenreHint");
  };

  const toggleContentType = (type: string) => {
    setSelectedContentTypes(prev => {
      if (prev.includes(type)) return prev.length > 1 ? prev.filter(t => t !== type) : prev;
      return [...prev, type];
    });
  };

  const toggleNiche = (id: number) => {
    setSelectedNiches(prev => prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]);
  };

  function doGenerate() {
    generateExtra.mutate({
      data: {
        count: extraCount,
        nicheIds: selectedNiches.length > 0 ? selectedNiches : undefined,
        platform,
        contentTypes: selectedContentTypes,
        customTopic: customTopic.trim() || undefined,
        businessId: activeBusinessId,
        ...(selectedElementId != null && useDeepElementAI
          ? { elementId: selectedElementId, useDeepElementAI: true }
          : {}),
      }
    }, {
      onSuccess: (result) => {
        setSelectedElementId(null);
        setUseDeepElementAI(false);
        if (result.generated === 0) {
          if (result.searchedDays === 0) {
            toast({ title: "Sin nichos configurados", description: "Configura al menos un nicho activo en la página de Nichos para generar contenido.", variant: "destructive" });
          } else {
            toast({ title: "No se encontraron huecos", description: "El calendario está completamente lleno por los próximos 120 días.", variant: "destructive" });
          }
        } else {
          toast({ title: `${result.generated} publicaciones creadas`, description: `Distribuidas en los próximos ${result.searchedDays} días disponibles. Las imágenes se generan en segundo plano.` });
          queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
          setLocation("/approval");
        }
      },
      onError: (err: any) => {
        const msg = err?.message || err?.error || "";
        const isNoNiches  = msg.includes("no_niches") || msg.toLowerCase().includes("nicho");
        const isLockError = msg.includes("429") || msg.toLowerCase().includes("en curso");
        toast({
          title: isNoNiches ? "Sin nichos configurados" : isLockError ? "Generación en curso" : "Error en la Generación",
          description: isNoNiches ? "Primero ve a la página de Nichos y configura al menos uno." : isLockError ? "Ya hay una generación activa. Espera a que termine." : "Ocurrió un error. Intenta de nuevo.",
          variant: "destructive"
        });
      }
    });
  }

  function handleGenerateClick() {
    if (activeNiches.length === 0 && !customTopic.trim()) {
      setNoNichesDialogOpen(true);
      return;
    }
    setConfirmOpen(true);
  }

  async function handleElementUpload() {
    if (!elUploadFile || !elUploadName.trim() || !activeBusinessId) return;
    setElUploading(true);
    try {
      const urlRes = await fetch(`${BASE}/api/elements/upload-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: activeBusinessId }),
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
        body: JSON.stringify({ businessId: activeBusinessId, name: elUploadName.trim(), storageKey: objectPath }),
      });
      if (!createRes.ok) {
        const createErr = await createRes.json().catch(() => ({})) as { message?: string };
        throw new Error(createErr.message ?? "Error registrando el elemento");
      }
      const { element: newEl } = await createRes.json() as { element: { id: number } };
      queryClient.invalidateQueries({ queryKey: ["biz-elements", activeBusinessId] });
      setElUploadFile(null);
      setElUploadPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      setElUploadName("");
      if (newEl?.id) {
        setSelectedElementId(newEl.id);
        setUseDeepElementAI(true);
      }
      toast({ title: "Elemento subido", description: "El elemento se está analizando con IA." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo subir el elemento.", variant: "destructive" });
    } finally {
      setElUploading(false);
    }
  }

  async function handleDeleteElement(elId: number) {
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
      if (selectedElementId === elId) setSelectedElementId(null);
      queryClient.invalidateQueries({ queryKey: ["biz-elements", activeBusinessId] });
      toast({ title: "Elemento eliminado" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo eliminar.", variant: "destructive" });
    } finally {
      setElDeletingId(null);
    }
  }

  async function handleRenameElement(elId: number, newName: string) {
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
      queryClient.invalidateQueries({ queryKey: ["biz-elements", activeBusinessId] });
      setElRenamingId(null);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo renombrar.", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Loading overlay */}
      {generateExtra.isPending && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center px-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
              <Zap className="absolute inset-0 m-auto w-8 h-8 text-primary drop-shadow-[0_0_12px_rgba(0,119,255,0.8)]" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">Generando publicaciones…</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">La IA está creando los textos para cada publicación. Esto puede tardar entre 3 y 8 minutos — no cierres esta página.</p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Banner: negocio activo sin cuentas sociales conectadas */}
      {(() => {
        const globalBizLoaded = activeBusiness.loaded;
        const globalBizId = activeBusiness.id;
        if (!globalBizLoaded || !socialAccountsLoaded || globalBizId == null) return null;
        if (socialAccounts.some(a => a.businessId === globalBizId && a.connected === "true")) return null;
        return (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-yellow-300 font-medium leading-snug">
                Este negocio no tiene cuentas de redes sociales conectadas. Los posts generados no se publicarán automáticamente.
              </p>
              <p className="text-xs text-yellow-400/70 mt-1">
                Ve a <a href="/settings" className="underline underline-offset-2 hover:text-yellow-300 transition-colors">Configuración → Cuentas Sociales</a> para conectar Instagram o TikTok.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Hero */}
      <div className="flex flex-col items-center justify-center py-12 text-center relative overflow-hidden rounded-2xl border border-primary/20 bg-card/30 backdrop-blur-md">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-secondary/20 rounded-full blur-[80px] pointer-events-none"></div>
        <Zap className="w-16 h-16 text-primary mb-6 drop-shadow-[0_0_15px_rgba(0,201,83,0.8)]" />
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-display font-bold text-foreground tracking-tight mb-4">
          Generador de <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Contenido</span>
        </h1>
        <p className="text-base sm:text-xl text-muted-foreground max-w-2xl px-4">
          Genera contenido con IA: imágenes, reels y carruseles. La IA trabaja para ti, sin importar dónde estés.
        </p>
        {activeBusiness.name && (
          <p className="text-sm text-primary/80 font-medium mt-3 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary/60" />
            {activeBusiness.name}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT — Opciones */}
        <div className="lg:col-span-1 space-y-4">
          <button
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="lg:hidden w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border/50 text-sm font-semibold text-foreground hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-muted-foreground" />
              <span>Opciones</span>
              {(selectedNiches.length > 0 || platform !== "both") && (
                <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">Activas</span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${showAdvancedOptions ? "rotate-180" : ""}`} />
          </button>

          <div className={showAdvancedOptions ? "block" : "hidden lg:block"}>
            <Card className="glass-card">
              <CardContent className="p-6 space-y-6">

                {/* Plataformas */}
                <div>
                  <h3 className="text-lg font-display font-bold mb-1 text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                    Plataformas
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">¿En qué redes sociales vas a publicar?</p>
                  <div className="grid gap-3">
                    <button onClick={() => setPlatform("both")} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${platform === "both" ? "bg-primary/20 border-primary/50 text-primary" : "bg-black/20 border-border/50 text-muted-foreground hover:bg-white/5"}`}>
                      <div className="flex -space-x-1"><Instagram className="w-4 h-4" /><PlaySquare className="w-4 h-4" /><span className="font-bold text-sm leading-none mt-0.5">f</span></div>
                      <div><span className="font-medium">Todas las plataformas</span><span className="text-xs opacity-60 ml-2">IG + TikTok + Facebook</span></div>
                    </button>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: "instagram", icon: <Instagram className="w-4 h-4" />, label: "Instagram" },
                        { val: "tiktok", icon: <PlaySquare className="w-4 h-4" />, label: "TikTok" },
                        { val: "facebook", icon: <span className="font-bold text-base leading-none">f</span>, label: "Facebook" },
                      ].map(({ val, icon, label }) => (
                        <button key={val} onClick={() => setPlatform(val)} className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-xs transition-all ${platform === val ? "bg-primary/20 border-primary/50 text-primary" : "bg-black/20 border-border/50 text-muted-foreground hover:bg-white/5"}`}>
                          {icon}<span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tipos de contenido */}
                <div>
                  <h3 className="text-lg font-display font-bold mb-1 text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                    Tipos de Contenido
                  </h3>
                  <div className="flex items-start gap-1.5 mb-3 text-[11px] text-muted-foreground/70 italic">
                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-purple-400/80" />
                    <span>Las historias se generan directamente en formato vertical 9:16.</span>
                  </div>
                  <div className="grid gap-2">
                    {CONTENT_TYPES.map(({ value, label, description, icon: Icon }) => {
                      const active = selectedContentTypes.includes(value);
                      return (
                        <button key={value} onClick={() => toggleContentType(value)} className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${active ? "bg-secondary/20 border-secondary/50 text-secondary" : "bg-black/20 border-border/50 text-muted-foreground hover:bg-white/5"}`}>
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          <div><div className="font-medium text-sm">{label}</div><div className="text-xs opacity-70">{description}</div></div>
                          {active && <div className="ml-auto w-2 h-2 rounded-full bg-secondary" />}
                        </button>
                      );
                    })}
                  </div>
                  {selectedContentTypes.includes("reel") && (
                    <div className="mt-3 p-3 rounded-lg bg-secondary/5 border border-secondary/20">
                      <div className="flex items-center gap-1.5 text-secondary font-medium text-xs mb-2"><span>🎵</span> Género musical preferido para Reels</div>
                      <select value={reelMusicGenre} onChange={e => handleReelMusicGenre(e.target.value)} className="w-full bg-black/30 border border-secondary/30 text-foreground text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-secondary">
                        {REEL_MUSIC_GENRES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1.5 text-primary font-medium mb-1"><Info className="w-3.5 h-3.5" /> Estrategia óptima de publicación</div>
                    <div>📸 <span className="text-foreground/70">Instagram feed:</span> Lun · Mié · Vie · Sáb</div>
                    <div>🎵 <span className="text-foreground/70">TikTok feed:</span> Mar · Jue · Sáb · Dom</div>
                    <div>📖 <span className="text-foreground/70">Historias:</span> Lun a Vie</div>
                    <div className="pt-1 text-primary/70">Horarios óptimos Bogotá: 7am · 12pm · 7pm</div>
                  </div>
                </div>

                {/* Nichos */}
                <div>
                  <h3 className="text-lg font-display font-bold mb-1 text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                    Nichos de Contenido
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">Si no seleccionas ninguno, usa <span className="text-primary">todos</span> los activos.</p>
                  <div className="space-y-3">
                    {nichesLoading ? (
                      <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-6 bg-white/5 animate-pulse rounded"></div>)}</div>
                    ) : activeNiches.length === 0 ? (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>No tienes nichos activos. <button onClick={() => setLocation("/niches")} className="underline font-medium">Configura al menos uno</button> o usa un Tema Personalizado para generar contenido.</span>
                      </div>
                    ) : activeNiches.map(niche => (
                      <div key={niche.id} className="flex items-center space-x-2">
                        <Checkbox id={`niche-${niche.id}`} checked={selectedNiches.includes(niche.id)} onCheckedChange={() => toggleNiche(niche.id)} className="data-[state=checked]:bg-primary border-primary/50" />
                        <label htmlFor={`niche-${niche.id}`} className="text-sm font-medium leading-none cursor-pointer">{niche.name}</label>
                      </div>
                    ))}
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>
        </div>

        {/* RIGHT — Generador */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {generateExtra.isPending ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center min-h-[400px] border border-primary/30 rounded-xl bg-card p-12 text-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                <h2 className="text-xl font-display font-bold text-primary mb-1">Generando {extraCount} publicaciones…</h2>
                <p className="text-muted-foreground text-sm animate-pulse">Buscando los próximos huecos disponibles en el calendario…</p>
              </motion.div>
            ) : (
              <motion.div key="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="border border-primary/30 rounded-xl bg-card/30 p-6 space-y-6">

                {/* Header */}
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <PlusCircle className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-display font-bold text-foreground">Generador</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Rellena los próximos huecos disponibles en el calendario sin duplicar lo que ya existe.</p>
                </div>

                {/* Cantidad */}
                <div>
                  <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-2">
                    Cantidad: <span className="text-primary font-bold text-sm">{extraCount}</span> posts
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="flex-1 w-full">
                      <input type="range" min={1} max={20} value={extraCount} onChange={e => setExtraCount(Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>1</span><span>10</span><span>20</span></div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {[5, 10, 15, 20].map(n => (
                        <button key={n} onClick={() => setExtraCount(n)} className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${extraCount === n ? "bg-primary/30 border-primary/60 text-primary" : "bg-black/20 border-border/50 text-muted-foreground hover:bg-primary/10 hover:border-primary/30"}`}>{n}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Plantillas de contenido */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      Plantillas
                    </p>
                    <button
                      onClick={() => setShowTemplatePanel(p => !p)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        showTemplatePanel
                          ? "bg-primary/20 border-primary/40 text-primary"
                          : "bg-white/5 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70"
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                      {showTemplatePanel ? "Ocultar" : "Usar plantilla"}
                      <ChevronRight className={`w-3 h-3 transition-transform ${showTemplatePanel ? "rotate-90" : ""}`} />
                    </button>
                  </div>

                  {showTemplatePanel && (
                    <div className="rounded-xl border border-primary/20 bg-black/20 p-3 space-y-2">
                      {templatesLoading ? (
                        <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground text-xs">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Cargando plantillas…
                        </div>
                      ) : templates.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">
                          {industryName
                            ? `No hay plantillas para "${industryName}" aún.`
                            : "Configura tu negocio para ver plantillas personalizadas."}
                        </p>
                      ) : (
                        <>
                          {industryName && (
                            <p className="text-[10px] text-muted-foreground/70 px-0.5 mb-1">
                              Plantillas para <span className="text-primary/80">{industryName}</span>
                            </p>
                          )}
                          <div className="grid gap-2">
                            {templates.map(t => (
                              <button
                                key={t.id}
                                onClick={() => applyTemplate(t)}
                                className="text-left flex items-start gap-3 p-2.5 rounded-lg border border-border/30 bg-white/3 hover:bg-primary/10 hover:border-primary/30 transition-all group"
                              >
                                <div className={`mt-0.5 flex-shrink-0 p-1 rounded-md border ${
                                  t.postType === "reel" ? "bg-secondary/20 border-secondary/30 text-secondary" :
                                  t.postType === "carousel" ? "bg-purple-500/20 border-purple-500/30 text-purple-400" :
                                  t.postType === "story" ? "bg-amber-500/20 border-amber-500/30 text-amber-400" :
                                  "bg-primary/20 border-primary/30 text-primary"
                                }`}>
                                  {TEMPLATE_TYPE_ICONS[t.postType] ?? <ImageIcon className="w-3 h-3" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                                      {t.title}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground">
                                      {TEMPLATE_TYPE_LABEL[t.postType]}
                                    </span>
                                    {t.tone && (
                                      <span className="text-[9px] text-muted-foreground/60">· {t.tone}</span>
                                    )}
                                  </div>
                                  {t.description && (
                                    <p className="text-[11px] text-muted-foreground/80 leading-tight mt-0.5 truncate">
                                      {t.description}
                                    </p>
                                  )}
                                </div>
                                <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary/60 flex-shrink-0 mt-1 transition-colors" />
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Integración IA de elemento — Task #293 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3 h-3" />
                      Integración IA de elemento
                    </p>
                    {!planHasElementAi && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        <Lock className="w-2.5 h-2.5" />Negocio / Agencia
                      </span>
                    )}
                  </div>

                  <div className={`rounded-xl border p-3 space-y-2.5 ${planHasElementAi ? "border-fuchsia-500/20 bg-fuchsia-500/5" : "border-border/30 bg-black/10 opacity-60"}`}>
                    {!planHasElementAi ? (
                      <p className="text-[11px] text-muted-foreground/70 text-center py-1">
                        <Lock className="w-3 h-3 inline mr-1" />
                        Disponible en plan Negocio y Agencia. La IA integra tu producto en la escena usando gpt-image-1.
                      </p>
                    ) : (
                      <>
                        {bizElements.length === 0 ? (
                          /* ── Empty state: upload widget inline ── */
                          <div className="space-y-2 py-1">
                            <p className="text-[11px] text-muted-foreground/60 text-center">
                              Sube un elemento de marca para activar la integración IA (PNG recomendado con fondo transparente)
                            </p>
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <span className="flex-1 truncate text-[11px] text-muted-foreground/70 bg-white/5 border border-border/30 rounded px-2 py-1.5">
                                {elUploadFile ? elUploadFile.name : "Elegir imagen…"}
                              </span>
                              <span className="text-[11px] px-2 py-1.5 rounded border border-border/40 bg-white/5 hover:bg-white/10 text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
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
                                className="w-full text-[11px] bg-white/5 border border-border/30 rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50"
                              />
                            )}
                            <button
                              onClick={handleElementUpload}
                              disabled={!elUploadFile || !elUploadName.trim() || elUploading}
                              className="w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {elUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>}
                              {elUploading ? "Subiendo…" : "Subir elemento"}
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-[11px] text-muted-foreground/70">
                              Selecciona un elemento de tu biblioteca para integrarlo en las imágenes del batch:
                            </p>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {bizElements.map(el => {
                                const isDeleting = elDeletingId === el.id;
                                return (
                                  <div key={el.id} className="relative group/el">
                                    <button
                                      title={el.name}
                                      disabled={isDeleting}
                                      onClick={() => {
                                        const isSelected = selectedElementId === el.id;
                                        setSelectedElementId(isSelected ? null : el.id);
                                        setUseDeepElementAI(!isSelected);
                                      }}
                                      className={`relative w-12 h-12 rounded-md border-2 overflow-hidden transition-all ${isDeleting ? "opacity-40" : ""} ${
                                        selectedElementId === el.id
                                          ? "border-fuchsia-500/70 shadow-[0_0_8px_rgba(217,70,219,0.35)]"
                                          : "border-border/30 hover:border-border/60"
                                      }`}
                                    >
                                      {el.thumbUrl ? (
                                        <img src={el.thumbUrl} alt={el.name} className="w-full h-full object-contain bg-white/5" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5 text-[8px] text-muted-foreground px-0.5 text-center leading-tight">{el.name.slice(0, 8)}</div>
                                      )}
                                      {selectedElementId === el.id && (
                                        <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-fuchsia-500 rounded-full flex items-center justify-center">
                                          <svg xmlns="http://www.w3.org/2000/svg" width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                        </div>
                                      )}
                                      {el.analysisStatus === "pending" && (
                                        <div className="absolute bottom-0.5 right-0.5"><Loader2 className="w-2 h-2 animate-spin text-fuchsia-300/70" /></div>
                                      )}
                                    </button>
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
                                    <button
                                      title="Renombrar elemento"
                                      onClick={e => { e.stopPropagation(); setElRenamingId(el.id); setElRenameValue(el.name); }}
                                      className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-full bg-background/90 border border-border/50 hover:border-fuchsia-500/50 text-muted-foreground hover:text-fuchsia-300 flex items-center justify-center opacity-0 group-hover/el:opacity-100 transition-opacity z-10"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                            {elRenamingId !== null && (
                              <div className="flex items-center gap-1.5 mt-1 border border-border/20 rounded p-1.5">
                                <span className="text-[9px] text-muted-foreground/60 shrink-0">Nombre:</span>
                                <input
                                  type="text"
                                  value={elRenameValue}
                                  onChange={e => setElRenameValue(e.target.value.slice(0, 100))}
                                  autoFocus
                                  className="flex-1 text-[10px] bg-white/5 border border-border/30 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-fuchsia-500/50"
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleRenameElement(elRenamingId, elRenameValue);
                                    if (e.key === "Escape") setElRenamingId(null);
                                  }}
                                />
                                <button
                                  onClick={() => handleRenameElement(elRenamingId, elRenameValue)}
                                  disabled={!elRenameValue.trim()}
                                  className="text-[9px] px-1.5 py-0.5 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors disabled:opacity-40"
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setElRenamingId(null)}
                                  className="text-[9px] px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {selectedElementId != null && (
                          <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                            <div
                              onClick={() => setUseDeepElementAI(p => !p)}
                              className={`relative w-8 h-4.5 rounded-full transition-colors cursor-pointer ${useDeepElementAI ? "bg-fuchsia-500" : "bg-white/10"}`}
                            >
                              <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${useDeepElementAI ? "translate-x-4" : "translate-x-0.5"}`} />
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              IA integra el elemento
                              {useDeepElementAI && elementAiCostPerImage != null && <span className="ml-1.5 text-fuchsia-300 font-medium">+{elementAiCostPerImage} cr por imagen</span>}
                            </span>
                          </label>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Briefing de texto */}
                <div>
                  <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-1">
                    Tema o Briefing <span className="normal-case font-normal text-muted-foreground">(opcional)</span>
                  </p>
                  <Textarea
                    placeholder="Ej: planta de reciclaje con paneles solares en el techo, ambiente industrial moderno..."
                    value={customTopic}
                    onChange={e => setCustomTopic(e.target.value)}
                    rows={3}
                    className="bg-black/30 border-primary/20 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                {/* Botón generar */}
                <button
                  onClick={handleGenerateClick}
                  disabled={generateExtra.isPending}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary/20 border border-primary/40 text-primary font-bold text-base hover:bg-primary/30 hover:border-primary/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,201,83,0.1)]"
                >
                  <Sparkles className="w-5 h-5" />
                  Generar {extraCount} publicaciones
                </button>
                <p className="text-xs text-muted-foreground text-center -mt-4">
                  Busca hasta 120 días hacia adelante · Nunca duplica · Respeta la estrategia de cada plataforma
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Diálogo preventivo — sin nichos configurados */}
      <AlertDialog open={noNichesDialogOpen} onOpenChange={setNoNichesDialogOpen}>
        <AlertDialogContent className="bg-card border border-amber-500/30 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              Sin nichos configurados
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground leading-relaxed pt-1">
              No tienes nichos de contenido activos. Agregar nichos mejora significativamente la calidad y relevancia de los posts generados.
              <br /><br />
              ¿Deseas continuar de todas formas o ir a configurar tus nichos primero?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <AlertDialogCancel
              onClick={() => { setNoNichesDialogOpen(false); setLocation("/niches"); }}
              className="bg-transparent border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
            >
              Ir a Nichos
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setNoNichesDialogOpen(false); doGenerate(); }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Continuar sin nichos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmación */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-card border border-border/60 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <CreditCard className="w-5 h-5 text-primary shrink-0" />
              ¿Confirmar generación?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                {/* Desglose por tipo con costo */}
                <div className="rounded-xl border border-border/50 bg-background/60 p-3 space-y-1.5 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-0.5">Se van a crear ~</p>
                  {typeBreakdown.map(t => (
                    <div key={t.type} className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t.label} <span className="text-muted-foreground/50">({t.count} × {t.creditCost} crédito{t.creditCost !== 1 ? "s" : ""})</span>
                      </span>
                      <span className="font-semibold text-amber-400">−{t.count * t.creditCost}</span>
                    </div>
                  ))}
                  {elementAiExtraCost > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        IA + Elemento <span className="text-muted-foreground/50">({elementAiCostPerImage} cr × {elementAiImageCount} imagen{elementAiImageCount !== 1 ? "es" : ""})</span>
                      </span>
                      <span className="font-semibold text-fuchsia-400">−{elementAiExtraCost}</span>
                    </div>
                  )}
                  <div className="border-t border-border/40 pt-1.5 flex items-center justify-between font-bold">
                    <span className="text-muted-foreground">Total a descontar</span>
                    <span className="text-amber-400">−{totalCredits}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 pt-0.5">Distribución aproximada según calendario disponible</p>
                </div>

                {/* Resumen de créditos */}
                <div className="rounded-xl border border-border/50 bg-background/60 p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Créditos actuales</span>
                    <span className="font-semibold text-foreground">{creditsRemaining}</span>
                  </div>
                  <div className="border-t border-border/40 pt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">Créditos después</span>
                    <span className={`font-bold ${notEnoughCredits ? "text-red-400" : creditsAfter <= 5 ? "text-amber-400" : "text-primary"}`}>
                      {notEnoughCredits ? "Insuficientes" : creditsAfter}
                    </span>
                  </div>
                </div>

                {/* Advertencia si no hay suficientes créditos */}
                {notEnoughCredits && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>No tienes créditos suficientes. Necesitas {totalCredits} crédito{totalCredits !== 1 ? "s" : ""} pero tienes {creditsRemaining} disponible{creditsRemaining !== 1 ? "s" : ""}.</span>
                  </div>
                )}

                {/* Advertencia pocos créditos */}
                {!notEnoughCredits && creditsAfter <= 5 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Quedarás con pocos créditos este mes.</span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Los créditos se descuentan al generar, no al publicar.
                  {customTopic && <><br /><span className="text-primary/80">Tema: "{customTopic.slice(0, 60)}{customTopic.length > 60 ? "…" : ""}"</span></>}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel onClick={() => setConfirmOpen(false)} className="bg-transparent border-border/60 text-muted-foreground hover:bg-white/5 hover:text-foreground">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmOpen(false); doGenerate(); }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Sí, generar {extraCount} publicaciones
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
