/**
 * postingSchedule.ts — Fuente central de sugerencias de publicación para scheduler y endpoint.
 *
 * FUNCIÓN CENTRAL: fetchPostingSuggestionsInternal() y fetchSchedulerSuggestions()
 *
 * Reglas (skill: content-scheduler-validator):
 *   - El scheduler NUNCA inventa días ni horarios.
 *   - Los days[] y hours[] del endpoint son la ÚNICA fuente de verdad.
 *   - Nunca cachear entre sesiones de programación (Regla 7).
 *
 * Quién usa qué:
 *   analytics.ts (endpoint GET /posting-suggestions) → fetchPostingSuggestionsInternal()
 *   ai.service.ts (generateBulkPosts, generateExtraPosts) → fetchSchedulerSuggestions()
 *   scheduler.service.ts (checkDailyGapsAndFill) → via generateBulkPosts (indirecto)
 */

import { db } from "@workspace/db";
import { postsTable, usersTable } from "@workspace/db";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { resolveUserTimezone } from "./timezone.js";
import { getSchedulingDefaults } from "./schedulingDefaults.js";

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type ContentSuggestion = {
  days:         { num: number; name: string }[];
  hours:        string[];
  source:       "ai" | "default";
  tip:          string;
  weeklyTarget: { min: number; max: number };
  /** Días en orden de score descendente — solo presente cuando source="ai".
   *  Usado por getWeeklySlots() para seleccionar los primeros N días TOP, no los primeros N cronológicos. */
  rankedDays?:  number[];
};

export type PostingSuggestionsResult = {
  hasRealData:  boolean;
  aiSlotsCount: number;
  suggestions:  Record<string, Record<string, ContentSuggestion>>;
};

/**
 * Formato de schedule para el scheduler interno.
 * Compatible con el antiguo getUserSchedule() pero incluye `source` para Reglas 8/9
 * y `weeklyTarget` para el límite semanal (Regla 11).
 */
export type SchedulerSuggestions = Record<string, Record<string, {
  days:         number[];
  hours:        number[];
  source:       "ai" | "default";
  weeklyTarget: { min: number; max: number };
}>>;

/**
 * Regla 11 — Fuente centralizada de días activos por (platform, contentType).
 *
 * Devuelve el Set<number> de días-de-semana VÁLIDOS para el generador.
 * Restringe el pool a los primeros N días, donde N viene del weeklyTarget:
 *
 *   source = "ai"      → primeros weeklyTarget.max días del pool (datos reales los respaldan)
 *   source = "default" → primeros weeklyTarget.min días del pool (conservador, sin datos)
 *
 * El pre-filtro garantiza automáticamente que el generador NO produce más de N
 * posts por semana para ese tipo — sin necesidad de contadores post-hoc.
 *
 * Acepta tanto SchedulerSuggestions (con weeklyTarget) como DEFAULT_CT_SCHEDULE
 * (sin weeklyTarget) — en el segundo caso usa el min de getSchedulingDefaults().
 *
 * @param ctSchedule  Schedule activo del usuario (fetchSchedulerSuggestions o DEFAULT_CT_SCHEDULE)
 * @param platform    "instagram" | "tiktok"
 * @param ct          "reel" | "image" | "carousel" | "story"
 */
export function getWeeklySlots(
  ctSchedule: Record<string, Record<string, { days: number[]; hours: number[]; source?: string; weeklyTarget?: { min: number; max: number } }>>,
  platform: string,
  ct: string,
): Set<number> {
  const entry = ctSchedule[platform]?.[ct];
  if (!entry?.days?.length) return new Set();

  let limit: number;
  if (!entry.weeklyTarget) {
    const defaults = getSchedulingDefaults();
    limit = defaults[platform]?.[ct]?.weeklyTarget?.min ?? 2;
  } else {
    limit = entry.source === "default" ? entry.weeklyTarget.min : entry.weeklyTarget.max;
  }

  return new Set(entry.days.slice(0, limit));
}

/**
 * @deprecated Usar getWeeklySlots() — pre-filtro de días que reemplaza contadores post-hoc.
 * Mantenido solo para compatibilidad interna durante la transición.
 */
export function getWeeklyPostLimit(
  ctSchedule: Record<string, Record<string, { days: number[]; hours: number[]; source?: string; weeklyTarget?: { min: number; max: number } }>>,
  platform: string,
  ct: string,
): number {
  const entry = ctSchedule[platform]?.[ct];
  const weeklyTarget = entry?.weeklyTarget;
  if (!weeklyTarget) {
    const defaults = getSchedulingDefaults();
    return defaults[platform]?.[ct]?.weeklyTarget?.min ?? 2;
  }
  return entry?.source === "default" ? weeklyTarget.min : weeklyTarget.max;
}

