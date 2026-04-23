import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SeoMeta } from "@/hooks/useSeoMeta";
import { Eye, EyeOff, ChevronDown, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { PricingSection } from "@/components/PricingSection";
import { OnboardingWizard } from "@/components/OnboardingWizard";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M47.532 24.552c0-1.636-.148-3.2-.422-4.701H24.48v8.888h12.987c-.56 3.016-2.254 5.574-4.802 7.288v6.056h7.772c4.55-4.189 7.095-10.354 7.095-17.53z" fill="#4285F4"/>
      <path d="M24.48 48c6.516 0 11.98-2.16 15.974-5.856l-7.772-6.056c-2.16 1.444-4.922 2.3-8.202 2.3-6.304 0-11.641-4.258-13.548-9.977H2.9v6.252C6.876 42.862 15.064 48 24.48 48z" fill="#34A853"/>
      <path d="M10.932 28.41A14.9 14.9 0 0 1 10.17 24c0-1.53.264-3.015.762-4.41V13.34H2.9A23.996 23.996 0 0 0 .48 24c0 3.877.928 7.543 2.42 10.662l8.032-6.252z" fill="#FBBC05"/>
      <path d="M24.48 9.613c3.556 0 6.748 1.223 9.262 3.623l6.942-6.942C36.456 2.386 30.996 0 24.48 0 15.064 0 6.876 5.138 2.9 13.34l8.032 6.252c1.907-5.72 7.244-9.978 13.548-9.978z" fill="#EA4335"/>
    </svg>
  );
}

const PLAN_NAMES: Record<string, string> = {
  free:     "Básico",
  starter:  "Emprendedor",
  business: "Negocio",
  agency:   "Agencia",
};

function checkPasswordStrength(p: string) {
  return {
    minLength:  p.length >= 8,
    hasUpper:   /[A-Z]/.test(p),
    hasNumber:  /[0-9]/.test(p),
    hasSpecial: /[^a-zA-Z0-9]/.test(p),
  };
}

