import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, ReferenceLine,
} from "recharts";
import { TrendingUp, Heart, MessageCircle, Share2, Eye, Bookmark, CheckCircle2,
  Clock, AlertCircle, Send, Brain, Star, Edit2, Check, X, BarChart2, Instagram, PlaySquare, RefreshCw, Users, Hash, Zap, CalendarDays, Target, FileDown } from "lucide-react";
import { useUpdatePostMetrics } from "@workspace/api-client-react";
import type { AnalyticsSummary } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";
import { exportarReportePDF, generarPeriodoCustom } from "@/lib/exportPdf";
import html2canvas from "html2canvas";

interface UserBusiness { id: number; name?: string | null; isDefault?: boolean; }
type AnalyticsBizScope = "all" | number | null;

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const CONTENT_LABELS: Record<string, string> = {
  image: "Imagen", reel: "Reel", carousel: "Carrusel", story: "Historia",
};
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", both: "Ambas",
};
const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C", tiktok: "#00F2EA", both: "#00C853",
};
const CONTENT_COLORS = ["#00C853", "#00B0FF", "#9C27B0", "#FF9800"];

function StatCard({ label, value, icon: Icon, color = "emerald", sub }: {
  label: string; value: string | number; icon: React.ElementType; color?: string; sub?: string;
}) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    blue:    "text-blue-400 bg-blue-400/10 border-blue-400/20",
    purple:  "text-purple-400 bg-purple-400/10 border-purple-400/20",
    orange:  "text-orange-400 bg-orange-400/10 border-orange-400/20",
    red:     "text-red-400 bg-red-400/10 border-red-400/20",
    cyan:    "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  };
  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colors[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-bold font-display text-foreground mb-1">
          {typeof value === "number" ? value.toLocaleString("es-CO") : value}
        </div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground/60 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function MetricsEditor({ postId, initial }: {
  postId: number;
  initial: { likes?: number | null; comments?: number | null; shares?: number | null; reach?: number | null; saves?: number | null };
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({
    likes:    String(initial.likes ?? ""),
    comments: String(initial.comments ?? ""),
    shares:   String(initial.shares ?? ""),
    reach:    String(initial.reach ?? ""),
    saves:    String(initial.saves ?? ""),
  });
  const updateMetrics = useUpdatePostMetrics();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSave = () => {
    const data = Object.fromEntries(
      Object.entries(vals).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])
    );
    updateMetrics.mutate({ id: postId, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
        toast({ title: "Métricas actualizadas" });
        setOpen(false);
      },
    });
  };

  if (!open) return (
    <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="text-muted-foreground hover:text-primary h-7 px-2">
      <Edit2 className="w-3 h-3 mr-1" /> Editar métricas
    </Button>
  );

  return (
    <div className="flex flex-wrap gap-2 items-end mt-2 p-3 bg-white/5 rounded-lg border border-border/30">
      {(["likes","comments","shares","reach","saves"] as const).map(k => (
        <div key={k} className="flex flex-col gap-1 w-20">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</Label>
          <Input
            type="number" min={0}
            value={vals[k]}
            onChange={e => setVals(v => ({ ...v, [k]: e.target.value }))}
            className="h-8 text-sm bg-background/40"
          />
        </div>
      ))}
      <div className="flex gap-1">
        <Button size="sm" onClick={handleSave} disabled={updateMetrics.isPending} className="h-8 bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30">
          {updateMetrics.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-8">
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function generateInsights(data: AnalyticsSummary | undefined) {
  if (!data) return [];
  const insights: { icon: string; title: string; detail: string; color: string }[] = [];

  const byContentType = data.byContentType ?? [];
  const byDayOfWeek   = data.byDayOfWeek   ?? [];
  const byPlatform    = data.byPlatform     ?? [];
  const overview      = data.overview       ?? { total: 0, published: 0, scheduled: 0, pending: 0, failed: 0, likes: 0, comments: 0, shares: 0, reach: 0 };

  // Best content type
  if (byContentType.length > 0) {
    const best = [...byContentType].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))[0];
    if (best && best.likes > 0) {
      insights.push({
        icon: "🏆",
        title: `${CONTENT_LABELS[best.contentType ?? ""] ?? best.contentType} genera más engagement`,
        detail: `Con ${best.likes.toLocaleString("es-CO")} likes en promedio, es tu formato más efectivo. Genera más de este tipo.`,
        color: "emerald",
      });
    }
  }

  // Best day of week
  if (byDayOfWeek.length > 0) {
    const bestDay = [...byDayOfWeek].sort((a, b) => b.likes - a.likes)[0];
    if (bestDay) {
      insights.push({
        icon: "📅",
        title: `${DAYS[bestDay.day]} es tu mejor día para publicar`,
        detail: `Tus publicaciones del ${DAYS[bestDay.day]} consiguen más alcance y likes. Prioriza ese día para contenido importante.`,
        color: "blue",
      });
    }
  }

  // Platform comparison
  const ig = byPlatform.find(p => p.platform === "instagram");
  const tt = byPlatform.find(p => p.platform === "tiktok");
  if (ig && tt) {
    if (ig.likes > tt.likes) {
      insights.push({
        icon: "📸",
        title: "Instagram tiene mejor engagement que TikTok",
        detail: `Invierte más en contenido de alta calidad para Instagram. TikTok necesita más volumen de publicaciones y tendencias.`,
        color: "purple",
      });
    } else if (tt.likes > ig.likes) {
      insights.push({
        icon: "🎵",
        title: "TikTok está superando a Instagram en alcance",
        detail: "Apuesta por más Reels e Historias con tendencias de audio para capitalizar el momentum en TikTok.",
        color: "cyan",
      });
    }
  }

  // Success rate
  const successRate = overview.published > 0 ? Math.round((overview.published / overview.total) * 100) : 0;
  if (overview.total > 0) {
    insights.push({
      icon: "✅",
      title: `${successRate}% de tasa de publicación exitosa`,
      detail: successRate >= 80
        ? "Excelente consistencia. Mantén el ritmo de publicación para maximizar el alcance orgánico."
        : "Aumenta las publicaciones aprobadas. El algoritmo premia la consistencia — al menos 1 post diario.",
      color: successRate >= 80 ? "emerald" : "orange",
    });
  }

  // Reach vs likes ratio
  if (overview.reach > 0 && overview.likes > 0) {
    const ctr = ((overview.likes / overview.reach) * 100).toFixed(1);
    insights.push({
      icon: "💡",
      title: `${ctr}% de tasa de engagement (likes/alcance)`,
      detail: Number(ctr) >= 3
        ? "Tu engagement rate es excelente. El contenido conecta bien con la audiencia caleña."
        : "El hook del contenido puede mejorar. Usa preguntas más provocadoras y datos más sorprendentes en la primera línea.",
      color: Number(ctr) >= 3 ? "emerald" : "orange",
    });
  }

  if (insights.length === 0) {
    insights.push({
      icon: "🚀",
      title: "Publica tus primeros posts para ver insights",
      detail: "Una vez publiques y registres métricas (likes, alcance, etc.), la IA analizará qué funciona y te dará recomendaciones personalizadas.",
      color: "blue",
    });
  }

  return insights;
}

