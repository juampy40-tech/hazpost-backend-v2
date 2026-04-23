import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { db, appSettingsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { validateBase64Mime } from "../lib/fileScanner.js";
import { analyzeWebsite } from "./analyze-website.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../assets");

const LOGO_KEYS = {
  blue: "brand_logo_blue",
  white: "brand_logo_white",
  icon: "brand_logo_icon",
} as const;

type LogoVariant = keyof typeof LOGO_KEYS;

const DEFAULT_FILES: Record<LogoVariant, string> = {
  blue: path.join(ASSETS_DIR, "eco-logo-blue.png"),
  white: path.join(ASSETS_DIR, "eco-logo-white.png"),
  icon: path.join(ASSETS_DIR, "eco-logo-icon.png"),
};

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const router = Router();

// GET /api/brand/logo?v=blue|white|icon  (default: blue)
router.get("/logo", async (req, res) => {
  const variant = (req.query["v"] as string | undefined) ?? "blue";
  const key = LOGO_KEYS[variant as LogoVariant];

  if (key) {
    try {
      const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
      if (row?.value) {
        const commaIdx = row.value.indexOf(",");
        const meta = row.value.slice(0, commaIdx);
        const b64 = row.value.slice(commaIdx + 1);
        const mime = meta.replace("data:", "").replace(";base64", "");
        const buf = Buffer.from(b64, "base64");
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.send(buf);
      }
    } catch {
      // fall through to default
    }
  }

  const defaultFile = DEFAULT_FILES[(variant as LogoVariant)] ?? DEFAULT_FILES.blue;
  if (fs.existsSync(defaultFile)) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.sendFile(defaultFile);
  }

  res.status(404).json({ error: "Logo not found" });
});

// GET /api/brand/logos  — metadata for dashboard
router.get("/logos", async (_req, res) => {
  const allKeys = Object.values(LOGO_KEYS);
  const rows = await db
    .select({ key: appSettingsTable.key })
    .from(appSettingsTable)
    .where(inArray(appSettingsTable.key, allKeys));

  const present = new Set(rows.map((r) => r.key));
  res.json({
    blue:  { hasCustom: present.has(LOGO_KEYS.blue),  defaultFile: "eco-logo-blue.png"  },
    white: { hasCustom: present.has(LOGO_KEYS.white), defaultFile: "eco-logo-white.png" },
    icon:  { hasCustom: present.has(LOGO_KEYS.icon),  defaultFile: "eco-logo-icon.png"  },
  });
});

// POST /api/brand/logo
// Body (JSON): { variant: "blue"|"white"|"icon", imageData: "data:image/png;base64,..." }
router.post("/logo", async (req, res) => {
  const { variant = "blue", imageData } = req.body as { variant?: string; imageData?: string };

  if (!imageData || !imageData.startsWith("data:image/")) {
    return res.status(400).json({ error: "imageData must be a base64 data URL (data:image/...)" });
  }
  const key = LOGO_KEYS[variant as LogoVariant];
  if (!key) return res.status(400).json({ error: "variant must be blue, white, or icon" });

  const b64 = imageData.split(",")[1] ?? "";
  if (Buffer.byteLength(b64, "base64") > MAX_LOGO_BYTES) {
    return res.status(413).json({ error: "Logo file too large (max 2 MB)" });
  }

  const scanResult = await validateBase64Mime(b64);
  if (!scanResult.ok) {
    return res.status(400).json({ error: scanResult.error });
  }

  await db
    .insert(appSettingsTable)
    .values({ key, value: imageData })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: imageData, updatedAt: new Date() } });

  res.json({ ok: true, variant });
});

// DELETE /api/brand/logo?v=blue|white|icon  — restore default
router.delete("/logo", async (req, res) => {
  const variant = (req.query["v"] as string | undefined) ?? "blue";
  const key = LOGO_KEYS[variant as LogoVariant];
  if (!key) return res.status(400).json({ error: "Invalid variant" });

  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
  res.json({ ok: true, variant, restored: "default" });
});

