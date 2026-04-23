import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { OnboardingWizard } from "./OnboardingWizard";
import { Sparkles, X, ArrowRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const BANNER_DISMISSED_KEY = "hz_onboarding_banner_dismissed";

interface BrandProfile {
  companyName?: string;
  industry?: string;
  country?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  businessDescription?: string;
  brandFont?: string;
  brandFontUrl?: string;
  audienceDescription?: string;
  brandTone?: string;
  referenceImages?: string;
  onboardingStep?: number;
  onboardingCompleted?: boolean | string;
}

interface OnboardingGuardProps {
  children: React.ReactNode;
}

export function OnboardingGuard({ children }: OnboardingGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);

  const isAdmin = (user as { role?: string } | null)?.role === "admin";

  const fetchBrandProfile = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    if (isAdmin) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const res = await fetch(`${BASE}/api/brand-profile`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setBrandProfile(data.profile);
        const profile: BrandProfile | null = data.profile;
        const completed = profile?.onboardingCompleted === true || profile?.onboardingCompleted === "true";
        const stepDone = (profile?.onboardingStep ?? 0) >= 5;
        const incomplete = !(completed && stepDone);
        setProfileIncomplete(incomplete);
        if (incomplete) {
          const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
          setBannerVisible(!dismissed);
        } else {
          setBannerVisible(false);
          localStorage.removeItem(BANNER_DISMISSED_KEY);
        }
      }
    } catch {
      setProfileIncomplete(false);
      setBannerVisible(false);
    } finally {
      setProfileLoading(false);
    }
  }, [isAuthenticated, user, isAdmin]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      fetchBrandProfile();
    } else if (!isLoading && !isAuthenticated) {
      setProfileLoading(false);
    }
  }, [isLoading, isAuthenticated, user, fetchBrandProfile]);

  function handleWizardComplete() {
    setShowWizard(false);
    setBannerVisible(false);
    localStorage.removeItem(BANNER_DISMISSED_KEY);
    fetchBrandProfile();
  }

  function handleWizardDismiss() {
    setShowWizard(false);
  }

  function handleOpenWizard() {
    setShowWizard(true);
  }

  function handleDismissBanner() {
    setBannerVisible(false);
    localStorage.setItem(BANNER_DISMISSED_KEY, "1");
  }

  if (profileLoading && isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Preparando tu experiencia…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Suggestion banner — non-blocking */}
      {bannerVisible && profileIncomplete && isAuthenticated && !isAdmin && (
        <div
          className="relative z-40 w-full bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center gap-3"
          style={{ minHeight: 44 }}
        >
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <p className="flex-1 text-sm text-foreground/90">
            <span className="font-medium text-primary">Consejo:</span> Entre más información nos des sobre tu negocio, mejores serán los resultados que genera la IA.{" "}
            <button
              onClick={handleOpenWizard}
              className="inline-flex items-center gap-1 underline underline-offset-2 font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Completar perfil <ArrowRight className="w-3 h-3" />
            </button>
          </p>
          <button
            onClick={handleDismissBanner}
            title="Cerrar sugerencia"
            className="ml-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {children}

      {/* Wizard as optional modal */}
      {showWizard && isAuthenticated && (
        <OnboardingWizard
          onComplete={handleWizardComplete}
          onDismiss={handleWizardDismiss}
          initialStep={Math.min(brandProfile?.onboardingStep ?? 0, 4)}
          initialData={brandProfile ?? {}}
        />
      )}
    </>
  );
}
