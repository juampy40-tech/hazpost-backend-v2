import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Users, CreditCard, RefreshCw, ShieldAlert, UserPlus, Database, ChevronDown, ChevronUp, CalendarDays, Zap, Music, Sparkles, Eye, X as XIcon, ClipboardList, Building2, Globe, Factory, Trash2, Handshake, CheckCircle2, AlertCircle, MessageSquare, Send, Loader2, Activity, Check, Tag, Plus, Pencil, Gift, Settings, Copy, RotateCcw, BarChart2, MinusCircle, Search } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  business: "Business",
  agency: "Agencia",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  inactive: "bg-red-500/20 text-red-400 border-red-500/30",
  admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

interface PostStats {
  image: number;
  story: number;
  carousel: number;
  reel: number;
  totalPosts: number;
  totalCostUsd: number;
}

interface AdminUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  plan: string;
  status: string;
  emailVerified?: boolean;
  createdAt: string;
  subscription?: {
    status: string;
    creditsRemaining: number;
    creditsTotal: number;
    periodEnd: string | null;
  };
  postStats?: PostStats | null;
}

interface BrandProfileSummary {
  userId: number;
  onboardingStep: number;
  onboardingCompleted: boolean | string;
  companyName?: string;
  industry?: string;
  country?: string;
  city?: string;
  website?: string;
  audienceDescription?: string;
  brandTone?: string;
  businessDescription?: string;
  updatedAt?: string;
  websiteAnalyzedAt?: string | null;
}

