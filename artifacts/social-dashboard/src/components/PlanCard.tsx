import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Building2 } from "lucide-react";

const PLAN_BORDER: Record<string, string> = {
  free: "border-border",
  starter: "border-blue-500/70",
  business: "border-cyan-400",
  agency: "border-violet-500/80",
};

const PLAN_ACCENT: Record<string, string> = {
  free: "text-gray-400",
  starter: "text-blue-400",
  business: "text-cyan-300",
  agency: "text-violet-400",
};

export interface PlanFeature {
  text: string;
  enabled: boolean;
}

export interface DescriptionJson {
  description?: string;
  features?: PlanFeature[];
  badge?: string | null;
}

export interface PlanCardData {
  id?: number;
  key: string;
  name: string;
  priceUsd: number;
  priceCop: number;
  creditsPerMonth: number;
  isActive?: boolean;
  sortOrder?: number;
  descriptionJson?: DescriptionJson | null;
  resolvedFeatures?: string[];
  includesBusinessPlan?: boolean;
  parentPlanName?: string;
  extraBusinessPriceUsd?: number;
  extraBusinessPriceCop?: number;
  extraBusinessPriceAnnualUsd?: number;
  extraBusinessPriceAnnualCop?: number;
}

interface PlanCardProps {
  plan: PlanCardData;
  isCurrent: boolean;
  isSelected?: boolean;
  onSelect: (key: string) => void;
  loading: boolean;
  mode?: "billing" | "register" | "landing";
  pricePeriodLabel?: string;
  isDowngrade?: boolean;
  inheritedFeatures?: PlanFeature[];
}

const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: "Prueba HazPost sin compromiso.",
  starter: "Ideal para emprendedores que quieren publicar con constancia.",
  business: "La mejor opción para crecer sin perder tiempo creando contenido.",
  agency: "Para agencias y equipos que manejan varias marcas.",
};

const CTA_LABELS: Record<string, string> = {
  free: "Probar gratis",
  starter: "Quiero empezar",
  business: "Escalar mi negocio 🚀",
  agency: "Automatizar todo",
};

function formatFeature(text: string) {
  return text
    .replace("Créditos de IA por mes: 40", "40 créditos para probar HazPost")
    .replace("Créditos de IA por mes: 120", "Contenido constante para tu negocio")
    .replace("Créditos de IA por mes: 220", "Más contenido, más formatos y más automatización")
    .replace("Créditos de IA por mes: 1100", "Contenido masivo para múltiples marcas")
    .replace("Hasta 1 negocio(s)", "1 negocio incluido")
    .replace("Hasta 5 negocio(s)", "Hasta 5 negocios incluidos")
    .replace("Generación automática de contenido", "Genera contenido automáticamente")
    .replace("Publicación programada a Instagram, TikTok y Facebook", "Publica en Instagram, TikTok y Facebook")
    .replace("Bulk scheduling hasta 30 posts", "Programa hasta 30 posts")
    .replace("Bulk scheduling hasta 60 posts", "Programa hasta 60 posts")
    .replace("Métricas de engagement", "Mide qué contenido funciona mejor")
    .replace("Estadísticas e informes", "Estadísticas para mejorar tus resultados")
    .replace("Todos los tipos de publicación", "Fotos, historias, carruseles y reels")
    .replace("Gestión multi-negocio", "Gestiona más de una marca")
    .replace("Soporte prioritario", "Soporte prioritario")
    .replace("Notificaciones Telegram", "Alertas y seguimiento automático")
    .replace("Perfil de marca personalizado", "Tu tono y estilo de marca guardados");
}

