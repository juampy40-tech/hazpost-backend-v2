import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { desc, and, eq, gte } from "drizzle-orm";

const router = Router();

/**
 * GET /api/admin/audit-logs
 * Returns recent audit log entries.
 * Auth: requireAdmin is applied at mount time in routes/index.ts — no duplicate here.
 *
 * Query params:
 *   limit   — max rows to return (1-500, default 100)
 *   action  — filter by action type (e.g. LOGIN_SUCCESS)
 *   userId  — filter by userId (integer)
 *   since   — ISO date string, only return rows after this timestamp
 */
router.get("/", async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isNaN(rawLimit) || rawLimit <= 0
      ? 100
      : Math.min(rawLimit, 500);

    const filterAction = typeof req.query.action === "string" && req.query.action
      ? req.query.action
      : undefined;

    const rawUserId = Number(req.query.userId);
    const filterUserId = !Number.isNaN(rawUserId) && rawUserId > 0 ? rawUserId : undefined;

    let since: Date | undefined;
    if (req.query.since) {
      const parsed = new Date(req.query.since as string);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "Parámetro 'since' inválido — usa formato ISO 8601 (ej: 2026-01-01T00:00:00Z)" });
      }
      since = parsed;
    }

    const conditions = [];
    if (filterAction) conditions.push(eq(auditLogsTable.action, filterAction));
    if (filterUserId) conditions.push(eq(auditLogsTable.userId, filterUserId));
    if (since) conditions.push(gte(auditLogsTable.createdAt, since));

    const rows = await db
      .select()
      .from(auditLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit);

    res.json({ auditLogs: rows, total: rows.length });
  } catch (err) {
    console.error("[admin/audit-logs]", err);
    res.status(500).json({ error: "Error al obtener audit logs" });
  }
});

export default router;
