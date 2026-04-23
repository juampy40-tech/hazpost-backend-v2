/**
 * Frontend timezone utilities — única fuente de verdad TZ para HazPost frontend.
 *
 * REGLA: No duplicar lógica de zonas horarias en ningún otro archivo del frontend.
 * Importar siempre desde aquí.
 *
 * Ver skill timezone-rules para la arquitectura completa.
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Zona horaria del admin y del scheduler backend. Matches backend bogotaDayKey. */
export const ADMIN_TZ = "America/Bogota";

/** Zona horaria de fallback cuando el usuario no tiene una configurada. */
export const FALLBACK_TZ = "America/Bogota";

/**
 * Zona horaria usada para agrupar posts en el calendario (vistas mensual y semanal)
 * y para los IDs de las celdas de drag-and-drop.
 * DEBE coincidir con el `bogotaDayKey` del backend — no usar userTz aquí.
 */
export const SCHEDULING_TZ = "America/Bogota";

/** Horas óptimas de publicación (en SCHEDULING_TZ). */
export const OPTIMAL_HOURS = [7, 12, 19] as const;

// ─── Utilidades de hora/día ───────────────────────────────────────────────────

/** Extrae la hora (0-23) de un string ISO UTC en la zona horaria indicada. */
export function hourInTz(isoString: string, tz: string): number {
  try {
    const d = new Date(isoString);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).formatToParts(d);
    const h = parts.find(p => p.type === "hour")?.value;
    return h ? parseInt(h, 10) % 24 : 0;
  } catch { return 0; }
}

/**
 * Devuelve true si la fecha UTC cae en el mismo día de calendario en la zona
 * horaria indicada que `dayDate` (interpretada en tiempo local del browser).
 */
export function sameDayInTz(utcDate: Date, dayDate: Date, tz: string): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(utcDate);
  const y = parseInt(parts.find(p => p.type === "year")?.value ?? "0");
  const m = parseInt(parts.find(p => p.type === "month")?.value ?? "1") - 1;
  const d = parseInt(parts.find(p => p.type === "day")?.value ?? "0");
  return y === dayDate.getFullYear() && m === dayDate.getMonth() && d === dayDate.getDate();
}

/**
 * Convierte un dateStr local ("YYYY-MM-DD") + hora local en la zona indicada → Date UTC.
 * Ejemplo: localHourToUtcFn("2026-05-03", 19, "America/Bogota") → 2026-05-04T00:00:00Z
 */
export function localHourToUtcFn(dateStr: string, hour: number, tz: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const naiveUTC = new Date(Date.UTC(year!, month! - 1, day!, hour, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(naiveUTC);
  const localH = parseInt(parts.find(p => p.type === "hour")?.value ?? String(hour), 10) % 24;
  const offsetH = localH - hour;
  return new Date(naiveUTC.getTime() - offsetH * 3_600_000);
}

/**
 * Devuelve la próxima hora óptima de publicación en la zona indicada.
 * Si ya pasaron todas las horas óptimas del día, retorna la primera del día siguiente.
 */
export function nextOptimalHour(tz: string): number {
  const now = new Date();
  const currentH = hourInTz(now.toISOString(), tz);
  return OPTIMAL_HOURS.find(h => h > currentH) ?? OPTIMAL_HOURS[0];
}

// ─── Formateo de fechas para el calendario ────────────────────────────────────

/**
 * Formatea un Date como "YYYY-MM-DD" usando tiempo LOCAL del browser.
 * Usar para IDs de celdas drag-and-drop del calendario — garantiza que el ID
 * coincida con el día que el usuario VE en pantalla, sin drift UTC.
 *
 * @example formatCalendarDayKey(new Date(2026, 4, 3)) → "2026-05-03"
 */
export function formatCalendarDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Etiqueta de hora (ej. "7pm", "12:30pm") desde un ISO UTC en la zona indicada.
 * Por defecto usa ADMIN_TZ (Bogotá) para coincidir con el scheduler del backend.
 */
export function getTimeLabel(scheduledAt: string | null | undefined, tz = ADMIN_TZ): string {
  if (!scheduledAt) return '';
  try {
    const d = new Date(scheduledAt);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(d);
    const hour   = parts.find(p => p.type === "hour")?.value ?? "12";
    const minute = parts.find(p => p.type === "minute")?.value ?? "00";
    const period = (parts.find(p => p.type === "dayPeriod")?.value ?? "AM").toLowerCase().replace(/\./g, "");
    const mm = minute !== "00" ? `:${minute}` : "";
    return `${hour}${mm}${period}`;
  } catch { return ''; }
}

// ─── Utilitarias para inputs datetime-local (Approval) ────────────────────────

/**
 * Convierte un Date UTC a string compatible con `<input type="datetime-local">`
 * en la zona horaria del usuario.
 * @example toLocalDatetimeInput(new Date("2026-05-04T00:00:00Z"), "America/Bogota") → "2026-05-03T19:00"
 */
export function toLocalDatetimeInput(d: Date, tz = ADMIN_TZ): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).format(d).replace(" ", "T");
}

/**
 * Convierte el valor de un `<input type="datetime-local">` (en la zona del usuario)
 * a un ISO UTC string para guardar en DB.
 */
export function localDatetimeInputToUtc(local: string, tz = ADMIN_TZ): string {
  const [datePart, timePart] = local.split("T");
  const [year, month, day] = (datePart ?? "").split("-").map(Number);
  const [hours, minutes]   = (timePart ?? "").split(":").map(Number);
  if (!year || !month || !day || hours == null || minutes == null) return local;
  const naiveUTC = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", hour12: false,
  }).formatToParts(naiveUTC);
  const localH = parseInt(parts.find(p => p.type === "hour")?.value ?? String(hours), 10) % 24;
  const offsetH = localH - hours;
  return new Date(naiveUTC.getTime() - offsetH * 3_600_000).toISOString();
}

// ─── Aliases deprecados — mantener por retrocompatibilidad ───────────────────

/** @deprecated Usar toLocalDatetimeInput(d, tz) */
export function toBogotaLocal(d: Date, tz = ADMIN_TZ): string {
  return toLocalDatetimeInput(d, tz);
}

/** @deprecated Usar localDatetimeInputToUtc(local, tz) */
export function bogotaLocalToUtc(local: string, tz = ADMIN_TZ): string {
  return localDatetimeInputToUtc(local, tz);
}

/** @deprecated Usar hourInTz(isoString, tz) */
export function utcHourToBogota(isoString: string, tz = ADMIN_TZ): number {
  try { return hourInTz(isoString, tz); } catch { return 12; }
}
