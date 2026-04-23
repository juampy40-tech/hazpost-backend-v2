import { pgTable, serial, text, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";

/**
 * Admin-created affiliate codes.
 * Admin creates these proactively to share with partners/agencies.
 * Each code has a commission % and validity in months.
 */
export const affiliateCodesTable = pgTable("affiliate_codes", {
  id:              serial("id").primaryKey(),
  code:            text("code").notNull().unique(),            // e.g. "AGENCIA-MED"
  commissionPct:   integer("commission_pct").notNull().default(20),  // 1–100
  durationMonths:  integer("duration_months").notNull().default(6),  // 1–24
  email:           text("email").notNull(),                         // Affiliate email
  notes:           text("notes"),                                   // Optional admin notes
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Tracks who registered using an affiliate code.
 * One record per registration that used a code.
 */
export const affiliateConversionsTable = pgTable("affiliate_conversions", {
  id:           serial("id").primaryKey(),
  codeId:       integer("code_id").notNull().references(() => affiliateCodesTable.id, { onDelete: "cascade" }),
  userId:       integer("user_id").notNull(),                       // The user who registered
  plan:         text("plan").notNull().default("free"),             // Plan at registration
  amountUsd:    real("amount_usd"),                                 // Revenue for commission calculation
  registeredAt: timestamp("registered_at").notNull().defaultNow(),
});

export type AffiliateCodes = typeof affiliateCodesTable.$inferSelect;
export type AffiliateConversions = typeof affiliateConversionsTable.$inferSelect;
