import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Presets de composición de capas por negocio.
 *
 * Cada preset guarda la configuración de capas preferida del usuario (logo, texto, elementos)
 * para que se aplique automáticamente en futuras imágenes del mismo negocio.
 *
 * config_json estructura:
 * {
 *   logo:     { enabled: boolean, position: string, sizePercent: number, color: string },
 *   text:     { enabled: boolean, style: string, position: string, sizePercent: number },
 *   elements: [{ elementId: number, position: string, sizePercent: number }]
 * }
 *
 * Orden de capas al renderizar: fondo → elementos → logo → texto
 */
export const compositionPresetsTable = pgTable("composition_presets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull(),
  name: text("name").notNull(),
  configJson: jsonb("config_json").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCompositionPresetSchema = createInsertSchema(compositionPresetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompositionPreset = z.infer<typeof insertCompositionPresetSchema>;
export type CompositionPreset = typeof compositionPresetsTable.$inferSelect;
