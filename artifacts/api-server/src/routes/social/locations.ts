import { Router } from "express";
import { db } from "@workspace/db";
import { socialAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decryptToken } from "../../lib/tokenEncryption.js";
import { resolveIgIdFromPageApi } from "../../services/instagram.service.js";

const router = Router();
const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

interface LocationResult {
  id: string;
  name: string;
  subtitle?: string;
}

/**
 * GET /api/locations/search?q=query
 *
 * Strategy 1 (always available): OpenStreetMap Nominatim — no API key needed.
 * Strategy 2 (if user has Meta token): Facebook Places API — same DB Instagram uses.
 * Strategy 3 (fallback): IG Business Account locations endpoint.
 */
router.get("/search", async (req, res) => {
  const q = (req.query.q as string)?.trim();
  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  // ── Strategy 1: OpenStreetMap Nominatim (free, no token needed) ──────────────
  try {
    const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
    nominatimUrl.searchParams.set("q", q);
    nominatimUrl.searchParams.set("format", "json");
    nominatimUrl.searchParams.set("limit", "8");
    nominatimUrl.searchParams.set("addressdetails", "1");
    nominatimUrl.searchParams.set("accept-language", "es");

    const nominatimRes = await fetch(nominatimUrl.toString(), {
      headers: {
        "User-Agent": "ECO-Social-Manager/1.0 (eco-col.com)",
        "Accept-Language": "es",
      },
    });

    if (nominatimRes.ok) {
      const data = await nominatimRes.json() as {
        place_id: number;
        display_name: string;
        name?: string;
        address?: {
          city?: string;
          town?: string;
          village?: string;
          county?: string;
          state?: string;
          country?: string;
        };
        type?: string;
        class?: string;
      }[];

      if (Array.isArray(data) && data.length > 0) {
        const seen = new Set<string>();
        const results: LocationResult[] = [];

        for (const place of data) {
          const addr = place.address ?? {};
          // Primary name: city/town/village or first part of display_name
          const cityName =
            addr.city ?? addr.town ?? addr.village ?? place.name ?? place.display_name.split(",")[0].trim();

          if (!cityName || seen.has(cityName.toLowerCase())) continue;
          seen.add(cityName.toLowerCase());

          // Build subtitle: state + country
          const parts: string[] = [];
          if (addr.state && addr.state !== cityName) parts.push(addr.state);
          if (addr.country) parts.push(addr.country);

          results.push({
            id: `osm:${place.place_id}`,
            name: cityName,
            subtitle: parts.join(", ") || undefined,
          });

          if (results.length >= 6) break;
        }

        if (results.length > 0) {
          res.json(results);
          return;
        }
      }
    }
  } catch (err: any) {
    console.warn("[locations] Nominatim error:", err?.message);
  }

  // ── Strategy 2: Facebook Places Search API (requires Meta access token) ──────
  try {
    const ownerUserId = req.user?.userId ?? null;
    const platformCond = eq(socialAccountsTable.platform, "instagram");
    const accountCond = ownerUserId
      ? and(platformCond, eq(socialAccountsTable.userId, ownerUserId))
      : platformCond;

    const [account] = await db.select().from(socialAccountsTable).where(accountCond);

    if (!account?.accessToken) {
      res.json([]);
      return;
    }

    const accessToken = decryptToken(account.accessToken);

    const placesUrl = new URL(`${GRAPH_API_BASE}/search`);
    placesUrl.searchParams.set("q", q);
    placesUrl.searchParams.set("type", "place");
    placesUrl.searchParams.set("fields", "id,name,location");
    placesUrl.searchParams.set("limit", "10");
    placesUrl.searchParams.set("access_token", accessToken);

    const placesRes = await fetch(placesUrl.toString());
    const placesData = await placesRes.json() as {
      data?: { id: string; name: string; location?: { city?: string; country?: string } }[];
      error?: { message: string };
    };

    if (!placesData.error && Array.isArray(placesData.data) && placesData.data.length > 0) {
      const results = placesData.data.map(p => {
        const locParts: string[] = [];
        if (p.location?.city && p.location.city !== p.name) locParts.push(p.location.city);
        if (p.location?.country) locParts.push(p.location.country);
        return { id: p.id, name: p.name, subtitle: locParts.join(", ") || undefined };
      });
      res.json(results);
      return;
    }

    if (placesData.error) {
      console.warn("[locations] /search?type=place error:", placesData.error.message);
    }

    // ── Strategy 3: IG Business/Creator Account locations endpoint ──────────────────────
    // Queries both instagram_business_account (Page Settings) and connected_instagram_account
    // (Account Center) so Account Center-linked accounts are not missed.
    if (account.pageId) {
      const igId = await resolveIgIdFromPageApi(account.pageId, accessToken);
      if (igId) {
        const locRes = await fetch(
          `${GRAPH_API_BASE}/${igId}/locations?q=${encodeURIComponent(q)}&fields=id,name&access_token=${accessToken}`
        );
        const locData = await locRes.json() as {
          data?: { id: string; name: string }[];
          error?: { message: string };
        };

        if (!locData.error && locData.data?.length) {
          res.json(locData.data);
          return;
        }
      }
    }
  } catch (err: any) {
    console.warn("[locations] Meta fallback error:", err?.message);
  }

  res.json([]);
});

export default router;
