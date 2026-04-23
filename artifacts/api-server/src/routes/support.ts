import { Router } from "express";
import { db, supportMessages, usersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth.js";

const router = Router();

// ─── User routes (requireAuth) ────────────────────────────────────────────────

// GET /api/support/messages — user's own conversation with HazPost support
router.get("/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const msgs = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.userId, userId))
      .orderBy(supportMessages.createdAt);

    // Mark all admin messages as read by user
    await db
      .update(supportMessages)
      .set({ readByUser: true })
      .where(
        and(
          eq(supportMessages.userId, userId),
          eq(supportMessages.senderRole, "admin"),
          eq(supportMessages.readByUser, false),
        )
      );

    res.json({ messages: msgs });
  } catch (err) {
    console.error("[GET /support/messages]", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// POST /api/support/messages — user sends a message to HazPost support
router.post("/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { content } = req.body as { content?: string };
    if (!content?.trim()) return res.status(400).json({ error: "Mensaje vacío" });

    const [msg] = await db
      .insert(supportMessages)
      .values({ userId, senderRole: "user", content: content.trim(), readByAdmin: false, readByUser: true })
      .returning();

    res.json({ message: msg });
  } catch (err) {
    console.error("[POST /support/messages]", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// GET /api/support/unread — count of unread admin replies for the current user
router.get("/unread", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportMessages)
      .where(
        and(
          eq(supportMessages.userId, userId),
          eq(supportMessages.senderRole, "admin"),
          eq(supportMessages.readByUser, false),
        )
      );
    res.json({ unread: row?.count ?? 0 });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// ─── Admin routes (requireAdmin) ─────────────────────────────────────────────

// GET /api/support/admin/conversations — list all users who have sent support messages
router.get("/admin/conversations", requireAdmin, async (req, res) => {
  try {
    // Get distinct userIds with their last message and unread count
    const rows = await db
      .select({
        userId: supportMessages.userId,
        lastMessage: supportMessages.content,
        lastAt: supportMessages.createdAt,
        senderRole: supportMessages.senderRole,
      })
      .from(supportMessages)
      .orderBy(desc(supportMessages.createdAt));

    // Group by userId keeping only the most recent message per user
    const userMap = new Map<number, { userId: number; lastMessage: string; lastAt: string; lastSender: string }>();
    for (const r of rows) {
      if (!userMap.has(r.userId)) {
        userMap.set(r.userId, {
          userId: r.userId,
          lastMessage: r.lastMessage,
          lastAt: r.lastAt.toISOString(),
          lastSender: r.senderRole,
        });
      }
    }

    // Get unread counts per user (messages from users not yet read by admin)
    const unreadRows = await db
      .select({ userId: supportMessages.userId, count: sql<number>`count(*)::int` })
      .from(supportMessages)
      .where(and(eq(supportMessages.senderRole, "user"), eq(supportMessages.readByAdmin, false)))
      .groupBy(supportMessages.userId);

    const unreadMap = new Map(unreadRows.map(r => [r.userId, r.count]));

    // Get user info
    const userIds = [...userMap.keys()];
    const users = userIds.length > 0
      ? await db
          .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
          .from(usersTable)
          .where(sql`${usersTable.id} = ANY(${sql.raw(`ARRAY[${userIds.join(",")}]::int[]`)})`)
      : [];

    const userInfoMap = new Map(users.map(u => [u.id, u]));

    const conversations = [...userMap.values()].map(c => ({
      ...c,
      unread: unreadMap.get(c.userId) ?? 0,
      email: userInfoMap.get(c.userId)?.email ?? `Usuario ${c.userId}`,
      displayName: userInfoMap.get(c.userId)?.displayName ?? `Usuario ${c.userId}`,
    }));

    // Sort: unread first, then by lastAt desc
    conversations.sort((a, b) => {
      if (b.unread !== a.unread) return b.unread - a.unread;
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    });

    res.json({ conversations });
  } catch (err) {
    console.error("[GET /support/admin/conversations]", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// GET /api/support/admin/messages/:userId — get full conversation for a user
router.get("/admin/messages/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "userId inválido" });

    const msgs = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.userId, userId))
      .orderBy(supportMessages.createdAt);

    // Mark user messages as read by admin
    await db
      .update(supportMessages)
      .set({ readByAdmin: true })
      .where(
        and(
          eq(supportMessages.userId, userId),
          eq(supportMessages.senderRole, "user"),
          eq(supportMessages.readByAdmin, false),
        )
      );

    res.json({ messages: msgs });
  } catch (err) {
    console.error("[GET /support/admin/messages/:userId]", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// POST /api/support/admin/reply/:userId — admin replies to a user
router.post("/admin/reply/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "userId inválido" });

    const { content } = req.body as { content?: string };
    if (!content?.trim()) return res.status(400).json({ error: "Mensaje vacío" });

    const [msg] = await db
      .insert(supportMessages)
      .values({ userId, senderRole: "admin", content: content.trim(), readByAdmin: true, readByUser: false })
      .returning();

    res.json({ message: msg });
  } catch (err) {
    console.error("[POST /support/admin/reply/:userId]", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// GET /api/support/admin/unread-total — total unread messages across all users (for admin badge)
router.get("/admin/unread-total", requireAdmin, async (req, res) => {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportMessages)
      .where(and(eq(supportMessages.senderRole, "user"), eq(supportMessages.readByAdmin, false)));
    res.json({ unread: row?.count ?? 0 });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;
