import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const customSubIndustriesTable = pgTable("custom_sub_industries", {
  id:           serial("id").primaryKey(),
  industryName: text("industry_name").notNull(),
  name:         text("name").notNull(),
  slug:         text("slug").notNull().unique(),
  status:       text("status").notNull().default("approved"),
  suggestedBy:  integer("suggested_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export type CustomSubIndustry = typeof customSubIndustriesTable.$inferSelect;
export type NewCustomSubIndustry = typeof customSubIndustriesTable.$inferInsert;
