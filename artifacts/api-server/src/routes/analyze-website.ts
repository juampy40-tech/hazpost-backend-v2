import { Router } from "express";
import { load } from "cheerio";
import { requireAuth } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import dns from "dns/promises";
import net from "net";
import sharp from "sharp";
import * as ColorThief from "colorthief";

const router = Router();

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map(v => v.toString(16).padStart(2, "0"))
      .join("")
      .toLowerCase()
  );
}

function isNeutralColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const saturation = max === 0 ? 0 : (max - min) / max;

  const brightness = (r + g + b) / 3;

  // Muy gris
  if (saturation < 0.12) return true;

  // Muy oscuro
  if (brightness < 35) return true;

  // Muy claro/blanco
  if (brightness > 240) return true;

  return false;
}

async function extractDominantLogoColor(
  logoUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(logoUrl);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();

    const inputBuffer = Buffer.from(arrayBuffer);

    // Normalizar imagen
    const normalizedBuffer = await sharp(inputBuffer)
      .resize(256, 256, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const palette = await ColorThief.getPalette(normalizedBuffer, 5 as any);

    if (!palette?.length) return null;

    for (const color of palette as unknown as number[][]) {
      const [r, g, b] = color;

      if (!isNeutralColor(r, g, b)) {
        return rgbToHex(r, g, b);
      }
    }

    // fallback primer color
    const [r, g, b] = palette[0] as unknown as number[];

    return rgbToHex(r, g, b);
  } catch {
    return null;
  }
}

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

        const logoUrl =
      $("meta[property='og:logo']").attr("content") ||
      $("meta[property='og:image']").attr("content") ||
      $("link[rel='icon']").attr("href") ||
      $("link[rel='shortcut icon']").attr("href") ||
      null;

    let detectedBrandColor: string | null = null;

    if (logoUrl) {
      try {
        const absoluteLogoUrl = new URL(logoUrl, url).href;

        detectedBrandColor =
          await extractDominantLogoColor(absoluteLogoUrl);

        console.log("🎨 Detected logo color:", detectedBrandColor);
      } catch (err) {
        console.warn("⚠️ Logo color extraction failed:", err);
      }
    }

    const finalPrimaryColor =
      detectedBrandColor || themeColor || "#2563eb";  

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
          content: `Eres un experto en branding y marketing para negocios reales.

Genera una descripción comercial corta, clara y útil del negocio.

Usa principalmente:
- nombre del negocio
- industria
- subindustria
- slogan
- ciudad y país

Usa el sitio web solo como apoyo para entender:
- productos visibles
- estilo de marca
- tono
- propuesta comercial

IMPORTANTE:
Para detectar primaryColor:
- prioriza el color dominante del logo principal
- evita usar colores de fondos oscuros, overlays o gradients del sitio
- evita usar colores accidentales del hero section
- usa el color más representativo de la marca

No sobreinterpretes el sitio web.
No conviertas el negocio en academia, formación o cursos salvo que el formulario lo diga claramente.

Responde SOLO con JSON válido.

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
DATOS DEL NEGOCIO:
Nombre: ${context?.companyName || "No informado"}
Slogan: ${context?.slogan || "No informado"}
Industria: ${context?.industry || "No informado"}
Subindustria: ${context?.subIndustry || "No informado"}
Ciudad: ${context?.city || "No informado"}
País: ${context?.country || "No informado"}

REFERENCIA DEL SITIO WEB:
${finalPrimaryColor ? `Color principal detectado: ${finalPrimaryColor}` : ""}
${contentSummary}
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
          : finalPrimaryColor &&
              /^#[0-9a-fA-F]{6}$/.test(finalPrimaryColor)
            ? finalPrimaryColor
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
