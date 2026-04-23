import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Durable credit deduction ledger for AI generation flows.
 *
 * Purpose: Enables true atomicity between credit deduction and post insert
 * even when an AI HTTP call separates the two DB operations.
 *
 * Flow:
 *   1. db.transaction(tx => { deductCredits(tx); INSERT pending row → gets id })
 *   2. AI call (outside any TX)
 *   3. db.transaction(tx => { UPDATE pending row SET status='settled', postId=X; INSERT post })
 *
 * If the process crashes between steps 1 and 3, the 'pending' row is visible to a
 * reconciliation job that can refund the deducted credits automatically.
 */
export const pendingCreditDeductionsTable = pgTable("pending_credit_deductions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  cost: integer("cost").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  postId: integer("post_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});
