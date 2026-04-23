import { pgTable, serial, varchar, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const planBenefitCatalogTable = pgTable("plan_benefit_catalog", {
  id:            serial("id").primaryKey(),
  key:           varchar("key", { length: 100 }).notNull().unique(),
  labelTemplate: text("label_template").notNull(),
  hasValue:      boolean("has_value").notNull().default(false),
  isAuto:        boolean("is_auto").notNull().default(false),
  sortOrder:     integer("sort_order").notNull().default(0),
  createdAt:     timestamp("created_at").notNull().default(sql`NOW()`),
});
