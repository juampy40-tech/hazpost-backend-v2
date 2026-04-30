import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";
import { Loader2, Save, User, Building2, Upload, Eye, EyeOff, Camera, Globe, Sparkles, CheckCircle2, XCircle } from "lucide-react";

function checkPasswordStrength(p: string) {
  return {
    minLength:  p.length >= 8,
    hasUpper:   /[A-Z]/.test(p),
    hasNumber:  /[0-9]/.test(p),
    hasSpecial: /[^a-zA-Z0-9]/.test(p),
  };
}

function PasswordStrengthHints({ password }: { password: string }) {
  if (!password) return null;
  const s = checkPasswordStrength(password);
  const rules = [
    { ok: s.minLength,  label: "Mín. 8 caracteres" },
    { ok: s.hasUpper,   label: "1 mayúscula" },
    { ok: s.hasNumber,  label: "1 número" },
    { ok: s.hasSpecial, label: "1 carácter especial (!@#…)" },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 mt-1.5">
      {rules.map(({ ok, label }) => (
        <div key={label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-400" : "text-muted-foreground/70"}`}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? "bg-green-400" : "bg-muted-foreground/30"}`} />
          {label}
        </div>
      ))}
    </div>
  );
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

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

interface BusinessData {
  id: number;
  name: string;
  industry: string | null;
  subIndustry: string | null;
  subIndustries: string | null;
  slogan: string | null;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  defaultLocation: string | null;
  isDefault: boolean;
  website: string | null;
  audienceDescription: string | null;
  brandTone: string | null;
}

interface IndustryCatalogEntry {
  name: string;
  slug: string;
  subcategories: { name: string; slug: string }[];
}

interface WebsiteAnalysisResult {
  description: string | null;
  audience: string | null;
  tone: string | null;
  primaryColor: string | null;
}

const TONE_OPTIONS = [
  { value: "formal",        label: "Formal",        desc: "Profesional y corporativo" },
  { value: "cercano",       label: "Cercano",        desc: "Amigable y conversacional" },
  { value: "tecnico",       label: "Técnico",        desc: "Especializado y detallado" },
  { value: "inspiracional", label: "Inspiracional",  desc: "Motivador y aspiracional" },
  { value: "divertido",     label: "Divertido",      desc: "Desenfadado y con humor" },
];

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { id: globalBizId } = useActiveBusiness();
  const { toast } = useToast();

  // ── Personal account state ─────────────────────────────
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);

  const newPwStrength = checkPasswordStrength(newPassword);
  const isNewPasswordStrong = !newPassword || (newPwStrength.minLength && newPwStrength.hasUpper && newPwStrength.hasNumber && newPwStrength.hasSpecial);
  const newPwConfirmMismatch = confirmPassword !== "" && newPassword !== confirmPassword;

  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarPreview, setAvatarPreview] = useState<string>(user?.avatarUrl ?? "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ── Business brand state ───────────────────────────────
  const [bizId, setBizId] = useState<number | null>(null);
  const [bizName, setBizName] = useState("");
  const [bizIndustry, setBizIndustry] = useState("");
  const [bizIndustryCustom, setBizIndustryCustom] = useState("");
  const [bizSubIndustries, setBizSubIndustries] = useState<string[]>([]);
  const [fullCatalog, setFullCatalog] = useState<IndustryCatalogEntry[]>([]);
  const [customSubInput, setCustomSubInput] = useState("");
  const [customSubStatus, setCustomSubStatus] = useState<"idle" | "validating" | "ok" | "error">("idle");
  const [customSubMsg, setCustomSubMsg] = useState("");
  const [customSubSuggestion, setCustomSubSuggestion] = useState<string | null>(null);
  const [customSubCanForce, setCustomSubCanForce] = useState(false);
  const [bizSlogan, setBizSlogan] = useState("");
  const [bizDescription, setBizDescription] = useState("");
  const [bizCity, setBizCity] = useState("");
  const [bizPrimary, setBizPrimary] = useState("#00C2FF");
  const [bizSecondary, setBizSecondary] = useState("#0077FF");
  const [bizWebsite, setBizWebsite] = useState("");
  const [bizAudience, setBizAudience] = useState("");
  const [bizTone, setBizTone] = useState("");
  const [bizLogoUrl, setBizLogoUrl] = useState("");
  const [bizLogoPreview, setBizLogoPreview] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBiz, setSavingBiz] = useState(false);
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [industries, setIndustries] = useState<string[]>(INDUSTRIES_FALLBACK);
  const [rawSavedIndustry, setRawSavedIndustry] = useState<string>("");
  const [customIndustryStatus, setCustomIndustryStatus] = useState<"idle" | "validating" | "ok" | "error">("idle");
  const [customIndustryMsg, setCustomIndustryMsg] = useState("");
  const [analyzingWebsite, setAnalyzingWebsite] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<WebsiteAnalysisResult | null>(null);
  const originalBizWebsiteRef = useRef<string>("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Cargar catálogo completo de industrias (padre + sub-industrias para el multi-select)
  useEffect(() => {
    fetch(`${BASE}/api/industries`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { industries?: IndustryCatalogEntry[] } | null) => {
        if (!data?.industries?.length) return;
        setFullCatalog(data.industries);
        const names = data.industries.map(e => e.name).filter(n => n && n !== "Otro");
        setIndustries([...new Set(names), "Otro"]);
      })
      .catch(() => {});
  }, []);

  // Derivar bizIndustry / bizIndustryCustom reactivamente cuando industries o rawSavedIndustry cambia.
  // Esto es necesario porque ambos se cargan async y el orden no está garantizado.
  useEffect(() => {
    if (!rawSavedIndustry) return;
    if (industries.includes(rawSavedIndustry)) {
      setBizIndustry(rawSavedIndustry);
      setBizIndustryCustom("");
    } else {
      setBizIndustry("Otro");
      setBizIndustryCustom(rawSavedIndustry);
    }
  }, [rawSavedIndustry, industries]);

  // Sync personal fields when user loads
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? "");
      setEmail(user.email ?? "");
      const resolvedAvatar = user.avatarUrl
        ? (user.avatarUrl.startsWith("/objects/")
          ? `${BASE}/api/storage/objects/${user.avatarUrl.slice("/objects/".length)}`
          : user.avatarUrl)
        : "";
      setAvatarUrl(user.avatarUrl ?? null);
      setAvatarPreview(resolvedAvatar);
    }
  }, [user]);

  // Load active business — uses globalBizId from context to identify the right one.
  // FIX CTO: si /api/businesses viene vacío, NO dejamos el perfil cargando infinito.
  // Cargamos /api/brand-profile como respaldo y mostramos el formulario listo para crear negocio.
  useEffect(() => {
    let cancelled = false;

    const applyBusinessToForm = (active: Partial<BusinessData>) => {
      setBizId(typeof active.id === "number" ? active.id : null);
      setBizName(active.name ?? "");
      setRawSavedIndustry(active.industry ?? "");

      const loadedSubInds = (() => {
        try {
          if (Array.isArray(active.subIndustries)) return active.subIndustries as unknown as string[];
          return JSON.parse(active.subIndustries ?? "[]") as string[];
        } catch {
          return [];
        }
      })();

      setBizSubIndustries(loadedSubInds.length > 0 ? loadedSubInds : (active.subIndustry ? [active.subIndustry] : []));
      setBizSlogan(active.slogan ?? "");
      setBizDescription(active.description ?? "");
      setBizCity(active.defaultLocation ?? "");
      setBizPrimary(active.primaryColor ?? "#00C2FF");
      setBizSecondary(active.secondaryColor ?? "#0077FF");

      const loadedWebsite = active.website ?? "";
      setBizWebsite(loadedWebsite);
      originalBizWebsiteRef.current = loadedWebsite;

      setBizAudience(active.audienceDescription ?? "");
      setBizTone(active.brandTone ?? "");

      if (active.logoUrl) {
        const resolved = active.logoUrl.startsWith("/objects/")
          ? `${BASE}/api/storage/objects/${active.logoUrl.slice("/objects/".length)}`
          : active.logoUrl;
        setBizLogoUrl(active.logoUrl);
        setBizLogoPreview(resolved);
      } else {
        setBizLogoUrl("");
        setBizLogoPreview("");
      }
    };

    const applyProfileToForm = (profile: Record<string, unknown>) => {
      setBizId(null);
      setBizName(String(profile.companyName || profile.businessName || profile.name || ""));
      setRawSavedIndustry(String(profile.industry || ""));

      const rawSubs = profile.subIndustries;
      if (Array.isArray(rawSubs)) {
        setBizSubIndustries(rawSubs.map(String));
      } else if (typeof rawSubs === "string") {
        try {
          const parsed = JSON.parse(rawSubs);
          setBizSubIndustries(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch {
          setBizSubIndustries(rawSubs ? [rawSubs] : []);
        }
      } else if (profile.subIndustry) {
        setBizSubIndustries([String(profile.subIndustry)]);
      } else {
        setBizSubIndustries([]);
      }

      setBizSlogan(String(profile.slogan || ""));
      setBizDescription(String(profile.businessDescription || profile.description || ""));
      setBizCity(String(profile.city || profile.defaultLocation || ""));
      setBizPrimary(String(profile.primaryColor || "#00C2FF"));
      setBizSecondary(String(profile.secondaryColor || "#0077FF"));
      setBizWebsite(String(profile.website || ""));
      originalBizWebsiteRef.current = String(profile.website || "");
      setBizAudience(String(profile.audienceDescription || profile.audience || ""));
      setBizTone(String(profile.brandTone || profile.tone || ""));
      setBizLogoUrl(String(profile.logoUrl || ""));
      setBizLogoPreview(String(profile.logoUrl || ""));
    };

    async function loadProfile() {
  setLoadingBiz(true);

  try {
    const profileRes = await fetch(`${BASE}/api/brand-profile`, {
      credentials: "include",
    });

    const profileData = profileRes.ok ? await profileRes.json() : {};

    const profile =
      profileData?.brandProfile && typeof profileData.brandProfile === "object"
        ? profileData.brandProfile
        : profileData && typeof profileData === "object"
        ? profileData
        : {};

    if (cancelled) return;

    const hasProfileData =
      profile &&
      typeof profile === "object" &&
      Object.keys(profile).length > 0;

    if (hasProfileData) {
      console.log("BRAND PROFILE CARGADO EN PROFILE.TSX:", profile);
      applyProfileToForm(profile);
     return;
    }

    const businessesRes = await fetch(`${BASE}/api/businesses`, {
      credentials: "include",
    });

    const businessesData = businessesRes.ok ? await businessesRes.json() : {};
    const list: BusinessData[] = Array.isArray(businessesData.businesses)
      ? businessesData.businesses
      : [];

    const active =
      (globalBizId ? list.find((b) => b.id === globalBizId) : null) ??
      list.find((b) => b.isDefault) ??
      list[0];

    if (cancelled) return;

    if (active) {
      applyBusinessToForm(active);
    }
  } catch (err) {
    console.error("Error cargando perfil de marca:", err);
  } finally {
    if (!cancelled) {
      setLoadingBiz(false);
    }
  }
}

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [globalBizId]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("No se pudo obtener URL de subida");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Error al subir el avatar");

      // Show preview immediately
      const reader = new FileReader();
      reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
      reader.readAsDataURL(file);

      setAvatarUrl(objectPath);

      // Save to backend immediately so the user doesn't have to click "Guardar"
      const res = await fetch(`${BASE}/api/users/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: objectPath }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al guardar el avatar");
      }
      await refreshUser();
      toast({ title: "Foto de perfil actualizada" });
    } catch (err) {
      toast({ title: "Error al subir foto", description: String(err), variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword && !isNewPasswordStrong) {
      toast({ title: "Contraseña débil", description: "Asegúrate de cumplir todos los requisitos de contraseña.", variant: "destructive" });
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      toast({ title: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    setSavingPersonal(true);
    try {
      const body: Record<string, string> = {};
      if (displayName !== user?.displayName) body.displayName = displayName;
      if (email !== user?.email) body.email = email;
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      if (Object.keys(body).length === 0) {
        toast({ title: "Sin cambios que guardar" });
        return;
      }
      const res = await fetch(`${BASE}/api/users/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Datos personales actualizados" });
    } catch (err) {
      toast({ title: "Error al guardar", description: String(err), variant: "destructive" });
    } finally {
      setSavingPersonal(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      // 1. Request presigned upload URL
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("No se pudo obtener URL de subida");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      // 2. Upload directly to GCS
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Error al subir el logo");

      // 3. Show preview
      const reader = new FileReader();
      reader.onload = (ev) => setBizLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);

      setBizLogoUrl(objectPath);
      toast({ title: "Logo subido", description: "Guarda los cambios para aplicarlo." });
    } catch (err) {
      toast({ title: "Error al subir logo", description: String(err), variant: "destructive" });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleAnalyzeWebsite() {
    const url = bizWebsite.trim();
    if (!url) {
      toast({ title: "Ingresa una URL primero", variant: "destructive" });
      return;
    }
    setAnalyzingWebsite(true);
    setPendingAnalysis(null);
    try {
      const res = await fetch(`${BASE}/api/analyze-website`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as WebsiteAnalysisResult;
      if (!res.ok) throw new Error("Error al analizar el sitio");

      const hasNoResults = !data.description && !data.audience && !data.tone && !data.primaryColor;
      if (hasNoResults) {
        toast({ title: "No se pudo analizar el sitio", description: "Verifica que la URL sea correcta y pública.", variant: "destructive" });
        return;
      }

      const fieldsWithContent = [
        data.description && bizDescription,
        data.audience && bizAudience,
        data.tone && bizTone,
      ].some(Boolean);

      if (fieldsWithContent) {
        setPendingAnalysis(data);
      } else {
        if (data.description) setBizDescription(data.description);
        if (data.audience) setBizAudience(data.audience);
        if (data.tone) setBizTone(data.tone);
        if (data.primaryColor) setBizPrimary(data.primaryColor);
        toast({ title: "Análisis completado", description: "Los campos se han actualizado con la información del sitio." });
      }
    } catch (err) {
      toast({ title: "Error al analizar", description: String(err), variant: "destructive" });
    } finally {
      setAnalyzingWebsite(false);
    }
  }

  function applyPendingAnalysis(fields: { description: boolean; audience: boolean; tone: boolean; color: boolean }) {
    if (!pendingAnalysis) return;
    if (fields.description && pendingAnalysis.description) setBizDescription(pendingAnalysis.description);
    if (fields.audience && pendingAnalysis.audience) setBizAudience(pendingAnalysis.audience);
    if (fields.tone && pendingAnalysis.tone) setBizTone(pendingAnalysis.tone);
    if (fields.color && pendingAnalysis.primaryColor) setBizPrimary(pendingAnalysis.primaryColor);
    const remaining: WebsiteAnalysisResult = {
      description: fields.description ? null : pendingAnalysis.description,
      audience: fields.audience ? null : pendingAnalysis.audience,
      tone: fields.tone ? null : pendingAnalysis.tone,
      primaryColor: fields.color ? null : pendingAnalysis.primaryColor,
    };
    const allApplied = !remaining.description && !remaining.audience && !remaining.tone && !remaining.primaryColor;
    setPendingAnalysis(allApplied ? null : remaining);
    toast({ title: "Sugerencia aplicada", description: "Guarda los cambios para confirmar." });
  }

  async function handleSaveBrand(e: React.FormEvent) {
    e.preventDefault();
    setSavingBiz(true);
    const resolvedIndustry = bizIndustry === "Otro" ? (bizIndustryCustom.trim() || "Otro") : (bizIndustry || null);
    const isNewWebsite = !originalBizWebsiteRef.current && !!bizWebsite.trim();
    try {
      const bizBody: Record<string, unknown> = {
        name: bizName,
        companyName: bizName,
        industry: resolvedIndustry,
        subIndustry: bizSubIndustries[0] || null,
        subIndustries: bizSubIndustries,
        slogan: bizSlogan.trim() || null,
        description: bizDescription || null,
        businessDescription: bizDescription || null,
        defaultLocation: bizCity || null,
        city: bizCity || null,
        primaryColor: bizPrimary,
        secondaryColor: bizSecondary,
        website: bizWebsite.trim() || null,
        audienceDescription: bizAudience || null,
        audience: bizAudience || null,
        brandTone: bizTone || null,
        tone: bizTone || null,
        isDefault: true,
      };
      if (bizLogoUrl) bizBody.logoUrl = bizLogoUrl;

      const profileRes = await fetch(`${BASE}/api/brand-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: bizName || null,
          industry: resolvedIndustry,
          subIndustry: bizSubIndustries[0] || null,
          subIndustries: bizSubIndustries,
          slogan: bizSlogan.trim() || null,
          city: bizCity || null,
          website: bizWebsite.trim() || null,
          businessDescription: bizDescription || null,
          description: bizDescription || null,
          audienceDescription: bizAudience || null,
          audience: bizAudience || null,
          brandTone: bizTone || null,
          tone: bizTone || null,
          primaryColor: bizPrimary,
          secondaryColor: bizSecondary,
          logoUrl: bizLogoUrl || null,
        }),
      });
      if (!profileRes.ok) {
        const profileData = await profileRes.json();
        throw new Error(profileData.error ?? "Error al guardar perfil de marca");
      }

      const endpoint = bizId ? `${BASE}/api/businesses/${bizId}` : `${BASE}/api/businesses`;
      const method = bizId ? "PUT" : "POST";

      const bizRes = await fetch(endpoint, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bizBody),
      });
      const bizData = await bizRes.json();
      if (!bizRes.ok) throw new Error(bizData.error ?? "Error al guardar negocio");

      if (!bizId && bizData.business?.id) {
        setBizId(bizData.business.id);
      }

      originalBizWebsiteRef.current = bizWebsite.trim();
      toast({ title: bizId ? "Perfil de marca actualizado" : "Perfil de marca creado" });

      if (isNewWebsite) {
        handleAnalyzeWebsite();
      }
    } catch (err) {
      toast({ title: "Error al guardar", description: String(err), variant: "destructive" });
    } finally {
      setSavingBiz(false);
    }
  }

  const initials = (user?.displayName || user?.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestiona tus datos personales y el perfil de tu negocio activo.</p>
      </div>

      {/* ── Cuenta personal ─────────────────────────────── */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-primary" />
            Cuenta personal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePersonal} className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative group shrink-0">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border/50 bg-primary/20 flex items-center justify-center">
                  {avatarPreview
                    ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                    : <span className="text-xl font-bold text-primary">{initials}</span>
                  }
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploadingAvatar
                    ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                    : <Camera className="w-5 h-5 text-white" />
                  }
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{user?.displayName || user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.plan ?? "free"}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Pasa el cursor sobre la foto para cambiarla</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-xs text-muted-foreground">Nombre</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                  className="h-9 bg-background/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-muted-foreground">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="h-9 bg-background/60"
                />
              </div>
            </div>

            <div className="border-t border-border/30 pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">Cambiar contraseña (opcional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Contraseña actual</Label>
                  <div className="relative">
                    <Input
                      type={showCurrentPw ? "text" : "password"}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-9 bg-background/60 pr-9"
                    />
                    <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                      {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nueva contraseña</Label>
                  <div className="relative">
                    <Input
                      type={showNewPw ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mín. 8 caracteres"
                      className="h-9 bg-background/60 pr-9"
                    />
                    <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrengthHints password={newPassword} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Confirmar contraseña</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                    className="h-9 bg-background/60"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={savingPersonal || !isNewPasswordStrong || newPwConfirmMismatch} className="gap-2 h-9">
              {savingPersonal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar datos personales
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Perfil de marca ──────────────────────────────── */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4 text-primary" />
            Perfil de marca — {loadingBiz ? "Cargando..." : (bizName || "Nuevo negocio")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingBiz ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando perfil de marca...
            </div>
          ) : (
            <form onSubmit={handleSaveBrand} className="space-y-4">
              {/* Logo */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Logo del negocio</Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl border border-border/50 bg-background/60 flex items-center justify-center overflow-hidden">
                    {bizLogoPreview
                      ? <img src={bizLogoPreview} alt="Logo" className="w-16 h-16 object-contain" />
                      : <Building2 className="w-8 h-8 text-muted-foreground/40" />
                    }
                  </div>
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                      className="gap-2 h-9"
                    >
                      {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploadingLogo ? "Subiendo..." : "Subir nuevo logo"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">PNG, JPG o WebP. Se usará en las imágenes generadas.</p>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nombre del negocio</Label>
                  <Input
                    value={bizName}
                    onChange={e => setBizName(e.target.value)}
                    placeholder="Nombre de tu empresa"
                    className="h-9 bg-background/60"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Industria / Sector</Label>
                  <select
                    value={bizIndustry}
                    onChange={e => { setBizIndustry(e.target.value); setCustomIndustryStatus("idle"); setCustomIndustryMsg(""); setBizSubIndustries([]); setCustomSubInput(""); }}
                    className="w-full h-9 rounded-md border border-input bg-background/60 px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                  >
                    <option value="">— Selecciona una industria —</option>
                    {industries.map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                  {bizIndustry === "Otro" && (
                    <div className="mt-2 space-y-1">
                      <Input
                        value={bizIndustryCustom}
                        onChange={e => { setBizIndustryCustom(e.target.value); setCustomIndustryStatus("idle"); setCustomIndustryMsg(""); }}
                        onBlur={async () => {
                          const name = bizIndustryCustom.trim();
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
                              setBizIndustryCustom(d.suggestion);
                              setCustomIndustryStatus("ok");
                              setCustomIndustryMsg(`¿Quisiste decir "${d.suggestion}"? Ajustado automáticamente ✓`);
                            } else if (d.action === "already_exists" || d.action === "added") {
                              const finalName = d.industry?.name ?? name;
                              setBizIndustryCustom(finalName);
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
                        className="h-9 bg-background/60"
                      />
                      {customIndustryStatus === "validating" && (
                        <p className="text-[11px] text-muted-foreground">Validando con IA…</p>
                      )}
                      {customIndustryStatus === "ok" && (
                        <p className="text-[11px] text-green-500">{customIndustryMsg}</p>
                      )}
                      {customIndustryStatus === "error" && (
                        <p className="text-[11px] text-yellow-500">{customIndustryMsg}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Sub-industrias: multi-select (visible solo cuando la industria tiene subcategorías) */}
              {(() => {
                const effectiveInd = bizIndustry === "Otro" ? bizIndustryCustom.trim() : bizIndustry;
                const entry = fullCatalog.find(e => e.name === effectiveInd);
                const subs = entry?.subcategories ?? [];
                if (subs.length === 0) return null;
                const toggleSub = (name: string) => {
                  setBizSubIndustries(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
                };
                const handleAddCustomSub = async (forceSkipFuzzy?: boolean) => {
                  const raw = customSubInput.trim();
                  if (!raw || !effectiveInd) return;
                  setCustomSubStatus("validating");
                  setCustomSubMsg("");
                  setCustomSubSuggestion(null);
                  setCustomSubCanForce(false);
                  try {
                    const r = await fetch(`${BASE}/api/industries/validate-custom-sub`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      credentials: "include", body: JSON.stringify({ industryName: effectiveInd, subIndustryName: raw, forceSkipFuzzy: !!forceSkipFuzzy }),
                    });
                    const d = await r.json();
                    if (d.action === "added" || d.action === "already_exists") {
                      const name = d.industry?.name ?? raw;
                      setBizSubIndustries(prev => prev.includes(name) ? prev : [...prev, name]);
                      setCustomSubInput("");
                      setCustomSubStatus("ok");
                      setCustomSubMsg(`✓ "${name}" agregada`);
                      if (d.action === "added") {
                        fetch(`${BASE}/api/industries`)
                          .then(r => r.ok ? r.json() : null)
                          .then((cat: { industries?: IndustryCatalogEntry[] } | null) => {
                            if (cat?.industries?.length) setFullCatalog(cat.industries);
                          })
                          .catch(() => {});
                      }
                    } else if (d.action === "suggest") {
                      setCustomSubStatus("error");
                      setCustomSubMsg(`¿Quisiste decir "${d.suggestion}"?`);
                      setCustomSubSuggestion(d.suggestion);
                    } else if (d.action === "invalid") {
                      setCustomSubStatus("error");
                      setCustomSubMsg(d.reason ?? `"${raw}" no es una especialidad reconocida.`);
                      setCustomSubCanForce(true);
                    } else {
                      setCustomSubStatus("error");
                      setCustomSubMsg(d.reason ?? d.error ?? "No se pudo validar");
                    }
                  } catch {
                    setCustomSubStatus("error");
                    setCustomSubMsg("Error de conexión");
                  }
                };
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">
                        Especialidades del negocio
                        {bizSubIndustries.length > 0 && (
                          <span className="ml-1.5 text-primary font-medium">({bizSubIndustries.length} seleccionada{bizSubIndustries.length !== 1 ? "s" : ""})</span>
                        )}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const staticNames = subs.map((s: { name: string; slug: string }) => s.name);
                          const customSelected = bizSubIndustries.filter((n: string) => !subs.find((s: { name: string; slug: string }) => s.name === n));
                          const allSel = staticNames.length > 0 && staticNames.every((n: string) => bizSubIndustries.includes(n));
                          setBizSubIndustries(allSel ? [] : [...staticNames, ...customSelected]);
                        }}
                        className="text-[11px] text-primary hover:underline"
                      >
                        {subs.length > 0 && subs.every((s: { name: string; slug: string }) => bizSubIndustries.includes(s.name)) ? "Quitar todas" : "Todas"}
                      </button>
                    </div>
                    <div className="rounded-md border border-input bg-background/40 p-2.5 space-y-1 max-h-48 overflow-y-auto">
                      {subs.map(s => (
                        <label key={s.slug} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5 group">
                          <input type="checkbox" checked={bizSubIndustries.includes(s.name)} onChange={() => toggleSub(s.name)} className="accent-primary w-3.5 h-3.5" />
                          <span className="text-sm text-foreground group-hover:text-primary transition-colors">{s.name}</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5">
                        <input type="checkbox" checked={!!customSubInput.trim()} onChange={e => setCustomSubInput(e.target.checked ? " " : "")} className="accent-primary w-3.5 h-3.5" />
                        <span className="text-sm text-muted-foreground italic">Otro…</span>
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={customSubInput}
                        onChange={e => { setCustomSubInput(e.target.value); setCustomSubStatus("idle"); setCustomSubMsg(""); setCustomSubSuggestion(null); setCustomSubCanForce(false); }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomSub(); } }}
                        placeholder="Especialidad personalizada…"
                        className="h-8 flex-1 rounded-md border border-input bg-background/60 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        disabled={customSubStatus === "validating"}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddCustomSub()}
                        disabled={!customSubInput.trim() || customSubStatus === "validating"}
                        className="h-8 px-3 text-xs rounded-md border border-input bg-background/60 hover:bg-muted disabled:opacity-50"
                      >
                        {customSubStatus === "validating" ? "Validando…" : "Agregar"}
                      </button>
                    </div>
                    {customSubStatus === "ok" && <p className="text-[11px] text-green-500">{customSubMsg}</p>}
                    {customSubStatus === "error" && customSubSuggestion && (
                      <div className="space-y-1">
                        <p className="text-[11px] text-yellow-500">{customSubMsg}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="h-7 px-2.5 text-[11px] rounded-md border border-green-500/50 text-green-400 hover:bg-green-500/10"
                            onClick={() => {
                              const sugg = customSubSuggestion;
                              setBizSubIndustries(prev => prev.includes(sugg) ? prev : [...prev, sugg]);
                              setCustomSubInput("");
                              setCustomSubStatus("ok");
                              setCustomSubMsg(`✓ "${sugg}" agregada`);
                              setCustomSubSuggestion(null);
                            }}
                          >Sí, esa es</button>
                          <button
                            type="button"
                            className="h-7 px-2.5 text-[11px] rounded-md border border-input hover:bg-muted"
                            onClick={() => { setCustomSubSuggestion(null); handleAddCustomSub(true); }}
                          >No, es diferente</button>
                        </div>
                      </div>
                    )}
                    {customSubStatus === "error" && !customSubSuggestion && customSubCanForce && (
                      <div className="space-y-1">
                        <p className="text-[11px] text-yellow-500">{customSubMsg}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="h-7 px-2.5 text-[11px] rounded-md border border-primary/50 text-primary hover:bg-primary/10"
                            onClick={() => {
                              const raw = customSubInput.trim();
                              if (!raw) return;
                              setBizSubIndustries(prev => prev.includes(raw) ? prev : [...prev, raw]);
                              setCustomSubInput("");
                              setCustomSubStatus("ok");
                              setCustomSubMsg(`✓ "${raw}" agregada a tu perfil`);
                              setCustomSubCanForce(false);
                            }}
                          >Sí, agregar solo a mi perfil</button>
                          <button
                            type="button"
                            className="h-7 px-2.5 text-[11px] rounded-md hover:bg-muted"
                            onClick={() => { setCustomSubInput(""); setCustomSubStatus("idle"); setCustomSubMsg(""); setCustomSubCanForce(false); }}
                          >No</button>
                        </div>
                      </div>
                    )}
                    {customSubStatus === "error" && !customSubSuggestion && !customSubCanForce && (
                      <p className="text-[11px] text-yellow-500">{customSubMsg}</p>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Slogan del negocio</Label>
                <Input
                  value={bizSlogan}
                  onChange={e => setBizSlogan(e.target.value.slice(0, 150))}
                  placeholder="Ej. Energía que transforma el futuro"
                  className="h-9 bg-background/60"
                  maxLength={150}
                />
                <p className="text-[11px] text-muted-foreground">
                  La IA usará el slogan para personalizar los captions y textos. ({bizSlogan.length}/150)
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ciudad / Ubicación por defecto</Label>
                <Input
                  value={bizCity}
                  onChange={e => setBizCity(e.target.value)}
                  placeholder="Ej. Cali, Colombia"
                  className="h-9 bg-background/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Sitio web
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={bizWebsite}
                    onChange={e => setBizWebsite(e.target.value)}
                    placeholder="tuempresa.com"
                    className="h-9 bg-background/60 flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={analyzingWebsite || !bizWebsite.trim()}
                    onClick={handleAnalyzeWebsite}
                    className="h-9 gap-1.5 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    {analyzingWebsite
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />
                    }
                    {analyzingWebsite ? "Analizando..." : "Analizar con IA"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  La IA analizará tu sitio y completará descripción, audiencia y tono automáticamente.
                  Al guardar por primera vez, el análisis se ejecuta automáticamente.
                </p>
              </div>

              {pendingAnalysis && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary shrink-0" />
                    <p className="text-sm font-medium text-foreground">Sugerencias del análisis IA</p>
                    <button
                      type="button"
                      onClick={() => setPendingAnalysis(null)}
                      className="ml-auto text-muted-foreground hover:text-foreground"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Algunos campos ya tienen contenido. Elige cuáles reemplazar:</p>
                  <div className="space-y-2.5">
                    {pendingAnalysis.description && (
                      <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Descripción</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-primary hover:bg-primary/10"
                            onClick={() => applyPendingAnalysis({ description: true, audience: false, tone: false, color: false })}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Aplicar
                          </Button>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{pendingAnalysis.description}</p>
                      </div>
                    )}
                    {pendingAnalysis.audience && (
                      <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Audiencia</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-primary hover:bg-primary/10"
                            onClick={() => applyPendingAnalysis({ description: false, audience: true, tone: false, color: false })}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Aplicar
                          </Button>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{pendingAnalysis.audience}</p>
                      </div>
                    )}
                    {pendingAnalysis.tone && (
                      <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tono</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-primary hover:bg-primary/10"
                            onClick={() => applyPendingAnalysis({ description: false, audience: false, tone: true, color: false })}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Aplicar
                          </Button>
                        </div>
                        <p className="text-xs text-foreground/80">{TONE_OPTIONS.find(t => t.value === pendingAnalysis.tone)?.label ?? pendingAnalysis.tone}</p>
                      </div>
                    )}
                    {pendingAnalysis.primaryColor && (
                      <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Color principal</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-primary hover:bg-primary/10"
                            onClick={() => applyPendingAnalysis({ description: false, audience: false, tone: false, color: true })}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Aplicar
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded border border-border/50" style={{ backgroundColor: pendingAnalysis.primaryColor }} />
                          <span className="text-xs font-mono text-foreground/80 uppercase">{pendingAnalysis.primaryColor}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full gap-1.5 h-8"
                    onClick={() => applyPendingAnalysis({ description: true, audience: true, tone: true, color: true })}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Aplicar todo
                  </Button>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Descripción del negocio</Label>
                <Textarea
                  value={bizDescription}
                  onChange={e => setBizDescription(e.target.value)}
                  placeholder="Breve descripción de tu negocio, productos o servicios..."
                  rows={3}
                  className="bg-background/60 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Audiencia objetivo</Label>
                <Textarea
                  value={bizAudience}
                  onChange={e => setBizAudience(e.target.value)}
                  placeholder="Ej. Emprendedores de 25-45 años que buscan soluciones digitales..."
                  rows={2}
                  className="bg-background/60 resize-none"
                />
                <p className="text-[11px] text-muted-foreground">La IA usará esta información para personalizar el contenido a tu público.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tono de comunicación</Label>
                <select
                  value={bizTone}
                  onChange={e => setBizTone(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background/60 px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                >
                  <option value="">— Sin definir —</option>
                  {TONE_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">Define cómo se comunica tu marca en los captions e ideas de contenido.</p>
              </div>

              {/* Colors */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Colores de marca</Label>
                <div className="flex gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Color principal</p>
                    <div className="flex items-center gap-2 h-9 rounded-lg border border-border/50 bg-background/60 px-2">
                      <input
                        type="color"
                        value={bizPrimary}
                        onChange={e => setBizPrimary(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-[11px] font-mono text-muted-foreground uppercase">{bizPrimary}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Color secundario</p>
                    <div className="flex items-center gap-2 h-9 rounded-lg border border-border/50 bg-background/60 px-2">
                      <input
                        type="color"
                        value={bizSecondary}
                        onChange={e => setBizSecondary(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-[11px] font-mono text-muted-foreground uppercase">{bizSecondary}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={savingBiz || analyzingWebsite} className="gap-2 h-9">
                {(savingBiz || analyzingWebsite) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {analyzingWebsite ? "Analizando sitio web…" : (bizId ? "Guardar perfil de marca" : "Crear perfil de marca")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
