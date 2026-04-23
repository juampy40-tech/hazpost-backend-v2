import React, { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function VerifyEmail() {
  const [location] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token");
  const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setErrorMsg("No se encontró el token de verificación."); return; }
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/user/verify-email?token=${encodeURIComponent(token)}`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) { setStatus("error"); setErrorMsg(data.error || "Error al verificar"); return; }
        if (data.alreadyVerified) { setStatus("already"); return; }
        setStatus("success");
      } catch {
        setStatus("error");
        setErrorMsg("No se pudo conectar con el servidor.");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-3xl font-display font-bold">
          <span className="text-white">haz</span><span className="text-[#00C2FF]">post</span>
        </h1>

        {status === "loading" && (
          <div className="space-y-4">
            <div className="w-12 h-12 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Verificando tu correo...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4 p-6 rounded-2xl border border-green-500/30 bg-green-500/10">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-bold text-green-400">¡Correo verificado!</h2>
            <p className="text-muted-foreground text-sm">Tu cuenta está completamente activa. Ya puedes usar todas las funciones de hazpost.</p>
            <Link href="/dashboard" className="inline-block mt-2 px-6 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 rounded-xl font-semibold transition-all">
              Ir al panel →
            </Link>
          </div>
        )}

        {status === "already" && (
          <div className="space-y-4 p-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/10">
            <div className="text-5xl">✨</div>
            <h2 className="text-xl font-bold text-cyan-300">Ya estabas verificado</h2>
            <p className="text-muted-foreground text-sm">Tu correo ya fue confirmado anteriormente.</p>
            <Link href="/dashboard" className="inline-block mt-2 px-6 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 rounded-xl font-semibold transition-all">
              Ir al panel →
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 p-6 rounded-2xl border border-red-500/30 bg-red-500/10">
            <div className="text-5xl">❌</div>
            <h2 className="text-xl font-bold text-red-400">Enlace inválido</h2>
            <p className="text-muted-foreground text-sm">{errorMsg}</p>
            <Link href="/dashboard" className="inline-block mt-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-muted-foreground border border-white/10 rounded-xl font-semibold transition-all">
              Volver al inicio
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
