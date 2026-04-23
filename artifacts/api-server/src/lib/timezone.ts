/**
 * timezone.ts — ÚNICO módulo con lógica de zonas horarias en HazPost.
 *
 * REGLA DE ORO: ningún otro archivo puede tener lógica de TZ propia.
 * Todo el código que maneje fechas DEBE importar y usar SOLO estas funciones.
 *
 * Reglas de la plataforma:
 *   - DB:    siempre UTC
 *   - Admin: siempre America/Bogota
 *   - User:  zona horaria del país que eligió al registrarse
 */

export const ADMIN_TZ    = "America/Bogota";
export const FALLBACK_TZ = "America/Bogota";

/**
 * Mapa de código ISO 3166-1 alpha-2 → zona horaria IANA.
 * Si el país no está en el mapa → usa FALLBACK_TZ.
 */
export const COUNTRY_TZ: Record<string, string> = {
  // América Latina
  CO: "America/Bogota",
  MX: "America/Mexico_City",
  AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago",
  PE: "America/Lima",
  EC: "America/Guayaquil",
  VE: "America/Caracas",
  BO: "America/La_Paz",
  PY: "America/Asuncion",
  UY: "America/Montevideo",
  BR: "America/Sao_Paulo",
  CR: "America/Costa_Rica",
  PA: "America/Panama",
  GT: "America/Guatemala",
  HN: "America/Tegucigalpa",
  SV: "America/El_Salvador",
  NI: "America/Managua",
  DO: "America/Santo_Domingo",
  CU: "America/Havana",
  PR: "America/Puerto_Rico",
  JM: "America/Jamaica",
  TT: "America/Port_of_Spain",
  // América del Norte
  US: "America/New_York",
  CA: "America/Toronto",
  // Europa
  ES: "Europe/Madrid",
  GB: "Europe/London",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  IT: "Europe/Rome",
  PT: "Europe/Lisbon",
  NL: "Europe/Amsterdam",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  BE: "Europe/Brussels",
  PL: "Europe/Warsaw",
  RU: "Europe/Moscow",
  TR: "Europe/Istanbul",
  UA: "Europe/Kiev",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  GR: "Europe/Athens",
  RO: "Europe/Bucharest",
  HU: "Europe/Budapest",
  CZ: "Europe/Prague",
  SK: "Europe/Bratislava",
  HR: "Europe/Zagreb",
  RS: "Europe/Belgrade",
  BG: "Europe/Sofia",
  // Asia
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  IL: "Asia/Jerusalem",
  IN: "Asia/Kolkata",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  LK: "Asia/Colombo",
  JP: "Asia/Tokyo",
  CN: "Asia/Shanghai",
  KR: "Asia/Seoul",
  TW: "Asia/Taipei",
  HK: "Asia/Hong_Kong",
  SG: "Asia/Singapore",
  MY: "Asia/Kuala_Lumpur",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  PH: "Asia/Manila",
  ID: "Asia/Jakarta",
  MM: "Asia/Rangoon",
  KH: "Asia/Phnom_Penh",
  // Oceanía
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  // África
  ZA: "Africa/Johannesburg",
  EG: "Africa/Cairo",
  NG: "Africa/Lagos",
  KE: "Africa/Nairobi",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  GH: "Africa/Accra",
  ET: "Africa/Addis_Ababa",
  SN: "Africa/Dakar",
};

/**
 * Convierte un código de país ISO → zona horaria IANA.
 * Devuelve FALLBACK_TZ si el país no está mapeado.
 */
export function countryToTimezone(countryCode: string | null | undefined): string {
  if (!countryCode) return FALLBACK_TZ;
  return COUNTRY_TZ[countryCode.toUpperCase()] ?? FALLBACK_TZ;
}

/**
 * Resuelve la zona horaria IANA de un usuario.
 * Prioridad:
 *   1. user.timezone (campo explícito en DB)
 *   2. countryToTimezone(user.brandCountry)
 *   3. FALLBACK_TZ
 */
