import { pgTable, text, serial, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";

/**
 * Stores AI-extracted content performance insights grouped by market segment and geography.
 * Powers the adaptive learning system: Local > National > Global priority.
 * Viral learnings (is_viral = true) override all segment/geo filters and apply to everyone.
 */
export const contentLearningsTable = pgTable("content_learnings", {
  id: serial("id").primaryKey(),

  userIndustry: text("user_industry").notNull(),

  geoLevel: text("geo_level").notNull(),
  geoCountry: text("geo_country"),
  geoCity: text("geo_city"),

  userId: integer("user_id"), // null = shared/segment learning; set = personal learning scoped to one user

  learningType: text("learning_type").notNull(),

  insight: text("insight").notNull(),

  avgErPct: numeric("avg_er_pct", { precision: 8, scale: 4 }),

  sampleSize: integer("sample_size").notNull().default(0),

  isViral: boolean("is_viral").notNull().default(false),

  active: boolean("active").notNull().default(true),

  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ContentLearning = typeof contentLearningsTable.$inferSelect;
export type InsertContentLearning = typeof contentLearningsTable.$inferInsert;
