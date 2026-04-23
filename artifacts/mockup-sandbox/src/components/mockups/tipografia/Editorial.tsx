export function Editorial() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-2 font-mono">Estilo 3 — Editorial</p>

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
                "linear-gradient(160deg, #1a3a5c 0%, #0d5272 25%, #1e7895 50%, #0d4a6a 75%, #071828 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 40% 35%, #00C2FF18 0%, transparent 55%), radial-gradient(ellipse at 75% 70%, #008BE430 0%, transparent 50%)",
            }}
          />

          {/* ECO Logo top-right — small */}
          <div className="absolute top-4 right-4 z-20" style={{ width: 68 }}>
            <svg viewBox="0 0 120 40" width="72" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="0" y="32" fontFamily="Impact, Arial Black, sans-serif" fontSize="38" fontWeight="900" letterSpacing="4" fill="white" opacity="0.9">ECO</text>
            </svg>
            <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.8, textAlign: 'center', lineHeight: 1.2, marginTop: -2 }}>ENERGY CAPITAL<br/>OPERATION</div>
          </div>

          {/* Thin cyan accent line above text */}
          <div
            className="absolute z-20"
            style={{
              bottom: "calc(36% + 10px)",
              left: "8%",
              right: "8%",
              height: 2,
              background: "linear-gradient(90deg, #0077FF, #00C2FF, #0077FF)",
              borderRadius: 2,
            }}
          />

          {/* Headline — no background, floats over photo */}
          <div
            className="absolute bottom-0 inset-x-0 z-20 px-5 py-5"
            style={{ height: "42%" }}
          >
            <p
              style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: 0.5,
                lineHeight: 1.3,
                textTransform: "uppercase",
                margin: 0,
                color: "white",
                textShadow: "0 2px 8px rgba(0,0,0,0.98), 0 0 20px rgba(0,0,0,0.7)",
              }}
            >
              EN CALI, TU TECHO PUEDE{" "}
              <span
                style={{
                  color: "#00C2FF",
                  fontStyle: "italic",
                }}
              >
                PAGAR TU ENERGÍA
              </span>{" "}
              SIN PAGAR MÁS
            </p>
            {/* Small divider + tagline */}
            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ width: 28, height: 2, background: "#0077FF", borderRadius: 2 }} />
              <p
                style={{
                  fontSize: 9.5,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  margin: 0,
                  fontFamily: "Arial, sans-serif",
                }}
              >
                eco-col.com · Cali, Colombia
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="text-center mt-1">
          <p className="text-white font-bold text-sm">Editorial</p>
          <p className="text-white/40 text-xs mt-0.5">Barra oscura + blanco y azul ECO · filo cian superior</p>
        </div>
      </div>
    </div>
  );
}
