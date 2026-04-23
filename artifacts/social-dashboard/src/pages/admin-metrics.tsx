import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Link } from "wouter";
import {
  Users, CreditCard, Zap, Image, TrendingUp, Building2,
  RefreshCw, ArrowLeft, Handshake, Gift, FileText,
  Activity, DollarSign, UserCheck, UserX, BarChart3,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

// ── Generation costs types ────────────────────────────────────────────────────
type CostPeriod = "today" | "week" | "biweekly" | "month";

interface CostByType {
  type: string;
  count: number;
  totalCostUsd: number;
  avgCostUsd: number;
  informational?: boolean;
}

interface TimeSeriesDay {
  date: string;
  costUsd: number;
  [type: string]: number | string;
}

interface GenerationCosts {
  period: CostPeriod;
  from: string;
  to: string;
  seriesDays: number;
  byType: CostByType[];
  totalCount: number;
  totalCostUsd: number;
  timeSeries: TimeSeriesDay[];
}

const PERIOD_LABELS: Record<CostPeriod, string> = {
  today: "Hoy",
  week: "Semana",
  biweekly: "Quincena",
  month: "Mes",
};

const TYPE_LABELS: Record<string, string> = {
  image:      "Imagen",
  story:      "Story",
  carousel:   "Carousel",
  reel:       "Reel",
  element_ai: "IA + Elemento",
};

const TYPE_COLORS: Record<string, string> = {
  image:      "#00C2FF",
  story:      "#00C952",
  carousel:   "#A259FF",
  reel:       "#FF6B35",
  element_ai: "#FF3CAC",
};

const TYPE_EMOJI: Record<string, string> = {
  image:      "🖼",
  story:      "📖",
  carousel:   "🎠",
  reel:       "🎬",
  element_ai: "🧩",
};

const PLAN_LABELS: Record<string, string> = { free: "Free", starter: "Starter", business: "Business", agency: "Agencia" };
const PLAN_COLORS: Record<string, string> = {
  free: "bg-zinc-500/20 text-zinc-400",
  starter: "bg-blue-500/20 text-blue-400",
  business: "bg-violet-500/20 text-violet-400",
  agency: "bg-amber-500/20 text-amber-400",
};

function fmt(n: number) {
  return n.toLocaleString("es-CO");
}
function cop(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

function Sparkline({ data, color = "#00C2FF" }: { data: { day: string; cnt: number }[]; color?: string }) {
  if (!data.length) return <div className="h-14 flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>;
  const max = Math.max(...data.map(d => d.cnt), 1);
  const W = 280, H = 56, pad = 4;
  const pts = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (W - 2 * pad);
    const y = H - pad - ((d.cnt / max) * (H - 2 * pad));
    return `${x},${y}`;
  });
  const area = [...pts.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)), `L${W - pad},${H - pad}`, `L${pad},${H - pad}`, "Z"].join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
      <path d={area} fill={color} fillOpacity="0.15" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={+pts[i].split(",")[0]} cy={+pts[i].split(",")[1]} r="2" fill={color} />
      ))}
    </svg>
  );
}

interface Metrics {
  mrr: number;
  paidUsers: number;
  freeUsers: number;
  totalActive: number;
  conversionRate: number;
  newUsers7d: number;
  newUsers30d: number;
  credits: { issued: number; consumed: number; avgRemaining: number; utilizationPct: number };
  posts: { total: number; last7d: number; last30d: number };
  images: { total: number };
  businesses: number;
  planBreakdown: Array<{ plan: string; status: string; cnt: number }>;
  subStatuses: Array<{ status: string; cnt: number }>;
  referrals: { rows: Array<{ status: string; cnt: number }>; total: number };
  affiliates: { rows: Array<{ status: string; cnt: number }>; total: number };
  postsPerDay: Array<{ day: string; cnt: number }>;
  usersPerDay: Array<{ day: string; cnt: number }>;
}

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className={`w-4 h-4 ${color}`} />
        {label}
      </div>
      <div className="text-2xl font-bold font-poppins tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Generation Costs Section component ───────────────────────────────────────

