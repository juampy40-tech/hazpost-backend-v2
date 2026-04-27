import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FONT_NAMES } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronRight, ChevronLeft, Check, Building2, Palette, Type, Users, Share2,
  ExternalLink, Upload, Loader2, X, Instagram, PlaySquare, Facebook, Search,
  Globe, Sparkles, Scissors, Zap, Calendar, RefreshCw,
} from "lucide-react";


// ── Types ─────────────────────────────────────────────────────────────────────

interface IndustryCatalogEntry {
  name: string;
  slug?: string;
  subcategories: { name: string; slug: string }[];
  aiContext?: {
    description?: string;
    content_topics?: string[];
    recommended_tone?: string;
    audience?: string;
    content_formats?: string[];
    keywords?: string[];
  };
}

interface BrandProfile {
  companyName?: string;
  slogan?: string;
  industry?: string;
  subIndustry?: string;
  country?: string;
  city?: string;
  website?: string;
  logoUrl?: string;
  logoUrls?: string;
  primaryColor?: string;
  secondaryColor?: string;
  businessDescription?: string;
  brandFont?: string;
  brandFontUrl?: string;
  audienceDescription?: string;
  brandTone?: string;
  referenceImages?: string;
  onboardingStep?: number;
  onboardingCompleted?: boolean | string;
  aiGenFrequency?: string;
}

interface AiSuggestions {
  description?: string | null;
  audience?: string | null;
  tone?: string | null;
  primaryColor?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || "";
const INDUSTRY_CACHE_KEY = "hz_industry_catalog_v1";
const INDUSTRY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
let industryCatalogMemoryCache: IndustryCatalogEntry[] | null = null;

function normalizeIndustryCatalog(raw: unknown): IndustryCatalogEntry[] {
  const payload = raw as IndustryCatalogEntry[] | { industries?: IndustryCatalogEntry[] };
  const list = Array.isArray(payload) ? payload : payload?.industries;

  if (!Array.isArray(list)) return [];

  return list
    .filter((item: any) => item && typeof item.name === "string")
    .map((item: any) => ({
      name: item.name,
      slug: item.slug,
      subcategories: Array.isArray(item.subcategories) ? item.subcategories : [],
      aiContext: item.aiContext,
    }));
}

function readCachedIndustryCatalog(): IndustryCatalogEntry[] | null {
  if (industryCatalogMemoryCache?.length) return industryCatalogMemoryCache;

  try {
    const raw = localStorage.getItem(INDUSTRY_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as { savedAt?: number; industries?: IndustryCatalogEntry[] };
    const fresh = cached.savedAt && Date.now() - cached.savedAt < INDUSTRY_CACHE_TTL_MS;

    if (!fresh || !Array.isArray(cached.industries) || cached.industries.length === 0) return null;

    industryCatalogMemoryCache = cached.industries;
    return cached.industries;
  } catch {
    return null;
  }
}

function saveCachedIndustryCatalog(industries: IndustryCatalogEntry[]) {
  industryCatalogMemoryCache = industries;

  try {
    localStorage.setItem(
      INDUSTRY_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), industries })
    );
  } catch {
    // Si el navegador bloquea localStorage, seguimos funcionando con memoria.
  }
}

async function fetchIndustryCatalog(): Promise<IndustryCatalogEntry[]> {
  const cached = readCachedIndustryCatalog();
  if (cached?.length) return cached;

  const res = await fetch(`${API_BASE}/api/industries`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`No se pudo cargar industrias (${res.status})`);
  }

  const data = await res.json();
  const industries = normalizeIndustryCatalog(data);

  if (!industries.length) {
    throw new Error("El catálogo de industrias llegó vacío");
  }

  saveCachedIndustryCatalog(industries);
  return industries;
}

async function sendIndustrySuggestion(name?: string): Promise<void> {
  const cleanName = name?.trim();
  if (!cleanName || cleanName.length < 3) return;

  try {
    await fetch(`${API_BASE}/api/industries/suggestions`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name: cleanName }),
    });
  } catch {
    // No bloqueamos el onboarding si falla el buzón de sugerencias.
  }
}

type CountryOption = {
  name: string;
  code: string;
  flag: string;
};

const COUNTRY_CODES = [
  "AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM", "AW", "AU", "AT", "AZ",
  "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM", "BT", "BO", "BQ", "BA", "BW", "BV", "BR", "IO", "BN", "BG", "BF", "BI",
  "CV", "KH", "CM", "CA", "KY", "CF", "TD", "CL", "CN", "CX", "CC", "CO", "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CW", "CY", "CZ",
  "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FK", "FO", "FJ", "FI", "FR", "GF", "PF", "TF",
  "GA", "GM", "GE", "DE", "GH", "GI", "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY",
  "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "JM", "JP", "JE", "JO",
  "KZ", "KE", "KI", "KP", "KR", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MO", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX", "FM", "MD", "MC", "MN", "ME", "MS", "MA", "MZ", "MM",
  "NA", "NR", "NP", "NL", "NC", "NZ", "NI", "NE", "NG", "NU", "NF", "MK", "MP", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH", "PN", "PL", "PT", "PR",
  "QA", "RE", "RO", "RU", "RW", "BL", "SH", "KN", "LC", "MF", "PM", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SX", "SK", "SI", "SB", "SO", "ZA", "GS", "SS", "ES", "LK", "SD", "SR", "SJ", "SE", "CH", "SY",
  "TW", "TJ", "TZ", "TH", "TL", "TG", "TK", "TO", "TT", "TN", "TR", "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU", "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW",
] as const;

function countryCodeToFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return code
    .split("")
    .map(char => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function buildCountryList(): CountryOption[] {
  let displayNames: { of: (code: string) => string | undefined } | null = null;

  try {
    const IntlWithDisplayNames = Intl as typeof Intl & {
      DisplayNames?: new (locales: string[], options: { type: "region" }) => { of: (code: string) => string | undefined };
    };

    displayNames = IntlWithDisplayNames.DisplayNames
      ? new IntlWithDisplayNames.DisplayNames(["es"], { type: "region" })
      : null;
  } catch {
    displayNames = null;
  }

  const list = COUNTRY_CODES.map(code => ({
    code,
    name: displayNames?.of(code) || code,
    flag: countryCodeToFlag(code),
  }))
    .filter(country => country.name && country.name !== country.code)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return [...list, { name: "Otro", code: "OT", flag: "🌍" }];
}

const COUNTRIES = buildCountryList();

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}


const TONES = [
  { value: "formal", label: "Formal", desc: "Profesional y corporativo" },
  { value: "cercano", label: "Cercano", desc: "Amigable y conversacional" },
  { value: "tecnico", label: "Técnico", desc: "Especializado y detallado" },
  { value: "inspiracional", label: "Inspiracional", desc: "Motivador y aspiracional" },
  { value: "divertido", label: "Divertido", desc: "Desenfadado y con humor" },
];

const GOOGLE_FONTS = FONT_NAMES;

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEPS = [
  { icon: Building2, label: "Empresa" },
  { icon: Palette, label: "Marca" },
  { icon: Type, label: "Tipografía" },
  { icon: Users, label: "Audiencia" },
  { icon: Share2, label: "Redes" },
];

