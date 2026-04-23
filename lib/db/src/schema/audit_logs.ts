import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Persistent audit trail for critical business actions.
 *
 * Rules:
 * - NEVER store passwords, raw tokens, or other secrets in metadata.
 * - Each auditLog() call uses a try/catch so a logging failure
 *   never blocks the main request flow.
 * - Rows in this table are append-only (never updated, never deleted by app code).
 */
export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  businessId: integer("business_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
