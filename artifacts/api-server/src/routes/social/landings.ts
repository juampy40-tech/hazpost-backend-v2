import { Router } from "express";
import { db } from "@workspace/db";
import { landingPagesTable, landingLeadsTable, imageVariantsTable } from "@workspace/db";
import { eq, desc, isNotNull, ilike, or, and, sql } from "drizzle-orm";
import type { Request } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import crypto from "crypto";
import { tenantFilterCol } from "../../lib/tenant.js";

const router = Router();

function tenantFilter(req: Request) {
  return tenantFilterCol(landingPagesTable.userId, req);
}

// ── HTML escaping ────────────────────────────────────────────────────────────
function h(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ── Slug helper ──────────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

// ── Section shape ────────────────────────────────────────────────────────────
interface LandingSections {
  hero_headline: string;
  hero_subheadline: string;
  benefit_1_title: string;
  benefit_1_desc: string;
  benefit_2_title: string;
  benefit_2_desc: string;
  benefit_3_title: string;
  benefit_3_desc: string;
  how_step_1: string;
  how_step_1_desc: string;
  how_step_2: string;
  how_step_2_desc: string;
  how_step_3: string;
  how_step_3_desc: string;
  social_proof: string;
  social_proof_name?: string;
  social_proof_role?: string;
  social_proof_2?: string;
  social_proof_2_name?: string;
  social_proof_2_role?: string;
  cta_headline: string;
  cta_subtext: string;
  faq_1_q?: string;
  faq_1_a?: string;
  faq_2_q?: string;
  faq_2_a?: string;
  faq_3_q?: string;
  faq_3_a?: string;
  savings_monthly_bill?: string;
  landing_type?: string;
}

// ── Deterministic preset for the ECO + EV alliance ───────────────────────────
const ECO_EV_PRESET: LandingSections = {
  hero_headline: "Ahorra $35M a $60M y conduce con energía del sol",
  hero_subheadline: "Importamos directamente los Deepal S05 y S07 — los mejores carros eléctricos del mundo — a precios que los concesionarios no pueden igualar. Y los cargas 100% gratis con los paneles solares ECO.",
  benefit_1_title: "Precios directos sin intermediarios",
  benefit_1_desc: "El Deepal S05 Ultra 620 lo llevas por $108M (con matrícula incluida) vs $143M en concesionario. El S07 Ultra 630 con Huawei ADS por $120M vs $180M+impuestos. Ahorro real: de $35M a $60M en el acto.",
  benefit_2_title: "Carga 100% gratis con tus paneles",
  benefit_2_desc: "Con el PPA de ECO instalas paneles solares con $0 de inversión y recibes 20% de descuento en tu energía. Tu carro eléctrico se recarga con ese sol — cero gasolina, cero factura de energía. Para siempre.",
  benefit_3_title: "Garantía real, no promesas",
  benefit_3_desc: "Garantía opcional de 2 años en chasís, batería de alto voltaje, BMS, sistema térmico y cableado por solo +5% del valor (+$5.4M o +$6M). Paneles solares con 25 años de garantía. Todo certificado RETIE.",
  how_step_1: "Simula tu ahorro en 30 segundos",
  how_step_1_desc: "Dinos tu consumo mensual de energía y te mostramos exactamente cuánto ahorras combinando paneles ECO + Deepal. Sin compromisos.",
  how_step_2: "Separa tu Deepal con solo $10M",
  how_step_2_desc: "Reserva tu Deepal S05 o S07 con un anticipo mínimo. ECO gestiona el proceso de importación directo desde China — sin aranceles sorpresa, con matrícula incluida.",
  how_step_3: "Instalan tus paneles y arrancas",
  how_step_3_desc: "Nuestros técnicos certificados instalan el sistema solar en 1-3 días. Conectas el cargador en casa, enchufas tu Deepal y desde ese día manejas gratis con la energía del sol.",
  social_proof: "Compré el Deepal S05 con ECO y ahorré $35M frente al precio del concesionario. Los paneles solares me costaron $0 con el PPA y ya llevo 6 meses sin pagar gasolina ni factura alta de energía. El negocio más inteligente que he hecho.",
  social_proof_name: "Andrés R.",
  social_proof_role: "Ingeniero, Cali — Deepal S05 Ultra 620",
  social_proof_2: "Mi Deepal S07 con Huawei ADS es una maravilla. Lo compré $60M más barato que en concesionario gracias a ECO. Y con los paneles solares en el techo ya no pago gasolina ni factura de energía. Es como manejar gratis.",
  social_proof_2_name: "Marcela T.",
  social_proof_2_role: "Empresaria, Cali — Deepal S07 Ultra 630",
  cta_headline: "¿Cuánto ahorras TÚ con el combo ECO + Deepal?",
  cta_subtext: "Cuéntanos tu consumo mensual y el modelo que te interesa. Un asesor te llama en menos de 2 horas con tu simulación personalizada.",
  faq_1_q: "¿Los precios del Deepal incluyen matrícula en Colombia?",
  faq_1_a: "Sí. El Deepal S05 Ultra 620 a $108M y el Deepal S07 Ultra 630 a $120M ya incluyen matrícula en Colombia. No hay costos ocultos de impuestos ni aranceles adicionales. Ese es el precio final en Cali.",
  faq_2_q: "¿Cuánto me ahorro realmente comparado con un concesionario?",
  faq_2_a: "El Deepal S05 Ultra 620 cuesta ~$143M en concesionario vs $108M con ECO — ahorro de $35M. El Deepal S07 Ultra 630 vale ~$180M+impuestos en concesionario vs $120M con ECO — ahorro de $60M. Importamos directo, sin intermediarios.",
  faq_3_q: "¿Qué cubre la garantía opcional de 2 años?",
  faq_3_a: "La garantía opcional (+5% del valor: $5.4M para el S05, $6M para el S07) cubre: batería de alto voltaje, BMS (sistema de gestión de batería), sistema térmico, chasís y cableado de alta tensión. No cubre degradación normal de batería ni daños por accidente.",
  savings_monthly_bill: "600000",
  landing_type: "alianza",
};

// ── Solar savings chart data ─────────────────────────────────────────────────
function buildSavingsChartData(monthlyBillCop: number): { labels: number[]; sinSolar: number[]; conPpa: number[]; conCompra: number[] } {
  const labels: number[] = [];
  const sinSolar: number[] = [];
  const conPpa: number[] = [];
  const conCompra: number[] = [];

  let acumSinSolar = 0;
  let acumPpa = 0;
  let acumCompra = 0;

  for (let yr = 1; yr <= 10; yr++) {
    const annualTraditional = monthlyBillCop * 12 * Math.pow(1.06, yr - 1);
    const annualPpa = annualTraditional * 0.80; // 20% savings on PPA
    const annualCompra = annualTraditional * 0.10; // ~90% savings on purchase

    acumSinSolar += annualTraditional;
    acumPpa += annualPpa;
    acumCompra += annualCompra;

    labels.push(yr);
    sinSolar.push(Math.round(acumSinSolar));
    conPpa.push(Math.round(acumPpa));
    conCompra.push(Math.round(acumCompra));
  }

  return { labels, sinSolar, conPpa, conCompra };
}

// ── Format COP numbers ───────────────────────────────────────────────────────
function formatCop(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

// ── Phone formatter ──────────────────────────────────────────────────────────
function formatPhone(raw: string): { display: string; wa: string; tel: string } {
  if (!raw || !raw.trim()) return { display: "", wa: "", tel: "" };
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("57") ? digits.slice(2) : digits;
  const waNum = "57" + local;
  const d = local.padEnd(10, "0");
  return {
    display: `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`,
    wa: waNum,
    tel: `+${waNum}`,
  };
}

// ── Landing type detection ────────────────────────────────────────────────────
function detectLandingType(title: string, description: string): string | undefined {
  const text = (title + " " + description).toLowerCase();
  if (text.includes("ppa") || text.includes("arriendo") || text.includes("renta solar")) return "solar_ppa";
  if (text.includes("compra") || text.includes("adquiere") || text.includes("financiamiento")) return "solar_compra";
  if (text.includes("eléctrico") || text.includes("ev ") || text.includes("vehículo eléctrico") || text.includes("carro elé")) return "ev";
  if (text.includes("alianza") || text.includes("empresa") || text.includes("comercial")) return "alianza";
  return undefined;
}

// ── Landing hero image generation ────────────────────────────────────────────
async function generateLandingHeroImage(
  title: string,
  headline: string,
  landingType?: string
): Promise<{ base64: string; prompt: string } | null> {
  const typeHints: Record<string, string> = {
    solar_ppa:   "rooftop solar panels installation, residential home in Cali Colombia, sunny day, lush tropical vegetation",
    solar_compra: "solar panel array on a modern house in Colombia, blue sky, mountains in the background, energy independence",
    ev:          "electric vehicle charging station with solar panels, modern urban setting in Cali Colombia, green city",
    alianza:     "solar panels and electric cars together, sustainable energy concept, Cali Colombia skyline",
  };
  const sceneHint = typeHints[landingType ?? ""] ?? "solar energy system in Cali Colombia, tropical landscape, clear blue sky";

  const prompt = `Wide panoramic photorealistic hero image for a solar energy company landing page. Scene: ${sceneHint}. Style: bright, optimistic, professional marketing photography. Ultra high resolution, crisp colors, natural sunlight. ${headline}. No text, no logos, no watermarks. Ultra-wide landscape format.`;

  try {
    const buffer = await generateImageBuffer(prompt, "1792x1024");
    const base64 = buffer.toString("base64");
    return { base64, prompt };
  } catch (err) {
    console.error("Landing hero image generation failed:", err);
    return null;
  }
}

// ── Gallery images from backgrounds library ───────────────────────────────────
interface GalleryImage { id: number; url: string; alt: string; caption: string; }

async function queryGalleryImages(landingType: string | undefined, appUrl: string, userId?: number, isAdmin = false): Promise<GalleryImage[]> {
  // Build keyword filters per landing type
  const isEv = landingType === "ev" || landingType === "alianza";

  const solarConditions = [
    ilike(imageVariantsTable.prompt, "%solar%"),
    ilike(imageVariantsTable.prompt, "%panel%"),
    ilike(imageVariantsTable.prompt, "%fotovoltaico%"),
  ];
  const evConditions = [
    ilike(imageVariantsTable.prompt, "%eléctrico%"),
    ilike(imageVariantsTable.prompt, "%electrico%"),
    ilike(imageVariantsTable.prompt, "%cargador%"),
    ilike(imageVariantsTable.prompt, "%vehículo%"),
    ilike(imageVariantsTable.prompt, "%ev%"),
  ];

  const keywordFilter = landingType === "alianza"
    ? or(...solarConditions, ...evConditions)
    : isEv
      ? or(...evConditions)
      : or(...solarConditions);

  // Tenant scope: admin sees all; regular users see only their own image variants
  const userCond = !isAdmin && userId != null ? eq(imageVariantsTable.userId, userId) : undefined;

  try {
    const rows = await db
      .select({ id: imageVariantsTable.id, prompt: imageVariantsTable.prompt, style: imageVariantsTable.style })
      .from(imageVariantsTable)
      .where(and(isNotNull(imageVariantsTable.rawBackground), keywordFilter!, userCond))
      .orderBy(
        // Prefer photorealistic, then any style
        sql`CASE WHEN style = 'photorealistic' THEN 0 ELSE 1 END`,
        desc(imageVariantsTable.createdAt)
      )
      .limit(6);

    return rows.slice(0, 3).map((r) => ({
      id: r.id,
      url: `${appUrl}/api/backgrounds/${r.id}/raw`,
      alt: `Imagen de ${r.prompt.substring(0, 80)} — ECO Energy Cali Colombia`,
      caption: buildImageCaption(r.prompt, landingType),
    }));
  } catch {
    return [];
  }
}

function buildImageCaption(prompt: string, landingType?: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("industrial") || p.includes("empresa") || p.includes("comercial")) return "⚡ Instalación comercial ECO";
  if (p.includes("residencial") || p.includes("unidad") || p.includes("edificio")) return "☀️ Proyecto residencial en Cali";
  if (p.includes("cargador") || p.includes("eléctrico") || p.includes("ev")) return "🔌 Cargador EV con energía solar";
  if (p.includes("solar") || p.includes("panel")) return "☀️ Paneles solares de alta eficiencia";
  if (landingType === "ev" || landingType === "alianza") return "⚡ Electromovilidad con ECO";
  return "☀️ Instalación ECO Solar";
}

// ── HTML builder ─────────────────────────────────────────────────────────────
function buildLandingHtml(
  title: string,
  sections: LandingSections,
  ctaText: string,
  includeForm: boolean,
  slug: string,
  isPreset = false,
  canonicalUrl = "",
  contactPhone = "",
  heroImageUrl = "",       // absolute or relative URL to the hero image
  galleryImages: GalleryImage[] = []  // images from backgrounds library (up to 3)
): string {
  const phone = formatPhone(contactPhone);
  const T = h(title);
  const phoneWaBase = phone.wa ? encodeURIComponent(`Hola ${T}, estoy interesado en sus servicios. Mi número: ${phone.display}`) : "";
  const CTA = h(ctaText);
  const S: Record<string, string> = {};
  for (const [k, v] of Object.entries(sections)) {
    S[k] = typeof v === "string" ? h(v) : String(v ?? "");
  }

  const monthlyBill = Math.max(200000, parseInt(sections.savings_monthly_bill ?? "600000", 10) || 600000);
  const chartData = buildSavingsChartData(monthlyBill);
  const chartDataJson = JSON.stringify(chartData);

  const pageAbsUrl = canonicalUrl || `https://eco-col.com/lp/${slug}`;
  const ppa10yr  = formatCop(chartData.sinSolar[9] - chartData.conPpa[9]);
  const buy10yr  = formatCop(chartData.sinSolar[9] - chartData.conCompra[9]);

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["LocalBusiness", "ProfessionalService"],
        "@id": "https://eco-col.com/#organization",
        "name": "ECO — Energy Capital Operation",
        "alternateName": "ECO Solar Cali",
        "description": "ECO Energy Capital Operation instala sistemas de energía solar fotovoltaica en Cali, Colombia. Ofrecemos contrato PPA (sin inversión inicial, 20% ahorro desde el día 1) y compra directa de paneles solares (hasta 90% de ahorro). Área de servicio: Cali, Yumbo, Jamundí, Candelaria, Valle del Cauca.",
        "url": "https://eco-col.com",
        "telephone": phone.tel,
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": phone.tel,
          "contactType": "sales",
          "areaServed": "CO",
          "availableLanguage": "Spanish",
          "contactOption": "TollFree"
        },
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Cali",
          "addressRegion": "Valle del Cauca",
          "addressCountry": "CO",
          "postalCode": "760001"
        },
        "geo": { "@type": "GeoCoordinates", "latitude": "3.4516", "longitude": "-76.5320" },
        "sameAs": [
          "https://www.instagram.com/eco.sas",
          "https://www.tiktok.com/@eco.col",
          "https://eco-col.com"
        ],
        "areaServed": [
          {"@type":"City","name":"Cali"},
          {"@type":"City","name":"Yumbo"},
          {"@type":"City","name":"Jamundí"},
          {"@type":"City","name":"Candelaria"},
          {"@type":"AdministrativeArea","name":"Valle del Cauca"}
        ],
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "87",
          "bestRating": "5"
        },
        "hasOfferCatalog": {
          "@type": "OfferCatalog",
          "name": "Sistemas de Energía Solar — ECO Cali",
          "itemListElement": [
            {
              "@type": "Offer",
              "name": "Contrato PPA Solar ECO",
              "description": "Instalación de paneles solares sin inversión inicial. El cliente paga un 20% menos en su factura de energía desde el primer mes. Contrato por 15 años; al final el sistema pasa a ser propiedad del cliente.",
              "price": "0",
              "priceCurrency": "COP",
              "priceSpecification": {
                "@type": "PriceSpecification",
                "price": "0",
                "priceCurrency": "COP",
                "description": "Cero pesos de inversión inicial. Se comparte el ahorro."
              },
              "eligibleRegion": {"@type":"Place","name":"Cali, Valle del Cauca, Colombia"}
            },
            {
              "@type": "Offer",
              "name": "Compra Directa Sistema Solar Fotovoltaico",
              "description": "El cliente compra el sistema solar completo. Ahorro estimado de hasta el 90% en la factura de energía. Amortización típica en 4-6 años. Garantía de 25 años en paneles.",
              "eligibleRegion": {"@type":"Place","name":"Cali, Valle del Cauca, Colombia"}
            }
          ]
        }
      },
      {
        "@type": "Service",
        "serviceType": "Instalación de Paneles Solares",
        "name": title,
        "description": sections.hero_subheadline,
        "provider": {"@id": "https://eco-col.com/#organization"},
        "areaServed": {"@type":"Place","name":"Cali, Valle del Cauca, Colombia"},
        "hasOfferCatalog": {
          "@type": "OfferCatalog",
          "name": title,
          "itemListElement": [
            {
              "@type": "Offer",
              "name": sections.benefit_1_title,
              "description": sections.benefit_1_desc
            },
            {
              "@type": "Offer",
              "name": sections.benefit_2_title,
              "description": sections.benefit_2_desc
            },
            {
              "@type": "Offer",
              "name": sections.benefit_3_title,
              "description": sections.benefit_3_desc
            }
          ]
        }
      },
      {
        "@type": "WebPage",
        "@id": pageAbsUrl,
        "url": pageAbsUrl,
        "name": `${title} — ECO Energy Capital Operation | Cali, Colombia`,
        "headline": sections.hero_headline,
        "description": `${sections.hero_subheadline} ECO Energy Capital Operation, Cali, Colombia. PPA solar: 0 inversión, 20% ahorro. Compra directa: hasta 90% ahorro.`,
        "inLanguage": "es-CO",
        "publisher": {"@id": "https://eco-col.com/#organization"},
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {"@type":"ListItem","position":1,"name":"ECO Solar","item":"https://eco-col.com"},
            {"@type":"ListItem","position":2,"name":"Soluciones Solares","item":"https://eco-col.com/soluciones/"},
            {"@type":"ListItem","position":3,"name":title,"item":pageAbsUrl}
          ]
        },
        "speakable": {
          "@type": "SpeakableSpecification",
          "cssSelector": ["#ai-summary","#faq-section","h1","h2"]
        },
        "about": {
          "@type": "Thing",
          "name": "Energía Solar Fotovoltaica Cali Colombia",
          "description": "Sistemas solares fotovoltaicos residenciales y comerciales en Cali, Valle del Cauca, Colombia. Contrato PPA (sin inversión, 20% de ahorro) y compra directa (hasta 90% de ahorro). Instalación en 1 a 3 días hábiles. Garantía 25 años."
        }
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          sections.faq_1_q ? { "@type": "Question", "name": sections.faq_1_q, "acceptedAnswer": { "@type": "Answer", "text": sections.faq_1_a ?? "" } } : null,
          sections.faq_2_q ? { "@type": "Question", "name": sections.faq_2_q, "acceptedAnswer": { "@type": "Answer", "text": sections.faq_2_a ?? "" } } : null,
          sections.faq_3_q ? { "@type": "Question", "name": sections.faq_3_q, "acceptedAnswer": { "@type": "Answer", "text": sections.faq_3_a ?? "" } } : null,
        ].filter(Boolean)
      },
      {
        "@type": "Review",
        "itemReviewed": {"@id": "https://eco-col.com/#organization"},
        "author": {"@type":"Person","name": sections.social_proof_name || "Cliente ECO"},
        "reviewRating": {"@type":"Rating","ratingValue":"5","bestRating":"5"},
        "reviewBody": sections.social_proof
      }
    ]
  });

  const pageUrl = h(pageAbsUrl);

  const formHtml = includeForm
    ? `
    <section id="cotizar" style="background:linear-gradient(180deg,#f8faff 0%,#e8f0fe 100%);padding:80px 24px;">
      <div style="max-width:580px;margin:0 auto;">

        <!-- Urgency banner -->
        <div style="background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:14px;padding:14px 20px;text-align:center;margin-bottom:28px;box-shadow:0 6px 24px rgba(0,119,255,.3);">
          <div style="color:white;font-size:.82rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">&#9889; Solo 5 cupos disponibles esta semana</div>
          <div style="color:rgba(255,255,255,.85);font-size:.78rem;margin-top:4px;">Respuesta garantizada en menos de 2 horas hábiles</div>
        </div>

        <div style="text-align:center;margin-bottom:28px;">
          <h2 style="font-size:2.1rem;font-weight:800;color:#0a0e1a;margin-bottom:8px;letter-spacing:-.02em;">${S.cta_headline}</h2>
          <p style="color:#555;font-size:1rem;line-height:1.65;">${S.cta_subtext}</p>
        </div>

        <div style="background:white;border-radius:20px;padding:36px;box-shadow:0 8px 40px rgba(0,119,255,.1);border:1px solid #ddeeff;">
          <form id="lead-form" style="display:flex;flex-direction:column;gap:16px;" onsubmit="submitLead(event,'${h(slug)}')">
            <div>
              <label style="font-size:.8rem;font-weight:700;color:#333;display:block;margin-bottom:6px;letter-spacing:.03em;text-transform:uppercase;">Nombre completo *</label>
              <input id="f-name" type="text" placeholder="Ej: Carlos Mejía" required style="width:100%;padding:14px 16px;border:2px solid #e8f0fe;border-radius:12px;font-size:1rem;box-sizing:border-box;outline:none;transition:border-color .2s,box-shadow .2s;font-family:'Poppins',sans-serif;" onfocus="this.style.borderColor='#0077FF';this.style.boxShadow='0 0 0 4px rgba(0,119,255,.1)'" onblur="this.style.borderColor='#e8f0fe';this.style.boxShadow=''" />
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:700;color:#333;display:block;margin-bottom:6px;letter-spacing:.03em;text-transform:uppercase;">Tel&#233;fono / WhatsApp *</label>
              <input id="f-phone" type="tel" placeholder="301 128 5672" required style="width:100%;padding:14px 16px;border:2px solid #e8f0fe;border-radius:12px;font-size:1rem;box-sizing:border-box;outline:none;transition:border-color .2s,box-shadow .2s;font-family:'Poppins',sans-serif;" onfocus="this.style.borderColor='#0077FF';this.style.boxShadow='0 0 0 4px rgba(0,119,255,.1)'" onblur="this.style.borderColor='#e8f0fe';this.style.boxShadow=''" />
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:700;color:#333;display:block;margin-bottom:6px;letter-spacing:.03em;text-transform:uppercase;">Correo electr&#243;nico</label>
              <input id="f-email" type="email" placeholder="tu@correo.com" style="width:100%;padding:14px 16px;border:2px solid #e8f0fe;border-radius:12px;font-size:1rem;box-sizing:border-box;outline:none;transition:border-color .2s,box-shadow .2s;font-family:'Poppins',sans-serif;" onfocus="this.style.borderColor='#0077FF';this.style.boxShadow='0 0 0 4px rgba(0,119,255,.1)'" onblur="this.style.borderColor='#e8f0fe';this.style.boxShadow=''" />
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:700;color:#333;display:block;margin-bottom:6px;letter-spacing:.03em;text-transform:uppercase;">Ciudad</label>
              <input id="f-city" type="text" placeholder="Cali" style="width:100%;padding:14px 16px;border:2px solid #e8f0fe;border-radius:12px;font-size:1rem;box-sizing:border-box;outline:none;transition:border-color .2s,box-shadow .2s;font-family:'Poppins',sans-serif;" onfocus="this.style.borderColor='#0077FF';this.style.boxShadow='0 0 0 4px rgba(0,119,255,.1)'" onblur="this.style.borderColor='#e8f0fe';this.style.boxShadow=''" />
            </div>
            <button type="submit" id="submit-btn" style="background:linear-gradient(135deg,#0077FF,#00C2FF);color:white;border:none;border-radius:14px;padding:18px;font-size:1.1rem;font-weight:800;cursor:pointer;letter-spacing:.03em;box-shadow:0 8px 28px rgba(0,119,255,.4);transition:transform .15s,box-shadow .15s,opacity .15s;font-family:'Poppins',sans-serif;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 14px 36px rgba(0,119,255,.5)'" onmouseout="this.style.transform='';this.style.boxShadow='0 8px 28px rgba(0,119,255,.4)'">${CTA} &#8594;</button>
            <div id="form-msg" style="display:none;padding:16px;border-radius:12px;font-weight:600;text-align:center;font-size:.95rem;"></div>
          </form>
          <p style="margin-top:16px;font-size:.78rem;color:#aaa;text-align:center;">Al enviar aceptas que ECO te contacte con informaci&#243;n sobre energ&#237;a solar. Sin spam. Sin compromisos.</p>
        </div>

        <!-- Trust row below form -->
        <div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:20px;">
          <div style="display:flex;align-items:center;gap:5px;font-size:.78rem;color:#666;font-weight:600;"><svg width="14" height="14" viewBox="0 0 24 24" fill="#0077FF"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> 100% gratis</div>
          <div style="display:flex;align-items:center;gap:5px;font-size:.78rem;color:#666;font-weight:600;"><svg width="14" height="14" viewBox="0 0 24 24" fill="#0077FF"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Sin compromiso</div>
          <div style="display:flex;align-items:center;gap:5px;font-size:.78rem;color:#666;font-weight:600;"><svg width="14" height="14" viewBox="0 0 24 24" fill="#0077FF"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Respuesta en &lt;2 horas</div>
        </div>
      </div>
    </section>
    <script>
      async function submitLead(e, slug) {
        e.preventDefault();
        var btn = document.getElementById('submit-btn');
        var msg = document.getElementById('form-msg');
        btn.disabled = true;
        btn.textContent = 'Enviando\u2026';
        btn.style.opacity = '.7';
        try {
          var resp = await fetch('/lp/' + slug + '/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: document.getElementById('f-name').value,
              phone: document.getElementById('f-phone').value,
              email: document.getElementById('f-email').value,
              city: document.getElementById('f-city').value
            })
          });
          if (resp.ok) {
            msg.style.display = 'block';
            msg.style.background = '#d4edda';
            msg.style.color = '#155724';
            msg.textContent = '\u00a1Listo! Te contactaremos muy pronto. \u2600\ufe0f Revisa tu WhatsApp.';
            document.getElementById('lead-form').reset();
            btn.style.background = '#22c55e';
            btn.textContent = '\u2714 Solicitud enviada';
          } else { throw new Error('bad'); }
        } catch(err) {
          msg.style.display = 'block';
          msg.style.background = '#f8d7da';
          msg.style.color = '#721c24';
          msg.textContent = 'Ocurri\u00f3 un error. Esc\u00edbenos al ${phone.display}.';
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.textContent = '${CTA} \u2192';
        }
      }
    </script>`
    : `
    <section id="cotizar" style="background:linear-gradient(150deg,#030712 0%,#0a0e1a 40%,#0d1b3e 80%,#001a5c 100%);padding:88px 24px;text-align:center;position:relative;overflow:hidden;">
      <!-- Grid bg -->
      <div style="position:absolute;inset:0;pointer-events:none;opacity:.04;"><svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="cgrid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#00C2FF" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#cgrid)"/></svg></div>
      <div style="max-width:680px;margin:0 auto;position:relative;z-index:1;">
        <!-- Scarcity banner -->
        <div style="display:inline-block;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);color:#fbbf24;font-size:.78rem;font-weight:800;padding:8px 20px;border-radius:50px;margin-bottom:24px;letter-spacing:.06em;text-transform:uppercase;">&#9889; Solo 5 cupos disponibles esta semana en Cali</div>
        <h2 style="font-size:2.6rem;font-weight:900;color:white;margin-bottom:16px;line-height:1.15;letter-spacing:-.03em;">${S.cta_headline}</h2>
        <p style="color:rgba(255,255,255,.75);font-size:1.1rem;margin-bottom:40px;line-height:1.65;">${S.cta_subtext}</p>
        <div style="display:flex;flex-direction:column;align-items:center;gap:14px;">
          <a href="https://wa.me/${phone.wa}?text=${phoneWaBase}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="font-size:1.15rem;padding:20px 52px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366" style="flex-shrink:0;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            ${CTA} &mdash; WhatsApp
          </a>
          <a href="tel:${phone.tel}" style="color:rgba(255,255,255,.6);font-size:.88rem;text-decoration:none;font-weight:600;">&#9742;&#65039;&nbsp;O ll&#225;manos: ${phone.display}</a>
        </div>
        <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-top:28px;">
          <div style="color:rgba(255,255,255,.45);font-size:.8rem;display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(0,194,255,.7)"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Respuesta en &lt;2 horas</div>
          <div style="color:rgba(255,255,255,.45);font-size:.8rem;display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(0,194,255,.7)"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>100% gratis &middot; sin compromiso</div>
          <div style="color:rgba(255,255,255,.45);font-size:.8rem;display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(0,194,255,.7)"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Asesor experto en solar</div>
        </div>
      </div>
    </section>`;

  return `<!DOCTYPE html>
<html lang="es" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${T} — ECO Energy Capital Operation | Paneles Solares Cali Colombia</title>
  <meta name="description" content="${S.hero_subheadline} — ECO Energy Capital Operation instala paneles solares en Cali, Colombia. PPA solar: $0 inversión, 20% ahorro desde el día 1. Compra directa: hasta 90% de ahorro en tu factura de energía. Garantía 25 años."/>
  <meta name="keywords" content="energía solar Cali, paneles solares Colombia, ECO Energy Capital Operation, contrato PPA solar Cali, sistemas fotovoltaicos Valle del Cauca, ahorro factura energía Cali, instalación paneles solares Cali, solar fotovoltaico Colombia"/>
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"/>
  <meta name="author" content="ECO — Energy Capital Operation"/>
  <meta name="rating" content="general"/>
  <meta name="language" content="es-CO"/>
  <meta name="geo.region" content="CO-VAC"/>
  <meta name="geo.placename" content="Cali, Valle del Cauca, Colombia"/>
  <meta name="geo.position" content="3.4516;-76.5320"/>
  <meta name="ICBM" content="3.4516, -76.5320"/>
  <link rel="canonical" href="${pageUrl}"/>
  <link rel="alternate" hreflang="es-CO" href="${pageUrl}"/>
  <link rel="alternate" hreflang="es" href="${pageUrl}"/>
  <!-- Open Graph -->
  <meta property="og:type" content="website"/>
  <meta property="og:url" content="${pageUrl}"/>
  <meta property="og:title" content="${T} — ECO Solar | Paneles Solares Cali Colombia"/>
  <meta property="og:description" content="${S.hero_subheadline} PPA solar: $0 inversión. Compra directa: hasta 90% ahorro. ☎ ${phone.display}"/>
  <meta property="og:site_name" content="ECO — Energy Capital Operation"/>
  <meta property="og:locale" content="es_CO"/>
  <meta property="og:image" content="https://www.eco-col.com/wp-content/uploads/2025/06/Solar-Energy-Banner2.png"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:image:alt" content="Paneles solares ECO instalados en Cali, Colombia"/>
  <!-- Twitter / X Card -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:site" content="@ecosascol"/>
  <meta name="twitter:title" content="${T} — ECO Solar Cali"/>
  <meta name="twitter:description" content="${S.hero_subheadline} PPA: $0 inversión, 20% ahorro. ☎ ${phone.display}"/>
  <meta name="twitter:image" content="https://www.eco-col.com/wp-content/uploads/2025/06/Solar-Energy-Banner2.png"/>
  <!-- Structured Data -->
  <script type="application/ld+json">${jsonLd}</script>
  <!-- Preconnect for performance -->
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Poppins',sans-serif;color:#1a1a2e;line-height:1.6;background:#fff;}
    .container{max-width:1100px;margin:0 auto;padding:0 24px;}

    /* ── Badges ── */
    .badge{display:inline-block;background:rgba(0,119,255,.1);border:1px solid rgba(0,119,255,.28);color:#0077FF;font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:6px 16px;border-radius:50px;}
    .badge-white{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.35);color:white;}
    .badge-green{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:#16a34a;}
    .badge-amber{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:#d97706;}

    /* ── Buttons ── */
    .btn-primary{display:inline-flex;align-items:center;gap:10px;background:white;color:#0077FF;font-weight:800;font-size:1.05rem;padding:16px 38px;border-radius:50px;text-decoration:none;box-shadow:0 8px 30px rgba(0,0,0,.25);transition:transform .18s,box-shadow .18s;font-family:'Poppins',sans-serif;}
    .btn-primary:hover{transform:translateY(-3px);box-shadow:0 16px 44px rgba(0,0,0,.32);}
    .btn-blue{display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,#0077FF,#00C2FF);color:white;font-weight:800;font-size:1.05rem;padding:16px 38px;border-radius:50px;text-decoration:none;box-shadow:0 8px 28px rgba(0,119,255,.35);transition:transform .18s,box-shadow .18s,opacity .15s;font-family:'Poppins',sans-serif;}
    .btn-blue:hover{transform:translateY(-3px);box-shadow:0 16px 44px rgba(0,119,255,.45);opacity:.92;}
    .btn-outline{display:inline-flex;align-items:center;gap:8px;border:2px solid rgba(255,255,255,.45);color:white;font-weight:700;font-size:.95rem;padding:14px 32px;border-radius:50px;text-decoration:none;transition:border-color .15s,background .15s;font-family:'Poppins',sans-serif;}
    .btn-outline:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.75);}
    .btn-wa{display:inline-flex;align-items:center;gap:10px;background:#25D366;color:white;font-weight:800;font-size:1rem;padding:14px 32px;border-radius:50px;text-decoration:none;box-shadow:0 6px 20px rgba(37,211,102,.35);transition:transform .18s,box-shadow .18s;font-family:'Poppins',sans-serif;}
    .btn-wa:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(37,211,102,.45);}

    /* ── Cards ── */
    .benefit-card{background:white;border-radius:22px;padding:32px;box-shadow:0 4px 28px rgba(0,119,255,.07);border:1px solid #e8f0fe;transition:transform .22s,box-shadow .22s;position:relative;overflow:hidden;}
    .benefit-card::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:linear-gradient(180deg,#0077FF,#00C2FF);border-radius:4px 0 0 4px;}
    .benefit-card:hover{transform:translateY(-6px);box-shadow:0 16px 48px rgba(0,119,255,.15);}
    .testimonial-card{background:white;border-radius:22px;padding:36px;box-shadow:0 6px 32px rgba(0,0,0,.07);border:1px solid #f0f0f8;position:relative;overflow:hidden;}
    .testimonial-card::before{content:'"';position:absolute;top:8px;right:24px;font-size:120px;line-height:1;color:#0077FF;opacity:.06;font-family:Georgia,serif;pointer-events:none;}

    /* ── Steps ── */
    .step-num{width:56px;height:56px;background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:1.4rem;font-weight:900;flex-shrink:0;box-shadow:0 6px 20px rgba(0,119,255,.35);}
    .step-card{background:white;border-radius:20px;padding:28px;border:1px solid #e8f0fe;box-shadow:0 2px 16px rgba(0,119,255,.06);position:relative;}
    .step-connector{width:2px;height:28px;background:linear-gradient(to bottom,#0077FF,rgba(0,119,255,.15));margin:0 auto;}

    /* ── Stats ── */
    .stat-card{text-align:center;padding:28px 20px;}
    .stat-num{font-size:2.6rem;font-weight:900;line-height:1;background:linear-gradient(135deg,#0077FF,#00C2FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}

    /* ── FAQ ── */
    .faq-item{border-bottom:1px solid #e8f0fe;}
    .faq-btn{width:100%;text-align:left;background:none;border:none;padding:22px 0;font-size:1rem;font-weight:700;color:#0a0e1a;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;font-family:'Poppins',sans-serif;transition:color .15s;}
    .faq-btn:hover{color:#0077FF;}
    .faq-answer{display:none;padding:0 0 22px;color:#555;line-height:1.75;font-size:.95rem;}
    .faq-answer.open{display:block;}

    /* ── Urgency bar ── */
    .urgency-bar{background:linear-gradient(90deg,#0077FF,#00C2FF,#0077FF);background-size:200% auto;animation:shimmer 3s linear infinite;color:white;text-align:center;padding:10px 20px;font-size:.8rem;font-weight:700;letter-spacing:.05em;overflow:hidden;position:relative;}
    @keyframes shimmer{to{background-position:200% center;}}
    .urgency-bar marquee{display:inline;}

    /* ── Highlight strip ── */
    .highlight-strip{background:linear-gradient(135deg,#0a0e1a 0%,#0d1b3e 60%,#001550 100%);padding:32px 24px;text-align:center;}

    /* ── Gallery ── */
    .gallery-img-wrap{border-radius:20px;overflow:hidden;position:relative;aspect-ratio:4/3;box-shadow:0 10px 36px rgba(0,0,0,.12);transition:transform .22s,box-shadow .22s;}
    .gallery-img-wrap:hover{transform:translateY(-5px) scale(1.01);box-shadow:0 18px 52px rgba(0,0,0,.18);}

    /* ── Pricing card glow ── */
    .price-card-featured{box-shadow:0 8px 48px rgba(0,119,255,.22),0 0 0 3px #0077FF;}

    /* ── Scroll reveal ── */
    .reveal{opacity:0;transform:translateY(32px);transition:opacity .6s ease,transform .6s ease;}
    .reveal.visible{opacity:1;transform:none;}
    .reveal-left{opacity:0;transform:translateX(-32px);transition:opacity .6s ease,transform .6s ease;}
    .reveal-left.visible{opacity:1;transform:none;}
    .reveal-right{opacity:0;transform:translateX(32px);transition:opacity .6s ease,transform .6s ease;}
    .reveal-right.visible{opacity:1;transform:none;}

    /* ── Responsive ── */
    @media(max-width:768px){
      .hero-headline{font-size:2.2rem!important;}
      .benefits-grid{grid-template-columns:1fr!important;}
      .stats-grid{grid-template-columns:1fr 1fr!important;}
      .testi-grid{grid-template-columns:1fr!important;}
      .gallery-grid{grid-template-columns:1fr!important;}
      .calc-row{flex-direction:column!important;align-items:stretch!important;}
      .footer-grid{grid-template-columns:1fr!important;}
      .steps-grid{gap:0!important;}
    }

    /* ── Animations ── */
    @keyframes fadeUp{from{opacity:0;transform:translateY(32px);}to{opacity:1;transform:translateY(0);}}
    @keyframes pulse-ring{0%{transform:scale(.95);opacity:.8;}70%{transform:scale(1.08);opacity:0;}100%{transform:scale(.95);opacity:0;}}
    @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}
    @keyframes count-up{from{opacity:0;}to{opacity:1;}}
    .fade-up{animation:fadeUp .65s ease both;}
    .float-anim{animation:float 4s ease-in-out infinite;}
    .pulse-dot{position:relative;}
    .pulse-dot::after{content:'';position:absolute;inset:0;border-radius:50%;border:3px solid #0077FF;animation:pulse-ring 2s ease-out infinite;}

    /* ── Before/After comparison ── */
    .before-after{background:linear-gradient(135deg,#f8faff,#e8f0fe);border-radius:20px;padding:32px;border:1px solid #ddeeff;}
    .before-box{background:#fff0f0;border:2px solid #fecaca;border-radius:14px;padding:20px;text-align:center;}
    .after-box{background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:14px;padding:20px;text-align:center;color:white;}

    /* ── Social proof bar ── */
    .social-proof-bar{background:#0a0e1a;padding:16px 24px;display:flex;align-items:center;justify-content:center;gap:32px;flex-wrap:wrap;}
    .sp-item{display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.7);font-size:.82rem;font-weight:600;}
    .sp-stars{color:#f59e0b;font-size:1rem;}
  </style>
</head>
<body itemscope itemtype="https://schema.org/WebPage">

<!-- AI / LLM READABLE SUMMARY — visible to crawlers, screen readers, and AI scrapers -->
<div id="ai-summary" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;" aria-label="Resumen estructurado de la página para motores de búsqueda e IA">
  <h1>${title} — ECO Energy Capital Operation, Cali, Colombia</h1>
  <p><strong>Empresa:</strong> ECO — Energy Capital Operation. Instaladora de sistemas de energía solar fotovoltaica en Cali, Valle del Cauca, Colombia. Teléfono: ${phone.tel}. Web: https://eco-col.com</p>
  <p><strong>Servicio principal:</strong> ${sections.hero_headline}. ${sections.hero_subheadline}</p>
  <p><strong>Opciones disponibles:</strong></p>
  <ul>
    <li><strong>Contrato PPA Solar:</strong> Inversión inicial $0 COP. Ahorro del 20% en la factura de energía desde el primer mes. Duración del contrato: 15 años. Al finalizar, el sistema pasa a ser propiedad del cliente sin costo adicional. Disponible en Cali y municipios del Valle del Cauca.</li>
    <li><strong>Compra Directa de Paneles Solares:</strong> Ahorro estimado del 90% en la factura de energía. El cliente es dueño del sistema desde el día 1. Amortización típica en 4 a 6 años. Garantía de paneles: 25 años.</li>
  </ul>
  <p><strong>Proyección de ahorro a 10 años (base factura ${formatCop(monthlyBill)}/mes):</strong></p>
  <ul>
    <li>Con PPA ECO: ahorras aproximadamente ${ppa10yr} en 10 años versus continuar con la red eléctrica.</li>
    <li>Con Compra Directa: ahorras aproximadamente ${buy10yr} en 10 años versus continuar con la red eléctrica.</li>
  </ul>
  <p><strong>Beneficios clave:</strong> ${sections.benefit_1_title} — ${sections.benefit_1_desc}. ${sections.benefit_2_title} — ${sections.benefit_2_desc}. ${sections.benefit_3_title} — ${sections.benefit_3_desc}</p>
  <p><strong>Proceso de instalación:</strong> Paso 1: ${sections.how_step_1} — ${sections.how_step_1_desc}. Paso 2: ${sections.how_step_2} — ${sections.how_step_2_desc}. Paso 3: ${sections.how_step_3} — ${sections.how_step_3_desc}</p>
  ${sections.faq_1_q ? `<p><strong>Pregunta frecuente:</strong> ${sections.faq_1_q} — Respuesta: ${sections.faq_1_a}</p>` : ""}
  ${sections.faq_2_q ? `<p><strong>Pregunta frecuente:</strong> ${sections.faq_2_q} — Respuesta: ${sections.faq_2_a}</p>` : ""}
  ${sections.faq_3_q ? `<p><strong>Pregunta frecuente:</strong> ${sections.faq_3_q} — Respuesta: ${sections.faq_3_a}</p>` : ""}
  <p><strong>Área de servicio:</strong> Cali, Yumbo, Jamundí, Candelaria, Puerto Tejada, Florida, Pradera, La Cumbre, Dagua (radio 20 km de Cali).</p>
  <p><strong>Contacto:</strong> WhatsApp ${phone.tel} · Email: contacto@eco-col.com · Web: https://eco-col.com</p>
  <p><strong>Valoración de clientes:</strong> 4.9/5 basado en 87 reseñas.</p>
  <p><strong>Certifications:</strong> Técnicos certificados RETIE. Empresa legalmente constituida en Cali, Colombia.</p>
</div>

<!-- URGENCY BAR -->
<div class="urgency-bar" role="alert" aria-live="polite">
  <marquee behavior="scroll" direction="left" scrollamount="4" style="max-width:100%;">
    ⚡&nbsp;&nbsp;OFERTA ESPECIAL&nbsp;·&nbsp;Solo 5 cupos de instalación disponibles esta semana en Cali&nbsp;·&nbsp;Respuesta garantizada en 2 horas&nbsp;·&nbsp;Llama ya: ${phone.display}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;⚡&nbsp;&nbsp;OFERTA ESPECIAL&nbsp;·&nbsp;Solo 5 cupos de instalación disponibles esta semana en Cali&nbsp;·&nbsp;Respuesta garantizada en 2 horas&nbsp;·&nbsp;Llama ya: ${phone.display}
  </marquee>
</div>

<!-- STICKY NAV -->
<nav aria-label="Navegación principal" style="background:rgba(255,255,255,.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid #e8f0fe;padding:14px 24px;position:sticky;top:0;z-index:100;box-shadow:0 2px 16px rgba(0,0,0,.08);">
  <div style="max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
    <a href="https://eco-col.com" style="text-decoration:none;display:flex;align-items:center;gap:8px;" aria-label="ECO Energy Capital Operation - Inicio">
      <img
        src="/api/brand/logo?v=blue"
        alt="ECO Energy Capital Operation"
        height="38"
        style="max-height:38px;width:auto;display:block;"
        onerror="this.style.display='none';document.getElementById('eco-nav-text-logo').style.display='flex';"
      />
      <span id="eco-nav-text-logo" style="display:none;align-items:center;gap:8px;">
        <span style="font-size:1.3rem;font-weight:900;color:#0077FF;font-family:'Poppins',sans-serif;letter-spacing:-.02em;">ECO</span>
        <span style="background:linear-gradient(135deg,#0077FF,#00C2FF);color:white;font-size:.7rem;font-weight:700;padding:3px 8px;border-radius:6px;">SOLAR</span>
      </span>
    </a>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <a href="tel:${phone.tel}" style="font-size:.82rem;color:#444;text-decoration:none;font-weight:600;" aria-label="Llamar a ECO Solar">&#9742;&#65039;&nbsp;${phone.display}</a>
      ${includeForm
        ? `<a href="#cotizar" class="btn-blue" style="padding:10px 22px;font-size:.85rem;">${CTA}</a>`
        : `<a href="https://wa.me/${phone.wa}" target="_blank" rel="noopener noreferrer" class="btn-wa" style="padding:10px 22px;font-size:.85rem;">&#128172;&nbsp;WhatsApp</a>`}
    </div>
  </div>
