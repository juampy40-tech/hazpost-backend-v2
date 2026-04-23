import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { PricingSection } from "@/components/PricingSection";
import { SeoMeta } from "@/hooks/useSeoMeta";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function Pricing() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleCheckout(planKey: string) {
    if (planKey === "free") {
      toast({ title: "Plan Gratis", description: "Este plan es gratuito — ya lo tienes activado." });
      return;
    }
    setLoadingPlan(planKey);
    try {
      const resp = await fetch(`${BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId: planKey }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Error", description: data.error || "No se pudo iniciar el pago.", variant: "destructive" });
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Pago en configuración", description: "Contacta al administrador para activar tu plan.", variant: "default" });
      }
    } catch {
      toast({ title: "Error de red", description: "No se pudo conectar con el servidor.", variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <SeoMeta
        title="Planes y Precios — HazPost | Publicación automática en redes sociales"
        description="Elige el plan ideal para tu negocio o agencia. Gratis, Emprendedor, Negocio y Agencia. Paga con PSE, Nequi, Bancolombia o tarjeta. Prueba gratis 30 días."
        canonical="https://hazpost.app/pricing"
        ogTitle="Planes y Precios — HazPost"
        ogDescription="Desde $0 hasta planes profesionales para agencias. Publicación automática en Instagram, TikTok y Facebook con IA."
        ogUrl="https://hazpost.app/pricing"
        ogImage="https://hazpost.app/opengraph.jpg"
      />
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">Planes y Precios</h1>
          <p className="text-muted-foreground">Elige el plan que mejor se adapte a tu negocio. Paga con PSE, Nequi, Bancolombia o tarjeta.</p>
          {user && (
            <p className="text-sm text-blue-400 mt-2">
              Tu plan actual: <strong>{user.plan}</strong>
            </p>
          )}
        </div>

        <PricingSection
          mode="billing"
          currentPlanKey={user?.plan}
          onSelectPlan={handleCheckout}
          loadingPlanKey={loadingPlan}
        />

        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Pagos procesados de forma segura por <strong>Wompi</strong> (Bancolombia).
            Acepta PSE, Nequi, Bancolombia, Visa y Mastercard.
          </p>
          {user && (
            <button
              onClick={() => navigate("/")}
              className="mt-3 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            >
              Volver al panel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
