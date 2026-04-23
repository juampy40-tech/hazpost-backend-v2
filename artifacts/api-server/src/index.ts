import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startScheduler } from "./services/scheduler.service.js";
import { warmFontCache } from "./services/fontLoader.js";
import { db } from "@workspace/db";
import { imageVariantsTable, businessesTable, usersTable, subscriptionsTable, nichesTable, socialAccountsTable, plansTable, industryGroupsTable, appSettingsTable, planBenefitCatalogTable } from "@workspace/db";
import { HAZPOST_NICHES } from "./lib/hazpost-niches-seed.js";
import { eq, and, isNotNull, isNull, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { hashPassword } from "./lib/auth.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Defensa en profundidad: capturar excepciones no manejadas antes de que derriben el proceso
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[process] Unhandled Promise Rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "[process] Uncaught Exception — process will exit");
  process.exit(1);
});

/**
 * On startup, apply pending schema migrations safely using IF NOT EXISTS.
 * This handles the case where the production DB hasn't been updated yet.
 */
async function runStartupMigrations() {
  // 1. Schema migrations (idempotent)
  try {
    // Email verification columns
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
        ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMP
    `);
    // Referral columns on users
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS my_referral_code TEXT,
        ADD COLUMN IF NOT EXISTS used_referral_code TEXT
    `);
    // Add unique index for referral code if not exists
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS users_my_referral_code_unique ON users (my_referral_code) WHERE my_referral_code IS NOT NULL
    `);
    // HazPost badge toggle on businesses
    await db.execute(sql`
      ALTER TABLE businesses
        ADD COLUMN IF NOT EXISTS show_hazpost_badge BOOLEAN NOT NULL DEFAULT FALSE
    `);
    // Referral conversions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_conversions (
        id SERIAL PRIMARY KEY,
        referrer_id INTEGER NOT NULL,
        referred_user_id INTEGER NOT NULL,
        used_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        credits_awarded INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        credited_at TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS referral_conversions_referred_unique ON referral_conversions (referred_user_id)
    `);
    // Affiliate applications table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS affiliate_applications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        social_url TEXT,
        audience_size TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        commission_pct INTEGER NOT NULL DEFAULT 20,
        affiliate_code TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS affiliate_applications_user_unique ON affiliate_applications (user_id)
    `);
    // Add duration_months to affiliate_applications (custom commission period per affiliate)
    await db.execute(sql`
      ALTER TABLE affiliate_applications
        ADD COLUMN IF NOT EXISTS duration_months INTEGER NOT NULL DEFAULT 6
    `);
    // Internal support chat between HazPost users and the HazPost team
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        sender_role TEXT NOT NULL,
        content TEXT NOT NULL,
        read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
        read_by_user BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    // Persistent audit trail for critical business actions (Skill #6 — Audit Logger)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        business_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        metadata JSONB,
        ip_address TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)
    `);
    // Caption addons: user-defined texts that are auto-appended/prepended to generated captions
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS caption_addons (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER,
        business_id INTEGER,
        name        VARCHAR(150) NOT NULL,
        keywords    TEXT NOT NULL DEFAULT '',
        text        TEXT NOT NULL,
        position    VARCHAR(10) NOT NULL DEFAULT 'after',
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_caption_addons_business ON caption_addons (business_id) WHERE business_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_caption_addons_user ON caption_addons (user_id) WHERE user_id IS NOT NULL
    `);
    // Overlay brand colors + firma text per variant
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS overlay_title_color1 TEXT`);
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS overlay_title_color2 TEXT`);
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS overlay_signature_text TEXT`);
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS overlay_show_signature TEXT`);
    // Custom logo override path per variant (null = use business logo)
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS overlay_custom_logo_url TEXT`);
    // Second font for lines 2-N of the headline (optional dual-font feature)
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS overlay_font2 TEXT`);
    // Custom text per niche (adds before/after AI caption at publish time)
    await db.execute(sql`
      ALTER TABLE niches
        ADD COLUMN IF NOT EXISTS custom_text TEXT,
        ADD COLUMN IF NOT EXISTS custom_text_position TEXT NOT NULL DEFAULT 'after'
    `);
    // Enforce check constraint on custom_text_position (idempotent)
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints
          WHERE constraint_name = 'niches_custom_text_position_check'
        ) THEN
          ALTER TABLE niches
            ADD CONSTRAINT niches_custom_text_position_check
            CHECK (custom_text_position IN ('before', 'after'));
        END IF;
      END $$
    `);
    // Plans: credit_costs_json stores per-type credit costs (image/story/carousel/reel).
    // Plans: description_json stores admin-editable rich description for the pricing page.
    await db.execute(sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS credit_costs_json JSONB`);
    await db.execute(sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS description_json JSONB`);
    // Plans: extra_business_credits = credits awarded when an agency pays for an extra business slot.
    await db.execute(sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS extra_business_credits INTEGER NOT NULL DEFAULT 0`);
    // Plans: annual billing prices (freely set by admin, not auto-calculated).
    await db.execute(sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_annual_usd REAL NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_annual_cop INTEGER NOT NULL DEFAULT 0`);
    // Affiliate codes: admin-created proactive codes (separate from user-initiated applications)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS affiliate_codes (
        id              SERIAL PRIMARY KEY,
        code            TEXT NOT NULL UNIQUE,
        commission_pct  INTEGER NOT NULL DEFAULT 20,
        duration_months INTEGER NOT NULL DEFAULT 6,
        email           TEXT NOT NULL,
        notes           TEXT,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Affiliate conversions: tracks registrations that used an affiliate code
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS affiliate_conversions (
        id            SERIAL PRIMARY KEY,
        code_id       INTEGER NOT NULL REFERENCES affiliate_codes(id) ON DELETE CASCADE,
        user_id       INTEGER NOT NULL,
        plan          TEXT NOT NULL DEFAULT 'free',
        amount_usd    REAL,
        registered_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_code_id ON affiliate_conversions (code_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_conversions_user_unique ON affiliate_conversions (user_id)
    `);
    // Referral system: settings table + new columns
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_settings (
        id                    INTEGER PRIMARY KEY DEFAULT 1,
        is_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
        referrer_credits      INTEGER NOT NULL DEFAULT 30,
        referee_credits       INTEGER NOT NULL DEFAULT 10,
        referrer_free_days    INTEGER NOT NULL DEFAULT 0,
        referee_free_days     INTEGER NOT NULL DEFAULT 0,
        min_plan_for_bonus    TEXT NOT NULL DEFAULT 'starter',
        max_activation_days   INTEGER NOT NULL DEFAULT 60,
        max_referrals_per_user INTEGER NOT NULL DEFAULT 0,
        updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Seed default row (id=1) if not present
    await db.execute(sql`
      INSERT INTO referral_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING
    `);
    // Extend referral_conversions with referee bonus tracking
    await db.execute(sql`
      ALTER TABLE referral_conversions
        ADD COLUMN IF NOT EXISTS referee_credits_awarded INTEGER NOT NULL DEFAULT 0
    `);
    // Per-user referral permission flags
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS can_refer BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS can_be_referred BOOLEAN NOT NULL DEFAULT TRUE
    `);
    // Feature unlocks per user (applied by referral/promo system)
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS feature_unlocks JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    // Feature unlock toggles in referral_settings
    await db.execute(sql`
      ALTER TABLE referral_settings
        ADD COLUMN IF NOT EXISTS referrer_unlocks JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS referee_unlocks  JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    // Pending downgrade columns on subscriptions (downgrade queued to next billing cycle)
    await db.execute(sql`
      ALTER TABLE subscriptions
        ADD COLUMN IF NOT EXISTS pending_downgrade_plan TEXT,
        ADD COLUMN IF NOT EXISTS pending_downgrade_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS pending_downgrade_business_ids JSONB DEFAULT '[]'
    `);
    // Snapshot of plan capabilities at subscription creation/renewal time (Task #258)
    await db.execute(sql`
      ALTER TABLE subscriptions
        ADD COLUMN IF NOT EXISTS locked_plan_config JSONB DEFAULT NULL
    `);
    // Sub-industry level 2 column on businesses
    await db.execute(sql`
      ALTER TABLE businesses
        ADD COLUMN IF NOT EXISTS sub_industry TEXT
    `);
    // Sub-industry slug column on image_variants for precise background library matching
    await db.execute(sql`
      ALTER TABLE image_variants
        ADD COLUMN IF NOT EXISTS sub_industry_slug TEXT
    `);
    // Sub-industry column on brand_profiles to persist wizard selection
    await db.execute(sql`
      ALTER TABLE brand_profiles
        ADD COLUMN IF NOT EXISTS sub_industry TEXT
    `);
    // Auto-generation settings per business (Task #150)
    await db.execute(sql`
      ALTER TABLE businesses
        ADD COLUMN IF NOT EXISTS auto_generation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS generation_frequency VARCHAR(10) NOT NULL DEFAULT '15'
    `);
    // Delete-account OTP columns (Task #178 — 3-tier confirmation)
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS delete_otp_hash TEXT,
        ADD COLUMN IF NOT EXISTS delete_otp_expiry TIMESTAMP
    `);
    // Instagram Business Account ID cache column on social_accounts (Task #202)
    await db.execute(sql`
      ALTER TABLE social_accounts
        ADD COLUMN IF NOT EXISTS ig_user_id TEXT
    `);
    // Telegram per-user bot configuration (Task #204)
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
        ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT
    `);
    // Timezone column on users — IANA string (e.g. "Pacific/Auckland"). null = resolve from brandCountry
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT
    `);
    // Timezone column on businesses — IANA override per-business. null = inherit from user
    await db.execute(sql`
      ALTER TABLE businesses ADD COLUMN IF NOT EXISTS timezone TEXT
    `);
    logger.info("Startup migrations applied (all schema updates)");
  } catch (err) {
    logger.warn({ err }, "Startup migration skipped or already applied");
  }

  // 1d. Add post_number column (DDL only — backfill runs later after business_id is guaranteed set).
  try {
    await db.execute(sql`
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_number INTEGER
    `);
  } catch (err) {
    logger.warn({ err }, "post_number column DDL skipped");
  }

  // 1e. Add generation_cost_usd column to posts for platform cost tracking.
  try {
    await db.execute(sql`
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS generation_cost_usd NUMERIC(8,4)
    `);
  } catch (err) {
    logger.warn({ err }, "generation_cost_usd column DDL skipped");
  }

  // 1f-extra. Referral codes table — custom referral codes with per-code overrides.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id                SERIAL PRIMARY KEY,
        code              VARCHAR(50) NOT NULL UNIQUE,
        referrer_credits  INTEGER NOT NULL DEFAULT 0,
        referee_credits   INTEGER NOT NULL DEFAULT 0,
        referrer_free_days INTEGER NOT NULL DEFAULT 0,
        referee_free_days  INTEGER NOT NULL DEFAULT 0,
        min_plan_for_bonus VARCHAR(50) DEFAULT 'starter',
        description       TEXT,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("Referral codes table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "referral_codes table DDL skipped");
  }

  // 1f. Plan benefit catalog table — stores the master list of benefit definitions.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS plan_benefit_catalog (
        id            SERIAL PRIMARY KEY,
        key           VARCHAR(100) NOT NULL UNIQUE,
        label_template TEXT NOT NULL,
        has_value     BOOLEAN NOT NULL DEFAULT FALSE,
        is_auto       BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err) {
    logger.warn({ err }, "plan_benefit_catalog table DDL skipped");
  }

  // 1h. Plan capability limits — new columns for bulk scheduling limits, content type
  //     restrictions, business plan inheritance, and annual extra business pricing.
  try {
    await db.execute(sql`
      ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS bulk_max_posts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS allowed_content_types TEXT[] NOT NULL DEFAULT '{image,story,carousel,reel}',
        ADD COLUMN IF NOT EXISTS includes_business_plan BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS extra_business_price_annual_usd REAL NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS extra_business_price_annual_cop INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS element_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE
    `);
    logger.info("Plan capability columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Plan capability columns DDL skipped");
  }

  // 1f1b. businesses + image_variants: columna country para restricción N2 por país.
  //       Los negocios existentes quedan con country = NULL → el selector de Settings lo rellena.
  //       Las imágenes históricas quedan con country = NULL → solo se muestran en N1 propio.
  try {
    await db.execute(sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS country TEXT`);
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS country TEXT`);
    logger.info("businesses.country + image_variants.country columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "country columns DDL skipped");
  }

  // 1f2. media_library: columna business_id para aislamiento por negocio.
  //      Los medios históricos quedan con business_id = NULL — son accesibles solo
  //      por su owner (userId). Los nuevos medios llevarán business_id del negocio activo.
  try {
    await db.execute(sql`ALTER TABLE media_library ADD COLUMN IF NOT EXISTS business_id INTEGER`);
    logger.info("media_library.business_id column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "media_library.business_id DDL skipped");
  }

  // 1g. Tenant integrity enforcement: trigger que previene INSERT/UPDATE en posts
  //     donde user_id no coincide con businesses.user_id.
  //
  //     NOTA ARQUITECTÓNICA: Se usa un trigger en lugar de CHECK constraint porque
  //     PostgreSQL NO permite subqueries dentro de CHECK constraints. Un CHECK solo
  //     puede referenciar columnas de la misma fila, no otras tablas.
  //     El trigger BEFORE INSERT OR UPDATE es equivalente en protección y seguro
  //     para producción porque solo afecta operaciones futuras — la data existente
  //     no se modifica. Idempotente: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER.
  try {
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION enforce_post_tenant_integrity()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.business_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM businesses WHERE id = NEW.business_id AND user_id = NEW.user_id
          ) THEN
            RAISE EXCEPTION 'tenant violation: posts.user_id=% does not own business_id=%',
              NEW.user_id, NEW.business_id;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await db.execute(sql`
      DROP TRIGGER IF EXISTS trg_post_tenant_integrity ON posts
    `);
    await db.execute(sql`
      CREATE TRIGGER trg_post_tenant_integrity
      BEFORE INSERT OR UPDATE ON posts
      FOR EACH ROW EXECUTE FUNCTION enforce_post_tenant_integrity()
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_posts_user_business ON posts (user_id, business_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_niches_user_business ON niches (user_id, business_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_content_history_user ON content_history (user_id)
      WHERE user_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_content_history_business ON content_history (business_id)
      WHERE business_id IS NOT NULL
    `);
    logger.info("Tenant integrity trigger and indexes applied");
  } catch (err) {
    logger.warn({ err }, "Tenant integrity setup skipped or already applied");
  }

  // 1b. Ensure admin user (id=1) always exists in the DB.
  //     If the users table is empty (e.g. after a DB reset), recreate it automatically
  //     so sessions/JWTs continue to work without manual intervention.
  try {
    const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, 1)).limit(1);
    if (!existingUser) {
      const ADMIN_EMAIL = process.env["ADMIN_EMAIL"] ?? "juampy40@gmail.com";
      const ADMIN_PASS  = process.env["ADMIN_PASSWORD"] ?? "Eco2024$$";
      const pwHash = await hashPassword(ADMIN_PASS);
      await db.execute(sql`
        INSERT INTO users (id, email, password_hash, role, plan, display_name, is_active, ai_credits, email_verified)
        VALUES (1, ${ADMIN_EMAIL}, ${pwHash}, 'admin', 'agency', 'Admin', 'true', 800, true)
        ON CONFLICT (id) DO NOTHING
      `);
      await db.execute(sql`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))`);
      // Also ensure subscription exists
      await db.execute(sql`
        INSERT INTO subscriptions (user_id, plan, status, credits_remaining, credits_total, reels_remaining, reels_total, period_end)
        VALUES (1, 'agency', 'active', 800, 800, 150, 150, NOW() + INTERVAL '30 days')
        ON CONFLICT DO NOTHING
      `);
      logger.info({ email: ADMIN_EMAIL }, "Admin user (id=1) recreated after DB reset");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to ensure admin user exists — skipping");
  }

  // 1c. Backfill business_id for all data that belongs to user 1 but has business_id=NULL.
  //     Required because the business isolation feature was added after data was already created.
  //     Safe to run multiple times (idempotent — only affects rows where business_id IS NULL).
  try {
    // Find the default (ECO) business for user 1
    const [defaultBiz] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, 1), eq(businessesTable.isDefault, true), eq(businessesTable.isActive, true)))
      .limit(1);

    if (defaultBiz) {
      const bizId = defaultBiz.id;
      // Backfill all tables that have business_id but it's NULL for user 1 data
      await db.execute(sql`UPDATE posts SET user_id = 1, business_id = ${bizId} WHERE business_id IS NULL AND (user_id = 1 OR user_id IS NULL)`);
      await db.execute(sql`UPDATE niches SET user_id = 1, business_id = ${bizId} WHERE business_id IS NULL AND (user_id = 1 OR user_id IS NULL)`);
      await db.execute(sql`UPDATE social_accounts SET business_id = ${bizId} WHERE business_id IS NULL AND user_id = 1`);
      await db.execute(sql`UPDATE content_history SET user_id = 1, business_id = ${bizId} WHERE business_id IS NULL AND (user_id = 1 OR user_id IS NULL)`);
      await db.execute(sql`UPDATE conversations SET user_id = 1, business_id = ${bizId} WHERE business_id IS NULL AND (user_id = 1 OR user_id IS NULL)`);
      logger.info({ bizId }, "Business ID backfill applied (idempotent — rows already migrated are unchanged)");
    }
  } catch (err) {
    logger.warn({ err }, "Business ID backfill skipped or already done");
  }

  // 1f. Backfill post_number (runs AFTER 1c so business_id is guaranteed set on all rows).
  //     Idempotent: only fills rows where post_number IS NULL.
  //     After the business_id backfill, all posts for a given user should have business_id set,
  //     so we partition by business_id. The user_id fallback catches any true orphan rows.
  //     Also enforces a unique index to prevent future duplicates.
  try {
    // Backfill posts that have business_id (the normal case after 1c runs)
    await db.execute(sql`
      UPDATE posts p
      SET post_number = sub.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY id) AS rn
        FROM posts
        WHERE business_id IS NOT NULL AND post_number IS NULL
      ) sub
      WHERE p.id = sub.id
    `);
    // Backfill any truly orphaned posts without business_id (partitioned by user_id as safety net)
    await db.execute(sql`
      UPDATE posts p
      SET post_number = sub.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id) AS rn
        FROM posts
        WHERE business_id IS NULL AND user_id IS NOT NULL AND post_number IS NULL
      ) sub
      WHERE p.id = sub.id
    `);
    // Unique constraint: one post_number per business (NULL business_id rows are excluded)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_business_post_number
      ON posts (business_id, post_number)
      WHERE business_id IS NOT NULL AND post_number IS NOT NULL
    `);
    logger.info("post_number column ensured and backfilled (idempotent)");
  } catch (err: unknown) {
    // Silently ignore unique constraint violations (23505) — index already exists from a prior startup.
    // Any other error is still surfaced as a warning.
    const pgCode = (err as { code?: string })?.code;
    if (pgCode !== "23505") {
      logger.warn({ err }, "post_number backfill skipped or already done");
    }
  }

  // 1h. Task #152 — Clean contaminated posts for user #8 (contacto@clubventas.com).
  //     Root cause: frontend may have sent a stale businessId from another tenant,
  //     causing niches and brand context from that tenant to be used for generation.
  //     Fix: delete posts where user_id=8 but business_id is owned by a different user
  //     (structural cross-tenant contamination). Posts with correct business but wrong
  //     CONTENT are marked 'rejected' so the user can regenerate.
  //     Idempotent: runs every startup but only affects user #8 rows.
  try {
    // Step 1: Delete structurally contaminated posts (business belongs to another user)
    const deletedContaminated = await db.execute(sql`
      DELETE FROM posts
      WHERE user_id = 8
        AND business_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM businesses WHERE id = posts.business_id AND user_id = 8
        )
      RETURNING id
    `);
    const deletedCount = (deletedContaminated as unknown as { rowCount: number }).rowCount ?? 0;
    if (deletedCount > 0) {
      logger.warn({ deletedCount }, "[Task#152] Deleted structurally contaminated posts for user #8 (businessId belonged to another tenant)");
    }

    // NOTE: We do NOT blanket-reject pending_approval posts for user #8 with the
    // correct business_id — those posts may be legitimate content generated correctly.
    // Content-level contamination (correct owner, wrong topic) requires manual review
    // by the user; they can reject individual posts themselves via the approval workflow.
    // Only structurally contaminated posts (wrong business owner) are auto-deleted above.

    if (deletedCount === 0) {
      logger.info("[Task#152] User #8 cleanup: no structurally contaminated posts found (already clean or user does not exist)");
    }
  } catch (err) {
    logger.warn({ err }, "[Task#152] User #8 contamination cleanup skipped");
  }

  // 1g-pre. Backfill brand context fields from brand_profiles → businesses (Task #157).
  //         Ensures that all users who completed onboarding before the full mirror sync was added
  //         now have description, slogan, audience, tone, font, location in their default business.
  //         COALESCE ensures we never overwrite data that was already set on businesses directly.
  try {
    const backfillResult = await db.execute(sql`
      UPDATE businesses b
      SET
        slogan           = COALESCE(b.slogan,            bp.slogan),
        description      = COALESCE(b.description,       bp.business_description),
        audience_description = COALESCE(b.audience_description, bp.audience_description),
        brand_tone       = COALESCE(b.brand_tone,        bp.brand_tone),
        brand_font       = COALESCE(b.brand_font,        bp.brand_font),
        logo_urls        = COALESCE(b.logo_urls,         bp.logo_urls),
        default_location = COALESCE(b.default_location,  bp.default_location)
      FROM brand_profiles bp
      WHERE bp.user_id = b.user_id
        AND b.is_default = true
        AND (
          b.slogan IS NULL OR
          b.description IS NULL OR
          b.audience_description IS NULL OR
          b.brand_tone IS NULL
        )
    `);
    const rowCount = (backfillResult as { rowCount?: number })?.rowCount ?? 0;
    if (rowCount > 0) {
      logger.info({ rowCount }, "[Task#157] Brand context backfill applied: businesses updated from brand_profiles");
    } else {
      logger.info("[Task#157] Brand context backfill: nothing to update (all businesses already have context data)");
    }
  } catch (err) {
    logger.warn({ err }, "[Task#157] Brand context backfill skipped");
  }

  // 1g. Seed starter niches for any business with 0 niches.
  //     Runs on every startup but only inserts when niches are missing — fully idempotent.
  //     Fixes production businesses created before the auto-seed was added in Task #51.
  try {
    const STARTER_NICHES = [
      { name: "Tips y consejos",         description: "Consejos prácticos y recomendaciones útiles para tu audiencia." },
      { name: "Testimonios y resultados", description: "Historias de éxito, testimonios de clientes y resultados obtenidos." },
      { name: "Productos y servicios",    description: "Presentación y promoción de tus productos o servicios principales." },
    ];
    const allBizRows = await db
      .select({ id: businessesTable.id, userId: businessesTable.userId })
      .from(businessesTable)
      .where(eq(businessesTable.isActive, true));
    let seededCount = 0;
    for (const biz of allBizRows) {
      const existingNiches = await db
        .select({ id: nichesTable.id })
        .from(nichesTable)
        .where(and(eq(nichesTable.businessId, biz.id), eq(nichesTable.active, true)));
      if (existingNiches.length === 0) {
        await db.insert(nichesTable).values(
          STARTER_NICHES.map(n => ({
            name: n.name,
            description: n.description,
            keywords: "",
            active: true,
            userId: biz.userId,
            businessId: biz.id,
          }))
        );
        seededCount++;
        logger.info({ bizId: biz.id, userId: biz.userId }, "Seeded starter niches for business with 0 niches");
      }
    }
    if (seededCount > 0) {
      logger.info({ seededCount }, "Starter niches seeded for businesses");
    } else {
      logger.info("No starter niche seeding needed (all businesses have niches)");
    }
  } catch (err) {
    logger.warn({ err }, "Starter niche seed skipped or failed");
  }

  // 2. Seed ECO Energía Solar business for user 1 if they have zero businesses.
  //    (Previous deployments may have created it under user 2 — Step 3 handles migration.)
  try {
    const MAIN_USER_ID = 1;
    const existingU1 = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, MAIN_USER_ID), eq(businessesTable.isActive, true)));

    // Also check if user 2 still has businesses (means migration hasn't run yet — Step 3 will handle)
    const existingU2 = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, 2), eq(businessesTable.isActive, true)));

    if (existingU1.length === 0 && existingU2.length === 0) {
      // Fresh install: seed directly for user 1
      await db.insert(businessesTable).values({
        userId: MAIN_USER_ID,
        name: "ECO Energía Solar",
        industry: "Energías renovables",
        description: "Instalación y mantenimiento de paneles solares para hogares y empresas. Expertos en ahorro energético y transición a energías limpias en Colombia.",
        brandTone: "Profesional y confiable",
        chatbotKnowledge: "ECO Energía Solar es una empresa colombiana especializada en paneles solares fotovoltaicos. Ofrecemos instalación residencial y comercial, mantenimiento preventivo y correctivo, financiación flexible y asesoría técnica. Principales beneficios: ahorro hasta 70% en factura eléctrica, créditos de carbono, independencia energética, garantía de equipos 25 años. Operamos en Cali y toda la región del Valle del Cauca.",
        isDefault: true,
        isActive: true,
        onboardingCompleted: false,
        sortOrder: 0,
      });
      logger.info({ userId: MAIN_USER_ID }, "Seeded ECO Energía Solar business for user 1");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to seed ECO business on startup");
  }

  // 3. Migrate ALL data from user 2 → user 1 (move ECO under the main account).
  //    Guard: if user 1 already has businesses, this migration already ran — skip.
  //    Safe: subscriptions and credit_purchases stay with user 2 (billing is separate).
  try {
    const alreadyMigrated = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, 1), eq(businessesTable.isActive, true)));

    const user2HasData = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.userId, 2));

    if (alreadyMigrated.length === 0 && user2HasData.length > 0) {
      logger.info("Migrating all data from user 2 → user 1…");

      // Make sure user 1 has no other default businesses before we set this one
      await db.execute(sql`UPDATE businesses SET is_default = FALSE WHERE user_id = 1`);

      // Move businesses (set first one as default for user 1)
      await db.execute(sql`
        UPDATE businesses SET user_id = 1, is_default = TRUE
        WHERE user_id = 2 AND is_active = TRUE
          AND id = (SELECT id FROM businesses WHERE user_id = 2 AND is_active = TRUE ORDER BY id LIMIT 1)
      `);
      await db.execute(sql`
        UPDATE businesses SET user_id = 1, is_default = FALSE
        WHERE user_id = 2
      `);

      // Move posts
      await db.execute(sql`UPDATE posts SET user_id = 1 WHERE user_id = 2`);
      // Move niches
      await db.execute(sql`UPDATE niches SET user_id = 1 WHERE user_id = 2`);
      // Move social accounts
      await db.execute(sql`UPDATE social_accounts SET user_id = 1 WHERE user_id = 2`);
      // Move landing pages
      await db.execute(sql`UPDATE landing_pages SET user_id = 1 WHERE user_id = 2`);
      // Move media library
      await db.execute(sql`UPDATE media_library SET user_id = 1 WHERE user_id = 2`);
      // Move publish log
      await db.execute(sql`UPDATE publish_log SET user_id = 1 WHERE user_id = 2`);
      // Move publishing schedules
      await db.execute(sql`UPDATE publishing_schedules SET user_id = 1 WHERE user_id = 2`);
      // Move content history
      await db.execute(sql`UPDATE content_history SET user_id = 1 WHERE user_id = 2`);
      // Move generation batches
      await db.execute(sql`UPDATE generation_batches SET user_id = 1 WHERE user_id = 2`);
      // Move image variants
      await db.execute(sql`UPDATE image_variants SET user_id = 1 WHERE user_id = 2`);
      // Move conversations (messages link via conversation_id — no userId to update)
      await db.execute(sql`UPDATE conversations SET user_id = 1 WHERE user_id = 2`);

      // brand_profiles has unique constraint on user_id — handle carefully
      const u1Profile = await db.execute(sql`SELECT id FROM brand_profiles WHERE user_id = 1 LIMIT 1`);
      if ((u1Profile.rows?.length ?? 0) === 0) {
        await db.execute(sql`UPDATE brand_profiles SET user_id = 1 WHERE user_id = 2`);
      } else {
        // User 1 already has a profile — discard user 2's duplicate
        await db.execute(sql`DELETE FROM brand_profiles WHERE user_id = 2`);
      }

      logger.info("Migration user 2 → user 1 completed successfully");
    } else if (alreadyMigrated.length > 0) {
      logger.info({ count: alreadyMigrated.length }, "User 1 already has businesses — migration already done, skipping");
    }
  } catch (err) {
    logger.error({ err }, "Failed to migrate user 2 → user 1 on startup");
  }

  // 4. Seed HazPost corporate business for user 1 (demo, marketing, testing account).
  //    Only creates it if it doesn't already exist.
  try {
    const hazpostExists = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, 1), eq(businessesTable.name, "HazPost")));

    if (hazpostExists.length === 0) {
      await db.insert(businessesTable).values({
        userId: 1,
        name: "HazPost",
        industry: "SaaS / Marketing de contenidos con IA",
        description: "Plataforma todo-en-uno que genera posts, reels y carruseles con inteligencia artificial y los publica automáticamente en Instagram, TikTok y Facebook. La IA aprende del estilo, tono y resultados de cada negocio para mejorar cada publicación.",
        brandTone: "Innovador, cercano y aspiracional. Habla de posibilidades, automatización y crecimiento sin complicaciones.",
        audienceDescription: "Emprendedores, pymes, agencias de marketing digital, community managers y negocios latinoamericanos que quieren crecer en redes sociales sin invertir horas diarias en contenido.",
        products: `