/** GET /api/brand/profile — return onboarding/brand profile for current user */
router.get("/profile", async (req, res) => {
  const [row] = await db
    .select({
      onboardingStep:     usersTable.onboardingStep,
      brandIndustry:      usersTable.brandIndustry,
      brandCountry:       usersTable.brandCountry,
      brandWebsite:       usersTable.brandWebsite,
      brandDescription:   usersTable.brandDescription,
      brandPrimaryColor:  usersTable.brandPrimaryColor,
      brandSecondaryColor:usersTable.brandSecondaryColor,
      brandFont:          usersTable.brandFont,
      brandFontUrl:       usersTable.brandFontUrl,
      brandTone:          usersTable.brandTone,
      brandAudienceDesc:  usersTable.brandAudienceDesc,
      brandReferenceImages: usersTable.brandReferenceImages,
      displayName:        usersTable.displayName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId))
    .limit(1);

  if (!row) return res.status(404).json({ error: "User not found" });

  return res.json({
    ...row,
    brandReferenceImages: row.brandReferenceImages ? JSON.parse(row.brandReferenceImages) : [],
  });
});

/** PUT /api/brand/profile — update onboarding/brand profile */
router.put("/profile", async (req, res) => {
  const {
    onboardingStep,
    brandIndustry,
    brandCountry,
    brandWebsite,
    brandDescription,
    brandPrimaryColor,
    brandSecondaryColor,
    brandFont,
    brandFontUrl,
    brandTone,
    brandAudienceDesc,
    brandReferenceImages,
    displayName,
  } = req.body as {
    onboardingStep?: number;
    brandIndustry?: string;
    brandCountry?: string;
    brandWebsite?: string;
    brandDescription?: string;
    brandPrimaryColor?: string;
    brandSecondaryColor?: string;
    brandFont?: string;
    brandFontUrl?: string;
    brandTone?: string;
    brandAudienceDesc?: string;
    brandReferenceImages?: string[];
    displayName?: string;
  };

  const updateFields: Partial<typeof usersTable.$inferInsert> = {};
  if (onboardingStep !== undefined) updateFields.onboardingStep = onboardingStep;
  if (brandIndustry   !== undefined) updateFields.brandIndustry  = brandIndustry;
  if (brandCountry    !== undefined) updateFields.brandCountry   = brandCountry;
  if (brandWebsite    !== undefined) updateFields.brandWebsite   = brandWebsite;
  if (brandDescription!== undefined) updateFields.brandDescription = brandDescription;
  if (brandPrimaryColor !== undefined) updateFields.brandPrimaryColor = brandPrimaryColor;
  if (brandSecondaryColor!== undefined) updateFields.brandSecondaryColor = brandSecondaryColor;
  if (brandFont       !== undefined) updateFields.brandFont      = brandFont;
  if (brandFontUrl    !== undefined) updateFields.brandFontUrl   = brandFontUrl;
  if (brandTone       !== undefined) updateFields.brandTone      = brandTone;
  if (brandAudienceDesc!== undefined) updateFields.brandAudienceDesc = brandAudienceDesc;
  if (brandReferenceImages !== undefined) updateFields.brandReferenceImages = JSON.stringify(brandReferenceImages);
  if (displayName     !== undefined) updateFields.displayName    = displayName;

  if (Object.keys(updateFields).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  await db.update(usersTable)
    .set({ ...updateFields, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user!.userId));

  return res.json({ ok: true });
});

/**
 * POST /api/brand/analyze-website
 * Analyzes a website URL with AI and returns brand context fields.
 * Compatible with the onboarding wizard (no businessId required).
 * Returns { description, audience, tone, primaryColor } — any field can be null.
 */
router.post("/analyze-website", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL requerida" });
  }
  const result = await analyzeWebsite(url);
  return res.json(result);
});

export default router;
