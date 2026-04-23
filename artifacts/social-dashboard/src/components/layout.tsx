import React from "react";
import { Link, useLocation } from "wouter";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LayoutDashboard, Calendar, CheckSquare, Sparkles, Tags, History, Settings, BarChart2, ImagePlay, Globe, LogOut, ShieldAlert, Zap, MessageCircle, Building2, ChevronDown, MailWarning, RefreshCw, Gift, Handshake, BookOpen, Activity, Coins, CreditCard, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import SupportChatWidget from "@/components/SupportChatWidget";


const menuItems = [
  { title: "Panel", icon: LayoutDashboard, url: "/dashboard" },
  { title: "Calendario", icon: Calendar, url: "/calendar" },
  { title: "Cola de Aprobación", icon: CheckSquare, url: "/approval" },
  { title: "Generador Masivo", icon: Sparkles, url: "/generate" },
  { title: "Nichos", icon: Tags, url: "/niches" },
  { title: "Historial", icon: History, url: "/history" },
  { title: "Plan y Créditos", icon: CreditCard, url: "/billing", activeUrls: ["/billing", "/credits"] },
  { title: "Estadísticas", icon: BarChart2, url: "/analytics", adminOnly: true },
  { title: "Biblioteca de Fondos", icon: ImagePlay, url: "/backgrounds" },
  { title: "Landing Pages", icon: Globe, url: "/landings", adminOnly: true },
  { title: "Chatbot IA", icon: MessageCircle, url: "/chatbot", adminOnly: true },
  { title: "Configuración", icon: Settings, url: "/settings" },
];

interface BusinessItem {
  id: number;
  name: string;
  industry: string | null;
  isDefault: boolean;
  primaryColor: string | null;
  secondaryColor: string | null;
  website: string | null;
}

