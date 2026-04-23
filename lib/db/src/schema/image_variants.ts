import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const imageVariantsTable = pgTable("image_variants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),  // owner user — stamps on insert for tenant scoping
  businessId: integer("business_id"),  // negocio propietario — cacheado al generar
  industryGroupSlug: text("industry_group_slug"),  // slug del grupo de industria — cacheado al generar
  subIndustrySlug: text("sub_industry_slug"),      // slug de sub-industria nivel 2 — más preciso que industryGroupSlug
  country: text("country"),                        // código de país del negocio dueño (ej: "CO", "MX") — para filtro N2
  postId: integer("post_id"),  // null for landing-page hero images (not tied to a post)
  variantIndex: integer("variant_index").notNull().default(0),
  imageData: text("image_data").notNull(), // base64 composited image (with logo + text), or raw upload content
  rawBackground: text("raw_background"),  // base64 raw DALL-E output (no logo, no text) — cropped to 4:5 for IG/both portrait
  originalRawBackground: text("original_raw_background"), // base64 original 9:16 AI output BEFORE 4:5 crop (portrait posts only)
  tiktokImageData: text("tiktok_image_data"), // base64 composited image at 9:16 for TikTok (portrait "both" posts only)
  mimeType: text("mime_type").default("image/jpeg"), // MIME type — used for raw uploads (video/mp4, image/jpeg, etc.)
  style: text("style").notNull().default("photorealistic"), // photorealistic | graphic | infographic | raw_upload
  prompt: text("prompt").notNull().default(""),
  libraryUseCount: integer("library_use_count").notNull().default(0), // times reused from background library
  // Overlay parameters stored at generation time so the TikTok 9:16 re-composite
  // on approval uses the exact same settings the reviewer saw on the IG variant.
  overlayLogoPosition: text("overlay_logo_position"), // top-right | top-left | bottom-right | bottom-left | center
  overlayLogoColor: text("overlay_logo_color"),       // white | blue | dark
  overlayCaptionHook: text("overlay_caption_hook"),   // short hook text used in the text banner
  overlayTextStyle: text("overlay_text_style"),       // cinema | eco | minimal | bold
  overlayTextPosition: text("overlay_text_position"), // top | center | bottom
  overlayTextSize: text("overlay_text_size"),         // small | medium | large
  overlayFont: text("overlay_font"),                  // bebas | playfair | montserrat | roboto | oswald — new font family presets
  overlayFont2: text("overlay_font2"),                // optional second font for lines 2-N of headline
  overlayFilter: text("overlay_filter"),              // none | warm | cool | dramatic | vintage | dark | vivid | haze
  overlayTitleColor1: text("overlay_title_color1"),   // primary brand color for headline accent (#RRGGBB)
  overlayTitleColor2: text("overlay_title_color2"),   // secondary brand color for headline accent (#RRGGBB)
  overlaySignatureText: text("overlay_signature_text"), // firma text below headline; empty = no firma
  overlayShowSignature: text("overlay_show_signature"),  // 'true' | 'false' — whether to render the firma
  overlayCustomLogoUrl: text("overlay_custom_logo_url"), // custom logo path override (e.g. /objects/...) — if null uses business logo
  overlayElementConfigs: jsonb("overlay_element_configs"), // Array: [{ elementId, position, sizePercent }]
  reelObjectPath: text("reel_object_path"),               // GCS object path for generated Ken Burns reel MP4
  rawBackgroundHash: text("raw_background_hash"),         // SHA-256 of rawBackground base64 for deduplication
  generationStatus: text("generation_status").default("ready"), // ready | pending | error
  generationError: text("generation_error"),              // error message if generationStatus = "error"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertImageVariantSchema = createInsertSchema(imageVariantsTable).omit({ id: true, createdAt: true });
export type InsertImageVariant = z.infer<typeof insertImageVariantSchema>;
export type ImageVariant = typeof imageVariantsTable.$inferSelect;
