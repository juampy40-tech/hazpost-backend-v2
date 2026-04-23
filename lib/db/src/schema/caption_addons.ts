import { pgTable, serial, integer, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const captionAddonsTable = pgTable("caption_addons", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id"),
  businessId: integer("business_id"),
  name:       varchar("name", { length: 150 }).notNull(),
  keywords:   text("keywords").notNull().default(""),
  text:       text("text").notNull(),
  position:   varchar("position", { length: 10 }).notNull().default("after"),
  active:     boolean("active").notNull().default(true),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
});

export type CaptionAddon = typeof captionAddonsTable.$inferSelect;
export type NewCaptionAddon = typeof captionAddonsTable.$inferInsert;
