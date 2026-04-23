import { fileTypeFromBuffer } from "file-type";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
]);

export interface ScanResult {
  ok: boolean;
  detectedMime?: string;
  error?: string;
}

/**
 * validateMimeType — verifica los magic bytes reales del buffer.
 *
 * Acepta: image/jpeg, image/png, image/webp, image/gif, video/mp4
 * Rechaza cualquier otro tipo con ok=false y un mensaje de error.
 *
 * Nunca lanza excepción — devuelve { ok: false, error } si algo falla.
 */
export async function validateMimeType(buffer: Buffer): Promise<ScanResult> {
  try {
    const result = await fileTypeFromBuffer(buffer);
    if (!result) {
      return { ok: false, error: "No se pudo determinar el tipo de archivo (magic bytes no reconocidos)" };
    }
    if (!ALLOWED_MIME_TYPES.has(result.mime)) {
      return { ok: false, detectedMime: result.mime, error: `Tipo de archivo no permitido: ${result.mime}. Solo se aceptan: imagen (JPEG, PNG, WebP, GIF) y video (MP4)` };
    }
    return { ok: true, detectedMime: result.mime };
  } catch (err) {
    return { ok: false, error: "Error al analizar el tipo de archivo" };
  }
}

/**
 * validateBase64Mime — helper para uploads en formato base64.
 * Decodifica el string base64 (sin prefijo data:URL) y llama a validateMimeType.
 */
export async function validateBase64Mime(base64: string): Promise<ScanResult> {
  try {
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) {
      return { ok: false, error: "El archivo está vacío" };
    }
    return validateMimeType(buffer);
  } catch {
    return { ok: false, error: "Error al decodificar base64" };
  }
}
