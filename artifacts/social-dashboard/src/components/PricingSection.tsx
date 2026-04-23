import { useState, useEffect } from "react";
import { PlanCard, PlanCardData, PlanFeature } from "@/components/PlanCard";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface ApiPlan {
  key: string;
  name: string;
  priceUsd: number;
  priceAnnualUsd?: number;
  priceCop?: number;
  priceAnnualCop?: number;
  creditsPerMonth: number;
  resolvedFeatures?: string[];
  descriptionJson?: {
    headline?: string;
    description?: string;
    badge?: string | null;
    features?: Array<{ text: string; enabled: boolean } | string>;
    cta?: string;
  } | null;
  includesBusinessPlan?: boolean;
  parentPlanName?: string;
  extraBusinessPriceUsd?: number;
  extraBusinessPriceCop?: number;
  extraBusinessPriceAnnualUsd?: number;
  extraBusinessPriceAnnualCop?: number;
}

interface CreditPack { priceUsd: number; credits: number; }

export interface PricingSectionProps {
  mode: "landing" | "register" | "billing";
  onSelectPlan?: (key: string) => void;
  currentPlanKey?: string;
  selectedPlanKey?: string;
  annual?: boolean;
  onAnnualChange?: (val: boolean) => void;
  loadingPlanKey?: string | null;
}

function toPlanCardData(api: ApiPlan, showAnnual: boolean): PlanCardData {
  const dj = api.descriptionJson;
  const descFeats: PlanFeature[] = (dj?.features ?? [])
    .filter(f => typeof f === "string" ? true : (f as { enabled: boolean }).enabled !== false)
    .map(f => ({ text: typeof f === "string" ? f : (f as { text: string }).text, enabled: true }));

  return {
    key: api.key,
    name: api.name,
    priceUsd: showAnnual && (api.priceAnnualUsd ?? 0) > 0
      ? api.priceAnnualUsd!
      : api.priceUsd,
    priceCop: showAnnual && (api.priceAnnualCop ?? 0) > 0
      ? api.priceAnnualCop!
      : (api.priceCop ?? 0),
    creditsPerMonth: api.creditsPerMonth,
    resolvedFeatures: Array.isArray(api.resolvedFeatures) && api.resolvedFeatures.length > 0
      ? api.resolvedFeatures
      : undefined,
    descriptionJson: {
      description: dj?.description ?? dj?.headline ?? "",
      badge: dj?.badge ?? null,
      features: descFeats,
    },
    includesBusinessPlan: api.includesBusinessPlan,
    parentPlanName: api.parentPlanName,
    extraBusinessPriceUsd: api.extraBusinessPriceUsd,
    extraBusinessPriceCop: api.extraBusinessPriceCop,
    extraBusinessPriceAnnualUsd: api.extraBusinessPriceAnnualUsd,
    extraBusinessPriceAnnualCop: api.extraBusinessPriceAnnualCop,
  };
}

