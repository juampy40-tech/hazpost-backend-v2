import { logger } from "../lib/logger.js";

const TRM_API = "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_TRM = 4200;

let trmCache: { value: number; fetchedAt: Date } | null = null;

async function fetchFromApi(): Promise<number | null> {
  const res = await fetch(TRM_API, { signal: AbortSignal.timeout(8_000) });
  const data = (await res.json()) as Array<{ valor?: string }>;
  const trm = parseFloat(data[0]?.valor ?? "");
  if (!isNaN(trm) && trm > 1000) return trm;
  logger.warn({ data: data[0] }, "[TRM] Unexpected API response");
  return null;
}

/** Fetch the current TRM from datos.gov.co (official Colombian government open data).
 *  Result is cached 24 hours in-process. Falls back to last cached value or FALLBACK_TRM. */
export async function getCurrentTrm(): Promise<number> {
  if (trmCache && Date.now() - trmCache.fetchedAt.getTime() < CACHE_TTL_MS) {
    return trmCache.value;
  }
  try {
    const trm = await fetchFromApi();
    if (trm !== null) {
      trmCache = { value: trm, fetchedAt: new Date() };
      logger.info(`[TRM] Updated: ${trm} COP/USD at ${trmCache.fetchedAt.toISOString()}`);
      return trm;
    }
  } catch (err) {
    logger.warn(`[TRM] Fetch failed: ${err} — using ${trmCache ? "cached" : "fallback"} value`);
  }
  return trmCache?.value ?? FALLBACK_TRM;
}

/** Force-refresh TRM from the API regardless of cache TTL.
 *  Used by the daily 8:00am scheduler to guarantee today's rate is loaded. */
export async function refreshCurrentTrm(): Promise<number> {
  try {
    const trm = await fetchFromApi();
    if (trm !== null) {
      trmCache = { value: trm, fetchedAt: new Date() };
      logger.info(`[TRM] Force-refreshed: ${trm} COP/USD at ${trmCache.fetchedAt.toISOString()}`);
      return trm;
    }
    logger.warn("[TRM] Force-refresh: API returned invalid value — keeping previous");
  } catch (err) {
    logger.warn(`[TRM] Force-refresh failed: ${err} — keeping previous value`);
  }
  return trmCache?.value ?? FALLBACK_TRM;
}

/** Compute COP price: round(TRM × priceUsd × 1.05). Returns 0 for free plans. */
export function computeCopPrice(priceUsd: number, trm: number): number {
  if (priceUsd <= 0) return 0;
  return Math.round(trm * priceUsd * 1.05);
}

/** Current TRM cache info — for diagnostic endpoints. */
export function getTrmCacheInfo(): { trm: number | null; fetchedAt: Date | null } {
  return { trm: trmCache?.value ?? null, fetchedAt: trmCache?.fetchedAt ?? null };
}
