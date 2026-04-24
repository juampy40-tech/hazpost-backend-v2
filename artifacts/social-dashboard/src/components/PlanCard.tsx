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
    .replace("Publicación masiva y cola de aprobación", "Programa hasta 60 posts")
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
            ? "scale-[1.03] shadow-[0_0_45px_rgba(0,194,255,0.28)] bg-cyan-500/5 z-10"
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

      {isCurrent && mode === "billing" && (
        <Badge className="absolute -top-3 right-4 bg-primary text-primary-foreground text-xs px-3 py-0.5">
          Tu plan actual
        </Badge>
      )}

      {isSelected && mode === "register" && (
        <Badge className="absolute -top-3 right-4 bg-primary text-primary-foreground text-xs px-3 py-0.5">
          Seleccionado
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

      <div>
        {plan.priceUsd === 0 ? (
          <div>
            <div className="text-3xl font-semibold text-foreground">Gratis</div>
            <p className="text-[11px] text-amber-400/80 font-medium mt-1">
              * Solo 30 días de prueba
            </p>
          </div>
        ) : (
          <div>
            {isBusiness && isLandingOrRegister && (
              <p className="text-xs text-muted-foreground mb-1">
                Antes $79 · Hoy
              </p>
            )}

            <div className="text-3xl font-semibold text-foreground">
              ${plan.priceUsd}{" "}
              <span className="text-base font-normal text-muted-foreground">
                {pricePeriodLabel}
              </span>
            </div>
          </div>
        )}

        <div className={`text-sm mt-1 font-medium px-1 ${accentColor}`}>
          {plan.key === "free"
            ? "Para probar la plataforma"
            : plan.key === "starter"
              ? "Para publicar con constancia"
              : plan.key === "business"
                ? "Para crecer y automatizar"
                : "Para múltiples marcas"}
        </div>
      </div>

      {showExtraBizBlock && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3 text-yellow-400" />
            <span className="text-[10px] font-semibold text-yellow-300 uppercase tracking-wide">
              Negocio adicional
            </span>
          </div>

          {hasExtraBizAnnual && (
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] cursor-pointer transition-colors ${
                  !extraAnnual ? "text-foreground font-semibold" : "text-muted-foreground"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExtraAnnual(false);
                }}
              >
                Mensual
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExtraAnnual((a) => !a);
                }}
                className={`relative w-8 h-4 rounded-full border transition-all flex-shrink-0 ${
                  extraAnnual ? "bg-yellow-500 border-yellow-500" : "bg-muted border-border"
                }`}
                aria-label="Toggle annual extra business"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${
                    extraAnnual ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>

              <span
                className={`text-[10px] cursor-pointer transition-colors ${
                  extraAnnual ? "text-foreground font-semibold" : "text-muted-foreground"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExtraAnnual(true);
                }}
              >
                Anual
              </span>

              {extraAnnual && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                  Ahorrás más
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Precio / negocio extra
            </span>
            <div className="text-right">
              <span className="text-sm font-bold text-yellow-300 block">
                {extraAnnual && hasExtraBizAnnual
                  ? `$${plan.extraBusinessPriceAnnualUsd!.toFixed(2)}/año`
                  : `$${plan.extraBusinessPriceUsd!.toFixed(2)}/mes`}
              </span>
            </div>
          </div>
        </div>
      )}

      {showInheritance && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-violet-400" />
            <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide">
              Todo lo del plan {plan.parentPlanName ?? "Negocio"} incluido
            </span>
          </div>

          <ul className="space-y-1">
            {inheritedEnabled.slice(0, 4).map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-violet-300/80">
                <Check className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                <span>{formatFeature(f.text)}</span>
              </li>
            ))}
            {inheritedEnabled.length > 4 && (
              <li className="text-[10px] text-violet-400/60 pl-4">
                + {inheritedEnabled.length - 4} beneficios más
              </li>
            )}
          </ul>
        </div>
      )}

      {ownFeatures.length > 0 && (
        <ul className="space-y-2 flex-1 px-1">
          {ownFeatures.slice(0, isLandingOrRegister ? 7 : ownFeatures.length).map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      )}

      {isLandingOrRegister ? (
        <div
          className={`
            w-full min-h-10 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all px-3 text-center
            ${
              isBusiness
                ? "bg-cyan-400 text-black border border-cyan-300 shadow-[0_0_20px_rgba(0,194,255,0.35)]"
                : isSelected && mode === "register"
                  ? "bg-primary/20 text-primary border border-primary/50"
                  : "bg-muted/30 text-muted-foreground border border-border/40"
            }
          `}
        >
          {isSelected && mode === "register" ? (
            <>
              <Check className="w-4 h-4" />
              Plan seleccionado
            </>
          ) : (
            buttonLabel()
          )}
        </div>
      ) : (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(plan.key);
          }}
          disabled={isDisabled}
          variant={highlighted ? "default" : plan.key === "business" ? "default" : "outline"}
          className="w-full"
        >
          {buttonLabel()}
        </Button>
      )}

      {isLandingOrRegister && (
        <p className="text-[11px] text-muted-foreground text-center">
          Sin tarjeta · Cancela cuando quieras
        </p>
      )}
    </div>
  );
}