- Plan Básico: 1 negocio, 30 posts/mes con IA, publicación manual
- Plan Emprendedor: 1 negocio, 100 posts/mes, publicación automática, chatbot IA
- Plan Negocio: 3 negocios, posts ilimitados, generador masivo, estadísticas avanzadas
- Plan Agencia: 5 negocios, todo incluido, cola de aprobación, biblioteca de fondos
- Generador masivo de contenido: crea 30 posts en segundos
- Chatbot IA por negocio: responde preguntas frecuentes con contexto propio
- Publicación automática a Instagram, TikTok y Facebook
- Aprobación de contenido antes de publicar
- Biblioteca de fondos y plantillas de marca
- Estadísticas de engagement y alcance
- Nichos con hashtags optimizados por industria
        `.trim(),
        chatbotKnowledge: `
HazPost es una plataforma SaaS de gestión de redes sociales con inteligencia artificial, diseñada para el mercado latinoamericano. Disponible en hazpost.app.

PLANES Y PRECIOS:
- Básico: Para creadores individuales que empiezan. 1 negocio, 30 generaciones de contenido con IA al mes. Gestión manual de publicaciones.
- Emprendedor: Para negocios activos. 1 negocio, 100 generaciones/mes, publicación automática programada, chatbot IA con conocimiento del negocio.
- Negocio: Para marcas en crecimiento. Hasta 3 negocios, generaciones ilimitadas, generador masivo (30 posts en segundos), estadísticas detalladas, biblioteca de fondos de marca.
- Agencia: Para agencias y freelancers. Hasta 5 negocios de clientes, todo el plan Negocio más cola de aprobación de contenido, gestión multi-cuenta.

