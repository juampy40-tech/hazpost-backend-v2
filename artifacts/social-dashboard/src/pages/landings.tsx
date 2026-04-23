import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Sparkles, Loader2, Copy, ExternalLink, Users, Trash2,
  FileText, ChevronDown, ChevronUp, X, Plus, Eye, Sun, Zap, Car, Handshake, ImageIcon, RefreshCw, Upload, RotateCcw, Pencil
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";

interface LandingPage {
  id: number;
  slug: string;
  title: string;
  description: string;
  ctaText: string;
  includeForm: boolean;
  status: string;
  publicUrl: string;
  createdAt: string;
  heroImageVariantId?: number | null;
}

interface LandingLead {
  id: number;
  landingId: number;
  name: string;
  phone: string;
  email: string;
  city: string;
  createdAt: string;
}

type LandingType = "solar_ppa" | "solar_compra" | "carros_electricos" | "alianza";

interface LandingTypeOption {
  id: LandingType;
  label: string;
  icon: React.ReactNode;
  description: string;
  template: {
    title: string;
    description: string;
    ctaText: string;
    includeForm: boolean;
    objective: string;
  };
}

const LANDING_TYPES: LandingTypeOption[] = [
  {
    id: "solar_ppa",
    label: "Solar PPA",
    icon: <Zap className="w-5 h-5" />,
    description: "Sin inversión, 20% ahorro",
    template: {
      title: "Energía solar sin inversión — PPA ECO",
      description: "Landing para propietarios de negocios en Cali con facturas altas de energía. ECO ofrece el contrato PPA: instala los paneles sin costo inicial y el cliente paga 20% menos en su factura desde el día 1. Al final de 15 años el sistema es 100% del cliente. Ideal para comercios, restaurantes y empresas.",
      ctaText: "Quiero mi ahorro del 20%",
      includeForm: true,
      objective: "Capturar leads de propietarios de negocios interesados en reducir su factura sin inversión",
    },
  },
  {
    id: "solar_compra",
    label: "Solar Compra",
    icon: <Sun className="w-5 h-5" />,
    description: "Hasta 100% ahorro, tuyo desde el día 1",
    template: {
      title: "Compra tu sistema solar — hasta 100% de ahorro",
      description: "Landing para propietarios de hogares y negocios que quieren ser dueños de su sistema solar desde el primer día. ECO instala paneles solares con retorno de inversión en 2-5 años. El cliente ahorra hasta 100% en su factura y el sistema aumenta el valor de su propiedad.",
      ctaText: "Calcular mi ahorro",
      includeForm: false,
      objective: "Llevar al usuario al simulador de ahorro en eco-col.com o capturar interés en la compra directa",
    },
  },
  {
    id: "carros_electricos",
    label: "Carros Eléctricos",
    icon: <Car className="w-5 h-5" />,
    description: "Carga tu EV con el sol",
    template: {
      title: "Carga tu carro eléctrico con el sol",
      description: "Landing para dueños de carros eléctricos o personas que piensan comprar uno en Cali. ECO instala cargadores para vehículos eléctricos y puede combinar el servicio con un sistema solar para que el carro se cargue completamente gratis con energía solar. Sin gasolina, sin facturas altas.",
      ctaText: "Cotizar instalación gratis",
      includeForm: true,
      objective: "Capturar leads de propietarios de EVs que quieren instalar cargador en su casa o empresa",
    },
  },
  {
    id: "alianza",
    label: "Alianza",
    icon: <Handshake className="w-5 h-5" />,
    description: "ECO + socio estratégico",
    template: {
      title: "Alianza ECO + Carros Eléctricos",
      description: "Alianza entre ECO y un importador de carros eléctricos de China. ECO instala paneles solares, el socio vende el carro eléctrico. Juntos ofrecen el combo: maneja tu carro eléctrico con energía solar propia — sin pagar más de energía ni gasolina. Movilidad 100% limpia y gratuita con el sol de Cali.",
      ctaText: "Quiero mi combo",
      includeForm: true,
      objective: "Capturar leads interesados en el combo solar + carro eléctrico",
    },
  },
];

function useLandings() {
  return useQuery<LandingPage[]>({
    queryKey: ["landings"],
    queryFn: async () => {
      const res = await fetch("/api/landings?status=active");
      if (!res.ok) throw new Error("Error cargando landing pages");
      return res.json();
    },
  });
}

