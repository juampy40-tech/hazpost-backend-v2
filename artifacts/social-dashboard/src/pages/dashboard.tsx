import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBusinessPosts } from "@/hooks/useBusinessPosts";
import { LayoutDashboard, CheckCircle2, Clock, Upload, Plus, Sparkles, Info, Zap, X, BrainCircuit, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface HealthStatus {
  status: string;
  uptimeSec: number;
  socialConnections: Record<string, number>;
  checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }>;
  timestamp: string;
}

export default function Dashboard() {
  const { data: posts, isLoading } = useBusinessPosts({ slim: '1' });
  const activeBusiness = useActiveBusiness();
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [apisBannerDismissed, setApisBannerDismissed] = useState(() =>
    localStorage.getItem("hz_apis_banner_dismissed") === "1"
  );
  const [aiSettings, setAiSettings] = useState<{ autoGen: boolean; freq: string } | null>(null);
  const [aiActivating, setAiActivating] = useState(false);
  const [aiBannerDismissed, setAiBannerDismissed] = useState(() =>
    localStorage.getItem("hz_ai_banner_dismissed") === "1"
  );
  const [socialAccounts, setSocialAccounts] = useState<Array<{ id: number; platform: string; username: string | null; businessId: number | null; connected?: string }>>([]);
  const [socialAccountsLoaded, setSocialAccountsLoaded] = useState(false);

useEffect(() => {
  (async () => {
    try {
      const [health, settings] = await Promise.all([
        apiFetch("/api/health/status"),
        apiFetch("/api/settings"),
      ]);

      setHealthStatus(health);

      setAiSettings({
        autoGen:
          settings["aiEnabled"] === true ||
          settings["auto_generation"] === true ||
          settings["auto_generation"] === "true",
        freq: String(
          settings["frequency"] ??
          settings["generation_frequency"] ??
          "daily"
        ),
      });
    } catch (e) {
      console.error("Error loading dashboard data", e);
    }
  })();
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

  async function handleActivateAI() {
    setAiActivating(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled: true, frequency: "daily" }),
      });
      setAiSettings(prev => prev ? { ...prev, autoGen: true } : { autoGen: true, freq: "daily" });
    } catch {}
    setAiActivating(false);
  }

  const stats = React.useMemo(() => {
    if (!posts) return { total: 0, pending: 0, published: 0, scheduled: 0 };
    return {
      total: posts.length,
      pending: posts.filter(p => p.status === 'pending_approval').length,
      published: posts.filter(p => p.status === 'published').length,
      scheduled: posts.filter(p => p.status === 'scheduled').length,
    };
  }, [posts]);

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary mb-2 drop-shadow-[0_0_15px_rgba(0,201,83,0.3)]">
            Centro de Mando
          </h1>
          <p className="text-muted-foreground font-medium tracking-wide">Resumen de tu actividad en redes sociales. Desde aquí puedes ver el estado de todo tu contenido de un vistazo.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/generate" className="flex items-center gap-2 bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/30 px-4 py-2 rounded-md font-medium transition-all duration-300 shadow-[0_0_10px_rgba(0,176,255,0.1)] hover:shadow-[0_0_15px_rgba(0,176,255,0.3)]" data-testid="btn-quick-generate">
            <Plus className="w-4 h-4" /> Generar Masivo
          </Link>
          <Link href="/approval" className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 px-4 py-2 rounded-md font-medium transition-all duration-300 shadow-[0_0_10px_rgba(0,201,83,0.1)] hover:shadow-[0_0_15px_rgba(0,201,83,0.3)]" data-testid="btn-quick-approve">
            <CheckCircle2 className="w-4 h-4" /> Cola ({stats.pending})
          </Link>
        </div>
      </div>

      {/* ── Guía rápida del flujo ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { step: "1", icon: "✨", title: "Generar", desc: "La IA crea imágenes y textos listos para publicar según tus nichos de negocio.", href: "/generate" },
          { step: "2", icon: "👀", title: "Aprobar", desc: "Revisa cada publicación, ajusta el texto, cambia el fondo o el tipo de post antes de aceptarla.", href: "/approval" },
          { step: "3", icon: "📅", title: "Programar", desc: "Los posts aprobados quedan en el calendario. Puedes moverlos al día y hora que prefieras.", href: "/calendar" },
          { step: "4", icon: "🚀", title: "Publicar", desc: "El sistema publica automáticamente en Instagram, TikTok y Facebook en la fecha y hora programada.", href: "/history" },
        ].map(item => (
          <Link key={item.step} href={item.href} className="group relative flex flex-col gap-1.5 p-3 rounded-xl border border-border/30 bg-white/[0.02] hover:bg-white/[0.05] hover:border-primary/30 transition-all">
            <div className="flex items-center gap-2">
              <span className="text-base">{item.icon}</span>
              <span className="text-xs font-bold text-primary/60 uppercase tracking-widest">Paso {item.step}</span>
            </div>
            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.title}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
          </Link>
        ))}
      </div>

     {/* — Estado IA — */}
{aiSettings?.autoGen ? (
  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/5 w-fit">
    <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(20,201,183,0.8)]" />
    <span className="text-xs font-semibold text-primary">IA activa</span>
    <span className="text-xs text-muted-foreground">
      — Generando contenido{" "}
      {aiSettings.freq === "daily"
        ? "diariamente"
        : aiSettings.freq === "3x_week"
        ? "3x por semana"
        : "semanalmente"}
    </span>
    <Link href="/settings" className="text-xs text-primary/60 hover:text-primary underline ml-1">
      Cambiar
    </Link>
  </div>
) : (
  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-400/40 bg-amber-500/10 w-fit">
    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
    <span className="text-xs font-semibold text-amber-300">
      Tu IA está dormida
    </span>
    <span className="text-xs text-muted-foreground">
      — Actívala para generar contenido automáticamente
    </span>
  </div>
)}

      {/* ── Banner: IA dormida ── */}
      {aiSettings && !aiSettings.autoGen && !aiBannerDismissed && (
        <div className="relative rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-black/40 to-amber-500/5 p-5">
          <button
            onClick={() => { localStorage.setItem("hz_ai_banner_dismissed", "1"); setAiBannerDismissed(true); }}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3 mb-4">
            <BrainCircuit className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-300">🚀 Activa tu IA y empieza a generar contenido automáticamente</p>
              <p className="text-xs text-muted-foreground mt-1">
                Configura la frecuencia y HazPost creará posts listos para aprobar sin esfuerzo.
                Esto es <strong className="text-amber-300">la clave de HazPost</strong>: contenido constante en piloto automático.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              disabled={aiActivating}
              onClick={handleActivateAI}
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)]"
            >
              {aiActivating ? (
                <><span className="w-3 h-3 border-2 border-black/40 border-t-black rounded-full animate-spin mr-2" /> Activando...</>
              ) : (
                <><Zap className="w-3.5 h-3.5 mr-2" /> Activar piloto automático</>
              )}
            </Button>
            <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
              Personalizar frecuencia
            </Link>
          </div>
        </div>
      )}

      {/* ── Banner: negocio activo sin cuentas sociales conectadas ── */}
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
                Ve a <Link href="/settings" className="underline underline-offset-2 hover:text-yellow-300 transition-colors">Configuración → Cuentas Sociales</Link> para conectar Instagram o TikTok.
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Banner: conectar APIs ── */}
      {healthStatus && !apisBannerDismissed && !healthStatus.checks.instagram?.ok && !healthStatus.checks.tiktok?.ok && (
        <div className="relative rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 via-black/40 to-cyan-500/5 p-5">
          <button
            onClick={() => { localStorage.setItem("hz_apis_banner_dismissed", "1"); setApisBannerDismissed(true); }}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3 mb-4">
            <Zap className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-cyan-300">Desbloquea el 100% de HazPost — conecta tus APIs</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sin conexión solo puedes generar contenido. Con las APIs activas automatizas todo.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-1.5 pr-4 text-muted-foreground font-medium">Función</th>
                  <th className="text-center py-1.5 px-3 text-red-400 font-medium">Sin API</th>
                  <th className="text-center py-1.5 px-3 text-cyan-400 font-medium">Con API</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  ["Publicación automática", "❌ Manual", "✅ Automática"],
                  ["Estadísticas de alcance y likes", "❌ No disponibles", "✅ Se importan"],
                  ["Verificar si un post se publicó", "❌ No", "✅ Sí"],
                  ["Ver qué contenido funciona mejor", "❌ No", "✅ Sí (datos reales)"],
                ].map(([feat, no, yes]) => (
                  <tr key={feat}>
                    <td className="py-1.5 pr-4 text-muted-foreground">{feat}</td>
                    <td className="py-1.5 px-3 text-center text-red-400/80">{no}</td>
                    <td className="py-1.5 px-3 text-center text-green-400">{yes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Link href="/settings" className="inline-flex items-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 px-4 py-2 rounded-lg text-xs font-semibold transition-all">
              <Zap className="w-3.5 h-3.5" /> Conectar APIs ahora
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Posts Activos", value: stats.total, icon: LayoutDashboard, color: "text-foreground", border: "border-border/50", hint: "Suma de todos los posts: pendientes, programados y publicados." },
          { label: "Pendientes de Aprobación", value: stats.pending, icon: CheckCircle2, color: "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]", border: "border-amber-400/30", hint: "Posts generados que aún no has revisado. Entra a 'Cola de Aprobación' para verlos." },
          { label: "Programados", value: stats.scheduled, icon: Clock, color: "text-secondary drop-shadow-[0_0_8px_rgba(0,176,255,0.5)]", border: "border-secondary/30", hint: "Posts aprobados esperando su fecha y hora de publicación." },
          { label: "Publicados (30d)", value: stats.published, icon: Upload, color: "text-primary drop-shadow-[0_0_8px_rgba(0,201,83,0.5)]", border: "border-primary/30", hint: "Posts publicados exitosamente en los últimos 30 días." },
        ].map((stat, i) => (
          <Card key={i} className={`glass-card ${stat.border} overflow-hidden group`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</CardTitle>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-8 w-16 bg-primary/20 animate-pulse rounded mt-1"></div>
              ) : (
                <div className={`text-3xl font-display font-bold ${stat.color}`}>{stat.value}</div>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-1 leading-relaxed">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass-card lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle className="font-display text-xl tracking-wide flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(0,176,255,0.8)]"></div>
              Actividad Reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground border-t border-border/30 bg-black/20">
            {isLoading ? (
               <div className="space-y-4 w-full max-w-md">
                 {[1,2,3].map(i => (
                   <div key={i} className="h-16 w-full bg-white/5 rounded-md animate-pulse"></div>
                 ))}
               </div>
            ) : posts && posts.length > 0 ? (
               <div className="w-full space-y-4">
                 {posts.slice(0, 5).map(post => (
                   <div key={post.id} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/5 hover:border-primary/30 transition-colors">
                     <div className="flex items-center gap-4">
                       <div className={`w-2 h-2 rounded-full ${post.status === 'published' ? 'bg-primary' : post.status === 'scheduled' ? 'bg-secondary' : 'bg-amber-400'}`}></div>
                       <span className="font-medium text-sm">{post.caption.substring(0, 40)}...</span>
                     </div>
                     <span className="text-xs text-muted-foreground uppercase tracking-wider px-2 py-1 bg-black/40 rounded border border-white/10">{post.platform}</span>
                   </div>
                 ))}
               </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Sparkles className="w-12 h-12 text-primary/30" />
                <p className="max-w-xs leading-relaxed">La red está en silencio. Genera nuevo contenido solar y electriza a tu audiencia.</p>
                <Link href="/generate" className="mt-2 text-primary hover:text-primary/80 transition-colors text-sm font-medium uppercase tracking-widest border-b border-primary/30 pb-1">
                  Iniciar Generador
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="glass-card flex flex-col">
          <CardHeader>
            <CardTitle className="font-display text-xl tracking-wide flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${healthStatus ? (healthStatus.status === "operational" ? "bg-primary shadow-[0_0_8px_rgba(0,201,83,0.8)]" : "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]") : "bg-muted"}`}></div>
              Estado del Sistema
              {healthStatus && (
                <span className={`ml-auto text-xs font-normal px-2 py-0.5 rounded-full ${healthStatus.status === "operational" ? "bg-primary/15 text-primary" : "bg-orange-500/15 text-orange-400"}`}>
                  {healthStatus.status === "operational" ? "Operacional" : "Degradado"}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t border-border/30 bg-black/20 flex-1">
            {[
              { key: "database",  label: "Base de datos",        icon: "🗄️" },
              { key: "instagram", label: "Instagram API",         icon: "📸" },
              { key: "tiktok",    label: "TikTok API",            icon: "🎵" },
              { key: "facebook",  label: "Facebook Cross-post",   icon: "📘" },
            ].map(item => {
              const check = healthStatus?.checks?.[item.key];
              const isOk = check?.ok !== false;
              return (
                <div key={item.key}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <span>{item.icon}</span> {item.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {check?.latencyMs && <span className="text-[10px] text-muted-foreground/50">{check.latencyMs}ms</span>}
                      <span className={`text-xs font-bold uppercase tracking-wider ${isOk ? "text-primary" : "text-red-400"}`}>
                        {!healthStatus ? "—" : isOk ? "En línea" : "Error"}
                      </span>
                    </div>
                  </div>
                  <div className="h-1 w-full bg-black rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${isOk ? "bg-primary shadow-[0_0_8px_rgba(0,201,83,0.8)]" : "bg-red-500"} ${!healthStatus ? "w-1/4 animate-pulse" : "w-full"}`} />
                  </div>
                </div>
              );
            })}
            {healthStatus && (
              <p className="text-[10px] text-muted-foreground/40 text-right pt-1">
                Uptime: {Math.floor(healthStatus.uptimeSec / 3600)}h {Math.floor((healthStatus.uptimeSec % 3600) / 60)}m
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
