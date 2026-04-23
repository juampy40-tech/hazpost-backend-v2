/**
 * platformDates.ts — Módulo centralizado de resolución de fechas por plataforma
 *
 * Fuente de verdad única para responder: "¿en qué fecha/hora está programado
 * este post para esta red social?"
 *
 * Regla de extensión: al agregar una nueva red social (ej: YouTube Shorts),
 * solo se necesita:
 *   1. Agregar columna `scheduled_at_youtube` en el schema de posts
 *   2. Agregar case "youtube" en getEffectiveDateForPlatform
 *   3. Ningún otro cambio en el sistema de scheduling
 *
 * Regla de TZ: toda lógica de zona horaria vive en lib/timezone.ts.
 *   bogotaDayKey se mantiene como alias legado (Fase 2 pendiente).
 */

import { dayKeyForTimezone, bogotaDayKey, ADMIN_TZ } from "./timezone.js";

export { dayKeyForTimezone, bogotaDayKey };

export type PostWithDates = {
  scheduledAt:          Date | null;
  scheduledAtInstagram: Date | null;
  scheduledAtTiktok:    Date | null;
  platform:             string | null;
  contentType:          string | null;
};

/**
 * Devuelve la fecha efectiva de un post para una plataforma específica.
 *
 * Regla: usar la fecha específica de la plataforma si existe; sino, usar
 * la fecha canónica del post (scheduledAt). Esto garantiza que posts con
 * platform="both" se detecten correctamente en ambas redes aunque no tengan
 * una fecha específica por plataforma asignada.
 *
 * Mapeo actual:
 *   instagram → scheduledAtInstagram ?? scheduledAt
 *   tiktok    → scheduledAtTiktok    ?? scheduledAt
 *   <nueva>   → scheduledAt (fallback genérico hasta que se agregue su columna)
 */
export function getEffectiveDateForPlatform(
  post: Pick<PostWithDates, "scheduledAt" | "scheduledAtInstagram" | "scheduledAtTiktok">,
  platform: string,
): Date | null {
  if (platform === "instagram") return post.scheduledAtInstagram ?? post.scheduledAt;
  if (platform === "tiktok")    return post.scheduledAtTiktok    ?? post.scheduledAt;
  return post.scheduledAt;
}

/**
 * Construye el mapa de días ocupados por tipo de contenido para una plataforma.
 *
 * Solo incluye posts relevantes para la plataforma objetivo:
 *   - posts con platform === targetPlatform (exclusivos de esa red)
 *   - posts con platform === "both" (publicados en todas las redes)
 *
 * Retorna:
 *   byType  — Map<contentType, Set<dayKey>>  para posts de feed
 *   story   — Set<dayKey>                     para historias
 *
 * @param timezone  IANA timezone string para calcular el día local del usuario.
 *                  Default: ADMIN_TZ ("America/Bogota") — legado, Fase 2 pendiente.
 *
 * Uso: llamar una vez por plataforma con el mismo array de posts para
 * evitar múltiples queries a la base de datos.
 */
export function buildOccupationMap(
  posts:          PostWithDates[],
  targetPlatform: string,
  timezone:       string = ADMIN_TZ,
): { byType: Map<string, Set<string>>; story: Set<string> } {
  const byType = new Map<string, Set<string>>();
  const story  = new Set<string>();

  for (const p of posts) {
    const isRelevant = p.platform === targetPlatform || p.platform === "both";
    if (!isRelevant) continue;

    const d = getEffectiveDateForPlatform(p, targetPlatform);
    if (!d) continue;

    const key = dayKeyForTimezone(new Date(d), timezone);
    const ct  = p.contentType ?? "image";

    if (ct === "story") {
      story.add(key);
    } else {
      if (!byType.has(ct)) byType.set(ct, new Set());
      byType.get(ct)!.add(key);
    }
  }

  return { byType, story };
}
