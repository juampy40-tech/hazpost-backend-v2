import { useState, useEffect } from "react";
import { Download, Copy, Building2, Palette, MessageSquare, FileText, Globe, CheckCircle2, RefreshCw, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

interface Plan {
  id: string;
  name: string;
  price_usd: number;
  price_cop: number;
  ai_credits: number;
  reels_per_month: number;
  businesses_allowed: number;
  duration_days: number;
  features: string[];
  popular: boolean;
}

const PLAN_COLORS: Record<string, string> = {
  free:     "border-zinc-500",
  starter:  "border-blue-500",
  business: "border-purple-500",
  agency:   "border-yellow-500",
};

/** Precio anual: equivale a pagar 10 meses, siempre termina en .99 */
function annualPrice(monthlyUsd: number): number {
  return Math.floor(monthlyUsd * 10) + 0.99;
}

function CopyCard({ label, content, multiline = false }: { label: string; content: string; multiline?: boolean }) {
  const { toast } = useToast();
  function copy() {
    navigator.clipboard.writeText(content);
    toast({ title: "¡Copiado!" });
  }
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-muted/20">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</span>
        <button onClick={copy} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
          <Copy className="w-3 h-3" /> Copiar
        </button>
      </div>
      <div className="px-4 py-3">
        {multiline ? (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">{content}</p>
        )}
      </div>
    </div>
  );
}

