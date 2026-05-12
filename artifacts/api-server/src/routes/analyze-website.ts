import { Router } from "express";
import { load } from "cheerio";
import { requireAuth } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import dns from "dns/promises";
import net from "net";

const router = Router();

/**
 * Block private/internal/loopback IP ranges to prevent SSRF.
 * Covers IPv4 loopback, link-local, private, CGN, and common cloud metadata endpoints.
 */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === "::1") return true;
    if (norm.startsWith("fc") || norm.startsWith("fd")) return true;
    if (norm.startsWith("fe80:")) return true;
    if (norm === "::") return true;
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;
  const [a, b, c] = parts;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a === 0) return true;
  return false;
}

/**
 * Validates and normalizes a URL for safe server-side fetching.
 * Returns the normalized URL or throws a descriptive error string.
 */
export function normalizeSafeUrl(raw: string): string {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("URL inválida");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Solo se permiten URLs http/https");
  }
  return parsed.href;
}

/**
 * Resolves the hostname of a URL and checks if it resolves to a private/blocked IP.
 * Throws an error if the hostname resolves to a blocked IP (SSRF protection).
 */
export async function assertPublicHost(urlStr: string): Promise<void> {
  const hostname = new URL(urlStr).hostname;
  let resolved: string[];
  try {
    const addrs = await dns.resolve(hostname);
    resolved = addrs;
  } catch {
    const addrs4 = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addrs6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    resolved = [...addrs4, ...addrs6];
  }
  if (resolved.length === 0) throw new Error("No se pudo resolver el dominio");
  if (resolved.some(ip => isBlockedIp(ip))) {
    throw new Error("Dominio no permitido");
  }
}

/**
 * Core website analysis: fetches HTML, extracts text with cheerio, sends to GPT.
 * Returns { description, audience, tone, primaryColor } — any field can be null.
 * Fails silently on fetch errors, timeout, or GPT failures.
 */
