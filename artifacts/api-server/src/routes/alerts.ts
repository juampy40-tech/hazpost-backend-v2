import { Router } from "express";
import { db } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * GET /api/alerts — fetch unread platform alerts for the authenticated user.
 * Returns most recent first, max 20.
 */
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  try {
    const rows = await db.execute(sql`
      SELECT id, type, title, message, metadata, is_read, created_at
      FROM platform_alerts
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json({ alerts: rows.rows });
  } catch {
    res.status(500).json({ error: "Error al obtener alertas." });
  }
});

/**
 * GET /api/alerts/unread-count — returns just the count of unread alerts.
 * Used by the layout to show a badge without fetching full alert data.
 */
router.get("/unread-count", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM platform_alerts WHERE user_id = ${userId} AND is_read = FALSE
    `);
    const count = Number((result.rows[0] as { count: string })?.count ?? 0);
    res.json({ count });
  } catch {
    res.json({ count: 0 });
  }
});

/**
 * POST /api/alerts/:id/dismiss — mark an alert as read.
 */
router.post("/:id/dismiss", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const alertId = Number(req.params.id);
  if (!Number.isFinite(alertId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  try {
    await db.execute(sql`
      UPDATE platform_alerts SET is_read = TRUE
      WHERE id = ${alertId} AND user_id = ${userId}
    `);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al descartar alerta." });
  }
});

/**
 * POST /api/alerts/dismiss-all — mark all unread alerts as read for the user.
 */
router.post("/dismiss-all", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  try {
    await db.execute(sql`
      UPDATE platform_alerts SET is_read = TRUE WHERE user_id = ${userId} AND is_read = FALSE
    `);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al descartar alertas." });
  }
});

export default router;
