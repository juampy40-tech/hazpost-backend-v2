import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Per-user publication plan: defines which days and Bogotá hours to post
// for each platform + content type combination.
// The AI or the user can update this plan at any time.
// Rows: one per (userId, platform, contentType). If none found for a user,
// the service falls back to the hardcoded defaults.
export const publishingSchedulesTable = pgTable("publishing_schedules", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").notNull(),
  platform:     text("platform").notNull(),     // instagram | tiktok
  contentType:  text("content_type").notNull(), // reel | image | carousel | story
  days:         text("days").notNull(),          // JSON array e.g. "[0,2,4]"
  hours:        text("hours").notNull(),         // JSON array e.g. "[18,20]"
  updatedAt:    timestamp("updated_at").defaultNow(),
});
