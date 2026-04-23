import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Building2 } from "lucide-react";

const PLAN_BORDER: Record<string, string> = {
  free:     "border-border",
  starter:  "border-blue-500",
  business: "border-cyan-500",
  agency:   "border-violet-500",
};

const PLAN_ACCENT: Record<string, string> = {
  free:     "text-gray-400",
  starter:  "text-blue-400",
  business: "text-cyan-400",
  agency:   "text-violet-400",
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
  /** When set, these strings are used instead of descriptionJson.features */
  resolvedFeatures?: string[];
  /** When true, the plan inherits all benefits from the Business plan */
  includesBusinessPlan?: boolean;
  /** Name of the parent plan (only used when includesBusinessPlan=true) */
  parentPlanName?: string;
  /** Monthly price per extra business slot (agency plan) */
  extraBusinessPriceUsd?: number;
  /** Monthly price per extra business slot in COP (computed TRM × USD × 1.05) */
  extraBusinessPriceCop?: number;
  /** Annual price per extra business slot (agency plan) */
  extraBusinessPriceAnnualUsd?: number;
  /** Annual price per extra business slot in COP */
  extraBusinessPriceAnnualCop?: number;
}

interface PlanCardProps {
  plan: PlanCardData;
  isCurrent: boolean;
  isSelected?: boolean;
  onSelect: (key: string) => void;
  loading: boolean;
  mode?: "billing" | "register" | "landing";
  /** Override the price period label shown next to the price (default: "USD/mes") */
  pricePeriodLabel?: string;
  /** When true, the plan is a downgrade — shows "Programar cambio" and is still clickable */
  isDowngrade?: boolean;
  /** Business plan features list to show as inherited (only when includesBusinessPlan=true) */
  inheritedFeatures?: PlanFeature[];
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

  // Use resolvedFeatures (admin-managed strings) when available, else fall back to descriptionJson.features
  const ownFeatures: PlanFeature[] = plan.resolvedFeatures && plan.resolvedFeatures.length > 0
    ? plan.resolvedFeatures.map(text => ({ text, enabled: true }))
    : (desc?.features ?? []).filter(f => f.enabled);

  // Filter inherited features: exclude credit-count and business-count items (they differ per plan)
  const INHERITED_FILTER = /crédito|credit|negocio|business/i;
  const inheritedEnabled = (inheritedFeatures ?? []).filter(
    f => f.enabled && !INHERITED_FILTER.test(f.text)
  );
  const badge = desc?.badge ?? null;
  const description = desc?.description ?? "";
  const borderColor = PLAN_BORDER[plan.key] ?? "border-border";
  const accentColor = PLAN_ACCENT[plan.key] ?? "text-blue-400";
  const showInheritance = plan.includesBusinessPlan && inheritedEnabled.length > 0;

  // Extra business pricing (show annual toggle when either USD or COP annual price is set)
  const hasExtraBizMonthly = (plan.extraBusinessPriceUsd ?? 0) > 0;
  const hasExtraBizAnnual  = (plan.extraBusinessPriceAnnualUsd ?? 0) > 0;
  const showExtraBizBlock  = hasExtraBizMonthly && plan.key === "agency" && mode === "billing";

  const highlighted = (mode === "register" || mode === "landing") ? isSelected : isCurrent;
  const ringClass = highlighted
    ? "ring-2 ring-primary/50 ring-offset-1 ring-offset-background"
    : "";

  const isDisabled =
    (mode === "billing" && (isCurrent || loading)) ||
    ((mode === "register" || mode === "landing") && loading);

  function buttonLabel() {
    if (mode === "landing") {
      if (plan.priceUsd === 0) return "Empezar gratis";
      return `Elegir ${plan.name}`;
    }
    if (mode === "register") {
      if (isSelected) return "Plan seleccionado";
      if (plan.priceUsd === 0) return "Comenzar gratis";
      return `Elegir ${plan.name}`;
    }
    if (isCurrent) return "Plan actual";
    if (isDowngrade && mode === "billing") return "Programar cambio";
    if (plan.priceUsd === 0) return "Cambiar a Gratis";
    return `Contratar ${plan.name}`;
  }

  const registerCardClick = (mode === "register" || mode === "landing") && !loading
    ? () => onSelect(plan.key)
    : undefined;