</nav>

<!-- BREADCRUMB -->
<nav aria-label="Ruta de navegación" style="background:#f8faff;border-bottom:1px solid #e8f0fe;padding:10px 24px;">
  <div style="max-width:1100px;margin:0 auto;">
    <ol itemscope itemtype="https://schema.org/BreadcrumbList" style="list-style:none;display:flex;gap:6px;align-items:center;font-size:.78rem;color:#888;flex-wrap:wrap;">
      <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <a itemprop="item" href="https://eco-col.com" style="color:#0077FF;text-decoration:none;font-weight:600;"><span itemprop="name">ECO Solar</span></a>
        <meta itemprop="position" content="1"/>
      </li>
      <li style="opacity:.4;">›</li>
      <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <a itemprop="item" href="https://eco-col.com/soluciones/" style="color:#0077FF;text-decoration:none;font-weight:600;"><span itemprop="name">Soluciones</span></a>
        <meta itemprop="position" content="2"/>
      </li>
      <li style="opacity:.4;">›</li>
      <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <span itemprop="name" style="color:#555;font-weight:500;">${T}</span>
        <meta itemprop="position" content="3"/>
      </li>
    </ol>
  </div>
</nav>

<main id="main-content" itemscope itemtype="https://schema.org/Service">

<!-- HERO SECTION -->
<section id="eco-hero" style="background:linear-gradient(150deg,#030712 0%,#0a0e1a 40%,#0d1b3e 75%,#001a5c 100%);padding:96px 24px 80px;text-align:center;position:relative;overflow:hidden;min-height:580px;display:flex;align-items:center;">

  <!-- Animated grid lines background -->
  <div style="position:absolute;inset:0;pointer-events:none;opacity:.04;">
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#00C2FF" stroke-width="1"/></pattern></defs>
      <rect width="100%" height="100%" fill="url(#grid)"/>
    </svg>
  </div>

  <!-- Glow blobs -->
  <div style="position:absolute;top:-120px;left:-100px;width:500px;height:500px;background:radial-gradient(circle,rgba(0,119,255,.28),transparent 65%);pointer-events:none;"></div>
  <div style="position:absolute;bottom:-80px;right:-80px;width:440px;height:440px;background:radial-gradient(circle,rgba(0,194,255,.2),transparent 65%);pointer-events:none;"></div>
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:800px;height:800px;pointer-events:none;opacity:.055;">
    <svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <circle cx="400" cy="400" r="280" fill="none" stroke="#0077FF" stroke-width="2"/>
      <circle cx="400" cy="400" r="350" fill="none" stroke="#00C2FF" stroke-width="1" stroke-dasharray="14 10"/>
      <circle cx="400" cy="400" r="190" fill="none" stroke="#0077FF" stroke-width="1" stroke-dasharray="5 7"/>
      <circle cx="400" cy="400" r="90" fill="#00C2FF" opacity=".25"/>
      <circle cx="400" cy="400" r="46" fill="#0077FF" opacity=".55"/>
      ${[0,45,90,135,180,225,270,315].map((a: number) => {
        const rad = a * Math.PI / 180;
        const x1 = 400 + 100 * Math.cos(rad), y1 = 400 + 100 * Math.sin(rad);
        const x2 = 400 + 160 * Math.cos(rad), y2 = 400 + 160 * Math.sin(rad);
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#00C2FF" stroke-width="3" stroke-linecap="round"/>`;
      }).join("")}
    </svg>
  </div>

  <!-- Floating savings pill -->
  <div class="float-anim" style="position:absolute;top:18%;right:6%;background:rgba(255,255,255,.08);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:14px 20px;display:none;pointer-events:none;" id="hero-pill-1">
    <div style="font-size:.72rem;color:rgba(255,255,255,.6);font-weight:600;letter-spacing:.06em;">AHORRO MENSUAL</div>
    <div style="font-size:1.4rem;font-weight:900;color:#00C2FF;">${formatCop(monthlyBill * 0.20)}</div>
    <div style="font-size:.7rem;color:rgba(255,255,255,.5);">Con PPA ECO</div>
  </div>
  <div class="float-anim" style="position:absolute;bottom:20%;left:5%;background:rgba(0,119,255,.15);backdrop-filter:blur(10px);border:1px solid rgba(0,119,255,.35);border-radius:16px;padding:14px 20px;display:none;pointer-events:none;animation-delay:.8s;" id="hero-pill-2">
    <div style="font-size:.72rem;color:rgba(255,255,255,.6);font-weight:600;letter-spacing:.06em;">4.9 ★★★★★</div>
    <div style="font-size:1rem;font-weight:800;color:white;">87+ clientes felices</div>
  </div>

  <div class="container fade-up" style="position:relative;z-index:1;">
    <!-- Logo -->
    <div style="margin-bottom:28px;display:flex;justify-content:center;">
      <a href="https://eco-col.com" aria-label="ECO Energy Capital Operation">
        <img src="/api/brand/logo?v=white" alt="ECO Energy Capital Operation" height="56"
          style="max-height:56px;width:auto;display:block;filter:drop-shadow(0 4px 12px rgba(0,0,0,.4));"
          onerror="this.style.display='none';"/>
      </a>
    </div>

    <!-- Eyebrow badge -->
    <div style="margin-bottom:20px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
      <div class="badge badge-white">&#9728;&#65039; ECO &mdash; Energy Capital Operation &middot; Cali, Colombia</div>
      <div style="background:rgba(34,197,94,.2);border:1px solid rgba(34,197,94,.4);color:#4ade80;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:6px 14px;border-radius:50px;display:inline-block;">&#128994; Disponible en tu zona</div>
    </div>

    <!-- Main headline -->
    <h1 itemprop="name" class="hero-headline" style="font-size:3.6rem;font-weight:900;color:white;line-height:1.1;margin-bottom:22px;letter-spacing:-.04em;max-width:860px;margin-left:auto;margin-right:auto;">${S.hero_headline}</h1>
    <p itemprop="description" style="font-size:1.2rem;color:rgba(255,255,255,.75);max-width:680px;margin:0 auto 18px;line-height:1.65;">${S.hero_subheadline}</p>

    <!-- Key promise line -->
    <p style="font-size:1rem;color:#00C2FF;font-weight:700;margin-bottom:40px;letter-spacing:.02em;">Cali pone el sol &mdash; <span style="color:white;">&#161;ECO la solución!</span></p>

    <!-- CTA buttons -->
    <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-bottom:44px;">
      ${includeForm
        ? `<a href="#cotizar" class="btn-primary" style="font-size:1.1rem;padding:18px 44px;">&#128196;&nbsp;${CTA}</a>`
        : `<a href="https://wa.me/${phone.wa}?text=${phoneWaBase}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="font-size:1.1rem;padding:18px 44px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366" style="flex-shrink:0;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>${CTA}</a>`}
      <a href="https://eco-col.com/simuladores/" target="_blank" rel="noopener noreferrer" class="btn-outline" style="font-size:.95rem;">&#128200;&nbsp;Simular mi ahorro GRATIS</a>
    </div>

    <!-- Micro-trust row -->
    <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;">
      <div style="color:rgba(255,255,255,.6);font-size:.8rem;display:flex;align-items:center;gap:7px;"><span style="width:22px;height:22px;background:rgba(0,194,255,.2);border:1px solid rgba(0,194,255,.4);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#00C2FF;font-size:.75rem;flex-shrink:0;">&#10003;</span> Sin inversión con PPA</div>
      <div style="color:rgba(255,255,255,.6);font-size:.8rem;display:flex;align-items:center;gap:7px;"><span style="width:22px;height:22px;background:rgba(0,194,255,.2);border:1px solid rgba(0,194,255,.4);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#00C2FF;font-size:.75rem;flex-shrink:0;">&#10003;</span> Instalación en 1&ndash;3 días</div>
      <div style="color:rgba(255,255,255,.6);font-size:.8rem;display:flex;align-items:center;gap:7px;"><span style="width:22px;height:22px;background:rgba(0,194,255,.2);border:1px solid rgba(0,194,255,.4);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#00C2FF;font-size:.75rem;flex-shrink:0;">&#10003;</span> 25 años de garantía</div>
      <div style="color:rgba(255,255,255,.6);font-size:.8rem;display:flex;align-items:center;gap:7px;"><span style="width:22px;height:22px;background:rgba(0,194,255,.2);border:1px solid rgba(0,194,255,.4);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#00C2FF;font-size:.75rem;flex-shrink:0;">&#10003;</span> Técnicos certificados RETIE</div>
    </div>
  </div>
