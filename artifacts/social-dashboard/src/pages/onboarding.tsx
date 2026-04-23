import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronLeft, Check, Upload, X, Building2, Palette, Type, Users, Share2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const INDUSTRIES_FALLBACK = [
  "Agricultura & Agro",
  "Arte & Diseño Creativo",
  "Automotriz & Concesionario",
  "Belleza & Estética",
  "Cafetería & Barista",
  "Clínica & Salud General",
  "Club & Membresías",
  "Comercio & Retail",
  "Construcción & Remodelación",
  "Consultoría & Servicios Profesionales",
  "Educación",
  "Electrónica & Electrodomésticos",
  "Energía Solar",
  "Eventos & Entretenimiento",
  "Farmacia & Droguería",
  "Finanzas & Inversiones",
  "Fitness & Deporte",
  "Fotografía & Video",
  "Hogar & Decoración",
  "Hotel & Hospedaje",
  "Industria & Manufactura",
  "Inmobiliaria",
  "Joyería & Accesorios",
  "Legal & Jurídico",
  "Logística & Transporte",
  "Mascotas & Veterinaria",
  "Moda & Ropa",
  "ONG & Organizaciones Sociales",
  "Odontología & Dental",
  "Óptica & Lentes",
  "Panadería & Repostería",
  "Publicidad & Comunicaciones",
  "Restaurante & Comida",
  "SaaS & Marketing con IA",
  "Salud & Bienestar",
  "Salud Mental & Coaching",
  "Seguros & Pólizas",
  "Seguridad & Vigilancia",
  "Servicios del Hogar",
  "Taller & Mecánica",
  "Tecnología & Software",
  "Turismo & Viajes",
  "Otro",
];

const TONES = [
  { value: "formal", label: "Formal", emoji: "👔", desc: "Profesional y corporativo" },
  { value: "cercano", label: "Cercano", emoji: "🤝", desc: "Amigable y personal" },
  { value: "técnico", label: "Técnico", emoji: "⚙️", desc: "Detallado y experto" },
  { value: "inspiracional", label: "Inspiracional", emoji: "🚀", desc: "Motivador y aspiracional" },
  { value: "divertido", label: "Divertido", emoji: "😄", desc: "Humor y entretenimiento" },
];

const GOOGLE_FONTS_50 = [
  { value: "inter",       label: "Inter",              font: "'Inter', sans-serif"                        },
  { value: "poppins",     label: "Poppins",            font: "'Poppins', sans-serif"                      },
  { value: "montserrat",  label: "Montserrat",         font: "'Montserrat', sans-serif"                   },
  { value: "lato",        label: "Lato",               font: "'Lato', sans-serif"                         },
  { value: "raleway",     label: "Raleway",            font: "'Raleway', sans-serif"                      },
  { value: "nunito",      label: "Nunito",             font: "'Nunito', sans-serif"                       },
  { value: "opensans",    label: "Open Sans",          font: "'Open Sans', sans-serif"                    },
  { value: "roboto",      label: "Roboto",             font: "'Roboto', sans-serif"                       },
  { value: "sourcesans",  label: "Source Sans 3",      font: "'Source Sans 3', sans-serif"                },
  { value: "exo2",        label: "Exo 2",              font: "'Exo 2', sans-serif"                        },
  { value: "rajdhani",    label: "Rajdhani",           font: "'Rajdhani', sans-serif"                     },
  { value: "oswald",      label: "Oswald",             font: "'Oswald', sans-serif"                       },
  { value: "barlow",      label: "Barlow Condensed",   font: "'Barlow Condensed', sans-serif"             },
  { value: "bebas",       label: "Bebas Neue",         font: "'Bebas Neue', Impact, sans-serif"           },
  { value: "anton",       label: "Anton",              font: "'Anton', Impact, sans-serif"                },
  { value: "fjalla",      label: "Fjalla One",         font: "'Fjalla One', sans-serif"                   },
  { value: "playfair",    label: "Playfair Display",   font: "'Playfair Display', serif"                  },
  { value: "ptserif",     label: "PT Serif",           font: "'PT Serif', serif"                          },
  { value: "merriweather",label: "Merriweather",       font: "'Merriweather', serif"                      },
  { value: "lora",        label: "Lora",               font: "'Lora', serif"                              },
  { value: "crimson",     label: "Crimson Text",       font: "'Crimson Text', serif"                      },
  { value: "ubuntu",      label: "Ubuntu",             font: "'Ubuntu', sans-serif"                       },
  { value: "firasans",    label: "Fira Sans",          font: "'Fira Sans', sans-serif"                    },
  { value: "cabin",       label: "Cabin",              font: "'Cabin', sans-serif"                        },
  { value: "quicksand",   label: "Quicksand",          font: "'Quicksand', sans-serif"                    },
  { value: "outfit",      label: "Outfit",             font: "'Outfit', sans-serif"                       },
  { value: "dmsans",      label: "DM Sans",            font: "'DM Sans', sans-serif"                      },
  { value: "plusjakarta", label: "Plus Jakarta Sans",  font: "'Plus Jakarta Sans', sans-serif"            },
  { value: "jost",        label: "Jost",               font: "'Jost', sans-serif"                         },
  { value: "manrope",     label: "Manrope",            font: "'Manrope', sans-serif"                      },
  { value: "syne",        label: "Syne",               font: "'Syne', sans-serif"                         },
  { value: "spaceGrotesk", label: "Space Grotesk",     font: "'Space Grotesk', sans-serif"                },
  { value: "ibmplexsans", label: "IBM Plex Sans",      font: "'IBM Plex Sans', sans-serif"                },
  { value: "worksans",    label: "Work Sans",          font: "'Work Sans', sans-serif"                    },
  { value: "mulish",      label: "Mulish",             font: "'Mulish', sans-serif"                       },
  { value: "josefinsans", label: "Josefin Sans",       font: "'Josefin Sans', sans-serif"                 },
  { value: "teko",        label: "Teko",               font: "'Teko', sans-serif"                         },
  { value: "rubik",       label: "Rubik",              font: "'Rubik', sans-serif"                        },
  { value: "karla",       label: "Karla",              font: "'Karla', sans-serif"                        },
  { value: "hind",        label: "Hind",               font: "'Hind', sans-serif"                         },
  { value: "libre",       label: "Libre Franklin",     font: "'Libre Franklin', sans-serif"               },
  { value: "assistant",   label: "Assistant",          font: "'Assistant', sans-serif"                    },
  { value: "bitter",      label: "Bitter",             font: "'Bitter', serif"                            },
  { value: "rokkitt",     label: "Rokkitt",            font: "'Rokkitt', serif"                           },
  { value: "arvo",        label: "Arvo",               font: "'Arvo', serif"                              },
  { value: "domine",      label: "Domine",             font: "'Domine', serif"                            },
  { value: "cormorant",   label: "Cormorant Garamond", font: "'Cormorant Garamond', serif"                },
  { value: "spectral",    label: "Spectral",           font: "'Spectral', serif"                          },
  { value: "alegreya",    label: "Alegreya",           font: "'Alegreya', serif"                          },
  { value: "sourceserif", label: "Source Serif 4",     font: "'Source Serif 4', serif"                    },
];

