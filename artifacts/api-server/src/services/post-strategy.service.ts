/**
 * Post Strategy Engine — HazPost
 *
 * Este servicio NO genera captions ni imágenes directamente.
 * Su trabajo es pensar la estrategia comercial del post antes de llamar a la IA.
 *
 * Objetivo:
 * - leer perfil completo del negocio
 * - detectar mercados/segmentos reales del negocio
 * - elegir un enfoque por post
 * - construir captionBrief y imageScene coherentes
 * - evitar contenido genérico o repetitivo
 *
 * Flujo:
 * posts.ts / ai.service.ts
 *   → post-strategy.service.ts
 *   → generateCaption()
 *   → generatePostImage()
 */

export type StrategyInput = {
  prompt?: string;
  businessProfile?: {
    name?: string | null;
    industry?: string | null;
    subIndustry?: string | null;
    subIndustries?: string | null;
    description?: string | null;
    audienceDescription?: string | null;
    defaultLocation?: string | null;
    slogan?: string | null;
    brandTone?: string | null;
    website?: string | null;
  } | null;
  tone?: string;
  index?: number;
};

export type StrategyOutput = {
  marketFocus: string;
  angle: string;
  captionBrief: string;
  imageScene: string;
};

function normalizeText(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseSubIndustries(raw?: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === "string")
        .map(x => x.trim())
        .filter(Boolean);
    }
  } catch {
    // legacy CSV fallback
  }

  return raw
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferMarkets(input: StrategyInput): string[] {
  const biz = input.businessProfile;
  const text = normalizeText([
    biz?.industry,
    biz?.subIndustry,
    biz?.subIndustries,
    biz?.description,
    biz?.audienceDescription,
    input.prompt,
  ].filter(Boolean).join(" "));

  const subIndustries = unique([
    ...parseSubIndustries(biz?.subIndustries),
    ...parseSubIndustries(biz?.subIndustry),
  ]);

  const markets: string[] = [];

  for (const sub of subIndustries) {
    markets.push(sub);
  }

  if (/(residencial|hogar|casa|familia|apartamento|vivienda)/.test(text)) {
    markets.push("Residencial");
  }

  if (/(comercial|negocio|local|tienda|restaurante|empresa|oficina|pyme|emprendedor)/.test(text)) {
    markets.push("Comercial / negocios");
  }

  if (/(industrial|industria|fabrica|bodega|planta|manufactura|produccion)/.test(text)) {
    markets.push("Industrial");
  }

  if (/(agricol|campo|finca|granja|rural|cultivo|minigranja)/.test(text)) {
    markets.push("Agrícola / rural");
  }

  if (/(mantenimiento|soporte|reparacion|servicio tecnico|postventa)/.test(text)) {
    markets.push("Mantenimiento / servicio");
  }

  if (markets.length === 0 && biz?.industry) {
    markets.push(biz.industry);
  }

  if (markets.length === 0) {
    markets.push("Clientes potenciales del negocio");
  }

  return unique(markets);
}

function pickByIndex<T>(items: T[], index = 0): T {
  return items[Math.abs(index) % items.length];
}

export function buildPostStrategy(input: StrategyInput): StrategyOutput {
  const biz = input.businessProfile;
  const markets = inferMarkets(input);
  const marketFocus = pickByIndex(markets, input.index ?? 0);

  const businessName = biz?.name?.trim() || "la marca";
  const industry = biz?.industry?.trim() || "su sector";
  const audience = biz?.audienceDescription?.trim() || "clientes potenciales";
  const location = biz?.defaultLocation?.trim() || "";
  const slogan = biz?.slogan?.trim() || "";
  const tone = input.tone || biz?.brandTone || "profesional, claro y comercial";

  const angles = [
    "confianza y autoridad",
    "problema real del cliente",
    "beneficio económico o práctico",
    "decisión de compra fácil",
    "diferenciación frente a opciones genéricas",
    "resultado esperado después de contratar",
  ];

  const angle = pickByIndex(angles, input.index ?? 0);

  const locationText = location ? ` en ${location}` : "";
  const promptText = input.prompt?.trim()
    ? ` Tema adicional solicitado por el usuario: ${input.prompt.trim()}.`
    : "";

  const captionBrief =
    `Crear un post comercial para ${businessName}, negocio de ${industry}${locationText}. ` +
    `Enfoque del post: ${marketFocus}. ` +
    `Ángulo estratégico: ${angle}. ` +
    `Audiencia: ${audience}. ` +
    `Tono: ${tone}. ` +
    `El contenido debe vender con claridad, generar confianza, explicar un beneficio real y cerrar con un CTA específico. ` +
    `${slogan ? `Usar la idea de marca/slogan cuando encaje naturalmente: "${slogan}". ` : ""}` +
    `No reducir el negocio a un solo caso típico si el perfil muestra varios mercados o servicios.` +
    promptText;

  const imageScene =
  `Fotografía publicitaria realista para la marca ${businessName}${locationText}. ` +
  `Basarse en el perfil real del negocio, su sector, sus servicios, su audiencia y el enfoque del post: ${marketFocus}. ` +
  `Mostrar una escena coherente con ese contexto: cliente ideal, lugar de uso, operación del negocio, servicio en acción, producto, resultado o experiencia del cliente según corresponda. ` +
  `No asumir un tipo de escena por defecto. ` +
  `Evitar repetir exactamente el mismo tipo de escena que en publicaciones recientes. Variar el contexto visual manteniendo coherencia con el negocio.` +
  `La imagen debe parecer una campaña profesional de marketing para ese negocio específico, no una imagen genérica de stock. ` +
  `Transmitir confianza, claridad comercial y un beneficio visible para la audiencia. ` +
  `Sin texto, sin logos incrustados, sin marcas ajenas.` +
  promptText;

  return {
    marketFocus,
    angle,
    captionBrief,
    imageScene,
  };
}
