/**
 * fontLoader.ts — Central font loading service for overlay image generation.
 *
 * Architecture:
 * - Each font has a canonical name, a local asset file (vendored from @fontsource),
 *   and a Google Fonts URL fallback for future dynamic additions.
 * - Fonts are lazy-loaded from local assets on first use and cached in memory
 *   for the lifetime of the process (no repeated disk reads).
 * - Startup warm-cache preloads the most frequently used fonts so the first
 *   image generation request is fast.
 * - Load failures are logged with pino — never swallowed silently.
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const _assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

// ── Font catalog ─────────────────────────────────────────────────────────────
// Each entry: { file: local asset name, format, googleFontsUrl (for reference/future use) }

export interface FontEntry {
  family: string;
  file: string;
  format: "truetype" | "woff2";
  fallback: string;
  isSerif?: boolean;
  googleFontsUrl: string;
}

export const FONT_CATALOG: Record<string, FontEntry> = {
  // ── Inter (UI default / eco) ──────────────────────────────────────────────
  inter: {
    family: "Inter",
    file: "Inter-ExtraBold.ttf",
    format: "truetype",
    fallback: "'Helvetica Neue',Arial,sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Inter",
  },

  // ── Impact / condensed display ────────────────────────────────────────────
  bebas: {
    family: "BebasNeue",
    file: "BebasNeue-Regular.ttf",
    format: "truetype",
    fallback: "'Impact','Arial Black',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Bebas+Neue",
  },
  anton: {
    family: "Anton",
    file: "Anton-Regular.woff2",
    format: "woff2",
    fallback: "'Impact','Arial Black',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Anton",
  },
  fjalla: {
    family: "FjallaOne",
    file: "FjallaOne-Regular.woff2",
    format: "woff2",
    fallback: "'Impact','Arial Narrow',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Fjalla+One",
  },
  oswald: {
    family: "Oswald",
    file: "Oswald-Bold.ttf",
    format: "truetype",
    fallback: "'Impact','Arial Narrow',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Oswald",
  },
  barlow: {
    family: "BarlowCondensed",
    file: "BarlowCondensed-Bold.woff2",
    format: "woff2",
    fallback: "'Arial Narrow',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Barlow+Condensed",
  },

  // ── Modern / geometric sans ───────────────────────────────────────────────
  montserrat: {
    family: "Montserrat",
    file: "Montserrat-ExtraBold.ttf",
    format: "truetype",
    fallback: "'Trebuchet MS',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Montserrat",
  },
  poppins: {
    family: "Poppins",
    file: "Poppins-Bold.woff2",
    format: "woff2",
    fallback: "'Trebuchet MS',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Poppins",
  },
  raleway: {
    family: "Raleway",
    file: "Raleway-Bold.woff2",
    format: "woff2",
    fallback: "'Trebuchet MS',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Raleway",
  },
  exo2: {
    family: "Exo2",
    file: "Exo2-Bold.woff2",
    format: "woff2",
    fallback: "'Trebuchet MS',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Exo+2",
  },
  ubuntu: {
    family: "Ubuntu",
    file: "Ubuntu-Bold.woff2",
    format: "woff2",
    fallback: "'Trebuchet MS',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Ubuntu",
  },

  // ── Legible / humanist ───────────────────────────────────────────────────
  roboto: {
    family: "RobotoCondensed",
    file: "RobotoCondensed-Bold.woff2",
    format: "woff2",
    fallback: "'Arial',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Roboto+Condensed",
  },
  lato: {
    family: "Lato",
    file: "Lato-Bold.woff2",
    format: "woff2",
    fallback: "'Arial',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Lato",
  },
  nunito: {
    family: "Nunito",
    file: "Nunito-Bold.woff2",
    format: "woff2",
    fallback: "'Arial Rounded MT Bold',sans-serif",
    googleFontsUrl: "https://fonts.google.com/specimen/Nunito",
  },

  // ── Editorial / serif ─────────────────────────────────────────────────────
  playfair: {
    family: "PlayfairDisplay",
    file: "PlayfairDisplay-Bold.ttf",
    format: "truetype",
    fallback: "'Georgia','Times New Roman',serif",
    isSerif: true,
    googleFontsUrl: "https://fonts.google.com/specimen/Playfair+Display",
  },
  cinzel: {
    family: "Cinzel",
    file: "Cinzel-Bold.woff2",
    format: "woff2",
    fallback: "'Georgia',serif",
    isSerif: true,
    googleFontsUrl: "https://fonts.google.com/specimen/Cinzel",
  },

  // ── Decorative / script ───────────────────────────────────────────────────
  pacifico: {
    family: "Pacifico",
    file: "Pacifico-Regular.woff2",
    format: "woff2",
    fallback: "'Comic Sans MS',cursive",
    googleFontsUrl: "https://fonts.google.com/specimen/Pacifico",
  },
  dancing: {
    family: "DancingScript",
    file: "DancingScript-Bold.woff2",
    format: "woff2",
    fallback: "'Brush Script MT',cursive",
    googleFontsUrl: "https://fonts.google.com/specimen/Dancing+Script",
  },
};

// ── Preset aliases — maps UI preset values → catalog keys ────────────────────
export const PRESET_ALIAS: Record<string, string> = {
  eco: "montserrat",
  cinema: "bebas",
  neon: "bebas",
  bloque: "bebas",
  duotono: "oswald",
  titanio: "oswald",
  editorial: "playfair",
  ptserif: "playfair",
  sourcesans: "roboto",
  rajdhani: "exo2",
};

// ── In-memory font cache ──────────────────────────────────────────────────────
const _fontCache = new Map<string, string>();

/** Load a font file by its catalog key, returning its Base64 string.
 *  Results are cached in memory; failures are logged and return "" (not thrown). */
