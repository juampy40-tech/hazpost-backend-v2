import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ChevronRight, Building2, Star, ShoppingCart, AlertTriangle, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface PlanInfo {
  key: string;
  name: string;
  priceUsd: number;
  businessesAllowed: number;
}

interface Business {
  id: number;
  name: string;
  industry?: string | null;
  isDefault?: boolean;
}

interface DowngradeModalProps {
  currentPlan: PlanInfo;
  targetPlan: PlanInfo;
  periodEnd: string;
  activeBusinesses: Business[];
  inactiveBusinesses?: Business[];
  extraBusinessSlots: number;
  extraBusinessPriceUsd?: number;
  extraBusinessPriceCop?: number;
  onClose: () => void;
  onDowngradeScheduled: () => void;
  onAddToCart?: () => void;
}

export function DowngradeModal({
  currentPlan,
  targetPlan,
  periodEnd,
  activeBusinesses,
  inactiveBusinesses = [],
  extraBusinessSlots,
  extraBusinessPriceUsd,
  extraBusinessPriceCop,
  onClose,
  onDowngradeScheduled,
  onAddToCart,
}: DowngradeModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [localExtraSlots, setLocalExtraSlots] = useState(extraBusinessSlots);
  const [selectedIds, setSelectedIds] = useState<number[]>(() => {
    const effectiveLimit = (targetPlan.businessesAllowed ?? 1) + extraBusinessSlots;
    return activeBusinesses.slice(0, effectiveLimit).map(b => b.id);
  });
  const [primaryId, setPrimaryId] = useState<number>(() => {
    const defaultBiz = activeBusinesses.find(b => b.isDefault);
    return defaultBiz?.id ?? activeBusinesses[0]?.id ?? 0;
  });
  const [loading, setLoading] = useState(false);

  const effectiveLimit = (targetPlan.businessesAllowed ?? 1) + localExtraSlots;
  const totalBusinesses = activeBusinesses.length + inactiveBusinesses.length;
  const needsBusinessSelection = activeBusinesses.length > effectiveLimit;
  const totalSteps = needsBusinessSelection ? 3 : 2;
  const periodEndDate = new Date(periodEnd);
  const changeDate = new Date(periodEndDate.getTime() + 24 * 60 * 60 * 1000);

  function toggleBusiness(id: number) {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        if (id === primaryId) {
          const next = prev.find(pid => pid !== id);
          if (next) setPrimaryId(next);
        }
        return prev.filter(pid => pid !== id);
      }
      if (prev.length >= effectiveLimit) {
        toast({ title: "Límite alcanzado", description: `El plan ${targetPlan.name} permite hasta ${effectiveLimit} negocio(s). Compra un slot adicional para agregar más.`, variant: "destructive" });
        return prev;
      }
      return [...prev, id];
    });
  }

  function setPrimary(id: number) {
    if (!selectedIds.includes(id)) {
      toggleBusiness(id);
    }
    setPrimaryId(id);
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      const keepBusinessIds = needsBusinessSelection ? selectedIds : activeBusinesses.map(b => b.id);
      const primaryBusinessId = needsBusinessSelection ? primaryId : (activeBusinesses.find(b => b.isDefault)?.id ?? activeBusinesses[0]?.id);

      const res = await fetch(`${BASE}/api/billing/schedule-downgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetPlan: targetPlan.key,
          keepBusinessIds,
          primaryBusinessId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "No se pudo programar el cambio.", variant: "destructive" });
        return;
      }
      toast({ title: "Cambio programado", description: data.message });
      onDowngradeScheduled();
    } catch {
      toast({ title: "Error de conexión", description: "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function canProceed() {
    if (step === 2 && needsBusinessSelection) {
      return selectedIds.length > 0 && selectedIds.length <= effectiveLimit && selectedIds.includes(primaryId);
    }
    return true;
  }

  function nextStep() {
    // step 1 → step 2 always (business picker or summary, depending on needsBusinessSelection)
    // step 2 (with business selection) → step 3 (summary)
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">Programar cambio de plan</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentPlan.name} → {targetPlan.name} · Paso {step} de {totalSteps}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-4 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s < step ? "bg-primary text-white" : s === step ? "bg-primary/20 text-primary border border-primary" : "bg-muted text-muted-foreground"}`}>
                {s < step ? <Check className="w-3 h-3" /> : s}
              </div>
              {s < totalSteps && <div className={`h-0.5 flex-1 ${s < step ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Confirm dates */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Plan actual</span>
                <Badge variant="outline" className="text-primary border-primary/40">{currentPlan.name}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Activo hasta</span>
                <span className="text-sm font-medium text-foreground">{periodEndDate.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Nuevo plan comienza</span>
                <span className="text-sm font-medium text-primary">{changeDate.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Plan a activar</span>
                <Badge variant="secondary">{targetPlan.name}</Badge>
              </div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-xs text-blue-400 leading-relaxed">
                Tu plan <strong>{currentPlan.name}</strong> sigue activo con todas sus funciones hasta el {periodEndDate.toLocaleDateString("es-CO")}. El {changeDate.toLocaleDateString("es-CO")} pasarás automáticamente al plan <strong>{targetPlan.name}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Select businesses */}
        {step === 2 && needsBusinessSelection && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400 leading-relaxed">
                  El plan <strong>{targetPlan.name}</strong> permite hasta <strong>{effectiveLimit} negocio(s)</strong> activos. Tienes {activeBusinesses.length} activos. Selecciona cuáles conservar.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Selecciona hasta {effectiveLimit} negocio(s) a conservar:</p>
              {activeBusinesses.map(biz => {
                const isSelected = selectedIds.includes(biz.id);
                const isPrimary = primaryId === biz.id;
                return (
                  <div
                    key={biz.id}
                    className={`border rounded-xl p-3 cursor-pointer transition-all ${isSelected ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20 opacity-60"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "bg-primary border-primary" : "border-border"}`}
                        onClick={() => toggleBusiness(biz.id)}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0" onClick={() => toggleBusiness(biz.id)}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{biz.name}</span>
                          {isPrimary && isSelected && (
                            <Badge className="text-[10px] py-0 px-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30">Principal</Badge>
                          )}
                        </div>
                        {biz.industry && <p className="text-xs text-muted-foreground">{biz.industry}</p>}
                      </div>
                      {isSelected && (
                        <button
                          onClick={() => setPrimary(biz.id)}
                          title="Hacer negocio principal"
                          className={`p-1 rounded transition-colors shrink-0 ${isPrimary ? "text-amber-400" : "text-muted-foreground hover:text-amber-400"}`}
                        >
                          <Star className="w-4 h-4" fill={isPrimary ? "currentColor" : "none"} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Inactive businesses: reactivate in selection ── */}
            {inactiveBusinesses.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Negocios inactivos (puedes reactivarlos en tu nueva selección):</p>
                {inactiveBusinesses.map(biz => {
                  const isSelected = selectedIds.includes(biz.id);
                  const atLimit = selectedIds.length >= effectiveLimit;
                  const canSelect = isSelected || !atLimit;
                  return (
                    <div
                      key={biz.id}
                      className={`border rounded-xl p-3 transition-all border-dashed ${isSelected ? "border-primary/50 bg-primary/5 cursor-pointer" : atLimit ? "border-border bg-muted/10 opacity-50" : "border-border bg-muted/10 opacity-70 cursor-pointer"}`}
                      onClick={() => canSelect && toggleBusiness(biz.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "bg-primary border-primary" : "border-border"}`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">{biz.name}</span>
                            <Badge className="text-[10px] py-0 px-1.5 bg-muted text-muted-foreground border-border">Inactivo</Badge>
                            {isSelected && <Badge className="text-[10px] py-0 px-1.5 bg-green-500/20 text-green-400 border-green-500/30">Se reactivará</Badge>}
                          </div>
                          {biz.industry && <p className="text-xs text-muted-foreground">{biz.industry}</p>}
                        </div>
                        {atLimit && !isSelected && onAddToCart && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setLocalExtraSlots(prev => prev + 1);
                              onAddToCart();
                              toast({ title: "Slot agregado al carrito", description: "Ya puedes seleccionar este negocio." });
                            }}
                            className="flex items-center gap-1 text-[10px] text-primary hover:underline shrink-0"
                          >
                            <ShoppingCart className="w-3 h-3" />
                            Comprar slot
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedIds.length} de {effectiveLimit} seleccionados</span>
              {onAddToCart && totalBusinesses > effectiveLimit && (
                <button
                  onClick={() => {
                    setLocalExtraSlots(prev => prev + 1);
                    onAddToCart();
                    toast({ title: "Slot agregado al carrito", description: "Ahora puedes seleccionar un negocio más. El slot se cobra al finalizar el pago." });
                  }}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ShoppingCart className="w-3 h-3" />
                  Comprar slot extra {extraBusinessPriceUsd ? `($${extraBusinessPriceUsd}/mes)` : ""}
                </button>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground">
              <Star className="w-3 h-3 inline mr-0.5 text-amber-400" fill="currentColor" />
              Haz clic en la estrella para marcar el negocio principal. Los negocios no seleccionados pasarán a inactivos (datos conservados, reactivables en el futuro).
            </p>
          </div>
        )}

        {/* Step 3: Summary */}
        {step === totalSteps && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Resumen del cambio programado:</p>
            <div className="space-y-2.5">
              <SummaryRow label="Cambio programado" value={`${currentPlan.name} → ${targetPlan.name}`} />
              <SummaryRow label="Efectivo el" value={changeDate.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
              {needsBusinessSelection && (
                <>
                  <SummaryRow
                    label="Negocios activos"
                    value={activeBusinesses.filter(b => selectedIds.includes(b.id)).map(b => b.name).join(", ")}
                  />
                  {activeBusinesses.some(b => !selectedIds.includes(b.id)) && (
                    <SummaryRow
                      label="Pasarán a inactivos"
                      value={activeBusinesses.filter(b => !selectedIds.includes(b.id)).map(b => b.name).join(", ")}
                      valueClass="text-amber-400"
                    />
                  )}
                  <SummaryRow
                    label="Negocio principal"
                    value={activeBusinesses.find(b => b.id === primaryId)?.name ?? "—"}
                    valueClass="text-primary"
                  />
                </>
              )}
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-xs text-blue-400">
                Puedes cancelar este cambio en cualquier momento desde la sección Plan y Créditos antes de la fecha de vencimiento.
              </p>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={step === 1 ? onClose : () => setStep(s => (s === 3 && needsBusinessSelection ? 2 : 1))}
            disabled={loading}
          >
            {step === 1 ? "Cancelar" : "Atrás"}
          </Button>
          {step < totalSteps ? (
            <Button className="flex-1" onClick={nextStep} disabled={!canProceed()}>
              Continuar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={handleConfirm} disabled={loading || !canProceed()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar cambio
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, valueClass = "text-foreground" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-medium text-right ${valueClass}`}>{value}</span>
    </div>
  );
}