</section>

<!-- SOCIAL PROOF BAR -->
<div class="social-proof-bar">
  <div class="sp-item"><span class="sp-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span><span><strong style="color:white;">4.9/5</strong> &mdash; 87 reseñas verificadas</span></div>
  <div class="sp-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="#4ade80"><path d="M20 6L9 17l-5-5"/></svg><span>Empresa registrada en Cali</span></div>
  <div class="sp-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="#60a5fa"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg><span>Técnicos certificados RETIE</span></div>
  <div class="sp-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" fill-rule="evenodd"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><span>+100 instalaciones exitosas</span></div>
</div>

<!-- STATS BAR -->
<section style="background:#0a0e1a;padding:44px 24px;border-top:1px solid rgba(0,119,255,.2);">
  <div class="container">
    <div class="stats-grid reveal" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;">

      <div class="stat-card" style="border-right:1px solid rgba(255,255,255,.07);">
        <div style="font-size:2.8rem;font-weight:900;line-height:1;background:linear-gradient(135deg,#0077FF,#00C2FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;" data-count="100">100+</div>
        <div style="font-size:.82rem;font-weight:600;color:rgba(255,255,255,.55);margin-top:6px;text-transform:uppercase;letter-spacing:.06em;">Instalaciones en Cali</div>
        <div style="width:32px;height:2px;background:linear-gradient(90deg,#0077FF,#00C2FF);border-radius:2px;margin:10px auto 0;"></div>
      </div>

      <div class="stat-card" style="border-right:1px solid rgba(255,255,255,.07);">
        <div style="font-size:2.8rem;font-weight:900;line-height:1;background:linear-gradient(135deg,#0077FF,#00C2FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">20%</div>
        <div style="font-size:.82rem;font-weight:600;color:rgba(255,255,255,.55);margin-top:6px;text-transform:uppercase;letter-spacing:.06em;">Ahorro mínimo PPA</div>
        <div style="width:32px;height:2px;background:linear-gradient(90deg,#0077FF,#00C2FF);border-radius:2px;margin:10px auto 0;"></div>
      </div>

      <div class="stat-card" style="border-right:1px solid rgba(255,255,255,.07);">
        <div style="font-size:2.8rem;font-weight:900;line-height:1;background:linear-gradient(135deg,#0077FF,#00C2FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">25</div>
        <div style="font-size:.82rem;font-weight:600;color:rgba(255,255,255,.55);margin-top:6px;text-transform:uppercase;letter-spacing:.06em;">Años de garantía</div>
        <div style="width:32px;height:2px;background:linear-gradient(90deg,#0077FF,#00C2FF);border-radius:2px;margin:10px auto 0;"></div>
      </div>

      <div class="stat-card">
        <div style="font-size:2.8rem;font-weight:900;line-height:1;background:linear-gradient(135deg,#0077FF,#00C2FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">$0</div>
        <div style="font-size:.82rem;font-weight:600;color:rgba(255,255,255,.55);margin-top:6px;text-transform:uppercase;letter-spacing:.06em;">Inversión inicial PPA</div>
        <div style="width:32px;height:2px;background:linear-gradient(90deg,#0077FF,#00C2FF);border-radius:2px;margin:10px auto 0;"></div>
      </div>

    </div>
  </div>
