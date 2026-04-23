import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contentTemplatesTable = pgTable("content_templates", {
  id: serial("id").primaryKey(),
  industrySlug: text("industry_slug").notNull(),
  industryName: text("industry_name").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  postType: text("post_type").notNull().default("image"),
  tone: text("tone").notNull().default(""),
  suggestedTopic: text("suggested_topic").notNull().default(""),
  hashtags: text("hashtags").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContentTemplateSchema = createInsertSchema(contentTemplatesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertContentTemplate = z.infer<typeof insertContentTemplateSchema>;
export type ContentTemplate = typeof contentTemplatesTable.$inferSelect;
