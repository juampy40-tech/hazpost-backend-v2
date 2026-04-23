import { Router } from "express";
import { db, appSettingsTable, imageVariantsTable } from "@workspace/db";
import { eq, gte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { FONT_CATALOG } from "../services/fontLoader.js";

const router = Router();
const SETTINGS_KEY = "custom_fonts";

interface CustomFont {
  id: string;
  name: string;
  family: string;
  data: string;   // base64
  mimeType: string;
  uploadedAt: string;
}

async function loadFonts(): Promise<CustomFont[]> {
  const [row] = await db.select({ value: appSettingsTable.value })
    .from(appSettingsTable).where(eq(appSettingsTable.key, SETTINGS_KEY)).limit(1);
  if (!row) return [];
  try { return JSON.parse(row.value) as CustomFont[]; } catch { return []; }
}

async function saveFonts(fonts: CustomFont[]): Promise<void> {
  const value = JSON.stringify(fonts);
  const [existing] = await db.select({ id: appSettingsTable.id })
    .from(appSettingsTable).where(eq(appSettingsTable.key, SETTINGS_KEY)).limit(1);
  if (existing) {
    await db.update(appSettingsTable).set({ value, updatedAt: new Date() })
      .where(eq(appSettingsTable.key, SETTINGS_KEY));
  } else {
    await db.insert(appSettingsTable).values({ key: SETTINGS_KEY, value });
  }
}

// The 13 base fonts shown in the approval editor font selector
const BASE_FONT_KEYS = [
  "bebas", "anton", "fjalla", "oswald", "barlow",
  "montserrat", "inter", "poppins", "raleway", "lato",
  "playfair", "cinzel", "pacifico",
];

// Human-readable label overrides (replaces FONT_CATALOG entry.family for display)
const FONT_DISPLAY_LABELS: Record<string, string> = {
  montserrat: "Eco ★",
  inter: "Inter",
};

interface PersistedFontSet {
  fonts: Array<{ key: string; label: string; family: string; isTrending?: boolean }>;
  trending: string[];
  generatedAt: string; // ISO date
}

const FONT_SET_SETTINGS_PREFIX = "font_set_user_";

async function loadPersistedFontSet(userId: number): Promise<PersistedFontSet | null> {
  const key = `${FONT_SET_SETTINGS_PREFIX}${userId}`;
  const [row] = await db.select({ value: appSettingsTable.value })
    .from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  if (!row) return null;
  try { return JSON.parse(row.value) as PersistedFontSet; } catch { return null; }
}

async function persistFontSet(userId: number, data: PersistedFontSet): Promise<void> {
  const key = `${FONT_SET_SETTINGS_PREFIX}${userId}`;
  const value = JSON.stringify(data);
  const [existing] = await db.select({ id: appSettingsTable.id })
    .from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  if (existing) {
    await db.update(appSettingsTable).set({ value, updatedAt: new Date() })
      .where(eq(appSettingsTable.key, key));
  } else {
    await db.insert(appSettingsTable).values({ key, value });
  }
}

function isFontSetStale(data: PersistedFontSet): boolean {
  const generated = new Date(data.generatedAt).getTime();
  const msInMonth = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - generated > msInMonth;
}

/**
 * GET /api/fonts/font-set
 * Returns a personalized 13-font set, persisted per-user with monthly refresh.
 * - Reads cached set from app_settings; regenerates only if older than 30 days.
 * - Up to 3 least-used base fonts replaced by globally trending fonts.
 * Response: { fonts: [{ key, label, family, isTrending? }], trending: string[] }
 */
router.get("/font-set", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  try {
    // 1. Return cached set if fresh (< 30 days old)
    const cached = await loadPersistedFontSet(userId);
    if (cached && !isFontSetStale(cached)) {
      return res.json(cached);
    }

    // 2. Compute new personalized set
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const userRows = await db
      .select({ font: imageVariantsTable.overlayFont, cnt: sql<number>`count(*)` })
      .from(imageVariantsTable)
      .where(sql`${imageVariantsTable.userId} = ${userId} AND ${imageVariantsTable.createdAt} >= ${since}`)
      .groupBy(imageVariantsTable.overlayFont);

    const userUsed = new Set<string>(
      userRows
        .filter(r => r.font && BASE_FONT_KEYS.includes(r.font))
        .map(r => r.font as string)
    );

    const userUnused = BASE_FONT_KEYS.filter(k => !userUsed.has(k));

    const globalRows = await db
      .select({ font: imageVariantsTable.overlayFont, cnt: sql<number>`count(*)` })
      .from(imageVariantsTable)
      .where(gte(imageVariantsTable.createdAt, since))
      .groupBy(imageVariantsTable.overlayFont)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    const allCatalogKeys = Object.keys(FONT_CATALOG);
    const trending = globalRows
      .map(r => r.font)
      .filter((f): f is string => Boolean(f) && allCatalogKeys.includes(f) && !BASE_FONT_KEYS.includes(f))
      .slice(0, 3);

    const personalizedSet = [...BASE_FONT_KEYS];
    for (let i = 0; i < Math.min(trending.length, 3, userUnused.length); i++) {
      const replaceKey = userUnused[userUnused.length - 1 - i];
      const idx = personalizedSet.indexOf(replaceKey);
      if (idx !== -1) personalizedSet[idx] = trending[i];
    }

    const fonts = personalizedSet.map(key => {
      const entry = FONT_CATALOG[key];
      return {
        key,
        label: FONT_DISPLAY_LABELS[key] ?? entry?.family ?? key,
        family: entry ? `${entry.family},${entry.fallback}` : "sans-serif",
        isTrending: trending.includes(key),
      };
    });

    const result: PersistedFontSet = { fonts, trending, generatedAt: new Date().toISOString() };

    // 3. Persist asynchronously (non-blocking)
    persistFontSet(userId, result).catch(() => {});

    res.json(result);
  } catch (_err) {
    // Fallback: return base set without rotation
    const fonts = BASE_FONT_KEYS.map(key => {
      const entry = FONT_CATALOG[key];
      return { key, label: FONT_DISPLAY_LABELS[key] ?? entry?.family ?? key, family: entry ? `${entry.family},${entry.fallback}` : "sans-serif", isTrending: false };
    });
    res.json({ fonts, trending: [], generatedAt: new Date().toISOString() });
  }
});

