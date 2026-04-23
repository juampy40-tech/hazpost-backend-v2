import { useState, useEffect, useCallback, useRef } from "react";
import { Building2, Plus, Edit2, Trash2, CheckCircle2, RefreshCw, X, Save, Star, Globe, Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { DeleteBusinessModal } from "@/components/DeleteBusinessModal";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface IndustryCatalogEntry {
  name: string;
  slug: string;
  subcategories: { name: string; slug: string }[];
}

async function fetchIndustryCatalog(): Promise<IndustryCatalogEntry[]> {
  try {
    const res = await fetch(`${BASE}/api/industries`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.industries ?? [];
  } catch {
    return [];
  }
}

const TONES = [
  { value: "formal",         label: "👔 Formal — profesional y corporativo" },
  { value: "cercano",        label: "🤝 Cercano — amigable y personal" },
  { value: "técnico",        label: "⚙️ Técnico — detallado y experto" },
  { value: "inspiracional",  label: "🚀 Inspiracional — motivador y aspiracional" },
  { value: "divertido",      label: "😄 Divertido — humor y entretenimiento" },
];

const SELECT_CLS = "w-full h-9 rounded-md border border-input bg-background/60 px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground";

interface RefImage { base64: string; analysis: string; addedAt: string; }

const GOOGLE_FONTS_50 = [
  { value: "inter",        label: "Inter",              font: "'Inter', sans-serif"                   },
  { value: "poppins",      label: "Poppins",            font: "'Poppins', sans-serif"                 },
  { value: "montserrat",   label: "Montserrat",         font: "'Montserrat', sans-serif"              },
  { value: "lato",         label: "Lato",               font: "'Lato', sans-serif"                    },
  { value: "raleway",      label: "Raleway",            font: "'Raleway', sans-serif"                 },
  { value: "nunito",       label: "Nunito",             font: "'Nunito', sans-serif"                  },
  { value: "opensans",     label: "Open Sans",          font: "'Open Sans', sans-serif"               },
  { value: "roboto",       label: "Roboto",             font: "'Roboto', sans-serif"                  },
  { value: "sourcesans",   label: "Source Sans 3",      font: "'Source Sans 3', sans-serif"           },
  { value: "exo2",         label: "Exo 2",              font: "'Exo 2', sans-serif"                   },
  { value: "rajdhani",     label: "Rajdhani",           font: "'Rajdhani', sans-serif"                },
  { value: "oswald",       label: "Oswald",             font: "'Oswald', sans-serif"                  },
  { value: "barlow",       label: "Barlow Condensed",   font: "'Barlow Condensed', sans-serif"        },
  { value: "bebas",        label: "Bebas Neue",         font: "'Bebas Neue', Impact, sans-serif"      },
  { value: "anton",        label: "Anton",              font: "'Anton', Impact, sans-serif"           },
  { value: "fjalla",       label: "Fjalla One",         font: "'Fjalla One', sans-serif"              },
  { value: "playfair",     label: "Playfair Display",   font: "'Playfair Display', serif"             },
  { value: "ptserif",      label: "PT Serif",           font: "'PT Serif', serif"                     },
  { value: "merriweather", label: "Merriweather",       font: "'Merriweather', serif"                 },
  { value: "lora",         label: "Lora",               font: "'Lora', serif"                         },
  { value: "crimson",      label: "Crimson Text",       font: "'Crimson Text', serif"                 },
  { value: "ubuntu",       label: "Ubuntu",             font: "'Ubuntu', sans-serif"                  },
  { value: "firasans",     label: "Fira Sans",          font: "'Fira Sans', sans-serif"               },
  { value: "cabin",        label: "Cabin",              font: "'Cabin', sans-serif"                   },
  { value: "quicksand",    label: "Quicksand",          font: "'Quicksand', sans-serif"               },
  { value: "outfit",       label: "Outfit",             font: "'Outfit', sans-serif"                  },
  { value: "dmsans",       label: "DM Sans",            font: "'DM Sans', sans-serif"                 },
  { value: "plusjakarta",  label: "Plus Jakarta Sans",  font: "'Plus Jakarta Sans', sans-serif"       },
  { value: "jost",         label: "Jost",               font: "'Jost', sans-serif"                    },
  { value: "manrope",      label: "Manrope",            font: "'Manrope', sans-serif"                 },
  { value: "syne",         label: "Syne",               font: "'Syne', sans-serif"                    },
  { value: "spaceGrotesk", label: "Space Grotesk",      font: "'Space Grotesk', sans-serif"           },
  { value: "ibmplexsans",  label: "IBM Plex Sans",      font: "'IBM Plex Sans', sans-serif"           },
  { value: "worksans",     label: "Work Sans",          font: "'Work Sans', sans-serif"               },
  { value: "mulish",       label: "Mulish",             font: "'Mulish', sans-serif"                  },
  { value: "josefinsans",  label: "Josefin Sans",       font: "'Josefin Sans', sans-serif"            },
  { value: "teko",         label: "Teko",               font: "'Teko', sans-serif"                    },
  { value: "rubik",        label: "Rubik",              font: "'Rubik', sans-serif"                   },
  { value: "karla",        label: "Karla",              font: "'Karla', sans-serif"                   },
  { value: "hind",         label: "Hind",               font: "'Hind', sans-serif"                    },
  { value: "libre",        label: "Libre Franklin",     font: "'Libre Franklin', sans-serif"          },
  { value: "assistant",    label: "Assistant",          font: "'Assistant', sans-serif"               },
  { value: "bitter",       label: "Bitter",             font: "'Bitter', serif"                       },
  { value: "rokkitt",      label: "Rokkitt",            font: "'Rokkitt', serif"                      },
  { value: "arvo",         label: "Arvo",               font: "'Arvo', serif"                         },
  { value: "domine",       label: "Domine",             font: "'Domine', serif"                       },
  { value: "cormorant",    label: "Cormorant Garamond", font: "'Cormorant Garamond', serif"           },
  { value: "spectral",     label: "Spectral",           font: "'Spectral', serif"                     },
  { value: "alegreya",     label: "Alegreya",           font: "'Alegreya', serif"                     },
  { value: "sourceserif",  label: "Source Serif 4",     font: "'Source Serif 4', serif"               },
];

const FONT_GOOGLE_URL = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@700&family=Merriweather:wght@700&family=Lora:wght@700&family=Crimson+Text:wght@700&family=Ubuntu:wght@700&family=Fira+Sans:wght@700&family=Cabin:wght@700&family=Quicksand:wght@700&family=Outfit:wght@700&family=DM+Sans:wght@700&family=Plus+Jakarta+Sans:wght@700&family=Jost:wght@700&family=Manrope:wght@700&family=Syne:wght@700&family=Space+Grotesk:wght@700&family=IBM+Plex+Sans:wght@700&family=Work+Sans:wght@700&family=Mulish:wght@700&family=Josefin+Sans:wght@700&family=Teko:wght@600&family=Rubik:wght@700&family=Karla:wght@700&family=Hind:wght@700&family=Libre+Franklin:wght@700&family=Assistant:wght@700&family=Bitter:wght@700&family=Rokkitt:wght@700&family=Arvo:wght@700&family=Domine:wght@700&family=Cormorant+Garamond:wght@700&family=Spectral:wght@700&family=Alegreya:wght@700&family=Source+Serif+4:wght@700&display=swap";

interface Business {
  id: number;
  userId: number;
  name: string;
  industry: string | null;
  subIndustry: string | null;
  subIndustries: string | null;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  brandTone: string | null;
  audienceDescription: string | null;
  defaultLocation: string | null;
  brandFont: string | null;
  website: string | null;
  referenceImages: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

interface BusinessFormData {
  name: string;
  industry: string;
  subIndustry: string;
  subIndustries: string[];
  description: string;
  brandTone: string;
  audienceDescription: string;
  defaultLocation: string;
  primaryColor: string;
  secondaryColor: string;
  website: string;
  logoUrl: string;
  brandFont: string;
  referenceImages: RefImage[];
}

const emptyForm = (): BusinessFormData => ({
  name: "",
  industry: "",
  subIndustry: "",
  subIndustries: [],
  description: "",
  brandTone: "",
  audienceDescription: "",
  defaultLocation: "",
  primaryColor: "#0077FF",
  secondaryColor: "#00C2FF",
  website: "",
  logoUrl: "",
  brandFont: "poppins",
  referenceImages: [],
});

function BusinessForm({
  initial,
  businessId,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<BusinessFormData>;
  businessId?: number;
  onSave: (data: BusinessFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<BusinessFormData>({ ...emptyForm(), ...initial });
  const [catalog, setCatalog] = useState<IndustryCatalogEntry[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [addingRefImg, setAddingRefImg] = useState(false);
  const [customIndustry, setCustomIndustry] = useState(
    initial?.industry && !catalog.find(e => e.name === initial.industry) && initial.industry !== "" ? initial.industry : ""
  );
  const [customIndustryStatus, setCustomIndustryStatus] = useState<"idle" | "validating" | "ok" | "error">("idle");
  const [customIndustryMsg, setCustomIndustryMsg] = useState("");
  const [customSubIndustry, setCustomSubIndustry] = useState("");
  const [customSubStatus, setCustomSubStatus] = useState<"idle" | "validating" | "ok" | "error">("idle");
  const [customSubMsg, setCustomSubMsg] = useState("");
  const [customSubSuggestion, setCustomSubSuggestion] = useState<string | null>(null);
  const [customSubCanForce, setCustomSubCanForce] = useState(false);
  const [fontSearch, setFontSearch] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const refImgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchIndustryCatalog().then(cat => {
      setCatalog(cat);
      // Si el negocio tiene una industria custom (no está en catálogo), mapear a "Otro"
      const initIndustry = initial?.industry ?? "";
      if (initIndustry && !cat.find(e => e.name === initIndustry)) {
        setForm(f => ({ ...f, industry: "Otro" }));
        setCustomIndustry(initIndustry);
      }
    });
    // Inject Google Fonts stylesheet once
    if (!document.getElementById("hz-biz-fonts")) {
      const link = document.createElement("link");
      link.id = "hz-biz-fonts";
      link.rel = "stylesheet";
      link.href = FONT_GOOGLE_URL;
      document.head.appendChild(link);
    }
  }, []);

  function set<K extends keyof BusinessFormData>(key: K, val: BusinessFormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleIndustryChange(val: string) {
    setForm(f => ({ ...f, industry: val, subIndustry: "", subIndustries: [] }));
    if (val !== "Otro") { setCustomIndustry(""); setCustomIndustryStatus("idle"); setCustomIndustryMsg(""); }
    setCustomSubIndustry(""); setCustomSubStatus("idle"); setCustomSubMsg("");
  }

  function toggleSubIndustry(name: string) {
    setForm(f => {
      const already = f.subIndustries.includes(name);
      const next = already ? f.subIndustries.filter(s => s !== name) : [...f.subIndustries, name];
      return { ...f, subIndustries: next, subIndustry: next[0] ?? "" };
    });
  }

  async function handleValidateCustomSub(forceSkipFuzzy?: boolean) {
    const raw = customSubIndustry.trim();
    if (!raw) return;
    const effectiveIndustry = form.industry === "Otro" ? customIndustry.trim() : form.industry;
    if (!effectiveIndustry) return;
    setCustomSubStatus("validating");
    setCustomSubMsg("");
    setCustomSubSuggestion(null);
    setCustomSubCanForce(false);
    try {
      const res = await fetch(`${BASE}/api/industries/validate-custom-sub`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ industryName: effectiveIndustry, subIndustryName: raw, forceSkipFuzzy: !!forceSkipFuzzy }),
      });
      const data = await res.json();
      if (data.action === "added" || data.action === "already_exists") {
        const name = data.industry?.name ?? raw;
        setCustomSubStatus("ok");
        setCustomSubMsg(`✓ "${name}" agregada`);
        toggleSubIndustry(name);
        setCustomSubIndustry("");
        if (data.action === "added") {
          fetchIndustryCatalog().then(setCatalog).catch(() => {});
        }
      } else if (data.action === "suggest") {
        setCustomSubStatus("error");
        setCustomSubMsg(`¿Quisiste decir "${data.suggestion}"?`);
        setCustomSubSuggestion(data.suggestion);
      } else if (data.action === "invalid") {
        setCustomSubStatus("error");
        setCustomSubMsg(data.reason ?? `"${raw}" no es una especialidad reconocida.`);
        setCustomSubCanForce(true);
      } else {
        setCustomSubStatus("error");
        setCustomSubMsg(data.reason ?? data.error ?? "No se pudo validar");
      }
    } catch {
      setCustomSubStatus("error");
      setCustomSubMsg("Error de conexión al validar");
    }
  }

  const TONE_NORMALIZE: Record<string, string> = {
    tecnico: "técnico",
    formal: "formal",
    cercano: "cercano",
    inspiracional: "inspiracional",
    divertido: "divertido",
  };

  /** Core analysis logic: fetches and merges website data into currentForm. Returns merged form. */
  async function runWebsiteAnalysis(currentForm: BusinessFormData): Promise<BusinessFormData> {
    const endpoint = businessId
      ? `${BASE}/api/businesses/${businessId}/analyze-website`
      : `${BASE}/api/brand/analyze-website`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ url: currentForm.website.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error al analizar");

    const rawTone = typeof data.tone === "string" ? data.tone.toLowerCase().trim() : null;
    const normalizedTone = rawTone ? (TONE_NORMALIZE[rawTone] ?? rawTone) : null;

    return {
      ...currentForm,
      description:         !currentForm.description.trim()         && data.description  ? data.description  : currentForm.description,
      audienceDescription: !currentForm.audienceDescription.trim() && data.audience     ? data.audience     : currentForm.audienceDescription,
      brandTone:           !currentForm.brandTone                  && normalizedTone    ? normalizedTone    : currentForm.brandTone,
      primaryColor:        currentForm.primaryColor === "#0077FF"  && data.primaryColor ? data.primaryColor : currentForm.primaryColor,
    };
  }

  /** Explicit "Analizar con IA" button handler — updates state and optionally PATCH-saves in edit mode */
  async function handleAnalyzeWebsite() {
    if (!form.website.trim()) return;
    setAnalyzing(true);
    try {
      const merged = await runWebsiteAnalysis(form);
      const nothingNew =
        merged.description === form.description &&
        merged.audienceDescription === form.audienceDescription &&
        merged.brandTone === form.brandTone &&
        merged.primaryColor === form.primaryColor;
      if (nothingNew) {
        toast({
          title: "⚠️ Sin información detectada",
          description: "No se pudo extraer información útil del sitio web. Verifica la URL e inténtalo de nuevo.",
          variant: "destructive",
        });
        return;
      }
      setForm(merged);
      if (businessId) {
        const saveRes = await fetch(`${BASE}/api/businesses/${businessId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(merged),
        });
        if (!saveRes.ok) {
          const saveData = await saveRes.json().catch(() => ({}));
          throw new Error(saveData.error ?? "No se pudo guardar el análisis");
        }
        toast({ title: "✅ Análisis completado", description: "Los campos vacíos fueron pre-llenados y guardados automáticamente." });
      } else {
        toast({ title: "✅ Análisis completado", description: "Los campos vacíos fueron pre-llenados. Guarda el formulario para conservarlos." });
      }
    } catch (err: unknown) {
      toast({ title: "Error al analizar", description: err instanceof Error ? err.message : "Error desconocido", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  /** Save handler: auto-analyzes website if URL is present, then calls onSave with merged data */
  async function handleSave() {
    if (saving || addingRefImg) return;
    let finalForm = form;
    // Resolve custom industry before saving
    if (form.industry === "Otro") {
      const resolved = customIndustry.trim() || "Otro";
      finalForm = { ...finalForm, industry: resolved };
    }
    if (finalForm.website.trim()) {
      setAnalyzing(true);
      try {
        finalForm = await runWebsiteAnalysis(finalForm);
        setForm(finalForm);
      } catch {
        // Analysis failure is non-fatal — continue saving with current form
      } finally {
        setAnalyzing(false);
      }
    }
    onSave(finalForm);
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = async ev => {
      const imageData = ev.target?.result as string;
      if (!imageData) return;
      try {
        const resp = await fetch(`${BASE}/api/businesses/upload-logo`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData }),
        });
        const json = await resp.json() as { logoUrl?: string; error?: string };
        if (!resp.ok) throw new Error(json.error ?? "Error al subir logo");
        set("logoUrl", json.logoUrl ?? imageData);
      } catch (err) {
        // If server rejected due to size, don't store — show error
        if (err instanceof Error && (err.message.includes("grande") || err.message.includes("large") || err.message.includes("413"))) {
          toast({ title: "Logo demasiado grande", description: "El logo debe ser menor a 2 MB.", variant: "destructive" });
          return;
        }
        // Fallback: use base64 directly (same as onboarding fallback for other errors)
        set("logoUrl", imageData);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleRefImgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const available = 5 - form.referenceImages.length;
    if (available <= 0) {
      toast({ title: "Límite alcanzado", description: "Máximo 5 imágenes de referencia.", variant: "destructive" });
      return;
    }
    const toProcess = files.slice(0, available);
    setAddingRefImg(true);
    const added: RefImage[] = [];
    for (const file of toProcess) {
      try {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch(`${BASE}/api/businesses/analyze-reference-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imageDataUri: dataUri }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error");
        added.push({ base64: data.base64, analysis: data.analysis ?? "", addedAt: data.addedAt ?? new Date().toISOString() });
      } catch {
        toast({ title: "Error", description: `No se pudo procesar ${file.name}`, variant: "destructive" });
      }
    }
    if (added.length) {
      setForm(f => ({ ...f, referenceImages: [...f.referenceImages, ...added] }));
      toast({ title: `${added.length} imagen(es) analizadas`, description: "La IA replicará el estilo visual de estas imágenes." });
    }
    setAddingRefImg(false);
  }

  function removeRefImage(idx: number) {
    setForm(f => ({ ...f, referenceImages: f.referenceImages.filter((_, i) => i !== idx) }));
  }

  const selectedEntry = catalog.find(e => e.name === form.industry);
  const subcategories = selectedEntry?.subcategories ?? [];
  const filteredFonts = GOOGLE_FONTS_50.filter(f =>
    f.label.toLowerCase().includes(fontSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Website analysis (available in create AND edit mode) */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Sitio web</Label>
        <div className="flex gap-2">
          <Input
            value={form.website}
            onChange={e => set("website", e.target.value)}
            placeholder="https://minegocio.com"
            className="bg-background/50"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAnalyzeWebsite}
            disabled={analyzing || !form.website.trim()}
            className="shrink-0 border-primary/40 text-primary hover:bg-primary/10"
          >
            {analyzing
              ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Globe className="w-3.5 h-3.5 mr-1.5" />}
            {analyzing ? "Analizando…" : "Analizar con IA"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Pre-llena los campos vacíos analizando tu sitio web con IA.</p>
      </div>

      {/* Logo upload */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Logo del negocio</Label>
        {form.logoUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={form.logoUrl}
              alt="Logo"
              className="w-14 h-14 object-contain rounded-lg border border-border bg-muted"
            />
            <div className="space-y-1">
              <Button type="button" size="sm" variant="outline" className="text-xs h-7" onClick={() => logoInputRef.current?.click()}>
                <Upload className="w-3 h-3 mr-1" /> Cambiar
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => set("logoUrl", "")}>
                <X className="w-3 h-3 mr-1" /> Quitar
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary text-xs transition-colors"
          >
            <Upload className="w-4 h-4" /> Subir logo
          </button>
        )}
        <input ref={logoInputRef} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="hidden" onChange={handleLogoUpload} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nombre del negocio *</Label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Panadería El Trigal" className="bg-background/50" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Industria / Sector</Label>
          <select value={form.industry} onChange={e => handleIndustryChange(e.target.value)} className={SELECT_CLS}>
            <option value="">Seleccionar industria…</option>
            {catalog.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
            <option value="Otro">Otro (especificar)</option>
          </select>
          {form.industry === "Otro" && (
            <div className="space-y-1 mt-1.5">
              <Input
                value={customIndustry}
                onChange={e => { setCustomIndustry(e.target.value); setCustomIndustryStatus("idle"); setCustomIndustryMsg(""); }}
                onBlur={async () => {
                  const name = customIndustry.trim();
                  if (!name) return;
                  setCustomIndustryStatus("validating");
                  setCustomIndustryMsg("");
                  try {
                    const r = await fetch(`${BASE}/api/industries/validate-custom`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      credentials: "include", body: JSON.stringify({ name }),
                    });
                    const d = await r.json();
                    if (!r.ok) {
                      setCustomIndustryStatus("error");
                      setCustomIndustryMsg(d.error ?? "No se pudo validar la industria.");
                      return;
                    }
                    if (d.action === "suggest") {
                      setCustomIndustry(d.suggestion);
                      setCustomIndustryStatus("ok");
                      setCustomIndustryMsg(`¿Quisiste decir "${d.suggestion}"? Ajustado automáticamente ✓`);
                    } else if (d.action === "already_exists" || d.action === "added") {
                      const finalName = d.industry?.name ?? name;
                      setCustomIndustry(finalName);
                      setCustomIndustryStatus("ok");
                      setCustomIndustryMsg(`Industria "${finalName}" validada ✓`);
                    } else if (d.action === "invalid") {
                      setCustomIndustryStatus("error");
                      setCustomIndustryMsg(d.reason ?? "No reconocemos esa industria. Escribe el nombre real de tu sector.");
                    } else {
                      setCustomIndustryStatus("error");
                      setCustomIndustryMsg("Respuesta inesperada. Puedes continuar de todas formas.");
                    }
                  } catch {
                    setCustomIndustryStatus("error");
                    setCustomIndustryMsg("Error al validar. Puedes continuar de todas formas.");
                  }
                }}
                placeholder="Ej: Consultoría de Bienestar Corporativo"
                className="bg-background/50"
              />
              {customIndustryStatus === "validating" && <p className="text-[11px] text-muted-foreground">Validando con IA…</p>}
              {customIndustryStatus === "ok" && <p className="text-[11px] text-green-500">{customIndustryMsg}</p>}
              {customIndustryStatus === "error" && <p className="text-[11px] text-yellow-500">{customIndustryMsg}</p>}
            </div>
          )}
        </div>
      </div>
      {subcategories.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Especialidades del negocio
              {form.subIndustries.length > 0 && (
                <span className="ml-1.5 text-primary font-medium">({form.subIndustries.length} seleccionada{form.subIndustries.length !== 1 ? "s" : ""})</span>
              )}
            </Label>
            <button
              type="button"
              onClick={() => {
                const staticNames = subcategories.map(s => s.name);
                const customSelected = form.subIndustries.filter(n => !subcategories.find(s => s.name === n));
                const allSelected = staticNames.length > 0 && staticNames.every(n => form.subIndustries.includes(n));
                if (allSelected) {
                  setForm(f => ({ ...f, subIndustries: [], subIndustry: "" }));
                } else {
                  const next = [...staticNames, ...customSelected];
                  setForm(f => ({ ...f, subIndustries: next, subIndustry: next[0] ?? "" }));
                }
              }}
              className="text-[11px] text-primary hover:underline"
            >
              {subcategories.length > 0 && subcategories.every(s => form.subIndustries.includes(s.name)) ? "Quitar todas" : "Todas"}
            </button>
          </div>
          <div className="rounded-md border border-input bg-background/40 p-2.5 space-y-1 max-h-48 overflow-y-auto">
            {subcategories.map(s => (
              <label key={s.slug} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5 group">
                <input
                  type="checkbox"
                  checked={form.subIndustries.includes(s.name)}
                  onChange={() => toggleSubIndustry(s.name)}
                  className="accent-primary w-3.5 h-3.5"
                />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">{s.name}</span>
              </label>
            ))}
            {/* "Otro" row — clicking focuses the input below */}
            <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5">
              <input
                type="checkbox"
                checked={!!customSubIndustry.trim()}
                onChange={e => { if (e.target.checked) setCustomSubIndustry(" "); else setCustomSubIndustry(""); }}
                className="accent-primary w-3.5 h-3.5"
              />
              <span className="text-sm text-muted-foreground italic">Otro…</span>
            </label>
          </div>
          {/* Custom sub-industry input */}
          {form.subIndustries.length === 0 && subcategories.length > 0 && (
            <p className="text-[10px] text-muted-foreground">Selecciona las especialidades que aplican a tu negocio.</p>
          )}
          <div className="flex gap-2">
            <Input
              value={customSubIndustry}
              onChange={e => { setCustomSubIndustry(e.target.value); setCustomSubStatus("idle"); setCustomSubMsg(""); setCustomSubSuggestion(null); setCustomSubCanForce(false); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleValidateCustomSub(); } }}
              placeholder="Escribe una especialidad personalizada…"
              className="bg-background/50 text-sm h-8"
              disabled={customSubStatus === "validating"}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleValidateCustomSub()}
              disabled={!customSubIndustry.trim() || customSubStatus === "validating"}
              className="h-8 px-2.5 text-xs whitespace-nowrap"
            >
              {customSubStatus === "validating" ? "Validando…" : "Agregar"}
            </Button>
          </div>
          {customSubStatus === "ok" && <p className="text-[11px] text-green-500">{customSubMsg}</p>}
          {customSubStatus === "error" && customSubSuggestion && (
            <div className="space-y-1">
              <p className="text-[11px] text-yellow-500">{customSubMsg}</p>
              <div className="flex gap-2">
                <Button
                  type="button" size="sm" variant="outline"
                  className="h-7 px-2.5 text-[11px] border-green-500/50 text-green-400 hover:bg-green-500/10"
                  onClick={() => {
                    toggleSubIndustry(customSubSuggestion);
                    setCustomSubIndustry("");
                    setCustomSubStatus("ok");
                    setCustomSubMsg(`✓ "${customSubSuggestion}" agregada`);
                    setCustomSubSuggestion(null);
                  }}
                >Sí, esa es</Button>
                <Button
                  type="button" size="sm" variant="outline"
                  className="h-7 px-2.5 text-[11px]"
                  onClick={() => { setCustomSubSuggestion(null); handleValidateCustomSub(true); }}
                >No, es diferente</Button>
              </div>
            </div>
          )}
          {customSubStatus === "error" && !customSubSuggestion && customSubCanForce && (
            <div className="space-y-1">
              <p className="text-[11px] text-yellow-500">{customSubMsg}</p>
              <div className="flex gap-2">
                <Button
                  type="button" size="sm" variant="outline"
                  className="h-7 px-2.5 text-[11px] border-primary/50 text-primary hover:bg-primary/10"
                  onClick={() => {
                    const raw = customSubIndustry.trim();
                    if (!raw) return;
                    toggleSubIndustry(raw);
                    setCustomSubIndustry("");
                    setCustomSubStatus("ok");
                    setCustomSubMsg(`✓ "${raw}" agregada a tu perfil`);
                    setCustomSubCanForce(false);
                  }}
                >Sí, agregar solo a mi perfil</Button>
                <Button
                  type="button" size="sm" variant="ghost"
                  className="h-7 px-2.5 text-[11px]"
                  onClick={() => { setCustomSubIndustry(""); setCustomSubStatus("idle"); setCustomSubMsg(""); setCustomSubCanForce(false); }}
                >No</Button>
              </div>
            </div>
          )}
          {customSubStatus === "error" && !customSubSuggestion && !customSubCanForce && (
            <p className="text-[11px] text-yellow-500">{customSubMsg}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Descripción del negocio</Label>
        <Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="Breve descripción de qué hace este negocio..." rows={2} className="bg-background/50 resize-none" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tono de marca</Label>
          <select value={form.brandTone} onChange={e => set("brandTone", e.target.value)} className={SELECT_CLS}>
            <option value="">Seleccionar tono…</option>
            {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ubicación por defecto</Label>
          <Input value={form.defaultLocation} onChange={e => set("defaultLocation", e.target.value)} placeholder="Ej: Cali, Colombia" className="bg-background/50" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Audiencia objetivo</Label>
        <Textarea value={form.audienceDescription} onChange={e => set("audienceDescription", e.target.value)} placeholder="Describe tu cliente ideal..." rows={2} className="bg-background/50 resize-none" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Color primario</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.primaryColor} onChange={e => set("primaryColor", e.target.value)} className="w-9 h-9 rounded cursor-pointer border border-border" />
            <Input value={form.primaryColor} onChange={e => set("primaryColor", e.target.value)} className="bg-background/50 font-mono text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Color secundario</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.secondaryColor} onChange={e => set("secondaryColor", e.target.value)} className="w-9 h-9 rounded cursor-pointer border border-border" />
            <Input value={form.secondaryColor} onChange={e => set("secondaryColor", e.target.value)} className="bg-background/50 font-mono text-sm" />
          </div>
        </div>
      </div>

      {/* Font selector */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Tipografía de marca</Label>
        <Input
          value={fontSearch}
          onChange={e => setFontSearch(e.target.value)}
          placeholder="Buscar fuente…"
          className="bg-background/50 text-sm"
        />
        <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
          {filteredFonts.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => set("brandFont", f.value)}
              className={`px-2 py-1.5 rounded border text-sm text-left transition-colors truncate ${
                form.brandFont === f.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
              style={{ fontFamily: f.font }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reference images */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Imágenes de referencia (hasta 5)</Label>
        <p className="text-[11px] text-muted-foreground">La IA replicará el estilo visual de estas imágenes en los posts.</p>
        <div className="flex flex-wrap gap-2 items-center">
          {form.referenceImages.map((img, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg border border-border overflow-hidden group">
              <img src={img.base64} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeRefImage(i)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
          {form.referenceImages.length < 5 && (
            <button
              type="button"
              onClick={() => refImgInputRef.current?.click()}
              disabled={addingRefImg}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              {addingRefImg
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <><ImageIcon className="w-4 h-4" /><span className="text-[10px]">Agregar</span></>
              }
            </button>
          )}
        </div>
        <input
          ref={refImgInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleRefImgUpload}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || analyzing || addingRefImg || !form.name.trim()} size="sm" className="bg-primary hover:bg-primary/90">
          {(saving || analyzing) ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          {analyzing ? "Analizando…" : "Guardar"}
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm" disabled={saving || analyzing}>
          <X className="w-3.5 h-3.5 mr-1" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function BusinessCard({
  business,
  onSetActive,
  onEdit,
  onDelete,
  actionLoading,
}: {
  business: Business;
  onSetActive: (id: number) => void;
  onEdit: (b: Business) => void;
  onDelete: (id: number) => void;
  actionLoading: number | null;
}) {
  return (
    <div className={`bg-card border rounded-xl p-4 transition-all ${business.isDefault ? "border-primary/50 shadow-[0_0_16px_rgba(0,119,255,0.12)]" : "border-border hover:border-border/80"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Color swatch */}
          <div
            className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-base shadow-sm"
            style={{ background: `linear-gradient(135deg, ${business.primaryColor ?? "#0077FF"}, ${business.secondaryColor ?? "#00C2FF"})` }}
          >
            {business.name.slice(0, 1).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground truncate">{business.name}</h3>
              {business.isDefault && (
                <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">
                  <Star className="w-2.5 h-2.5 mr-0.5" fill="currentColor" />
                  Activo
                </Badge>
              )}
            </div>
            {business.industry && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {business.industry}
                {(() => {
                  const subs = (() => { try { return JSON.parse(business.subIndustries ?? "[]") as string[]; } catch { return business.subIndustry ? [business.subIndustry] : []; } })();
                  return subs.length > 0 ? <span className="ml-1 opacity-70">· {subs.join(" · ")}</span> : null;
                })()}
              </p>
            )}
            {business.description && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{business.description}</p>}
            {business.defaultLocation && (
              <p className="text-[10px] text-muted-foreground mt-1">📍 {business.defaultLocation}</p>
            )}
            {business.website && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                🌐{" "}
                <a
                  href={business.website.startsWith("http") ? business.website : `https://${business.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors underline underline-offset-2"
                  onClick={e => e.stopPropagation()}
                >
                  {business.website.replace(/^https?:\/\//, "")}
                </a>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!business.isDefault && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSetActive(business.id)}
              disabled={actionLoading === business.id}
              className="text-xs h-7 px-2"
            >
              {actionLoading === business.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Activar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onEdit(business)} className="h-7 w-7 p-0 hover:bg-muted/50">
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          {!business.isDefault && (
            <Button size="sm" variant="ghost" onClick={() => onDelete(business.id)} disabled={actionLoading === business.id} className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ExtraBusinessPayment {
  priceUsd: number;
  priceCop: number;
  annualPriceUsd: number;
  annualPriceCop: number;
  extraCredits: number;
  pendingForm: BusinessFormData;
}

export default function Businesses() {
  const { user, subscription } = useAuth();
  const { toast } = useToast();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [extraPayment, setExtraPayment] = useState<ExtraBusinessPayment | null>(null);
  const [annualExtraBiz, setAnnualExtraBiz] = useState(false);
  const [buyingExtraBiz, setBuyingExtraBiz] = useState(false);
  const [planExtraPrice, setPlanExtraPrice] = useState<number>(0);
  const [planExtraPriceCop, setPlanExtraPriceCop] = useState<number>(0);
  const [planExtraPriceAnnual, setPlanExtraPriceAnnual] = useState<number>(0);
  const [planExtraPriceCopAnnual, setPlanExtraPriceCopAnnual] = useState<number>(0);

  const plan = user?.plan ?? "free";
  const [businessToDelete, setBusinessToDelete] = useState<Business | null>(null);
  // Explicit booleans from /api/user/delete-account/method (hasPassword & hasTotp fields).
  // null = not yet loaded; undefined-safe: modal is only rendered after a business is selected,
  // giving time for the fetch to complete. If fetch fails, defaults to password-only (safest).
  const [securityInfo, setSecurityInfo] = useState<{ hasPassword: boolean; hasTotp: boolean } | null>(null);
  const [serverMaxBusinesses, setServerMaxBusinesses] = useState<number | null>(null);
  const fallbackLimits: Record<string, number> = { free: 1, starter: 1, business: 1, agency: 5 };
  const maxBusinesses = serverMaxBusinesses ?? fallbackLimits[plan] ?? 1;
  const canAddMore = businesses.length < maxBusinesses;

  useEffect(() => {
    fetch(`${BASE}/api/plans`)
      .then(r => r.json())
      .then((d: { plans?: Array<{ key: string; businessesAllowed?: number; extraBusinessPriceUsd?: number; extraBusinessPriceCop?: number; extraBusinessPriceAnnualUsd?: number; extraBusinessPriceAnnualCop?: number }> }) => {
        // Read extra business pricing from the current user's plan
        const currentPlanData = d.plans?.find(p => p.key === plan);
        if (currentPlanData?.businessesAllowed != null) setServerMaxBusinesses(currentPlanData.businessesAllowed);
        setPlanExtraPrice(currentPlanData?.extraBusinessPriceUsd ?? 0);
        setPlanExtraPriceCop(currentPlanData?.extraBusinessPriceCop ?? 0);
        setPlanExtraPriceAnnual(currentPlanData?.extraBusinessPriceAnnualUsd ?? 0);
        setPlanExtraPriceCopAnnual(currentPlanData?.extraBusinessPriceAnnualCop ?? 0);
      })
      .catch(() => {});
  }, [plan]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/businesses`, { credentials: "include" });
      const data = await res.json();
      setBusinesses(data.businesses ?? []);
    } catch {
      toast({ title: "Error al cargar negocios", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fetch once: which verification method does this user have (password / totp / email-OTP).
  // Uses explicit hasPassword/hasTotp fields (added alongside `method` for precision).
  // If fetch fails, securityInfo stays null → modal uses safe fallback (password-only).
  useEffect(() => {
    fetch(`${BASE}/api/user/delete-account/method`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && typeof d.hasPassword === "boolean" && typeof d.hasTotp === "boolean") {
          setSecurityInfo({ hasPassword: d.hasPassword, hasTotp: d.hasTotp });
        } else if (d?.method) {
          // Fallback for older API responses that only return `method`
          setSecurityInfo({
            hasPassword: d.method === "password" || d.method === "totp",
            hasTotp: d.method === "totp",
          });
        }
      })
      .catch(() => {});
  }, []);

  async function handleCreate(form: BusinessFormData) {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/businesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.status === 402 && data.needsPayment) {
        // Agency plan: show payment modal instead of error
        setExtraPayment({ priceUsd: data.priceUsd, priceCop: data.priceCop ?? planExtraPriceCop, annualPriceUsd: data.priceAnnualUsd ?? planExtraPriceAnnual, annualPriceCop: data.priceAnnualCop ?? planExtraPriceCopAnnual, extraCredits: data.extraCredits, pendingForm: form });
        setAnnualExtraBiz(false);
        setShowCreate(false);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Error al crear negocio");
      toast({ title: "✅ Negocio creado", description: data.business.name });
      setShowCreate(false);
      await load();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(form: BusinessFormData) {
    if (!editingBusiness) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${editingBusiness.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al actualizar");
      toast({ title: "✅ Negocio actualizado", description: data.business.name });
      setEditingBusiness(null);
      await load();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive(id: number) {
    setActionLoading(id);
    try {
      const res = await fetch(`${BASE}/api/businesses/${id}/set-active`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error al activar negocio");
      toast({ title: "✅ Negocio activo cambiado" });
      await load();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  function handleDelete(id: number) {
    const biz = businesses.find(b => b.id === id);
    if (biz) setBusinessToDelete(biz);
  }

  /**
   * Confirms the extra business slot purchase and creates the business.
   * Note: userId is NEVER sent — the backend reads it from the JWT cookie.
   */
  async function handleBuyExtraBusiness() {
    if (!extraPayment) return;
    setBuyingExtraBiz(true);
    try {
      const res = await fetch(`${BASE}/api/billing/buy-extra-business`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pendingBusiness: {
            name:        extraPayment.pendingForm.name,
            industry:    extraPayment.pendingForm.industry,
            subIndustry: extraPayment.pendingForm.subIndustry,
            description: extraPayment.pendingForm.description,
          },
          annual: annualExtraBiz && extraPayment.annualPriceUsd > 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Error al procesar la compra", variant: "destructive" });
        return;
      }
      toast({ title: "¡Negocio creado!", description: data.message ?? `Se agendó el cobro. +${extraPayment.extraCredits} créditos disponibles.` });
      setExtraPayment(null);
      await load();
    } catch {
      toast({ title: "Error", description: "No se pudo conectar al servidor", variant: "destructive" });
    } finally {
      setBuyingExtraBiz(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            Mis Negocios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona los negocios asociados a tu cuenta — plan <span className="font-medium capitalize">{plan}</span> permite hasta <span className="font-medium">{maxBusinesses}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          {(canAddMore || plan === "agency" || plan === "business") && !showCreate && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-1" />
              Agregar negocio
            </Button>
          )}
        </div>
      </div>

      {/* Usage bar */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">Negocios registrados</p>
          <p className="text-xs font-semibold text-foreground">{businesses.length} / {maxBusinesses}</p>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (businesses.length / maxBusinesses) * 100)}%`,
              background: businesses.length >= maxBusinesses ? "rgb(239,68,68)" : "linear-gradient(90deg, #0077FF, #00C2FF)"
            }}
          />
        </div>
        {businesses.length >= maxBusinesses && plan !== "agency" && plan !== "business" && (
          <p className="text-xs text-amber-400 mt-2">
            ⚠ Límite alcanzado. <a href="/settings" className="underline hover:text-amber-300">Actualiza tu plan</a> para agregar más negocios.
          </p>
        )}
        {businesses.length >= maxBusinesses && (plan === "agency" || plan === "business") && planExtraPrice > 0 && (
          <p className="text-xs text-primary/80 mt-2">
            ✨ Tu plan permite agregar negocios adicionales por ${planExtraPrice.toFixed(2)}/mes c/u.
          </p>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-card border border-primary/30 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Nuevo negocio
          </h2>
          <BusinessForm onSave={handleCreate} onCancel={() => setShowCreate(false)} saving={saving} />
        </div>
      )}

      {/* Edit form */}
      {editingBusiness && (
        <div className="bg-card border border-primary/30 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-primary" />
            Editar: {editingBusiness.name}
          </h2>
          <BusinessForm
            initial={{
              name: editingBusiness.name,
              industry: editingBusiness.industry ?? "",
              subIndustry: editingBusiness.subIndustry ?? "",
              subIndustries: (() => { try { return JSON.parse(editingBusiness.subIndustries ?? "[]"); } catch { return editingBusiness.subIndustry ? [editingBusiness.subIndustry] : []; } })(),
              description: editingBusiness.description ?? "",
              brandTone: editingBusiness.brandTone ?? "",
              audienceDescription: editingBusiness.audienceDescription ?? "",
              defaultLocation: editingBusiness.defaultLocation ?? "",
              primaryColor: editingBusiness.primaryColor ?? "#0077FF",
              secondaryColor: editingBusiness.secondaryColor ?? "#00C2FF",
              website: editingBusiness.website ?? "",
              logoUrl: editingBusiness.logoUrl ?? "",
              brandFont: editingBusiness.brandFont ?? "poppins",
              referenceImages: (() => {
                try { return JSON.parse(editingBusiness.referenceImages ?? "[]"); } catch { return []; }
              })(),
            }}
            businessId={editingBusiness.id}
            onSave={handleEdit}
            onCancel={() => setEditingBusiness(null)}
            saving={saving}
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : businesses.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-3">
          <Building2 className="w-8 h-8 opacity-30" />
          <p>No tienes negocios registrados.</p>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1" /> Crear primer negocio
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {businesses.map(b => (
            <div key={b.id}>
              {editingBusiness?.id === b.id ? null : (
                <BusinessCard
                  business={b}
                  onSetActive={handleSetActive}
                  onEdit={setEditingBusiness}
                  onDelete={handleDelete}
                  actionLoading={actionLoading}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Delete / Deactivate business modal ── */}
      {businessToDelete && (
        <DeleteBusinessModal
          business={businessToDelete}
          userHasPassword={securityInfo?.hasPassword ?? true}
          userHasTotp={securityInfo?.hasTotp ?? false}
          onClose={() => setBusinessToDelete(null)}
          onDeleted={async () => {
            setBusinessToDelete(null);
            await load();
          }}
        />
      )}

      {/* ── Extra business payment modal (agency/business plan) ── */}
      {extraPayment && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Negocio adicional</h2>
              <button onClick={() => setExtraPayment(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Annual toggle — only shown when annual price is available */}
            {extraPayment.annualPriceUsd > 0 && (
              <div className="flex items-center justify-center gap-3">
                <span className={`text-xs font-semibold cursor-pointer transition-colors ${!annualExtraBiz ? "text-foreground" : "text-muted-foreground"}`} onClick={() => setAnnualExtraBiz(false)}>Mensual</span>
                <button
                  onClick={() => setAnnualExtraBiz(a => !a)}
                  className={`relative w-9 h-5 rounded-full border transition-all flex-shrink-0 ${annualExtraBiz ? "bg-primary border-primary" : "bg-muted border-border"}`}
                  aria-label="Toggle annual billing"
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${annualExtraBiz ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className={`text-xs font-semibold cursor-pointer transition-colors ${annualExtraBiz ? "text-foreground" : "text-muted-foreground"}`} onClick={() => setAnnualExtraBiz(true)}>Anual</span>
                {annualExtraBiz && <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-medium">Ahorrá más</span>}
              </div>
            )}

            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                "{extraPayment.pendingForm.name}"
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Costo negocio extra</span>
                <div className="text-right">
                  <span className="font-bold text-primary block">
                    {annualExtraBiz && extraPayment.annualPriceUsd > 0
                      ? `$${extraPayment.annualPriceUsd.toFixed(2)} USD/año`
                      : `$${extraPayment.priceUsd.toFixed(2)} USD/mes`
                    }
                  </span>
                  {(() => {
                    const cop = annualExtraBiz && extraPayment.annualPriceCop > 0
                      ? extraPayment.annualPriceCop
                      : extraPayment.priceCop;
                    return cop > 0
                      ? <span className="text-xs text-muted-foreground">≈ ${cop.toLocaleString("es-CO")} COP/{annualExtraBiz && extraPayment.annualPriceUsd > 0 ? "año" : "mes"}</span>
                      : null;
                  })()}
                </div>
              </div>
              {annualExtraBiz && extraPayment.annualPriceUsd > 0 && extraPayment.priceUsd > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Ahorro vs mensual</span>
                  <span className="text-green-400 font-semibold">
                    -{Math.round((1 - extraPayment.annualPriceUsd / (extraPayment.priceUsd * 12)) * 100)}%
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Créditos incluidos</span>
                <span className="font-semibold text-green-400">+{extraPayment.extraCredits} créditos</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Al confirmar el pago, se creará el negocio y se acreditarán {extraPayment.extraCredits} créditos adicionales a tu cuenta.
            </p>

            <div className="flex flex-col gap-2">
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
                onClick={handleBuyExtraBusiness}
                disabled={buyingExtraBiz}
              >
                {buyingExtraBiz ? "Procesando…" : "Confirmar y crear negocio"}
              </Button>
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={() => setExtraPayment(null)}
                disabled={buyingExtraBiz}
              >
                Cancelar
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              El cobro se procesa manualmente. El negocio se crea de inmediato y los créditos quedan disponibles al instante.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
