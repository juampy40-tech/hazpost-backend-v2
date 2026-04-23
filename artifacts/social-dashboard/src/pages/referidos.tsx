import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, Share2, Users, Coins, Clock, CheckCircle2, ChevronRight, Zap, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface ReferralStats {
  totalReferrals: number;
  pendingReferrals: number;
  creditedReferrals: number;
  totalCreditsEarned: number;
}

interface ReferralSystemSettings {
  isEnabled: boolean;
  referrerCredits: number;
  refereeCredits: number;
  referrerFreeDays: number;
  refereeFreeDays: number;
  minPlanForBonus: string;
}

interface Conversion {
  id: number;
  status: string;
  credits_awarded: number;
  referee_credits_awarded: number;
  created_at: string;
  credited_at: string | null;
  referred_email: string;
  referred_name: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free", starter: "Emprendedor", business: "Negocio", agency: "Agencia",
};

export default function Referidos() {
  const { toast } = useToast();
  const [code, setCode] = useState<string>("");
  const [referralUrl, setReferralUrl] = useState<string>("");
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [systemSettings, setSystemSettings] = useState<ReferralSystemSettings | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/api/referrals`, { credentials: "include" }).then(r => r.json()),
      fetch(`${BASE}/api/referrals/conversions`, { credentials: "include" }).then(r => r.json()),
    ]).then(([refData, convData]) => {
      setCode(refData.code ?? "");
      setReferralUrl(refData.referralUrl ?? "");
      setStats(refData.stats ?? null);
      setSystemSettings(refData.settings ?? null);
      setConversions(convData.conversions ?? []);
    }).catch(() => {
      toast({ title: "Error cargando referidos", variant: "destructive" });
    }).finally(() => setLoading(false));
  }, []);

  function copyLink() {
    navigator.clipboard.writeText(referralUrl);
    toast({ title: "¡Enlace copiado!", description: "Compártelo con tus contactos" });
  }

  function shareWhatsApp() {
    const msg = encodeURIComponent(
      `🚀 Gestiona tus redes con IA gratis en HazPost. Úsate mi enlace y ambos ganamos créditos: ${referralUrl}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const isEnabled = systemSettings?.isEnabled !== false;
  const refererCr = systemSettings?.referrerCredits ?? 30;
  const refereeCr = systemSettings?.refereeCredits  ?? 10;
  const minPlan   = systemSettings?.minPlanForBonus  ?? "starter";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gift className="w-6 h-6 text-primary" />
          Plan de Referidos
        </h1>
        <p className="text-muted-foreground mt-1">
          Invita a tus amigos y gana{" "}
          <strong className="text-foreground">{refererCr} créditos gratis</strong>{" "}
          por cada uno que se suscriba al plan {PLAN_LABELS[minPlan] ?? minPlan} o superior.
          {refereeCr > 0 && (
            <> Tu amigo también recibe <strong className="text-foreground">{refereeCr} créditos</strong> de bienvenida.</>
          )}
        </p>
      </div>

      {/* Disabled notice */}
      {!isEnabled && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>El programa de referidos está temporalmente pausado. Vuelve a consultarlo pronto.</span>
        </div>
      )}

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Share2, step: "1", title: "Comparte tu enlace", desc: "Envíalo por WhatsApp, Instagram o donde quieras" },
          { icon: Users, step: "2", title: "Tu amigo se registra", desc: `Se crea una cuenta gratis con tu código${refereeCr > 0 ? ` y recibe ${refereeCr} créditos` : ""}` },
          { icon: Coins, step: "3", title: "Ambos ganan", desc: `Cuando paga el plan ${PLAN_LABELS[minPlan]}, tú recibes ${refererCr} créditos automáticamente` },
        ].map(({ icon: Icon, step, title, desc }) => (
          <div key={step} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{step}</div>
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <p className="font-semibold text-sm text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Tu enlace único</p>
        <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
          <span className="flex-1 text-sm text-foreground truncate font-mono">{referralUrl || "Cargando..."}</span>
          <button onClick={copyLink} className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors" title="Copiar">
            <Copy className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Copy className="w-4 h-4" /> Copiar enlace
          </button>
          <button
            onClick={shareWhatsApp}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            <Share2 className="w-4 h-4" /> Compartir por WhatsApp
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tu código: <span className="font-mono font-bold text-foreground">{code}</span>
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total referidos", value: stats.totalReferrals, icon: Users, color: "text-blue-400" },
            { label: "Pendientes de pago", value: stats.pendingReferrals, icon: Clock, color: "text-yellow-400" },
            { label: "Confirmados", value: stats.creditedReferrals, icon: CheckCircle2, color: "text-green-400" },
            { label: "Créditos ganados", value: stats.totalCreditsEarned, icon: Zap, color: "text-primary" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
              <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Conversions list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Historial de referidos</span>
        </div>
        {conversions.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted-foreground text-sm">
            <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Aún no tienes referidos. ¡Comparte tu enlace!
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {conversions.map(c => (
              <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
                  {(c.referred_name || c.referred_email).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.referred_name || c.referred_email}</p>
                  <p className="text-xs text-muted-foreground">{c.referred_email}</p>
                </div>
                <div className="text-right shrink-0">
                  {c.status === "credited" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> +{c.credits_awarded} créditos
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" /> Pendiente de pago
                    </span>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(c.created_at).toLocaleDateString("es-CO")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA to affiliate */}
      <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 border border-primary/20 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-foreground">¿Tienes muchos seguidores?</p>
          <p className="text-sm text-muted-foreground mt-0.5">Aplica al programa de afiliados y gana comisiones en dinero, no solo créditos.</p>
        </div>
        <a href="/afiliados" className="shrink-0 flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80 transition-colors whitespace-nowrap">
          Ver programa <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
