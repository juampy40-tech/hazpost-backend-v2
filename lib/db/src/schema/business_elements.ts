import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Biblioteca de elementos visuales por negocio.
 * El usuario sube cualquier imagen (logo de producto, objeto, figura, textura…)
 * y puede colocarla como capa encima de cualquier imagen en la cola de aprobación.
 *
 * UNIVERSAL: todos los planes tienen acceso sin restricción.
 * Límite: 20 elementos por negocio (enforced en backend).
 *
 * GPT-4o Vision analiza el elemento en background y guarda la descripción en `analysis`.
 */
export const businessElementsTable = pgTable("business_elements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull(),
  name: text("name").notNull(),
  storageKey: text("storage_key").notNull(),   // object storage key (path: /objects/...)
  thumbUrl: text("thumb_url"),                 // URL pública del thumbnail (null hasta generación)
  analysis: text("analysis"),                  // descripción GPT-4o Vision (null hasta análisis)
  analysisStatus: text("analysis_status").notNull().default("pending"), // pending | done | error
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBusinessElementSchema = createInsertSchema(businessElementsTable).omit({ id: true, createdAt: true });
export type InsertBusinessElement = z.infer<typeof insertBusinessElementSchema>;
export type BusinessElement = typeof businessElementsTable.$inferSelect;