</section>

<!-- BEFORE / AFTER SAVINGS HIGHLIGHT -->
<section style="background:#f8faff;padding:56px 24px;border-bottom:1px solid #e8f0fe;">
  <div class="container" style="max-width:900px;">
    <div style="text-align:center;margin-bottom:32px;" class="reveal">
      <div class="badge" style="margin-bottom:12px;">El impacto real en tu bolsillo</div>
      <h2 style="font-size:2rem;font-weight:800;color:#0a0e1a;">Esto es lo que pasa con tu factura</h2>
    </div>
    <div class="reveal" style="display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center;" id="before-after-grid">
      <div class="before-box">
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#dc2626;margin-bottom:8px;">&#128721; Sin solar hoy</div>
        <div style="font-size:2rem;font-weight:900;color:#dc2626;line-height:1;">${formatCop(monthlyBill)}</div>
        <div style="font-size:.82rem;color:#666;margin-top:6px;">pagas cada mes</div>
        <div style="font-size:.78rem;color:#f87171;margin-top:10px;font-weight:600;">&#43;6% aumento anual promedio</div>
      </div>
      <div style="text-align:center;flex-shrink:0;">
        <div style="font-size:2rem;">&#8594;</div>
        <div style="font-size:.75rem;font-weight:800;color:#0077FF;text-transform:uppercase;letter-spacing:.06em;margin-top:4px;">ECO</div>
      </div>
      <div class="after-box">
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;opacity:.85;">&#9889; Con PPA ECO</div>
        <div style="font-size:2rem;font-weight:900;line-height:1;">${formatCop(monthlyBill * 0.80)}</div>
        <div style="font-size:.82rem;margin-top:6px;opacity:.85;">pagas cada mes</div>
        <div style="font-size:.78rem;margin-top:10px;font-weight:700;background:rgba(255,255,255,.2);padding:5px 12px;border-radius:50px;display:inline-block;">AHORRAS ${formatCop(monthlyBill * 0.20)}/mes &#127881;</div>
      </div>
    </div>
    <p style="text-align:center;font-size:.78rem;color:#aaa;margin-top:16px;">Proyección estimada con PPA ECO. Con Compra Directa el ahorro puede ser hasta el 90%.</p>
  </div>
</section>

<!-- PRICING COMPARISON TABLE — machine-readable, visible to crawlers and AI engines -->
<section id="precios" aria-label="Comparación de precios y planes ECO Solar" style="padding:72px 24px;background:white;border-bottom:1px solid #e8f0fe;">
  <div class="container" style="max-width:860px;">
    <div style="text-align:center;margin-bottom:40px;">
      <div class="badge" style="margin-bottom:12px;">Planes y precios</div>
      <h2 style="font-size:2rem;font-weight:800;color:#0a0e1a;margin-bottom:8px;">Elige tu camino hacia la independencia energ&#233;tica</h2>
      <p style="color:#666;font-size:1rem;max-width:580px;margin:0 auto;">Dos modalidades, un mismo resultado: factura de energ&#237;a mucho m&#225;s baja en Cali.</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;" class="testi-grid">
      <!-- PPA PLAN -->
      <article itemscope itemtype="https://schema.org/Product" style="background:linear-gradient(145deg,#f0f8ff,#e8f0fe);border-radius:20px;padding:32px;border:2px solid #0077FF;position:relative;overflow:hidden;">
        <div style="position:absolute;top:16px;right:16px;background:#0077FF;color:white;font-size:.7rem;font-weight:800;padding:4px 12px;border-radius:50px;letter-spacing:.06em;">M&#193;S POPULAR</div>
        <div style="width:48px;height:48px;background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin-bottom:16px;">&#9889;</div>
        <h3 itemprop="name" style="font-size:1.3rem;font-weight:900;color:#0077FF;margin-bottom:6px;">Contrato PPA Solar</h3>
        <p itemprop="description" style="font-size:.88rem;color:#555;margin-bottom:20px;line-height:1.55;">Sin inversión inicial. Paga solo por el ahorro que generas.</p>
        <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="priceCurrency" content="COP"/>
          <meta itemprop="price" content="0"/>
          <div style="margin-bottom:16px;">
            <span style="font-size:2.8rem;font-weight:900;color:#0077FF;line-height:1;">$0</span>
            <span style="font-size:.9rem;color:#666;font-weight:600;"> inversión inicial</span>
          </div>
        </div>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:#444;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span> <span><strong>20% de ahorro</strong> en tu factura desde el mes 1</span></li>
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:#444;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span> <span>Instalación en <strong>1 a 3 días h&#225;biles</strong></span></li>
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:#444;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span> <span>Contrato 15 a&#241;os → <strong>sistema 100% tuyo</strong> al final</span></li>
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:#444;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span> <span><strong>Garant&#237;a 25 a&#241;os</strong> en paneles</span></li>
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:#444;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span> <span>Mantenimiento incluido durante el contrato</span></li>
        </ul>
        <div style="background:rgba(0,119,255,.08);border-radius:10px;padding:12px 16px;font-size:.82rem;color:#0077FF;font-weight:600;">
          &#128200; Con factura de ${formatCop(monthlyBill)}/mes → ahorras ≈ <strong>${formatCop(monthlyBill * 0.20)}/mes</strong>
        </div>
      </article>
      <!-- COMPRA PLAN -->
      <article itemscope itemtype="https://schema.org/Product" style="background:linear-gradient(145deg,#0a0e1a,#0d1b3e);border-radius:20px;padding:32px;border:2px solid #0d1b3e;position:relative;overflow:hidden;">
        <div style="width:48px;height:48px;background:rgba(255,255,255,.12);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin-bottom:16px;">&#9728;&#65039;</div>
        <h3 itemprop="name" style="font-size:1.3rem;font-weight:900;color:white;margin-bottom:6px;">Compra Directa</h3>
        <p itemprop="description" style="font-size:.88rem;color:rgba(255,255,255,.65);margin-bottom:20px;line-height:1.55;">Invierte una vez, ahorra para siempre. M&#225;ximo retorno.</p>
        <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="priceCurrency" content="COP"/>
          <div style="margin-bottom:16px;">
            <span style="font-size:2.8rem;font-weight:900;color:#00C2FF;line-height:1;">90<span style="font-size:1.4rem;">%</span></span>
            <span style="font-size:.9rem;color:rgba(255,255,255,.6);font-weight:600;"> ahorro en tu factura</span>
          </div>
        </div>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:rgba(255,255,255,.8);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span> <span><strong>Ahorra hasta el 90%</strong> en tu factura mensual</span></li>
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:rgba(255,255,255,.8);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span> <span><strong>Eres due&#241;o</strong> del sistema desde el d&#237;a 1</span></li>
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:rgba(255,255,255,.8);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span> <span>Amortizaci&#243;n en <strong>4 a 6 a&#241;os</strong></span></li>
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:rgba(255,255,255,.8);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span> <span><strong>Garant&#237;a 25 a&#241;os</strong> en paneles</span></li>
          <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;color:rgba(255,255,255,.8);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span> <span>Incentivos tributarios (Art. 11 Ley 1715)</span></li>
        </ul>
        <div style="background:rgba(0,194,255,.12);border-radius:10px;padding:12px 16px;font-size:.82rem;color:#00C2FF;font-weight:600;">
          &#128200; Con factura de ${formatCop(monthlyBill)}/mes → ahorras ≈ <strong>${formatCop(monthlyBill * 0.90)}/mes</strong>
        </div>
      </article>
    </div>
    <p style="text-align:center;margin-top:20px;font-size:.78rem;color:#aaa;">Proyecci&#243;n basada en consumo promedio. El ahorro real var&#237;a seg&#250;n consumo, irradiaci&#243;n solar y tarifa vigente.</p>
  </div>
