import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { businessesTable } from "./businesses.js";
import { postsTable } from "./posts.js";

/**
 * Captures real-time visual preference signals from user interactions:
 *  - style_regen: when the user regenerates an image with specific style/filter/font params
 *  - reference_image: the style description extracted from a reference photo the user uploaded
 *  - manual_prompt: a DALL-E prompt written directly by the user in /create-manual
 *
 * The daily cron (runLearningExtraction) reads these signals and extracts
 * user_visual_pattern learnings into content_learnings for injection into future generations.
 *
 * Note: FK constraints also exist at the DB level via startup migration (index.ts).
 */
export const userVisualSignalsTable = pgTable("user_visual_signals", {
  id: serial("id").primaryKey(),

  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "cascade" }),
  postId: integer("post_id").references(() => postsTable.id, { onDelete: "set null" }),

  /** Discriminator: what kind of visual signal this is */
  signalType: text("signal_type").notNull(), // 'style_regen' | 'reference_image' | 'manual_prompt'

  /** For style_regen signals: visual style params the user explicitly chose */
  style: text("style"),           // 'photorealistic' | 'graphic' | 'infographic'
  overlayFilter: text("overlay_filter"), // 'none' | 'warm' | 'cool' | 'dramatic' | 'vintage' | 'dark' | 'vivid' | 'haze'
  textStyle: text("text_style"),  // 'cinema' | 'neon' | 'bebas' | etc.
  overlayFont: text("overlay_font"),
  logoPosition: text("logo_position"), // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

  /** For reference_image and manual_prompt signals: the free-text description */
  imageDescription: text("image_description"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type UserVisualSignal = typeof userVisualSignalsTable.$inferSelect;
export type InsertUserVisualSignal = typeof userVisualSignalsTable.$inferInsert;
