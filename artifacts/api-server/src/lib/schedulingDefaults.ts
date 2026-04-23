/**
 * schedulingDefaults.ts — Fuente ÚNICA de verdad para el plan de publicación por defecto.
 *
 * REGLA DE ORO: Este es el ÚNICO lugar donde se definen días y horas por defecto
 * por plataforma+tipo de contenido. Ningún otro archivo puede tener su propia tabla
 * de defaults. Tanto ai.service.ts como analytics.ts importan desde aquí.
 *
 * Días: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb (ordenados ascendente)
 * Horas: hora local en la zona del usuario (convertida a UTC al programar vía localHourToUTC)
 *
 * Calibrados para audiencias latinoamericanas. Cuando hay datos reales de engagement
 * (≥2 combinaciones día/hora — Regla 12), el endpoint /analytics/posting-suggestions los superpone
 * con valores derivados de IA. Los defaults se usan cuando no hay datos suficientes.
 *
 * REGLA 12 (anti-solapamiento de días entre tipos feed):
 * Los días del pool de reel, image y carousel NO deben solaparse entre sí en la misma plataforma.
 * Si dos tipos comparten el mismo día → getWeeklySlots los selecciona para ambos → el usuario
 * recibe 2 posts de tipos distintos el mismo día ("repite tipos").
 * Solo los pools de stories pueden coincidir con feed (son publicaciones independientes).
 *
 * Distribución Instagram (días exclusivos por tipo feed, source="default"):
 *   reel     → Set{0,3}  (Dom, Mié) — pool [0,3,5,6]
 *   image    → Set{1,2}  (Lun, Mar) — pool [1,2,4]
 *   carousel → Set{4}    (Jue)      — pool [4,5]
 *
 * Distribución TikTok (días exclusivos por tipo feed, source="default"):
 *   reel     → Set{0,2,5} (Dom, Mar, Vie) — pool [0,2,5,6]
 *   image    → Set{1}     (Lun)           — pool [1,3]
 *   carousel → Set{3}     (Mié)           — pool [3,4]
 */

export interface ScheduleEntry {
  days:         number[];
  hours:        number[];
  tip:          string;
  weeklyTarget: { min: number; max: number };
}

export type SchedulingDefaults = Record<string, Record<string, ScheduleEntry>>;

/**
 * Devuelve el plan de publicación por defecto para cada plataforma+tipo.
 * Incluye tip y meta semanal para mostrar en el panel de Sugerencias IA.
 */
export function getSchedulingDefaults(): SchedulingDefaults {
  return {
    instagram: {
      // Días exclusivos por tipo feed (Regla 12 — sin solapamiento en pools activos con source="default"):
      //   reel  → Set{0,3} = Dom+Mié  (pool [0,3,5,6], min=2)
      //   image → Set{1,2} = Lun+Mar  (pool [1,2,4], min=2)
      //   carousel → Set{4} = Jue     (pool [4,5], min=1)
      reel:     { days: [0, 3, 5, 6], hours: [6, 13, 17, 18], tip: "Los Reels alcanzan más gente los domingos y en mitad de semana",  weeklyTarget: { min: 2, max: 4 } },
      image:    { days: [1, 2, 4],    hours: [8, 12, 18],      tip: "Fotos rinden mejor lunes y martes a media mañana",              weeklyTarget: { min: 2, max: 3 } },
      carousel: { days: [4, 5],       hours: [8, 12],          tip: "Los carruseles generan más guardados entre jueves y viernes",   weeklyTarget: { min: 1, max: 2 } },
      story:    { days: [0, 2, 4, 6], hours: [7, 12, 20],      tip: "Historias al despertar y por la noche, días alternos",         weeklyTarget: { min: 3, max: 7 } },
      video:    { days: [5, 6],       hours: [13, 18],          tip: "Videos largos rinden mejor los fines de semana",               weeklyTarget: { min: 1, max: 2 } },
    },
    tiktok: {
      // Días exclusivos por tipo feed (Regla 12 — sin solapamiento en pools activos con source="default"):
      //   reel     → Set{0,2,5} = Dom+Mar+Vie  (pool [0,2,5,6], min=3)
      //   image    → Set{1}     = Lun           (pool [1,3], min=1)
      //   carousel → Set{3}     = Mié           (pool [3,4], min=1)
      reel:     { days: [0, 2, 5, 6], hours: [6, 19, 21],      tip: "TikTok explota en noches de domingo, martes y viernes",        weeklyTarget: { min: 3, max: 7 } },
      image:    { days: [1, 3],       hours: [8, 17],           tip: "Fotos en TikTok rinden mejor los lunes",                      weeklyTarget: { min: 1, max: 2 } },
      carousel: { days: [3, 4],       hours: [12, 18],          tip: "Carruseles de TikTok mejor los miércoles al mediodía",        weeklyTarget: { min: 1, max: 2 } },
      story:    { days: [1, 4, 6],    hours: [8, 19],           tip: "Historias de TikTok: lunes, jueves y sábado",                 weeklyTarget: { min: 1, max: 3 } },
      video:    { days: [2, 4, 6],    hours: [19, 21],          tip: "Videos de TikTok en prime time nocturno",                     weeklyTarget: { min: 2, max: 4 } },
    },
  };
}

/**
 * Versión simplificada (solo days + hours) para el servicio de generación (ai.service.ts).
 * Tipo compatible con el formato Record<platform, Record<ct, { days, hours }>> que usa
 * DEFAULT_CT_SCHEDULE y getUserSchedule().
 */
export function getSchedulingDefaultsSimple(): Record<string, Record<string, { days: number[]; hours: number[] }>> {
  const full = getSchedulingDefaults();
  const result: Record<string, Record<string, { days: number[]; hours: number[] }>> = {};
  for (const [platform, types] of Object.entries(full)) {
    result[platform] = {};
    for (const [ct, entry] of Object.entries(types)) {
      result[platform][ct] = { days: entry.days, hours: entry.hours };
    }
  }
  return result;
}

export const SCHEDULING_PLATFORMS     = ["instagram", "tiktok"] as const;
export const SCHEDULING_CONTENT_TYPES = ["reel", "image", "carousel", "story"] as const;
