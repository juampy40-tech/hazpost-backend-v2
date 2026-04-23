import { Router } from "express";
import { requireAuth } from "../../lib/auth.js";
import { db } from "@workspace/db";
import { publishingSchedulesTable, postsTable } from "@workspace/db";
import { eq, and, inArray, isNotNull, gte } from "drizzle-orm";
import { DEFAULT_CT_SCHEDULE, getUserSchedule } from "../../services/ai.service.js";

/** Converts a Bogotá hour (UTC-5) to a UTC Date for the given day */
function applyBogotaHourToDate(original: Date, bogotaHour: number): Date {
  const utcHour = bogotaHour + 5;
  const result  = new Date(original);
  result.setUTCHours(0, 0, 0, 0); // zero out time portion
  if (utcHour >= 24) {
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(utcHour - 24, 0, 0, 0);
  } else {
    result.setUTCHours(utcHour, 0, 0, 0);
  }
  return result;
}

const router = Router();

const PLATFORMS     = ["instagram", "tiktok"] as const;
const CONTENT_TYPES = ["reel", "image", "carousel", "story"] as const;

// GET /api/social/publishing-schedule
// Returns the user's current plan (merged with defaults for missing entries).
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const rows = await db
    .select()
    .from(publishingSchedulesTable)
    .where(eq(publishingSchedulesTable.userId, userId));

  // Build merged schedule (user rows + defaults for missing)
  const schedule: Record<string, Record<string, { days: number[]; hours: number[] }>> = {};
  for (const row of rows) {
    if (!schedule[row.platform]) schedule[row.platform] = {};
    try {
      schedule[row.platform][row.contentType] = {
        days:  JSON.parse(row.days)  as number[],
        hours: JSON.parse(row.hours) as number[],
      };
    } catch { /* skip malformed */ }
  }
  for (const [platform, types] of Object.entries(DEFAULT_CT_SCHEDULE)) {
    for (const [ct, val] of Object.entries(types)) {
      if (!schedule[platform]?.[ct]) {
        if (!schedule[platform]) schedule[platform] = {};
        schedule[platform][ct] = val;
      }
    }
  }

  res.json({ schedule });
});

// PUT /api/social/publishing-schedule
// Body: { platform, contentType, days: number[], hours: number[] }
// Upserts a single platform+contentType entry.
router.put("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { platform, contentType, days, hours } = req.body as {
    platform: string;
    contentType: string;
    days: number[];
    hours: number[];
  };

  if (!PLATFORMS.includes(platform as any))
    return res.status(400).json({ error: "Invalid platform" });
  if (!CONTENT_TYPES.includes(contentType as any))
    return res.status(400).json({ error: "Invalid contentType" });
  if (!Array.isArray(days) || days.some(d => typeof d !== "number" || d < 0 || d > 6))
    return res.status(400).json({ error: "days must be an array of integers 0-6" });
  if (!Array.isArray(hours) || hours.some(h => typeof h !== "number" || h < 0 || h > 23))
    return res.status(400).json({ error: "hours must be an array of integers 0-23" });

  // Upsert: check if row exists
  const existing = await db
    .select({ id: publishingSchedulesTable.id })
    .from(publishingSchedulesTable)
    .where(and(
      eq(publishingSchedulesTable.userId, userId),
      eq(publishingSchedulesTable.platform, platform),
      eq(publishingSchedulesTable.contentType, contentType),
    ));

  if (existing.length > 0) {
    await db
      .update(publishingSchedulesTable)
      .set({ days: JSON.stringify(days), hours: JSON.stringify(hours), updatedAt: new Date() })
      .where(eq(publishingSchedulesTable.id, existing[0].id));
  } else {
    await db
      .insert(publishingSchedulesTable)
      .values({ userId, platform, contentType, days: JSON.stringify(days), hours: JSON.stringify(hours) });
  }

  res.json({ ok: true });
});