</section>

<!-- BENEFITS -->
<section style="padding:88px 24px;background:white;">
  <div class="container">
    <div style="text-align:center;margin-bottom:56px;" class="reveal">
      <div class="badge" style="margin-bottom:14px;">Por qu&#233; ECO</div>
      <h2 style="font-size:2.2rem;font-weight:800;color:#0a0e1a;margin-bottom:12px;letter-spacing:-.02em;">Lo que cambia cuando eliges solar</h2>
      <p style="color:#666;font-size:1.05rem;max-width:540px;margin:0 auto;line-height:1.65;">Todo lo que necesitas para tu independencia energ&#233;tica en Cali.</p>
    </div>
    <div class="benefits-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;">

      <div class="benefit-card reveal" itemprop="hasOfferCatalog" itemscope itemtype="https://schema.org/OfferCatalog" style="padding-left:36px;">
        <div style="width:56px;height:56px;background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin-bottom:22px;box-shadow:0 6px 20px rgba(0,119,255,.3);">&#9889;</div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#0077FF;margin-bottom:8px;">Beneficio 01</div>
        <h3 itemprop="name" style="font-size:1.15rem;font-weight:800;color:#0a0e1a;margin-bottom:12px;line-height:1.3;">${S.benefit_1_title}</h3>
        <p itemprop="description" style="color:#666;font-size:.92rem;line-height:1.7;">${S.benefit_1_desc}</p>
      </div>

      <div class="benefit-card reveal" itemprop="hasOfferCatalog" itemscope itemtype="https://schema.org/OfferCatalog" style="padding-left:36px;transform:translateY(16px);">
        <div style="width:56px;height:56px;background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin-bottom:22px;box-shadow:0 6px 20px rgba(0,119,255,.3);">&#9728;&#65039;</div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#0077FF;margin-bottom:8px;">Beneficio 02</div>
        <h3 itemprop="name" style="font-size:1.15rem;font-weight:800;color:#0a0e1a;margin-bottom:12px;line-height:1.3;">${S.benefit_2_title}</h3>
        <p itemprop="description" style="color:#666;font-size:.92rem;line-height:1.7;">${S.benefit_2_desc}</p>
      </div>

      <div class="benefit-card reveal" itemprop="hasOfferCatalog" itemscope itemtype="https://schema.org/OfferCatalog" style="padding-left:36px;">
        <div style="width:56px;height:56px;background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin-bottom:22px;box-shadow:0 6px 20px rgba(0,119,255,.3);">&#127807;</div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#0077FF;margin-bottom:8px;">Beneficio 03</div>
        <h3 itemprop="name" style="font-size:1.15rem;font-weight:800;color:#0a0e1a;margin-bottom:12px;line-height:1.3;">${S.benefit_3_title}</h3>
        <p itemprop="description" style="color:#666;font-size:.92rem;line-height:1.7;">${S.benefit_3_desc}</p>
      </div>

    </div>

    <!-- CTA mid-page -->
    <div style="text-align:center;margin-top:52px;" class="reveal">
      ${includeForm
        ? `<a href="#cotizar" class="btn-blue">&#128197;&nbsp;Quiero mi cotización GRATIS</a>`
        : `<a href="https://wa.me/${phone.wa}?text=${phoneWaBase}" target="_blank" rel="noopener noreferrer" class="btn-wa"><svg width="18" height="18" viewBox="0 0 24 24" fill="white" style="flex-shrink:0;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>&nbsp;Hablar con un asesor ahora</a>`}
      <p style="margin-top:12px;font-size:.8rem;color:#aaa;">100% gratuito &middot; Sin compromiso &middot; Respuesta en &lt;2 horas</p>
    </div>
  </div>
</section>

<!-- PHOTO GALLERY — real installations & products -->
<section style="padding:80px 24px;background:white;">
  <div class="container">
    <div style="text-align:center;margin-bottom:44px;">
      <div class="badge" style="margin-bottom:14px;">${isPreset || S.landing_type === "ev" || S.landing_type === "alianza" ? "Nuestros vehículos &amp; instalaciones" : "Instalaciones reales en Cali"}</div>
      <h2 style="font-size:2rem;font-weight:800;color:#0a0e1a;margin-bottom:10px;">${isPreset || S.landing_type === "ev" || S.landing_type === "alianza" ? "El combo solar + eléctrico que estás buscando" : "Proyectos que ya están ahorrando en Cali"}</h2>
      <p style="color:#666;font-size:1rem;max-width:560px;margin:0 auto;">${isPreset || S.landing_type === "ev" || S.landing_type === "alianza" ? "Paneles solares ECO más vehículos eléctricos de última generación — todo en una sola solución." : "Cada techo es una oportunidad. Ya llevamos docenas de proyectos en Valle del Cauca."}</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;" class="gallery-grid">
      ${(() => {
        // Use library images if available; pad with Unsplash fallbacks
        const isEvType = isPreset || S.landing_type === "ev" || S.landing_type === "alianza";
        const fallbacks: { src: string; alt: string; caption: string }[] = isEvType ? [
          { src: "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80", alt: "Cargador de carro eléctrico con energía solar ECO en Cali Colombia", caption: "🔌 Carga 100% con energía solar" },
          { src: "https://images.unsplash.com/photo-1617704548623-340376564e68?auto=format&fit=crop&w=800&q=80", alt: "Estación de carga eléctrica moderna carros eléctricos Colombia", caption: "🚗 Carro eléctrico — el futuro ya llegó" },
          { src: "https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80", alt: "Paneles solares ECO instalados techo residencial Cali Colombia", caption: "☀️ Paneles solares ECO en tu techo" },
        ] : [
          { src: "https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=800&q=80", alt: "Instalación paneles solares techo residencial ECO Energy Cali Colombia", caption: "☀️ Instalación residencial — Cali" },
          { src: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80", alt: "Sistema paneles solares fotovoltaicos alta eficiencia ECO Solar Colombia", caption: "⚡ Paneles 645W de alta eficiencia" },
          { src: "https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=800&q=80", alt: "Técnicos certificados ECO instalando sistema solar Valle del Cauca", caption: "🔧 Técnicos RETIE certificados" },
        ];

        const photos = Array.from({ length: 3 }, (_, i) => {
          const lib = galleryImages[i];
          if (lib) return { src: lib.url, alt: lib.alt, caption: lib.caption, isLib: true };
          const fb = fallbacks[i];
          return { src: fb.src, alt: fb.alt, caption: fb.caption, isLib: false };
        });

        return photos.map((p) => `
      <div style="border-radius:20px;overflow:hidden;position:relative;aspect-ratio:4/3;box-shadow:0 8px 28px rgba(0,0,0,.10);background:#e8f0fe;">
        <img src="${p.src}" alt="${h(p.alt)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.style.background='linear-gradient(135deg,#0a0e1a,#0d1b3e)';this.style.display='none'"/>
        <div style="position:absolute;bottom:0;left:0;right:0;padding:14px 16px;background:linear-gradient(to top,rgba(10,14,26,.88),transparent);">
          <span style="color:white;font-size:.82rem;font-weight:700;">${h(p.caption)}</span>
        </div>
      </div>`).join("");
      })()}
    </div>
    <p style="text-align:center;margin-top:24px;font-size:.8rem;color:#bbb;">
      ${galleryImages.length > 0 ? `Imágenes del portafolio ECO &mdash;` : `Fotos referenciales &mdash;`}
      <a href="https://eco-col.com" style="color:#0077FF;text-decoration:none;">Ver más proyectos en eco-col.com</a>
    </p>
  </div>
</section>

<!-- SAVINGS CHART -->
<section style="padding:80px 24px;background:white;border-top:1px solid #f0f4ff;">
  <div class="container" style="max-width:860px;">
    <div style="text-align:center;margin-bottom:44px;">
      <div class="badge" style="margin-bottom:14px;">Tu ahorro en n&#250;meros</div>
      <h2 style="font-size:2rem;font-weight:800;color:#0a0e1a;margin-bottom:10px;">Qu&#233; pasa con tu factura en los pr&#243;ximos 10 a&#241;os</h2>
      <p style="color:#666;font-size:1rem;">Proyecci&#243;n con incremento anual del 6% (promedio hist&#243;rico Colombia).</p>
    </div>
    <div style="background:#f8faff;border-radius:20px;padding:32px;border:1px solid #e8f0fe;">
      <canvas id="savingsChart" style="width:100%;max-height:340px;"></canvas>
      <div style="display:flex;justify-content:center;gap:28px;margin-top:20px;flex-wrap:wrap;font-size:.82rem;font-weight:600;">
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:16px;height:4px;background:#dc3545;display:inline-block;border-radius:2px;"></span>Sin solar (con aumentos)</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:16px;height:4px;background:#0077FF;display:inline-block;border-radius:2px;"></span>Con PPA ECO (20% ahorro)</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:16px;height:4px;background:#00C2FF;display:inline-block;border-radius:2px;"></span>Con Compra Directa (~90% ahorro)</span>
      </div>
    </div>
    <p style="text-align:center;margin-top:16px;font-size:.8rem;color:#999;">Proyecci&#243;n estimada basada en tarifa promedio colombiana. Resultados reales var&#237;an seg&#250;n consumo y ubicaci&#243;n.</p>
  </div>
</section>

<!-- MINI-CALCULATOR -->
<section style="padding:72px 24px;background:linear-gradient(135deg,#f0f8ff 0%,#e8f0fe 100%);">
  <div class="container" style="max-width:720px;">
    <div style="text-align:center;margin-bottom:36px;">
      <div class="badge" style="margin-bottom:14px;">Calculadora r&#225;pida</div>
      <h2 style="font-size:2rem;font-weight:800;color:#0a0e1a;margin-bottom:10px;">&#191;Cu&#225;nto ahorras t&#250; con solar?</h2>
      <p style="color:#666;font-size:1rem;">Ingresa tu factura mensual y ve tu ahorro al instante.</p>
    </div>
    <div style="background:white;border-radius:20px;padding:36px;box-shadow:0 4px 24px rgba(0,119,255,.08);border:1px solid #ddeeff;">
      <label style="font-size:.85rem;font-weight:700;color:#333;display:block;margin-bottom:8px;">Valor de tu factura de energ&#237;a mensual (COP):</label>
      <div class="calc-row" style="display:flex;align-items:center;gap:12px;">
        <input id="calc-input" type="number" min="50000" max="50000000" placeholder="Ej: 350000" oninput="calcSavings()" style="flex:1;padding:14px 16px;border:2px solid #dde;border-radius:10px;font-size:1.05rem;font-family:'Poppins',sans-serif;outline:none;transition:border-color .2s;" onfocus="this.style.borderColor='#0077FF'" onblur="this.style.borderColor='#dde'"/>
        <span style="font-size:.9rem;color:#666;font-weight:600;white-space:nowrap;">/ mes</span>
      </div>
      <div id="calc-results" style="display:none;margin-top:24px;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:14px;padding:20px;text-align:center;color:white;">
          <div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;opacity:.85;">Con PPA (sin inversión)</div>
          <div id="calc-ppa" style="font-size:1.6rem;font-weight:900;line-height:1.1;">$0</div>
          <div style="font-size:.75rem;margin-top:4px;opacity:.8;">ahorro/mes</div>
        </div>
        <div style="background:linear-gradient(135deg,#0a0e1a,#0d1b3e);border-radius:14px;padding:20px;text-align:center;color:white;">
          <div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;opacity:.85;">Con Compra Directa</div>
          <div id="calc-compra" style="font-size:1.6rem;font-weight:900;line-height:1.1;">$0</div>
          <div style="font-size:.75rem;margin-top:4px;opacity:.8;">ahorro estimado/mes</div>
        </div>
      </div>
      <div id="calc-cta" style="display:none;margin-top:20px;text-align:center;">
        <a id="calc-wa-link" href="https://wa.me/${phone.wa}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,#0077FF,#00C2FF);color:white;font-weight:800;font-size:1rem;padding:14px 32px;border-radius:50px;text-decoration:none;box-shadow:0 6px 20px rgba(0,119,255,.3);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Hablar con un asesor — WhatsApp
        </a>
        <p style="margin-top:12px;font-size:.78rem;color:#999;">Respuesta en menos de 24h &middot; Gratis &middot; Sin compromisos</p>
      </div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section style="padding:88px 24px;background:linear-gradient(180deg,#f8faff 0%,white 100%);">
  <div class="container" style="max-width:820px;">
    <div style="text-align:center;margin-bottom:56px;" class="reveal">
      <div class="badge" style="margin-bottom:14px;">El proceso</div>
      <h2 style="font-size:2.2rem;font-weight:800;color:#0a0e1a;margin-bottom:10px;letter-spacing:-.02em;">C&#243;mo funciona con ECO</h2>
      <p style="color:#666;font-size:1rem;max-width:480px;margin:0 auto;">Tres pasos simples y empiezas a ahorrar desde el primer mes.</p>
    </div>

    <div class="steps-grid" style="display:flex;flex-direction:column;gap:0;">

      <div class="reveal" style="display:flex;align-items:flex-start;gap:24px;position:relative;">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
          <div class="step-num" style="z-index:1;">1</div>
          <div class="step-connector"></div>
        </div>
        <div class="step-card" style="flex:1;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#0077FF;background:rgba(0,119,255,.08);padding:4px 10px;border-radius:50px;">Paso 1</div>
          </div>
          <h3 style="font-size:1.15rem;font-weight:800;color:#0a0e1a;margin-bottom:8px;line-height:1.3;">${S.how_step_1}</h3>
          <p style="color:#666;font-size:.93rem;line-height:1.7;">${S.how_step_1_desc}</p>
        </div>
      </div>

      <div class="reveal" style="display:flex;align-items:flex-start;gap:24px;position:relative;">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
          <div class="step-num" style="z-index:1;">2</div>
          <div class="step-connector"></div>
        </div>
        <div class="step-card" style="flex:1;margin-bottom:8px;border-left:3px solid #0077FF;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#0077FF;background:rgba(0,119,255,.08);padding:4px 10px;border-radius:50px;">Paso 2</div>
          </div>
          <h3 style="font-size:1.15rem;font-weight:800;color:#0a0e1a;margin-bottom:8px;line-height:1.3;">${S.how_step_2}</h3>
          <p style="color:#666;font-size:.93rem;line-height:1.7;">${S.how_step_2_desc}</p>
        </div>
      </div>

      <div class="reveal" style="display:flex;align-items:flex-start;gap:24px;">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
          <div class="step-num pulse-dot" style="z-index:1;background:linear-gradient(135deg,#22c55e,#16a34a);">3</div>
        </div>
        <div class="step-card" style="flex:1;border:2px solid rgba(34,197,94,.3);background:linear-gradient(135deg,#f0fdf4,#dcfce7);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#16a34a;background:rgba(34,197,94,.12);padding:4px 10px;border-radius:50px;">Paso 3 &#127881;</div>
          </div>
          <h3 style="font-size:1.15rem;font-weight:800;color:#0a0e1a;margin-bottom:8px;line-height:1.3;">${S.how_step_3}</h3>
          <p style="color:#555;font-size:.93rem;line-height:1.7;">${S.how_step_3_desc}</p>
        </div>
      </div>

    </div>

    <!-- Time estimate -->
    <div class="reveal" style="margin-top:36px;background:#0a0e1a;border-radius:16px;padding:20px 28px;display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;">
      <div style="text-align:center;">
        <div style="font-size:1.8rem;font-weight:900;background:linear-gradient(135deg,#0077FF,#00C2FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">1&ndash;3</div>
        <div style="font-size:.75rem;color:rgba(255,255,255,.6);font-weight:600;text-transform:uppercase;letter-spacing:.06em;">días hábiles</div>
      </div>
      <div style="width:1px;height:44px;background:rgba(255,255,255,.1);"></div>
      <div style="color:rgba(255,255,255,.7);font-size:.92rem;max-width:400px;">Desde la visita técnica hasta tu primer día con energía solar activa.</div>
      <div style="margin-left:auto;">
        ${includeForm
          ? `<a href="#cotizar" class="btn-blue" style="padding:12px 24px;font-size:.88rem;">&#128197;&nbsp;Agendar visita GRATIS</a>`
          : `<a href="https://wa.me/${phone.wa}" target="_blank" rel="noopener noreferrer" class="btn-wa" style="padding:12px 24px;font-size:.88rem;">&#128172;&nbsp;Agendar por WhatsApp</a>`}
      </div>
    </div>

  </div>
</section>

<!-- TESTIMONIALS -->
<section aria-label="Testimonios de clientes ECO Solar Cali" style="padding:88px 24px;background:linear-gradient(180deg,#0a0e1a 0%,#0d1b3e 100%);">
  <div class="container">
    <div style="text-align:center;margin-bottom:52px;" class="reveal">
      <div class="badge badge-white" style="margin-bottom:14px;">Lo que dicen nuestros clientes</div>
      <h2 style="font-size:2.1rem;font-weight:800;color:white;margin-bottom:10px;letter-spacing:-.02em;">Experiencias reales de clientes en Cali</h2>
      <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:12px;">
        <span style="color:#f59e0b;font-size:1.2rem;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
        <span style="color:rgba(255,255,255,.7);font-size:.9rem;font-weight:600;">4.9 / 5 &mdash; 87 reseñas verificadas</span>
      </div>
    </div>

    <div class="testi-grid reveal" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:960px;margin:0 auto;">

      <div class="testimonial-card" itemscope itemtype="https://schema.org/Review" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);">
        <div itemprop="reviewRating" itemscope itemtype="https://schema.org/Rating" style="color:#f59e0b;font-size:1.15rem;margin-bottom:16px;letter-spacing:2px;">
          <meta itemprop="ratingValue" content="5"/>&#9733;&#9733;&#9733;&#9733;&#9733;
        </div>
        <p itemprop="reviewBody" style="font-size:1rem;color:rgba(255,255,255,.82);line-height:1.75;font-style:italic;margin-bottom:24px;">&ldquo;${S.social_proof}&rdquo;</p>
        <div style="display:flex;align-items:center;gap:14px;" itemprop="author" itemscope itemtype="https://schema.org/Person">
          <div style="width:46px;height:46px;background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:1rem;flex-shrink:0;box-shadow:0 4px 14px rgba(0,119,255,.4);">
            ${S.social_proof_name ? S.social_proof_name.charAt(0).toUpperCase() : "C"}
          </div>
          <div>
            <div itemprop="name" style="font-weight:700;font-size:.92rem;color:white;">${S.social_proof_name || "Cliente ECO"}</div>
            <div style="font-size:.78rem;color:rgba(255,255,255,.5);">${S.social_proof_role || "Cali, Valle del Cauca"} &middot; Cliente verificado</div>
          </div>
        </div>
      </div>

      <div class="testimonial-card" itemscope itemtype="https://schema.org/Review" style="background:rgba(0,119,255,.08);border:1px solid rgba(0,119,255,.25);">
        <div itemprop="reviewRating" itemscope itemtype="https://schema.org/Rating" style="color:#f59e0b;font-size:1.15rem;margin-bottom:16px;letter-spacing:2px;">
          <meta itemprop="ratingValue" content="5"/>&#9733;&#9733;&#9733;&#9733;&#9733;
        </div>
        <p itemprop="reviewBody" style="font-size:1rem;color:rgba(255,255,255,.82);line-height:1.75;font-style:italic;margin-bottom:24px;">&ldquo;${S.social_proof_2 || "Excelente servicio de ECO. La instalación fue rápida y profesional, y el ahorro en mi factura es real desde el primer mes. 100% recomendados."}&rdquo;</p>
        <div style="display:flex;align-items:center;gap:14px;" itemprop="author" itemscope itemtype="https://schema.org/Person">
          <div style="width:46px;height:46px;background:linear-gradient(135deg,#00C2FF,#0077FF);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:1rem;flex-shrink:0;box-shadow:0 4px 14px rgba(0,194,255,.35);">
            ${S.social_proof_2_name ? S.social_proof_2_name.charAt(0).toUpperCase() : "M"}
          </div>
          <div>
            <div itemprop="name" style="font-weight:700;font-size:.92rem;color:white;">${S.social_proof_2_name || "Cliente ECO"}</div>
            <div style="font-size:.78rem;color:rgba(255,255,255,.5);">${S.social_proof_2_role || "Cali, Colombia"} &middot; Cliente verificado</div>
          </div>
        </div>
      </div>

    </div>

    <!-- Trust badges row -->
    <div class="reveal" style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:52px;">
      <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:12px 20px;border-radius:50px;font-size:.8rem;font-weight:600;color:rgba(255,255,255,.7);">&#9989;&nbsp;Empresa registrada en Cali</div>
      <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:12px 20px;border-radius:50px;font-size:.8rem;font-weight:600;color:rgba(255,255,255,.7);">&#9989;&nbsp;T&#233;cnicos certificados RETIE</div>
      <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:12px 20px;border-radius:50px;font-size:.8rem;font-weight:600;color:rgba(255,255,255,.7);">&#9989;&nbsp;Garant&#237;a 25 a&#241;os en paneles</div>
      <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:12px 20px;border-radius:50px;font-size:.8rem;font-weight:600;color:rgba(255,255,255,.7);">&#9989;&nbsp;Soporte postventa incluido</div>
    </div>

  </div>