CARACTERÍSTICAS PRINCIPALES:
1. Generación de contenido con IA: La IA crea posts, reels y carruseles adaptados al tono, industria y audiencia de cada negocio. Aprende de qué funciona mejor.
2. Publicación automática: Conecta Instagram, TikTok y Facebook. Programa y olvídate.
3. Chatbot por negocio: Cada negocio tiene su propio chatbot entrenado con su información, productos y servicios.
4. Generador masivo: Crea hasta 30 variaciones de contenido en segundos para tener un mes de publicaciones listo.
5. Cola de aprobación: Las agencias pueden revisar y aprobar contenido antes de publicar para sus clientes.
6. Nichos inteligentes: Sistema de hashtags y estrategias optimizadas por industria para maximizar alcance orgánico.
7. Estadísticas: Seguimiento de engagement, alcance y rendimiento por red social.
8. Biblioteca de fondos: Sube fondos de tu marca para que la IA los use en las imágenes generadas.

DIFERENCIADORES CLAVE:
- IA que aprende del negocio específico (no contenido genérico)
- Pensado para Colombia y Latinoamérica (español, contexto local)
- Pagos con Wompi (PSE, tarjetas crédito/débito locales)
- WhatsApp sharing integrado
- Soporte en español

PREGUNTAS FRECUENTES:
- ¿Funciona con TikTok? Sí, con API oficial de TikTok (en revisión de Meta/TikTok).
- ¿La IA es realmente original? Sí, cada post es único y adaptado al negocio.
- ¿Puedo cancelar cuando quiera? Sí, sin permanencia.
- ¿Hay prueba gratuita? El plan básico es muy económico para empezar.
        `.trim(),
        primaryColor: "#00C2FF",
        secondaryColor: "#0A0A1A",
        brandFont: "Poppins",
        defaultLocation: "Colombia / Latinoamérica",
        isDefault: false,
        isActive: true,
        onboardingCompleted: true,
        sortOrder: 1,
      });
      logger.info({ userId: 1 }, "Seeded HazPost corporate business for user 1");
    } else {
      logger.info("HazPost business already exists for user 1 — skipping seed");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to seed HazPost business on startup");
  }

  // Seed 103 niches for HazPost business (business_id=2) — idempotent
  try {
    const hazBiz = await db.select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(eq(businessesTable.userId, 1), eq(businessesTable.name, "HazPost")))
      .limit(1);

    if (hazBiz.length > 0) {
      const hazBizId = hazBiz[0]!.id;
      const existingCount = await db.$count(nichesTable, and(eq(nichesTable.userId, 1), eq(nichesTable.businessId, hazBizId)));

      if (existingCount === 0) {
        await db.insert(nichesTable).values(
          HAZPOST_NICHES.map((n) => ({
            userId: 1,
            businessId: hazBizId,
            name: n.name,
            description: n.description,
            keywords: n.keywords,
            isActive: true,
          }))
        );
        logger.info({ count: HAZPOST_NICHES.length, bizId: hazBizId }, "Seeded HazPost niches");
      } else {
        logger.info({ existingCount, bizId: hazBizId }, "HazPost niches already seeded — skipping");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Failed to seed HazPost niches on startup");
  }

  // Seed default plans into the plans table (idempotent — only runs if the table is empty).
  // Once seeded, the admin can edit prices/credits via the admin panel → /admin/planes.
  try {
    const existingPlans = await db.select({ id: plansTable.id }).from(plansTable).limit(1);
    if (existingPlans.length === 0) {
      await db.insert(plansTable).values([
        {
          key: "free",
          name: "Gratis",
          priceUsd: 0,
          priceCop: 0,
          creditsPerMonth: 10,
          reelsPerMonth: 0,
          businessesAllowed: 1,
          durationDays: 30,
          extraBusinessPriceUsd: 0,
          canDelete: false,
          isActive: true,
          sortOrder: 0,
        },
        {
          key: "starter",
          name: "Starter",
          priceUsd: 18,
          priceCop: 69000,
          creditsPerMonth: 50,
          reelsPerMonth: 5,
          businessesAllowed: 1,
          durationDays: 30,
          extraBusinessPriceUsd: 0,
          canDelete: true,
          isActive: true,
          sortOrder: 1,
        },
        {
          key: "business",
          name: "Business",
          priceUsd: 39,
          priceCop: 149000,
          creditsPerMonth: 150,
          reelsPerMonth: 15,
          businessesAllowed: 3,
          durationDays: 30,
          extraBusinessPriceUsd: 0,
          canDelete: true,
          isActive: true,
          sortOrder: 2,
        },
        {
          key: "agency",
          name: "Agency",
          priceUsd: 79,
          priceCop: 299000,
          creditsPerMonth: 500,
          reelsPerMonth: 50,
          businessesAllowed: 5,
          durationDays: 30,
          extraBusinessPriceUsd: 15,
          canDelete: true,
          isActive: true,
          sortOrder: 3,
        },
      ]);
      logger.info("Seeded default plans into plans table");
    } else {
      logger.info("Plans already seeded — skipping");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to seed plans on startup");
  }

  // One-time migration: update plans to canonical HazPost spec if not already done.
  // Uses app_settings version key "plans_spec_version" = "v2" as a migration flag.
  // Once applied, admin can freely edit plans — this migration will NOT run again.
  try {
    const migKey = "plans_spec_version";
    const [migFlag] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, migKey)).limit(1);
    if (!migFlag || migFlag.value !== "v2") {
      const canonicalPlans = [
        { key: "free",     name: "Gratis",       priceUsd: 0,      priceCop: 0,       creditsPerMonth: 40,   reelsPerMonth: 5,  businessesAllowed: 1, extraBusinessPriceUsd: 0,     sortOrder: 0, canDelete: false },
        { key: "starter",  name: "Emprendedor",  priceUsd: 29.99,  priceCop: 119900,  creditsPerMonth: 120,  reelsPerMonth: 10, businessesAllowed: 1, extraBusinessPriceUsd: 0,     sortOrder: 1, canDelete: true  },
        { key: "business", name: "Negocio",      priceUsd: 49.99,  priceCop: 199900,  creditsPerMonth: 220,  reelsPerMonth: 15, businessesAllowed: 1, extraBusinessPriceUsd: 0,     sortOrder: 2, canDelete: true  },
        { key: "agency",   name: "Agencia",      priceUsd: 199.99, priceCop: 799900,  creditsPerMonth: 1100, reelsPerMonth: 50, businessesAllowed: 5, extraBusinessPriceUsd: 29.99, sortOrder: 3, canDelete: true  },
      ];
      for (const plan of canonicalPlans) {
        await db
          .insert(plansTable)
          .values({ ...plan, durationDays: 30, isActive: true, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: plansTable.key,
            set: {
              name:                  plan.name,
              priceUsd:              plan.priceUsd,
              priceCop:              plan.priceCop,
              creditsPerMonth:       plan.creditsPerMonth,
              reelsPerMonth:         plan.reelsPerMonth,
              businessesAllowed:     plan.businessesAllowed,
              extraBusinessPriceUsd: plan.extraBusinessPriceUsd,
              sortOrder:             plan.sortOrder,
              updatedAt:             new Date(),
            },
          });
      }
      // Mark migration as done — will NOT run again on subsequent restarts
      await db
        .insert(appSettingsTable)
        .values({ key: migKey, value: "v2", updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: "v2", updatedAt: new Date() } });
      logger.info("Plans updated to canonical HazPost spec v2 (one-time migration applied)");
    } else {
      logger.info("Plans spec v2 already applied — skipping plan migration");
    }
    // Idempotent: ensure extra_business_slots column exists in subscriptions (in case DB push wasn't run).
    await db.execute(sql`
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS extra_business_slots INTEGER NOT NULL DEFAULT 0
    `);
    // Idempotent: seed extra_business_credits = 220 for agency if still at default 0.
    await db.execute(
      sql`UPDATE plans SET extra_business_credits = 220 WHERE key = 'agency' AND extra_business_credits = 0`
    );
    // Idempotent: seed extra business pricing for business plan ($49.99/mes, $499.90/año, 100 créditos).
    await db.execute(sql`
      UPDATE plans SET
        extra_business_price_usd        = 49.99,
        extra_business_price_annual_usd = 499.90,
        extra_business_credits          = 100
      WHERE key = 'business' AND extra_business_price_usd = 0
    `);
    // Idempotent: add extra_business_addon catalog feature to business plan description_json.
    await db.execute(sql`
      UPDATE plans
      SET description_json = jsonb_set(
        description_json,
        '{features}',
        (description_json->'features') || '[{"catalogKey":"extra_business_addon","enabled":true}]'::jsonb
      )
      WHERE key = 'business'
        AND description_json IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(description_json->'features') f
          WHERE f->>'catalogKey' = 'extra_business_addon'
        )
    `);
  } catch (err) {
    logger.warn({ err }, "Failed to apply plans spec v2 migration on startup");
  }

  // One-time migration: seed description_json (CMS copy) for all plans.
  // Uses app_settings version key "plans_cms_version" = "v1" as a migration flag.
  // Once applied, admin can freely edit plan descriptions via the admin panel → CMS de Planes.
  try {
    const cmsMigKey = "plans_cms_version";
    const [cmsFlag] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, cmsMigKey)).limit(1);
    if (!cmsFlag || cmsFlag.value !== "v1") {
      const defaultDescriptions: Record<string, { description: string; features: { text: string; enabled: boolean }[]; badge: string | null }> = {
        free: {
          description: "Para comenzar sin costo",
          badge: null,
          features: [
            { text: "40 créditos/mes",                              enabled: true  },
            { text: "Instagram y TikTok",                           enabled: true  },
            { text: "Generación de captions con IA",                enabled: true  },
            { text: "Programación de posts",                        enabled: true  },
            { text: "1 negocio",                                    enabled: true  },
          ],
        },
        starter: {
          description: "Ideal para emprendedores en crecimiento",
          badge: null,
          features: [
            { text: "120 créditos/mes",                             enabled: true  },
            { text: "Instagram, TikTok y Facebook",                 enabled: true  },
            { text: "Generación de captions con IA",                enabled: true  },
            { text: "Bulk scheduling (hasta 30 posts)",             enabled: true  },
            { text: "3 nichos de contenido",                        enabled: true  },
            { text: "Reel Studio con transiciones",                 enabled: true  },
            { text: "Biblioteca de fondos",                         enabled: true  },
          ],
        },
        business: {
          description: "Para marcas y equipos establecidos",
          badge: "Más popular",
          features: [
            { text: "220 créditos/mes",                             enabled: true  },
            { text: "Instagram, TikTok y Facebook",                 enabled: true  },
            { text: "Captions avanzados con IA",                    enabled: true  },
            { text: "Bulk scheduling ilimitado",                    enabled: true  },
            { text: "Nichos ilimitados",                            enabled: true  },
            { text: "Analytics avanzado",                           enabled: true  },
            { text: "Notificaciones Telegram",                      enabled: true  },
            { text: "Páginas de landing personalizadas",            enabled: true  },
          ],
        },
        agency: {
          description: "Para agencias y múltiples marcas",
          badge: "Pro",
          features: [
            { text: "1100 créditos/mes",                            enabled: true  },
            { text: "Hasta 5 negocios incluidos",                   enabled: true  },
            { text: "Todo lo del plan Negocio",                     enabled: true  },
            { text: "Negocios adicionales por $29.99 USD/mes",      enabled: true  },
            { text: "Soporte prioritario",                          enabled: true  },
            { text: "Personalización de marca completa",            enabled: true  },
          ],
        },
      };
      for (const [key, desc] of Object.entries(defaultDescriptions)) {
        await db.execute(
          sql`UPDATE plans SET description_json = ${JSON.stringify(desc)}::jsonb WHERE key = ${key} AND description_json IS NULL`
        );
      }
      await db
        .insert(appSettingsTable)
        .values({ key: cmsMigKey, value: "v1", updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: "v1", updatedAt: new Date() } });
      logger.info("Plans CMS descriptions seeded (v1)");
    } else {
      logger.info("Plans CMS descriptions already seeded — skipping");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to seed plans CMS descriptions");
  }

  // Seed default credit costs per content type into app_settings (idempotent).
  // Once seeded, the admin can edit them from the admin panel → /admin/planes → "Costos de Generación".
  try {
    const defaults: Record<string, string> = {
      credit_cost_image:     "1",
      credit_cost_story:     "1",
      credit_cost_carousel:  "5",
      credit_cost_reel:      "6",
      credit_cost_element_ai: "3",
    };
    for (const [key, value] of Object.entries(defaults)) {
      await db
        .insert(appSettingsTable)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoNothing();
    }
    logger.info("Credit cost settings seeded (idempotent)");

    // Sync credit_costs_json column on plans table (idempotent — only writes if NULL).
    // Plans with null credit_costs_json inherit the global app_settings defaults.
    // Admin edits via the panel update both app_settings and plans.credit_costs_json.
    const globalCosts = { image: 1, story: 1, carousel: 5, reel: 6 };
    await db.execute(
      sql`UPDATE plans SET credit_costs_json = ${JSON.stringify(globalCosts)}::jsonb WHERE credit_costs_json IS NULL`
    );
  } catch (err) {
    logger.warn({ err }, "Failed to seed credit cost settings on startup");
  }

  // Seed plan benefit catalog (idempotent — uses ON CONFLICT DO NOTHING on unique key).
  try {
    const DEFAULT_BENEFITS = [
      { key: "ai_credits",            labelTemplate: "Créditos de IA por mes: {value}",                     hasValue: true,  isAuto: true,  sortOrder: 1  },
      { key: "reels_per_month",       labelTemplate: "Reels por mes: {value}",                               hasValue: true,  isAuto: true,  sortOrder: 2  },
      { key: "businesses",            labelTemplate: "Hasta {value} negocio(s)",                             hasValue: true,  isAuto: true,  sortOrder: 3  },
      { key: "auto_generation",       labelTemplate: "Generación automática de contenido",                    hasValue: false, isAuto: false, sortOrder: 4  },
      { key: "calendar_scheduling",   labelTemplate: "Calendario y programación",                            hasValue: false, isAuto: false, sortOrder: 5  },
      { key: "scheduling",            labelTemplate: "Publicación programada a Instagram, TikTok y Facebook", hasValue: false, isAuto: false, sortOrder: 6  },
      { key: "bulk_max_7",            labelTemplate: "Bulk scheduling hasta 7 posts",                        hasValue: false, isAuto: false, sortOrder: 7  },
      { key: "bulk_max_30",           labelTemplate: "Bulk scheduling hasta 30 posts",                       hasValue: false, isAuto: false, sortOrder: 8  },
      { key: "bulk_max_60",           labelTemplate: "Bulk scheduling hasta 60 posts",                       hasValue: false, isAuto: false, sortOrder: 9  },
      { key: "content_images_only",   labelTemplate: "Tipo de publicación: solo imágenes e historias",        hasValue: false, isAuto: false, sortOrder: 10 },
      { key: "content_all_types",     labelTemplate: "Todos los tipos de publicación",                       hasValue: false, isAuto: false, sortOrder: 11 },
      { key: "brand_profile",         labelTemplate: "Perfil de marca personalizado",                        hasValue: false, isAuto: false, sortOrder: 12 },
      { key: "statistics",            labelTemplate: "Estadísticas e informes",                              hasValue: false, isAuto: false, sortOrder: 13 },
      { key: "analytics",             labelTemplate: "Métricas avanzadas de engagement",                     hasValue: false, isAuto: false, sortOrder: 14 },
      { key: "telegram_notifications",labelTemplate: "Notificaciones Telegram",                              hasValue: false, isAuto: false, sortOrder: 15 },
      { key: "landing_pages",         labelTemplate: "Landing pages con IA",                                 hasValue: false, isAuto: false, sortOrder: 16 },
      { key: "multi_business",        labelTemplate: "Gestión multi-negocio",                                hasValue: false, isAuto: false, sortOrder: 17 },
      { key: "includes_business_plan",labelTemplate: "Todo lo del plan Negocio incluido",                    hasValue: false, isAuto: false, sortOrder: 18 },
      { key: "extra_business_addon",  labelTemplate: "Negocios adicionales por {value}",                     hasValue: true,  isAuto: true,  sortOrder: 19 },
      { key: "support_email",          labelTemplate: "Soporte por email",                                    hasValue: false, isAuto: false, sortOrder: 20 },
      { key: "support_priority",       labelTemplate: "Soporte prioritario",                                  hasValue: false, isAuto: false, sortOrder: 21 },
      { key: "element_ai_integration", labelTemplate: "IA integra el elemento (+3 cr/uso)",                  hasValue: false, isAuto: false, sortOrder: 22 },
    ];
    for (const benefit of DEFAULT_BENEFITS) {
      await db
        .insert(planBenefitCatalogTable)
        .values(benefit)
        .onConflictDoNothing();
    }
    logger.info("Plan benefit catalog seeded (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Failed to seed plan benefit catalog on startup");
  }

  // Fix extra_business_addon: update existing rows to is_auto=true (seed uses onConflictDoNothing
  // so the initial false value may be in production DB already).
  try {
    await db.execute(sql`
      UPDATE plan_benefit_catalog
      SET is_auto = TRUE
      WHERE key = 'extra_business_addon' AND is_auto = FALSE
    `);
  } catch (err) {
    logger.warn({ err }, "extra_business_addon is_auto fix skipped");
  }

  // Migrate Agencia plan descriptionJson: replace legacy free-text business features
  // with catalog key entries so the price becomes dynamic. Idempotent via app_settings flag.
  try {
    const agencyMigKey = "agency_businesses_catalog_migration_v1";
    const [agencyMigFlag] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, agencyMigKey)).limit(1);
    if (!agencyMigFlag) {
      const [agencyPlan] = await db.select().from(plansTable).where(eq(plansTable.key, "agency")).limit(1);
      if (agencyPlan) {
        const rawDesc = agencyPlan.descriptionJson as { features?: unknown[]; badge?: string; description?: string } | null;
        const oldFeatures: unknown[] = rawDesc?.features ?? [];

        // Patterns to replace with catalog keys
        const BUSSINESS_INCLUDED_PATTERN = /hasta\s+\d+\s+negocio/i;
        const EXTRA_BUSSINESS_PATTERN    = /negocio.*adicional|adicional.*negocio/i;

        let needsBusinessesEntry = false;
        let needsExtraAddonEntry = false;

        const migratedFeatures = oldFeatures.flatMap((f: unknown) => {
          if (typeof f === "string") {
            if (BUSSINESS_INCLUDED_PATTERN.test(f)) { needsBusinessesEntry = true; return []; }
            if (EXTRA_BUSSINESS_PATTERN.test(f))    { needsExtraAddonEntry = true; return []; }
          } else if (f && typeof f === "object") {
            const obj = f as Record<string, unknown>;
            const text = typeof obj.text === "string" ? obj.text : "";
            if (!obj.catalogKey) {
              if (BUSSINESS_INCLUDED_PATTERN.test(text)) { needsBusinessesEntry = true; return []; }
              if (EXTRA_BUSSINESS_PATTERN.test(text))    { needsExtraAddonEntry = true; return []; }
            }
            // Already has a catalog key for businesses/extra → keep as-is (already migrated)
            if (obj.catalogKey === "businesses" || obj.catalogKey === "extra_business_addon") return [f];
          }
          return [f];
        });

        // Check if catalog keys are already present (idempotent)
        const hasBusinessesKey    = oldFeatures.some(f => f && typeof f === "object" && (f as Record<string, unknown>).catalogKey === "businesses");
        const hasExtraAddonKey    = oldFeatures.some(f => f && typeof f === "object" && (f as Record<string, unknown>).catalogKey === "extra_business_addon");

        if (!hasBusinessesKey && needsBusinessesEntry) {
          migratedFeatures.unshift({ catalogKey: "businesses", enabled: true });
        }
        if (!hasExtraAddonKey && needsExtraAddonEntry) {
          const insertIdx = migratedFeatures.findIndex(f => f && typeof f === "object" && (f as Record<string, unknown>).catalogKey === "businesses");
          migratedFeatures.splice(insertIdx + 1, 0, { catalogKey: "extra_business_addon", enabled: true });
        }

        await db
          .update(plansTable)
          .set({ descriptionJson: { ...rawDesc, features: migratedFeatures } })
          .where(eq(plansTable.key, "agency"));
      }
      await db
        .insert(appSettingsTable)
        .values({ key: agencyMigKey, value: "v1", updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: "v1", updatedAt: new Date() } });
      logger.info("Agency plan descriptionJson migrated to catalog keys (businesses + extra_business_addon)");
    } else {
      logger.info("Agency businesses catalog migration already applied — skipping");
    }
  } catch (err) {
    logger.warn({ err }, "Agency businesses catalog migration failed");
  }

  // One-time migration: set bulk_max_posts and allowed_content_types per plan.
  // Uses app_settings version key "plan_capabilities_v1" as flag.
  try {
    const capMigKey = "plan_capabilities_v1";
    const [capFlag] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, capMigKey)).limit(1);
    if (!capFlag) {
      await db.execute(sql`UPDATE plans SET bulk_max_posts = 0,  allowed_content_types = '{image,story}',               includes_business_plan = FALSE WHERE key = 'free'`);
      await db.execute(sql`UPDATE plans SET bulk_max_posts = 30, allowed_content_types = '{image,story}',               includes_business_plan = FALSE WHERE key = 'starter'`);
      await db.execute(sql`UPDATE plans SET bulk_max_posts = 60, allowed_content_types = '{image,story,carousel,reel}', includes_business_plan = FALSE WHERE key = 'business'`);
      await db.execute(sql`UPDATE plans SET bulk_max_posts = 60, allowed_content_types = '{image,story,carousel,reel}', includes_business_plan = TRUE  WHERE key = 'agency'`);
      await db
        .insert(appSettingsTable)
        .values({ key: capMigKey, value: "v1", updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: "v1", updatedAt: new Date() } });
      logger.info("Plan capability limits seeded (one-time migration applied)");
    } else {
      logger.info("Plan capability limits already set — skipping");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to seed plan capability limits");
  }

  // Idempotent: enable element_ai for business and agency plans (safe to run every restart).
  // Uses a raw conditional UPDATE so it never downgrades plans already set by admin.
  try {
    await db.execute(sql`UPDATE plans SET element_ai_enabled = TRUE WHERE key IN ('business', 'agency') AND element_ai_enabled = FALSE`);
    logger.info("element_ai_enabled ensured for business/agency plans");
  } catch (err) {
    logger.warn({ err }, "Failed to set element_ai_enabled for business/agency plans");
  }

  // Fix: align ECO's Instagram social_account pageId with the Facebook page that owns
  // the stored Page Access Token. During OAuth, Meta's /me/accounts returns a page with
  // its own access_token — that token is scoped to that specific page. If the stored
  // pageId points to a DIFFERENT page, GET /<pageId>?fields=instagram_business_account
  // returns {} (no instagram_business_account) because the token can't read that page.
  //
  // IMPORTANT: This migration is scoped to ECO (user_id=1, business_id=1) ONLY.
  // Previously it applied to ALL instagram accounts by platform only, which caused
  // HazPost's account to also get its page_id overwritten to ECO's page (356577317549386)
  // — triggering a VM-3 isolation conflict and blocking both businesses from publishing.
  //
  // History of wrong values for ECO's account (sa_id=1):
  //   17841465780948955 — Instagram Business Account ID mistakenly saved as pageId
  //   1127807730405987  — Previous "fix" attempt; wrong (mismatches the stored token)
  //
  // Correct value: 356577317549386 — the Facebook Page whose access_token is stored.
  try {
    const correctFbPageId = "356577317549386";
    const badPageIds = ["17841465780948955", "1127807730405987"];
    for (const wrongPageId of badPageIds) {
      await db.update(socialAccountsTable)
        .set({ pageId: correctFbPageId, updatedAt: new Date() })
        .where(and(
          eq(socialAccountsTable.platform, "instagram"),
          eq(socialAccountsTable.userId, 1),
          eq(socialAccountsTable.businessId, 1),
          eq(socialAccountsTable.pageId, wrongPageId),
        ));
    }
    logger.info({ correctFbPageId }, "ECO Meta pageId aligned to Facebook Page (idempotent, scoped to biz=1)");
  } catch (err) {
    logger.warn({ err }, "Failed to apply Meta pageId alignment on startup");
  }

  // Fix HazPost brand data: clear empty-string logo_url and set brand_text_style = 'cinema'
  // when they were seeded as empty strings instead of NULL.
  // Idempotent — only updates rows where the values are empty strings.
  try {
    await db.execute(sql`
      UPDATE businesses
      SET
        logo_url         = CASE WHEN logo_url = '' THEN NULL ELSE logo_url END,
        brand_text_style = CASE WHEN brand_text_style IS NULL OR brand_text_style = '' THEN 'cinema' ELSE brand_text_style END,
        updated_at       = NOW()
      WHERE
        id = 2
        AND name = 'HazPost'
        AND user_id = 1
        AND (logo_url = '' OR brand_text_style = '' OR brand_text_style IS NULL)
    `);
    logger.info("HazPost brand data fixed: logo_url=NULL, brand_text_style='cinema' (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Failed to fix HazPost brand data on startup");
  }

  // 5. Industry groups: tabla + seed + columnas en image_variants y businesses + backfill
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industry_groups (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        keywords TEXT NOT NULL DEFAULT '[]',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      INSERT INTO industry_groups (slug, display_name, keywords) VALUES
        ('barberia',      'Barbería',                 '["barbería","barberías","barbero","barber","peluquería masculina","barbershop"]'),
        ('estetica',      'Estética / Spa',           '["estética","spa","salud y belleza","peluquería femenina","belleza","salón","salon"]'),
        ('panaderia',     'Panadería',                '["panadería","panaderia","bakery","pastelería","panes","repostería","cafetería panadería","tortas"]'),
        ('restaurante',   'Restaurante',              '["restaurante","cocina","comida","cafetería","gastronomía","sushi","pizza","hamburguesas","fonda","asadero"]'),
        ('gym',           'Gimnasio / Fitness',       '["gimnasio","gym","fitness","crossfit","pilates","yoga","entrenamiento","pesas","deporte"]'),
        ('odontologia',   'Odontología',              '["odontología","dentista","dental","clínica dental","ortodoncia","dientes","odontólogo"]'),
        ('medicina',      'Salud / Medicina',         '["médico","clínica","salud","medicina","psicología","fisioterapia","enfermería","hospital","veterinaria","óptica"]'),
        ('moda',          'Moda / Ropa',              '["moda","ropa","boutique","tienda de ropa","fashion","accesorios","zapatos","calzado","bolsos"]'),
        ('inmobiliaria',  'Inmobiliaria',             '["inmobiliaria","bienes raíces","apartamentos","casas","arriendos","real estate","propiedad","finca raíz"]'),
        ('educacion',     'Educación',                '["educación","colegio","academia","cursos","universidad","formación","escuela","instituto","clases"]'),
        ('tecnologia',    'Tecnología / SaaS',        '["tecnología","software","saas","app","startup","digital","marketing digital","programación","sistemas"]'),
        ('energia',       'Energía / Medio Ambiente', '["energía","solar","renovable","medio ambiente","sostenibilidad","eólica","paneles solares","energías renovables"]'),
        ('construccion',  'Construcción',             '["construcción","arquitectura","obras","remodelación","acabados","ferretería","pinturas","materiales"]'),
        ('transporte',    'Transporte / Autos',       '["transporte","taxi","carro","auto","mecánica","taller","repuestos","llantas","motos","automóviles"]'),
        ('eventos',       'Eventos',                  '["eventos","bodas","fiestas","catering","decoración","fotografía de eventos","grado","quinceañera"]'),
        ('supermercado',  'Supermercado / Tienda',    '["supermercado","tienda","minimarket","abarrotes","frutas","verduras","droguería","farmacia"]'),
        ('joyeria',       'Joyería / Relojería',      '["joyería","relojería","joyas","relojes","bisutería","oro","plata","diamantes"]')
      ON CONFLICT (slug) DO NOTHING
    `);
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS business_id INTEGER`);
    await db.execute(sql`ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS industry_group_slug TEXT`);
    await db.execute(sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_group_slug TEXT`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_image_variants_industry_group ON image_variants (industry_group_slug) WHERE industry_group_slug IS NOT NULL`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_image_variants_user_id ON image_variants (user_id) WHERE user_id IS NOT NULL`);
    await db.execute(sql`
      UPDATE image_variants iv
      SET business_id = p.business_id
      FROM posts p
      WHERE iv.post_id = p.id AND iv.business_id IS NULL
    `);
    logger.info("Industry groups table, seed, columns and backfill applied (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Industry groups migration skipped or already applied");
  }

  // 5b. JS backfill: asignar industry_group_slug en businesses usando keyword matching
  //     Runs after SQL migration so the industry_groups table exists.
  try {
    const groups = await db
      .select({ slug: industryGroupsTable.slug, keywords: industryGroupsTable.keywords })
      .from(industryGroupsTable)
      .where(eq(industryGroupsTable.active, true));
    const bizList = await db
      .select({ id: businessesTable.id, industry: businessesTable.industry })
      .from(businessesTable)
      .where(isNull(businessesTable.industryGroupSlug));
    let classified = 0;
    for (const biz of bizList) {
      if (!biz.industry) continue;
      const lower = biz.industry.toLowerCase();
      for (const group of groups) {
        let keywords: string[] = [];
        try { keywords = JSON.parse(group.keywords) as string[]; } catch { continue; }
        if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
          await db.update(businessesTable)
            .set({ industryGroupSlug: group.slug })
            .where(eq(businessesTable.id, biz.id));
          classified++;
          break;
        }
      }
    }
    await db.execute(sql`
      UPDATE image_variants iv
      SET industry_group_slug = b.industry_group_slug
      FROM businesses b
      WHERE iv.business_id = b.id
        AND iv.industry_group_slug IS NULL
        AND b.industry_group_slug IS NOT NULL
    `);
    if (classified > 0) {
      logger.info({ classified }, "Industry group slug backfill complete for businesses");
    }
  } catch (err) {
    logger.warn({ err }, "Industry group slug backfill skipped or failed");
  }

  // 5c. Add deleted_at column to users table for soft-delete (trash) feature.
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
    logger.info("users.deleted_at column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "users.deleted_at column migration skipped or failed");
  }

  // 5d. Backfill image_variants.user_id from posts.user_id for legacy rows where user_id IS NULL.
  //     These rows were created before user_id was added to image_variants.
  //     Required for tenantLibraryFilter to correctly apply owner-only visibility for legacy backgrounds.
  try {
    const { rowCount } = await db.execute(sql`
      UPDATE image_variants iv
      SET user_id = p.user_id
      FROM posts p
      WHERE iv.post_id = p.id
        AND iv.user_id IS NULL
        AND p.user_id IS NOT NULL
    `);
    if ((rowCount ?? 0) > 0) {
      logger.info({ updated: rowCount }, "image_variants user_id backfill complete (legacy rows)");
    }
  } catch (err) {
    logger.warn({ err }, "image_variants user_id backfill skipped or failed");
  }

  // Remove all invalid HazPost Instagram accounts (any id) configured with ECO's Facebook
  // Page ID (356577317549386). This caused: (a) HazPost posts publishing to @eco.sas, and
  // (b) VM-3 ISOLATION_GUARD blocking BOTH ECO and HazPost publishing when the duplicate exists.
  // Root cause: user reconnected Meta for HazPost (biz=2) using ECO's same Facebook page.
  // HazPost has no separate Instagram account — these records are all invalid by definition.
  // Idempotent — safe to run on every startup. Previously only deleted id=36; extended to
  // catch any new duplicates created by accidental re-authorization (e.g. sa_id=37).
  try {
    const { rowCount } = await db.execute(sql`
      DELETE FROM social_accounts
      WHERE user_id = 1
        AND business_id = 2
        AND platform = 'instagram'
        AND page_id = '356577317549386'
    `);
    if ((rowCount ?? 0) > 0) {
      logger.info(
        { removed: rowCount },
        "Removed invalid HazPost Instagram account(s): page_id pointed to ECO's Facebook Page. " +
        "ECO Instagram publishing is now unblocked. HazPost needs its own IG account to publish."
      );
    } else {
      logger.info("HazPost duplicate IG account cleanup: nothing to remove (already clean)");
    }
  } catch (err) {
    logger.warn({ err }, "HazPost IG account cleanup skipped or failed");
  }

  // NOTE: A unique index on (user_id, platform, page_id) WHERE page_id IS NOT NULL
  // was considered here, but is intentionally NOT added via startup migration to avoid
  // Replit's deployment system trying to apply it before the duplicate data cleanup runs.
  // The application-level 409 guards in social-accounts.ts and oauth.ts enforce this
  // invariant for all write paths. The index can be added manually after sa_id=36 is
  // removed in production.

  // 6. Voucher system — voucher_codes, voucher_redemptions, plan_trials
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voucher_codes (
        id            SERIAL PRIMARY KEY,
        code          VARCHAR(50) NOT NULL UNIQUE,
        trial_plan    VARCHAR(30),
        trial_days    INTEGER NOT NULL DEFAULT 30,
        bonus_credits INTEGER NOT NULL DEFAULT 0,
        max_uses      INTEGER,
        current_uses  INTEGER NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        description   TEXT,
        expires_at    TIMESTAMP,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS voucher_redemptions (
        id          SERIAL PRIMARY KEY,
        voucher_id  INTEGER NOT NULL REFERENCES voucher_codes(id) ON DELETE CASCADE,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        redeemed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(voucher_id, user_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS plan_trials (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        original_plan VARCHAR(30) NOT NULL,
        trial_plan    VARCHAR(30) NOT NULL,
        trial_start   TIMESTAMP NOT NULL DEFAULT NOW(),
        trial_end     TIMESTAMP NOT NULL,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("Voucher system tables ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Voucher system migration skipped or already applied");
  }

  // 7. Affiliate global settings table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS affiliate_settings (
        id                      INTEGER PRIMARY KEY DEFAULT 1,
        default_commission_pct  INTEGER NOT NULL DEFAULT 20,
        default_duration_months INTEGER NOT NULL DEFAULT 6,
        min_payout_usd          NUMERIC(8,2) NOT NULL DEFAULT 50,
        is_program_open         BOOLEAN NOT NULL DEFAULT TRUE,
        program_description     TEXT NOT NULL DEFAULT '',
        updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT affiliate_settings_single_row CHECK (id = 1)
      )
    `);
    await db.execute(sql`
      INSERT INTO affiliate_settings (id) VALUES (1) ON CONFLICT DO NOTHING
    `);
    logger.info("Affiliate settings table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Affiliate settings migration skipped or already applied");
  }

  // Backfill: normalize plan_trials.trial_plan values that were saved with Spanish alias keys
  // (e.g. "negocio" instead of "business", "emprendedor" instead of "starter").
  // Safe to re-run — only updates rows whose trial_plan is a known alias.
  try {
    const ptBackfill = await db.execute(sql`
      UPDATE plan_trials
      SET trial_plan = CASE trial_plan
        WHEN 'negocio'     THEN 'business'
        WHEN 'emprendedor' THEN 'starter'
        WHEN 'agencia'     THEN 'agency'
        WHEN 'gratis'      THEN 'free'
        WHEN 'pro'         THEN 'business'
        ELSE trial_plan
      END
      WHERE trial_plan IN ('negocio','emprendedor','agencia','gratis','pro')
    `);
    const ptFixed = (ptBackfill as unknown as { rowCount?: number }).rowCount ?? 0;
    logger.info(`plan_trials alias backfill applied: ${ptFixed} row(s) normalized (idempotent)`);
  } catch (err) {
    logger.warn({ err }, "plan_trials alias backfill skipped");
  }

  // Backfill: voucher bonus_credits that were incorrectly written to users.ai_credits
  // (legacy bug fixed in Task #170). Transfer any accumulated value to subscriptions
  // (the source of truth for credits). Idempotent — if ai_credits is already 0, no rows updated.
  try {
    const backfillResult = await db.execute(sql`
      UPDATE subscriptions s
      SET
        credits_remaining = GREATEST(s.credits_remaining + u.ai_credits, 0),
        credits_total     = GREATEST(s.credits_total     + u.ai_credits, 0)
      FROM users u
      WHERE u.id = s.user_id
        AND u.ai_credits > 0
    `);
    const affected = (backfillResult as unknown as { rowCount?: number }).rowCount ?? 0;
    await db.execute(sql`UPDATE users SET ai_credits = 0 WHERE ai_credits > 0`);
    logger.info(`ai_credits backfill applied: ${affected} usuarios corregidos`);
  } catch (err) {
    logger.warn({ err }, "ai_credits backfill skipped");
  }

  // Backfill: alinear credits_total con plans.credits_per_month para suscripciones activas
  // donde el admin aumentó los créditos del plan después del registro del usuario (ej: free 30→40).
  // Solo aplica a subs SIN locked_plan_config (pre-snapshot). Una vez que el backfill de
  // lockedPlanConfig corre (más abajo), esta condición filtrará todas las filas y el bloque
  // dejará de ejecutar actualizaciones — actuando como migración one-shot.
  // Idempotente: solo actualiza filas donde credits_total < plan.credits_per_month.
  try {
    const planBackfillResult = await db.execute(sql`
      WITH bumped AS (
        UPDATE subscriptions s
        SET
          credits_remaining = GREATEST(0, s.credits_remaining + (p.credits_per_month - s.credits_total)),
          credits_total      = p.credits_per_month,
          updated_at         = NOW()
        FROM plans p
        WHERE s.plan   = p.key
          AND s.status = 'active'
          AND s.locked_plan_config IS NULL
          AND s.credits_total < p.credits_per_month
        RETURNING s.user_id, s.credits_remaining AS new_cr
      )
      UPDATE users u
      SET ai_credits = b.new_cr, updated_at = NOW()
      FROM bumped b
      WHERE u.id = b.user_id
    `);
    const planBumped = (planBackfillResult as unknown as { rowCount?: number }).rowCount ?? 0;
    logger.info(`[CreditBackfill] ${planBumped} usuario(s) actualizados al credits_per_month del plan`);
  } catch (err) {
    logger.warn({ err }, "[CreditBackfill] Plan credits backfill skipped");
  }

  // Backfill: set locked_plan_config for active subscriptions that have it as NULL.
  // Subscriptions created before Task #258 lack this snapshot and rely on the live plan row,
  // which means admin changes to plan settings affect them immediately (undesired).
  // This backfill takes a one-time snapshot from the current plan row, locking the conditions
  // in place for the rest of their billing period. Completely idempotent — only touches rows
  // where locked_plan_config IS NULL.
  try {
    const lockedConfigResult = await db.execute(sql`
      UPDATE subscriptions s
      SET
        locked_plan_config = jsonb_build_object(
          'creditsPerMonth',      p.credits_per_month,
          'bulkMaxPosts',         COALESCE(p.bulk_max_posts, 0),
          'allowedContentTypes',  COALESCE(p.allowed_content_types, ARRAY['image','story']::text[]),
          'businessesAllowed',    COALESCE(p.businesses_allowed, 1),
          'reelsPerMonth',        COALESCE(p.reels_per_month, 0)
        ),
        updated_at = NOW()
      FROM plans p
      WHERE s.plan   = p.key
        AND s.status = 'active'
        AND s.locked_plan_config IS NULL
    `);
    const lockedCount = (lockedConfigResult as unknown as { rowCount?: number }).rowCount ?? 0;
    logger.info(`[PlanSnapshotBackfill] ${lockedCount} suscripcion(es) actualizadas con locked_plan_config`);
  } catch (err) {
    logger.warn({ err }, "[PlanSnapshotBackfill] locked_plan_config backfill skipped");
  }

  // Durable pending OAuth sessions — persists page selector state across server restarts.
  // Replaces the previous in-memory Map which caused lost sessions on restart.
  // TTL = 30 min. Stores encrypted page access tokens as JSON.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pending_oauth_sessions (
        session_id   TEXT        PRIMARY KEY,
        user_id      INTEGER     NOT NULL,
        business_id  INTEGER,
        pages_enc    TEXT        NOT NULL,
        expires_at   TIMESTAMPTZ NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pending_oauth_sessions_user
        ON pending_oauth_sessions(user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pending_oauth_sessions_expires
        ON pending_oauth_sessions(expires_at)
    `);
    // Purge expired sessions on startup (housekeeping)
    await db.execute(sql`DELETE FROM pending_oauth_sessions WHERE expires_at < NOW()`);
    logger.info("Pending OAuth sessions table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Pending OAuth sessions migration skipped");
  }

  // Durable pending cart orders (for Wompi cart checkout reconciliation via webhook)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pending_cart_orders (
        id         SERIAL PRIMARY KEY,
        reference  TEXT NOT NULL UNIQUE,
        user_id    INTEGER NOT NULL,
        items      JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_pending_cart_orders_reference ON pending_cart_orders(reference)
    `);
    logger.info("Pending cart orders table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "Pending cart orders migration skipped");
  }

  // One-time purge: delete viral content learnings that may have been generated
  // from a single user's data (contaminating all other users with their brand voice).
  // The learning engine now enforces brand-neutral patterns in extractPatternsWithAI.
  // Flag key: "purge_viral_learnings_v1"
  try {
    const [purgeFlag] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "purge_viral_learnings_v1")).limit(1);
    if (!purgeFlag) {
      const result = await db.execute(sql`DELETE FROM content_learnings WHERE is_viral = true`);
      await db.insert(appSettingsTable)
        .values({ key: "purge_viral_learnings_v1", value: "done", updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: "done", updatedAt: new Date() } });
      const purgedCount = typeof (result as { rowCount?: unknown }).rowCount === "number" ? (result as { rowCount: number }).rowCount : 0;
      logger.info({ rowCount: purgedCount }, "Purged contaminated viral learnings (one-time migration)");
    } else {
      logger.info("Viral learnings purge already applied — skipping");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to purge viral learnings on startup");
  }

  // Task #295: AI Learning Engine — add ai_caption_original to posts (stores raw AI output for edit-signal diffing)
  try {
    await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_caption_original TEXT`);
    logger.info("posts.ai_caption_original column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "posts.ai_caption_original migration skipped or failed");
  }

  // Task #295: AI Learning Engine — add user_id to content_learnings for personal-scoped signals
  try {
    await db.execute(sql`ALTER TABLE content_learnings ADD COLUMN IF NOT EXISTS user_id INTEGER`);
    logger.info("content_learnings.user_id column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "content_learnings.user_id migration skipped or failed");
  }

  // Task #296: Fix registration — brand_profiles.website_analyzed_at was missing in DB
  try {
    await db.execute(sql`ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS website_analyzed_at TIMESTAMP`);
    logger.info("brand_profiles.website_analyzed_at column ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "brand_profiles.website_analyzed_at migration skipped or failed");
  }

  // Platform alerts: lightweight in-app notification table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_alerts (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        VARCHAR(60) NOT NULL,
        title       VARCHAR(255) NOT NULL,
        message     TEXT NOT NULL,
        metadata    JSONB,
        is_read     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_platform_alerts_user_unread ON platform_alerts(user_id, is_read) WHERE is_read = FALSE`);
    logger.info("platform_alerts table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "platform_alerts migration skipped or failed");
  }

  // Niche approval signals — Capa 1 of the 2-layer feedback loop (Task #367)
  // Records real-time approve/reject signals from the post approval queue.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS niche_approval_signals (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
        niche_id    INTEGER REFERENCES niches(id) ON DELETE SET NULL,
        post_id     INTEGER REFERENCES posts(id) ON DELETE SET NULL,
        signal      TEXT NOT NULL CHECK (signal IN ('approved', 'rejected')),
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_nas_business_niche ON niche_approval_signals(business_id, niche_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_nas_business_signal ON niche_approval_signals(business_id, signal, created_at DESC)`);
    logger.info("niche_approval_signals table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "niche_approval_signals migration skipped or failed");
  }

  // User visual signals — Task #368: learn from visual edits, reference images, manual prompts
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_visual_signals (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_id     INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
        post_id         INTEGER REFERENCES posts(id) ON DELETE SET NULL,
        signal_type     TEXT NOT NULL CHECK (signal_type IN ('style_regen', 'reference_image', 'manual_prompt')),
        style           TEXT,
        overlay_filter  TEXT,
        text_style      TEXT,
        overlay_font    TEXT,
        logo_position   TEXT,
        image_description TEXT,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_uvs_user_type ON user_visual_signals(user_id, signal_type, created_at DESC)`);
    // Harden signal_type with CHECK constraint — idempotent via DO block (PG doesn't have IF NOT EXISTS for constraints)
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uvs_signal_type_check'
        ) THEN
          ALTER TABLE user_visual_signals
            ADD CONSTRAINT uvs_signal_type_check
            CHECK (signal_type IN ('style_regen', 'reference_image', 'manual_prompt'));
        END IF;
      END $$
    `);
    logger.info("user_visual_signals table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "user_visual_signals migration skipped or failed");
  }

  // ── Cleanup orphaned businesses from soft-deleted users ──────────────────
  // When admin deletes a user (soft-delete, sets deleted_at), their businesses
  // were NOT deactivated → scheduler kept processing them → image queue saturation.
  // This migration deactivates businesses of ALL deleted users (idempotent, one-time fix).
  try {
    const { rowCount } = await db.execute(sql`
      UPDATE businesses b
      SET is_active = FALSE, auto_generation_enabled = FALSE
      FROM users u
      WHERE b.user_id = u.id
        AND u.deleted_at IS NOT NULL
        AND (b.is_active = TRUE OR b.auto_generation_enabled = TRUE)
    `);
    if ((rowCount ?? 0) > 0) {
      logger.info({ rowCount }, "Deactivated businesses of soft-deleted users (idempotent cleanup)");
    } else {
      logger.info("No orphaned businesses from deleted users found (already clean)");
    }
  } catch (err) {
    logger.warn({ err }, "Orphaned business deactivation skipped or failed");
  }

  // ── custom_industries: industrias personalizadas con contexto IA ──────────
  // Permite que negocios con industrias no listadas en el catálogo estático
  // generen posts de alta calidad con contexto IA auto-generado por GPT.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS custom_industries (
        id           SERIAL PRIMARY KEY,
        name         TEXT NOT NULL UNIQUE,
        slug         TEXT NOT NULL UNIQUE,
        ai_context   TEXT,
        status       TEXT NOT NULL DEFAULT 'approved',
        suggested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_custom_industries_status ON custom_industries (status)
    `);
    logger.info("custom_industries table ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "custom_industries migration skipped or failed");
  }

  // ── custom_sub_industries: sub-industrias personalizadas multi-select ──────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS custom_sub_industries (
        id            SERIAL PRIMARY KEY,
        industry_name TEXT NOT NULL,
        name          TEXT NOT NULL,
        slug          TEXT NOT NULL UNIQUE,
        status        TEXT NOT NULL DEFAULT 'approved',
        suggested_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_csi_industry_name ON custom_sub_industries (industry_name, status)
    `);
    await db.execute(sql`
      ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sub_industries TEXT
    `);
    await db.execute(sql`
      ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS sub_industries TEXT
    `);
    // Backfill: si sub_industry tiene valor y sub_industries es NULL, convertir a array JSON
    await db.execute(sql`
      UPDATE businesses
      SET sub_industries = json_build_array(sub_industry)::text
      WHERE sub_industry IS NOT NULL AND sub_industries IS NULL
    `);
    await db.execute(sql`
      UPDATE brand_profiles
      SET sub_industries = json_build_array(sub_industry)::text
      WHERE sub_industry IS NOT NULL AND sub_industries IS NULL
    `);
    logger.info("custom_sub_industries table + sub_industries columns ensured (idempotent)");
  } catch (err) {
    logger.warn({ err }, "custom_sub_industries migration skipped or failed");
  }

}