// PUT /api/social/publishing-schedule/bulk
// Body: { schedule: { [platform]: { [ct]: { days, hours } } } }
// Replaces the entire plan for the user.
router.put("/bulk", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { schedule } = req.body as {
    schedule: Record<string, Record<string, { days: number[]; hours: number[] }>>;
  };

  if (!schedule || typeof schedule !== "object")
    return res.status(400).json({ error: "schedule is required" });

  for (const platform of PLATFORMS) {
    for (const ct of CONTENT_TYPES) {
      const entry = schedule[platform]?.[ct];
      if (!entry) continue;
      const { days, hours } = entry;

      const existing = await db
        .select({ id: publishingSchedulesTable.id })
        .from(publishingSchedulesTable)
        .where(and(
          eq(publishingSchedulesTable.userId, userId),
          eq(publishingSchedulesTable.platform, platform),
          eq(publishingSchedulesTable.contentType, ct),
        ));

      if (existing.length > 0) {
        await db
          .update(publishingSchedulesTable)
          .set({ days: JSON.stringify(days), hours: JSON.stringify(hours), updatedAt: new Date() })
          .where(eq(publishingSchedulesTable.id, existing[0].id));
      } else {
        await db
          .insert(publishingSchedulesTable)
          .values({ userId, platform, contentType: ct, days: JSON.stringify(days), hours: JSON.stringify(hours) });
      }
    }
  }

  res.json({ ok: true });
});

// POST /api/publishing-schedule/apply-to-existing
// Re-schedules all approved/pending_approval/scheduled future posts so their
// times match the user's current plan. The calendar DAY is preserved — only
// the TIME OF DAY changes to match the plan's first hour for each content type.
// Published and failed posts are never touched.
// This endpoint must only be called when the user explicitly requests it.
router.post("/apply-to-existing", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const plan   = await getUserSchedule(userId);
  const now    = new Date();

  // Only touch future posts that haven't been published yet
  const posts = await db
    .select({
      id:                   postsTable.id,
      platform:             postsTable.platform,
      contentType:          postsTable.contentType,
      scheduledAt:          postsTable.scheduledAt,
      scheduledAtInstagram: postsTable.scheduledAtInstagram,
      scheduledAtTiktok:    postsTable.scheduledAtTiktok,
    })
    .from(postsTable)
    .where(and(
      eq(postsTable.userId, userId),
      inArray(postsTable.status, ["pending_approval", "approved", "scheduled"]),
      gte(postsTable.scheduledAt, now),
    ));

  let updated = 0;

  for (const post of posts) {
    const ct = (post.contentType ?? "image") as string;

    // Determine the plan hour for IG and TK parts of this post.
    // For "both" posts: IG uses instagram plan, TK uses tiktok plan.
    // For single-platform posts: use the matching platform plan.
    const getHour = (platform: string): number | null => {
      const entry = plan[platform]?.[ct];
      if (!entry || entry.hours.length === 0) return null;
      return entry.hours[0];
    };

    const updates: Record<string, Date | null> = {};
    let hasChange = false;

    if (post.platform === "instagram" || post.platform === "both") {
      const h = getHour("instagram");
      if (h !== null) {
        const base = post.scheduledAtInstagram ?? post.scheduledAt;
        if (base) {
          const newDate = applyBogotaHourToDate(base, h);
          updates.scheduledAtInstagram = newDate;
          // For "instagram" single-platform, scheduledAt IS the IG date.
          if (post.platform === "instagram") updates.scheduledAt = newDate;
          hasChange = true;
        }
      }
    }
    if (post.platform === "tiktok" || post.platform === "both") {
      const h = getHour("tiktok");
      if (h !== null) {
        const base = post.scheduledAtTiktok ?? post.scheduledAt;
        if (base) {
          const newDate = applyBogotaHourToDate(base, h);
          updates.scheduledAtTiktok = newDate;
          // For "tiktok" single-platform, scheduledAt IS the TK date.
          if (post.platform === "tiktok") updates.scheduledAt = newDate;
          hasChange = true;
        }
      }
    }
    // For "both" posts, scheduledAt = IG canonical date.
    if (post.platform === "both" && updates.scheduledAtInstagram) {
      updates.scheduledAt = updates.scheduledAtInstagram;
    }

    if (!hasChange) continue;

    await db
      .update(postsTable)
      .set(updates as any)
      .where(eq(postsTable.id, post.id));
    updated++;
  }

  res.json({ ok: true, updated });
});

// DELETE /api/publishing-schedule
// Resets user to defaults (deletes all rows → fallback kicks in).
router.delete("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  await db
    .delete(publishingSchedulesTable)
    .where(eq(publishingSchedulesTable.userId, userId));
  res.json({ ok: true, message: "Plan restablecido a los valores por defecto." });
});

export default router;