function StepIndicator({ current, total, onStepClick }: { current: number; total: number; onStepClick?: (i: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const Step = STEPS[i];
        const done = i < current;
        const active = i === current;
        const clickable = done && onStepClick;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${done ? "bg-primary border-primary text-primary-foreground" : active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}
                  ${clickable ? "cursor-pointer hover:ring-2 hover:ring-primary/40" : ""}`}
                onClick={() => clickable && onStepClick(i)}
                title={clickable ? `Editar: ${STEPS[i].label}` : undefined}
              >
                {done ? <Check className="w-5 h-5" /> : <Step.icon className="w-5 h-5" />}
              </div>
              <span className={`text-[10px] font-medium ${active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground"}`}>
                {Step.label}
              </span>
            </div>
            {i < total - 1 && (
              <div className={`w-10 h-0.5 mb-4 transition-all duration-500 ${i < current ? "bg-primary" : "bg-border"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Color picker ───────────────────────────────────────────────────────────────

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value || "#000000"}
          onChange={e => onChange(e.target.value)}
          className="w-12 h-10 rounded-lg border border-border cursor-pointer p-1 bg-background"
        />
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          className="font-mono flex-1"
          maxLength={7}
        />
      </div>
    </div>
  );
}

// ── Font preview ───────────────────────────────────────────────────────────────

function FontPreview({ font, companyName }: { font: string; companyName?: string }) {
  const name = companyName || "Tu empresa";
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}&display=swap`;
  return (
    <>
      <link rel="stylesheet" href={fontUrl} />
      <div
        className="text-2xl font-bold text-foreground bg-black/10 rounded-xl p-4 text-center"
        style={{ fontFamily: `'${font}', sans-serif` }}
      >
        {name}
      </div>
    </>
  );
}


// ── Country selector PRO ───────────────────────────────────────────────────────

function CountrySelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (countryName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedCountry = COUNTRIES.find(country => country.name === value);
  const normalizedQuery = normalizeSearchText(query);

  const filteredCountries = normalizedQuery
    ? COUNTRIES.filter(country =>
        normalizeSearchText(`${country.name} ${country.code}`).includes(normalizedQuery)
      ).slice(0, 60)
    : COUNTRIES.slice(0, 12);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pickCountry(country: CountryOption) {
    onChange(country.name);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-all hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={selectedCountry ? "flex items-center gap-2 text-foreground" : "text-muted-foreground"}>
          {selectedCountry ? (
            <>
              <span className="text-lg leading-none">{selectedCountry.flag}</span>
              <span>{selectedCountry.name}</span>
            </>
          ) : (
            "Selecciona un país..."
          )}
        </span>
        <Globe className="h-4 w-4 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-xl"
          >
            <div className="border-b border-border p-2">
              <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar país..."
                  className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                HazPost usa país y ciudad para adaptar idioma, cultura, horarios y contexto del contenido.
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto p-1">
              {filteredCountries.length > 0 ? (
                filteredCountries.map(country => {
                  const selected = country.name === value;

                  return (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => pickCountry(country)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg leading-none">{country.flag}</span>
                        <span>{country.name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{country.code}</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No encontramos ese país. Puedes elegir “Otro”.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Upload helper ──────────────────────────────────────────────────────────────

async function uploadFile(file: File): Promise<string> {
const urlRes = await fetch(`/api/storage/uploads/request-url`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: file.name,
    size: file.size,
    contentType: file.type
  }),
});
  if (!urlRes.ok) throw new Error("No se pudo obtener la URL de carga");
  const { uploadURL, objectPath } = await urlRes.json();

  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Error al subir el archivo");
  return objectPath as string;
}

// ── Step 1: Empresa ────────────────────────────────────────────────────────────

const OTRA_INDUSTRIA = "__otra__";

function Step1({
  data, onChange,
}: {
  data: BrandProfile;
  onChange: (d: Partial<BrandProfile>) => void;
}) {
  const [catalog, setCatalog] = useState<IndustryCatalogEntry[]>([]);
  const [selectValue, setSelectValue] = useState<string>("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoadingCatalog(true);

    fetchIndustryCatalog()
      .then(cat => {
        if (!mounted) return;
        setCatalog(cat);
        setCatalogError(null);

        if (data.industry) {
          const found = cat.find(e => e.name === data.industry);
          setSelectValue(found ? data.industry : OTRA_INDUSTRIA);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setCatalog([]);
        setCatalogError("No pudimos cargar la lista de industrias. Puedes escribirla manualmente en 'Otra industria'.");
      })
      .finally(() => {
        if (mounted) setLoadingCatalog(false);
      });

    return () => { mounted = false; };
  }, []);

  function handleSelectChange(val: string) {
    setSelectValue(val);
    if (val === OTRA_INDUSTRIA) {
      onChange({ industry: "", subIndustry: "" });
    } else {
      onChange({ industry: val, subIndustry: "" });
    }
  }

  const isOtra = selectValue === OTRA_INDUSTRIA;
  const selectedEntry = catalog.find(e => e.name === data.industry);
  const subcategories = (!isOtra && selectedEntry) ? selectedEntry.subcategories : [];

  const SELECT_CLS = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Cuéntanos sobre tu negocio</h2>
        <p className="text-muted-foreground">
          Esta información ayuda a HazPost a crear contenido alineado con tu marca, tu estilo y tus objetivos.
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>Nombre de la empresa *</Label>
          <Input
            value={data.companyName ?? ""}
            onChange={e => onChange({ companyName: e.target.value })}
            placeholder="Ej: Acme Studio, BrandNova, TuMarca..."
          />
        </div>

        <div className="grid gap-2">
          <Label>
            Slogan del negocio <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            value={data.slogan ?? ""}
            onChange={e => onChange({ slogan: e.target.value.slice(0, 150) })}
            placeholder="Ej: Creamos experiencias únicas, Moda que inspira, Soluciones digitales para crecer..."
            maxLength={150}
          />
          <p className="text-[11px] text-muted-foreground/70 leading-tight">
            Esto ayuda a que el contenido tenga una voz más coherente con tu marca. Máximo 150 caracteres.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>
              Industria <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>

            <select
              value={selectValue}
              onChange={e => handleSelectChange(e.target.value)}
              className={SELECT_CLS}
              disabled={loadingCatalog}
            >
              <option value="">
                {loadingCatalog ? "Cargando industrias..." : "Selecciona una industria..."}
              </option>
              {catalog.map(e => (
                <option key={e.slug ?? e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
              <option value={OTRA_INDUSTRIA}>Otra industria</option>
            </select>

            {catalogError && (
              <p className="text-[11px] text-destructive/80 leading-tight">
                {catalogError}
              </p>
            )}

            {isOtra && (
              <Input
                value={data.industry ?? ""}
                onChange={e => onChange({ industry: e.target.value })}
                placeholder="Ej: Relojería, Club de ventas, Importadora..."
                autoFocus
              />
            )}

     {!isOtra && subcategories.length > 0 && (
  <div className="grid gap-2">
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">
        Tipos específicos <span className="font-normal">(puedes elegir varios)</span>
      </Label>

      <button
        type="button"
        className="text-[11px] text-primary hover:underline"
        onClick={() =>
          onChange({
            subIndustry:
              (data.subIndustry ?? "").split(",").filter(Boolean).length === subcategories.length
                ? ""
                : subcategories.map(s => s.name).join(","),
          })
        }
      >
        {(data.subIndustry ?? "").split(",").filter(Boolean).length === subcategories.length
          ? "Quitar todas"
          : "Seleccionar todas"}
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-border p-2 bg-background/60">
      {subcategories.map(s => {
        const selected = (data.subIndustry ?? "")
          .split(",")
          .map(x => x.trim())
          .filter(Boolean)
          .includes(s.name);

        return (
          <label
            key={s.slug}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/40"
            }`}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={e => {
                const current = (data.subIndustry ?? "")
                  .split(",")
                  .map(x => x.trim())
                  .filter(Boolean);

                const next = e.target.checked
                  ? Array.from(new Set([...current, s.name]))
                  : current.filter(x => x !== s.name);

                onChange({ subIndustry: next.join(",") });
              }}
              className="h-4 w-4"
            />
            <span>{s.name}</span>
          </label>
        );
      })}
    </div>
  </div>
)}

            <p className="text-[11px] text-muted-foreground/70 leading-tight">
              Nos ayuda a adaptar el contenido a tu industria y mejorar los resultados desde el primer día.
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>País *</Label>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Global
              </span>
            </div>
            <CountrySelect
              value={data.country ?? ""}
              onChange={country => onChange({ country })}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Ciudad *</Label>
          <Input
            value={data.city ?? ""}
            onChange={e => onChange({ city: e.target.value })}
            placeholder="Ej: Bogotá, Ciudad de México, Madrid..."
          />
        </div>

        <div className="grid gap-2">
          <Label>
            Sitio web <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>

          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              value={data.website ?? ""}
              onChange={e => onChange({ website: e.target.value })}
              placeholder="Ej: https://tumarca.com"
              className="flex-1"
            />
          </div>

          <p className="text-[11px] text-muted-foreground/70 leading-tight">
            Si agregas tu sitio web, HazPost podrá entender mejor tu negocio, tus productos y el estilo de tu marca.
          </p>
        </div>
      </div>
    </div>
  );
}
// ── Checkerboard transparent bg style ─────────────────────────────────────────
const checkerStyle: React.CSSProperties = {
  backgroundImage:
    "repeating-conic-gradient(#b0b0b040 0% 25%, transparent 0% 50%)",
  backgroundSize: "16px 16px",
};

// ── Step 2: Marca ──────────────────────────────────────────────────────────────

function Step2({
  data, onChange, aiSuggestions, onDismissSuggestion,
}: {
  data: BrandProfile;
  onChange: (d: Partial<BrandProfile>) => void;
  aiSuggestions?: AiSuggestions | null;
  onDismissSuggestion?: (field: "description" | "primaryColor") => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [removingBgIdx, setRemovingBgIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse logo list from JSON string; fall back to logoUrl for compat
  const logos: string[] = (() => {
    try { return JSON.parse(data.logoUrls ?? "[]") as string[]; } catch { return []; }
  })();
  if (logos.length === 0 && data.logoUrl) logos.push(data.logoUrl);

  function saveLogos(list: string[]) {
    const primary = list[0] ?? "";
    onChange({ logoUrls: JSON.stringify(list), logoUrl: primary });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const invalid = files.find(f => !["image/png", "image/svg+xml", "image/jpeg", "image/webp"].includes(f.type));
    if (invalid) {
      toast({ title: "Formato no soportado", description: "Usa PNG, SVG, JPG o WebP.", variant: "destructive" });
      return;
    }
    const tooBig = files.find(f => f.size > 5 * 1024 * 1024);
    if (tooBig) {
      toast({ title: "Archivo muy grande", description: "Cada logo debe pesar menos de 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const paths = await Promise.all(files.map(f => uploadFile(f)));
      const updated = [...logos, ...paths];
      saveLogos(updated);
      toast({ title: `${paths.length === 1 ? "Logo subido" : `${paths.length} logos subidos`}`, description: "Los logos fueron cargados correctamente." });
    } catch {
      toast({ title: "Error al subir", description: "No se pudo subir el logo. Intenta de nuevo.", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleRemoveBg(idx: number) {
    setRemovingBgIdx(idx);
    try {
      const res = await fetch(`/api/brand-profile/remove-logo-bg`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: logos[idx] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error", description: (body as { error?: string }).error ?? "No se pudo procesar el logo.", variant: "destructive" });
        return;
      }
      const body = await res.json() as { logoUrl?: string };
      if (body.logoUrl) {
        const updated = logos.map((l, i) => (i === idx ? body.logoUrl! : l));
        saveLogos(updated);
        toast({ title: "Fondo eliminado", description: "El fondo del logo fue eliminado." });
      }
    } catch {
      toast({ title: "Error", description: "No se pudo procesar el logo.", variant: "destructive" });
    } finally {
      setRemovingBgIdx(null);
    }
  }

  function removeLogo(idx: number) {
    const updated = logos.filter((_, i) => i !== idx);
    saveLogos(updated);
  }

  function setPrimary(idx: number) {
    if (idx === 0) return;
    const updated = [logos[idx], ...logos.filter((_, i) => i !== idx)];
    saveLogos(updated);
    toast({ title: "Logo principal actualizado" });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Identidad visual de tu marca</h2>
        <p className="text-muted-foreground">Sube tu logo y define los colores que identifican a tu empresa.</p>
      </div>

      {/* Logo upload */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Logos de la empresa</Label>
          <span className="text-[11px] text-muted-foreground">{logos.length > 0 ? `${logos.length} logo${logos.length > 1 ? "s" : ""} · el primero es el principal` : ""}</span>
        </div>

        {/* Logo grid */}
        {logos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {logos.map((url, idx) => {
              const src = `/api/storage${url}`;
              const isProcessing = removingBgIdx === idx;
              return (
                <div key={url + idx} className="group relative">
                  <div
                    className={`rounded-xl border-2 overflow-hidden transition-colors ${idx === 0 ? "border-primary" : "border-border"}`}
                    style={checkerStyle}
                  >
                    <div className="flex items-center justify-center h-20 p-2">
                      {isProcessing ? (
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      ) : (
                        <img src={src} alt={`Logo ${idx + 1}`} className="max-h-full max-w-full object-contain" />
                      )}
                    </div>
                  </div>
                  {idx === 0 && (
                    <span className="absolute -top-2 -left-1 text-[9px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-full leading-none">Principal</span>
                  )}
                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                    {idx !== 0 && (
                      <button
                        className="text-[10px] text-white bg-primary/80 hover:bg-primary rounded px-1.5 py-0.5 w-full text-center leading-tight"
                        onClick={() => setPrimary(idx)}
                      >
                        Hacer principal
                      </button>
                    )}
                    <button
                      className="text-[10px] text-white bg-white/20 hover:bg-white/30 rounded px-1.5 py-0.5 w-full text-center leading-tight flex items-center justify-center gap-1"
                      onClick={() => handleRemoveBg(idx)}
                      disabled={isProcessing}
                    >
                      <Scissors className="w-2.5 h-2.5" /> Quitar fondo
                    </button>
                    <button
                      className="text-[10px] text-red-300 hover:text-red-200 bg-white/10 hover:bg-white/20 rounded px-1.5 py-0.5 w-full text-center leading-tight flex items-center justify-center gap-1"
                      onClick={() => removeLogo(idx)}
                    >
                      <X className="w-2.5 h-2.5" /> Eliminar
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add more button */}
            <div
              className="rounded-xl border-2 border-dashed border-border h-20 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors gap-1"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Agregar</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Empty state — first upload */}
        {logos.length === 0 && (
          <div
            className="rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 py-8 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="w-7 h-7 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Haz clic para subir logos</p>
                <p className="text-xs text-muted-foreground/70">PNG, SVG, JPG o WebP · máx. 5 MB por archivo</p>
                <p className="text-xs text-primary/80">Puedes subir varias variaciones a la vez</p>
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          multiple
          onChange={handleLogoUpload}
          className="hidden"
        />
        <p className="text-xs text-muted-foreground">
          Para mejores resultados sube logos con <strong>fondo transparente</strong> (PNG o SVG).
          El primer logo es el <strong>principal</strong> — se usa en publicaciones.
        </p>
      </div>

      {/* AI primaryColor suggestion */}
      {aiSuggestions?.primaryColor && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="w-6 h-6 rounded-full border border-border shrink-0" style={{ background: aiSuggestions.primaryColor }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary" />
              Color detectado por IA: <span className="font-mono text-primary">{aiSuggestions.primaryColor}</span>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => { onChange({ primaryColor: aiSuggestions.primaryColor! }); onDismissSuggestion?.("primaryColor"); }}
          >
            Usar
          </Button>
          <button
            type="button"
            onClick={() => onDismissSuggestion?.("primaryColor")}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="Descartar sugerencia"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Color pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ColorField
          label="Color primario"
          value={data.primaryColor ?? "#000000"}
          onChange={v => onChange({ primaryColor: v })}
        />
        <ColorField
          label="Color secundario"
          value={data.secondaryColor ?? "#ffffff"}
          onChange={v => onChange({ secondaryColor: v })}
        />
      </div>

      {/* Color preview */}
      <div className="rounded-xl overflow-hidden border border-border">
        <div className="h-8" style={{ background: data.primaryColor ?? "#000000" }} />
        <div className="h-4" style={{ background: data.secondaryColor ?? "#ffffff" }} />
      </div>

      {/* Description */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Descripción del negocio *</Label>
          {aiSuggestions?.description && (
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" />
              Sugerido por IA
              <button
                type="button"
                onClick={() => onDismissSuggestion?.("description")}
                className="ml-0.5 opacity-70 hover:opacity-100"
                title="Descartar sugerencia"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
        </div>
        <Textarea
          value={data.businessDescription ?? ""}
          onChange={e => onChange({ businessDescription: e.target.value })}
          placeholder="Describe tu empresa en 2-3 líneas: qué hace, a quién sirve y qué te hace diferente..."
          className={`resize-none h-32 ${aiSuggestions?.description ? "border-primary/40 bg-primary/5" : ""}`}
          maxLength={2000}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground text-right">{(data.businessDescription ?? "").length}/2000</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Tipografía ─────────────────────────────────────────────────────────

function Step3({ data, onChange }: { data: BrandProfile; onChange: (d: Partial<BrandProfile>) => void }) {
  const { toast } = useToast();
  const [fontSearch, setFontSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fontFileRef = useRef<HTMLInputElement>(null);

  const filteredFonts = GOOGLE_FONTS.filter(f =>
    f.toLowerCase().includes(fontSearch.toLowerCase())
  );

  const selectedFont = data.brandFont ?? "Inter";

  async function handleFontUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["font/ttf", "font/otf", "font/woff2", "application/font-woff2", "application/x-font-ttf", "application/x-font-otf"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!allowed.includes(file.type) && !["ttf", "otf", "woff2"].includes(ext ?? "")) {
      toast({ title: "Formato no soportado", description: "Usa archivos .ttf, .otf o .woff2.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const objectPath = await uploadFile(file);
      onChange({ brandFontUrl: objectPath, brandFont: file.name.replace(/\.(ttf|otf|woff2)$/i, "") });
      toast({ title: "Fuente subida", description: `${file.name} fue cargada correctamente.` });
    } catch {
      toast({ title: "Error al subir", description: "No se pudo subir la fuente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Tipografía de tu marca</h2>
        <p className="text-muted-foreground">Elige la fuente que mejor represente la personalidad de tu empresa.</p>
      </div>

      {/* Font preview */}
      <div className="space-y-2">
        <Label>Vista previa</Label>
        <FontPreview font={selectedFont} companyName={data.companyName} />
        <p className="text-xs text-muted-foreground text-center">{selectedFont}</p>
      </div>

      {/* Font selector */}
      <div className="space-y-2">
        <Label>Buscar fuente de Google Fonts (+50 disponibles)</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={fontSearch}
            onChange={e => setFontSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto border border-border rounded-xl p-2 bg-black/10">
          {filteredFonts.map(font => (
            <button
              key={font}
              onClick={() => onChange({ brandFont: font, brandFontUrl: "" })}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors truncate
                ${selectedFont === font && !data.brandFontUrl
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-white/10 text-foreground"
                }`}
            >
              {font}
            </button>
          ))}
          {filteredFonts.length === 0 && (
            <p className="col-span-3 text-muted-foreground text-sm text-center py-4">No se encontraron fuentes</p>
          )}
        </div>
      </div>

      {/* Custom font upload */}
      <div className="border border-dashed border-border rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Subir mi propia fuente</span>
        </div>
        <p className="text-xs text-muted-foreground">Si tu marca tiene una tipografía propia, súbela aquí. Formatos aceptados: .ttf, .otf, .woff2</p>
        <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff2" onChange={handleFontUpload} className="hidden" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fontFileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploading ? "Subiendo..." : "Seleccionar archivo"}
          </Button>
          {data.brandFontUrl && (
            <span className="text-xs text-primary flex items-center gap-1">
              <Check className="w-3 h-3" />
              Fuente personalizada: {data.brandFont}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Audiencia y tono ───────────────────────────────────────────────────

function Step4({
  data, onChange, aiSuggestions, onDismissSuggestion,
}: {
  data: BrandProfile;
  onChange: (d: Partial<BrandProfile>) => void;
  aiSuggestions?: AiSuggestions | null;
  onDismissSuggestion?: (field: "audience" | "tone") => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const refImgInputRef = useRef<HTMLInputElement>(null);

  const currentImages: string[] = (() => {
    try { return JSON.parse(data.referenceImages ?? "[]"); } catch { return []; }
  })();

  async function handleRefImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (currentImages.length + files.length > 5) {
      toast({ title: "Máximo 5 imágenes", description: "Puedes subir hasta 5 imágenes de referencia.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const paths = await Promise.all(files.map(f => uploadFile(f)));
      const newImages = [...currentImages, ...paths];
      onChange({ referenceImages: JSON.stringify(newImages) });
      toast({ title: "Imágenes subidas", description: `${files.length} imagen(es) cargada(s).` });
    } catch {
      toast({ title: "Error al subir", description: "No se pudieron subir las imágenes.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (refImgInputRef.current) refImgInputRef.current.value = "";
    }
  }

  function removeRefImage(idx: number) {
    const updated = currentImages.filter((_, i) => i !== idx);
    onChange({ referenceImages: JSON.stringify(updated) });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Audiencia y tono de comunicación</h2>
        <p className="text-muted-foreground">Define a quién le hablas y cómo. Esto personaliza el estilo de cada post generado.</p>
      </div>

      {/* Audience description */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>¿A quién le hablas? *</Label>
          {aiSuggestions?.audience && (
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" />
              Sugerido por IA
              <button
                type="button"
                onClick={() => onDismissSuggestion?.("audience")}
                className="ml-0.5 opacity-70 hover:opacity-100"
                title="Descartar sugerencia"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
        </div>
        <Textarea
          value={data.audienceDescription ?? ""}
          onChange={e => onChange({ audienceDescription: e.target.value })}
          placeholder="Ej: Emprendedores de 25-45 años que buscan crecer su negocio en redes sociales, con presencia en Instagram y TikTok..."
          className={`resize-none h-24 ${aiSuggestions?.audience ? "border-primary/40 bg-primary/5" : ""}`}
          maxLength={600}
        />
      </div>

      {/* Tone selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Tono de comunicación *</Label>
          {aiSuggestions?.tone && (
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" />
              Sugerido por IA
              <button
                type="button"
                onClick={() => onDismissSuggestion?.("tone")}
                className="ml-0.5 opacity-70 hover:opacity-100"
                title="Descartar sugerencia"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {TONES.map(tone => (
            <button
              key={tone.value}
              onClick={() => onChange({ brandTone: tone.value })}
              className={`text-left p-3 rounded-xl border-2 transition-all relative
                ${data.brandTone === tone.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-white/5"
                }`}
            >
              {aiSuggestions?.tone === tone.value && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-primary/20">
                  <Sparkles className="w-2.5 h-2.5 text-primary" />
                </span>
              )}
              <p className="font-semibold text-sm text-foreground">{tone.label}</p>
              <p className="text-xs text-muted-foreground">{tone.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Reference images */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Imágenes de referencia de estilo (hasta 5)</Label>
          <span className="text-xs text-muted-foreground">{currentImages.length}/5</span>
        </div>
        <p className="text-xs text-muted-foreground">Sube posts que te gusten o que ya hayas publicado. La IA los usará como referencia visual.</p>

        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {currentImages.map((path, idx) => (
            <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-black/20">
              <img
                src={`/api/storage${path}`}
                alt={`Referencia ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => removeRefImage(idx)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
          {currentImages.length < 5 && (
            <button
              onClick={() => refImgInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:border-primary/50 transition-colors bg-black/10"
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
            </button>
          )}
        </div>
        <input
          ref={refImgInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleRefImageUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}

// ── Step 5: Redes sociales ─────────────────────────────────────────────────────

function GuideStep({ num, color, title, desc, link, linkText, badge }: { num: string; color: string; title: string; desc: string; link?: string | null; linkText?: string | null; badge?: string }) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <span className={`w-7 h-7 rounded-full font-bold text-sm flex items-center justify-center ${color}`}>{num}</span>
        <div className="w-0.5 bg-border/40 flex-1 mt-1 min-h-[8px]" />
      </div>
      <div className="pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm text-foreground">{title}</p>
          {badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">{badge}</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-xs underline mt-1.5 font-medium ${color.replace("bg-", "text-").split(" ")[0]}`}>
            {linkText} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </li>
  );
}

// ── Visual diagrams for Step 5 ─────────────────────────────────────────────────
function MetaDeveloperMockup() {
  return (
    <div className="rounded-lg overflow-hidden border border-pink-500/20 text-[10px] font-mono select-none my-2">
      <div className="bg-[#1877f2]/20 px-3 py-1.5 flex items-center gap-2 border-b border-pink-500/20">
        <div className="w-2 h-2 rounded-full bg-red-500/60" />
        <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
        <div className="w-2 h-2 rounded-full bg-green-500/60" />
        <span className="ml-2 text-blue-300">developers.facebook.com/apps</span>
      </div>
      <div className="bg-[#18191a] p-3 space-y-2">
        <div className="flex items-center gap-2 text-white/80">
          <div className="w-5 h-5 rounded bg-[#1877f2] flex items-center justify-center text-white font-bold text-[8px]">f</div>
          <span className="text-white/60">Meta for Developers</span>
          <span className="ml-auto text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/30">+ Crear app</span>
        </div>
        <div className="border border-white/10 rounded p-2 space-y-1.5">
          <p className="text-white/50">Paso 2 — Tipo de app:</p>
          <div className="grid grid-cols-3 gap-1">
            {["Consumer", "Business ✓", "Gaming"].map(t => (
              <div key={t} className={`text-center py-1 rounded border text-[9px] ${t.includes("✓") ? "border-[#1877f2] text-[#4a9eff] bg-[#1877f2]/10" : "border-white/10 text-white/40"}`}>{t.replace(" ✓","")}{t.includes("✓") && <span className="text-green-400 ml-0.5">✓</span>}</div>
            ))}
          </div>
        </div>
        <div className="border border-white/10 rounded p-2">
          <p className="text-white/50 mb-1">Configuración → Básica</p>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/5 rounded px-2 py-1">
              <p className="text-white/30 text-[8px]">App ID</p>
              <p className="text-green-400">1234567890</p>
            </div>
            <div className="flex-1 bg-white/5 rounded px-2 py-1">
              <p className="text-white/30 text-[8px]">App Secret</p>
              <p className="text-pink-400">abc••••••xyz <span className="text-white/30">👁</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TikTokDeveloperMockup() {
  return (
    <div className="rounded-lg overflow-hidden border border-cyan-500/20 text-[10px] font-mono select-none my-2">
      <div className="bg-black/50 px-3 py-1.5 flex items-center gap-2 border-b border-cyan-500/20">
        <div className="w-2 h-2 rounded-full bg-red-500/60" />
        <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
        <div className="w-2 h-2 rounded-full bg-green-500/60" />
        <span className="ml-2 text-cyan-300">developers.tiktok.com</span>
      </div>
      <div className="bg-[#121212] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-black border border-white/20 flex items-center justify-center text-white text-[8px] font-bold">TT</div>
          <span className="text-white/60">TikTok for Developers</span>
          <span className="ml-auto text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">Manage Apps</span>
        </div>
        <div className="border border-white/10 rounded p-2 space-y-1.5">
          <div className="flex justify-between items-center">
            <p className="text-white/70">Mi App</p>
            <span className="text-green-400 text-[9px] border border-green-500/30 px-1.5 rounded">Live</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[["Client Key","TT_abc12345"],["Client Secret","Show ••••"]].map(([k,v]) => (
              <div key={k} className="bg-white/5 rounded px-2 py-1">
                <p className="text-white/30 text-[8px]">{k}</p>
                <p className="text-cyan-400">{v}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 pt-1.5">
            <p className="text-white/40 mb-1">Products activos:</p>
            <div className="flex gap-1 flex-wrap">
              {["Content Posting API ✓","Login Kit ✓"].map(p => (
                <span key={p} className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded text-[9px]">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaPermissionsMockup() {
  return (
    <div className="rounded-lg overflow-hidden border border-blue-500/20 text-[10px] font-mono select-none my-2">
      <div className="bg-[#1877f2]/20 px-3 py-1.5 flex items-center gap-2 border-b border-blue-500/20">
        <div className="w-2 h-2 rounded-full bg-red-500/60" />
        <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
        <div className="w-2 h-2 rounded-full bg-green-500/60" />
        <span className="ml-2 text-blue-300">developers.facebook.com → Permisos</span>
      </div>
      <div className="bg-[#18191a] p-3 space-y-2">
        <p className="text-white/50">Permisos y funciones → Solicitar acceso</p>
        <div className="space-y-1">
          {[
            { name: "pages_manage_posts", status: "Aprobado", color: "text-green-400 border-green-500/30 bg-green-500/10" },
            { name: "pages_read_engagement", status: "Aprobado", color: "text-green-400 border-green-500/30 bg-green-500/10" },
            { name: "instagram_basic", status: "Aprobado", color: "text-green-400 border-green-500/30 bg-green-500/10" },
            { name: "instagram_content_publish", status: "Solicitar →", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
          ].map(p => (
            <div key={p.name} className="flex items-center justify-between bg-white/5 rounded px-2 py-1">
              <span className="text-white/70">{p.name}</span>
              <span className={`px-1.5 py-0.5 rounded border text-[9px] ${p.color}`}>{p.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const API_GUIDES: Record<string, React.ReactNode> = {
  instagram: (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-pink-500/10 border border-pink-500/20 text-xs text-pink-300 flex items-start gap-2">
        <Instagram className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Necesitas una cuenta de <strong>Instagram Business o Creator</strong> y una app de Meta Developer. El proceso toma ~10 minutos.</span>
      </div>
      <MetaDeveloperMockup />
      <ol className="space-y-0 list-none pl-0">
        <GuideStep num="1" color="bg-pink-500/20 text-pink-400" title="Crear una app en Meta for Developers" desc="Inicia sesión y crea una nueva aplicación. En '¿Para qué sirve tu app?', selecciona 'Otras' → luego elige tipo 'Business'." link="https://developers.facebook.com/apps/create/" linkText="Ir a crear app →" />
        <GuideStep num="2" color="bg-pink-500/20 text-pink-400" title="Agregar producto: Instagram" desc="En el panel de tu app, haz clic en '+ Agregar producto'. Busca 'Instagram' y haz clic en 'Configurar'. Activa el modo 'Live' (no Sandbox) cuando estés listo." />
        <GuideStep num="3" color="bg-pink-500/20 text-pink-400" title="Copiar App ID y App Secret" desc="Ve a 'Configuración' → 'Básica'. Copia el App ID y haz clic en 'Mostrar' junto al App Secret para copiarlo también." badge="App ID · App Secret" />
        <GuideStep num="4" color="bg-pink-500/20 text-pink-400" title="Pegar credenciales en el sistema" desc="Abre Configuración del sistema en esta app → sección 'Credenciales de Aplicación' → pega el App ID y App Secret de Meta, luego guarda." />
        <GuideStep num="5" color="bg-pink-500/20 text-pink-400" title="Autorizar la cuenta" desc="Vuelve a Configuración → haz clic en 'Autorizar con Meta'. Acepta los permisos solicitados. La cuenta quedará conectada." />
      </ol>
    </div>
  ),
  tiktok: (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 flex items-start gap-2">
        <PlaySquare className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Necesitas una cuenta de <strong>TikTok Business</strong> y registrarte como developer. El proceso toma ~15 minutos incluyendo revisión.</span>
      </div>
      <TikTokDeveloperMockup />
      <ol className="space-y-0 list-none pl-0">
        <GuideStep num="1" color="bg-cyan-500/20 text-cyan-400" title="Registrarse en TikTok for Developers" desc="Accede al portal de desarrolladores de TikTok con tu cuenta de TikTok Business." link="https://developers.tiktok.com/" linkText="Ir a TikTok Developers →" />
        <GuideStep num="2" color="bg-cyan-500/20 text-cyan-400" title="Crear una nueva app" desc="Ve a 'Manage apps' → 'Create app'. Completa el nombre, descripción y categoría. Selecciona 'Web' como plataforma." />
        <GuideStep num="3" color="bg-cyan-500/20 text-cyan-400" title="Activar productos: Content Posting API" desc="En el panel de tu app, ve a 'Products'. Agrega 'Content Posting API'. También agrega 'Login Kit' para la autenticación OAuth." badge="Content Posting API" />
        <GuideStep num="4" color="bg-cyan-500/20 text-cyan-400" title="Obtener Client Key y Client Secret" desc="En la sección 'App detail' de tu app, copia el Client Key. Para el Client Secret haz clic en 'Generate' o 'Show'." badge="Client Key · Client Secret" />
        <GuideStep num="5" color="bg-cyan-500/20 text-cyan-400" title="Pegar y autorizar" desc="Ve a Configuración del sistema → pega el Client Key y Client Secret de TikTok, guarda y haz clic en 'Autorizar con TikTok'." />
      </ol>
    </div>
  ),
  facebook: (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2">
        <Facebook className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Facebook usa la <strong>misma app de Meta</strong> que configuraste para Instagram. Solo necesitas activar permisos adicionales.</span>
      </div>
      <MetaPermissionsMockup />
      <ol className="space-y-0 list-none pl-0">
        <GuideStep num="1" color="bg-blue-500/20 text-blue-400" title="Abre tu app de Meta existente" desc="Ve a Meta for Developers → selecciona la app que ya tienes configurada para Instagram." link="https://developers.facebook.com/apps/" linkText="Ir a Mis Apps →" />
        <GuideStep num="2" color="bg-blue-500/20 text-blue-400" title="Agregar permisos de Páginas" desc="Ve a 'Permisos y funciones'. Solicita los permisos: pages_manage_posts y pages_read_engagement. Puede requerir revisión de Meta." badge="pages_manage_posts" />
        <GuideStep num="3" color="bg-blue-500/20 text-blue-400" title="Vincular Página de Facebook" desc="Asegúrate de que tu Página de Facebook esté asociada a tu cuenta personal en Meta Business Suite." link="https://business.facebook.com/" linkText="Abrir Meta Business Suite →" />
        <GuideStep num="4" color="bg-blue-500/20 text-blue-400" title="Re-autorizar con Meta" desc="Si ya autorizaste para Instagram, es posible que necesites re-autorizar para incluir los nuevos permisos de página. Usa el botón 'Autorizar con Meta' en Configuración." />
      </ol>
    </div>
  ),
};

const SOCIAL_TABS = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-400", activeClass: "border-pink-500 text-pink-400" },
  { id: "tiktok", label: "TikTok", icon: PlaySquare, color: "text-cyan-400", activeClass: "border-cyan-500 text-cyan-400" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-400", activeClass: "border-blue-500 text-blue-400" },
];

const GEN_FREQ_OPTIONS = [
  { value: "daily", label: "Diario", desc: "La IA genera contenido cada día", icon: "🔥", recommended: true },
  { value: "3x", label: "3× semana", desc: "Lunes, miércoles y viernes", icon: "⚡", recommended: false },
  { value: "weekly", label: "Semanal", desc: "Un lote cada semana", icon: "📅", recommended: false },
  { value: "none", label: "Manual", desc: "Yo voy al generador cuando quiero", icon: "✋", recommended: false },
];

function Step5({ data, onChange }: { data: BrandProfile; onChange: (patch: Partial<BrandProfile>) => void }) {
  const [activeTab, setActiveTab] = useState("instagram");
  const freq = data.aiGenFrequency ?? "daily";

  return (
    <div className="space-y-5">
      {/* ── IA activation card ── */}
      <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-black/40 to-secondary/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground">Generación automática de IA</p>
            <p className="text-xs text-muted-foreground mt-0.5">La IA creará imágenes y textos listos para aprobar — sin que tengas que hacer nada.</p>
          </div>
          {freq === "none" ? (
            <div className="ml-auto flex items-center gap-1.5 bg-muted/40 border border-border rounded-full px-3 py-1">
              <span className="text-xs font-bold text-muted-foreground">Manual</span>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-1.5 bg-primary/20 border border-primary/40 rounded-full px-3 py-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-bold text-primary">Activa</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GEN_FREQ_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({ aiGenFrequency: opt.value })}
              className={`relative p-3 rounded-xl border text-left transition-all ${
                freq === opt.value
                  ? "border-primary bg-primary/15 shadow-[0_0_12px_rgba(0,201,83,0.2)]"
                  : "border-border/50 bg-black/20 hover:border-primary/40"
              }`}
            >
              {opt.recommended && (
                <span className="absolute -top-2 right-2 text-[9px] px-1.5 py-0.5 bg-primary text-black font-bold rounded-full">Recomendado</span>
              )}
              <div className="text-lg mb-1">{opt.icon}</div>
              <p className="text-xs font-bold text-foreground">{opt.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/70">Puedes cambiar esto en cualquier momento desde Configuración → Automatización.</p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Conecta tus redes sociales</h2>
        <p className="text-sm text-muted-foreground">Opcional — puedes hacerlo ahora o después desde Configuración.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {SOCIAL_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-all -mb-px
              ${activeTab === tab.id ? tab.activeClass : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Guide content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {API_GUIDES[activeTab]}
        </motion.div>
      </AnimatePresence>

      {/* Direct action buttons */}
      <div className="pt-2 border-t border-border/50">
        <p className="text-xs text-muted-foreground mb-3">Cuando tengas las credenciales guardadas, puedes conectar desde aquí o ir a Configuración más adelante.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/auth/meta/redirect`, "_blank", "noopener,noreferrer")}
            className="border-pink-500/40 text-pink-400 hover:bg-pink-500/10"
          >
            <Instagram className="w-4 h-4 mr-2" />
            Conectar Instagram / Facebook
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/auth/tiktok/redirect`, "_blank", "noopener,noreferrer")}
            className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
          >
            <PlaySquare className="w-4 h-4 mr-2" />
            Conectar TikTok
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Wizard validation (informational only — no fields block progression) ───────

function validateStep(_step: number, _data: BrandProfile): string | null {
  return null;
}

// ── Main Wizard ────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
  onDismiss?: () => void;
  onChooseFree?: () => void;
  initialStep?: number;
  initialData?: BrandProfile;
  editMode?: boolean;
  registrationMode?: boolean;
}

export function OnboardingWizard({ onComplete, onDismiss, onChooseFree, initialStep = 0, initialData = {}, editMode = false, registrationMode = false }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<BrandProfile>(initialData);
  const [saving, setSaving] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestions | null>(null);
  const [activeBizId, setActiveBizId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<"next" | "skip" | null>(null);

  function isStepEmpty(stepIdx: number, d: BrandProfile): boolean {
    switch (stepIdx) {
      case 0:
        return !d.companyName?.trim() && !d.industry?.trim() && !d.subIndustry?.trim() && !d.country?.trim() && !d.website?.trim();
      case 1: {
        const hasLogo = !!(d.logoUrl?.trim() || d.logoUrls);
        const hasDesc = !!d.businessDescription?.trim();
        const hasCustomColor = !!(d.primaryColor?.trim() || d.secondaryColor?.trim());
        return !hasLogo && !hasDesc && !hasCustomColor;
      }
      case 2:
        return false;
      case 3:
        return !d.audienceDescription?.trim() && !d.brandTone?.trim();
      default:
        return false;
    }
  }

  useEffect(() => {
    fetch(`/api/businesses`, { credentials: "include" })
      .then(r => r.json())
      .then((d: { businesses?: { id: number; isDefault?: boolean }[] }) => {
        const list = d.businesses ?? [];
        const def = list.find(b => b.isDefault) ?? list[0];
        if (def) setActiveBizId(def.id);
      })
      .catch(() => {});
  }, []);

  // Consume pre-computed AI suggestions stored by the registration flow
  useEffect(() => {
    function applyStored() {
      const raw = localStorage.getItem("hz_ai_suggestions");
      if (!raw) return false;
      try {
        const s = JSON.parse(raw) as AiSuggestions;
        setAiSuggestions(s);
        // Only fill empty fields — never overwrite existing user-entered values
        setData(prev => {
          const patch: Partial<BrandProfile> = {};
          if (s.description && !prev.businessDescription?.trim()) patch.businessDescription = s.description;
          if (s.audience && !prev.audienceDescription?.trim()) patch.audienceDescription = s.audience;
          if (s.tone && !prev.brandTone?.trim()) patch.brandTone = s.tone;
          if (s.primaryColor && !prev.primaryColor?.trim()) patch.primaryColor = s.primaryColor;
          return Object.keys(patch).length > 0 ? { ...prev, ...patch } : prev;
        });
        localStorage.removeItem("hz_ai_suggestions");
      } catch { /* ignore */ }
      return true;
    }
    if (applyStored()) return;
    // If analysis is in-flight from registration, poll every 1.5s up to 30s
    if (!localStorage.getItem("hz_pending_analysis")) return;
    const id = setInterval(() => {
      if (applyStored()) clearInterval(id);
      if (!localStorage.getItem("hz_pending_analysis")) clearInterval(id);
    }, 1500);
    const maxWait = setTimeout(() => clearInterval(id), 30_000);
    return () => { clearInterval(id); clearTimeout(maxWait); };
  }, []);

  function patchData(patch: Partial<BrandProfile>) {
    setData(prev => ({ ...prev, ...patch }));
  }

  function getAnalyzeEndpoint(): string {
    if (activeBizId) return `/api/businesses/${activeBizId}/analyze-website`;
    return `/api/analyze-website`;
  }

  function handleAiAnalysis(suggestions: AiSuggestions) {
    setAiSuggestions(suggestions);
    // Only fill empty fields — never overwrite existing user-entered or pre-loaded values
    setData(prev => {
      const patch: Partial<BrandProfile> = {};
      if (suggestions.description && !prev.businessDescription?.trim()) patch.businessDescription = suggestions.description;
      if (suggestions.audience && !prev.audienceDescription?.trim()) patch.audienceDescription = suggestions.audience;
      if (suggestions.tone && !prev.brandTone?.trim()) patch.brandTone = suggestions.tone;
      if (suggestions.primaryColor && !prev.primaryColor?.trim()) patch.primaryColor = suggestions.primaryColor;
      return Object.keys(patch).length > 0 ? { ...prev, ...patch } : prev;
    });
  }

  function dismissSuggestion(field: "description" | "audience" | "tone" | "primaryColor") {
    setAiSuggestions(prev => prev ? { ...prev, [field]: null } : null);
  }

  const [analyzing, setAnalyzing] = useState(false);

  async function triggerAnalyze(url: string): Promise<void> {
    setAnalyzing(true);
    try {
      const res = await fetch(getAnalyzeEndpoint(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) return;
      const suggestions = await res.json() as AiSuggestions;
      if (suggestions.description || suggestions.audience || suggestions.tone || suggestions.primaryColor) {
        handleAiAnalysis(suggestions);
      }
    } catch {
      /* fail silently */
    } finally {
      setAnalyzing(false);
    }
  }

  const saveProgress = useCallback(async (nextStep: number, markComplete?: boolean): Promise<boolean> => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...data, onboardingStep: nextStep };
      // Only set onboardingCompleted if explicitly requested (avoids resetting a completed profile during step navigation)
      if (markComplete !== undefined) payload.onboardingCompleted = markComplete;
      const res = await fetch(`/api/brand-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Error al guardar", description: (body as { error?: string }).error ?? "No se pudo guardar el progreso.", variant: "destructive" });
        return false;
      }
      return true;
    } catch {
      toast({ title: "Error al guardar", description: "No se pudo guardar el progreso.", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [data, toast]);

async function doNext() {
  const nextStep = step + 1;

  if (step === 0 && data.industry?.trim()) {
    const catalog = readCachedIndustryCatalog() ?? [];
    const isKnownIndustry = catalog.some(
      item => item.name === data.industry?.trim()
    );

    if (!isKnownIndustry) {
      await sendIndustrySuggestion(data.industry);
    }
  }

  const ok = await saveProgress(nextStep);
  if (ok) {
    setStep(nextStep);
    if (step === 0 && data.website?.trim() && !aiSuggestions) {
      triggerAnalyze(data.website.trim()).catch(() => {});
    }
  }
}

  async function doSkipStep() {
    const ok = await saveProgress(step + 1);
    if (ok) setStep(prev => prev + 1);
  }

  async function confirmEmptyStep() {
    const action = pendingAction;
    setPendingAction(null);
    if (action === "next") await doNext();
    else if (action === "skip") await doSkipStep();
  }

  async function handleNext() {
    const err = validateStep(step, data);
    if (err) {
      toast({ title: "Campo requerido", description: err, variant: "destructive" });
      return;
    }
    if (isStepEmpty(step, data)) {
      setPendingAction("next");
      return;
    }
    await doNext();
  }

  async function handleBack() {
    const prevStep = step - 1;
    const ok = await saveProgress(prevStep);
    if (ok) setStep(prevStep);
  }

  async function handleComplete() {
    const ok = await saveProgress(5, true);  // markComplete=true — only call that sets onboardingCompleted
    if (!ok) return;

    // Save AI generation settings
    const isManual = (data.aiGenFrequency ?? "daily") === "none";
    const freqMap: Record<string, string> = { daily: "daily", "3x": "3x_week", weekly: "weekly" };
    const genFreq = isManual ? "none" : (freqMap[data.aiGenFrequency ?? "daily"] ?? "daily");
    try {
     await fetch(`/api/settings`, {
  method: "PUT",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  aiEnabled: !isManual,
  frequency: genFreq,
}),
});
    } catch { /* non-blocking */ }

    if (isManual) {
      toast({ title: "¡Marca lista! 🎉", description: "Ve al generador masivo cuando quieras para crear tu contenido." });
    } else {
      toast({ title: "¡IA activada! 🚀", description: "Tu marca está lista. La IA empezará a generar contenido automáticamente." });
    }
    onComplete();
  }

  async function handleSkip() {
    if (step === 4) {
      await handleComplete();
    } else if (isStepEmpty(step, data)) {
      setPendingAction("skip");
    } else {
      await doSkipStep();
    }
  }

  async function jumpToStep(target: number) {
    if (target === step) return;
    const ok = await saveProgress(target);
    if (ok) setStep(target);
  }

  const isLastStep = step === 4;
  const TOTAL_STEPS = 5;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Empty-step confirmation dialog */}
        {pendingAction && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-2xl">
            <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl space-y-4">
              <p className="text-sm font-semibold text-foreground">Paso sin información</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Entre más información nos des sobre tu negocio, mejores serán los resultados que genera la IA. ¿Deseas continuar de todas formas?
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>
                  Volver a llenar
                </Button>
                <Button size="sm" onClick={confirmEmptyStep} disabled={saving}>
                  Continuar sin llenar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-primary">
                {editMode ? "Editar perfil de marca" : "Perfil de tu negocio"}
              </span>
            </div>
            {!registrationMode && (
              <button
                onClick={editMode ? onComplete : (onDismiss ?? onComplete)}
                disabled={saving}
                title="Cerrar"
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {!editMode && (
            <p className="text-xs text-muted-foreground mb-2">
              Entre más información nos des, mejores serán los resultados de la IA.{" "}
              <span className="text-foreground/60">Todos los campos son opcionales.</span>
            </p>
          )}
          <StepIndicator current={step} total={TOTAL_STEPS} onStepClick={editMode ? jumpToStep : undefined} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6">
          {/* Analyzing banner — shown on Marca and Audiencia steps while website analysis is in flight */}
          <AnimatePresence>
            {analyzing && (step === 1 || step === 3) && (
              <motion.div
                key="analyzing-banner"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mb-4 flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/10 px-4 py-2.5 text-sm text-primary"
              >
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Analizando tu sitio web para pre-llenar los campos…</span>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && <Step1 data={data} onChange={patchData} />}
              {step === 1 && <Step2 data={data} onChange={patchData} aiSuggestions={aiSuggestions} onDismissSuggestion={dismissSuggestion} />}
              {step === 2 && <Step3 data={data} onChange={patchData} />}
              {step === 3 && <Step4 data={data} onChange={patchData} aiSuggestions={aiSuggestions} onDismissSuggestion={dismissSuggestion} />}
              {step === 4 && <Step5 data={data} onChange={patchData} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-border/50 space-y-3">
          {registrationMode && onChooseFree && (
            <div className="flex justify-center">
              <button
                onClick={onChooseFree}
                disabled={saving}
                className="text-xs text-muted-foreground/70 hover:text-muted-foreground hover:underline transition-colors"
              >
                ¿Prefieres no pagar ahora? Continuar con plan gratis →
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={handleBack} disabled={saving}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
            )}
            {!editMode && !isLastStep && (
              <button
                onClick={handleSkip}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                Saltar este paso
              </button>
            )}
            {!editMode && isLastStep && (
              <button
                onClick={handleComplete}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                Finalizar sin conectar redes
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{step + 1} / {TOTAL_STEPS}</span>
            {isLastStep ? (
              <Button onClick={handleComplete} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {editMode ? "Guardar cambios" : "Finalizar configuración"}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Siguiente
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
        </div>

      </div>
    </div>
  );
}
