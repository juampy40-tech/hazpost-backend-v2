import { pgTable, text, varchar, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const brandProfilesTable = pgTable("brand_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),

  // Paso 1 — Empresa
  companyName: text("company_name"),
  slogan: varchar("slogan", { length: 150 }),
  industry: text("industry"),
  subIndustry: text("sub_industry"),               // backward compat: primer elemento del array
  subIndustries: text("sub_industries"),           // JSON array de sub-industrias seleccionadas
  country: text("country"),
  city: text("city"),
  website: text("website"),

  // Paso 2 — Marca
  logoUrl: text("logo_url"),
  logoUrls: text("logo_urls"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  businessDescription: text("business_description"),

  // Paso 3 — Tipografía
  brandFont: text("brand_font"),
  brandFontUrl: text("brand_font_url"),

  // Paso 4 — Audiencia y tono
  audienceDescription: text("audience_description"),
  brandTone: text("brand_tone"),
  referenceImages: text("reference_images"), // JSON array of object paths

  // Preferencias de publicación
  defaultLocation: text("default_location"), // ej: "Cali" — IA la usa para hashtags y menciones; null = sin ubicación

  // Progreso del wizard
  onboardingStep: integer("onboarding_step").notNull().default(0),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),

  websiteAnalyzedAt: timestamp("website_analyzed_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBrandProfileSchema = createInsertSchema(brandProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrandProfile = z.infer<typeof insertBrandProfileSchema>;
export type BrandProfile = typeof brandProfilesTable.$inferSelect;