export function PlanCard({
  plan,
  isCurrent,
  isSelected,
  onSelect,
  loading,
  mode = "billing",
  pricePeriodLabel = "USD/mes",
  isDowngrade = false,
  inheritedFeatures,
}: PlanCardProps) {
  const [extraAnnual, setExtraAnnual] = useState(false);
  const desc = plan.descriptionJson;

  const isBusiness = plan.key === "business";
  const isLandingOrRegister = mode === "register" || mode === "landing";

  const ownFeatures: PlanFeature[] =
    plan.resolvedFeatures && plan.resolvedFeatures.length > 0
      ? plan.resolvedFeatures.map((text) => ({
          text: formatFeature(text),
          enabled: true,
        }))
      : (desc?.features ?? [])
          .filter((f) => f.enabled)
          .map((f) => ({ ...f, text: formatFeature(f.text) }));

  const INHERITED_FILTER = /crédito|credit|negocio|business/i;
  const inheritedEnabled = (inheritedFeatures ?? []).filter(
    (f) => f.enabled && !INHERITED_FILTER.test(f.text)
  );

  const description = PLAN_DESCRIPTIONS[plan.key] ?? desc?.description ?? "";
  const borderColor = PLAN_BORDER[plan.key] ?? "border-border";
  const accentColor = PLAN_ACCENT[plan.key] ?? "text-blue-400";
  const showInheritance = plan.includesBusinessPlan && inheritedEnabled.length > 0;

  const hasExtraBizMonthly = (plan.extraBusinessPriceUsd ?? 0) > 0;
  const hasExtraBizAnnual = (plan.extraBusinessPriceAnnualUsd ?? 0) > 0;
  const showExtraBizBlock = hasExtraBizMonthly && plan.key === "agency" && mode === "billing";

  const highlighted = isLandingOrRegister ? isBusiness || isSelected : isCurrent;
  const ringClass = highlighted
    ? "ring-2 ring-cyan-400/50 ring-offset-1 ring-offset-background"
    : "";

  const isDisabled =
    (mode === "billing" && (isCurrent || loading)) ||
    (isLandingOrRegister && loading);

  function buttonLabel() {
    if (mode === "landing") return CTA_LABELS[plan.key] ?? `Elegir ${plan.name}`;
    if (mode === "register") {
      if (isSelected) return "Plan seleccionado";
      return CTA_LABELS[plan.key] ?? `Elegir ${plan.name}`;
    }
    if (isCurrent) return "Plan actual";
    if (isDowngrade && mode === "billing") return "Programar cambio";
    if (plan.priceUsd === 0) return "Cambiar a Gratis";
    return `Contratar ${plan.name}`;
  }

  const registerCardClick =
    isLandingOrRegister && !loading ? () => onSelect(plan.key) : undefined;

  return (
    <div
      className={`
        relative bg-card border-2 ${borderColor} rounded-2xl p-5 flex flex-col gap-4 transition-all
        ${ringClass}
        ${isLandingOrRegister ? "cursor-pointer select-none hover:border-primary/70" : ""}
        ${
          isBusiness && isLandingOrRegister
            ? "scale-[1.05] shadow-[0_0_60px_rgba(0,194,255,0.38)] bg-cyan-500/10 z-10"
            : "hover:shadow-[0_0_20px_rgba(0,193,255,0.12)]"
        }
      `}
      onClick={registerCardClick}
    >
      {isBusiness && isLandingOrRegister && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-400 text-black text-xs px-4 py-1 whitespace-nowrap shadow-[0_0_20px_rgba(0,194,255,0.45)]">
          🔥 EL MÁS ELEGIDO
        </Badge>
      )}

      {!isBusiness && desc?.badge && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-muted text-foreground text-xs px-3 py-0.5 whitespace-nowrap">
          {desc.badge}
        </Badge>
      )}

      <div>
        {isBusiness && isLandingOrRegister && (
          <p className="text-[11px] text-cyan-300 font-bold uppercase tracking-wide mb-1">
            La mejor opción para crecer
          </p>
        )}

        <h2 className="text-lg font-bold text-foreground">{plan.name}</h2>

        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {isLandingOrRegister && (
        <p className="text-[11px] text-muted-foreground text-center">
          Sin tarjeta · Cancela cuando quieras · Activación inmediata
        </p>
      )}
    </div>
  );
}
