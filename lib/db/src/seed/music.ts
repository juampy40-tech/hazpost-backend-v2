/**
 * ECO Social Manager — Music Library Seed
 *
 * Curated royalty-free MP3 tracks from two sources:
 *   • SoundHelix (CC BY-SA 4.0) — soundhelix.com / T. Schürger
 *   • Free Music Archive (CC BY / CC BY-SA) — freemusicarchive.org
 *
 * ALL 20 source URLs confirmed HTTP 200 from this environment.
 * No synthesized audio — every entry is a real hosted MP3 file.
 *
 * Run once via CLI:
 *   pnpm --filter @workspace/db seed:music
 *
 * Also called at API server startup (idempotent — skips existing rows).
 */
import { db } from "../index.js";
import { musicTracksTable } from "../schema/music.js";
import { eq, sql } from "drizzle-orm";

// ── SoundHelix (CC BY-SA 4.0) ────────────────────────────────────────────────
const SH_BASE    = "https://www.soundhelix.com/examples/mp3";
const SH_AUTHOR  = "T. Schürger (SoundHelix)";
const SH_LICENSE = "CC BY-SA 4.0 · soundhelix.com";

// ── Free Music Archive ───────────────────────────────────────────────────────
// All FMA URLs confirmed HTTP 200 — audio/mpeg content.
const FMA_BASE         = "https://files.freemusicarchive.org/storage-freemusicarchive-org/music";
const FMA_BY_30        = "CC BY 3.0 · freemusicarchive.org";   // Broke For Free
const FMA_BY_40        = "CC BY 4.0 · freemusicarchive.org";   // Tours
const FMA_BY_NC_30     = "CC BY-NC 3.0 · freemusicarchive.org"; // Chad Crouch — non-commercial

interface SeedTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  mood: string;
  bpm: number;
  duration: number;
  energyLevel: "low" | "medium" | "high";
  isTrending: boolean;
  sourceUrl: string;
  pageUrl: string;
  tags: string;
  license: string;
}

/**
 * 20 curated tracks — 16 unique SoundHelix + 4 Free Music Archive.
 * Each entry has a unique sourceUrl (no audio file reuse across rows).
 */
