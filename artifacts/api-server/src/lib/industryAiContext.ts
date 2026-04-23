/**
 * Cache en memoria para ai_context de industrias personalizadas (custom_industries).
 *
 * Por qué cache:
 * - getBrandContextBlock() se llama en cada generación de posts (hot path).
 * - Los datos de custom_industries rara vez cambian.
 * - TTL de 1h previene datos obsoletos cuando se agrega una industria nueva.
 *
 * Invalidación explícita:
 * - Al agregar una industria nueva (POST /api/industries/validate-custom)
 * - Al cambiar la industria de un negocio (PUT /brand-profile, PATCH /businesses/:id)
 */

import { db } from "@workspace/db";
import { customIndustriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface IndustryAiContextData {
  description: string;
  content_topics: string[];
  recommended_tone: string;
  audience: string;
  content_formats: string[];
  keywords: string[];
}

interface CacheEntry {
  data: IndustryAiContextData | null;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

export function invalidateIndustryContextCache(industryName?: string | null) {
  if (industryName) {
    cache.delete(normalizeKey(industryName));
  } else {
    cache.clear();
  }
}

export async function getCustomIndustryAiContext(
  industryName: string | null | undefined
): Promise<IndustryAiContextData | null> {
  if (!industryName) return null;

  const key = normalizeKey(industryName);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    // Single query filtered by name — no two-step probe.
    const [row] = await db
      .select({ name: customIndustriesTable.name, aiContext: customIndustriesTable.aiContext })
      .from(customIndustriesTable)
      .where(eq(customIndustriesTable.name, industryName))
      .limit(1);

    let data: IndustryAiContextData | null = null;
    if (row?.aiContext) {
      try { data = JSON.parse(row.aiContext) as IndustryAiContextData; } catch { /* skip */ }
    }

    cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
    return data;
  } catch {
    return null;
  }
}
