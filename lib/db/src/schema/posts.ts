import { pgTable, text, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  businessId: integer("business_id"),   // which business this post belongs to (null = legacy/solo user)
  nicheId: integer("niche_id"),
  platform: text("platform").notNull().default("both"), // instagram | tiktok | both
  contentType: text("content_type").notNull().default("image"), // image | reel | carousel
  slideCount: integer("slide_count").default(1), // for carousel: number of slides (3-5)
  caption: text("caption").notNull().default(""),
  aiCaptionOriginal: text("ai_caption_original"), // raw AI-generated caption before user edits (never overwritten)
  hashtags: text("hashtags").notNull().default(""),
  hashtagsTiktok: text("hashtags_tiktok").notNull().default(""),
  selectedImageVariant: integer("selected_image_variant").default(0),
  status: text("status").notNull().default("draft"), // draft | pending_approval | approved | rejected | scheduled | published | failed
  scheduledAt: timestamp("scheduled_at"),
  scheduledAtInstagram: timestamp("scheduled_at_instagram"),
  scheduledAtTiktok: timestamp("scheduled_at_tiktok"),
  publishedAt: timestamp("published_at"),
  instagramPostId: text("instagram_post_id"),
  tiktokPostId: text("tiktok_post_id"),
  locationId: text("location_id"),
  locationName: text("location_name"),
  postNumber: integer("post_number"),   // sequential per-business counter (1,2,3…); null = legacy pre-migration
  // Engagement metrics (populated after publishing, manually or via API)
  likes: integer("likes"),
  comments: integer("comments"),
  shares: integer("shares"),
  reach: integer("reach"),
  saves: integer("saves"),
  generationCostUsd: numeric("generation_cost_usd", { precision: 8, scale: 4 }),
  creditsRefunded: boolean("credits_refunded").notNull().default(false),
  publishRetries: integer("publish_retries").notNull().default(0), // retry counter — reset to 0 on success
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
