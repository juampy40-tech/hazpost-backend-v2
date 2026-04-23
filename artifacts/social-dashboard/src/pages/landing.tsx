import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { PricingSection } from "@/components/PricingSection";
import { SeoMeta } from "@/hooks/useSeoMeta";

const css = `
  .hz-root *, .hz-root *::before, .hz-root *::after,
  .hz-nav *, .hz-nav *::before, .hz-nav *::after,
  .hz-footer *, .hz-footer *::before, .hz-footer *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .hz-root {
    font-family: 'Poppins', sans-serif;
    background: #0A0A0F;
    color: #E8E8F0;
    line-height: 1.6;
    overflow-x: hidden;
    min-height: 100vh;
  }
  .hz-root a { text-decoration: none; }
  /* NAV */
  .hz-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 40px;
    backdrop-filter: blur(20px);
    background: rgba(10,10,15,0.85);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .hz-logo { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; }
  .hz-logo .w { color: #fff; }
  .hz-logo .c { color: #00C2FF; }
  .hz-nav-links { display: flex; gap: 32px; list-style: none; }
  .hz-nav-links a { color: #8888A8; font-size: 0.9rem; font-weight: 500; transition: color 0.2s; }
  .hz-nav-links a:hover { color: #fff; }
  .hz-nav-cta { display: flex; gap: 12px; align-items: center; }
  .hz-btn-outline {
    padding: 10px 20px; border: 1px solid rgba(255,255,255,0.08); border-radius: 50px;
    color: #E8E8F0; font-size: 0.875rem; font-weight: 600; cursor: pointer;
    font-family: 'Poppins',sans-serif; background: transparent; transition: all 0.2s;
  }
  .hz-btn-outline:hover { border-color: #00C2FF; color: #00C2FF; }
  .hz-btn-primary {
    padding: 10px 24px; background: #00C2FF; border: none; border-radius: 50px;
    color: #000; font-weight: 700; font-size: 0.875rem; cursor: pointer;
    font-family: 'Poppins',sans-serif; transition: all 0.2s;
    box-shadow: 0 0 20px rgba(0,194,255,0.3);
  }
  .hz-btn-primary:hover { background: #22D4FF; transform: translateY(-1px); box-shadow: 0 0 30px rgba(0,194,255,0.4); }
  /* HERO */
  .hz-hero {
    position: relative; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    text-align: center; padding: 120px 24px 80px; overflow: hidden;
  }
  .hz-hero-glow {
    position: absolute; top: -20%; left: 50%; transform: translateX(-50%);
    width: 800px; height: 600px;
    background: radial-gradient(ellipse, rgba(0,194,255,0.18) 0%, transparent 70%);
    pointer-events: none;
  }
  .hz-hero-grid {
    position: absolute; inset: 0;
    background-image: linear-gradient(rgba(0,194,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,194,255,0.05) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent);
    pointer-events: none;
  }
  .hz-hero-content { position: relative; z-index: 1; max-width: 860px; }
  .hz-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 16px; background: rgba(0,194,255,0.12);
    border: 1px solid rgba(0,194,255,0.3); border-radius: 50px;
    font-size: 0.8rem; font-weight: 600; color: #00C2FF;
    margin-bottom: 28px; letter-spacing: 0.5px; text-transform: uppercase;
  }
  .hz-hero h1 {
    font-size: clamp(2.5rem, 7vw, 5.5rem); font-weight: 900;
    line-height: 1.05; letter-spacing: -2px; color: #fff; margin-bottom: 24px;
  }
  .hz-hero h1 .hl { color: #00C2FF; }
  .hz-hero p { font-size: clamp(1rem, 2vw, 1.25rem); color: #8888A8; max-width: 600px; margin: 0 auto 40px; }
  .hz-hero-ctas { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 56px; }
  .hz-hero-ctas .hz-btn-primary { padding: 16px 36px; font-size: 1rem; }
  .hz-hero-ctas .hz-btn-outline { padding: 16px 28px; font-size: 1rem; }
  .hz-proof { display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap; }
  .hz-avatars { display: flex; }
  .hz-avatars span {
    width: 36px; height: 36px; border-radius: 50%; border: 2px solid #0A0A0F;
    margin-left: -10px; background: linear-gradient(135deg, #00C2FF, #7B2FFF);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; font-weight: 700; color: white;
  }
  .hz-avatars span:first-child { margin-left: 0; }
  .hz-stars { color: #FFB800; letter-spacing: 2px; }
  .hz-proof-text { font-size: 0.85rem; color: #8888A8; }
  /* LOGOS BAR */
  .hz-logos {
    padding: 40px 24px; border-top: 1px solid rgba(255,255,255,0.08);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    text-align: center; background: #12121A;
  }
  .hz-logos p { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #8888A8; margin-bottom: 24px; }
  .hz-logos-list { display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap; }
  .hz-pill {
    padding: 8px 20px; border: 1px solid rgba(255,255,255,0.08); border-radius: 50px;
    font-size: 0.85rem; font-weight: 600; color: #8888A8;
    background: rgba(255,255,255,0.04);
  }
  /* SECTION */
  .hz-section { padding: 100px 24px; max-width: 1200px; margin: 0 auto; }
  .hz-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 3px; color: #00C2FF; font-weight: 700; margin-bottom: 12px; }
  .hz-title { font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 800; color: #fff; letter-spacing: -1px; margin-bottom: 16px; line-height: 1.15; }
  .hz-sub { font-size: 1rem; color: #8888A8; max-width: 540px; line-height: 1.7; }
  /* STEPS */
  .hz-steps-wrap { background: #12121A; padding: 80px 24px; }
  .hz-steps { max-width: 1200px; margin: 0 auto; }
  .hz-steps-head { text-align: center; margin-bottom: 64px; }
  .hz-steps-head .hz-sub { margin: 0 auto; }
  .hz-steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 2px; }
  .hz-step {
    padding: 40px 32px; background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08); transition: background 0.3s;
  }
  .hz-step:first-child { border-radius: 16px 0 0 16px; }
  .hz-step:last-child { border-radius: 0 16px 16px 0; }
  .hz-step:hover { background: rgba(0,194,255,0.05); }
  .hz-step-num { font-size: 3rem; font-weight: 900; color: rgba(0,194,255,0.15); line-height: 1; margin-bottom: 16px; letter-spacing: -3px; }
  .hz-step-icon { font-size: 2rem; margin-bottom: 16px; display: block; }
  .hz-step h3 { font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 10px; }
  .hz-step p { font-size: 0.875rem; color: #8888A8; line-height: 1.6; }
  /* FEATURES GRID */
  .hz-features-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1px; background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; margin-top: 56px;
  }
  .hz-feature { padding: 40px 32px; background: #0A0A0F; transition: background 0.3s; }
  .hz-feature:hover { background: #1C1C28; }
  .hz-ficon {
    width: 52px; height: 52px; background: rgba(0,194,255,0.1); border: 1px solid rgba(0,194,255,0.2);
    border-radius: 12px; display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem; margin-bottom: 20px;
  }
  .hz-feature h3 { font-size: 1rem; font-weight: 700; color: #fff; margin-bottom: 10px; }
  .hz-feature p { font-size: 0.85rem; color: #8888A8; line-height: 1.6; }
  /* PLATFORMS */
  .hz-plat-wrap { background: #12121A; padding: 80px 24px; }
  .hz-plat { max-width: 1200px; margin: 0 auto; }
  .hz-plat-head { text-align: center; margin-bottom: 56px; }
  .hz-plat-head .hz-sub { margin: 0 auto; }
  .hz-plat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .hz-pcard {
    padding: 40px 32px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04); text-align: center; transition: all 0.3s; position: relative; overflow: hidden;
  }
  .hz-pcard:hover { transform: translateY(-4px); }
  .hz-pcard-emoji { font-size: 3rem; margin-bottom: 16px; display: block; }
  .hz-pcard h3 { font-size: 1.3rem; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .hz-pcard p { font-size: 0.85rem; color: #8888A8; }
  .hz-pbadge {
    display: inline-block; margin-top: 16px; padding: 4px 12px;
    background: rgba(0,194,255,0.1); border: 1px solid rgba(0,194,255,0.3); border-radius: 50px;
    font-size: 0.72rem; font-weight: 600; color: #00C2FF; text-transform: uppercase; letter-spacing: 0.5px;
  }
  /* BILLING TOGGLE */
  .hz-toggle-wrap { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 28px 0 0; }
  .hz-toggle-label { font-size: 0.875rem; font-weight: 600; color: #8888A8; cursor: pointer; transition: color 0.2s; }
  .hz-toggle-label.active { color: #fff; }
  .hz-toggle-switch {
    position: relative; width: 48px; height: 26px; border-radius: 13px;
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
    cursor: pointer; transition: background 0.2s; flex-shrink: 0;
  }
  .hz-toggle-switch.on { background: #00C2FF; border-color: #00C2FF; }
  .hz-toggle-knob {
    position: absolute; top: 3px; left: 3px; width: 18px; height: 18px;
    border-radius: 50%; background: #fff; transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .hz-toggle-switch.on .hz-toggle-knob { transform: translateX(22px); }
  .hz-toggle-badge {
    padding: 3px 10px; background: rgba(0,194,255,0.15); border: 1px solid rgba(0,194,255,0.3);
    border-radius: 50px; font-size: 0.7rem; font-weight: 700; color: #00C2FF; letter-spacing: 0.5px;
  }
  /* PRICING */
  .hz-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-top: 32px; }
  .hz-pcard2 { padding: 40px 32px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background: #12121A; position: relative; transition: all 0.3s; display: block; text-decoration: none; color: inherit; cursor: pointer; }
  .hz-pcard2:hover { transform: translateY(-4px); }
  .hz-pcard2.pop { border-color: #00C2FF; background: #1C1C28; box-shadow: 0 0 40px rgba(0,194,255,0.12); }
  .hz-popular {
    position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
    padding: 4px 20px; background: #00C2FF; color: #000; font-size: 0.72rem;
    font-weight: 700; border-radius: 50px; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap;
  }
  .hz-plan-name { font-size: 0.85rem; font-weight: 600; color: #8888A8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .hz-plan-price { margin-bottom: 8px; }
  .hz-plan-price strong { font-size: 2.8rem; font-weight: 900; color: #fff; letter-spacing: -2px; }
  .hz-plan-price span { font-size: 0.85rem; color: #8888A8; }
  .hz-plan-desc { font-size: 0.85rem; color: #8888A8; margin-bottom: 28px; }
  .hz-plan-feats { list-style: none; margin-bottom: 32px; }
  .hz-plan-feats li { display: flex; align-items: flex-start; gap: 10px; font-size: 0.85rem; color: #E8E8F0; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .hz-plan-feats li:last-child { border-bottom: none; }
  .hz-check { color: #00C2FF; font-weight: 700; flex-shrink: 0; }
  .hz-plan-btn {
    display: block; width: 100%; padding: 14px; border-radius: 50px; font-family: 'Poppins',sans-serif;
    font-weight: 700; font-size: 0.9rem; text-align: center; cursor: pointer; transition: all 0.2s;
  }
  .hz-plan-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.08); color: #E8E8F0; }
  .hz-plan-ghost:hover { border-color: #00C2FF; color: #00C2FF; }
  .hz-plan-solid { background: #00C2FF; border: none; color: #000; box-shadow: 0 0 20px rgba(0,194,255,0.3); }
  .hz-plan-solid:hover { background: #22D4FF; transform: translateY(-1px); }
  /* TESTIMONIALS */
  .hz-testi-wrap { background: #12121A; padding: 80px 24px; }
  .hz-testi { max-width: 1200px; margin: 0 auto; }
  .hz-testi-head { text-align: center; margin-bottom: 56px; }
  .hz-testi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
  .hz-tcard { padding: 32px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background: #0A0A0F; }
  .hz-tcard-stars { color: #FFB800; margin-bottom: 16px; letter-spacing: 2px; }
  .hz-tcard-text { font-size: 0.9rem; color: #E8E8F0; line-height: 1.7; margin-bottom: 20px; font-style: italic; }
  .hz-tcard-author { display: flex; align-items: center; gap: 12px; }
  .hz-avatar {
    width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #00C2FF, #7B2FFF);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; color: white; flex-shrink: 0;
  }
  .hz-author-name { font-size: 0.875rem; font-weight: 600; color: #fff; }
  .hz-author-role { font-size: 0.75rem; color: #8888A8; }
  /* FAQ */
  .hz-faq-list { margin-top: 48px; max-width: 720px; }
  .hz-faq-item { border-bottom: 1px solid rgba(255,255,255,0.08); padding: 20px 0; }
  .hz-faq-q { font-weight: 600; color: #fff; font-size: 0.95rem; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .hz-faq-q::after { content: '+'; color: #00C2FF; font-size: 1.2rem; flex-shrink: 0; }
  .hz-faq-a { font-size: 0.875rem; color: #8888A8; line-height: 1.7; margin-top: 12px; }
  /* FINAL CTA */
  .hz-cta-wrap { padding: 80px 24px; background: linear-gradient(180deg, transparent, #12121A 50%, transparent); text-align: center; }
  .hz-cta-box {
    max-width: 700px; margin: 0 auto; padding: 72px 40px;
    background: #1C1C28; border: 1px solid rgba(0,194,255,0.25); border-radius: 24px;
    box-shadow: 0 0 80px rgba(0,194,255,0.08), inset 0 0 60px rgba(0,194,255,0.03); position: relative;
  }
  .hz-cta-box::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, #00C2FF, transparent);
  }
  .hz-cta-box h2 { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 900; color: #fff; letter-spacing: -1px; margin-bottom: 16px; }
  .hz-cta-box p { font-size: 1rem; color: #8888A8; margin-bottom: 36px; }
  .hz-cta-box .hz-btn-primary { padding: 18px 48px; font-size: 1.05rem; }
  .hz-nocc { font-size: 0.78rem; color: #8888A8; margin-top: 16px; }
  /* FOOTER */
  .hz-footer { border-top: 1px solid rgba(255,255,255,0.08); padding: 48px 24px 32px; max-width: 1200px; margin: 0 auto; }
  .hz-footer-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 32px; margin-bottom: 40px; }
  .hz-footer-brand p { font-size: 0.85rem; color: #8888A8; margin-top: 8px; max-width: 240px; line-height: 1.6; }
  .hz-flinks h4 { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #8888A8; margin-bottom: 12px; }
  .hz-flinks ul { list-style: none; }
  .hz-flinks ul li { margin-bottom: 8px; }
  .hz-flinks ul a { font-size: 0.85rem; color: #8888A8; transition: color 0.2s; }
  .hz-flinks ul a:hover { color: #fff; }
  .hz-footer-bottom { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.08); }
  .hz-footer-bottom p { font-size: 0.78rem; color: #8888A8; }
  /* RESPONSIVE */
  @media (max-width: 768px) {
    .hz-nav { padding: 14px 20px; }
    .hz-nav-links { display: none; }
    .hz-plat-grid { grid-template-columns: 1fr; }
    .hz-step:first-child { border-radius: 16px 16px 0 0; }
    .hz-step:last-child { border-radius: 0 0 16px 16px; }
    .hz-steps-grid { grid-template-columns: 1fr; gap: 0; }
    .hz-footer-top { flex-direction: column; }
    .hz-cta-box { padding: 48px 24px; }
  }
`;

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) return null;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "¿Qué es HazPost y para qué sirve?", "acceptedAnswer": { "@type": "Answer", "text": "HazPost es una plataforma SaaS que usa Inteligencia Artificial para crear, programar y publicar contenido en Instagram, TikTok y Facebook de forma automática. Diseñada para empresas, emprendedores y agencias de todo el mundo." } },
      { "@type": "Question", "name": "¿Necesito conocimientos de diseño o marketing?", "acceptedAnswer": { "@type": "Answer", "text": "No. Solo necesitás describir tu negocio una vez. La IA genera las imágenes, los textos y los hashtags adaptados a tu marca." } },
      { "@type": "Question", "name": "¿Funciona con Instagram de empresa y TikTok Business?", "acceptedAnswer": { "@type": "Answer", "text": "Sí. HazPost usa las APIs oficiales de Meta (Instagram Business) y TikTok Business. La conexión es segura vía OAuth." } },
      { "@type": "Question", "name": "¿Cómo pago? ¿Qué métodos de pago aceptan?", "acceptedAnswer": { "@type": "Answer", "text": "Aceptamos tarjetas de crédito y débito internacionales. Para usuarios en Colombia, también aceptamos pagos en pesos colombianos (COP) con PSE a través de Wompi." } },
      { "@type": "Question", "name": "¿Puedo cancelar en cualquier momento?", "acceptedAnswer": { "@type": "Answer", "text": "Sí, podés cancelar tu suscripción cuando quieras desde la configuración de tu cuenta. No hay contratos ni cargos ocultos. Los 30 días de prueba son completamente gratis." } },
      { "@type": "Question", "name": "¿Puedo manejar múltiples negocios o clientes?", "acceptedAnswer": { "@type": "Answer", "text": "Sí. Los planes Negocio y Agencia permiten gestionar múltiples clientes desde una sola cuenta. Ideal para agencias de marketing digital o usuarios que tengan varios negocios." } },
    ],
  };

  return (
    <>
      <SeoMeta
        title="HazPost — Publica en Instagram, TikTok y Facebook con IA"
        description="HazPost automatiza tu contenido en redes sociales con Inteligencia Artificial. Crea imágenes, textos y hashtags en segundos. Prueba gratis 30 días."
        canonical="https://hazpost.app/"
        ogTitle="HazPost — Gestión de Redes Sociales con IA"
        ogDescription="Publica en Instagram, TikTok y Facebook automáticamente. La IA genera imágenes, textos y hashtags personalizados para tu negocio. Prueba gratis."
        ogUrl="https://hazpost.app/"
        ogImage="https://hazpost.app/opengraph.jpg"
        jsonLd={faqJsonLd}
      />
      <style>{css}</style>

      {/* NAV */}
      <nav className="hz-nav" aria-label="Navegación principal">
        <a href="/" className="hz-logo"><span className="w">haz</span><span className="c">post</span></a>
        <ul className="hz-nav-links">
          <li><a href="#como-funciona">Cómo funciona</a></li>
          <li><a href="#funciones">Funciones</a></li>
          <li><a href="#precios">Precios</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>
        <div className="hz-nav-cta">
          <a href="/login" className="hz-btn-outline">Iniciar sesión</a>
          <a href="/register" className="hz-btn-primary">Probar gratis</a>
        </div>
      </nav>

      <main id="contenido-principal">
      <div className="hz-root">

        {/* HERO */}
        <header className="hz-hero" aria-label="Publicá en redes con IA">
          <div className="hz-hero-glow" />
          <div className="hz-hero-grid" />
          <div className="hz-hero-content">
           <div className="hz-badge">✦ IA que aprende de tus publicaciones</div>
           <h1>Publica en redes<br /><span className="hl">todos los días con IA</span></h1>
           <p>HazPost crea, programa y publica contenido en Instagram, TikTok y Facebook. Aprende qué funciona y mejora tus resultados automáticamente.</p>
            <div className="hz-hero-ctas">
              <a href="/register" className="hz-btn-primary">Probar gratis 30 días</a>
              <a href="#como-funciona" className="hz-btn-outline">Ver demo →</a>
            </div>
            <div className="hz-proof">
              <div className="hz-avatars">
                <span>LP</span><span>MC</span><span>JR</span><span>AS</span><span>+</span>
              </div>
              <div>
                <div className="hz-stars">★★★★★</div>
                <div className="hz-proof-text">Más de 100 negocios automatizan sus redes con HazPost</div>
              </div>
            </div>
          </div>
        </header>

        {/* LOGOS BAR */}
        <section className="hz-logos" aria-label="Plataformas compatibles">
          <p>Funciona con tus redes favoritas</p>
          <div className="hz-logos-list">
            <div className="hz-pill">📸 Instagram Business</div>
            <div className="hz-pill">🎵 TikTok Business</div>
            <div className="hz-pill">📘 Facebook Pages</div>
            <div className="hz-pill">🤖 GPT-5</div>
            <div className="hz-pill">🇨🇴 Pagos en COP</div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="hz-steps-wrap" id="como-funciona" aria-label="Cómo funciona HazPost">
  <div className="hz-steps">
    <div className="hz-steps-head">
      <div className="hz-label">Cómo funciona</div>
      <h2 className="hz-title">
        De idea a publicación <span style={{ color: "#00C2FF" }}>en minutos.</span>
      </h2>
      <p className="hz-sub">
        HazPost crea, organiza y publica contenido por ti. Tú solo revisas y apruebas.
      </p>
    </div>

    <div className="hz-steps-grid">
      {[
        {
          n: "01",
          icon: "🏢",
          t: "Conecta tu negocio",
          d: "Cuéntale a HazPost qué vendes, cómo hablas y qué quieres comunicar.",
        },
        {
          n: "02",
          icon: "🤖",
          t: "La IA crea contenido",
          d: "Genera posts, captions y hashtags listos para Instagram, TikTok y Facebook.",
        },
        {
          n: "03",
          icon: "✅",
          t: "Apruebas en segundos",
          d: "Revisa, edita o aprueba el contenido antes de que se publique.",
        },
        {
          n: "04",
          icon: "🚀",
          t: "Publica y aprende",
          d: "HazPost publica en el mejor horario y aprende de tus resultados.",
        },
      ].map((s) => (
        <div key={s.n} className="hz-step">
          <div className="hz-step-num">{s.n}</div>
          <span className="hz-step-icon">{s.icon}</span>
          <h3>{s.t}</h3>
          <p>{s.d}</p>
        </div>
      ))}
    </div>
  </div>
</section>

        {/* FEATURES */}
        <section className="hz-section" id="funciones" aria-label="Funciones de HazPost">
          <div className="hz-label">Funciones</div>
          <h2 className="hz-title">Todo lo que necesitás<br /><span style={{color:"#00C2FF"}}>en un solo lugar</span></h2>
          <p className="hz-sub">Olvidate de malabarear Canva, Buffer y ChatGPT. HazPost lo hace todo.</p>
          <div className="hz-features-grid">
            {[
              { i:"✍️", t:"Generación de contenido con IA", d:"Captions, imágenes y hashtags creados por GPT-5 adaptados al tono de tu marca en segundos." },
              { i:"📅", t:"Calendario editorial visual", d:"Visualizá y reorganizá tu contenido semana a semana. Arrastrá y soltá para reprogramar." },
              { i:"⚡", t:"Generador masivo", d:"Creá 30 posts de un mes entero en minutos. Ideal para campañas y fechas especiales." },
              { i:"✅", t:"Flujo de aprobación", d:"Tu equipo revisa y aprueba antes de publicar. Control total sin perder velocidad." },
              { i:"📊", t:"Estadísticas reales", d:"Alcance, impresiones, engagement y mejores horarios directamente desde Meta y TikTok." },
              { i:"🎨", t:"Biblioteca de fondos", d:"Catálogo propio de fondos y overlays de marca para mantener coherencia visual siempre." },
              { i:"🔄", t:"Publicación automática", d:"Publica en el horario óptimo sin intervención humana. Funciona 24/7 incluso cuando dormís." },
              { i:"💬", t:"Compartir por WhatsApp", d:"Enviá previsualizaciones del contenido a clientes por WhatsApp con un click." },
              { i:"🏢", t:"Multi-negocio", d:"Gestioná múltiples marcas o clientes desde una sola cuenta. Perfecto para agencias." },
            ].map(f => (
              <div key={f.t} className="hz-feature">
                <div className="hz-ficon">{f.i}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PLATFORMS */}
        <section className="hz-plat-wrap" aria-label="Plataformas de publicación">
          <div className="hz-plat">
            <div className="hz-plat-head">
              <div className="hz-label">Plataformas</div>
              <h2 className="hz-title">Una app, <span style={{color:"#00C2FF"}}>todas tus redes</span></h2>
              <p className="hz-sub">Conectá tus cuentas una sola vez y publicá en todas desde HazPost.</p>
            </div>
            <div className="hz-plat-grid">
              {[
                { cls:"ig", e:"📸", t:"Instagram", d:"Posts de feed, reels y stories. Captions con emojis y hashtags optimizados para el algoritmo." },
                { cls:"tt", e:"🎵", t:"TikTok", d:"Videos cortos y contenido viral. La IA adapta el tono para la audiencia joven de TikTok." },
                { cls:"fb", e:"📘", t:"Facebook", d:"Posts en página de empresa con imágenes y texto. Ideal para comunidades y negocios locales." },
              ].map(p => (
                <div key={p.t} className={`hz-pcard`}>
                  <span className="hz-pcard-emoji">{p.e}</span>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                  <span className="hz-pbadge">✓ Publicación automática</span>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>

      {/* PRICING — fuera de hz-root para que el reset CSS no aplaste el padding de Tailwind en PlanCard */}
      <div style={{background:"#0A0A0F", color:"#E8E8F0", fontFamily:"'Poppins',sans-serif", overflowX:"hidden"}}>
        <section id="precios" aria-label="Planes y precios" style={{maxWidth:"1200px", margin:"0 auto", padding:"100px 24px 80px"}}>
          <div style={{textAlign:"center", marginBottom:"32px"}}>
            <div className="hz-label">Precios</div>
            <h2 className="hz-title">Simple. Transparente. <span style={{color:"#00C2FF"}}>Sin sorpresas.</span></h2>
            <p className="hz-sub" style={{margin:"0 auto"}}>Empezá gratis 30 días. Sin tarjeta de crédito.</p>
          </div>
          <PricingSection mode="landing" />
        </section>
      </div>

      <div className="hz-root" style={{minHeight:0}}>
        {/* TESTIMONIALS */}
        <section className="hz-testi-wrap" aria-label="Testimonios de clientes">
          <div className="hz-testi">
            <div className="hz-testi-head">
              <div className="hz-label">Testimonios</div>
              <h2 className="hz-title">Lo que dicen<br /><span style={{color:"#00C2FF"}}>nuestros clientes</span></h2>
            </div>
            <div className="hz-testi-grid">
              {[
                { init:"LP", name:"Laura Pérez", role:"Dueña de tienda de ropa, Bogotá", text:'"Antes tardaba 3 horas a la semana en crear contenido para Instagram. Ahora HazPost lo hace en 5 minutos y el engagement subió un 40%."' },
                { init:"MC", name:"Martín Cárdenas", role:"Director de agencia digital, Medellín", text:'"Manejo 8 clientes de agencia. HazPost me ahorró contratar a dos personas más. El generador masivo es increíble."' },
                { init:"AS", name:"Andrea Salcedo", role:"Restaurante El Patio, Cali", text:'"La calidad del contenido que genera es sorprendente. Entiende mi marca mejor que algunos community managers que contraté."' },
              ].map(t => (
                <article key={t.name} className="hz-tcard" aria-label={`Testimonio de ${t.name}`}>
                  <div className="hz-tcard-stars" aria-label="5 estrellas">★★★★★</div>
                  <p className="hz-tcard-text">{t.text}</p>
                  <footer className="hz-tcard-author">
                    <div className="hz-avatar" aria-hidden="true">{t.init}</div>
                    <div>
                      <p className="hz-author-name">{t.name}</p>
                      <p className="hz-author-role">{t.role}</p>
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="hz-section" id="faq" aria-label="Preguntas frecuentes" style={{maxWidth:"800px"}}>
          <div className="hz-label">Preguntas frecuentes</div>
          <h2 className="hz-title">¿Tenés dudas? <span style={{color:"#00C2FF"}}>Acá respondemos todo.</span></h2>
          <div className="hz-faq-list">
            {[
              { q:"¿Qué es HazPost y para qué sirve?", a:"HazPost es una plataforma SaaS que usa Inteligencia Artificial para crear, programar y publicar contenido en Instagram, TikTok y Facebook de forma automática. Diseñada para empresas, emprendedores y agencias de todo el mundo." },
              { q:"¿Necesito conocimientos de diseño o marketing?", a:"No. Solo necesitás describir tu negocio una vez. La IA genera las imágenes, los textos y los hashtags adaptados a tu marca." },
              { q:"¿Funciona con Instagram de empresa y TikTok Business?", a:"Sí. HazPost usa las APIs oficiales de Meta (Instagram Business) y TikTok Business. La conexión es segura vía OAuth." },
              { q:"¿Cómo pago? ¿Qué métodos de pago aceptan?", a:"Sí. Aceptamos tarjetas de crédito y débito internacionales. Para usuarios en Colombia, también aceptamos pagos en pesos colombianos (COP) con PSE a través de Wompi." },
              { q:"¿Puedo cancelar en cualquier momento?", a:"Sí, podés cancelar tu suscripción cuando quieras desde la configuración de tu cuenta. No hay contratos ni cargos ocultos. Los 30 días de prueba son completamente gratis." },
              { q:"¿Puedo manejar múltiples negocios o clientes?", a:"Sí. Los planes Negocio y Agencia permiten gestionar múltiples clientes desde una sola cuenta. Ideal para agencias de marketing digital o usuarios que tengan varios negocios." },
            ].map(f => (
              <div key={f.q} className="hz-faq-item">
                <div className="hz-faq-q">{f.q}</div>
                <div className="hz-faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="hz-cta-wrap" aria-label="Comenzar con HazPost">
          <div className="hz-cta-box">
            <h2>Tu negocio merece estar<br /><span style={{color:"#00C2FF"}}>en todas las redes</span></h2>
            <p>Empezá hoy gratis. Sin tarjeta de crédito. Sin compromisos.<br />La IA trabaja, vos crecés.</p>
            <a href="/register" className="hz-btn-primary">Crear cuenta gratis →</a>
            <div className="hz-nocc">✓ 30 días gratis · ✓ Sin tarjeta de crédito · ✓ Cancelá cuando quieras</div>
          </div>
        </section>

      </div>
      </main>

      {/* FOOTER */}
      <footer className="hz-footer">
        <div className="hz-footer-top">
          <div className="hz-footer-brand">
            <a href="/" className="hz-logo" style={{fontSize:"1.25rem"}}><span className="w">haz</span><span className="c">post</span></a>
            <p>Gestión de redes sociales con IA para empresas en Colombia y Latinoamérica.</p>
          </div>
          <div className="hz-flinks">
            <h4>Producto</h4>
            <ul>
              <li><a href="#funciones">Funciones</a></li>
              <li><a href="#precios">Precios</a></li>
              <li><a href="#como-funciona">Cómo funciona</a></li>
              <li><a href="/register">Prueba gratis</a></li>
            </ul>
          </div>
          <div className="hz-flinks">
            <h4>Legal</h4>
            <ul>
              <li><a href="/privacy-policy">Política de privacidad</a></li>
              <li><a href="/terms-of-service">Términos de servicio</a></li>
              <li><a href="/data-deletion">Eliminación de datos</a></li>
            </ul>
          </div>
          <div className="hz-flinks">
            <h4>Contacto</h4>
            <ul>
              <li><a href="https://instagram.com/hazpost.app" rel="noopener noreferrer" target="_blank">Instagram</a></li>
              <li><a href="https://www.facebook.com/hazpost" rel="noopener noreferrer" target="_blank">Facebook</a></li>
              <li><a href="mailto:hola@hazpost.app">hola@hazpost.app</a></li>
              <li><a href="/register">Empezar gratis</a></li>
            </ul>
          </div>
        </div>
        <div className="hz-footer-bottom">
          <p>© 2025 HazPost. Hecho con ❤️</p>
          <div style={{display:"flex",gap:"20px",alignItems:"center",flexWrap:"wrap"}}>
            <a href="/terms-of-service" style={{color:"#8888A8",fontSize:"0.78rem",textDecoration:"none"}} onMouseOver={e=>(e.currentTarget.style.color="#fff")} onMouseOut={e=>(e.currentTarget.style.color="#8888A8")}>Términos de servicio</a>
            <a href="/privacy-policy" style={{color:"#8888A8",fontSize:"0.78rem",textDecoration:"none"}} onMouseOver={e=>(e.currentTarget.style.color="#fff")} onMouseOut={e=>(e.currentTarget.style.color="#8888A8")}>Privacidad</a>
            <a href="/data-deletion" style={{color:"#8888A8",fontSize:"0.78rem",textDecoration:"none"}} onMouseOver={e=>(e.currentTarget.style.color="#fff")} onMouseOut={e=>(e.currentTarget.style.color="#8888A8")}>Eliminación de datos</a>
            <p style={{color:"#00C2FF",fontSize:"0.78rem",fontWeight:600}}>haz<span style={{color:"#8888A8"}}>post</span>.app</p>
          </div>
        </div>
      </footer>
    </>
  );
}
