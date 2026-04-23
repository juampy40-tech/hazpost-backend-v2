/**
 * Validates that all required environment variables are present before the
 * server starts. Called from main.ts BEFORE any other module is imported.
 *
 * Two tiers:
 *  - REQUIRED_ENV_VARS  → missing any of these calls process.exit(1)
 *  - WARN_ONLY_ENV_VARS → missing these logs a warning but allows boot
 *    (features degrade gracefully when these are absent)
 *
 * Intentionally NOT in either list (has safe defaults in code):
 *  - PORT         — already validated right after this call in index.ts
 *  - JWT_SECRET   — auth.ts falls back to TOKEN_ENCRYPTION_KEY; not needed separately
 *  - APP_URL      — has hardcoded fallback "https://hazpost.app"
 *  - FRONTEND_URL — has hardcoded fallback in all callers
 *  - PIXABAY_API_KEY — optional music enrichment; scheduler checks presence before using
 *  - NODE_ENV     — optional; defaults to "development"
 */

interface EnvVarSpec {
  name: string;
  description: string;
}

/** Server CANNOT function without these. Missing any → exit(1). */
const REQUIRED_ENV_VARS: EnvVarSpec[] = [
  // ── Database ──────────────────────────────────────────────────────────────
  {
    name: "DATABASE_URL",
    description: "PostgreSQL connection string for the main database",
  },

  // ── Token Encryption & JWT ────────────────────────────────────────────────
  // Note: auth.ts uses TOKEN_ENCRYPTION_KEY as JWT fallback, but tokenEncryption.ts
  // requires TOKEN_ENCRYPTION_KEY specifically in production (throws without it).
  // Both auth and token encryption are core — this var is strictly required.
  {
    name: "TOKEN_ENCRYPTION_KEY",
    description: "AES-256 key for encrypting stored OAuth tokens (tokenEncryption.ts). Also used as JWT secret fallback in auth.ts",
  },

  // ── OpenAI (via Replit AI Integrations proxy) ─────────────────────────────
  {
    name: "AI_INTEGRATIONS_OPENAI_API_KEY",
    description: "API key for the Replit AI Integrations OpenAI proxy (all AI content and image generation)",
  },
  {
    name: "AI_INTEGRATIONS_OPENAI_BASE_URL",
    description: "Base URL for the Replit AI Integrations OpenAI proxy",
  },

  // ── Email (Resend) ────────────────────────────────────────────────────────
  {
    name: "RESEND_API_KEY",
    description: "Resend API key for transactional emails (password reset, account verification)",
  },

  // ── Google OAuth ──────────────────────────────────────────────────────────
  {
    name: "GOOGLE_CLIENT_ID",
    description: "Google OAuth client ID for Sign in with Google",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    description: "Google OAuth client secret for Sign in with Google",
  },

  // ── TikTok OAuth ──────────────────────────────────────────────────────────
  {
    name: "TIKTOK_CLIENT_KEY",
    description: "TikTok app client key for TikTok social account connection",
  },
  {
    name: "TIKTOK_CLIENT_SECRET",
    description: "TikTok app client secret for TikTok social account connection",
  },

  // ── Object / File Storage (Replit) ────────────────────────────────────────
  {
    name: "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
    description: "Replit Object Storage bucket ID for storing generated images",
  },
  {
    name: "PRIVATE_OBJECT_DIR",
    description: "Directory prefix for private objects in storage (logos, reference images)",
  },
  {
    name: "PUBLIC_OBJECT_SEARCH_PATHS",
    description: "Comma-separated search paths for public objects in storage",
  },
];

/**
 * These are feature-critical but handled gracefully in code when absent.
 * Missing them logs a warning at startup rather than blocking boot.
 *
 * - WOMPI_PUBLIC_KEY / WOMPI_PRIVATE_KEY / WOMPI_EVENTS_SECRET:
 *   Billing endpoints return HTTP 400 if missing (billing.ts:56).
 *   Not included in REQUIRED because they may not be configured in dev/staging.
 */
const WARN_ONLY_ENV_VARS: EnvVarSpec[] = [
  {
    name: "WOMPI_PUBLIC_KEY",
    description: "Wompi public key — required for payment checkout (billing will return 400 without it)",
  },
  {
    name: "WOMPI_PRIVATE_KEY",
    description: "Wompi private key — required for payment checkout (billing will return 400 without it)",
  },
  {
    name: "WOMPI_EVENTS_SECRET",
    description: "Wompi webhook secret — required for payment webhook validation",
  },
];

/**
 * Checks required env vars and exits if any are missing.
 * Logs warnings for feature-degrading (optional) vars.
 * Returns immediately if all required vars are present.
 *
 * Called from main.ts BEFORE importing any env-dependent modules.
 */
export function validateEnvVars(): void {
  const missing = REQUIRED_ENV_VARS.filter(({ name }) => !process.env[name]);

  if (missing.length > 0) {
    console.error(
      `\n[env-validator] ❌ Server cannot start — ${missing.length} required environment variable(s) are missing:\n`,
    );
    for (const { name, description } of missing) {
      console.error(`  • ${name}`);
      console.error(`    → ${description}\n`);
    }
    console.error("Configure the missing variable(s) in the Replit Secrets panel and restart the server.\n");
    process.exit(1);
  }

  console.log(
    `[env-validator] ✅ Env vars OK — all ${REQUIRED_ENV_VARS.length} required variables are present.`,
  );

  const warnMissing = WARN_ONLY_ENV_VARS.filter(({ name }) => !process.env[name]);
  if (warnMissing.length > 0) {
    console.warn(
      `[env-validator] ⚠️  ${warnMissing.length} optional feature variable(s) not set (degraded functionality):`,
    );
    for (const { name, description } of warnMissing) {
      console.warn(`    • ${name} — ${description}`);
    }
  }
}
