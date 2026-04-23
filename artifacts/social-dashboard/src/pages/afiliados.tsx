import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Handshake, Star, DollarSign, TrendingUp, CheckCircle2, Clock, AlertCircle, Send } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface AffiliateApp {
  id: number;
  status: string;
  commission_pct: number;
  duration_months: number;
  affiliate_code: string | null;
  created_at: string;
}

export default function Afiliados() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [application, setApplication] = useState<AffiliateApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [globalPct, setGlobalPct] = useState(20);
  const [globalMonths, setGlobalMonths] = useState(6);
  const [form, setForm] = useState({
    name: user?.displayName ?? "",
    email: user?.email ?? "",
    socialUrl: "",
    audienceSize: "",
    description: "",
  });

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/api/affiliates/status`, { credentials: "include" }).then(r => r.json()),
      fetch(`${BASE}/api/affiliates/settings`, { credentials: "include" }).then(r => r.json()),
    ])
      .then(([statusData, settingsData]) => {
        setApplication(statusData.application ?? null);
        if (settingsData.default_commission_pct) setGlobalPct(Number(settingsData.default_commission_pct));
        if (settingsData.default_duration_months) setGlobalMonths(Number(settingsData.default_duration_months));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) {
      toast({ title: "Completa nombre y email", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${BASE}/api/affiliates/apply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: "¡Solicitud enviada! 🎉", description: "Te contactaremos en 48 horas." });
      setApplication({ id: 0, status: "pending", commission_pct: globalPct, affiliate_code: null, created_at: new Date().toISOString(), duration_months: globalMonths });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // Use actual commission from approved application; fall back to admin-configured global defaults
  const commPct = application?.status === "approved" ? application.commission_pct : globalPct;
  const durMonths = application?.status === "approved" ? application.duration_months : globalMonths;

  const benefits = [
    { icon: DollarSign, title: `${commPct}% de comisión`, desc: `Por cada cliente que pague gracias a tu enlace, durante ${durMonths} meses` },
    { icon: TrendingUp, title: "Dashboard en tiempo real", desc: "Ve tus clicks, conversiones y comisiones acumuladas" },
    { icon: Star, title: "Materiales de marketing", desc: "Banners, videos y copy listo para usar en tus redes" },
    { icon: Handshake, title: "Soporte prioritario", desc: "Acceso directo al equipo de HazPost para preguntas y soporte" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Handshake className="w-6 h-6 text-primary" />
          Programa de Afiliados
        </h1>
        <p className="text-muted-foreground mt-1">
          Conviértete en afiliado de HazPost y gana <strong className="text-foreground">comisiones reales en dinero</strong> por cada cliente que refieras.
        </p>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {benefits.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-card border border-border rounded-xl p-4 flex gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Commission calculator */}
      <div className="bg-gradient-to-r from-primary/10 to-blue-600/10 border border-primary/20 rounded-xl p-5">
        <p className="text-sm font-semibold text-foreground mb-3">💰 Simulador de ingresos</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { clients: 10, plan: "Emprendedor (COP 79.900)", income: "~COP 159.800/mes" },
            { clients: 25, plan: "Negocio (COP 149.900)", income: "~COP 749.500/mes" },
            { clients: 50, plan: "Agencia (COP 249.900)", income: "~COP 2.499.000/mes" },
          ].map(({ clients, plan, income }) => (
            <div key={clients} className="bg-background/40 rounded-lg p-3">
              <p className="text-2xl font-black text-primary">{clients}</p>
              <p className="text-[10px] text-muted-foreground">{plan}</p>
              <p className="text-xs font-bold text-foreground mt-1">{income}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">*Basado en {commPct}% de comisión por {durMonths} meses por cliente.</p>
      </div>

      {/* Application status or form */}
      {application ? (
        <div className="bg-card border border-border rounded-xl p-6">
          {application.status === "pending" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Clock className="w-10 h-10 text-yellow-400" />
              <p className="font-semibold text-foreground">Solicitud en revisión</p>
              <p className="text-sm text-muted-foreground">Estamos revisando tu perfil. Te contactaremos en las próximas 48 horas.</p>
              <span className="text-xs text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-full">Enviada {new Date(application.created_at).toLocaleDateString("es-CO")}</span>
            </div>
          )}
          {application.status === "approved" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
              <p className="font-semibold text-foreground">¡Eres afiliado oficial de HazPost!</p>
              <p className="text-sm text-muted-foreground">Comisión: <strong className="text-foreground">{application.commission_pct}%</strong> por <strong className="text-foreground">{application.duration_months ?? 6}</strong> meses por cliente</p>
              {application.affiliate_code && (
                <div className="bg-background border border-border rounded-lg px-4 py-2 font-mono text-sm text-primary">
                  {application.affiliate_code}
                </div>
              )}
            </div>
          )}
          {application.status === "rejected" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="font-semibold text-foreground">Solicitud no aprobada</p>
              <p className="text-sm text-muted-foreground">En este momento no cumples los requisitos mínimos. Puedes volver a aplicar cuando tengas más audiencia.</p>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="font-semibold text-foreground">Aplica al programa</p>
          <p className="text-sm text-muted-foreground">Necesitamos conocerte un poco. Revisamos cada solicitud en 48 horas.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nombre completo *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Tu nombre"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email de contacto *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="tu@email.com"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Link de tu perfil principal (Instagram, TikTok, etc.)</label>
            <input
              value={form.socialUrl}
              onChange={e => setForm(f => ({ ...f, socialUrl: e.target.value }))}
              placeholder="https://instagram.com/tuperfil"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tamaño aproximado de tu audiencia</label>
            <select
              value={form.audienceSize}
              onChange={e => setForm(f => ({ ...f, audienceSize: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">Selecciona...</option>
              <option value="1k-5k">1.000 – 5.000 seguidores</option>
              <option value="5k-20k">5.000 – 20.000 seguidores</option>
              <option value="20k-100k">20.000 – 100.000 seguidores</option>
              <option value="100k+">Más de 100.000 seguidores</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">¿Por qué quieres ser afiliado?</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Cuéntanos sobre tu audiencia y cómo planeas promocionar HazPost..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {submitting ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar solicitud
          </button>
        </form>
      )}
    </div>
  );
}
