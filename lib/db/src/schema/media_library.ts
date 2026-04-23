import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mediaLibraryTable = pgTable("media_library", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  businessId: integer("business_id"),
  type: text("type").notNull().default("image"), // 'image' | 'video'
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  filename: text("filename").notNull().default(""),
  label: text("label").notNull().default(""),
  data: text("data").notNull(), // base64-encoded file content
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMediaLibrarySchema = createInsertSchema(mediaLibraryTable).omit({ id: true, createdAt: true });
export type InsertMediaLibraryItem = z.infer<typeof insertMediaLibrarySchema>;
export type MediaLibraryItem = typeof mediaLibraryTable.$inferSelect;
