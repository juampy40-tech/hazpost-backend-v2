import { pgTable, text, varchar, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Each agency user (plan = "agency") can have multiple businesses.
 * All other users have exactly 1 business (created automatically on registration).
 * Data from one business is NEVER mixed with another — all queries filter by businessId.
 */
export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),     // owner (the agency or solo user)
  name: text("name").notNull(),             // "Panadería El Trigal"
  industry: text("industry"),               // "Panadería", "Discoteca", etc.
  description: text("description"),

  // Brand config — replaces brand_profiles for multi-business context
  logoUrl: text("logo_url"),
  logoUrls: text("logo_urls"),              // JSON array
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  brandFont: text("brand_font"),
  brandFontUrl: text("brand_font_url"),
  brandTone: text("brand_tone"),
  brandTextStyle: text("brand_text_style"),  // image overlay text style: "cinema" | "eco" | "brutalist" | etc.
  audienceDescription: text("audience_description"),
  defaultLocation: text("default_location"),
  referenceImages: text("reference_images"), // JSON array of object paths
  products: text("products"),               // free-form product/service list
  scheduleConfig: text("schedule_config"),  // JSON: custom publishing hours/days per content type

  // Default overlay preferences — saved from the approval editor
  slogan: varchar("slogan", { length: 150 }),            // short brand slogan (max 150 chars); used in AI captions
  defaultSignatureText: text("default_signature_text"),  // custom signature override; null = use "name, location"
  defaultShowSignature: boolean("default_show_signature").default(true), // show signature by default

  // Knowledge base / FAQ for chatbot scoped to this business
  chatbotKnowledge: text("chatbot_knowledge"),

  // Onboarding state for this specific business
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),

  showHazpostBadge: boolean("show_hazpost_badge").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false), // the currently active business
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),

  website: text("website"),                        // sitio web del negocio (URL)
  subIndustry: text("sub_industry"),               // sub-industria nivel 2 — backward compat: primer elemento del array subIndustries
  subIndustries: text("sub_industries"),           // JSON array de sub-industrias seleccionadas (multi-select)
  industryGroupSlug: text("industry_group_slug"),  // slug del grupo de industria (ej: "barberia", "panaderia")
  country: text("country"),                        // código de país ISO-3166-1 alpha-2 (ej: "CO", "MX", "AR")

  timezone: text("timezone"),                     // IANA timezone override, ej: "Europe/Paris"; null = hereda del usuario

  // Auto-generation settings per business
  autoGenerationEnabled: boolean("auto_generation_enabled").notNull().default(false),
  generationFrequency: varchar("generation_frequency", { length: 10 }).notNull().default("15"), // '7' | '15' | '30'

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
