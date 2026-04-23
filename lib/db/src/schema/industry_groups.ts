import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";

export const industryGroupsTable = pgTable("industry_groups", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  keywords: text("keywords").notNull().default("[]"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type IndustryGroup = typeof industryGroupsTable.$inferSelect;
export type InsertIndustryGroup = typeof industryGroupsTable.$inferInsert;