export async function analyzeWebsite(
  url: string,
  context?: {
    companyName?: string;
    slogan?: string;
    industry?: string;
    subIndustry?: string;
    city?: string;
    country?: string;
  }
): Promise<{
  description: string | null;
  audience: string | null;
  tone: string | null;
  primaryColor: string | null;
}> {
  const nullResult = {
    description: null,
    audience: null,
    tone: null,
    primaryColor: null,
  };

  let safeUrl: string;

  try {
    safeUrl = normalizeSafeUrl(url);
    await assertPublicHost(safeUrl);
  } catch {
    return nullResult;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  /**
   * Manually follow redirects, re-validating each hop against blocked IPs.
   * Prevents SSRF via open redirect chains (e.g. public URL → 169.254.169.254).
   */
  async function safeFetch(startUrl: string): Promise<Response> {
    const MAX_HOPS = 5;
    let currentUrl = startUrl;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      await assertPublicHost(currentUrl); // validate every hop
      const resp = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; HazPost-Bot/1.0; +https://hazpost.app)",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "es,en;q=0.9",
        },
        redirect: "manual", // never auto-follow
      });
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get("location");
        if (!location) throw new Error("Redirect sin destino");
        // Resolve relative Location against current URL
        const next = new URL(location, currentUrl).href;
        currentUrl = normalizeSafeUrl(next);
        continue;
      }
      return resp;
    }
    throw new Error("Demasiadas redirecciones");
  }

  let html = "";
  try {
    const response = await safeFetch(safeUrl);
    clearTimeout(timeout);
    if (!response.ok) return nullResult;
    const raw = await response.text();
    html = raw.slice(0, 200_000);
  } catch {
    clearTimeout(timeout);
    return nullResult;
  }

  try {
    const $ = load(html);

    $("script, style, noscript, footer, aside, svg").remove();

    const cleanText = (value: string) =>
      value
        .replace(/\s+/g, " ")
        .replace(/[\t\n\r]+/g, " ")
        .trim();

    const title = cleanText($("title").text());

    const metaDesc = cleanText(
      $("meta[name='description']").attr("content") ??
      $("meta[property='og:description']").attr("content") ??
      ""
    );

    const h1 = cleanText($("h1").first().text());

    const h2s = $("h2")
      .slice(0, 4)
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter(Boolean)
      .join(" | ");

    const heroText = cleanText(
      $("main, [role='main'], section, header")
        .first()
        .text()
    ).slice(0, 300);

    const primaryCtas = $("a, button")
      .slice(0, 20)
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter(Boolean)
      .filter(text => text.length >= 3 && text.length <= 80)
      .slice(0, 8)
      .join(" | ");

    const mainHeadings = $("h1, h2, h3")
      .slice(0, 10)
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter(Boolean)
      .join(" | ");

    const bodyText = [
      heroText ? `Hero / primera sección: ${heroText}` : "",
      primaryCtas ? `CTAs visibles: ${primaryCtas}` : "",
      mainHeadings ? `Títulos principales: ${mainHeadings}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2500);

    const themeColor =
      $("meta[name='theme-color']").attr("content") ?? null;

    const contentSummary = [
      title ? `Título: ${title}` : "",
      metaDesc ? `Meta descripción: ${metaDesc}` : "",
      h1 ? `H1: ${h1}` : "",
      h2s ? `Subtítulos: ${h2s}` : "",
      `Contenido principal: ${bodyText}`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500);

console.log("===== CONTENT SUMMARY =====");
console.log(contentSummary);
console.log("===== END CONTENT SUMMARY =====");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Eres un experto en branding, marketing y análisis comercial para negocios reales.

El usuario YA definió correctamente su negocio mediante el formulario.

Tu trabajo es enriquecer comercialmente esa identidad usando el sitio web solo como apoyo visual, contextual y de branding.

ORDEN DE PRIORIDAD OBLIGATORIO:
1. Nombre del negocio.
2. Industria.
3. Subindustria.
4. Slogan.
5. Ciudad y país.
6. Sitio web SOLO como complemento.
7. Colores, tono visual, productos o servicios visibles.

La identidad principal del negocio SIEMPRE sale del formulario del usuario.
El sitio web NO puede cambiar la industria, subindustria, tipo de negocio ni propuesta principal si contradice el formulario.

REGLA CRÍTICA:
Si el sitio web parece pertenecer a otra categoría, sector o actividad distinta,
DEBES confiar primero en:
- industria,
- subindustria,
- slogan,
- nombre del negocio,
en vez del contenido del sitio.

El website puede contener blogs, SEO, textos educativos o contenido secundario incorrecto.

El slogan del negocio tiene prioridad MUY ALTA para entender qué vende realmente la marca.

NO describas el negocio como academia, plataforma educativa o formación
a menos que el formulario del usuario lo indique explícitamente.

IMPORTANTE:
- El formulario del usuario SIEMPRE tiene prioridad sobre el sitio web.
- NO inventes una industria diferente.
- NO redefinas el negocio usando blogs, artículos SEO, textos legales o contenido repetitivo.
- Usa el sitio web solo para complementar productos, servicios, propuesta de valor, estilo visual, colores y tono.
- La descripción debe coincidir con la industria/subindustria indicada por el usuario.
- La audiencia debe coincidir con el tipo real de cliente de esa industria/subindustria.
- Sirve para cualquier tipo de negocio: productos, servicios, restaurantes, salud, belleza, educación, seguros, inmobiliarias, tecnología, comercio local o profesionales independientes.
- Responde SOLO con JSON válido.

Campos requeridos:
- description
- audience
- tone
- primaryColor
`,
        },
        {
          role: "user",
          content: `
DATOS DEL NEGOCIO DADOS POR EL USUARIO:

Nombre:
${context?.companyName || "No informado"}

Slogan:
${context?.slogan || "No informado"}

Industria:
${context?.industry || "No informado"}

Subindustria:
${context?.subIndustry || "No informado"}

Ciudad:
${context?.city || "No informado"}

País:
${context?.country || "No informado"}

REGLAS IMPORTANTES:
- Prioriza SIEMPRE los datos dados por el usuario: nombre, industria, subindustria, slogan, ciudad y país.
- El sitio web solo complementa contexto; nunca debe cambiar la identidad principal definida por el usuario.
- NO inventes una industria diferente a la indicada por el usuario.
- Si el sitio web es ambiguo, contradictorio o tiene textos genéricos, usa el formulario como fuente principal.
- Usa el sitio web para complementar: productos, servicios, estilo de marca, propuesta de valor, colores y tono.
- Ignora textos secundarios como footer, blogs, artículos SEO, páginas legales o contenido repetitivo.
- La descripción debe coincidir con la industria/subindustria del usuario.
- La audiencia debe coincidir con el tipo real de cliente de esa industria/subindustria.
- Si hay conflicto entre el formulario y el sitio web, SIEMPRE gana el formulario.
- Responde de forma útil para cualquier tipo de negocio: productos, servicios, restaurantes, salud, belleza, educación, seguros, inmobiliarias, tecnología, comercio local o profesionales independientes.

CONTEXTO DEL SITIO WEB — SOLO COMO APOYO, NO COMO IDENTIDAD:

${themeColor ? `Color detectado del sitio: ${themeColor}` : ""}

Resumen visual limitado:
${contentSummary}

RECORDATORIO FINAL:
Aunque el resumen del sitio mencione ventas, formación, recursos, cursos, blogs o contenido educativo,
NO uses eso para definir el negocio si contradice la industria, subindustria o slogan del usuario.
`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<{
      description: string | null;
      audience: string | null;
      tone: string | null;
      primaryColor: string | null;
    }>;

    return {
      description:
        typeof parsed.description === "string"
          ? parsed.description
          : null,
      audience:
        typeof parsed.audience === "string"
          ? parsed.audience
          : null,
      tone:
        typeof parsed.tone === "string"
          ? parsed.tone
          : null,
      primaryColor:
        typeof parsed.primaryColor === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(parsed.primaryColor)
          ? parsed.primaryColor
          : null,
    };
  } catch {
    return nullResult;
  }
}

/**
 * POST /api/analyze-website
 * Generic analyze endpoint — requires auth only. Used during onboarding wizard
 * when the active business context is implied by the user session.
 */
router.post("/", requireAuth, async (req, res) => {
  const { url, context } = req.body as {
    url?: string;
    context?: {
      companyName?: string;
      slogan?: string;
      industry?: string;
      subIndustry?: string;
      city?: string;
      country?: string;
    };
  };
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL requerida" });
  }
  const result = await analyzeWebsite(url, context);
  return res.json(result);
});

export default router;