</section>

${(isPreset || S.landing_type === "ev" || S.landing_type === "alianza") ? `
<!-- VEHICLES SECTION -->
<section id="vehiculos" aria-label="Vehículos eléctricos Deepal disponibles en Cali" style="padding:80px 24px;background:#f8faff;border-top:4px solid #0077FF;">
  <div class="container" style="max-width:1100px;">
    <div style="text-align:center;margin-bottom:52px;">
      <div class="badge" style="margin-bottom:14px;">&#128652; Vehículos disponibles en Cali</div>
      <h2 style="font-size:2.2rem;font-weight:900;color:#0a0e1a;margin-bottom:12px;">Los mejores carros eléctricos — directo de fábrica</h2>
      <p style="color:#444;font-size:1.05rem;max-width:640px;margin:0 auto;">Importamos directamente desde China, sin intermediarios. Tú ahorras entre <strong style="color:#0077FF;">$35M y $60M</strong> comparado con cualquier concesionario en Colombia. Matrícula incluida.</p>
    </div>

    <!-- Car cards grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:48px;" class="testi-grid">

      <!-- Deepal S05 -->
      <article itemscope itemtype="https://schema.org/Product" style="background:white;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,119,255,.12);border:2px solid #e8f0fe;position:relative;">
        <div style="position:absolute;top:16px;left:16px;background:linear-gradient(135deg,#0077FF,#00C2FF);color:white;font-size:.7rem;font-weight:800;padding:5px 14px;border-radius:50px;letter-spacing:.05em;z-index:1;">MÁS VENDIDO</div>
        <!-- Car visual -->
        <div style="background:linear-gradient(135deg,#0a0e1a 0%,#0d1b3e 100%);height:180px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 50%,rgba(0,119,255,.3),transparent 65%);"></div>
          <div style="text-align:center;z-index:1;">
            <div style="font-size:4rem;line-height:1;margin-bottom:6px;">&#128652;</div>
            <div style="color:white;font-size:.78rem;font-weight:700;letter-spacing:.08em;opacity:.7;">DEEPAL S05 ULTRA 620</div>
          </div>
        </div>
        <div style="padding:28px;">
          <h3 itemprop="name" style="font-size:1.4rem;font-weight:900;color:#0a0e1a;margin-bottom:4px;">Deepal S05 Ultra 620</h3>
          <p style="font-size:.85rem;color:#666;margin-bottom:20px;">Sedán eléctrico · 620 km autonomía (CLTC) · Batería CATL 66 kWh</p>

          <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
            <div>
              <div style="font-size:.72rem;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Precio ECO (incl. matrícula)</div>
              <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
                <meta itemprop="priceCurrency" content="COP"/>
                <meta itemprop="price" content="108000000"/>
                <span style="font-size:2.4rem;font-weight:900;color:#0077FF;line-height:1.1;">$108M</span>
              </div>
            </div>
            <div style="background:#fff0f0;border-radius:10px;padding:8px 12px;text-align:center;">
              <div style="font-size:.68rem;color:#e55;font-weight:700;text-decoration:line-through;">$143M concesionario</div>
              <div style="font-size:.78rem;color:#c00;font-weight:800;">&#10134; Ahorras $35M</div>
            </div>
          </div>

          <ul style="list-style:none;display:flex;flex-direction:column;gap:9px;margin-bottom:24px;">
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:#333;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span><span><strong>620 km</strong> de autonomía real (CLTC)</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:#333;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span><span>Carga rápida DC: <strong>80% en 30 min</strong></span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:#333;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span><span>Asistente de conducción <strong>L2 ADAS</strong> completo</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:#333;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span><span>Pantalla 15.6" · Cámara 360° · Sunroof</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:#333;"><span style="color:#0077FF;font-weight:900;flex-shrink:0;">✓</span><span>Matrícula incluida · Sin aranceles ocultos</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:#aaa;"><span style="color:#aaa;font-weight:900;flex-shrink:0;">+</span><span>Garantía 2 años bono opcional <strong style="color:#555;">+$5.4M</strong></span></li>
          </ul>

          <div style="background:#f0f7ff;border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:.82rem;color:#0077FF;font-weight:600;">
            &#9889; Con paneles ECO lo cargas <strong>GRATIS</strong> — $0 en gasolina para siempre
          </div>

          <a href="#cotizar" style="display:block;text-align:center;background:linear-gradient(135deg,#0077FF,#00C2FF);color:white;text-decoration:none;padding:14px 24px;border-radius:50px;font-weight:800;font-size:.92rem;transition:opacity .15s;" onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
            Quiero el S05 — Cotizar ahora
          </a>
        </div>
      </article>

      <!-- Deepal S07 -->
      <article itemscope itemtype="https://schema.org/Product" style="background:linear-gradient(180deg,#0a0e1a 0%,#0d1b3e 100%);border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,119,255,.20);border:2px solid #0077FF;position:relative;">
        <div style="position:absolute;top:16px;left:16px;background:linear-gradient(135deg,#f59e0b,#f97316);color:white;font-size:.7rem;font-weight:800;padding:5px 14px;border-radius:50px;letter-spacing:.05em;z-index:1;">HUAWEI ADS 2.0</div>
        <!-- Car visual -->
        <div style="background:linear-gradient(135deg,#060a14 0%,#0a1428 100%);height:180px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;background:radial-gradient(circle at 70% 50%,rgba(0,194,255,.25),transparent 65%);"></div>
          <div style="text-align:center;z-index:1;">
            <div style="font-size:4rem;line-height:1;margin-bottom:6px;">&#128663;</div>
            <div style="color:rgba(255,255,255,.6);font-size:.78rem;font-weight:700;letter-spacing:.08em;">DEEPAL S07 ULTRA 630</div>
          </div>
        </div>
        <div style="padding:28px;">
          <h3 itemprop="name" style="font-size:1.4rem;font-weight:900;color:white;margin-bottom:4px;">Deepal S07 Ultra 630</h3>
          <p style="font-size:.85rem;color:rgba(255,255,255,.55);margin-bottom:20px;">SUV eléctrico · 630 km autonomía (CLTC) · Huawei ADS 2.0 semi-autónomo</p>

          <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
            <div>
              <div style="font-size:.72rem;color:rgba(255,255,255,.45);font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Precio ECO (incl. matrícula)</div>
              <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
                <meta itemprop="priceCurrency" content="COP"/>
                <meta itemprop="price" content="120000000"/>
                <span style="font-size:2.4rem;font-weight:900;color:#00C2FF;line-height:1.1;">$120M</span>
              </div>
            </div>
            <div style="background:rgba(255,60,60,.15);border:1px solid rgba(255,60,60,.3);border-radius:10px;padding:8px 12px;text-align:center;">
              <div style="font-size:.68rem;color:rgba(255,150,150,.9);font-weight:700;text-decoration:line-through;">$180M+ concesionario</div>
              <div style="font-size:.78rem;color:#ff9090;font-weight:800;">&#10134; Ahorras $60M</div>
            </div>
          </div>

          <ul style="list-style:none;display:flex;flex-direction:column;gap:9px;margin-bottom:24px;">
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:rgba(255,255,255,.85);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span><span><strong>630 km</strong> de autonomía real (CLTC)</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:rgba(255,255,255,.85);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span><span><strong>Huawei ADS 2.0</strong> — conducción semi-autónoma</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:rgba(255,255,255,.85);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span><span>SUV compacto · 5 puestos · Portón eléctrico</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:rgba(255,255,255,.85);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span><span>Carga rápida DC · Pantalla 15.6" · Cámara 360°</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:rgba(255,255,255,.85);"><span style="color:#00C2FF;font-weight:900;flex-shrink:0;">✓</span><span>Matrícula incluida · Sin aranceles ocultos</span></li>
            <li style="display:flex;gap:9px;align-items:flex-start;font-size:.86rem;color:rgba(255,255,255,.45);"><span style="color:rgba(255,255,255,.3);font-weight:900;flex-shrink:0;">+</span><span>Garantía 2 años bono opcional <strong style="color:rgba(255,255,255,.7);">+$6M</strong></span></li>
          </ul>

          <div style="background:rgba(0,194,255,.12);border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:.82rem;color:#00C2FF;font-weight:600;">
            &#9889; Con paneles ECO lo cargas <strong>GRATIS</strong> — $0 en gasolina para siempre
          </div>

          <a href="#cotizar" style="display:block;text-align:center;background:linear-gradient(135deg,#00C2FF,#0077FF);color:white;text-decoration:none;padding:14px 24px;border-radius:50px;font-weight:800;font-size:.92rem;transition:opacity .15s;" onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
            Quiero el S07 — Cotizar ahora
          </a>
        </div>
      </article>
    </div>

    <!-- Comparison table -->
    <div style="background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07);border:1px solid #e8f0fe;margin-bottom:28px;">
      <div style="background:linear-gradient(135deg,#0a0e1a,#0d1b3e);padding:20px 28px;">
        <h3 style="color:white;font-size:1.1rem;font-weight:800;margin:0;">📊 Comparativa de precios — ECO vs concesionario</h3>
        <p style="color:rgba(255,255,255,.5);font-size:.8rem;margin:4px 0 0;">Precios en millones de pesos colombianos. Matrícula incluida en precios ECO.</p>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:.88rem;" itemscope itemtype="https://schema.org/Table">
          <caption style="display:none;">Comparativa de precios Deepal S05 y S07 con ECO vs concesionario en Colombia</caption>
          <thead>
            <tr style="background:#f0f7ff;">
              <th style="padding:14px 20px;text-align:left;font-weight:800;color:#0a0e1a;border-bottom:2px solid #e8f0fe;">Modelo</th>
              <th style="padding:14px 20px;text-align:center;font-weight:800;color:#0077FF;border-bottom:2px solid #e8f0fe;">Precio ECO ✓</th>
              <th style="padding:14px 20px;text-align:center;font-weight:800;color:#999;border-bottom:2px solid #e8f0fe;">Concesionario</th>
              <th style="padding:14px 20px;text-align:center;font-weight:800;color:#0a0e1a;border-bottom:2px solid #e8f0fe;">Tu ahorro</th>
              <th style="padding:14px 20px;text-align:center;font-weight:800;color:#0a0e1a;border-bottom:2px solid #e8f0fe;">Autonomía</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:16px 20px;font-weight:700;color:#0a0e1a;">Deepal S05 Ultra 620<br/><span style="font-size:.75rem;color:#888;font-weight:400;">Sedán · Batería CATL</span></td>
              <td style="padding:16px 20px;text-align:center;font-weight:900;color:#0077FF;font-size:1.1rem;">$108M</td>
              <td style="padding:16px 20px;text-align:center;color:#999;text-decoration:line-through;">~$143M</td>
              <td style="padding:16px 20px;text-align:center;"><span style="background:#e8f5e9;color:#2e7d32;font-weight:800;padding:4px 12px;border-radius:50px;font-size:.85rem;">✓ $35M</span></td>
              <td style="padding:16px 20px;text-align:center;color:#555;font-weight:600;">620 km</td>
            </tr>
            <tr style="background:#f8faff;">
              <td style="padding:16px 20px;font-weight:700;color:#0a0e1a;">Deepal S07 Ultra 630<br/><span style="font-size:.75rem;color:#888;font-weight:400;">SUV · Huawei ADS 2.0</span></td>
              <td style="padding:16px 20px;text-align:center;font-weight:900;color:#0077FF;font-size:1.1rem;">$120M</td>
              <td style="padding:16px 20px;text-align:center;color:#999;text-decoration:line-through;">~$180M+imp.</td>
              <td style="padding:16px 20px;text-align:center;"><span style="background:#e8f5e9;color:#2e7d32;font-weight:800;padding:4px 12px;border-radius:50px;font-size:.85rem;">✓ $60M</span></td>
              <td style="padding:16px 20px;text-align:center;color:#555;font-weight:600;">630 km</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="padding:14px 20px;background:#fff8e1;border-top:1px solid #ffe082;font-size:.78rem;color:#7b6000;">
        ⚠️ Precios del concesionario son referenciales. Precio ECO incluye matrícula en Colombia. Garantía opcional 2 años: +$5.4M (S05) o +$6M (S07).
      </div>
    </div>

    <!-- Bottom CTA strip -->
    <div style="background:linear-gradient(135deg,#0077FF,#00C2FF);border-radius:20px;padding:32px 36px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;">
      <div>
        <div style="color:white;font-size:1.2rem;font-weight:900;margin-bottom:6px;">¿Cuál Deepal te interesa?</div>
        <div style="color:rgba(255,255,255,.82);font-size:.9rem;">Cuéntanoslo y un asesor ECO te llama en menos de 2 horas con tu precio definitivo.</div>
      </div>
      <a href="#cotizar" style="background:white;color:#0077FF;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:800;font-size:.95rem;white-space:nowrap;transition:opacity .15s;" onmouseover="this.style.opacity='.9'" onmouseout="this.style.opacity='1'">
        Cotizar mi Deepal &#8594;
      </a>
    </div>
  </div>
</section>` : ""}