// GET /api/fonts — list custom fonts (data omitted for performance)
router.get("/", requireAuth, async (_req, res) => {
  try {
    const fonts = await loadFonts();
    res.json({ fonts: fonts.map(f => ({ id: f.id, name: f.name, family: f.family, mimeType: f.mimeType, uploadedAt: f.uploadedAt })) });
  } catch (err: any) {
    res.status(500).json({ error: "Error al cargar tipografías" });
  }
});

// GET /api/fonts/:id/data — return base64 data for a specific font (for SVG embedding)
router.get("/:id/data", requireAuth, async (req, res) => {
  try {
    const fonts = await loadFonts();
    const font = fonts.find(f => f.id === req.params.id);
    if (!font) return res.status(404).json({ error: "Tipografía no encontrada" });
    res.json({ id: font.id, name: font.name, family: font.family, data: font.data, mimeType: font.mimeType });
  } catch (err: any) {
    res.status(500).json({ error: "Error al cargar tipografía" });
  }
});

// POST /api/fonts — upload a custom font
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, data, mimeType, filename } = req.body as {
      name?: string;
      data?: string;
      mimeType?: string;
      filename?: string;
    };

    if (!data || !name) {
      return res.status(400).json({ error: "Se requiere name y data (base64)" });
    }

    const allowedMimes = ["font/ttf", "font/otf", "font/woff", "font/woff2", "application/font-woff", "application/x-font-ttf", "application/x-font-otf"];
    const safeMime = mimeType && allowedMimes.includes(mimeType) ? mimeType : "font/ttf";

    // family = CSS-safe version of name (no spaces, CamelCase)
    const family = `Custom${name.replace(/[^a-zA-Z0-9]/g, "")}`;

    const fonts = await loadFonts();

    // Prevent duplicates by name
    if (fonts.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: `Ya existe una tipografía llamada "${name}"` });
    }

    const newFont: CustomFont = {
      id: `custom_${Date.now()}`,
      name,
      family,
      data,
      mimeType: safeMime,
      uploadedAt: new Date().toISOString(),
    };

    fonts.push(newFont);
    await saveFonts(fonts);

    res.status(201).json({ ok: true, font: { id: newFont.id, name: newFont.name, family: newFont.family, mimeType: newFont.mimeType } });
  } catch (err: any) {
    console.error("[fonts] upload error:", err);
    res.status(500).json({ error: "Error al guardar tipografía" });
  }
});

// DELETE /api/fonts/:id — remove a custom font
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const fonts = await loadFonts();
    const idx = fonts.findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Tipografía no encontrada" });
    fonts.splice(idx, 1);
    await saveFonts(fonts);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar tipografía" });
  }
});

export default router;
