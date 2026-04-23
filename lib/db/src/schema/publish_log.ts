import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const publishLogTable = pgTable("publish_log", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  userId: integer("user_id"),           // owner of the post at publish time
  platform: text("platform").notNull(), // instagram | tiktok | facebook
  status: text("status").notNull(),     // published | failed
  postUrl: text("post_url"),
  errorMessage: text("error_message"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  source: text("source").default("auto"), // auto | manual
});

export const insertPublishLogSchema = createInsertSchema(publishLogTable).omit({ id: true, publishedAt: true });
export type InsertPublishLog = z.infer<typeof insertPublishLogSchema>;
export type PublishLog = typeof publishLogTable.$inferSelect;