export function loadFontB64(catalogKey: string): string {
  if (_fontCache.has(catalogKey)) return _fontCache.get(catalogKey)!;

  const entry = FONT_CATALOG[catalogKey];
  if (!entry) {
    logger.warn({ catalogKey }, "[fontLoader] Unknown font catalog key — using empty string");
    _fontCache.set(catalogKey, "");
    return "";
  }

  const filePath = path.join(_assetsDir, entry.file);
  try {
    const b64 = readFileSync(filePath).toString("base64");
    _fontCache.set(catalogKey, b64);
    return b64;
  } catch (err) {
    logger.error({ catalogKey, file: entry.file, err }, "[fontLoader] Failed to load font file");
    _fontCache.set(catalogKey, "");
    return "";
  }
}

/** Build a CSS @font-face block embedding the font as a Base64 data URI. */
export function buildFontFaceCSS(catalogKey: string): string {
  const entry = FONT_CATALOG[catalogKey];
  if (!entry) return "";
  const b64 = loadFontB64(catalogKey);
  if (!b64) return "";
  const mime = entry.format === "woff2" ? "font/woff2" : "font/truetype";
  return `@font-face { font-family: '${entry.family}'; src: url('data:${mime};base64,${b64}') format('${entry.format}'); font-weight: 700; }`;
}

/** Resolve a UI preset string to an SVG-ready { css, family } descriptor.
 *  Supports:
 *  - catalog keys (e.g. "bebas", "montserrat")
 *  - preset aliases (e.g. "cinema" → "bebas", "eco" → "montserrat")
 *  - custom_text:<family> — arbitrary font-family name from the text input;
 *    no @font-face is embedded (browser/SVG fallback to system fonts), but the
 *    family string is passed directly so the SVG element uses it.
 *  Returns Montserrat as safe default for unrecognized presets. */
export function resolveFont(preset: string): { css: string; family: string } {
  // Handle custom_text:<family> — user typed an arbitrary font name
  if (preset.startsWith("custom_text:")) {
    const rawFamily = preset.slice("custom_text:".length).trim();
    // Sanitize: allow letters, digits, spaces, dashes — strip anything else
    const safeFamily = rawFamily.replace(/[^a-zA-Z0-9 \-]/g, "").trim() || "Montserrat";
    return { css: "", family: `${safeFamily},sans-serif` };
  }

  const key = PRESET_ALIAS[preset] ?? (FONT_CATALOG[preset] ? preset : null) ?? "montserrat";
  const entry = FONT_CATALOG[key] ?? FONT_CATALOG.montserrat;
  const css = buildFontFaceCSS(key);
  return {
    css,
    family: `${entry.family},${entry.fallback}`,
  };
}

// ── Warm preload (call at server startup) ─────────────────────────────────────
const WARM_FONTS = [
  "bebas", "montserrat", "oswald", "playfair", "inter",
  "anton", "poppins", "raleway", "lato", "cinzel",
];

export function warmFontCache(): void {
  let ok = 0;
  let fail = 0;
  for (const key of WARM_FONTS) {
    const b64 = loadFontB64(key);
    if (b64) ok++;
    else fail++;
  }
  logger.info({ ok, fail, total: WARM_FONTS.length }, "[fontLoader] Warm font cache complete");
}