function useLandingLeads(id: number | null) {
  return useQuery<LandingLead[]>({
    queryKey: ["landing-leads", id],
    queryFn: async () => {
      const res = await fetch(`/api/landings/${id}/leads`);
      if (!res.ok) throw new Error("Error cargando leads");
      return res.json();
    },
    enabled: id !== null,
  });
}

function useCreateLanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      objective?: string;
      ctaText: string;
      includeForm: boolean;
      contactPhone?: string;
    }) => {
      const res = await fetch("/api/landings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error generando la landing");
      return res.json() as Promise<LandingPage>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landings"] });
    },
  });
}

function useDeleteLanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/landings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error archivando landing");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landings"] });
    },
  });
}

function useGenerateHeroImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/landings/${id}/generate-hero`, { method: "POST" });
      if (!res.ok) throw new Error("Error iniciando generación de imagen");
      return res.json();
    },
    onSuccess: () => {
      // Refresh after 40 seconds to pick up the newly saved heroImageVariantId
      setTimeout(() => qc.invalidateQueries({ queryKey: ["landings"] }), 40000);
    },
  });
}

function useRegenerateLanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/landings/${id}/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error("Error regenerando landing");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landings"] });
    },
  });
}

function LeadsPanel({ landing }: { landing: LandingPage }) {
  const { data: leads, isLoading } = useLandingLeads(landing.id);
  return (
    <div className="mt-4 border border-blue-500/20 rounded-xl overflow-hidden">
      <div className="bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Leads captados ({leads?.length ?? "…"})
      </div>
      {isLoading ? (
        <div className="p-4 text-center text-muted-foreground text-sm">Cargando leads…</div>
      ) : !leads?.length ? (
        <div className="p-4 text-center text-muted-foreground text-sm">Aún no hay leads para esta landing.</div>
      ) : (
        <div className="divide-y divide-border/30">
          {leads.map((lead) => (
            <div key={lead.id} className="px-4 py-3 grid grid-cols-4 gap-2 text-sm">
              <span className="font-medium truncate">{lead.name || "—"}</span>
              <span className="text-muted-foreground truncate">{lead.phone || "—"}</span>
              <span className="text-muted-foreground truncate">{lead.email || "—"}</span>
              <span className="text-muted-foreground truncate">{lead.city || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewModal({
  url,
  html,
  label,
  onClose,
}: {
  url?: string;
  html?: string;
  label?: string;
  onClose: () => void;
}) {
  const blobUrl = React.useMemo(() => {
    if (html) {
      return URL.createObjectURL(new Blob([html], { type: "text/html" }));
    }
    return null;
  }, [html]);

  React.useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const src = blobUrl ?? url ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.88)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
        style={{ height: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0d1b3e] border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Eye className="w-4 h-4 text-primary" />
            <span className="font-semibold">{label ?? "Vista previa"}</span>
            {html && (
              <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                Borrador — no publicado
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all"
                title="Abrir en pestaña"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-red-500/30 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <iframe
          src={src}
          title="Vista previa landing"
          className="w-full flex-1 border-0"
          style={{ background: "white" }}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}

function LandingCard({
  landing,
  onPreview,
}: {
  landing: LandingPage;
  onPreview: (url: string) => void;
}) {
  const { toast } = useToast();
  const deleteLanding = useDeleteLanding();
  const generateHero = useGenerateHeroImage();
  const regenerate = useRegenerateLanding();
  const [showLeads, setShowLeads] = useState(false);

  const handleGenerateHero = () => {
    generateHero.mutate(landing.id, {
      onSuccess: () => toast({ title: "Generando imagen…", description: "La imagen de hero se está generando con DALL-E. Estará lista en ~30 segundos." }),
      onError: () => toast({ title: "Error al generar imagen", variant: "destructive" }),
    });
  };

  const handleRegenerate = () => {
    if (!confirm(`¿Regenerar el HTML de "${landing.title}" con la plantilla actualizada? Esto reemplazará el contenido actual.`)) return;
    regenerate.mutate(landing.id, {
      onSuccess: () => toast({ title: "✓ Landing regenerada", description: "HTML actualizado con la plantilla más reciente." }),
      onError: () => toast({ title: "Error al regenerar", variant: "destructive" }),
    });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(landing.publicUrl);
    toast({ title: "URL copiada", description: landing.publicUrl });
  };

  const handleDelete = () => {
    if (!confirm(`¿Archivar "${landing.title}"?`)) return;
    deleteLanding.mutate(landing.id, {
      onSuccess: () => toast({ title: "Landing archivada" }),
      onError: () => toast({ title: "Error al archivar", variant: "destructive" }),
    });
  };

  return (
    <Card className="glass-card border-primary/20 overflow-hidden">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-primary flex-shrink-0" />
              <h3 className="font-bold text-foreground truncate">{landing.title}</h3>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{landing.description}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleDelete}
              disabled={deleteLanding.isPending}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Archivar landing"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 border border-border/30">
          <span className="text-xs text-blue-300 font-mono truncate flex-1">{landing.publicUrl}</span>
          <button onClick={copyUrl} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" title="Copiar URL">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <a href={landing.publicUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0" title="Abrir landing">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>CTA: <span className="text-foreground font-medium">{landing.ctaText}</span></span>
          <span>{landing.includeForm ? "✓ Con formulario" : "Sin formulario"}</span>
        </div>

        {/* Hero image status */}
        <div className="flex items-center justify-between">
          {landing.heroImageVariantId ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <ImageIcon className="w-3.5 h-3.5" />
              Hero image lista
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-400/70">
              <ImageIcon className="w-3.5 h-3.5" />
              Sin imagen de hero
            </span>
          )}
          <button
            onClick={handleGenerateHero}
            disabled={generateHero.isPending}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-purple-500/25 bg-purple-500/8 text-purple-300 text-xs font-medium hover:bg-purple-500/15 transition-all disabled:opacity-50"
            title={landing.heroImageVariantId ? "Regenerar imagen DALL-E" : "Generar imagen DALL-E para el hero"}
          >
            {generateHero.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {landing.heroImageVariantId ? "Regenerar" : "Generar imagen"}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onPreview(landing.publicUrl)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-primary/20 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-all"
          >
            <Eye className="w-3.5 h-3.5" />
            Vista previa
          </button>
          <a
            href={`${landing.publicUrl}?edit=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-amber-500/30 bg-amber-500/8 text-amber-300 text-xs font-semibold hover:bg-amber-500/15 transition-all"
            title="Abrir editor visual de la landing"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editor visual
          </a>
          <button
            onClick={() => setShowLeads(!showLeads)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-blue-500/20 bg-blue-500/5 text-blue-300 text-xs font-semibold hover:bg-blue-500/10 transition-all"
          >
            <Users className="w-3.5 h-3.5" />
            Leads
            {showLeads ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        <button
          onClick={handleRegenerate}
          disabled={regenerate.isPending}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-orange-500/20 bg-orange-500/5 text-orange-300 text-xs font-medium hover:bg-orange-500/12 transition-all disabled:opacity-50"
          title="Regenerar HTML con la plantilla actualizada"
        >
          {regenerate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {regenerate.isPending ? "Regenerando…" : "Regenerar HTML con última plantilla"}
        </button>

        <AnimatePresence>
          {showLeads && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <LeadsPanel landing={landing} />
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ── Brand logo management card ─────────────────────────────────────────────
type LogoVariant = "blue" | "white" | "icon";

function BrandLogoCard() {
  const { toast } = useToast();
  const [uploading, setUploading] = React.useState<LogoVariant | null>(null);
  const [resetting, setResetting] = React.useState<LogoVariant | null>(null);
  const [cacheBust, setCacheBust] = React.useState(() => Date.now());

  const VARIANTS: { id: LogoVariant; label: string; bg: string; imgBg: string }[] = [
    { id: "blue",  label: "Logo azul (nav)",    bg: "bg-white",         imgBg: "#fff" },
    { id: "white", label: "Logo blanco (hero)",  bg: "bg-[#0a0e1a]",     imgBg: "#0a0e1a" },
  ];

  async function handleUpload(variant: LogoVariant, file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Solo se aceptan imágenes (PNG, JPG, SVG)", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "El archivo es muy grande (máx 2 MB)", variant: "destructive" });
      return;
    }
    setUploading(variant);
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/brand/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant, imageData }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error subiendo logo");
      setCacheBust(Date.now());
      toast({ title: `Logo ${variant === "blue" ? "azul" : "blanco"} actualizado ✓` });
    } catch (e: any) {
      toast({ title: e.message ?? "Error subiendo logo", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }

  async function handleReset(variant: LogoVariant) {
    setResetting(variant);
    try {
      await fetch(`/api/brand/logo?v=${variant}`, { method: "DELETE" });
      setCacheBust(Date.now());
      toast({ title: `Logo ${variant === "blue" ? "azul" : "blanco"} restaurado al predeterminado` });
    } finally {
      setResetting(null);
    }
  }

  return (
    <Card className="glass-card border-primary/20 bg-primary/5">
      <CardContent className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-primary flex items-center gap-2">
          <ImageIcon className="w-4 h-4" /> Logo de marca
        </h3>
        <p className="text-xs text-muted-foreground">
          Estos logos aparecen en todas las landing pages — en la barra de navegación y en el hero.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {VARIANTS.map((v) => (
            <div key={v.id} className="space-y-2">
              <div
                className={`rounded-xl border border-border/30 flex items-center justify-center p-3 h-20 ${v.bg}`}
              >
                <img
                  key={cacheBust}
                  src={`/api/brand/logo?v=${v.id}&_=${cacheBust}`}
                  alt={`ECO Logo ${v.id}`}
                  style={{ maxHeight: 48, maxWidth: "100%", objectFit: "contain" }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-center font-medium">{v.label}</p>
              <div className="flex gap-1">
                <label
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary text-[10px] font-semibold cursor-pointer hover:bg-primary/20 transition-colors"
                >
                  {uploading === v.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  {uploading === v.id ? "Subiendo…" : "Cambiar"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(v.id, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={() => handleReset(v.id)}
                  disabled={resetting === v.id}
                  title="Restaurar logo ECO predeterminado"
                  className="p-1.5 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors disabled:opacity-40"
                >
                  {resetting === v.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground/60">
          PNG o JPG transparente recomendado. Máx 2 MB. Los logos nuevos se aplicarán a futuras landings.
        </p>
      </CardContent>
    </Card>
  );
}

export default function Landings() {
  const { toast } = useToast();
  const { data: landings, isLoading } = useLandings();
  const createLanding = useCreateLanding();

  const [showForm, setShowForm] = useState(false);
  const descRef = React.useRef<HTMLTextAreaElement>(null);
  const [selectedType, setSelectedType] = useState<LandingType>("solar_ppa");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [ctaText, setCtaText] = useState("Quiero saber más");
  const [includeForm, setIncludeForm] = useState(true);
  const [contactPhone, setContactPhone] = useState("");

  type SuggestTarget = "title" | "cta" | "description" | null;
  const [suggestTarget, setSuggestTarget] = useState<SuggestTarget>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const handleSuggest = async (field: "title" | "cta" | "description", current: string) => {
    if (!current.trim()) {
      toast({ title: "Escribe algo primero para obtener alternativas", variant: "destructive" });
      return;
    }
    setSuggestTarget(field);
    setSuggestions([]);
    setIsSuggesting(true);
    try {
      const res = await fetch("/api/landings/suggest-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, current, context: description, landingType: selectedType }),
      });
      if (!res.ok) throw new Error("Error");
      const data = await res.json() as { alternatives: string[] };
      setSuggestions(data.alternatives ?? []);
    } catch {
      toast({ title: "Error al generar sugerencias", variant: "destructive" });
      setSuggestTarget(null);
    } finally {
      setIsSuggesting(false);
    }
  };

  const applySuggestion = (field: SuggestTarget, value: string) => {
    if (field === "title") setTitle(value);
    else if (field === "cta") setCtaText(value);
    else if (field === "description") setDescription(value);
    setSuggestions([]);
    setSuggestTarget(null);
  };

  const clearSuggestions = () => { setSuggestions([]); setSuggestTarget(null); };

  type PreviewState =
    | { kind: "url"; url: string; label?: string }
    | { kind: "html"; html: string; label?: string }
    | null;
  const [preview, setPreview] = useState<PreviewState>(null);
  const [isDraftPreviewing, setIsDraftPreviewing] = useState(false);
  const autoPreviewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyType = (type: LandingTypeOption) => {
    setSelectedType(type.id);
    setTitle(type.template.title);
    setDescription(type.template.description);
    setCtaText(type.template.ctaText);
    setIncludeForm(type.template.includeForm);
    setObjective(type.template.objective);
    setShowForm(true);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setObjective("");
    setCtaText("Quiero saber más");
    setIncludeForm(true);
  };

  const fetchDraftHtml = React.useCallback(async (): Promise<void> => {
    if (!title.trim() || !description.trim()) return;
    setIsDraftPreviewing(true);
    try {
      const res = await fetch("/api/landings/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          objective: objective.trim() || undefined,
          ctaText,
          includeForm,
          contactPhone: contactPhone.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Error al previsualizar");
      const data: { html: string } = await res.json();
      setPreview((p) => ({ kind: "html", html: data.html, label: title.trim() }));
    } catch {
      toast({ title: "Error al generar la vista previa", variant: "destructive" });
    } finally {
      setIsDraftPreviewing(false);
    }
  }, [title, description, objective, ctaText, includeForm, contactPhone, toast]);

  const handleDraftPreview = async () => {
    if (!title.trim() || !description.trim()) {
      toast({ title: "Completa el título y la descripción para previsualizar", variant: "destructive" });
      return;
    }
    await fetchDraftHtml();
  };

  React.useEffect(() => {
    if (!showForm) return;
    if (!title.trim() || !description.trim()) return;
    if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current);
    autoPreviewTimerRef.current = setTimeout(() => {
      fetchDraftHtml();
    }, 2500);
    return () => {
      if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current);
    };
  }, [title, description, objective, ctaText, includeForm, contactPhone]);

  const handleCreate = () => {
    if (!title.trim() || !description.trim()) {
      toast({ title: "Completa el título y la descripción", variant: "destructive" });
      return;
    }
    createLanding.mutate(
      { title: title.trim(), description: description.trim(), objective: objective.trim() || undefined, ctaText, includeForm, contactPhone: contactPhone.trim() || undefined },
      {
        onSuccess: (landing) => {
          toast({
            title: "¡Landing generada!",
            description: `URL pública lista: ${landing.publicUrl}`,
          });
          setPreview({ kind: "url", url: landing.publicUrl, label: landing.title });
          resetForm();
          setShowForm(false);
        },
        onError: () => {
          toast({ title: "Error al generar la landing", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Preview Modal */}
      {preview && (
        <PreviewModal
          url={preview.kind === "url" ? preview.url : undefined}
          html={preview.kind === "html" ? preview.html : undefined}
          label={preview.label}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Hero */}
      <div className="flex flex-col items-center justify-center py-10 text-center relative overflow-hidden rounded-2xl border border-primary/20 bg-card/30 backdrop-blur-md">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none"></div>
        <Globe className="w-14 h-14 text-primary mb-5 drop-shadow-[0_0_15px_rgba(0,119,255,0.6)]" />
        <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight mb-3">
          Landing Pages <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">con IA</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl px-4">
          Páginas de alta conversión con gráficas de ahorro, calculadora solar y testimonios — generadas por IA en segundos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Form */}
        <div className="lg:col-span-1 space-y-5">
          {/* Type selector */}
          <Card className="glass-card border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-yellow-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Tipo de landing
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {LANDING_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => applyType(type)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      selectedType === type.id && showForm
                        ? "border-yellow-400/60 bg-yellow-400/15 text-yellow-100"
                        : "border-yellow-500/20 bg-yellow-500/5 text-yellow-200/70 hover:bg-yellow-500/12 hover:text-yellow-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="opacity-80">{type.icon}</span>
                      <span className="text-xs font-bold">{type.label}</span>
                    </div>
                    <div className="text-yellow-300/50 text-[10px] leading-tight">{type.description}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Create form — trigger card */}
          <Card className="glass-card">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Nueva Landing
              </h3>
              <button
                onClick={() => setShowForm(true)}
                className="w-full py-3 rounded-xl border border-dashed border-primary/40 text-primary/70 text-sm hover:bg-primary/5 hover:border-primary/60 transition-all"
              >
                + Crear nueva landing page
              </button>
              <p className="text-[10px] text-muted-foreground/50 text-center">
                Puedes pegar instrucciones detalladas o un brief completo
              </p>
            </CardContent>
          </Card>

          {/* Creation Dialog — wide modal with auto-resize description */}
          <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); resetForm(); } }}>
            <DialogContent className="max-w-3xl w-full max-h-[92vh] overflow-y-auto bg-card border border-border/60 shadow-2xl p-0">
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/30">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Nueva Landing Page
                    {selectedType && (
                      <span className="text-xs font-normal bg-primary/15 text-primary px-2 py-0.5 rounded-full ml-1">
                        {LANDING_TYPES.find(t => t.id === selectedType)?.label ?? selectedType}
                      </span>
                    )}
                  </DialogTitle>
                  <DialogClose className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors">
                    <X className="w-4 h-4" />
                  </DialogClose>
                </div>
              </DialogHeader>

              <div className="px-6 py-5 space-y-5">
                {/* Row 1: Title (full width) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Título de la landing *</label>
                    <button
                      type="button"
                      onClick={() => suggestTarget === "title" && suggestions.length ? clearSuggestions() : handleSuggest("title", title)}
                      disabled={isSuggesting && suggestTarget !== "title"}
                      className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-40"
                    >
                      {isSuggesting && suggestTarget === "title" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {suggestTarget === "title" && suggestions.length ? "Cerrar" : "✨ IA Alternativas"}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej: Paneles Solares y Deepal S05/S07 en Cali | Ahorra hasta $60M"
                    className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-black/30 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
                    maxLength={120}
                  />
                  {suggestTarget === "title" && suggestions.length > 0 && (
                    <div className="mt-2 rounded-xl border border-purple-500/30 bg-purple-500/8 overflow-hidden">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-purple-400 uppercase tracking-wider border-b border-purple-500/20">
                        Alternativas — clic para aplicar
                      </div>
                      {suggestions.map((s, i) => (
                        <button key={i} type="button" onClick={() => applySuggestion("title", s)}
                          className="w-full text-left px-3 py-2 text-xs text-purple-200 hover:bg-purple-500/15 transition-colors border-b border-purple-500/10 last:border-0">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Row 2: Objective | CTA side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Objetivo de la campaña</label>
                    <input
                      type="text"
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Ej: Capturar leads de restaurantes con facturas altas"
                      className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-black/30 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Texto del botón CTA</label>
                      <button
                        type="button"
                        onClick={() => suggestTarget === "cta" && suggestions.length ? clearSuggestions() : handleSuggest("cta", ctaText)}
                        disabled={isSuggesting && suggestTarget !== "cta"}
                        className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-40"
                      >
                        {isSuggesting && suggestTarget === "cta" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {suggestTarget === "cta" && suggestions.length ? "Cerrar" : "✨ IA"}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      placeholder="Quiero saber más"
                      className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-black/30 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
                      maxLength={60}
                    />
                    {suggestTarget === "cta" && suggestions.length > 0 && (
                      <div className="mt-2 rounded-xl border border-purple-500/30 bg-purple-500/8 overflow-hidden">
                        {suggestions.map((s, i) => (
                          <button key={i} type="button" onClick={() => applySuggestion("cta", s)}
                            className="w-full text-left px-3 py-2 text-xs text-purple-200 hover:bg-purple-500/15 transition-colors border-b border-purple-500/10 last:border-0">
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 3: Description — full width, auto-resize, no char limit enforced visually */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Instrucciones / Brief completo *
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => suggestTarget === "description" && suggestions.length ? clearSuggestions() : handleSuggest("description", description)}
                        disabled={isSuggesting && suggestTarget !== "description"}
                        className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-40"
                      >
                        {isSuggesting && suggestTarget === "description" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {suggestTarget === "description" && suggestions.length ? "Cerrar" : "✨ IA Alternativas"}
                      </button>
                      <span className={`text-[10px] tabular-nums ${description.length > 7500 ? "text-yellow-400" : "text-muted-foreground/40"}`}>
                        {description.length.toLocaleString()} / 8 000
                      </span>
                    </div>
                  </div>
                  <textarea
                    ref={descRef}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      const el = e.target;
                      el.style.height = "auto";
                      el.style.height = Math.min(el.scrollHeight, 520) + "px";
                    }}
                    placeholder={"Pega aquí tu brief completo, instrucciones SEO, productos, precios, público objetivo…\n\nEjemplo:\nActúa como experto en SEO. Genera una landing para Cali con PPA solar (0 inversión, 20% ahorro) y Deepal S05 ($108M con matrícula). Incluye FAQ, tabla comparativa, schema JSON-LD y formulario de leads."}
                    className="w-full px-3 py-3 rounded-xl border border-border/50 bg-black/30 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-muted-foreground/30 resize-none leading-relaxed"
                    style={{ minHeight: 200, maxHeight: 520, overflowY: "auto" }}
                    maxLength={8000}
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    Puedes pegar prompts detallados, briefings completos, instrucciones de SEO o cualquier especificación técnica.
                  </p>
                  {suggestTarget === "description" && suggestions.length > 0 && (
                    <div className="mt-2 rounded-xl border border-purple-500/30 bg-purple-500/8 overflow-hidden">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-purple-400 uppercase tracking-wider border-b border-purple-500/20">
                        Alternativas — clic para aplicar
                      </div>
                      {suggestions.map((s, i) => (
                        <button key={i} type="button" onClick={() => applySuggestion("description", s)}
                          className="w-full text-left px-3 py-2 text-xs text-purple-200 hover:bg-purple-500/15 transition-colors border-b border-purple-500/10 last:border-0">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Row 4: Phone | Form toggle side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Teléfono de contacto</label>
                    <input
                      type="text"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="3011285672"
                      className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-black/30 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
                      maxLength={15}
                    />
                    <p className="text-[10px] text-muted-foreground/50 mt-1">Sin prefijo +57. Usado en WhatsApp y tel: links.</p>
                  </div>
                  <div className="flex items-center gap-3 pb-1">
                    <button
                      onClick={() => setIncludeForm(!includeForm)}
                      className={`w-10 h-6 rounded-full transition-all relative flex-shrink-0 ${includeForm ? "bg-primary" : "bg-border"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${includeForm ? "left-5" : "left-1"}`} />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {includeForm ? "Con formulario de leads" : "Solo CTA a WhatsApp"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="px-6 pb-6 space-y-3 border-t border-border/20 pt-4">
                <button
                  onClick={handleDraftPreview}
                  disabled={isDraftPreviewing || createLanding.isPending || !title.trim() || !description.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-yellow-500/40 bg-yellow-500/8 text-yellow-200 text-sm font-semibold hover:bg-yellow-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDraftPreviewing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando vista previa…</>
                  ) : (
                    <><Eye className="w-3.5 h-3.5" /> Vista previa borrador (sin guardar)</>
                  )}
                </button>
                {isDraftPreviewing && (
                  <p className="text-xs text-center text-yellow-300/60 animate-pulse">
                    La IA genera una vista previa sin publicar — 15–30 segundos…
                  </p>
                )}
                <Button
                  onClick={handleCreate}
                  disabled={createLanding.isPending || isDraftPreviewing || !title.trim() || !description.trim()}
                  className="w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 text-base"
                >
                  {createLanding.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando con IA…</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Generar y Publicar</>
                  )}
                </Button>
                {createLanding.isPending && (
                  <p className="text-xs text-center text-muted-foreground animate-pulse">
                    La IA está construyendo la página… puede tomar 15–30 segundos.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Brand logos */}
          <BrandLogoCard />

          {/* Info card */}
          <Card className="glass-card border-secondary/20 bg-secondary/5">
            <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
              <div className="text-secondary font-semibold text-sm flex items-center gap-1.5 mb-2">
                <FileText className="w-4 h-4" /> ¿Qué incluye cada landing?
              </div>
              <div className="flex gap-2"><span className="text-primary font-bold">✓</span> Hero con gráficos solares y métricas</div>
              <div className="flex gap-2"><span className="text-primary font-bold">✓</span> Gráfica de ahorro a 10 años (Chart.js)</div>
              <div className="flex gap-2"><span className="text-primary font-bold">✓</span> Calculadora solar interactiva</div>
              <div className="flex gap-2"><span className="text-primary font-bold">✓</span> Testimonios + badges de confianza</div>
              <div className="flex gap-2"><span className="text-primary font-bold">✓</span> FAQ acordeón + footer completo</div>
              <div className="flex gap-2"><span className="text-primary font-bold">✓</span> CTA a WhatsApp o formulario de leads</div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Landing list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold text-foreground">
              Mis Landing Pages <span className="text-muted-foreground text-base font-normal">({landings?.length ?? 0})</span>
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : !landings?.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border/30 rounded-2xl">
              <Globe className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">Aún no has creado ninguna landing page.</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Elige un tipo de landing a la izquierda para empezar.</p>
            </div>
          ) : (
            <AnimatePresence>
              {landings.map((landing) => (
                <motion.div
                  key={landing.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <LandingCard landing={landing} onPreview={(url) => setPreview({ kind: "url", url, label: landing.title })} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
