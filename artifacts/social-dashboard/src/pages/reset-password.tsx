import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import ecoLogoWhite from "../assets/eco-logo-white.png";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      toast({ title: "Enlace inválido", description: "Este enlace no tiene un token de recuperación.", variant: "destructive" });
    }
    setToken(t);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Las contraseñas no coinciden", description: "Asegúrate de escribir la misma contraseña en ambos campos.", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Contraseña muy corta", description: "Debe tener al menos 8 caracteres.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${BASE}/api/user/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Error", description: data.error || "No se pudo actualizar la contraseña.", variant: "destructive" });
        return;
      }
      setDone(true);
    } catch {
      toast({ title: "Error de red", description: "No se pudo conectar con el servidor.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 dark">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="flex items-center gap-1">
            <span className="text-4xl font-black text-white" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em'}}>haz</span>
            <span className="text-4xl font-black" style={{fontFamily:'Poppins,sans-serif',letterSpacing:'-0.03em',color:'#00C2FF'}}>post</span>
          </div>
          <p className="text-muted-foreground text-sm">Recuperar contraseña</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4">
          {done ? (
            <div className="text-center space-y-4 py-2">
              <div className="text-4xl">✅</div>
              <h1 className="text-xl font-semibold text-foreground">¡Contraseña actualizada!</h1>
              <p className="text-sm text-muted-foreground">Tu contraseña fue cambiada exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.</p>
              <Button className="w-full h-11" onClick={() => navigate("/login")}>
                Ir al login
              </Button>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Nueva contraseña</h1>
                <p className="text-sm text-muted-foreground mt-1">Elige una contraseña segura de al menos 8 caracteres.</p>
              </div>

              {!token ? (
                <div className="text-center py-4 space-y-3">
                  <p className="text-sm text-destructive">Este enlace de recuperación no es válido o ya expiró.</p>
                  <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                    Volver al login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">Nueva contraseña</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      autoComplete="new-password"
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repite tu contraseña"
                      required
                      autoComplete="new-password"
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={loading || !password || !confirm}>
                    {loading ? "Actualizando…" : "Actualizar contraseña"}
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => navigate("/login")}
                      className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
                    >
                      Volver al login
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Automatiza tus redes, haz post.
        </p>
      </div>
    </div>
  );
}