// ─── Constantes internas ─────────────────────────────────────────────────────

const DAY_NAMES      = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const MIN_SLOTS_FOR_AI = 2; // mínimo de combinaciones día/hora para usar datos reales (Regla 12)

const PLATFORMS     = ["instagram", "tiktok"] as const;
const CONTENT_TYPES = ["reel", "image", "carousel", "story"] as const;

// ─── Función principal (compartida por endpoint y scheduler) ──────────────────

/**
 * Extrae la lógica de engagement del endpoint GET /analytics/posting-suggestions.
 * Centraliza el análisis para que endpoint y scheduler usen exactamente la misma fuente.
 *
 * @param userId      ID del usuario (usado para resolver su timezone).
 * @param filterCond  Condición WHERE completa para filtrar posts (tenant scoping).
 *                    - Endpoint admin:       undefined (sin filtro → todos los usuarios)
 *                    - Endpoint no-admin:    eq(postsTable.userId, userId)
 *                    - Scheduler por negocio: and(eq(postsTable.userId, u), eq(postsTable.businessId, b))
 *
 * REGLA 7: No cachear — cada llamada hace fetch fresco a la DB.
 */
export async function fetchPostingSuggestionsInternal(
  userId: number,
  filterCond?: SQL,
): Promise<PostingSuggestionsResult> {

  // 1. Resolver timezone del usuario
  const [userRow] = await db
    .select({ timezone: usersTable.timezone, brandCountry: usersTable.brandCountry })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const userTz = resolveUserTimezone(userRow ?? {});

  // 2. Defaults de schedulingDefaults.ts (única fuente de verdad para defaults)
  const DEFAULTS = getSchedulingDefaults();

  // 3. Incrustar timezone como literal SQL (patrón fix #387)
  //    sql.raw() evita que PostgreSQL asigne distintos $N a SELECT vs GROUP BY.
  //    Seguro: userTz siempre viene de resolveUserTimezone (IANA conocidas, set controlado).
  const tzLit = sql.raw(`'${userTz.replace(/'/g, "''")}'`);

  // 4. Query de engagement: posts publicados agrupados por platform + contentType + día + hora
  //    En el timezone del usuario (no Bogotá hardcodeado).
  const baseWhere = and(
    eq(postsTable.status, "published"),
    isNotNull(postsTable.publishedAt),
    isNotNull(postsTable.platform),
  );
  const whereClause = filterCond ? and(baseWhere, filterCond) : baseWhere;

  const realData = await db
    .select({
      platform:    postsTable.platform,
      contentType: postsTable.contentType,
      dayOfWeek:   sql<number>`extract(dow from ${postsTable.publishedAt} at time zone ${tzLit})::int`,
      hour:        sql<number>`extract(hour from ${postsTable.publishedAt} at time zone ${tzLit})::int`,
      totalScore:  sql<number>`(coalesce(sum(${postsTable.likes}), 0) + coalesce(sum(${postsTable.saves}), 0) * 2 + coalesce(sum(${postsTable.comments}), 0))::int`,
      postCount:   sql<number>`count(*)::int`,
    })
    .from(postsTable)
    .where(whereClause)
    .groupBy(
      postsTable.platform,
      postsTable.contentType,
      sql`extract(dow from ${postsTable.publishedAt} at time zone ${tzLit})`,
      sql`extract(hour from ${postsTable.publishedAt} at time zone ${tzLit})`,
    );

  // 5. Agrupar observaciones por platform + contentType
  // Regla 12: platform="both" se expande a AMBAS plataformas para que los posts
  // duales contribuyan al análisis IA de instagram Y tiktok por igual.
  type SlotScore = { day: number; hour: number; score: number; count: number };
  const observed: Record<string, Record<string, SlotScore[]>> = {};

  for (const row of realData) {
    const plats = row.platform === "both"
      ? ["instagram", "tiktok"]
      : [row.platform ?? "instagram"];
    const ct = row.contentType ?? "image";
    for (const plat of plats) {
      if (!observed[plat])     observed[plat] = {};
      if (!observed[plat][ct]) observed[plat][ct] = [];
      observed[plat][ct].push({
        day:   row.dayOfWeek,
        hour:  row.hour,
        score: row.totalScore,
        count: row.postCount,
      });
    }
  }

  // 6. Construir sugerencia para cada platform + contentType
  function buildSuggestion(platform: string, ct: string): ContentSuggestion {
    const def   = DEFAULTS[platform]?.[ct] ?? {
      days: [1, 3, 5], hours: [8, 18], tip: "", weeklyTarget: { min: 1, max: 3 },
    };
    const slots = observed[platform]?.[ct] ?? [];
    const useAI = slots.length >= MIN_SLOTS_FOR_AI;

    let days:  number[];
    let hours: number[];

    let scoredDays: number[] | undefined;

    if (useAI) {
      // Agregar score por día y por hora para determinar los top performers
      const dayScore:  Record<number, number> = {};
      const hourScore: Record<number, number> = {};
      for (const s of slots) {
        dayScore[s.day]   = (dayScore[s.day]   ?? 0) + s.score + s.count * 2;
        hourScore[s.hour] = (hourScore[s.hour]  ?? 0) + s.score + s.count * 2;
      }
      // Top-4 días y horas por score; fallback a defaults si hay muy pocos.
      // IMPORTANTE: horas en orden de score DESCENDENTE — NO ordenar cronológico.
      // pool[0] = hora de mayor engagement → weightedPick la elige 70% (Regla 8).
      days  = Object.entries(dayScore).sort(([, a], [, b])  => b - a).slice(0, 4).map(([d]) => Number(d));
      hours = Object.entries(hourScore).sort(([, a], [, b]) => b - a).slice(0, 4).map(([h]) => Number(h));
      if (days.length  < 2) days  = def.days;
      if (hours.length < 1) hours = def.hours;
      // Preservar orden de score ANTES del sort ascendente de display.
      // getWeeklySlots() usa este ranking para elegir los top-N días (no los primeros cronológicos).
      scoredDays = [...days];
    } else {
      days  = def.days;
      hours = def.hours;
    }

    return {
      days:         days.sort((a, b) => a - b).map(d => ({ num: d, name: DAY_NAMES[d] ?? String(d) })),
      hours:        hours.map(h => `${h}:00`),
      source:       useAI ? "ai" : "default",
      tip:          def.tip,
      weeklyTarget: def.weeklyTarget,
      rankedDays:   scoredDays,
    };
  }

  const suggestions: Record<string, Record<string, ContentSuggestion>> = {};
  for (const plat of PLATFORMS) {
    suggestions[plat] = {};
    for (const ct of CONTENT_TYPES) {
      suggestions[plat][ct] = buildSuggestion(plat, ct);
    }
  }

  const hasRealData  = realData.some(r => r.postCount > 0);
  const aiSlotsCount = Object.values(suggestions)
    .flatMap(p => Object.values(p))
    .filter(s => s.source === "ai").length;

  return { hasRealData, aiSlotsCount, suggestions };
}

