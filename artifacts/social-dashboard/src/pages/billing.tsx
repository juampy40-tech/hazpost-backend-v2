import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Check, CreditCard, Zap, ChevronDown, ChevronUp, Clock, X, Coins,
  Image, PlaySquare, LayoutList, BookImage, Gift, Loader2, CalendarDays,
  Building2, AlertTriangle, RefreshCw, Package, ShoppingCart, ArrowDownRight,
} from "lucide-react";
import { type PlanCardData, type PlanFeature } from "@/components/PlanCard";
import { PricingSection } from "@/components/PricingSection";
import { DowngradeModal } from "@/components/DowngradeModal";
import { DeleteBusinessModal } from "@/components/DeleteBusinessModal";
import { BillingCart, type CartItem } from "@/components/BillingCart";

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type ApiPlan = PlanCardData & {
  isActive: boolean;
  sortOrder: number;
  priceAnnualUsd?: number;
  priceAnnualCop?: number;
  businessesAllowed?: number;
  reelsPerMonth?: number;
};

interface ProrationData {
  prorationAmountCop: number;
  creditsToAdd: number;
  isFree: boolean;
  daysRemaining: number;
  breakdown: {
    cycleType: string;
    daysOrMonthsUsed: number;
    daysOrMonthsRemaining: number;
    unusedCurrentValue: number;
    newPlanCost: number;
  };
}

interface ProrationModal {
  planKey: string;
  planName: string;
  planHasAnnual: boolean;
  monthlyData: ProrationData | null;
  annualData: ProrationData | null;
  mode: "monthly" | "annual";
}

interface CreditSummary {
  creditsRemaining: number;
  creditsTotal: number;
  creditsUsedThisMonth: number;
  plan: string;
  planName: string;
  planPriceUsd: number;
  costs: {
    image: number;
    story: number;
    carousel: number;
    reel: number;
  };
}

interface BusinessItem {
  id: number;
  name: string;
  industry?: string | null;
  subIndustry?: string | null;
  description?: string | null;
  isDefault?: boolean;
  isActive: boolean;
}

const CONTENT_ICONS: Record<string, React.ElementType> = {
  image: Image,
  reel: PlaySquare,
  carousel: LayoutList,
  story: BookImage,
};

const CONTENT_COLORS: Record<string, string> = {
  image: "text-blue-400 bg-blue-400/10",
  reel: "text-purple-400 bg-purple-400/10",
  carousel: "text-amber-400 bg-amber-400/10",
  story: "text-emerald-400 bg-emerald-400/10",
};

const CONTENT_LABELS: Record<string, string> = {
  image: "Imagen",
  reel: "Reel",
  carousel: "Carrusel",
  story: "Historia",
};