function PasswordStrengthHints({ password }: { password: string }) {
  if (!password) return null;
  const s = checkPasswordStrength(password);
  const rules = [
    { ok: s.minLength,  label: "Mín. 8 caracteres" },
    { ok: s.hasUpper,   label: "1 mayúscula" },
    { ok: s.hasNumber,  label: "1 número" },
    { ok: s.hasSpecial, label: "1 carácter especial (!@#…)" },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 mt-2">
      {rules.map(({ ok, label }) => (
        <div key={label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-400" : "text-muted-foreground/70"}`}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? "bg-green-400" : "bg-muted-foreground/30"}`} />
          {label}
        </div>
      ))}
    </div>
  );
}

export default function Register() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [unifiedCode, setUnifiedCode] = useState("");
  const [codeFromUrl, setCodeFromUrl] = useState(false);
  const [showCodeField, setShowCodeField] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const passwordsMatch = password !== "" && confirmPassword !== "" && password === confirmPassword;
  const confirmMismatch = confirmPassword !== "" && password !== confirmPassword;
  const strength = checkPasswordStrength(password);
  const isPasswordStrong = strength.minLength && strength.hasUpper && strength.hasNumber && strength.hasSpecial;

  function detectCodeType(code: string): "referral" | "affiliate" | "invalid" | "empty" {
    if (!code) return "empty";
    const upper = code.toUpperCase();
    if (upper.startsWith("R") || upper.startsWith("HAZ")) return "referral";
    if (upper.startsWith("A")) return "affiliate";
    return "invalid";
  }

  const codeType = detectCodeType(unifiedCode);

  function splitCode(): { referralCode?: string; affiliateCode?: string } {
    if (!unifiedCode) return {};
    if (codeType === "referral") return { referralCode: unifiedCode.toUpperCase() };
    if (codeType === "affiliate") return { affiliateCode: unifiedCode.toUpperCase() };
    return {};
  }

  const [selectedPlan, setSelectedPlan] = useState("free");
  const [pendingPlanAfterWizard, setPendingPlanAfterWizard] = useState<string | undefined>();

  const [loading, setLoading] = useState(false);
  const [incompleteReg, setIncompleteReg] = useState(false);
  const { register } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setUnifiedCode(ref.trim().toUpperCase());
      setCodeFromUrl(true);
    }
    const planParam = params.get("plan");
    if (planParam && planParam in PLAN_NAMES) {
      setSelectedPlan(planParam);
    }
  }, []);

  function checkTerms() {
    if (!termsAccepted) {
      toast({
        title: "Acepta los términos",
        description: "Debes aceptar los Términos de Servicio y la Política de Privacidad para continuar.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  }

  function goToStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!checkTerms()) return;
    if (!isPasswordStrong) {
      toast({ title: "Contraseña débil", description: "Asegúrate de cumplir todos los requisitos de contraseña.", variant: "destructive" });
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      toast({ title: "Las contraseñas no coinciden", description: "Verifica que ambas contraseñas sean iguales.", variant: "destructive" });
      return;
    }
    if (!confirmPassword) {
      toast({ title: "Confirma tu contraseña", description: "Escribe tu contraseña nuevamente para continuar.", variant: "destructive" });
      return;
    }
    if (!email) {
      toast({ title: "Error", description: "El correo electrónico es requerido", variant: "destructive" });
      return;
    }
    if (unifiedCode && codeType === "invalid") {
      toast({ title: "Código inválido", description: "El código debe empezar con R (referido) o A (afiliado)", variant: "destructive" });
      return;
    }
    setStep(2);
  }

  async function goToWizard() {
    setLoading(true);
    try {
      const { referralCode, affiliateCode } = splitCode();
      const result = await register(email, password, displayName || undefined, affiliateCode, referralCode, selectedPlan);
      setPendingPlanAfterWizard(result.pendingPlan);
      setStep(3);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "incomplete_registration") {
        setIncompleteReg(true);
      } else {
        toast({ title: "Error", description: err instanceof Error ? err.message : "Error al registrarse", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleWizardComplete() {
    if (pendingPlanAfterWizard) {
      try {
        const resp = await fetch(`${BASE}/api/billing/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ planId: pendingPlanAfterWizard }),
        });
        const data = await resp.json();
        if (resp.ok && data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
      } catch {}
      navigate("/billing");
    } else {
      navigate("/dashboard");
    }
  }

  function handleGoogleRegister() {
    if (!checkTerms()) return;
    window.location.href = `${BASE}/api/auth/google`;
  }

  const selectedPlanName = PLAN_NAMES[selectedPlan] ?? selectedPlan;

  const TOTAL_STEPS = 3;
  const stepLabels = ["Tu cuenta", "Elige tu plan", "Tu negocio"];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 dark">
      <SeoMeta
        title="Crear cuenta gratis — HazPost | 30 días gratis"
        description="Regístrate en HazPost y empieza a publicar en Instagram, TikTok y Facebook con IA. Prueba gratis por 30 días, sin tarjeta de crédito."
        canonical="https://hazpost.app/register"
        ogTitle="Crea tu cuenta gratis en HazPost"
        ogDescription="Gestiona tus redes sociales con IA. Crea contenido, programa posts y publica automáticamente. Prueba gratis 30 días."
        ogUrl="https://hazpost.app/register"
        ogImage="https://hazpost.app/opengraph.jpg"
      />

      {/* ─── STEP 3: Onboarding wizard (fullscreen) ─── */}
      {step === 3 && (
        <OnboardingWizard
          onComplete={handleWizardComplete}
          registrationMode
          onChooseFree={pendingPlanAfterWizard ? () => navigate("/dashboard") : undefined}
        />
      )}

      {step !== 3 && (
        <div className={`w-full ${step === 2 ? "max-w-5xl" : "max-w-sm"}`}>
          {/* Logo */}
          <div className="flex flex-col items-center mb-8 gap-3">
            <div className="flex items-center gap-1">
              <span className="text-4xl font-black text-white" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em'}}>haz</span>
              <span className="text-4xl font-black" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em',color:'#00C2FF'}}>post</span>
            </div>
            <p className="text-muted-foreground text-sm">Crear cuenta</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {stepLabels.map((label, i) => {
              const sNum = i + 1;
              const isDone = step > sNum;
              const isCurrent = step === sNum;
              return (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <div className="w-6 h-px bg-border" />}
                  <div className={`flex items-center gap-1.5 text-xs ${isCurrent ? "text-primary font-medium" : isDone ? "text-green-400" : "text-muted-foreground"}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border ${isCurrent ? "border-primary bg-primary/10 text-primary" : isDone ? "border-green-500 bg-green-500/10 text-green-400" : "border-border"}`}>
                      {isDone ? <Check className="w-3 h-3" /> : sNum}
                    </div>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── STEP 1: Account data ─── */}
          {step === 1 && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4">
              <div>
                <h1 className="text-xl font-semibold text-foreground mb-1">Registro</h1>
                <p className="text-xs text-muted-foreground">Crea tu cuenta gratis y empieza a publicar con IA.</p>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2 h-10 border-border hover:bg-white/5"
                onClick={handleGoogleRegister}
              >
                <GoogleIcon />
                <span>Continuar con Google</span>
              </Button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">o con email</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <form onSubmit={goToStep2} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nombre (opcional)</Label>
                  <Input
                    id="name"
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Tu nombre"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="hola@tuempresa.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      className="pr-16"
                      style={{ fontSize: "16px" }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-10 top-1/2 -translate-y-1/2 z-10 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrengthHints password={password} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repite tu contraseña"
                      required
                      className={`pr-16 ${confirmMismatch ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      style={{ fontSize: "16px" }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(v => !v)}
                      className="absolute right-10 top-1/2 -translate-y-1/2 z-10 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmMismatch && (
                    <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
                  )}
                </div>

                {codeFromUrl && unifiedCode ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {codeType === "affiliate" ? "Código de afiliado" : "Código de referido"}
                    </Label>
                    <Input
                      type="text"
                      value={unifiedCode}
                      disabled
                      className="font-mono text-sm bg-primary/5 border-primary/30 text-primary cursor-not-allowed"
                    />
                    {codeType === "referral" && (
                      <p className="text-xs text-primary">Ambos recibirán créditos al completar tu registro.</p>
                    )}
                    {codeType === "affiliate" && (
                      <p className="text-xs text-primary">Código de descuento aplicado.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowCodeField(v => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${showCodeField ? "rotate-180" : ""}`} />
                      ¿Tienes un código de referido o afiliado?
                    </button>
                    {showCodeField && (
                      <div className="mt-2 space-y-1">
                        <Input
                          type="text"
                          value={unifiedCode}
                          onChange={e => setUnifiedCode(e.target.value.toUpperCase())}
                          placeholder="Ingresa tu código aquí"
                          maxLength={30}
                          className={`font-mono text-sm ${codeType === "invalid" ? "border-destructive" : ""}`}
                        />
                        {codeType === "referral" && unifiedCode && (
                          <p className="text-xs text-primary">✓ Código de referido — ambos recibirán créditos al registrarte.</p>
                        )}
                        {codeType === "affiliate" && unifiedCode && (
                          <p className="text-xs text-primary">✓ Código de afiliado aplicado.</p>
                        )}
                        {codeType === "invalid" && unifiedCode && (
                          <p className="text-xs text-destructive">El código debe empezar con R (referido) o A (afiliado).</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={e => setTermsAccepted(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${termsAccepted ? 'bg-primary border-primary' : 'border-border/60 bg-background group-hover:border-primary/50'}`}>
                      {termsAccepted && (
                        <svg className="w-2.5 h-2.5 text-background" fill="none" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    He leído y acepto los{" "}
                    <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium" onClick={e => e.stopPropagation()}>
                      Términos de Servicio
                    </a>
                    {" "}y la{" "}
                    <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium" onClick={e => e.stopPropagation()}>
                      Política de Privacidad
                    </a>
                    {" "}de hazpost.
                  </span>
                </label>

                <Button type="submit" className="w-full gap-2" disabled={!termsAccepted || !isPasswordStrong || !passwordsMatch}>
                  Siguiente <ArrowRight className="w-4 h-4" />
                </Button>
              </form>
            </div>
          )}

          {/* ─── STEP 2: Plan selection ─── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Header */}
              <div style={{background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:"20px 24px"}}>
                <h1 style={{fontSize:"1.3rem", fontWeight:700, color:"#fff", marginBottom:4}}>Elige tu plan</h1>
                <p style={{fontSize:"0.82rem", color:"#8888A8"}}>Puedes cambiar de plan en cualquier momento desde tu cuenta.</p>
              </div>

              {incompleteReg && (
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300 space-y-1">
                  <p className="font-medium">Ya tienes un registro iniciado con este correo.</p>
                  <p className="text-yellow-300/80">
                    Tu cuenta fue creada pero el perfil de negocio no se completó.{" "}
                    <a href="/login" className="underline font-semibold hover:text-yellow-100">
                      Inicia sesión
                    </a>{" "}
                    para retomar el proceso.
                  </p>
                </div>
              )}

              {/* CTA bar top */}
              <div className="flex gap-3">
                <Button variant="outline" className="gap-2" onClick={() => setStep(1)} disabled={loading}>
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </Button>
                <Button className="flex-1 gap-2" onClick={goToWizard} disabled={loading || incompleteReg}>
                  {loading
                    ? "Creando cuenta…"
                    : selectedPlan === "free"
                      ? "Crear cuenta gratis"
                      : `Crear cuenta con ${selectedPlanName}`}
                </Button>
              </div>

              {/* Plan cards via PricingSection */}
              <PricingSection
                mode="register"
                selectedPlanKey={selectedPlan}
                onSelectPlan={setSelectedPlan}
              />

              {selectedPlan && selectedPlan !== "free" && (
                <div style={{background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:12, padding:"12px 16px", fontSize:"0.78rem", color:"#f59e0b"}}>
                  Los planes de pago requieren confirmación de pago después del registro. Se iniciará el proceso de pago al crear tu cuenta.
                </div>
              )}

              {/* CTA bar bottom */}
              <div className="flex gap-3">
                <Button variant="outline" className="gap-2" onClick={() => setStep(1)} disabled={loading}>
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </Button>
                <Button className="flex-1 gap-2" onClick={goToWizard} disabled={loading || incompleteReg}>
                  {loading
                    ? "Creando cuenta…"
                    : selectedPlan === "free"
                      ? "Crear cuenta gratis"
                      : `Crear cuenta con ${selectedPlanName}`}
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <p className="text-center text-xs text-muted-foreground mt-6">
              ¿Ya tienes cuenta?{" "}
              <a href="/login" className="text-primary hover:underline">Inicia sesión</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