const FONT_GOOGLE_URL = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@700&family=Merriweather:wght@700&family=Lora:wght@700&family=Crimson+Text:wght@700&family=Ubuntu:wght@700&family=Fira+Sans:wght@700&family=Cabin:wght@700&family=Quicksand:wght@700&family=Outfit:wght@700&family=DM+Sans:wght@700&family=Plus+Jakarta+Sans:wght@700&family=Jost:wght@700&family=Manrope:wght@700&family=Syne:wght@700&family=Space+Grotesk:wght@700&family=IBM+Plex+Sans:wght@700&family=Work+Sans:wght@700&family=Mulish:wght@700&family=Josefin+Sans:wght@700&family=Teko:wght@600&family=Rubik:wght@700&family=Karla:wght@700&family=Hind:wght@700&family=Libre+Franklin:wght@700&family=Assistant:wght@700&family=Bitter:wght@700&family=Rokkitt:wght@700&family=Arvo:wght@700&family=Domine:wght@700&family=Cormorant+Garamond:wght@700&family=Spectral:wght@700&family=Alegreya:wght@700&family=Source+Serif+4:wght@700&display=swap";

const STEP_LABELS = [
  { label: "Empresa",    icon: Building2 },
  { label: "Marca",      icon: Palette   },
  { label: "Tipografía", icon: Type      },
  { label: "Audiencia",  icon: Users     },
  { label: "Redes",      icon: Share2    },
];

interface IndustryCatalogEntry {
  name: string;
  slug: string;
  subcategories: { name: string; slug: string }[];
}

interface Profile {
  displayName?: string;
  brandIndustry?: string;
  brandSubIndustries?: string[];
  brandCountry?: string;
  brandWebsite?: string;
  brandDescription?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  brandFont?: string;
  brandTone?: string;
  brandAudienceDesc?: string;
  onboardingStep?: number;
}