export function PricingSection({
  mode,
  onSelectPlan,
  currentPlanKey,
  selectedPlanKey,
  annual: externalAnnual,
  onAnnualChange,
  loadingPlanKey,
}: PricingSectionProps) {
  const [apiPlans, setApiPlans] = useState<ApiPlan[]>([]);
  const [creditPack, setCreditPack] = useState<CreditPack | null>(null);
  const [fetching, setFetching] = useState(true);
  const [internalAnnual, setInternalAnnual] = useState(false);

  const annual = externalAnnual !== undefined ? externalAnnual : internalAnnual;
  const setAnnual = (val: boolean) => {
    if (onAnnualChange) onAnnualChange(val);
    else setInternalAnnual(val);
  };

  useEffect(() => {
    fetch(`${BASE}/api/plans`)
      .then(r => r.json())
      .then(d => {
        setApiPlans(d.plans ?? []);
        if (d.creditPack?.credits > 0) setCreditPack(d.creditPack);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  const anyHasAnnual = apiPlans.some(p => p.key !== "free" && (p.priceAnnualUsd ?? 0) > 0);

  const currentPriceCop = mode === "billing" && currentPlanKey
    ? (apiPlans.find(p => p.key === currentPlanKey)?.priceCop ?? 0)
    : 0;

  const businessPlan = apiPlans.find(p => p.key === "business");
  const businessInheritedFeats: PlanFeature[] = businessPlan?.resolvedFeatures?.length
    ? businessPlan.resolvedFeatures.map(text => ({ text, enabled: true }))
    : (businessPlan?.descriptionJson?.features ?? [])
        .filter(f => typeof f === "string" ? true : (f as { enabled: boolean }).enabled !== false)
        .map(f => ({ text: typeof f === "string" ? f : (f as { text: string }).text, enabled: true }));

  const cardMode = mode;

  function handleSelect(planKey: string) {
    if (mode === "landing") {
      window.location.href = `${BASE}/register?plan=${planKey}`;
      return;
    }
    if (onSelectPlan) onSelectPlan(planKey);
  }

  const footerText = creditPack && creditPack.credits > 0 && creditPack.priceUsd > 0
    ? `Paquetes extra disponibles: +${creditPack.credits} créditos por $${creditPack.priceUsd.toFixed(2)} USD · Cancelá cuando quieras`
    : null;

  const maxDiscount = (() => {
    const discounts = apiPlans
      .filter(p => p.key !== "free" && p.priceUsd > 0 && (p.priceAnnualUsd ?? 0) > 0)
      .map(p => Math.round((1 - (p.priceAnnualUsd! / 12) / p.priceUsd) * 100));
    return discounts.length ? Math.max(...discounts) : 20;
  })();

  return (
    <div>
      {anyHasAnnual && (
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-semibold cursor-pointer transition-colors ${!annual ? "text-foreground" : "text-muted-foreground"}`}
              onClick={() => setAnnual(false)}
            >
              Mensual
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-10 h-6 rounded-full border transition-all flex-shrink-0 ${annual ? "bg-primary border-primary" : "bg-muted border-border"}`}
              aria-label="Toggle facturación anual"
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${annual ? "translate-x-4" : "translate-x-0"}`} />
            </button>
            <span
              className={`text-sm font-semibold cursor-pointer transition-colors ${annual ? "text-foreground" : "text-muted-foreground"}`}
              onClick={() => setAnnual(true)}
            >
              Anual
            </span>
            {annual && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/50 uppercase tracking-wide">
                ⭐ Ahorrá más
              </span>
            )}
          </div>
          {!annual && (
            <button
              onClick={() => setAnnual(true)}
              className="text-xs text-amber-300 hover:text-amber-200 transition-colors flex items-center gap-1 font-medium"
            >
              💡 Pagando anual ahorrás hasta {maxDiscount}% · Ver precio anual →
            </button>
          )}
        </div>
      )}

      {fetching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border-2 border-border rounded-2xl p-5 flex flex-col gap-3 animate-pulse">
              <div className="h-5 bg-muted rounded w-2/3" />
              <div className="h-9 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-5/6" />
              <div className="h-4 bg-muted rounded w-4/5" />
              <div className="mt-auto h-9 bg-muted rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {apiPlans.map(api => {
            const showAnnual = annual && (api.priceAnnualUsd ?? 0) > 0;
            const planData = toPlanCardData(api, showAnnual);
            const isCurrent = mode === "billing" && api.key === currentPlanKey;
            const isDowngrade = mode === "billing" && (api.priceCop ?? 0) < currentPriceCop;
            const isSelected = mode === "register" && api.key === selectedPlanKey;
            const pricePeriodLabel = showAnnual ? "USD/año" : api.key === "free" ? "30 días" : "USD/mes";
            const inherited = api.includesBusinessPlan && businessInheritedFeats.length > 0
              ? businessInheritedFeats
              : undefined;

            return (
              <PlanCard
                key={api.key}
                plan={planData}
                isCurrent={isCurrent}
                isSelected={isSelected}
                onSelect={handleSelect}
                loading={loadingPlanKey !== null && loadingPlanKey !== undefined}
                mode={cardMode}
                pricePeriodLabel={pricePeriodLabel}
                isDowngrade={isDowngrade && !isCurrent}
                inheritedFeatures={inherited}
              />
            );
          })}
        </div>
      )}

      {footerText && (
        <p className="text-xs text-muted-foreground text-center mt-1">{footerText}</p>
      )}
    </div>
  );
}