/**
 * On startup, handle image variants that were left in "pending" state
 * because a previous generation job was interrupted by a server restart.
 *
 * Smart cleanup strategy:
 * - If the post already has at least one READY variant (has imageData), the
 *   stuck pending variant is silently deleted — the user still has a good image
 *   and won't see any error.
 * - If the post has NO ready variant at all, mark it as "error" so the user
 *   knows to retry. This is the only case where the error appears in the UI.
 */
async function resetStuckPendingVariants() {
  try {
    // Find all currently-stuck pending variants
    const pendingVariants = await db
      .select({ id: imageVariantsTable.id, postId: imageVariantsTable.postId })
      .from(imageVariantsTable)
      .where(eq(imageVariantsTable.generationStatus, "pending"));

    if (pendingVariants.length === 0) return;

    // For each affected post, check whether there's already a ready variant
    const affectedPostIds = [...new Set(pendingVariants.map(v => v.postId))];
    const readyVariants = await db
      .select({ postId: imageVariantsTable.postId })
      .from(imageVariantsTable)
      .where(
        and(
          inArray(imageVariantsTable.postId, affectedPostIds),
          eq(imageVariantsTable.generationStatus, "ready"),
          isNotNull(imageVariantsTable.imageData),
        )
      );

    const postsWithReadyImage = new Set(readyVariants.map(v => v.postId));

    // Silently delete stuck variants for posts that already have a good image
    const toDelete = pendingVariants.filter(v => postsWithReadyImage.has(v.postId));
    // Mark as error only for posts that have NO good image at all
    const toError = pendingVariants.filter(v => !postsWithReadyImage.has(v.postId));

    if (toDelete.length > 0) {
      await db.delete(imageVariantsTable)
        .where(inArray(imageVariantsTable.id, toDelete.map(v => v.id)));
      logger.info(
        { count: toDelete.length, ids: toDelete.map(v => v.id) },
        "Cleaned up stuck pending variants — post already has a ready image",
      );
    }

    if (toError.length > 0) {
      await db.update(imageVariantsTable)
        .set({
          generationStatus: "error",
          generationError: "Generación interrumpida por reinicio del servidor. Por favor reintenta.",
        })
        .where(inArray(imageVariantsTable.id, toError.map(v => v.id)));
      logger.warn(
        { count: toError.length, ids: toError.map(v => v.id) },
        "Reset stuck pending image variants on startup — no ready image available",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to reset stuck pending variants on startup");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Preload the most-used overlay fonts into memory for fast first image generation
  warmFontCache();

  // Apply schema migrations (idempotent — safe to run on every startup)
  runStartupMigrations();

  // Reset any image variants that were stuck in 'pending' due to a server restart
  resetStuckPendingVariants();

  // Start the background scheduler for auto-publishing
  startScheduler();
});
