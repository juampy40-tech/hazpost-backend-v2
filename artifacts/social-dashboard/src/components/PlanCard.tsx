import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const PLAN_BORDER: Record<string, string> = {
  free: "border-border",
  starter: "border-blue-500/70",
  business: "border-cyan-400",
  agency: "border-violet-500/80",
};

const CTA_LABELS: Record<string, string> = {
  free: "Probar gratis",
  starter: "Quiero empezar",
  business: "Escalar mi negocio 🚀",
  agency: "Automatizar todo",
};

function formatFeature(text: string) {
  if (!text) return "";

  return text
    .replace(/Créditos de IA por mes: 40/i, "40 créditos para probar HazPost")
    .replace(/Créditos de IA por mes: 120/i, "Contenido constante para tu negocio")
    .replace(/Créditos de IA por mes: 220/i, "Más contenido, más formatos y más automatización")
    .replace(/Créditos de IA por mes: 1100/i, "Contenido masivo para múltiples marcas")

    .replace(/Hasta 1 negocio\(s\)/i, "1 negocio incluido")
    .replace(/Hasta 5 negocio\(s\)/i, "Hasta 5 negocios incluidos")

    .replace(/Generación automática de contenido/i, "Genera contenido automáticamente")
    .replace(/Publicación programada a Instagram, TikTok y Facebook/i, "Publica en Instagram, TikTok y Facebook")

    .replace(/Bulk scheduling hasta 30 posts/i, "Programa hasta 30 posts")
    .replace(/Bulk scheduling hasta 60 posts/i, "Programa hasta 60 posts")

    .replace(/Métricas de engagement/i, "Mide qué contenido funciona mejor")
    .replace(/Estadísticas e informes/i, "Estadísticas para mejorar tus resultados")

    .replace(/Todos los tipos de publicación/i, "Fotos, historias, carruseles y reels")

    .replace(/Gestión multi-negocio/i, "Gestiona más de una marca")
    .replace(/Notificaciones Telegram/i, "Alertas y seguimiento automático")
    .replace(/Perfil de marca personalizado/i, "Tu tono y estilo de marca guardados");
}

export function PlanCard({
  plan,
  onSelect,
  loading,
  mode = "landing",
}: any) {
  const isBusiness = plan.key === "business";
  const isLanding = mode === "landing";

  const rawFeatures =
    plan.resolvedFeatures?.map((t: string) => formatFeature(t)) || [];

  const priorityFeatures = rawFeatures.filter(
    (f: string) =>
      f.includes("Programa hasta 30 posts") ||
      f.includes("Programa hasta 60 posts")
  );

  const otherFeatures = rawFeatures.filter(
    (f: string) =>
      !f.includes("Programa hasta 30 posts") &&
      !f.includes("Programa hasta 60 posts")
  );

  const features = [...priorityFeatures, ...otherFeatures];

  return (
    <div
      className={`
        relative bg-card border-2 ${PLAN_BORDER[plan.key]} rounded-2xl p-5 flex flex-col gap-4 transition-all
        ${
          isBusiness && isLanding
            ? "scale-[1.05] shadow-[0_0_60px_rgba(0,194,255,0.38)] bg-cyan-500/10 z-10"
            : "hover:shadow-[0_0_20px_rgba(0,193,255,0.12)]"
        }
      `}
    >
      {plan.descriptionJson?.badge && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-400 text-black text-xs px-4 py-1">
          {plan.descriptionJson.badge}
        </Badge>
      )}

      <div>
        <h2 className="text-lg font-bold">{plan.name}</h2>
        <p className="text-xs text-muted-foreground">
          {plan.descriptionJson?.description}
        </p>
      </div>

      <div>
        <div className="text-3xl font-semibold">
          ${plan.priceUsd}
          <span className="text-sm text-muted-foreground">/mes</span>
        </div>

        {plan.key === "business" && (
          <p className="text-[11px] text-amber-400/80 mt-1 font-medium">
            ⏳ Oferta por tiempo limitado – precios pueden cambiar
          </p>
        )}
      </div>

      <ul className="space-y-2 flex-1">
        {features
          .slice(0, plan.key === "business" ? 8 : 6)
          .map((f: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-primary mt-0.5" />
              {f}
            </li>
          ))}
      </ul>

      {/* 🔥 BOTÓN PRINCIPAL (YA FUNCIONA PARA TODO EL FLUJO) */}
      <Button
        onClick={() => onSelect(plan.key)}
        disabled={loading}
        className={
          isBusiness
            ? "bg-cyan-400 text-black font-bold shadow-[0_0_20px_rgba(0,194,255,0.35)]"
            : ""
        }
      >
        {CTA_LABELS[plan.key]}
      </Button>

      <p className="text-[11px] text-center text-muted-foreground">
        Sin tarjeta · Cancela cuando quieras · Activación inmediata
      </p>
    </div>
  );
}