// ─── Helper para el scheduler ─────────────────────────────────────────────────

/**
 * Convierte las sugerencias al formato interno del scheduler:
 *   days: number[]  → días de la semana (0=Dom…6=Sáb)
 *   hours: number[] → horas locales en ORDEN DE ENGAGEMENT DESC (source="ai")
 *                     o en orden de defaults (source="default").
 *                     pool[0] = hora de mayor engagement → weightedPick la elige 70% (Regla 8).
 *   source: "ai" | "default" → determina si aplicar peso 70/30 (Reglas 8/9)
 *
 * Nota: buildSuggestion() ya mantiene horas en orden de score desc para source="ai"
 * (sin sort ascendente final). Este contrato se debe preservar si se modifica buildSuggestion.
 *
 * Llamar antes de CADA sesión de generación (Regla 7: no cachear entre crons).
 *
 * @param userId     ID del usuario
 * @param businessId ID del negocio activo (opcional — scopes el análisis de engagement)
 */
export async function fetchSchedulerSuggestions(
  userId: number,
  businessId?: number | null,
): Promise<SchedulerSuggestions> {
  const tenantCond: SQL | undefined = businessId != null
    ? and(eq(postsTable.userId, userId), eq(postsTable.businessId, businessId))
    : eq(postsTable.userId, userId);

  const result = await fetchPostingSuggestionsInternal(userId, tenantCond);

  const schedulerSugg: SchedulerSuggestions = {};
  for (const [platform, types] of Object.entries(result.suggestions)) {
    schedulerSugg[platform] = {};
    for (const [ct, sugg] of Object.entries(types)) {
      // Para source="ai": usar rankedDays (orden de score desc) para que getWeeklySlots()
      // elija los top-N días por engagement, no los primeros N cronológicamente.
      // Para source="default": days ya están en orden cronológico ascendente (correcto).
      const orderedDays = sugg.source === "ai" && sugg.rankedDays
        ? sugg.rankedDays
        : sugg.days.map(d => d.num);
      schedulerSugg[platform][ct] = {
        days:         orderedDays,
        hours:        sugg.hours.map(h => parseInt(h, 10)),  // "12:00" → 12, en orden de score
        source:       sugg.source,
        weeklyTarget: sugg.weeklyTarget,  // Regla 11: propagado al scheduler
      };
    }
  }
  return schedulerSugg;
}
