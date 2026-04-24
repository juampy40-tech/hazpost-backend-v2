import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SeoMeta } from "@/hooks/useSeoMeta";
import { Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import ecoLogoWhite from "../assets/eco-logo-white.png";

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

function ForgotPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string } | null>(null);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch(`${BASE}/api/user/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json();
      setResult({ message: data.message });
    } catch {
      toast({ title: "Error", description: "No se pudo conectar con el servidor.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setEmail("");
    setResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="dark max-w-sm">
        <DialogHeader>
          <DialogTitle>Recuperar contraseña</DialogTitle>
          <DialogDescription>
            Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
          </DialogDescription>
        </DialogHeader>
        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Correo electrónico</Label>
              <Input id="forgot-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="hola@tuempresa.com" autoComplete="email" required className="text-base" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" disabled={loading || !email}>{loading ? "Enviando…" : "Enviar enlace"}</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{result.message}</p>
            <Button className="w-full" onClick={handleClose}>Listo</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Step 2: TOTP code entry after password is validated */
function TotpStep({
  preAuthToken,
  onBack,
  onSuccess,
}: {
  preAuthToken: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { refreshUser } = useAuth();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/auth/totp/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preAuthToken, code: code.trim(), trustDevice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Código incorrecto");
        setCode("");
        inputRef.current?.focus();
        return;
      }
      await refreshUser();
      onSuccess();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(val: string) {
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    setCode(cleaned);
    setError("");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Verificación en dos pasos</h2>
          <p className="text-xs text-muted-foreground">Ingresa el código de Google Authenticator</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="totp-code">Código de 6 dígitos</Label>
          <Input
            ref={inputRef}
            id="totp-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={code}
            onChange={e => handleCodeChange(e.target.value)}
            placeholder="000000"
            maxLength={6}
            autoComplete="one-time-code"
            className="text-center text-2xl tracking-[0.5em] font-mono h-14"
            style={{ fontSize: "24px", letterSpacing: "0.5em" }}
          />
          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Abre <span className="font-medium text-foreground">Google Authenticator</span> y usa el código de hazpost
          </p>
        </div>

        {/* Trust device option */}
        <label className="flex items-start gap-2.5 cursor-pointer group">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={e => setTrustDevice(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-4 h-4 rounded border border-border bg-background peer-checked:bg-primary peer-checked:border-primary transition-colors flex items-center justify-center">
              {trustDevice && (
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
            Confiar en este dispositivo por <span className="font-medium text-foreground">30 días</span>
            <br/>
            <span className="text-muted-foreground/60">No se pedirá el código en este navegador durante ese tiempo</span>
          </span>
        </label>

        <Button type="submit" className="w-full h-11" disabled={loading || code.length < 6}>
          {loading ? "Verificando…" : "Verificar y entrar"}
        </Button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver al inicio de sesión
      </button>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [totpState, setTotpState] = useState<{ required: true; preAuthToken: string } | null>(null);
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleError = params.get("google_error");
    if (googleError) {
      const messages: Record<string, string> = {
        cancelled: "Cancelaste el acceso con Google.",
        invalid_state: "Error de seguridad. Intenta de nuevo.",
        token_failed: "No se pudo conectar con Google. Intenta de nuevo.",
        no_email: "Google no compartió tu email. Intenta con otro método.",
        account_disabled: "Tu cuenta está desactivada. Contacta al administrador.",
        server_error: "Error del servidor. Intenta de nuevo.",
      };
      toast({ title: "Error al entrar con Google", description: messages[googleError] || "Error desconocido", variant: "destructive" });
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.totpRequired && result.preAuthToken) {
        setTotpState({ required: true, preAuthToken: result.preAuthToken });
      } else {
        navigate("/");
      }
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Credenciales incorrectas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

function handleGoogleLogin() {
  window.location.href = "https://v2.hazpost.com/api/social/google";
}

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 dark">
      <SeoMeta
        title="Iniciar sesión — HazPost | Social Media con IA"
        description="Accede a tu cuenta de HazPost y gestiona tus redes sociales con Inteligencia Artificial. Publica en Instagram, TikTok y Facebook automáticamente."
        canonical="https://hazpost.app/login"
        ogUrl="https://hazpost.app/login"
        ogImage="https://hazpost.app/opengraph.jpg"
      />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="flex items-center gap-1">
            <span className="text-4xl font-black text-white" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em'}}>haz</span>
            <span className="text-4xl font-black" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em',color:'#00C2FF'}}>post</span>
          </div>
          <p className="text-muted-foreground text-sm">Social Media con IA</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
          {totpState ? (
            // ── Step 2: TOTP verification ──────────────────────────────────────
            <TotpStep
              preAuthToken={totpState.preAuthToken}
              onBack={() => setTotpState(null)}
              onSuccess={() => navigate("/dashboard")}
            />
          ) : (
            // ── Step 1: Email + Password ───────────────────────────────────────
            <div className="space-y-4">
              <h1 className="text-xl font-semibold text-foreground">Iniciar sesión</h1>

              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2 h-11 border-border hover:bg-white/5"
                onClick={handleGoogleLogin}
              >
                <GoogleIcon />
                <span>Continuar con Google</span>
              </Button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">o con email</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="hola@tuempresa.com"
                    required
                    autoFocus
                    autoComplete="email"
                    style={{ fontSize: "16px" }}
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
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="pr-16"
                      style={{ fontSize: "16px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? "Verificando…" : "Entrar"}
                </Button>
              </form>

              <div className="text-center pt-1 space-y-2">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                  <div className="flex-1 h-px bg-border" />
                  <span>o</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <p className="text-sm text-muted-foreground">
                  ¿No tienes cuenta?{" "}
                  <a href={`${BASE}/register`} className="text-primary font-medium hover:underline underline-offset-4">
                    Crear cuenta
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="text-center mt-6 space-y-1.5">
          <p className="text-xs text-muted-foreground">hazpost.app — Haz más, publica mejor.</p>
          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground/60">
            <a href="/terms-of-service" className="hover:text-primary transition-colors">Términos de servicio</a>
            <span>·</span>
            <a href="/privacy-policy" className="hover:text-primary transition-colors">Privacidad</a>
          </div>
        </div>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  );
}