const REAL_MUSIC_LIBRARY: SeedTrack[] = [
  // ── SoundHelix: Electronic / Dance ─────────────────────────────────────────
  {
    id: "sh:1-electro",   title: "Pulso Electrónico",    artist: SH_AUTHOR, genre: "electrónica",
    mood: "energético",   bpm: 128, duration: 312, energyLevel: "high",   isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-1.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "electronic,synth,energético,dance", license: SH_LICENSE,
  },
  {
    id: "sh:8-synth",     title: "Neon Synthwave",       artist: SH_AUTHOR, genre: "electrónica",
    mood: "retro",        bpm: 110, duration: 344, energyLevel: "high",   isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-8.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "synthwave,retro,80s,electrónica", license: SH_LICENSE,
  },
  {
    id: "sh:15-edm",      title: "Club Nocturno",        artist: SH_AUTHOR, genre: "electrónica",
    mood: "festivo",      bpm: 130, duration: 327, energyLevel: "high",   isTrending: false,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-15.mp3`, pageUrl: "https://www.soundhelix.com",
    tags: "edm,club,dance,festivo,electrónica", license: SH_LICENSE,
  },

  // ── SoundHelix: Cinematic / Orchestral ──────────────────────────────────────
  {
    id: "sh:2-cinematic", title: "Horizonte Épico",      artist: SH_AUTHOR, genre: "cinematic",
    mood: "épico",        bpm: 80,  duration: 416, energyLevel: "medium", isTrending: false,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-2.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "cinematic,orchestral,épico,motivacional", license: SH_LICENSE,
  },
  {
    id: "sh:7-motiv",     title: "Energía ECO",          artist: SH_AUTHOR, genre: "cinematic",
    mood: "motivacional", bpm: 108, duration: 352, energyLevel: "medium", isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-7.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "motivacional,inspiracional,cinematic,épico", license: SH_LICENSE,
  },
  {
    id: "sh:14-corp",     title: "Momentum Corporativo", artist: SH_AUTHOR, genre: "cinematic",
    mood: "profesional",  bpm: 100, duration: 343, energyLevel: "medium", isTrending: false,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-14.mp3`, pageUrl: "https://www.soundhelix.com",
    tags: "corporativa,profesional,negocio,cinematic", license: SH_LICENSE,
  },
  {
    id: "sh:16-epic",     title: "Gran Final Épico",     artist: SH_AUTHOR, genre: "cinematic",
    mood: "épico",        bpm: 84,  duration: 360, energyLevel: "high",   isTrending: false,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-16.mp3`, pageUrl: "https://www.soundhelix.com",
    tags: "cinematic,épico,dramático,inspiracional", license: SH_LICENSE,
  },

  // ── SoundHelix: Trap / Urban ────────────────────────────────────────────────
  {
    id: "sh:4-trap",      title: "Trap Urbano",          artist: SH_AUTHOR, genre: "trap",
    mood: "urbano",       bpm: 140, duration: 305, energyLevel: "high",   isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-4.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "trap,urban,energético,hip-hop", license: SH_LICENSE,
  },

  // ── SoundHelix: Phonk ──────────────────────────────────────────────────────
  {
    id: "sh:10-phonk",    title: "Phonk Dark",           artist: SH_AUTHOR, genre: "phonk",
    mood: "dark",         bpm: 138, duration: 308, energyLevel: "high",   isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-10.mp3`, pageUrl: "https://www.soundhelix.com",
    tags: "phonk,dark,trap,nocturno", license: SH_LICENSE,
  },

  // ── SoundHelix: House ──────────────────────────────────────────────────────
  {
    id: "sh:6-house",     title: "House Solar",          artist: SH_AUTHOR, genre: "house",
    mood: "energético",   bpm: 126, duration: 322, energyLevel: "high",   isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-6.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "house,dance,festivo,energético", license: SH_LICENSE,
  },
  {
    id: "sh:12-deep",     title: "Deep House Groove",    artist: SH_AUTHOR, genre: "house",
    mood: "chill",        bpm: 122, duration: 338, energyLevel: "medium", isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-12.mp3`, pageUrl: "https://www.soundhelix.com",
    tags: "deep house,groove,chill,nocturno", license: SH_LICENSE,
  },

  // ── SoundHelix: Latina / Tropical ──────────────────────────────────────────
  {
    id: "sh:9-festivo",   title: "Cali Tropical",        artist: SH_AUTHOR, genre: "latina",
    mood: "festivo",      bpm: 120, duration: 296, energyLevel: "medium", isTrending: false,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-9.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "latina,tropical,festivo,alegre", license: SH_LICENSE,
  },
  {
    id: "sh:13-latina",   title: "Latin Urbano",         artist: SH_AUTHOR, genre: "latina",
    mood: "energético",   bpm: 96,  duration: 319, energyLevel: "high",   isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-13.mp3`, pageUrl: "https://www.soundhelix.com",
    tags: "latina,urbano,reggaeton,cali", license: SH_LICENSE,
  },

  // ── SoundHelix: Ambient ────────────────────────────────────────────────────
  {
    id: "sh:5-ambient",   title: "Serenidad Solar",      artist: SH_AUTHOR, genre: "ambient",
    mood: "tranquilo",    bpm: 72,  duration: 331, energyLevel: "low",    isTrending: false,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-5.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "ambient,chill,relajado,tranquilo", license: SH_LICENSE,
  },

  // ── SoundHelix: Pop / Upbeat ───────────────────────────────────────────────
  {
    id: "sh:3-pop",       title: "Día Positivo",         artist: SH_AUTHOR, genre: "pop",
    mood: "alegre",       bpm: 116, duration: 283, energyLevel: "medium", isTrending: false,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-3.mp3`,  pageUrl: "https://www.soundhelix.com",
    tags: "pop,alegre,upbeat,positivo", license: SH_LICENSE,
  },

  // ── SoundHelix: Lo-fi ──────────────────────────────────────────────────────
  {
    id: "sh:11-lofi",     title: "Lo-fi Estudio",        artist: SH_AUTHOR, genre: "lo-fi",
    mood: "tranquilo",    bpm: 85,  duration: 315, energyLevel: "low",    isTrending: true,
    sourceUrl: `${SH_BASE}/SoundHelix-Song-11.mp3`, pageUrl: "https://www.soundhelix.com",
    tags: "lofi,chill,estudio,concentración", license: SH_LICENSE,
  },

  // ── Free Music Archive: Lo-fi / Hip-hop ───────────────────────────────────
  // Broke For Free — "Night Owl" (CC BY 3.0)
  // https://freemusicarchive.org/music/Broke_For_Free/Directionless_EP
  {
    id: "fma:bff-nightowl",    title: "Night Owl",              artist: "Broke For Free",  genre: "lo-fi",
    mood: "tranquilo",         bpm: 84, duration: 204, energyLevel: "low",  isTrending: true,
    sourceUrl: `${FMA_BASE}/WFMU/Broke_For_Free/Directionless_EP/Broke_For_Free_-_01_-_Night_Owl.mp3`,
    pageUrl: "https://freemusicarchive.org/music/Broke_For_Free/Directionless_EP",
    tags: "lofi,hip-hop,nocturno,tranquilo", license: FMA_BY_30,
  },

  // ── Free Music Archive: Ambient / Chill ───────────────────────────────────
  // Tours — "Enthusiast" (CC BY 4.0)
  // https://freemusicarchive.org/music/Tours/Enthusiast
  {
    id: "fma:tours-enthusiast", title: "Enthusiast",            artist: "Tours",            genre: "ambient",
    mood: "inspiracional",      bpm: 90, duration: 178, energyLevel: "low",  isTrending: false,
    sourceUrl: `${FMA_BASE}/no_curator/Tours/Enthusiast/Tours_-_01_-_Enthusiast.mp3`,
    pageUrl: "https://freemusicarchive.org/music/Tours",
    tags: "ambient,inspiracional,chill,tranquilo", license: FMA_BY_40,
  },

  // Chad Crouch — "Shipping Lanes" (CC BY-NC 3.0 — solo uso no comercial)
  // https://freemusicarchive.org/music/Chad_Crouch/Arps
  {
    id: "fma:crouch-shipping",  title: "Shipping Lanes",        artist: "Chad Crouch",      genre: "ambient",
    mood: "relajado",           bpm: 88, duration: 197, energyLevel: "low",  isTrending: false,
    sourceUrl: `${FMA_BASE}/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Shipping_Lanes.mp3`,
    pageUrl: "https://freemusicarchive.org/music/Chad_Crouch/Arps",
    tags: "ambient,piano,relajado,chill", license: FMA_BY_NC_30,
  },

  // Chad Crouch — "Moonrise" (CC BY-NC 3.0 — solo uso no comercial)
  {
    id: "fma:crouch-moonrise",  title: "Moonrise",              artist: "Chad Crouch",      genre: "ambient",
    mood: "tranquilo",          bpm: 80, duration: 186, energyLevel: "low",  isTrending: false,
    sourceUrl: `${FMA_BASE}/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Moonrise.mp3`,
    pageUrl: "https://freemusicarchive.org/music/Chad_Crouch/Arps",
    tags: "ambient,cinematic,tranquilo,instrumental", license: FMA_BY_NC_30,
  },
];

/**
 * Seed the music library with real royalty-free tracks.
 * Removes any legacy synthetic: or /stream/seed/ entries, then inserts new tracks.
 * Safe to call multiple times — skips rows that already exist (by pixabayId key).
 * This function is called at API server startup (scheduler.service.ts) AND can be
 * run as a standalone migration: `pnpm --filter @workspace/db seed:music`.
 */
/** IDs that were used in the old 24-entry library (v1) but are now replaced.
 *  These were "secondary genre" duplicates — same audio URL, different title/genre.
 *  Removing them leaves only 16 unique SoundHelix tracks in the catalog. */
const DEPRECATED_IDS = [
  "sh:3-motiv",   // was Presencia ECO (dupe of sh:3-pop / SoundHelix-Song-3)
  "sh:5-piano",   // was Piano Solar  (dupe of sh:5-ambient / SoundHelix-Song-5)
  "sh:6-funk",    // was Groove Solar (dupe of sh:6-house  / SoundHelix-Song-6)
  "sh:9-pop",     // was Onda Positiva (dupe of sh:9-festivo / SoundHelix-Song-9)
  "sh:11-jazz",   // was Noche de Jazz (dupe of sh:11-lofi / SoundHelix-Song-11)
  "sh:12-tropical", // was Dembow Cali (dupe of sh:12-deep / SoundHelix-Song-12)
  "sh:14-soul",   // was Soul Renovable (dupe of sh:14-corp / SoundHelix-Song-14)
  "sh:16-corpo",  // was ECO Presencia (dupe of sh:16-epic / SoundHelix-Song-16)
];

export async function seedMusicLibrary(): Promise<{ added: number }> {
  // Remove legacy synthetic: entries from prior versions
  await db.delete(musicTracksTable)
    .where(sql`${musicTracksTable.sourceUrl} LIKE 'synthetic:%'`);
  // Remove stream-backed /api/music/stream/seed/ entries (replaced by real URLs)
  await db.delete(musicTracksTable)
    .where(sql`${musicTracksTable.sourceUrl} LIKE '/api/music/stream/seed/%'`);
  // Remove deprecated duplicate "secondary genre" entries from the v1 library
  for (const oldId of DEPRECATED_IDS) {
    await db.delete(musicTracksTable)
      .where(eq(musicTracksTable.pixabayId, oldId));
  }

  let added = 0;
  for (const track of REAL_MUSIC_LIBRARY) {
    const existing = await db
      .select({ id: musicTracksTable.id })
      .from(musicTracksTable)
      .where(eq(musicTracksTable.pixabayId, track.id))
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(musicTracksTable).values({
      title:       track.title,
      artist:      track.artist,
      genre:       track.genre,
      mood:        track.mood,
      sourceUrl:   track.sourceUrl,
      pageUrl:     track.pageUrl,
      duration:    track.duration,
      bpm:         track.bpm,
      tags:        track.tags,
      pixabayId:   track.id,
      license:     track.license,
      isValid:     true,
      isProtected: false,
      energyLevel: track.energyLevel,
      isTrending:  track.isTrending,
    });
    added++;
  }
  return { added };
}

// ── Standalone CLI runner ──────────────────────────────────────────────────────
// Detects direct script invocation (tsx ./src/seed/music.ts) vs bundle import.
// This guard NEVER triggers inside the esbuild-bundled API server.
const isCLI = typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.length >= 2 &&
  process.argv[1].endsWith("/seed/music.ts");

if (isCLI) {
  seedMusicLibrary()
    .then(({ added }) => {
      console.log(added > 0
        ? `[seed] ${added} pistas (SoundHelix + FMA, CC-licensed) insertadas`
        : "[seed] Biblioteca de música ya inicializada (0 agregadas)"
      );
      process.exit(0);
    })
    .catch((err) => { console.error("[seed] Error:", err); process.exit(1); });
}