type ContentInsights = {
  hasData: boolean;
  postsAnalyzed?: number;
  published?: number;
  typeRanking?: { type: string; avgRate: number; count: number; examples: string[] }[];
  top3?: { id: number; hook: string; contentType: string | null; likes: number | null; saves: number | null; reach: number | null; rate: number }[];
  bestDay?: { day: number; name: string } | null;
  trendPct?: number;
};

type HashtagInsights = {
  hasData: boolean;
  hasEngagementData: boolean;
  totalPostsWithHashtags: number;
  totalUniqueTags: number;
  top: {
    tag: string; pool: string; frequency: number;
    engagedPosts: number; totalScore: number; totalReach: number;
    avgEngagementRate: number; tier: string;
  }[];
  byPool: { pool: string; count: number; totalRate: number; avgRate: number; tags: string[] }[];
};

type PublishingCadence = {
  weeks: { week: string; total: number; byType: Record<string, number> }[];
  currentWeekCount: number;
  avgPerWeek: number;
  totalInPeriod: number;
};

export default function Analytics() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { id: globalBizId, name: globalBizName, loaded: bizContextLoaded } = useActiveBusiness();

  // ── Social accounts — needed to gate the Meta permissions warning ──
  const [socialAccounts, setSocialAccounts] = useState<Array<{
    id: number; platform: string; username: string | null;
    businessId: number | null; connected?: string;
  }>>([]);
  const [socialAccountsLoaded, setSocialAccountsLoaded] = useState(false);

  React.useEffect(() => {
    fetch(`${BASE}/api/social-accounts`, { credentials: "include" })
      .then(r => r.json())
      .then((d: { accounts?: typeof socialAccounts }) => {
        setSocialAccounts(d.accounts ?? []);
        setSocialAccountsLoaded(true);
      })
      .catch(() => setSocialAccountsLoaded(true));
  }, []);

  // ── Business selector scope (same pattern as Calendar) ──
  const [analyticsBizScope, setAnalyticsBizScope] = useState<AnalyticsBizScope>(null);
  const scopeInitialized = useRef(false);

  const { data: userBusinesses = [], isFetched: businessesFetched } = useQuery<UserBusiness[]>({
    queryKey: ["analytics-user-businesses"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/businesses`, { credentials: "include" });
      if (!res.ok) return [];
      const d = await res.json();
      return d.businesses ?? [];
    },
    staleTime: 60_000,
  });

  // Restore preference from localStorage on first load
  React.useEffect(() => {
    if (scopeInitialized.current || !user || !bizContextLoaded || !businessesFetched) return;
    // If businesses fetch completed but returned nothing, still allow analytics to load
    if (userBusinesses.length === 0) {
      setAnalyticsBizScope("all");
      scopeInitialized.current = true;
      return;
    }
    const storageKey = `hz_analytics_scope_${user.id}`;
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      if (saved === "all") {
        setAnalyticsBizScope("all");
      } else {
        const savedId = Number(saved);
        if (!isNaN(savedId) && userBusinesses.some(b => b.id === savedId)) {
          setAnalyticsBizScope(savedId);
        } else {
          const defaultBiz = (globalBizId ? userBusinesses.find(b => b.id === globalBizId) : null) ?? userBusinesses.find(b => b.isDefault) ?? userBusinesses[0];
          setAnalyticsBizScope(userBusinesses.length > 1 ? defaultBiz.id : "all");
        }
      }
    } else {
      if (userBusinesses.length > 1) {
        const defaultBiz = (globalBizId ? userBusinesses.find(b => b.id === globalBizId) : null) ?? userBusinesses.find(b => b.isDefault) ?? userBusinesses[0];
        setAnalyticsBizScope(defaultBiz.id);
      } else {
        setAnalyticsBizScope("all");
      }
    }
    scopeInitialized.current = true;
  }, [userBusinesses, businessesFetched, user, bizContextLoaded, globalBizId]);

  // Persist scope selection to localStorage
  React.useEffect(() => {
    if (!scopeInitialized.current || !user || analyticsBizScope === null) return;
    const storageKey = `hz_analytics_scope_${user.id}`;
    localStorage.setItem(storageKey, String(analyticsBizScope));
  }, [analyticsBizScope, user]);

  // Build query params for analytics API calls based on current scope
  function buildAnalyticsParams(): string {
    const params = new URLSearchParams();
    if (analyticsBizScope === "all") {
      params.set("allBusinesses", "1");
    } else if (analyticsBizScope !== null) {
      params.set("businessId", String(analyticsBizScope));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  }

  // Main analytics summary — custom query so we can pass the businessId param
  const { data, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["analytics-summary", analyticsBizScope],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/summary${buildAnalyticsParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando analytics");
      return res.json();
    },
    enabled: analyticsBizScope !== null,
  });

  const insights = generateInsights(data);
  const [syncingMetrics, setSyncingMetrics] = useState(false);
  const [refreshingAudience, setRefreshingAudience] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const _now = new Date();
  const [pdfMonth, setPdfMonth] = useState(_now.getMonth());
  const [pdfYear, setPdfYear] = useState(_now.getFullYear());
  const [sendingEmail, setSendingEmail] = useState(false);
  const [contentInsights, setContentInsights] = useState<ContentInsights | null>(null);
  const [hashtagInsights, setHashtagInsights] = useState<HashtagInsights | null>(null);
  const [cadence, setCadence] = useState<PublishingCadence | null>(null);

  const isPaidPlan = user?.plan && user.plan !== "free";

  // Business info — name for PDF/email reports
  const selectedBizName = analyticsBizScope !== null && analyticsBizScope !== "all"
    ? (userBusinesses.find(b => b.id === analyticsBizScope)?.name ?? globalBizName)
    : globalBizName;
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    async function loadLogo() {
      try {
        const bpRes = await fetch(`${BASE}/api/brand-profile`, { credentials: "include" });
        if (bpRes.ok) {
          const bp = await bpRes.json() as { logoUrl?: string | null };
          if (active && bp.logoUrl) setBusinessLogoUrl(bp.logoUrl);
        }
      } catch {}
    }
    if (user) loadLogo();
    return () => { active = false; };
  }, [user?.id]);

  const handleExportPdf = async () => {
    if (!isPaidPlan) return;
    setExportingPdf(true);
    try {
      let chartImage: string | null = null;
      const chartsEl = document.getElementById("analytics-charts-section");
      if (chartsEl) {
        try {
          const canvas = await html2canvas(chartsEl, {
            backgroundColor: "#0f172a",
            scale: 1.5,
            useCORS: true,
            logging: false,
          });
          chartImage = canvas.toDataURL("image/png");
        } catch {}
      }
      await exportarReportePDF({
        businessName: selectedBizName || user?.displayName || "Mi Negocio",
        logoUrl: businessLogoUrl,
        plan: user?.plan,
        period: generarPeriodoCustom(pdfYear, pdfMonth),
        data,
        insights,
        chartImage,
      });
      toast({ title: "PDF generado", description: "El reporte se descargó a tu dispositivo." });
    } catch (err) {
      toast({ title: "Error al generar PDF", description: String(err), variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleEmailReport = async () => {
    if (!isPaidPlan) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`${BASE}/api/analytics/email-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          period: generarPeriodoCustom(pdfYear, pdfMonth),
          businessName: analyticsBizScope === "all"
            ? (user?.displayName || "Mi Negocio")
            : (selectedBizName || user?.displayName || "Mi Negocio"),
          ...(analyticsBizScope === "all"
            ? { allBusinesses: true }
            : typeof analyticsBizScope === "number"
              ? { businessId: analyticsBizScope }
              : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      toast({ title: "Reporte enviado", description: "Revisa tu correo electrónico." });
    } catch (err) {
      toast({ title: "Error al enviar reporte", description: String(err), variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  React.useEffect(() => {
    if (analyticsBizScope === null) return;
    const params = buildAnalyticsParams();
    fetch(`${BASE}/api/analytics/content-insights${params}`, { credentials: "include" })
      .then(r => r.json())
      .then((d: ContentInsights) => setContentInsights(d))
      .catch(() => {});
    fetch(`${BASE}/api/analytics/hashtag-insights${params}`, { credentials: "include" })
      .then(r => r.json())
      .then((d: HashtagInsights) => setHashtagInsights(d))
      .catch(() => {});
    fetch(`${BASE}/api/analytics/publishing-cadence${params}`, { credentials: "include" })
      .then(r => r.json())
      .then((d: PublishingCadence) => setCadence(d))
      .catch(() => {});
  }, [analyticsBizScope]);

  const handleSyncMetrics = async () => {
    setSyncingMetrics(true);
    try {
      const res = await fetch(`${BASE}/api/analytics/sync-metrics`, { method: "POST", credentials: "include" });
      const body = await res.json() as { synced?: number; errors?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Error al sincronizar");
      queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
      const synced = body.synced ?? 0;
      if (synced === 0 && hasMetaConnected) {
        toast({
          title: "0 publicaciones actualizadas",
          description: "Puede ser que falten permisos de instagram_manage_insights. Prueba desconectando y reconectando Meta en Configuración.",
          action: (
            <ToastAction altText="Ir a Configuración" onClick={() => navigate("/settings")}>
              Ir a Configuración
            </ToastAction>
          ),
        });
      } else {
        toast({ title: "Métricas sincronizadas", description: `${synced} publicaciones actualizadas desde Instagram` });
      }
    } catch (err) {
      toast({ title: "Error al sincronizar", description: String(err), variant: "destructive" });
    } finally {
      setSyncingMetrics(false);
    }
  };

  const handleRefreshAudience = async () => {
    setRefreshingAudience(true);
    try {
      const res = await fetch(`${BASE}/api/analytics/refresh-audience`, { method: "POST", credentials: "include" });
      const body = await res.json() as { success?: boolean; error?: string; snapshot?: { account?: { followers_count?: number } } };
      if (!res.ok) throw new Error(body.error ?? "Error al actualizar");
      const followers = body.snapshot?.account?.followers_count;
      toast({
        title: "Audiencia actualizada",
        description: `Snapshot guardado${followers ? ` — ${followers.toLocaleString("es-CO")} seguidores` : ""}. Próxima actualización automática en ~15 días.`
      });
    } catch (err) {
      toast({ title: "Error al actualizar audiencia", description: String(err), variant: "destructive" });
    } finally {
      setRefreshingAudience(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(0,201,83,0.5)]" />
      </div>
    );
  }

  const ov = data?.overview ?? { total: 0, published: 0, scheduled: 0, pending: 0, failed: 0, likes: 0, comments: 0, shares: 0, reach: 0, saves: 0 };

  // Show the Meta permissions banner only when Meta IS connected — if not connected, 0 likes is expected
  const hasMetaConnected = !socialAccountsLoaded ? false
    : analyticsBizScope === "all"
      ? socialAccounts.some(a =>
          (a.platform === "instagram" || a.platform === "both") && a.connected === "true")
      : socialAccounts.some(a =>
          a.businessId === analyticsBizScope &&
          (a.platform === "instagram" || a.platform === "both") &&
          a.connected === "true");

  const dayChartData = DAYS.map((d, i) => {
    const found = data?.byDayOfWeek?.find(x => x.day === i);
    return { name: d, likes: found?.likes ?? 0, publicaciones: found?.count ?? 0 };
  });

  const hourChartData = Array.from({ length: 24 }, (_, i) => {
    const found = data?.byHour?.find(x => x.hour === i);
    return { hora: `${i}h`, likes: found?.likes ?? 0, publicaciones: found?.count ?? 0 };
  }).filter(d => d.hora >= "5h" && d.hora <= "23h");

  const contentChartData = (data?.byContentType ?? []).map(ct => ({
    name: CONTENT_LABELS[ct.contentType ?? ""] ?? ct.contentType,
    likes: ct.likes,
    alcance: ct.reach,
    publicaciones: ct.count,
  }));

  const insightColors: Record<string, string> = {
    emerald: "border-emerald-400/20 bg-emerald-400/5",
    blue:    "border-blue-400/20 bg-blue-400/5",
    purple:  "border-purple-400/20 bg-purple-400/5",
    orange:  "border-orange-400/20 bg-orange-400/5",
    cyan:    "border-cyan-400/20 bg-cyan-400/5",
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-primary drop-shadow-[0_0_8px_rgba(0,201,83,0.6)]" />
            Estadísticas & Aprendizaje
          </h1>
          <p className="text-muted-foreground mt-1">Descubre qué funciona y optimiza cada publicación futura</p>
          {selectedBizName && (
            <p className="text-sm text-primary/80 font-medium mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-primary/60" />
              {analyticsBizScope === "all" ? "Todos los negocios" : selectedBizName}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-wrap">
          {/* Business selector — visible only when user has more than one business */}
          {userBusinesses.length > 1 && (
            <div className="flex items-center gap-1 bg-card border border-border/50 p-1 rounded-lg">
              {userBusinesses.map(biz => (
                <Button
                  key={biz.id}
                  variant={analyticsBizScope === biz.id ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAnalyticsBizScope(biz.id)}
                  className={`text-xs max-w-[120px] truncate ${analyticsBizScope === biz.id ? "bg-primary text-primary-foreground" : ""}`}
                  title={biz.name ?? undefined}
                >
                  {biz.name ?? `Negocio ${biz.id}`}
                </Button>
              ))}
              <div className="w-px h-4 bg-border/60 mx-0.5 shrink-0" />
              <Button
                variant={analyticsBizScope === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAnalyticsBizScope("all")}
                className={`text-xs ${analyticsBizScope === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Todos
              </Button>
            </div>
          )}
          <div className="flex gap-2 flex-wrap justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncMetrics}
            disabled={syncingMetrics}
            className="border-primary/30 text-primary hover:bg-primary/10 gap-2"
          >
            {syncingMetrics
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Sincronizar métricas
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefreshAudience}
            disabled={refreshingAudience}
            className="border-blue-400/30 text-blue-400 hover:bg-blue-400/10 gap-2"
          >
            {refreshingAudience
              ? <Users className="w-3.5 h-3.5 animate-pulse" />
              : <Users className="w-3.5 h-3.5" />}
            Actualizar audiencia
          </Button>
          <div className="flex items-center gap-1 border border-violet-400/20 rounded-lg px-2 py-1 bg-violet-400/5">
            <CalendarDays className="w-3.5 h-3.5 text-violet-400/70 shrink-0" />
            <select
              value={pdfMonth}
              onChange={e => setPdfMonth(Number(e.target.value))}
              className="bg-transparent text-violet-300 text-xs border-none outline-none cursor-pointer"
              disabled={!isPaidPlan}
            >
              {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map((m, i) => (
                <option key={i} value={i} className="bg-slate-900">{m}</option>
              ))}
            </select>
            <select
              value={pdfYear}
              onChange={e => setPdfYear(Number(e.target.value))}
              className="bg-transparent text-violet-300 text-xs border-none outline-none cursor-pointer"
              disabled={!isPaidPlan}
            >
              {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                <option key={y} value={y} className="bg-slate-900">{y}</option>
              ))}
            </select>
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  {isPaidPlan ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleExportPdf}
                      disabled={exportingPdf}
                      className="text-violet-400 hover:bg-violet-400/10 gap-1.5 h-7 px-2"
                    >
                      {exportingPdf
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <FileDown className="w-3.5 h-3.5" />}
                      {exportingPdf ? "Generando…" : "PDF"}
                    </Button>
                  ) : (
                    <span>
                      <Button size="sm" variant="ghost" disabled className="text-muted-foreground/50 gap-1.5 h-7 px-2 cursor-not-allowed">
                        <FileDown className="w-3.5 h-3.5" />PDF
                      </Button>
                    </span>
                  )}
                </TooltipTrigger>
                {!isPaidPlan && (
                  <TooltipContent side="bottom" className="max-w-[220px] text-center">
                    <p className="text-xs">Disponible en planes Starter, Business y Agencia.</p>
                    <a href="/billing" className="text-xs text-primary underline">Actualizar plan →</a>
                  </TooltipContent>
                )}
              </UITooltip>
            </TooltipProvider>
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  {isPaidPlan ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleEmailReport}
                      disabled={sendingEmail}
                      className="text-violet-400 hover:bg-violet-400/10 gap-1.5 h-7 px-2"
                    >
                      {sendingEmail
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <Send className="w-3.5 h-3.5" />}
                      {sendingEmail ? "Enviando…" : "Email"}
                    </Button>
                  ) : (
                    <span>
                      <Button size="sm" variant="ghost" disabled className="text-muted-foreground/50 gap-1.5 h-7 px-2 cursor-not-allowed">
                        <Send className="w-3.5 h-3.5" />Email
                      </Button>
                    </span>
                  )}
                </TooltipTrigger>
                {!isPaidPlan && (
                  <TooltipContent side="bottom" className="max-w-[220px] text-center">
                    <p className="text-xs">Disponible en planes Starter, Business y Agencia.</p>
                    <a href="/billing" className="text-xs text-primary underline">Actualizar plan →</a>
                  </TooltipContent>
                )}
              </UITooltip>
            </TooltipProvider>
          </div>
          </div>
        </div>
      </div>

      {/* Permissions warning — only when Meta IS connected but engagement metrics are still 0 */}
      {ov.published > 0 && ov.likes === 0 && ov.reach === 0 && hasMetaConnected && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-amber-300">Las estadísticas están en cero — faltan permisos de Meta</p>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              El token actual de Instagram no tiene el permiso <code className="bg-black/30 px-1 rounded">instagram_manage_insights</code> necesario para leer likes, alcance y guardados.
              Esto también explica por qué Facebook no publica: le falta el permiso <code className="bg-black/30 px-1 rounded">pages_manage_posts</code> aprobado por Meta.
            </p>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              <strong>Solución:</strong> Ve a <strong>Configuración → Cuentas sociales → Desconectar Meta</strong> y vuelve a conectar.
              El nuevo flujo de autorización ya solicita ambos permisos. Si Meta sigue rechazando <code className="bg-black/30 px-1 rounded">pages_manage_posts</code>,
              tu App de Meta necesita pasar por <strong>App Review</strong> en developers.facebook.com.
            </p>
            <p className="text-xs text-amber-300/60">
              Mientras tanto, puedes ingresar métricas manualmente desde <strong>Historial → Editar métricas</strong> de cada post publicado.
            </p>
          </div>
        </div>
      )}

      {/* Overview cards + Charts — wrapped for html2canvas capture */}
      <div id="analytics-charts-section">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Publicadas" value={ov.published} icon={CheckCircle2} color="emerald" />
        <StatCard label="Programadas" value={ov.scheduled} icon={Clock} color="blue" />
        <StatCard label="En aprobación" value={ov.pending} icon={Send} color="purple" />
        <StatCard label="Fallidas" value={ov.failed} icon={AlertCircle} color="red" />
        <StatCard label="Total generadas" value={ov.total} icon={BarChart2} color="cyan" />
        <StatCard label="Likes totales" value={ov.likes} icon={Heart} color="orange" sub={ov.reach > 0 ? `${ov.reach.toLocaleString("es-CO")} alcance` : undefined} />
      </div>

      {/* Engagement totals + Rate */}
      {(ov.likes > 0 || ov.reach > 0) && (() => {
        const ovSaves: number = (ov as typeof ov & { saves: number }).saves ?? 0;
        const totalScore = (ov.likes ?? 0) + ovSaves * 2 + (ov.comments ?? 0);
        const overallER = ov.reach > 0 ? Math.round((totalScore / ov.reach) * 1000) / 10 : 0;
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Likes" value={ov.likes} icon={Heart} color="red" />
            <StatCard label="Comentarios" value={ov.comments} icon={MessageCircle} color="blue" />
            <StatCard label="Compartidos" value={ov.shares} icon={Share2} color="purple" />
            <StatCard label="Guardados" value={ovSaves} icon={Bookmark} color="orange" />
            <StatCard label="Alcance" value={ov.reach} icon={Eye} color="emerald" />
            <StatCard
              label="Tasa de Engagement"
              value={`${overallER}%`}
              icon={Zap}
              color={overallER >= 3 ? "emerald" : overallER >= 1 ? "orange" : "red"}
              sub={overallER >= 3 ? "Excelente ✓" : overallER >= 1 ? "Bueno" : "Necesita mejorar"}
            />
          </div>
        );
      })()}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Content type performance */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display text-primary">Rendimiento por Formato</CardTitle>
          </CardHeader>
          <CardContent>
            {contentChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Sin datos — publica tu primer post para ver resultados
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={contentChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                    labelStyle={{ color: "#f1f5f9" }}
                  />
                  <Bar dataKey="likes" name="Likes" radius={[4, 4, 0, 0]}>
                    {contentChartData.map((_, i) => (
                      <Cell key={i} fill={CONTENT_COLORS[i % CONTENT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Platform breakdown */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display text-primary">Rendimiento por Plataforma</CardTitle>
          </CardHeader>
          <CardContent>
            {(!data?.byPlatform || data.byPlatform.length === 0) ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Sin datos — conecta tus cuentas y publica para ver resultados
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {data.byPlatform.map(p => {
                  const anyP = p as typeof p & { engagementRate?: number; saves?: number };
                  const totalEngagement = (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
                  const maxEngagement = Math.max(...data.byPlatform.map(x => (x.likes ?? 0) + (x.comments ?? 0) + (x.shares ?? 0)), 1);
                  const pct = Math.round((totalEngagement / maxEngagement) * 100);
                  const er = anyP.engagementRate ?? 0;
                  const color = PLATFORM_COLORS[p.platform] ?? "#00C853";
                  const label = PLATFORM_LABELS[p.platform] ?? p.platform;
                  return (
                    <div key={p.platform}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {p.platform === "instagram" ? <Instagram className="w-4 h-4" style={{ color }} /> : <PlaySquare className="w-4 h-4" style={{ color }} />}
                          {label}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{p.count} posts</span>
                          {er > 0 && (
                            <span className={`px-1.5 py-0.5 rounded font-semibold ${er >= 3 ? "bg-emerald-500/20 text-emerald-400" : er >= 1 ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-muted-foreground"}`}>
                              ER {er}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        <span>❤️ {(p.likes ?? 0).toLocaleString("es-CO")}</span>
                        <span>💬 {(p.comments ?? 0).toLocaleString("es-CO")}</span>
                        <span>↗️ {(p.shares ?? 0).toLocaleString("es-CO")}</span>
                        <span>🔖 {(anyP.saves ?? 0).toLocaleString("es-CO")}</span>
                        <span>👁️ {(p.reach ?? 0).toLocaleString("es-CO")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Day and Hour charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display text-primary">Mejores Días para Publicar</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dayChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                />
                <Bar dataKey="likes" name="Likes" fill="#00C853" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display text-primary">Mejores Horas (Bogotá)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="hora" tick={{ fill: "#9ca3af", fontSize: 10 }} interval={1} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                />
                <Bar dataKey="likes" name="Likes" fill="#00B0FF" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Publishing Cadence — posts per week over last 12 weeks */}
      {cadence && (cadence.weeks.length > 0 || cadence.currentWeekCount > 0) && (
        <Card className="glass-card border-cyan-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display text-cyan-400 flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Cadencia de Publicación — Últimas 12 semanas
              <span className="ml-auto flex items-center gap-3 text-xs font-normal text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-cyan-400" />
                  Promedio: <strong className="text-cyan-400">{cadence.avgPerWeek} posts/sem</strong>
                </span>
                <span>Esta semana: <strong className="text-foreground">{cadence.currentWeekCount}</strong></span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cadence.weeks.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                Aún no hay publicaciones en las últimas 12 semanas
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={cadence.weeks.map(w => ({
                      semana: w.week.slice(5), // MM-DD
                      posts: w.total,
                    }))}
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="semana" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }}
                      formatter={(v: number) => [`${v} post${v !== 1 ? "s" : ""}`, "Publicaciones"]}
                      labelFormatter={l => `Semana del ${l}`}
                    />
                    <ReferenceLine
                      y={cadence.avgPerWeek}
                      stroke="#00E5FF"
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                      label={{ value: `Avg ${cadence.avgPerWeek}`, fill: "#00E5FF", fontSize: 10, position: "insideTopRight" }}
                    />
                    <Bar dataKey="posts" name="Posts" fill="#00B0FF" radius={[4, 4, 0, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-[11px] text-muted-foreground justify-center">
                  <span>
                    {cadence.avgPerWeek >= 3
                      ? "✅ Cadencia sólida — la IA tiene material suficiente para aprender."
                      : cadence.avgPerWeek >= 1
                      ? "🎯 Objetivo: 3+ posts/semana para maximizar el alcance orgánico."
                      : "⚠️ Publica con más frecuencia para ganar traction en el algoritmo."}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
      </div>{/* /analytics-charts-section */}

      {/* ¿Qué está funcionando? — real-time performance insights from published posts */}
      {contentInsights && (
        <Card className={`glass-card ${contentInsights.hasData ? "border-secondary/30" : "border-border/20"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display text-secondary flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              ¿Qué está funcionando?
              {contentInsights.hasData && contentInsights.postsAnalyzed && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {contentInsights.postsAnalyzed} posts analizados · actualiza solo en métricas
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!contentInsights.hasData ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-1">
                  {contentInsights.published && contentInsights.published > 0
                    ? `Tienes ${contentInsights.published} post${contentInsights.published > 1 ? "s" : ""} publicado${contentInsights.published > 1 ? "s" : ""}. Las métricas se sincronizan automáticamente — haz clic en "Sincronizar métricas" para actualizar.`
                    : "Publica tu primer post para que el sistema empiece a aprender qué funciona."}
                </p>
                <p className="text-xs text-muted-foreground/60">Los insights se activan en cuanto haya likes o alcance registrados</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Format ranking */}
                {contentInsights.typeRanking && contentInsights.typeRanking.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Formatos por rendimiento</p>
                    <div className="space-y-2">
                      {contentInsights.typeRanking.map((t, i) => {
                        const medals = ["🥇", "🥈", "🥉"];
                        const label = CONTENT_LABELS[t.type] ?? t.type;
                        const maxRate = contentInsights.typeRanking![0].avgRate;
                        const pct = maxRate > 0 ? Math.round((t.avgRate / maxRate) * 100) : 0;
                        return (
                          <div key={t.type} className="flex items-center gap-3">
                            <span className="text-lg w-6 shrink-0">{medals[i] ?? "•"}</span>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-foreground">{label}</span>
                                <span className="text-xs text-muted-foreground">{t.count} post{t.count !== 1 ? "s" : ""}</span>
                              </div>
                              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, background: i === 0 ? "#00C853" : i === 1 ? "#00B0FF" : "#9E9E9E" }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {contentInsights.typeRanking[0] && (
                      <p className="text-xs text-secondary mt-2">
                        La IA prioriza <strong>{CONTENT_LABELS[contentInsights.typeRanking[0].type] ?? contentInsights.typeRanking[0].type}</strong> al generar nuevas publicaciones porque es tu formato con más engagement.
                      </p>
                    )}
                  </div>
                )}

                {/* Top hooks */}
                {contentInsights.top3 && contentInsights.top3.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Hooks que más funcionaron</p>
                    <div className="space-y-2">
                      {contentInsights.top3.map((p, i) => (
                        <div key={p.id} className="flex gap-2 items-start p-2.5 bg-white/5 rounded-lg border border-border/20">
                          <span className="text-primary font-bold text-xs w-4 shrink-0 mt-0.5">#{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground leading-relaxed italic">"{p.hook}"</p>
                            <div className="flex gap-2 mt-1.5 text-[10px] text-muted-foreground">
                              <span>{CONTENT_LABELS[p.contentType ?? "image"] ?? p.contentType}</span>
                              {p.likes != null && <span>❤️ {p.likes.toLocaleString("es-CO")}</span>}
                              {p.saves != null && p.saves > 0 && <span>🔖 {p.saves.toLocaleString("es-CO")}</span>}
                              {p.reach != null && p.reach > 0 && <span>👁️ {p.reach.toLocaleString("es-CO")}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      El AI aprende estos patrones de apertura y los imita en las próximas generaciones.
                    </p>
                  </div>
                )}

                {/* Day + Trend in a row */}
                <div className="flex gap-4 flex-wrap">
                  {contentInsights.bestDay && (
                    <div className="flex-1 min-w-[140px] p-3 bg-white/5 rounded-lg border border-border/20 text-center">
                      <p className="text-2xl mb-1">📅</p>
                      <p className="text-sm font-semibold text-foreground">{contentInsights.bestDay.name}</p>
                      <p className="text-xs text-muted-foreground">Mejor día para publicar</p>
                    </div>
                  )}
                  {typeof contentInsights.trendPct === "number" && Math.abs(contentInsights.trendPct) > 5 && (
                    <div className={`flex-1 min-w-[140px] p-3 rounded-lg border text-center ${
                      contentInsights.trendPct > 0
                        ? "bg-primary/10 border-primary/30"
                        : "bg-red-500/10 border-red-500/30"
                    }`}>
                      <p className="text-2xl mb-1">{contentInsights.trendPct > 0 ? "📈" : "📉"}</p>
                      <p className={`text-sm font-semibold ${contentInsights.trendPct > 0 ? "text-primary" : "text-red-400"}`}>
                        {contentInsights.trendPct > 0 ? "+" : ""}{contentInsights.trendPct}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {contentInsights.trendPct > 0 ? "Engagement subiendo" : "Engagement bajando"}
                      </p>
                    </div>
                  )}
                  {typeof contentInsights.trendPct === "number" && Math.abs(contentInsights.trendPct) <= 5 && (
                    <div className="flex-1 min-w-[140px] p-3 bg-white/5 rounded-lg border border-border/20 text-center">
                      <p className="text-2xl mb-1">➡️</p>
                      <p className="text-sm font-semibold text-foreground">Estable</p>
                      <p className="text-xs text-muted-foreground">Engagement constante</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hashtag Analysis Panel */}
      {hashtagInsights && hashtagInsights.hasData && (
        <Card className="glass-card border-violet-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2" style={{ color: "#a78bfa" }}>
              <Hash className="w-5 h-5" style={{ color: "#a78bfa" }} />
              Análisis de Hashtags
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {hashtagInsights.totalUniqueTags} hashtags únicos · {hashtagInsights.totalPostsWithHashtags} posts
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {!hashtagInsights.hasEngagementData ? (
              /* Frequency mode — no engagement data yet */
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                  <p className="text-xs text-violet-300/80">
                    <strong className="text-violet-300">Vista de frecuencia</strong> — Sin métricas de engagement aún.
                    Ingresa likes y alcance desde "Historial" para ver qué hashtags generan más interacción real.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {hashtagInsights.top.map(t => {
                    const POOL_COLORS: Record<string, string> = {
                      brand: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
                      local: "bg-blue-500/15 border-blue-500/30 text-blue-300",
                      solar: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
                      ev: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
                      trending: "bg-pink-500/15 border-pink-500/30 text-pink-300",
                      other: "bg-white/5 border-white/10 text-muted-foreground",
                    };
                    return (
                      <span
                        key={t.tag}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${POOL_COLORS[t.pool] ?? POOL_COLORS.other}`}
                        title={`Usado ${t.frequency} veces · Pool: ${t.pool}`}
                      >
                        {t.tag}
                        <span className="opacity-60 text-[10px]">{t.frequency}×</span>
                      </span>
                    );
                  })}
                </div>
                {/* Pool legend */}
                <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  {[
                    { pool: "brand", label: "Marca", color: "bg-emerald-500" },
                    { pool: "local", label: "Local Cali", color: "bg-blue-500" },
                    { pool: "solar", label: "Solar", color: "bg-yellow-500" },
                    { pool: "ev", label: "EV / Eléctrico", color: "bg-cyan-500" },
                    { pool: "trending", label: "Tendencia", color: "bg-pink-500" },
                  ].map(l => (
                    <span key={l.pool} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${l.color} opacity-70`} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              /* Engagement mode — full analysis */
              <div className="space-y-5">
                {/* Top hashtags by engagement */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">
                    Top hashtags por engagement rate
                  </p>
                  <div className="space-y-2">
                    {hashtagInsights.top.slice(0, 15).map((t, i) => {
                      const maxRate = hashtagInsights.top[0]?.avgEngagementRate ?? 1;
                      const pct = maxRate > 0 ? Math.round((t.avgEngagementRate / maxRate) * 100) : 0;
                      const TIER_STYLE: Record<string, { bar: string; badge: string; label: string }> = {
                        top: { bar: "#00C853", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40", label: "⭐ Siempre usar" },
                        mid: { bar: "#FFB300", badge: "bg-amber-500/20 text-amber-400 border-amber-500/40", label: "🧪 Probar más" },
                        low: { bar: "#ef4444", badge: "bg-red-500/20 text-red-400 border-red-500/40", label: "⚠️ Revisar" },
                        unknown: { bar: "#6b7280", badge: "bg-white/5 text-muted-foreground border-white/10", label: "" },
                      };
                      const style = TIER_STYLE[t.tier] ?? TIER_STYLE.unknown;
                      return (
                        <div key={t.tag} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-5 shrink-0 text-right font-mono">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <span className="text-xs font-medium text-foreground truncate">{t.tag}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-muted-foreground">{t.frequency}× usado</span>
                                {style.label && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${style.badge}`}>
                                    {style.label}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: style.bar }}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6, delay: i * 0.03 }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pool performance breakdown */}
                {hashtagInsights.byPool.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">
                      Rendimiento por categoría
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {hashtagInsights.byPool.map((p, i) => {
                        const POOL_META: Record<string, { label: string; color: string; emoji: string }> = {
                          brand:    { label: "Marca",          color: "#00C853", emoji: "🏷️" },
                          local:    { label: "Local Cali",     color: "#00B0FF", emoji: "📍" },
                          solar:    { label: "Energía Solar",  color: "#FFB300", emoji: "☀️" },
                          ev:       { label: "EV / Eléctrico", color: "#00E5FF", emoji: "⚡" },
                          trending: { label: "Tendencia",      color: "#E040FB", emoji: "🔥" },
                          other:    { label: "Otros",          color: "#9E9E9E", emoji: "#" },
                        };
                        const meta = POOL_META[p.pool] ?? POOL_META.other;
                        const maxRate = hashtagInsights.byPool[0]?.avgRate ?? 1;
                        const pct = maxRate > 0 ? Math.round((p.avgRate / maxRate) * 100) : 0;
                        return (
                          <div
                            key={p.pool}
                            className="p-3 rounded-lg bg-white/5 border border-border/20"
                            style={{ borderColor: `${meta.color}22` }}
                          >
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-base leading-none">{meta.emoji}</span>
                              <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                              {i === 0 && <span className="ml-auto text-[10px] text-emerald-400 font-bold">BEST</span>}
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-1.5">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                            </div>
                            <p className="text-[10px] text-muted-foreground">{p.count} hashtags</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground/60">
                  La IA puede usar este análisis en el futuro para rotar automáticamente hacia los hashtags con más engagement.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Insights */}
      <Card className="glass-card border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display text-primary flex items-center gap-2">
            <Brain className="w-5 h-5" /> Aprendizajes & Recomendaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`p-4 rounded-xl border ${insightColors[ins.color] ?? insightColors.blue}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">{ins.icon}</span>
                  <div>
                    <div className="font-semibold text-sm text-foreground mb-1">{ins.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{ins.detail}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Posts — sorted by engagement rate */}
      {data?.topPosts && data.topPosts.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display text-primary flex items-center gap-2">
              <Star className="w-5 h-5" /> Top Posts por Tasa de Engagement
              <span className="ml-auto text-xs font-normal text-muted-foreground">ordenados por ER%</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.topPosts.map((post, i) => {
              const score = (post.likes ?? 0) + (post.saves ?? 0) * 2 + (post.comments ?? 0);
              const er = (post.reach ?? 0) > 0 ? Math.round((score / post.reach!) * 1000) / 10 : null;
              const rankColor = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : undefined;
              return (
                <div key={post.id} className="p-4 bg-white/5 rounded-xl border border-border/20">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{ background: rankColor ? `${rankColor}22` : "rgba(255,255,255,0.05)", color: rankColor ?? "#6b7280", border: `1px solid ${rankColor ? rankColor + "44" : "rgba(255,255,255,0.1)"}` }}
                      >
                        {i + 1}
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {CONTENT_LABELS[post.contentType ?? ""] ?? post.contentType}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {PLATFORM_LABELS[post.platform] ?? post.platform}
                      </Badge>
                      {er != null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${er >= 3 ? "bg-emerald-500/20 text-emerald-400" : er >= 1 ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-muted-foreground"}`}>
                          ER {er}%
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground shrink-0 flex-wrap justify-end">
                      {post.likes    != null && <span>❤️ {post.likes.toLocaleString("es-CO")}</span>}
                      {post.saves    != null && post.saves > 0 && <span>🔖 {post.saves.toLocaleString("es-CO")}</span>}
                      {post.comments != null && post.comments > 0 && <span>💬 {post.comments.toLocaleString("es-CO")}</span>}
                      {post.shares   != null && post.shares > 0 && <span>↗️ {post.shares.toLocaleString("es-CO")}</span>}
                      {post.reach    != null && <span>👁️ {post.reach.toLocaleString("es-CO")}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2 italic">"{post.caption?.split("\n")[0]?.slice(0, 120)}"</p>
                  <MetricsEditor postId={post.id} initial={{ likes: post.likes, comments: post.comments, shares: post.shares, reach: post.reach, saves: post.saves }} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Published posts with no metrics — allow adding */}
      {ov.published > 0 && (!data?.topPosts || data.topPosts.length === 0) && (
        <Card className="glass-card border-blue-400/20 bg-blue-400/5">
          <CardContent className="p-6 text-center">
            <BarChart2 className="w-12 h-12 text-blue-400 mx-auto mb-3 opacity-50" />
            <h3 className="font-display font-semibold text-foreground mb-2">
              Tienes {ov.published} posts publicados sin métricas
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Ingresa los likes, alcance y comentarios desde Instagram/TikTok para que la IA aprenda qué contenido funciona mejor y optimice las próximas generaciones.
            </p>
            <p className="text-xs text-muted-foreground">
              Los posts publicados aparecerán aquí una vez tengan al menos 1 like registrado. Ve al Historial y usa "Editar métricas" para ingresarlas.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
