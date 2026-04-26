import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer, generateImageBufferWithElement } from "@workspace/integrations-openai-ai-server/image";
import { db } from "@workspace/db";
import { nichesTable, postsTable, imageVariantsTable, contentHistoryTable, generationBatchesTable, brandProfilesTable, businessesTable, publishingSchedulesTable, captionAddonsTable } from "@workspace/db";
import type { CaptionAddon } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { getSmartContextForUser, getUserTopCaptions, getSuspendedNiches, getApprovalScoreMap, getUserVisualPrefs, getUserVisualStructuredDefaults } from "./learning.service.js";
import { getCreditCosts, creditCostOf, checkAndDeductCreditsInTx, refundCredits, reserveCredits, deductAndCreateLedger, settleLedger, refundImageFailure } from "../lib/creditCosts.js";
import { calcGptCostUsd, computeGenerationCostUsd, totalGenerationCostUsd } from "../lib/generationCosts.js";
import { eq, desc, inArray, and, or, gte, lte, lt, sql as drizzleSql, isNotNull } from "drizzle-orm";
import crypto from "crypto";
import sharp from "sharp";
import path from "path";
import { readFile as readFileAsync } from "fs/promises";
import { fileURLToPath } from "url";
import { resolveFont } from "./fontLoader.js";
import { contentHistoryScopeSafe } from "../lib/tenant.js";
import { subIndustryToSlug, INDUSTRY_CATALOG } from "../lib/industries.js";
import type { IndustryAiContext } from "../lib/industries.js";
import { getCustomIndustryAiContext, buildEnhancedIndustryContext } from "../lib/industryAiContext.js";
import { IG_CAPTION_BODY_LIMIT, getBodyLimitForPlatform } from "../lib/socialLimits.js";
import { buildOccupationMap, dayKeyForTimezone } from "../lib/platformDates.js";
import { localHourToUTC, hourInTimezone, ADMIN_TZ, startOfDayInTimezone } from "../lib/timezone.js";
import { getSchedulingDefaultsSimple } from "../lib/schedulingDefaults.js";
import { fetchSchedulerSuggestions, getWeeklySlots, type SchedulerSuggestions } from "../lib/postingSchedule.js";


// Composite brand elements onto a generated image (logos, headlines, taglines).
// Font loading is handled by fontLoader.ts — warmFontCache() is called at server startup.
// resolveFont(preset) returns { css, family } for SVG @font-face injection.
const _assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

export type LogoPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type LogoColor    = "white" | "blue" | "icon";
export type TextStyle    = "cinema" | "neon" | "bloque" | "eco" | "duotono" | "titanio" | "editorial"
                         | "bebas" | "playfair" | "montserrat" | "roboto" | "oswald"
                         | "raleway" | "nunito" | "poppins" | "lato" | "sourcesans"
                         | "anton" | "exo2" | "barlow" | "rajdhani" | "fjalla" | "ptserif";
export type ImageFilter  = "none" | "warm" | "cool" | "dramatic" | "vintage" | "dark" | "vivid" | "haze";

// Word-wrap helper for SVG text
const MAX_HEADLINE_LINES = 3;

function wrapHeadline(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (test.length <= maxCharsPerLine) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
    // Hard cap: stop at MAX_HEADLINE_LINES lines, truncate with ellipsis
    if (lines.length >= MAX_HEADLINE_LINES) break;
  }
  if (current && lines.length < MAX_HEADLINE_LINES) {
    lines.push(current);
  } else if (lines.length === MAX_HEADLINE_LINES && current) {
    // There's leftover text — add ellipsis to the last line
    const last = lines[MAX_HEADLINE_LINES - 1];
    if (last.length + 3 <= maxCharsPerLine) {
      lines[MAX_HEADLINE_LINES - 1] = last + "...";
    }
  }
  return lines;
}

export type TextPosition = "top" | "center" | "bottom";

function computeTextY(
  h: number,
  fontSize: number,
  lineHeight: number,
  lineCount: number,
  position: TextPosition,
  marginPct: number = 0.10
): number {
  const totalTextH = lineCount * lineHeight;
  const pad = Math.round(h * marginPct);
  if (position === "top")    return pad + Math.round(fontSize * 0.85);
  if (position === "center") return Math.round(h / 2 - totalTextH / 2 + fontSize * 0.85);
  return h - pad - totalTextH + Math.round(fontSize * 0.85);
}


function buildHeadlineSvg(
  w: number,
  h: number,
  lines: string[],
  fontSize: number,
  lineHeight: number,
  textStyle: TextStyle,
  textPosition: TextPosition = "bottom",
  sizeKey: string = "medium",
  overlayFont?: string,
  brandTagline?: string,
  accentColor?: string,          // Brand primary color (titleColor1)
  titleColor2?: string,          // Brand secondary color for secondary accent elements
  contentType?: string,          // Determines safe-zone margins: story/reel → 15%, feed → 10%
  font2?: string                 // Optional second font for lines 2-N of the headline
): string {
  const cx = w / 2;
  // Accent color helpers — when no brand color is configured, use white (neutral, no ECO contamination)
  const A  = accentColor ?? "#FFFFFF";          // primary accent (titleColor1)
  const AD = titleColor2 ?? accentColor ?? "#FFFFFF";  // secondary accent (titleColor2)
  // Resolve embedded font — overlayFont preset takes priority over textStyle.
  // "default" (or absent) means: let textStyle decide (no override).
  const effectiveFont = (overlayFont && overlayFont !== "default") ? overlayFont : textStyle;
  const { css: embeddedFontCss, family: embeddedFontFamily } = resolveFont(effectiveFont);
  // Dual-font: optional second font for lines 2-N
  const font2Resolved = (font2 && font2 !== "default") ? font2 : null;
  const { css: embeddedFont2Css, family: embeddedFont2Family } = font2Resolved
    ? resolveFont(font2Resolved)
    : { css: "", family: "" };
  // Combined CSS — all fonts embedded once so every style template picks them up
  const allFontCss = font2Resolved ? embeddedFontCss + embeddedFont2Css : embeddedFontCss;
  const totalTextH = lines.length * lineHeight;

  // Platform-aware safe-zone margins:
  // - story/reel: 15% — UI chrome (username top, likes/comments bottom) covers this area
  // - image/carousel/feed: 10% — standard platform preview cropping margin
  const isTallFormat = contentType === "story" || contentType === "reel";
  const marginPct = isTallFormat ? 0.15 : 0.10;

  let textY = computeTextY(h, fontSize, lineHeight, lines.length, textPosition, marginPct);

  // Universal clamp — text must NEVER touch or cross the safe zone.
  // All styles reserve space for the brand tagline row below the last line.
  const taglineExtra = Math.round(lineHeight * 0.85) + Math.round(fontSize * 0.4);
  const bottomSafe = h - Math.round(h * marginPct) - taglineExtra;
  const naturalLastY = textY + (lines.length - 1) * lineHeight;
  if (naturalLastY > bottomSafe) {
    textY -= (naturalLastY - bottomSafe);
  }
  // Clamp top — first baseline must stay within the safe margin
  const topMin = Math.round(h * marginPct) + Math.round(fontSize * 0.85);
  if (textY < topMin) {
    textY = topMin;
  }

  // Dual-font: lines[0] uses font1 (inherited from <text>), lines[1+] use font2 if set.
  // font-family attribute on <tspan> overrides the parent <text> font-family.
  const tspans = lines
    .map((line, i) => {
      const f2Attr = (i >= 1 && font2Resolved) ? ` font-family="${embeddedFont2Family}"` : "";
      return `<tspan x="${cx}" dy="${i === 0 ? 0 : lineHeight}"${f2Attr}>${line}</tspan>`;
    })
    .join("");

  // Accent line rule: index 1 (second line) gets accent color when 2+ lines exist.
  // A already has a hard-coded fallback, so the rule always applies.
  const tspansAccented = lines
    .map((line, i) => {
      const isAccent = i === 1 && lines.length >= 2;
      const fillAttr = isAccent ? ` fill="${A}"` : "";
      const f2Attr = (i >= 1 && font2Resolved) ? ` font-family="${embeddedFont2Family}"` : "";
      return `<tspan x="${cx}" dy="${i === 0 ? 0 : lineHeight}"${fillAttr}${f2Attr}>${line}</tspan>`;
    })
    .join("");
  // Accent line Y-position (second line)
  const accentLineY2 = textY + lineHeight;

  // ── Brand tagline — only rendered when brandTagline is a non-empty string ──
  const lastLineY    = textY + (lines.length - 1) * lineHeight;
  const taglineY     = lastLineY + Math.round(lineHeight * 0.75);
  const tagFontMultiplier = (sizeKey === "sm" || sizeKey === "medium") ? 0.50 : sizeKey === "small" ? 0.45 : 0.38;
  const tagFontSz    = Math.round(fontSize * tagFontMultiplier);
  const tagDotW      = Math.round(w * 0.07);
  const taglineText  = (brandTagline ?? "").trim();
  // Fixed image-relative positions — always visible regardless of tagline length
  // (char-width estimation was unreliable: Arial Bold uppercase is wider than estimated)
  const tagLeftDashX  = Math.round(w * 0.07);   // 7% desde borde izquierdo
  const tagRightDashX = Math.round(w * 0.86);   // 86% = 7% desde borde derecho
  const tagDashY      = taglineY - Math.round(tagFontSz * 0.6);
  const tagDashH      = Math.round(h * 0.004);
  const taglineDefs  = taglineText ? `
    <filter id="tgshadow">
      <feDropShadow dx="0" dy="1" stdDeviation="4" flood-color="#000000" flood-opacity="0.9"/>
    </filter>
    <linearGradient id="tgline" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${AD}"/>
      <stop offset="50%"  stop-color="${A}"/>
      <stop offset="100%" stop-color="${AD}"/>
    </linearGradient>` : "";
  const taglineBody  = taglineText ? `
    <rect x="${tagLeftDashX}"  y="${tagDashY}" width="${tagDotW}" height="${tagDashH}" fill="url(#tgline)" rx="2"/>
    <rect x="${tagRightDashX}" y="${tagDashY}" width="${tagDotW}" height="${tagDashH}" fill="url(#tgline)" rx="2"/>
    <text x="${cx}" y="${taglineY}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${tagFontSz}" font-weight="700"
          fill="white" letter-spacing="2"
          stroke="#000000" stroke-width="3" paint-order="stroke fill"
          filter="url(#tgshadow)">${taglineText}</text>` : "";

  // Gradient band helpers — adapts to text position
  const gradH = Math.round(h * 0.44);
  const pad = Math.round(h * 0.055);
  const gradY = textPosition === "top"
    ? 0
    : textPosition === "center"
    ? Math.round(h / 2 - totalTextH / 2 - pad * 2)
    : h - gradH;

  const gradientDef = textPosition === "top"
    ? `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#040813" stop-opacity="0.92"/>
        <stop offset="55%"  stop-color="#0a0e1a" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#0a0e1a" stop-opacity="0"/>
      </linearGradient>`
    : textPosition === "center"
    ? `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#0a0e1a" stop-opacity="0"/>
        <stop offset="30%"  stop-color="#0a0e1a" stop-opacity="0.78"/>
        <stop offset="70%"  stop-color="#0a0e1a" stop-opacity="0.78"/>
        <stop offset="100%" stop-color="#0a0e1a" stop-opacity="0"/>
      </linearGradient>`
    : `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#0a0e1a" stop-opacity="0"/>
        <stop offset="55%"  stop-color="#0a0e1a" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#040813" stop-opacity="0.92"/>
      </linearGradient>`;

  const gradRectH = textPosition === "center"
    ? totalTextH + Math.round(pad * 4)
    : gradH;

  if (textStyle === "cinema") {
    // Accent rule: index 1 (second line) in brand color; all others white.
    // tspansAccented already encodes fill="${A}" on index 1 via per-tspan attribute.
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs><style>${allFontCss}</style>${gradientDef}${taglineDefs}</defs>
      <rect x="0" y="${gradY}" width="${w}" height="${gradRectH}" fill="url(#g)"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="2"
            fill="none" stroke="#0a0e1a" stroke-width="8" stroke-linejoin="round">
        ${tspans}
      </text>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="2"
            fill="white" stroke="#000000" stroke-width="5" paint-order="stroke fill">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "neon") {
    // Accent rule: index 1 (second line) gets primary accent; others white with neon glow.
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        <filter id="glow">
          <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#ffffff" flood-opacity="0.9"/>
          <feDropShadow dx="0" dy="0" stdDeviation="20" flood-color="${AD}" flood-opacity="0.5"/>
          <feDropShadow dx="2" dy="4" stdDeviation="6"  flood-color="#000000" flood-opacity="0.8"/>
        </filter>
        ${taglineDefs}
      </defs>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="3"
            fill="white" filter="url(#glow)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "eco") {
    const { css: fontFace } = resolveFont("inter");
    // Accent rule: index 1 (second line) italic + accent; all others white normal.
    const accentLine  = lines.length >= 2 ? lines[1] : null;
    // Skip line 2 (accent line) entirely — no tspan, no cursor advance, no filter artifact.
    // Compute dy relative to the last actually-rendered line so lines 3+ keep correct spacing.
    const ecoBaseTspans = (() => {
      let result = "";
      let prevRenderedI = -1;
      for (let i = 0; i < lines.length; i++) {
        if (i === 1 && accentLine) continue;
        const dy = prevRenderedI === -1 ? 0 : (i - prevRenderedI) * lineHeight;
        result += `<tspan x="${cx}" dy="${dy}">${lines[i]}</tspan>`;
        prevRenderedI = i;
      }
      return result;
    })();
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${fontFace}</style>
        <filter id="sh">
          <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000000" flood-opacity="0.7"/>
        </filter>
        <linearGradient id="ecobg" x1="0" y1="${gradY}" x2="0" y2="${gradY + gradRectH}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
        </linearGradient>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${gradY}" width="${w}" height="${gradRectH}" fill="url(#ecobg)"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="Inter,'Helvetica Neue',Arial,sans-serif"
            font-size="${fontSize}" font-weight="800" letter-spacing="-0.5"
            fill="white" filter="url(#sh)">
        ${ecoBaseTspans}
      </text>
      ${accentLine ? `<text x="${cx}" y="${accentLineY2}" text-anchor="middle"
            font-family="Inter,'Helvetica Neue',Arial,sans-serif"
            font-size="${fontSize}" font-weight="800" letter-spacing="-0.5"
            font-style="italic"
            fill="${A}" stroke="#000000" stroke-width="5" paint-order="stroke fill"
            filter="url(#sh)">
        <tspan x="${cx}">${accentLine}</tspan>
      </text>` : ""}
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "duotono") {
    // Accent rule: index 1 (second line) gets brand gradient; all others white.
    const accentLineDt = lines.length >= 2 ? lines[1] : null;
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        ${gradientDef}
        <linearGradient id="dg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${A}"/>
          <stop offset="100%" stop-color="${AD}"/>
        </linearGradient>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${gradY}" width="${w}" height="${gradRectH}" fill="url(#g)"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="2"
            fill="none" stroke="#0a0e1a" stroke-width="8" stroke-linejoin="round">
        ${tspans}
      </text>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="2" fill="white">
        ${tspans}
      </text>
      ${accentLineDt ? `<text x="${cx}" y="${accentLineY2}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="2"
            fill="none" stroke="#0a0e1a" stroke-width="8" stroke-linejoin="round">
        <tspan x="${cx}">${accentLineDt}</tspan>
      </text>
      <text x="${cx}" y="${accentLineY2}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="2" fill="url(#dg)">
        <tspan x="${cx}">${accentLineDt}</tspan>
      </text>` : ""}
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "titanio") {
    // All text filled with white→cyan vertical gradient + thin accent line
    const textTop = textY - Math.round(fontSize * 0.85);
    const textBot = textTop + totalTextH;
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        ${gradientDef}
        <linearGradient id="tg" x1="0" y1="${textTop}" x2="0" y2="${textBot}" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="#FFFFFF"/>
          <stop offset="55%"  stop-color="${A}88"/>
          <stop offset="100%" stop-color="${A}"/>
        </linearGradient>
        <filter id="glow">
          <feDropShadow dx="0" dy="0" stdDeviation="8"  flood-color="${A}" flood-opacity="0.4"/>
          <feDropShadow dx="0" dy="3" stdDeviation="6"  flood-color="#000000" flood-opacity="0.85"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${gradY}" width="${w}" height="${gradRectH}" fill="url(#g)"/>
      <line x1="${cx - w * 0.18}" y1="${textTop - Math.round(h * 0.022)}"
            x2="${cx + w * 0.18}" y2="${textTop - Math.round(h * 0.022)}"
            stroke="${A}" stroke-width="${Math.round(h * 0.003)}" stroke-linecap="round" opacity="0.6"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="3"
            fill="white" filter="url(#glow)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "editorial") {
    // No background — text floats over the photo with strong shadow + thin cyan accent line.
    // Accent rule: index 1 (second line) italic + accent; all others white normal.
    const textTop   = textY - Math.round(fontSize * 0.85);
    const accentLineEd = lines.length >= 2 ? lines[1] : null;
    // Skip line 2 (accent line) entirely — no tspan, no cursor advance, no filter artifact.
    // Compute dy relative to the last actually-rendered line so lines 3+ keep correct spacing.
    const editorialBaseTspans = (() => {
      let result = "";
      let prevRenderedI = -1;
      for (let i = 0; i < lines.length; i++) {
        if (i === 1 && accentLineEd) continue;
        const dy = prevRenderedI === -1 ? 0 : (i - prevRenderedI) * lineHeight;
        result += `<tspan x="${cx}" dy="${dy}">${lines[i]}</tspan>`;
        prevRenderedI = i;
      }
      return result;
    })();
    const lineX1  = Math.round(w * 0.08);
    const lineX2  = Math.round(w * 0.92);
    const accentY = textTop - Math.round(h * 0.018);
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        <filter id="edshadow">
          <feDropShadow dx="0" dy="2" stdDeviation="6"  flood-color="#000000" flood-opacity="0.95"/>
          <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#000000" flood-opacity="0.6"/>
        </filter>
        ${taglineDefs}
      </defs>
      <line x1="${lineX1}" y1="${accentY}" x2="${lineX2}" y2="${accentY}"
            stroke="url(#tgline)" stroke-width="${Math.round(h * 0.005)}" stroke-linecap="round"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="800" letter-spacing="0.5"
            fill="white" filter="url(#edshadow)">
        ${editorialBaseTspans}
      </text>
      ${accentLineEd ? `<text x="${cx}" y="${accentLineY2}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="800" letter-spacing="0.5"
            font-style="italic"
            fill="${A}" stroke="#000000" stroke-width="5" paint-order="stroke fill"
            filter="url(#edshadow)">
        <tspan x="${cx}">${accentLineEd}</tspan>
      </text>` : ""}
      ${taglineBody}
    </svg>`;
  }

  // ── NEW FONT FAMILY STYLES ────────────────────────────────────────────────

  if (textStyle === "bebas") {
    // Extra-wide letter-spacing, ECO-blue left accent bar, heavy outline
    const barW = Math.round(w * 0.009);
    const barX = Math.round(w * 0.055);
    const barTop  = textY - Math.round(fontSize * 0.85);
    const barH    = lines.length * lineHeight;
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        <filter id="bbshadow">
          <feDropShadow dx="0" dy="3" stdDeviation="10" flood-color="#000000" flood-opacity="1"/>
          <feDropShadow dx="0" dy="0" stdDeviation="2"  flood-color="#000000" flood-opacity="0.8"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="${barX}" y="${barTop}" width="${barW}" height="${barH}" fill="${AD}" rx="${Math.round(barW / 2)}"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="8"
            fill="none" stroke="#000000" stroke-width="10" stroke-linejoin="round">
        ${tspans}
      </text>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="8"
            fill="white" filter="url(#bbshadow)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "playfair") {
    // Serif italic — elegant editorial with decorative ornamental dot separators
    const ornY = textY - Math.round(fontSize * 0.85) - Math.round(h * 0.024);
    const ornR = Math.round(w * 0.005);
    const ornGap = Math.round(w * 0.022);
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        ${gradientDef}
        <filter id="pfshadow">
          <feDropShadow dx="1" dy="2" stdDeviation="7"  flood-color="#000000" flood-opacity="0.9"/>
          <feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#000000" flood-opacity="0.4"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${gradY}" width="${w}" height="${gradRectH}" fill="url(#g)"/>
      <circle cx="${cx - ornGap * 2}" cy="${ornY}" r="${ornR}" fill="${A}" opacity="0.8"/>
      <circle cx="${cx}"             cy="${ornY}" r="${ornR}" fill="white"  opacity="0.9"/>
      <circle cx="${cx + ornGap * 2}" cy="${ornY}" r="${ornR}" fill="${A}" opacity="0.8"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="700" font-style="italic" letter-spacing="1"
            fill="none" stroke="#000000" stroke-width="6" stroke-linejoin="round" paint-order="stroke fill">
        ${tspans}
      </text>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="700" font-style="italic" letter-spacing="1"
            fill="white" filter="url(#pfshadow)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "montserrat") {
    // Modern corporate: clean sans text on semi-transparent band, accent line above
    const bandPad = Math.round(h * 0.025);
    const bandY   = textY - Math.round(fontSize * 0.85) - bandPad;
    const bandH   = lines.length * lineHeight + bandPad * 2;
    const accentLineY = bandY - Math.round(h * 0.006);
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        <filter id="mtshadow">
          <feDropShadow dx="0" dy="1" stdDeviation="4" flood-color="#000000" flood-opacity="0.7"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${bandY}" width="${w}" height="${bandH}" fill="#000000" fill-opacity="0.62"/>
      <line x1="${Math.round(w * 0.06)}" y1="${accentLineY}"
            x2="${Math.round(w * 0.94)}" y2="${accentLineY}"
            stroke="url(#tgline)" stroke-width="${Math.round(h * 0.004)}" stroke-linecap="round"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="700" letter-spacing="1.5"
            fill="white" filter="url(#mtshadow)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "roboto") {
    // Informative / news style: clean Arial text with info-chip style backdrop
    const chipPadX = Math.round(w * 0.045);
    const chipPadY = Math.round(h * 0.018);
    const chipY    = textY - Math.round(fontSize * 0.85) - chipPadY;
    const chipH    = lines.length * lineHeight + chipPadY * 2;
    const chipW    = w - chipPadX * 2;
    const indicW   = Math.round(w * 0.012);
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        <filter id="rbshadow">
          <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="${chipPadX}" y="${chipY}" width="${chipW}" height="${chipH}"
            fill="#000000" fill-opacity="0.72" rx="${Math.round(h * 0.012)}"/>
      <rect x="${chipPadX}" y="${chipY}" width="${indicW}" height="${chipH}"
            fill="${AD}" rx="${Math.round(h * 0.012)}"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${Math.round(fontSize * 0.92)}" font-weight="700" letter-spacing="0.5"
            fill="white" filter="url(#rbshadow)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  if (textStyle === "oswald") {
    // Stacked condensed style: narrow impact, tall letterforms, ECO-gradient text fill
    const textTop   = textY - Math.round(fontSize * 0.85);
    const textBot   = textTop + totalTextH;
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        ${gradientDef}
        <linearGradient id="owgrad" x1="0" y1="${textTop}" x2="0" y2="${textBot}" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="#FFFFFF"/>
          <stop offset="60%"  stop-color="${A}88"/>
          <stop offset="100%" stop-color="${AD}"/>
        </linearGradient>
        <filter id="owshadow">
          <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="${AD}" flood-opacity="0.55"/>
          <feDropShadow dx="2" dy="4" stdDeviation="6"  flood-color="#000000" flood-opacity="0.9"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${gradY}" width="${w}" height="${gradRectH}" fill="url(#g)"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="-1"
            fill="none" stroke="#000000" stroke-width="9" stroke-linejoin="round">
        ${tspans}
      </text>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="-1"
            fill="white" filter="url(#owshadow)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  // ── NEW FONT VARIANTS ────────────────────────────────────────────────────
  // Impact-family group: barlow, anton, fjalla → heavy block styles
  if (textStyle === "barlow" || textStyle === "anton" || textStyle === "fjalla") {
    const barH2 = lines.length * lineHeight + Math.round(h * 0.04);
    const barY2 = textY - Math.round(fontSize * 0.85) - Math.round(h * 0.02);
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        <filter id="ifshad">
          <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000000" flood-opacity="0.95"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${barY2}" width="${w}" height="${barH2}" fill="#000000" fill-opacity="0.55"/>
      <line x1="${Math.round(w*0.04)}" y1="${barY2}" x2="${Math.round(w*0.96)}" y2="${barY2}"
            stroke="${A}" stroke-width="${Math.round(h*0.005)}"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="900" letter-spacing="4"
            fill="white" filter="url(#ifshad)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  // Clean sans group: raleway, poppins, nunito, lato, sourcesans → montserrat-inspired
  if (textStyle === "raleway" || textStyle === "poppins" || textStyle === "nunito" ||
      textStyle === "lato"    || textStyle === "sourcesans") {
    const bandPad2 = Math.round(h * 0.022);
    const bandY2   = textY - Math.round(fontSize * 0.85) - bandPad2;
    const bandH2   = lines.length * lineHeight + bandPad2 * 2;
    const pillR    = Math.round(h * 0.018);
    const dotColor = A;
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        <filter id="csshad">
          <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${bandY2}" width="${w}" height="${bandH2}"
            fill="#000000" fill-opacity="0.68" rx="${pillR}"/>
      <circle cx="${Math.round(w*0.08)}" cy="${bandY2 + bandH2/2}" r="${Math.round(h*0.008)}" fill="${dotColor}" opacity="0.9"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${Math.round(fontSize*0.94)}" font-weight="700" letter-spacing="1"
            fill="white" filter="url(#csshad)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  // Structured condensed group: exo2, rajdhani → oswald-inspired with tech feel
  if (textStyle === "exo2" || textStyle === "rajdhani") {
    const cornerSz = Math.round(h * 0.018);
    const frameY   = textY - Math.round(fontSize * 0.85) - Math.round(h * 0.025);
    const frameH   = lines.length * lineHeight + Math.round(h * 0.05);
    const frameW   = Math.round(w * 0.88);
    const frameX   = (w - frameW) / 2;
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        <filter id="exshad">
          <feDropShadow dx="1" dy="3" stdDeviation="6" flood-color="#000000" flood-opacity="0.9"/>
          <feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="${AD}" flood-opacity="0.25"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}"
            fill="#000000" fill-opacity="0.70"/>
      <line x1="${frameX}" y1="${frameY}" x2="${frameX+cornerSz}" y2="${frameY}" stroke="${AD}" stroke-width="3"/>
      <line x1="${frameX}" y1="${frameY}" x2="${frameX}" y2="${frameY+cornerSz}" stroke="${AD}" stroke-width="3"/>
      <line x1="${frameX+frameW-cornerSz}" y1="${frameY+frameH}" x2="${frameX+frameW}" y2="${frameY+frameH}" stroke="${A}" stroke-width="3"/>
      <line x1="${frameX+frameW}" y1="${frameY+frameH-cornerSz}" x2="${frameX+frameW}" y2="${frameY+frameH}" stroke="${A}" stroke-width="3"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${Math.round(fontSize*0.96)}" font-weight="700" letter-spacing="2"
            fill="white" filter="url(#exshad)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  // Serif editorial: ptserif → playfair-inspired
  if (textStyle === "ptserif") {
    const serifLineY = textY - Math.round(fontSize * 0.85) - Math.round(h * 0.03);
    const serifLineW = Math.round(w * 0.45);
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
      <defs>
        <style>${allFontCss}</style>
        ${gradientDef}
        <filter id="ptshad">
          <feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#000000" flood-opacity="0.95"/>
        </filter>
        ${taglineDefs}
      </defs>
      <rect x="0" y="${gradY}" width="${w}" height="${gradRectH}" fill="url(#g)"/>
      <line x1="${cx - serifLineW/2}" y1="${serifLineY}" x2="${cx + serifLineW/2}" y2="${serifLineY}"
            stroke="${A}" stroke-width="${Math.round(h*0.003)}" stroke-linecap="round"/>
      <text x="${cx}" y="${textY}" text-anchor="middle"
            font-family="${embeddedFontFamily}"
            font-size="${fontSize}" font-weight="700"
            fill="white" filter="url(#ptshad)">
        ${tspansAccented}
      </text>
      ${taglineBody}
    </svg>`;
  }

  // "bloque" — bold white text + solid blue accent line above, minimal dark shadow
  const accentPad = Math.round(h * 0.025);
  const accentY = textY - Math.round(fontSize * 0.85) - accentPad;
  const accentW = Math.round(w * 0.12);
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" overflow="hidden">
    <defs>
      <style>${allFontCss}</style>
      <filter id="sh">
        <feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#000000" flood-opacity="0.85"/>
        <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#000000" flood-opacity="0.6"/>
      </filter>
      ${taglineDefs}
    </defs>
    <rect x="${cx - accentW / 2}" y="${accentY}" width="${accentW}" height="${Math.round(h * 0.006)}"
          fill="${AD}" rx="2"/>
    <text x="${cx}" y="${textY}" text-anchor="middle"
          font-family="${embeddedFontFamily}"
          font-size="${fontSize}" font-weight="900" letter-spacing="2"
          fill="white" filter="url(#sh)">
      ${tspansAccented}
    </text>
    ${taglineBody}
  </svg>`;
}

const TEXT_SIZE_SCALE: Record<string, number> = {
  small:  0.038,  // ≈  39 px on 1024 px image — compact caption
  sm:     0.050,  // ≈  51 px on 1024 px image — entre S y M
  medium: 0.065,  // ≈  67 px on 1024 px image — headline
  large:  0.105,  // ≈ 107 px on 1024 px image — very big, high-impact
};
// Max chars per line — calibrated so text fills ~90 % of image width
// (uppercase bold fonts ≈ 0.65 × fontSize per char; 90 % of 1024 px = 921 px)
const TEXT_SIZE_CHARS: Record<string, number> = {
  small:  36,   // fontSize ≈ 39 px → ~25 px/char → 36 chars ≈ 912 px
  sm:     28,   // fontSize ≈ 51 px → ~33 px/char → 28 chars ≈ 924 px
  medium: 21,   // fontSize ≈ 67 px → ~44 px/char → 21 chars ≈ 916 px
  large:  13,   // fontSize ≈ 107 px → ~70 px/char → 13 chars ≈ 904 px
};

/**
 * Applies a color/tone filter to an image buffer using sharp.
 * All presets are destructive and applied BEFORE logo/text compositing.
 */
async function applyImageFilter(buffer: Buffer, filter: ImageFilter): Promise<Buffer> {
  if (filter === "none") return buffer;
  let chain = sharp(buffer);
  switch (filter) {
    case "warm":
      chain = chain.modulate({ brightness: 1.05, saturation: 1.15 }).tint({ r: 255, g: 228, b: 196 });
      break;
    case "cool":
      chain = chain.modulate({ brightness: 1.02, saturation: 0.95 }).tint({ r: 196, g: 218, b: 255 });
      break;
    case "dramatic":
      chain = chain.modulate({ brightness: 0.82, saturation: 1.45 });
      break;
    case "vintage":
      chain = chain.modulate({ brightness: 0.94, saturation: 0.60 }).tint({ r: 240, g: 208, b: 168 });
      break;
    case "dark":
      chain = chain.modulate({ brightness: 0.62, saturation: 1.25 });
      break;
    case "vivid":
      chain = chain.modulate({ brightness: 1.06, saturation: 1.75 });
      break;
    case "haze":
      chain = chain.modulate({ brightness: 1.38, saturation: 0.72 }).blur(1.2);
      break;
  }
  return chain.jpeg({ quality: 92 }).toBuffer();
}

async function compositeLogoOnImage(
  base64ImageData: string,
  position: LogoPosition = "top-right",
  logoColor: LogoColor = "white",
  headline?: string,
  textStyle: TextStyle = "cinema",
  textPosition: TextPosition = "bottom",
  textSize: string = "medium",
  imageFilter: ImageFilter = "none",
  overlayFont?: string,
  userLogoBuffer?: Buffer | null,  // null | undefined = skip logo; Buffer = use this logo
  brandTagline?: string,           // text shown below headline; empty/undefined = no tagline
  accentColor?: string,            // brand primary color for headline accent elements (titleColor1)
  titleColor2?: string,            // brand secondary color (titleColor2)
  contentType?: string,            // content type — drives platform-aware safe zone margins/width
  font2?: string                   // optional second font for lines 2-N of headline
): Promise<string> {
  try {
    let imageBuffer = Buffer.from(base64ImageData, "base64");
    // Apply color/tone filter BEFORE compositing logo and text overlays
    if (imageFilter !== "none") {
      imageBuffer = await applyImageFilter(imageBuffer, imageFilter);
    }
    const meta = await sharp(imageBuffer).metadata();
    const w = meta.width ?? 1024;
    const h = meta.height ?? 1024;

    const compositeInputs: sharp.OverlayOptions[] = [];

    // --- LOGO (skip when userLogoBuffer is null or undefined — no default fallback) ---
    if (userLogoBuffer != null) {
      const logoSize = Math.round(w * 0.24);
      const basePad  = Math.round(w * 0.04);
      const topPad   = basePad;

      const logoSrc = userLogoBuffer;
      const logoBuffer = await sharp(logoSrc)
        .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      const logoTop  = position.startsWith("top")   ? topPad : h - logoSize - basePad;
      const logoLeft = position.endsWith("right") ? w - logoSize - basePad : basePad;
      compositeInputs.push({ input: logoBuffer, top: logoTop, left: logoLeft, blend: "over" });
    }

    // --- HEADLINE TEXT (no white pill) ---
    if (headline) {
      const upper      = headline.toUpperCase();
      const sizeKey    = TEXT_SIZE_CHARS[textSize] ? textSize : "medium";
      const fontSize   = Math.round(w * (TEXT_SIZE_SCALE[sizeKey] ?? 0.063));
      const lineHeight = Math.round(fontSize * 1.22);
      // Platform-aware horizontal safe zone:
      // - story/reel: text must not exceed 70% of image width (15% margin each side)
      // - image/carousel/feed: text must not exceed 80% of image width (10% margin each side)
      // charWidth ≈ fontSize × 0.65 for uppercase bold fonts
      const isTallFormat = contentType === "story" || contentType === "reel";
      const safeFraction = isTallFormat ? 0.70 : 0.80;
      const maxChars     = Math.max(8, Math.floor((w * safeFraction) / (fontSize * 0.65)));
      const lines        = wrapHeadline(upper, maxChars);

      const svg = buildHeadlineSvg(w, h, lines, fontSize, lineHeight, textStyle, textPosition, sizeKey, overlayFont, brandTagline, accentColor, titleColor2, contentType, font2);
      compositeInputs.push({ input: Buffer.from(svg), top: 0, left: 0, blend: "over" });
    }

    const composited = await sharp(imageBuffer)
      .composite(compositeInputs)
      .jpeg({ quality: 92 })
      .toBuffer();

    return composited.toString("base64");
  } catch {
    return base64ImageData;
  }
}

// Text and logos are composited programmatically — DALL-E generates the photo background only.
const CLEAN_PHOTO_NOTE = `Pure photography backdrop with no text, no logos, no overlaid words or numbers. Clean open composition with natural space in the lower third of the frame.`;

const COP_RULE = CLEAN_PHOTO_NOTE; // keep alias for backward compat

const IMAGE_STYLES = {
  photorealistic: `Premium lifestyle advertising photography. Scene: professional person or family in an authentic real-world setting — modern home, office, or commercial space — with warm natural daylight, cinematic depth of field, clean blue sky. Lower third of frame has open natural space. Shot like a high-end advertising campaign. ${CLEAN_PHOTO_NOTE}`,

  graphic: `Bold graphic background for a modern brand. Rich electric blue gradient with deep navy tones, clean glowing geometric lines. Lower portion is darker and calmer. Inspired by Apple and Tesla advertising — sleek, premium, aspirational. ${CLEAN_PHOTO_NOTE}`,

  infographic: `Aerial photography of a city neighborhood with lush greenery, warm afternoon sunlight, clean modern rooftops. Rich visual in upper portion, calmer lower section. ${CLEAN_PHOTO_NOTE}`
};

const REEL_STYLES = {
  photorealistic: `Vertical-format lifestyle photography. Scene: professional person in front of a modern building or workspace, bright blue sky, cinematic lighting. Open lower portion. ${CLEAN_PHOTO_NOTE}`,
  graphic: `Vertical graphic background with rich electric blue tones, abstract geometric motifs, deep navy areas. Clean and energetic. ${CLEAN_PHOTO_NOTE}`,
  infographic: `Aerial vertical-format photography of a city neighborhood with lush greenery, blue sky, modern rooftops. ${CLEAN_PHOTO_NOTE}`
};


// Slide contexts — generic, business-agnostic story beats
const GENERIC_CAROUSEL_SLIDE_CONTEXTS = [
  "Slide 1 — COVER: Cinematic wide-angle shot with bold visual impact, premium lifestyle setting, natural light, clean open lower third. No text. No logos.",
  "Slide 2 — EL PROBLEMA: Close-up of a person looking thoughtful or concerned, relatable real-life setting, natural lighting, moody tone. Open lower area. No text, no logos.",
  "Slide 3 — LA SOLUCIÓN: Confident professional or person in a bright positive environment, hopeful mood, open lower section. No text, no logos.",
  "Slide 4 — RESULTADOS: Clean overhead or wide-angle shot showing success, aspirational environment, bright natural light. No text, no logos.",
  "Slide 5 — CTA CIERRE: Warm, aspirational portrait of a happy person or team in their professional context, golden-hour light, joyful mood. Open lower third. No text, no logos.",
];

const GENERIC_REEL_SLIDE_CONTEXTS = [
  "Scene 1 — HOOK/APERTURA: Extreme close-up vertical shot with bold visual impact, vibrant colors, cinematic shallow depth-of-field. Open lower quarter. No text. No logos.",
  "Scene 2 — EL PROBLEMA: Vertical portrait of a relatable person in a real-life scenario showing a challenge or pain point, moody interior, natural emotion. Open lower area. No text, no logos.",
  "Scene 3 — LA SOLUCIÓN: Vertical portrait of a confident professional in a bright, positive environment, arms open, proud posture, clear sky. Open lower third. No text, no logos.",
  "Scene 4 — CTA CIERRE: Vertical portrait of a happy person or team in their professional environment, warm golden-hour light, joyful and aspirational mood. Open lower third. No text, no logos.",
];

// ─── Dynamic slide headline pools ────────────────────────────────────────────
// Each slide position has a pool of alternatives. The system picks one that the
// user hasn't used in the last 15 posts (anti-repetition rule). Slide 1 always
// uses the post's captionHook — no pool needed.

// IMPORTANT: These pools are FALLBACKS used when GPT cannot generate contextual headlines.
// Every phrase must work for ANY industry. PROHIBITED: "ÚNETE AL CAMBIO", "SIMPLE. EFICIENTE. TUYO.",
// "¿CUÁNTO PIERDES AL MES?", "¿CUÁNTO PAGAS?", "EL COSTO SUBE. ¿Y TÚ?"
const REEL_HEADLINE_POOLS: (string[] | null)[] = [
  null, // Scene 1: always captionHook
  // Scene 2 — Identificación del problema / situación actual
  [
    "¿YA LO NOTASTE?", "ALGO PUEDE MEJORAR", "¿QUÉ TE ESTÁ FALTANDO?",
    "HAY UN CAMINO MEJOR", "¿ESTO TE SUENA FAMILIAR?", "EL PROBLEMA TIENE NOMBRE",
    "¿CUÁNTO TE CUESTA NO ACTUAR?", "¿CUÁL ES EL COSTO REAL?", "LOS NÚMEROS NO MIENTEN",
    "¿QUÉ INVERSIÓN NECESITAS?", "ESTO IMPORTA", "¿LO SABÍAS?",
  ],
  // Scene 3 — La solución
  [
    "LA SOLUCIÓN EXISTE", "HAY UNA SALIDA", "ESO CAMBIA HOY",
    "NOSOTROS LO RESOLVEMOS", "EXISTE OTRA FORMA", "ASÍ SE SOLUCIONA",
    "TU ALTERNATIVA ESTÁ AQUÍ", "EL CAMBIO ES POSIBLE", "YA EXISTE LA SOLUCIÓN",
    "LLEGÓ EL MOMENTO", "ASÍ ES COMO FUNCIONA", "DIRECTO AL PUNTO",
  ],
  // Scene 4 — CTA
  [
    "CAMBIA HOY", "EMPIEZA AHORA", "DA EL PASO HOY MISMO",
    "TU PRÓXIMO PASO ES ESTE", "ACTÚA HOY", "NO ESPERES MÁS",
    "EL MOMENTO ES AHORA", "DA EL PRIMER PASO", "ESCRÍBENOS HOY",
    "EMPIEZA SIN COMPROMISO", "TU DECISIÓN. TU FUTURO.", "HAZLO HOY, CRECE MAÑANA",
  ],
];

// IMPORTANT: These pools are FALLBACKS used when GPT cannot generate contextual headlines.
// Every phrase here must work for ANY industry (retail, real estate, beauty, food, tech, etc.).
// PROHIBITED: ECO-specific phrases like "ÚNETE AL CAMBIO", "SIMPLE. EFICIENTE. TUYO.",
// "¿CUÁNTO PIERDES AL MES?", "¿CUÁNTO PAGAS?", "EL COSTO SUBE. ¿Y TÚ?"
const CAROUSEL_HEADLINE_POOLS: (string[] | null)[] = [
  null, // Slide 1: always captionHook
  // Slide 2 — Identificación del problema / situación actual
  [
    "¿YA LO NOTASTE?", "ALGO PUEDE MEJORAR", "¿QUÉ TE ESTÁ FALTANDO?",
    "HAY UN CAMINO MEJOR", "¿ESTO TE SUENA FAMILIAR?", "EL PROBLEMA TIENE NOMBRE",
    "¿CUÁNTO TE CUESTA NO ACTUAR?", "¿CUÁL ES EL COSTO REAL?", "LOS NÚMEROS NO MIENTEN",
    "¿QUÉ INVERSIÓN NECESITAS?", "ESTO IMPORTA", "¿LO SABÍAS?",
  ],
  // Slide 3 — La solución
  [
    "LA SOLUCIÓN EXISTE", "HAY UNA SALIDA", "ESO CAMBIA HOY",
    "NOSOTROS LO RESOLVEMOS", "EXISTE OTRA FORMA", "ASÍ SE SOLUCIONA",
    "TU ALTERNATIVA ESTÁ AQUÍ", "EL CAMBIO ES POSIBLE", "YA EXISTE LA SOLUCIÓN",
    "LLEGÓ EL MOMENTO", "ASÍ ES COMO FUNCIONA", "DIRECTO AL PUNTO",
  ],
  // Slide 4 — El valor
  [
    "LOS NÚMEROS NO MIENTEN", "RESULTADOS COMPROBADOS", "EL ROI ES REAL",
    "INVIERTE CON CONFIANZA", "RETORNO GARANTIZADO", "DATOS QUE HABLAN",
    "LA INVERSIÓN QUE FUNCIONA", "LA DECISIÓN CORRECTA", "EL VALOR ES CLARO",
    "GANA DESDE EL PRIMER DÍA", "RESULTADOS MEDIBLES", "UNA INVERSIÓN INTELIGENTE",
  ],
  // Slide 5 — CTA
  [
    "EMPIEZA HOY", "DA EL PRIMER PASO", "EMPIEZA AHORA",
    "ACTÚA HOY", "TU PRÓXIMO PASO ES ESTE", "NO ESPERES MÁS",
    "EL MOMENTO ES AHORA", "ESCRÍBENOS HOY", "CONTÁCTANOS HOY",
    "HAZLO HOY, CRECE MAÑANA", "TU DECISIÓN. TU FUTURO.", "EMPIEZA SIN COMPROMISO",
  ],
];

/**
 * Returns true when the business is in the solar/EV energy industry.
 * Checks industry field first, then name and description so that businesses
 * with an empty industry field (e.g. "ECO Energía Solar") are correctly detected.
 */
function isSolarIndustry(industry?: string | null, name?: string | null, description?: string | null): boolean {
  // Industry field: use all original keywords (controlled vocabulary, safe to be broad)
  const industryLower = (industry ?? "").toLowerCase();
  if (industryLower && (
    industryLower.includes("solar") || industryLower.includes("renovable") ||
    industryLower.includes("eléctric") || industryLower.includes("electric") ||
    industryLower.includes("fotovoltaic")
  )) return true;
  // Name + description: use precise solar keywords only — avoid over-matching electricians,
  // appliance stores, or any business that happens to say "eléctrico/electric".
  const freeText = [name, description].filter(Boolean).join(' ').toLowerCase();
  if (!freeText) return false;
  return freeText.includes("solar") || freeText.includes("fotovoltaic") ||
    freeText.includes("paneles fotovoltaicos") || freeText.includes("energía renovable") ||
    freeText.includes("energia renovable") || freeText.includes("instalación solar") ||
    freeText.includes("instalacion solar") || freeText.includes("panel solar");
}

const _objectStorage = new ObjectStorageService();

/**
 * Loads a logo buffer for compositing.
 * - If logoUrl is an HTTP(S) URL → downloads it.
 * - If logoUrl is a `/objects/...` path → reads from Replit object storage.
 * - If logoUrl is a bare filename (e.g. "eco-logo-blue.png") → reads from local assets dir.
 * - If logoUrl is null/empty → returns null (no logo overlay).
 */
async function loadBusinessLogoBuffer(logoUrl?: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  const LOGO_TIMEOUT_MS = 8_000; // 8s — never block image generation waiting for a logo
  try {
    if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
      if (!res.ok) {
        logger.warn({ logoUrl, status: res.status }, "[loadBusinessLogoBuffer] HTTP fetch failed for logo URL");
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    }
    if (logoUrl.startsWith("/objects/")) {
      const file = await _objectStorage.getObjectEntityFile(logoUrl);
      const result = await Promise.race([
        file.download().then(([data]: [Buffer]) => data),
        new Promise<null>(resolve => setTimeout(() => resolve(null), LOGO_TIMEOUT_MS)),
      ]);
      return result;
    }
    // Fallback: raw object-storage key without /objects/ prefix (e.g. "businesses/1/logo/...")
    // Try wrapping it before falling through to local asset resolution
    if (!logoUrl.startsWith("/api/") && !logoUrl.startsWith("/")) {
      try {
        const objectPath = `/objects/${logoUrl}`;
        const file = await _objectStorage.getObjectEntityFile(objectPath);
        const result = await Promise.race([
          file.download().then(([data]: [Buffer]) => data),
          new Promise<null>(resolve => setTimeout(() => resolve(null), LOGO_TIMEOUT_MS)),
        ]);
        if (result) return result;
      } catch { /* not an object-storage key — fall through to local file */ }
    }
    // Resolve by basename (handles /api/static/<filename> and other path prefixes)
    const localPath = path.resolve(_assetsDir, path.basename(logoUrl));
    logger.info({ logoUrl, localPath }, "[loadBusinessLogoBuffer] Reading local asset file");
    return await readFileAsync(localPath);
  } catch (err) {
    logger.warn({ logoUrl, err }, "[loadBusinessLogoBuffer] Could not load logo — continuing without logo");
    return null;
  }
}

/**
 * Picks a slide headline for the given user that hasn't been used in the last 15
 * posts of that user (anti-repetition rule). Records the choice so future picks
 * avoid it. Falls back to a random choice if all options have been recently used.
 */
async function pickSlideHeadline(
  userId: number | null | undefined,
  pool: string[],
  slideKey: string,           // e.g. "carousel:2" or "reel:3"
  businessId?: number | null,
): Promise<string> {
  const effectivePool = pool;

  if (!userId && businessId == null) {
    return effectivePool[Math.floor(Math.random() * effectivePool.length)];
  }

  try {
    // Fetch the last 15 headlines used at this slide position — filter by businessId when available
    const scopeCond = businessId != null
      ? eq(contentHistoryTable.businessId, businessId)
      : eq(contentHistoryTable.userId, userId!);
    const recent = await db
      .select({ captionHook: contentHistoryTable.captionHook })
      .from(contentHistoryTable)
      .where(and(
        scopeCond,
        eq(contentHistoryTable.contentType, `slide:${slideKey}`),
      ))
      .orderBy(desc(contentHistoryTable.createdAt))
      .limit(15);

    const recentSet = new Set(recent.map(r => r.captionHook.toUpperCase().trim()));
    const available = effectivePool.filter(h => !recentSet.has(h.toUpperCase().trim()));
    const chosen = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : effectivePool[Math.floor(Math.random() * effectivePool.length)]; // all used → allow repeat

    // Record usage (non-blocking) — include businessId for per-business isolation
    void db.insert(contentHistoryTable).values({
      ...(userId != null ? { userId } : {}),
      ...(businessId != null ? { businessId } : {}),
      batchId: 0,
      platform: "both",
      captionHook: chosen,
      contentType: `slide:${slideKey}`,
    }).catch(() => {});

    return chosen;
  } catch {
    // On any DB error, fall back to random pick without tracking
    return effectivePool[Math.floor(Math.random() * effectivePool.length)];
  }
}


// ---------------------------------------------------------------------------
// SISTEMA DE HASHTAGS CON PESOS
// Cada hashtag tiene un peso (1-10) que representa su alcance/rendimiento estimado.
// Mayor peso = mayor probabilidad de ser seleccionado.
// Los pesos empiezan como estimaciones expertas y se pueden ajustar con datos reales.
// ---------------------------------------------------------------------------

type WeightedTag = { tag: string; weight: number };

/** Selección aleatoria ponderada: los hashtags con mayor peso salen más seguido */
function pickWeighted(pool: WeightedTag[], n: number): string[] {
  const result: string[] = [];
  const remaining = [...pool];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * totalWeight;
    const idx = remaining.findIndex(t => { r -= t.weight; return r <= 0; });
    const chosen = remaining.splice(idx === -1 ? remaining.length - 1 : idx, 1)[0];
    result.push(chosen.tag);
  }
  return result;
}

// Hashtags por ciudad — dinámicos según el defaultLocation del negocio.
// Clave: nombre de ciudad en minúsculas sin tildes para matching.
const CITY_HASHTAG_MAP: Record<string, string[]> = {
  cali:         ["#Cali", "#ValledelCauca", "#Colombia", "#CaliEmpresarial", "#CaliPotencia", "#CaliNegocios"],
  medellin:     ["#Medellín", "#MedellínColombia", "#Antioquia", "#Colombia", "#MedellínEmpresarial"],
  bogota:       ["#Bogotá", "#BogotáColombia", "#Cundinamarca", "#Colombia", "#BogotáEmpresarial"],
  barranquilla: ["#Barranquilla", "#BarranquillaColombia", "#Atlántico", "#Colombia"],
  cartagena:    ["#Cartagena", "#CartagenaColombia", "#Bolívar", "#Colombia"],
  bucaramanga:  ["#Bucaramanga", "#BucaramangaColombia", "#Santander", "#Colombia"],
  pereira:      ["#Pereira", "#PereiraColombia", "#RisaraldaColombia", "#Colombia"],
  manizales:    ["#Manizales", "#ManizalesColombia", "#Caldas", "#Colombia"],
  armenia:      ["#Armenia", "#ArmeniaColombia", "#Quindío", "#Colombia"],
  cucuta:       ["#Cúcuta", "#CúcutaColombia", "#NorteDeSantander", "#Colombia"],
  ibague:       ["#Ibagué", "#IbaguéColombia", "#Tolima", "#Colombia"],
  santa_marta:  ["#SantaMarta", "#SantaMartaColombia", "#Magdalena", "#Colombia"],
  pasto:        ["#Pasto", "#PastoColombia", "#Nariño", "#Colombia"],
};

// Hashtags nacionales genéricos — usados cuando no hay ciudad reconocida.
const NATIONAL_HASHTAGS = ["#Colombia", "#EmpresasColombianas", "#NegociosColombia", "#EmprendimientoCO", "#HechoEnColombia", "#NegocioVerde"];

/**
 * Picks location-specific hashtags based on the business's defaultLocation.
 * Extracts city name, matches against known Colombian cities, falls back to national tags.
 */
function pickLocationHashtags(location: string | null | undefined, count: number): string[] {
  if (!location) return pickFlat(NATIONAL_HASHTAGS, Math.min(count, NATIONAL_HASHTAGS.length));
  // Normalize: lowercase + strip accents for matching
  const normalized = location.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [city, tags] of Object.entries(CITY_HASHTAG_MAP)) {
    const normalizedCity = city.replace(/_/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(normalizedCity)) {
      return pickFlat(tags, Math.min(count, tags.length));
    }
  }
  return pickFlat(NATIONAL_HASHTAGS, Math.min(count, NATIONAL_HASHTAGS.length));
}

// Pools planos para otras categorías (rotación simple)
const HASHTAG_POOLS = {
  solar:    ["#PanelesSolares", "#EnergíaSolar", "#SolarColombia", "#EnergíaRenovable", "#AutogeneraciónSolar", "#SolarCO", "#FacturaCero", "#AhorraConElSol", "#EnergíaLimpia"],
  ev:       ["#VehículosEléctricos", "#CargadoresEV", "#EVColombia", "#MovilidadEléctrica", "#BeneficiosTributariosEV", "#ElectricCar"],
  // IMPORTANT: trending pool MUST be industry-agnostic — no solar/energy/eco-specific terms.
  // Solar/EV/eco tags belong exclusively in the solar/ev pools above and are gated by isSolarIndustry().
  trending: ["#EmpresasColombia", "#NegociosColombia", "#MarketingDigital", "#ContenidoDigital", "#EmprendimientoCO", "#MarcaPersonal", "#VentasColombia", "#Emprendedores", "#DigitalMarketing", "#ContenidoCreativo"],
};

// Industry-specific tags that must NEVER appear in generic (non-solar) hashtag output.
// Acts as final guardrail: if any solar/energy tag leaks into trending or elsewhere, strip it.
const SOLAR_GUARDRAIL_TAGS = new Set([
  "#EnergíaLimpia", "#EnergíaSolar", "#PanelesSolares", "#SolarColombia", "#EnergíaRenovable",
  "#AutogeneraciónSolar", "#SolarCO", "#FacturaCero", "#AhorraConElSol",
  "#VehículosEléctricos", "#CargadoresEV", "#EVColombia", "#MovilidadEléctrica",
  "#BeneficiosTributariosEV", "#ElectricCar",
  "#Sostenibilidad", "#CambioclimáticoColombia", "#FuturoVerde", "#EmpresasSostenibles", "#NegocioVerde",
]);

function pickFlat<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

export function pickHashtags(defaultLocation?: string | null, _userId?: number, _businessId?: number, industry?: string | null): string {
  const solar = isSolarIndustry(industry);
  const ev = industry != null && (industry.toLowerCase().includes("eléctric") || industry.toLowerCase().includes("electric"));
  const localTags = pickLocationHashtags(defaultLocation, 5);
  const solarTags = solar ? pickFlat(HASHTAG_POOLS.solar, 4) : [];
  const evTags    = ev    ? pickFlat(HASHTAG_POOLS.ev, 1) : [];
  const trendingTags = pickFlat(HASHTAG_POOLS.trending, 5);
  const all = [...localTags, ...solarTags, ...evTags, ...trendingTags];
  // Guardrail final: si la industria NO es solar, eliminar cualquier tag solar/energy que se haya colado
  const filtered = solar ? all : all.filter(tag => !SOLAR_GUARDRAIL_TAGS.has(tag));
  return filtered.join(" ");
}

/** TikTok: máximo 5 hashtags — enfocados y de alto alcance.
 *  TikTok penaliza el spam de hashtags; 3-5 específicos rinden mejor que 30 genéricos. */
export function pickHashtagsTiktok(defaultLocation?: string | null, _userId?: number, _businessId?: number, industry?: string | null): string {
  const solar = isSolarIndustry(industry);
  const localTags = pickLocationHashtags(defaultLocation, 2);
  const solarTag = solar ? pickFlat(HASHTAG_POOLS.solar, 1) : [];
  const trend = pickFlat(HASHTAG_POOLS.trending, 3);
  const all = [...localTags, ...solarTag, ...trend];
  // Guardrail final: si la industria NO es solar, eliminar cualquier tag solar/energy que se haya colado
  const filtered = solar ? all : all.filter(tag => !SOLAR_GUARDRAIL_TAGS.has(tag));
  return filtered.join(" ");
}


// ─── Copy learning helpers ────────────────────────────────────────────────────

/**
 * Fetches the top-performing published captions ranked by engagement.
 * Engagement score = (likes + saves*2) / reach  (reach-normalized).
 * Falls back to raw (likes + saves) if no reach data.
 * Falls back to most-recent if no engagement data at all.
 * These are injected into generation prompts so the AI learns from what actually works.
 */
// V_CAP_3 FIX: fetchTopPerformingCaptions requiere userId o businessId para evitar fuga global.
// La función era dead code sin callers — se agregan parámetros obligatorios de tenant scope.
// FAIL-CLOSED: sin al menos uno de los dos parámetros, retorna [].
async function fetchTopPerformingCaptions(
  limit = 4,
  userId?: number,
  businessId?: number,
): Promise<{ caption: string; note: string }[]> {
  // Si no hay contexto de tenant, retornar vacío (nunca datos globales)
  if (userId == null && businessId == null) return [];
  try {
    const tenantCond = businessId != null
      ? eq(postsTable.businessId, businessId)
      : eq(postsTable.userId, userId!);
    const rows = await db
      .select({
        caption: postsTable.caption,
        contentType: postsTable.contentType,
        likes: postsTable.likes,
        saves: postsTable.saves,
        reach: postsTable.reach,
        publishedAt: postsTable.publishedAt,
      })
      .from(postsTable)
      .where(and(inArray(postsTable.status, ["published", "approved", "scheduled"]), tenantCond))
      .orderBy(desc(postsTable.updatedAt))
      .limit(limit * 6);

    const withScore = rows
      .map(r => {
        const caption = r.caption?.trim() ?? "";
        if (caption.length < 80) return null;
        const likes = r.likes ?? 0;
        const saves = r.saves ?? 0;
        const reach = r.reach ?? 0;
        const rawScore = likes + saves * 2;
        const engagementRate = reach > 0 ? rawScore / reach : 0;
        const hasMetrics = likes > 0 || saves > 0 || reach > 0;
        return { caption, contentType: r.contentType ?? "image", rawScore, engagementRate, hasMetrics };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Sort: posts with real metrics (by engagement rate) first; then by raw score; then no-metric posts
    withScore.sort((a, b) => {
      if (a.hasMetrics !== b.hasMetrics) return a.hasMetrics ? -1 : 1;
      if (a.engagementRate !== b.engagementRate) return b.engagementRate - a.engagementRate;
      return b.rawScore - a.rawScore;
    });

    return withScore.slice(0, limit).map(r => ({
      caption: r.caption,
      note: r.hasMetrics
        ? `(${r.contentType} — alto rendimiento)`
        : `(${r.contentType})`,
    }));
  } catch {
    return [];
  }
}

/**
 * Calculates a plain-language performance context from real published post metrics.
 * This paragraph is injected into the AI system prompt so the model knows what's
 * working and can bias towards the winning patterns.
 */
export async function getPerformanceContext(): Promise<string> {
  try {
    const rows = await db
      .select({
        contentType: postsTable.contentType,
        likes: postsTable.likes,
        saves: postsTable.saves,
        reach: postsTable.reach,
        comments: postsTable.comments,
        publishedAt: postsTable.publishedAt,
      })
      .from(postsTable)
      .where(inArray(postsTable.status, ["published"]))
      .orderBy(desc(postsTable.publishedAt))
      .limit(60);

    if (rows.length < 3) return ""; // not enough data yet

    // Aggregate by content type
    const byType: Record<string, { total: number; reach: number; count: number }> = {};
    for (const r of rows) {
      const t = r.contentType ?? "image";
      if (!byType[t]) byType[t] = { total: 0, reach: 0, count: 0 };
      byType[t].total += (r.likes ?? 0) + (r.saves ?? 0) * 2 + (r.comments ?? 0);
      byType[t].reach += r.reach ?? 0;
      byType[t].count++;
    }

    const typeRanking = Object.entries(byType)
      .map(([type, data]) => ({
        type,
        avgEngagement: data.reach > 0
          ? data.total / data.reach
          : data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    const topType = typeRanking[0];
    const worstType = typeRanking[typeRanking.length - 1];

    if (!topType || topType.avgEngagement === 0) return ""; // no metrics at all yet

    const typeLabels: Record<string, string> = {
      reel: "Reels", carousel: "Carruseles", image: "Imágenes fijas", story: "Historias",
    };

    const lines: string[] = [
      `RENDIMIENTO EN REDES (úsalo para sesgar tus decisiones creativas):`,
    ];

    if (typeRanking.length > 1) {
      lines.push(`• Formato que más convierte: ${typeLabels[topType.type] ?? topType.type} (mejor tasa de engagement promedio).`);
      if (worstType.type !== topType.type) {
        lines.push(`• Formato con menor rendimiento: ${typeLabels[worstType.type] ?? worstType.type} — úsalo menos o experimenta con variaciones.`);
      }
    }

    // Day of week analysis
    const byDay: Record<number, number> = {};
    for (const r of rows) {
      if (!r.publishedAt) continue;
      const day = new Date(r.publishedAt).getDay(); // 0=Sun
      byDay[day] = (byDay[day] ?? 0) + (r.likes ?? 0) + (r.saves ?? 0);
    }
    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const bestDay = Object.entries(byDay).sort(([, a], [, b]) => b - a)[0];
    if (bestDay) {
      lines.push(`• Mejor día para publicar: ${dayNames[Number(bestDay[0])]}.`);
    }

    // Trend: compare last 10 vs previous 10 posts
    if (rows.length >= 20) {
      const recent = rows.slice(0, 10).reduce((s, r) => s + (r.likes ?? 0) + (r.saves ?? 0), 0);
      const older  = rows.slice(10, 20).reduce((s, r) => s + (r.likes ?? 0) + (r.saves ?? 0), 0);
      if (older > 0) {
        const pct = Math.round(((recent - older) / older) * 100);
        if (pct > 5)  lines.push(`• Tendencia: engagement SUBIENDO ${pct}% en las últimas publicaciones. ¡Seguir por este camino!`);
        if (pct < -5) lines.push(`• Tendencia: engagement BAJANDO ${Math.abs(pct)}%. Experimentar con formatos o ángulos nuevos.`);
      }
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

/**
 * Completely rewrites the caption for a post around a NEW topic/brief provided by the user.
 * Keeps the platform, content type, and brand template — only changes the subject.
 */
export async function rethemeCaption(
  newTopic: string,
  platform: string,
  contentType: string,
  userId?: number,
  businessId?: number
): Promise<{ caption: string; hashtags: string; hashtagsTiktok: string }> {
  const platformInstruction = platform === "tiktok"
    ? "Formato TikTok: dinámico, energético. Máximo 150 palabras."
    : "Formato Instagram: storytelling emotivo. Máximo 280 palabras. El campo \"caption\" NO puede superar los 1600 caracteres.";
  const contentTypeInstruction = contentType === "reel"
    ? "Tipo REEL — gancho en primera línea que detenga el scroll."
    : contentType === "carousel"
    ? "Tipo CARRUSEL — primera línea invita a deslizar. Incluye '👉 Desliza para descubrir' en el gancho."
    : contentType === "story"
    ? "Tipo HISTORIA — ultra-corta, máximo 30 palabras."
    : "Tipo IMAGEN — storytelling emotivo con datos concretos.";

  const brandCtxRetheme = await getBrandContextBlock(userId, businessId);
  const brandIdentity = brandCtxRetheme
    ? `Eres el community manager de la siguiente marca:\n${brandCtxRetheme}`
    : "Eres un community manager profesional.";
  const systemContent = `${brandIdentity}\n\nCrea publicaciones de alta calidad para redes sociales basadas EXCLUSIVAMENTE en la información de esta marca. NO menciones otras empresas ni marcas. Responde SOLO con JSON válido con campos "caption" y "hashtags".`;
  const userContent = `Crea un caption ORIGINAL para ${platform} (${contentType}) sobre:\n\n"${newTopic}"\n\n${platformInstruction}\n${contentTypeInstruction}\n\nEl campo "hashtags": string vacío "".`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 700,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent }
    ]
  });

  try {
    const raw = response.choices[0]?.message?.content ?? '{"caption":"","hashtags":""}';
    const parsed = JSON.parse(raw);
    let captionBody = typeof parsed.caption === "string" ? parsed.caption : raw;
    const rethemeBodyLimit = getBodyLimitForPlatform(platform);
    if (captionBody.length > rethemeBodyLimit) {
      console.warn(`[Layer 1] rethemeCaption: caption body truncated from ${captionBody.length} to ${rethemeBodyLimit} chars (platform=${platform}).`);
      captionBody = captionBody.slice(0, rethemeBodyLimit);
    }
    return {
      caption: captionBody,
      hashtags: "",
      hashtagsTiktok: "",
    };
  } catch {
    let fallbackCaption = response.choices[0]?.message?.content ?? "";
    const rethemeBodyLimit = getBodyLimitForPlatform(platform);
    if (fallbackCaption.length > rethemeBodyLimit) {
      fallbackCaption = fallbackCaption.slice(0, rethemeBodyLimit);
    }
    return {
      caption: fallbackCaption,
      hashtags: "",
      hashtagsTiktok: "",
    };
  }
}

/**
 * Evaluates a published/draft caption and returns 2-3 concrete improvement suggestions.
 * Does NOT rewrite — only gives surgical, actionable feedback.
 */
export async function evaluateCaptionImprovements(
  caption: string,
  platform: string,
  contentType: string,
  userId?: number,
  businessId?: number
): Promise<{ score: number; suggestions: string[] }> {
  const brandCtx = await getBrandContextBlock(userId, businessId);
  const brandIdentity = brandCtx
    ? `Eres el director creativo de la siguiente marca:\n${brandCtx}`
    : "Eres un director creativo de contenido digital.";
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 400,
    messages: [
      {
        role: "system",
        content: `${brandIdentity}\n\nEvalúas captions de redes sociales con criterio ESTRICTO pero constructivo. Responde SOLO con JSON válido con campos "score" (número del 1 al 10) y "suggestions" (array de 2 a 3 strings, cada uno es una mejora ESPECÍFICA y ACCIONABLE — no genérica). El score 8+ = listo para publicar, 6-7 = necesita ajustes menores, <6 = necesita trabajo. Sé directo y específico, como un editor de contenido experimentado.`
      },
      {
        role: "user",
        content: `Evalúa este caption para ${platform} (${contentType}):\n\n${caption}\n\nDame el score y 2-3 sugerencias concretas de mejora. Si el caption ya está muy bien, di qué lo hace funcionar y qué pequeño detalle podría ser aún mejor.`
      }
    ]
  });

  try {
    const raw = response.choices[0]?.message?.content ?? '{"score":7,"suggestions":[]}';
    const parsed = JSON.parse(raw);
    return {
      score: typeof parsed.score === "number" ? Math.min(10, Math.max(1, parsed.score)) : 7,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
    };
  } catch {
    return { score: 7, suggestions: ["No se pudo analizar el caption en este momento."] };
  }
}

// ─── Content Diversity Engine ─────────────────────────────────────────────────
// Implements the 80% novelty rule:
//  - Tracks last 50 caption hooks per platform
//  - Rejects new hooks with >60% Jaccard similarity to any recent one
//  - Tracks background prompt hashes across batches (no repeat within 4 batches)

const SPANISH_STOPWORDS = new Set([
  "a","al","ante","bajo","con","contra","de","del","desde","durante","el","ella","ellas",
  "ellos","en","entre","es","eso","esta","este","estos","estas","fue","hay","la","las","le",
  "les","lo","los","me","mi","mis","más","muy","no","nos","o","para","pero","por","que",
  "quien","se","si","sin","su","sus","te","ti","también","un","una","unas","uno","unos","y","ya",
  "tu","tus","yo","ha","han","he","hemos","ser","tener","hacer","ir","poder","ver","dar",
  "saber","querer","llegar","pasar","deber","poner","parecer","quedar","creer","hablar",
  "llevar","dejar","seguir","encontrar","llamar","venir","pensar","salir","volver","tomar",
  "conocer","vivir","sentir","tratar","mirar","contar","empezar","esperar","buscar",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !SPANISH_STOPWORDS.has(w))
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Returns caption hooks used in the last 90 days — enforces 90-day title uniqueness rule */
async function getRecentHooks(platform: string, userId?: number, businessId?: number): Promise<string[]> {
  // FAIL-CLOSED: sin scope de usuario devolver vacío — nunca retornar hooks de todos los usuarios
  if (businessId == null && userId == null) return [];
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);
  // Filter by businessId when available (isolated per-business history); fallback to userId
  const scopeCond = businessId != null
    ? eq(contentHistoryTable.businessId, businessId)
    : eq(contentHistoryTable.userId, userId!);
  // Include "both" platform hooks as well — posts generated for both platforms are stored
  // with platform="both" but should count as used for both "instagram" and "tiktok" checks.
  const rows = await db
    .select({ captionHook: contentHistoryTable.captionHook })
    .from(contentHistoryTable)
    .where(and(
      or(eq(contentHistoryTable.platform, platform), eq(contentHistoryTable.platform, "both")),
      gte(contentHistoryTable.createdAt, since90),
      scopeCond
    ))
    .orderBy(desc(contentHistoryTable.createdAt))
    .limit(500);
  return rows.map(r => r.captionHook);
}

/** Finds the most similar recent hooks above 50% to show as avoidance examples */
function getMostSimilarHooks(newHook: string, recentHooks: string[], topN = 5): string[] {
  return recentHooks
    .map(h => ({ hook: h, sim: jaccardSimilarity(newHook, h) }))
    .filter(x => x.sim > 0.5)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topN)
    .map(x => x.hook);
}

/** Extracts the first N non-stopword tokens from a text — used to detect structural/prefix repetition */
function prefixTokens(text: string, n = 3): string[] {
  return Array.from(tokenize(text)).slice(0, n);
}

/** Returns true if the hook is too similar (>60% Jaccard OR same structural prefix) to any recent hook */
function isTooSimilar(newHook: string, recentHooks: string[]): boolean {
  if (recentHooks.length === 0) return false;
  const newPre = prefixTokens(newHook, 3);
  return recentHooks.some(h => {
    // Jaccard word-level similarity
    if (jaccardSimilarity(newHook, h) > 0.6) return true;
    // Structural prefix match: if first 3 meaningful tokens are identical → structural repetition
    if (newPre.length >= 2) {
      const hPre = prefixTokens(h, 3);
      const matchCount = newPre.filter((t, i) => hPre[i] === t).length;
      if (matchCount >= Math.min(2, newPre.length)) return true;
    }
    return false;
  });
}

/** Saves a caption hook to history for future similarity checks */
async function recordCaptionHistory(
  batchId: number,
  platform: string,
  captionHook: string,
  contentType: string,
  backgroundPromptHash?: string,
  topicKey?: string,
  userId?: number,
  businessId?: number | null
): Promise<void> {
  try {
    await db.insert(contentHistoryTable).values({
      batchId,
      platform,
      captionHook,
      contentType,
      backgroundPromptHash: backgroundPromptHash ?? null,
      topicKey: topicKey ?? null,
      ...(userId != null ? { userId } : {}),
      ...(businessId != null ? { businessId } : {}),
    });
  } catch { /* non-blocking */ }
}

/** Returns a Set of topicKeys used in automatic generation within the last N days.
 *  Used to enforce the 15-day minimum gap between same-topic auto-generated posts. */
async function getRecentAutoTopics(daysAgo: number, userId?: number, businessId?: number | null): Promise<Set<string>> {
  // FAIL-CLOSED: sin scope → devolver vacío en lugar de exponer todos los topics
  if (userId == null && businessId == null) return new Set<string>();
  try {
    const since = new Date();
    since.setDate(since.getDate() - daysAgo);
    // Prefer businessId scope when available to prevent cross-business interference
    const scopeCond = businessId != null
      ? eq(contentHistoryTable.businessId, businessId)
      : eq(contentHistoryTable.userId, userId!);
    const rows = await db
      .select({ topicKey: contentHistoryTable.topicKey })
      .from(contentHistoryTable)
      .where(
        and(
          drizzleSql`${contentHistoryTable.topicKey} IS NOT NULL`,
          gte(contentHistoryTable.createdAt, since),
          scopeCond,
        )
      );
    return new Set(rows.map(r => r.topicKey!).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Returns a Map<topicKey, count> of how many times each niche was used this calendar month.
 *  Used to enforce the max-2-per-month rule. */
async function getNicheMonthlyUsage(userId?: number): Promise<Map<string, number>> {
  // FAIL-CLOSED: sin userId no hay scope → devolver vacío en lugar de exponer todos los nichos
  if (userId == null) return new Map<string, number>();
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = await db
      .select({ topicKey: contentHistoryTable.topicKey })
      .from(contentHistoryTable)
      .where(
        and(
          drizzleSql`${contentHistoryTable.topicKey} IS NOT NULL`,
          gte(contentHistoryTable.createdAt, monthStart),
          eq(contentHistoryTable.userId, userId)
        )
      );
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.topicKey) continue;
      counts.set(r.topicKey, (counts.get(r.topicKey) ?? 0) + 1);
    }
    return counts;
  } catch {
    return new Map();
  }
}

/**
 * Builds a weighted pool of niches based on engagement performance.
 * High-performing niches (ER% >= 3%) get weight 3 (appear 3x in the pool).
 * Medium performers (ER% >= 0.5%) get weight 2.
 * New / no-data niches get weight 1 (ensures all niches still get chances).
 * The pool is shuffled randomly so the round-robin cycles through them evenly.
 *
 * ER% = (likes + comments*2 + saves*2) / max(reach, likes+1) * 100
 */
async function buildWeightedNichePool(niches: typeof nichesTable.$inferSelect[], userId?: number): Promise<typeof nichesTable.$inferSelect[]> {
  try {
    if (niches.length === 0) return niches;

    // FAIL-CLOSED: sin userId no hay base histórica de ER% — retornar pool uniforme sin query global
    if (userId == null) return niches;

    // Fetch average engagement for each niche from published posts
    // V6 FIX: filtrar por userId para que el ER% se base solo en los posts del propio usuario
    const rows = await db
      .select({
        nicheId: postsTable.nicheId,
        avgLikes:    drizzleSql<number>`COALESCE(AVG(NULLIF(${postsTable.likes}, 0)), 0)`,
        avgComments: drizzleSql<number>`COALESCE(AVG(NULLIF(${postsTable.comments}, 0)), 0)`,
        avgSaves:    drizzleSql<number>`COALESCE(AVG(NULLIF(${postsTable.saves}, 0)), 0)`,
        avgReach:    drizzleSql<number>`COALESCE(AVG(NULLIF(${postsTable.reach}, 0)), 0)`,
        pubCount:    drizzleSql<number>`COUNT(*)`,
      })
      .from(postsTable)
      .where(and(eq(postsTable.status, "published"), drizzleSql`${postsTable.nicheId} IS NOT NULL`, eq(postsTable.userId, userId)))
      .groupBy(postsTable.nicheId);

    // Build score map: nicheId → ER%
    const scoreMap = new Map<number, number>();
    for (const r of rows) {
      if (!r.nicheId || Number(r.pubCount) < 1) continue;
      const likes    = Number(r.avgLikes);
      const comments = Number(r.avgComments);
      const saves    = Number(r.avgSaves);
      const reach    = Number(r.avgReach);
      const engagements = likes + comments * 2 + saves * 2;
      const denominator = Math.max(reach, likes + 1);
      const erPct = (engagements / denominator) * 100;
      scoreMap.set(r.nicheId, erPct);
    }

    // Build weighted pool
    const pool: typeof niches = [];
    for (const niche of niches) {
      const er = scoreMap.get(niche.id) ?? -1;
      const weight = er >= 3 ? 3 : er >= 0.5 ? 2 : 1;
      for (let i = 0; i < weight; i++) pool.push(niche);
    }

    // Shuffle to distribute top-performers evenly across the run
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const topNiches = [...scoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, er]) => `${niches.find(n => n.id === id)?.name ?? id} (ER ${er.toFixed(1)}%)`);
    if (topNiches.length > 0) {
      console.log(`[weightedNiches] pool=${pool.length} (base=${niches.length}) top: ${topNiches.join(", ")}`);
    }

    return pool;
  } catch (err) {
    console.warn("[weightedNiches] fallback to uniform pool:", err);
    return niches;
  }
}

/**
 * Builds the active niche window for a 15-day generation cycle.
 *
 * Rules:
 * - Maximum 7 unique niches in any 15-day window (concentration rule)
 * - Niches with ER% >= 3% have guaranteed slots (high-performers stay visible)
 * - Remaining slots filled by descending ER%, with 20% randomization to give
 *   new/untested niches a chance to earn data
 * - If business has ≤ 7 niches, all are included (no exclusion needed)
 *
 * Returns: the filtered window of niches (max 7) + the weighted pool built from it.
 * The weighted pool is what callers use for round-robin niche selection.
 */
async function buildActiveNicheWindow(
  niches: typeof nichesTable.$inferSelect[],
  userId?: number,
  businessId?: number | null,
): Promise<{ activeWindow: typeof nichesTable.$inferSelect[]; weightedPool: typeof nichesTable.$inferSelect[] }> {
  const MAX_WINDOW = 7;

  // ── Capa 1: Suspended niche filter (approval signals, ≥3 rejections in 30 days) ──
  // Run before everything else so suspended niches are never selected.
  let eligibleNiches = niches;
  if (userId != null || businessId != null) {
    const suspendedIds = await getSuspendedNiches(businessId, userId);
    if (suspendedIds.size > 0) {
      const filtered = niches.filter(n => !suspendedIds.has(n.id));
      if (filtered.length === 0) {
        // Safety fallback: if ALL niches are suspended, bypass suspension to prevent total lockout.
        // This is an extreme edge case — user rejected every niche ≥3 times in 30 days.
        // Log clearly and continue with all niches to preserve system functionality.
        console.warn(`[nicheWindow] all ${niches.length} niches suspended for biz=${businessId ?? "n/a"} — bypassing suspension (safety fallback to prevent lockout)`);
      } else {
        eligibleNiches = filtered;
        console.log(`[nicheWindow] suspended niches (≥3 rejections/30d): ${suspendedIds.size} → eligible=${eligibleNiches.length}/${niches.length}`);
      }
    }
  }

  // If we have ≤ 7 eligible niches, no filtering needed — return all with weighted pool.
  // Still apply Capa 1 approval boost so users with few niches also benefit from feedback signals.
  if (eligibleNiches.length <= MAX_WINDOW) {
    const pool = await buildWeightedNichePool(eligibleNiches, userId);
    const activeWindow = eligibleNiches;
    // Apply approval pool boost even for small niche sets
    let boostedPool = pool.length > 0 ? [...pool] : [...activeWindow];
    if (userId != null || businessId != null) {
      const smallApprovalMap = await getApprovalScoreMap(businessId, userId);
      for (const n of activeWindow) {
        const approvalRaw = smallApprovalMap.get(n.id) ?? 0;
        if (approvalRaw > 0) {
          const extraCopies = Math.min(Math.floor(approvalRaw / 10), 3);
          for (let i = 0; i < extraCopies; i++) boostedPool.push(n);
        }
      }
    }
    console.log(`[nicheWindow] active=${activeWindow.length} niches (all fit within window=${MAX_WINDOW}): [${activeWindow.map(n => n.name).join(", ")}]`);
    return { activeWindow, weightedPool: boostedPool.length > 0 ? boostedPool : eligibleNiches };
  }

  // More than 7 eligible niches — enforce a TRUE rolling-15-day window per business
  try {
    if (userId == null && businessId == null) {
      // FAIL-CLOSED: no scope → first 7 deterministically
      const activeWindow = eligibleNiches.slice(0, MAX_WINDOW);
      return { activeWindow, weightedPool: activeWindow };
    }

    // ── Step 1: ER score map — scoped to THIS business to prevent cross-business interference ──
    const erScopeCond = businessId != null
      ? and(eq(postsTable.status, "published"), drizzleSql`${postsTable.nicheId} IS NOT NULL`, eq(postsTable.businessId, businessId))
      : and(eq(postsTable.status, "published"), drizzleSql`${postsTable.nicheId} IS NOT NULL`, eq(postsTable.userId, userId!));

    const rows = await db
      .select({
        nicheId: postsTable.nicheId,
        avgLikes:    drizzleSql<number>`COALESCE(AVG(NULLIF(${postsTable.likes}, 0)), 0)`,
        avgComments: drizzleSql<number>`COALESCE(AVG(NULLIF(${postsTable.comments}, 0)), 0)`,
        avgSaves:    drizzleSql<number>`COALESCE(AVG(NULLIF(${postsTable.saves}, 0)), 0)`,
        avgReach:    drizzleSql<number>`COALESCE(AVG(NULLIF(${postsTable.reach}, 0)), 0)`,
        pubCount:    drizzleSql<number>`COUNT(*)`,
      })
      .from(postsTable)
      .where(erScopeCond)
      .groupBy(postsTable.nicheId);

    const scoreMap = new Map<number, number>();
    for (const r of rows) {
      if (!r.nicheId || Number(r.pubCount) < 1) continue;
      const likes    = Number(r.avgLikes);
      const comments = Number(r.avgComments);
      const saves    = Number(r.avgSaves);
      const reach    = Number(r.avgReach);
      const engagements = likes + comments * 2 + saves * 2;
      const denominator = Math.max(reach, likes + 1);
      scoreMap.set(r.nicheId, (engagements / denominator) * 100);
    }

    // ── Capa 2: Approval score map (60% weight) ───────────────────────────────
    // Combines user preference signals from the approval queue with ER data.
    // Combined score = approvalScore * 0.6 + erPct * 0.4
    const approvalScoreMap = await getApprovalScoreMap(businessId, userId);

    // Normalize approval scores — allow negative values to lower rank when user repeatedly rejects a niche.
    // Formula: +10 per approval, -5 per rejection → range is unbounded but clamp at [-15, 30] for stability.
    // Negative combined scores actively push rejected niches below untested niches (which score 0).
    const normalizedApproval = (nicheId: number): number => {
      const raw = approvalScoreMap.get(nicheId) ?? 0;
      return Math.max(-15, Math.min(30, raw)); // preserve sign — negatives lower rank
    };

    const combinedScore = (nicheId: number): number => {
      const erPct = scoreMap.get(nicheId) ?? 0;
      return normalizedApproval(nicheId) * 0.6 + erPct * 0.4;
    };

    const byCombinedDesc = (a: typeof eligibleNiches[0], b: typeof eligibleNiches[0]) =>
      combinedScore(b.id) - combinedScore(a.id);

    // ── Step 2: HIGH-ER niches get GUARANTEED reserved slots (tier 1 priority) ──
    // These always enter the window regardless of recent usage history.
    const highER = [...eligibleNiches.filter(n => (scoreMap.get(n.id) ?? -1) >= 3)].sort(byCombinedDesc);
    const highERInWindow = highER.slice(0, MAX_WINDOW); // cap at 7 if many high-ER niches

    // ── Step 3: Derive rolling-window anchor from niches used last 15 days ────
    // Scoped by businessId to prevent cross-business interference.
    const recentTopics = await getRecentAutoTopics(15, userId, businessId);
    const highERNames = new Set(highERInWindow.map(n => n.name));
    // Anchored = used recently + NOT already guaranteed by high-ER tier
    const recentNonHighER = eligibleNiches.filter(n => recentTopics.has(n.name) && !highERNames.has(n.name))
      .sort(byCombinedDesc);

    // ── Step 4: Build active window — tier 1 high-ER → tier 2 anchored recent → tier 3 filler ──
    const activeWindow: typeof eligibleNiches = [...highERInWindow];

    // Fill from anchored recent non-high-ER niches (preserves rolling-window history)
    for (const n of recentNonHighER) {
      if (activeWindow.length >= MAX_WINDOW) break;
      activeWindow.push(n);
    }

    // If still not full, add best unused candidates with epoch-deterministic tie-breaking
    if (activeWindow.length < MAX_WINDOW) {
      const windowNames = new Set(activeWindow.map(n => n.name));
      const unusedSorted = eligibleNiches
        .filter(n => !windowNames.has(n.name))
        .sort(byCombinedDesc);

      const remainingSlots = MAX_WINDOW - activeWindow.length;
      const EPOCH_MS = 15 * 24 * 60 * 60 * 1000;
      const epochNum = Math.floor(Date.now() / EPOCH_MS);
      const scopeKey = businessId ?? userId ?? 0;
      const epochSeed = (epochNum * 1664525 + scopeKey * 1013904223) >>> 0;
      const dRand = (slot: number): number =>
        (((epochSeed ^ (slot * 2654435769)) >>> 0) / 4294967296);

      const candidateBag = unusedSorted.slice(0, Math.max(remainingSlots * 2, 4));
      while (activeWindow.length < MAX_WINDOW && candidateBag.length > 0) {
        const slot = activeWindow.length;
        let chosenIdx: number;
        if (dRand(slot) < 0.8 || candidateBag.length === 1) {
          chosenIdx = 0;
        } else {
          chosenIdx = ((epochSeed ^ (slot * 2246822519 + 3266489917)) >>> 0) % candidateBag.length;
        }
        activeWindow.push(candidateBag[chosenIdx]);
        candidateBag.splice(chosenIdx, 1);
      }
    }

    console.log(`[nicheWindow] biz=${businessId ?? "n/a"} active=${activeWindow.length}/${eligibleNiches.length} (highER=${highERInWindow.length} anchored=${recentNonHighER.length} approval=${approvalScoreMap.size}): [${activeWindow.map(n => n.name).join(", ")}]`);

    // Build weighted pool from the window only (ER-based weights)
    const pool = await buildWeightedNichePool(activeWindow, userId);

    // Capa 1 boost: add extra pool entries for niches with positive approval scores
    // Each +10 approval score → 1 extra pool entry (capped at 3 extra to avoid monopolization)
    const boostedPool = pool.length > 0 ? [...pool] : [...activeWindow];
    for (const n of activeWindow) {
      const approvalRaw = approvalScoreMap.get(n.id) ?? 0;
      if (approvalRaw > 0) {
        const extraCopies = Math.min(Math.floor(approvalRaw / 10), 3);
        for (let i = 0; i < extraCopies; i++) boostedPool.push(n);
      }
    }

    return { activeWindow, weightedPool: boostedPool.length > 0 ? boostedPool : activeWindow };
  } catch (err) {
    console.warn("[nicheWindow] fallback to first 7 niches:", err);
    const activeWindow = eligibleNiches.slice(0, MAX_WINDOW);
    return { activeWindow, weightedPool: activeWindow };
  }
}

/**
 * Returns the topic-gap in days, adaptive to the TOTAL eligible niche count (not the capped window).
 *
 * Rule: gap = min(totalNicheCount, MAX_GAP=15).
 * The active window is capped at 7 for display/selection, but the gap uses the full count
 * so users with 15+ niches benefit from the full 15-day repetition protection.
 * If a business has 3 niches → gap 3 days (ultra-fast rotation).
 * If they have 7 niches → gap 7 days.
 * If they have 15+ niches → gap 15 days (MAX_GAP — no niche repeats within 15 days).
 *
 * Only relevant for automatic runs — manual generation ignores the gap entirely.
 */
async function getAdaptiveTopicGapDays(userId?: number, eligibleNicheCount?: number): Promise<number> {
  const MAX_GAP = 15;
  try {
    // If caller already knows the total eligible niche count, use it directly
    if (eligibleNicheCount != null) {
      const gap = Math.max(1, Math.min(eligibleNicheCount, MAX_GAP));
      console.log(`[topicGap] adaptive gap=${gap} days (eligibleNiches=${eligibleNicheCount}, max=${MAX_GAP})`);
      return gap;
    }
    // FAIL-CLOSED: sin userId no hay datos de usuario → retornar gap por defecto sin query global
    if (userId == null) return MAX_GAP;
    const [row] = await db
      .select({ count: drizzleSql<number>`COUNT(DISTINCT ${postsTable.nicheId})` })
      .from(postsTable)
      .where(
        and(
          drizzleSql`${postsTable.nicheId} IS NOT NULL`,
          drizzleSql`${postsTable.status} IN ('scheduled','published')`,
          eq(postsTable.userId, userId),
        )
      );
    const nicheCount = Number(row?.count ?? MAX_GAP);
    const gap = Math.max(1, Math.min(nicheCount, MAX_GAP));
    if (gap < MAX_GAP) {
      console.log(`[topicGap] adaptive gap=${gap} days (${nicheCount} total niches < ${MAX_GAP}; max=${MAX_GAP})`);
    }
    return gap;
  } catch {
    return MAX_GAP;
  }
}

/** Creates a generation batch record and returns the batch ID */
async function createGenerationBatch(platform: string): Promise<number> {
  try {
    const [batch] = await db.insert(generationBatchesTable).values({ platform }).returning();
    return batch?.id ?? 0;
  } catch { return 0; }
}

/** Updates the post count on a finished batch */
async function closeBatch(batchId: number, postCount: number): Promise<void> {
  if (!batchId) return;
  try {
    await db.update(generationBatchesTable)
      .set({ postCount })
      .where(eq(generationBatchesTable.id, batchId));
  } catch { /* non-blocking */ }
}

/**
 * Returns background prompt hashes used in the last `withinBatches` batches.
 * We avoid reusing these to enforce visual variety.
 */
async function getRecentBackgroundHashes(withinBatches = 4): Promise<Set<string>> {
  try {
    // Get the batch IDs of the last N completed batches
    const recentBatches = await db
      .select({ id: generationBatchesTable.id })
      .from(generationBatchesTable)
      .orderBy(desc(generationBatchesTable.createdAt))
      .limit(withinBatches);
    const batchIds = recentBatches.map(b => b.id);
    if (batchIds.length === 0) return new Set();
    const rows = await db
      .select({ hash: contentHistoryTable.backgroundPromptHash })
      .from(contentHistoryTable)
      .where(and(
        inArray(contentHistoryTable.batchId, batchIds),
        drizzleSql`${contentHistoryTable.backgroundPromptHash} IS NOT NULL`
      ));
    return new Set(rows.map(r => r.hash).filter(Boolean) as string[]);
  } catch { return new Set(); }
}

/** Compute a short deterministic hash of a prompt string */
function hashPrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

// ─── Strategic brief distillation ────────────────────────────────────────────
/**
 * Extracts the core strategic concept from any input — short hint OR rich brief.
 * Short inputs (≤200 chars) are returned as-is.
 * Longer inputs (notes, draft captions, visual descriptions, creative briefs) are
 * distilled into a clean 1-2 sentence strategic direction so the full generation
 * pipeline can produce the best possible content.
 */
export async function distillStrategicBrief(rawInput: string): Promise<{ concept: string; imageScene?: string }> {
  const trimmed = rawInput.trim();
  if (!trimmed) return { concept: "" };
  if (trimmed.length <= 200) return { concept: trimmed }; // short hint — use as-is

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 320,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres un estratega de contenido digital experto en marketing para redes sociales. " +
            "Lee el briefing creativo (puede incluir borradores de caption, prompts de imagen, ideas visuales, notas de marketing) " +
            "y responde SOLO con un JSON con exactamente estos campos:\n" +
            "- \"concept\": ángulo emocional clave + audiencia + beneficio principal — máximo 2 oraciones concisas. No copies texto literal.\n" +
            "- \"imageScene\": si el briefing describe elementos visuales específicos (escenas, lugares, objetos, personas, atmósfera), " +
            "extráelos en 1-2 oraciones descriptivas para usar como prompt de imagen DALL-E. " +
            "Incluye: ambiente, ubicación, personaje/situación, iluminación. " +
            "Si no hay descripción visual específica, omite este campo o usa null.\n" +
            "Responde ÚNICAMENTE con JSON válido, sin texto adicional.",
        },
        {
          role: "user",
          content: `Briefing:\n\n${trimmed.slice(0, 3000)}`,
        },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) return { concept: trimmed.slice(0, 300) };
    const parsed = JSON.parse(raw);
    const concept = typeof parsed.concept === "string" && parsed.concept.length > 10
      ? parsed.concept
      : trimmed.slice(0, 300);
    const imageScene = typeof parsed.imageScene === "string" && parsed.imageScene.length > 10
      ? parsed.imageScene
      : undefined;
    return { concept, imageScene };
  } catch (err) {
    console.warn("[distillStrategicBrief] failed, using raw input:", err);
    return { concept: trimmed.slice(0, 300) };
  }
}

/**
 * Analyzes a reference image using GPT-4o vision and returns a detailed
 * description of its style, composition, lighting, colors and mood —
 * ready to be used as a visual scene directive in DALL-E image generation.
 *
 * @param base64OrDataUri  Raw base64 string or data URI (data:image/...;base64,...)
 * @returns A detailed visual description string (≤ 400 chars)
 */
export async function analyzeReferenceImage(base64OrDataUri: string): Promise<string> {
  try {
    const dataUri = base64OrDataUri.startsWith("data:")
      ? base64OrDataUri
      : `data:image/jpeg;base64,${base64OrDataUri}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "Eres un director de arte especializado en fotografía comercial para redes sociales. " +
            "Analiza la imagen de referencia y describe en 2-3 oraciones TANTO el tipo de escena " +
            "COMO el estilo visual que el cliente quiere replicar en su imagen generada. " +
            "Incluye: si hay personas (tipo, expresión, postura), entorno o fondo de la escena, " +
            "ambiente/atmósfera, iluminación, paleta de colores dominante, tipo de composición, " +
            "sensación general (profesional/cálida/industrial/etc). " +
            "NO menciones marcas, logos, texto visible ni nombres de empresas de la imagen. " +
            "Responde solo con la descripción, sin títulos ni bullet points.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe el estilo visual de esta imagen de referencia:" },
            { type: "image_url", image_url: { url: dataUri, detail: "low" } },
          ],
        },
      ],
    });

    const description = response.choices[0]?.message?.content?.trim() ?? "";
    console.log(`[analyzeReferenceImage] extracted style (${description.length} chars): "${description.slice(0, 80)}..."`);
    return description;
  } catch (err) {
    console.warn("[analyzeReferenceImage] vision analysis failed:", err);
    return "";
  }
}

// ─── Business saved reference-image style helper ───────────────────────────────

/**
 * In-memory cache for saved reference image style analyses.
 * Key = composite `"${businessId}:${userId ?? "*"}"` to prevent cross-tenant leaks.
 * TTL = 1 hour. Avoids repeated GPT Vision calls for the same business+user pair.
 */
const _bizRefStyleCache = new Map<string, { style: string; expiresAt: number }>();

/**
 * Returns the visual style description from a business's saved reference images.
 *
 * Priority:
 *  1. businessesTable.referenceImages (multi-business path) — parses stored URLs or
 *     objects, extracts pre-computed analysis text when available, otherwise fetches
 *     the first image from object storage and runs GPT Vision analysis.
 *  2. Returns empty string when no images exist, ownership check fails, or any error.
 *
 * Results are cached in memory for 1 hour per (businessId, userId) pair to avoid
 * repeated GPT Vision calls. Cross-tenant cache poisoning is prevented by keying on
 * both businessId AND userId — a different caller cannot reuse another user's cached
 * style for a business they do not own.
 *
 * Priority rule: manual referenceImageBase64 (uploaded in the moment) ALWAYS wins over this.
 */
export async function getBusinessSavedRefStyle(businessId: number, userId?: number): Promise<string> {
  const now = Date.now();
  // Composite cache key prevents one user from receiving another user's cached style.
  // Internal scheduler calls (userId = undefined) have pre-validated biz ownership.
  const cacheKey = `${businessId}:${userId ?? "*"}`;
  const cached = _bizRefStyleCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.style;

  let style = "";
  try {
    const whereClause = userId != null
      ? and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
      : eq(businessesTable.id, businessId);
    const [biz] = await db
      .select({ referenceImages: businessesTable.referenceImages })
      .from(businessesTable)
      .where(whereClause)
      .limit(1);

    if (biz?.referenceImages) {
      // Format A: array of objects with pre-stored analysis { analysis?: string, url?: string }
      // Format B: array of plain URL strings
      const imgs = JSON.parse(biz.referenceImages) as Array<{ analysis?: string; url?: string } | string>;

      // Prefer stored analysis (no GPT call) — available if image was analyzed at upload time
      const storedAnalysis = imgs
        .map(i => (typeof i === "object" ? i.analysis?.trim() : undefined))
        .find(a => Boolean(a));

      if (storedAnalysis) {
        style = storedAnalysis;
      } else {
        // Fallback: fetch first image URL from object storage and run GPT Vision analysis.
        // Only allow relative object-storage paths (starting with /) or HTTPS URLs to
        // constrain the request surface and prevent SSRF via crafted referenceImages data.
        const firstUrl = imgs
          .map(i => (typeof i === "string" ? i : (i.url ?? "")))
          .find(u => Boolean(u) && (u.startsWith("/") || u.startsWith("https://")));
        if (firstUrl) {
          const buffer = await loadBusinessLogoBuffer(firstUrl);
          if (buffer) {
            style = await analyzeReferenceImage(buffer.toString("base64"));
          }
        }
      }
    }
  } catch { /* non-fatal — callers treat empty string as "no saved style" */ }

  _bizRefStyleCache.set(cacheKey, { style, expiresAt: now + 3_600_000 });
  return style;
}

// ─── Brand context helper ─────────────────────────────────────────────────────

/**
 * Resuelve el ai_context de una industria.
 * Prioridad: catálogo estático (aiContext predefinido) → custom_industries DB.
 * Resultado: null si la industria no tiene contexto configurado.
 */
async function resolveIndustryAiContext(industryName: string | null | undefined): Promise<IndustryAiContext | null> {
  if (!industryName) return null;
  const nl = industryName.toLowerCase();

  // 1. Buscar en catálogo estático (O(n) sobre ~35 entradas — muy rápido)
  const staticEntry = INDUSTRY_CATALOG.find(e => e.name.toLowerCase() === nl);
  if (staticEntry?.aiContext) return staticEntry.aiContext;

  // 2. Buscar sub-industria en catálogo estático (nivel 2)
  for (const entry of INDUSTRY_CATALOG) {
    const sub = entry.subcategories.find(s => s.name.toLowerCase() === nl);
    if (sub && entry.aiContext) return entry.aiContext;
  }

  // 3. Buscar en custom_industries (con caché de 1h)
  return getCustomIndustryAiContext(industryName);
}

/**
 * Normaliza subcategorías sin romper compatibilidad:
 * - subIndustries puede venir como JSON array: ["A","B"]
 * - subIndustries también puede venir como string separado por comas
 * - subIndustry legacy puede venir como una o varias separadas por comas
 * Devuelve lista limpia, sin vacíos y sin duplicados.
 */
function normalizeSubIndustryList(
  legacySubIndustry?: string | null,
  subIndustriesRaw?: string | null,
): string[] {
  const collected: string[] = [];

  const addOne = (value: unknown) => {
    if (typeof value !== "string") return;
    const clean = value.trim();
    if (clean) collected.push(clean);
  };

  const addFromString = (value?: string | null) => {
    if (!value) return;
    const clean = value.trim();
    if (!clean) return;

    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        parsed.forEach(addOne);
        return;
      }
    } catch {
      // No era JSON: lo tratamos como CSV legacy.
    }

    clean.split(",").forEach(addOne);
  };

  // Preferimos la lista nueva, pero también aceptamos legacy por compatibilidad.
  addFromString(subIndustriesRaw);
  addFromString(legacySubIndustry);

  const seen = new Set<string>();
  return collected.filter(item => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fetches the brand profile for a given userId and returns an additional context
 * block to inject into AI prompts. Returns empty string if no profile exists.
 */
async function getBrandContextBlock(userId?: number, businessId?: number): Promise<string> {
  if (!userId && !businessId) return "";
  try {
    const parts: string[] = [];

    if (businessId != null) {
      // ── Multi-business path: read from businesses table (per-business brand config) ──
      // V5 FIX: verificar ownership con userId cuando está disponible — evita leak si businessId es incorrecto
      const [biz] = await db
        .select()
        .from(businessesTable)
        .where(
          userId != null
            ? and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
            : eq(businessesTable.id, businessId)
        )
        .limit(1);
      if (!biz) return "";
      if (biz.name) parts.push(`EMPRESA: ${biz.name}`);
      if (biz.industry) {
        parts.push(`INDUSTRIA: ${biz.industry}`);
        // Sub-industrias (especialidades) — N2 precision for caption context.
        // Lee tanto el campo nuevo subIndustries como el legacy subIndustry.
        const activeSubs = normalizeSubIndustryList(biz.subIndustry, biz.subIndustries);
        const enhancedIndustry = buildEnhancedIndustryContext(
          biz.industry,
          activeSubs.length ? JSON.stringify(activeSubs) : null,
        );

        if (enhancedIndustry && enhancedIndustry !== biz.industry) {
          parts.push(`INDUSTRIA ESPECIALIZADA PARA IA: ${enhancedIndustry}`);
        }
        if (activeSubs.length === 1) {
          parts.push(`ESPECIALIDAD DEL NEGOCIO: ${activeSubs[0]}`);
        } else if (activeSubs.length > 1) {
          parts.push(`ESPECIALIDADES DEL NEGOCIO: ${activeSubs.join(", ")} — priorizar estas áreas al crear hooks, captions, hashtags e ideas visuales.`);
        }
        // Inyectar contexto IA de la industria para posts más relevantes
        const industryCtx = await resolveIndustryAiContext(biz.industry);
        if (industryCtx) {
          parts.push(`CONTEXTO DE LA INDUSTRIA: ${industryCtx.description}`);
          parts.push(`TEMAS DE CONTENIDO RECOMENDADOS PARA ESTA INDUSTRIA: ${industryCtx.content_topics.join(" | ")}`);
          parts.push(`TONO RECOMENDADO PARA ESTA INDUSTRIA: ${industryCtx.recommended_tone}`);
          parts.push(`AUDIENCIA OBJETIVO DE LA INDUSTRIA: ${industryCtx.audience}`);
        }
      }
      if (biz.slogan) parts.push(`SLOGAN DE LA MARCA: ${biz.slogan}`);
      if (biz.description) parts.push(`DESCRIPCIÓN DEL NEGOCIO: ${biz.description}`);
      if (biz.audienceDescription) parts.push(`AUDIENCIA OBJETIVO: ${biz.audienceDescription}`);
      if (biz.brandTone) parts.push(`TONO DE COMUNICACIÓN: ${biz.brandTone}`);
      if (biz.primaryColor) parts.push(`COLOR PRINCIPAL DE MARCA: ${biz.primaryColor}`);
      if (biz.secondaryColor) parts.push(`COLOR SECUNDARIO DE MARCA: ${biz.secondaryColor}`);
      if (biz.brandFont) parts.push(`TIPOGRAFÍA DE MARCA: ${biz.brandFont}`);
      if (biz.defaultLocation) parts.push(`CIUDAD/UBICACIÓN: ${biz.defaultLocation}`);
      if (biz.website) parts.push(`SITIO WEB: ${biz.website}`);
      if (biz.referenceImages) {
        try {
          const imgs = JSON.parse(biz.referenceImages) as string[];
          if (imgs.length > 0) {
            parts.push(
              `ESTILO VISUAL DE REFERENCIA: La marca tiene ${imgs.length} imagen(es) de referencia. ` +
              `[REF_IMAGES:${imgs.join(",")}]`
            );
          }
        } catch { /* non-fatal */ }
      }
      // V7 FIX: guardrail GPT — sin industry explícita, instruir a NO inferir industria del nombre
      if (!biz.industry) {
        parts.push(
          "IMPORTANTE: NO inferir ni asumir el tipo de negocio, industria o sector desde el nombre de la empresa. " +
          "Generar contenido completamente neutro basado ÚNICAMENTE en la información explícita aquí proporcionada. " +
          "Prohibido mencionar belleza, estética, salud, tecnología u otro sector específico salvo que esté indicado."
        );
      }
    } else if (userId != null) {
      // ── Legacy path: read from brand_profiles by userId ──
      const [profile] = await db.select().from(brandProfilesTable).where(eq(brandProfilesTable.userId, userId)).limit(1);
      if (!profile) return "";
      if (profile.companyName) parts.push(`EMPRESA: ${profile.companyName}`);
      if (profile.industry) {
        parts.push(`INDUSTRIA: ${profile.industry}`);
        // Sub-industrias (especialidades) from brand_profiles.
        // Lee tanto el campo nuevo subIndustries como el legacy subIndustry.
        const bpActiveSubs = normalizeSubIndustryList(profile.subIndustry, profile.subIndustries);
        const bpEnhancedIndustry = buildEnhancedIndustryContext(
          profile.industry,
          bpActiveSubs.length ? JSON.stringify(bpActiveSubs) : null,
        );

        if (bpEnhancedIndustry && bpEnhancedIndustry !== profile.industry) {
          parts.push(`INDUSTRIA ESPECIALIZADA PARA IA: ${bpEnhancedIndustry}`);
        }
        if (bpActiveSubs.length === 1) {
          parts.push(`ESPECIALIDAD DEL NEGOCIO: ${bpActiveSubs[0]}`);
        } else if (bpActiveSubs.length > 1) {
          parts.push(`ESPECIALIDADES DEL NEGOCIO: ${bpActiveSubs.join(", ")} — priorizar estas áreas al crear hooks, captions, hashtags e ideas visuales.`);
        }
        const industryCtx = await resolveIndustryAiContext(profile.industry);
        if (industryCtx) {
          parts.push(`CONTEXTO DE LA INDUSTRIA: ${industryCtx.description}`);
          parts.push(`TEMAS DE CONTENIDO RECOMENDADOS PARA ESTA INDUSTRIA: ${industryCtx.content_topics.join(" | ")}`);
          parts.push(`TONO RECOMENDADO PARA ESTA INDUSTRIA: ${industryCtx.recommended_tone}`);
          parts.push(`AUDIENCIA OBJETIVO DE LA INDUSTRIA: ${industryCtx.audience}`);
        }
      }
      if (profile.slogan) parts.push(`SLOGAN DE LA MARCA: ${profile.slogan}`);
      if (profile.country) parts.push(`PAÍS/REGIÓN: ${profile.country}`);
      if (profile.city) parts.push(`CIUDAD: ${profile.city}`);
      if (profile.businessDescription) parts.push(`DESCRIPCIÓN DEL NEGOCIO: ${profile.businessDescription}`);
      if (profile.audienceDescription) parts.push(`AUDIENCIA OBJETIVO: ${profile.audienceDescription}`);
      if (profile.brandTone) parts.push(`TONO DE COMUNICACIÓN: ${profile.brandTone}`);
      if (profile.primaryColor) parts.push(`COLOR PRINCIPAL DE MARCA: ${profile.primaryColor}`);
      if (profile.secondaryColor) parts.push(`COLOR SECUNDARIO DE MARCA: ${profile.secondaryColor}`);
      if (profile.brandFont) parts.push(`TIPOGRAFÍA DE MARCA: ${profile.brandFont}`);
      if (profile.website) parts.push(`SITIO WEB: ${profile.website}`);
      if (profile.referenceImages) {
        let imgs: string[] = [];
        try { imgs = JSON.parse(profile.referenceImages); } catch { imgs = profile.referenceImages.split(",").filter(Boolean); }
        if (imgs.length > 0) {
          parts.push(
            `ESTILO VISUAL DE REFERENCIA: La marca tiene ${imgs.length} imagen(es) de referencia. ` +
            `[REF_IMAGES:${imgs.join(",")}]`
          );
        }
      }
      // V7 FIX: guardrail GPT — sin industry explícita, instruir a NO inferir industria del nombre
      if (!profile.industry) {
        parts.push(
          "IMPORTANTE: NO inferir ni asumir el tipo de negocio, industria o sector desde el nombre de la empresa. " +
          "Generar contenido completamente neutro basado ÚNICAMENTE en la información explícita aquí proporcionada. " +
          "Prohibido mencionar belleza, estética, salud, tecnología u otro sector específico salvo que esté indicado."
        );
      }
    }

    if (parts.length === 0) return "";
    return `\n\nPERFIL DE MARCA DEL CLIENTE (adapta el contenido a esta marca específica):\n${parts.join("\n")}`;
  } catch {
    return "";
  }
}

// ─── Caption generation ───────────────────────────────────────────────────────

/** Palette of hook styles for carousel posts — each call gets a DIFFERENT style to prevent structural repetition */
export const CAROUSEL_HOOK_STYLES: string[] = [
  "Comienza con una PREGUNTA que genere curiosidad genuina (ej: '¿Sabías que...?', '¿Por qué...?')",
  "Comienza con un DATO SORPRENDENTE o estadística concreta con número (ej: 'El 73% de...')",
  "Comienza con una CONTRADICCIÓN o paradoja que rompa expectativas (ej: 'Haz menos para lograr más')",
  "Comienza con una CONFESIÓN o revelación personal (ej: 'Nadie nos enseñó esto sobre...')",
  "Comienza con una ADVERTENCIA o alerta urgente (ej: 'Cuidado con...' / 'Atención...')",
  "Comienza con un RESULTADO concreto que la audiencia quiere lograr (ej: 'Así logramos X en Y días')",
  "Comienza con una frase de CONTRASTE radical (ej: 'Antes: X. Ahora: Y.')",
  "Comienza con una INVITACIÓN directa a descubrir algo valioso pero sin usar 'Desliza para descubrir'",
  "Comienza con una CITA o frase de un cliente real (ej: 'Un cliente nos dijo algo que cambió todo...')",
  "Comienza con una PROMESA de transformación específica (ej: 'En 3 pasos vas a entender...')",
];

export async function generateCaption(
  nicheContext: string,
  platform: string,
  contentType: string = "image",
  avoidHooks?: string[],        // Hooks to avoid for 80% novelty rule (diversity engine)
  userId?: number,              // Brand profile owner — injects client-specific brand context
  defaultLocationOverride?: string | null,  // explicit override; when undefined, auto-loads from brand profile
  businessId?: number,          // Active business — determines brand context; overrides userId-based lookup
  hookStyleHint?: string,       // For carousels: specific hook style/format to use (rotated per post)
  addonReservedChars: number = 0, // Chars reserved for caption addon (addon text + "\n\n" separator)
): Promise<{ caption: string; hashtags: string; hashtagsTiktok: string; costUsd: number }> {

  const brandCtx = await getBrandContextBlock(userId, businessId);

  // Auto-load defaultLocation + industry — from businesses (when businessId known) or brand_profiles (legacy)
  // V_CAP_4 FIX: industry también se carga para pasarla a pickHashtags y generar hashtags correctos
  // (ej: negocios solares reciben hashtags solares; negocios no-solares NO reciben #EnergíaLimpia)
  let defaultLocation: string | null = defaultLocationOverride !== undefined ? defaultLocationOverride : null;
  let bizIndustry: string | null = null;
  if (defaultLocationOverride === undefined) {
    if (businessId != null) {
      const [biz] = await db
        .select({ defaultLocation: businessesTable.defaultLocation, industry: businessesTable.industry })
        .from(businessesTable)
        .where(eq(businessesTable.id, businessId))
        .limit(1);
      defaultLocation = biz?.defaultLocation ?? null;
      bizIndustry = biz?.industry ?? null;
    } else if (userId) {
      const [bp] = await db
        .select({ defaultLocation: brandProfilesTable.defaultLocation, industry: brandProfilesTable.industry })
        .from(brandProfilesTable)
        .where(eq(brandProfilesTable.userId, userId))
        .limit(1);
      defaultLocation = bp?.defaultLocation ?? null;
      bizIndustry = bp?.industry ?? null;
    }
  }

  const loc = typeof defaultLocation === "string" ? defaultLocation.trim() : "";
  const isCali = loc.toLowerCase().includes("cali");
  const locationCtx = loc
    ? `\nUBICACIÓN PREDETERMINADA DEL USUARIO: "${loc}". ${
        isCali
          ? `Cuando el contenido lo permita, menciona naturalmente esta ciudad usando también sus alias y región: "Cali", "Santiago de Cali", "la sucursal del cielo", "Valle del Cauca", "Colombia". Puedes variar entre estas expresiones para dar riqueza local al texto.`
          : `Cuando el contenido lo permita, menciona naturalmente esta ubicación y su región o municipios aledaños.`
      }`
    : "";

  const brandIdentity = brandCtx
      ? `Eres el community manager de la siguiente marca. USA EXCLUSIVAMENTE la información de esta marca — nunca menciones otras empresas, productos o servicios que no sean de esta marca:\n${brandCtx}`
      : "Eres un community manager profesional. Crea contenido de alta calidad basado únicamente en el nicho proporcionado.";

    if (contentType === "story") {
      const storyModel = "gpt-5.2";
      const storyResp = await openai.chat.completions.create({
        model: storyModel,
        max_completion_tokens: 200,
        messages: [
          {
            role: "system",
            content: `${brandIdentity}${locationCtx}\n\nCreas textos para HISTORIAS (Stories) en redes sociales — ultra-cortas, impactantes y directas. Responde SOLO con JSON válido con campos "caption" y "hashtags".`,
          },
          {
            role: "user",
            content: `Crea el texto para una HISTORIA de ${platform === "tiktok" ? "TikTok" : "Instagram"} sobre: ${nicheContext}

Formato:
LÍNEA 1: [Emoji] FRASE IMPACTANTE de máximo 6 palabras [Emoji]
LÍNEA 2: (en blanco)
LÍNEA 3: Un dato concreto o beneficio clave para la audiencia
LÍNEA 4: (en blanco)
LÍNEA 5: "👆 Link en bio"

Máximo 30 palabras. Sin hashtags. El campo "hashtags": dejar vacío "".
NO menciones ninguna otra empresa ni marca.`,
          },
        ],
      });
      const storyCostUsd = calcGptCostUsd(storyModel, storyResp.usage);
      const storyRaw = storyResp.choices[0]?.message?.content ?? '{"caption":"","hashtags":""}';
      try {
        const parsed = JSON.parse(storyRaw);
        return { caption: parsed.caption || "", hashtags: "", hashtagsTiktok: "", costUsd: storyCostUsd };
      } catch {
        return { caption: storyRaw, hashtags: "", hashtagsTiktok: "", costUsd: storyCostUsd };
      }
    }

    const platformInstr = platform === "tiktok"
      ? "Formato TikTok: dinámico, energético. Máximo 150 palabras. El gancho de la primera línea debe hacer PARAR el scroll."
      : "Formato Instagram: storytelling emotivo y detallado. Máximo 280 palabras.";
    const contentTypeInstr = contentType === "reel"
      ? "Tipo REEL — el gancho de la primera línea es lo más importante."
      : contentType === "carousel"
      ? `Tipo CARRUSEL — la primera línea debe invitar a deslizar de forma CREATIVA y ORIGINAL.${
          hookStyleHint
            ? `\n🎯 ESTILO DE GANCHO OBLIGATORIO para este post: ${hookStyleHint}`
            : "\nEVITA usar siempre 'Desliza para descubrir' — varía la estructura del gancho."
        }\nNUNCA empieces con la misma frase que posts anteriores — cada gancho debe tener un formato completamente distinto.`
      : "Tipo IMAGEN — storytelling con datos concretos que generen credibilidad.";

    const [topCaptionsGeneric, smartCtxGeneric] = await Promise.all([
      userId ? getUserTopCaptions(userId, 3) : Promise.resolve([]),
      userId ? getSmartContextForUser(userId) : Promise.resolve(""),
    ]);

    const learnedGeneric = topCaptionsGeneric.length > 0
      ? `PUBLICACIONES DE ESTA MARCA QUE MÁS ENGAGEMENT TUVIERON (aprende el estilo y tono — NO copies literalmente):\n\n${
          topCaptionsGeneric.map((c, i) => `--- Ejemplo ${i + 1} ---\n${c.caption}`).join("\n\n")
        }`
      : "";

    // Effective body limit: use per-platform base, then subtract addon reservation
    const platformBodyLimit = getBodyLimitForPlatform(platform);
    const effectiveBodyLimit = Math.max(400, platformBodyLimit - addonReservedChars);

    const genericSystem = [
      brandIdentity,
      locationCtx || null,
      smartCtxGeneric || null,
      `ESTRUCTURA DE PUBLICACIÓN — sigue este formato:
LÍNEA 1: [Emoji] GANCHO ULTRA-IMPACTANTE — máximo 8 palabras — que detenga el scroll [Emoji]
LÍNEA 2: (en blanco)
LÍNEAS 3-5: 2-3 frases que desarrollan el valor, beneficio o historia del nicho
LÍNEA 6: (en blanco)
LÍNEA 7-9: Llamada a la acción clara y específica para la audiencia de esta marca
LÍNEA 10: (en blanco)
ETIQUETA FINAL: Cierre con una frase de identidad de la marca (slogan o valor diferencial)

REGLAS ABSOLUTAS:
- Escribe SOLO para esta marca y su audiencia específica
- NO menciones ninguna otra empresa, producto, URL ni servicio externo
- NO uses información de otras marcas o sectores
- El tono debe ser coherente con el perfil de marca definido
- NO menciones ciudades, municipios ni regiones que no correspondan a la ubicación de esta marca (no menciones Yumbo, Jamundí, Candelaria, Palmira ni ningún municipio a menos que sea la ubicación del negocio)
- NUNCA menciones paneles solares, energía solar, vehículos eléctricos ni ningún sector que no sea el del negocio de esta marca
- El campo "caption" NO puede superar los ${effectiveBodyLimit} caracteres. Sé conciso y prioritario`,
    ].filter(Boolean).join("\n\n");

    const genericModel = "gpt-5.2";
    const genericResponse = await openai.chat.completions.create({
      model: genericModel,
      max_completion_tokens: 700,
      messages: [
        { role: "system", content: genericSystem },
        {
          role: "user",
          content: `${learnedGeneric ? learnedGeneric + "\n\n---\n\n" : ""}Crea una publicación ORIGINAL sobre: ${nicheContext}\n\n${platformInstr}\n${contentTypeInstr}\n\nEl campo "hashtags": dejar como string vacío "" — se asignan automáticamente.${
            avoidHooks && avoidHooks.length > 0
              ? `\n\n🚫 El gancho (primera línea) DEBE ser completamente diferente a estos ya usados:\n${avoidHooks.map(h => `• "${h}"`).join("\n")}`
              : ""
          }\n\nResponde SOLO con JSON válido: {"caption":"","hashtags":""}`,
        },
      ],
    });

    const feedCostUsd = calcGptCostUsd(genericModel, genericResponse.usage);
    const genericContent = genericResponse.choices[0]?.message?.content ?? '{"caption":"","hashtags":""}';
    try {
      const parsed = JSON.parse(genericContent);
      let captionBody = parsed.caption || "";
      if (captionBody.length > effectiveBodyLimit) {
        console.warn(`[Layer 1] generateCaption: caption body truncated from ${captionBody.length} to ${effectiveBodyLimit} chars (platform=${platform}, addonReserved=${addonReservedChars}, userId=${userId}, businessId=${businessId}).`);
        captionBody = captionBody.slice(0, effectiveBodyLimit);
      }
      return {
        caption: captionBody,
        hashtags: pickHashtags(defaultLocation, userId, businessId, bizIndustry),
        hashtagsTiktok: pickHashtagsTiktok(defaultLocation, userId, businessId, bizIndustry),
        costUsd: feedCostUsd,
      };
    } catch {
      let fallbackCaption = genericContent;
      if (fallbackCaption.length > effectiveBodyLimit) {
        fallbackCaption = fallbackCaption.slice(0, effectiveBodyLimit);
      }
      return {
        caption: fallbackCaption,
        hashtags: pickHashtags(defaultLocation, userId, businessId, bizIndustry),
        hashtagsTiktok: pickHashtagsTiktok(defaultLocation, userId, businessId, bizIndustry),
        costUsd: feedCostUsd,
      };
    }
}

export async function applySuggestion(
  currentCaption: string,
  instruction: string,
  userId?: number,
  businessId?: number
): Promise<string> {
  const systemPrompt = `Eres un editor de contenido experto. Tu trabajo es aplicar mejoras PRECISAS y QUIRÚRGICAS a un caption existente, cambiando SOLO lo que se indica. Mantén el resto del texto intacto, incluida la estructura y el tono de la marca. NO agregues referencias a otras empresas, URLs externas ni marcas ajenas. El caption resultante NO puede superar los 1600 caracteres. Responde ÚNICAMENTE con el caption mejorado, sin explicaciones, sin comillas envolventes.`;
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 700,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Caption actual:\n\n${currentCaption}\n\n---\n\nInstrucción de mejora: ${instruction}\n\nAplica solo ese cambio. Devuelve el caption completo con la mejora aplicada.`
      }
    ]
  });
  const result = response.choices[0]?.message?.content?.trim() ?? currentCaption;
  if (result.length > IG_CAPTION_BODY_LIMIT) {
    console.warn(`[IG Layer 1] applySuggestion: caption body truncated from ${result.length} to ${IG_CAPTION_BODY_LIMIT} chars.`);
    return result.slice(0, IG_CAPTION_BODY_LIMIT);
  }
  return result;
}

export async function checkHeadlineSpelling(text: string): Promise<{
  hasErrors: boolean;
  corrected: string;
  explanation: string;
}> {
  if (!text?.trim()) return { hasErrors: false, corrected: text, explanation: "" };
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content: `Eres un corrector ortográfico experto en español colombiano. Analiza el texto dado y devuelve un JSON con exactamente este formato:
{"hasErrors": boolean, "corrected": "texto corregido", "explanation": "explicación breve de los cambios en español, o cadena vacía si no hay errores"}

Reglas:
- Revisa ortografía, tildes, puntuación y mayúsculas/minúsculas adecuadas para un titular de Instagram
- Los titulares en MAYÚSCULAS son válidos (no los corrijas a minúsculas)
- Si el texto está correcto, devuelve hasErrors: false y corrected igual al texto original
- explanation debe ser breve y en español, ej: "Falta tilde en 'también'" o "" si no hay errores
- Responde SOLO el JSON, sin texto adicional ni markdown`
      },
      {
        role: "user",
        content: text.trim()
      }
    ]
  });
  try {
    const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const result = JSON.parse(cleaned);
    return {
      hasErrors: Boolean(result.hasErrors),
      corrected: result.corrected ?? text,
      explanation: result.explanation ?? ""
    };
  } catch {
    return { hasErrors: false, corrected: text, explanation: "" };
  }
}

/**
 * Escapes literal newlines/carriage-returns that appear INSIDE JSON string values.
 * GPT sometimes returns JSON where the "corrected" field contains real \n characters
 * instead of the escaped sequence \\n, making JSON.parse throw.
 * A simple character-level state machine handles this safely.
 */
function escapeLiteralNewlinesInJsonStrings(s: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) {
      result += c;
      escaped = false;
    } else if (c === "\\" && inString) {
      result += c;
      escaped = true;
    } else if (c === '"') {
      inString = !inString;
      result += c;
    } else if (inString && c === "\n") {
      result += "\\n";
    } else if (inString && c === "\r") {
      // skip bare CR
    } else {
      result += c;
    }
  }
  return result;
}

/**
 * Check spelling, accents and grammar in a full Instagram/TikTok post caption.
 * Ignores emojis, hashtags, and URLs — only flags real language errors.
 */
export async function checkCaptionSpelling(text: string): Promise<{
  hasErrors: boolean;
  corrected: string;
  explanation: string;
}> {
  if (!text?.trim()) return { hasErrors: false, corrected: text, explanation: "" };

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `Eres un corrector ortográfico experto en español colombiano. Tu tarea es revisar el caption completo de un post de redes sociales.

Responde SOLO con este JSON exacto, sin texto adicional ni bloques de código markdown:
{"hasErrors": boolean, "corrected": "caption corregido completo", "explanation": "lista breve de errores encontrados en español, o cadena vacía si no hay errores"}

Reglas estrictas:
- Revisa TILDES Y ACENTOS aplicando las reglas de la RAE:
  • Agudas (acento en última sílaba) llevan tilde SOLO si terminan en vocal, -n o -s (ej: "tambien"→"también", "aqui"→"aquí", "cafe"→"café")
  • Graves/llanas (acento en penúltima sílaba) llevan tilde SOLO si terminan en consonante distinta de -n o -s (ej: "facil"→"fácil", "arbol"→"árbol")
  • Esdrújulas/sobresdrújulas siempre llevan tilde (ej: "electrica"→"eléctrica", "energia"→"energía")
  • Tilde diacrítica SOLO en casos claros: tú/tu, él/el, sí/si, más/mas, té/te, sé/se, dé/de, mí/mi
  • NUNCA marques como error palabras correctas como: cargador, carga, solar, motor, panel, cable, red, luz, cargo, sector, etc.
- Revisa ORTOGRAFÍA de palabras claramente mal escritas (ej: "mañanaa", "enerjia", "vehiulos")
- Revisa concordancia básica de género/número cuando sea error claro
- NO corrijas ni marques como error: emojis, hashtags (#palabra), arrobas (@usuario), URLs, puntos suspensivos (...), exclamaciones/interrogaciones estilo redes sociales
- NO cambies el tono, registro ni estilo del texto
- CRÍTICO: conserva EXACTAMENTE los saltos de línea del texto original. En el JSON representa cada salto de línea como \\n (barra invertida + n), NO como un salto de línea literal
- Si el texto está bien escrito, devuelve hasErrors: false con corrected igual al texto original y explanation vacía
- Si hay errores, lista los principales en explanation (máx 3 ejemplos), ej: "Falta tilde en 'energía', 'vehículos', 'también'"
- corrected debe ser el caption COMPLETO ya corregido (mismo largo, mismos emojis, mismos hashtags, mismos saltos de línea)
- En caso de duda, NO marques como error. Solo señala errores que sean 100% seguros según las reglas anteriores.`
      },
      {
        role: "user",
        content: text
      }
    ]
  });

  try {
    const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
    // Strip markdown code fences if present
    const stripped = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
    // Escape literal newlines inside JSON string values (GPT sometimes does this)
    const sanitized = escapeLiteralNewlinesInJsonStrings(stripped);
    const result = JSON.parse(sanitized);
    return {
      hasErrors: Boolean(result.hasErrors),
      corrected: result.corrected ?? text,
      explanation: result.explanation ?? ""
    };
  } catch {
    // Last resort: try to extract fields with regex so we don't lose the corrected text
    try {
      const raw2 = response.choices[0]?.message?.content ?? "";
      const hasErrors = /"hasErrors"\s*:\s*true/.test(raw2);
      const expl = /"explanation"\s*:\s*"([^"]*)"/.exec(raw2)?.[1] ?? "";
      // If we can't parse safely, return original text unchanged
      return { hasErrors, corrected: text, explanation: expl };
    } catch {
      return { hasErrors: false, corrected: text, explanation: "" };
    }
  }
}

/**
 * Generate 5 short, punchy image headline suggestions in Spanish based on the post caption.
 * Titles are uppercase, ≤ 60 chars, suitable for Instagram/TikTok image overlays.
 */
export async function suggestHeadlines(
  caption: string,
  platform?: string | null,
  contentType?: string | null,
): Promise<string[]> {
  const platformNote = platform === "tiktok" ? "TikTok (video corto)" : "Instagram";
  const typeNote = contentType === "reel" ? "reel/video" : contentType === "carousel" ? "carrusel" : "imagen estática";

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 300,
    messages: [
      {
        role: "system",
        content: `Eres experto en marketing digital y creación de contenido para redes sociales.
Tu tarea: generar 5 titulares para superponer en imágenes de ${platformNote} (${typeNote}).

Reglas:
- Cada titular EN MAYÚSCULAS, máx 55 caracteres, sin tildes (el canal de imagen no las renderiza bien)
- Directos, impactantes, orientados a beneficio o urgencia
- Basados en el tema del caption — no inventes marcas ni productos ajenos
- Responde SOLO un JSON array de 5 strings, sin texto adicional ni markdown
- Ejemplo de formato: ["TRANSFORMA TU NEGOCIO HOY","AHORRA DESDE EL PRIMER MES","LA SOLUCION QUE ESPERABAS"]`
      },
      {
        role: "user",
        content: `Caption del post:\n${caption.slice(0, 800)}`
      }
    ]
  });

  try {
    const raw = response.choices[0]?.message?.content?.trim() ?? "[]";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .slice(0, 5);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Re-applies logo + text overlays onto an existing raw background (no new DALL-E call).
 * Use this when the user only changes text size, position, style, or logo.
 */
export async function applyOverlays(
  rawBackground: string,
  logoPosition: LogoPosition = "top-right",
  logoColor: LogoColor = "white",
  captionHook?: string,
  textStyle: TextStyle = "cinema",
  textPosition: TextPosition = "bottom",
  textSize: string = "medium",
  imageFilter: ImageFilter = "none",
  overlayFont?: string,
  brandTagline?: string,
  accentColor?: string,
  businessId?: number,
  userId?: number,
  titleColor2?: string,        // secondary brand color
  signatureText?: string | null,  // custom firma text (null = auto-resolve from business)
  showSignature?: boolean,        // false = hide firma entirely
  customLogoUrl?: string,         // override logo path — if set, replaces business logo
  preloadedLogoBuffer?: Buffer | null,  // pre-loaded logo buffer (skips internal DB load when provided)
  contentType?: string,        // content type for platform-aware safe zones
  font2?: string               // optional second font for lines 2-N of headline
): Promise<string> {
  // Resolve logo and tagline from the business/user context when not explicitly provided
  let resolvedLogoBuffer: Buffer | null = null;
  let resolvedTagline = signatureText !== undefined ? (signatureText ?? "") : brandTagline;
  let resolvedAccent = accentColor;
  let resolvedTitleColor2 = titleColor2;

  // Priority: customLogoUrl > preloadedLogoBuffer > business logo from DB
  if (customLogoUrl) {
    resolvedLogoBuffer = await loadBusinessLogoBuffer(customLogoUrl);
  } else if (preloadedLogoBuffer !== undefined) {
    resolvedLogoBuffer = preloadedLogoBuffer;
  }

  if (businessId != null || userId != null) {
    const [biz] = businessId != null
      ? await db.select({ logoUrl: businessesTable.logoUrl, primaryColor: businessesTable.primaryColor, secondaryColor: businessesTable.secondaryColor })
          .from(businessesTable).where(eq(businessesTable.id, businessId!)).limit(1)
      : [];
    if (biz) {
      // Load business logo from DB when no custom override and no valid pre-loaded buffer.
      // null means "pre-load ran but got nothing" — retry from DB in case it was a transient failure.
      if (!customLogoUrl && preloadedLogoBuffer == null) resolvedLogoBuffer = await loadBusinessLogoBuffer(biz.logoUrl);
      if (!resolvedAccent && biz.primaryColor) resolvedAccent = biz.primaryColor;
      if (!resolvedTitleColor2 && biz.secondaryColor) resolvedTitleColor2 = biz.secondaryColor;
    }
    if (resolvedTagline == null) {
      resolvedTagline = await resolveBrandTagline(userId, businessId);
    }
  }

  // showSignature=false hides the firma by passing empty string
  const finalTagline = showSignature === false ? "" : (resolvedTagline ?? "");

  return compositeLogoOnImage(rawBackground, logoPosition, logoColor, captionHook, textStyle, textPosition, textSize, imageFilter, overlayFont, resolvedLogoBuffer, finalTagline, resolvedAccent, resolvedTitleColor2, contentType, font2);
}

// Platform-optimal image sizes:
// - Instagram feed/reel/story: 4:5 portrait (1024×1280) — official Instagram optimal size
// - TikTok-only reel/story:    9:16 portrait (1024×1536) — fills TikTok full-screen
// - Carousel / image feed:     1:1 square (1024×1024)
// gpt-image-1 generates at 1024×1536; we center-crop to 4:5 for Instagram-bound content.
export function getImageSizeForPlatform(contentType: string, platform?: string): "1024x1024" | "1024x1536" | "1536x1024" | "auto" | "512x512" | "256x256" {
  if (contentType === "reel" || contentType === "story") return "1024x1536";
  if (platform === "instagram") return "1024x1024";
  if (platform === "tiktok")   return "1024x1536";
  return "1024x1024";
}

/**
 * Returns true when the generated portrait image should be center-cropped to 4:5
 * before overlays are applied. Rule: Instagram-bound portrait content uses 4:5.
 * TikTok-only content stays 9:16.
 */
export function shouldCropTo4by5(contentType: string, platform?: string): boolean {
  const isPortrait = contentType === "reel" || contentType === "story";
  if (!isPortrait) return false;
  // "both" means published to IG + TikTok — use Instagram's preferred ratio
  return platform === "instagram" || platform === "both";
}

/**
 * Reduce image dimensions by 30% (keeps 70%) at quality 96 — no perceptible loss.
 * Applied to rawBackground and originalRawBackground before storage to keep DB lean.
 * Example: 1024×1024 → 717×717  |  1024×1280 → 717×896  |  1024×1536 → 717×1075
 */
async function shrinkBy30(base64Image: string): Promise<string> {
  const buf = Buffer.from(base64Image, "base64");
  const meta = await sharp(buf).metadata();
  const w = Math.round((meta.width ?? 1024) * 0.70);
  const h = Math.round((meta.height ?? 1024) * 0.70);
  return (await sharp(buf).resize(w, h).jpeg({ quality: 96 }).toBuffer()).toString("base64");
}

/**
 * Center-crops a base64 image to 4:5 aspect ratio (width : height = 4 : 5).
 * If the image is already 4:5 or squarer, returns it unchanged.
 * From a 1024×1536 gpt-image-1 output → 1024×1280 (4:5).
 */
export async function cropTo4by5(base64Image: string): Promise<string> {
  const buffer = Buffer.from(base64Image, "base64");
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;
  const targetH = Math.round(w * 5 / 4); // 4:5 → targetH = w * 5/4
  if (h <= targetH) return base64Image;   // already 4:5 or wider — no crop needed
  const top = Math.round((h - targetH) / 2); // center crop
  const cropped = await sharp(buffer)
    .extract({ left: 0, top, width: w, height: targetH })
    .jpeg({ quality: 92 })
    .toBuffer();
  return cropped.toString("base64");
}

export async function generatePostImage(
  nicheContext: string,
  style: keyof typeof IMAGE_STYLES,
  contentType: string = "image",
  slideContext?: string,
  customInstruction?: string,
  logoPosition: LogoPosition = "top-right",
  captionHook?: string,
  logoColor: LogoColor = "white",
  textStyle: TextStyle = "cinema",
  textPosition: TextPosition = "bottom",
  textSize: string = "medium",
  platform?: string,
  characterDesc?: string,   // from CHARACTER_BANK — rotating persona
  sceneDesc?: string,       // location/background description
  coherentShot?: boolean,   // true = same business as sibling images, just a different angle
  imageFilter: ImageFilter = "none",
  userId?: number,          // Brand profile owner — injects client-specific brand context into prompt
  brandTagline?: string,    // text below headline overlay; empty = no tagline
  accentColor?: string,     // brand primary color for headline accent elements (titleColor1)
  businessId?: number,      // active business — determines brand context (logo, color, tagline)
  titleColor2?: string,     // brand secondary color for secondary accents
  signatureText?: string | null, // custom firma text (undefined = auto-resolve from business)
  showSignature?: boolean,  // false = hide firma entirely
  customLogoUrl?: string,   // override logo path — if set, replaces business logo
  overlayFont?: string,     // font family key — overrides textStyle font (e.g. "bebas", "montserrat")
  preloadedLogoBuffer?: Buffer | null,  // pre-loaded logo buffer from bulk-gen cache (skips internal DB load)
  font2?: string            // optional second font for lines 2-N of headline
): Promise<{ imageData: string; rawBackground: string; originalRawBackground?: string }> {
  const [brandCtxImg, bizLogoData] = await Promise.all([
    getBrandContextBlock(userId, businessId),
    businessId != null
      ? db.select({ logoUrl: businessesTable.logoUrl }).from(businessesTable).where(eq(businessesTable.id, businessId)).limit(1).then(r => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const logoBuffer = customLogoUrl
    ? await loadBusinessLogoBuffer(customLogoUrl)
    : preloadedLogoBuffer != null   // only skip DB load when it's a real Buffer, not null
    ? preloadedLogoBuffer           // use pre-loaded buffer (avoids double DB load in bulk generation)
    : await loadBusinessLogoBuffer(bizLogoData?.logoUrl);  // null or undefined → retry from DB
  const styles = contentType === "reel" ? REEL_STYLES : IMAGE_STYLES;
  const stylePrompt = styles[style as keyof typeof styles] || IMAGE_STYLES.photorealistic;

  const slideNote = slideContext ? `. Slide context: ${slideContext}` : "";
  const isPortraitIG = shouldCropTo4by5(contentType, platform);
  const isTikTokOnly = (contentType === "reel" || contentType === "story") && platform === "tiktok";
  const aspectNote = isPortraitIG
    ? "Vertical portrait composition 4:5 aspect ratio optimized for Instagram Reels and feed — keep the main subject centered, leave clean margins at top and bottom for branding."
    : isTikTokOnly
    ? "Vertical composition 9:16 aspect ratio optimized for TikTok full-screen viewing, with clean space in the upper portion for branding."
    : contentType === "reel" || contentType === "story"
    ? "Vertical portrait composition 4:5 aspect ratio optimized for mobile social media."
    : contentType === "carousel"
    ? "Square or horizontal composition optimized for carousel slide."
    : "Square composition 1:1 optimized for social media feed post.";

  // Character + scene injection — always provide a unique scene, rotate character per bank rules
  const characterNote = characterDesc
    ? `SUBJECT: ${characterDesc}. `
    : "";
  const sceneNote = sceneDesc
    ? coherentShot
      ? `LOCATION & BACKGROUND: ${sceneDesc}. IMPORTANT: This is the SAME establishment/location as the other images in this series — maintain full visual coherence (same place, same lighting style, same architectural details). Only the camera angle and framing are different. Do NOT change the place. `
      : `LOCATION & BACKGROUND: ${sceneDesc}. The background must be entirely unique and different from previous images — vary lighting, color palette, depth of field, and environmental details. `
    : "BACKGROUND: completely unique environment never seen before in this series, vary lighting and color palette. ";

  // When the user provides a custom instruction, it becomes the PRIMARY visual directive.
  // We do NOT prepend stylePrompt — its "premium/professional" language would override the user's intent.
  // The user's scene description leads the prompt so DALL-E obeys it faithfully.
  const brandVisualNote = brandCtxImg
    ? ` Brand: ${brandCtxImg.replace(/\n/g, " ").replace(/PERFIL DE MARCA DEL CLIENTE[^:]*:/i, "").trim()}.`
    : "";

  const genericStylePrompt = `Premium lifestyle advertising photography, vibrant modern aesthetic, clean composition, cinematic depth of field. ${CLEAN_PHOTO_NOTE}`;
  const prompt = customInstruction
    ? `SCENE (follow exactly): ${customInstruction}. Documentary-style social media photography. Realistic, authentic environments.${brandVisualNote} ${CLEAN_PHOTO_NOTE} ${aspectNote}`
    : `${genericStylePrompt}${slideNote} ${characterNote}${sceneNote}Context: ${nicheContext}.${brandVisualNote} ${aspectNote} Professional, high-impact social media advertising photography.`;

  // Select size based on platform + contentType (gpt-image-1 generates at 1024×1536 for portrait)
  const size = getImageSizeForPlatform(contentType, platform);
  const buffer = await generateImageBuffer(prompt, size);

  const raw9x16 = buffer.toString("base64");

  // Instagram-bound portrait: preserve original 9:16 before cropping to 4:5
  // originalRawBackground = the full 9:16 AI output (needed for TikTok variant on approval)
  // rawBackground         = 4:5 crop used for Instagram compositing
  let rawBackground = raw9x16;
  let originalRawBackground: string | undefined;
  if (isPortraitIG) {
    originalRawBackground = raw9x16; // save the 9:16 original before crop
    rawBackground = await cropTo4by5(raw9x16);
  }

  // Reduce physical dimensions by 30% (keep 70%) at quality 96 — no visible loss.
  // This cuts storage and load time significantly without affecting visual quality.
  rawBackground = await shrinkBy30(rawBackground);
  if (originalRawBackground) {
    originalRawBackground = await shrinkBy30(originalRawBackground);
  }

  // Resolve firma text: custom signatureText > auto-resolved brandTagline > ""
  const resolvedTaglineGPi = signatureText !== undefined
    ? (signatureText ?? "")
    : (brandTagline ?? "");
  const finalTaglineGPi = showSignature === false ? "" : resolvedTaglineGPi;

  const imageData = await compositeLogoOnImage(rawBackground, logoPosition, logoColor, captionHook, textStyle, textPosition, textSize, imageFilter, overlayFont, logoBuffer, finalTaglineGPi, accentColor, titleColor2, contentType, font2);
  return { imageData, rawBackground, originalRawBackground };
}

/**
 * Genera una nueva imagen de marca integrando un elemento visual existente.
 * Usa gpt-image-1 (image edit API) con el elemento como referencia multimodal,
 * produciendo una imagen que incorpora el elemento de forma coherente.
 *
 * Beneficio diferenciador de plan: requiere plans.element_ai_enabled = true.
 * Costo: +3 créditos (credit_cost_element_ai) + $0.040 USD de generación.
 *
 * El resultado se guarda en image_variants con style='element_ai'.
 */
export async function generateImageWithElement(
  elementBuffer: Buffer,
  elementAnalysis: string | null | undefined,
  nicheContext: string,
  style: keyof typeof IMAGE_STYLES,
  contentType: string,
  userId?: number,
  businessId?: number,
  platform?: string,
  captionHook?: string,
  logoPosition: LogoPosition = "top-right",
  logoColor: LogoColor = "white",
  textStyle: TextStyle = "cinema",
  textPosition: TextPosition = "bottom",
  textSize: string = "medium",
  imageFilter: ImageFilter = "none",
  accentColor?: string,
  titleColor2?: string,
  brandTagline?: string | null,
  showSignature?: boolean,
  overlayFont?: string,
  overlayFont2?: string,
  skipLogo?: boolean,         // true = do not load/render business logo overlay
): Promise<{ imageData: string; rawBackground: string }> {
  const brandCtx = await getBrandContextBlock(userId, businessId);
  const brandNote = brandCtx ? ` Brand context: ${brandCtx.replace(/\n/g, " ").replace(/PERFIL DE MARCA DEL CLIENTE[^:]*:/i, "").trim()}.` : "";
  const elementNote = elementAnalysis
    ? `ELEMENT TO INTEGRATE: ${elementAnalysis}. Seamlessly incorporate this element into the scene — it should appear naturally placed, as if it belongs in the environment.`
    : "Incorporate the provided element naturally into the scene.";
  const stylePrompt = (IMAGE_STYLES as Record<string, string>)[style] ?? IMAGE_STYLES.photorealistic;
  const aspectNote = contentType === "carousel"
    ? "Square composition 1:1 optimized for carousel slide."
    : "Square composition 1:1 optimized for social media feed post.";

  const prompt = `${stylePrompt} ${elementNote} Context: ${nicheContext}.${brandNote} ${aspectNote} Professional brand marketing photography. The element must be the hero of the image. CLEAN_PHOTO: no text, watermarks, or logos embedded in the image itself.`;

  const buffer = await generateImageBufferWithElement(elementBuffer, prompt, "1024x1024");
  let rawBackground = buffer.toString("base64");
  rawBackground = await shrinkBy30(rawBackground);

  let logoBuffer: Buffer | null = null;
  if (!skipLogo) {
    const [bizLogoData] = businessId != null
      ? await db.select({ logoUrl: businessesTable.logoUrl }).from(businessesTable).where(eq(businessesTable.id, businessId)).limit(1)
      : [null];
    logoBuffer = await loadBusinessLogoBuffer(bizLogoData?.logoUrl);
  }

  const resolvedTagline = showSignature === false ? "" : (brandTagline ?? "");

  const imageData = await compositeLogoOnImage(
    rawBackground, logoPosition, logoColor, captionHook,
    textStyle, textPosition, textSize, imageFilter,
    overlayFont, logoBuffer, resolvedTagline,
    accentColor, titleColor2, contentType, overlayFont2,
  );

  return { imageData, rawBackground };
}

export async function generateCarouselSlides(
  nicheContext: string,
  style: keyof typeof IMAGE_STYLES,
  slideCount: number,
  captionHook?: string,
  textStyle: TextStyle = "cinema",
  characterDesc?: string,   // rotating persona from CHARACTER_BANK
  sceneDesc?: string,       // fallback generic background from BACKGROUND_SCENES
  businessContext?: string, // if set: character's own business — use different angles per slide
  userId?: number,          // owner — for per-user headline anti-repetition tracking
  brandTagline?: string,    // overlay tagline for brand identity
  accentColor?: string,     // brand primary color for headline accent elements
  businessId?: number,      // active business — determines brand context (logo, color, tagline)
  customInstruction?: string, // ref-image visual style to inject into every slide
  overlayFont?: string,     // brand font key override (from businesses.brandFont)
  signatureText?: string | null, // custom firma text
  showSignature?: boolean,  // false = hide firma entirely
  preloadedLogoBuffer?: Buffer | null,  // pre-loaded logo buffer from bulk-gen cache
  fullCaption?: string,     // full post caption — enables GPT-generated contextual headlines for slides 2-N
  postPlatform?: string,    // actual post platform ("instagram" | "tiktok" | "both") — refines GPT prompt
  overlayFilter?: ImageFilter, // learned visual filter default (Task #368)
): Promise<Array<{ imageData: string; rawBackground: string; originalRawBackground?: string }>> {
  const slidesToGenerate = Math.min(Math.max(slideCount, 3), 5);
  const hasOwnBusiness = Boolean(businessContext);

  // Pre-resolve slide headlines — slides 2-N get GPT-generated contextual titles when
  // fullCaption is provided, ensuring all headlines match the post theme (not generic ECO phrases).
  // Falls back to static CAROUSEL_HEADLINE_POOLS when GPT is unavailable or caption is missing.
  let gptHeadlines: string[] = [];
  if (fullCaption && slidesToGenerate > 1) {
    try {
      const effectivePlatform = postPlatform === "tiktok" ? "tiktok" : "instagram";
      gptHeadlines = await suggestHeadlines(fullCaption, effectivePlatform, "carousel");
    } catch { /* non-fatal — fall through to static pools */ }
  }

  const slideHeadlines: (string | undefined)[] = await Promise.all(
    Array.from({ length: slidesToGenerate }, async (_, i) => {
      if (i === 0) return captionHook; // Slide 1 always uses the post's caption hook
      // Use GPT headline if available — slide 2 → gptHeadlines[0], slide 3 → [1], etc.
      if (gptHeadlines.length > 0) {
        return gptHeadlines[(i - 1) % gptHeadlines.length];
      }
      const pool = CAROUSEL_HEADLINE_POOLS[i];
      if (!pool) return undefined;
      return pickSlideHeadline(userId, pool, `carousel:${i}`, businessId);
    })
  );

  const slideContextPool = GENERIC_CAROUSEL_SLIDE_CONTEXTS;

  // Generate all slides in parallel — reduces total time from N×60s to ~60s
  const results = await Promise.allSettled(
    Array.from({ length: slidesToGenerate }, (_, i) => {
      const slideContext = slideContextPool[i] || `Slide ${i + 1}: ${nicheContext}`;
      const hookForSlide = slideHeadlines[i];
      // When the character owns a business: every slide shows a different angle of the SAME place
      const angleHint = BUSINESS_SHOT_ANGLES[i % BUSINESS_SHOT_ANGLES.length];
      const slideScene = customInstruction
        ? sceneDesc  // ref-image style overrides business-context scene
        : hasOwnBusiness
        ? `${businessContext} — ${angleHint}`
        : sceneDesc;
      return generatePostImage(
        nicheContext, style, "carousel", slideContext, customInstruction,
        "top-right", hookForSlide, "blue", textStyle, "bottom", "medium",
        undefined, characterDesc, slideScene, hasOwnBusiness && !customInstruction, overlayFilter ?? "none", userId, brandTagline, accentColor, businessId, undefined, signatureText, showSignature, undefined, overlayFont, preloadedLogoBuffer
      );
    })
  );

  return results
    .map((r, i) => r.status === "fulfilled"
      ? { ...r.value, headline: slideHeadlines[i] }
      : null)
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * Generates 4 different story-beat images for a Reel post (vertical 9:16).
 * Each slide has a distinct scene: Hook → Problem → Solution → CTA.
 * All 4 are generated in parallel — same performance as carousel.
 */
export async function generateReelSlides(
  nicheContext: string,
  style: keyof typeof REEL_STYLES,
  captionHook?: string,
  textStyle: TextStyle = "cinema",
  characterDesc?: string,
  sceneDesc?: string,
  businessContext?: string,
  userId?: number,           // owner — for per-user headline anti-repetition tracking
  brandTagline?: string,     // overlay tagline for brand identity
  accentColor?: string,      // brand primary color for headline accent elements
  businessId?: number,       // active business — determines brand context (logo, color, tagline)
  customInstruction?: string, // ref-image visual style to inject into every slide
  overlayFont?: string,      // brand font key override (from businesses.brandFont)
  signatureText?: string | null, // custom firma text
  showSignature?: boolean,   // false = hide firma entirely
  preloadedLogoBuffer?: Buffer | null,  // pre-loaded logo buffer from bulk-gen cache
  fullCaption?: string,      // full post caption — enables GPT-generated contextual headlines for scenes 2-N
  postPlatform?: string,     // actual post platform ("instagram" | "tiktok" | "both") — refines GPT prompt
  overlayFilter?: ImageFilter, // learned visual filter default (Task #368)
): Promise<Array<{ imageData: string; rawBackground: string; originalRawBackground?: string }>> {
  const slidesToGenerate = 4;
  const hasOwnBusiness = Boolean(businessContext);

  // Pre-resolve slide headlines — scenes 2-N get GPT-generated contextual titles when
  // fullCaption is provided, ensuring all headlines match the post theme (not generic phrases).
  // Falls back to static REEL_HEADLINE_POOLS when GPT is unavailable or caption is missing.
  let gptHeadlines: string[] = [];
  if (fullCaption && slidesToGenerate > 1) {
    try {
      const effectivePlatform = postPlatform === "tiktok" ? "tiktok" : "instagram";
      gptHeadlines = await suggestHeadlines(fullCaption, effectivePlatform, "reel");
    } catch { /* non-fatal — fall through to static pools */ }
  }

  const slideHeadlines: (string | undefined)[] = await Promise.all(
    Array.from({ length: slidesToGenerate }, async (_, i) => {
      if (i === 0) return captionHook; // Scene 1 always uses post's caption hook
      // Use GPT headline if available — scene 2 → gptHeadlines[0], scene 3 → [1], etc.
      if (gptHeadlines.length > 0) {
        return gptHeadlines[(i - 1) % gptHeadlines.length];
      }
      const pool = REEL_HEADLINE_POOLS[i];
      if (!pool) return undefined;
      return pickSlideHeadline(userId, pool, `reel:${i}`, businessId);
    })
  );
  const reelContextPool = GENERIC_REEL_SLIDE_CONTEXTS;

  const results = await Promise.allSettled(
    Array.from({ length: slidesToGenerate }, (_, i) => {
      const slideContext = reelContextPool[i] ?? `Escena ${i + 1}: ${nicheContext}`;
      const hookForSlide = slideHeadlines[i];
      const angleHint = BUSINESS_SHOT_ANGLES[i % BUSINESS_SHOT_ANGLES.length];
      const slideScene = customInstruction
        ? sceneDesc  // ref-image style overrides business-context scene
        : hasOwnBusiness
        ? `${businessContext} — ${angleHint}`
        : sceneDesc;
      return generatePostImage(
        nicheContext, style, "reel", slideContext, customInstruction,
        "top-right", hookForSlide, "blue", textStyle, "bottom", "medium",
        undefined, characterDesc, slideScene, hasOwnBusiness && !customInstruction, overlayFilter ?? "none", userId, brandTagline, accentColor, businessId, undefined, signatureText, showSignature, undefined, overlayFont, preloadedLogoBuffer
      );
    })
  );

  return results
    .map((r, i) => r.status === "fulfilled"
      ? { ...r.value, headline: slideHeadlines[i] }
      : null)
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

// ─── Per-content-type schedule ─────────────────────────────────────────────
// Fuente única de verdad: lib/schedulingDefaults.ts → getSchedulingDefaults()
// NO editar aquí — actualizar la función centralizada en schedulingDefaults.ts.
// Days: 0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb
// Hours: hora local en la zona del usuario (timezone-aware desde Fase 2)
export const DEFAULT_CT_SCHEDULE: Record<string, Record<string, { days: number[]; hours: number[] }>> =
  getSchedulingDefaultsSimple();

// Alias used internally — will be shadowed by getUserSchedule() inside each generate call.
let CT_SCHEDULE = DEFAULT_CT_SCHEDULE;

/**
 * Fetch the user's personalized publication plan from the DB.
 * Falls back to DEFAULT_CT_SCHEDULE for any missing platform/type entries.
 * This is called at the start of every bulk/extra generation so the plan
 * is always read fresh — even if the AI or the user just updated it.
 */
export async function getUserSchedule(
  userId: number | null | undefined,
): Promise<Record<string, Record<string, { days: number[]; hours: number[] }>>> {
  if (!userId) return DEFAULT_CT_SCHEDULE;

  const rows = await db
    .select()
    .from(publishingSchedulesTable)
    .where(eq(publishingSchedulesTable.userId, userId));

  if (rows.length === 0) return DEFAULT_CT_SCHEDULE;

  const schedule: Record<string, Record<string, { days: number[]; hours: number[] }>> = {};
  for (const row of rows) {
    if (!schedule[row.platform]) schedule[row.platform] = {};
    try {
      schedule[row.platform][row.contentType] = {
        days:  JSON.parse(row.days)  as number[],
        hours: JSON.parse(row.hours) as number[],
      };
    } catch { /* skip malformed row */ }
  }

  // Fill in any missing entries from defaults so the schedule is always complete.
  for (const [platform, types] of Object.entries(DEFAULT_CT_SCHEDULE)) {
    for (const [ct, val] of Object.entries(types)) {
      if (!schedule[platform]?.[ct]) {
        if (!schedule[platform]) schedule[platform] = {};
        schedule[platform][ct] = val;
      }
    }
  }

  return schedule;
}

// Backward-compat alias for scheduler.service and other services that still
// reference SCHEDULE.instagram.feedDays / storyDays
const SCHEDULE = {
  instagram: {
    feedDays:  [...new Set([...CT_SCHEDULE.instagram.reel.days, ...CT_SCHEDULE.instagram.image.days, ...CT_SCHEDULE.instagram.carousel.days])].sort((a, b) => a - b),
    storyDays: CT_SCHEDULE.instagram.story.days,
  },
  tiktok: {
    feedDays:  [...new Set([...CT_SCHEDULE.tiktok.reel.days, ...CT_SCHEDULE.tiktok.image.days, ...CT_SCHEDULE.tiktok.carousel.days])].sort((a, b) => a - b),
    storyDays: CT_SCHEDULE.tiktok.story.days,
  },
};

// Legacy feed-mix arrays — kept so any remaining reference compiles;
// the generation loops no longer use them (per-type schedule replaced them).
const INSTAGRAM_FEED_MIX = ["image", "carousel", "reel", "carousel", "image", "reel"];
const TIKTOK_FEED_MIX    = ["reel", "carousel", "reel", "image", "reel", "carousel"];

// Generic hour pools kept for any legacy code paths
const IG_FEED_BOGOTA_HOURS  = [8, 12, 19];
const TK_FEED_BOGOTA_HOURS  = [19, 21, 7];
const IG_STORY_BOGOTA_HOURS = [8, 19];
const TK_STORY_BOGOTA_HOURS = [7, 21];

/**
 * Returns the current hour (0-23) in the given timezone.
 * Replaces the former currentBogotaHour() which was hardcoded to UTC-5.
 */
function currentHourInTz(tz: string): number {
  return hourInTimezone(new Date(), tz);
}

/**
 * Regla 8 (content-scheduler-validator): Peso 70/30 cuando source="ai".
 * El slotIndex rota el "preferido" entre días para no usar siempre el mismo horario.
 *
 * Peso configurado en: artifacts/api-server/src/config/scheduler-config.json
 * (campo: optimization.bestHourWeight). Actualizar también el skill content-scheduler-validator.
 */
const BEST_HOUR_WEIGHT = 0.7; // Fuente: scheduler-config.json#optimization.bestHourWeight

function weightedPick(pool: number[], bestWeight: number, slotIndex: number): number {
  // Regla 8: pool[0] = hora de mayor engagement (posición 0 = top-performer).
  // 70% → hora preferida (siempre pool[0])
  if (Math.random() < bestWeight) return pool[0];
  // 30% → una de las otras horas, rotada por slotIndex para variedad entre días
  const others = pool.slice(1);
  if (others.length === 0) return pool[0];
  return others[slotIndex % others.length];
}

/**
 * Pick the best available hour for `ct` on `platform` given the day.
 * If `isToday` is true, skip hours that have already passed in `tz`.
 *
 * Regla 8: aplica peso 70/30 cuando schedule[platform][ct].source === "ai".
 * Regla 9: distribución equitativa cuando source === "default".
 *
 * @param tz  IANA timezone of the user/business. Defaults to ADMIN_TZ (Bogotá) for backward compat.
 */
function pickHour(
  platform: string,
  ct: string,
  slotIndex: number,
  isToday: boolean,
  schedule: Record<string, Record<string, { days: number[]; hours: number[]; source?: "ai" | "default" }>> = CT_SCHEDULE,
  tz: string = ADMIN_TZ,
): number {
  const entry  = schedule[platform]?.[ct];
  // Fallback a defaults centralizados (schedulingDefaults.ts) — no más arrays Bogotá hardcodeados
  const pool   = entry?.hours ?? DEFAULT_CT_SCHEDULE[platform]?.[ct]?.hours ?? [8, 12, 18];
  const source = entry?.source ?? "default";

  let candidates: number[];
  if (isToday) {
    const nowLocal = currentHourInTz(tz);
    candidates = pool.filter(h => h > nowLocal);
    if (candidates.length === 0) return -1; // all hours passed
  } else {
    candidates = pool;
  }

  // Regla 8: 70/30 cuando hay datos reales de engagement (source="ai")
  if (source === "ai" && candidates.length > 1) {
    return weightedPick(candidates, BEST_HOUR_WEIGHT, slotIndex);
  }
  // Regla 9: distribución equitativa para defaults
  return candidates[slotIndex % candidates.length];
}

/**
 * Convierte hora local (en la timezone del usuario) a fecha UTC para el día indicado.
 * Wrapper de localHourToUTC de lib/timezone.ts.
 * @deprecated Prefer localHourToUTC(date, hour, tz) directly.
 */
function bogotaHourToUTC(date: Date, bogotaHour: number): Date {
  return localHourToUTC(date, bogotaHour, ADMIN_TZ);
}

// ─── Character & Scene Banks ──────────────────────────────────────────────────
// 20 rotating personas — reuse every 3-5 posts, never back-to-back.
// Each entry is a concise DALL-E character description (no names).
const CHARACTER_BANK: string[] = [
  "a confident Colombian businesswoman in her late 20s wearing smart-casual attire and carrying a tablet",
  "a middle-aged Colombian male entrepreneur in a light guayabera shirt with an assured expression",
  "a retired Colombian homeowner in his 60s wearing a casual polo, inspecting equipment with pride",
  "a young Colombian mother in her early 30s in comfortable modern clothes, warm and optimistic expression",
  "a female Colombian restaurant owner in her 40s in a chef's apron, entrepreneurial and energetic",
  "a male Colombian university student in his early 20s in casual street clothes with a backpack",
  "an industrial engineer in his late 30s wearing a hard hat and safety vest, confident posture",
  "a Colombian rural landowner in his mid-50s in traditional rural clothes, standing tall outdoors",
  "a teenage Colombian eco-activist in her late teens wearing a green hoodie, passionate expression",
  "a male Colombian hotel manager in his late 40s in a formal suit, professional and welcoming",
  "a Colombian male technician in his mid-30s in a clean professional uniform with tool belt",
  "a Colombian elderly couple in their 70s in comfortable home clothing, happy and surprised expression",
  "a young Colombian couple in their early 30s in casual weekend clothing, excited and hopeful",
  "a male Colombian doctor in his early 40s in scrubs with a stethoscope, curious and positive",
  "a female Colombian architect in her mid-30s in modern business casual, holding rolled-up blueprints",
  "a Colombian school principal in her early 50s in professional attire, organized and forward-thinking",
  "a young Colombian startup founder in his late 20s in a t-shirt and jeans with a laptop",
  "a Colombian male security guard in his 40s in uniform, practical and cost-conscious expression",
  "a three-generation Colombian family: grandmother, parent and child, at home, warm family moment",
  "a Colombian female ride-share driver in her late 30s in casual clothes leaning on an electric car",
];

// Business context per CHARACTER_BANK entry.
// null = character has no specific business → use BACKGROUND_SCENES as usual.
// string = the character's OWN business/establishment; used to derive coherent per-slide backgrounds.
const CHARACTER_BUSINESS_CONTEXT: Array<string | null> = [
  "her modern Colombian commercial office or business premises",        // 0: businesswoman
  "his own Colombian business, showroom or commercial establishment",   // 1: entrepreneur
  null,                                                                 // 2: homeowner (residential)
  null,                                                                 // 3: young mother (residential)
  "her own Colombian restaurant: busy kitchen, dining area and bar",    // 4: restaurant owner
  null,                                                                 // 5: university student (campus)
  "an industrial facility, factory or commercial warehouse",            // 6: industrial engineer
  "his rural Colombian land, farm or agricultural property",            // 7: rural landowner
  null,                                                                 // 8: eco-activist (outdoor)
  "his own Colombian hotel: lobby, reception, terrace and exterior",    // 9: hotel manager
  "a solar panel installation site on a rooftop or ground-mount structure", // 10: solar technician
  null,                                                                 // 11: elderly couple (home)
  null,                                                                 // 12: young couple (home/outdoor)
  "his Colombian medical clinic, consultation room and health center",  // 13: doctor
  "an architectural or construction project she is overseeing",         // 14: architect
  "her Colombian school building: classrooms, courtyard and entrance",  // 15: school principal
  null,                                                                 // 16: startup founder (coworking/cafe)
  "the commercial building or business entrance where he works",        // 17: security guard
  null,                                                                 // 18: three-generation family (home)
  null,                                                                 // 19: ride-share driver (street/car)
];

// Different camera angles for each slide in a carousel or variant in a post,
// so all shots look like they were taken at the SAME location on the same day.
const BUSINESS_SHOT_ANGLES: string[] = [
  "wide establishing shot showing the full space with good natural depth",
  "medium shot from a different corner of the same space, fresh perspective",
  "close-up detail highlighting a key feature or equipment within the space",
  "exterior or entrance view of the same establishment at street level",
  "another interior angle with different lighting and a warmer color tone",
];

// 24 unique background environments — always rotate, never repeat in same batch.
// Indices 0-19: general environments. Indices 20-23: dedicated solar panel scenes.
const BACKGROUND_SCENES: string[] = [
  "on a modern rooftop terrace overlooking a city skyline at golden hour",                          // 0
  "in a bright residential backyard with lush tropical plants and solar panels on the roof behind",  // 1  ← solar
  "in the parking lot of a busy shopping center with visible EV charging stations",                 // 2  ← EV
  "outside a clean industrial warehouse with solar panels on the roof in midday light",             // 3  ← solar
  "in a vibrant tropical garden with exotic flowers and filtered sunlight",                         // 4
  "on a scenic mountain road with green hills and blue sky backdrop",                               // 5
  "inside a contemporary glass office building lobby with natural light and indoor plants",         // 6
  "on a colorful street in a vibrant historic Latin American neighborhood",                         // 7
  "on a modern university campus surrounded by green trees and open spaces",                        // 8
  "at a coffee plantation in the mountains with rows of coffee plants stretching back",             // 9
  "in a hospital parking lot showing modern EV chargers installed alongside a glass building",      // 10 ← EV
  "at an active construction site for a modern sustainable building, hard hats visible in background", // 11
  "on a cozy apartment balcony at sunset overlooking urban neighborhoods",                          // 12
  "at an outdoor restaurant terrace with warm string lights and an urban backdrop",                 // 13
  "on a vibrant city street at night with city lights glowing in the background",                   // 14
  "at sunrise with mountains silhouetted against an orange and pink sky",                           // 15
  "inside a modern community center with open windows, plants, and natural light",                  // 16
  "at a colorful farmers market with fruit vendors and colorful umbrellas in the background",       // 17
  "on a highway with electric vehicles driving past green countryside",                             // 18 ← EV
  "in a stylish open coworking space with large windows, exposed brick and green plants",           // 19
  // ── Solar-specific scenes (indices 20-23) ────────────────────────────────────────────────────
  "on a residential rooftop with freshly installed photovoltaic solar panels gleaming under direct sunlight, urban neighborhood visible below, clear blue sky", // 20
  "aerial perspective of a large solar farm with rows of photovoltaic panels stretching across an open sunny field, technician walking between rows", // 21
  "at an industrial facility rooftop fully covered in solar panels, a technician in safety harness and hard hat inspecting the installation under bright midday sun", // 22
  "close view of solar panels mounted on a modern family home roof, sun reflecting brilliantly off the panels, green garden and blue sky in background", // 23
];

// ─── Niche → scene mapping ────────────────────────────────────────────────────
// When a post's nicheContextShort matches a known industry category, we derive a
// niche-specific DALL-E scene that replaces the generic CHARACTER_BANK + BACKGROUND_SCENES.
// Each entry includes the keywords to match and the scene directive for DALL-E
// (character + environment combined, so we skip the CHARACTER_BANK entirely).
// Used only for non-solar businesses and when no explicit imageScene/batchRefStyle exists.

type NicheSceneEntry = {
  keywords: string[];     // any match (lowercase substring) triggers this entry
  scenes: string[];       // DALL-E custom instructions — 4-6 visual variants rotated by jobIdx
  /** @deprecated Legacy single-scene field — use `scenes[]` instead. Kept for backward compatibility. */
  scene?: string;
};

const NICHE_SCENE_ENTRIES: NicheSceneEntry[] = [
  {
    keywords: ["taller", "mecánica", "mecanic", "repuesto", "automovil", "automóvil", "vehíc", "vehic", "freno", "llanta", "carrocería"],
    scenes: [
      "a confident Colombian automotive mechanic in his 30s in a clean workshop uniform, working in a well-lit auto repair shop with a car raised on a hydraulic lift, tools and parts neatly organized on racks in the background",
      "a skilled Colombian mechanic in her late 30s in blue coveralls, focused on diagnosing a car engine at a workbench inside a bright auto repair workshop, rows of organized tools hanging on a pegboard behind her",
      "a Colombian automotive technician in his 40s in a safety vest, standing beside a freshly detailed car in a modern service bay with gleaming epoxy floors and a digital vehicle diagnostics screen showing on a monitor",
      "a Colombian mechanic shop owner in his 50s in a polo shirt, confidently presenting a repaired vehicle to a satisfied customer in the sunny forecourt of a modern auto service center with branded signage above",
      "a close-up of skilled Colombian mechanic hands carefully working on a brake caliper at a spotless workbench, precision tools arranged neatly beside the component, warm overhead lighting casting sharp professional shadows",
    ],
  },
  {
    keywords: ["restaurante", "comida", "gastronom", "chef", "cocina", "plato", "almuerzo", "cena", "menú", "menu", "fonda", "food truck", "foodie", "gourmet", "heladería", "helad", "juguer", "smoothie", "vino", "cerveza", "cervecería", "bar ", "bares", "catering", "chocolate artesanal", "comida callejera", "street food", "banquete"],
    scenes: [
      "a cheerful Colombian chef in his late 30s in a white chef's coat, proudly presenting a beautifully plated dish in a lively, warm-lit Colombian restaurant kitchen with an open pass and warm ambient lighting in the background",
      "a smiling Colombian restaurateur in her early 40s in casual elegant attire, welcoming guests at the entrance of a beautifully decorated Colombian restaurant with warm string lights, terracotta décor and tropical plants",
      "a Colombian kitchen brigade of three chefs in white coats, actively preparing multiple dishes in a busy restaurant kitchen at dinner service, steam rising from pots and colorful ingredients spread across stainless steel counters",
      "an overhead view of a beautifully styled Colombian dining table set for a special meal, artfully plated traditional dishes, fresh flowers, candles and regional ceramics creating an inviting warm and festive scene",
      "a Colombian sous chef in her 30s in a chef's apron, carefully plating a gourmet dish at the pass of a modern open kitchen, diners visible enjoying their meals in the warmly lit dining room in the background",
      "a Colombian food entrepreneur in his 40s in a branded polo, sampling a new recipe in a bright commercial kitchen, assistant chefs working around him and fresh local ingredients laid out on the preparation counter",
    ],
  },
  {
    keywords: ["hotel", "hostal", "hospedaje", "alojamiento", "resort", "huésped", "huesped"],
    scenes: [
      "an elegant Colombian hotel lobby with polished marble floors, tropical plants and warm natural light, a professional concierge in formal attire welcoming guests at the front desk with lobby furniture and luggage carts in the background",
      "a luxurious Colombian hotel room with a king bed, crisp white linens and floor-to-ceiling windows overlooking a green tropical mountain, a housekeeper in uniform placing fresh orchids on the nightstand",
      "a rooftop pool terrace of a boutique Colombian hotel at golden hour, a uniformed pool attendant arranging sun loungers beside a crystal-clear pool with the city skyline glowing softly in the evening light behind",
      "a warm Colombian hostel common area with hammocks, colorful murals and natural wood furniture, young travelers from different backgrounds chatting and planning over a detailed map spread on a communal table",
      "a professional Colombian hotel manager in formal attire, reviewing a tablet at the front desk of a sleek modern hotel reception area — glass walls, contemporary art and a warm ambient glow creating a premium atmosphere",
    ],
  },
  {
    keywords: ["turismo", "turista", "viaje", "destino", "vacacion", "vacación", "paseo"],
    scenes: [
      "a happy Colombian couple in their 30s with travel bags, standing in front of a beautiful scenic Colombian landscape — a colonial town square or lush green mountain valley — bright blue sky and warm natural light",
      "a Colombian travel guide in her 30s in outdoor gear, leading a small group of excited tourists through a lush coffee plantation in the Eje Cafetero, mountains and banana trees stretching across the horizon behind them",
      "a Colombian family of four arriving at a beautiful beach destination on the Caribbean coast, the parents helping children with colorful bags while palm trees and turquoise water create a bright vibrant backdrop",
      "a solo Colombian traveler in his 20s with a backpack, photographing a stunning view of a colonial walled city from a hilltop lookout, warm late-afternoon light casting golden tones across colorful rooftops below",
      "a cheerful tour group in matching branded visors boarding a modern tourist bus in a scenic colonial Colombian town, a smiling guide with a flag leading them toward a beautifully preserved colonial cathedral in the background",
    ],
  },
  {
    keywords: ["fruta", "verdura", "mercado", "frutería", "fruteria", "vegetal", "hortaliza", "agrícol", "agricol"],
    scenes: [
      "a vibrant Colombian farmers market stall overflowing with fresh tropical fruits and vegetables in vivid colors, a friendly vendor in casual attire smiling at the camera with an abundant colorful produce display behind them",
      "a Colombian produce vendor in her 50s in a colorful apron, carefully arranging a display of exotic tropical fruits at her market stand — guanábana, lulo, pitahaya and maracuyá in vivid colors under warm morning light",
      "a Colombian greengrocer in his 40s loading fresh vegetable crates into his van at a wholesale market at dawn, crates of lettuces, tomatoes and herbs stacked high under the glow of market arc lamps",
      "a close-up of a Colombian market stall table covered with an abundant rainbow of fresh tropical fruits and vegetables — maracuyá, guayaba, plátano verde, ají, and tomates — arranged beautifully in rustic wooden crates",
      "a Colombian family-owned fruit shop with wide shelves of colorful produce, the owner — a woman in her 40s in a branded apron — handing a bag of fresh fruits to a smiling customer in the doorway of the bright cheerful store",
    ],
  },
  {
    keywords: ["farmacia", "droguería", "drogueria", "medicamento", "farmacéutic", "farmaceutic"],
    scenes: [
      "a professional Colombian pharmacist in a white coat behind a well-organized pharmacy counter, smiling and assisting a customer, neatly stocked shelves of pharmaceutical products clearly visible behind them",
      "a Colombian pharmacy technician in her 30s in a white coat, carefully counting and labeling medication at a clean prescription counter with a computer screen and organized product shelves in the bright background",
      "a Colombian pharmacist in his 50s in a white coat, consulting with an elderly patient at the pharmacy counter, explaining medication instructions with warm professionalism, well-stocked shelving units behind him",
      "the bright exterior of a modern Colombian droguería at street level, glass display windows showcasing health and personal care products, an inviting storefront with clear branding and warm interior lighting visible through the glass",
      "a close-up of a professional Colombian pharmacist's hands neatly arranging a prescription package on a well-organized pharmacy counter, shelves of clearly labeled medications blurred softly in the background",
    ],
  },
  {
    keywords: ["dental", "odontolog", "dentista", "ortodoncia", "odontólog"],
    scenes: [
      "a friendly Colombian dentist in blue dental scrubs wearing gloves, standing in a bright modern dental clinic with a reclining dental chair, professional overhead lighting and a clean treatment room in the background",
      "a Colombian dental hygienist in her 30s in mint green scrubs, preparing a treatment tray in a spotless modern dental clinic, the dental chair reclined under bright procedure lights and a wall of diplomas visible",
      "a smiling Colombian orthodontist in her 40s in a white coat, reviewing digital dental X-rays on a lightbox screen with a patient seated in a modern dental chair in a bright and professional treatment room",
      "a professional Colombian dental receptionist in a clean white polo, warmly welcoming a patient at a sleek dental clinic reception desk with a minimalist modern interior, natural plants and calming neutral tones",
      "a Colombian dentist in his 30s in light blue scrubs confidently holding up a dental model and smiling at the camera, a modern dental chair and wall-mounted equipment clearly visible in the bright clean background",
    ],
  },
  {
    keywords: ["clínica", "clinica", "médico", "medico", "salud", "consulta", "enfermera", "hospital"],
    scenes: [
      "a professional Colombian doctor in his 40s in white scrubs with a stethoscope, standing in a bright modern clinic consultation room with medical equipment, diplomas on the wall and healthy green plants in the background",
      "a Colombian general practitioner in her 30s in a white coat, reviewing test results on a tablet with a patient seated across from her in a bright, welcoming medical consultation room with modern equipment in the background",
      "a Colombian nursing team of two in light blue scrubs, confidently standing in a well-lit hospital corridor with patient rooms visible through glass panels, conveying professionalism and warm patient care",
      "a Colombian medical specialist in his 50s in surgical scrubs, consulting a digital imaging screen displaying scan results in a modern radiology reading room, focused and authoritative in a clean clinical environment",
      "a bright and modern Colombian clinic reception area with a professional receptionist in a white polo welcoming a patient, warm lighting, tropical potted plants and a sleek reception counter projecting trust and quality",
    ],
  },
  {
    keywords: ["construcción", "construccion", "remodelac", "obra", "contratista", "albañil", "albanil"],
    scenes: [
      "a Colombian construction professional in his 40s wearing a hard hat and safety vest, inspecting work at a modern residential renovation site with concrete columns, brickwork and fresh plaster visible in the background",
      "a Colombian master builder in his 50s in a hard hat and orange vest, reviewing architectural blueprints spread on a makeshift table at a construction site, a partially built residential building rising in the background",
      "a Colombian construction crew of three workers in hard hats and safety vests, working together to lay bricks on a modern residential project, quality materials and a clear blue sky visible behind the active work site",
      "a Colombian renovation contractor in her 40s in work clothes and a tool belt, standing proudly in a freshly finished modern kitchen renovation showing the beautiful completed interior design work — new cabinets and countertops gleaming",
      "a Colombian building site foreman in a hard hat and reflective vest, directing workers from a raised vantage point on a high-rise construction project, cranes and concrete structure rising dramatically against the Bogotá skyline",
    ],
  },
  {
    keywords: ["plomer", "fontaner", "impermeab", "eléctric", "electric", "instalac eléc", "mantenimiento edific"],
    scenes: [
      "a professional Colombian tradesperson in his 30s in a clean uniform and safety equipment, working on a plumbing or electrical installation in a modern residential building with tools neatly arranged nearby",
      "a Colombian electrician in his 40s in a reflective vest, carefully wiring a modern electrical panel in a clean residential laundry room, professional tools organized in a tool bag on the floor beside him",
      "a Colombian plumber in his 30s in blue overalls, expertly fitting pipes under a bathroom vanity in a modern home renovation, tile work and clean fixtures visible around the professional workspace",
      "a Colombian home maintenance technician in a branded polo shirt, fixing an air conditioning unit mounted on a clean residential wall, a well-organized tool kit open on the floor beside him in bright natural light",
      "a Colombian waterproofing specialist in protective gear, applying sealant treatment to a flat roof terrace of a modern apartment building, the city skyline stretching across the horizon under an open blue sky",
    ],
  },
  {
    keywords: ["inmobiliaria", "bienes raíces", "bienes raices", "propiedad", "finca raíz", "finca raiz", "arrendamiento", "alquiler"],
    scenes: [
      "a professional Colombian real estate agent in her 30s in business casual attire, standing in front of a beautiful modern residential property with lush greenery, a welcoming entrance and a clear blue sky above",
      "a Colombian real estate agent in a suit, showing a bright modern apartment to a young couple, the living room bathed in afternoon sunlight through large windows overlooking a tree-lined Bogotá neighborhood",
      "a Colombian real estate developer in his 40s in business attire, presenting a scale architectural model of a new residential project in a professional sales room with renderings mounted on the wall behind him",
      "a Colombian property manager in her early 30s in smart casual attire, photographing a well-staged home interior with a professional camera — polished floors, fresh flowers and open floor plan creating an appealing listing scene",
      "a Colombian real estate agent in his 50s in a classic suit, handing house keys to a happy family in front of a new home decorated with a FOR SALE sign now removed, genuine joy on everyone's faces in warm afternoon light",
    ],
  },
  {
    keywords: ["educac", "colegio", "academia", "clases", "profesor", "docente", "estudio", "curso", "capacitac", "aprendizaje", "idiomas", "e-learning", "elearning", "tutoría", "tutoria", "preparación para", "formación en", "escuela de", "certificación", "bootcamp"],
    scenes: [
      "a warm, encouraging Colombian teacher in her early 40s standing in a bright modern classroom, students engaged in learning at their desks, colorful educational materials on the walls and natural daylight through the windows",
      "a Colombian university professor in his 50s in business casual, delivering an engaging lecture in a modern amphitheater-style classroom, students taking notes with laptops and notebooks, a projection screen behind him",
      "a Colombian online education entrepreneur in her 30s, recording a professional tutorial video in a home studio setup with a ring light, bookshelf background and a laptop showing a colorful slide presentation",
      "a Colombian academic workshop in progress — a facilitator in casual smart attire leads four adult learners around a collaborative table covered with materials, sticky notes and laptops in a bright modern coworking space",
      "a Colombian primary school teacher in her 30s kneeling beside a student's desk, gently helping with an activity, other students working independently around them in a cheerful classroom with educational posters covering the colorful walls",
    ],
  },
  {
    keywords: ["belleza", "peluquer", "estética", "estetica", "salón de bell", "salon de bell", "spa", "manicure", "pedicure", "cabello", "cosmétic", "cosmetic", "micropigmentac", "tatuaje", "body art", "grooming", "barbería", "barberia", "cirugía estética", "medicina estética", "medicina estetica"],
    scenes: [
      "a professional Colombian hair stylist in her 30s in a modern beauty salon, skillfully styling a client's hair with professional tools, warm salon lighting and neatly organized product shelves and mirrors in the background",
      "a Colombian esthetician in her late 20s in a clean white spa uniform, giving a relaxing facial treatment to a client on a professional spa bed, soft ambient lighting and tropical plant décor creating a serene wellness atmosphere",
      "a Colombian nail technician in her 30s in a tidy salon apron, carefully painting a client's nails at a well-lit manicure station with a wide array of nail polish colors displayed in an organized rack in the background",
      "a smiling Colombian beauty salon owner in her 40s in a chic black apron, standing proudly in her sleek modern salon interior with rows of styling chairs, illuminated mirrors and product displays creating a premium look",
      "a Colombian barber in his 30s in a branded apron, working precisely on a client's fade haircut at a classic barbershop station with vintage mirrors, leather chairs and warm Edison bulb lighting creating an upscale grooming atmosphere",
    ],
  },
  {
    keywords: ["deporte", "fitness", "gimnasio", "gym", "entrenamiento", "ejercicio", "yoga", "crossfit", "nutrición", "nutricion", "atletismo", "pilates", "barre", "suplemento", "meditación", "meditacion", "holístic", "holistico", "bienestar holístico", "salud holística"],
    scenes: [
      "a fit and energetic Colombian personal trainer in athletic wear, coaching a smiling client during a workout in a modern, well-equipped Colombian gym with barbells, cables and motivational murals visible in the background",
      "a Colombian yoga instructor in her 30s in athletic wear, guiding a small class through a pose in a serene bright studio with wooden floors, natural light through tall windows and tropical plants lining the walls",
      "a Colombian CrossFit coach in his 30s in a branded tank top, demonstrating a clean exercise technique with a barbell in a modern box gym, colorful competition ropes and pull-up rigs visible behind him",
      "a Colombian nutritionist in her 40s in professional attire, presenting a colorful meal plan chart to a client seated across from her at a clean consultation desk with fresh healthy food displayed attractively on the table",
      "a Colombian sports team of mixed athletes in branded jerseys, warming up on the track of a modern outdoor stadium at sunrise, the track glowing gold in the early light with grandstand seating visible in the background",
    ],
  },
  {
    keywords: ["moda", "ropa", "boutique", "tienda de ropa", "fashion", "confección", "confeccion", "prenda", "vestido", "indumentaria"],
    scenes: [
      "a stylish Colombian fashion professional in her late 20s in contemporary attire, standing in a chic boutique showroom with curated clothing racks, full-length mirrors and warm display lighting in the background",
      "a Colombian fashion designer in her 30s in creative casual attire, reviewing fabric swatches and sketch designs on a large table in her bright atelier, a clothes rack with finished garments and a sewing machine visible nearby",
      "a Colombian clothing store owner in his 40s in a well-cut blazer, welcoming a customer into a beautifully merchandised boutique with curated displays, soft music implied and warm LED accent lighting on each clothing section",
      "a Colombian fashion model in her 20s in a beautifully styled seasonal outfit, photographed in a bright studio against a minimalist backdrop, the clothing's quality and style clearly highlighted by clean professional lighting",
      "a Colombian seamstress in her 50s at her workshop table, carefully stitching a bridal gown, fabric bolts in vibrant colors displayed on shelves behind her and a mood board of fashion inspirations pinned to the studio wall",
    ],
  },
  {
    keywords: ["panadería", "panaderia", "repostería", "reposteria", "pastelería", "pasteleria", "torta", "galleta", "pan artesanal", "confitería"],
    scenes: [
      "a passionate Colombian baker in his early 40s in a clean white apron, proudly displaying a tray of freshly baked artisan breads and pastries in a warm, cozy bakery with a rustic stone oven and wooden display shelves in the background",
      "a Colombian pastry chef in her 30s in a white apron, carefully decorating a three-tier celebration cake with intricate fondant flowers at a clean stainless counter, colorful piping tools and finished cakes visible in the background",
      "a Colombian artisan bakery display counter showing rows of beautifully arranged croissants, pan de bono, almojábanas and fruit tarts in warm light, the baker visible in the open kitchen behind with a fresh batch of bread emerging from the oven",
      "a Colombian bakery owner in her 50s in a branded apron, chatting warmly with regular customers in the cozy seating area of her neighborhood bakery, display cases full of fresh baked goods and the scent of coffee implied by the atmosphere",
      "a close-up of skilled Colombian baker hands kneading dough on a floured wooden surface in a warm bakery kitchen, a tray of perfectly shaped bread rolls rising nearby in the golden glow of the oven's ambient warmth",
    ],
  },
  {
    keywords: ["café", "cafe", "cafeter", "espresso", "barista"],
    scenes: [
      "a skilled Colombian barista in his late 20s in a hip café apron, crafting a perfect latte art in a warmly lit specialty coffee shop with exposed brick walls, bags of Colombian coffee beans and a gleaming espresso machine in the background",
      "a Colombian café owner in her early 40s in a smart apron, serving a beautifully presented cortado to a customer at the bar of a sunlit specialty coffee shop, vintage coffee posters and plants creating an inviting artisan atmosphere",
      "a Colombian coffee farmer in his 50s in outdoor work clothes, picking ripe red coffee cherries on a lush hillside plantation in the Eje Cafetero, rows of coffee plants stretching into the misty mountain backdrop",
      "a Colombian barista championship competitor in his late 20s in a branded apron, focused on an extraction dial on a professional espresso machine at a competition stage with judges watching and barista equipment neatly arranged",
      "the interior of a beautifully designed Colombian specialty coffee shop — exposed brick, warm Edison lighting, a chalkboard menu and shelves of imported brewing equipment — a welcoming empty scene ready for the morning rush",
    ],
  },
  {
    keywords: ["transporte", "logística", "logistica", "envío", "envio", "flete", "mensajería", "mensajeria", "domicilio", "mudanza"],
    scenes: [
      "a professional Colombian logistics worker in his 30s in a company uniform, loading a neatly stacked set of packages onto a delivery vehicle in a busy urban loading area with distribution warehouse shelving visible in the background",
      "a Colombian delivery courier in her late 20s in a branded jacket and helmet, handing a package to a smiling customer at a residential door, a loaded delivery motorcycle parked on the clean suburban street behind her",
      "a Colombian warehouse operations manager in a reflective vest, overseeing a large organized distribution center with rows of shelved inventory, team members scanning packages and forklifts moving pallets in the background",
      "a Colombian logistics entrepreneur in his 40s in business casual attire, reviewing a tablet with delivery route data while standing beside a branded cargo van fleet parked in the loading yard of a modern distribution facility",
      "a Colombian cargo truck driver in his 50s in a company polo, completing paperwork on a clipboard at the open cargo bay of a clean branded truck parked at a busy inter-city freight terminal with other trucks lined up behind",
    ],
  },
  {
    keywords: ["mascota", "veterinar", "perro", "gato", "animal doméstic", "animal domestic"],
    scenes: [
      "a caring Colombian veterinarian in her 30s in a clean white veterinary coat, gently examining a happy dog on a stainless examination table in a bright modern veterinary clinic with medical supplies organized neatly in the background",
      "a Colombian vet in his 40s in blue scrubs, crouching to greet a playful golden retriever in the waiting room of a cheerful modern animal clinic, colorful pet-themed wall art and a reception desk visible in the background",
      "a Colombian pet groomer in her 30s in a waterproof apron, carefully trimming a well-behaved poodle at a professional grooming station in a bright, clean pet care salon with a wall display of grooming products",
      "a Colombian veterinary specialist in her 40s in white scrubs, reviewing an X-ray image of a cat skeleton on a backlit panel in a modern veterinary imaging room, professional equipment and clean surfaces around her",
      "a Colombian pet shop owner in his 30s in a branded polo, holding a friendly rabbit for a delighted child to pet in a well-stocked pet store with aquariums, bird cages and colorful pet supplies filling the warm bright space",
    ],
  },
  {
    keywords: ["finanzas", "inversión", "inversion", "ahorro", "crédito", "credito", "préstamo", "prestamo", "banco", "contabilidad", "contaduría", "fintech", "pagos digitales", "pagos digital", "patrimonio", "trading", "bolsa", "criptomonedas", "blockchain", "cripto", "bitcoin", "nft", "defi"],
    scenes: [
      "a professional Colombian financial advisor in his 40s in a sharp business suit, sitting at a sleek modern desk with financial charts on a laptop screen in a sophisticated office with city views through floor-to-ceiling windows",
      "a Colombian accountant in her 30s in professional attire, reviewing financial statements at a dual-monitor workstation in a modern open-plan accounting firm, colleagues working at desks in the bright well-lit background",
      "a Colombian bank branch manager in his 50s in a formal suit, consulting with a young entrepreneur couple at a private meeting table in a sleek bank branch interior with glass partitions and Colombian regulatory certificates on the wall",
      "a Colombian fintech entrepreneur in her late 20s in smart casual attire, presenting an investment return chart on a large screen to a small audience in a modern startup office with pitch deck visuals visible in the background",
      "a Colombian tax consultant in his 40s in a blazer, carefully reviewing documents with a client at a professional desk, a bookshelf with accounting reference books and a potted plant creating a warm professional environment",
    ],
  },
  {
    keywords: ["tecnolog", "software", "app", "programac", "sistemas", "computac", "informátic", "informatica", "startup", "desarrollo web", "inteligencia artificial", "machine learning", "automatizac", "cibersegur", "saas"],
    scenes: [
      "a focused Colombian software developer in his late 20s in a casual t-shirt, typing at a multi-monitor workstation in a modern open coworking space with large windows, exposed brick walls and green plants in the background",
      "a Colombian UX designer in her 30s in casual smart attire, sketching app wireframes on a tablet at a bright standing desk in a modern tech studio, digital mockups visible on a large monitor beside her",
      "a Colombian startup founding team of three diverse professionals in their 30s, brainstorming on a whiteboard full of diagrams and sticky notes in a modern tech office with exposed ducts, large monitors and brand-colored walls",
      "a Colombian IT systems engineer in his 40s in a polo shirt, configuring a server rack in a clean data center with blue LED lighting, rows of server equipment humming in the cool temperature-controlled environment",
      "a Colombian tech entrepreneur in her early 30s in business casual, pitching to investors in a modern startup accelerator space — projected slide deck showing growth charts, investors taking notes across a polished conference table",
      "a Colombian mobile developer in her late 20s in casual attire, testing an app on multiple smartphones and tablets spread across a bright white minimalist desk, code editor open on a wide monitor in the background",
      "a Colombian data scientist in his 30s in a smart casual polo, analyzing colorful data visualizations on a large curved monitor in a dimly lit analytics lab, holographic-style charts reflected on his glasses",
      "two Colombian tech product managers in their 30s in business casual, reviewing a product roadmap on a glass wall covered in colored sticky notes in a bright agile workspace, laptop open on a standing desk between them",
      "a Colombian cybersecurity specialist in his 40s in business attire, monitoring real-time security dashboards with multiple screens in a modern security operations center, alert notifications and network diagrams visible",
      "a Colombian DevOps engineer in her late 20s in a company hoodie, reviewing CI/CD pipeline logs on a laptop in a modern open-plan tech office, large shared monitors showing deployment dashboards on the wall behind her",
    ],
  },
  {
    keywords: ["marketing", "publicidad", "redes sociales", "comunidad", "agencia creativa", "branding", "diseñador", "disenador", "influencer", "creador de contenido", "social media", "contenido digital", "audiovisual", "agencia de publicidad", "producción audiovisual", "agencia de marketing"],
    scenes: [
      "a creative Colombian marketing professional in her early 30s in smart casual attire, presenting a vibrant digital campaign board in a modern agency office with colorful design mockups on screens and whiteboards full of ideas",
      "a Colombian social media manager in his late 20s in casual attire, reviewing analytics dashboards on a laptop in a bright creative agency, colorful brand printouts pinned on the wall behind him and a ring light beside his desk",
      "a Colombian branding team of four diverse creatives in their 30s, gathered around a large monitor reviewing a brand identity system for a client, brand swatches, logo variations and typography specimens visible on screen",
      "a Colombian advertising art director in her 40s in a stylish outfit, reviewing physical proofs of a campaign print layout at a wide light table in a creative studio, flatlay of design tools and mockups around her",
      "a Colombian content creator in his late 20s in a branded hoodie, filming a product review video in a well-lit home studio with a ring light, camera on tripod and a neatly arranged product display creating a professional social media setup",
      "a Colombian digital strategist in her mid-30s in a modern co-working space, pointing to a large wall-mounted analytics screen showing reach and engagement graphs, team members looking on with laptops open on a long shared desk",
      "a Colombian marketing director in his 40s in business casual, confidently presenting campaign results to clients in a glass-walled boardroom, projected slide deck showing before-and-after brand metrics with clear upward trend lines",
      "a Colombian influencer marketing coordinator in her late 20s in a trendy casual outfit, curating a visual grid of content cards on a large touch screen in a bright studio, color-coded campaign tiles and influencer profile photos arranged on screen",
      "a Colombian growth hacker in his early 30s in a startup hoodie, surrounded by three monitors showing real-time ad performance dashboards — CTR charts, audience funnels and A/B test results glowing in a dimly lit performance marketing war room",
      "a Colombian brand photographer in her 30s in all-black attire, carefully arranging a flatlay product shoot on a white seamless surface in a professional studio, softboxes casting perfect even light on the branded products and props",
    ],
  },
  {
    keywords: ["eventos", "bodas", "celebrac", "catering", "decorac", "fiesta", "gala"],
    scenes: [
      "an elegant event planner in her 30s in a sophisticated outfit, standing in a beautifully decorated Colombian event venue with lush floral arrangements, warm string lights, round tables with white linens and a festive atmosphere",
      "a Colombian wedding photographer in his 30s in a smart black outfit, capturing a first dance moment at a beautifully decorated garden wedding reception in Cartagena, fairy lights and tropical florals creating a magical ambiance",
      "a Colombian catering team in black uniforms, elegantly serving appetizers to guests at a corporate gala in a grand ballroom, chandeliers and floral centerpieces creating a luxurious formal event atmosphere",
      "a Colombian event décor specialist in her 40s in a floral print dress, arranging a stunning table centrepiece at a wedding venue, an elaborate backdrop of greenery, white flowers and gold accents framing the elegant setting",
      "a bird's-eye view of a Colombian quinceañera celebration in full swing — tables beautifully set with floral arrangements, family and guests dancing on a decorated floor, colorful balloons and warm event lighting filling the frame",
    ],
  },
  {
    keywords: ["jardín", "jardin", "paisaj", "vivero", "flores", "plantas", "arboricultura", "poda"],
    scenes: [
      "a skilled Colombian landscaper in his 40s in outdoor work clothes, kneeling in a lush, well-maintained tropical garden with colorful flowering plants, sculpted hedges and warm afternoon sunlight streaming through the leaves",
      "a Colombian gardener in her 30s in a wide-brim hat and gloves, carefully planting colorful seasonal flowers in a well-designed residential front garden, a wheelbarrow of fresh soil and plant containers beside her",
      "a Colombian plant nursery owner in his 50s in a casual apron, walking through rows of potted tropical plants and orchids in a warm greenhouse, labeled plants in vibrant health filling every shelf in the lush green space",
      "a Colombian landscape architect in her 40s in outdoor casual attire, reviewing design plans on a tablet while standing in a newly completed upscale garden project — sculptural hedges, water features and stone pathways",
      "a Colombian arborist in his 30s in a safety harness and hard hat, expertly pruning a large tropical tree on a residential property, a wood chipper visible in the background and pristine equipment neatly arranged below",
    ],
  },
  {
    keywords: ["legal", "abogado", "jurídic", "juridic", "derecho", "notaría", "notaria", "asesoría legal"],
    scenes: [
      "a professional Colombian lawyer in his 40s in a dark suit, standing in a formal office with floor-to-ceiling bookshelves filled with legal volumes, case files on the desk and framed diplomas on the wall behind him",
      "a Colombian attorney in her 30s in a sharp blazer, reviewing a legal document closely at a polished conference table in a sophisticated law firm meeting room, a law library visible through glass doors behind her",
      "a Colombian notary in his 50s in a formal suit, overseeing the signing of an important document at a traditional notary office with official seals, stamps and leather-bound registers creating an authoritative formal setting",
      "a Colombian legal team of three in formal attire, seated around a boardroom table with printed case files, a whiteboard with strategy notes and city views through large windows behind them",
      "a Colombian family lawyer in her 40s in professional casual attire, listening attentively to a client in a warm, private consultation office with natural light, a ficus plant and carefully organized case binders on neat shelving",
    ],
  },
  {
    keywords: ["óptica", "optica", "lentes", "anteojos", "gafas", "visión", "vision", "optometrista"],
    scenes: [
      "a friendly Colombian optometrist in her 30s in professional attire, helping a customer select eyeglass frames in a modern optical store with a large display wall of stylish frames and a professional eye examination chair visible in the background",
      "a Colombian optics technician in his 40s in a lab coat, using precision equipment to fit lenses in a state-of-the-art optical workshop, frame templates and specialized tools organized neatly in the clean professional space",
      "a Colombian optical store interior shot — a wide wall display of hundreds of stylish eyeglass frames in all colors and styles, warm LED lighting illuminating each display, a professional fitting area visible in the foreground",
      "a Colombian optometrist in his 50s in a white coat, performing an eye examination with a slit-lamp device on a patient seated in a darkened clinical examination room, specialized ophthalmic equipment in sharp focus",
      "a Colombian eyewear entrepreneur in her 30s in casual elegant attire, modeling a stylish new glasses frame in front of a mirror at the optical counter of her boutique store, other fashionable frames displayed neatly in the background",
    ],
  },
  {
    keywords: ["seguros", "póliza", "poliza", "aseguradora", "riesgo"],
    scenes: [
      "a professional Colombian insurance advisor in his 40s in business casual attire, sitting across from a family at a modern office desk with a laptop open, reviewing a policy in a bright, welcoming financial consulting office",
      "a Colombian insurance agent in her 30s in a blazer, showing a policy comparison chart on a tablet to a young couple in a modern insurance company branch, tasteful corporate branding and natural light creating a trustworthy environment",
      "a Colombian claims adjustor in his 40s in a reflective vest and branded jacket, inspecting a vehicle for damage in a clear well-lit outdoor area, a professional clipboard and documentation tools visible in his hands",
      "a Colombian insurance company team of four in matching branded polo shirts, grouped around a conference table reviewing quarterly performance reports in a clean modern corporate office with Colombian insurance company materials",
      "a Colombian life insurance advisor in her 50s in professional attire, presenting a retirement planning graphic on a folded brochure to a senior couple at their kitchen table, a warm homey setting conveying trust and financial security",
    ],
  },
  {
    keywords: ["fotografía", "fotografia", "foto", "fotógrafo", "fotografo", "video", "producción audiovisual"],
    scenes: [
      "a Colombian photographer in his 30s in casual attire, reviewing images on a professional camera at a well-equipped photography studio with softboxes, backdrops and editing screens visible in the background",
      "a Colombian videographer in her 30s in casual professional attire, operating a cinema camera on a gimbal while filming an outdoor brand commercial, a lighting crew and equipment cases visible in the bright Colombian daylight",
      "a Colombian portrait photographer in his 40s in a dark crew-neck, directing a model during a fashion shoot in a bright studio, large softbox lights, seamless paper backdrops and a laptop tethered to a professional camera on a tripod",
      "a Colombian social media video producer in her late 20s in casual attire, reviewing footage on a laptop monitor at a creative video editing station with multiple screens showing timelines and color correction tools",
      "a Colombian aerial photographer in his 30s in outdoor gear, launching a professional drone in a scenic Colombian location — coffee mountains or colonial town — both the operator and the scenic landscape creating a compelling editorial image",
    ],
  },
  {
    keywords: ["limpieza", "aseo", "desinfección", "desinfeccion", "servicio doméstic", "servicio domestic"],
    scenes: [
      "a professional Colombian cleaning service worker in uniform, efficiently cleaning a bright modern apartment with professional equipment — microfiber cloths, spray bottles and a clean, organized living space in the background",
      "a Colombian commercial cleaning team of three in uniform, using industrial equipment to clean a large office building lobby at night, polished floors reflecting the overhead lighting and an organized equipment cart visible nearby",
      "a Colombian home cleaning professional in her 40s in a branded apron, organizing and dusting a beautifully maintained suburban living room with a satisfied homeowner watching approvingly in the doorway",
      "a before-and-after scene at a Colombian cleaning service: one side shows a cluttered messy kitchen, the other shows the same kitchen spotlessly clean and organized after professional service, the cleaner standing proudly in the middle",
      "a Colombian disinfection specialist in full protective gear — mask, gloves, and branded suit — spraying sanitizing solution in a commercial kitchen, professional equipment canisters and safety signage visible in the clean industrial space",
    ],
  },
  {
    keywords: ["joyería", "joyeria", "reloj", "joya", "orfebrer", "relojería", "relojeria"],
    scenes: [
      "an elegant Colombian jewelry store with illuminated glass display cases showing luxury watches and fine jewelry pieces, warm accent lighting highlighting gold and gemstone pieces, a professional jeweler in formal attire assisting a customer in a sophisticated upscale boutique",
      "a Colombian goldsmith in his 40s in a workshop apron, using precision tools to craft a handmade gold ring at a jeweler's bench, tiny gemstones and fine metalworking tools arranged neatly in the warm artisan workshop",
      "a Colombian luxury watch retailer in her 30s in formal attire, presenting an open watch case displaying a prestigious timepiece to an interested customer at an illuminated boutique counter with trophy display cases in the background",
      "a close-up macro photo of a Colombian artisan's hands carefully setting a brilliant-cut diamond into a gold ring under a magnifying loupe, the gemstone sparkling brilliantly under the goldsmith's focused workshop lighting",
      "a Colombian jewelry designer in her 30s in elegant attire, sketching a new collection design on paper at a clean design desk surrounded by material samples, gemstone cards and finished jewelry prototypes under warm creative lighting",
    ],
  },
  {
    keywords: ["electrónica", "electronica", "electrodoméstic", "electrodomestic", "reparac celular", "reparac computador", "tienda de electrónica", "tienda de electronica"],
    scenes: [
      "a modern Colombian electronics store with displays of smartphones, laptops and appliances under bright LED lighting, a knowledgeable sales associate in a branded polo shirt helping a customer at a well-organized product display counter",
      "a Colombian cell phone repair technician in his 20s in an anti-static work apron, precisely replacing a smartphone screen component under a magnifying lamp at an organized repair workbench with micro tools and spare parts visible",
      "a Colombian electronics store manager in his 40s in a smart branded shirt, reviewing the latest laptop models on display with a student customer in a well-lit modern tech retail store, products spotlit against clean white shelving",
      "a Colombian home appliance showroom with refrigerators, washing machines and kitchen appliances displayed in elegant lifestyle vignettes, a sales associate in a branded polo demonstrating a premium blender to an interested couple",
      "a Colombian tech entrepreneur in her 30s in casual attire, unboxing a new piece of professional electronics at a clean desk in a bright home office setup, the packaging and device under natural morning window light",
    ],
  },
  {
    keywords: ["muebler", "decorac interior", "hogar decorac", "lencería del hogar", "artículos de decorac", "artículos decorac"],
    scenes: [
      "a beautifully styled Colombian home décor showroom with curated furniture displays, warm accent lighting, plush textiles and tasteful decorative pieces arranged in elegant living room vignettes that invite customers to imagine the space in their own home",
      "a Colombian interior designer in her 40s in stylish casual attire, reviewing furniture fabric swatches with a client in a bright modern furniture showroom with complete room displays and natural light flooding through tall windows",
      "a Colombian furniture craftsman in his 50s in a workshop apron, sanding a handmade wooden dining table in a well-equipped carpentry workshop, finished furniture pieces visible behind him and sawdust catching the warm workshop light",
      "a Colombian home décor entrepreneur in her 30s, photographing a carefully styled shelf display of ceramics, candles and textile items for an online store, a bright minimalist background and natural light creating a clean editorial aesthetic",
      "a Colombian interior design client couple in their 30s, happily reviewing a 3D room rendering on a large monitor with their designer in a modern design studio, material samples and color palettes spread across the consultation table",
    ],
  },
  {
    keywords: ["automotriz", "concesionario", "venta de vehículo", "venta de vehiculo", "vehículos eléctric", "vehiculos electric"],
    scenes: [
      "a sleek Colombian car dealership showroom with polished luxury and compact cars under bright spotlights on a gleaming floor, a professional sales consultant in business attire welcoming a couple and presenting vehicle features",
      "a Colombian automotive sales executive in his 30s in a branded blazer, handing a new vehicle key fob to a delighted customer in the bright exterior forecourt of a modern dealership, the new car gleaming in the afternoon sunlight",
      "a Colombian electric vehicle showroom with eco-friendly cars on display, a knowledgeable EV consultant in smart casual attire demonstrating the touchscreen console to an interested environmentally conscious customer",
      "a Colombian used car lot manager in his 40s in business casual, reviewing vehicle condition documents on a tablet in front of a neat row of certified pre-owned vehicles, clear blue Colombian sky above and pricing visible on windshields",
      "a top-down angle of a new car at a Colombian dealership delivery ceremony — customer and salesperson shaking hands beside a ribbon-adorned vehicle in a clean branded delivery bay with the dealership logo prominently displayed",
    ],
  },
  {
    keywords: ["coaching", "coach de vida", "mindfulness", "meditac", "desarrollo personal", "terapeuta", "coach empresarial"],
    scenes: [
      "a warm and inviting Colombian coaching studio with natural light, comfortable modern seating and motivational elements, a confident life coach in professional casual attire conducting an engaged one-on-one consultation session with a client",
      "a Colombian mindfulness instructor in her 30s in comfortable yoga attire, leading a small group meditation session in a bright serene studio with cushions on the floor, diffusers, plants and soft natural light through sheer curtains",
      "a Colombian executive coach in his 40s in a tailored blazer, engaging in a dynamic coaching conversation with a corporate client in a modern corner office, a whiteboard with coaching frameworks and a city view visible behind them",
      "a Colombian therapist in her 50s in professional casual attire, listening attentively to a client in a warm private consultation room with soft lighting, a comfortable couch, calming abstract art and potted plants creating a safe atmosphere",
      "a Colombian personal development workshop in session — a coach in smart casual attire facilitating a group exercise for 8 professionals seated in a circle in a bright modern training room, notebooks and flip-chart visible",
    ],
  },
  {
    keywords: ["vigilancia", "cerrajer", "blindaje", "empresa de vigilancia", "seguridad física", "guardia"],
    scenes: [
      "a professional Colombian security company team in clean dark uniforms, confidently standing in front of a modern commercial building with surveillance cameras and access control panels visible, projecting reliability and protection",
      "a Colombian security guard in his 40s in a full uniform with reflective elements, monitoring multiple CCTV screens in a professional security operations center with organized control panels and real-time footage on large displays",
      "a Colombian locksmith in his 30s in a branded polo shirt, installing a modern digital access control lock on a commercial door, professional tools organized in a branded toolbox, a clean office building corridor behind him",
      "a Colombian private security patrol in two officers, doing a professional perimeter check at a residential complex at night, clear branded uniforms, visible radio communication equipment and the well-lit property entrance behind them",
      "a Colombian security systems installer in his 40s in a reflective vest, mounting a professional IP security camera at the entrance of a modern commercial building, a laptop and equipment case at his feet, corporate façade in the background",
    ],
  },
  {
    keywords: ["agro", "agricultur", "ganadería", "ganaderia", "cultivo", "acuicultura", "agroinsumo", "vivero plantas"],
    scenes: [
      "a successful Colombian agricultural entrepreneur in his 40s in outdoor work clothes, standing in a lush productive field or greenhouse with rows of healthy crops or tropical plants stretching into the background under a bright clear sky",
      "a Colombian cattle rancher in his 50s in a hat and boots, checking on his herd of healthy Brahman cattle in a lush green Colombian pasture, mountains visible in the background under a brilliant blue sky",
      "a Colombian hydroponic farm owner in her 30s in outdoor casual attire, reviewing growth data on a tablet while walking between rows of hydroponic lettuce in a modern greenhouse with natural light diffused through polycarbonate panels",
      "a Colombian agro-industrial worker in protective gear, operating modern harvesting machinery in a large sugarcane or rice field under a clear tropical sky, the golden crop stretching to the horizon",
      "a Colombian agricultural cooperative team, a group of five farmers in wide-brim hats, sorting and packaging freshly harvested exotic tropical fruits in an outdoor processing area, the harvest rich and colorful in the morning light",
    ],
  },
  {
    keywords: ["manufactura", "fabrica", "fábrica", "metalúrgic", "metalurgic", "maquinaria equipos", "textil industrial", "planta industrial"],
    scenes: [
      "a professional Colombian manufacturing facility manager in a hard hat and safety vest, overseeing a clean and organized production floor with modern industrial machinery, quality-control stations and Colombian workers operating equipment in the background",
      "a Colombian factory floor in operation — workers in safety gear operating CNC machines in a clean modern production facility, sparks flying from metalwork in the background and a quality manager reviewing output at a station",
      "a Colombian textile factory supervisor in her 40s in a hard hat, inspecting finished fabric rolls in a large clean manufacturing plant, modern industrial sewing machinery and Colombian workers at production tables in the background",
      "a Colombian quality control engineer in his 30s in a white lab coat and safety goggles, measuring a machined component with precision calipers at a quality station in a modern Colombian parts manufacturing facility",
      "an aerial view of a clean modern Colombian manufacturing plant with solar panels on the roof, branded trucks at loading bays and an organized green-landscaped industrial park creating a sustainable industrial enterprise image",
    ],
  },
  {
    keywords: ["tienda de variedades", "distribuidora", "distribuidor", "mayorista", "papelería", "papeleria", "supermercado colombiano"],
    scenes: [
      "a well-organized Colombian commercial retail store with neatly stocked shelves full of varied products, bright overhead lighting and a friendly shopkeeper in a casual apron helping a customer at a well-displayed merchandise counter",
      "a Colombian wholesale distributor in his 50s in a casual shirt, reviewing an order manifest in a large organized warehouse with floor-to-ceiling shelving stacked with branded products, pallet jacks and inventory management visible",
      "a Colombian stationery and office supply store owner in her 40s in a branded polo, helping a student find the right supplies in a bright colorful papelería with neatly organized shelves of notebooks, pens and educational materials",
      "the busy interior of a Colombian neighborhood minimarket during morning hours — a shopkeeper in an apron stocking fresh fruit produce near the entrance as early customers browse the well-organized aisles of everyday essentials",
      "a Colombian distributor in her 30s in a blazer, presenting a new product line to a retail buyer across a table in a trade showroom with sample products neatly displayed on branded shelving behind her",
    ],
  },
  {
    keywords: ["galería de arte", "galeria de arte", "ilustrac", "artesanías", "artesanias", "estudio de diseño creativo", "estudio de diseno creativo"],
    scenes: [
      "a vibrant Colombian creative studio or art gallery with colorful artworks on white walls, drawing tables with design tools, a talented Colombian artist or designer in casual creative attire surrounded by their work in a bright inspiring space",
      "a Colombian visual artist in her 30s in paint-splattered casual attire, actively working on a large canvas in her open bright studio, colorful abstract paintings hung on white walls behind her and art supplies covering the worktable",
      "a Colombian artisan craftsperson in his 50s in a leather apron, hand-tooling a traditional piece of Bogotá leatherwork at a crafting table in a warm artisan workshop with handmade goods displayed on rough-hewn wooden shelves",
      "a Colombian art gallery opening night — guests in casual elegant attire mingling and admiring Colombian contemporary paintings in a white-walled gallery, soft gallery lighting, artist statement cards beside each piece and a full crowd",
      "a Colombian graphic design entrepreneur in her early 30s in colorful casual attire, reviewing digital design work on a large Wacom tablet and calibrated monitor in a bright creative studio covered with design inspiration mood boards",
    ],
  },
  {
    keywords: ["consultoría empresarial", "consultoria empresarial", "recursos humanos", "reclutamiento", "gestión de proyectos", "gestion de proyectos", "auditoría empresarial", "auditoria empresarial"],
    scenes: [
      "a sharp Colombian business consultant in his 40s in a tailored suit, presenting strategic insights on a large screen in a modern boardroom with floor-to-ceiling windows, attentive executives listening around a polished conference table",
      "a Colombian HR recruiter in her 30s in professional attire, conducting a video interview on a laptop in a sleek modern HR office, candidate profiles and a structured interview guide neatly organized on the desk beside her",
      "a Colombian business process auditor in his 50s in a formal suit, reviewing financial ledgers with a client management team around a boardroom table, printouts and laptops creating a professional consulting engagement atmosphere",
      "a Colombian project management consultant in her 40s in a blazer, facilitating an agile sprint planning session on a sticky-note Kanban wall with a cross-functional team of Colombian professionals in a bright collaborative office",
      "a Colombian organizational development specialist in his 30s in smart casual, leading a company culture workshop with a diverse team of employees in a modern training room, a whiteboard filled with values maps and team agreements",
    ],
  },
  {
    keywords: ["fundación", "fundacion", "ong social", "corporación sin ánimo", "corporacion sin animo", "iglesia comunidad", "organización social", "organizacion social"],
    scenes: [
      "a dedicated group of Colombian volunteers and social workers in branded shirts, working together in a bright community center helping local families — genuine warm smiles, community tables and colorful informational materials in the background",
      "a Colombian NGO field team in branded vests distributing food packages to families in a rural community, mountains in the background and a genuine spirit of solidarity and care visible in every face",
      "a Colombian social enterprise founder in her 40s in a branded polo, meeting with community leaders around a roundtable in a colorful community center, hand-drawn maps and project plans pinned to the wall behind them",
      "Colombian youth volunteers in branded shirts painting a colorful mural on the wall of a public school in a Colombian urban neighborhood, buckets of paint and brushes creating a joyful scene of community transformation",
      "a Colombian church community gathering — a diverse congregation of families and neighbors sharing a communal meal in a bright church fellowship hall, long tables filled with home-cooked food and warm cross-generational conversation",
    ],
  },
  {
    keywords: ["membresía empresarial", "membresia empresarial", "networking empresarial", "franquicia", "asociación gremial", "asociacion gremial", "red de referidos"],
    scenes: [
      "a dynamic Colombian business networking event in a modern conference venue, professionals in business casual attire exchanging ideas, shaking hands and collaborating around round tables with laptops and presentation screens in the background",
      "a Colombian franchise convention in a large modern expo center, branded booth displays and enthusiastic franchise consultants meeting with prospective business partners, a lively professional trade show atmosphere throughout",
      "a Colombian professional guild association meeting — industry representatives in formal attire seated in a semi-circular conference room, listening to a keynote speaker at a podium with the association's branding prominently displayed",
      "a Colombian referral network breakfast event in a hotel meeting room — 15 professionals in business casual attire, each standing to give a 60-second introduction, connection cards on the table and natural morning light through tall windows",
      "a Colombian franchise owner in his 40s in a branded polo, proudly standing in front of his newly opened franchise location decorated with official brand signage, the modern storefront gleaming under a clear blue Medellín sky",
    ],
  },
  {
    keywords: ["gaming", "esports", "gamer", "videojueg", "torneo", "esport", "stream", "twitch", "youtube gaming"],
    scenes: [
      "a focused Colombian esports player in his early 20s in a gaming chair, competing at a high-end RGB gaming PC setup with multiple curved monitors showing a live tournament match, trophies and team jerseys visible in the background",
      "a Colombian female gamer in her 20s in a branded hoodie, livestreaming gameplay on a professional streaming desk setup with ring light, camera and microphone — chat messages scrolling on a side monitor in her gaming den",
      "a Colombian esports team of five players in matching jerseys, seated at gaming stations at a packed arena event, the crowd behind them lit in colored lights as they compete in a regional tournament",
      "a Colombian content creator in his late 20s reviewing a new video game on a professional desk setup with multiple screens, a gameplay capture card, controller collection displayed on a shelf behind him and warm LED underglow",
      "a wide shot of a Colombian gaming café — rows of gamers at high-performance PC stations with glowing RGB keyboards, headsets on, fully immersed in competitive matches, neon signs and merchandise creating an energetic esports atmosphere",
    ],
  },
  {
    keywords: ["podcast", "audio digital", "radio digital", "contenido de audio", "micróf", "micrófono", "episodio de", "entrevista en"],
    scenes: [
      "a Colombian podcast host in his 30s in casual smart attire, recording an interview in a professional home studio setup with a large condenser microphone, acoustic foam panels, laptop with recording software and warm directional lighting",
      "two Colombian podcast co-hosts in their 30s, seated across a shared podcast desk with professional microphones, laptops and headsets, a branded podcast logo on the wall behind them as they record a lively conversation",
      "a Colombian female podcast producer in her late 20s, mixing audio tracks on a digital audio workstation in a professional studio with soundproof glass separating the production room and the recording booth visible behind her",
      "a Colombian content creator in his early 30s reviewing podcast analytics on a tablet in a modern co-working space, headphones around his neck and a laptop showing episode performance graphs on the bright open-plan desk",
      "a Colombian independent media entrepreneur in her 40s, recording a solo podcast episode in a clean minimalist studio space with a USB microphone, ring light and laptop — conversational energy and professionalism radiating from the setup",
    ],
  },
  {
    keywords: ["sostenib", "reciclaj", "economía circular", "economia circular", "zero waste", "impacto ambiental", "energía renovable", "energia renovable", "eco emprendim", "agricultura orgánica", "agricultura organica", "agroecolog", "orgánico", "organico", "vegano", "plant-based", "ecoturismo"],
    scenes: [
      "a passionate Colombian environmental entrepreneur in her 30s in casual outdoor attire, standing in a lush urban community garden she helped create, rows of organic vegetables growing behind her and a repurposed container workshop visible nearby",
      "a Colombian recycling initiative team in branded t-shirts, sorting and processing recyclable materials at a bright clean sorting facility with colorful labeled bins, conveyor belts and sustainability certificates on the wall",
      "a Colombian sustainable product designer in his 40s in a workshop apron, carefully crafting an eco-friendly product from reclaimed materials at a clean workbench, sustainable certification badges displayed proudly in the background",
      "a Colombian organic farmer in her 50s in practical field attire, harvesting fresh vegetables from a lush agroecological plot with mountain scenery in the background, traditional farming tools and handmade irrigation systems visible",
      "a Colombian circular economy startup team of four diverse professionals, gathered around a whiteboard mapping out a zero-waste supply chain in a bright modern green-certified office with living plant walls and natural materials throughout",
    ],
  },
  {
    keywords: ["vehículo eléctrico", "vehiculo electrico", "movilidad sostenible", " ev ", "motocicleta", "biker", "moto ", "motos", "bicicleta eléctrica", "scooter eléctrico"],
    scenes: [
      "a smiling Colombian electric vehicle entrepreneur in his 40s in a smart casual outfit, standing beside a sleek modern electric car at a urban charging station, a Colombian city skyline glowing in the clean midday light behind him",
      "a Colombian motorcycle culture enthusiast in his 30s in riding gear and helmet in hand, proudly posed beside a beautifully customized motorcycle on a scenic mountain road in the Colombian Andes at golden hour",
      "a Colombian EV startup team in branded polos, presenting a fleet of electric scooters for a city mobility launch event in front of a modern co-working space, curious onlookers and media visible in the vibrant urban scene",
      "a Colombian urban cyclist in her late 20s in smart casual attire, arriving at a modern office building on a branded electric bike, city infrastructure and green trees creating a clean sustainable commute backdrop",
      "a Colombian mobility tech entrepreneur in her 30s in business casual, reviewing a logistics dashboard on a tablet in the depot of an electric delivery fleet, branded EVs lined up charging behind her in a modern logistics yard",
    ],
  },
  {
    keywords: ["coworking", "espacio de trabajo flexible", "oficina flexible", "espacio compartido", "membresía de oficina"],
    scenes: [
      "a vibrant Colombian coworking space during peak hours — diverse professionals working at hot desks and booths, large windows flooding the space with natural light, exposed brick walls, standing desks and a coffee station energizing the room",
      "a Colombian coworking community manager in her 30s in smart casual, welcoming a new member at the reception desk of a beautifully designed coworking space with glass-walled meeting rooms, modern furnishings and greenery throughout",
      "a Colombian entrepreneur in her late 20s on a video call in a private phone booth inside a modern coworking space, acoustic panels and clean glass walls giving her privacy while colleagues work in the open-plan background",
      "a Colombian startup team of three in a coworking meeting room, collaborating around a whiteboard with sticky notes and laptops, large windows overlooking a Colombian city creating an energizing and inspiring creative atmosphere",
      "a wide-angle view of a premium Colombian coworking space — long shared tables with USB charging ports, focused professionals with headphones, a barista bar in the corner and a mix of casual and focused work zones",
    ],
  },
];

/**
 * Derives a niche-specific DALL-E scene instruction from the post's nicheContextShort.
 *
 * Uses an explicit keyword whitelist (NICHE_SCENE_ENTRIES) to match environment-specific
 * niches (talleres, hoteles, restaurantes, clínicas, etc.).
 *
 * Returns null for any niche not in the whitelist — callers preserve CHARACTER_BANK behavior.
 * There is intentionally NO GPT fallback: the whitelist IS the gate, so generic niches
 * (finanzas personales, motivación, etc.) remain on the CHARACTER_BANK path.
 *
 * Only called for non-solar businesses when no explicit imageScene or batchRefStyle exists.
 */
function deriveNicheScene(nicheContextShort: string, variantIdx = 0): string | null {
  const lower = nicheContextShort.toLowerCase();
  for (const entry of NICHE_SCENE_ENTRIES) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      const variants = entry.scenes?.length ? entry.scenes : (entry.scene ? [entry.scene] : null);
      if (!variants) continue;
      return variants[variantIdx % variants.length];
    }
  }
  return null; // not a recognized environment-specific niche → use CHARACTER_BANK
}

/**
 * Maps the business's registered `industry` field to a DALL-E scene.
 * Uses the same NICHE_SCENE_ENTRIES pool so scenes are consistent.
 *
 * Called BEFORE deriveNicheScene so that the business's own industry always
 * takes priority over generic niche keyword matching — prevents a bakery from
 * getting a medical scene just because its post mentions "bienestar".
 *
 * Returns null only for "Otro" or unrecognized industry values,
 * letting the niche keyword fallback handle those cases.
 */
function deriveBusinessIndustryScene(industry: string | null | undefined, variantIdx = 0): string | null {
  if (!industry) return null;
  const lower = industry.toLowerCase();
  const findScene = (keyword: string) => {
    const entry = NICHE_SCENE_ENTRIES.find(e => e.keywords.includes(keyword));
    if (!entry) return null;
    const variants = entry.scenes?.length ? entry.scenes : (entry.scene ? [entry.scene] : null);
    if (!variants) return null;
    return variants[variantIdx % variants.length];
  };

  // ── Energía Solar (special path, handled by isSolarIndustry()) ──
  if (lower.includes("solar") || lower.includes("energía solar") || lower.includes("energia solar"))
    return null;

  // ── Alimentación & Restauración ──
  if (lower.includes("restaurante") || lower.includes("comida") || lower.includes("aliment"))
    return findScene("restaurante");
  if (lower.includes("panadería") || lower.includes("panaderia") || lower.includes("repostería") || lower.includes("reposteria"))
    return findScene("panadería");
  if (lower.includes("café") || lower.includes("cafe") || lower.includes("cafeter") || lower.includes("barista"))
    return findScene("café");

  // ── Salud ──
  if (lower.includes("dental") || lower.includes("odontolog"))
    return findScene("dental");
  if (lower.includes("farmacia") || lower.includes("droguería") || lower.includes("drogueria"))
    return findScene("farmacia");
  if (lower.includes("óptica") || lower.includes("optica") || lower.includes("lentes") || lower.includes("optometri"))
    return findScene("óptica");
  if (lower.includes("mascota") || lower.includes("veterinar"))
    return findScene("mascota");
  if (lower.includes("salud mental") || lower.includes("coaching") || lower.includes("mindfulness") || lower.includes("desarrollo personal"))
    return findScene("coaching");
  if (lower.includes("salud") || lower.includes("bienestar") || lower.includes("clínica") || lower.includes("clinica"))
    return findScene("clínica");

  // ── Belleza & Moda ──
  if (lower.includes("belleza") || lower.includes("estética") || lower.includes("estetica") || lower.includes("peluquer") || lower.includes("spa"))
    return findScene("belleza");
  if (lower.includes("joyería") || lower.includes("joyeria") || lower.includes("reloj") || lower.includes("orfebr"))
    return findScene("joyería");
  if (lower.includes("moda") || lower.includes("ropa") || lower.includes("boutique") || lower.includes("indumentaria"))
    return findScene("moda");

  // ── Construcción & Hogar ──
  if (lower.includes("construc") || lower.includes("remodelac") || lower.includes("ferretera") || lower.includes("ferretería"))
    return findScene("construcción");
  if (lower.includes("hogar") && (lower.includes("decorac") || lower.includes("muebl")))
    return findScene("muebler");
  if (lower.includes("servicios del hogar") || lower.includes("aseo") || lower.includes("lavandería") || lower.includes("jardinería"))
    return findScene("limpieza");
  if (lower.includes("jardín") || lower.includes("jardin") || lower.includes("paisaj") || lower.includes("vivero"))
    return findScene("jardín");

  // ── Movilidad & Transporte ──
  if (lower.includes("automotriz") || lower.includes("concesionario") || lower.includes("vehícul") || lower.includes("vehicul"))
    return findScene("automotriz");
  if (lower.includes("taller") || lower.includes("mecánic") || lower.includes("mecanic") || lower.includes("repuesto"))
    return findScene("taller");
  if (lower.includes("transporte") || lower.includes("logística") || lower.includes("logistica") || lower.includes("mensajería") || lower.includes("mensajeria"))
    return findScene("transporte");

  // ── Educación & Eventos ──
  if (lower.includes("educac") || lower.includes("cursos") || lower.includes("academia") || lower.includes("colegio"))
    return findScene("educac");
  if (lower.includes("eventos") || lower.includes("entretenimiento") || lower.includes("bodas") || lower.includes("catering"))
    return findScene("eventos");
  if (lower.includes("fotografía") || lower.includes("fotografia") || lower.includes("producción audiovisual") || lower.includes("produccion audiovisual"))
    return findScene("fotografía");

  // ── Turismo & Hospedaje ──
  if (lower.includes("hotel") || lower.includes("hostal") || lower.includes("hospedaje") || lower.includes("glamping"))
    return findScene("hotel");
  if (lower.includes("turismo") || lower.includes("viajes") || lower.includes("agencia de viajes") || lower.includes("tour"))
    return findScene("turismo");

  // ── Finanzas, Legal & Seguros ──
  if (lower.includes("legal") || lower.includes("jurídic") || lower.includes("juridic") || lower.includes("abogado") || lower.includes("notaría") || lower.includes("notaria"))
    return findScene("legal");
  if (lower.includes("seguros") || lower.includes("póliza") || lower.includes("poliza") || lower.includes("aseguradora"))
    return findScene("seguros");
  if (lower.includes("finanzas") || lower.includes("inversión") || lower.includes("inversion") || lower.includes("contabilidad") || lower.includes("crédito") || lower.includes("credito"))
    return findScene("finanzas");

  // ── SaaS & Marketing Digital (antes de tecnología genérica) ──
  if (lower.includes("saas") || lower.includes("marketing de contenidos") || lower.includes("marketing digital") || lower.includes("social media management") || lower.includes("gestión de redes") || lower.includes("community manager"))
    return findScene("marketing");

  // ── Tecnología & Electrónica ──
  if (lower.includes("tecnolog") || lower.includes("software") || lower.includes("startup") || lower.includes("programac") || lower.includes("inteligencia artificial") || lower.includes("machine learning") || lower.includes("cibersegur") || lower.includes("automatizac"))
    return findScene("tecnolog");
  if (lower.includes("electrónica") || lower.includes("electronica") || lower.includes("electrodoméstic") || lower.includes("electrodomestic"))
    return findScene("electrónica");

  // ── Inmobiliaria ──
  if (lower.includes("inmobiliaria") || lower.includes("finca raíz") || lower.includes("finca raiz") || lower.includes("arrendamiento"))
    return findScene("inmobiliaria");

  // ── Deporte & Fitness ──
  if (lower.includes("fitness") || lower.includes("deporte") || lower.includes("gimnasio") || lower.includes("yoga") || lower.includes("crossfit"))
    return findScene("deporte");

  // ── Publicidad & Marketing ──
  if (lower.includes("publicidad") || lower.includes("comunicaciones") || lower.includes("agencia de publicidad") || lower.includes("medios") || lower.includes("relaciones públicas"))
    return findScene("marketing");

  // ── Arte & Diseño ──
  if (lower.includes("arte") || lower.includes("diseño creativo") || lower.includes("diseno creativo") || lower.includes("galería") || lower.includes("galeria") || lower.includes("artesanía") || lower.includes("artesania") || lower.includes("ilustrac"))
    return findScene("galería de arte");

  // ── Consultoría Profesional ──
  if (lower.includes("consultoría") || lower.includes("consultoria") || lower.includes("recursos humanos") || lower.includes("auditoría") || lower.includes("auditoria"))
    return findScene("consultoría empresarial");

  // ── Seguridad & Vigilancia ──
  if (lower.includes("vigilancia") || lower.includes("seguridad") && (lower.includes("vigilancia") || lower.includes("empresa de")))
    return findScene("vigilancia");

  // ── Comercio & Retail ──
  if (lower.includes("retail") || lower.includes("comercio") || lower.includes("variedades") || lower.includes("distribuidor") || lower.includes("mayorista"))
    return findScene("tienda de variedades");

  // ── Agro & Manufactura ──
  if (lower.includes("agro") || lower.includes("agricultur") || lower.includes("ganadería") || lower.includes("ganaderia") || lower.includes("cultivo") || lower.includes("acuicultura"))
    return findScene("agro");
  if (lower.includes("manufactura") || lower.includes("fabrica") || lower.includes("fábrica") || lower.includes("metalúrgic") || lower.includes("metalurgic") || lower.includes("maquinaria"))
    return findScene("manufactura");

  // ── Comunidad & Organizaciones ──
  if (lower.includes("ong") || lower.includes("fundación") || lower.includes("fundacion") || lower.includes("iglesia") || lower.includes("organizac social") || lower.includes("corporación sin"))
    return findScene("fundación");
  if (lower.includes("membresía") || lower.includes("membresia") || lower.includes("club") || lower.includes("franquicia") || lower.includes("networking") || lower.includes("gremial"))
    return findScene("membresía empresarial");

  // ── "Otro" u industrias no reconocidas → keyword fallback en deriveNicheScene ──
  return null;
}

/** Returns the next character index ensuring a gap of at least MIN_CHAR_GAP from recent uses */
async function getNextCharacterIndex(recentCharHashes: string[], jobIndexInBatch: number): Promise<number> {
  const MIN_CHAR_GAP = 4; // same character cannot appear within 4 positions
  // Extract recently used character indices from backgroundPromptHash values like "char:5"
  const recentCharIndices = recentCharHashes
    .map(h => { const m = h?.match(/^char:(\d+)/); return m ? parseInt(m[1]) : -1; })
    .filter(i => i >= 0);

  // Find a character index that wasn't used in the last MIN_CHAR_GAP entries
  const lastFew = new Set(recentCharIndices.slice(0, MIN_CHAR_GAP));
  const batchStart = (jobIndexInBatch * 3) % CHARACTER_BANK.length; // vary starting point per batch position
  for (let offset = 0; offset < CHARACTER_BANK.length; offset++) {
    const candidate = (batchStart + offset) % CHARACTER_BANK.length;
    if (!lastFew.has(candidate)) return candidate;
  }
  return jobIndexInBatch % CHARACTER_BANK.length; // fallback
}

interface PostImageJob {
  postId: number;
  userId?: number;        // owner of the post — stamped on imageVariantsTable row
  businessId?: number;    // active business — used for brand routing (overrides userId check)
  nicheContextShort: string;
  captionHook: string;
  caption?: string;       // full post caption — used to generate contextual slide headlines via GPT
  contentType: string;
  styleIdx: number;
  slideCount: number;
  platform?: string;
  characterIdx?: number;  // index into CHARACTER_BANK (rotates every 3-5 posts)
  sceneIdx?: number;      // index into BACKGROUND_SCENES (always new per post)
  customImagePrompt?: string; // user-supplied DALL-E prompt — bypasses all templates
  imageScene?: string;    // visual scene extracted from brief — overrides BACKGROUND_SCENES + passed as DALL-E customInstruction
  batchRefStyle?: string; // one-time reference image analysis for this generation batch — becomes primary DALL-E visual directive
  brandTagline?: string;  // tagline for overlay — empty = no tagline
  userLogoBuffer?: Buffer | null; // null = skip logo; Buffer = custom logo
  referencePersonDesc?: string;   // description derived from brand profile's reference images for DALL-E
  chargedCredits?: boolean; // false = free retry (credits already refunded); only refund on failure when true/undefined
}

/**
 * Reapplies the logo + title overlay to all image variants of the given post IDs
 * that are missing overlay_caption_hook, using the stored raw_background.
 * Does NOT call DALL-E — only re-composites existing images.
 */
export async function reapplyOverlaysForPosts(postIds: number[]): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;

  for (const postId of postIds) {
    try {
      // Get post caption + userId + businessId for brand-aware re-compositing
      const [post] = await db
        .select({ caption: postsTable.caption, contentType: postsTable.contentType, platform: postsTable.platform, userId: postsTable.userId, businessId: postsTable.businessId })
        .from(postsTable)
        .where(eq(postsTable.id, postId));
      if (!post) continue;

      const hook = extractCaptionHook(post.caption ?? "");
      if (!hook) continue;

      // Resolve brand tagline, logo and accent color for the post owner
      const postUserId   = post.userId   ?? undefined;
      const postBizId    = post.businessId ?? undefined;
      const [[postTagline, postAccentColor], postBizData] = await Promise.all([
        Promise.all([
          resolveBrandTagline(postUserId, postBizId),
          resolveBrandColor(postUserId, postBizId),
        ]),
        postBizId != null
          ? db.select({ logoUrl: businessesTable.logoUrl, brandTextStyle: businessesTable.brandTextStyle }).from(businessesTable).where(eq(businessesTable.id, postBizId)).limit(1).then(r => r[0] ?? null)
          : Promise.resolve(null),
      ]);
      const postLogoBuffer = await loadBusinessLogoBuffer(postBizData?.logoUrl);
      const postDefaultTextStyle: TextStyle = (postBizData?.brandTextStyle ?? "cinema") as TextStyle;

      // Get all variants for this post that have raw_background — use stored per-variant params
      const variants = await db
        .select({
          id:                   imageVariantsTable.id,
          rawBackground:        imageVariantsTable.rawBackground,
          overlayLogoPosition:  imageVariantsTable.overlayLogoPosition,
          overlayLogoColor:     imageVariantsTable.overlayLogoColor,
          overlayCaptionHook:   imageVariantsTable.overlayCaptionHook,
          overlayTextStyle:     imageVariantsTable.overlayTextStyle,
          overlayTextPosition:  imageVariantsTable.overlayTextPosition,
          overlayTextSize:      imageVariantsTable.overlayTextSize,
          overlayFilter:        imageVariantsTable.overlayFilter,
          overlayFont:          imageVariantsTable.overlayFont,
          overlayFont2:         imageVariantsTable.overlayFont2,
        })
        .from(imageVariantsTable)
        .where(eq(imageVariantsTable.postId, postId));

      for (const variant of variants) {
        if (!variant.rawBackground) continue;
        // Use stored params if available; fall back to sensible defaults for legacy variants
        const logoPos  = (variant.overlayLogoPosition ?? "top-right") as LogoPosition;
        const logoCol  = (variant.overlayLogoColor    ?? "blue")     as LogoColor;
        const hookText = variant.overlayCaptionHook ?? hook;
        const txtStyle = (variant.overlayTextStyle    ?? postDefaultTextStyle) as TextStyle;
        const txtPos   = (variant.overlayTextPosition ?? "bottom")   as TextPosition;
        const txtSize  = variant.overlayTextSize ?? "medium";
        const imgFilt  = (variant.overlayFilter ?? "none")           as ImageFilter;
        const fntPrst  = variant.overlayFont ?? undefined;
        const fntPrst2 = variant.overlayFont2 ?? undefined;
        try {
          const newImageData = await compositeLogoOnImage(
            variant.rawBackground, logoPos, logoCol, hookText, txtStyle, txtPos, txtSize, imgFilt, fntPrst, postLogoBuffer, postTagline, postAccentColor, undefined, post.contentType ?? undefined, fntPrst2
          );
          await db.update(imageVariantsTable)
            .set({
              imageData: newImageData,
              overlayCaptionHook: hookText,
              overlayLogoPosition: logoPos,
              overlayLogoColor: logoCol,
              overlayTextStyle: txtStyle,
              overlayTextPosition: txtPos,
              overlayTextSize: txtSize,
              overlayFilter: imgFilt !== "none" ? imgFilt : null,
              overlayFont: fntPrst ?? null,
            })
            .where(eq(imageVariantsTable.id, variant.id));
          updated++;
        } catch (e) {
          console.error(`[reapplyOverlays] variant ${variant.id} failed:`, e);
          errors++;
        }
      }
    } catch (e) {
      console.error(`[reapplyOverlays] post ${postId} failed:`, e);
      errors++;
    }
  }

  return { updated, errors };
}

export function extractCaptionHook(caption: string): string {
  const firstLine = caption.split("\n")[0]
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[#@]/g, "")
    .trim();
  // Cap at 42 chars at a word boundary — ensures ≤ 3 lines in the image
  if (firstLine.length <= 42) return firstLine;
  const truncated = firstLine.slice(0, 42);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

/**
 * Generates images for a list of posts in the background.
 * Called AFTER the HTTP response has already been sent so it never blocks the client.
 */
/** Wraps a promise with a timeout — rejects after `ms` milliseconds */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

/**
 * Resolves the brand's primary color for a given user.
 * Returns primaryColor from the active business's brand profile, or undefined if not set.
 */
async function resolveBrandColor(userId: number | undefined, businessId?: number): Promise<string | undefined> {
  try {
    if (businessId != null) {
      const [biz] = await db
        .select({ primaryColor: businessesTable.primaryColor })
        .from(businessesTable)
        .where(eq(businessesTable.id, businessId))
        .limit(1);
      return biz?.primaryColor ?? undefined;
    }
    if (userId == null) return undefined;
    const [profile] = await db
      .select({ primaryColor: brandProfilesTable.primaryColor })
      .from(brandProfilesTable)
      .where(eq(brandProfilesTable.userId, userId))
      .limit(1);
    return profile?.primaryColor ?? undefined;
  } catch (e) {
    console.error(`[resolveBrandColor] Failed for userId=${userId} bizId=${businessId}:`, e);
    return undefined;
  }
}

async function resolveBrandTagline(userId: number | undefined, businessId?: number): Promise<string> {
  try {
    if (businessId != null) {
      const [biz] = await db
        .select({ name: businessesTable.name, defaultLocation: businessesTable.defaultLocation })
        .from(businessesTable)
        .where(eq(businessesTable.id, businessId))
        .limit(1);
      if (!biz) return "";
      const location = (biz.defaultLocation ?? "").toUpperCase().trim();
      const name     = (biz.name ?? "").toUpperCase().trim();
      if (name && location)  return `${name} · ${location}`;
      if (location)          return location;
      return name;
    }
    if (userId == null) return "";
    const [profile] = await db
      .select({ companyName: brandProfilesTable.companyName, city: brandProfilesTable.city, website: brandProfilesTable.website })
      .from(brandProfilesTable)
      .where(eq(brandProfilesTable.userId, userId))
      .limit(1);
    if (!profile) return "";
    const domain  = (profile.website ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toUpperCase();
    const city    = (profile.city ?? "").toUpperCase().trim();
    const company = (profile.companyName ?? "").toUpperCase().trim();
    if (domain && city)  return `${domain} · ${city}`;
    if (domain)          return domain;
    if (company && city) return `${company} · ${city}`;
    if (city)            return city;
  } catch (e) {
    console.error(`[resolveBrandTagline] Failed for userId=${userId} bizId=${businessId}:`, e);
  }
  return "";
}

export async function generateImagesForPostsBg(jobs: PostImageJob[]): Promise<void> {
  const styles: Array<keyof typeof IMAGE_STYLES> = ["photorealistic", "graphic", "infographic"];
  const IMAGE_TIMEOUT_MS = 180_000; // 3 min per image call — gpt-image-1 can take 60-90s+ under load/rate limiting

  // ── Defensive: resolve missing businessId from postsTable ─────────────────
  // Safety net: if a job arrived without businessId (due to a bug at the call site),
  // look it up from the posts table so we never fall back to the wrong brand profile.
  const jobsMissingBizId = jobs.filter(j => j.businessId == null && j.userId != null);
  if (jobsMissingBizId.length > 0) {
    try {
      const rows = await db
        .select({ id: postsTable.id, businessId: postsTable.businessId })
        .from(postsTable)
        .where(inArray(postsTable.id, jobsMissingBizId.map(j => j.postId)));
      const bizByPostId = new Map(rows.map(r => [r.id, r.businessId]));
      for (const job of jobs) {
        if (job.businessId == null && job.userId != null) {
          const biz = bizByPostId.get(job.postId);
          if (biz != null) job.businessId = biz;
        }
      }
    } catch (e) {
      console.error("[generateImagesForPostsBg] Failed to resolve missing businessIds (non-fatal):", e);
    }
  }

  // ── Pre-load brand taglines, accent colors and reference image analyses ──────
  // Key: "${userId}:${businessId}" — supports multi-business users
  const makeJobKey = (uid?: number, bizId?: number) => `${uid ?? ""}:${bizId ?? ""}`;
  const uniqueJobPairs = [...new Map(jobs.map(j => [makeJobKey(j.userId, j.businessId), j])).values()]
    .map(j => ({ userId: j.userId, businessId: j.businessId, key: makeJobKey(j.userId, j.businessId) }));
  const taglineByKey      = new Map<string, string>();
  const colorByKey        = new Map<string, string | undefined>();
  const refStyleByKey     = new Map<string, string | undefined>(); // combined ref image vision analyses
  const logoByKey              = new Map<string, Buffer | null>();       // business logo buffer
  const textStyleByKey         = new Map<string, TextStyle>();           // brand text style
  const industryByKey          = new Map<string, string>();             // business industry (N1)
  const nameByKey              = new Map<string, string>();             // business name (for industry deduction)
  const descriptionByKey       = new Map<string, string>();            // business description (for industry deduction)
  const subIndustryByKey       = new Map<string, string | null>();      // first sub-industry (N2 precise, for slug lookup)
  const subIndustriesPromptByKey = new Map<string, string[]>();        // full sub-industry array (for DALL-E prompt)
  const industryGroupSlugByKey = new Map<string, string | null>(); // cached industry_group_slug
  const countryByKey           = new Map<string, string | null>(); // cached country code (para stamping en image_variants)
  const overlayFontByKey       = new Map<string, string>();             // brand font (overlayFont)
  const overlayFilterByKey     = new Map<string, string>();             // learned overlay filter default (Task #368)
  const learnedImageStyleByKey = new Map<string, string>();             // learned image style default (Task #368)
  const signatureTextByKey     = new Map<string, string | null>();     // custom signature text
  const showSignatureByKey     = new Map<string, boolean>();           // show signature flag
  // 30s global safety net — if brand-data pre-loading hangs for any reason
  // (e.g. logo download from object storage), bail out and generate images without
  // custom branding rather than blocking the entire job indefinitely.
  const BRAND_PRELOAD_TIMEOUT_MS = 30_000;
  try {
    await withTimeout(
      Promise.all(uniqueJobPairs.map(async ({ userId: uid, businessId: bizId, key }) => {
        const [tagline, color] = await Promise.all([
          resolveBrandTagline(uid, bizId),
          resolveBrandColor(uid, bizId),
        ]);
        taglineByKey.set(key, tagline);
        colorByKey.set(key, color);

        // Load business-specific branding data (logo, text style, industry, ref images, font, signature)
        let rawRefImages: string | null = null;
        try {
          if (bizId != null) {
            const [biz] = await db
              .select({ referenceImages: businessesTable.referenceImages, logoUrl: businessesTable.logoUrl, brandTextStyle: businessesTable.brandTextStyle, industry: businessesTable.industry, name: businessesTable.name, description: businessesTable.description, subIndustry: businessesTable.subIndustry, subIndustries: businessesTable.subIndustries, industryGroupSlug: businessesTable.industryGroupSlug, country: businessesTable.country, brandFont: businessesTable.brandFont, defaultSignatureText: businessesTable.defaultSignatureText, defaultShowSignature: businessesTable.defaultShowSignature })
              .from(businessesTable)
              .where(eq(businessesTable.id, bizId))
              .limit(1);
            if (biz) {
              const logoBuffer = await loadBusinessLogoBuffer(biz.logoUrl);
              logoByKey.set(key, logoBuffer);
              textStyleByKey.set(key, (biz.brandTextStyle ?? "cinema") as TextStyle);
              industryByKey.set(key, biz.industry ?? "");
              if (biz.name) nameByKey.set(key, biz.name);
              if (biz.description) descriptionByKey.set(key, biz.description);
              // Prefer the subIndustries array (multi-select) over legacy single value
              const parsedSubIndustries = biz.subIndustries ? (() => { try { return JSON.parse(biz.subIndustries) as string[]; } catch { return null; } })() : null;
              const firstSubIndustry = parsedSubIndustries?.length
                ? parsedSubIndustries[0]
                : (biz.subIndustry ?? null);
              subIndustryByKey.set(key, firstSubIndustry);  // first element only — used for slug lookup
              if (parsedSubIndustries?.length) {
                subIndustriesPromptByKey.set(key, parsedSubIndustries); // full array — used for DALL-E prompt
              } else if (biz.subIndustry) {
                subIndustriesPromptByKey.set(key, [biz.subIndustry]);
              }
              industryGroupSlugByKey.set(key, biz.industryGroupSlug ?? null);
              countryByKey.set(key, biz.country ?? null);
              if (biz.brandFont) overlayFontByKey.set(key, biz.brandFont);
              // Only store firma when there's an actual value — null/empty means "auto-resolve from brandTagline"
              if (biz.defaultSignatureText) signatureTextByKey.set(key, biz.defaultSignatureText);
              showSignatureByKey.set(key, biz.defaultShowSignature !== false);
              rawRefImages = biz.referenceImages ?? null;
            }
          } else if (uid != null) {
            const [bp] = await db
              .select({ referenceImages: brandProfilesTable.referenceImages })
              .from(brandProfilesTable)
              .where(eq(brandProfilesTable.userId, uid))
              .limit(1);
            rawRefImages = bp?.referenceImages ?? null;
          }
        } catch { /* non-fatal */ }

        if (rawRefImages) {
          try {
            const imgs = JSON.parse(rawRefImages) as Array<{ analysis?: string } | string>;
            const analyses = imgs
              .map(i => typeof i === "string" ? undefined : i.analysis?.trim())
              .filter((a): a is string => Boolean(a));
            if (analyses.length > 0) refStyleByKey.set(key, analyses.join("\n---\n"));
          } catch { /* non-fatal */ }
        }
      })),
      BRAND_PRELOAD_TIMEOUT_MS,
      "brand-data pre-loading"
    );
  } catch (e) {
    console.error("[generateImagesForPostsBg] Failed to pre-load brand data (non-fatal):", e);
    for (const { userId: uid, businessId: bizId, key } of uniqueJobPairs) {
      if (!taglineByKey.has(key)) taglineByKey.set(key, "");
      if (!colorByKey.has(key)) colorByKey.set(key, undefined);
    }
  }

  // ── Visual preferences per userId (Task #368) ─────────────────────────────
  // Pre-load learned visual style preferences for each unique userId in the batch.
  // Used to:
  //   1. Enrich DALL-E scene description text (lowest-priority prompt hint)
  //   2. Pre-apply structured visual defaults (textStyle, filter, font) as actual
  //      rendering parameters when the brand hasn't set an explicit override.
  const visualPrefsByUserId = new Map<number, string>();
  const uniqueUserIds = [...new Set(jobs.map(j => j.userId).filter((u): u is number => u != null))];
  await Promise.all(uniqueUserIds.map(async uid => {
    try {
      const [textPrefs, structuredDefaults] = await Promise.all([
        getUserVisualPrefs(uid),
        getUserVisualStructuredDefaults(uid),
      ]);
      if (textPrefs) visualPrefsByUserId.set(uid, textPrefs);

      // Apply structured visual defaults for all job keys belonging to this userId,
      // only filling in values that haven't been set by the brand profile.
      if (structuredDefaults) {
        const userJobKeys = [...new Set(
          jobs.filter(j => j.userId === uid).map(j => makeJobKey(j.userId, j.businessId))
        )];
        for (const jobKey of userJobKeys) {
          // overlayFont: learned default only fills in when brand hasn't set brandFont
          if (structuredDefaults.overlayFont && !overlayFontByKey.has(jobKey)) {
            overlayFontByKey.set(jobKey, structuredDefaults.overlayFont);
          }
          // overlayFilter: new map — no prior brand source, so learned always applies
          if (structuredDefaults.overlayFilter && !overlayFilterByKey.has(jobKey)) {
            overlayFilterByKey.set(jobKey, structuredDefaults.overlayFilter);
          }
          // textStyle: learned default fills in when brand uses the system default "cinema" OR when
          // the jobKey has no prior entry (some no-business paths skip preloading).
          if (structuredDefaults.textStyle) {
            const current = textStyleByKey.get(jobKey);
            if (!current || current === "cinema") {
              textStyleByKey.set(jobKey, structuredDefaults.textStyle as TextStyle);
            }
          }
          // imageStyle: learned DALL-E style (photorealistic/graphic/infographic)
          // stored in learnedImageStyleByKey and applied per-job in the render loop
          if (structuredDefaults.imageStyle && !learnedImageStyleByKey.has(jobKey)) {
            learnedImageStyleByKey.set(jobKey, structuredDefaults.imageStyle);
          }
        }
      }
    } catch {
      // Non-fatal: continue without visual prefs for this user
    }
  }));

  // ── Character & scene setup ────────────────────────────────────────────────
  // Load last 20 character hashes to enforce 3-5 gap rule
  // V4 FIX: filtrar por userId del batch — nunca mezclar hashes de personajes entre usuarios
  // Usa contentHistoryScopeSafe de lib/tenant.ts como fuente de verdad del scope de tenant.
  const batchUserId  = jobs.find(j => j.userId != null)?.userId;
  const batchBizId   = jobs.find(j => j.businessId != null)?.businessId;
  const batchScope = contentHistoryScopeSafe(batchUserId, batchBizId);
  const charScopeCond = batchScope != null
    ? and(batchScope, drizzleSql`${contentHistoryTable.backgroundPromptHash} IS NOT NULL`)
    : drizzleSql`FALSE`; // sin userId/businessId → no cargar hashes (fail-closed)
  const recentCharRows = await db
    .select({ hash: contentHistoryTable.backgroundPromptHash })
    .from(contentHistoryTable)
    .where(charScopeCond)
    .orderBy(desc(contentHistoryTable.createdAt))
    .limit(20);
  const recentCharHashes = recentCharRows.map(r => r.hash ?? "").filter(Boolean);
  // Track scenes used IN THIS batch so backgrounds never repeat within a single run
  const usedScenesInBatch = new Set<number>();
  // Random offset so consecutive batch runs start from different scene positions.
  // Without this, every generation starts from the same sequence → same 5 scenes repeat.
  const batchSceneOffset = Math.floor(Math.random() * BACKGROUND_SCENES.length);

  // ── Niche scene cache (sync, pure keyword matching) ─────────────────────
  // Cache by composite key `${isSolar}:${nicheContextShort}` so solar and non-solar businesses
  // with the same nicheContextShort never share a cached result.
  // deriveNicheScene() is a pure keyword match (no GPT) — caching is a minor O(1) optimization.
  const nicheSceneCache = new Map<string, string | null>();

  // ── Pre-assign character and scene indices for ALL jobs (synchronously) ───
  // This must happen BEFORE the parallel pool starts so that:
  // (a) character gap-rule (3-5 gap) is enforced deterministically, and
  // (b) scene uniqueness within the batch is guaranteed without async contention.
  // recentCharHashes is mutated here sequentially before any job fires.
  interface ResolvedJobMeta {
    charIdx: number;
    sceneIdx: number;
  }
  const resolvedMeta: ResolvedJobMeta[] = [];
  for (let jobIdx = 0; jobIdx < jobs.length; jobIdx++) {
    const job = jobs[jobIdx];
    if (job.customImagePrompt?.trim()) {
      // custom-prompt jobs don't use character/scene banks — fill with dummies
      resolvedMeta.push({ charIdx: 0, sceneIdx: 0 });
      continue;
    }
    const charIdx = job.characterIdx ?? (() => {
      const MIN_CHAR_GAP = 4;
      const recentCharIndices = recentCharHashes
        .map(h => { const m = h?.match(/^char:(\d+)/); return m ? parseInt(m[1]) : -1; })
        .filter(i => i >= 0);
      const lastFew = new Set(recentCharIndices.slice(0, MIN_CHAR_GAP));
      const batchStart = (jobIdx * 3) % CHARACTER_BANK.length;
      for (let offset = 0; offset < CHARACTER_BANK.length; offset++) {
        const candidate = (batchStart + offset) % CHARACTER_BANK.length;
        if (!lastFew.has(candidate)) return candidate;
      }
      return jobIdx % CHARACTER_BANK.length;
    })();

    let sceneIdx = job.sceneIdx;
    if (sceneIdx === undefined) {
      let candidate = (jobIdx * 3 + charIdx + batchSceneOffset) % BACKGROUND_SCENES.length;
      for (let tries = 0; tries < BACKGROUND_SCENES.length; tries++) {
        if (!usedScenesInBatch.has(candidate)) { sceneIdx = candidate; break; }
        candidate = (candidate + 1) % BACKGROUND_SCENES.length;
      }
      sceneIdx = sceneIdx ?? ((jobIdx + batchSceneOffset) % BACKGROUND_SCENES.length);
    }
    usedScenesInBatch.add(sceneIdx);
    // Stamp character usage NOW (sequentially) so next job in this pre-assignment loop
    // correctly sees the gap enforced by previous jobs.
    recentCharHashes.unshift(`char:${charIdx}`);
    // Persist character tracking (non-blocking, fire-and-forget)
    void recordCaptionHistory(0, job.platform ?? "both", `[image-job:${job.postId}]`, job.contentType, `char:${charIdx}`, undefined, job.userId ?? undefined);
    resolvedMeta.push({ charIdx, sceneIdx });
  }

  // ── Concurrency semaphore: max 4 jobs running simultaneously ──────────────
  // Each job processes its own variants internally (carousel/reel use their own
  // parallel calls). Running 4 jobs at once cuts wall-clock time from ~20 min
  // (20 posts × 60s) to ~4-5 min for a typical 20-post bulk batch.
  // We use a simple counter-based semaphore — no external dependencies.
  const CONCURRENCY = 4;
  let activeWorkers = 0;
  let nextJobIdx = 0;

  const processJob = async (jobIdx: number): Promise<void> => {
    const job = jobs[jobIdx];
    const { charIdx, sceneIdx: resolvedSceneIdx } = resolvedMeta[jobIdx];
    try {
      // ── Custom image prompt: bypass default template, use user's exact DALL-E prompt ──
      if (job.customImagePrompt?.trim()) {
        const size = getImageSizeForPlatform(job.contentType, job.platform);
        const isPortraitIG = shouldCropTo4by5(job.contentType, job.platform);
        const buffer = await generateImageBuffer(job.customImagePrompt.trim(), size);
        let rawBackground = buffer.toString("base64");
        let originalRawBackground: string | undefined;
        if (isPortraitIG) {
          originalRawBackground = rawBackground;
          rawBackground = await cropTo4by5(rawBackground);
        }
        const captionHook = job.captionHook?.slice(0, 120) ?? undefined;
        const jobKey = makeJobKey(job.userId, job.businessId);
        const customTextStyle: TextStyle = textStyleByKey.get(jobKey) ?? "cinema";
        const customLogoBuffer = logoByKey.get(jobKey) ?? null;
        const customTagline = taglineByKey.get(jobKey) ?? "";
        const customAccentColor = colorByKey.get(jobKey) ?? undefined;
        const imageData = await compositeLogoOnImage(rawBackground, "top-right", "blue", captionHook, customTextStyle, "bottom", "medium", "none", undefined, customLogoBuffer, customTagline, customAccentColor, undefined, job.contentType);
        await db.insert(imageVariantsTable).values({
          postId: job.postId,
          ...(job.userId != null ? { userId: job.userId } : {}),
          businessId: job.businessId ?? null,
          industryGroupSlug: industryGroupSlugByKey.get(jobKey) ?? null,
          subIndustrySlug: subIndustryToSlug(subIndustryByKey.get(jobKey) ?? null),
          country: countryByKey.get(jobKey) ?? null,
          variantIndex: 0,
          imageData,
          rawBackground,
          ...(originalRawBackground ? { originalRawBackground } : {}),
          style: "custom",
          prompt: job.customImagePrompt.trim().slice(0, 500),
          overlayLogoPosition: "top-right",
          overlayLogoColor: "blue",
          overlayCaptionHook: captionHook ?? null,
          overlayTextStyle: customTextStyle,
          overlayTextPosition: "bottom",
          overlayTextSize: "medium",
        });
        return;
      }

      // charIdx and sceneIdx were pre-assigned synchronously before the pool started,
      // ensuring strict character gap rule and scene uniqueness even under parallelism.
      const sceneIdx = resolvedSceneIdx;
      const jobKey = makeJobKey(job.userId, job.businessId);
      const jobIndustry = industryByKey.get(jobKey) ?? "";
      const jobName = nameByKey.get(jobKey) ?? null;
      const jobDescription = descriptionByKey.get(jobKey) ?? null;
      const jobSubIndustry = subIndustryByKey.get(jobKey) ?? null; // first element for slug lookup
      const jobSubIndustriesArr = subIndustriesPromptByKey.get(jobKey) ?? (jobSubIndustry ? [jobSubIndustry] : []);
      // Extend solar detection to name + description — covers businesses with empty industry field
      const isSolar = isSolarIndustry(jobIndustry, jobName, jobDescription);
      // ── Solar/EV scene index separation ─────────────────────────────────────────
      // SOLAR_EV_SCENE_INDICES: all scenes with solar/EV visual elements (excluded for non-solar biz)
      // SOLAR_PANEL_SCENE_INDICES: only scenes with photovoltaic panels on rooftops/farms (for pure solar panel biz)
      // EV-only scenes (indices 2, 10, 18) are kept for mixed solar+EV businesses; excluded for pure panel biz
      const SOLAR_CHAR_INDICES = new Set([10]); // index 10: "solar/EV technician in professional uniform"
      const SOLAR_EV_SCENE_INDICES = new Set([1, 2, 3, 10, 18, 20, 21, 22, 23]); // all solar+EV scenes
      const SOLAR_PANEL_SCENE_INDICES = new Set([1, 3, 20, 21, 22, 23]);           // panels only (no EV chargers/highway)
      // Determine which scene pool to use for solar businesses:
      // If description explicitly mentions EV/cargadores, include EV scenes too; otherwise panels-only.
      const isMixedSolarEV = isSolar && (jobDescription ?? "").toLowerCase().match(/\bev\b|cargador|vehículo eléctrico|vehiculo electrico/);
      const solarSceneIndices = isMixedSolarEV ? SOLAR_EV_SCENE_INDICES : SOLAR_PANEL_SCENE_INDICES;
      // Filter character and business-context banks in lockstep — both drop the same solar indices
      // so that charIdx selects the same persona from both arrays consistently.
      const effectiveCharBank = isSolar
        ? CHARACTER_BANK
        : CHARACTER_BANK.filter((_, i) => !SOLAR_CHAR_INDICES.has(i));
      const effectiveBusinessCtxBank = isSolar
        ? CHARACTER_BUSINESS_CONTEXT
        : CHARACTER_BUSINESS_CONTEXT.filter((_, i) => !SOLAR_CHAR_INDICES.has(i));
      const characterDesc = effectiveCharBank[charIdx % effectiveCharBank.length];
      // Solar businesses: use only solar panel scenes (or solar+EV if mixed).
      // Non-solar businesses: exclude ALL solar/EV-specific scene indices.
      const effectiveSceneBank = isSolar
        ? BACKGROUND_SCENES.filter((_, i) => solarSceneIndices.has(i))
        : BACKGROUND_SCENES.filter((_, i) => !SOLAR_EV_SCENE_INDICES.has(i));
      // If the job has a user-specified visual scene (from brief distillation), use it; otherwise pick from the bank
      const sceneDesc = job.imageScene ?? effectiveSceneBank[sceneIdx % effectiveSceneBank.length];
      // Business context: aligned to the same charIdx in the filtered bank (no solar context leak for non-solar biz)
      const businessContext = effectiveBusinessCtxBank[charIdx % effectiveBusinessCtxBank.length] ?? undefined;
      // Character usage was already stamped (recentCharHashes.unshift + recordCaptionHistory)
      // in the synchronous pre-assignment loop above — do NOT repeat it here.

      // Niche-specific scene: industry-first, then keyword whitelist.
      // Priority: (1) business's registered industry → (2) niche text keywords → (3) CHARACTER_BANK
      // This prevents cross-industry contamination (e.g. a bakery writing about "bienestar"
      // being matched to the medical scene because "bienestar" was a medical keyword).
      // variantIdx = sceneIdx (not jobIdx) so that the variant selection benefits from the
      // cross-batch random offset and the within-batch uniqueness tracking.
      // Using jobIdx caused each of 5 scenes to repeat 6× in a 30-post batch.
      const nicheCompositeKey = `${isSolar}:${job.nicheContextShort}:${sceneIdx}`;
      let nicheSpecificScene: string | null = null;
      // Helper: build subIndustry suffix for DALL-E prompts.
      // Accepts the full array of specialties from subIndustriesPromptByKey.
      const buildSubIndustrySuffix = (arr: string[], path: 1 | 2): string => {
        if (!arr.length) return '';
        if (arr.length > 1) {
          return `. This business operates across multiple specialties: ${arr.map(p => `"${p}"`).join(', ')} — let the setting reflect this multi-faceted nature.`;
        }
        return path === 1
          ? `. Specifically, this is a "${arr[0]}" type of business — let the setting reflect that.`
          : `. This is specifically a "${arr[0]}" type of business.`;
      };
      // When industry field is empty, infer it from the business name and description.
      // This ensures businesses without a selected industry get relevant scenes instead of generic ones.
      // e.g. "Panadería Artesanal Los Andes" → bakery scene; "Clínica Dental Sonrisa" → dental scene.
      const effectiveIndustry = jobIndustry ||
        `${jobName ?? ''} ${jobDescription ?? ''}`.trim();
      if (!job.imageScene && !job.batchRefStyle) {
        if (isSolar) {
          // ── Step 1: Solar-specific nicheSpecificScene ──────────────────────────────
          // Solar businesses ALWAYS get a nicheSpecificScene built here so that the
          // Topic-FIRST block at line ~4850 never runs for them — solar panels on rooftops
          // must be the PRIMARY visual directive, not a secondary context that DALL-E ignores.
          const solarBaseScene = effectiveSceneBank[sceneIdx % effectiveSceneBank.length];
          const captionTopicSolar = job.captionHook?.trim().slice(0, 100);
          const captionBodySolar = job.caption
            ? job.caption.replace(/\n+/g, ' ').trim().slice(0, 200)
            : null;
          const subIndustrySuffixSolar = buildSubIndustrySuffix(jobSubIndustriesArr, 1);
          if (captionTopicSolar) {
            const bodyCtxSolar = captionBodySolar ? ` Content context: "${captionBodySolar}".` : '';
            // MANDATE: solar panels on rooftops are the PRIMARY visual element, ALWAYS visible.
            // Post topic provides thematic context but must NOT replace the solar visual.
            nicheSpecificScene = `MANDATORY visual: photovoltaic solar panels prominently installed on a rooftop or ground array MUST be the dominant visual element of this image — this is non-negotiable. Post topic (thematic context only — do NOT let this override the solar visual): "${captionTopicSolar}".${bodyCtxSolar} Character reference: solar energy professional. Setting: ${solarBaseScene}${subIndustrySuffixSolar}.`;
          } else {
            const nicheHintSolar = job.nicheContextShort?.trim().slice(0, 60);
            nicheSpecificScene = `MANDATORY: photovoltaic solar panels on a rooftop MUST be prominently visible as the primary visual. Setting: ${solarBaseScene}${subIndustrySuffixSolar}${nicheHintSolar ? `. Post topic: "${nicheHintSolar}" — reflect this thematically` : ''}.`;
          }
        } else {
        // 1. Business industry takes priority — most reliable signal for correct scene
        // Uses effectiveIndustry (jobIndustry if set, else name+description) for businesses
        // without a selected industry — so e.g. "Panadería El Trigal" gets a bakery scene.
        const industryScene = deriveBusinessIndustryScene(effectiveIndustry, sceneIdx);
        if (industryScene) {
          // 1b/1c. TOPIC-FIRST prompt construction (Regla 1 — Massive Post Generator):
          // The post title + body are the PRIMARY directive for DALL-E.
          // Industry scene provides character type and photographic style (SECONDARY context only).
          // Root cause fix: previously the 100+ word industry scene came first → DALL-E followed it
          // regardless of the post topic. Now the topic leads → images reflect what the post says.
          const captionTopicHint1 = job.captionHook?.trim().slice(0, 100);
          const captionBodyHint1 = job.caption
            ? job.caption.replace(/\n+/g, ' ').trim().slice(0, 200)
            : null;
          const subIndustrySuffix1 = buildSubIndustrySuffix(jobSubIndustriesArr, 1);
          if (captionTopicHint1) {
            // Topic-FIRST: content drives the scene, industry provides visual style reference
            const bodyCtx1 = captionBodyHint1
              ? ` Content context: "${captionBodyHint1}".`
              : '';
            nicheSpecificScene = `Visual topic (PRIMARY directive): "${captionTopicHint1}".${bodyCtx1} The image MUST visually depict this specific topic above all else. Character and setting reference (secondary context — use for photographic style and character type only): ${industryScene}${subIndustrySuffix1}.`;
          } else {
            // Fallback when no captionHook: original behavior — industry scene leads
            if (jobSubIndustriesArr.length > 1) {
              // Multi-specialty: append specialized context
              const multiCtx = `. This business operates across multiple specialties: ${jobSubIndustriesArr.map(s => `"${s}"`).join(', ')} — adjust the scene to reflect this multi-faceted establishment.`;
              nicheSpecificScene = `${industryScene}${multiCtx}`;
            } else if (jobSubIndustry) {
              nicheSpecificScene = `${industryScene}. Specifically, this is a "${jobSubIndustry}" business — adjust the scene accordingly to reflect this exact type of establishment, its typical products, and its visual identity.`;
            } else {
              nicheSpecificScene = industryScene;
            }
            const nicheHint1 = job.nicheContextShort?.trim().slice(0, 60);
            if (nicheHint1) {
              nicheSpecificScene = `${nicheSpecificScene}. Post topic: "${nicheHint1}" — visually reflect this theme.`;
            }
          }
        } else {
          // 2. Fallback: niche keyword whitelist (only when no industry match), with variant rotation
          if (!nicheSceneCache.has(nicheCompositeKey)) {
            nicheSceneCache.set(nicheCompositeKey, deriveNicheScene(job.nicheContextShort, sceneIdx));
          }
          const nicheBaseScene2 = nicheSceneCache.get(nicheCompositeKey) ?? null;
          if (nicheBaseScene2) {
            // 2b/2c. Topic-FIRST prompt construction — same rule as path 1c
            const captionTopicHint2 = job.captionHook?.trim().slice(0, 100);
            const captionBodyHint2 = job.caption
              ? job.caption.replace(/\n+/g, ' ').trim().slice(0, 200)
              : null;
            const subIndustrySuffix2 = buildSubIndustrySuffix(jobSubIndustriesArr, 2);
            if (captionTopicHint2) {
              const bodyCtx2 = captionBodyHint2
                ? ` Content context: "${captionBodyHint2}".`
                : '';
              nicheSpecificScene = `Visual topic (PRIMARY directive): "${captionTopicHint2}".${bodyCtx2} The image MUST visually depict this specific topic. Character and setting reference (secondary context): ${nicheBaseScene2}${subIndustrySuffix2}.`;
            } else {
              nicheSpecificScene = `${nicheBaseScene2}${subIndustrySuffix2}`;
              const nicheHint2 = job.nicheContextShort?.trim().slice(0, 60);
              if (nicheHint2) {
                nicheSpecificScene = `${nicheSpecificScene}. Post topic: "${nicheHint2}" — visually reflect this theme.`;
              }
            }
          }
        }
        } // end else (non-solar path)
      } // end outer if (!job.imageScene && !job.batchRefStyle)
      // ── Visual variety modifier ─────────────────────────────────────────────────
      // When the same industry scene would be reused across a bulk batch, append a
      // lighting & framing modifier that rotates per job (via sceneIdx) so that each
      // post gets visually distinct output even with identical base industry scenes.
      // 10 moods × N industry scenes = far fewer visual repetitions in large batches.
      if (nicheSpecificScene && !job.imageScene) {
        const SCENE_MOODS = [
          "golden morning light from large windows, warm soft shadows",
          "clean bright midday daylight, even and flattering",
          "warm afternoon ambient light, rich golden tones",
          "cool professional studio lighting, blue-toned and sharp",
          "cozy warm tungsten lighting, intimate atmosphere",
          "bright airy white studio light, minimalist and modern",
          "dramatic window side light, shallow depth of field background",
          "wide establishing shot, environment and context prominent",
          "close-up intimate framing, subject fills frame confidently",
          "overcast diffused light, cinematic even quality",
        ];
        nicheSpecificScene = `${nicheSpecificScene} Lighting and framing: ${SCENE_MOODS[sceneIdx % SCENE_MOODS.length]}.`;
      }

      // Skip CHARACTER_BANK when an explicit scene or niche-specific scene is used
      const hasOverrideScene = Boolean(job.imageScene || nicheSpecificScene);
      const effectiveCharacterDesc = hasOverrideScene ? undefined : characterDesc;
      const effectiveBusinessContext = hasOverrideScene ? undefined : businessContext;
      const userRefStyle = refStyleByKey.get(jobKey);
      // Promote saved ref style to primary DALL-E directive (same level as batchRefStyle).
      // Priority: batchRefStyle (manual upload this run) > userRefStyle (saved in brand) > undefined.
      // Only applies when no explicit imageScene or nicheSpecificScene exists.
      const effectiveBatchRefStyle = job.batchRefStyle
        ?? (userRefStyle && !job.imageScene && !nicheSpecificScene
            ? userRefStyle.split("\n---\n")[0]?.slice(0, 500)
            : undefined);

      // Visual prefs learned from user's past style choices and reference images (Task #368).
      // Lowest-priority supplement — only applied when no explicit visual directive exists.
      const jobVisualPrefs = (job.userId != null && !effectiveBatchRefStyle && !job.imageScene && !nicheSpecificScene)
        ? visualPrefsByUserId.get(job.userId)
        : undefined;

      // Only append ref style to scene description when it is NOT already the primary directive,
      // to avoid doubling the same text in the DALL-E prompt.
      let enrichedSceneDesc = (!effectiveBatchRefStyle && userRefStyle && !job.imageScene && !nicheSpecificScene)
        ? `${sceneDesc}. Estilo visual de referencia del usuario: ${userRefStyle.split("\n---\n")[0]?.slice(0, 300)}`
        : sceneDesc;

      // Append learned visual prefs when no other style directive is active (Task #368).
      // Extract only the scene/style lines (strip emoji header) for DALL-E compatibility.
      if (jobVisualPrefs) {
        const visualHint = jobVisualPrefs
          .split("\n")
          .filter(l => l.trim().startsWith("•"))
          .map(l => l.replace(/^\s*•\s*/, "").trim())
          .join("; ");
        if (visualHint) {
          enrichedSceneDesc = `${enrichedSceneDesc}. Preferencias visuales aprendidas: ${visualHint.slice(0, 300)}.`;
        }
      }

      // ── Universal topic concordance (TODOS los usuarios, TODAS las industrias) ────
      // Regla fundamental — Massive Post Generator Regla 1:
      // El título y el texto del post son el driver PRIMARIO de la imagen.
      // Para solar (isSolar=true) y batchRefStyle paths donde nicheSpecificScene=null,
      // aplicamos topic-FIRST al enrichedSceneDesc — mismo principio que paths 1c y 2c.
      if (!job.imageScene && !nicheSpecificScene) {
        const captionHookHint = job.captionHook?.trim().slice(0, 100);
        const captionBodyHint = job.caption
          ? job.caption.replace(/\n+/g, ' ').trim().slice(0, 200)
          : null;
        const nicheHint = job.nicheContextShort?.trim().slice(0, 60);
        if (captionHookHint) {
          // Topic-FIRST: captionHook leads the prompt, enrichedSceneDesc is secondary context
          const bodyCtx = captionBodyHint ? ` Content context: "${captionBodyHint}".` : '';
          enrichedSceneDesc = `Visual topic (PRIMARY directive): "${captionHookHint}".${bodyCtx} The image MUST visually depict this specific topic above all else. Character and setting reference (secondary context — use for photographic style only): ${enrichedSceneDesc}.`;
        } else if (nicheHint) {
          enrichedSceneDesc = `${enrichedSceneDesc}. Post topic: "${nicheHint}" — visually reflect this theme in the character's activity and environment.`;
        }
      }

      const jobTextStyle: TextStyle = textStyleByKey.get(jobKey) ?? "cinema";
      const jobTagline      = taglineByKey.get(jobKey) ?? "";
      const jobAccentColor  = colorByKey.get(jobKey) ?? undefined;
      const jobOverlayFont  = overlayFontByKey.get(jobKey) ?? undefined;
      const jobOverlayFilter = (overlayFilterByKey.get(jobKey) ?? "none") as ImageFilter;
      const jobSignText     = signatureTextByKey.has(jobKey) ? signatureTextByKey.get(jobKey) : undefined;
      const jobShowSig      = showSignatureByKey.get(jobKey) ?? true;
      // Use pre-loaded logo buffer: null = tried but no logo, undefined = key not pre-loaded (let generatePostImage load)
      const jobLogoBuffer   = logoByKey.has(jobKey) ? (logoByKey.get(jobKey) ?? null) : undefined;
      // Effective image style: learned preference wins over bulk-rotation whenever it exists.
      // The styleIdx is always a system-driven cycle (never an explicit user choice in bulk generation),
      // so the learned style is always the better default when available.
      // Precedence: learned user preference > rotation cycle > system default (photorealistic)
      const rotatedStyle = styles[job.styleIdx % styles.length];
      const learnedStyle = learnedImageStyleByKey.get(jobKey) as keyof typeof IMAGE_STYLES | undefined;
      const jobEffectiveStyle: keyof typeof IMAGE_STYLES = learnedStyle ?? rotatedStyle;

      // Effective DALL-E customInstruction for this job (priority order):
      // 1. explicit brief imageScene (user wrote a specific scene) — highest priority
      // 2. niche-specific scene (derived from nicheContextShort, industry-matched)
      // 3. effectiveBatchRefStyle: manual ref image (batchRefStyle) OR saved business ref images (userRefStyle)
      // 4. undefined — use character/scene bank template
      const jobImageScene = job.imageScene
        ? job.imageScene
        : nicheSpecificScene
        ? nicheSpecificScene
        : effectiveBatchRefStyle
        ? `${effectiveBatchRefStyle}. Aplica este estilo visual, paleta de colores e iluminación. Escena: ${enrichedSceneDesc}. Contexto de marca: ${job.nicheContextShort}.`
        : undefined;

      if (job.contentType === "carousel") {
        const slideResults = await withTimeout(
          generateCarouselSlides(job.nicheContextShort, jobEffectiveStyle, job.slideCount, job.captionHook, jobTextStyle, effectiveCharacterDesc, enrichedSceneDesc, effectiveBusinessContext, job.userId ?? undefined, jobTagline, jobAccentColor, job.businessId, jobImageScene, jobOverlayFont, jobSignText, jobShowSig, jobLogoBuffer, job.caption, job.platform, jobOverlayFilter),
          IMAGE_TIMEOUT_MS * job.slideCount,
          `carousel post ${job.postId}`
        );
        const carouselLogoPosition = "top-right";
        const carouselLogoColor = "blue";
        const carouselTextStyle = jobTextStyle;
        const carouselTextPosition = "bottom";
        const carouselTextSize = "medium";
        for (let v = 0; v < slideResults.length; v++) {
          const hookForSlide = slideResults[v].headline;
          await db.insert(imageVariantsTable).values({
            postId: job.postId,
            ...(job.userId != null ? { userId: job.userId } : {}),
            businessId: job.businessId ?? null,
            industryGroupSlug: industryGroupSlugByKey.get(jobKey) ?? null,
            subIndustrySlug: subIndustryToSlug(subIndustryByKey.get(jobKey) ?? null),
            country: countryByKey.get(jobKey) ?? null,
            variantIndex: v,
            imageData: slideResults[v].imageData,
            rawBackground: slideResults[v].rawBackground,
            ...(slideResults[v].originalRawBackground ? { originalRawBackground: slideResults[v].originalRawBackground } : {}),
            style: `${jobEffectiveStyle}_slide_${v + 1}`,
            prompt: `Slide ${v + 1}: ${job.nicheContextShort}`,
            overlayLogoPosition: carouselLogoPosition,
            overlayLogoColor: carouselLogoColor,
            overlayCaptionHook: hookForSlide ?? null,
            overlayTextStyle: carouselTextStyle,
            overlayTextPosition: carouselTextPosition,
            overlayTextSize: carouselTextSize,
            ...(jobOverlayFont ? { overlayFont: jobOverlayFont } : {}),
            ...(jobOverlayFilter !== "none" ? { overlayFilter: jobOverlayFilter } : {}),
          });
        }
      } else if (job.contentType === "reel") {
        // ── 4 story-beat slides (Hook → Problem → Solution → CTA) in parallel ──
        const reelStyle = (jobEffectiveStyle as keyof typeof REEL_STYLES) in REEL_STYLES
          ? (jobEffectiveStyle as keyof typeof REEL_STYLES)
          : "photorealistic";
        const slideResults = await withTimeout(
          generateReelSlides(job.nicheContextShort, reelStyle, job.captionHook, jobTextStyle, effectiveCharacterDesc, enrichedSceneDesc, effectiveBusinessContext, job.userId ?? undefined, jobTagline, jobAccentColor, job.businessId, jobImageScene, jobOverlayFont, jobSignText, jobShowSig, jobLogoBuffer, job.caption, job.platform, jobOverlayFilter),
          IMAGE_TIMEOUT_MS * 4,
          `reel post ${job.postId}`
        );
        for (let v = 0; v < slideResults.length; v++) {
          const hookForSlide = slideResults[v].headline;
          await db.insert(imageVariantsTable).values({
            postId: job.postId,
            ...(job.userId != null ? { userId: job.userId } : {}),
            businessId: job.businessId ?? null,
            industryGroupSlug: industryGroupSlugByKey.get(jobKey) ?? null,
            subIndustrySlug: subIndustryToSlug(subIndustryByKey.get(jobKey) ?? null),
            country: countryByKey.get(jobKey) ?? null,
            variantIndex: v,
            imageData: slideResults[v].imageData,
            rawBackground: slideResults[v].rawBackground,
            ...(slideResults[v].originalRawBackground ? { originalRawBackground: slideResults[v].originalRawBackground } : {}),
            style: `${reelStyle}_reel_scene_${v + 1}`,
            prompt: `Reel Scene ${v + 1}: ${job.nicheContextShort}`,
            overlayLogoPosition: "top-right",
            overlayLogoColor: "blue",
            overlayCaptionHook: hookForSlide ?? null,
            overlayTextStyle: jobTextStyle,
            overlayTextPosition: "bottom",
            overlayTextSize: "medium",
            ...(jobOverlayFont ? { overlayFont: jobOverlayFont } : {}),
            ...(jobOverlayFilter !== "none" ? { overlayFilter: jobOverlayFilter } : {}),
          });
        }
      } else if (job.contentType === "story") {
        const storyLogoPosition = "top-right";
        const storyLogoColor = "blue";
        const storyTextStyle = jobTextStyle;
        const storyTextPosition = "bottom";
        const storyTextSize = "medium";
        const storyScene = (effectiveBusinessContext && !job.imageScene)
          ? `${effectiveBusinessContext} — ${BUSINESS_SHOT_ANGLES[sceneIdx % BUSINESS_SHOT_ANGLES.length]}`
          : enrichedSceneDesc;
        const result = await withTimeout(
          generatePostImage(
            job.nicheContextShort, "graphic", "reel", undefined, jobImageScene,
            storyLogoPosition, job.captionHook, storyLogoColor, storyTextStyle, storyTextPosition, storyTextSize,
            job.platform, effectiveCharacterDesc, storyScene, undefined, jobOverlayFilter, job.userId ?? undefined, jobTagline, jobAccentColor, job.businessId, undefined, jobSignText, jobShowSig, undefined, jobOverlayFont, jobLogoBuffer
          ),
          IMAGE_TIMEOUT_MS,
          `story post ${job.postId}`
        );
        await db.insert(imageVariantsTable).values({
          postId: job.postId,
          ...(job.userId != null ? { userId: job.userId } : {}),
          businessId: job.businessId ?? null,
          industryGroupSlug: industryGroupSlugByKey.get(jobKey) ?? null,
          subIndustrySlug: subIndustryToSlug(subIndustryByKey.get(jobKey) ?? null),
          country: countryByKey.get(jobKey) ?? null,
          variantIndex: 0,
          imageData: result.imageData,
          rawBackground: result.rawBackground,
          ...(result.originalRawBackground ? { originalRawBackground: result.originalRawBackground } : {}),
          style: "graphic",
          prompt: job.nicheContextShort,
          overlayLogoPosition: storyLogoPosition,
          overlayLogoColor: storyLogoColor,
          overlayCaptionHook: job.captionHook ?? null,
          overlayTextStyle: storyTextStyle,
          overlayTextPosition: storyTextPosition,
          overlayTextSize: storyTextSize,
          ...(jobOverlayFont ? { overlayFont: jobOverlayFont } : {}),
          ...(jobOverlayFilter !== "none" ? { overlayFilter: jobOverlayFilter } : {}),
        });
      } else {
        const variantStyles = [jobEffectiveStyle]; // 1 variante — aplica learned style default cuando corresponde
        const bulkLogoPosition = "top-right";
        const bulkLogoColor = "blue";
        const bulkTextStyle = jobTextStyle;
        const bulkTextPosition = "bottom";
        const bulkTextSize = "medium";
        const variantResults = await Promise.allSettled(
          variantStyles.map((vstyle, v) => {
            const variantScene = (effectiveBusinessContext && !job.imageScene)
              ? `${effectiveBusinessContext} — ${BUSINESS_SHOT_ANGLES[v % BUSINESS_SHOT_ANGLES.length]}`
              : enrichedSceneDesc;
            return withTimeout(
              generatePostImage(
                job.nicheContextShort, vstyle, job.contentType, undefined, jobImageScene,
                bulkLogoPosition, job.captionHook, bulkLogoColor, bulkTextStyle, bulkTextPosition, bulkTextSize,
                job.platform, effectiveCharacterDesc, variantScene, Boolean(effectiveBusinessContext && !jobImageScene), jobOverlayFilter, job.userId ?? undefined, jobTagline, jobAccentColor, job.businessId, undefined, jobSignText, jobShowSig, undefined, jobOverlayFont, jobLogoBuffer
              ),
              IMAGE_TIMEOUT_MS,
              `post ${job.postId} variant ${v}`
            );
          })
        );
        let successfulVariants = 0;
        for (let v = 0; v < variantStyles.length; v++) {
          const vr = variantResults[v];
          if (vr.status === "rejected") {
            const failMsg = vr.reason instanceof Error ? vr.reason.message : String(vr.reason);
            console.error(`[generateImagesForPostsBg] post ${job.postId} variant ${v} failed: ${failMsg}`);
            continue;
          }
          const result = vr.value;
          await db.insert(imageVariantsTable).values({
            postId: job.postId,
            ...(job.userId != null ? { userId: job.userId } : {}),
            businessId: job.businessId ?? null,
            industryGroupSlug: industryGroupSlugByKey.get(jobKey) ?? null,
            subIndustrySlug: subIndustryToSlug(subIndustryByKey.get(jobKey) ?? null),
            country: countryByKey.get(jobKey) ?? null,
            variantIndex: v,
            imageData: result.imageData,
            rawBackground: result.rawBackground,
            ...(result.originalRawBackground ? { originalRawBackground: result.originalRawBackground } : {}),
            style: variantStyles[v],
            prompt: job.nicheContextShort,
            overlayLogoPosition: bulkLogoPosition,
            overlayLogoColor: bulkLogoColor,
            overlayCaptionHook: job.captionHook ?? null,
            overlayTextStyle: bulkTextStyle,
            overlayTextPosition: bulkTextPosition,
            overlayTextSize: bulkTextSize,
            ...(jobOverlayFont ? { overlayFont: jobOverlayFont } : {}),
            ...(jobOverlayFilter !== "none" ? { overlayFilter: jobOverlayFilter } : {}),
          });
          successfulVariants++;
        }
        // If ALL variants failed, insert a single error sentinel so the frontend
        // shows "Generación interrumpida" immediately instead of waiting 4 min.
        // Also refund the credit — the user never received a usable image.
        if (successfulVariants === 0) {
          const reasons = variantResults
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map(r => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
            .join("; ");
          try {
            await db.insert(imageVariantsTable).values({
              postId: job.postId,
              ...(job.userId != null ? { userId: job.userId } : {}),
              businessId: job.businessId ?? null,
              industryGroupSlug: industryGroupSlugByKey.get(jobKey) ?? null,
              subIndustrySlug: subIndustryToSlug(subIndustryByKey.get(jobKey) ?? null),
              country: countryByKey.get(jobKey) ?? null,
              variantIndex: 0,
              imageData: "",
              generationStatus: "error",
              generationError: `All variants failed: ${reasons}`.slice(0, 500),
              style: "photorealistic",
            });
          } catch { /* non-fatal */ }
          // Refund credit and mark post so retry is free (awaited to avoid race with retry endpoint).
          // Skip refund when chargedCredits===false (free retry) — no credit was deducted for this run.
          try {
            if (job.chargedCredits !== false) {
              const refunded = await refundImageFailure(job.userId, job.contentType);
              if (refunded > 0) console.log(`[generateImagesForPostsBg] refunded ${refunded} credit(s) for post ${job.postId} (all variants failed)`);
            }
            await db.update(postsTable).set({ creditsRefunded: true }).where(drizzleSql`id = ${job.postId}`);
          } catch (refundErr) {
            console.error(`[generateImagesForPostsBg] refund failed for post ${job.postId}:`, refundErr);
          }
        } else {
          // At least one variant succeeded — ensure flag is clear (guards against stale state)
          await db.update(postsTable).set({ creditsRefunded: false }).where(drizzleSql`id = ${job.postId}`).catch(() => {});
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateImagesForPostsBg] post ${job.postId} (${job.contentType}/${job.platform}) failed: ${msg}`);
      // Insert an error variant so the frontend detects the failure immediately
      // (shows "Generación interrumpida" + "Reintentar imágenes" instead of waiting 4 min for polling timeout).
      try {
        await db.insert(imageVariantsTable).values({
          postId: job.postId,
          ...(job.userId != null ? { userId: job.userId } : {}),
          businessId: job.businessId ?? null,
          industryGroupSlug: industryGroupSlugByKey.get(makeJobKey(job.userId, job.businessId)) ?? null,
          subIndustrySlug: subIndustryToSlug(subIndustryByKey.get(makeJobKey(job.userId, job.businessId)) ?? null),
          country: countryByKey.get(makeJobKey(job.userId, job.businessId)) ?? null,
          variantIndex: 0,
          imageData: "",
          generationStatus: "error",
          generationError: msg.slice(0, 500),
          style: "photorealistic",
        });
      } catch { /* non-fatal — if this insert also fails the user sees "tardó demasiado" instead of "interrumpida" */ }
      // Refund credit — job-level failure means the user received no image at all (awaited to avoid race with retry endpoint).
      // Skip refund when chargedCredits===false (free retry) — no credit was deducted for this run.
      try {
        if (job.chargedCredits !== false) {
          const refunded = await refundImageFailure(job.userId, job.contentType);
          if (refunded > 0) console.log(`[generateImagesForPostsBg] refunded ${refunded} credit(s) for post ${job.postId} (job-level failure)`);
        }
        await db.update(postsTable).set({ creditsRefunded: true }).where(drizzleSql`id = ${job.postId}`);
      } catch (refundErr) {
        console.error(`[generateImagesForPostsBg] refund failed for post ${job.postId}:`, refundErr);
      }
    }
  };

  // ── Pool runner: keep up to CONCURRENCY workers active at all times ──────
  await new Promise<void>((resolve) => {
    const tryStartNext = () => {
      while (activeWorkers < CONCURRENCY && nextJobIdx < jobs.length) {
        const idx = nextJobIdx++;
        activeWorkers++;
        console.log(`[generateImagesForPostsBg] starting job ${idx + 1}/${jobs.length} (postId=${jobs[idx].postId}, active=${activeWorkers})`);
        processJob(idx).finally(() => {
          activeWorkers--;
          if (nextJobIdx < jobs.length) {
            tryStartNext();
          } else if (activeWorkers === 0) {
            resolve();
          }
        });
      }
      // Edge case: all jobs were already dispatched before first worker finished
      if (nextJobIdx >= jobs.length && activeWorkers === 0) resolve();
    };
    tryStartNext();
  });

  console.log(`[generateImagesForPostsBg] done — processed ${jobs.length} jobs`);
}

// ── Caption Addons helpers ────────────────────────────────────────────────────

/**
 * Loads all active caption addons for a user/business.
 * Call ONCE per generation run; pass the result to findAddonForNiche().
 */
async function loadCaptionAddons(userId?: number, businessId?: number): Promise<CaptionAddon[]> {
  if (businessId != null) {
    return db.select().from(captionAddonsTable)
      .where(and(eq(captionAddonsTable.active, true), eq(captionAddonsTable.businessId, businessId)));
  }
  if (userId != null) {
    return db.select().from(captionAddonsTable)
      .where(and(eq(captionAddonsTable.active, true), eq(captionAddonsTable.userId, userId)));
  }
  return [];
}

/**
 * Given the full list of active addons and a niche, find the best matching addon:
 *  1. Keyword match (first addon whose keywords appear in the niche topic string)
 *  2. Universal fallback (addon with empty keywords)
 * Returns null for virtual niches (id === -1) or when no match.
 */
function findAddonForNiche(
  addons: CaptionAddon[],
  niche: { id: number; name: string; description: string; keywords: string }
): CaptionAddon | null {
  if (niche.id === -1 || addons.length === 0) return null;
  const topicLower = `${niche.name} ${niche.description} ${niche.keywords}`.toLowerCase();
  const specific = addons.find(a =>
    a.keywords.trim() &&
    a.keywords.split(",").some(kw => topicLower.includes(kw.trim().toLowerCase()))
  );
  if (specific) return specific;
  return addons.find(a => !a.keywords.trim()) ?? null;
}

/**
 * Applies a caption addon to a raw AI-generated caption.
 * Returns the caption unchanged if no addon, or the combined caption.
 */
function applyAddon(aiCaption: string, addon: CaptionAddon | null): string {
  if (!addon?.text.trim()) return aiCaption;
  return addon.position === "before"
    ? `${addon.text.trim()}\n\n${aiCaption}`
    : `${aiCaption}\n\n${addon.text.trim()}`;
}

/**
 * Returns enriched nicheContext with addon hint so the AI generates
 * complementary content instead of duplicating the fixed text.
 */
function enrichContextWithAddon(nicheContext: string, addon: CaptionAddon | null): string {
  if (!addon?.text.trim()) return nicheContext;
  return `${nicheContext} Complementa (sin repetir) este texto fijo que acompañará el post: "${addon.text.trim()}".`;
}

/**
 * Returns the number of characters to reserve in the caption body for an addon.
 * Pass this as `addonReservedChars` to generateCaption so the AI generates
 * a body short enough to fit the addon without exceeding IG_CAPTION_BODY_LIMIT.
 *
 * Formula: addon text length + 4 chars for the "\n\n" separator.
 * Returns 0 when there is no addon (no space needs to be reserved).
 */
function calcAddonReservedChars(addon: CaptionAddon | null): number {
  const text = addon?.text.trim();
  return text ? text.length + 4 : 0;
}

// ── End Caption Addons helpers ────────────────────────────────────────────────

/**
 * Module-level ownership assertion for postsTable inserts.
 * Used by both generateBulkPosts and generateExtraPosts to enforce that every
 * post values object carries the same userId/businessId that was validated at
 * the top of the function (tenant isolation, defense against future refactors).
 *
 * Throws an Error (never returns silently) if a mismatch is detected.
 */
function assertPostInsertOwnership(
  values: { userId?: number | null; businessId?: number | null },
  site: string,
  expectedUserId: number | undefined,
  expectedBusinessId: number | undefined,
): void {
  // Fail-closed: if the expected ID is defined, the value must be present AND match.
  // A missing ID in the values object is treated as a mismatch, not a pass.
  if (expectedUserId != null) {
    if (values.userId == null || values.userId !== expectedUserId) {
      const msg = `[post-insert] OWNERSHIP MISMATCH at ${site}: values.userId=${values.userId ?? "MISSING"} !== validated userId=${expectedUserId} — refusing insert`;
      console.error(msg);
      throw new Error(msg);
    }
  }
  if (expectedBusinessId != null) {
    if (values.businessId == null || values.businessId !== expectedBusinessId) {
      const msg = `[post-insert] OWNERSHIP MISMATCH at ${site}: values.businessId=${values.businessId ?? "MISSING"} !== validated businessId=${expectedBusinessId} — refusing insert`;
      console.error(msg);
      throw new Error(msg);
    }
  }
}

/**
 * Phase 1: generates captions and creates posts in DB — returns in ~5-10s.
 * Images are generated separately in the background via generateImagesForPostsBg().
 */
export async function generateBulkPosts(
  days: number,
  nicheIds: number[],
  platform: string,
  contentTypes: string[] = ["image", "reel", "carousel"],
  customTopic?: string,
  startDate?: string,
  isAutomatic: boolean = false,
  userId?: number,
  businessId?: number,
  maxPosts?: number,
  creditsPreReserved = false,
  userTimezone: string = ADMIN_TZ,
): Promise<{ postIds: number[]; imageJobs: PostImageJob[]; stoppedByCredits: boolean; actualCreditsUsed: number }> {
  // ── TENANT ISOLATION ASSERTION ───────────────────────────────────────────────
  // Verify that the businessId, when provided, belongs to userId.
  // This is the last line of defense against cross-user contamination:
  // even if the caller passes a businessId from another tenant, we abort here.
  // The route-level ownership guard (posts.ts) catches it earlier for HTTP requests,
  // but this assertion also protects programmatic callers (e.g. future integrations).
  if (userId != null && businessId != null) {
    const [bizOwnerRow] = await db
      .select({ userId: businessesTable.userId })
      .from(businessesTable)
      .where(eq(businessesTable.id, businessId))
      .limit(1);
    if (!bizOwnerRow || bizOwnerRow.userId !== userId) {
      const msg = `[generateBulkPosts] TENANT ISOLATION ASSERTION FAILED: userId=${userId} does not own businessId=${businessId} (owner=${bizOwnerRow?.userId ?? "NOT FOUND"}) — aborting to prevent cross-user contamination`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  // ── Load user's publication plan (fresh on every call) ──────────────────────
  // fetchSchedulerSuggestions = fuente única de verdad (endpoint + scheduler compartido).
  // Incluye source="ai"|"default" para que pickHour aplique Regla 8/9.
  const ctSchedule = userId
    ? await fetchSchedulerSuggestions(userId, businessId)
    : DEFAULT_CT_SCHEDULE;
  // Derived backward-compat SCHEDULE (feedDays = union of all feed content type days)
  const localSCHEDULE = {
    instagram: {
      feedDays:  [...new Set([...(ctSchedule.instagram?.reel?.days ?? []), ...(ctSchedule.instagram?.image?.days ?? []), ...(ctSchedule.instagram?.carousel?.days ?? [])])].sort((a, b) => a - b),
      storyDays: ctSchedule.instagram?.story?.days ?? [],
    },
    tiktok: {
      feedDays:  [...new Set([...(ctSchedule.tiktok?.reel?.days ?? []), ...(ctSchedule.tiktok?.image?.days ?? []), ...(ctSchedule.tiktok?.carousel?.days ?? [])])].sort((a, b) => a - b),
      storyDays: ctSchedule.tiktok?.story?.days ?? [],
    },
  };

  const targetPlatforms = platform === "both" ? ["instagram", "tiktok"] : [platform];

  // Also track topics used IN THIS run (so a single run doesn't repeat a topic)
  const topicsUsedThisRun = new Set<string>();

  // Load business default location for niche context suffix (scoped per business/user)
  let bizLocationSuffix = "";
  if (businessId != null) {
    const biz = await db.select({ defaultLocation: businessesTable.defaultLocation })
      .from(businessesTable).where(eq(businessesTable.id, businessId)).limit(1).then(r => r[0]);
    if (biz?.defaultLocation) bizLocationSuffix = ` ${biz.defaultLocation}.`;
  }

  // Load caption addons ONCE for the whole run (efficiency: avoids N DB queries per post)
  const bulkAddons = await loadCaptionAddons(userId, businessId);

  // Load niches: scoped by businessId when available (multi-business isolation),
  // fallback to userId for solo/legacy users; fail-closed when both are null.
  if (userId == null && businessId == null) {
    logger.warn("[generateBulkPosts] fail-closed: userId and businessId are both null — refusing global niche fetch");
    return { postIds: [], imageJobs: [], stoppedByCredits: false, actualCreditsUsed: 0 };
  }
  const nicheCond = businessId != null
    ? and(eq(nichesTable.active, true), eq(nichesTable.businessId, businessId))
    : and(eq(nichesTable.active, true), eq(nichesTable.userId, userId!));
  let niches = await db.select().from(nichesTable).where(nicheCond);
  if (nicheIds.length > 0) {
    niches = niches.filter(n => nicheIds.includes(n.id));
  }

  if (niches.length === 0 && !customTopic?.trim()) {
    // No niches and no custom topic — abort. The caller stamped userId on posts,
    // so returning empty avoids generating content with wrong brand context.
    return { postIds: [], imageJobs: [], stoppedByCredits: false, actualCreditsUsed: 0 };
  }

  // If a custom topic is provided, distill any rich brief first, then add as virtual niche
  let bulkBriefImageScene: string | undefined;
  if (customTopic?.trim()) {
    const distilled = await distillStrategicBrief(customTopic);
    bulkBriefImageScene = distilled.imageScene;
    if (distilled.concept.length !== customTopic.trim().length) {
      console.log(`[generateBulkPosts] brief distilled (${customTopic.trim().length}→${distilled.concept.length} chars): "${distilled.concept.slice(0, 80)}..."${distilled.imageScene ? ` | imageScene: "${distilled.imageScene.slice(0, 60)}..."` : ""}`);
    }
    const sceneHint = distilled.imageScene
      ? ` El escenario visual del contenido es: ${distilled.imageScene}. Los textos deben ser coherentes con esa escena.`
      : "";
    const fullCtx = `${distilled.concept}${sceneHint}`;
    niches.push({
      id: -1,
      userId: null,
      businessId: null,
      name: distilled.concept.slice(0, 80),
      description: fullCtx,
      keywords: distilled.concept,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const postIds: number[] = [];
  const imageJobs: PostImageJob[] = [];
  let stoppedByCredits = false;
  let actualCreditsUsed = 0;

  // ── Diversity engine setup ───────────────────────────────────────────────
  const batchId = await createGenerationBatch(platform);
  // In-memory list of hooks generated IN THIS batch (combined across all platforms)
  // Prevents duplicates within the same generation run even before DB commit
  const batchHooks: string[] = [];

  // Build active niche window (max 7 niches) + weighted pool within that window.
  // High-performing niches (ER >= 3%) get guaranteed slots in the window.
  // Custom-topic niche (id = -1) is temporarily removed, window is built from real niches,
  // then the custom niche is re-appended at weight 1.
  const customNiche = niches.find(n => n.id === -1);
  const realNiches  = niches.filter(n => n.id !== -1);
  const { activeWindow, weightedPool: realWeightedPool } = isAutomatic
    ? await buildActiveNicheWindow(realNiches, userId, businessId)
    : { activeWindow: realNiches, weightedPool: await buildWeightedNichePool(realNiches, userId) };
  if (customNiche) realWeightedPool.push(customNiche);
  const nichePool = realWeightedPool.length > 0 ? realWeightedPool : niches;

  // Topic gap uses TOTAL eligible niche count (not the active window, which is capped at 7).
  // This allows users with 15+ niches to get the full MAX_GAP=15 repetition protection.
  const TOPIC_GAP_DAYS = isAutomatic ? await getAdaptiveTopicGapDays(userId, realNiches.length) : 7;
  const recentAutoTopics = isAutomatic ? await getRecentAutoTopics(TOPIC_GAP_DAYS, userId, businessId) : new Set<string>();

  let nicheIndex = 0;

  // ── Shared window (same for all platforms) ──────────────────────────────
  // TIMEZONE-AWARE: windowStart y windowEnd se calculan en el timezone del usuario,
  // no en UTC. Esto evita que posts programados a las 8 PM local (= después de las
  // 23:00 UTC para Bogotá) queden fuera de la ventana y sean duplicados.
  const refNow = startDate
    ? (() => { const [y, m, d] = startDate.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); })()
    : new Date();
  const windowStart = startOfDayInTimezone(refNow, userTimezone);
  // windowEnd — DST-safe: igual que checkDailyGapsAndFill, avanzamos +25h entre días
  // para que nunca caigamos en la misma medianoche local en días de "fall-back" (DST −1h).
  // Iteramos (days+1) veces: days para cubrir el período de generación + 1 día extra
  // para que el mapa de ocupación vea posts existentes del día siguiente (comportamiento original).
  let _wEnd = windowStart;
  for (let _i = 0; _i <= days; _i++) {
    _wEnd = startOfDayInTimezone(new Date(_wEnd.getTime() + 25 * 3_600_000), userTimezone);
  }
  const windowEnd = new Date(_wEnd.getTime() - 1);

  // ── Per-platform generation ──────────────────────────────────────────────
  // When platform === "both": create ONE unified post per content slot with
  // scheduledAtInstagram (IG strategy day) and scheduledAtTiktok (TK strategy day).
  // When platform is single: original per-platform loop (unchanged).

  if (platform === "both") {
    // ── UNIFIED "BOTH" MODE ─────────────────────────────────────────────────
    const bulkBothUserCond = userId != null
      ? (businessId != null
          ? and(eq(postsTable.userId, userId), eq(postsTable.businessId, businessId))
          : eq(postsTable.userId, userId))
      : undefined;

    // Una sola query unificada para todas las plataformas en la ventana.
    // buildOccupationMap filtra por plataforma internamente usando getEffectiveDateForPlatform,
    // garantizando que posts con platform="both" sin fecha específica no queden invisibles.
    const existingAllRaw = await db
      .select({
        scheduledAt:          postsTable.scheduledAt,
        scheduledAtInstagram: postsTable.scheduledAtInstagram,
        scheduledAtTiktok:    postsTable.scheduledAtTiktok,
        platform:             postsTable.platform,
        contentType:          postsTable.contentType,
      })
      .from(postsTable)
      .where(and(
        or(eq(postsTable.platform, "instagram"), eq(postsTable.platform, "tiktok"), eq(postsTable.platform, "both")),
        inArray(postsTable.status, ["draft", "pending_approval", "approved", "scheduled", "published"]),
        or(
          and(gte(postsTable.scheduledAt, windowStart), lte(postsTable.scheduledAt, windowEnd)),
          and(isNotNull(postsTable.scheduledAtInstagram), gte(postsTable.scheduledAtInstagram, windowStart), lte(postsTable.scheduledAtInstagram, windowEnd)),
          and(isNotNull(postsTable.scheduledAtTiktok), gte(postsTable.scheduledAtTiktok, windowStart), lte(postsTable.scheduledAtTiktok, windowEnd)),
        ),
        bulkBothUserCond,
      ));

    // Mapas de ocupación centralizados — un buildOccupationMap por plataforma.
    // getEffectiveDateForPlatform resuelve: scheduledAtInstagram ?? scheduledAt (IG)
    //                                       scheduledAtTiktok    ?? scheduledAt (TK)
    const { byType: igExistByType, story: igExistStory } = buildOccupationMap(existingAllRaw, "instagram", userTimezone);
    const { byType: tkExistByType, story: tkExistStory } = buildOccupationMap(existingAllRaw, "tiktok", userTimezone);

    // In-run occupation trackers (prevent double-booking within this run)
    const igInRunByType = new Map<string, Set<string>>();
    const tkInRunByType = new Map<string, Set<string>>();
    const igInRunStory = new Set<string>();
    const tkInRunStory = new Set<string>();

    // Per-day hour trackers — prevent two posts from getting the same hour
    // on the same day/platform even when they have different content types.
    const igUsedHoursPerDay = new Map<string, Set<number>>();
    const tkUsedHoursPerDay = new Map<string, Set<number>>();

    // Helper: find the NEXT available strategy day for platform + contentType.
    // Uses validDaysOverride when provided (Regla 11 pre-filter), otherwise falls back to
    // ctSchedule[platform][ct].days (the user's live plan).
    // Skips occupied days (existing + in-run) and today's already-passed hours.
    // usedHoursPerDay tracks hours already assigned this run per day so two CTs on the same
    // day never receive the same hour — resolves to the next free pool slot or skips the day.
    const findNextDay = (
      platform: string,
      existByType: Map<string, Set<string>>,
      existStory: Set<string>,
      inRunByType: Map<string, Set<string>>,
      inRunStory: Set<string>,
      ct: string,
      usedHoursPerDay: Map<string, Set<number>>,
      validDaysOverride?: Set<number>,
    ): { date: Date; dayKey: string; utcDate: Date } | null => {
      const ctSched  = ctSchedule[platform]?.[ct];
      const slotDays = validDaysOverride
        ? [...validDaysOverride]
        : (ctSched?.days ?? (ct === "story" ? localSCHEDULE[platform as keyof typeof localSCHEDULE]?.storyDays : localSCHEDULE[platform as keyof typeof localSCHEDULE]?.feedDays) ?? []);
      const usedSet   = ct === "story" ? inRunStory : (inRunByType.get(ct) ?? new Set<string>());
      const usedCount = usedSet.size;
      const today = windowStart; // timezone-aware midnight (en timezone del usuario)
      const hourPool: number[] = ctSched?.hours ?? (ct === "story"
        ? (platform === "tiktok" ? TK_STORY_BOGOTA_HOURS : IG_STORY_BOGOTA_HOURS)
        : (platform === "tiktok" ? TK_FEED_BOGOTA_HOURS  : IG_FEED_BOGOTA_HOURS));
      for (let off = 0; off < days + 30; off++) {
        const d = new Date(windowStart);
        d.setDate(windowStart.getDate() + off);
        const dow    = d.getDay();
        if (!slotDays.includes(dow)) continue;
        const dayKey  = dayKeyForTimezone(new Date(d.getTime() + 12 * 3600000), userTimezone);
        if (ct === "story") {
          if (existStory.has(dayKey) || inRunStory.has(dayKey)) continue;
        } else {
          if (existByType.get(ct)?.has(dayKey) || inRunByType.get(ct)?.has(dayKey)) continue;
        }
        const isToday = d.toDateString() === today.toDateString();
        let bogotaHour = pickHour(platform, ct, usedCount, isToday, ctSchedule, userTimezone);
        if (bogotaHour === -1) continue; // all of today's hours have passed
        const takenHours = usedHoursPerDay.get(dayKey);
        if (takenHours?.has(bogotaHour)) {
          const nowLocal = isToday ? currentHourInTz(userTimezone) : -1;
          const alt = hourPool.find(h => !takenHours.has(h) && (!isToday || h > nowLocal));
          if (alt !== undefined) bogotaHour = alt; // spread when possible; if no alt, accept collision
        }
        if (!usedHoursPerDay.has(dayKey)) usedHoursPerDay.set(dayKey, new Set());
        usedHoursPerDay.get(dayKey)!.add(bogotaHour);
        return { date: d, dayKey, utcDate: localHourToUTC(d, bogotaHour, userTimezone) };
      }
      return null;
    };

    // ── FEED posts (unified "both") — day-by-day to respect per-type schedule ─
    // Iterate every day in the window. For each day, check WHAT content type
    // is scheduled on Instagram for that day — then generate it. This mirrors
    // the single-platform loop and guarantees every scheduled day gets its
    // correct format (no day skipped, no wrong type generated).

    // ── Regla 11: pre-filtro de días (getWeeklySlots) ─────────────────────────
    // Restricción ANTES del loop: solo los primeros weeklyTarget.min/max días del pool
    // son válidos para generar contenido. Elimina la necesidad de contadores post-hoc.
    const feedCts = contentTypes.filter(ct => ct !== "story");
    const igValidDaysByType = new Map<string, Set<number>>();
    const tkValidDaysByType = new Map<string, Set<number>>();
    for (const ct of feedCts) {
      igValidDaysByType.set(ct, getWeeklySlots(ctSchedule, "instagram", ct));
      tkValidDaysByType.set(ct, getWeeklySlots(ctSchedule, "tiktok", ct));
    }
    const igStoryValidDays = getWeeklySlots(ctSchedule, "instagram", "story");
    const tkStoryValidDays = getWeeklySlots(ctSchedule, "tiktok", "story");
    if (feedCts.length > 0) {
      let feedSlot = 0;
      for (let dayOffset = 0; dayOffset < days; dayOffset++) {
        const currentDate = new Date(windowStart);
        currentDate.setDate(windowStart.getDate() + dayOffset);
        const dow = currentDate.getDay();
        const dayKey = dayKeyForTimezone(new Date(currentDate.getTime() + 12 * 3600000), userTimezone);
        const isToday = dayOffset === 0 && !startDate;

        for (const contentType of feedCts) {
          // Regla 11 pre-filtro: solo días en validDays para este tipo (primeros N del pool)
          if (!igValidDaysByType.get(contentType)?.has(dow)) continue;
          if (igExistByType.get(contentType)?.has(dayKey)) continue;  // Guard IA: max 1 post del mismo tipo por día (en DB). Tipos distintos el mismo día son válidos (Regla 2).
          if (igInRunByType.get(contentType)?.has(dayKey)) continue;  // Guard IA: max 1 post del mismo tipo por día (en esta ejecución). Tipos distintos el mismo día son válidos (Regla 2).

          let igBogotaHour = pickHour("instagram", contentType, feedSlot, isToday, ctSchedule, userTimezone);
          if (igBogotaHour === -1) continue; // all hours passed today

          // Resolve IG hour collision: if this hour is already taken for this day, find next free slot
          const igTakenHours = igUsedHoursPerDay.get(dayKey);
          if (igTakenHours?.has(igBogotaHour)) {
            const igPool: number[] = ctSchedule.instagram?.[contentType]?.hours ?? IG_FEED_BOGOTA_HOURS;
            const nowLocal = isToday ? currentHourInTz(userTimezone) : -1;
            const alt = igPool.find(h => !igTakenHours.has(h) && (!isToday || h > nowLocal));
            if (alt !== undefined) igBogotaHour = alt; // spread when possible; if no alt, accept collision
          }
          if (!igUsedHoursPerDay.has(dayKey)) igUsedHoursPerDay.set(dayKey, new Set());
          igUsedHoursPerDay.get(dayKey)!.add(igBogotaHour);

          const igUtcDate = localHourToUTC(currentDate, igBogotaHour, userTimezone);

          // Find TK slot: next available TK day para este content type
          // Regla 11: pasar validDaysOverride para respetar el límite semanal de TikTok
          const tkSlot = findNextDay("tiktok", tkExistByType, tkExistStory, tkInRunByType, tkInRunStory, contentType, tkUsedHoursPerDay, tkValidDaysByType.get(contentType));

          // Mark occupied BEFORE generating (prevents double-booking in next iteration)
          if (!igInRunByType.has(contentType)) igInRunByType.set(contentType, new Set());
          igInRunByType.get(contentType)!.add(dayKey);
          if (tkSlot) {
            if (!tkInRunByType.has(contentType)) tkInRunByType.set(contentType, new Set());
            tkInRunByType.get(contentType)!.add(tkSlot.dayKey);
          }

          const slideCount = contentType === "carousel" ? 4 : contentType === "reel" ? 4 : 1;
          const canonicalDate = igUtcDate;
          // Rename slot counter to avoid conflict with old variable name used below
          const slotIdx = feedSlot;
          feedSlot++;

        // ── Niche + topic diversity ───────────────────────────────────────
        // Rotation rule: skip a niche if it was used within the gap period OR already
        // used in this run. The active window (≤7 niches) + adaptive gap ensures
        // organic weekly rotation without the old "max 2/month" constraint.
        let niche = nichePool[nicheIndex % nichePool.length];
        if (isAutomatic && niches.length > 1) {
          let attempts = 0;
          while (attempts < nichePool.length - 1) {
            if (recentAutoTopics.has(niche.name) || topicsUsedThisRun.has(niche.name)) {
              nicheIndex++; attempts++; niche = nichePool[nicheIndex % nichePool.length];
            } else break;
          }
        }
        nicheIndex++;
        const nicheContext = niche.id === -1
          ? niche.description
          : `${niche.name}: ${niche.description}. Palabras clave: ${niche.keywords}.`;
        const nicheAddon = findAddonForNiche(bulkAddons, niche);
        const nicheAddonChars = calcAddonReservedChars(nicheAddon);
        const effectiveCtx = enrichContextWithAddon(nicheContext, nicheAddon);

        // ── Max-posts guard ────────────────────────────────────────────────
        if (maxPosts !== undefined && postIds.length >= maxPosts) {
          stoppedByCredits = true;
          break;
        }

        // ── 1. Credit guard (both-feed) ───────────────────────────────────────
        // auto/scheduler (creditsPreReserved=false): durable ledger pattern:
        //   TX1: deductCredits + INSERT pending ledger row → ledgerId
        //   AI call (outside TX — no lock held)
        //   TX2: UPDATE ledger row 'settled' + INSERT post (atomic)
        // bulk/extra (creditsPreReserved=true): credits reserved upfront in posts.ts.
        let bothFeedLedgerId: number | undefined;
        if (!creditsPreReserved && userId != null) {
          try {
            bothFeedLedgerId = await db.transaction(async tx =>
              deductAndCreateLedger(tx, userId, contentType)
            );
          } catch (err: unknown) {
            const e = err as { code?: string };
            if (e?.code === "INSUFFICIENT_CREDITS") { stoppedByCredits = true; break; }
            throw err;
          }
        }

        // ── 2. Caption generation (AI call — no TX open) ─────────────────────
        // auto/scheduler: credits deducted + ledger entry created before AI call.
        // bulk/extra: reservation confirmed before AI call.
        // If AI fails: ledger row stays 'pending' → reconciliation job refunds.
        const recentHooks = await getRecentHooks("instagram", userId, businessId);
        const allUsedHooks = [...recentHooks, ...batchHooks];
        // Rotate hook style per post for carousels — prevents structural format repetition
        const hookStyleHint = contentType === "carousel"
          ? CAROUSEL_HOOK_STYLES[batchHooks.length % CAROUSEL_HOOK_STYLES.length]
          : undefined;
        let captionResult: Awaited<ReturnType<typeof generateCaption>>;
        let captionHookDraft = "";
        // Pass last 15 used hooks on first attempt so AI knows what formats to avoid from the start
        captionResult = await generateCaption(effectiveCtx, "instagram", contentType, allUsedHooks.slice(-15), userId, undefined, businessId, hookStyleHint, nicheAddonChars);
        captionHookDraft = extractCaptionHook(captionResult.caption);
        if (isTooSimilar(captionHookDraft, allUsedHooks)) {
          const avoidList = getMostSimilarHooks(captionHookDraft, allUsedHooks, 8);
          captionResult = await generateCaption(effectiveCtx, "instagram", contentType, avoidList, userId, undefined, businessId, hookStyleHint, nicheAddonChars);
          captionHookDraft = extractCaptionHook(captionResult.caption);
          if (isTooSimilar(captionHookDraft, allUsedHooks)) {
            const allSimilar = getMostSimilarHooks(captionHookDraft, allUsedHooks, 12);
            captionResult = await generateCaption(`${effectiveCtx} — usa un ÁNGULO COMPLETAMENTE DIFERENTE`, "instagram", contentType, allSimilar, userId, undefined, businessId, hookStyleHint, nicheAddonChars);
            captionHookDraft = extractCaptionHook(captionResult.caption);
          }
        }
        batchHooks.push(captionHookDraft);
        const topicKeyForHistory = isAutomatic ? niche.name : undefined;
        void recordCaptionHistory(batchId, "both", captionHookDraft, contentType, undefined, topicKeyForHistory, userId, businessId);
        if (isAutomatic) topicsUsedThisRun.add(niche.name);
        const { caption: aiCaption1, hashtags, hashtagsTiktok } = { ...captionResult };
        const caption = applyAddon(aiCaption1, nicheAddon);

        // ── 3. Insert post (+ settle ledger atomically for auto/scheduler) ───
        // auto/scheduler: TX2 atomically settles the ledger entry + inserts post.
        //   If insert fails → TX rolls back → ledger stays 'pending' → reconciliation refunds.
        // bulk/extra: direct insert (credits already reserved upfront).
        let post: typeof postsTable.$inferSelect | undefined;
        const bothFeedPostValues = {
          nicheId: niche.id > 0 ? niche.id : null,
          platform: "both" as const,
          contentType,
          slideCount,
          caption,
          aiCaptionOriginal: aiCaption1,
          hashtags,
          hashtagsTiktok: hashtagsTiktok ?? "",
          status: "pending_approval" as const,
          scheduledAt: canonicalDate,
          scheduledAtInstagram: igUtcDate,
          generationCostUsd: totalGenerationCostUsd(contentType, slideCount, captionResult.costUsd ?? 0),
          ...(tkSlot ? { scheduledAtTiktok: tkSlot.utcDate } : {}),
          ...(userId != null ? { userId } : {}),
          ...(businessId != null ? { businessId } : {}),
        } as const;
        assertPostInsertOwnership(bothFeedPostValues, "bothFeed", userId, businessId);
        if (bothFeedLedgerId != null) {
          // auto/scheduler: atomic TX — settle ledger + insert post together
          const [inserted] = await db.transaction(async tx => {
            const rows = await tx.insert(postsTable).values(bothFeedPostValues).returning();
            await settleLedger(tx, bothFeedLedgerId!, rows[0].id);
            return rows;
          });
          post = inserted;
        } else {
          // bulk/extra (creditsPreReserved): direct insert
          const [inserted] = await db.insert(postsTable).values(bothFeedPostValues).returning();
          post = inserted;
        }

        if (post) {
          const nicheContextShort = niche.id === -1
            ? niche.keywords
            : `${niche.name} - ${niche.keywords}`;
          postIds.push(post.id);
          const costs = await getCreditCosts();
          actualCreditsUsed += creditCostOf(contentType, costs);
          imageJobs.push({
            postId: post.id,
            userId: userId ?? undefined,
            businessId: businessId ?? undefined,
            nicheContextShort,
            captionHook: captionHookDraft,
            caption,
            contentType,
            styleIdx: slotIdx,
            slideCount,
            platform: "both",
            imageScene: niche.id === -1 ? bulkBriefImageScene : undefined,
          });
        }
        }  // closes for (contentType of feedCts)
      }    // closes for (dayOffset)
    }      // closes if (feedCts.length > 0)

    // ── STORY posts (unified "both" stories — published on both platforms) ──
    if (contentTypes.includes("story")) {
      let storySlotIdx = 0;
      while (storySlotIdx < days) {
        // Regla 11 pre-filtro: findNextDay usa solo los días válidos del pool (primeros N)
        const igStory = findNextDay("instagram", igExistByType, igExistStory, igInRunByType, igInRunStory, "story", igUsedHoursPerDay, igStoryValidDays);
        const tkStory = findNextDay("tiktok",    tkExistByType, tkExistStory, tkInRunByType, tkInRunStory, "story", tkUsedHoursPerDay, tkStoryValidDays);
        if (!igStory && !tkStory) break;

        if (igStory) igInRunStory.add(igStory.dayKey);
        if (tkStory) tkInRunStory.add(tkStory.dayKey);

        const canonicalStory = igStory?.utcDate ?? tkStory!.utcDate;

        let storyNiche = nichePool[nicheIndex % nichePool.length];
        if (isAutomatic && niches.length > 1) {
          let attempts = 0;
          while (attempts < nichePool.length - 1) {
            if (recentAutoTopics.has(storyNiche.name) || topicsUsedThisRun.has(storyNiche.name)) {
              nicheIndex++; attempts++; storyNiche = nichePool[nicheIndex % nichePool.length];
            } else break;
          }
        }
        nicheIndex++;
        const niche = storyNiche;
        const nicheContext = niche.id === -1
          ? niche.description
          : `${niche.name}: ${niche.description}. Palabras clave: ${niche.keywords}.${bizLocationSuffix}`;
        const storyAddon = findAddonForNiche(bulkAddons, niche);
        const storyAddonChars = calcAddonReservedChars(storyAddon);
        const effectiveStoryCtx = enrichContextWithAddon(nicheContext, storyAddon);

        // ── Max-posts guard ────────────────────────────────────────────────
        if (maxPosts !== undefined && postIds.length >= maxPosts) {
          stoppedByCredits = true;
          break;
        }

        // ── 1. Credit guard (both-story) — durable ledger ────────────────────
        let bothStoryLedgerId: number | undefined;
        if (!creditsPreReserved && userId != null) {
          try {
            bothStoryLedgerId = await db.transaction(async tx =>
              deductAndCreateLedger(tx, userId, "story")
            );
          } catch (err: unknown) {
            const e = err as { code?: string };
            if (e?.code === "INSUFFICIENT_CREDITS") { stoppedByCredits = true; break; }
            throw err;
          }
        }

        // ── 2. Story caption (AI call — no TX open) ───────────────────────────
        const storyRecentHooks = await getRecentHooks("instagram", userId, businessId);
        const storyAllHooks = [...storyRecentHooks, ...batchHooks];
        let storyResult: Awaited<ReturnType<typeof generateCaption>>;
        let storyHookDraft = "";
        storyResult = await generateCaption(effectiveStoryCtx, "instagram", "story", undefined, userId, undefined, businessId, undefined, storyAddonChars);
        storyHookDraft = extractCaptionHook(storyResult.caption);
        if (isTooSimilar(storyHookDraft, storyAllHooks)) {
          const avoidList = getMostSimilarHooks(storyHookDraft, storyAllHooks, 6);
          storyResult = await generateCaption(effectiveStoryCtx, "instagram", "story", avoidList, userId, undefined, businessId, undefined, storyAddonChars);
          storyHookDraft = extractCaptionHook(storyResult.caption);
        }
        batchHooks.push(storyHookDraft);
        const storyTopicKey = isAutomatic ? niche.name : undefined;
        void recordCaptionHistory(batchId, "both", storyHookDraft, "story", undefined, storyTopicKey, userId, businessId);
        if (isAutomatic) topicsUsedThisRun.add(niche.name);
        const storyCaption = applyAddon(storyResult.caption, storyAddon);

        // ── 3. Insert post + settle ledger (both-story) ───────────────────────
        let storyPost: typeof postsTable.$inferSelect | undefined;
        const bothStoryPostValues = {
          nicheId: niche.id > 0 ? niche.id : null,
          platform: "both" as const,
          contentType: "story" as const,
          slideCount: 1,
          caption: storyCaption,
          aiCaptionOriginal: storyResult.caption,
          hashtags: "",
          hashtagsTiktok: "",
          status: "pending_approval" as const,
          scheduledAt: canonicalStory,
          generationCostUsd: totalGenerationCostUsd("story", 1, storyResult.costUsd ?? 0),
          ...(igStory ? { scheduledAtInstagram: igStory.utcDate } : {}),
          ...(tkStory ? { scheduledAtTiktok:    tkStory.utcDate } : {}),
          ...(userId != null ? { userId } : {}),
          ...(businessId != null ? { businessId } : {}),
        } as const;
        assertPostInsertOwnership(bothStoryPostValues, "bothStory", userId, businessId);
        if (bothStoryLedgerId != null) {
          const [inserted] = await db.transaction(async tx => {
            const rows = await tx.insert(postsTable).values(bothStoryPostValues).returning();
            await settleLedger(tx, bothStoryLedgerId!, rows[0].id);
            return rows;
          });
          storyPost = inserted;
        } else {
          const [inserted] = await db.insert(postsTable).values(bothStoryPostValues).returning();
          storyPost = inserted;
        }

        if (storyPost) {
          const storyNicheShort = `${niche.name} - story`;
          postIds.push(storyPost.id);
          const costs = await getCreditCosts();
          actualCreditsUsed += creditCostOf("story", costs);
          imageJobs.push({
            postId: storyPost.id,
            userId: userId ?? undefined,
            businessId: businessId ?? undefined,
            nicheContextShort: storyNicheShort,
            captionHook: storyHookDraft,
            contentType: "story",
            styleIdx: storySlotIdx,
            slideCount: 1,
            platform: "both",
            imageScene: niche.id === -1 ? bulkBriefImageScene : undefined,
          });
        }

        storySlotIdx++;
      }
    }
  } else {
  // ── SINGLE-PLATFORM generation (original loop — unchanged) ───────────────
  for (const currentPlatform of targetPlatforms) {
    const sched = localSCHEDULE[currentPlatform as keyof typeof localSCHEDULE] ?? localSCHEDULE.instagram;

    // Fetch existing posts for THIS platform in the window — scoped to owner (admin/scheduler: undefined → global)
    // Use OR to also check the platform-specific scheduled date: for 'both' posts,
    // scheduledAt = IG canonical date, so a TK post may have scheduledAt outside window
    // but scheduledAtTiktok inside it — without OR we'd miss it and double-book the day.
    const bulkUserCond = userId != null
      ? (businessId != null
          ? and(eq(postsTable.userId, userId), eq(postsTable.businessId, businessId))
          : eq(postsTable.userId, userId))
      : undefined;
    const platformDateCol = currentPlatform === "tiktok" ? postsTable.scheduledAtTiktok : postsTable.scheduledAtInstagram;
    const existingPosts = await db
      .select({ scheduledAt: postsTable.scheduledAt, scheduledAtInstagram: postsTable.scheduledAtInstagram, scheduledAtTiktok: postsTable.scheduledAtTiktok, contentType: postsTable.contentType, platform: postsTable.platform })
      .from(postsTable)
      .where(and(
        or(eq(postsTable.platform, currentPlatform), eq(postsTable.platform, "both")),
        inArray(postsTable.status, ["draft", "pending_approval", "approved", "scheduled", "published"]),
        or(
          and(gte(postsTable.scheduledAt, windowStart), lte(postsTable.scheduledAt, windowEnd)),
          and(isNotNull(platformDateCol), gte(platformDateCol, windowStart), lte(platformDateCol, windowEnd)),
        ),
        bulkUserCond,
      ));

    // Mapa centralizado de días ocupados por tipo — buildOccupationMap usa
    // getEffectiveDateForPlatform internamente para resolver la fecha correcta
    // por plataforma (scheduledAtX ?? scheduledAt), incluyendo posts platform="both".
    const { byType: existingByType, story: existingStoryDays } =
      buildOccupationMap(existingPosts, currentPlatform, userTimezone);

    let feedSlot  = 0;
    let storySlot = 0;
    // Per-day hour tracker for single-platform runs — same purpose as igUsedHoursPerDay above
    const spUsedHoursPerDay = new Map<string, Set<number>>();

    // ── Regla 11: pre-filtro de días (getWeeklySlots) — single-platform ────────
    // Calcula UNA VEZ qué días son válidos por tipo. Reemplaza contadores post-hoc.
    const spFeedCts = contentTypes.filter(ct => ct !== "story");
    const spValidDaysByType = new Map<string, Set<number>>();
    for (const ct of spFeedCts) spValidDaysByType.set(ct, getWeeklySlots(ctSchedule, currentPlatform, ct));
    const spStoryValidDays = getWeeklySlots(ctSchedule, currentPlatform, "story");

    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const currentDate = new Date(windowStart);
      currentDate.setDate(windowStart.getDate() + dayOffset);
      const dow = currentDate.getDay();
      // dayKey usa el mediodía del día actual (12h UTC) para que dayKeyForTimezone
      // devuelva el día correcto en la zona del usuario sin importar la zona del servidor
      const dayKey = dayKeyForTimezone(new Date(currentDate.getTime() + 12 * 60 * 60 * 1000), userTimezone);

      // --- FEED posts: one per content type that's scheduled for this exact day ---
      // Each type (reel, image, carousel) has its OWN days in ctSchedule (user's live plan).
      // We iterate through all requested types and create only those that belong here.
      for (const contentType of spFeedCts) {
        // Regla 11 pre-filtro: solo días válidos del pool (primeros weeklyTarget.min/max días)
        if (!spValidDaysByType.get(contentType)?.has(dow)) continue;
        if (existingByType.get(contentType)?.has(dayKey)) continue; // Guard IA: max 1 post del mismo tipo por día. Tipos distintos el mismo día son válidos (Regla 2).
        {
        const slideCount = contentType === "carousel" ? 4 : contentType === "reel" ? 4 : 1;
        const isToday    = dayOffset === 0 && !startDate;
        let bogotaHour = pickHour(currentPlatform, contentType, feedSlot, isToday, ctSchedule, userTimezone);
        if (bogotaHour === -1) continue; // all of today's hours have passed
        // Resolve hour collision across content types on the same day
        const spTakenHours = spUsedHoursPerDay.get(dayKey);
        if (spTakenHours?.has(bogotaHour)) {
          const spPool: number[] = ctSched?.hours ?? (currentPlatform === "tiktok" ? TK_FEED_BOGOTA_HOURS : IG_FEED_BOGOTA_HOURS);
          const nowLocal = isToday ? currentHourInTz(userTimezone) : -1;
          const alt = spPool.find(h => !spTakenHours.has(h) && (!isToday || h > nowLocal));
          if (alt !== undefined) bogotaHour = alt; // spread when possible; if no alt, accept collision
        }
        if (!spUsedHoursPerDay.has(dayKey)) spUsedHoursPerDay.set(dayKey, new Set());
        spUsedHoursPerDay.get(dayKey)!.add(bogotaHour);
        feedSlot++;

        const scheduledDate = localHourToUTC(currentDate, bogotaHour, userTimezone);

        // ── Niche diversity: adaptive gap + active window (max 7 niches) ──
        let niche = nichePool[nicheIndex % nichePool.length];
        if (isAutomatic && niches.length > 1) {
          let attempts = 0;
          while (attempts < nichePool.length - 1) {
            if (recentAutoTopics.has(niche.name) || topicsUsedThisRun.has(niche.name)) {
              nicheIndex++; attempts++; niche = nichePool[nicheIndex % nichePool.length];
            } else break;
          }
        }
        nicheIndex++;

        const nicheContext = niche.id === -1
          ? niche.description
          : `${niche.name}: ${niche.description}. Palabras clave: ${niche.keywords}.`;
        const spNicheAddon = findAddonForNiche(bulkAddons, niche);
        const spNicheAddonChars = calcAddonReservedChars(spNicheAddon);
        const effectiveSpCtx = enrichContextWithAddon(nicheContext, spNicheAddon);

        // ── Max-posts guard ────────────────────────────────────────────────
        if (maxPosts !== undefined && postIds.length >= maxPosts) {
          stoppedByCredits = true;
          break;
        }

        // ── 1. Credit guard (SP-feed) — durable ledger ───────────────────────
        let spFeedLedgerId: number | undefined;
        if (!creditsPreReserved && userId != null) {
          try {
            spFeedLedgerId = await db.transaction(async tx =>
              deductAndCreateLedger(tx, userId, contentType)
            );
          } catch (err: unknown) {
            const e = err as { code?: string };
            if (e?.code === "INSUFFICIENT_CREDITS") { stoppedByCredits = true; break; }
            throw err;
          }
        }

        // ── 2. Caption generation (AI call — no TX open) ─────────────────────
        const recentHooks = await getRecentHooks(currentPlatform, userId, businessId);
        const allUsedHooks = [...recentHooks, ...batchHooks];
        const hookStyleHint = contentType === "carousel"
          ? CAROUSEL_HOOK_STYLES[batchHooks.length % CAROUSEL_HOOK_STYLES.length]
          : undefined;
        let captionResult: Awaited<ReturnType<typeof generateCaption>>;
        let captionHookDraft = "";
        captionResult = await generateCaption(effectiveSpCtx, currentPlatform, contentType,
          allUsedHooks.slice(-15), userId, undefined, businessId, hookStyleHint, spNicheAddonChars);
        captionHookDraft = extractCaptionHook(captionResult.caption);
        if (isTooSimilar(captionHookDraft, allUsedHooks)) {
          const avoidList = getMostSimilarHooks(captionHookDraft, allUsedHooks, 8);
          captionResult = await generateCaption(effectiveSpCtx, currentPlatform, contentType, avoidList, userId, undefined, businessId, hookStyleHint, spNicheAddonChars);
          captionHookDraft = extractCaptionHook(captionResult.caption);
          if (isTooSimilar(captionHookDraft, allUsedHooks)) {
            const allSimilar = getMostSimilarHooks(captionHookDraft, allUsedHooks, 12);
            captionResult = await generateCaption(
              `${effectiveSpCtx} — usa un ÁNGULO COMPLETAMENTE DIFERENTE, perspectiva nueva, personaje distinto`,
              currentPlatform, contentType, allSimilar, userId, undefined, businessId, hookStyleHint, spNicheAddonChars
            );
            captionHookDraft = extractCaptionHook(captionResult.caption);
          }
        }
        batchHooks.push(captionHookDraft);
        const topicKeyForHistory = isAutomatic ? niche.name : undefined;
        void recordCaptionHistory(batchId, currentPlatform, captionHookDraft, contentType, undefined, topicKeyForHistory, userId, businessId);
        if (isAutomatic) topicsUsedThisRun.add(niche.name);
        const { caption: aiCaption2, hashtags, hashtagsTiktok } = { ...captionResult };
        const caption = applyAddon(aiCaption2, spNicheAddon);

        // ── 3. Insert post + settle ledger (SP-feed) ─────────────────────────
        let post: typeof postsTable.$inferSelect | undefined;
        const spFeedPostValues = {
          nicheId: niche.id > 0 ? niche.id : null,
          platform: currentPlatform,
          contentType,
          slideCount,
          caption,
          aiCaptionOriginal: aiCaption2,
          hashtags,
          hashtagsTiktok: hashtagsTiktok ?? "",
          status: "pending_approval" as const,
          scheduledAt: scheduledDate,
          generationCostUsd: totalGenerationCostUsd(contentType, slideCount, captionResult.costUsd ?? 0),
          ...(currentPlatform === "instagram" ? { scheduledAtInstagram: scheduledDate } : {}),
          ...(currentPlatform === "tiktok"    ? { scheduledAtTiktok:    scheduledDate } : {}),
          ...(userId != null ? { userId } : {}),
          ...(businessId != null ? { businessId } : {}),
        } as const;
        assertPostInsertOwnership(spFeedPostValues, "spFeed", userId, businessId);
        if (spFeedLedgerId != null) {
          const [inserted] = await db.transaction(async tx => {
            const rows = await tx.insert(postsTable).values(spFeedPostValues).returning();
            await settleLedger(tx, spFeedLedgerId!, rows[0].id);
            return rows;
          });
          post = inserted;
        } else {
          const [inserted] = await db.insert(postsTable).values(spFeedPostValues).returning();
          post = inserted;
        }

        if (post) {
          const nicheContextShort = niche.id === -1
            ? niche.keywords
            : `${niche.name} - ${niche.keywords}`;

          postIds.push(post.id);
          const costs = await getCreditCosts();
          actualCreditsUsed += creditCostOf(contentType, costs);
          imageJobs.push({
            postId: post.id,
            userId: userId ?? undefined,
            businessId: businessId ?? undefined,
            nicheContextShort,
            captionHook: captionHookDraft,
            caption,
            contentType,
            styleIdx: feedSlot,
            slideCount,
            platform: currentPlatform,
            imageScene: niche.id === -1 ? bulkBriefImageScene : undefined,
          });
          // Registrar el tipo recién creado para que la misma corrida no lo duplique en este día
          if (!existingByType.has(contentType)) existingByType.set(contentType, new Set());
          existingByType.get(contentType)!.add(dayKey);
        }
        } // cierra bloque de creación
      }   // cierra for contentType

      // --- STORY post: Regla 11 pre-filtro — solo días válidos del pool (primeros N días) ---
      const hasStoryPost = spStoryValidDays.has(dow) && contentTypes.includes("story") && !existingStoryDays.has(dayKey);
      if (hasStoryPost) {
        const isStoryToday  = dayOffset === 0 && !startDate;
        const storyBogotaHour = pickHour(currentPlatform, "story", storySlot, isStoryToday, ctSchedule, userTimezone);
        if (storyBogotaHour !== -1) {
        storySlot++;

        const scheduledDate = localHourToUTC(currentDate, storyBogotaHour, userTimezone);

        // ── Niche diversity: adaptive gap + active window (max 7 niches) ──
        let storyNiche = nichePool[nicheIndex % nichePool.length];
        if (isAutomatic && niches.length > 1) {
          let attempts = 0;
          while (attempts < nichePool.length - 1) {
            if (recentAutoTopics.has(storyNiche.name) || topicsUsedThisRun.has(storyNiche.name)) {
              nicheIndex++; attempts++; storyNiche = nichePool[nicheIndex % nichePool.length];
            } else break;
          }
        }
        nicheIndex++;
        const niche = storyNiche;
        const nicheContext = niche.id === -1
          ? niche.description
          : `${niche.name}: ${niche.description}. Palabras clave: ${niche.keywords}.${bizLocationSuffix}`;
        const spStoryAddon = findAddonForNiche(bulkAddons, niche);
        const spStoryAddonChars = calcAddonReservedChars(spStoryAddon);
        const effectiveSpStoryCtx = enrichContextWithAddon(nicheContext, spStoryAddon);

        // ── Max-posts guard ────────────────────────────────────────────────
        if (maxPosts !== undefined && postIds.length >= maxPosts) {
          stoppedByCredits = true;
          break;
        }

        // ── 1. Credit guard (SP-story) — durable ledger ──────────────────────
        let spStoryLedgerId: number | undefined;
        if (!creditsPreReserved && userId != null) {
          try {
            spStoryLedgerId = await db.transaction(async tx =>
              deductAndCreateLedger(tx, userId, "story")
            );
          } catch (err: unknown) {
            const e = err as { code?: string };
            if (e?.code === "INSUFFICIENT_CREDITS") { stoppedByCredits = true; break; }
            throw err;
          }
        }

        // ── 2. Story caption (AI call — no TX open) ───────────────────────────
        const storyRecentHooks = await getRecentHooks(currentPlatform, userId, businessId);
        const storyAllHooks = [...storyRecentHooks, ...batchHooks];
        let storyResult: Awaited<ReturnType<typeof generateCaption>>;
        let spStoryHookDraft = "";
        storyResult = await generateCaption(effectiveSpStoryCtx, currentPlatform, "story", undefined, userId, undefined, businessId, undefined, spStoryAddonChars);
        spStoryHookDraft = extractCaptionHook(storyResult.caption);
        if (isTooSimilar(spStoryHookDraft, storyAllHooks)) {
          const avoidList = getMostSimilarHooks(spStoryHookDraft, storyAllHooks, 6);
          storyResult = await generateCaption(effectiveSpStoryCtx, currentPlatform, "story", avoidList, userId, undefined, businessId, undefined, spStoryAddonChars);
          spStoryHookDraft = extractCaptionHook(storyResult.caption);
        }
        batchHooks.push(spStoryHookDraft);
        const storyTopicKey = isAutomatic ? niche.name : undefined;
        void recordCaptionHistory(batchId, currentPlatform, spStoryHookDraft, "story", undefined, storyTopicKey, userId, businessId);
        if (isAutomatic) topicsUsedThisRun.add(niche.name);
        const caption = applyAddon(storyResult.caption, spStoryAddon);

        // ── 3. Insert post + settle ledger (SP-story) ────────────────────────
        let post: typeof postsTable.$inferSelect | undefined;
        const spStoryPostValues = {
          nicheId: niche.id > 0 ? niche.id : null,
          platform: currentPlatform,
          contentType: "story" as const,
          slideCount: 1,
          caption,
          aiCaptionOriginal: storyResult.caption,
          hashtags: "",
          status: "pending_approval" as const,
          scheduledAt: scheduledDate,
          generationCostUsd: totalGenerationCostUsd("story", 1, storyResult.costUsd ?? 0),
          ...(currentPlatform === "instagram" ? { scheduledAtInstagram: scheduledDate } : {}),
          ...(currentPlatform === "tiktok"    ? { scheduledAtTiktok:    scheduledDate } : {}),
          ...(userId != null ? { userId } : {}),
          ...(businessId != null ? { businessId } : {}),
        } as const;
        assertPostInsertOwnership(spStoryPostValues, "spStory", userId, businessId);
        if (spStoryLedgerId != null) {
          const [inserted] = await db.transaction(async tx => {
            const rows = await tx.insert(postsTable).values(spStoryPostValues).returning();
            await settleLedger(tx, spStoryLedgerId!, rows[0].id);
            return rows;
          });
          post = inserted;
        } else {
          const [inserted] = await db.insert(postsTable).values(spStoryPostValues).returning();
          post = inserted;
        }

        if (post) {
          const nicheContextShort = `${niche.name} - story vertical`;

          postIds.push(post.id);
          const costs = await getCreditCosts();
          actualCreditsUsed += creditCostOf("story", costs);
          imageJobs.push({
            postId: post.id,
            userId: userId ?? undefined,
            businessId: businessId ?? undefined,
            nicheContextShort,
            captionHook: spStoryHookDraft,
            contentType: "story",
            styleIdx: storySlot,
            slideCount: 1,
            platform: currentPlatform,
            imageScene: niche.id === -1 ? bulkBriefImageScene : undefined,
          });
        }
        } // cierra if (storyBogotaHour !== -1)
      }
    }
  }
  } // closes else (single-platform)

  void closeBatch(batchId, postIds.length);
  return { postIds, imageJobs, stoppedByCredits, actualCreditsUsed };
}

// ── generateExtraPosts ────────────────────────────────────────────────────────
// Creates exactly `count` new posts distributed in the next available calendar
// slots, following the same strategy schedule. Never duplicates existing slots.
// Searches up to MAX_SEARCH_DAYS forward from tomorrow.
export async function generateExtraPosts(
  count: number,
  nicheIds: number[],
  platform: string,
  contentTypes: string[] = ["image", "reel", "carousel"],
  customTopic?: string,
  isAutomatic: boolean = false,
  userId?: number,
  businessId?: number,
  creditsPreReserved = false,
  userTimezone: string = ADMIN_TZ,
): Promise<{ postIds: number[]; imageJobs: PostImageJob[]; searchedDays: number; stoppedByCredits: boolean; actualCreditsUsed: number }> {
  if (count < 1) count = 1;
  if (count > 30) count = 30;

  const targetPlatforms = platform === "both" ? ["instagram", "tiktok"] : [platform];

  // Load business default location for niche context suffix
  let extraBizLocationSuffix = "";
  if (businessId != null) {
    const biz = await db.select({ defaultLocation: businessesTable.defaultLocation })
      .from(businessesTable).where(eq(businessesTable.id, businessId)).limit(1).then(r => r[0]);
    if (biz?.defaultLocation) extraBizLocationSuffix = ` ${biz.defaultLocation}.`;
  }

  // Load caption addons ONCE for the whole run
  const extraAddons = await loadCaptionAddons(userId, businessId);

  // Build niche pool — scoped by businessId when available (multi-business isolation),
  // fallback to userId for solo/legacy users; fail-closed when both are null.
  if (userId == null && businessId == null) {
    logger.warn("[generateExtraPosts] fail-closed: userId and businessId are both null — refusing global niche fetch");
    return { postIds: [], imageJobs: [], searchedDays: 0, stoppedByCredits: false, actualCreditsUsed: 0 };
  }
  const extraNicheCond = businessId != null
    ? and(eq(nichesTable.active, true), eq(nichesTable.businessId, businessId))
    : and(eq(nichesTable.active, true), eq(nichesTable.userId, userId!));
  let niches = await db.select().from(nichesTable).where(extraNicheCond);
  if (nicheIds.length > 0) niches = niches.filter(n => nicheIds.includes(n.id));
  if (niches.length === 0 && !customTopic?.trim()) {
    return { postIds: [], imageJobs: [], searchedDays: 0, stoppedByCredits: false, actualCreditsUsed: 0 };
  }
  let extraBriefImageScene: string | undefined;
  if (customTopic?.trim()) {
    const distilled = await distillStrategicBrief(customTopic);
    extraBriefImageScene = distilled.imageScene;
    if (distilled.concept.length !== customTopic.trim().length) {
      console.log(`[generateExtraPosts] brief distilled (${customTopic.trim().length}→${distilled.concept.length} chars): "${distilled.concept.slice(0, 80)}..."${distilled.imageScene ? ` | imageScene: "${distilled.imageScene.slice(0, 60)}..."` : ""}`);
    }
    const sceneHintExtra = distilled.imageScene
      ? ` El escenario visual del contenido es: ${distilled.imageScene}. Los textos deben ser coherentes con esa escena.`
      : "";
    const fullCtx = `${distilled.concept}${sceneHintExtra}`;
    niches.push({
      id: -1,
      userId: null,
      businessId: null,
      name: distilled.concept.slice(0, 80),
      description: fullCtx,
      keywords: distilled.concept,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // ── Load user's publication plan (fresh every call) ─────────────────────
  // fetchSchedulerSuggestions = fuente única de verdad (Reglas 8/9 — source="ai"|"default").
  const ctSchedule = userId
    ? await fetchSchedulerSuggestions(userId, businessId)
    : DEFAULT_CT_SCHEDULE;
  const localSCHEDULE = {
    instagram: {
      feedDays:  [...new Set([...(ctSchedule.instagram?.reel?.days ?? []), ...(ctSchedule.instagram?.image?.days ?? []), ...(ctSchedule.instagram?.carousel?.days ?? [])])].sort((a, b) => a - b),
      storyDays: ctSchedule.instagram?.story?.days ?? [],
    },
    tiktok: {
      feedDays:  [...new Set([...(ctSchedule.tiktok?.reel?.days ?? []), ...(ctSchedule.tiktok?.image?.days ?? []), ...(ctSchedule.tiktok?.carousel?.days ?? [])])].sort((a, b) => a - b),
      storyDays: ctSchedule.tiktok?.story?.days ?? [],
    },
  };

  const MAX_SEARCH_DAYS   = 120;

  const postIds: number[]         = [];
  const imageJobs: PostImageJob[] = [];
  let stoppedByCredits = false;
  let actualCreditsUsed = 0;

  // Build active niche window (max 7) + weighted pool (same logic as generateBulkPosts)
  const { activeWindow: extraActiveWindow, weightedPool: extraWeightedPool } = isAutomatic
    ? await buildActiveNicheWindow(niches, userId, businessId)
    : { activeWindow: niches, weightedPool: await buildWeightedNichePool(niches, userId) };
  const nichePool = extraWeightedPool.length > 0 ? extraWeightedPool : niches;
  // Topic gap uses TOTAL eligible niche count (niches, before windowing to 7-slot active window).
  // Users with 15+ niches get the full MAX_GAP=15 protection; fewer niches → proportional gap.
  const TOPIC_GAP_DAYS = isAutomatic ? await getAdaptiveTopicGapDays(userId, niches.length) : 7;
  const recentAutoTopics = isAutomatic ? await getRecentAutoTopics(TOPIC_GAP_DAYS, userId, businessId) : new Set<string>();

  let nicheIndex = 0;
  let maxDaysUsed = 0;

  // Topic-gap (automatic mode only) — uses total eligible niche count (MAX_GAP=15).
  // Manual generation ignores this rule entirely (user chose the niche on purpose).
  const topicsUsedThisRun = new Set<string>();

  // ── Diversity engine setup ───────────────────────────────────────────────
  const extraBatchId = await createGenerationBatch(platform);
  const extraBatchHooks: string[] = [];

  const searchFrom = new Date();
  searchFrom.setHours(0, 0, 0, 0);
  searchFrom.setDate(searchFrom.getDate() + 1); // start from tomorrow

  const searchEnd = new Date(searchFrom);
  searchEnd.setDate(searchFrom.getDate() + MAX_SEARCH_DAYS);
  searchEnd.setHours(23, 59, 59, 999);

  // ── UNIFIED "BOTH" MODE ──────────────────────────────────────────────────────
  // Creates ONE post per content slot with independent IG + TK scheduled dates.
  if (platform === "both") {
    const bothUserCond = userId != null
      ? (businessId != null
          ? and(eq(postsTable.userId, userId), eq(postsTable.businessId, businessId))
          : eq(postsTable.userId, userId))
      : undefined;
    const existingForBoth = await db
      .select({
        scheduledAt: postsTable.scheduledAt,
        scheduledAtInstagram: postsTable.scheduledAtInstagram,
        scheduledAtTiktok: postsTable.scheduledAtTiktok,
        contentType: postsTable.contentType,
        platform: postsTable.platform,
      })
      .from(postsTable)
      .where(and(
        inArray(postsTable.status, ["draft", "pending_approval", "approved", "scheduled", "published"]),
        or(
          and(gte(postsTable.scheduledAt, searchFrom), lte(postsTable.scheduledAt, searchEnd)),
          and(isNotNull(postsTable.scheduledAtInstagram), gte(postsTable.scheduledAtInstagram, searchFrom), lte(postsTable.scheduledAtInstagram, searchEnd)),
          and(isNotNull(postsTable.scheduledAtTiktok), gte(postsTable.scheduledAtTiktok, searchFrom), lte(postsTable.scheduledAtTiktok, searchEnd)),
        ),
        bothUserCond,
      ));

    // Mapas centralizados usando buildOccupationMap — misma función que generateBulkPosts.
    const { byType: igUsedByType, story: igStoryDays } = buildOccupationMap(existingForBoth, "instagram", userTimezone);
    const { byType: tkUsedByType, story: tkStoryDays } = buildOccupationMap(existingForBoth, "tiktok", userTimezone);

    // Regla 11: pre-filtro de días (getWeeklySlots) — extraPosts both mode.
    // Calcula UNA VEZ qué días son válidos por tipo/plataforma (primeros weeklyTarget.N del pool).
    const extraFeedCts = contentTypes.filter(ct => ct !== "story");
    const igExtraValidDaysByType = new Map<string, Set<number>>();
    const tkExtraValidDaysByType = new Map<string, Set<number>>();
    for (const ct of extraFeedCts) {
      igExtraValidDaysByType.set(ct, getWeeklySlots(ctSchedule, "instagram", ct));
      tkExtraValidDaysByType.set(ct, getWeeklySlots(ctSchedule, "tiktok", ct));
    }
    const igExtraStoryValidDays = getWeeklySlots(ctSchedule, "instagram", "story");
    const tkExtraStoryValidDays = getWeeklySlots(ctSchedule, "tiktok", "story");

    type ExtraSlot = { utcDate: Date; contentType: string; dayKey: string };
    const igSlots: ExtraSlot[] = [];
    const tkSlots: ExtraSlot[] = [];
    let igFeedSlot = 0, igStorySlot = 0;
    let tkFeedSlot = 0, tkStorySlot = 0;

    for (let dayOffset = 0; dayOffset < MAX_SEARCH_DAYS; dayOffset++) {
      if (igSlots.length >= count && tkSlots.length >= count) break;
      if (dayOffset > maxDaysUsed) maxDaysUsed = dayOffset;

      const currentDate = new Date(searchFrom);
      currentDate.setDate(searchFrom.getDate() + dayOffset);
      const dow    = currentDate.getDay();
      const dayKey = dayKeyForTimezone(new Date(currentDate.getTime() + 12 * 60 * 60 * 1000), userTimezone);

      // IG feed: pre-filtro — solo días del pool válidos (primeros N de la lista)
      if (igSlots.length < count) {
        for (const contentType of extraFeedCts) {
          if (!igExtraValidDaysByType.get(contentType)?.has(dow)) continue;
          if (igUsedByType.get(contentType)?.has(dayKey)) continue; // Guard IA: max 1 post del mismo tipo por día. Tipos distintos el mismo día son válidos (Regla 2).
          const bogotaHour = pickHour("instagram", contentType, igFeedSlot, false, ctSchedule, userTimezone);
          igFeedSlot++;
          igSlots.push({ utcDate: localHourToUTC(currentDate, bogotaHour, userTimezone), contentType, dayKey });
          if (!igUsedByType.has(contentType)) igUsedByType.set(contentType, new Set());
          igUsedByType.get(contentType)!.add(dayKey);
          if (igSlots.length >= count) break;
        }
      }
      if (igSlots.length < count && contentTypes.includes("story") && igExtraStoryValidDays.has(dow) && !igStoryDays.has(dayKey)) {
        const bogotaHour = pickHour("instagram", "story", igStorySlot, false, ctSchedule, userTimezone);
        igStorySlot++;
        igSlots.push({ utcDate: localHourToUTC(currentDate, bogotaHour, userTimezone), contentType: "story", dayKey });
        igStoryDays.add(dayKey);
      }
      // TK feed: pre-filtro — misma lógica
      if (tkSlots.length < count) {
        for (const contentType of extraFeedCts) {
          if (!tkExtraValidDaysByType.get(contentType)?.has(dow)) continue;
          if (tkUsedByType.get(contentType)?.has(dayKey)) continue;
          const bogotaHour = pickHour("tiktok", contentType, tkFeedSlot, false, ctSchedule, userTimezone);
          tkFeedSlot++;
          tkSlots.push({ utcDate: localHourToUTC(currentDate, bogotaHour, userTimezone), contentType, dayKey });
          if (!tkUsedByType.has(contentType)) tkUsedByType.set(contentType, new Set());
          tkUsedByType.get(contentType)!.add(dayKey);
          if (tkSlots.length >= count) break;
        }
      }
      if (tkSlots.length < count && contentTypes.includes("story") && tkExtraStoryValidDays.has(dow) && !tkStoryDays.has(dayKey)) {
        const bogotaHour = pickHour("tiktok", "story", tkStorySlot, false, ctSchedule, userTimezone);
        tkStorySlot++;
        tkSlots.push({ utcDate: localHourToUTC(currentDate, bogotaHour, userTimezone), contentType: "story", dayKey });
        tkStoryDays.add(dayKey);
      }
    }

    const pairs = Math.min(igSlots.length, tkSlots.length, count);
    for (let i = 0; i < pairs; i++) {
      const igSlot = igSlots[i];
      const tkSlot = tkSlots[i];
      const contentType = igSlot.contentType;
      const slideCount  = contentType === "carousel" ? 4 : contentType === "reel" ? 4 : 1;

      let niche = nichePool[nicheIndex % nichePool.length];
      if (isAutomatic && niches.length > 1) {
        let attempts = 0;
        while (attempts < nichePool.length - 1) {
          if (recentAutoTopics.has(niche.name) || topicsUsedThisRun.has(niche.name)) {
            nicheIndex++; attempts++; niche = nichePool[nicheIndex % nichePool.length];
          } else break;
        }
      }
      nicheIndex++;

      const nicheContext = niche.id === -1
        ? niche.description
        : `${niche.name}: ${niche.description}. Palabras clave: ${niche.keywords}.${extraBizLocationSuffix}`;
      const nicheContextShort = niche.id === -1
        ? niche.keywords
        : `${niche.name} - ${niche.keywords}${extraBizLocationSuffix ? ` - ${extraBizLocationSuffix.trim()}` : ""}`;
      const extraNicheAddon = findAddonForNiche(extraAddons, niche);
      const extraNicheAddonChars = calcAddonReservedChars(extraNicheAddon);
      const effectiveExtraCtx = enrichContextWithAddon(nicheContext, extraNicheAddon);

      // ── 1. Credit guard (extra-both) — durable ledger ────────────────────
      let extraBothLedgerId: number | undefined;
      if (!creditsPreReserved && userId != null) {
        try {
          extraBothLedgerId = await db.transaction(async tx =>
            deductAndCreateLedger(tx, userId, contentType)
          );
        } catch (err: unknown) {
          const e = err as { code?: string };
          if (e?.code === "INSUFFICIENT_CREDITS") { stoppedByCredits = true; break; }
          throw err;
        }
      }

      // ── 2. Caption (AI call — no TX open) ────────────────────────────────
      const recentHooks = await getRecentHooks("instagram", userId, businessId);
      const allHooks    = [...recentHooks, ...extraBatchHooks];
      const extraHookStyleHint = contentType === "carousel"
        ? CAROUSEL_HOOK_STYLES[extraBatchHooks.length % CAROUSEL_HOOK_STYLES.length]
        : undefined;
      let captionResult: Awaited<ReturnType<typeof generateCaption>>;
      let hookDraft = "";
      captionResult = await generateCaption(effectiveExtraCtx, "both", contentType, allHooks.slice(-15), userId, undefined, businessId, extraHookStyleHint, extraNicheAddonChars);
      hookDraft = extractCaptionHook(captionResult.caption);
      if (isTooSimilar(hookDraft, allHooks)) {
        const avoidList = getMostSimilarHooks(hookDraft, allHooks, 8);
        captionResult = await generateCaption(effectiveExtraCtx, "both", contentType, avoidList, userId, undefined, businessId, extraHookStyleHint, extraNicheAddonChars);
        hookDraft = extractCaptionHook(captionResult.caption);
        if (isTooSimilar(hookDraft, allHooks)) {
          const allSim = getMostSimilarHooks(hookDraft, allHooks, 12);
          captionResult = await generateCaption(
            `${effectiveExtraCtx} — usa un ÁNGULO COMPLETAMENTE DIFERENTE, perspectiva nueva`,
            "both", contentType, allSim, userId, undefined, businessId, extraHookStyleHint, extraNicheAddonChars
          );
          hookDraft = extractCaptionHook(captionResult.caption);
        }
      }
      extraBatchHooks.push(hookDraft);
      void recordCaptionHistory(extraBatchId, "both", hookDraft, contentType, undefined, isAutomatic ? niche.name : undefined, userId, businessId);
      if (isAutomatic) topicsUsedThisRun.add(niche.name);
      const { caption: aiCaptionExtra, hashtags, hashtagsTiktok } = captionResult;
      const caption = applyAddon(aiCaptionExtra, extraNicheAddon);

      // ── 3. Insert post + settle ledger (extra-both) ───────────────────────
      let post: typeof postsTable.$inferSelect | undefined;
      const extraBothPostValues = {
        nicheId: niche.id > 0 ? niche.id : null,
        platform: "both" as const,
        contentType,
        slideCount,
        caption,
        aiCaptionOriginal: aiCaptionExtra,
        hashtags,
        hashtagsTiktok: hashtagsTiktok ?? "",
        status: "pending_approval" as const,
        scheduledAt: igSlot.utcDate,
        scheduledAtInstagram: igSlot.utcDate,
        scheduledAtTiktok: tkSlot.utcDate,
        generationCostUsd: totalGenerationCostUsd(contentType, slideCount, captionResult.costUsd ?? 0),
        ...(userId != null ? { userId } : {}),
        ...(businessId != null ? { businessId } : {}),
      } as const;
      assertPostInsertOwnership(extraBothPostValues, "extraBoth", userId, businessId);
      if (extraBothLedgerId != null) {
        const [inserted] = await db.transaction(async tx => {
          const rows = await tx.insert(postsTable).values(extraBothPostValues).returning();
          await settleLedger(tx, extraBothLedgerId!, rows[0].id);
          return rows;
        });
        post = inserted;
      } else {
        const [inserted] = await db.insert(postsTable).values(extraBothPostValues).returning();
        post = inserted;
      }

      if (post) {
        postIds.push(post.id);
        const costs = await getCreditCosts();
        actualCreditsUsed += creditCostOf(contentType, costs);
        imageJobs.push({
          postId: post.id,
          userId: userId ?? undefined,
          businessId: businessId ?? undefined,
          nicheContextShort,
          captionHook: hookDraft,
          caption,
          contentType,
          styleIdx: i,
          slideCount,
          platform: "both",
          imageScene: niche.id === -1 ? extraBriefImageScene : undefined,
        });
      }
    }

    void closeBatch(extraBatchId, postIds.length);
    return { postIds, imageJobs, searchedDays: maxDaysUsed + 1, stoppedByCredits, actualCreditsUsed };
  }

  // ── SINGLE PLATFORM MODE ─────────────────────────────────────────────────────
  for (const currentPlatform of targetPlatforms) {
    const platformTarget = count;
    const sched = localSCHEDULE[currentPlatform as keyof typeof localSCHEDULE] ?? localSCHEDULE.instagram;

    // Fetch ALL existing posts for this platform in the big window — scoped to owner (admin/scheduler: undefined → global)
    // Use OR to cover platform-specific dates: for 'both' posts scheduledAt=IG canonical,
    // so TK posts may have scheduledAt outside window but scheduledAtTiktok inside it.
    const extraUserCond = userId != null
      ? (businessId != null
          ? and(eq(postsTable.userId, userId), eq(postsTable.businessId, businessId))
          : eq(postsTable.userId, userId))
      : undefined;
    const extraPlatformDateCol = currentPlatform === "tiktok" ? postsTable.scheduledAtTiktok : postsTable.scheduledAtInstagram;
    const existingPosts = await db
      .select({ scheduledAt: postsTable.scheduledAt, scheduledAtInstagram: postsTable.scheduledAtInstagram, scheduledAtTiktok: postsTable.scheduledAtTiktok, contentType: postsTable.contentType, platform: postsTable.platform })
      .from(postsTable)
      .where(and(
        or(eq(postsTable.platform, currentPlatform), eq(postsTable.platform, "both")),
        inArray(postsTable.status, ["draft", "pending_approval", "approved", "scheduled", "published"]),
        or(
          and(gte(postsTable.scheduledAt, searchFrom), lte(postsTable.scheduledAt, searchEnd)),
          and(isNotNull(extraPlatformDateCol), gte(extraPlatformDateCol, searchFrom), lte(extraPlatformDateCol, searchEnd)),
        ),
        extraUserCond,
      ));

    // Rastrear días ocupados POR TIPO de contenido para no bloquear un día que ya tiene
    // un carousel cuando queremos añadir un reel en ese mismo día de estrategia.
    const existingByType  = new Map<string, Set<string>>();
    const existingStoryDays = new Set<string>();
    for (const p of existingPosts) {
      // Use platform-specific date to get the correct calendar day in Bogotá.
      // For 'both' posts, scheduledAt = IG date; TikTok must use scheduledAtTiktok.
      const platformDate = currentPlatform === "tiktok"
        ? (p.scheduledAtTiktok ?? p.scheduledAt)
        : (p.scheduledAtInstagram ?? p.scheduledAt);
      if (!platformDate) continue;
      const key = dayKeyForTimezone(new Date(platformDate), userTimezone);
      const ct  = p.contentType ?? "image";
      if (ct === "story") {
        existingStoryDays.add(key);
      } else {
        if (!existingByType.has(ct)) existingByType.set(ct, new Set());
        existingByType.get(ct)!.add(key);
      }
    }

    // Regla 11: pre-filtro de días (getWeeklySlots) — extraPosts single-platform.
    // Calcula UNA VEZ qué días son válidos por tipo (primeros weeklyTarget.N del pool).
    const extraSpFeedCts = contentTypes.filter(ct => ct !== "story");
    const extraSpValidDaysByType = new Map<string, Set<number>>();
    for (const ct of extraSpFeedCts) extraSpValidDaysByType.set(ct, getWeeklySlots(ctSchedule, currentPlatform, ct));
    const extraSpStoryValidDays = getWeeklySlots(ctSchedule, currentPlatform, "story");

    let created   = 0;
    let feedSlot  = 0;
    let storySlot = 0;

    for (let dayOffset = 0; dayOffset < MAX_SEARCH_DAYS && created < platformTarget; dayOffset++) {
      if (dayOffset > maxDaysUsed) maxDaysUsed = dayOffset;

      const currentDate = new Date(searchFrom);
      currentDate.setDate(searchFrom.getDate() + dayOffset);
      const dow    = currentDate.getDay();
      // dayKey usa mediodía UTC para que dayKeyForTimezone devuelva el día correcto en la zona del usuario
      const dayKey = dayKeyForTimezone(new Date(currentDate.getTime() + 12 * 60 * 60 * 1000), userTimezone);

      // --- FEED posts: Regla 11 pre-filtro — solo días válidos del pool (primeros N días) ---
      for (const contentType of (created < platformTarget ? extraSpFeedCts : [])) {
        // Regla 11 pre-filtro: solo días en validDays para este tipo
        if (!extraSpValidDaysByType.get(contentType)?.has(dow)) continue;
        if (existingByType.get(contentType)?.has(dayKey)) continue; // Guard IA: max 1 post del mismo tipo por día. Tipos distintos el mismo día son válidos (Regla 2).
        if (created >= platformTarget) break;
        {
        const slideCount  = contentType === "carousel" ? 4 : contentType === "reel" ? 4 : 1;
        const isToday    = dayOffset === 0;
        const extraBogotaHour = pickHour(currentPlatform, contentType, feedSlot, isToday, ctSchedule, userTimezone);
        if (extraBogotaHour === -1) continue;
        feedSlot++;

        const scheduledDate = localHourToUTC(currentDate, extraBogotaHour, userTimezone);

        // ── Niche diversity: adaptive gap + active window (max 7 niches) ──
        let extraNiche = nichePool[nicheIndex % nichePool.length];
        if (isAutomatic && niches.length > 1) {
          let attempts = 0;
          while (attempts < nichePool.length - 1) {
            if (recentAutoTopics.has(extraNiche.name) || topicsUsedThisRun.has(extraNiche.name)) {
              nicheIndex++; attempts++; extraNiche = nichePool[nicheIndex % nichePool.length];
            } else break;
          }
        }
        nicheIndex++;
        const niche = extraNiche;
        const nicheContext = niche.id === -1
          ? niche.description
          : `${niche.name}: ${niche.description}. Palabras clave: ${niche.keywords}.`;
        const extraSpAddon = findAddonForNiche(extraAddons, niche);
        const extraSpAddonChars = calcAddonReservedChars(extraSpAddon);
        const effectiveExtraSpCtx = enrichContextWithAddon(nicheContext, extraSpAddon);

        // ── 1. Credit guard (extra-SP-feed) — durable ledger ─────────────────
        let extraSpFeedLedgerId: number | undefined;
        if (!creditsPreReserved && userId != null) {
          try {
            extraSpFeedLedgerId = await db.transaction(async tx =>
              deductAndCreateLedger(tx, userId, contentType)
            );
          } catch (err: unknown) {
            const e = err as { code?: string };
            if (e?.code === "INSUFFICIENT_CREDITS") { stoppedByCredits = true; break; }
            throw err;
          }
        }

        // ── 2. Caption (AI call — no TX open) ────────────────────────────────
        const extraRecentHooks = await getRecentHooks(currentPlatform, userId, businessId);
        const extraAllHooks = [...extraRecentHooks, ...extraBatchHooks];
        const extraSpHookStyleHint = contentType === "carousel"
          ? CAROUSEL_HOOK_STYLES[extraBatchHooks.length % CAROUSEL_HOOK_STYLES.length]
          : undefined;
        let extraCaptionResult: Awaited<ReturnType<typeof generateCaption>>;
        let extraHookDraft = "";
        extraCaptionResult = await generateCaption(effectiveExtraSpCtx, currentPlatform, contentType, extraAllHooks.slice(-15), userId, undefined, businessId, extraSpHookStyleHint, extraSpAddonChars);
        extraHookDraft = extractCaptionHook(extraCaptionResult.caption);
        if (isTooSimilar(extraHookDraft, extraAllHooks)) {
          const avoidList = getMostSimilarHooks(extraHookDraft, extraAllHooks, 8);
          extraCaptionResult = await generateCaption(effectiveExtraSpCtx, currentPlatform, contentType, avoidList, userId, undefined, businessId, extraSpHookStyleHint, extraSpAddonChars);
          extraHookDraft = extractCaptionHook(extraCaptionResult.caption);
          if (isTooSimilar(extraHookDraft, extraAllHooks)) {
            const allSim = getMostSimilarHooks(extraHookDraft, extraAllHooks, 12);
            extraCaptionResult = await generateCaption(
              `${effectiveExtraSpCtx} — usa un ÁNGULO COMPLETAMENTE DIFERENTE, perspectiva nueva`,
              currentPlatform, contentType, allSim, userId, undefined, businessId, extraSpHookStyleHint, extraSpAddonChars
            );
            extraHookDraft = extractCaptionHook(extraCaptionResult.caption);
          }
        }
        extraBatchHooks.push(extraHookDraft);
        const extraTopicKey = isAutomatic ? niche.name : undefined;
        void recordCaptionHistory(extraBatchId, currentPlatform, extraHookDraft, contentType, undefined, extraTopicKey, userId, businessId);
        if (isAutomatic) topicsUsedThisRun.add(niche.name);
        const { caption: aiCaptionExtraSp, hashtags, hashtagsTiktok } = extraCaptionResult;
        const caption = applyAddon(aiCaptionExtraSp, extraSpAddon);

        // ── 3. Insert post + settle ledger (extra-SP-feed) ───────────────────
        let post: typeof postsTable.$inferSelect | undefined;
        const extraSpFeedPostValues = {
          nicheId: niche.id > 0 ? niche.id : null,
          platform: currentPlatform,
          contentType,
          slideCount,
          caption,
          aiCaptionOriginal: aiCaptionExtraSp,
          hashtags,
          hashtagsTiktok: hashtagsTiktok ?? "",
          status: "pending_approval" as const,
          scheduledAt: scheduledDate,
          generationCostUsd: totalGenerationCostUsd(contentType, slideCount, extraCaptionResult.costUsd ?? 0),
          ...(currentPlatform === "instagram" ? { scheduledAtInstagram: scheduledDate } : {}),
          ...(currentPlatform === "tiktok"    ? { scheduledAtTiktok:    scheduledDate } : {}),
          ...(userId != null ? { userId } : {}),
          ...(businessId != null ? { businessId } : {}),
        } as const;
        assertPostInsertOwnership(extraSpFeedPostValues, "extraSpFeed", userId, businessId);
        if (extraSpFeedLedgerId != null) {
          const [inserted] = await db.transaction(async tx => {
            const rows = await tx.insert(postsTable).values(extraSpFeedPostValues).returning();
            await settleLedger(tx, extraSpFeedLedgerId!, rows[0].id);
            return rows;
          });
          post = inserted;
        } else {
          const [inserted] = await db.insert(postsTable).values(extraSpFeedPostValues).returning();
          post = inserted;
        }

        if (post) {
          const nicheContextShort = niche.id === -1
            ? niche.keywords
            : `${niche.name} - ${niche.keywords}`;
          postIds.push(post.id);
          const costs = await getCreditCosts();
          actualCreditsUsed += creditCostOf(contentType, costs);
          imageJobs.push({
            postId: post.id,
            userId: userId ?? undefined,
            businessId: businessId ?? undefined,
            nicheContextShort,
            captionHook: extraHookDraft,
            caption,
            contentType,
            styleIdx: feedSlot,
            slideCount,
            platform: currentPlatform,
            imageScene: niche.id === -1 ? extraBriefImageScene : undefined,
          });
          // Registrar el tipo recién creado para bloquear duplicados en iteraciones siguientes
          if (!existingByType.has(contentType)) existingByType.set(contentType, new Set());
          existingByType.get(contentType)!.add(dayKey);
          created++;
        }
        } // cierra bloque de creación
      }   // cierra for contentType

      // --- STORY post: Regla 11 pre-filtro — solo días válidos del pool (primeros N días) ---
      if (contentTypes.includes("story") && extraSpStoryValidDays.has(dow) && !existingStoryDays.has(dayKey) && created < platformTarget) {
        const isStoryToday    = dayOffset === 0;
        const extraStoryBogotaHour = pickHour(currentPlatform, "story", storySlot, isStoryToday, ctSchedule, userTimezone);
        if (extraStoryBogotaHour !== -1) {
        storySlot++;

        const scheduledDate = localHourToUTC(currentDate, extraStoryBogotaHour, userTimezone);

        // ── Niche diversity: adaptive gap + active window (max 7 niches) ──
        let extraStoryNiche = nichePool[nicheIndex % nichePool.length];
        if (isAutomatic && niches.length > 1) {
          let attempts = 0;
          while (attempts < nichePool.length - 1) {
            if (recentAutoTopics.has(extraStoryNiche.name) || topicsUsedThisRun.has(extraStoryNiche.name)) {
              nicheIndex++; attempts++; extraStoryNiche = nichePool[nicheIndex % nichePool.length];
            } else break;
          }
        }
        nicheIndex++;
        const niche = extraStoryNiche;
        const nicheContext = niche.id === -1
          ? niche.description
          : `${niche.name}: ${niche.description}. Palabras clave: ${niche.keywords}.${extraBizLocationSuffix}`;
        const extraStoryAddon = findAddonForNiche(extraAddons, niche);
        const extraStoryAddonChars = calcAddonReservedChars(extraStoryAddon);
        const effectiveExtraStoryCtx = enrichContextWithAddon(nicheContext, extraStoryAddon);

        // ── 1. Credit guard (extra-SP-story) — durable ledger ────────────────
        let extraSpStoryLedgerId: number | undefined;
        if (!creditsPreReserved && userId != null) {
          try {
            extraSpStoryLedgerId = await db.transaction(async tx =>
              deductAndCreateLedger(tx, userId, "story")
            );
          } catch (err: unknown) {
            const e = err as { code?: string };
            if (e?.code === "INSUFFICIENT_CREDITS") { stoppedByCredits = true; break; }
            throw err;
          }
        }

        // ── 2. Story caption (AI call — no TX open) ───────────────────────────
        const extraStoryHooks = await getRecentHooks(currentPlatform, userId, businessId);
        let extraStoryResult: Awaited<ReturnType<typeof generateCaption>>;
        let extraStoryHook = "";
        extraStoryResult = await generateCaption(effectiveExtraStoryCtx, currentPlatform, "story", undefined, userId, undefined, businessId, undefined, extraStoryAddonChars);
        extraStoryHook = extractCaptionHook(extraStoryResult.caption);
        if (isTooSimilar(extraStoryHook, [...extraStoryHooks, ...extraBatchHooks])) {
          const avoidList = getMostSimilarHooks(extraStoryHook, [...extraStoryHooks, ...extraBatchHooks], 6);
          extraStoryResult = await generateCaption(effectiveExtraStoryCtx, currentPlatform, "story", avoidList, userId, undefined, businessId, undefined, extraStoryAddonChars);
          extraStoryHook = extractCaptionHook(extraStoryResult.caption);
        }
        extraBatchHooks.push(extraStoryHook);
        const extraStoryTopicKey = isAutomatic ? niche.name : undefined;
        void recordCaptionHistory(extraBatchId, currentPlatform, extraStoryHook, "story", undefined, extraStoryTopicKey, userId, businessId);
        if (isAutomatic) topicsUsedThisRun.add(niche.name);
        const storyCaption = applyAddon(extraStoryResult.caption, extraStoryAddon);

        // ── 3. Insert post + settle ledger (extra-SP-story) ──────────────────
        let post: typeof postsTable.$inferSelect | undefined;
        const extraSpStoryPostValues = {
          nicheId: niche.id > 0 ? niche.id : null,
          platform: currentPlatform,
          contentType: "story" as const,
          slideCount: 1,
          caption: storyCaption,
          aiCaptionOriginal: extraStoryResult.caption,
          hashtags: "",
          hashtagsTiktok: "",
          status: "pending_approval" as const,
          scheduledAt: scheduledDate,
          generationCostUsd: totalGenerationCostUsd("story", 1, extraStoryResult.costUsd ?? 0),
          ...(currentPlatform === "instagram" ? { scheduledAtInstagram: scheduledDate } : {}),
          ...(currentPlatform === "tiktok"    ? { scheduledAtTiktok:    scheduledDate } : {}),
          ...(userId != null ? { userId } : {}),
          ...(businessId != null ? { businessId } : {}),
        } as const;
        assertPostInsertOwnership(extraSpStoryPostValues, "extraSpStory", userId, businessId);
        if (extraSpStoryLedgerId != null) {
          const [inserted] = await db.transaction(async tx => {
            const rows = await tx.insert(postsTable).values(extraSpStoryPostValues).returning();
            await settleLedger(tx, extraSpStoryLedgerId!, rows[0].id);
            return rows;
          });
          post = inserted;
        } else {
          const [inserted] = await db.insert(postsTable).values(extraSpStoryPostValues).returning();
          post = inserted;
        }

        if (post) {
          const nicheContextShort = niche.id === -1
            ? niche.keywords
            : `${niche.name} - story vertical`;
          postIds.push(post.id);
          const costs = await getCreditCosts();
          actualCreditsUsed += creditCostOf("story", costs);
          imageJobs.push({
            postId: post.id,
            userId: userId ?? undefined,
            businessId: businessId ?? undefined,
            nicheContextShort,
            captionHook: extraStoryHook,
            contentType: "story",
            styleIdx: storySlot,
            slideCount: 1,
            platform: currentPlatform,
            imageScene: niche.id === -1 ? extraBriefImageScene : undefined,
          });
          existingStoryDays.add(dayKey);
          created++;
        }
        } // cierra if (extraStoryBogotaHour !== -1)
      }
    }
  }

  void closeBatch(extraBatchId, postIds.length);
  return { postIds, imageJobs, searchedDays: maxDaysUsed + 1, stoppedByCredits, actualCreditsUsed };
}

// ─── Niche Performance Analysis & AI Suggestions ──────────────────────────────

export interface NichePerformance {
  nicheId: number;
  nicheName: string;
  postCount: number;
  avgLikes: number;
  avgComments: number;
  avgSaves: number;
  avgReach: number;
  avgER: number; // engagement rate % = (likes + saves*2 + comments) / reach * 100
}

export interface NicheSuggestion {
  nombre: string;
  razon: string;
  palabrasClave: string[];
}

export interface NicheAnalysisResult {
  topNiches: NichePerformance[];
  bottomNiches: NichePerformance[];
  allPerformance: NichePerformance[];
  suggestions: NicheSuggestion[];
  generatedAt: string;
}

/**
 * Suggests new niches for a specific user by combining two signals:
 *  1. Coverage gap — niches from the global pool the user hasn't activated yet
 *  2. Performance — patterns from their best-performing posts to find similar segments
 *
 * Returns up to 6 suggestions (mix of gap + performance-inspired) as plain objects.
 * The caller decides whether to save them — nothing is written to the DB here.
 */
export async function suggestNichesForUser(userId: number, businessId?: number): Promise<{
  name: string; description: string; keywords: string; reason: string; category: "gap" | "performance";
}[]> {
  // 1. User's existing niches (to avoid duplicates in suggestions)
  const userNiches = await db
    .select({ id: nichesTable.id, name: nichesTable.name, keywords: nichesTable.keywords })
    .from(nichesTable)
    .where(eq(nichesTable.userId, userId));

  const userNicheNames = new Set(userNiches.map(n => n.name.toLowerCase().trim()));

  // 2. User's post performance by niche (scheduled + published only)
  const userPosts = await db
    .select({
      nicheId:  postsTable.nicheId,
      likes:    postsTable.likes,
      comments: postsTable.comments,
      saves:    postsTable.saves,
      reach:    postsTable.reach,
    })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.userId, userId),
        drizzleSql`${postsTable.status} IN ('scheduled','published')`,
      )
    );

  // Aggregate ER% per niche
  const perfMap: Record<number, { name: string; postCount: number; totalLikes: number; totalComments: number; totalSaves: number; totalReach: number }> = {};
  const nicheNameById: Record<number, string> = Object.fromEntries(userNiches.map(n => [n.id, n.name]));

  for (const p of userPosts) {
    if (!p.nicheId || !nicheNameById[p.nicheId]) continue;
    if (!perfMap[p.nicheId]) perfMap[p.nicheId] = { name: nicheNameById[p.nicheId], postCount: 0, totalLikes: 0, totalComments: 0, totalSaves: 0, totalReach: 0 };
    const a = perfMap[p.nicheId];
    a.postCount++;
    a.totalLikes    += p.likes    ?? 0;
    a.totalComments += p.comments ?? 0;
    a.totalSaves    += p.saves    ?? 0;
    a.totalReach    += p.reach    ?? 1;
  }

  const perfRows = Object.values(perfMap)
    .map(a => ({
      name: a.name,
      postCount: a.postCount,
      avgER: a.totalReach > 0
        ? Math.round(((a.totalLikes + a.totalSaves * 2 + a.totalComments) / a.totalReach) * 10000) / 100
        : 0,
    }))
    .sort((a, b) => b.avgER - a.avgER);

  // 3. Load brand context from businessesTable — scoped to the specific business.
  // If businessId is provided use it directly; otherwise fall back to the user's
  // default business (isDefault = true). This prevents niche suggestions from
  // leaking across businesses of the same user (cross-business contamination).
  const bizWhere = businessId != null
    ? and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
    : and(eq(businessesTable.userId, userId), eq(businessesTable.isDefault, true));

  const [biz] = await db
    .select({
      name:                businessesTable.name,
      industry:            businessesTable.industry,
      subIndustry:         businessesTable.subIndustry,
      subIndustries:       businessesTable.subIndustries,
      defaultLocation:     businessesTable.defaultLocation,
      audienceDescription: businessesTable.audienceDescription,
      brandTone:           businessesTable.brandTone,
      description:         businessesTable.description,
    })
    .from(businessesTable)
    .where(bizWhere!)
    .limit(1);

  // Build profile context lines — only include fields that are actually set
  const nicheSubIndustries = normalizeSubIndustryList(biz?.subIndustry, biz?.subIndustries);
  const nicheEnhancedIndustry = buildEnhancedIndustryContext(
    biz?.industry,
    nicheSubIndustries.length ? JSON.stringify(nicheSubIndustries) : null,
  );

  const companyCtx  = biz?.name                ? `Empresa: ${biz.name}` : "";
  const industryCtx = biz?.industry            ? `Industria: ${nicheEnhancedIndustry || biz.industry}` : "";
  const specialtyCtx = nicheSubIndustries.length
    ? `Especialidades del negocio: ${nicheSubIndustries.join(", ")}`
    : "";
  const locationCtx = biz?.defaultLocation     ? `Ubicación: ${biz.defaultLocation}` : "";
  const audienceCtx = biz?.audienceDescription ? `Mercado objetivo: ${biz.audienceDescription}` : "";
  const toneCtx     = biz?.brandTone           ? `Tono de voz: ${biz.brandTone}` : "";
  const descCtx     = biz?.description         ? `Descripción del negocio: ${biz.description}` : "";
  const brandContext = [companyCtx, industryCtx, specialtyCtx, locationCtx, audienceCtx, toneCtx, descCtx].filter(Boolean).join("\n");

  // 4. Build the AI prompt — niches are generated 100% from the brand profile,
  //    never from other users' catalogues. Each user's suggestions are private.
  const userNicheList = userNiches.map(n => `- ${n.name}`).join("\n") || "(ninguno aún)";
  const perfSummary   = perfRows.slice(0, 8)
    .map(p => `  • ${p.name}: ER ${p.avgER}% (${p.postCount} posts)`)
    .join("\n") || "  (sin datos de rendimiento aún)";

  const profileSection = brandContext
    ? `PERFIL DE LA MARCA:\n${brandContext}`
    : `PERFIL DE LA MARCA: Aún no configurado. Este usuario es NUEVO y no ha completado su perfil.
REGLA ESPECIAL: Sugiere nichos 100% GENÉRICOS y UNIVERSALES, válidos para cualquier tipo de empresa. NO inventes ni asumas industria, ciudad, país, empresa ni audiencia. NO menciones ciudades ni regiones específicas.`;

  const prompt = `Eres estratega de marketing digital. Tu tarea es sugerir nichos de contenido para una marca que gestiona sus redes sociales con HazPost.

Los nichos de cada usuario son PRIVADOS — solo se generan a partir del perfil de esa marca específica, sin mezclar información de otras empresas.

${profileSection}

NICHOS QUE YA TIENE ESTA MARCA (no los repitas):
${userNicheList}

RENDIMIENTO DE SUS POSTS ACTUALES (ER = engagement rate):
${perfSummary}

TAREA: Sugiere exactamente 6 nichos NUEVOS para esta marca. Divide así:
- 3 por BRECHA: segmentos de su industria/mercado/ubicación con alto potencial que aún no cubre
- 3 por OPORTUNIDAD: tendencias o segmentos adyacentes a los que ya tiene, con mayor potencial

REGLAS CRÍTICAS:
- Los nichos deben ser específicos a la INDUSTRIA, TIPO DE MERCADO OBJETIVO, PAÍS y CIUDAD del perfil
- Si hay ciudad y país definidos, los nichos deben ser relevantes para ese mercado geográfico
- NUNCA uses información de otras empresas o usuarios — cada sugerencia parte SOLO de este perfil
- Si el perfil está vacío, crea nichos universales sin mencionar ubicaciones ni sectores concretos
- Sé MUY ESPECÍFICO: "Emprendedoras de moda sostenible 25-35 años" > "Mujeres interesadas en moda"
- No repitas ningún nicho que ya tenga esta marca

Responde SOLO con JSON:
{"sugerencias": [
  {
    "nombre": "Nombre del nicho",
    "descripcion": "2-3 oraciones: quién es este segmento, qué le preocupa o necesita, y cómo conecta con esta marca",
    "palabrasClave": "kw1, kw2, kw3, kw4, kw5",
    "razon": "Por qué este nicho tiene alto potencial para esta marca ahora (1 oración concreta)",
    "categoria": "gap"
  }
]}
(usa "gap" para brechas de cobertura, "performance" para los basados en rendimiento)`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.75,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    // Accept both a direct array or a wrapped object
    const arr: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(Object.values(parsed)[0]) ? (Object.values(parsed)[0] as unknown[]) : [];

    return arr.slice(0, 6).map((s: unknown) => {
      const item = s as Record<string, string>;
      const cat = item.categoria === "performance" ? "performance" : "gap";
      return {
        name:        String(item.nombre        ?? "Nuevo nicho"),
        description: String(item.descripcion   ?? ""),
        keywords:    String(item.palabrasClave ?? ""),
        reason:      String(item.razon         ?? ""),
        category:    cat as "gap" | "performance",
      };
    });
  } catch (err) {
    console.error("[suggestNichesForUser] GPT error:", err);
    return [];
  }
}

export async function analyzeAndSuggestNiches(): Promise<NicheAnalysisResult> {
  // 1. Fetch all published posts that have at least reach data
  const publishedPosts = await db
    .select({
      nicheId: postsTable.nicheId,
      likes: postsTable.likes,
      comments: postsTable.comments,
      saves: postsTable.saves,
      reach: postsTable.reach,
    })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "published"),
        isNotNull(postsTable.reach),
      )
    );

  // 2. Fetch all active niches
  const niches = await db
    .select({ id: nichesTable.id, name: nichesTable.name, keywords: nichesTable.keywords })
    .from(nichesTable)
    .where(eq(nichesTable.active, true));

  const nicheMap: Record<number, { name: string; keywords: string | null }> = {};
  for (const n of niches) nicheMap[n.id] = { name: n.name, keywords: n.keywords };

  // 3. Aggregate metrics per niche
  const aggregated: Record<number, {
    postCount: number; totalLikes: number; totalComments: number;
    totalSaves: number; totalReach: number;
  }> = {};

  for (const p of publishedPosts) {
    if (!p.nicheId || !nicheMap[p.nicheId]) continue;
    if (!aggregated[p.nicheId]) {
      aggregated[p.nicheId] = { postCount: 0, totalLikes: 0, totalComments: 0, totalSaves: 0, totalReach: 0 };
    }
    const a = aggregated[p.nicheId];
    a.postCount++;
    a.totalLikes += p.likes ?? 0;
    a.totalComments += p.comments ?? 0;
    a.totalSaves += p.saves ?? 0;
    a.totalReach += p.reach ?? 1;
  }

  const allPerformance: NichePerformance[] = Object.entries(aggregated)
    .map(([nicheIdStr, a]) => {
      const nicheId = Number(nicheIdStr);
      const avgLikes = a.totalLikes / a.postCount;
      const avgComments = a.totalComments / a.postCount;
      const avgSaves = a.totalSaves / a.postCount;
      const avgReach = a.totalReach / a.postCount;
      const avgER = avgReach > 0 ? ((avgLikes + avgSaves * 2 + avgComments) / avgReach) * 100 : 0;
      return {
        nicheId,
        nicheName: nicheMap[nicheId]?.name ?? `Niche ${nicheId}`,
        postCount: a.postCount,
        avgLikes: Math.round(avgLikes * 10) / 10,
        avgComments: Math.round(avgComments * 10) / 10,
        avgSaves: Math.round(avgSaves * 10) / 10,
        avgReach: Math.round(avgReach),
        avgER: Math.round(avgER * 100) / 100,
      };
    })
    .sort((a, b) => b.avgER - a.avgER);

  const topNiches = allPerformance.slice(0, 5);
  const bottomNiches = allPerformance.slice(-3).reverse();

  // 4. Ask GPT for new niche suggestions
  const currentNicheList = niches.map(n => `- ${n.name}`).join("\n");
  const perfSummary = allPerformance.slice(0, 10)
    .map(p => `  • ${p.nicheName}: ER ${p.avgER}% (${p.postCount} posts, reach avg ${p.avgReach})`)
    .join("\n");

  const prompt = `Eres estratega de marketing digital y analista de contenido para redes sociales.

NICHOS ACTUALES en la plataforma:
${currentNicheList}

PERFORMANCE RECIENTE (top nichos por tasa de engagement ER%):
${perfSummary || "Aún no hay suficientes métricas publicadas."}

Basándote en los nichos actuales y los resultados de engagement, sugiere exactamente 3 NUEVOS nichos para agregar a la plataforma. Deben ser:
1. Segmentos o temáticas con alto potencial de engagement que aún no están cubiertos
2. Ordenados por potencial de conversión (primero el más prometedor)
3. Específicos, accionables y aplicables a múltiples tipos de negocio

Responde SOLO en JSON válido con esta estructura exacta:
[
  {
    "nombre": "Nombre del nicho",
    "razon": "Por qué tiene alto potencial de engagement (1-2 oraciones concretas)",
    "palabrasClave": ["kw1", "kw2", "kw3"]
  }
]`;

  let suggestions: NicheSuggestion[] = [];
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    // GPT returns a JSON object — extract the array from any key
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (Object.values(parsed)[0] as NicheSuggestion[]);
    if (Array.isArray(arr)) suggestions = arr.slice(0, 3);
  } catch (err) {
    // Non-fatal — suggestions are a bonus
    console.error("Niche suggestions GPT error:", err);
  }

  return {
    topNiches,
    bottomNiches,
    allPerformance,
    suggestions,
    generatedAt: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }),
  };
}

// ─── Element composition layer system ────────────────────────────────────────

export type ElementPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface ElementLayerConfig {
  elementId: number;
  position: ElementPosition;
  sizePercent: number; // 10–60% del ancho de imagen
}

export interface CompositionLayersOptions {
  logo?: {
    enabled: boolean;
    position?: string;  // top-left | top-right | bottom-left | bottom-right
    sizePercent?: number;
    color?: string;
    buffer?: Buffer | null;
    tagline?: string;
    accentColor?: string;
    titleColor2?: string;
  };
  text?: {
    enabled: boolean;
    style?: string;
    position?: string;
    sizePercent?: number;
    headline?: string;
    font?: string;
    font2?: string;
    contentType?: string;
    accentColor?: string;
    titleColor2?: string;
  };
  elements?: {
    elementId: number;
    position: ElementPosition;
    sizePercent: number;
    buffer: Buffer;
  }[];
}

/**
 * Composite a single element (PNG/JPEG with transparency) onto an image buffer.
 * Positions are on a 3x3 grid with 3% padding from each edge.
 */
export async function compositeElementOnImage(
  imageBuffer: Buffer,
  elementBuffer: Buffer,
  position: ElementPosition,
  sizePercent: number
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  const clampedPct = Math.min(60, Math.max(10, sizePercent));
  const elementW = Math.round(w * (clampedPct / 100));
  const pad = Math.round(w * 0.03);

  const resized = await sharp(elementBuffer)
    .resize(elementW, null, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const eW = resizedMeta.width ?? elementW;
  const eH = resizedMeta.height ?? elementW;

  // Position format: "vertical-horizontal" (e.g. "top-left", "center", "bottom-right")
  const parts = position.split("-");
  const vPart = parts[0] ?? "center";                // top | center | bottom
  const hPart = parts.length > 1 ? parts[1] : "center"; // left | center | right

  let left: number;
  if (hPart === "left")   left = pad;
  else if (hPart === "right") left = w - eW - pad;
  else left = Math.round((w - eW) / 2);

  let top: number;
  if (vPart === "top")    top = pad;
  else if (vPart === "bottom") top = h - eH - pad;
  else top = Math.round((h - eH) / 2);

  return sharp(imageBuffer)
    .composite([{ input: resized, top, left, blend: "over" }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Apply full composition layer stack onto a raw background image.
 * Layer order: background → elements → logo → text.
 * Returns the composited image as base64.
 */
export async function applyCompositionLayers(
  rawBase64: string,
  options: CompositionLayersOptions
): Promise<string> {
  try {
    let imageBuffer = Buffer.from(rawBase64, "base64");

    // Layer 1: elements (applied in order)
    const elements = options.elements ?? [];
    for (const el of elements) {
      if (!el.buffer) continue;
      imageBuffer = await compositeElementOnImage(imageBuffer, el.buffer, el.position, el.sizePercent);
    }

    // Layers 2 (logo) + 3 (text) are applied together via compositeLogoOnImage
    const logoEnabled = options.logo?.enabled ?? false;
    const textEnabled = options.text?.enabled ?? false;

    if (logoEnabled || textEnabled) {
      const logoBuffer = logoEnabled ? (options.logo?.buffer ?? null) : null;
      const headline   = textEnabled ? (options.text?.headline ?? undefined) : undefined;

      const logoPos   = (options.logo?.position ?? "bottom-left") as LogoPosition;
      const textStyle = (options.text?.style ?? "cinema") as TextStyle;
      const textPos   = (options.text?.position ?? "bottom") as TextPosition;
      const textSize  = options.text?.sizePercent ? String(options.text.sizePercent) : "medium";

      const result = await compositeLogoOnImage(
        imageBuffer.toString("base64"),
        logoPos,
        "white",
        headline,
        textStyle,
        textPos,
        textSize,
        "none",
        options.text?.font,
        logoBuffer,
        options.logo?.tagline,
        options.text?.accentColor ?? options.logo?.accentColor,
        options.text?.titleColor2 ?? options.logo?.titleColor2,
        options.text?.contentType,
        options.text?.font2
      );
      return result;
    }

    return imageBuffer.toString("base64");
  } catch (err) {
    console.error("[applyCompositionLayers] error:", err);
    return rawBase64;
  }
}