export function resolveUserTimezone(user: {
  timezone?: string | null;
  brandCountry?: string | null;
}): string {
  if (user.timezone) return user.timezone;
  if (user.brandCountry) return countryToTimezone(user.brandCountry);
  return FALLBACK_TZ;
}

/**
 * Devuelve la clave de día "YYYY-M-D" de una fecha UTC en la zona horaria indicada.
 * Reemplaza el uso hardcodeado de UTC-5.
 *
 * Ejemplo:
 *   dayKeyForTimezone(new Date("2024-01-15T04:00:00Z"), "America/Bogota")
 *   → "2024-1-14"  (porque 4:00 AM UTC = 11:00 PM del 14 enero en Bogotá UTC-5)
 *
 *   dayKeyForTimezone(new Date("2024-01-15T04:00:00Z"), "Pacific/Auckland")
 *   → "2024-1-15"  (porque 4:00 AM UTC = 5:00 PM del 15 enero en NZ UTC+13)
 */
export function dayKeyForTimezone(utcDate: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year:     "numeric",
    month:    "numeric",
    day:      "numeric",
  }).formatToParts(utcDate);

  const year  = parts.find(p => p.type === "year")?.value  ?? "0";
  const month = parts.find(p => p.type === "month")?.value ?? "0";
  const day   = parts.find(p => p.type === "day")?.value   ?? "0";

  return `${year}-${Number(month)}-${Number(day)}`;
}

/**
 * Alias legado: clave de día en Bogotá (UTC-5).
 * Conservado para compatibilidad con código que aún no fue migrado a Fase 2.
 * @deprecated Usar dayKeyForTimezone(utcDate, req.timezone) en código nuevo.
 */
export function bogotaDayKey(utcDate: Date): string {
  return dayKeyForTimezone(utcDate, ADMIN_TZ);
}

/**
 * Convierte una fecha UTC a un objeto Date "shifteado" a la zona del usuario.
 * Útil para cálculos de hora del día.
 */
export function toUserTz(utcDate: Date, timezone: string): Date {
  const str = new Intl.DateTimeFormat("sv-SE", {
    timeZone:  timezone,
    year:      "numeric",
    month:     "2-digit",
    day:       "2-digit",
    hour:      "2-digit",
    minute:    "2-digit",
    second:    "2-digit",
    hour12:    false,
  }).format(utcDate);
  return new Date(str.replace(" ", "T") + "Z");
}

/**
 * Convierte una fecha UTC a un objeto Date en Bogotá.
 */
export function toAdminTz(utcDate: Date): Date {
  return toUserTz(utcDate, ADMIN_TZ);
}

/**
 * Formatea una fecha UTC como string legible en la zona del usuario.
 * Formato: "YYYY-MM-DD HH:mm:ss"
 */
export function showToUser(utcDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone:  timezone,
    year:      "numeric",
    month:     "2-digit",
    day:       "2-digit",
    hour:      "2-digit",
    minute:    "2-digit",
    second:    "2-digit",
    hour12:    false,
  }).format(utcDate).replace("T", " ");
}

/**
 * Formatea una fecha UTC como string legible en Bogotá (para el admin).
 * Formato: "YYYY-MM-DD HH:mm:ss"
 */
export function showToAdmin(utcDate: Date): string {
  return showToUser(utcDate, ADMIN_TZ);
}

/**
 * Extrae la hora (0-23) de una fecha UTC en la zona indicada.
 * Reemplaza el patrón: (d.getUTCHours() - 5 + 24) % 24
 */
export function hourInTimezone(utcDate: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour:     "numeric",
    hour12:   false,
  }).formatToParts(utcDate);
  const h = parts.find(p => p.type === "hour")?.value;
  return h ? parseInt(h, 10) % 24 : 0;
}