  return (
    <div
      className={`relative bg-card border-2 ${borderColor} rounded-2xl p-5 flex flex-col gap-4 transition-all ${ringClass} ${mode === "register" || mode === "landing" ? "cursor-pointer select-none hover:border-primary/60 hover:shadow-[0_0_20px_rgba(0,193,255,0.12)]" : ""}`}
      onClick={registerCardClick}
    >
      {badge && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-500 text-black text-xs px-3 py-0.5 whitespace-nowrap">
          {badge}
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
        <h2 className="text-lg font-bold text-foreground">{plan.name}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>

      <div>
        {plan.priceUsd === 0 ? (
          <div>
            <div className="text-3xl font-semibold text-foreground">Gratis</div>
            <p className="text-[11px] text-amber-400/80 font-medium mt-1">* Solo 30 días de prueba</p>
          </div>
        ) : (
          <>
            <div className="text-3xl font-semibold text-foreground">
              ${plan.priceUsd}{" "}
              <span className="text-base font-normal text-muted-foreground">{pricePeriodLabel}</span>
            </div>
          </>
        )}
        <div className={`text-sm mt-1 font-medium px-1 ${accentColor}`}>
          {plan.creditsPerMonth} créditos/mes
        </div>
      </div>

      {/* Extra business pricing block (agency plan) */}
      {showExtraBizBlock && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3 text-yellow-400" />
            <span className="text-[10px] font-semibold text-yellow-300 uppercase tracking-wide">Negocio adicional</span>
          </div>
          {hasExtraBizAnnual && (
            <div className="flex items-center gap-2">
              <span className={`text-[10px] cursor-pointer transition-colors ${!extraAnnual ? "text-foreground font-semibold" : "text-muted-foreground"}`} onClick={() => setExtraAnnual(false)}>Mensual</span>
              <button
                onClick={() => setExtraAnnual(a => !a)}
                className={`relative w-8 h-4 rounded-full border transition-all flex-shrink-0 ${extraAnnual ? "bg-yellow-500 border-yellow-500" : "bg-muted border-border"}`}
                aria-label="Toggle annual extra business"
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${extraAnnual ? "translate-x-4" : "translate-x-0"}`} />
              </button>
              <span className={`text-[10px] cursor-pointer transition-colors ${extraAnnual ? "text-foreground font-semibold" : "text-muted-foreground"}`} onClick={() => setExtraAnnual(true)}>Anual</span>
              {extraAnnual && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">Ahorrás más</span>}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Precio / negocio extra</span>
            <div className="text-right">
              <span className="text-sm font-bold text-yellow-300 block">
                {extraAnnual && hasExtraBizAnnual
                  ? `$${plan.extraBusinessPriceAnnualUsd!.toFixed(2)}/año`
                  : `$${plan.extraBusinessPriceUsd!.toFixed(2)}/mes`
                }
              </span>
            </div>
          </div>
          {extraAnnual && hasExtraBizAnnual && hasExtraBizMonthly && (
            <div className="text-[10px] text-green-400 text-right">
              Ahorrás {Math.round((1 - plan.extraBusinessPriceAnnualUsd! / (plan.extraBusinessPriceUsd! * 12)) * 100)}% vs mensual
            </div>
          )}
        </div>
      )}

      {/* Inherited Business plan benefits banner */}
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
                <span>{f.text}</span>
              </li>
            ))}
            {inheritedEnabled.length > 4 && (
              <li className="text-[10px] text-violet-400/60 pl-4">+ {inheritedEnabled.length - 4} beneficios más</li>
            )}
          </ul>
        </div>
      )}

      {/* Own features */}
      {ownFeatures.length > 0 && (
        <ul className="space-y-2 flex-1 px-1">
          {ownFeatures.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      )}

      {mode === "register" || mode === "landing" ? (
        <div className={`w-full h-9 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all ${isSelected && mode === "register" ? "bg-primary/20 text-primary border border-primary/50" : "bg-muted/30 text-muted-foreground border border-border/40"}`}>
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
          onClick={(e) => { e.stopPropagation(); onSelect(plan.key); }}
          disabled={isDisabled}
          variant={highlighted ? "default" : plan.key === "business" ? "default" : "outline"}
          className="w-full"
        >
          {buttonLabel()}
        </Button>
      )}
    </div>
  );
}
