import { SeoMeta } from "@/hooks/useSeoMeta";

const features = [
  {
    icon: "✍️",
    title: "Generación de contenido con IA",
    description: "Captions, imágenes y hashtags creados por GPT-5 adaptados al tono de tu marca en segundos.",
  },
  {
    icon: "📅",
    title: "Calendario editorial visual",
    description: "Visualizá y reorganizá tu contenido semana a semana. Arrastrá y soltá para reprogramar.",
  },
  {
    icon: "⚡",
    title: "Generador masivo",
    description: "Creá 30 posts de un mes entero en minutos. Ideal para campañas y fechas especiales.",
  },
  {
    icon: "✅",
    title: "Flujo de aprobación",
    description: "Tu equipo revisa y aprueba antes de publicar. Control total sin perder velocidad.",
  },
  {
    icon: "📊",
    title: "Estadísticas reales",
    description: "Alcance, impresiones, engagement y mejores horarios directamente desde Meta y TikTok.",
  },
  {
    icon: "🎨",
    title: "Biblioteca de fondos",
    description: "Catálogo propio de fondos y overlays de marca para mantener coherencia visual siempre.",
  },
  {
    icon: "🔄",
    title: "Publicación automática",
    description: "Publica en el horario óptimo sin intervención humana. Funciona 24/7 incluso cuando dormís.",
  },
  {
    icon: "💬",
    title: "Compartir por WhatsApp",
    description: "Enviá previsualizaciones del contenido a clientes por WhatsApp con un click.",
  },
  {
    icon: "🏢",
    title: "Multi-negocio",
    description: "Gestioná múltiples marcas o clientes desde una sola cuenta. Perfecto para agencias.",
  },
];

export default function Features() {
  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: "'Poppins', sans-serif", background: "#0A0A0F", color: "#E8E8F0" }}>
      <SeoMeta
        title="Funciones — HazPost | Gestión de redes sociales con IA"
        description="Conoce todas las funciones de HazPost: generación de contenido con IA, calendario editorial, publicación automática en Instagram, TikTok y Facebook, estadísticas y más."
        canonical="https://hazpost.app/features"
        ogTitle="Funciones de HazPost — Todo lo que necesitas para tus redes sociales"
        ogDescription="Generación de contenido con IA, calendario editorial, publicación automática, estadísticas reales y mucho más. Prueba gratis 30 días."
        ogUrl="https://hazpost.app/features"
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

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "80px 24px 48px", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "inline-block", padding: "6px 16px", background: "rgba(0,194,255,0.12)", border: "1px solid rgba(0,194,255,0.3)", borderRadius: 50, fontSize: "0.75rem", fontWeight: 700, color: "#00C2FF", marginBottom: 24, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Funciones
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 900, color: "#fff", letterSpacing: -2, lineHeight: 1.1, marginBottom: 20 }}>
          Todo lo que necesitás<br /><span style={{ color: "#00C2FF" }}>en un solo lugar</span>
        </h1>
        <p style={{ fontSize: "1.05rem", color: "#8888A8", maxWidth: 560, margin: "0 auto 40px" }}>
          Olvidate de malabarear Canva, Buffer y ChatGPT. HazPost crea, programa y publica tu contenido automáticamente.
        </p>
        <a href="/register" style={{ display: "inline-block", padding: "14px 36px", background: "#00C2FF", borderRadius: 50, color: "#000", fontWeight: 700, fontSize: "1rem", textDecoration: "none" }}>
          Empezar gratis — 30 días
        </a>
      </div>

      {/* Features grid */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 100px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
          {features.map(f => (
            <div key={f.title} style={{ padding: "40px 32px", background: "#0A0A0F", transition: "background 0.3s" }}>
              <div style={{ width: 52, height: 52, background: "rgba(0,194,255,0.1)", border: "1px solid rgba(0,194,255,0.2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", marginBottom: 20 }}>
                {f.icon}
              </div>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: 10 }}>{f.title}</h2>
              <p style={{ fontSize: "0.85rem", color: "#8888A8", lineHeight: 1.6 }}>{f.description}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center", marginTop: 64 }}>
          <a href="/register" style={{ display: "inline-block", padding: "16px 48px", background: "#00C2FF", borderRadius: 50, color: "#000", fontWeight: 700, fontSize: "1.05rem", textDecoration: "none", boxShadow: "0 0 30px rgba(0,194,255,0.3)" }}>
            Empezar gratis — 30 días
          </a>
          <p style={{ marginTop: 12, fontSize: "0.78rem", color: "#8888A8" }}>Sin tarjeta de crédito · Cancela cuando quieras</p>
        </div>
      </div>
    </div>
  );
}
