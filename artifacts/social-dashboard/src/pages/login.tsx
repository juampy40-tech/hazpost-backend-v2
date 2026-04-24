// 🔥 LOGIN OPTIMIZADO HAZPOST

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SeoMeta } from "@/hooks/useSeoMeta";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const BRAND = "#00C2FF";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path d="M47.532 24.552..." fill="#4285F4"/>
    </svg>
  );
}

// 🔐 Recuperar contraseña
function ForgotPasswordDialog({ open, onClose }: any) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${BASE}/api/user/forgot-password`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ email }),
      });
      toast({ title: "Revisa tu correo" });
      onClose();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dark">
        <DialogHeader>
          <DialogTitle>Recuperar contraseña</DialogTitle>
          <DialogDescription>
            Te enviaremos un enlace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input value={email} onChange={e => setEmail(e.target.value)} />
          <Button type="submit">{loading ? "Enviando…" : "Enviar enlace"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// 🔐 LOGIN
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      toast({ title: "Credenciales incorrectas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    window.location.href = `${BASE}/api/auth/google`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 dark">

      <div className="w-full max-w-sm">

        {/* LOGO */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="flex gap-1">
            <span className="text-4xl font-black text-white">haz</span>
            <span className="text-4xl font-black" style={{color: BRAND}}>post</span>
          </div>

          <p className="text-muted-foreground text-sm">
            Accede a tu panel y sigue creando contenido 🚀
          </p>
        </div>

        {/* CARD */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{
            border: "1px solid rgba(0,194,255,0.25)",
            boxShadow: "0 0 40px rgba(0,194,255,0.08)"
          }}
        >

          <h1 className="text-xl font-semibold text-center">
            Bienvenido de nuevo
          </h1>

          {/* GOOGLE */}
          <Button
            variant="outline"
            className="w-full h-11 flex gap-2"
            onClick={handleGoogleLogin}
          >
            <GoogleIcon />
            Entrar en 1 clic con Google
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            o con email
          </div>

          {/* FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">

            <Input
              type="email"
              placeholder="hola@tuempresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-3"
              >
                {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>

            {/* CTA 🔥 */}
            <Button
              type="submit"
              className="w-full h-11 font-bold text-black"
              style={{
                background: BRAND,
                boxShadow: "0 0 20px rgba(0,194,255,0.3)"
              }}
            >
              {loading ? "Entrando…" : "Entrar a mi panel"}
            </Button>

          </form>

          <div className="text-center text-sm">
            <button onClick={() => setForgotOpen(true)}>
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <p className="text-center text-sm">
            ¿No tienes cuenta?{" "}
            <a href="/register" style={{color: BRAND}}>
              Crear cuenta
            </a>
          </p>

        </div>

      </div>

      <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  );
}