function GenerationCostsSection() {
  const [period, setPeriod] = useState<CostPeriod>("today");
  const [data, setData] = useState<GenerationCosts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (p: CostPeriod) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${BASE}/api/admin/metrics/generation-costs?period=${p}`, { credentials: "include" });
      if (!r.ok) throw new Error("Error cargando costos");
      setData(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(period); }, [period]);

  // Compute simple bar chart from timeSeries (last 30 days)
  const allTypes = Array.from(
    new Set((data?.timeSeries ?? []).flatMap(d => Object.keys(d).filter(k => k !== "date" && k !== "costUsd")))
  );
  const seriesData = data?.timeSeries ?? [];
  const maxDailyCount = Math.max(...seriesData.map(d => allTypes.reduce((s, t) => s + (Number(d[t]) || 0), 0)), 1);

  const usd = (v: number) => `$${v.toFixed(v >= 0.1 ? 2 : 4)} USD`;

  return (
    <section className="rounded-xl border border-border/40 bg-card/50 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold">Costos de Generación IA</h2>
        </div>
        <div className="flex items-center gap-1">
          {(["today", "week", "biweekly", "month"] as CostPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${period === p ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground bg-background/40 hover:bg-background/80"}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Cargando...
        </div>
      )}
      {error && <div className="text-red-400 text-sm p-3">{error}</div>}

      {!loading && data && (
        <>
          {/* Tabla por tipo */}
          {data.byType.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sin publicaciones generadas en este período.</p>
          ) : (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-4">Tipo</th>
                    <th className="text-right py-2 pr-4">Cantidad</th>
                    <th className="text-right py-2 pr-4">Costo total</th>
                    <th className="text-right py-2">Costo promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byType.map(row => (
                    <tr key={row.type} className={`border-b border-border/20 hover:bg-background/20 transition-colors ${row.informational ? "opacity-70" : ""}`}>
                      <td className="py-2.5 pr-4 font-medium">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: TYPE_COLORS[row.type] ?? "#888" }}
                          />
                          {TYPE_EMOJI[row.type] ?? ""} {TYPE_LABELS[row.type] ?? row.type}
                          {row.informational && <span className="text-[9px] text-muted-foreground ml-1">(ya en totales)</span>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{row.count.toLocaleString("es-CO")}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-amber-400 font-semibold">{usd(row.totalCostUsd)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{usd(row.avgCostUsd)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/40 font-semibold text-sm">
                    <td className="py-2.5 pr-4">TOTAL</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{data.totalCount.toLocaleString("es-CO")}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-primary">{usd(data.totalCostUsd)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Gráfico de barras apiladas — últimos 30 días */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5" /> Publicaciones por día (últimos {data.seriesDays} días)
            </div>
            {seriesData.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos para mostrar</p>
            ) : (
              <>
                {/* Leyenda */}
                <div className="flex flex-wrap gap-3 mb-3">
                  {allTypes.map(t => (
                    <div key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TYPE_COLORS[t] ?? "#888" }} />
                      {TYPE_EMOJI[t] ?? ""} {TYPE_LABELS[t] ?? t}
                    </div>
                  ))}
                </div>
                {/* Barras */}
                <div className="flex items-end gap-px h-28 overflow-x-auto">
                  {seriesData.map(day => {
                    const total = allTypes.reduce((s, t) => s + (Number(day[t]) || 0), 0);
                    const barH = total > 0 ? (total / maxDailyCount) * 100 : 0;
                    return (
                      <div
                        key={day.date}
                        className="flex flex-col-reverse items-center justify-start group relative"
                        style={{ minWidth: "14px", flex: 1, height: "112px" }}
                        title={`${day.date}: ${total} posts, ${usd(Number(day.costUsd))}`}
                      >
                        {total > 0 && (
                          <div
                            className="w-full rounded-t overflow-hidden flex flex-col-reverse gap-px"
                            style={{ height: `${barH}%` }}
                          >
                            {allTypes.map(t => {
                              const count = Number(day[t]) || 0;
                              const pct = count > 0 ? (count / total) * 100 : 0;
                              return pct > 0 ? (
                                <div
                                  key={t}
                                  style={{ height: `${pct}%`, backgroundColor: TYPE_COLORS[t] ?? "#888" }}
                                  className="w-full opacity-85 group-hover:opacity-100 transition-opacity"
                                />
                              ) : null;
                            })}
                          </div>
                        )}
                        {/* Fecha — solo para primero del mes */}
                        {day.date.endsWith("-01") && (
                          <span className="absolute -bottom-4 text-[9px] text-muted-foreground/60 whitespace-nowrap"
                            style={{ left: "50%", transform: "translateX(-50%)" }}>
                            {day.date.slice(5, 10)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Costo total visibles del gráfico */}
                <div className="mt-6 text-xs text-muted-foreground">
                  Costo total últimos {data.seriesDays} días:{" "}
                  <span className="text-amber-400 font-semibold">
                    {usd(seriesData.reduce((s, d) => s + Number(d.costUsd), 0))}
                  </span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AdminMetricsContent() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/metrics`, { credentials: "include" });
      if (!r.ok) throw new Error("Error cargando métricas");
      setMetrics(await r.json());
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-96 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando métricas...
    </div>
  );
  if (error || !metrics) return (
    <div className="flex items-center justify-center h-96 text-red-400">{error || "Sin datos"}</div>
  );

  const activePlanRows = metrics.planBreakdown.filter(r => r.status === "active");
  const planMap: Record<string, number> = {};
  for (const r of activePlanRows) planMap[r.plan] = (planMap[r.plan] || 0) + r.cnt;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-poppins">Panel de Control</h1>
            <p className="text-sm text-muted-foreground">
              {lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString("es-CO")}` : "Métricas del sistema"}
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border/40 text-sm hover:bg-card/80 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* MRR & Negocio */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Negocio</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-primary/30 bg-primary/5 p-5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-primary/80">
              <DollarSign className="w-4 h-4 text-primary" /> MRR Estimado
            </div>
            <div className="text-3xl font-bold font-poppins text-primary">{cop(metrics.mrr)}</div>
            <div className="text-xs text-muted-foreground">{fmt(metrics.mrr)} COP / mes</div>
          </div>
          <StatCard icon={UserCheck} label="Usuarios de pago" value={fmt(metrics.paidUsers)} sub={`${metrics.conversionRate}% del total activo`} color="text-green-400" />
          <StatCard icon={UserX} label="Usuarios Free" value={fmt(metrics.freeUsers)} sub="Sin generar ingresos" color="text-zinc-400" />
          <StatCard icon={TrendingUp} label="Nuevos (30 días)" value={fmt(metrics.newUsers30d)} sub={`${fmt(metrics.newUsers7d)} en los últimos 7 días`} color="text-secondary" />
        </div>
      </section>

      {/* Usuarios por plan */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Distribución de Planes</h2>
        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(["free","starter","business","agency"] as const).map(plan => (
              <div key={plan} className="flex flex-col gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full w-fit font-medium ${PLAN_COLORS[plan]}`}>{PLAN_LABELS[plan]}</span>
                <span className="text-2xl font-bold font-poppins">{fmt(planMap[plan] || 0)}</span>
                <span className="text-xs text-muted-foreground">usuarios activos</span>
              </div>
            ))}
          </div>
          {/* Simple bar */}
          <div className="mt-4 h-3 rounded-full bg-border/20 flex overflow-hidden">
            {(["free","starter","business","agency"] as const).map(plan => {
              const pct = metrics.totalActive > 0 ? ((planMap[plan] || 0) / metrics.totalActive) * 100 : 0;
              const barColors: Record<string,string> = { free: "bg-zinc-500", starter: "bg-blue-500", business: "bg-violet-500", agency: "bg-amber-500" };
              return pct > 0 ? <div key={plan} style={{ width: `${pct}%` }} className={`${barColors[plan]} transition-all`} title={`${PLAN_LABELS[plan]}: ${fmt(planMap[plan] || 0)}`} /> : null;
            })}
          </div>
        </div>
      </section>

      {/* Gráficas */}
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <BarChart3 className="w-4 h-4 text-secondary" /> Posts generados (30 días)
          </div>
          <Sparkline data={metrics.postsPerDay} color="#00C2FF" />
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span><span className="text-foreground font-semibold">{fmt(metrics.posts.last7d)}</span> esta semana</span>
            <span><span className="text-foreground font-semibold">{fmt(metrics.posts.last30d)}</span> este mes</span>
            <span><span className="text-foreground font-semibold">{fmt(metrics.posts.total)}</span> total</span>
          </div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <Users className="w-4 h-4 text-primary" /> Nuevos usuarios (30 días)
          </div>
          <Sparkline data={metrics.usersPerDay} color="#00C952" />
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span><span className="text-foreground font-semibold">{fmt(metrics.newUsers7d)}</span> esta semana</span>
            <span><span className="text-foreground font-semibold">{fmt(metrics.newUsers30d)}</span> este mes</span>
            <span><span className="text-foreground font-semibold">{fmt(metrics.totalActive)}</span> total activos</span>
          </div>
        </div>
      </section>

      {/* Recursos / Consumo */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Consumo de Recursos IA</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/40 bg-card/50 p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <Zap className="w-4 h-4 text-amber-400" /> Créditos IA
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Emitidos</span>
                <span className="font-semibold">{fmt(metrics.credits.issued)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Consumidos</span>
                <span className="font-semibold text-amber-400">{fmt(metrics.credits.consumed)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Restantes (prom.)</span>
                <span className="font-semibold text-green-400">{fmt(metrics.credits.avgRemaining)}</span>
              </div>
              <div className="h-2 rounded-full bg-border/20 mt-2">
                <div
                  style={{ width: `${metrics.credits.utilizationPct}%` }}
                  className="h-full rounded-full bg-amber-500 transition-all"
                />
              </div>
              <div className="text-xs text-muted-foreground text-right">{metrics.credits.utilizationPct}% utilización</div>
            </div>
          </div>

          <StatCard icon={FileText} label="Posts generados" value={fmt(metrics.posts.total)} sub={`${fmt(metrics.posts.last30d)} en los últimos 30 días`} color="text-secondary" />
          <StatCard icon={Image} label="Variantes de imagen" value={fmt(metrics.images.total)} sub="Total generadas desde el inicio" color="text-violet-400" />
        </div>
      </section>

      {/* Crecimiento */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Crecimiento y Referidos</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <StatCard icon={Building2} label="Negocios registrados" value={fmt(metrics.businesses)} sub="Perfil de marca activo" color="text-blue-400" />
          <div className="rounded-xl border border-border/40 bg-card/50 p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <Gift className="w-4 h-4 text-pink-400" /> Referidos
            </div>
            {metrics.referrals.total === 0
              ? <p className="text-sm text-muted-foreground">Sin conversiones aún</p>
              : metrics.referrals.rows.map(r => (
                  <div key={r.status} className="flex justify-between text-sm py-0.5">
                    <span className="capitalize text-muted-foreground">{r.status}</span>
                    <span className="font-semibold">{r.cnt}</span>
                  </div>
                ))
            }
            <div className="border-t border-border/30 mt-2 pt-2 text-sm flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{fmt(metrics.referrals.total)}</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <Handshake className="w-4 h-4 text-teal-400" /> Afiliados
            </div>
            {metrics.affiliates.total === 0
              ? <p className="text-sm text-muted-foreground">Sin solicitudes aún</p>
              : metrics.affiliates.rows.map(r => (
                  <div key={r.status} className="flex justify-between text-sm py-0.5">
                    <span className="capitalize text-muted-foreground">{r.status}</span>
                    <span className="font-semibold">{r.cnt}</span>
                  </div>
                ))
            }
            <div className="border-t border-border/30 mt-2 pt-2 text-sm flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{fmt(metrics.affiliates.total)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Costos de Generación */}
      <GenerationCostsSection />

      {/* Rentabilidad */}
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold font-poppins">¿Es rentable el plan actual?</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">MRR estimado</p>
            <p className="text-2xl font-bold text-primary">{cop(metrics.mrr)}</p>
            <p className="text-xs text-muted-foreground mt-1">{fmt(metrics.mrr)} COP con {fmt(metrics.paidUsers)} usuarios de pago</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Conversión free → pago</p>
            <p className="text-2xl font-bold">{metrics.conversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.conversionRate < 5 ? "Por debajo del promedio SaaS (5-10%)" : metrics.conversionRate < 15 ? "Dentro del rango SaaS (5-15%)" : "Excelente — por encima del promedio"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Uso de créditos IA</p>
            <p className="text-2xl font-bold">{metrics.credits.utilizationPct}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.credits.utilizationPct > 80 ? "Alto consumo — revisar umbrales por plan" : metrics.credits.utilizationPct > 50 ? "Consumo moderado, bien balanceado" : "Bajo consumo — los usuarios aún no explotan la IA"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AdminMetrics() {
  return (
    <ProtectedRoute adminOnly>
      <AdminMetricsContent />
    </ProtectedRoute>
  );
}