/**
 * Convierte hora local (en la zona dada) + un Date de referencia → UTC Date.
 * Reemplaza bogotaHourToUTC(date, bogotaHour).
 *
 * Algoritmo:
 *   1. Construye el momento UTC "ingenuo" (año/mes/día en UTC con la hora pedida)
 *   2. Obtiene cuál hora local corresponde a ese momento UTC en la zona dada
 *   3. La diferencia determina el offset real; lo resta del UTC ingenuo
 *
 * Ejemplo (Bogotá, UTC-5):
 *   localHourToUTC(refDate, 8, "America/Bogota")
 *   → UTC ingenuo = 08:00 UTC → local = 03:00 AM Bogotá
 *   → offsetH = 3 - 8 = -5 → resultado = 08:00 UTC - (-5h) = 13:00 UTC ✓
 *
 * @param refDate   Fecha de referencia (determina año/mes/día en la zona dada)
 * @param hour      Hora en la zona horaria (0–23)
 * @param timezone  IANA timezone string
 */
/**
 * Devuelve el UTC Date que corresponde a medianoche (00:00:00) en el timezone dado
 * para la misma fecha local que "date" en ese timezone.
 *
 * Algoritmo "noon reference":
 *   1. Obtiene la fecha local (YYYY-MM-DD) usando Intl en el timezone dado.
 *   2. Crea una referencia al mediodía UTC de esa fecha (ref = Date.UTC(y, m, d, 12)).
 *   3. Si ref cae en el día local SIGUIENTE (ocurre en UTC+12 a UTC+14), retrocede 12h.
 *   4. Calcula la hora y minuto locales en ref, luego los resta para llegar a medianoche.
 *
 * Maneja correctamente offsets de 30/45 minutos (IST UTC+5:30, Nepal UTC+5:45, etc.)
 * y todos los timezones de UTC-11 a UTC+14.
 *
 * Ejemplos:
 *   startOfDayInTimezone(new Date("2026-04-22T16:00:00Z"), "America/Bogota")
 *   → new Date("2026-04-22T05:00:00Z")  (April 22 00:00 Bogotá = April 22 05:00 UTC)
 *
 *   startOfDayInTimezone(new Date("2026-04-22T12:00:00Z"), "Asia/Kolkata")
 *   → new Date("2026-04-21T18:30:00Z")  (April 22 00:00 IST = April 21 18:30 UTC)
 */
export function startOfDayInTimezone(date: Date, timezone: string): Date {
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });

  // 1. Obtener fecha local (ej: "2026-04-22")
  const localDateStr = fmt.format(date);
  const [year, month, day] = localDateStr.split("-").map(Number) as [number, number, number];

  // 2. Referencia al mediodía UTC del día local calculado
  let ref = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  // 3. Detectar si ref cayó en el día LOCAL SIGUIENTE (UTC+12 a UTC+14)
  if (fmt.format(ref) !== localDateStr) {
    // Retroceder 12h: mediodía UTC → medianoche UTC del mismo día local
    ref = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  }

  // 4. Obtener hora y minutos locales en ref (maneja offsets de 30/45 min)
  const timeParts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  }).format(ref);
  const [hStr, mStr] = timeParts.split(":");
  const localH = parseInt(hStr, 10);
  const localM = parseInt(mStr, 10);

  // 5. Medianoche = ref − localH horas − localM minutos
  return new Date(ref.getTime() - localH * 3_600_000 - localM * 60_000);
}

export function localHourToUTC(refDate: Date, hour: number, timezone: string): Date {
  const localDateStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  }).format(refDate);

  const [year, month, day] = localDateStr.split("-").map(Number) as [number, number, number];
  const naiveUTC = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour:     "numeric",
    hour12:   false,
  }).formatToParts(naiveUTC);
  const localH = parseInt(parts.find(p => p.type === "hour")?.value ?? String(hour), 10) % 24;
  const offsetH = localH - hour;

  return new Date(naiveUTC.getTime() - offsetH * 3_600_000);
}