export default function Recursos() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [billingAnnual, setBillingAnnual] = useState(false);

  useEffect(() => {
    apiFetch("/billing/plans")
      .then(data => setPlans(data.plans as Plan[]))
      .catch(() => toast({ title: "Error al cargar planes", variant: "destructive" }))
      .finally(() => setLoadingPlans(false));
  }, []);

  const starterPlan = plans.find(p => p.id === "starter") ?? plans[0];
  const starterMonthly = starterPlan?.price_usd ?? 18;
  const starterPriceLabel = billingAnnual
    ? `$${annualPrice(starterMonthly)} USD/año`
    : `$${starterMonthly} USD/mes`;

  const copyTexts = {
    elevatorPitch: `HazPost es una plataforma de gestión de redes sociales con IA que genera posts, reels y carruseles en segundos, y los publica automáticamente en Instagram, TikTok y Facebook. La IA aprende del negocio de cada cliente para crear contenido único y efectivo. Planes desde ${starterPriceLabel}.`,
    instaBio: `🤖 Tu contenido, automático e inteligente\n📱 Instagram · TikTok · Facebook\n🚀 Pruébalo gratis → hazpost.app`,
    emailSubject: `Automatiza las redes sociales de [NOMBRE CLIENTE] con IA — sin esfuerzo`,
    emailBody: `Hola [NOMBRE],\n\nSé que manejar las redes sociales de tu negocio puede ser agotador. Por eso quiero presentarte HazPost — una plataforma que genera contenido con IA y lo publica automáticamente en Instagram, TikTok y Facebook.\n\nEn lugar de pasar horas creando posts, HazPost los crea por ti: aprende el tono de tu negocio, tu audiencia y lo que funciona mejor, y genera contenido profesional en segundos.\n\n✅ Posts, reels y carruseles listos para publicar\n✅ Programación automática\n✅ Estadísticas de rendimiento\n✅ Desde ${starterPriceLabel}\n\n¿Te interesa ver una demo? Responde este mensaje y coordinamos.\n\nSaludos,\n[TU NOMBRE]`,
    whatsappMsg: `Hola! 👋 Te cuento de HazPost, una app que automatiza las redes sociales con IA. Genera posts para Instagram, TikTok y Facebook en segundos y los publica sola. 🚀\n\nEmpieza gratis: hazpost.app`,
  };

  function copyColor(color: string) {
    navigator.clipboard.writeText(color);
    toast({ title: `Color ${color} copiado` });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          Recursos para Agencias
        </h1>
        <p className="text-muted-foreground mt-1">
          Todo lo que necesitas para presentar y vender HazPost a tus clientes.
        </p>
      </div>

      {/* Brand kit */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" /> Kit de Marca
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Cian primario", hex: "#00C2FF", bg: "bg-[#00C2FF]" },
            { label: "Blanco texto", hex: "#FFFFFF", bg: "bg-white border border-border" },
            { label: "Fondo dark", hex: "#0A0A1A", bg: "bg-[#0A0A1A] border border-border" },
            { label: "Azul acento", hex: "#0077FF", bg: "bg-[#0077FF]" },
          ].map(({ label, hex, bg }) => (
            <button
              key={hex}
              onClick={() => copyColor(hex)}
              className="flex flex-col items-center gap-2 p-3 bg-card border border-border rounded-xl hover:border-primary/40 transition-colors"
              title={`Copiar ${hex}`}
            >
              <div className={`w-10 h-10 rounded-lg ${bg}`} />
              <p className="text-[10px] text-muted-foreground text-center">{label}</p>
              <p className="text-[10px] font-mono text-foreground">{hex}</p>
            </button>
          ))}
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Logo (texto)</p>
            <div className="flex items-center gap-1">
              <span className="text-2xl font-black text-white" style={{ fontFamily: "Poppins,sans-serif" }}>haz</span>
              <span className="text-2xl font-black" style={{ fontFamily: "Poppins,sans-serif", color: "#00C2FF" }}>post</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <p>Fuente: <strong className="text-foreground">Poppins</strong></p>
            <p>Peso: <strong className="text-foreground">Black (900)</strong></p>
          </div>
        </div>
      </section>

      {/* Pricing table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Tabla de Planes (para presentaciones)
          </h2>

          {/* Billing toggle */}
          <div className="flex items-center gap-1 bg-muted/30 border border-border rounded-lg p-0.5">
            <button
              onClick={() => setBillingAnnual(false)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                !billingAnnual
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBillingAnnual(true)}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                billingAnnual
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="w-3 h-3" />
              Anual
              <span className={`text-[10px] font-semibold px-1 rounded ${
                billingAnnual ? "bg-white/20 text-white" : "bg-green-500/20 text-green-400"
              }`}>
                2 meses gratis
              </span>
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {billingAnnual
            ? "Precio anual = equivale a pagar 10 meses · edita precios en Panel → Admin"
            : "Precios en USD · edita desde Panel → Admin"}
        </p>

        {loadingPlans ? (
          <div className="flex items-center justify-center h-24">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plans.map(plan => {
              const monthly = plan.price_usd;
              const yearly = annualPrice(monthly);

              return (
                <div
                  key={plan.id}
                  className={`bg-card border-l-4 ${PLAN_COLORS[plan.id] ?? "border-gray-500"} rounded-r-xl p-4 space-y-2 ${plan.popular ? "ring-1 ring-primary/30" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-foreground">{plan.name}</p>
                    {plan.popular && (
                      <span className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">Popular</span>
                    )}
                  </div>

                  {billingAnnual ? (
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-primary">
                        ${yearly} USD/año
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        ${monthly} USD/mes · <span className="text-green-400 font-medium">ahorras ${(monthly * 2).toFixed(2)}</span>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-primary">
                        ${monthly} USD/mes
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        ${yearly} USD/año · <span className="text-green-400 font-medium">2 meses gratis</span>
                      </p>
                    </div>
                  )}

                  <ul className="space-y-1">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Copy to use */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" /> Copy listo para usar
        </h2>
        <div className="space-y-3">
          <CopyCard label="Elevator pitch (30 segundos)" content={copyTexts.elevatorPitch} />
          <CopyCard label="Bio de Instagram / TikTok" content={copyTexts.instaBio} multiline />
          <CopyCard label="Asunto de email de prospección" content={copyTexts.emailSubject} />
          <CopyCard label="Email completo de prospección" content={copyTexts.emailBody} multiline />
          <CopyCard label="Mensaje de WhatsApp" content={copyTexts.whatsappMsg} multiline />
        </div>
      </section>

      {/* Links */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" /> Links útiles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "App principal", url: "https://hazpost.app", desc: "Para demos en vivo" },
            { label: "Página de precios", url: "https://hazpost.app/pricing", desc: "Para compartir con clientes" },
            { label: "Términos de servicio", url: "https://hazpost.app/terms-of-service", desc: "Para contratos" },
            { label: "Política de privacidad", url: "https://hazpost.app/privacy-policy", desc: "Para GDPR / HABEAS DATA" },
          ].map(({ label, url, desc }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{label}</p>
                <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1 truncate">{url}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
