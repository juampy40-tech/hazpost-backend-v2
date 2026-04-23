import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const landingPagesTable = pgTable("landing_pages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  ctaText: text("cta_text").notNull().default("Quiero saber más"),
  includeForm: boolean("include_form").notNull().default(true),
  generatedHtml: text("generated_html").notNull().default(""),
  formLeads: jsonb("form_leads").notNull().default("[]"), // denormalized cache of lead count/summary
  status: text("status").notNull().default("active"), // active | archived
  heroImageVariantId: integer("hero_image_variant_id"), // FK to image_variants.id — null until image is generated
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const landingLeadsTable = pgTable("landing_leads", {
  id: serial("id").primaryKey(),
  landingId: integer("landing_id").notNull(),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  city: text("city").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLandingPageSchema = createInsertSchema(landingPagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLandingLeadSchema = createInsertSchema(landingLeadsTable).omit({ id: true, createdAt: true });

export type InsertLandingPage = z.infer<typeof insertLandingPageSchema>;
export type LandingPage = typeof landingPagesTable.$inferSelect;
export type InsertLandingLead = z.infer<typeof insertLandingLeadSchema>;
export type LandingLead = typeof landingLeadsTable.$inferSelect;
