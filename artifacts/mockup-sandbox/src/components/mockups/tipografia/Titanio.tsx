export function Titanio() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-2 font-mono">Estilo 2 — Titanio</p>

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
                "linear-gradient(135deg, #071425 0%, #0d2137 30%, #0f3460 55%, #16213e 80%, #050e1c 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 65% 40%, #008BE440 0%, transparent 55%)",
            }}
          />

          {/* ECO Logo top-right */}
          <div className="absolute top-4 right-4 z-20" style={{ width: 80 }}>
            <svg viewBox="0 0 120 40" width="88" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#00C2FF" />
                </linearGradient>
              </defs>
              <text x="0" y="32" fontFamily="Impact, Arial Black, sans-serif" fontSize="38" fontWeight="900" letterSpacing="4" fill="url(#logoGrad)">ECO</text>
            </svg>
            <div style={{ fontSize: 7, color: 'rgba(0,194,255,0.7)', letterSpacing: 1, textAlign: 'center', lineHeight: 1.2, marginTop: -2 }}>ENERGY CAPITAL<br/>OPERATION</div>
          </div>

          {/* Thin horizontal cyan line — design accent */}
          <div
            className="absolute z-10"
            style={{
              bottom: "44%",
              left: "10%",
              width: "80%",
              height: 1,
              background: "linear-gradient(90deg, transparent, #00C2FF, transparent)",
              opacity: 0.5,
            }}
          />

          {/* Dark gradient scrim */}
          <div
            className="absolute bottom-0 inset-x-0 z-10"
            style={{
              height: "50%",
              background:
                "linear-gradient(to bottom, transparent 0%, rgba(5,14,28,0.8) 50%, rgba(2,7,18,0.97) 100%)",
            }}
          />

          {/* Headline — Titanio gradient text */}
          <div className="absolute bottom-0 inset-x-0 z-20 text-center pb-7 px-5">
            <p
              style={{
                fontFamily: "Impact, 'Arial Black', sans-serif",
                fontSize: 30,
                fontWeight: 900,
                letterSpacing: 3,
                lineHeight: 1.18,
                textTransform: "uppercase",
                margin: 0,
                background: "linear-gradient(180deg, #FFFFFF 0%, #AADEFF 45%, #00C2FF 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "drop-shadow(0 0 14px #00C2FF55) drop-shadow(0 3px 6px #000000cc)",
              }}
            >
              EN CALI, TU TECHO
              <br />
              PUEDE PAGAR
              <br />
              TU LUZ
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="text-center mt-1">
          <p className="text-white font-bold text-sm">Titanio</p>
          <p className="text-white/40 text-xs mt-0.5">Degradado blanco → cian en todo el texto · brillo neón</p>
        </div>
      </div>
    </div>
  );
}