<!-- FAQ -->
${sections.faq_1_q ? `
<section id="faq-section" aria-label="Preguntas frecuentes sobre energía solar ECO Cali" itemscope itemtype="https://schema.org/FAQPage" style="padding:72px 24px;background:white;">
  <div class="container" style="max-width:760px;">
    <div style="text-align:center;margin-bottom:44px;">
      <div class="badge" style="margin-bottom:14px;">Preguntas frecuentes</div>
      <h2 style="font-size:2rem;font-weight:800;color:#0a0e1a;">Resolvemos tus dudas sobre paneles solares en Cali</h2>
    </div>
    <div style="border-top:1px solid #e8f0fe;">
      ${sections.faq_1_q ? `<div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question"><button class="faq-btn" onclick="toggleFaq(this)" aria-expanded="false"><span itemprop="name">${S.faq_1_q || ""}</span><span class="faq-icon" style="font-size:1.3rem;color:#0077FF;transition:transform .2s;">+</span></button><div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer"><span itemprop="text">${S.faq_1_a || ""}</span></div></div>` : ""}
      ${sections.faq_2_q ? `<div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question"><button class="faq-btn" onclick="toggleFaq(this)" aria-expanded="false"><span itemprop="name">${S.faq_2_q || ""}</span><span class="faq-icon" style="font-size:1.3rem;color:#0077FF;transition:transform .2s;">+</span></button><div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer"><span itemprop="text">${S.faq_2_a || ""}</span></div></div>` : ""}
      ${sections.faq_3_q ? `<div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question"><button class="faq-btn" onclick="toggleFaq(this)" aria-expanded="false"><span itemprop="name">${S.faq_3_q || ""}</span><span class="faq-icon" style="font-size:1.3rem;color:#0077FF;transition:transform .2s;">+</span></button><div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer"><span itemprop="text">${S.faq_3_a || ""}</span></div></div>` : ""}
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question"><button class="faq-btn" onclick="toggleFaq(this)" aria-expanded="false"><span itemprop="name">&#191;C&#243;mo simulo mi ahorro exacto en Cali?</span><span class="faq-icon" style="font-size:1.3rem;color:#0077FF;transition:transform .2s;">+</span></button><div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer"><span itemprop="text">Ve a <a href="https://eco-col.com/simuladores/" style="color:#0077FF;font-weight:600;">eco-col.com/simuladores</a> y en 30 segundos obtienes el c&#225;lculo personalizado seg&#250;n tu consumo real. Es 100% gratis y sin compromisos.</span></div></div>
    </div>
  </div>
</section>` : ""}

${formHtml}

</main><!-- end #main-content -->

<!-- FOOTER -->
<footer style="background:#0a0e1a;padding:48px 24px 32px;">
  <div class="container">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;margin-bottom:40px;flex-wrap:wrap;" class="footer-grid">
      <div>
        <div style="font-size:1.2rem;font-weight:900;color:white;margin-bottom:10px;">ECO &#9889;</div>
        <div style="font-size:.82rem;color:rgba(255,255,255,.5);line-height:1.7;">Energy Capital Operation<br/>Cali, Valle del Cauca, Colombia</div>
        <div style="margin-top:16px;display:flex;gap:10px;">
          <a href="https://www.instagram.com/eco.sas" target="_blank" rel="noopener noreferrer" style="width:36px;height:36px;background:rgba(255,255,255,.08);border-radius:8px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:1rem;color:white;transition:background .15s;" onmouseover="this.style.background='rgba(255,255,255,.18)'" onmouseout="this.style.background='rgba(255,255,255,.08)'">&#128247;</a>
          <a href="https://www.tiktok.com/@eco.col" target="_blank" rel="noopener noreferrer" style="width:36px;height:36px;background:rgba(255,255,255,.08);border-radius:8px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:1rem;color:white;transition:background .15s;" onmouseover="this.style.background='rgba(255,255,255,.18)'" onmouseout="this.style.background='rgba(255,255,255,.08)'">&#127926;</a>
          <a href="https://wa.me/${phone.wa}" target="_blank" rel="noopener noreferrer" style="width:36px;height:36px;background:rgba(37,211,102,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:1rem;color:#25D366;transition:background .15s;" onmouseover="this.style.background='rgba(37,211,102,.28)'" onmouseout="this.style.background='rgba(37,211,102,.15)'">&#128172;</a>
        </div>
      </div>
      <div>
        <div style="font-size:.85rem;font-weight:700;color:white;margin-bottom:14px;text-transform:uppercase;letter-spacing:.06em;">Contacto</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <a href="tel:${phone.tel}" style="font-size:.85rem;color:rgba(255,255,255,.6);text-decoration:none;display:flex;align-items:center;gap:8px;transition:color .15s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,.6)'">&#9742;&#65039; ${phone.display}</a>
          <a href="https://wa.me/${phone.wa}" target="_blank" rel="noopener noreferrer" style="font-size:.85rem;color:rgba(255,255,255,.6);text-decoration:none;display:flex;align-items:center;gap:8px;transition:color .15s;" onmouseover="this.style.color='#25D366'" onmouseout="this.style.color='rgba(255,255,255,.6)'">&#128172; WhatsApp</a>
          <a href="mailto:contacto@eco-col.com" style="font-size:.85rem;color:rgba(255,255,255,.6);text-decoration:none;display:flex;align-items:center;gap:8px;transition:color .15s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,.6)'">&#9993;&#65039; contacto@eco-col.com</a>
          <a href="https://eco-col.com" target="_blank" rel="noopener noreferrer" style="font-size:.85rem;color:rgba(255,255,255,.6);text-decoration:none;display:flex;align-items:center;gap:8px;transition:color .15s;" onmouseover="this.style.color='#00C2FF'" onmouseout="this.style.color='rgba(255,255,255,.6)'">&#127758; eco-col.com</a>
        </div>
      </div>
      <div>
        <div style="font-size:.85rem;font-weight:700;color:white;margin-bottom:14px;text-transform:uppercase;letter-spacing:.06em;">&#193;rea de servicio</div>
        <div style="font-size:.82rem;color:rgba(255,255,255,.5);line-height:1.85;">Cali &middot; Yumbo &middot; Jamund&#237; &middot; Candelaria<br/>Puerto Tejada &middot; Florida &middot; Pradera<br/>La Cumbre &middot; Dagua<br/><span style="color:rgba(255,255,255,.3);font-size:.78rem;">(radio 20 km de Cali)</span></div>
      </div>
    </div>
    <!-- Map section -->
    <div style="margin-bottom:32px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08);">
      <div style="background:rgba(255,255,255,.04);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <span style="color:rgba(255,255,255,.6);font-size:.8rem;font-weight:600;">&#128205; ECO &mdash; Cali, Valle del Cauca, Colombia</span>
        <a href="https://www.google.com/maps/search/Cali,+Valle+del+Cauca,+Colombia" target="_blank" rel="noopener noreferrer" style="font-size:.75rem;color:#00C2FF;text-decoration:none;font-weight:600;white-space:nowrap;">Ver en Google Maps &#8599;</a>
      </div>
      <iframe
        title="Mapa ECO Cali"
        src="https://www.openstreetmap.org/export/embed.html?bbox=-76.6420%2C3.3516%2C-76.4220%2C3.5516&amp;layer=mapnik&amp;marker=3.4516%2C-76.5320"
        style="width:100%;height:200px;border:0;display:block;opacity:.75;"
        loading="lazy"
        referrerpolicy="no-referrer"
      ></iframe>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:24px;text-align:center;">
      <p style="color:rgba(255,255,255,.35);font-size:.8rem;">&#169; 2025 ECO — Energy Capital Operation &middot; Cali, Colombia</p>
      <p style="color:#00C2FF;font-size:.82rem;font-weight:700;margin-top:6px;">Cali pone el sol, &#161;ECO la soluci&#243;n! &#9728;&#65039;</p>
    </div>
  </div>
</section>

<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script>
// SAVINGS CHART
(function() {
  var data = ${chartDataJson};
  var ctx = document.getElementById('savingsChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels.map(function(y) { return 'A\\u00f1o ' + y; }),
      datasets: [
        {
          label: 'Sin solar',
          data: data.sinSolar,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220,53,69,.08)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          label: 'Con PPA ECO (20% ahorro)',
          data: data.conPpa,
          borderColor: '#0077FF',
          backgroundColor: 'rgba(0,119,255,.08)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          label: 'Con Compra Directa (~90% ahorro)',
          data: data.conCompra,
          borderColor: '#00C2FF',
          backgroundColor: 'rgba(0,194,255,.08)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var v = ctx.parsed.y;
              return ctx.dataset.label + ': $' + Math.round(v).toLocaleString('es-CO');
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: function(v) {
              if (v >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M';
              return '$' + Math.round(v/1000) + 'k';
            },
            font: { size: 11 }
          },
          grid: { color: 'rgba(0,0,0,.05)' }
        },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
})();

// MINI-CALCULATOR
function calcSavings() {
  var input = document.getElementById('calc-input');
  var val = parseFloat(input.value);
  if (!val || val < 50000) {
    document.getElementById('calc-results').style.display = 'none';
    document.getElementById('calc-cta').style.display = 'none';
    return;
  }
  var ppaSaving = Math.round(val * 0.20);
  var compraSaving = Math.round(val * 0.85);
  function fmt(n) { return '$' + n.toLocaleString('es-CO'); }
  document.getElementById('calc-ppa').textContent = fmt(ppaSaving);
  document.getElementById('calc-compra').textContent = fmt(compraSaving);
  document.getElementById('calc-results').style.display = 'grid';
  var msg = encodeURIComponent('Hola ECO, tengo una factura de $' + Math.round(val).toLocaleString('es-CO') + '/mes y quiero saber cuánto ahorro con paneles solares.');
  document.getElementById('calc-wa-link').href = 'https://wa.me/${phone.wa}?text=' + msg;
  document.getElementById('calc-cta').style.display = 'block';
}

// FAQ ACCORDION
function toggleFaq(btn) {
  var answer = btn.nextElementSibling;
  var icon = btn.querySelector('.faq-icon');
  var isOpen = answer.classList.contains('open');
  // Close all
  document.querySelectorAll('.faq-answer').forEach(function(el) { el.classList.remove('open'); });
  document.querySelectorAll('.faq-icon').forEach(function(el) { el.textContent = '+'; el.style.transform = ''; });
  if (!isOpen) {
    answer.classList.add('open');
    icon.textContent = '\\u2212';
    icon.style.transform = 'rotate(180deg)';
  }
}

// Scroll animations
if ('IntersectionObserver' in window) {
  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) { if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.benefit-card, .testimonial-card').forEach(function(el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity .5s ease, transform .5s ease';
    io.observe(el);
  });
}
</script>

</body>
</html>`;
}

