/**
 * Character limits for social media platforms.
 * Mirror of artifacts/api-server/src/lib/socialLimits.ts — keep in sync.
 * See skill: .agents/skills/social-caption-limits/SKILL.md
 *
 * When a platform changes its limit, update this file and the backend version.
 * Nothing else needs to change.
 */

// ── Instagram ────────────────────────────────────────────────────────────────

/** Full Instagram caption limit (caption body + "\n\n" + hashtags combined) */
export const IG_CAPTION_LIMIT = 2200;

/**
 * Warning threshold: show yellow counter when chars exceed this value.
 * Equivalent to 85% of IG_CAPTION_LIMIT.
 */
export const IG_CAPTION_WARN_THRESHOLD = Math.floor(IG_CAPTION_LIMIT * 0.85);

// ── TikTok ───────────────────────────────────────────────────────────────────

/** Full TikTok caption limit (caption body + "\n\n" + hashtags combined) */
export const TIKTOK_CAPTION_LIMIT = 2200;

/** Warning threshold for TikTok captions — 85% of the limit. */
export const TIKTOK_CAPTION_WARN_THRESHOLD = Math.floor(TIKTOK_CAPTION_LIMIT * 0.85);

// ── Facebook ─────────────────────────────────────────────────────────────────

/**
 * Facebook's technical limit is 63 206 chars, but we cap display warnings
 * at 1600 to keep the UX consistent with Instagram and TikTok.
 */
export const FB_CAPTION_LIMIT = 63206;

/** Warning threshold for Facebook captions — capped at 1600 for readability. */
export const FB_CAPTION_WARN_THRESHOLD = 1600;
