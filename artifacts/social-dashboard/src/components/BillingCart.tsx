import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, X, Loader2, Package, Building2, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export type CartItem =
  | { id: string; type: "credit_pack"; label: string; priceUsd: number; priceCop: number; packageKey: string }
  | { id: string; type: "extra_business"; label: string; priceUsd: number; priceCop: number; pendingBusiness: { name: string; industry?: string }; reactivateBusinessId?: number; annual: boolean }
  | { id: string; type: "plan_change"; label: string; priceUsd: number; priceCop: number; targetPlan: string; annual: boolean };

interface BillingCartProps {
  items: CartItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onUpdateBusiness: (id: string, field: "name" | "industry", value: string) => void;
  formatCop: (cop: number) => string;
}

const TYPE_ICON: Record<CartItem["type"], React.ElementType> = {
  credit_pack: Package,
  extra_business: Building2,
  plan_change: ArrowUpRight,
};

export function BillingCart({ items, onRemove, onClear, onUpdateBusiness, formatCop }: BillingCartProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const totalUsd = items.reduce((sum, i) => sum + i.priceUsd, 0);
  const totalCop = items.reduce((sum, i) => sum + i.priceCop, 0);

  async function handleCheckout() {
    if (items.length === 0) return;

    // Validate business names are filled
    const unnamedBiz = items.filter(i => i.type === "extra_business" && !i.pendingBusiness.name.trim());
    if (unnamedBiz.length > 0) {
      toast({ title: "Nombre requerido", description: "Escribe el nombre de cada negocio adicional antes de continuar.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const apiItems = items.map(item => {
        if (item.type === "credit_pack") {
          return { type: "credit_pack", packageKey: item.packageKey };
        } else if (item.type === "plan_change") {
          return { type: "plan_change", targetPlan: item.targetPlan, annual: item.annual };
        } else {
          return { type: "extra_business", pendingBusiness: item.pendingBusiness, reactivateBusinessId: item.reactivateBusinessId, annual: item.annual };
        }
      });

      const res = await fetch(`${BASE}/api/billing/cart-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items: apiItems }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "No se pudo iniciar el pago.", variant: "destructive" });
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Procesado", description: data.note ?? "Los ítems fueron procesados.", });
        onClear();
      }
    } catch {
      toast({ title: "Error de conexión", description: "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="sticky top-4 z-30">
      <div className="bg-card border border-primary/30 rounded-2xl shadow-lg overflow-hidden">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {items.length}
              </span>
            </div>
            <span className="text-sm font-semibold text-foreground">Carrito de compras</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-primary">${totalUsd.toFixed(2)} USD</p>
              {totalCop > 0 && <p className="text-[10px] text-muted-foreground">{formatCop(totalCop)}</p>}
            </div>
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {open && (
          <div className="border-t border-border px-4 pb-4 space-y-2 pt-2">
            {items.map(item => {
              const Icon = TYPE_ICON[item.type];
              return (
                <div key={item.id} className="py-2 border-b border-border/50 last:border-0 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">${item.priceUsd.toFixed(2)} USD</p>
                    </div>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {item.type === "extra_business" && (
                    <div className="ml-10 space-y-1">
                      <Input
                        value={item.pendingBusiness.name}
                        onChange={e => onUpdateBusiness(item.id, "name", e.target.value)}
                        placeholder="Nombre del negocio *"
                        className="h-7 text-xs pl-2"
                      />
                      <Input
                        value={item.pendingBusiness.industry ?? ""}
                        onChange={e => onUpdateBusiness(item.id, "industry", e.target.value)}
                        placeholder="Industria (ej: Panadería, Boutique)"
                        className="h-7 text-xs pl-2"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total estimado</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">${totalUsd.toFixed(2)} USD*</p>
                  {totalCop > 0 && <p className="text-[10px] text-muted-foreground">{formatCop(totalCop)}</p>}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/70">* El monto final se calcula al confirmar el pago.</p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={onClear}
                disabled={loading}
              >
                Vaciar
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs bg-primary hover:bg-primary/90"
                onClick={handleCheckout}
                disabled={loading || items.length === 0}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                {totalUsd <= 0 ? "Procesar" : `Pagar $${totalUsd.toFixed(2)}`}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Pagos procesados por Wompi (Bancolombia)</p>
          </div>
        )}
      </div>
    </div>
  );
}