function BusinessSwitcher() {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${BASE}/api/businesses`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setBusinesses(d.businesses ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (businesses.length === 0) return null;

  const active = businesses.find(b => b.isDefault) ?? businesses[0];
  const canSwitch = businesses.length > 1;

  async function switchTo(id: number) {
    setSwitching(true);
    setOpen(false);
    try {
      const res = await fetch(`${BASE}/api/businesses/${id}/set-active`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("switch failed");
      // Clear calendar scope so the calendar defaults to the newly selected business after reload
      if (user?.id) {
        localStorage.removeItem(`hz_cal_scope_${user.id}`);
      }
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  return (
    <div ref={ref} className="relative w-full px-3 pb-3">
      <button
        onClick={() => canSwitch && setOpen(o => !o)}
        disabled={switching}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${
          canSwitch
            ? "bg-white/5 hover:bg-white/10 border-border/30 hover:border-primary/40 cursor-pointer"
            : "bg-white/3 border-border/20 cursor-default"
        }`}
      >
        <div
          className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm"
          style={{ background: `linear-gradient(135deg, ${active.primaryColor ?? "#0077FF"}, ${active.secondaryColor ?? "#00C2FF"})` }}
        >
          {active.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate leading-tight">{active.name}</p>
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {active.industry ?? "Negocio activo"}
          </p>
          {active.website && (
            <a
              href={active.website.startsWith("http") ? active.website : `https://${active.website}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[10px] text-primary/70 hover:text-primary truncate leading-tight block max-w-full"
              title={active.website}
            >
              {active.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
        {canSwitch && (
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        )}
        {switching && (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
        )}
      </button>

      {open && canSwitch && (
        <div className="absolute top-full left-3 right-3 mt-1 bg-zinc-950 border border-border/60 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-border/40 bg-white/5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Cambiar negocio</p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {businesses.map(b => (
              <button
                key={b.id}
                onClick={() => switchTo(b.id)}
                className={`group w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/15 transition-colors text-left ${b.isDefault ? "bg-primary/10" : ""}`}
              >
                <div
                  className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-white font-bold text-[10px] shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${b.primaryColor ?? "#0077FF"}, ${b.secondaryColor ?? "#00C2FF"})` }}
                >
                  {b.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">{b.name}</p>
                  {b.industry && <p className="text-[10px] text-muted-foreground truncate">{b.industry}</p>}
                </div>
                {b.isDefault && (
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-[9px] text-primary font-medium">activo</span>
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border/40 bg-white/5">
            <a href="/businesses" className="text-[10px] text-primary hover:text-primary/80 hover:underline flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Gestionar negocios →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

const PLAN_COLORS: Record<string, string> = {
  free: "text-muted-foreground",
  starter: "text-blue-400",
  business: "text-purple-400",
  agency: "text-yellow-400",
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  business: "Business",
  agency: "Agencia",
};

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, subscription, logout, refreshUser } = useAuth();
  const { toast } = useToast();
  const [resendingVerification, setResendingVerification] = useState(false);
  const [emailVerifyBlocked, setEmailVerifyBlocked] = useState(false);

  // Platform alerts (e.g. account claimed by another user)
  interface PlatformAlert { id: number; type: string; title: string; message: string; created_at: string }
  const [platformAlerts, setPlatformAlerts] = useState<PlatformAlert[]>([]);
  const [dismissingAlert, setDismissingAlert] = useState<number | null>(null);

  async function handleResendVerification() {
    setResendingVerification(true);
    try {
      const r = await fetch(`${BASE}/api/user/resend-verification`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (data.alreadyVerified) { await refreshUser(); setEmailVerifyBlocked(false); return; }
      if (!r.ok) {
        if (r.status === 429 && data.retryAfterSeconds) {
          const minutes = Math.ceil(data.retryAfterSeconds / 60);
          toast({ title: "Espera un momento", description: `Puedes solicitar otro correo en ${minutes} minuto${minutes !== 1 ? "s" : ""}.`, variant: "destructive" });
        } else {
          toast({ title: "Error", description: data.error || "No se pudo reenviar.", variant: "destructive" });
        }
        return;
      }
      toast({ title: "Correo enviado", description: "Revisa tu bandeja de entrada (y el spam)." });
    } catch {
      toast({ title: "Error", description: "No se pudo reenviar.", variant: "destructive" });
    } finally {
      setResendingVerification(false);
    }
  }

  // Fetch platform alerts when user is authenticated
  useEffect(() => {
    if (!user) return;
    fetch(`${BASE}/api/alerts`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { alerts?: PlatformAlert[] } | null) => {
        if (d?.alerts) setPlatformAlerts(d.alerts.filter(a => !(a as unknown as { is_read: boolean }).is_read));
      })
      .catch(() => {});
  }, [user]);

  async function handleDismissAlert(id: number) {
    setDismissingAlert(id);
    try {
      await fetch(`${BASE}/api/alerts/${id}/dismiss`, { method: "POST", credentials: "include" });
      setPlatformAlerts(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ } finally {
      setDismissingAlert(null);
    }
  }

  // Global fetch interceptor: intercepts 403 EMAIL_NOT_VERIFIED from any route
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      if (response.status === 403) {
        const clone = response.clone();
        clone.json().then((data: { error?: string }) => {
          if (data?.error === "EMAIL_NOT_VERIFIED") {
            setEmailVerifyBlocked(true);
          }
        }).catch(() => {});
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  async function handleLogout() {
    await logout();
    toast({ title: "Sesión cerrada" });
  }

  const planLabel = user ? (PLAN_LABELS[user.plan] || user.plan) : "";
  const planColor = user ? (PLAN_COLORS[user.plan] || "text-muted-foreground") : "";
  const initials = user?.displayName
    ? user.displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "?";

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground dark">
        <Sidebar className="border-r border-border/50 bg-background/95 backdrop-blur-sm">
          <SidebarHeader className="flex flex-col border-b border-border/50 pt-8 pb-0 gap-0">
            <div className="flex flex-col items-center gap-1.5 px-4 pb-4">
              <div className="flex items-center gap-1">
                <span className="text-3xl font-black tracking-tight text-white" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em'}}>haz</span>
                <span className="text-3xl font-black tracking-tight" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em',color:'#00C2FF'}}>post</span>
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Social Media con IA</div>
            </div>
            <BusinessSwitcher />
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-secondary/70 uppercase tracking-widest mt-4 mb-2">Módulos</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.filter(item => !item.adminOnly || user?.role === "admin").map((item) => {
                    const isActive = item.activeUrls ? item.activeUrls.includes(location) : location === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} className={`relative overflow-hidden transition-all duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
                          <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}>
                            <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'drop-shadow-[0_0_5px_rgba(0,201,83,0.5)]' : ''}`} />
                            <span className="font-medium tracking-wide">{item.title}</span>
                            {isActive && (
                              <motion.div
                                layoutId="sidebar-active"
                                className="absolute left-0 w-1 h-full bg-primary shadow-[0_0_10px_rgba(0,201,83,0.8)]"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                              />
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Crecer section — referrals, affiliates, resources */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-secondary/70 uppercase tracking-widest mb-2">Crecer</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {[
                    { title: "Referidos", icon: Gift, url: "/referidos" },
                    { title: "Afiliados", icon: Handshake, url: "/afiliados" },
                    ...(user?.plan === "agency" || user?.role === "admin" ? [{ title: "Recursos Agencia", icon: BookOpen, url: "/recursos" }] : []),
                  ].map(item => {
                    const isActive = location === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} className={`relative overflow-hidden transition-all duration-300 ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
                          <Link href={item.url}>
                            <item.icon className={`w-5 h-5 mr-3 ${isActive ? "drop-shadow-[0_0_5px_rgba(0,201,83,0.5)]" : ""}`} />
                            <span className="font-medium tracking-wide">{item.title}</span>
                            {isActive && (
                              <motion.div layoutId="sidebar-active-grow" className="absolute left-0 w-1 h-full bg-primary shadow-[0_0_10px_rgba(0,201,83,0.8)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} />
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Mis Negocios link — shown for agency plan or admin */}
            {(user?.plan === "agency" || user?.role === "admin") && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-semibold text-secondary/70 uppercase tracking-widest mb-2">Agencia</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/businesses"} className={`relative overflow-hidden transition-all duration-300 ${location === "/businesses" ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
                        <Link href="/businesses">
                          <Building2 className="w-5 h-5 mr-3" />
                          <span className="font-medium tracking-wide">Mis Negocios</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Admin link */}
            {user?.role === "admin" && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-semibold text-secondary/70 uppercase tracking-widest mb-2">Admin</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {[
                      { title: "Usuarios", icon: ShieldAlert, url: "/admin" },
                      { title: "Panel de Control", icon: Activity, url: "/admin/metricas" },
                      { title: "Monitor Backend", icon: RefreshCw, url: "/admin/monitor" },
                    ].map(item => {
                      const isActive = location === item.url;
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton asChild isActive={isActive} className={`relative overflow-hidden transition-all duration-300 ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
                            <Link href={item.url}>
                              <item.icon className="w-5 h-5 mr-3" />
                              <span className="font-medium tracking-wide">{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          {/* User footer */}
          <SidebarFooter className="border-t border-border/50 p-3">
            {user && (
              <div className="space-y-1">
                {/* Upgrade banner — shown when free plan credits are exhausted */}
                {subscription && subscription.creditsRemaining === 0 && user?.plan === "free" && (
                  <Link href="/settings">
                    <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#0077FF]/20 to-[#00C2FF]/20 border border-[#0077FF]/40 cursor-pointer hover:border-[#0077FF]/70 hover:from-[#0077FF]/30 hover:to-[#00C2FF]/30 transition-all duration-200">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-[#00C2FF] shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-white leading-tight">Créditos agotados</p>
                          <p className="text-[10px] text-[#00C2FF] leading-tight">Actualizar plan →</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                )}

                {/* Credits bar (subscription) */}
                {subscription && (
                  <div className="px-2 mb-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Créditos plan</span>
                      <span className={subscription.creditsRemaining === 0 ? "text-red-400" : planColor}>
                        {subscription.creditsRemaining}/{subscription.creditsTotal}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (subscription.creditsRemaining / subscription.creditsTotal) * 100)}%`,
                          background: subscription.creditsRemaining === 0
                            ? "#ef4444"
                            : subscription.creditsRemaining / subscription.creditsTotal < 0.2
                              ? "#f97316"
                              : "rgb(var(--primary))",
                        }}
                      />
                    </div>
                  </div>
                )}
                {/* AI credits from user account */}
                {!subscription && typeof user.aiCredits === "number" && (
                  <div className="px-2 mb-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Créditos IA</span>
                      <span className={user.aiCredits === 0 ? "text-red-400" : user.aiCredits < 5 ? "text-orange-400" : "text-primary"}>
                        {user.aiCredits}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (user.aiCredits / 50) * 100)}%`,
                          background: user.aiCredits === 0 ? "#ef4444" : user.aiCredits < 5 ? "#f97316" : "rgb(var(--primary))",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* User info + profile link + logout */}
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group">
                  <Link href="/profile" className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate leading-tight">
                        {user.displayName || user.email}
                      </p>
                      <p className={`text-[10px] ${planColor} leading-tight flex items-center gap-1`}>
                        {planLabel}
                        <span className="text-muted-foreground/50">· Mi Perfil</span>
                      </p>
                    </div>
                  </Link>
                  <button
                    onClick={handleLogout}
                    title="Cerrar sesión"
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-red-400"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Legal links */}
                <div className="flex items-center gap-3 px-2 pt-1 pb-0.5">
                  <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">Términos</a>
                  <span className="text-muted-foreground/30 text-[10px]">·</span>
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">Privacidad</a>
                  <span className="text-muted-foreground/30 text-[10px]">·</span>
                  <a href="/data-deletion" target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">Datos</a>
                </div>
              </div>
            )}
          </SidebarFooter>
        </Sidebar>
        
        <main className="flex-1 flex flex-col h-full overflow-y-auto relative bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-secondary/5 via-background to-background">
          <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay"></div>
          <div className="sticky top-0 z-10 px-4 py-2 flex items-center md:hidden bg-background/80 backdrop-blur-md border-b border-border/50">
            <SidebarTrigger className="h-11 w-11" />
            <span className="ml-3 flex items-center gap-0.5">
              <span className="text-xl font-black text-white" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em'}}>haz</span>
              <span className="text-xl font-black" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em',color:'#00C2FF'}}>post</span>
            </span>
            <div className="ml-auto flex items-center gap-1">
              {user && (
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {user.displayName || user.email?.split("@")[0]}
                </span>
              )}
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-white/10 transition-colors min-h-[40px]"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Email verification banner */}
          {user && user.emailVerified === false && (
            <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-amber-500/15 border-b border-amber-400/30 text-sm">
              <MailWarning className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-amber-200 flex-1">
                <strong className="text-amber-300">Verifica tu correo</strong> — revisa tu bandeja de entrada y haz clic en el enlace que te enviamos a <strong>{user.email}</strong>. Sin verificar no podrás generar ni publicar.
              </span>
              <button
                onClick={handleResendVerification}
                disabled={resendingVerification}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 shrink-0"
              >
                {resendingVerification ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Reenviar
              </button>
            </div>
          )}

          {/* Platform alerts banner — dismissible, shown for each unread alert */}
          {platformAlerts.map(alert => (
            <div key={alert.id} className="sticky top-0 z-20 flex items-start gap-3 px-4 py-3 bg-red-500/10 border-b border-red-400/30 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-red-300 font-semibold leading-tight">{alert.title}</p>
                <p className="text-red-200/80 text-xs mt-0.5 leading-relaxed">{alert.message}</p>
              </div>
              <button
                onClick={() => handleDismissAlert(alert.id)}
                disabled={dismissingAlert === alert.id}
                className="shrink-0 p-1 rounded hover:bg-white/10 text-red-400 hover:text-red-200 transition-colors disabled:opacity-50"
                title="Descartar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full relative z-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
          <SupportChatWidget />
        </main>
      </div>

      {/* Email verification required modal */}
      {emailVerifyBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="max-w-md w-full bg-card border border-amber-400/30 rounded-2xl p-8 shadow-2xl text-center space-y-4">
            <div className="text-5xl">✉️</div>
            <h2 className="text-xl font-bold text-white">Verifica tu correo</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Para generar y publicar contenido necesitas verificar tu correo electrónico. Revisa tu bandeja de entrada (y la carpeta de spam) en <strong className="text-amber-300">{user?.email}</strong>.
            </p>
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={handleResendVerification}
                disabled={resendingVerification}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gradient-to-r from-[#0077FF] to-[#00C2FF] text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {resendingVerification ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Reenviar correo de verificación
              </button>
              <button
                onClick={() => setEmailVerifyBlocked(false)}
                className="px-6 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
}
