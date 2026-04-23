import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Records each extra credit package purchase made by a user mid-month.
 * Credits and reels are added immediately to the user's subscriptionsTable row.
 */
export const creditPurchasesTable = pgTable("credit_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id"),          // optional — which business the credits are for

  packageKey: text("package_key").notNull(),   // e.g. "extra_basic" | "extra_starter" | "extra_business" | "extra_agency"
  priceUsd: real("price_usd").notNull(),
  priceCop: integer("price_cop").notNull(),
  creditsAdded: integer("credits_added").notNull().default(0),
  reelsAdded: integer("reels_added").notNull().default(0),
  postsAdded: integer("posts_added").notNull().default(0),

  wompiTransactionId: text("wompi_transaction_id"),
  status: text("status").notNull().default("pending"), // pending | completed | failed | refunded

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCreditPurchaseSchema = createInsertSchema(creditPurchasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCreditPurchase = z.infer<typeof insertCreditPurchaseSchema>;
export type CreditPurchase = typeof creditPurchasesTable.$inferSelect;
