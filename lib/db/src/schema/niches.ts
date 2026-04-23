import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nichesTable = pgTable("niches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  businessId: integer("business_id"),   // which business this niche belongs to (null = legacy/solo user)
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  keywords: text("keywords").notNull().default(""),
  active: boolean("active").notNull().default(true),
  customText: text("custom_text"),
  customTextPosition: text("custom_text_position").notNull().default("after"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNicheSchema = createInsertSchema(nichesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNiche = z.infer<typeof insertNicheSchema>;
export type Niche = typeof nichesTable.$inferSelect;