interface FullBrandProfile {
  id?: number;
  userId?: number;
  companyName?: string;
  industry?: string;
  country?: string;
  website?: string;
  logoUrl?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

function useAdminSection(id: string, defaultOpen = true): [boolean, () => void, (v: boolean) => void] {
  const key = `hz_admin_col_${id}`;
  const [open, setOpen] = useState(() => {
    try { const s = localStorage.getItem(key); return s !== null ? s === "1" : defaultOpen; } catch { return defaultOpen; }
  });
  const toggle = () => setOpen(o => {
    const n = !o;
    try { localStorage.setItem(key, n ? "1" : "0"); } catch {}
    return n;
  });
  const set = (v: boolean) => {
    setOpen(v);
    try { localStorage.setItem(key, v ? "1" : "0"); } catch {}
  };
  return [open, toggle, set];
}

interface CollapsibleAdminSectionProps {
  id: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  subtitle?: React.ReactNode;
  onSetRef?: (setter: (v: boolean) => void) => void;
}

function CollapsibleAdminSection({ id, title, icon, defaultOpen = true, children, action, badge, subtitle, onSetRef }: CollapsibleAdminSectionProps) {
  const [open, toggle, set] = useAdminSection(id, defaultOpen);
  useEffect(() => { if (onSetRef) onSetRef(set); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center px-4 py-3 border-b border-border/50">
        <button type="button" onClick={toggle} className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity min-w-0">
          {icon}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              {badge}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-1 shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-1 shrink-0" />}
        </button>
        {action && <div className="ml-2 shrink-0">{action}</div>}
      </div>
      {open && children}
    </div>
  );
}

function BrandProfileModal({ userId, userName, onClose }: { userId: number; userName: string; onClose: () => void }) {
  const [profile, setProfile] = useState<FullBrandProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authFetch(`/brand-profile/admin/${userId}`);
      setProfile(data.profile ?? null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const logoSrc = profile?.logoUrl?.startsWith("/objects/")
    ? `${BASE}/api/storage${profile.logoUrl}`
    : profile?.logoUrl ?? null;

  let refImages: string[] = [];
  if (profile?.referenceImages) {
    try { refImages = JSON.parse(profile.referenceImages); }
    catch { refImages = profile.referenceImages.split(",").filter(Boolean); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <p className="font-semibold text-foreground text-sm">Perfil de marca</p>
            <p className="text-xs text-muted-foreground">{userName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Cargando perfil…</div>
          ) : !profile ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Este cliente aún no ha completado el perfil de marca.</div>
          ) : (
            <div className="space-y-4">
              {/* Header: logo + company */}
              <div className="flex items-center gap-4">
                {logoSrc ? (
                  <div className="w-16 h-16 rounded-xl border border-border overflow-hidden bg-black/10 flex items-center justify-center shrink-0">
                    <img src={logoSrc} alt="Logo" className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl border border-border bg-muted flex items-center justify-center shrink-0 text-2xl text-muted-foreground font-bold">
                    {profile.companyName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div>
                  <p className="font-bold text-foreground text-base">{profile.companyName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{[profile.industry, profile.country].filter(Boolean).join(" · ") || "—"}</p>
                  {profile.website && (
                    <a href={profile.website} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{profile.website}</a>
                  )}
                </div>
              </div>

              {/* Colors */}
              {(profile.primaryColor || profile.secondaryColor) && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Colores</p>
                  <div className="flex gap-2">
                    {profile.primaryColor && (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md border border-border shadow-sm" style={{ background: profile.primaryColor }} />
                        <span className="text-xs font-mono text-muted-foreground">{profile.primaryColor}</span>
                      </div>
                    )}
                    {profile.secondaryColor && (
                      <div className="flex items-center gap-2 ml-3">
                        <div className="w-7 h-7 rounded-md border border-border shadow-sm" style={{ background: profile.secondaryColor }} />
                        <span className="text-xs font-mono text-muted-foreground">{profile.secondaryColor}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Brand description */}
              {profile.businessDescription && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Descripción</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{profile.businessDescription}</p>
                </div>
              )}

              {/* Tone + font */}
              <div className="grid grid-cols-2 gap-3">
                {profile.brandTone && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Tono</p>
                    <p className="text-sm text-foreground">{profile.brandTone}</p>
                  </div>
                )}
                {profile.brandFont && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Tipografía</p>
                    <p className="text-sm text-foreground">{profile.brandFont}</p>
                  </div>
                )}
              </div>

              {/* Audience */}
              {profile.audienceDescription && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Audiencia objetivo</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{profile.audienceDescription}</p>
                </div>
              )}

              {/* Reference images */}
              {refImages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Imágenes de referencia ({refImages.length})</p>
                  <div className="grid grid-cols-4 gap-2">
                    {refImages.map((url, i) => {
                      const src = url.startsWith("/objects/") ? `${BASE}/api/storage${url}` : url;
                      return (
                        <div key={i} className="aspect-square rounded-lg overflow-hidden bg-black/10 border border-border">
                          <img src={src} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Onboarding status */}
              <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>Paso {profile.onboardingStep ?? 0}/5 completado</span>
                <Badge variant="outline" className={
                  (profile.onboardingCompleted === true || profile.onboardingCompleted === "true")
                    ? "text-green-400 border-green-500/30 bg-green-500/10"
                    : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                }>
                  {(profile.onboardingCompleted === true || profile.onboardingCompleted === "true") ? "Completado" : "En progreso"}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeWebsiteUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch { /* invalid URL */ }
  return null;
}

async function authFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function PeriodEndEditor({ user, onUpdate }: { user: AdminUser; onUpdate: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = user.subscription?.periodEnd
    ? new Date(user.subscription.periodEnd).toISOString().split("T")[0]
    : "";
  const [date, setDate] = useState(current);

  async function save() {
    if (!date) return;
    setSaving(true);
    try {
      await authFetch(`/user/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ periodEnd: date }),
      });
      toast({ title: "Fecha de vencimiento guardada" });
      setOpen(false);
      onUpdate();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const formatted = user.subscription?.periodEnd
    ? new Date(user.subscription.periodEnd).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  const isExpired = user.subscription?.periodEnd
    ? new Date(user.subscription.periodEnd) < new Date()
    : false;

  return (
    <div className="space-y-1">
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(v => !v)}
        title="Editar fecha de vencimiento"
      >
        <CalendarDays className="w-3 h-3" />
        {formatted ? (
          <span className={isExpired ? "text-red-400" : "text-green-400"}>
            {isExpired ? "Expiró " : "Vence "}{formatted}
          </span>
        ) : (
          <span className="text-muted-foreground">Sin fecha</span>
        )}
      </button>
      {open && (
        <div className="flex items-center gap-1 mt-1">
          <Input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-6 text-xs w-36 px-2"
          />
          <Button size="sm" className="h-6 text-xs px-2" onClick={save} disabled={saving || !date}>
            {saving ? "…" : "OK"}
          </Button>
        </div>
      )}
    </div>
  );
}

function CreditsEditor({ user, onUpdate }: { user: AdminUser; onUpdate: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [val, setVal] = useState(String(user.subscription?.creditsRemaining ?? 0));

  const isUnlimited = (user.subscription?.creditsRemaining ?? 0) >= 99999;

  async function save(creditsOverride?: number) {
    const amount = creditsOverride !== undefined ? creditsOverride : Number(val);
    if (isNaN(amount) || amount < 0) return;
    setSaving(true);
    try {
      await authFetch(`/user/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ credits: amount, creditsTotal: Math.max(amount, user.subscription?.creditsTotal ?? amount) }),
      });
      toast({ title: creditsOverride !== undefined ? "Créditos ilimitados activados ∞" : "Créditos actualizados" });
      setOpen(false);
      onUpdate();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
        onClick={() => { setVal(String(user.subscription?.creditsRemaining ?? 0)); setOpen(v => !v); }}
      >
        <Zap className="w-3 h-3 text-yellow-400" />
        <span className={isUnlimited ? "text-purple-400 font-semibold" : "text-muted-foreground"}>
          {isUnlimited ? "∞ Sin límite" : `${user.subscription?.creditsRemaining ?? 0} créditos`}
        </span>
      </button>
      {open && (
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <Input
            type="number"
            min={0}
            value={val}
            onChange={e => setVal(e.target.value)}
            className="h-6 text-xs w-20 px-2"
          />
          <Button size="sm" className="h-6 text-xs px-2" onClick={() => save()} disabled={saving}>
            {saving ? "…" : "OK"}
          </Button>
          <Button
            size="sm"
            className="h-6 text-xs px-2 bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => save(99999)}
            disabled={saving}
            title="Dar créditos ilimitados"
          >
            ∞ Sin límite
          </Button>
        </div>
      )}
    </div>
  );
}

interface UserStats {
  byType: { image: number; story: number; carousel: number; reel: number; elementAi: number };
  costByType: { image: number; story: number; carousel: number; reel: number };
  elementAiCreditsUsed: number;
  totalCostUsd: number;
  totalPosts: number;
  lastPublishedAt: string | null;
  creditsUsedThisMonth: number;
  creditsRemaining: number;
  creditsTotal: number;
  planName: string;
  planCreditsPerMonth: number;
  costs: { image: number; story: number; carousel: number; reel: number; elementAi: number };
}

interface SocialDiagnostic {
  accounts: Array<{
    id: number;
    platform: string;
    username: string | null;
    pageId: string | null;
    igUserId: string | null;
    connected: string | null;
    hasToken: boolean;
    tokenExpiresAt: string | null;
    businessId: number | null;
    updatedAt: string | null;
  }>;
  lastByPlatform: Record<string, {
    status: string;
    errorMessage: string | null;
    publishedAt: string | null;
  }>;
}

function UserRowWithOnboarding({ user, brandProfile, onUpdate }: { user: AdminUser; brandProfile?: BrandProfileSummary; onUpdate: () => void }) {
  const { toast } = useToast();
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState(user.email);
  const [savingEmail, setSavingEmail] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [socialDiag, setSocialDiag] = useState<SocialDiagnostic | null>(null);
  const [refreshingIg, setRefreshingIg] = useState(false);
  const [resettingSocial, setResettingSocial] = useState<string | null>(null);
  const [settingIgId, setSettingIgId] = useState(false);
  const [manualIgId, setManualIgId] = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [editingBrandField, setEditingBrandField] = useState<"brandTone" | "audienceDescription" | "companyName" | "businessDescription" | null>(null);
  const [brandDraft, setBrandDraft] = useState("");
  const [savingBrandField, setSavingBrandField] = useState(false);
  const pct = !brandProfile ? 0 : (brandProfile.onboardingCompleted === true || brandProfile.onboardingCompleted === "true") ? 100 : Math.round((brandProfile.onboardingStep / 5) * 100);
  const barColor = pct === 100 ? "bg-primary" : pct >= 60 ? "bg-amber-400" : pct > 0 ? "bg-red-400" : "bg-border";

  async function changePlan(plan: string) {
    setUpdatingPlan(true);
    try {
      await authFetch(`/user/admin/users/${user.id}`, { method: "PUT", body: JSON.stringify({ plan }) });
      toast({ title: "Plan actualizado" });
      onUpdate();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally { setUpdatingPlan(false); }
  }

  async function toggleStatus() {
    const newIsActive = user.status === "active" ? "false" : "true";
    try {
      await authFetch(`/user/admin/users/${user.id}`, { method: "PUT", body: JSON.stringify({ isActive: newIsActive }) });
      toast({ title: newIsActive === "true" ? "Usuario activado" : "Usuario desactivado" });
      onUpdate();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  }

  async function claimLegacy() {
    if (!confirm(`¿Asignar todos los datos sin propietario a ${user.displayName || user.email}?`)) return;
    setClaiming(true);
    try {
      const data = await authFetch(`/user/admin/users/${user.id}/claim-legacy`, { method: "POST" });
      const r = data.results;
      toast({ title: "Datos asignados", description: `Posts: ${r.posts} · Nichos: ${r.niches} · Variantes: ${r.imageVariants}` });
      onUpdate();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally { setClaiming(false); }
  }

  async function deleteUserAccount() {
    if (!confirm(`🗑️ MOVER A PAPELERA\n\n${user.email}\n\nEl usuario y todos sus datos se conservarán en la papelera por 30 días. Podrás restaurarlo desde el panel de Papelera.\n\n¿Continuar?`)) return;
    try {
      await authFetch(`/user/admin/users/${user.id}`, { method: "DELETE" });
      toast({ title: "Movido a papelera", description: `${user.email} fue movido a la papelera. Puedes restaurarlo en 30 días.` });
      onUpdate();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  }

  async function saveEmail() {
    if (!newEmail || newEmail === user.email) { setEditingEmail(false); return; }
    setSavingEmail(true);
    try {
      await authFetch(`/user/admin/users/${user.id}/email`, { method: "PATCH", body: JSON.stringify({ email: newEmail }) });
      toast({ title: "Email actualizado", description: `${user.email} → ${newEmail}` });
      onUpdate();
      setEditingEmail(false);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally { setSavingEmail(false); }
  }

  async function forceVerify() {
    if (!confirm(`¿Marcar el correo de ${user.displayName || user.email} como verificado?`)) return;
    try {
      await authFetch(`/user/admin/users/${user.id}/force-verify`, { method: "POST" });
      toast({ title: "Email verificado", description: `${user.email} ya puede usar la plataforma.` });
      onUpdate();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  }

  async function toggleExpand() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    const promises: Promise<void>[] = [];
    if (!stats) {
      promises.push((async () => {
        setStatsLoading(true);
        try {
          const data = await authFetch(`/admin/users/${user.id}/stats`);
          setStats(data);
        } catch {
          toast({ title: "Error al cargar estadísticas", variant: "destructive" });
        } finally {
          setStatsLoading(false);
        }
      })());
    }
    if (!socialDiag) {
      promises.push((async () => {
        try {
          const data = await authFetch(`/admin/users/${user.id}/social-diagnostic`);
          setSocialDiag(data);
        } catch { /* silent — social accounts are optional */ }
      })());
    }
    await Promise.all(promises);
  }

  async function refreshIg() {
    setRefreshingIg(true);
    try {
      const data = await authFetch(`/admin/users/${user.id}/social-accounts/instagram/refresh-ig`, { method: "POST" });
      toast({
        title: data.igUserId ? "Instagram vinculado" : "Instagram no vinculado aún",
        description: data.igUserId
          ? `ID de cuenta IG: ${data.igUserId}`
          : (data.message ?? "La Página de Facebook todavía no tiene una cuenta de Instagram Business vinculada."),
        variant: data.igUserId ? "default" : "destructive",
      });
      // Reload social diagnostic after refresh
      const diag = await authFetch(`/admin/users/${user.id}/social-diagnostic`);
      setSocialDiag(diag);
    } catch (err: unknown) {
      toast({ title: "Error al refrescar", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setRefreshingIg(false);
    }
  }

  async function resetSocial(platform: string) {
    if (!confirm(`¿Eliminar la conexión de ${platform === "instagram" ? "Instagram y Facebook" : platform} de este usuario? Tendrá que reconectar desde Configuración.`)) return;
    setResettingSocial(platform);
    try {
      const data = await authFetch(`/admin/users/${user.id}/social-accounts/${platform}`, { method: "DELETE" });
      toast({ title: "Cuenta desvinculada", description: data.message });
      const diag = await authFetch(`/admin/users/${user.id}/social-diagnostic`);
      setSocialDiag(diag);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setResettingSocial(null); }
  }

  async function setIgIdManually() {
    const id = manualIgId.trim();
    if (!id || !/^\d+$/.test(id)) {
      toast({ title: "ID inválido", description: "El IG ID debe ser un número (ej: 17841431745001274)", variant: "destructive" });
      return;
    }
    setSettingIgId(true);
    try {
      const data = await authFetch(`/admin/users/${user.id}/social-accounts/instagram/set-ig-id`, {
        method: "POST",
        body: JSON.stringify({ igUserId: id }),
      });
      toast({ title: "IG ID actualizado", description: data.message });
      setManualIgId("");
      const diag = await authFetch(`/admin/users/${user.id}/social-diagnostic`);
      setSocialDiag(diag);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSettingIgId(false);
    }
  }

  async function reanalyzeWebsite() {
    if (!brandProfile?.website) return;
    setReanalyzing(true);
    try {
      const data = await authFetch(`/brand-profile/admin/${user.id}/reanalyze`, { method: "POST" });
      if (data.ok === false) {
        toast({ title: "Sin resultados", description: data.warning ?? "El sitio web no devolvió información útil.", variant: "destructive" });
      } else {
        toast({ title: "Sitio web re-analizado", description: "Tono de marca y audiencia actualizados con la IA." });
        onUpdate();
      }
    } catch (err: unknown) {
      toast({ title: "Error al re-analizar", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setReanalyzing(false);
    }
  }

  function startEditBrandField(field: "brandTone" | "audienceDescription" | "companyName" | "businessDescription") {
    setBrandDraft(brandProfile?.[field] ?? "");
    setEditingBrandField(field);
  }

  async function saveBrandField() {
    if (!editingBrandField) return;
    setSavingBrandField(true);
    try {
      await authFetch(`/brand-profile/admin/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [editingBrandField]: brandDraft }),
      });
      toast({ title: "Campo actualizado" });
      setEditingBrandField(null);
      onUpdate();
    } catch (err: unknown) {
      toast({ title: "Error al guardar", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSavingBrandField(false);
    }
  }

  function cancelEditBrandField() {
    setEditingBrandField(null);
    setBrandDraft("");
  }

  const creditPlanTotal = stats ? ((stats.planCreditsPerMonth ?? 0) > 0 ? (stats.planCreditsPerMonth ?? 0) : (stats.creditsTotal ?? 0)) : 0;
  const creditPct = stats
    ? (creditPlanTotal > 0 ? Math.min(100, (stats.creditsUsedThisMonth / creditPlanTotal) * 100) : 0)
    : 0;

  return (
    <>
    <tr className="border-b border-border/40 hover:bg-white/3 transition-colors">
      <td className="py-3 px-4">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-mono font-bold text-muted-foreground/60 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
              #{user.id}
            </span>
          </div>
          <p className="font-medium text-foreground text-sm">{user.displayName || "—"}</p>
          {editingEmail ? (
            <div className="flex items-center gap-1 mt-0.5">
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveEmail(); if (e.key === "Escape") setEditingEmail(false); }}
                className="text-xs bg-black/50 border border-cyan-500/50 rounded px-1.5 py-0.5 text-cyan-200 w-44 focus:outline-none"
                autoFocus
              />
              <button onClick={saveEmail} disabled={savingEmail} className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/40 hover:bg-cyan-500/30">
                {savingEmail ? "..." : "OK"}
              </button>
              <button onClick={() => { setEditingEmail(false); setNewEmail(user.email); }} className="text-[10px] px-1 text-muted-foreground hover:text-red-400">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setEditingEmail(true)} className="text-xs text-muted-foreground hover:text-cyan-400 transition-colors text-left group flex items-center gap-1">
                {user.email}
                <span className="opacity-0 group-hover:opacity-100 text-[9px] text-cyan-500">✏️</span>
              </button>
              {user.emailVerified === false && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold leading-none">No verif.</span>
              )}
            </div>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[user.role === "admin" ? "admin" : user.status] || ""}`}>
          {user.role === "admin" ? "Admin" : user.status === "active" ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td className="py-3 px-4">
        {user.role !== "admin" ? (
          <Select value={user.plan} onValueChange={changePlan} disabled={updatingPlan}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PLAN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="text-xs">{PLAN_LABELS[user.plan] || user.plan}</Badge>
        )}
      </td>
      <td className="py-3 px-4">
        {user.role !== "admin" && user.subscription ? (
          <CreditsEditor user={user} onUpdate={onUpdate} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 px-4">
        {user.role !== "admin" ? (
          <PeriodEndEditor user={user} onUpdate={onUpdate} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="space-y-1 min-w-[80px]">
          <div className="flex items-center justify-between text-xs">
            <span className={pct === 100 ? "text-primary font-semibold" : "text-muted-foreground"}>{pct}%</span>
            {brandProfile?.companyName && <span className="text-muted-foreground truncate max-w-[60px] text-[10px]">{brandProfile.companyName}</span>}
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden w-full">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          {brandProfile?.website && safeWebsiteUrl(brandProfile.website) && (
            <a
              href={safeWebsiteUrl(brandProfile.website)!}
              target="_blank"
              rel="noreferrer"
              className="block text-[10px] text-primary/80 hover:text-primary truncate max-w-[120px] leading-tight"
              title={brandProfile.website}
              onClick={e => e.stopPropagation()}
            >
              {brandProfile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-xs text-muted-foreground">
        {new Date(user.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
      </td>
      <td className="py-3 px-4">
        {user.role !== "admin" ? (
          <button
            onClick={toggleExpand}
            className="flex flex-col gap-1 text-left group"
            title="Ver detalles de créditos"
          >
            {user.postStats ? (
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { key: "image" as const,    icon: "🖼",  color: "text-blue-400" },
                  { key: "story" as const,    icon: "📖", color: "text-emerald-400" },
                  { key: "carousel" as const, icon: "🎠", color: "text-amber-400" },
                  { key: "reel" as const,     icon: "🎬", color: "text-purple-400" },
                ]).map(({ key, icon, color }) => (
                  <span key={key} className={`text-[11px] font-medium tabular-nums ${color}`}>
                    {icon} {user.postStats![key]}
                  </span>
                ))}
                {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground ml-auto" /> : <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Activity className="w-3.5 h-3.5 group-hover:text-primary" />
                {statsLoading ? <span className="text-[10px] animate-pulse">Cargando…</span> : <span className="text-[10px]">Ver</span>}
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </div>
            )}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 px-4">
        {user.role !== "admin" && user.postStats != null ? (
          <span className={`text-xs font-medium tabular-nums ${user.postStats.totalCostUsd > 1 ? "text-red-400" : "text-muted-foreground"}`}>
            ${user.postStats.totalCostUsd.toFixed(2)} USD
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2 flex-wrap">
          {user.role !== "admin" && brandProfile && (
            <Button size="sm" variant="outline" className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10" onClick={() => setShowBrandModal(true)} title="Ver perfil de marca">
              <Eye className="w-3 h-3 mr-1" />
              Marca
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10" onClick={claimLegacy} disabled={claiming} title="Heredar datos sin propietario">
            <Database className="w-3 h-3 mr-1" />
            {claiming ? "…" : "Heredar"}
          </Button>
          {user.role !== "admin" && (
            <Button size="sm" variant={user.status === "active" ? "destructive" : "outline"} className="h-7 text-xs" onClick={toggleStatus}>
              {user.status === "active" ? "Desactivar" : "Activar"}
            </Button>
          )}
          {user.role !== "admin" && !user.emailVerified && (
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/50 text-amber-400 hover:bg-amber-500/10" onClick={forceVerify} title="Marcar email como verificado">
              ✅ Verificar
            </Button>
          )}
          {user.role !== "admin" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30" onClick={deleteUserAccount} title="Mover a papelera (30 días para restaurar)">
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </td>
    </tr>

    {/* Expandable stats row */}
    {expanded && (
      <tr className="border-b border-border/30 bg-background/30">
        <td colSpan={10} className="px-6 py-4">
          {statsLoading || !stats ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <div className="w-4 h-4 rounded-full border border-primary border-t-transparent animate-spin" />
              Cargando estadísticas…
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Post types */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tipos de publicación (total)</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {([
                    { key: "image",     label: "Imagen",      color: "text-blue-400" },
                    { key: "story",     label: "Historia",    color: "text-emerald-400" },
                    { key: "carousel",  label: "Carrusel",    color: "text-amber-400" },
                    { key: "reel",      label: "Reel",        color: "text-purple-400" },
                    { key: "elementAi", label: "IA Elemento", color: "text-fuchsia-400" },
                  ] as const).map(({ key, label, color }) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-bold tabular-nums ${color}`}>{stats.byType[key]}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                  <span className="text-muted-foreground font-medium">Total</span>
                  <span className="font-bold text-foreground tabular-nums">{stats.totalPosts}</span>
                </div>
              </div>

              {/* Last activity + USD cost */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Última publicación</p>
                {stats.lastPublishedAt ? (
                  <p className="text-sm font-medium text-foreground">
                    {new Date(stats.lastPublishedAt).toLocaleDateString("es-CO", {
                      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                    })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sin publicaciones aún</p>
                )}
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">Costo USD plataforma (total)</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {([
                    { key: "image" as const,    label: "Imagen",   color: "text-blue-400" },
                    { key: "story" as const,    label: "Historia", color: "text-emerald-400" },
                    { key: "carousel" as const, label: "Carrusel", color: "text-amber-400" },
                    { key: "reel" as const,     label: "Reel",     color: "text-purple-400" },
                  ]).map(({ key, label, color }) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-bold tabular-nums ${color}`}>${(stats.costByType?.[key] ?? 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                  <span className="text-muted-foreground font-medium">Total</span>
                  <span className="font-bold text-foreground tabular-nums">${(stats.totalCostUsd ?? 0).toFixed(2)} USD</span>
                </div>
                {(stats.elementAiCreditsUsed ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-muted-foreground">IA Elemento</span>
                    <span className="font-bold text-fuchsia-400 tabular-nums">{stats.elementAiCreditsUsed} cr</span>
                  </div>
                )}
              </div>

              {/* Credit usage */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Créditos (este mes)</p>
                <div className="flex items-end gap-1.5">
                  <span className="text-2xl font-bold text-foreground tabular-nums">{stats.creditsUsedThisMonth}</span>
                  <span className="text-sm text-muted-foreground mb-0.5">/ {creditPlanTotal} cr del plan</span>
                </div>
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${creditPct}%`,
                        background: creditPct > 90 ? "rgb(239,68,68)" : creditPct > 60 ? "rgb(251,191,36)" : "linear-gradient(90deg,#0077FF,#00C2FF)"
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{stats.creditsRemaining} restantes (subs)</span>
                    <span>{creditPct.toFixed(0)}% del plan usado</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Plan: {stats.planName} · {stats.planCreditsPerMonth} cr/mes</p>
              </div>
            </div>
          )}

          {/* Brand profile quick view */}
          {brandProfile && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{brandProfile.website ? "Sitio web analizado" : "Marca y audiencia"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {brandProfile.websiteAnalyzedAt
                      ? `Último análisis: ${new Date(brandProfile.websiteAnalyzedAt).toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                      : "Sin análisis previo"}
                  </p>
                </div>
                {brandProfile.website && (
                  <button
                    onClick={reanalyzeWebsite}
                    disabled={reanalyzing}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${reanalyzing ? "animate-spin" : ""}`} />
                    {reanalyzing ? "Analizando..." : "Re-analizar"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {brandProfile.website && safeWebsiteUrl(brandProfile.website) && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sitio web</p>
                    <a
                      href={safeWebsiteUrl(brandProfile.website)!}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline break-all"
                    >
                      {brandProfile.website}
                    </a>
                  </div>
                )}
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Nombre de empresa</p>
                  {editingBrandField === "companyName" ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        className="text-xs bg-background border border-border rounded px-1.5 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={brandDraft}
                        onChange={e => setBrandDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveBrandField(); if (e.key === "Escape") cancelEditBrandField(); }}
                        disabled={savingBrandField}
                      />
                      <button onClick={saveBrandField} disabled={savingBrandField} className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50">
                        {savingBrandField ? "..." : "OK"}
                      </button>
                      <button onClick={cancelEditBrandField} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-white/5">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditBrandField("companyName")}
                      className="text-xs text-foreground hover:text-primary text-left group flex items-center gap-1"
                      title="Clic para editar"
                    >
                      {brandProfile.companyName || <span className="italic text-muted-foreground">Sin nombre</span>}
                      <span className="opacity-0 group-hover:opacity-60 text-[10px]">✏️</span>
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tono de marca</p>
                  {editingBrandField === "brandTone" ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        className="text-xs bg-background border border-border rounded px-1.5 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={brandDraft}
                        onChange={e => setBrandDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveBrandField(); if (e.key === "Escape") cancelEditBrandField(); }}
                        disabled={savingBrandField}
                      />
                      <button onClick={saveBrandField} disabled={savingBrandField} className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50">
                        {savingBrandField ? "..." : "OK"}
                      </button>
                      <button onClick={cancelEditBrandField} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-white/5">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditBrandField("brandTone")}
                      className="text-xs text-foreground hover:text-primary text-left group flex items-center gap-1"
                      title="Clic para editar"
                    >
                      {brandProfile.brandTone || <span className="italic text-muted-foreground">Sin tono</span>}
                      <span className="opacity-0 group-hover:opacity-60 text-[10px]">✏️</span>
                    </button>
                  )}
                </div>
                <div className="space-y-0.5 max-w-sm">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Audiencia objetivo</p>
                  {editingBrandField === "audienceDescription" ? (
                    <div className="flex flex-col gap-1">
                      <textarea
                        autoFocus
                        className="text-xs bg-background border border-border rounded px-1.5 py-0.5 w-full max-w-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                        rows={3}
                        value={brandDraft}
                        onChange={e => setBrandDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveBrandField(); } if (e.key === "Escape") cancelEditBrandField(); }}
                        disabled={savingBrandField}
                      />
                      <div className="flex gap-1">
                        <button onClick={saveBrandField} disabled={savingBrandField} className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50">
                          {savingBrandField ? "Guardando..." : "Guardar"}
                        </button>
                        <button onClick={cancelEditBrandField} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-white/5">Cancelar</button>
                      </div>
                      <p className="text-[9px] text-muted-foreground">Enter para guardar · Shift+Enter para nueva línea · Esc para cancelar</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditBrandField("audienceDescription")}
                      className="text-xs text-foreground/80 leading-relaxed hover:text-primary text-left group flex items-start gap-1"
                      title="Clic para editar"
                    >
                      {brandProfile.audienceDescription || <span className="italic text-muted-foreground">Sin audiencia</span>}
                      <span className="opacity-0 group-hover:opacity-60 text-[10px] mt-0.5 shrink-0">✏️</span>
                    </button>
                  )}
                </div>
                <div className="space-y-0.5 max-w-sm">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Descripción de negocio</p>
                  {editingBrandField === "businessDescription" ? (
                    <div className="flex flex-col gap-1">
                      <textarea
                        autoFocus
                        className="text-xs bg-background border border-border rounded px-1.5 py-0.5 w-full max-w-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                        rows={3}
                        value={brandDraft}
                        onChange={e => setBrandDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveBrandField(); } if (e.key === "Escape") cancelEditBrandField(); }}
                        disabled={savingBrandField}
                      />
                      <div className="flex gap-1">
                        <button onClick={saveBrandField} disabled={savingBrandField} className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50">
                          {savingBrandField ? "Guardando..." : "Guardar"}
                        </button>
                        <button onClick={cancelEditBrandField} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-white/5">Cancelar</button>
                      </div>
                      <p className="text-[9px] text-muted-foreground">Enter para guardar · Shift+Enter para nueva línea · Esc para cancelar</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditBrandField("businessDescription")}
                      className="text-xs text-foreground/80 leading-relaxed hover:text-primary text-left group flex items-start gap-1"
                      title="Clic para editar"
                    >
                      {brandProfile.businessDescription || <span className="italic text-muted-foreground">Sin descripción</span>}
                      <span className="opacity-0 group-hover:opacity-60 text-[10px] mt-0.5 shrink-0">✏️</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Social accounts diagnostic */}
          {socialDiag && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Cuentas Sociales</p>
              {socialDiag.accounts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Sin cuentas sociales configuradas</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {socialDiag.accounts.map(acc => {
                    const last = socialDiag.lastByPlatform[acc.platform];
                    const igNotLinked = acc.platform === "instagram" && !acc.igUserId;
                    const lastOk = last?.status === "published";
                    const lastFailed = last?.status === "failed";
                    return (
                      <div key={acc.id} className={`rounded-lg border px-3 py-2 text-xs space-y-1 min-w-[180px] ${igNotLinked ? "border-amber-500/40 bg-amber-500/5" : lastFailed ? "border-red-500/30 bg-red-500/5" : "border-border/40 bg-white/3"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold capitalize">{acc.platform}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${lastOk ? "bg-green-500/20 text-green-400 border-green-500/30" : lastFailed ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-white/5 text-muted-foreground border-border/30"}`}>
                            {lastOk ? "OK" : lastFailed ? "Falló" : "Sin intentos"}
                          </span>
                        </div>
                        <p className="text-muted-foreground">Usuario: <span className="text-foreground">{acc.username || "—"}</span></p>
                        {acc.businessId != null && (
                          <p className="text-muted-foreground">Negocio ID: <span className="font-mono text-[10px] text-foreground">#{acc.businessId}</span></p>
                        )}
                        <p className="text-muted-foreground">Page ID: <span className="font-mono text-[10px] text-foreground">{acc.pageId || "—"}</span></p>
                        {acc.platform === "instagram" && (
                          <p className={`font-medium ${igNotLinked ? "text-red-400" : "text-green-400"}`}>
                            IG ID: {acc.igUserId || <span className="text-red-400 font-semibold">No detectado</span>}
                          </p>
                        )}
                        {last?.errorMessage && (
                          <p className="text-red-400 text-[10px] line-clamp-2" title={last.errorMessage}>{last.errorMessage}</p>
                        )}
                        {last?.publishedAt && (
                          <p className="text-muted-foreground text-[10px]">{new Date(last.publishedAt).toLocaleString("es-CO", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}</p>
                        )}
                        {acc.platform === "instagram" && (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex gap-1.5">
                              <button
                                onClick={refreshIg}
                                disabled={refreshingIg}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                                title="Refrescar IG ID sin re-autenticar OAuth"
                              >
                                <RefreshCw className="w-2.5 h-2.5" />
                                {refreshingIg ? "…" : "Refresh IG"}
                              </button>
                              <button
                                onClick={() => resetSocial(acc.platform)}
                                disabled={resettingSocial !== null}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                                title="Eliminar conexión Meta (IG + FB) — el usuario debe reconectar"
                              >
                                <XIcon className="w-2.5 h-2.5" />
                                {resettingSocial === acc.platform ? "…" : "Reset Meta"}
                              </button>
                            </div>
                            {/* Manual IG ID override — use when Meta API fails to return instagram_business_account */}
                            <div className="flex gap-1 items-center">
                              <input
                                type="text"
                                value={manualIgId}
                                onChange={e => setManualIgId(e.target.value)}
                                placeholder="IG ID numérico…"
                                className="flex-1 text-[10px] bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 font-mono min-w-0"
                                title="Instagram Business Account ID numérico (ej: 17841431745001274) — visible en la pantalla de OAuth de Meta al seleccionar cuenta"
                              />
                              <button
                                onClick={setIgIdManually}
                                disabled={settingIgId || !manualIgId.trim()}
                                className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 whitespace-nowrap"
                                title="Fijar IG ID manualmente"
                              >
                                <Check className="w-2.5 h-2.5" />
                                {settingIgId ? "…" : "Fijar ID"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </td>
      </tr>
    )}

    {showBrandModal && createPortal(
      <BrandProfileModal
        userId={user.id}
        userName={user.displayName || user.email}
        onClose={() => setShowBrandModal(false)}
      />,
      document.body
    )}
    </>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const sectionSetRef = useRef<((v: boolean) => void) | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", displayName: "", plan: "business", periodEnd: "" });

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body: Record<string, string> = { email: form.email, password: form.password, displayName: form.displayName, plan: form.plan };
      if (form.periodEnd) body.periodEnd = form.periodEnd;
      await authFetch("/user/admin/users", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: "Usuario creado", description: `${form.email} fue creado con plan ${PLAN_LABELS[form.plan] || form.plan}` });
      setForm({ email: "", password: "", displayName: "", plan: "business", periodEnd: "" });
      sectionSetRef.current?.(false);
      onCreated();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error creando usuario", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <CollapsibleAdminSection
      id="create-user"
      defaultOpen={true}
      title="Crear nuevo usuario"
      icon={<UserPlus className="w-4 h-4 text-primary" />}
      onSetRef={fn => { sectionSetRef.current = fn; }}
    >
        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Crea una cuenta para un cliente sin que tenga que registrarse. Después puedes asignarle los datos heredados con el botón <span className="text-amber-400 font-medium">Heredar datos</span>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nombre</label>
              <Input
                placeholder="ECO Energy"
                value={form.displayName}
                onChange={e => set("displayName", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email *</label>
              <Input
                placeholder="cliente@empresa.com"
                type="email"
                required
                value={form.email}
                onChange={e => set("email", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Contraseña * (mín. 8 caracteres)</label>
              <Input
                placeholder="••••••••"
                type="password"
                required
                value={form.password}
                onChange={e => set("password", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Plan</label>
              <Select value={form.plan} onValueChange={v => set("plan", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAN_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                Fecha de vencimiento del plan (opcional — dejar vacío = 30 días)
              </label>
              <Input
                type="date"
                value={form.periodEnd}
                onChange={e => set("periodEnd", e.target.value)}
                className="h-8 text-sm max-w-xs"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={loading}>
              <UserPlus className="w-3 h-3 mr-1" />
              {loading ? "Creando…" : "Crear usuario"}
            </Button>
          </div>
        </form>
    </CollapsibleAdminSection>
  );
}

// ── Music Management ─────────────────────────────────────────────────────────
interface MusicTrackAdmin {
  id: number; title: string; artist: string; genre: string; mood: string;
  bpm: number; usageCount: number; isTrending: boolean; energyLevel: string;
  isProtected: boolean;
}

const GENRE_ICON: Record<string, string> = {
  corporativa: "🏢", electrónica: "⚡", latina: "🌴", pop: "🎵", ambiente: "🌊", ambient: "🌊",
  cinematic: "🎬", funk: "🎸", jazz: "🎷", soul: "🎤", urbano: "🏙️", general: "🎶",
  trap: "🔫", "lo-fi": "☕", phonk: "💀", house: "🔊", dance: "💃",
};

function MusicManagement() {
  const { toast } = useToast();
  const [tracks, setTracks] = useState<MusicTrackAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [stats, setStats] = useState<{ total: number; trending: number }>({ total: 0, trending: 0 });

  async function loadTracks() {
    setLoading(true);
    try {
      const [tracksData, statusData] = await Promise.all([
        authFetch("/music"),
        authFetch("/music/status"),
      ]);
      setTracks(tracksData.tracks || []);
      setStats({ total: Number(statusData.total) || 0, trending: Number(statusData.trending) || 0 });
    } catch (err) {
      toast({ title: "Error", description: "Error cargando biblioteca de música", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTracks(); }, []);

  async function toggleTrending(track: MusicTrackAdmin) {
    setToggling(track.id);
    try {
      const data = await authFetch(`/music/${track.id}/trending`, { method: "PATCH" });
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isTrending: data.isTrending } : t));
      setStats(prev => ({ ...prev, trending: prev.trending + (data.isTrending ? 1 : -1) }));
      toast({ title: data.isTrending ? "🔥 Trending activado" : "Trending desactivado", description: track.title });
    } catch {
      toast({ title: "Error", description: "Error de red", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  }

  const trendingTracks = tracks.filter(t => t.isTrending);
  const otherTracks    = tracks.filter(t => !t.isTrending);
  const MAX_TRENDING = 8;
  return (
    <CollapsibleAdminSection
      id="music-mgmt"
      defaultOpen={true}
      title="Gestión de Música"
      icon={<Music className="w-4 h-4 text-orange-400" />}
      badge={<span className="text-xs text-muted-foreground">({stats.total} pistas)</span>}
      action={
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stats.trending >= MAX_TRENDING ? "bg-orange-500/20 text-orange-300 border border-orange-400/30" : "bg-muted text-muted-foreground"}`}>
            🔥 {stats.trending}/{MAX_TRENDING} trending
          </span>
          <Button variant="outline" size="sm" onClick={loadTracks} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {/* Trending tracks */}
          {trendingTracks.length > 0 && (
            <>
              <div className="px-4 py-2 bg-orange-500/5">
                <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wide">🔥 En tendencia</p>
              </div>
              {trendingTracks.map(track => (
                <div key={track.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  <span className="text-sm w-5">{GENRE_ICON[track.genre] ?? "🎵"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground truncate">{track.title}</p>
                      <span className="text-[9px] text-orange-400">🔥</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{track.artist} · <span className="capitalize">{track.genre}</span>{track.bpm > 0 ? ` · ${track.bpm} BPM` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {track.usageCount > 0 && <span className="text-xs text-amber-400">{track.usageCount}x</span>}
                    <button
                      onClick={() => toggleTrending(track)}
                      disabled={toggling === track.id}
                      className="text-xs px-2 py-1 rounded border border-orange-400/40 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 disabled:opacity-50 transition-all"
                    >
                      {toggling === track.id ? "…" : "Quitar 🔥"}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Non-trending tracks */}
          {otherTracks.length > 0 && (
            <>
              <div className="px-4 py-2 bg-muted/20">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Biblioteca completa</p>
              </div>
              {otherTracks.map(track => (
                <div key={track.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 transition-colors">
                  <span className="text-sm w-5">{GENRE_ICON[track.genre] ?? "🎵"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground/80 truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground"><span className="capitalize">{track.genre}</span>{track.bpm > 0 ? ` · ${track.bpm} BPM` : ""}{track.energyLevel === "high" ? " · ↑ alta energía" : track.energyLevel === "low" ? " · ↓ tranquila" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {stats.trending < MAX_TRENDING ? (
                      <button
                        onClick={() => toggleTrending(track)}
                        disabled={toggling === track.id}
                        className="text-xs px-2 py-1 rounded border border-border/40 text-muted-foreground hover:border-orange-400/40 hover:text-orange-300 hover:bg-orange-500/10 disabled:opacity-50 transition-all"
                      >
                        {toggling === track.id ? "…" : "+ 🔥"}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground/40 px-2 py-1">Máx.</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </CollapsibleAdminSection>
  );
}

// ─── Weekly Review Component ────────────────────────────────────────────────

function WeeklyReview({
  users,
  brandProfiles,
}: {
  users: AdminUser[];
  brandProfiles: BrandProfileSummary[];
}) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const profileMap = new Map(brandProfiles.map(p => [p.userId, p]));

  // New users who registered in the last 7 days AND completed onboarding
  const newClients = users.filter(u => {
    if (u.role === "admin") return false;
    const registered = new Date(u.createdAt);
    if (registered < sevenDaysAgo) return false;
    const profile = profileMap.get(u.id);
    return profile && (profile.onboardingCompleted === true || profile.onboardingCompleted === "true");
  });

  // Also include users who may not have completed but started onboarding this week
  const newStarters = users.filter(u => {
    if (u.role === "admin") return false;
    const registered = new Date(u.createdAt);
    if (registered < sevenDaysAgo) return false;
    const profile = profileMap.get(u.id);
    if (!profile) return false;
    const isCompleted = profile.onboardingCompleted === true || profile.onboardingCompleted === "true";
    return !isCompleted && (profile.onboardingStep ?? 0) > 0;
  });

  // Count industries for completed clients
  const industryCounts: Record<string, number> = {};
  newClients.forEach(u => {
    const industry = profileMap.get(u.id)?.industry ?? "Sin especificar";
    industryCounts[industry] = (industryCounts[industry] ?? 0) + 1;
  });

  const hasSomething = newClients.length > 0 || newStarters.length > 0;

  const reviewBadge = newClients.length > 0
    ? <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">{newClients.length} completado{newClients.length !== 1 ? "s" : ""}</Badge>
    : !hasSomething ? <span className="text-xs text-muted-foreground">Sin nuevos registros esta semana</span>
    : null;

  return (
    <CollapsibleAdminSection
      id="weekly-review"
      defaultOpen={true}
      title="Revisión semanal — nuevos registros"
      icon={<ClipboardList className="w-4 h-4 text-amber-400" />}
      badge={reviewBadge}
    >
        <div className="px-4 py-4 space-y-4">
          {!hasSomething ? (
            <p className="text-sm text-muted-foreground text-center py-4">No hubo registros nuevos en los últimos 7 días.</p>
          ) : (
            <>
              {/* Industrias nuevas esta semana */}
              {Object.keys(industryCounts).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Factory className="w-3 h-3" /> Industrias nuevas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(industryCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([industry, count]) => (
                        <Badge key={industry} className="bg-primary/10 text-primary border-primary/20 text-xs">
                          {industry} {count > 1 && `×${count}`}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {/* Clientes completados */}
              {newClients.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Onboarding completado ({newClients.length})
                  </p>
                  <div className="space-y-2">
                    {newClients.map(u => {
                      const profile = profileMap.get(u.id);
                      return (
                        <div key={u.id} className="bg-black/30 rounded-lg px-3 py-2.5 flex flex-wrap items-start gap-x-4 gap-y-1">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{profile?.companyName || u.displayName}</p>
                            <p className="text-[11px] text-muted-foreground">{u.email}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {profile?.industry && (
                              <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20 text-[10px]">
                                <Factory className="w-2.5 h-2.5 mr-1" />{profile.industry}
                              </Badge>
                            )}
                            {(profile?.city || profile?.country) && (
                              <Badge className="bg-green-500/10 text-green-300 border-green-500/20 text-[10px]">
                                <Globe className="w-2.5 h-2.5 mr-1" />
                                {[profile.city, profile.country].filter(Boolean).join(", ")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                            {new Date(u.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* En proceso */}
              {newStarters.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Users className="w-3 h-3" /> En proceso de onboarding ({newStarters.length})
                  </p>
                  <div className="space-y-1.5">
                    {newStarters.map(u => {
                      const profile = profileMap.get(u.id);
                      return (
                        <div key={u.id} className="bg-black/20 rounded-lg px-3 py-2 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground truncate">{profile?.companyName || u.displayName || u.email}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email} · Paso {profile?.onboardingStep ?? 0}/5</p>
                          </div>
                          {profile?.industry && (
                            <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 text-[10px] shrink-0">{profile.industry}</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
    </CollapsibleAdminSection>
  );
}

// ─── Plans Management ─────────────────────────────────────────────────────────
interface PlanFeatureCms {
  text: string;
  enabled: boolean;
}

interface CatalogFeatureCms {
  catalogKey: string;
  enabled: boolean;
  value: string;
}

type AnyFeatureCms = PlanFeatureCms | CatalogFeatureCms;

interface BenefitCatalogItem {
  id: number;
  key: string;
  labelTemplate: string;
  hasValue: boolean;
  isAuto: boolean;
  sortOrder: number;
}

interface PlanDescriptionJson {
  description?: string;
  features?: AnyFeatureCms[];
  badge?: string | null;
}

interface PlanRow {
  id: number;
  key: string;
  name: string;
  priceUsd: number;
  priceCop: number;
  priceAnnualUsd: number;
  priceAnnualCop: number;
  computedPriceCop: number;
  computedPriceAnnualCop: number;
  creditsPerMonth: number;
  reelsPerMonth: number;
  businessesAllowed: number;
  durationDays: number;
  extraBusinessPriceUsd: number;
  extraBusinessCredits: number;
  extraBusinessPriceAnnualUsd: number;
  extraBusinessPriceAnnualCop: number;
  computedExtraBusinessPriceCop: number;
  isActive: boolean;
  canDelete: boolean;
  sortOrder: number;
  descriptionJson?: PlanDescriptionJson | null;
  // Plan capability fields (Task #138)
  bulkMaxPosts: number;
  allowedContentTypes: string[];
  includesBusinessPlan: boolean;
  // Task #293: IA integra el elemento
  elementAiEnabled?: boolean;
}

interface CreditPack {
  priceUsd: number;
  priceCop: number;
  credits: number;
  reels: number;
}

interface CreditCosts {
  image: number;
  story: number;
  carousel: number;
  reel: number;
  elementAi: number;
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-zinc-500/20 text-zinc-300",
  starter: "bg-blue-500/20 text-blue-300",
  business: "bg-purple-500/20 text-purple-300",
  agency: "bg-yellow-500/20 text-yellow-300",
};

interface TrashedUser {
  id: number;
  email: string;
  displayName: string;
  plan: string;
  createdAt: string;
  deletedAt: string;
}

function PapeleraSection() {
  const { toast } = useToast();
  const [users, setUsers] = useState<TrashedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await authFetch("/user/admin/users/trash");
      setUsers(data.users ?? []);
    } catch {
      toast({ title: "Error cargando papelera", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function restore(user: TrashedUser) {
    if (!confirm(`¿Restaurar la cuenta de ${user.email}? El usuario podrá volver a iniciar sesión.`)) return;
    setActionId(user.id);
    try {
      await authFetch(`/user/admin/users/${user.id}/restore`, { method: "POST" });
      toast({ title: "Usuario restaurado", description: `${user.email} vuelve a estar activo.` });
      setUsers(u => u.filter(x => x.id !== user.id));
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  }

  async function purge(user: TrashedUser) {
    if (!confirm(`⚠️ ELIMINAR DEFINITIVAMENTE\n\n${user.email}\n\nEsto borrará todos sus datos para siempre. No hay vuelta atrás.\n\n¿Continuar?`)) return;
    setActionId(user.id);
    try {
      await authFetch(`/user/admin/users/${user.id}/purge`, { method: "DELETE" });
      toast({ title: "Usuario eliminado definitivamente", description: `${user.email} fue purgado.` });
      setUsers(u => u.filter(x => x.id !== user.id));
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  }

  function daysLeft(deletedAt: string): number {
    const deleted = new Date(deletedAt).getTime();
    const purgeAt = deleted + 30 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  return (
    <CollapsibleAdminSection
      id="papelera"
      defaultOpen={true}
      title="Papelera de usuarios"
      icon={<Trash2 className="w-4 h-4 text-red-400" />}
      badge={users.length > 0 ? <span className="bg-red-500/20 text-red-400 text-xs font-medium px-1.5 py-0.5 rounded-full">{users.length}</span> : null}
    >
        <div>
          <div className="px-4 py-2 bg-amber-500/5 border-b border-border/40 flex items-center justify-between gap-3">
            <p className="text-xs text-amber-400">
              Los usuarios eliminados conservan todos sus datos durante 30 días. Después se purgan automáticamente.
            </p>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-7 text-xs shrink-0">
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
              La papelera está vacía
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-background/50">
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground uppercase tracking-wide">Usuario</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground uppercase tracking-wide">Plan</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground uppercase tracking-wide">Eliminado el</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground uppercase tracking-wide">Días restantes</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const days = daysLeft(u.deletedAt);
                    const isActing = actionId === u.id;
                    return (
                      <tr key={u.id} className="border-b border-border/20 hover:bg-white/2">
                        <td className="py-2 px-4">
                          <div className="font-medium text-foreground">{u.email}</div>
                          {u.displayName && <div className="text-muted-foreground">{u.displayName}</div>}
                        </td>
                        <td className="py-2 px-4">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PLAN_BADGE[u.plan] ?? "bg-zinc-500/20 text-zinc-300"}`}>
                            {u.plan}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-muted-foreground">
                          {new Date(u.deletedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="py-2 px-4">
                          <span className={`font-semibold ${days <= 5 ? "text-red-400" : days <= 15 ? "text-amber-400" : "text-green-400"}`}>
                            {days}d
                          </span>
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10 border border-green-500/30"
                              onClick={() => restore(u)}
                              disabled={isActing}
                              title="Restaurar usuario"
                            >
                              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                              <span className="ml-1">Restaurar</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30"
                              onClick={() => purge(u)}
                              disabled={isActing}
                              title="Eliminar definitivamente"
                            >
                              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              <span className="ml-1">Purgar</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </CollapsibleAdminSection>
  );
}

function PlansManagement() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<PlanRow>>>({});
  const [creditPack, setCreditPack] = useState<CreditPack>({ priceUsd: 10, priceCop: 0, credits: 30, reels: 2 });
  const [packEdits, setPackEdits] = useState<Partial<CreditPack>>({});
  const [savingPack, setSavingPack] = useState(false);
  const [creditCosts, setCreditCosts] = useState<CreditCosts>({ image: 1, story: 1, carousel: 5, reel: 6, elementAi: 3 });
  const [costsEdits, setCostsEdits] = useState<Partial<CreditCosts>>({});
  const [savingCosts, setSavingCosts] = useState(false);
  const [trm, setTrm] = useState<number | null>(null);
  const [trmFetchedAt, setTrmFetchedAt] = useState<string | null>(null);

  // Benefit catalog state
  const [catalog, setCatalog] = useState<BenefitCatalogItem[]>([]);
  const [editingBenefit, setEditingBenefit] = useState<Partial<BenefitCatalogItem> | null>(null);
  const [newBenefit, setNewBenefit] = useState({ key: "", labelTemplate: "", hasValue: false, isAuto: false, sortOrder: 0 });
  const [savingBenefit, setSavingBenefit] = useState(false);

  async function loadPlans() {
    setLoading(true);
    try {
      const [res, catRes] = await Promise.all([
        authFetch("/admin/plans"),
        authFetch("/admin/benefit-catalog"),
      ]);
      const loadedPlans: PlanRow[] = res.plans ?? [];
      const loadedCatalog: BenefitCatalogItem[] = catRes.catalog ?? [];
      setPlans(loadedPlans);
      setCatalog(loadedCatalog);
      if (res.creditPack) setCreditPack(res.creditPack);
      if (res.creditCosts) setCreditCosts(res.creditCosts);
      if (res.trm) setTrm(res.trm);
      if (res.trmFetchedAt) setTrmFetchedAt(res.trmFetchedAt);
      setEdits({});
      setPackEdits({});
      setCostsEdits({});
      initCmsFromPlans(loadedPlans, loadedCatalog);
    } catch {
      toast({ title: "Error al cargar planes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPlans(); }, []);

  function change(key: string, field: keyof PlanRow, value: string | number | boolean) {
    setEdits(e => ({ ...e, [key]: { ...e[key], [field]: value } }));
  }

  function hasChanges(key: string) {
    return Object.keys(edits[key] ?? {}).length > 0;
  }

  async function savePlan(key: string) {
    setSaving(key);
    try {
      await authFetch(`/admin/plans/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edits[key] ?? {}),
      });
      toast({ title: "✅ Plan guardado" });
      await loadPlans();
    } catch {
      toast({ title: "Error al guardar plan", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function saveCreditPack() {
    setSavingPack(true);
    try {
      await authFetch("/admin/plans/credit-pack/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packEdits),
      });
      toast({ title: "✅ Paquete de créditos actualizado" });
      await loadPlans();
    } catch {
      toast({ title: "Error al guardar paquete", variant: "destructive" });
    } finally {
      setSavingPack(false);
    }
  }

  async function saveCreditCosts() {
    setSavingCosts(true);
    try {
      await authFetch("/admin/plans/credit-costs/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(costsEdits),
      });
      toast({ title: "✅ Costos de generación actualizados" });
      await loadPlans();
    } catch {
      toast({ title: "Error al guardar costos", variant: "destructive" });
    } finally {
      setSavingCosts(false);
    }
  }

  // CMS state — one draft per plan key
  const [cmsEdits, setCmsEdits] = useState<Record<string, PlanDescriptionJson>>({});
  const [savingCms, setSavingCms] = useState<string | null>(null);

  function initCmsFromPlans(loadedPlans: PlanRow[], loadedCatalog: BenefitCatalogItem[]) {
    const init: Record<string, PlanDescriptionJson> = {};
    for (const p of loadedPlans) {
      const existingFeatures = (p.descriptionJson?.features ?? []) as AnyFeatureCms[];
      // Build a map from catalogKey → existing catalog feature state
      const catFeatMap = new Map<string, CatalogFeatureCms>();
      for (const f of existingFeatures) {
        if ("catalogKey" in f) catFeatMap.set(f.catalogKey, f as CatalogFeatureCms);
      }
      // Build checklist: one entry per catalog item, merged with existing data
      const catalogChecklist: CatalogFeatureCms[] = loadedCatalog.map(cat => ({
        catalogKey: cat.key,
        enabled:    catFeatMap.get(cat.key)?.enabled ?? false,
        value:      catFeatMap.get(cat.key)?.value   ?? "",
      }));
      // Preserve legacy { text, enabled } features — they come AFTER the catalog checklist
      const legacyFeatures: PlanFeatureCms[] = existingFeatures.filter(
        (f): f is PlanFeatureCms => !("catalogKey" in f) && "text" in f
      );
      init[p.key] = {
        description: p.descriptionJson?.description ?? "",
        badge:       p.descriptionJson?.badge       ?? "",
        features:    [...catalogChecklist, ...legacyFeatures],
      };
    }
    setCmsEdits(init);
  }

  function cmsChange(key: string, field: keyof PlanDescriptionJson, value: unknown) {
    setCmsEdits(e => ({ ...e, [key]: { ...e[key], [field]: value } }));
  }

  function toggleCatalogFeature(planKey: string, catalogKey: string) {
    setCmsEdits(e => {
      const features = (e[planKey]?.features ?? []).map(f =>
        "catalogKey" in f && f.catalogKey === catalogKey
          ? { ...f, enabled: !f.enabled }
          : f
      );
      return { ...e, [planKey]: { ...e[planKey], features } };
    });
  }

  function setCatalogFeatureValue(planKey: string, catalogKey: string, value: string) {
    setCmsEdits(e => {
      const features = (e[planKey]?.features ?? []).map(f =>
        "catalogKey" in f && f.catalogKey === catalogKey
          ? { ...f, value }
          : f
      );
      return { ...e, [planKey]: { ...e[planKey], features } };
    });
  }

  async function saveCms(key: string) {
    setSavingCms(key);
    try {
      await authFetch(`/admin/plans/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptionJson: cmsEdits[key] }),
      });
      toast({ title: "✅ Beneficios del plan guardados" });
      await loadPlans();
    } catch {
      toast({ title: "Error al guardar beneficios del plan", variant: "destructive" });
    } finally {
      setSavingCms(null);
    }
  }

  // ── Benefit Catalog CRUD ──────────────────────────────────────────────────
  async function createBenefit() {
    if (!newBenefit.key.trim() || !newBenefit.labelTemplate.trim()) {
      toast({ title: "Key y texto son requeridos", variant: "destructive" }); return;
    }
    setSavingBenefit(true);
    try {
      await authFetch("/admin/benefit-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBenefit),
      });
      toast({ title: "✅ Beneficio creado" });
      setNewBenefit({ key: "", labelTemplate: "", hasValue: false, isAuto: false, sortOrder: 0 });
      await loadPlans();
    } catch {
      toast({ title: "Error al crear beneficio", variant: "destructive" });
    } finally {
      setSavingBenefit(false);
    }
  }

  async function updateBenefit() {
    if (!editingBenefit?.id) return;
    setSavingBenefit(true);
    try {
      await authFetch(`/admin/benefit-catalog/${editingBenefit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labelTemplate: editingBenefit.labelTemplate,
          hasValue:      editingBenefit.hasValue,
          isAuto:        editingBenefit.isAuto,
          sortOrder:     editingBenefit.sortOrder,
        }),
      });
      toast({ title: "✅ Beneficio actualizado" });
      setEditingBenefit(null);
      await loadPlans();
    } catch {
      toast({ title: "Error al actualizar beneficio", variant: "destructive" });
    } finally {
      setSavingBenefit(false);
    }
  }

  async function deleteBenefit(id: number) {
    if (!confirm("¿Eliminar este beneficio del catálogo?")) return;
    try {
      await authFetch(`/admin/benefit-catalog/${id}`, { method: "DELETE" });
      toast({ title: "✅ Beneficio eliminado" });
      await loadPlans();
    } catch {
      toast({ title: "Error al eliminar beneficio", variant: "destructive" });
    }
  }

  const displayedPlans = plans.map(p => ({ ...p, ...(edits[p.key] ?? {}) }));
  const displayedPack = { ...creditPack, ...packEdits };
  const displayedCosts = { ...creditCosts, ...costsEdits };
  const packHasChanges = Object.keys(packEdits).length > 0;
  const costsHaveChanges = Object.keys(costsEdits).length > 0;

  const COL_HEADERS = ["Plan", "Nombre", "USD/mes", "COP/mes (auto)", "USD/año", "COP/año (auto)", "Créditos/mes", "Negocios", "Duración (días)", "Activo", ""];

  return (
    <CollapsibleAdminSection
      id="plans-management"
      defaultOpen={true}
      title="Gestión de Planes"
      icon={<CreditCard className="w-4 h-4 text-primary" />}
    >
      <div className="space-y-4 p-4">
      {/* ── Main plans table ── */}
      <CollapsibleAdminSection
        id="plans-planes"
        defaultOpen={true}
        title="Planes y Precios"
        icon={<CreditCard className="w-4 h-4 text-primary" />}
        action={
          <Button variant="outline" size="sm" onClick={loadPlans} disabled={loading} className="ml-2">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      >
        <>{loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-background/50">
                  {COL_HEADERS.map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {displayedPlans.map(plan => (
                  <tr key={plan.key} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-3">
                      <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${PLAN_BADGE[plan.key] ?? "bg-zinc-500/20 text-zinc-300"}`}>
                        {plan.key}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <Input value={plan.name} onChange={e => change(plan.key, "name", e.target.value)} className="h-7 text-xs bg-background/50 w-28" />
                    </td>
                    <td className="py-2 px-3">
                      <Input type="number" value={plan.priceUsd} onChange={e => change(plan.key, "priceUsd", Number(e.target.value))} className="h-7 text-xs bg-background/50 w-20" min={0} step={0.01} />
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-xs font-mono text-emerald-400 whitespace-nowrap" title="Calculado: TRM × USD × 1.05">
                        {plan.computedPriceCop > 0 ? `$${plan.computedPriceCop.toLocaleString("es-CO")}` : "—"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <Input type="number" value={plan.priceAnnualUsd ?? 0} onChange={e => change(plan.key, "priceAnnualUsd", Number(e.target.value))} className="h-7 text-xs bg-background/50 w-20" min={0} step={0.01} placeholder="0" />
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-xs font-mono text-emerald-400 whitespace-nowrap" title="Calculado: TRM × USD anual × 1.05">
                        {plan.computedPriceAnnualCop > 0 ? `$${plan.computedPriceAnnualCop.toLocaleString("es-CO")}` : "—"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <Input type="number" value={plan.creditsPerMonth} onChange={e => change(plan.key, "creditsPerMonth", Number(e.target.value))} className="h-7 text-xs bg-background/50 w-16" min={0} />
                    </td>
                    <td className="py-2 px-3">
                      <Input type="number" value={plan.businessesAllowed} onChange={e => change(plan.key, "businessesAllowed", Number(e.target.value))} className="h-7 text-xs bg-background/50 w-14" min={1} />
                    </td>
                    <td className="py-2 px-3">
                      <Input type="number" value={plan.durationDays} onChange={e => change(plan.key, "durationDays", Number(e.target.value))} className="h-7 text-xs bg-background/50 w-16" min={1} />
                    </td>
                    <td className="py-2 px-3">
                      <input type="checkbox" checked={plan.isActive} onChange={e => change(plan.key, "isActive", e.target.checked)} className="rounded" />
                    </td>
                    <td className="py-2 px-3">
                      {hasChanges(plan.key) && (
                        <Button size="sm" onClick={() => savePlan(plan.key)} disabled={saving === plan.key} className="h-6 text-[10px] px-2 bg-primary hover:bg-primary/90">
                          {saving === plan.key ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : "Guardar"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground space-y-0.5">
          <p>Si aumentás los créditos, los suscriptores activos reciben el beneficio de inmediato. Si los disminuís, los suscriptores actuales conservan sus créditos hasta que renueven.</p>
          <p className="text-emerald-400/80">
            💱 Los precios COP se calculan automáticamente: <strong>TRM{trm ? ` $${trm.toLocaleString("es-CO", { maximumFractionDigits: 2 })}` : ""}</strong> × USD × 1.05
            {trmFetchedAt ? ` — actualizado ${new Date(trmFetchedAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
          <p>* Actualizar también en Wompi si cambia el precio de cobro en USD.</p>
        </div>
        </>
      </CollapsibleAdminSection>

      {/* ── Extra business (agency) + Credit pack ── */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Extra business price for agency */}
          {displayedPlans.filter(p => p.key === "agency").map(plan => (
            <div key="extra-biz" className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300">agency</span>
                <span className="text-sm font-semibold text-foreground">Negocio adicional</span>
              </div>
              <p className="text-xs text-muted-foreground">Precio y créditos por cada negocio extra que la agencia agregue más allá del límite del plan.</p>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Precio mensual</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-28">USD / negocio</label>
                  <Input
                    type="number"
                    value={plan.extraBusinessPriceUsd}
                    onChange={e => change("agency", "extraBusinessPriceUsd", Number(e.target.value))}
                    className="h-7 text-xs bg-background/50 w-24"
                    min={0}
                    step={0.01}
                  />
                </div>
                {plan.computedExtraBusinessPriceCop > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-28">COP / negocio</label>
                    <span className="text-xs font-semibold text-primary">≈ ${plan.computedExtraBusinessPriceCop.toLocaleString("es-CO")}</span>
                    <span className="text-[10px] text-muted-foreground">(TRM × USD × 1.05)</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-28">Créditos incluidos</label>
                  <Input
                    type="number"
                    value={plan.extraBusinessCredits ?? 220}
                    onChange={e => change("agency", "extraBusinessCredits", Number(e.target.value))}
                    className="h-7 text-xs bg-background/50 w-24"
                    min={0}
                    step={10}
                  />
                  <span className="text-xs text-muted-foreground">cr</span>
                </div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Precio anual (negocio extra)</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-28">USD / año</label>
                  <Input
                    type="number"
                    value={plan.extraBusinessPriceAnnualUsd ?? 0}
                    onChange={e => change("agency", "extraBusinessPriceAnnualUsd", Number(e.target.value))}
                    className="h-7 text-xs bg-background/50 w-24"
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-28">COP / año</label>
                  <Input
                    type="number"
                    value={plan.extraBusinessPriceAnnualCop ?? 0}
                    onChange={e => change("agency", "extraBusinessPriceAnnualCop", Number(e.target.value))}
                    className="h-7 text-xs bg-background/50 w-24"
                    min={0}
                    step={1000}
                  />
                </div>
                {hasChanges("agency") && (
                  <Button size="sm" onClick={() => savePlan("agency")} disabled={saving === "agency"} className="h-7 text-xs px-3 bg-primary hover:bg-primary/90">
                    {saving === "agency" ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : "Guardar"}
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* Extra business price for business plan */}
          {displayedPlans.filter(p => p.key === "business").map(plan => (
            <div key="extra-biz-business" className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">business</span>
                <span className="text-sm font-semibold text-foreground">Negocio adicional</span>
              </div>
              <p className="text-xs text-muted-foreground">Precio y créditos por cada negocio extra que el usuario Negocio agregue más allá del límite del plan.</p>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Precio mensual</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-28">USD / negocio</label>
                  <Input
                    type="number"
                    value={plan.extraBusinessPriceUsd}
                    onChange={e => change("business", "extraBusinessPriceUsd", Number(e.target.value))}
                    className="h-7 text-xs bg-background/50 w-24"
                    min={0}
                    step={0.01}
                  />
                </div>
                {plan.computedExtraBusinessPriceCop > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-28">COP / negocio</label>
                    <span className="text-xs font-semibold text-primary">≈ ${plan.computedExtraBusinessPriceCop.toLocaleString("es-CO")}</span>
                    <span className="text-[10px] text-muted-foreground">(TRM × USD × 1.05)</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-28">Créditos incluidos</label>
                  <Input
                    type="number"
                    value={plan.extraBusinessCredits ?? 100}
                    onChange={e => change("business", "extraBusinessCredits", Number(e.target.value))}
                    className="h-7 text-xs bg-background/50 w-24"
                    min={0}
                    step={10}
                  />
                  <span className="text-xs text-muted-foreground">cr</span>
                </div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Precio anual (negocio extra)</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-28">USD / año</label>
                  <Input
                    type="number"
                    value={plan.extraBusinessPriceAnnualUsd ?? 0}
                    onChange={e => change("business", "extraBusinessPriceAnnualUsd", Number(e.target.value))}
                    className="h-7 text-xs bg-background/50 w-24"
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-28">COP / año</label>
                  <Input
                    type="number"
                    value={plan.extraBusinessPriceAnnualCop ?? 0}
                    onChange={e => change("business", "extraBusinessPriceAnnualCop", Number(e.target.value))}
                    className="h-7 text-xs bg-background/50 w-24"
                    min={0}
                    step={1000}
                  />
                </div>
                {hasChanges("business") && (
                  <Button size="sm" onClick={() => savePlan("business")} disabled={saving === "business"} className="h-7 text-xs px-3 bg-primary hover:bg-primary/90">
                    {saving === "business" ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : "Guardar"}
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* Credit pack config */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Paquete de créditos extra</span>
            </div>
            <p className="text-xs text-muted-foreground">Paquete adicional que cualquier usuario puede comprar independientemente de su plan.</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">Precio USD</label>
                <Input
                  type="number"
                  value={displayedPack.priceUsd}
                  onChange={e => setPackEdits(p => ({ ...p, priceUsd: Number(e.target.value) }))}
                  className="h-7 text-xs bg-background/50 w-20"
                  min={0}
                  step={0.01}
                />
              </div>
              {displayedPack.priceCop > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-20">Precio COP</label>
                  <span className="text-xs font-semibold text-primary">≈ ${displayedPack.priceCop.toLocaleString("es-CO")}</span>
                  <span className="text-[10px] text-muted-foreground">(TRM × USD × 1.05)</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">Créditos</label>
                <Input
                  type="number"
                  value={displayedPack.credits}
                  onChange={e => setPackEdits(p => ({ ...p, credits: Number(e.target.value) }))}
                  className="h-7 text-xs bg-background/50 w-20"
                  min={1}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">Reels extra</label>
                <Input
                  type="number"
                  value={displayedPack.reels}
                  onChange={e => setPackEdits(p => ({ ...p, reels: Number(e.target.value) }))}
                  className="h-7 text-xs bg-background/50 w-20"
                  min={0}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                = {displayedPack.credits} créditos + {displayedPack.reels} reels por ${displayedPack.priceUsd}
              </span>
              {packHasChanges && (
                <Button size="sm" onClick={saveCreditPack} disabled={savingPack} className="h-7 text-xs px-3 bg-primary hover:bg-primary/90">
                  {savingPack ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : "Guardar"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Plan capability restrictions ── */}
      {!loading && (
        <CollapsibleAdminSection
          id="plans-restricciones"
          defaultOpen={true}
          title="Restricciones por plan"
          icon={<Settings className="w-4 h-4 text-primary" />}
        >
          <><p className="text-xs text-muted-foreground">
            Límite de posts en generación masiva y tipos de contenido permitidos por plan.
            <strong className="text-foreground"> 0 = generación masiva deshabilitada. 999 = sin límite.</strong>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/50">
                  <th className="py-1 pr-4 font-medium">Plan</th>
                  <th className="py-1 pr-4 font-medium text-center">Bulk max posts</th>
                  <th className="py-1 pr-4 font-medium">Tipos permitidos</th>
                  <th className="py-1 font-medium text-center">Hereda Negocio</th>
                  <th className="py-1 font-medium text-center">IA Elemento</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {displayedPlans.map(plan => {
                  const planEdit = edits[plan.key] ?? {};
                  const bulkVal = planEdit.bulkMaxPosts !== undefined ? planEdit.bulkMaxPosts : plan.bulkMaxPosts;
                  const allowedTypes: string[] = planEdit.allowedContentTypes !== undefined ? planEdit.allowedContentTypes : (plan.allowedContentTypes ?? ["image", "story"]);
                  const inherits: boolean = planEdit.includesBusinessPlan !== undefined ? planEdit.includesBusinessPlan : plan.includesBusinessPlan;
                  const elementAiOn: boolean = planEdit.elementAiEnabled !== undefined ? planEdit.elementAiEnabled : (plan.elementAiEnabled ?? false);
                  const TYPES = ["image", "story", "carousel", "reel"];
                  const LABELS: Record<string, string> = { image: "Img", story: "Story", carousel: "Carrusel", reel: "Reel" };
                  return (
                    <tr key={plan.key} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-4">
                        <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${PLAN_BADGE[plan.key] ?? ""}`}>{plan.key}</span>
                      </td>
                      <td className="py-2 pr-4 text-center">
                        <Input
                          type="number"
                          value={bulkVal}
                          onChange={e => change(plan.key, "bulkMaxPosts", Number(e.target.value))}
                          className="h-7 text-xs bg-background/50 w-20 mx-auto text-center"
                          min={0}
                          max={999}
                          step={1}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {TYPES.map(t => {
                            const enabled = allowedTypes.includes(t);
                            return (
                              <button
                                key={t}
                                onClick={() => {
                                  const next = enabled
                                    ? allowedTypes.filter(x => x !== t)
                                    : [...allowedTypes, t];
                                  setEdits(e => ({ ...e, [plan.key]: { ...e[plan.key], allowedContentTypes: next } }));
                                }}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${enabled ? "bg-primary/20 border-primary/50 text-primary" : "bg-muted/30 border-border text-muted-foreground"}`}
                              >
                                {LABELS[t]}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-center">
                        {plan.key === "agency" ? (
                          <button
                            onClick={() => change(plan.key, "includesBusinessPlan", !inherits)}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${inherits ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "bg-muted/30 border-border text-muted-foreground"}`}
                          >
                            {inherits ? "Sí" : "No"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-center">
                        <button
                          onClick={() => change(plan.key, "elementAiEnabled", !elementAiOn)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${elementAiOn ? "bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300" : "bg-muted/30 border-border text-muted-foreground"}`}
                        >
                          {elementAiOn ? "Sí" : "No"}
                        </button>
                      </td>
                      <td className="py-2">
                        {hasChanges(plan.key) && (
                          <Button size="sm" onClick={() => savePlan(plan.key)} disabled={saving === plan.key} className="h-6 text-[10px] px-2">
                            {saving === plan.key ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : "Guardar"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        </CollapsibleAdminSection>
      )}

      {/* ── Credit costs per content type ── */}
      {!loading && (
        <CollapsibleAdminSection
          id="plans-costos"
          defaultOpen={true}
          title="Costos de Generación (créditos)"
          icon={<CreditCard className="w-4 h-4 text-primary" />}
        >
          <><p className="text-xs text-muted-foreground">
            Cuántos créditos se descuentan por cada tipo de publicación generada. Los cambios aplican de inmediato a todas las generaciones nuevas.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(["image", "story", "carousel", "reel", "elementAi"] as const).map((type) => {
              const labels: Record<string, string> = { image: "Imagen", story: "Historia", carousel: "Carrusel", reel: "Reel", elementAi: "IA + Elemento" };
              return (
                <div key={type} className="space-y-1">
                  <label className="text-xs text-muted-foreground block">{labels[type]}</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={displayedCosts[type]}
                      onChange={e => setCostsEdits(c => ({ ...c, [type]: Number(e.target.value) }))}
                      className="h-7 text-xs bg-background/50 w-16"
                      min={1}
                      step={1}
                    />
                    <span className="text-xs text-muted-foreground">cr</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">
              Referencia: Imagen={displayedCosts.image}cr · Historia={displayedCosts.story}cr · Carrusel={displayedCosts.carousel}cr · Reel={displayedCosts.reel}cr · IA+Elem={displayedCosts.elementAi}cr
            </span>
            {costsHaveChanges && (
              <Button size="sm" onClick={saveCreditCosts} disabled={savingCosts} className="h-7 text-xs px-3 bg-primary hover:bg-primary/90">
                {savingCosts ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : "Guardar"}
              </Button>
            )}
          </div>
          </>
        </CollapsibleAdminSection>
      )}

      {/* ── Catálogo de Beneficios ── */}
      {!loading && (
        <CollapsibleAdminSection
          id="plans-catalogo"
          defaultOpen={true}
          title="Catálogo de Beneficios"
          icon={<Tag className="w-4 h-4 text-primary" />}
        >
          <>{/* Catalog table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-background/30">
                  <th className="text-center px-4 py-2 text-muted-foreground font-medium w-10">ID</th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">Key</th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">Texto template</th>
                  <th className="text-center px-4 py-2 text-muted-foreground font-medium">Tiene valor</th>
                  <th className="text-center px-4 py-2 text-muted-foreground font-medium">Auto</th>
                  <th className="text-center px-4 py-2 text-muted-foreground font-medium">Orden</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {catalog.map(cat => (
                  <tr key={cat.id} className="border-b border-border/30 hover:bg-background/20 transition-colors">
                    {editingBenefit?.id === cat.id ? (
                      <>
                        <td className="px-4 py-2 text-center text-muted-foreground/60 font-mono">{cat.id}</td>
                        <td className="px-4 py-2 font-mono text-primary/80">{cat.key}</td>
                        <td className="px-4 py-2">
                          <input
                            value={editingBenefit.labelTemplate ?? ""}
                            onChange={e => setEditingBenefit(b => ({ ...b!, labelTemplate: e.target.value }))}
                            className="w-full text-xs bg-background/50 border border-primary/40 rounded px-2 py-1 focus:outline-none focus:border-primary/60"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => setEditingBenefit(b => ({ ...b!, hasValue: !b!.hasValue }))}
                            className={`w-5 h-5 rounded border flex items-center justify-center mx-auto transition-colors ${editingBenefit.hasValue ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background/50"}`}
                          >
                            {editingBenefit.hasValue && <Check className="w-3 h-3" />}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => setEditingBenefit(b => ({ ...b!, isAuto: !b!.isAuto }))}
                            className={`w-5 h-5 rounded border flex items-center justify-center mx-auto transition-colors ${editingBenefit.isAuto ? "bg-amber-500/80 border-amber-500 text-white" : "border-border bg-background/50"}`}
                          >
                            {editingBenefit.isAuto && <Check className="w-3 h-3" />}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number"
                            value={editingBenefit.sortOrder ?? 0}
                            onChange={e => setEditingBenefit(b => ({ ...b!, sortOrder: Number(e.target.value) }))}
                            className="w-16 text-center text-xs bg-background/50 border border-border/50 rounded px-2 py-1 focus:outline-none focus:border-primary/60"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="sm" onClick={updateBenefit} disabled={savingBenefit} className="h-6 text-[10px] px-2 bg-primary hover:bg-primary/90">
                              {savingBenefit ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : "Guardar"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingBenefit(null)} className="h-6 text-[10px] px-2">
                              Cancelar
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-center text-muted-foreground/60 font-mono">{cat.id}</td>
                        <td className="px-4 py-2 font-mono text-primary/80">{cat.key}</td>
                        <td className="px-4 py-2 text-foreground/80">{cat.labelTemplate}</td>
                        <td className="px-4 py-2 text-center">{cat.hasValue ? <span className="text-green-400">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2 text-center">{cat.isAuto ? <span className="text-amber-400">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2 text-center text-muted-foreground">{cat.sortOrder}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => setEditingBenefit({ ...cat })} className="text-muted-foreground hover:text-primary transition-colors" title="Editar">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteBenefit(cat.id)} className="text-muted-foreground hover:text-red-400 transition-colors" title="Eliminar">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}

                {/* Add new benefit row */}
                <tr className="border-t border-border/50 bg-background/10">
                  <td className="px-4 py-2 text-center text-muted-foreground/40 text-[10px]">nuevo</td>
                  <td className="px-4 py-2">
                    <input
                      value={newBenefit.key}
                      onChange={e => setNewBenefit(b => ({ ...b, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                      placeholder="mi_beneficio"
                      className="w-full text-xs font-mono bg-background/50 border border-border/50 rounded px-2 py-1 focus:outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={newBenefit.labelTemplate}
                      onChange={e => setNewBenefit(b => ({ ...b, labelTemplate: e.target.value }))}
                      placeholder='Texto con {value} opcional'
                      className="w-full text-xs bg-background/50 border border-border/50 rounded px-2 py-1 focus:outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setNewBenefit(b => ({ ...b, hasValue: !b.hasValue }))}
                      className={`w-5 h-5 rounded border flex items-center justify-center mx-auto transition-colors ${newBenefit.hasValue ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background/50"}`}
                    >
                      {newBenefit.hasValue && <Check className="w-3 h-3" />}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setNewBenefit(b => ({ ...b, isAuto: !b.isAuto }))}
                      className={`w-5 h-5 rounded border flex items-center justify-center mx-auto transition-colors ${newBenefit.isAuto ? "bg-amber-500/80 border-amber-500 text-white" : "border-border bg-background/50"}`}
                    >
                      {newBenefit.isAuto && <Check className="w-3 h-3" />}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      value={newBenefit.sortOrder}
                      onChange={e => setNewBenefit(b => ({ ...b, sortOrder: Number(e.target.value) }))}
                      className="w-16 text-center text-xs bg-background/50 border border-border/50 rounded px-2 py-1 focus:outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Button
                      size="sm"
                      onClick={createBenefit}
                      disabled={savingBenefit || !newBenefit.key || !newBenefit.labelTemplate}
                      className="h-6 text-[10px] px-2 bg-primary hover:bg-primary/90 whitespace-nowrap"
                    >
                      {savingBenefit ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <><Plus className="w-2.5 h-2.5 mr-1" />Agregar</>}
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          </>
        </CollapsibleAdminSection>
      )}

      {/* ── CMS de Planes — Descripción y beneficios ── */}
      {!loading && plans.length > 0 && (
        <CollapsibleAdminSection
          id="plans-cms"
          defaultOpen={true}
          title="CMS de Planes — Descripciones y Beneficios"
          icon={<ClipboardList className="w-4 h-4 text-primary" />}
        >
          <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            {plans.map(plan => {
              const cms = cmsEdits[plan.key] ?? {};
              const features = cms.features ?? [];
              return (
                <div key={plan.key} className="border border-border/50 rounded-lg p-4 space-y-3 bg-background/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${PLAN_BADGE[plan.key] ?? "bg-zinc-500/20 text-zinc-300"}`}>
                      {plan.key}
                    </span>
                    <span className="text-sm font-medium text-foreground">{plan.name}</span>
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Descripción corta</label>
                    <Input
                      value={cms.description ?? ""}
                      onChange={e => cmsChange(plan.key, "description", e.target.value)}
                      placeholder="Para comenzar sin costo"
                      className="h-8 text-xs bg-background/50"
                    />
                  </div>

                  {/* Badge */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Badge (opcional, ej: "Más popular")</label>
                    <Input
                      value={cms.badge ?? ""}
                      onChange={e => cmsChange(plan.key, "badge", e.target.value || null)}
                      placeholder="Más popular"
                      className="h-8 text-xs bg-background/50"
                    />
                  </div>

                  {/* Catalog checklist */}
                  {(() => {
                    const catalogFeats = features.filter(f => "catalogKey" in f) as CatalogFeatureCms[];
                    const legacyFeats  = features.filter(f => "text" in f)       as PlanFeatureCms[];

                    // Inherited benefits: when agency plan has includes_business_plan=true,
                    // show Business plan's enabled catalog features as read-only inherited items.
                    const showInheritance = plan.key === "agency" && plan.includesBusinessPlan;
                    const businessCmsFeats = showInheritance
                      ? ((cmsEdits["business"]?.features ?? []).filter(f => "catalogKey" in f) as CatalogFeatureCms[])
                      : [];
                    // isAuto=true features are NEVER inherited — their value is plan-specific
                    const inheritedKeys = new Set(businessCmsFeats.filter(f => f.enabled && !catalog.find(c => c.key === f.catalogKey)?.isAuto).map(f => f.catalogKey));

                    return (
                      <>
                        {/* Inherited benefits banner */}
                        {showInheritance && inheritedKeys.size > 0 && (
                          <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide">Beneficios heredados del plan Negocio</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/40">{inheritedKeys.size} items</span>
                            </div>
                            <div className="space-y-1">
                              {catalog.filter(cat => inheritedKeys.has(cat.key)).map(cat => {
                                const bizFeat = businessCmsFeats.find(f => f.catalogKey === cat.key);
                                const val = bizFeat?.value ?? "";
                                const autoHint = cat.isAuto
                                  ? ({ ai_credits: String(plans.find(p => p.key === "business")?.creditsPerMonth ?? ""), reels_per_month: String(plans.find(p => p.key === "business")?.reelsPerMonth ?? ""), businesses: String(plans.find(p => p.key === "business")?.businessesAllowed ?? "") })[cat.key] ?? val
                                  : null;
                                const displayVal = cat.isAuto ? ((autoHint ?? val) || "…") : (val || "…");
                                const label = cat.hasValue ? cat.labelTemplate.replace("{value}", displayVal) : cat.labelTemplate;
                                return (
                                  <div key={cat.key} className="flex items-center gap-2 text-xs text-violet-300/80">
                                    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                      <Check className="w-3 h-3 text-violet-400" />
                                    </span>
                                    <span>{label}</span>
                                    <span className="text-[9px] text-violet-400/60 ml-auto whitespace-nowrap">del plan Negocio</span>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-violet-400/60">Gestiona estos beneficios editando el plan Negocio.</p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Beneficios del catálogo ({catalogFeats.filter(f => f.enabled).length}/{catalog.length} activos)
                            {showInheritance && <span className="ml-1 text-violet-400/70 normal-case">+ {inheritedKeys.size} heredados</span>}
                          </label>
                          {catalog.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">Agrega beneficios en el Catálogo para seleccionarlos aquí.</p>
                          ) : (
                            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                              {catalog.map(cat => {
                                const feat      = catalogFeats.find(f => f.catalogKey === cat.key);
                                const isEnabled = feat?.enabled ?? false;
                                const isInherited = showInheritance && inheritedKeys.has(cat.key) && !cat.isAuto;
                                const val       = feat?.value ?? "";
                                // is_auto items show the plan's own field value as a hint
                                const autoHint  = cat.isAuto
                                  ? ({ ai_credits: String(plan.creditsPerMonth), reels_per_month: String(plan.reelsPerMonth), businesses: String(plan.businessesAllowed) })[cat.key] ?? val
                                  : null;
                                const displayVal = cat.isAuto ? ((autoHint ?? val) || "…") : (val || "…");
                                const label      = cat.hasValue ? cat.labelTemplate.replace("{value}", displayVal) : cat.labelTemplate;
                                return (
                                  <div key={cat.key} className={`flex items-start gap-2 ${isInherited ? "opacity-50" : ""}`}>
                                    <button
                                      onClick={() => !isInherited && toggleCatalogFeature(plan.key, cat.key)}
                                      disabled={isInherited}
                                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                        isInherited
                                          ? "border-violet-500/50 bg-violet-500/20 cursor-not-allowed"
                                          : isEnabled
                                            ? "bg-primary border-primary text-primary-foreground"
                                            : "border-border bg-background/50"
                                      }`}
                                      title={isInherited ? "Heredado del plan Negocio" : isEnabled ? "Desactivar" : "Activar"}
                                    >
                                      {(isEnabled || isInherited) && <Check className={`w-2.5 h-2.5 ${isInherited ? "text-violet-400" : ""}`} />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-xs transition-opacity ${!isEnabled && !isInherited ? "opacity-40 line-through" : ""}`}>
                                        {label}
                                        {cat.isAuto && <span className="ml-1 text-[10px] text-amber-400/70">(auto del plan)</span>}
                                        {isInherited && <span className="ml-1 text-[10px] text-violet-400/70">(heredado)</span>}
                                      </div>
                                      {cat.hasValue && !cat.isAuto && isEnabled && !isInherited && (
                                        <input
                                          value={val}
                                          onChange={e => setCatalogFeatureValue(plan.key, cat.key, e.target.value)}
                                          placeholder="Valor (ej: 120)"
                                          className="mt-1 w-full text-xs bg-background/50 border border-border/50 rounded px-2 py-0.5 focus:outline-none focus:border-primary/60 transition-colors"
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Legacy features (free-text, preserved during migration) */}
                        {legacyFeats.length > 0 && (
                          <div className="space-y-1 pt-2 border-t border-border/30">
                            <label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">
                              Texto libre (legacy — {legacyFeats.length})
                            </label>
                            {legacyFeats.map((f, li) => {
                              const globalIdx = features.indexOf(f);
                              return (
                                <div key={li} className="flex items-center gap-2 opacity-70">
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">{f.text}</span>
                                  <button
                                    onClick={() => {
                                      setCmsEdits(e => {
                                        const feats = [...(e[plan.key]?.features ?? [])];
                                        feats.splice(globalIdx, 1);
                                        return { ...e, [plan.key]: { ...e[plan.key], features: feats } };
                                      });
                                    }}
                                    className="text-red-400/60 hover:text-red-400 transition-colors flex-shrink-0"
                                    title="Eliminar feature legacy"
                                  >
                                    <XIcon className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <Button
                    size="sm"
                    onClick={() => saveCms(plan.key)}
                    disabled={savingCms === plan.key}
                    className="h-8 text-xs w-full bg-primary hover:bg-primary/90"
                  >
                    {savingCms === plan.key ? (
                      <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Guardando…</>
                    ) : (
                      "Guardar cambios del plan"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </CollapsibleAdminSection>
      )}

      {/* ── Business isolation note ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground mb-1">Aislamiento total por negocio</p>
            <p className="text-xs text-muted-foreground">
              Cada negocio tiene sus propios posts, nichos, analíticas y contexto de IA. Al cambiar de negocio,
              la IA reinicia su contexto y trabaja exclusivamente con los datos de ese negocio.
              Nunca se mezclan datos entre negocios del mismo usuario.
            </p>
          </div>
        </div>
      </div>
      </div>
    </CollapsibleAdminSection>
  );
}

// ─── Cost / Revenue Analysis ───────────────────────────────────────────────────
const COST_ROWS = [
  { clients: 10,      label: "10 clientes" },
  { clients: 100,     label: "100 clientes" },
  { clients: 1000,    label: "1 K clientes" },
  { clients: 10000,   label: "10 K clientes" },
  { clients: 100000,  label: "100 K clientes" },
];

// Cost assumptions (USD/month)
const OPENAI_COST_PER_CLIENT   = 0.85;  // avg DALL-E + GPT per client/month
const INFRA_FIXED              = 80;    // server, DB, storage (fixed base)
const INFRA_PER_CLIENT         = 0.02; // incremental per client
const SUPPORT_PER_CLIENT       = 0.10;
const PAYMENT_FEE_RATE         = 0.034; // 3.4% Wompi fee

// Revenue mix assumption: 60% free (revenue $0), 25% starter, 10% business, 5% agency
const PLAN_MIX = { free: 0.60, starter: 0.25, business: 0.10, agency: 0.05 };
const PLAN_PRICE = { free: 0, starter: 29.99, business: 49.99, agency: 149.99 };

function calcRow(clients: number) {
  const paying   = clients * (1 - PLAN_MIX.free);
  const avgPrice = PLAN_PRICE.starter * PLAN_MIX.starter + PLAN_PRICE.business * PLAN_MIX.business + PLAN_PRICE.agency * PLAN_MIX.agency;
  const grossRevenue = paying * (avgPrice / (1 - PLAN_MIX.free)); // adjust for mix

  const aiCost      = clients * OPENAI_COST_PER_CLIENT;
  const infraCost   = INFRA_FIXED + clients * INFRA_PER_CLIENT;
  const supportCost = paying * SUPPORT_PER_CLIENT;
  const paymentFees = grossRevenue * PAYMENT_FEE_RATE;
  const totalCost   = aiCost + infraCost + supportCost + paymentFees;
  const netProfit   = grossRevenue - totalCost;
  const margin      = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
  return { clients, grossRevenue, aiCost, infraCost, supportCost, paymentFees, totalCost, netProfit, margin };
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)    return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function CostAnalysis() {
  const rows = COST_ROWS.map(r => calcRow(r.clients));
  return (
    <CollapsibleAdminSection
      id="cost-analysis"
      defaultOpen={true}
      title="Análisis de Costos y Ganancias"
      icon={<Factory className="w-4 h-4 text-amber-400" />}
      badge={<span className="text-xs text-muted-foreground">(proyección USD/mes)</span>}
    >
      <><div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40 bg-background/50">
              {["Clientes", "Ingresos brutos", "Costo IA", "Infraestructura", "Soporte", "Fees pago", "Costo total", "Ganancia neta", "Margen %"].map(h => (
                <th key={h} className="text-right first:text-left py-2 px-3 font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {rows.map(r => (
              <tr key={r.clients} className="hover:bg-muted/20 transition-colors">
                <td className="py-2.5 px-3 font-semibold text-foreground whitespace-nowrap">{r.clients.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-green-400 font-semibold">{fmt(r.grossRevenue)}</td>
                <td className="py-2.5 px-3 text-right text-orange-400">{fmt(r.aiCost)}</td>
                <td className="py-2.5 px-3 text-right text-blue-400">{fmt(r.infraCost)}</td>
                <td className="py-2.5 px-3 text-right text-muted-foreground">{fmt(r.supportCost)}</td>
                <td className="py-2.5 px-3 text-right text-muted-foreground">{fmt(r.paymentFees)}</td>
                <td className="py-2.5 px-3 text-right text-red-400 font-semibold">{fmt(r.totalCost)}</td>
                <td className={`py-2.5 px-3 text-right font-bold ${r.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(r.netProfit)}</td>
                <td className={`py-2.5 px-3 text-right font-semibold ${r.margin >= 40 ? "text-green-400" : r.margin >= 10 ? "text-amber-400" : "text-red-400"}`}>{r.margin.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-border/50 text-[10px] text-muted-foreground space-y-0.5">
        <p>* Mix de planes asumido: 60% gratis, 25% Emprendedor, 10% Negocio, 5% Agencia.</p>
        <p>* Costo IA: ~$0.85/cliente/mes (DALL-E 3 + GPT-4o estimado según uso promedio).</p>
        <p>* Infraestructura: $80 base fija + $0.02/cliente incremental.</p>
        <p>* Fees de pago: 3.4% Wompi sobre ingresos de planes pagos.</p>
      </div></>
    </CollapsibleAdminSection>
  );
}
// ──────────────────────────────────────────────────────────────────────────────

interface AffiliateRow {
  id: number;
  user_id: number;
  name: string;
  email: string;
  social_url: string | null;
  audience_size: string | null;
  description: string | null;
  status: string;
  commission_pct: number;
  duration_months: number;
  affiliate_code: string | null;
  conversions: number;
  created_at: string;
}

// ── Configuración global del programa de afiliados ──────────────────────────
interface AffiliateGlobalConfig {
  default_commission_pct: number;
  default_duration_months: number;
  min_payout_usd: number;
  is_program_open: boolean;
  program_description: string;
}

function AffiliateGlobalSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<AffiliateGlobalConfig>({
    default_commission_pct: 20,
    default_duration_months: 6,
    min_payout_usd: 50,
    is_program_open: true,
    program_description: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const r = await fetch(`${BASE}/api/admin/affiliate-settings`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setConfig({
          default_commission_pct: Number(d.default_commission_pct ?? 20),
          default_duration_months: Number(d.default_duration_months ?? 6),
          min_payout_usd: Number(d.min_payout_usd ?? 50),
          is_program_open: d.is_program_open !== false,
          program_description: d.program_description ?? "",
        });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/admin/affiliate-settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: "✓ Configuración guardada" });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleAdminSection
      id="affiliate-settings"
      defaultOpen={false}
      title="Configuración del programa de afiliados"
      icon={<Settings className="w-4 h-4 text-primary" />}
      badge={<span className="text-xs text-muted-foreground">({config.default_commission_pct}% · {config.default_duration_months} meses · pago mín ${config.min_payout_usd})</span>}
    >
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">% Comisión por defecto</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min={1} max={100}
                      value={config.default_commission_pct}
                      onChange={e => setConfig(c => ({ ...c, default_commission_pct: Number(e.target.value) }))}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Meses por defecto</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min={1} max={60}
                      value={config.default_duration_months}
                      onChange={e => setConfig(c => ({ ...c, default_duration_months: Number(e.target.value) }))}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">meses</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Pago mínimo</label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">$</span>
                    <Input
                      type="number" min={0}
                      value={config.min_payout_usd}
                      onChange={e => setConfig(c => ({ ...c, min_payout_usd: Number(e.target.value) }))}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">USD</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Descripción del programa (visible para afiliados)</label>
                <Textarea
                  rows={2}
                  value={config.program_description}
                  onChange={e => setConfig(c => ({ ...c, program_description: e.target.value }))}
                  placeholder="Ej: Gana 20% de comisión por cada cliente que traigas durante 6 meses..."
                  className="text-xs"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConfig(c => ({ ...c, is_program_open: !c.is_program_open }))}
                  className={`relative w-9 h-5 rounded-full border transition-all flex-shrink-0 ${config.is_program_open ? "bg-primary border-primary" : "bg-muted border-border"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${config.is_program_open ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className="text-xs text-muted-foreground">
                  Programa {config.is_program_open ? <span className="text-green-400">abierto</span> : <span className="text-red-400">cerrado</span>} — {config.is_program_open ? "se aceptan nuevas solicitudes" : "no se aceptan nuevas solicitudes"}
                </span>
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs">
                  {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                  Guardar configuración
                </Button>
              </div>
            </>
          )}
        </div>
    </CollapsibleAdminSection>
  );
}

function AffiliatesManagement() {
  const { toast } = useToast();
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<number | null>(null);
  const [form, setForm] = useState<Record<number, { commission_pct: string; duration_months: string; affiliate_code: string }>>({});
  const [globalPct, setGlobalPct] = useState("20");
  const [globalMonths, setGlobalMonths] = useState("6");

  async function load() {
    setLoading(true);
    try {
      const [affiliatesRes, settingsRes] = await Promise.all([
        fetch(`${BASE}/api/admin/affiliates`, { credentials: "include" }),
        fetch(`${BASE}/api/admin/affiliate-settings`, { credentials: "include" }),
      ]);
      const d = await affiliatesRes.json();
      setAffiliates(d.affiliates ?? []);
      if (settingsRes.ok) {
        const s = await settingsRes.json() as { default_commission_pct?: number; default_duration_months?: number };
        setGlobalPct(String(s.default_commission_pct ?? 20));
        setGlobalMonths(String(s.default_duration_months ?? 6));
      }
    } catch {
      toast({ title: "Error cargando afiliados", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function getForm(id: number, row: AffiliateRow) {
    return form[id] ?? {
      commission_pct: row.commission_pct != null ? String(row.commission_pct) : globalPct,
      duration_months: row.duration_months != null ? String(row.duration_months) : globalMonths,
      affiliate_code: row.affiliate_code ?? "",
    };
  }

  function setField(id: number, row: AffiliateRow, field: string, value: string) {
    setForm(prev => ({ ...prev, [id]: { ...getForm(id, row), [field]: value } }));
  }

  async function handleAction(id: number, action: "approve" | "reject", row: AffiliateRow) {
    setApproving(id);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "approve") {
        const f = getForm(id, row);
        body.commission_pct = Number(f.commission_pct);
        body.duration_months = Number(f.duration_months);
        body.affiliate_code = f.affiliate_code.trim() || undefined;
      }
      const r = await fetch(`${BASE}/api/admin/affiliates/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: action === "approve" ? `✓ Aprobado — código: ${d.affiliate_code}` : "Rechazado" });
      load();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setApproving(null);
    }
  }

  const pending = affiliates.filter(a => a.status === "pending");
  const approved = affiliates.filter(a => a.status === "approved");
  const rejected = affiliates.filter(a => a.status === "rejected");

  const STATUS_BADGE: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    approved: "bg-green-500/15 text-green-400 border-green-500/30",
    rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  return (
    <CollapsibleAdminSection
      id="affiliates-mgmt"
      defaultOpen={true}
      title="Afiliados"
      icon={<Handshake className="w-4 h-4 text-primary" />}
      badge={<span className="text-xs text-muted-foreground">({pending.length} pendientes · {approved.length} aprobados)</span>}
      action={<Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /></Button>}
    >
      {loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : affiliates.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">No hay solicitudes aún</div>
      ) : (
        <div className="divide-y divide-border/30">
          {affiliates.map(row => {
            const f = getForm(row.id, row);
            const busy = approving === row.id;
            return (
              <div key={row.id} className="px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-sm text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                    {row.social_url && <a href={row.social_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{row.social_url}</a>}
                    {row.audience_size && <p className="text-xs text-muted-foreground">Audiencia: {row.audience_size}</p>}
                    {row.description && <p className="text-xs text-muted-foreground mt-1 italic">"{row.description}"</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[row.status] ?? ""}`}>
                      {row.status === "pending" ? "Pendiente" : row.status === "approved" ? "Aprobado" : "Rechazado"}
                    </span>
                    {row.status === "approved" && <span className="text-xs text-muted-foreground">{row.conversions} conversiones</span>}
                  </div>
                </div>

                {/* Approval form — always visible for editing approved affiliates too */}
                {row.status !== "rejected" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-background/40 rounded-lg p-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">% Comisión</label>
                      <Input
                        type="number" min={1} max={100} value={f.commission_pct}
                        onChange={e => setField(row.id, row, "commission_pct", e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Meses duración</label>
                      <Input
                        type="number" min={1} max={60} value={f.duration_months}
                        onChange={e => setField(row.id, row, "duration_months", e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Código personalizado</label>
                      <Input
                        placeholder="ej: JUANPA30 (auto si vacío)"
                        value={f.affiliate_code}
                        onChange={e => setField(row.id, row, "affiliate_code", e.target.value.toUpperCase())}
                        className="h-7 text-xs font-mono"
                        maxLength={20}
                      />
                    </div>
                  </div>
                )}

                {row.status === "approved" && row.affiliate_code && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Código activo:</span>
                    <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">{row.affiliate_code}</span>
                    <span className="text-xs text-muted-foreground">{row.commission_pct}% · {row.duration_months} meses</span>
                  </div>
                )}

                {row.status !== "rejected" && (
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" disabled={busy}
                      onClick={() => handleAction(row.id, "approve", row)}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {row.status === "approved" ? "Actualizar" : "Aprobar"}
                    </Button>
                    {row.status === "pending" && (
                      <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busy}
                        onClick={() => handleAction(row.id, "reject", row)}>
                        <AlertCircle className="w-3 h-3 mr-1" /> Rechazar
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleAdminSection>
  );
}

// ── Códigos de Afiliado (Admin-created) ───────────────────────────────────────
interface AffiliateCodeRecord {
  id: number;
  code: string;
  commission_pct: number;
  duration_months: number;
  email: string;
  notes: string | null;
  is_active: boolean;
  is_expired: boolean;
  created_at: string;
  conversions: number;
  total_commission_usd: number | null;
}

interface AffiliateConversionRecord {
  id: number;
  user_id: number;
  user_email: string;
  user_name: string;
  plan: string;
  amount_usd: number | null;
  commission_usd: number | null;
  registered_at: string;
}

function AffiliateCodesManagement() {
  const { toast } = useToast();
  const [codes, setCodes] = useState<AffiliateCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [defaultPct, setDefaultPct] = useState("20");
  const [defaultMonths, setDefaultMonths] = useState("6");
  const [form, setForm] = useState({ code: "", commission_pct: "20", duration_months: "6", email: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<AffiliateCodeRecord>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [conversions, setConversions] = useState<Record<number, AffiliateConversionRecord[]>>({});
  const [loadingConv, setLoadingConv] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [codesRes, settingsRes] = await Promise.all([
        fetch(`${BASE}/api/admin/affiliate-codes`, { credentials: "include" }),
        fetch(`${BASE}/api/admin/affiliate-settings`, { credentials: "include" }),
      ]);
      const d = await codesRes.json();
      setCodes(Array.isArray(d) ? d : []);
      if (settingsRes.ok) {
        const s = await settingsRes.json() as { default_commission_pct?: number; default_duration_months?: number };
        const pct = String(s.default_commission_pct ?? 20);
        const months = String(s.default_duration_months ?? 6);
        setDefaultPct(pct);
        setDefaultMonths(months);
        setForm(prev => ({ ...prev, commission_pct: pct, duration_months: months }));
      }
    } catch {
      toast({ title: "Error cargando códigos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.code || !form.email) {
      toast({ title: "Código y email son requeridos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/admin/affiliate-codes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          commission_pct: Number(form.commission_pct),
          duration_months: Number(form.duration_months),
          email: form.email,
          notes: form.notes || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: `Código ${d.code} creado` });
      setForm({ code: "", commission_pct: defaultPct, duration_months: defaultMonths, email: "", notes: "" });
      setShowCreate(false);
      load();
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Error al crear código", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/admin/affiliate-codes/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: "Código actualizado" });
      setEditId(null);
      load();
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Error al actualizar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(row: AffiliateCodeRecord) {
    try {
      const r = await fetch(`${BASE}/api/admin/affiliate-codes/${row.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commission_pct: row.commission_pct,
          duration_months: row.duration_months,
          email: row.email,
          notes: row.notes,
          is_active: !row.is_active,
        }),
      });
      if (!r.ok) throw new Error();
      load();
    } catch {
      toast({ title: "Error al cambiar estado", variant: "destructive" });
    }
  }

  async function handleDelete(id: number, code: string) {
    if (!confirm(`¿Eliminar el código "${code}"? Esta acción no se puede deshacer.`)) return;
    try {
      const r = await fetch(`${BASE}/api/admin/affiliate-codes/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error();
      toast({ title: `Código ${code} eliminado` });
      load();
    } catch {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  }

  async function loadConversions(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (conversions[id]) return;
    setLoadingConv(id);
    try {
      const r = await fetch(`${BASE}/api/admin/affiliate-codes/${id}/conversions`, { credentials: "include" });
      const d = await r.json();
      setConversions(prev => ({ ...prev, [id]: Array.isArray(d) ? d : [] }));
    } catch {
      toast({ title: "Error cargando conversiones", variant: "destructive" });
    } finally {
      setLoadingConv(null);
    }
  }

  return (
    <CollapsibleAdminSection
      id="affiliate-codes"
      defaultOpen={false}
      title="Códigos de Afiliado"
      icon={<Tag className="w-4 h-4 text-purple-400" />}
      badge={<Badge variant="secondary" className="text-xs">{codes.length}</Badge>}
      action={
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setShowCreate(v => !v); setForm({ code: "", commission_pct: defaultPct, duration_months: defaultMonths, email: "", notes: "" }); }}>
          <Plus className="w-3 h-3" />
          Nuevo código
        </Button>
      }
    >
      <>{/* Create form */}
      {showCreate && (
        <div className="px-4 py-3 border-b border-border/50 bg-background/30 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Crear nuevo código de afiliado</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Código *</label>
              <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="AGENCIA-MED" className="h-8 text-xs font-mono" maxLength={30} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email afiliado *</label>
              <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="partner@email.com" className="h-8 text-xs" type="email" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Comisión %</label>
              <Input value={form.commission_pct} onChange={e => setForm(p => ({ ...p, commission_pct: e.target.value }))} type="number" min={1} max={100} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Duración (meses)</label>
              <Input value={form.duration_months} onChange={e => setForm(p => ({ ...p, duration_months: e.target.value }))} type="number" min={1} max={60} className="h-8 text-xs" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground">Notas (opcional)</label>
              <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Contexto interno sobre este afiliado" className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Crear código"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : codes.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
          No hay códigos de afiliado creados aún
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-background/50">
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Código</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Comisión</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Vigencia</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Conversiones</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Comisión ganada</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</th>
                <th className="py-2 px-4" />
              </tr>
            </thead>
            <tbody>
              {codes.map(row => (
                <React.Fragment key={row.id}>
                  <tr className="border-b border-border/30 hover:bg-background/30 transition-colors">
                    <td className="py-2 px-4">
                      <span className="font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">{row.code}</span>
                    </td>
                    <td className="py-2 px-4 text-muted-foreground">{row.email}</td>
                    <td className="py-2 px-4 text-green-400 font-semibold">{row.commission_pct}%</td>
                    <td className="py-2 px-4">
                      <span className={row.is_expired ? "text-amber-400" : "text-muted-foreground"}>
                        {row.duration_months}m{row.is_expired ? " (vencido)" : ""}
                      </span>
                    </td>
                    <td className="py-2 px-4">
                      <button
                        className="text-primary hover:underline font-semibold"
                        onClick={() => loadConversions(row.id)}
                      >
                        {loadingConv === row.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : row.conversions}
                        {row.conversions > 0 && <span className="ml-1 text-muted-foreground font-normal">↗</span>}
                      </button>
                    </td>
                    <td className="py-2 px-4 text-amber-400 font-semibold">
                      {row.total_commission_usd != null && row.total_commission_usd > 0
                        ? `$${Number(row.total_commission_usd).toFixed(2)}`
                        : <span className="text-muted-foreground font-normal">—</span>}
                    </td>
                    <td className="py-2 px-4">
                      <button onClick={() => handleToggle(row)} className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${row.is_active ? "bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-400" : "bg-red-500/15 text-red-400 hover:bg-green-500/15 hover:text-green-400"}`}>
                        {row.is_active ? "Activo" : "Inactivo"}
                      </button>
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title="Editar"
                          onClick={() => { setEditId(editId === row.id ? null : row.id); setEditForm({ commission_pct: row.commission_pct, duration_months: row.duration_months, email: row.email, notes: row.notes ?? "", is_active: row.is_active }); }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          className="p-1 text-muted-foreground hover:text-red-400"
                          title="Eliminar"
                          onClick={() => handleDelete(row.id, row.code)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Edit row */}
                  {editId === row.id && (
                    <tr className="border-b border-border/30 bg-background/40">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Email</label>
                            <Input value={editForm.email ?? ""} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} className="h-7 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Comisión %</label>
                            <Input value={editForm.commission_pct ?? ""} onChange={e => setEditForm(p => ({ ...p, commission_pct: Number(e.target.value) }))} type="number" min={1} max={100} className="h-7 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Meses</label>
                            <Input value={editForm.duration_months ?? ""} onChange={e => setEditForm(p => ({ ...p, duration_months: Number(e.target.value) }))} type="number" min={1} max={60} className="h-7 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Notas</label>
                            <Input value={editForm.notes ?? ""} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} className="h-7 text-xs" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdate(row.id)} disabled={saving}>
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Guardar"}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>Cancelar</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Conversions row */}
                  {expandedId === row.id && (
                    <tr className="border-b border-border/30 bg-background/20">
                      <td colSpan={8} className="px-4 py-3">
                        {!conversions[row.id] ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Cargando conversiones…</div>
                        ) : conversions[row.id].length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nadie se ha registrado con este código aún.</p>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Registros con código {row.code}</p>
                            {conversions[row.id].map(c => (
                              <div key={c.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="text-foreground font-medium">{c.user_email}</span>
                                <span className="text-muted-foreground">{c.user_name}</span>
                                <Badge variant="outline" className="text-xs">{c.plan}</Badge>
                                <span>{new Date(c.registered_at).toLocaleDateString("es")}</span>
                                {c.commission_usd != null && Number(c.commission_usd) > 0 && (
                                  <span className="text-amber-400 font-semibold">Comisión: ${Number(c.commission_usd).toFixed(2)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}</>
    </CollapsibleAdminSection>
  );
}

// ── Biblioteca Master ─────────────────────────────────────────────────────────
interface MasterBg {
  id: number;
  userId: number;
  businessId: number | null;
  postId: number | null;
  style: string;
  prompt: string;
  libraryUseCount: number;
  industryGroupSlug: string | null;
  groupDisplayName: string | null;
  createdAt: string;
  contentType: string | null;
}

interface IndustryGroup {
  slug: string;
  displayName: string;
  keywords: string[];
}

function BibliotecaMaster() {
  const { toast } = useToast();
  const [data, setData] = useState<MasterBg[]>([]);
  const [groups, setGroups] = useState<IndustryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [slugFilter, setSlugFilter] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function loadData(p = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "50" });
      if (slugFilter) params.set("slug", slugFilter);
      const res = await fetch(`${BASE}/api/admin/backgrounds-master?${params}`, { credentials: "include" });
      const json = await res.json();
      setData(json.data ?? []);
      if (json.industryGroups) setGroups(json.industryGroups);
    } catch {
      toast({ title: "Error", description: "Error cargando Biblioteca Master", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(1); }, [slugFilter]);

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`${BASE}/api/admin/backgrounds-master/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Error");
      setData(prev => prev.filter(r => r.id !== id));
      toast({ title: "Fondo eliminado", description: `ID ${id}` });
    } catch {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <CollapsibleAdminSection
      id="biblioteca-master"
      defaultOpen={true}
      title="Biblioteca Master"
      icon={<Database className="w-4 h-4 text-amber-400" />}
      badge={data.length > 0 ? <span className="text-xs text-muted-foreground">{data.length} fondos (página {page})</span> : null}
    >
        <>
          <div className="px-4 py-3 border-t border-border/50 border-b border-border/50 flex items-center justify-end gap-2 flex-wrap">
            <select
              value={slugFilter}
              onChange={e => { setSlugFilter(e.target.value); setPage(1); }}
              className="text-xs bg-black/40 border border-border/40 rounded-md px-2 py-1 text-foreground"
            >
              <option value="">Todos los sectores</option>
              {groups.map(g => <option key={g.slug} value={g.slug}>{g.displayName}</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={() => loadData(page)} disabled={loading}>
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              No hay fondos{slugFilter ? " para este sector" : ""}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">Usuario</th>
                    <th className="px-3 py-2 text-left">Sector</th>
                    <th className="px-3 py-2 text-left">Estilo</th>
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-3 py-2 text-left">Usos</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Creado</th>
                    <th className="px-3 py-2 text-left">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {data.map(r => (
                    <tr key={r.id} className="hover:bg-white/3">
                      <td className="px-3 py-2 text-muted-foreground">{r.id}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.userId}</td>
                      <td className="px-3 py-2">
                        {r.groupDisplayName
                          ? <span className="bg-amber-400/10 text-amber-400/80 border border-amber-400/20 rounded-full px-1.5 py-0.5 text-[10px]">{r.groupDisplayName}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.style}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground">{r.prompt}</td>
                      <td className="px-3 py-2 text-center">{r.libraryUseCount ?? 0}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.contentType ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("es") : "—"}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deletingId === r.id}
                          className="text-red-400/70 hover:text-red-400 disabled:opacity-50 transition-colors"
                        >
                          {deletingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-4 py-3 border-t border-border/20 flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => { const p = page - 1; setPage(p); loadData(p); }}>
              ← Anterior
            </Button>
            <span className="text-xs text-muted-foreground">Página {page}</span>
            <Button variant="outline" size="sm" disabled={data.length < 50 || loading} onClick={() => { const p = page + 1; setPage(p); loadData(p); }}>
              Siguiente →
            </Button>
          </div>
        </>
    </CollapsibleAdminSection>
  );
}

type FeatureUnlockMap = Record<string, boolean>;

interface ReferralSettings {
  id: number | null;
  is_enabled: boolean;
  referrer_credits: number;
  referee_credits: number;
  referrer_free_days: number;
  referee_free_days: number;
  min_plan_for_bonus: string;
  max_activation_days: number;
  max_referrals_per_user: number;
  referrer_unlocks: FeatureUnlockMap;
  referee_unlocks: FeatureUnlockMap;
  updated_at: string | null;
}

const FEATURE_UNLOCK_OPTIONS: Array<{ key: string; label: string; description: string }> = [
  { key: "extra_niche",         label: "Nicho extra",             description: "Un slot de nicho adicional sobre el límite del plan" },
  { key: "watermark_removal",   label: "Sin marca de agua",       description: "Elimina el logo HazPost del contenido generado" },
  { key: "priority_generation", label: "Generación prioritaria",  description: "Prioridad en la cola de generación de IA" },
  { key: "custom_domain",       label: "Dominio personalizado",   description: "Vincula un dominio propio a las landing pages" },
];

interface ReferralHistoryItem {
  id: number;
  status: string;
  referrer_credits_awarded: number;
  referee_credits_awarded: number;
  created_at: string;
  credited_at: string | null;
  used_code: string;
  referrer_id: number;
  referrer_email: string;
  referrer_name: string;
  referred_id: number;
  referred_email: string;
  referred_name: string;
  referred_plan: string;
}

const REFERRAL_PLAN_OPTS = [
  { value: "free",    label: "Free" },
  { value: "starter", label: "Emprendedor" },
  { value: "business",label: "Negocio" },
  { value: "agency",  label: "Agencia" },
];

const DEFAULT_REF_SETTINGS: ReferralSettings = {
  id: null, is_enabled: true, referrer_credits: 30, referee_credits: 10,
  referrer_free_days: 0, referee_free_days: 0, min_plan_for_bonus: "starter",
  max_activation_days: 60, max_referrals_per_user: 0,
  referrer_unlocks: {}, referee_unlocks: {}, updated_at: null,
};

interface ReferralCodeItem {
  id: number;
  code: string;
  referrer_credits: number;
  referee_credits: number;
  referrer_free_days: number;
  referee_free_days: number;
  min_plan_for_bonus: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  conversions: number;
}

const BLANK_CODE: Omit<ReferralCodeItem, "id" | "created_at" | "conversions"> = {
  code: "", referrer_credits: 0, referee_credits: 0,
  referrer_free_days: 0, referee_free_days: 0,
  min_plan_for_bonus: "starter", description: null, is_active: true,
};

function ReferralsManagement() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ReferralSettings>(DEFAULT_REF_SETTINGS);
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
  const [histTotal, setHistTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Referral codes state
  const [refCodes, setRefCodes] = useState<ReferralCodeItem[]>([]);
  const [showNewCode, setShowNewCode] = useState(false);
  const [newCode, setNewCode] = useState({ ...BLANK_CODE });
  const [savingCode, setSavingCode] = useState(false);
  const [editingCode, setEditingCode] = useState<ReferralCodeItem | null>(null);
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [sRes, hRes, cRes] = await Promise.all([
        fetch(`${BASE}/api/admin/referrals/settings`, { credentials: "include" }),
        fetch(`${BASE}/api/admin/referrals/history?limit=50`, { credentials: "include" }),
        fetch(`${BASE}/api/admin/referrals/codes`, { credentials: "include" }),
      ]);
      if (sRes.ok) setSettings(await sRes.json());
      if (hRes.ok) {
        const hData = await hRes.json();
        setHistory(hData.history ?? []);
        setHistTotal(hData.total ?? 0);
      }
      if (cRes.ok) setRefCodes(await cRes.json());
    } catch {
      toast({ title: "Error cargando referidos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function referralLink(code: string) {
    return `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
  }

  function copyReferralLink(code: string) {
    const link = referralLink(code);
    navigator.clipboard.writeText(link).then(() => {
      toast({ title: "Link copiado", description: link });
    }).catch(() => {
      toast({ title: "Link de registro", description: link });
    });
  }

  function shareWhatsAppReferral(code: string) {
    const link = referralLink(code);
    const msg = encodeURIComponent(`¡Únete a HazPost con mi código de referido y ambos recibimos créditos!\n👉 ${link}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  async function createCode() {
    setSavingCode(true);
    try {
      const r = await fetch(`${BASE}/api/admin/referrals/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newCode),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: d.error ?? "Error al crear", variant: "destructive" }); return; }
      setRefCodes(prev => [d, ...prev]);
      navigator.clipboard.writeText(referralLink(d.code)).catch(() => {});
      setNewCode({ ...BLANK_CODE });
      setShowNewCode(false);
      setLastCreatedCode(d.code);
      toast({ title: `Código ${d.code} creado`, description: "El link de invitación está listo para compartir." });
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setSavingCode(false);
    }
  }

  async function saveCodeEdit(item: ReferralCodeItem) {
    setSavingCode(true);
    try {
      const r = await fetch(`${BASE}/api/admin/referrals/codes/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(item),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: d.error ?? "Error al guardar", variant: "destructive" }); return; }
      setRefCodes(prev => prev.map(c => c.id === item.id ? d : c));
      setEditingCode(null);
      toast({ title: "Código actualizado" });
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setSavingCode(false);
    }
  }

  async function toggleCode(item: ReferralCodeItem) {
    const updated = { ...item, is_active: !item.is_active };
    await saveCodeEdit(updated);
  }

  async function deleteCode(id: number, code: string) {
    if (!confirm(`¿Eliminar el código "${code}"?`)) return;
    try {
      const r = await fetch(`${BASE}/api/admin/referrals/codes/${id}`, {
        method: "DELETE", credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: d.error ?? "No se puede eliminar", variant: "destructive" }); return; }
      setRefCodes(prev => prev.filter(c => c.id !== id));
      toast({ title: `Código "${code}" eliminado` });
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/admin/referrals/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setSettings(updated);
      toast({ title: "Configuración guardada" });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof ReferralSettings>(key: K, value: ReferralSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  const statusBadge = (status: string) =>
    status === "credited"
      ? <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full font-semibold">Acreditado</span>
      : <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">Pendiente</span>;

  return (
    <CollapsibleAdminSection
      id="referrals"
      defaultOpen={true}
      title="Sistema de Referidos"
      icon={<Gift className="w-4 h-4 text-primary" />}
      badge={settings.is_enabled
        ? <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Activo</span>
        : <span className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Pausado</span>
      }
    >
        <div className="p-4 space-y-6">
          {loading && (
            <div className="flex items-center justify-center h-16">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          )}
          {!loading && (
            <>
              {/* Settings form */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Configuración global</h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-muted-foreground">
                      {settings.is_enabled ? "Habilitado" : "Deshabilitado"}
                    </span>
                    <div
                      onClick={() => updateField("is_enabled", !settings.is_enabled)}
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${settings.is_enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.is_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Créditos al referidor</label>
                    <Input
                      type="number" min={0} max={500}
                      value={settings.referrer_credits}
                      onChange={e => updateField("referrer_credits", Number(e.target.value))}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Créditos al referido (bienvenida)</label>
                    <Input
                      type="number" min={0} max={500}
                      value={settings.referee_credits}
                      onChange={e => updateField("referee_credits", Number(e.target.value))}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Plan mínimo para acreditar</label>
                    <Select
                      value={settings.min_plan_for_bonus}
                      onValueChange={v => updateField("min_plan_for_bonus", v)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REFERRAL_PLAN_OPTS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Días gratis para el referidor</label>
                    <Input
                      type="number" min={0} max={365}
                      value={settings.referrer_free_days}
                      onChange={e => updateField("referrer_free_days", Number(e.target.value))}
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">Extensión de suscripción al referidor (0 = sin días extra)</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Días gratis para el referido</label>
                    <Input
                      type="number" min={0} max={365}
                      value={settings.referee_free_days}
                      onChange={e => updateField("referee_free_days", Number(e.target.value))}
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">Extensión de suscripción al nuevo usuario (0 = sin días extra)</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Días máx. para convertir</label>
                    <Input
                      type="number" min={1} max={365}
                      value={settings.max_activation_days}
                      onChange={e => updateField("max_activation_days", Number(e.target.value))}
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">Días desde el registro para que el referido pague</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Máx. referidos por usuario (0 = ilimitado)</label>
                    <Input
                      type="number" min={0} max={9999}
                      value={settings.max_referrals_per_user}
                      onChange={e => updateField("max_referrals_per_user", Number(e.target.value))}
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Feature unlock toggles */}
                <div className="space-y-3 pt-2 border-t border-border/40">
                  <p className="text-xs font-semibold text-foreground">Funcionalidades desbloqueadas al recibir el bono</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Para el referidor</p>
                      {FEATURE_UNLOCK_OPTIONS.map(opt => (
                        <label key={`ref-${opt.key}`} className="flex items-start gap-2 cursor-pointer group">
                          <div
                            onClick={() => updateField("referrer_unlocks", { ...settings.referrer_unlocks, [opt.key]: !settings.referrer_unlocks[opt.key] })}
                            className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center cursor-pointer transition-colors ${settings.referrer_unlocks[opt.key] ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"}`}
                          >
                            {settings.referrer_unlocks[opt.key] && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div>
                            <p className="text-xs text-foreground group-hover:text-primary transition-colors">{opt.label}</p>
                            <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Para el referido (nuevo usuario)</p>
                      {FEATURE_UNLOCK_OPTIONS.map(opt => (
                        <label key={`ee-${opt.key}`} className="flex items-start gap-2 cursor-pointer group">
                          <div
                            onClick={() => updateField("referee_unlocks", { ...settings.referee_unlocks, [opt.key]: !settings.referee_unlocks[opt.key] })}
                            className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center cursor-pointer transition-colors ${settings.referee_unlocks[opt.key] ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"}`}
                          >
                            {settings.referee_unlocks[opt.key] && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div>
                            <p className="text-xs text-foreground group-hover:text-primary transition-colors">{opt.label}</p>
                            <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button size="sm" onClick={saveSettings} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    Guardar configuración
                  </Button>
                </div>
              </div>

              {/* Referral Codes sub-section */}
              <div className="space-y-3 border-t border-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Códigos de referido personalizados</h3>
                  <button
                    onClick={() => { setShowNewCode(p => !p); setNewCode({ ...BLANK_CODE }); }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nuevo código
                  </button>
                </div>

                {/* New code form */}
                {showNewCode && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <p className="text-xs font-semibold text-primary">Nuevo código de referido</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Código *</label>
                        <Input
                          value={newCode.code}
                          onChange={e => setNewCode(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                          placeholder="PROMO10"
                          className="text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Créditos referidor</label>
                        <Input type="number" min={0} max={500} value={newCode.referrer_credits}
                          onChange={e => setNewCode(p => ({ ...p, referrer_credits: Number(e.target.value) }))}
                          className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Créditos referido</label>
                        <Input type="number" min={0} max={500} value={newCode.referee_credits}
                          onChange={e => setNewCode(p => ({ ...p, referee_credits: Number(e.target.value) }))}
                          className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Días gratis referidor</label>
                        <Input type="number" min={0} max={365} value={newCode.referrer_free_days}
                          onChange={e => setNewCode(p => ({ ...p, referrer_free_days: Number(e.target.value) }))}
                          className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Días gratis referido</label>
                        <Input type="number" min={0} max={365} value={newCode.referee_free_days}
                          onChange={e => setNewCode(p => ({ ...p, referee_free_days: Number(e.target.value) }))}
                          className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Plan mínimo</label>
                        <Select value={newCode.min_plan_for_bonus} onValueChange={v => setNewCode(p => ({ ...p, min_plan_for_bonus: v }))}>
                          <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REFERRAL_PLAN_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground uppercase">Descripción (opcional)</label>
                      <Input value={newCode.description ?? ""} onChange={e => setNewCode(p => ({ ...p, description: e.target.value }))} placeholder="Campaña Black Friday..." className="text-xs" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowNewCode(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">Cancelar</button>
                      <Button size="sm" onClick={createCode} disabled={savingCode}>
                        {savingCode ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                        Crear código
                      </Button>
                    </div>
                  </div>
                )}

                {lastCreatedCode && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-xs font-semibold text-primary">Link de invitación — código <span className="font-mono">{lastCreatedCode}</span></p>
                    <div className="flex items-center gap-1.5 rounded-md bg-background border border-border px-2 py-1.5 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground truncate flex-1">{referralLink(lastCreatedCode)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => copyReferralLink(lastCreatedCode)}>
                        <Copy className="w-3 h-3" /> Copiar link
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-green-400 border-green-400/30 hover:bg-green-400/10" onClick={() => shareWhatsAppReferral(lastCreatedCode)}>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.528 5.851L0 24l6.335-1.509A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.359-.214-3.723.887.922-3.618-.234-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>
                        WhatsApp
                      </Button>
                      <button onClick={() => setLastCreatedCode(null)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors text-xs">Cerrar</button>
                    </div>
                  </div>
                )}

                {refCodes.length === 0 && !showNewCode ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No hay códigos personalizados. Los referidos usan el código del usuario.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 border-b border-border">
                        <tr>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Código</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Cr. ref.</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Cr. nuevo</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Días ref.</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Días nuevo</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Plan mín.</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Usos</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Activo</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {refCodes.map(rc => (
                          <tr key={rc.id} className="hover:bg-muted/20 transition-colors">
                            {editingCode?.id === rc.id ? (
                              <>
                                <td className="px-3 py-2 font-mono text-primary/80 font-semibold">{rc.code}</td>
                                <td className="px-2 py-1"><Input type="number" min={0} max={500} value={editingCode.referrer_credits} onChange={e => setEditingCode(p => ({ ...p!, referrer_credits: Number(e.target.value) }))} className="w-16 text-xs text-center" /></td>
                                <td className="px-2 py-1"><Input type="number" min={0} max={500} value={editingCode.referee_credits} onChange={e => setEditingCode(p => ({ ...p!, referee_credits: Number(e.target.value) }))} className="w-16 text-xs text-center" /></td>
                                <td className="px-2 py-1"><Input type="number" min={0} max={365} value={editingCode.referrer_free_days} onChange={e => setEditingCode(p => ({ ...p!, referrer_free_days: Number(e.target.value) }))} className="w-16 text-xs text-center" /></td>
                                <td className="px-2 py-1"><Input type="number" min={0} max={365} value={editingCode.referee_free_days} onChange={e => setEditingCode(p => ({ ...p!, referee_free_days: Number(e.target.value) }))} className="w-16 text-xs text-center" /></td>
                                <td className="px-2 py-1">
                                  <Select value={editingCode.min_plan_for_bonus} onValueChange={v => setEditingCode(p => ({ ...p!, min_plan_for_bonus: v }))}>
                                    <SelectTrigger className="text-xs w-24"><SelectValue /></SelectTrigger>
                                    <SelectContent>{REFERRAL_PLAN_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                                  </Select>
                                </td>
                                <td className="px-3 py-2 text-center text-muted-foreground">{rc.conversions}</td>
                                <td className="px-3 py-2 text-center">
                                  <button onClick={() => setEditingCode(p => ({ ...p!, is_active: !p!.is_active }))}
                                    className={`w-8 h-4 rounded-full transition-colors ${editingCode.is_active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1">
                                    <button onClick={() => saveCodeEdit(editingCode)} disabled={savingCode} className="text-primary hover:text-primary/80 transition-colors" title="Guardar">
                                      {savingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={() => setEditingCode(null)} className="text-muted-foreground hover:text-foreground transition-colors" title="Cancelar"><XIcon className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2">
                                  <span className="font-mono font-semibold text-primary">{rc.code}</span>
                                  {rc.description && <p className="text-muted-foreground truncate max-w-[120px]">{rc.description}</p>}
                                </td>
                                <td className="px-3 py-2 text-center">{rc.referrer_credits > 0 ? <span className="text-green-400">+{rc.referrer_credits}</span> : <span className="text-muted-foreground">—</span>}</td>
                                <td className="px-3 py-2 text-center">{rc.referee_credits > 0 ? <span className="text-blue-400">+{rc.referee_credits}</span> : <span className="text-muted-foreground">—</span>}</td>
                                <td className="px-3 py-2 text-center">{rc.referrer_free_days > 0 ? <span className="text-amber-400">{rc.referrer_free_days}d</span> : <span className="text-muted-foreground">—</span>}</td>
                                <td className="px-3 py-2 text-center">{rc.referee_free_days > 0 ? <span className="text-amber-400">{rc.referee_free_days}d</span> : <span className="text-muted-foreground">—</span>}</td>
                                <td className="px-3 py-2 capitalize text-muted-foreground">{PLAN_LABELS[rc.min_plan_for_bonus] ?? rc.min_plan_for_bonus}</td>
                                <td className="px-3 py-2 text-center text-muted-foreground">{rc.conversions}</td>
                                <td className="px-3 py-2 text-center">
                                  <button onClick={() => toggleCode(rc)} disabled={savingCode}
                                    className={`w-8 h-4 rounded-full transition-colors ${rc.is_active ? "bg-primary" : "bg-muted-foreground/30"}`}
                                    title={rc.is_active ? "Activo (click para desactivar)" : "Inactivo (click para activar)"} />
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1 items-center">
                                    <button onClick={() => copyReferralLink(rc.code)} className="text-muted-foreground hover:text-primary transition-colors" title="Copiar link de invitación"><Copy className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => shareWhatsAppReferral(rc.code)} className="text-muted-foreground hover:text-green-400 transition-colors" title="Compartir por WhatsApp">
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.528 5.851L0 24l6.335-1.509A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.359-.214-3.723.887.922-3.618-.234-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>
                                    </button>
                                    <button onClick={() => setEditingCode({ ...rc })} className="text-muted-foreground hover:text-primary transition-colors" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => deleteCode(rc.id, rc.code)} className="text-muted-foreground hover:text-red-400 transition-colors" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* History table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Historial de conversiones</h3>
                  <span className="text-xs text-muted-foreground">{histTotal} conversiones</span>
                </div>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No hay conversiones de referidos aún.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 border-b border-border">
                        <tr>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Referidor</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Referido</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Plan</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Estado</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Cr. referidor</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Cr. referido</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {history.map(h => (
                          <tr key={h.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2">
                              <p className="font-medium text-foreground truncate max-w-[140px]">{h.referrer_name || h.referrer_email}</p>
                              <p className="text-muted-foreground truncate max-w-[140px]">{h.referrer_email}</p>
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-medium text-foreground truncate max-w-[140px]">{h.referred_name || h.referred_email}</p>
                              <p className="text-muted-foreground truncate max-w-[140px]">{h.referred_email}</p>
                            </td>
                            <td className="px-3 py-2">
                              <span className="text-foreground capitalize">{PLAN_LABELS[h.referred_plan] ?? h.referred_plan}</span>
                            </td>
                            <td className="px-3 py-2">{statusBadge(h.status)}</td>
                            <td className="px-3 py-2 text-center">
                              {h.referrer_credits_awarded > 0
                                ? <span className="text-green-400 font-semibold">+{h.referrer_credits_awarded}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {h.referee_credits_awarded > 0
                                ? <span className="text-blue-400 font-semibold">+{h.referee_credits_awarded}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {new Date(h.created_at).toLocaleDateString("es-CO")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
    </CollapsibleAdminSection>
  );
}

// ── Vouchers / Códigos de prueba ─────────────────────────────────────────────
interface VoucherRecord {
  id: number;
  code: string;
  trial_plan: string | null;
  trial_days: number;
  bonus_credits: number;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  description: string | null;
  expires_at: string | null;
  created_at: string;
  redemption_count: number;
}

const PLAN_NAME_MAP: Record<string, string> = {
  free: "Gratis", starter: "Emprendedor", business: "Negocio", agency: "Agencia",
  negocio: "Negocio", emprendedor: "Emprendedor",
};

const EMPTY_VOUCHER = { code: "", trial_plan: "business", trial_days: "30", bonus_credits: "100", max_uses: "", description: "", expires_at: "", is_active: true };

function VouchersManagement() {
  const { toast } = useToast();
  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_VOUCHER);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function load() {
    try {
      const r = await fetch(`${BASE}/api/admin/vouchers`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setVouchers(d.vouchers ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const body = {
        code: form.code.trim().toUpperCase(),
        trial_plan: form.trial_plan || null,
        trial_days: Number(form.trial_days),
        bonus_credits: Number(form.bonus_credits),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        description: form.description || null,
        expires_at: form.expires_at || null,
        is_active: form.is_active,
      };
      const r = await fetch(`${BASE}/api/admin/vouchers`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: `✓ Voucher "${body.code}" creado` });
      setForm(EMPTY_VOUCHER);
      setShowCreate(false);
      load();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(v: VoucherRecord) {
    try {
      await fetch(`${BASE}/api/admin/vouchers/${v.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !v.is_active }),
      });
      load();
    } catch { /* ignore */ }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este voucher? Esta acción no se puede deshacer.")) return;
    setDeleting(id);
    try {
      await fetch(`${BASE}/api/admin/vouchers/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Voucher eliminado" });
      load();
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => toast({ title: `Código "${code}" copiado` }));
  }

  return (
    <CollapsibleAdminSection
      id="vouchers"
      defaultOpen={true}
      title="Vouchers / Códigos de prueba"
      icon={<Gift className="w-4 h-4 text-primary" />}
      badge={<span className="text-xs text-muted-foreground">({vouchers.filter(v => v.is_active).length} activos)</span>}
    >
        <div className="p-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowCreate(s => !s)} className="text-xs gap-1">
              <Plus className="w-3 h-3" />
              Nuevo voucher
            </Button>
          </div>

          {showCreate && (
            <div className="bg-muted/20 border border-border rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Crear nuevo voucher</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Código *</label>
                  <Input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))}
                    placeholder="Ej: PRUEBA30"
                    className="h-8 text-xs font-mono"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Plan de prueba</label>
                  <Select value={form.trial_plan} onValueChange={v => setForm(f => ({ ...f, trial_plan: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">Negocio</SelectItem>
                      <SelectItem value="starter">Emprendedor</SelectItem>
                      <SelectItem value="agency">Agencia</SelectItem>
                      <SelectItem value="free">Gratis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Días de prueba</label>
                  <Input
                    type="number" min={1} max={365}
                    value={form.trial_days}
                    onChange={e => setForm(f => ({ ...f, trial_days: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Créditos bonus</label>
                  <Input
                    type="number" min={0}
                    value={form.bonus_credits}
                    onChange={e => setForm(f => ({ ...f, bonus_credits: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Máx. usos (vacío = ilimitado)</label>
                  <Input
                    type="number" min={1}
                    value={form.max_uses}
                    onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                    placeholder="Ilimitado"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Expira el (vacío = nunca)</label>
                  <Input
                    type="date"
                    value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Descripción interna</label>
                <Input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ej: Campaña de amigos - Abril 2026"
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Button size="sm" onClick={handleCreate} disabled={creating || !form.code} className="text-xs">
                  {creating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                  Crear voucher
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowCreate(false)} className="text-xs">Cancelar</Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : vouchers.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No hay vouchers. Crea el primero.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-background/50">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium uppercase tracking-wide">Código</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium uppercase tracking-wide">Plan</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium uppercase tracking-wide">Días</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium uppercase tracking-wide">Créditos</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium uppercase tracking-wide">Usos</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium uppercase tracking-wide">Expira</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium uppercase tracking-wide">Estado</th>
                    <th className="py-2 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map(v => (
                    <tr key={v.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${!v.is_active ? "opacity-50" : ""}`}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-foreground">{v.code}</span>
                          <button onClick={() => copyCode(v.code)} className="text-muted-foreground hover:text-primary">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        {v.description && <p className="text-muted-foreground truncate max-w-[120px]">{v.description}</p>}
                      </td>
                      <td className="py-2 px-3">
                        {v.trial_plan ? (
                          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                            {PLAN_NAME_MAP[v.trial_plan] ?? v.trial_plan}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center text-foreground font-semibold">{v.trial_days}d</td>
                      <td className="py-2 px-3 text-center">
                        {v.bonus_credits > 0 ? <span className="text-amber-400 font-semibold">+{v.bonus_credits}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center text-muted-foreground">
                        {Number(v.redemption_count)}/{v.max_uses ?? "∞"}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {v.expires_at ? new Date(v.expires_at).toLocaleDateString("es-CO") : "Nunca"}
                      </td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => handleToggle(v)}
                          className={`relative w-8 h-4 rounded-full border transition-all flex-shrink-0 ${v.is_active ? "bg-primary border-primary" : "bg-muted border-border"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${v.is_active ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                      </td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => handleDelete(v.id)}
                          disabled={deleting === v.id}
                          className="text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </CollapsibleAdminSection>
  );
}

interface AdminNiche {
  id: number;
  userId?: number | null;
  businessId?: number | null;
  name: string;
  description?: string | null;
  keywords?: string | null;
  active: boolean;
  createdAt?: string | null;
}

function NichosAdminSection() {
  const [niches, setNiches] = useState<AdminNiche[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [userMap, setUserMap] = useState<Map<number, string>>(new Map());
  const [bizMap, setBizMap] = useState<Map<number, string>>(new Map());
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [nichesRes, usersRes, bizRes] = await Promise.all([
        fetch(`${BASE}/api/niches?scope=all`, { credentials: "include" }).then(r => r.json()),
        fetch(`${BASE}/api/user/admin/users`, { credentials: "include" }).then(r => r.json()).catch(() => ({ users: [] })),
        fetch(`${BASE}/api/businesses`, { credentials: "include" }).then(r => r.json()).catch(() => ({ businesses: [] })),
      ]);
      const allNiches: AdminNiche[] = Array.isArray(nichesRes) ? nichesRes : [];
      setNiches(allNiches);
      const uMap = new Map<number, string>();
      for (const u of (usersRes.users ?? [])) {
        uMap.set(u.id, u.displayName || u.email);
      }
      setUserMap(uMap);
      const bMap = new Map<number, string>();
      for (const b of (bizRes.businesses ?? [])) {
        bMap.set(b.id, b.name);
      }
      setBizMap(bMap);
      setLoaded(true);
    } catch (err: unknown) {
      toast({ title: "Error cargando nichos", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const q = search.toLowerCase();
  const filtered = niches.filter(n => {
    if (!q) return true;
    const userName = n.userId != null ? (userMap.get(n.userId) ?? "") : "";
    const bizName = n.businessId != null ? (bizMap.get(n.businessId) ?? "") : "";
    return (
      n.name.toLowerCase().includes(q) ||
      userName.toLowerCase().includes(q) ||
      bizName.toLowerCase().includes(q) ||
      String(n.businessId ?? "").includes(q)
    );
  });

  const totalNiches = niches.length;
  const activeNiches = niches.filter(n => n.active).length;
  const inactiveNiches = totalNiches - activeNiches;

  return (
    <CollapsibleAdminSection
      id="nichos-admin"
      defaultOpen={true}
      title="Nichos del sistema"
      icon={<Tag className="w-4 h-4 text-primary" />}
      badge={loaded && niches.length > 0 ? <span className="text-xs text-muted-foreground">{niches.length} nichos</span> : null}
    >
        <>
          <div className="px-4 py-3 border-t border-border/50 border-b border-border/50 flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3 h-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              {loaded ? "Actualizar" : "Cargar nichos"}
            </Button>
          </div>

          {!loaded ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground text-sm">
              {loading
                ? <Loader2 className="w-5 h-5 animate-spin opacity-60" />
                : <Tag className="w-5 h-5 opacity-40" />
              }
              <p>{loading ? "Cargando nichos…" : "No se pudo cargar. Intenta de nuevo."}</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Global stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total", value: totalNiches, icon: <BarChart2 className="w-4 h-4 text-primary" />, color: "text-foreground" },
                  { label: "Activos", value: activeNiches, icon: <CheckCircle2 className="w-4 h-4 text-green-400" />, color: "text-green-400" },
                  { label: "Inactivos", value: inactiveNiches, icon: <MinusCircle className="w-4 h-4 text-muted-foreground" />, color: "text-muted-foreground" },
                ].map(stat => (
                  <div key={stat.label} className="bg-background/60 border border-border/50 rounded-lg px-3 py-2 flex items-center gap-2">
                    {stat.icon}
                    <div>
                      <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por nicho, usuario o negocio…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-background/60 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-lg border border-border/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-background/50">
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Usuario</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Negocio</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Nicho</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-muted-foreground text-xs">
                          {search ? "Sin resultados para esa búsqueda" : "No hay nichos en el sistema"}
                        </td>
                      </tr>
                    ) : filtered.map(n => {
                      const userName = n.userId != null ? (userMap.get(n.userId) ?? `uid:${n.userId}`) : "—";
                      const bizName = n.businessId != null
                        ? (bizMap.get(n.businessId) ?? `Negocio #${n.businessId}`)
                        : "—";
                      const created = n.createdAt
                        ? new Date(n.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
                        : "—";
                      return (
                        <tr key={n.id} className="border-b border-border/20 hover:bg-background/30 transition-colors">
                          <td className="py-2 px-3 text-xs text-foreground/80 max-w-[140px] truncate" title={userName}>{userName}</td>
                          <td className="py-2 px-3 text-xs text-foreground/70 max-w-[120px] truncate" title={bizName}>{bizName}</td>
                          <td className="py-2 px-3">
                            <div>
                              <p className="text-xs font-medium text-foreground">{n.name}</p>
                              {n.keywords && <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={n.keywords}>{n.keywords}</p>}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className={n.active
                              ? "text-green-400 border-green-500/30 bg-green-500/10 text-xs"
                              : "text-muted-foreground border-border/50 bg-background/40 text-xs"
                            }>
                              {n.active ? "Activo" : "Inactivo"}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">{created}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length > 0 && (
                <p className="text-xs text-muted-foreground text-right">{filtered.length} de {totalNiches} nichos</p>
              )}
            </div>
          )}
        </>
    </CollapsibleAdminSection>
  );
}

function AdminContent() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [userData, profileData] = await Promise.all([
        authFetch("/user/admin/users?withStats=true"),
        fetch(`${BASE}/api/brand-profile/admin/all`, { credentials: "include" }).then(r => r.json()).catch(() => ({ profiles: [] })),
      ]);
      setUsers(userData.users);
      setBrandProfiles(profileData.profiles ?? []);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error cargando usuarios", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === "active" || u.role === "admin").length;
  const profileMap = new Map(brandProfiles.map(p => [p.userId, p]));
  const completedOnboarding = brandProfiles.filter(p => p.onboardingCompleted === true || p.onboardingCompleted === "true").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-primary" />
            Panel de Administración
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestión de usuarios y suscripciones</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Total usuarios</span>
          </div>
          <p className="text-2xl font-bold">{totalUsers}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Activos</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{activeUsers}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Planes de pago</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">
            {users.filter(u => u.plan !== "free").length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Onboarding ✓</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">{completedOnboarding}</p>
        </div>
      </div>

      <WeeklyReview users={users} brandProfiles={brandProfiles} />

      <CreateUserForm onCreated={load} />

      <PapeleraSection />

      <PlansManagement />

      <VouchersManagement />

      <AffiliateGlobalSettings />

      <AffiliatesManagement />

      <AffiliateCodesManagement />

      <ReferralsManagement />

      <CostAnalysis />

      <MusicManagement />

      <NichosAdminSection />

      <BibliotecaMaster />

      <CollapsibleAdminSection
        id="admin-users-table"
        defaultOpen={true}
        title="Usuarios registrados"
        icon={<Users className="w-4 h-4 text-primary" />}
        badge={<span className="text-xs text-muted-foreground">{totalUsers} usuarios ({activeUsers} activos)</span>}
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No hay usuarios registrados
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-background/50">
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Usuario</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Créditos</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Vencimiento</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-amber-400" /> Onboarding</span>
                  </th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Registro</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-primary" /> Publicaciones</span>
                  </th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo plat.</th>
                  <th className="py-2 px-4" />
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <UserRowWithOnboarding key={u.id} user={u} brandProfile={profileMap.get(u.id)} onUpdate={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleAdminSection>

      {/* Support Inbox */}
      <SupportInbox />
    </div>
  );
}

// ─── Support Inbox ────────────────────────────────────────────────────────────

interface SupportConv {
  userId: number;
  email: string;
  displayName: string;
  lastMessage: string;
  lastAt: string;
  lastSender: string;
  unread: number;
}

interface SupportMsg {
  id: number;
  userId: number;
  senderRole: "user" | "admin";
  content: string;
  createdAt: string;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function SupportInbox() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<SupportConv[]>([]);
  const [selected, setSelected] = useState<SupportConv | null>(null);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvs = async () => {
    try {
      const r = await fetch(`${BASE}/api/support/admin/conversations`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setConversations(d.conversations ?? []); }
    } finally { setLoading(false); }
  };

  const loadMessages = async (conv: SupportConv) => {
    setLoadingMsgs(true);
    setSelected(conv);
    setMessages([]);
    try {
      const r = await fetch(`${BASE}/api/support/admin/messages/${conv.userId}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages ?? []);
        // Clear unread locally
        setConversations(prev => prev.map(c => c.userId === conv.userId ? { ...c, unread: 0 } : c));
      }
    } finally { setLoadingMsgs(false); }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${BASE}/api/support/admin/reply/${selected.userId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        setMessages(prev => [...prev, d.message]);
        setReply("");
        toast({ title: "Respuesta enviada" });
      }
    } catch {
      toast({ title: "Error al enviar", variant: "destructive" });
    } finally { setSending(false); }
  };

  useEffect(() => { loadConvs(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const totalUnread = conversations.reduce((acc, c) => acc + c.unread, 0);

  return (
    <CollapsibleAdminSection
      id="support-inbox"
      defaultOpen={true}
      title="Soporte — Mensajes de usuarios"
      icon={<MessageSquare className="w-4 h-4 text-[#00C2FF]" />}
      badge={totalUnread > 0 ? (
        <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
          {totalUnread} sin leer
        </span>
      ) : null}
      action={
        <Button variant="ghost" size="sm" onClick={loadConvs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      }
    >
      <div className="flex h-[480px]">
        {/* Conversation list */}
        <div className="w-64 shrink-0 border-r border-border overflow-y-auto">
          {loading && (
            <div className="flex justify-center pt-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center pt-8 px-4">
              Aún no hay mensajes de soporte.
            </p>
          )}
          {conversations.map(c => (
            <button
              key={c.userId}
              onClick={() => loadMessages(c)}
              className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-white/5 transition-colors ${selected?.userId === c.userId ? "bg-[#00C2FF]/10" : ""}`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-medium truncate max-w-[140px]">
                  {c.displayName || c.email.split("@")[0]}
                </span>
                {c.unread > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                    {c.unread}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>
              <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                {c.lastSender === "admin" ? "Tú: " : ""}{c.lastMessage}
              </p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">{timeAgo(c.lastAt)}</p>
            </button>
          ))}
        </div>

        {/* Message pane */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 space-y-2">
              <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Selecciona una conversación para ver los mensajes y responder.
              </p>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                <p className="text-xs text-center text-muted-foreground/50 pb-1">
                  Conversación con <strong>{selected.displayName || selected.email}</strong>
                </p>
                {loadingMsgs && (
                  <div className="flex justify-center pt-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.senderRole === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      m.senderRole === "admin"
                        ? "bg-[#00C2FF] text-white rounded-br-sm"
                        : "bg-white/10 text-white rounded-bl-sm"
                    }`}>
                      {m.senderRole === "user" && (
                        <p className="text-[10px] font-semibold text-[#00C2FF]/80 mb-0.5">
                          {selected.displayName || selected.email}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <p className={`text-[10px] mt-1 ${m.senderRole === "admin" ? "text-white/60 text-right" : "text-white/40"}`}>
                        {timeAgo(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Reply input */}
              <div className="px-3 py-3 border-t border-border flex gap-2">
                <Textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="Escribe tu respuesta…"
                  rows={2}
                  className="flex-1 resize-none bg-white/5 border-white/10 text-sm"
                />
                <Button
                  onClick={sendReply}
                  disabled={!reply.trim() || sending}
                  size="sm"
                  className="bg-[#00C2FF] text-white hover:bg-[#00C2FF]/90 self-end"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </CollapsibleAdminSection>
  );
}

export default function Admin() {
  return (
    <ProtectedRoute adminOnly>
      <AdminContent />
    </ProtectedRoute>
  );
}
