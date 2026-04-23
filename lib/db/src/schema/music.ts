import { pgTable, serial, varchar, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";

export const musicTracksTable = pgTable("music_tracks", {
  id:           serial("id").primaryKey(),
  title:        varchar("title", { length: 200 }).notNull(),
  artist:       varchar("artist", { length: 200 }).notNull().default(""),
  genre:        varchar("genre", { length: 50 }).notNull().default("general"),
  mood:         varchar("mood", { length: 50 }).notNull().default("energetic"),
  sourceUrl:    varchar("source_url", { length: 1000 }).notNull(),
  pageUrl:      varchar("page_url", { length: 500 }).default(""),
  duration:     integer("duration").notNull().default(30),
  bpm:          integer("bpm").default(0),
  usageCount:   integer("usage_count").notNull().default(0),
  lastUsedAt:   timestamp("last_used_at"),
  addedAt:      timestamp("added_at").notNull().defaultNow(),
  isProtected:  boolean("is_protected").notNull().default(false),
  tags:         text("tags").default(""),
  license:      varchar("license", { length: 100 }).default("Pixabay License"),
  pixabayId:    varchar("pixabay_id", { length: 50 }).default(""),
  isValid:      boolean("is_valid").notNull().default(true),
  isTrending:   boolean("is_trending").notNull().default(false),
  energyLevel:  varchar("energy_level", { length: 20 }).default("medium"),
});

export type MusicTrack    = typeof musicTracksTable.$inferSelect;
export type NewMusicTrack = typeof musicTracksTable.$inferInsert;
