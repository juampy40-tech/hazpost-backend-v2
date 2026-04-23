import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const customIndustriesTable = pgTable("custom_industries", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull().unique(),
  slug:        text("slug").notNull().unique(),
  aiContext:   text("ai_context"),
  status:      text("status").notNull().default("approved"),
  suggestedBy: integer("suggested_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export type CustomIndustry = typeof customIndustriesTable.$inferSelect;
export type NewCustomIndustry = typeof customIndustriesTable.$inferInsert;