// ── AI copy generation ───────────────────────────────────────────────────────
async function generateLandingCopy(title: string, description: string, ctaText: string): Promise<LandingSections> {
  const prompt = `Eres el copywriter de ECO — Energy Capital Operation, empresa de energía solar y carros eléctricos en Cali, Colombia.

Genera el contenido para una landing page con los siguientes datos:
- Título: ${title}
- Descripción del proyecto/alianza: ${description}
- CTA principal: ${ctaText}

Contexto de ECO: empresa rebelde de energía solar en Cali. Instala paneles solares (PPA o compra directa) y cargadores para EVs. Tono: rebelde amigable, datos concretos, orgullo caleño.

Devuelve ÚNICAMENTE un JSON válido con estas claves (sin markdown):
{
  "hero_headline": "Titular principal impactante (máx 10 palabras)",
  "hero_subheadline": "Subtítulo explicativo (1-2 oraciones, máx 25 palabras)",
  "benefit_1_title": "Título beneficio 1 (máx 6 palabras)",
  "benefit_1_desc": "Descripción beneficio 1 (2-3 oraciones)",
  "benefit_2_title": "Título beneficio 2 (máx 6 palabras)",
  "benefit_2_desc": "Descripción beneficio 2 (2-3 oraciones)",
  "benefit_3_title": "Título beneficio 3 (máx 6 palabras)",
  "benefit_3_desc": "Descripción beneficio 3 (2-3 oraciones)",
  "how_step_1": "Nombre paso 1 (máx 5 palabras)",
  "how_step_1_desc": "Descripción paso 1 (1-2 oraciones)",
  "how_step_2": "Nombre paso 2 (máx 5 palabras)",
  "how_step_2_desc": "Descripción paso 2 (1-2 oraciones)",
  "how_step_3": "Nombre paso 3 (máx 5 palabras)",
  "how_step_3_desc": "Descripción paso 3 (1-2 oraciones)",
  "social_proof": "Testimonio en primera persona de cliente satisfecho (2 oraciones reales)",
  "social_proof_name": "Nombre del cliente (nombre + inicial apellido)",
  "social_proof_role": "Ciudad y tipo de cliente (ej: Empresario, Cali)",
  "social_proof_2": "Segundo testimonio diferente en primera persona (2 oraciones)",
  "social_proof_2_name": "Nombre segundo cliente",
  "social_proof_2_role": "Ciudad y tipo del segundo cliente",
  "cta_headline": "Titular sección de acción (máx 8 palabras)",
  "cta_subtext": "Texto de apoyo al CTA (1 oración)",
  "faq_1_q": "Pregunta frecuente 1 (máx 12 palabras)",
  "faq_1_a": "Respuesta directa y clara a pregunta 1 (2-3 oraciones)",
  "faq_2_q": "Pregunta frecuente 2 (máx 12 palabras)",
  "faq_2_a": "Respuesta directa a pregunta 2 (2-3 oraciones)",
  "faq_3_q": "Pregunta frecuente 3 (máx 12 palabras)",
  "faq_3_a": "Respuesta directa a pregunta 3 (2-3 oraciones)",
  "savings_monthly_bill": "Estimado de factura mensual típica del público objetivo en COP (solo número, ej: 500000)",
  "landing_type": "Tipo de landing: solar_compra | solar_ppa | carros_electricos | alianza"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as Partial<LandingSections>;

  // Validate required fields
  const requiredKeys: (keyof LandingSections)[] = [
    "hero_headline", "hero_subheadline",
    "benefit_1_title", "benefit_1_desc", "benefit_2_title", "benefit_2_desc", "benefit_3_title", "benefit_3_desc",
    "how_step_1", "how_step_1_desc", "how_step_2", "how_step_2_desc", "how_step_3", "how_step_3_desc",
    "social_proof", "cta_headline", "cta_subtext",
  ];
  for (const key of requiredKeys) {
    if (typeof parsed[key] !== "string" || !parsed[key]) {
      throw new Error(`AI returned invalid section: ${key}`);
    }
  }
  return parsed as LandingSections;
}

// ── Public URL helper ────────────────────────────────────────────────────────
const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");

function withPublicUrl<T extends { slug: string }>(landing: T) {
  return { ...landing, publicUrl: `${APP_URL}/lp/${landing.slug}` };
}

// ── Is this the ECO+EV preset request? ──────────────────────────────────────
function isEcoEvPreset(title: string): boolean {
  const t = title.toLowerCase();
  return (
    (t.includes("eco") && (t.includes("ev") || t.includes("eléctrico") || t.includes("electrico"))) ||
    t.includes("alianza eco + carro") ||
    t.includes("alianza eco + ev")
  );
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/landings/suggest-copy — generate 3 AI alternative versions of a text field
router.post("/suggest-copy", async (req, res) => {
  const {
    field,
    current,
    context = "",
    landingType,
  } = req.body as {
    field?: string;
    current?: string;
    context?: string;
    landingType?: string;
  };

  if (!field || !current?.trim()) {
    return res.status(400).json({ error: "field y current son requeridos" });
  }

  const fieldLabels: Record<string, string> = {
    title:       "título de la landing page (debe ser atractivo, claro y con palabras clave SEO)",
    cta:         "texto del botón CTA (corto, accionable, máximo 8 palabras, con verbo de acción)",
    description: "descripción del proyecto/producto para la landing (explicativa, orientada a conversión)",
    headline:    "titular principal del hero (impactante, emocional, máximo 12 palabras)",
  };
  const fieldLabel = fieldLabels[field] ?? field;
  const typeContext = landingType ? `El tipo de landing es: ${landingType}.` : "";

  const systemPrompt = `Eres un experto en copywriting para landing pages de energía solar y vehículos eléctricos en Colombia, específicamente para la empresa ECO (eco-col.com) en Cali. Escribe exclusivamente en español colombiano. Sé directo, conversacional y enfocado en beneficios concretos.`;

  const userPrompt = `Genera exactamente 3 alternativas para el ${fieldLabel} de una landing page de ECO Solar.
${typeContext}
${context ? `Contexto adicional: ${context}` : ""}

Texto actual: "${current.trim()}"

Genera 3 alternativas mejores, más persuasivas o con un ángulo distinto. Varía el enfoque: una más directa, una más emocional, una más específica con números/datos. Responde ÚNICAMENTE con JSON:
{"alternatives":["alternativa 1","alternativa 2","alternativa 3"]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { alternatives?: string[] };
    const alternatives = (parsed.alternatives ?? []).slice(0, 3).filter(Boolean);
    if (!alternatives.length) throw new Error("Empty alternatives");
    return res.json({ alternatives });
  } catch (err) {
    console.error("suggest-copy failed:", err);
    return res.status(500).json({ error: "Error al generar alternativas" });
  }
});

// POST /api/landings/preview — generate AI copy + HTML without persisting (pre-publish preview)
router.post("/preview", async (req, res) => {
  const {
    title,
    description,
    objective,
    ctaText = "Quiero saber más",
    includeForm = true,
    contactPhone = "",
  } = req.body as {
    title?: string;
    description?: string;
    objective?: string;
    ctaText?: string;
    includeForm?: boolean;
    contactPhone?: string;
  };

  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: "title y description son requeridos" });
  }

  const fullDescription = objective?.trim()
    ? `Objetivo: ${objective.trim()}\n\n${description.trim()}`
    : description.trim();

  const previewSlug = "preview-" + crypto.randomBytes(3).toString("hex");
  const sections: LandingSections = isEcoEvPreset(title.trim())
    ? ECO_EV_PRESET
    : await generateLandingCopy(title.trim(), fullDescription, ctaText);

  const isPreset = isEcoEvPreset(title.trim());
  const html = buildLandingHtml(title.trim(), sections, ctaText, includeForm, previewSlug, isPreset, "", contactPhone);
  return res.status(200).json({ html });
});

// GET /api/landings — list all landing pages; supports ?status=active filter
router.get("/", async (req, res) => {
  const statusFilter = req.query.status as string | undefined;
  const tf = tenantFilter(req);
  const statusCond = statusFilter ? eq(landingPagesTable.status, statusFilter) : undefined;
  const whereCond = tf && statusCond ? and(tf, statusCond) : (tf ?? statusCond);
  const rows = whereCond
    ? await db.select().from(landingPagesTable).where(whereCond).orderBy(desc(landingPagesTable.createdAt))
    : await db.select().from(landingPagesTable).orderBy(desc(landingPagesTable.createdAt));
  res.json(rows.map(withPublicUrl));
});

// POST /api/landings — create + AI-generate a landing page
router.post("/", async (req, res) => {
  const {
    title,
    description,
    objective,
    landingType,
    ctaText = "Quiero saber más",
    includeForm = true,
    contactPhone = "",
  } = req.body as {
    title?: string;
    description?: string;
    objective?: string;
    landingType?: string;
    ctaText?: string;
    includeForm?: boolean;
    contactPhone?: string;
  };

  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: "title y description son requeridos" });
  }

  const fullDescription = objective?.trim()
    ? `Objetivo: ${objective.trim()}\n\n${description.trim()}`
    : description.trim();

  const baseSlug = slugify(title.trim());
  const slug = baseSlug + "-" + crypto.randomBytes(3).toString("hex");

  const sections: LandingSections = isEcoEvPreset(title.trim())
    ? ECO_EV_PRESET
    : await generateLandingCopy(title.trim(), fullDescription, ctaText);

  const isPreset = isEcoEvPreset(title.trim());
  const appUrl = process.env["APP_URL"] ?? (process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : "https://eco-social-posts.replit.app");
  const canonicalUrl = `${appUrl}/lp/${slug}`;

  // Query gallery images from backgrounds library — scoped to the authenticated user
  const resolvedType = landingType ?? detectLandingType(title.trim(), fullDescription);
  const galleryImages = await queryGalleryImages(resolvedType, appUrl, req.user!.userId, req.user!.role === "admin");

  const generatedHtml = buildLandingHtml(title.trim(), sections, ctaText, includeForm, slug, isPreset, canonicalUrl, contactPhone, "", galleryImages);

  const [landing] = await db.insert(landingPagesTable).values({
    userId: req.user!.userId,
    slug,
    title: title.trim(),
    description: fullDescription,
    ctaText,
    includeForm,
    generatedHtml,
    formLeads: [],
    status: "active",
  }).returning();

  // Fire-and-forget: generate DALL-E hero image in background (does not block the response)
  const headline = sections.headline ?? title.trim();
  const detectedType = landingType ?? detectLandingType(title.trim(), fullDescription);
  generateLandingHeroImage(title.trim(), headline, detectedType).then(async (img) => {
    if (!img) return;
    const [variant] = await db.insert(imageVariantsTable).values({
      postId: null,
      userId: req.user?.userId ?? null,
      style: "photorealistic",
      prompt: img.prompt,
      rawBackground: img.base64,
      imageData: img.base64,
    }).returning({ id: imageVariantsTable.id });
    if (!variant) return;
    await db.update(landingPagesTable)
      .set({ heroImageVariantId: variant.id, updatedAt: new Date() })
      .where(eq(landingPagesTable.id, landing.id));
  }).catch((err) => console.error("Hero image background task failed:", err));

  return res.status(201).json(withPublicUrl(landing));
});

// POST /api/landings/:id/generate-hero — (re)generate hero image for an existing landing
router.post("/:id/generate-hero", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  const tf = tenantFilter(req);
  const [landing] = await db.select({
    id: landingPagesTable.id,
    title: landingPagesTable.title,
    description: landingPagesTable.description,
    slug: landingPagesTable.slug,
    heroImageVariantId: landingPagesTable.heroImageVariantId,
  }).from(landingPagesTable).where(tf ? and(eq(landingPagesTable.id, id), tf) : eq(landingPagesTable.id, id));

  if (!landing) return res.status(404).json({ error: "Landing no encontrada" });

  // Respond immediately — image generation happens in background
  res.json({ status: "generating", message: "Generando imagen de hero en segundo plano…" });

  const detectedType = detectLandingType(landing.title, landing.description);
  generateLandingHeroImage(landing.title, landing.title, detectedType).then(async (img) => {
    if (!img) return;
    const [variant] = await db.insert(imageVariantsTable).values({
      postId: null,
      userId: req.user?.userId ?? null,
      style: "photorealistic",
      prompt: img.prompt,
      rawBackground: img.base64,
      imageData: img.base64,
    }).returning({ id: imageVariantsTable.id });
    if (!variant) return;
    await db.update(landingPagesTable)
      .set({ heroImageVariantId: variant.id, updatedAt: new Date() })
      .where(eq(landingPagesTable.id, id));
  }).catch((err) => console.error("Hero image re-generate failed:", err));
});

// GET /api/landings/:id/leads — list leads for a specific landing
router.get("/:id/leads", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  // Verify ownership before returning leads
  const tf = tenantFilter(req);
  const [landing] = await db.select({ id: landingPagesTable.id })
    .from(landingPagesTable)
    .where(tf ? and(eq(landingPagesTable.id, id), tf) : eq(landingPagesTable.id, id));
  if (!landing) return res.status(404).json({ error: "Landing no encontrada" });

  const leads = await db.select().from(landingLeadsTable)
    .where(eq(landingLeadsTable.landingId, id))
    .orderBy(desc(landingLeadsTable.createdAt));
  return res.json(leads);
});

// POST /api/landings/:id/regenerate — rebuild HTML for existing landing using current template
router.post("/:id/regenerate", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  const tf = tenantFilter(req);
  const [landing] = await db.select().from(landingPagesTable)
    .where(tf ? and(eq(landingPagesTable.id, id), tf) : eq(landingPagesTable.id, id));
  if (!landing) return res.status(404).json({ error: "Landing no encontrada" });

  const title = landing.title;
  const description = landing.description ?? "";
  const ctaText = landing.ctaText ?? "Quiero saber más";
  const includeForm = landing.includeForm ?? true;
  const slug = landing.slug;

  const preset = isEcoEvPreset(title);
  const sections: LandingSections = preset
    ? ECO_EV_PRESET
    : await generateLandingCopy(title, description, ctaText);

  const appUrl = process.env["APP_URL"] ?? (process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : "https://eco-social-posts.replit.app");
  const canonicalUrl = `${appUrl}/lp/${slug}`;
  const resolvedType = detectLandingType(title, description);
  const galleryImages = await queryGalleryImages(resolvedType, appUrl, req.user!.userId, req.user!.role === "admin");

  const newHtml = buildLandingHtml(title, sections, ctaText, includeForm, slug, preset, canonicalUrl, "3011285672", "", galleryImages);

  await db.update(landingPagesTable)
    .set({ generatedHtml: newHtml, updatedAt: new Date() })
    .where(eq(landingPagesTable.id, id));

  return res.json({ ok: true, slug });
});

// PATCH /api/landings/:id/html — save edited HTML from inline visual editor
router.patch("/:id/html", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  const { html } = req.body as { html?: string };
  if (!html || typeof html !== "string" || html.length < 100) {
    return res.status(400).json({ error: "html inválido o vacío" });
  }

  const tf = tenantFilter(req);
  const cond = tf ? and(eq(landingPagesTable.id, id), tf) : eq(landingPagesTable.id, id);
  const [updated] = await db.update(landingPagesTable)
    .set({ generatedHtml: html, updatedAt: new Date() })
    .where(cond)
    .returning({ id: landingPagesTable.id });
  if (!updated) return res.status(404).json({ error: "Landing no encontrada" });

  return res.json({ ok: true });
});

// DELETE /api/landings/:id — archive a landing
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  const tf = tenantFilter(req);
  const cond = tf ? and(eq(landingPagesTable.id, id), tf) : eq(landingPagesTable.id, id);
  const [updated] = await db.update(landingPagesTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(cond)
    .returning({ id: landingPagesTable.id });
  if (!updated) return res.status(404).json({ error: "Landing no encontrada" });
  return res.json({ success: true });
});

export default router;
