import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import type { Request } from "express";

/**
 * Audit action constants — one canonical string per event type.
 * Add new actions here to keep them discoverable.
 */
export const AuditAction = {
  LOGIN_SUCCESS:                    "LOGIN_SUCCESS",
  LOGIN_FAILED:                     "LOGIN_FAILED",
  POST_DELETED:                     "POST_DELETED",
  BUSINESS_CONFIG_UPDATED:          "BUSINESS_CONFIG_UPDATED",
  SOCIAL_ACCOUNT_CONNECTED:         "SOCIAL_ACCOUNT_CONNECTED",
  SOCIAL_ACCOUNT_DISCONNECTED:      "SOCIAL_ACCOUNT_DISCONNECTED",
  EXTRA_BUSINESS_SLOT_PURCHASED:    "EXTRA_BUSINESS_SLOT_PURCHASED",
  DOWNGRADE_SCHEDULED:              "DOWNGRADE_SCHEDULED",
  DOWNGRADE_CANCELLED:              "DOWNGRADE_CANCELLED",
  DOWNGRADE_APPLIED:                "DOWNGRADE_APPLIED",
  BUSINESS_REACTIVATED:             "BUSINESS_REACTIVATED",
  BUSINESS_DELETED:                 "BUSINESS_DELETED",
  CART_CHECKOUT_CREATED:            "CART_CHECKOUT_CREATED",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditLogParams {
  userId?: number | null;
  businessId?: number | null;
  action: AuditActionType;
  entityType?: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
  req?: Request;
}

/**
 * Records a critical action to the `audit_logs` table.
 *
 * SAFE BY DESIGN:
 * - Wrapped in try/catch — a logging failure NEVER blocks the caller.
 * - NEVER include passwords, tokens, or secrets in `metadata`.
 * - Captures the IP address from the request when available.
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    const ipAddress = params.req
      ? (
          (params.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          params.req.socket?.remoteAddress ||
          null
        )
      : null;

    await db.insert(auditLogsTable).values({
      userId: params.userId ?? null,
      businessId: params.businessId ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId != null ? String(params.entityId) : null,
      metadata: params.metadata ?? null,
      ipAddress,
    });
  } catch {
    // Intentionally silenced — audit logging must never interrupt the main request.
  }
}