interface RefImage {
  base64: string;
  analysis: string;
  addedAt: string;
}

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [websiteStatus, setWebsiteStatus] = useState<"idle" | "analyzing" | "done" | "failed">("idle");
  const [fontSearch, setFontSearch] = useState("");
  const [profile, setProfile] = useState<Profile>({
    brandPrimaryColor: "#0077FF",
    brandSecondaryColor: "#00C2FF",
    brandFont: "poppins",
    // brandTone intentionally omitted: undefined = not yet chosen by user or IA.
    // Persisting a default here would block the website AI analysis from pre-filling tone
    // on first save (the persisted default would look like an explicit selection).
  });
  const [uploadedLogoUrl, setUploadedLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [refImgUploading, setRefImgUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [industries, setIndustries] = useState<string[]>(INDUSTRIES_FALLBACK);
  const [fullCatalogOnb, setFullCatalogOnb] = useState<IndustryCatalogEntry[]>([]);
  const [customSubInputOnb, setCustomSubInputOnb] = useState("");
  const [customSubStatusOnb, setCustomSubStatusOnb] = useState<"idle" | "validating" | "ok" | "error">("idle");
  const [customSubMsgOnb, setCustomSubMsgOnb] = useState("");
  const [customSubSuggestionOnb, setCustomSubSuggestionOnb] = useState<string | null>(null);
  const [customSubCanForceOnb, setCustomSubCanForceOnb] = useState(false);

  // Cargar catálogo completo de industrias (padre + subcategorías para multi-select de sub-industrias)
  useEffect(() => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
    fetch(`${base}/api/industries`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { industries?: IndustryCatalogEntry[] } | null) => {
        if (!data?.industries?.length) return;
        setFullCatalogOnb(data.industries);
        const names = data.industries.map(e => e.name).filter(n => n && n !== "Otro");
        setIndustries([...new Set(names), "Otro"]);
      })
      .catch(() => {});
  }, []);

  // Load extra Google Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_GOOGLE_URL;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  // Load existing profile + reference images
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/brand/profile");
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { brandReferenceImages: _ignored, ...rest } = data as Record<string, unknown>;
        setProfile(prev => ({ ...prev, ...(rest as Partial<Profile>) }));
        if (data.logoUrl) setUploadedLogoUrl(data.logoUrl as string);
        if ((data.onboardingStep as number) > 0) setStep(Math.min((data.onboardingStep as number) + 1, 5));
      } catch {}
      try {
        const bp = await apiFetch("/brand-profile");
        if (bp?.profile?.referenceImages) {
          try { setRefImages(JSON.parse(bp.profile.referenceImages) as RefImage[]); } catch { /* ignore */ }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const updateProfile = (patch: Partial<Profile>) =>
    setProfile(prev => ({ ...prev, ...patch }));

  async function saveAndNext() {
    setSaving(true);
    let currentProfile = { ...profile };
    try {
      // Analyze website when advancing from step 1 → step 2
      if (step === 1 && currentProfile.brandWebsite) {
        setWebsiteStatus("analyzing");
        try {
          const analysis = await apiFetch("/brand/analyze-website", {
            method: "POST",
            body: JSON.stringify({ url: currentProfile.brandWebsite }),
          }) as { description: string | null; audience: string | null; tone: string | null; primaryColor: string | null };
          // Normalize tone: remove diacritics variants returned by the model so they
          // match exactly the TONES array values used in the UI (e.g. "tecnico" → "técnico").
          const TONE_NORMALIZE: Record<string, string> = {
            tecnico: "técnico", técnico: "técnico",
            formal: "formal", cercano: "cercano",
            inspiracional: "inspiracional", divertido: "divertido",
          };
          const normalizedTone = analysis.tone
            ? (TONE_NORMALIZE[analysis.tone.toLowerCase().trim()] ?? analysis.tone)
            : null;
          const allNull = !analysis.description && !analysis.audience && !normalizedTone && !analysis.primaryColor;
          if (allNull) {
            setWebsiteStatus("failed");
          } else {
            const prefills: Partial<Profile> = {};
            if (!currentProfile.brandDescription && analysis.description)  prefills.brandDescription = analysis.description;
            if (!currentProfile.brandAudienceDesc && analysis.audience)    prefills.brandAudienceDesc = analysis.audience;
            if (!currentProfile.brandTone && normalizedTone)               prefills.brandTone = normalizedTone;
            if (!currentProfile.brandPrimaryColor && analysis.primaryColor) prefills.brandPrimaryColor = analysis.primaryColor;
            if (Object.keys(prefills).length > 0) {
              currentProfile = { ...currentProfile, ...prefills };
              setProfile(currentProfile);
            }
            setWebsiteStatus("done");
          }
        } catch {
          setWebsiteStatus("failed");
        }
      }

      // Save to users table (main brand profile)
      await apiFetch("/brand/profile", {
        method: "PUT",
        body: JSON.stringify({ ...currentProfile, onboardingStep: step }),
      });

      // Mirror step-1 fields to brand_profiles so getBrandContextBlock gets them.
      // Awaited so website/context fields are consistent before post generation can begin.
      if (step === 1) {
        await apiFetch("/brand-profile", {
          method: "PUT",
          body: JSON.stringify({
            website:             currentProfile.brandWebsite,
            industry:            currentProfile.brandIndustry,
            subIndustries:       currentProfile.brandSubIndustries ?? [],
            country:             currentProfile.brandCountry,
            businessDescription: currentProfile.brandDescription,
            audienceDescription: currentProfile.brandAudienceDesc,
            brandTone:           currentProfile.brandTone,
            primaryColor:        currentProfile.brandPrimaryColor,
          }),
        }).catch(() => {}); // non-blocking failure: mirror is best-effort during onboarding
      }

      if (step < 5) {
        setStep(s => s + 1);
      } else {
        await apiFetch("/brand/profile", {
          method: "PUT",
          body: JSON.stringify({ onboardingStep: 5 }),
        });
        await refreshUser();
        navigate("/");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function skipOnboarding() {
    try {
      await apiFetch("/brand/profile", {
        method: "PUT",
        body: JSON.stringify({ onboardingStep: 5 }),
      });
      await refreshUser();
      navigate("/");
    } catch {}
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const data = ev.target?.result as string;
      try {
        const resp = await fetch(`${BASE}/api/brand/logo`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variant: "white", imageData: data }),
        });
        const json = await resp.json() as { logoUrl?: string };
        if (json.logoUrl) setUploadedLogoUrl(json.logoUrl);
        else setUploadedLogoUrl(data);
      } catch {
        setUploadedLogoUrl(data);
      } finally {
        setLogoUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleRefImgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const available = 5 - refImages.length;
    if (available <= 0) return;
    const toUpload = files.slice(0, available);
    setRefImgUploading(true);
    try {
      for (const file of toUpload) {
        const base64 = await new Promise<string>(res => {
          const r = new FileReader();
          r.onload = ev => res(ev.target?.result as string);
          r.readAsDataURL(file);
        });
        const resp = await fetch(`${BASE}/api/brand-profile/reference-images`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUri: base64 }),
        });
        if (resp.ok) {
          const data = await resp.json() as { images: RefImage[] };
          setRefImages(data.images);
        }
      }
    } catch {
      // non-fatal
    } finally {
      setRefImgUploading(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  }

  async function handleRefImgDelete(index: number) {
    try {
      const resp = await fetch(`${BASE}/api/brand-profile/reference-images/${index}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json() as { images: RefImage[] };
        setRefImages(data.images);
      }
    } catch {
      // non-fatal
    }
  }

  const filteredFonts = fontSearch
    ? GOOGLE_FONTS_50.filter(f => f.label.toLowerCase().includes(fontSearch.toLowerCase()))
    : GOOGLE_FONTS_50;

  const selectedFont = GOOGLE_FONTS_50.find(f => f.value === profile.brandFont) ?? GOOGLE_FONTS_50[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center dark">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark text-foreground flex flex-col">
      {/* Header */}
      <div className="border-b border-border/30 bg-card/50 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src={`${BASE}/api/brand/logo?v=white`} alt="HazPost" className="h-7 object-contain" />
          <span className="text-sm font-semibold text-foreground/80">Configuración inicial</span>
        </div>
        <button
          onClick={skipOnboarding}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Saltar por ahora →
        </button>
      </div>

      {/* Progress bar */}
      <div className="shrink-0 px-6 py-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-6">
          {STEP_LABELS.map((s, i) => {
            const n = i + 1;
            const Icon = s.icon;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className={`flex flex-col items-center gap-1 ${active ? "opacity-100" : done ? "opacity-80" : "opacity-30"}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                    done    ? "border-primary bg-primary text-white" :
                    active  ? "border-primary bg-primary/10 text-primary" :
                              "border-border bg-card text-muted-foreground"
                  }`}>
                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className="text-[10px] font-medium hidden sm:block whitespace-nowrap">{s.label}</span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`flex-1 h-0.5 mt-[-14px] transition-colors ${done ? "bg-primary" : "bg-border/30"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="bg-card border border-border/40 rounded-2xl p-6 space-y-5">
          {/* ── PASO 1: Empresa ── */}
          {step === 1 && (
            <>
              <div>
                <h2 className="text-xl font-bold text-foreground">¡Hola, {user?.displayName || "bienvenido"}! 👋</h2>
                <p className="text-sm text-muted-foreground mt-1">Cuéntanos sobre tu empresa para personalizar el contenido IA.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Nombre de la empresa *</Label>
                  <Input
                    placeholder="Mi Empresa S.A.S"
                    value={profile.displayName ?? ""}
                    onChange={e => updateProfile({ displayName: e.target.value })}
                    className="bg-black/30"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Industria *</Label>
                  <select
                    value={profile.brandIndustry ?? ""}
                    onChange={e => { updateProfile({ brandIndustry: e.target.value, brandSubIndustries: [] }); setCustomSubInputOnb(""); setCustomSubStatusOnb("idle"); setCustomSubMsgOnb(""); }}
                    className="w-full h-10 rounded-lg border border-border/50 bg-black/30 px-3 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Seleccionar industria…</option>
                    {industries.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                  {/* Sub-industrias multi-select */}
                  {(() => {
                    const ind = profile.brandIndustry;
                    if (!ind) return null;
                    const entry = fullCatalogOnb.find(e => e.name === ind);
                    const subs = entry?.subcategories ?? [];
                    if (subs.length === 0) return null;
                    const selected = profile.brandSubIndustries ?? [];
                    const toggleSub = (name: string) => {
                      updateProfile({ brandSubIndustries: selected.includes(name) ? selected.filter(s => s !== name) : [...selected, name] });
                    };
                    const handleAddSub = async (forceSkipFuzzy?: boolean) => {
                      const raw = customSubInputOnb.trim();
                      if (!raw) return;
                      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
                      setCustomSubStatusOnb("validating"); setCustomSubMsgOnb("");
                      setCustomSubSuggestionOnb(null); setCustomSubCanForceOnb(false);
                      try {
                        const r = await fetch(`${base}/api/industries/validate-custom-sub`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          credentials: "include", body: JSON.stringify({ industryName: ind, subIndustryName: raw, forceSkipFuzzy: !!forceSkipFuzzy }),
                        });
                        const d = await r.json();
                        if (d.action === "added" || d.action === "already_exists") {
                          const name = d.industry?.name ?? raw;
                          updateProfile({ brandSubIndustries: selected.includes(name) ? selected : [...selected, name] });
                          setCustomSubInputOnb(""); setCustomSubStatusOnb("ok"); setCustomSubMsgOnb(`✓ "${name}" agregada`);
                          if (d.action === "added") {
                            fetch(`${base}/api/industries`)
                              .then(r => r.ok ? r.json() : null)
                              .then((cat: { industries?: IndustryCatalogEntry[] } | null) => {
                                if (cat?.industries?.length) {
                                  setFullCatalogOnb(cat.industries);
                                  const names = cat.industries.map(e => e.name).filter(n => n && n !== "Otro");
                                  setIndustries([...new Set(names), "Otro"]);
                                }
                              })
                              .catch(() => {});
                          }
                        } else if (d.action === "suggest") {
                          setCustomSubStatusOnb("error"); setCustomSubMsgOnb(`¿Quisiste decir "${d.suggestion}"?`);
                          setCustomSubSuggestionOnb(d.suggestion);
                        } else if (d.action === "invalid") {
                          setCustomSubStatusOnb("error"); setCustomSubMsgOnb(d.reason ?? `"${raw}" no es una especialidad reconocida.`);
                          setCustomSubCanForceOnb(true);
                        } else {
                          setCustomSubStatusOnb("error"); setCustomSubMsgOnb(d.reason ?? d.error ?? "No se pudo validar");
                        }
                      } catch { setCustomSubStatusOnb("error"); setCustomSubMsgOnb("Error de conexión"); }
                    };
                    return (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">
                            Especialidades del negocio
                            {selected.length > 0 && <span className="ml-1.5 text-primary font-medium">({selected.length} seleccionada{selected.length !== 1 ? "s" : ""})</span>}
                          </Label>
                          <button
                            type="button"
                            onClick={() => {
                              const staticNames = subs.map((s: { name: string; slug: string }) => s.name);
                              const customSelected = selected.filter((n: string) => !subs.find((s: { name: string; slug: string }) => s.name === n));
                              const allSel = staticNames.length > 0 && staticNames.every((n: string) => selected.includes(n));
                              updateProfile({ brandSubIndustries: allSel ? [] : [...staticNames, ...customSelected] });
                            }}
                            className="text-[11px] text-primary hover:underline"
                          >
                            {subs.length > 0 && subs.every((s: { name: string; slug: string }) => selected.includes(s.name)) ? "Quitar todas" : "Todas"}
                          </button>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-black/20 p-2 space-y-1 max-h-40 overflow-y-auto">
                          {subs.map(s => (
                            <label key={s.slug} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded px-1 py-0.5">
                              <input type="checkbox" checked={selected.includes(s.name)} onChange={() => toggleSub(s.name)} className="accent-primary w-3.5 h-3.5" />
                              <span className="text-sm text-foreground">{s.name}</span>
                            </label>
                          ))}
                          <label className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded px-1 py-0.5">
                            <input type="checkbox" checked={!!customSubInputOnb.trim()} onChange={e => setCustomSubInputOnb(e.target.checked ? " " : "")} className="accent-primary w-3.5 h-3.5" />
                            <span className="text-sm text-muted-foreground italic">Otro…</span>
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={customSubInputOnb}
                            onChange={e => { setCustomSubInputOnb(e.target.value); setCustomSubStatusOnb("idle"); setCustomSubMsgOnb(""); setCustomSubSuggestionOnb(null); setCustomSubCanForceOnb(false); }}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddSub(); } }}
                            placeholder="Especialidad personalizada…"
                            className="h-8 flex-1 rounded-md border border-border/50 bg-black/30 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                          <button type="button" onClick={() => handleAddSub()} disabled={!customSubInputOnb.trim() || customSubStatusOnb === "validating"} className="h-8 px-3 text-xs rounded-md border border-border/50 bg-black/30 hover:bg-white/5 disabled:opacity-50 text-foreground">
                            {customSubStatusOnb === "validating" ? "Validando…" : "Agregar"}
                          </button>
                        </div>
                        {customSubStatusOnb === "ok" && <p className="text-[11px] text-green-400">{customSubMsgOnb}</p>}
                        {customSubStatusOnb === "error" && customSubSuggestionOnb && (
                          <div className="space-y-1">
                            <p className="text-[11px] text-yellow-400">{customSubMsgOnb}</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="h-7 px-2.5 text-[11px] rounded-md border border-green-500/50 text-green-400 hover:bg-green-500/10"
                                onClick={() => {
                                  const sugg = customSubSuggestionOnb;
                                  updateProfile({ brandSubIndustries: selected.includes(sugg) ? selected : [...selected, sugg] });
                                  setCustomSubInputOnb("");
                                  setCustomSubStatusOnb("ok");
                                  setCustomSubMsgOnb(`✓ "${sugg}" agregada`);
                                  setCustomSubSuggestionOnb(null);
                                }}
                              >Sí, esa es</button>
                              <button
                                type="button"
                                className="h-7 px-2.5 text-[11px] rounded-md border border-border/50 bg-black/20 hover:bg-white/5 text-foreground"
                                onClick={() => { setCustomSubSuggestionOnb(null); handleAddSub(true); }}
                              >No, es diferente</button>
                            </div>
                          </div>
                        )}
                        {customSubStatusOnb === "error" && !customSubSuggestionOnb && customSubCanForceOnb && (
                          <div className="space-y-1">
                            <p className="text-[11px] text-yellow-400">{customSubMsgOnb}</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="h-7 px-2.5 text-[11px] rounded-md border border-primary/50 text-primary hover:bg-primary/10"
                                onClick={() => {
                                  const raw = customSubInputOnb.trim();
                                  if (!raw) return;
                                  updateProfile({ brandSubIndustries: selected.includes(raw) ? selected : [...selected, raw] });
                                  setCustomSubInputOnb("");
                                  setCustomSubStatusOnb("ok");
                                  setCustomSubMsgOnb(`✓ "${raw}" agregada a tu perfil`);
                                  setCustomSubCanForceOnb(false);
                                }}
                              >Sí, agregar solo a mi perfil</button>
                              <button
                                type="button"
                                className="h-7 px-2.5 text-[11px] rounded-md border border-border/50 bg-black/20 hover:bg-white/5 text-foreground"
                                onClick={() => { setCustomSubInputOnb(""); setCustomSubStatusOnb("idle"); setCustomSubMsgOnb(""); setCustomSubCanForceOnb(false); }}
                              >No</button>
                            </div>
                          </div>
                        )}
                        {customSubStatusOnb === "error" && !customSubSuggestionOnb && !customSubCanForceOnb && (
                          <p className="text-[11px] text-yellow-400">{customSubMsgOnb}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">País</Label>
                    <Input
                      placeholder="Colombia"
                      value={profile.brandCountry ?? ""}
                      onChange={e => updateProfile({ brandCountry: e.target.value })}
                      className="bg-black/30"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Sitio web</Label>
                    <Input
                      placeholder="https://misitioweb.com"
                      value={profile.brandWebsite ?? ""}
                      onChange={e => updateProfile({ brandWebsite: e.target.value })}
                      className="bg-black/30"
                    />
                    {websiteStatus === "analyzing" && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-400">
                        <div className="w-3 h-3 rounded-full border border-blue-400 border-t-transparent animate-spin shrink-0" />
                        <span>Analizando tu sitio web con IA…</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Descripción del negocio</Label>
                  <Textarea
                    placeholder="Instalamos paneles solares para hogares y empresas en el Valle del Cauca…"
                    value={profile.brandDescription ?? ""}
                    onChange={e => updateProfile({ brandDescription: e.target.value })}
                    className="bg-black/30 min-h-[80px] resize-none"
                    rows={3}
                  />
                </div>
              </div>
            </>
          )}

          {/* ── PASO 2: Marca ── */}
          {step === 2 && (
            <>
              {websiteStatus === "done" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                  <span>✓</span>
                  <span>Sitio web analizado — la IA pre-llenó los campos vacíos con información de tu sitio.</span>
                </div>
              )}
              {websiteStatus === "failed" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  <span>⚠</span>
                  <span>No se pudo analizar el sitio web. Puedes completar los campos manualmente.</span>
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold">Identidad visual 🎨</h2>
                <p className="text-sm text-muted-foreground mt-1">Define los colores y logo de tu marca.</p>
              </div>
              <div className="space-y-5">
                {/* Logo upload */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Logo <span className="text-muted-foreground/50">(PNG/SVG/WebP, fondo transparente — opcional)</span>
                  </Label>
                  <input ref={fileInputRef} type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} />
                  {uploadedLogoUrl ? (
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-16 rounded-xl border border-border/40 bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={uploadedLogoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-emerald-400 font-medium">✓ Logo cargado</span>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs text-primary hover:text-primary/80 transition-colors text-left"
                        >
                          Cambiar logo →
                        </button>
                        <button
                          onClick={() => setUploadedLogoUrl(null)}
                          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors text-left"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={logoUploading}
                      className="w-full h-24 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 bg-black/20 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 transition-all text-muted-foreground hover:text-primary disabled:opacity-50"
                    >
                      {logoUploading
                        ? <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        : <Upload className="w-6 h-6" />}
                      <span className="text-xs">{logoUploading ? "Subiendo…" : "Subir logo (máx. 2MB)"}</span>
                    </button>
                  )}
                </div>

                {/* Reference images */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Imágenes de referencia <span className="text-muted-foreground/50">(opcional — hasta 5 posts que te gusten)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground/60 mb-2">La IA analizará estas imágenes para replicar el estilo visual en tus posts.</p>
                  <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleRefImgUpload} />
                  <div className="flex gap-2 flex-wrap items-center">
                    {refImages.map((img, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border/40">
                        <img src={img.base64} className="w-full h-full object-cover" alt="" />
                        {img.analysis && (
                          <div className="absolute bottom-0 left-0 right-0 bg-emerald-500/80 flex items-center justify-center py-0.5">
                            <span className="text-[9px] text-white font-medium">✓ analizada</span>
                          </div>
                        )}
                        <button
                          onClick={() => handleRefImgDelete(i)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 rounded-full flex items-center justify-center"
                        >
                          <X className="w-2.5 h-2.5 text-white" />
                        </button>
                      </div>
                    ))}
                    {refImgUploading && (
                      <div className="w-16 h-16 rounded-lg border border-border/40 bg-black/20 flex flex-col items-center justify-center gap-1">
                        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <span className="text-[9px] text-muted-foreground">analizando…</span>
                      </div>
                    )}
                    {refImages.length < 5 && !refImgUploading && (
                      <button
                        onClick={() => imgInputRef.current?.click()}
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 bg-black/20 flex items-center justify-center text-muted-foreground hover:text-primary transition-all"
                      >
                        <Upload className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Color pickers */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Color primario</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={profile.brandPrimaryColor ?? "#0077FF"}
                        onChange={e => updateProfile({ brandPrimaryColor: e.target.value })}
                        className="w-10 h-10 rounded-lg border border-border/50 cursor-pointer bg-transparent p-0.5"
                      />
                      <Input
                        value={profile.brandPrimaryColor ?? "#0077FF"}
                        onChange={e => updateProfile({ brandPrimaryColor: e.target.value })}
                        className="bg-black/30 font-mono text-sm"
                        maxLength={7}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Color secundario</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={profile.brandSecondaryColor ?? "#00C2FF"}
                        onChange={e => updateProfile({ brandSecondaryColor: e.target.value })}
                        className="w-10 h-10 rounded-lg border border-border/50 cursor-pointer bg-transparent p-0.5"
                      />
                      <Input
                        value={profile.brandSecondaryColor ?? "#00C2FF"}
                        onChange={e => updateProfile({ brandSecondaryColor: e.target.value })}
                        className="bg-black/30 font-mono text-sm"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>

                {/* Color preview */}
                <div
                  className="h-16 rounded-xl flex items-center justify-center gap-3 text-white text-sm font-bold"
                  style={{ background: `linear-gradient(135deg, ${profile.brandPrimaryColor ?? "#0077FF"}, ${profile.brandSecondaryColor ?? "#00C2FF"})` }}
                >
                  <div className="w-8 h-8 bg-white/20 rounded-full" />
                  {profile.displayName || "Mi Empresa"}
                </div>
              </div>
            </>
          )}

          {/* ── PASO 3: Tipografía ── */}
          {step === 3 && (
            <>
              <div>
                <h2 className="text-xl font-bold">Tipografía de marca 🔤</h2>
                <p className="text-sm text-muted-foreground mt-1">Elige la fuente principal para los textos de tus posts.</p>
              </div>
              <div className="space-y-3">
                <Input
                  placeholder="Buscar fuente…"
                  value={fontSearch}
                  onChange={e => setFontSearch(e.target.value)}
                  className="bg-black/30"
                />

                <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border">
                  {filteredFonts.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => updateProfile({ brandFont: f.value })}
                      className={`flex items-center justify-between py-2.5 px-3 rounded-lg border text-left transition-all ${
                        profile.brandFont === f.value
                          ? "border-primary bg-primary/10"
                          : "border-border/30 hover:border-border hover:bg-white/5"
                      }`}
                    >
                      <span style={{ fontFamily: f.font }} className="text-base font-bold text-foreground">
                        {f.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">{f.font.includes("serif") && !f.font.includes("sans") ? "Serif" : "Sans"}</span>
                    </button>
                  ))}
                </div>

                {/* Live preview */}
                <div
                  className="h-14 flex items-center justify-center rounded-xl bg-gradient-to-r from-primary/20 to-cyan-500/20 border border-primary/20 text-lg font-bold tracking-wide"
                  style={{ fontFamily: selectedFont.font }}
                >
                  {profile.displayName || "Mi Empresa"}
                </div>
              </div>
            </>
          )}

          {/* ── PASO 4: Audiencia y tono ── */}
          {step === 4 && (
            <>
              <div>
                <h2 className="text-xl font-bold">Audiencia y tono 🎯</h2>
                <p className="text-sm text-muted-foreground mt-1">La IA usará esto para personalizar el estilo del contenido.</p>
              </div>
              <div className="space-y-5">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Público objetivo</Label>
                  <Textarea
                    placeholder="Propietarios de casas y empresas en Cali de 25-55 años, interesados en ahorro energético y sostenibilidad…"
                    value={profile.brandAudienceDesc ?? ""}
                    onChange={e => updateProfile({ brandAudienceDesc: e.target.value })}
                    className="bg-black/30 min-h-[80px] resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Tono de comunicación</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {TONES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => updateProfile({ brandTone: t.value })}
                        className={`flex items-center gap-3 py-3 px-4 rounded-xl border text-left transition-all ${
                          profile.brandTone === t.value
                            ? "border-primary bg-primary/10"
                            : "border-border/30 hover:border-border hover:bg-white/5"
                        }`}
                      >
                        <span className="text-xl shrink-0">{t.emoji}</span>
                        <div>
                          <div className="text-sm font-semibold text-foreground">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.desc}</div>
                        </div>
                        {profile.brandTone === t.value && (
                          <div className="ml-auto w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </>
          )}

          {/* ── PASO 5: Conectar redes ── */}
          {step === 5 && (
            <>
              <div>
                <h2 className="text-xl font-bold">Conectar redes sociales 📱</h2>
                <p className="text-sm text-muted-foreground mt-1">Conecta tus cuentas para publicar automáticamente. Puedes hacerlo ahora o después en Ajustes.</p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    name: "Instagram Business",
                    icon: "📸",
                    color: "from-pink-600/20 to-purple-600/20",
                    border: "border-pink-500/30",
                    steps: [
                      "Ve a Meta Business Suite → Configuración → Cuentas de Instagram",
                      "Conecta tu cuenta de Instagram Business",
                      "En hazpost → Ajustes → Instagram → pega el Access Token",
                    ],
                    link: "https://business.facebook.com/settings/instagram-accounts",
                    linkLabel: "Abrir Meta Business Suite →",
                  },
                  {
                    name: "TikTok for Business",
                    icon: "🎵",
                    color: "from-neutral-800/40 to-neutral-900/40",
                    border: "border-neutral-500/30",
                    steps: [
                      "Ve a developers.tiktok.com → Mis aplicaciones",
                      "Crea o abre tu app y copia el Client Key y Client Secret",
                      "En hazpost → Ajustes → TikTok → autoriza la cuenta",
                    ],
                    link: "https://developers.tiktok.com/apps",
                    linkLabel: "Abrir TikTok Developers →",
                  },
                  {
                    name: "Facebook Page",
                    icon: "📘",
                    color: "from-blue-600/20 to-blue-800/20",
                    border: "border-blue-500/30",
                    steps: [
                      "Facebook se conecta automáticamente si conectas Instagram Business",
                      "El cross-posting a páginas de Facebook requiere revisión de app de Meta",
                      "ECO maneja los errores automáticamente — no se perderá ningún post",
                    ],
                    link: "https://business.facebook.com",
                    linkLabel: "Abrir Facebook Business →",
                  },
                ].map(net => (
                  <div key={net.name} className={`rounded-xl border ${net.border} bg-gradient-to-br ${net.color} p-4`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{net.icon}</span>
                      <span className="font-semibold text-sm">{net.name}</span>
                    </div>
                    <ol className="space-y-1.5 mb-3">
                      {net.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="w-4 h-4 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">{i+1}</span>
                          {s}
                        </li>
                      ))}
                    </ol>
                    <a
                      href={net.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                    >
                      {net.linkLabel}
                    </a>
                  </div>
                ))}

                <p className="text-xs text-center text-muted-foreground/60 pt-1">
                  Puedes conectar o reconfigurar las redes en cualquier momento desde <strong>Ajustes → Cuentas sociales</strong>.
                </p>
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="pt-2 border-t border-border/30 space-y-2">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(s => Math.max(1, s - 1))}
                disabled={step === 1}
                className="gap-1.5 text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </Button>

              <span className="text-xs text-muted-foreground">Paso {step} de 5</span>

              <Button
                onClick={saveAndNext}
                disabled={saving}
                className="gap-1.5 text-sm bg-primary hover:bg-primary/90"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : step === 5 ? (
                  <>¡Listo! <Check className="w-4 h-4" /></>
                ) : (
                  <>Continuar <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
            {step < 5 && step > 1 && (
              <div className="flex justify-center">
                <button
                  onClick={() => setStep(s => s + 1)}
                  className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Saltar este paso →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
