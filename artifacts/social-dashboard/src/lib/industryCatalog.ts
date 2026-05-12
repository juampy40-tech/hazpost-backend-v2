import type { IndustryCatalogEntry } from "@/types/brand";

const API_BASE = import.meta.env.VITE_API_URL || "";
const INDUSTRY_CACHE_KEY = "hz_industry_catalog_v1";
const INDUSTRY_CACHE_TTL_MS = 60 * 60 * 1000;

let industryCatalogMemoryCache: IndustryCatalogEntry[] | null = null;

function normalizeIndustryCatalog(raw: unknown): IndustryCatalogEntry[] {
  const payload = raw as IndustryCatalogEntry[] | { industries?: IndustryCatalogEntry[] };
  const list = Array.isArray(payload) ? payload : payload?.industries;

  if (!Array.isArray(list)) return [];

  return list
    .filter((item: any) => item && typeof item.name === "string")
    .map((item: any) => ({
      name: item.name,
      slug: item.slug,
      subcategories: Array.isArray(item.subcategories) ? item.subcategories : [],
    }));
}

export function readCachedIndustryCatalog(): IndustryCatalogEntry[] | null {
  if (industryCatalogMemoryCache?.length) return industryCatalogMemoryCache;

  try {
    const raw = localStorage.getItem(INDUSTRY_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as {
      savedAt?: number;
      industries?: IndustryCatalogEntry[];
    };

    const fresh =
      cached.savedAt &&
      Date.now() - cached.savedAt < INDUSTRY_CACHE_TTL_MS;

    if (!fresh || !Array.isArray(cached.industries) || cached.industries.length === 0) {
      return null;
    }

    industryCatalogMemoryCache = cached.industries;
    return cached.industries;
  } catch {
    return null;
  }
}

function saveCachedIndustryCatalog(industries: IndustryCatalogEntry[]) {
  industryCatalogMemoryCache = industries;

  try {
    localStorage.setItem(
      INDUSTRY_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), industries })
    );
  } catch {
    // Si localStorage falla, seguimos con memoria.
  }
}

export async function fetchIndustryCatalog(): Promise<IndustryCatalogEntry[]> {
  const cached = readCachedIndustryCatalog();
  if (cached?.length) return cached;

  const res = await fetch(`${API_BASE}/api/industries`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`No se pudo cargar industrias (${res.status})`);
  }

  const data = await res.json();
  const industries = normalizeIndustryCatalog(data);

  if (!industries.length) {
    throw new Error("El catálogo de industrias llegó vacío");
  }

  saveCachedIndustryCatalog(industries);
  return industries;
}

export async function sendIndustrySuggestion(name?: string): Promise<void> {
  const cleanName = name?.trim();
  if (!cleanName || cleanName.length < 3) return;

  try {
    await fetch(`${API_BASE}/api/industries/suggestions`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name: cleanName }),
    });
  } catch {
    // No bloquea onboarding.
  }
}
