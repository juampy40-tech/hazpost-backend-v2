export interface FontEntry {
  key: string;
  label: string;
  family: string;
  category: "display" | "sans" | "serif" | "script" | "tech";
}

export const FONT_CATALOG: FontEntry[] = [
  { key: "montserrat", label: "Montserrat", family: "'Montserrat', 'Helvetica Neue', sans-serif", category: "sans" },
  { key: "inter", label: "Inter", family: "'Inter', 'Helvetica Neue', sans-serif", category: "sans" },
  { key: "poppins", label: "Poppins", family: "'Poppins', sans-serif", category: "sans" },
  { key: "raleway", label: "Raleway", family: "'Raleway', sans-serif", category: "sans" },
  { key: "lato", label: "Lato", family: "'Lato', sans-serif", category: "sans" },
  { key: "nunito", label: "Nunito", family: "'Nunito', sans-serif", category: "sans" },

  { key: "ubuntu", label: "Ubuntu", family: "'Ubuntu', sans-serif", category: "tech" },
  { key: "exo2", label: "Exo 2", family: "'Exo 2', sans-serif", category: "tech" },

  { key: "bebas", label: "Bebas Neue", family: "'Bebas Neue', Impact, sans-serif", category: "display" },
  { key: "anton", label: "Anton", family: "'Anton', Impact, sans-serif", category: "display" },
  { key: "bungee", label: "Bungee", family: "'Bungee', sans-serif", category: "display" },
  { key: "oswald", label: "Oswald", family: "'Oswald', Impact, sans-serif", category: "display" },
  { key: "fjalla", label: "Fjalla One", family: "'Fjalla One', Impact, sans-serif", category: "display" },
  { key: "barlow", label: "Barlow Condensed", family: "'Barlow Condensed', Arial, sans-serif", category: "display" },

  { key: "playfair", label: "Playfair Display", family: "'Playfair Display', Georgia, serif", category: "serif" },
  { key: "cinzel", label: "Cinzel", family: "'Cinzel', Georgia, serif", category: "serif" },

  { key: "pacifico", label: "Pacifico", family: "'Pacifico', cursive", category: "script" },
  { key: "dancingscript", label: "Dancing Script", family: "'Dancing Script', cursive", category: "script" },
];

export const FONT_NAMES: string[] = FONT_CATALOG.map(f =>
  f.family.split(",")[0].replace(/'/g, "").trim()
);

export const FONT_KEYS: string[] = FONT_CATALOG.map(f => f.key);

export function getFontByKey(key?: string | null): FontEntry {
  return FONT_CATALOG.find(f => f.key === key) ?? FONT_CATALOG[0];
}

export function isKnownFontKey(key?: string | null): boolean {
  return Boolean(key && FONT_CATALOG.some(f => f.key === key));
}

export function getRecommendedFonts(context?: string | null): FontEntry[] {
  const text = (context || "").toLowerCase();

  const keys =
    text.includes("solar") || text.includes("energ") || text.includes("tech")
      ? ["inter", "exo2", "barlow", "oswald", "poppins"]
      : text.includes("lujo") || text.includes("abogado") || text.includes("inmobili") || text.includes("premium")
      ? ["playfair", "cinzel", "montserrat", "raleway", "inter"]
      : text.includes("restaurante") || text.includes("café") || text.includes("comida") || text.includes("bar")
      ? ["poppins", "nunito", "pacifico", "montserrat", "lato"]
      : text.includes("gym") || text.includes("fitness") || text.includes("deporte") || text.includes("discoteca")
      ? ["anton", "bebas", "oswald", "barlow", "exo2"]
      : ["inter", "poppins", "montserrat", "raleway", "bebas"];

  return keys.map(getFontByKey);
}

const injectedFonts = new Set<string>();

export function injectCustomFont(fontName?: string | null, fontUrl?: string | null) {
  if (!fontName || !fontUrl) return;

  const urlKey = btoa(fontUrl).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 16);
  const safeName = `${fontName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${urlKey}`;
  const key = `${safeName}-${fontUrl}`;

  if (injectedFonts.has(key)) return;

  const style = document.createElement("style");
  style.setAttribute("data-hazpost-font", safeName);
  style.innerHTML = `
    @font-face {
      font-family: "${safeName}";
      src: url("${fontUrl}");
      font-display: swap;
    }
  `;

  document.head.appendChild(style);
  injectedFonts.add(key);
}