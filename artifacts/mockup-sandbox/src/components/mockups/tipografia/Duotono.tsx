export function Duotono() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-2 font-mono">Estilo 1 — Duotono</p>

        {/* Post mockup */}
        <div
          className="relative overflow-hidden rounded-2xl shadow-2xl"
          style={{ width: 380, height: 380 }}
        >
          {/* Simulated photo background */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(160deg, #0d2137 0%, #0a3d62 35%, #1a5276 55%, #1b4f72 75%, #0a1628 100%)",
            }}
          />
          {/* Subtle texture overlay */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 30% 60%, #008BE4 0%, transparent 60%), radial-gradient(ellipse at 70% 20%, #00C2FF22 0%, transparent 50%)",
            }}
          />

          {/* ECO Logo top-right */}
          <div
            className="absolute top-4 right-4 z-20 flex flex-col items-center"
            style={{ width: 72 }}
          >
            <svg viewBox="0 0 120 40" width="88" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="0" y="32" fontFamily="Impact, Arial Black, sans-serif" fontSize="38" fontWeight="900" letterSpacing="4" fill="white">ECO</text>
            </svg>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, textAlign: 'center', lineHeight: 1.2, marginTop: -2 }}>ENERGY CAPITAL<br/>OPERATION</div>
          </div>

          {/* Dark scrim at bottom */}
          <div
            className="absolute bottom-0 inset-x-0 z-10"
            style={{
              height: "52%",
              background:
                "linear-gradient(to bottom, transparent 0%, rgba(4,8,20,0.72) 40%, rgba(2,5,14,0.95) 100%)",
            }}
          />

          {/* Headline — Duotono */}
          <div
            className="absolute bottom-0 inset-x-0 z-20 text-center pb-7 px-5"
          >
            <p
              style={{
                fontFamily: "Impact, 'Arial Black', sans-serif",
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: 1.5,
                lineHeight: 1.15,
                color: "white",
                textShadow: "0 2px 12px rgba(0,0,0,0.8)",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              EN CALI, TU TECHO
              <br />
              PUEDE{" "}
              <span
                style={{
                  background: "linear-gradient(90deg, #00C2FF, #0077FF)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "drop-shadow(0 0 8px #00C2FF88)",
                }}
              >
                PAGAR TU LUZ
              </span>
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="text-center mt-1">
          <p className="text-white font-bold text-sm">Duotono</p>
          <p className="text-white/40 text-xs mt-0.5">Blanco + frase clave en azul ECO degradado</p>
        </div>
      </div>
    </div>
  );
}
