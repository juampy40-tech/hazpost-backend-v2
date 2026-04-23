import { pgTable, text, serial, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

/**
 * Admin-editable plan definitions.
 * The app reads plan limits from this table — not hardcoded.
 * Only the admin (userId=1) can modify these.
 */
export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),                      // free | starter | business | agency
  name: text("name").notNull(),                             // Display name: "Básico", "Emprendedor", etc.
  priceUsd: real("price_usd").notNull().default(0),
  priceCop: integer("price_cop").notNull().default(0),
  creditsPerMonth: integer("credits_per_month").notNull().default(30),
  reelsPerMonth: integer("reels_per_month").notNull().default(0),
  businessesAllowed: integer("businesses_allowed").notNull().default(1),
  durationDays: integer("duration_days").notNull().default(30),          // Plan duration in days (30 = monthly)
  extraBusinessPriceUsd: real("extra_business_price_usd").notNull().default(0),  // Price per extra business (agency)
  extraBusinessCredits: integer("extra_business_credits").notNull().default(0),  // Credits awarded when paying for an extra business
  canDelete: boolean("can_delete").notNull().default(true), // false = plan básico gratis
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * Global credit-cost override for this plan tier (null = use app_settings global defaults).
   * Shape: { image: number, story: number, carousel: number, reel: number }
   * Admin edits via admin panel → Planes → Costos de Generación.
   * Runtime reads from app_settings (60s cache); this column serves as per-plan
   * override support for future use and satisfies the plan DB model contract.
   */
  creditCostsJson: jsonb("credit_costs_json"),
  /**
   * Rich description / feature list for the public pricing page.
   * Shape: { headline: string, features: string[], cta: string }
   * Admin edits via admin panel → CMS de Planes.
   * Null = fallback to generated copy.
   */
  descriptionJson: jsonb("description_json"),
  /**
   * Annual billing prices — freely set by the admin (not auto-calculated).
   * Null/0 = annual option not available for this plan.
   */
  priceAnnualUsd: real("price_annual_usd").notNull().default(0),
  priceAnnualCop: integer("price_annual_cop").notNull().default(0),

  // ── Plan capability limits (Task #138) ─────────────────────────────────────
  /**
   * Maximum number of posts per bulk scheduling request.
   * 0 = bulk scheduling disabled for this plan.
   * 999 = effectively unlimited.
   */
  bulkMaxPosts: integer("bulk_max_posts").notNull().default(0),
  /**
   * Content types allowed for generation on this plan.
   * e.g. '{image,story}' or '{image,story,carousel,reel}'
   */
  allowedContentTypes: text("allowed_content_types").array().notNull().default(sql`'{image,story,carousel,reel}'`),
  /**
   * When true, the plan inherits all benefits from the Business plan
   * (shown visually in UI and enforced by plan features).
   */
  includesBusinessPlan: boolean("includes_business_plan").notNull().default(false),
  /**
   * Annual pricing for extra businesses (agency plan).
   * 0 = no annual option for extra businesses.
   */
  extraBusinessPriceAnnualUsd: real("extra_business_price_annual_usd").notNull().default(0),
  extraBusinessPriceAnnualCop: integer("extra_business_price_annual_cop").notNull().default(0),
  /**
   * Beneficio diferenciador: "IA integra el elemento" (gpt-image-1 multimodal).
   * true = los usuarios de este plan pueden usar la integración IA de elementos (+3 cr por uso).
   * false (default) = función no disponible en este plan.
   */
  elementAiEnabled: boolean("element_ai_enabled").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlanSchema = createInsertSchema(plansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plansTable.$inferSelect;
