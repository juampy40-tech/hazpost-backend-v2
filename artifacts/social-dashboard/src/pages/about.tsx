import { SeoMeta } from "@/hooks/useSeoMeta";

export default function About() {
  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Poppins', sans-serif", background: "#0A0A0F", color: "#E8E8F0" }}>
      <SeoMeta
        title="Sobre HazPost — Nuestra misión: simplificar tus redes sociales con IA"
        description="HazPost es una plataforma SaaS colombiana que ayuda a negocios y agencias a gestionar sus redes sociales con Inteligencia Artificial. Conoce nuestra historia y misión."
        canonical="https://hazpost.app/about"
        ogTitle="Sobre HazPost — IA para tus redes sociales"
        ogDescription="Somos un equipo colombiano que construyó la herramienta de social media que queríamos usar. HazPost automatiza Instagram, TikTok y Facebook para que te enfoques en tu negocio."
        ogUrl="https://hazpost.app/about"
        ogImage="https://hazpost.app/opengraph.jpg"
      />

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 40px", backdropFilter: "blur(20px)", background: "rgba(10,10,15,0.85)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <a href="/" style={{ fontSize: "1.4rem", fontWeight: 800, textDecoration: "none" }}>
          <span style={{ color: "#fff" }}>haz</span><span style={{ color: "#00C2FF" }}>post</span>
        </a>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="/pricing" style={{ padding: "10px 20px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 50, color: "#E8E8F0", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}>Ver precios</a>
          <a href="/register" style={{ padding: "10px 24px", background: "#00C2FF", border: "none", borderRadius: 50, color: "#000", fontWeight: 700, fontSize: "0.875rem", textDecoration: "none" }}>Probar gratis</a>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px 100px" }}>
        <div style={{ display: "inline-block", padding: "6px 16px", background: "rgba(0,194,255,0.12)", border: "1px solid rgba(0,194,255,0.3)", borderRadius: 50, fontSize: "0.75rem", fontWeight: 700, color: "#00C2FF", marginBottom: 24, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
          Sobre nosotros
        </div>

        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 900, color: "#fff", letterSpacing: -2, lineHeight: 1.1, marginBottom: 24 }}>
          Construimos la herramienta<br /><span style={{ color: "#00C2FF" }}>que queríamos usar</span>
        </h1>

        <p style={{ fontSize: "1.05rem", color: "#8888A8", lineHeight: 1.8, marginBottom: 32 }}>
          HazPost nació en Colombia en 2024 con una idea simple: los negocios locales merecen acceso a las mismas herramientas de marketing digital que las grandes marcas, sin necesitar un equipo de 10 personas ni presupuestos millonarios.
        </p>

        <p style={{ fontSize: "1.05rem", color: "#8888A8", lineHeight: 1.8, marginBottom: 48 }}>
          Hoy, HazPost usa Inteligencia Artificial para crear, programar y publicar contenido en Instagram, TikTok y Facebook de forma automática — adaptado al tono de cada marca, en el horario de mayor engagement, todos los días.
        </p>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 64 }}>
          {[
            { n: "100+", l: "Negocios activos" },
            { n: "2024", l: "Fundada en Colombia" },
            { n: "24/7", l: "Publicación automática" },
          ].map(s => (
            <div key={s.l} style={{ padding: "32px 24px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, textAlign: "center" }}>
              <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#00C2FF", letterSpacing: -2 }}>{s.n}</div>
              <div style={{ fontSize: "0.85rem", color: "#8888A8", marginTop: 8 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Mission */}
        <div style={{ background: "rgba(0,194,255,0.06)", border: "1px solid rgba(0,194,255,0.2)", borderRadius: 16, padding: "40px 32px", marginBottom: 48 }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#fff", marginBottom: 16 }}>Nuestra misión</h2>
          <p style={{ fontSize: "0.95rem", color: "#8888A8", lineHeight: 1.8 }}>
            Democratizar el acceso a herramientas de marketing digital con IA para negocios y agencias en Latinoamérica. Que cualquier emprendedor pueda competir en redes sociales con contenido profesional, sin depender de diseñadores ni community managers externos.
          </p>
        </div>

        {/* Contact */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "0.9rem", color: "#8888A8", marginBottom: 24 }}>
            ¿Preguntas? Escribinos a{" "}
            <a href="mailto:hola@hazpost.app" style={{ color: "#00C2FF", textDecoration: "none" }}>hola@hazpost.app</a>
          </p>
          <a href="/register" style={{ display: "inline-block", padding: "14px 36px", background: "#00C2FF", borderRadius: 50, color: "#000", fontWeight: 700, fontSize: "0.95rem", textDecoration: "none" }}>
            Probar HazPost gratis
          </a>
        </div>
      </div>
    </div>
  );
}
