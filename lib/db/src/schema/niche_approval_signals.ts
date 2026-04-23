import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Stores real-time approval/rejection signals from the post approval queue.
 * Powers Capa 1 of the 2-layer feedback system:
 *   - 'approved': user scheduled/published the post (gusto del usuario ✓)
 *   - 'rejected': user deleted a draft/pending post (gusto del usuario ✗)
 *
 * Used by buildActiveNicheWindow to:
 *   1. Suspend niches with ≥3 rejections in 30 days
 *   2. Boost niches with many approvals in the weighted pool (60% weight)
 *
 * Combined with ER-based signals (Capa 2, 40% weight) for the final niche score.
 */
export const nicheApprovalSignalsTable = pgTable("niche_approval_signals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id"),
  nicheId: integer("niche_id"),
  postId: integer("post_id"),
  signal: text("signal").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NicheApprovalSignal = typeof nicheApprovalSignalsTable.$inferSelect;
export type InsertNicheApprovalSignal = typeof nicheApprovalSignalsTable.$inferInsert;