export default function Billing() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<ApiPlan[]>([]);
  const [creditPackPrice, setCreditPackPrice] = useState<{ priceUsd: number; credits: number }>({ priceUsd: 19.99, credits: 100 });
  const [plansLoading, setPlansLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingInfo, setBillingInfo] = useState<{
    plan: string;
    aiCredits: number;
    creditsRemaining?: number;
    creditsTotal?: number;
    planDetails: ApiPlan | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    pendingDowngradePlan?: string | null;
    pendingDowngradeAt?: string | null;
    pendingDowngradeBusinessIds?: number[];
  } | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [prorationModal, setProrationModal] = useState<ProrationModal | null>(null);
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [activeTrial, setActiveTrial] = useState<{ trial_plan: string; trial_end: string; days_remaining: number } | null>(null);

  const [activeBusinesses, setActiveBusinesses] = useState<BusinessItem[]>([]);
  const [inactiveBusinesses, setInactiveBusinesses] = useState<BusinessItem[]>([]);
  const [bizLoading, setBizLoading] = useState(true);
  const [reactivatingId, setReactivatingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BusinessItem | null>(null);
  const [extraSlots, setExtraSlots] = useState(0);
  const [userSecurityMethod, setUserSecurityMethod] = useState<"totp" | "password" | "email" | null>(null);

  const [downgradeTarget, setDowngradeTarget] = useState<ApiPlan | null>(null);
  const [cancelDowngradeLoading, setCancelDowngradeLoading] = useState(false);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const r = await fetch(`${BASE}/api/subscriptions/me`, { credentials: "include" });
      if (r.ok) setBillingInfo(await r.json());
    } catch { /* ignore */ }
    finally { setBillingLoading(false); }
  }, []);

  const loadCreditSummary = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/credits/summary`, { credentials: "include" });
      if (r.ok) setCreditSummary(await r.json());
    } catch { /* ignore */ }
  }, []);

  const loadTrial = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/vouchers/my-trial`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        if (d.active) setActiveTrial({ trial_plan: d.trial_plan, trial_end: d.trial_end, days_remaining: d.days_remaining });
        else setActiveTrial(null);
      }
    } catch { /* ignore */ }
  }, []);

  const loadBusinesses = useCallback(async () => {
    setBizLoading(true);
    try {
      const [activeRes, inactiveRes, subRes, methodRes] = await Promise.all([
        fetch(`${BASE}/api/businesses`, { credentials: "include" }),
        fetch(`${BASE}/api/businesses/inactive`, { credentials: "include" }),
        fetch(`${BASE}/api/subscriptions/me`, { credentials: "include" }),
        fetch(`${BASE}/api/user/delete-account/method`, { credentials: "include" }),
      ]);
      if (activeRes.ok) {
        const data = await activeRes.json();
        setActiveBusinesses((data.businesses ?? data) as BusinessItem[]);
      }
      if (inactiveRes.ok) {
        const data = await inactiveRes.json();
        setInactiveBusinesses((data.businesses ?? data) as BusinessItem[]);
      }
      if (subRes.ok) {
        const data = await subRes.json();
        setExtraSlots(data.extraBusinessSlots ?? 0);
      }
      if (methodRes.ok) {
        const data = await methodRes.json();
        setUserSecurityMethod(data.method ?? null);
      }
    } catch { /* ignore */ }
    finally { setBizLoading(false); }
  }, []);

  useEffect(() => {
    fetch(`${BASE}/api/plans`)
      .then(r => r.json())
      .then(data => {
        setPlans(data.plans ?? []);
        if (data.creditPack?.priceUsd > 0) {
          setCreditPackPrice({ priceUsd: data.creditPack.priceUsd, credits: data.creditPack.credits ?? 100 });
        }
      })
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));

    loadBilling();
    loadCreditSummary();
    loadTrial();
    loadBusinesses();
  }, [loadBilling, loadCreditSummary, loadTrial, loadBusinesses]);

  async function handleVoucherRedeem() {
    if (!voucherCode.trim()) return;
    setVoucherLoading(true);
    try {
      const r = await fetch(`${BASE}/api/vouchers/redeem`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucherCode.trim().toUpperCase() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const msgs: string[] = [];
      if (d.bonus_credits > 0) msgs.push(`+${d.bonus_credits} créditos`);
      if (d.trial_plan) msgs.push(`Plan ${d.trial_plan} por ${d.trial_days} días`);
      toast({ title: `✓ Código aplicado`, description: msgs.join(" · ") || "Beneficio aplicado a tu cuenta" });
      setVoucherCode("");
      loadBilling();
      loadTrial();
      if (refreshUser) refreshUser();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setVoucherLoading(false);
    }
  }

  async function handleCancelDowngrade() {
    setCancelDowngradeLoading(true);
    try {
      const res = await fetch(`${BASE}/api/billing/schedule-downgrade`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "No se pudo cancelar el cambio.", variant: "destructive" });
        return;
      }
      toast({ title: "Cambio cancelado", description: data.message });
      await loadBilling();
    } catch {
      toast({ title: "Error de conexión", description: "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setCancelDowngradeLoading(false);
    }
  }

  async function handleReactivate(bizId: number) {
    setReactivatingId(bizId);
    try {
      const res = await fetch(`${BASE}/api/businesses/${bizId}/reactivate`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "No se pudo reactivar el negocio.", variant: "destructive" });
        return;
      }
      toast({ title: "Negocio reactivado", description: data.message });
      await Promise.all([loadBusinesses(), loadBilling()]);
    } catch {
      toast({ title: "Error de conexión", description: "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setReactivatingId(null);
    }
  }

  const currentPlanKey = user?.plan ?? billingInfo?.plan ?? "free";
  const currentPlanData = plans.find(p => p.key === currentPlanKey);
  const currentPriceCop = currentPlanData?.priceCop ?? 0;

  const trialPlanData = activeTrial
    ? plans.find(p => p.key === activeTrial.trial_plan) ?? null
    : null;
  const displayPlanData = trialPlanData ?? currentPlanData;

  const hasActivePaidSub = currentPriceCop > 0 && !!(billingInfo?.periodStart);

  const creditsRemaining = billingInfo?.creditsRemaining ?? billingInfo?.aiCredits ?? 0;
  const creditsTotal = billingInfo?.creditsTotal ?? displayPlanData?.creditsPerMonth ?? 0;
  const creditsUsedThisMonth = creditSummary?.creditsUsedThisMonth ?? (creditsTotal - creditsRemaining);
  const pct = creditsTotal > 0 ? Math.min(100, (creditsRemaining / creditsTotal) * 100) : 0;
  const costs = creditSummary?.costs;

  const effectiveBusinessLimit = (currentPlanData?.businessesAllowed ?? 1) + extraSlots;

  function formatCop(cop: number) {
    return `$${(cop / 1000).toFixed(0)}K COP`;
  }

  function addToCart(item: DistributiveOmit<CartItem, "id">) {
    const id = `${item.type}-${Date.now()}`;
    setCartItems(prev => [...prev, { ...item, id } as CartItem]);
    toast({ title: "Agregado al carrito", description: `"${item.label}" fue agregado.` });
  }

  function removeFromCart(id: string) {
    setCartItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleSelect(planKey: string) {
    if (planKey === currentPlanKey) return;
    const targetPlan = plans.find(p => p.key === planKey);
    if (!targetPlan) return;

    const isUpgrade = (targetPlan.priceCop ?? 0) > currentPriceCop;
    const isDowngrade = (targetPlan.priceCop ?? 0) < currentPriceCop;

    if (isDowngrade) {
      if (!hasActivePaidSub || !billingInfo?.periodEnd) {
        toast({ title: "Sin suscripción activa", description: "No tienes un plan de pago activo para programar un cambio." });
        return;
      }
      setDowngradeTarget(targetPlan);
      return;
    }

    if (!isUpgrade) return;

    if (hasActivePaidSub) {
      setLoadingPlan(planKey);
      try {
        const [monthlyRes, annualRes] = await Promise.all([
          fetch(`${BASE}/api/billing/prorate-upgrade?planId=${planKey}&annual=false`, { credentials: "include" }),
          (targetPlan.priceAnnualCop ?? 0) > 0
            ? fetch(`${BASE}/api/billing/prorate-upgrade?planId=${planKey}&annual=true`, { credentials: "include" })
            : Promise.resolve(null),
        ]);
        const monthlyData: ProrationData | null = monthlyRes.ok ? await monthlyRes.json() : null;
        const annualData: ProrationData | null = annualRes?.ok ? await annualRes.json() : null;
        setProrationModal({
          planKey,
          planName: targetPlan.name,
          planHasAnnual: (targetPlan.priceAnnualCop ?? 0) > 0,
          monthlyData,
          annualData,
          mode: annual && annualData ? "annual" : "monthly",
        });
      } catch {
        toast({ title: "Error", description: "No se pudo calcular la proration.", variant: "destructive" });
      } finally {
        setLoadingPlan(null);
      }
      return;
    }

    const useAnnual = annual && (targetPlan.priceAnnualCop ?? 0) > 0;
    setLoadingPlan(planKey);
    try {
      const resp = await fetch(`${BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId: planKey, annual: useAnnual }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Error", description: data.error || "No se pudo iniciar el pago.", variant: "destructive" });
        return;
      }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else toast({ title: "Pago en configuración", description: "Contacta al administrador para activar tu plan." });
    } catch {
      toast({ title: "Error de red", description: "No se pudo conectar con el servidor.", variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handleProrationCheckout() {
    if (!prorationModal) return;
    const { planKey, mode, monthlyData, annualData } = prorationModal;
    const data = mode === "annual" ? annualData : monthlyData;
    if (!data) return;
    const useAnnual = mode === "annual";

    if (data.isFree) {
      setLoadingPlan(planKey);
      setProrationModal(null);
      try {
        const resp = await fetch(`${BASE}/api/billing/apply-free-proration`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ planId: planKey, annual: useAnnual }),
        });
        const result = await resp.json();
        if (!resp.ok) {
          toast({ title: "Error", description: result.error || "No se pudo aplicar el upgrade.", variant: "destructive" });
          return;
        }
        toast({ title: "¡Plan actualizado!", description: result.message });
        await refreshUser();
        await Promise.all([loadBilling(), loadCreditSummary()]);
      } catch {
        toast({ title: "Error de red", description: "No se pudo conectar con el servidor.", variant: "destructive" });
      } finally {
        setLoadingPlan(null);
      }
      return;
    }

    setLoadingPlan(planKey);
    setProrationModal(null);
    try {
      const resp = await fetch(`${BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId: planKey, annual: useAnnual, proration: true }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        toast({ title: "Error", description: result.error || "No se pudo iniciar el pago.", variant: "destructive" });
        return;
      }
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
    } catch {
      toast({ title: "Error de red", description: "No se pudo conectar con el servidor.", variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  }

  function prorationBreakdownLabel(data: ProrationData) {
    const { cycleType, daysOrMonthsUsed, daysOrMonthsRemaining, unusedCurrentValue, newPlanCost } = data.breakdown;
    if (cycleType === "annual_to_annual" || cycleType === "monthly_to_annual") {
      const unit = cycleType === "annual_to_annual" ? "meses" : "días";
      return `Usaste ${daysOrMonthsUsed} ${unit} del ciclo actual. Te quedan ${daysOrMonthsRemaining} ${unit}. Crédito restante de tu plan: ${formatCop(unusedCurrentValue)}. Costo del nuevo plan por ese período: ${formatCop(newPlanCost)}.`;
    }
    return `Usaste ${daysOrMonthsUsed} días del ciclo. Te quedan ${daysOrMonthsRemaining} días. Crédito restante de tu plan: ${formatCop(unusedCurrentValue)}. Costo del nuevo plan por ese período: ${formatCop(newPlanCost)}.`;
  }

  const activeModalData = prorationModal
    ? (prorationModal.mode === "annual" ? prorationModal.annualData : prorationModal.monthlyData)
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold">Plan y Créditos</h1>
          </div>
          <p className="text-muted-foreground text-sm">Resumen de tu suscripción, créditos y negocios.</p>
        </div>

        {/* Cart (sticky) */}
        {cartItems.length > 0 && (
          <div className="mb-6">
            <BillingCart
              items={cartItems}
              onRemove={removeFromCart}
              onClear={() => setCartItems([])}
              onUpdateBusiness={(id, field, value) => {
                setCartItems(prev => prev.map(item =>
                  item.id === id && item.type === "extra_business"
                    ? { ...item, pendingBusiness: { ...item.pendingBusiness, [field]: value } }
                    : item
                ));
              }}
              formatCop={formatCop}
            />
          </div>
        )}

        {(billingLoading || plansLoading) ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Credit Balance Card ── */}
            <div className="bg-card border border-border rounded-2xl p-5 mb-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Créditos disponibles</p>
                </div>
              </div>

              <div className="flex items-end gap-2 mb-4">
                <span className="text-4xl font-bold text-foreground tabular-nums">{creditsRemaining.toLocaleString()}</span>
                <span className="text-lg text-muted-foreground mb-0.5">/ {creditsTotal.toLocaleString()}</span>
              </div>

              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{creditsUsedThisMonth} usados este mes</span>
                  <span className={pct < 20 ? "text-red-400" : pct < 50 ? "text-amber-400" : "text-emerald-400"}>
                    {pct.toFixed(0)}% restante
                  </span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: pct < 20 ? "rgb(239,68,68)" : pct < 50 ? "rgb(251,191,36)" : "linear-gradient(90deg, #0077FF, #00C2FF)",
                    }}
                  />
                </div>
              </div>

              {costs && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Costo por tipo de contenido</p>
                  <div className="grid grid-cols-4 gap-2">
                    {(["image", "story", "carousel", "reel"] as const).map(type => {
                      const Icon = CONTENT_ICONS[type];
                      return (
                        <div key={type} className={`flex flex-col items-center gap-1 p-2.5 rounded-xl ${CONTENT_COLORS[type]}`}>
                          <Icon className="w-4 h-4" />
                          <span className="text-xs font-bold">{costs[type]} cr</span>
                          <span className="text-[10px] opacity-80">{CONTENT_LABELS[type]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Current Plan Summary ── */}
            <div className="bg-card border border-border rounded-2xl p-5 mb-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Plan activo</p>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-2xl font-bold text-foreground">
                      {displayPlanData?.name ?? (trialPlanData ? activeTrial!.trial_plan : currentPlanKey)}
                    </span>
                    {trialPlanData ? (
                      <Badge variant="outline" className="text-xs border-amber-400/60 text-amber-400">Prueba activa</Badge>
                    ) : currentPlanKey !== "free" ? (
                      <Badge variant="outline" className="text-xs border-primary/40 text-primary">Activo</Badge>
                    ) : null}
                  </div>
                  {trialPlanData && (
                    <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Tu plan base es <strong className="text-foreground mx-0.5">{currentPlanData?.name ?? currentPlanKey}</strong> · Código de prueba activo
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>
                      <strong className="text-foreground">{creditsRemaining}</strong> créditos disponibles
                      {creditsTotal > 0 && <span className="text-muted-foreground"> de {creditsTotal}/mes</span>}
                    </span>
                  </div>
                  {trialPlanData && activeTrial && (
                    <div className="flex items-center gap-1.5 text-sm text-amber-400/80 mt-1">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Quedan <strong className="text-amber-400">{activeTrial.days_remaining} días</strong> · Prueba vence {new Date(activeTrial.trial_end).toLocaleDateString("es-CO")}
                      </span>
                    </div>
                  )}
                  {!trialPlanData && billingInfo?.periodEnd && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Ciclo activo hasta: {new Date(billingInfo.periodEnd).toLocaleDateString("es-CO")}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllPlans(v => !v)}
                  className="shrink-0"
                >
                  {showAllPlans ? (
                    <><ChevronUp className="w-4 h-4 mr-1.5" />Ocultar planes</>
                  ) : (
                    <><ChevronDown className="w-4 h-4 mr-1.5" />Ver todos los planes</>
                  )}
                </Button>
              </div>

              {/* Pending downgrade banner */}
              {billingInfo?.pendingDowngradePlan && (
                <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-3">
                  <ArrowDownRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-400">Cambio de plan programado</p>
                    <p className="text-xs text-amber-400/80 mt-0.5">
                      Al terminar el ciclo ({billingInfo.pendingDowngradeAt ? new Date(billingInfo.pendingDowngradeAt).toLocaleDateString("es-CO") : "—"}),
                      pasarás automáticamente al plan <strong>{plans.find(p => p.key === billingInfo.pendingDowngradePlan)?.name ?? billingInfo.pendingDowngradePlan}</strong>.
                      {(billingInfo.pendingDowngradeBusinessIds?.length ?? 0) > 0 && (
                        <> Se conservarán {billingInfo.pendingDowngradeBusinessIds!.length} negocio(s) activo(s).</>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 shrink-0 text-xs"
                    onClick={handleCancelDowngrade}
                    disabled={cancelDowngradeLoading}
                  >
                    {cancelDowngradeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><X className="w-3.5 h-3.5 mr-1" />Cancelar cambio</>}
                  </Button>
                </div>
              )}

              {((displayPlanData?.resolvedFeatures?.length ?? 0) > 0 || displayPlanData?.descriptionJson?.features) && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Incluye:</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {displayPlanData!.resolvedFeatures && displayPlanData!.resolvedFeatures.length > 0
                      ? displayPlanData!.resolvedFeatures.map((feat, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Check className="w-3.5 h-3.5 text-green-400 shrink-0" /><span>{feat}</span>
                          </li>
                        ))
                      : (displayPlanData!.descriptionJson?.features as PlanFeature[] ?? [])
                          .filter(f => f.enabled && f.text?.trim())
                          .map((f, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Check className="w-3.5 h-3.5 text-green-400 shrink-0" /><span>{f.text}</span>
                            </li>
                          ))
                    }
                  </ul>
                </div>
              )}
            </div>

            {/* ── Plan grid — shown when expanded ── */}
            {showAllPlans && (
              <>
                <h2 className="text-lg font-semibold mb-4">Cambiar plan</h2>
                <PricingSection
                  mode="billing"
                  currentPlanKey={currentPlanKey}
                  onSelectPlan={handleSelect}
                  loadingPlanKey={loadingPlan}
                  annual={annual}
                  onAnnualChange={setAnnual}
                />
                <p className="text-xs text-muted-foreground text-center mt-2 mb-6">
                  Pagos procesados de forma segura por <strong>Wompi</strong> (Bancolombia).
                  Los upgrades solo cobran el diferencial proporcional al tiempo restante de tu ciclo.
                </p>
              </>
            )}

            {/* ── Active Businesses Section ── */}
            <div className="bg-card border border-border rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Negocios activos</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {activeBusinesses.length} / {effectiveBusinessLimit} slots
                </span>
              </div>

              {bizLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />Cargando...
                </div>
              ) : activeBusinesses.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tienes negocios activos.</p>
              ) : (
                <div className="space-y-2">
                  {activeBusinesses.map(biz => (
                    <div key={biz.id} className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">{biz.name}</span>
                          {biz.isDefault && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Principal</Badge>
                          )}
                        </div>
                        {biz.industry && <p className="text-xs text-muted-foreground">{biz.industry}</p>}
                      </div>
                      {activeBusinesses.length > 1 && !biz.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground hover:text-red-400 shrink-0"
                          onClick={() => setDeleteTarget(biz)}
                        >
                          Desactivar
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Extra slots CTA */}
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {extraSlots > 0
                      ? `${extraSlots} slot(s) adicional(es) activo(s) — total ${effectiveBusinessLimit} negocios`
                      : `Tu plan permite hasta ${currentPlanData?.businessesAllowed ?? 1} negocio(s)`}
                  </p>
                  {activeBusinesses.length >= effectiveBusinessLimit && (
                    <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Límite alcanzado. Compra un slot adicional para agregar más.
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={() => {
                    const priceUsd = currentPlanData?.extraBusinessPriceUsd ?? 0;
                    const priceCop = currentPlanData?.extraBusinessPriceCop ?? 0;
                    if (priceUsd === 0) {
                      toast({ title: "Slots no disponibles", description: "Tu plan actual no permite negocios adicionales. Considera un upgrade.", variant: "destructive" });
                      return;
                    }
                    addToCart({
                      type: "extra_business",
                      label: "Slot de negocio adicional",
                      priceUsd,
                      priceCop,
                      pendingBusiness: { name: "Nuevo negocio" },
                      annual: false,
                    });
                  }}
                >
                  <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                  Agregar slot {currentPlanData?.extraBusinessPriceUsd ? `($${currentPlanData.extraBusinessPriceUsd}/mes)` : ""}
                </Button>
              </div>
            </div>

            {/* ── Inactive Businesses Section ── */}
            {inactiveBusinesses.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Negocios inactivos</p>
                  <Badge variant="secondary" className="text-xs">{inactiveBusinesses.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Sus datos, marca y publicaciones están conservados. Puedes reactivarlos si tienes slots disponibles.
                </p>
                <div className="space-y-2">
                  {inactiveBusinesses.map(biz => {
                    const canReactivate = activeBusinesses.length < effectiveBusinessLimit;
                    return (
                      <div key={biz.id} className="flex items-center gap-3 p-3 bg-muted/10 border border-border/50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-muted-foreground truncate block">{biz.name}</span>
                          {biz.industry && <p className="text-xs text-muted-foreground/60">{biz.industry}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {canReactivate ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => handleReactivate(biz.id)}
                              disabled={reactivatingId === biz.id}
                            >
                              {reactivatingId === biz.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <><RefreshCw className="w-3.5 h-3.5 mr-1" />Reactivar</>
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs border-primary/30 text-primary hover:bg-primary/5"
                              onClick={() => {
                                const priceUsd = currentPlanData?.extraBusinessPriceUsd ?? 0;
                                const priceCop = currentPlanData?.extraBusinessPriceCop ?? 0;
                                if (priceUsd === 0) {
                                  toast({ title: "Slots no disponibles en tu plan", description: "Considera un upgrade para agregar negocios adicionales.", variant: "destructive" });
                                  return;
                                }
                                addToCart({
                                  type: "extra_business",
                                  label: `Reactivar: ${biz.name}`,
                                  priceUsd,
                                  priceCop,
                                  pendingBusiness: { name: biz.name, industry: biz.industry ?? undefined },
                                  reactivateBusinessId: biz.id,
                                  annual: false,
                                });
                                toast({ title: "Slot agregado al carrito", description: `Una vez pagado, "${biz.name}" se reactivará automáticamente.` });
                              }}
                            >
                              <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                              Comprar slot
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-red-400"
                            onClick={() => setDeleteTarget(biz)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Add credits CTA ── */}
            <div className="bg-muted/20 border border-border rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">¿Necesitas más créditos?</p>
                  <p className="text-xs text-muted-foreground">Compra paquetes adicionales sin cambiar de plan.</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs shrink-0"
                onClick={() => addToCart({
                  type: "credit_pack",
                  label: `Paquete de ${creditPackPrice.credits} créditos`,
                  priceUsd: creditPackPrice.priceUsd,
                  priceCop: 0,
                  packageKey: "credits_100",
                })}
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                Agregar créditos
              </Button>
            </div>

            {/* ── Voucher ── */}
            <div className="bg-muted/20 border border-border rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Gift className="w-4 h-4 text-amber-400" />
                <p className="text-sm font-semibold text-foreground">¿Tienes un código de prueba?</p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={voucherCode}
                  onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && handleVoucherRedeem()}
                  placeholder="Ej: PRUEBA30"
                  className="h-9 text-sm font-mono uppercase flex-1"
                  maxLength={50}
                />
                <Button
                  size="sm"
                  onClick={handleVoucherRedeem}
                  disabled={voucherLoading || !voucherCode.trim()}
                  className="shrink-0"
                >
                  {voucherLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Ingresa el código y presiona Aplicar para activar tu prueba gratuita o créditos bonus.</p>
            </div>
          </>
        )}

        {/* ── Proration modal ── */}
        {prorationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Upgrade a {prorationModal.planName}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Solo pagas el diferencial proporcional a tu ciclo actual</p>
                </div>
                <button onClick={() => setProrationModal(null)} className="text-muted-foreground hover:text-foreground ml-4 shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {prorationModal.planHasAnnual && prorationModal.annualData && (
                <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-full px-3 py-1.5 mb-4 w-fit">
                  <span
                    className={`text-xs font-semibold cursor-pointer transition-colors ${prorationModal.mode === "monthly" ? "text-foreground" : "text-muted-foreground"}`}
                    onClick={() => setProrationModal(m => m ? { ...m, mode: "monthly" } : m)}
                  >Mensual</span>
                  <button
                    onClick={() => setProrationModal(m => m ? { ...m, mode: m.mode === "monthly" ? "annual" : "monthly" } : m)}
                    className={`relative w-9 h-5 rounded-full border transition-all flex-shrink-0 ${prorationModal.mode === "annual" ? "bg-primary border-primary" : "bg-muted border-border"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${prorationModal.mode === "annual" ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  <span
                    className={`text-xs font-semibold cursor-pointer transition-colors ${prorationModal.mode === "annual" ? "text-foreground" : "text-muted-foreground"}`}
                    onClick={() => setProrationModal(m => m ? { ...m, mode: "annual" } : m)}
                  >Anual</span>
                </div>
              )}

              {activeModalData && (
                <>
                  <div className="bg-muted/30 rounded-xl p-4 mb-4 text-sm space-y-2">
                    <p className="text-muted-foreground text-xs">{prorationBreakdownLabel(activeModalData)}</p>
                    <div className="border-t border-border pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Créditos del plan anterior (no usados)</span>
                        <span className="text-green-400">−{formatCop(activeModalData.breakdown.unusedCurrentValue)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Costo nuevo plan (período restante)</span>
                        <span>{formatCop(activeModalData.breakdown.newPlanCost)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-sm pt-1 border-t border-border mt-1">
                        <span>Total a pagar</span>
                        {activeModalData.isFree
                          ? <span className="text-green-400">¡Gratis!</span>
                          : <span>{formatCop(activeModalData.prorationAmountCop)}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-primary mt-2">
                      Recibirás +{activeModalData.creditsToAdd} créditos adicionales para el resto del período.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 text-sm" onClick={() => setProrationModal(null)}>Cancelar</Button>
                    <Button className="flex-1 text-sm" disabled={loadingPlan !== null} onClick={handleProrationCheckout}>
                      {activeModalData.isFree ? "Activar gratis" : `Pagar ${formatCop(activeModalData.prorationAmountCop)}`}
                    </Button>
                  </div>
                  {!activeModalData.isFree && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground"
                      onClick={() => {
                        const targetPlan = plans.find(p => p.key === prorationModal.planKey);
                        if (!targetPlan) return;
                        const useAnnual = prorationModal.mode === "annual";
                        const priceUsd = useAnnual && (targetPlan.priceAnnualUsd ?? 0) > 0
                          ? (targetPlan.priceAnnualUsd ?? 0)
                          : (targetPlan.priceUsd ?? 0);
                        const priceCop = useAnnual && (targetPlan.priceAnnualCop ?? 0) > 0
                          ? (targetPlan.priceAnnualCop ?? 0)
                          : (targetPlan.priceCop ?? 0);
                        addToCart({
                          type: "plan_change",
                          label: `Plan ${targetPlan.name}${useAnnual ? " (anual)" : ""}`,
                          priceUsd,
                          priceCop,
                          targetPlan: prorationModal.planKey,
                          annual: useAnnual,
                        });
                        setProrationModal(null);
                        toast({ title: "Plan agregado al carrito", description: "Puedes combinar con créditos o slots adicionales." });
                      }}
                    >
                      <ShoppingCart className="w-3 h-3 mr-1.5" />
                      Agregar al carrito (combinar con otros ítems)
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Downgrade modal ── */}
        {downgradeTarget && billingInfo?.periodEnd && currentPlanData && (
          <DowngradeModal
            currentPlan={{
              key: currentPlanKey,
              name: currentPlanData.name,
              priceUsd: currentPlanData.priceUsd ?? 0,
              businessesAllowed: currentPlanData.businessesAllowed ?? 1,
            }}
            targetPlan={{
              key: downgradeTarget.key,
              name: downgradeTarget.name,
              priceUsd: downgradeTarget.priceUsd ?? 0,
              businessesAllowed: downgradeTarget.businessesAllowed ?? 1,
            }}
            periodEnd={billingInfo.periodEnd}
            activeBusinesses={activeBusinesses}
            inactiveBusinesses={inactiveBusinesses}
            extraBusinessSlots={extraSlots}
            extraBusinessPriceUsd={currentPlanData.extraBusinessPriceUsd}
            extraBusinessPriceCop={currentPlanData.extraBusinessPriceCop}
            onClose={() => setDowngradeTarget(null)}
            onDowngradeScheduled={() => {
              setDowngradeTarget(null);
              loadBilling();
            }}
            onAddToCart={() => {
              const priceUsd = currentPlanData.extraBusinessPriceUsd ?? 0;
              const priceCop = currentPlanData.extraBusinessPriceCop ?? 0;
              addToCart({
                type: "extra_business",
                label: "Slot de negocio adicional",
                priceUsd,
                priceCop,
                pendingBusiness: { name: "Negocio adicional" },
                annual: false,
              });
              // Modal stays open — user continues selecting businesses
            }}
          />
        )}

        {/* ── Delete/deactivate business modal ── */}
        {deleteTarget && (
          <DeleteBusinessModal
            business={deleteTarget}
            userHasPassword={userSecurityMethod === "password" || userSecurityMethod === "totp"}
            userHasTotp={userSecurityMethod === "totp"}
            onClose={() => setDeleteTarget(null)}
            onDeleted={() => {
              setDeleteTarget(null);
              loadBusinesses();
            }}
          />
        )}
      </div>
    </div>
  );
}
