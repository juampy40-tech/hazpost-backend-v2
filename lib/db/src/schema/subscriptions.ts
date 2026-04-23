import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  plan: text("plan").notNull().default("free"),           // free | starter | business | agency
  status: text("status").notNull().default("active"),     // active | cancelled | expired
  creditsRemaining: integer("credits_remaining").notNull().default(30),
  creditsTotal: integer("credits_total").notNull().default(30),
  reelsRemaining: integer("reels_remaining").notNull().default(0),
  reelsTotal: integer("reels_total").notNull().default(0),
  freeMonthUsed: integer("free_month_used").notNull().default(0), // 0=not used, 1=used (free plan)
  periodStart: timestamp("period_start").notNull().defaultNow(),
  periodEnd: timestamp("period_end"),
  wompiTransactionId: text("wompi_transaction_id"),
  // Extra business slots purchased by this user (paid add-on, independent of plan limit).
  // Effective limit = plan.businessesAllowed + extraBusinessSlots.
  extraBusinessSlots: integer("extra_business_slots").notNull().default(0),
  // Queued downgrade: applied at the start of the next billing cycle.
  // When set, the system will switch plan+credits on next renewal.
  pendingDowngradePlan: text("pending_downgrade_plan"),
  pendingDowngradeAt: timestamp("pending_downgrade_at"),
  // Business IDs to keep active after the downgrade; others become is_active=false.
  // First element is the primary business (is_default=true).
  pendingDowngradeBusinessIds: jsonb("pending_downgrade_business_ids").$type<number[]>().default([]),
  // Snapshot of the plan's capabilities at subscription creation/renewal time.
  // Users retain these values for the entire billing period regardless of admin changes.
  // Null for subscriptions created before this feature (fallback to live plansTable).
  lockedPlanConfig: jsonb("locked_plan_config").$type<{
    creditsPerMonth: number;
    bulkMaxPosts: number;
    allowedContentTypes: string[];
    businessesAllowed: number;
    reelsPerMonth: number;
  } | null>().default(null),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
