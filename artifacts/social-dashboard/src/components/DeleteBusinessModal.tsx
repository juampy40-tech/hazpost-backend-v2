import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Shield, AlertTriangle, Loader2, Eye, EyeOff, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface Business {
  id: number;
  name: string;
  industry?: string | null;
}

interface DeleteBusinessModalProps {
  business: Business;
  userHasPassword: boolean;
  userHasTotp: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteBusinessModal({ business, userHasPassword, userHasTotp, onClose, onDeleted }: DeleteBusinessModalProps) {
  const { toast } = useToast();
  const isOAuthOnly = !userHasPassword && !userHasTotp;
  /** Has 2FA but no password (e.g., OAuth user who enabled TOTP) — TOTP-only verification */
  const isTotpOnly = userHasTotp && !userHasPassword;

  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  async function handleSendCode() {
    setSendingCode(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${business.id}/send-delete-code`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          toast({ title: "Espera un momento", description: data.error, variant: "destructive" });
        } else {
          toast({ title: "Error", description: data.error ?? "No se pudo enviar el código.", variant: "destructive" });
        }
        return;
      }
      setCodeSent(true);
      toast({ title: "Código enviado", description: `Revisa tu correo ${data.sentTo ?? ""}` });
    } catch {
      toast({ title: "Error de conexión", variant: "destructive" });
    } finally {
      setSendingCode(false);
    }
  }

  async function handleDelete() {
    if (!isOAuthOnly && !isTotpOnly && !password.trim()) {
      toast({ title: "Error", description: "Ingresa tu contraseña para continuar.", variant: "destructive" });
      return;
    }
    if (userHasTotp && !totpCode.trim()) {
      toast({ title: "Error", description: "Ingresa el código de Google Authenticator.", variant: "destructive" });
      return;
    }
    if (isOAuthOnly && !emailCode.trim()) {
      toast({ title: "Error", description: "Ingresa el código de verificación recibido por correo.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = {};
      if (!isOAuthOnly && !isTotpOnly) body.confirmPassword = password;
      if (userHasTotp) body.totpCode = totpCode;
      if (isOAuthOnly) body.emailCode = emailCode;

      const res = await fetch(`${BASE}/api/businesses/${business.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "No se pudo desactivar el negocio.", variant: "destructive" });
        return;
      }
      toast({
        title: data.hardDeleted ? "Negocio eliminado" : "Negocio desactivado",
        description: data.message,
      });
      onDeleted();
    } catch {
      toast({ title: "Error de conexión", description: "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = isOAuthOnly
    ? emailCode.length === 6
    : isTotpOnly
      ? totpCode.length === 6
      : (password.trim().length > 0 && (!userHasTotp || totpCode.length === 6));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Desactivar negocio</h3>
              <p className="text-xs text-muted-foreground">"{business.name}"</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-4 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-5">
          <p className="text-xs text-amber-400 leading-relaxed">
            Si el negocio tiene publicaciones, sus datos se conservan y podrás reactivarlo en el futuro.
            Si no tiene publicaciones, será eliminado permanentemente.
          </p>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-medium text-foreground">Verificación de seguridad</p>
        </div>

        <div className="space-y-3">
          {isOAuthOnly ? (
            <>
              <p className="text-xs text-muted-foreground">
                Tu cuenta usa Google/OAuth. Te enviaremos un código de 6 dígitos por correo.
              </p>
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={handleSendCode}
                disabled={sendingCode}
              >
                {sendingCode ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                {codeSent ? "Reenviar código" : "Enviar código por correo"}
              </Button>
              {codeSent && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Código de verificación</label>
                  <Input
                    type="text"
                    value={emailCode}
                    onChange={e => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="text-sm font-mono tracking-widest"
                    maxLength={6}
                    onKeyDown={e => e.key === "Enter" && handleDelete()}
                  />
                </div>
              )}
            </>
          ) : isTotpOnly ? (
            <>
              <p className="text-xs text-muted-foreground">
                Ingresa el código de Google Authenticator para confirmar.
              </p>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Código Google Authenticator</label>
                <Input
                  type="text"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="text-sm font-mono tracking-widest"
                  maxLength={6}
                  onKeyDown={e => e.key === "Enter" && handleDelete()}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Contraseña actual</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
                    className="pr-10 text-sm"
                    onKeyDown={e => e.key === "Enter" && !userHasTotp && handleDelete()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {userHasTotp && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Código Google Authenticator</label>
                  <Input
                    type="text"
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="text-sm font-mono tracking-widest"
                    maxLength={6}
                    onKeyDown={e => e.key === "Enter" && handleDelete()}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleDelete}
            disabled={loading || !canSubmit || (isOAuthOnly && !codeSent)}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Desactivar negocio
          </Button>
        </div>
      </div>
    </div>
  );
}
