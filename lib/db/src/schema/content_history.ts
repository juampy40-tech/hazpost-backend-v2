import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Tracks generated caption hooks + background prompts across batches.
 * Used to enforce the 80% novelty rule:
 *  - No title/hook repeated if >60% Jaccard similarity with last 50 entries
 *  - Background prompt hashes not reused within 4 batches
 */
export const generationBatchesTable = pgTable("generation_batches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),  // owner user — for tenant-scoped novelty checks
  platform: text("platform").notNull().default("both"),
  postCount: integer("post_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contentHistoryTable = pgTable("content_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),              // owner user — for per-tenant novelty checks
  businessId: integer("business_id"),      // which business generated this content (null = legacy)
  batchId: integer("batch_id").notNull(),
  platform: text("platform").notNull(),
  captionHook: text("caption_hook").notNull(),
  contentType: text("content_type").notNull().default("image"),
  backgroundPromptHash: text("background_prompt_hash"),
  /** Niche/topic name recorded during automatic generation.
   *  Used to enforce the 10-day minimum gap between same-topic posts.
   *  NULL when generated manually by the user. */
  topicKey: text("topic_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GenerationBatch = typeof generationBatchesTable.$inferSelect;
export type ContentHistory = typeof contentHistoryTable.$inferSelect;
