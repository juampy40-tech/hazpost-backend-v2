import { Router } from "express";
import { db, musicTracksTable, mediaLibraryTable } from "@workspace/db";
import { eq, asc, desc, sql, and, lte, or } from "drizzle-orm";
import https from "https";
import http from "http";
import fs from "fs/promises";
import { createReadStream as fsCreateReadStream } from "fs";
import path from "path";
import { createWriteStream } from "fs";
import { requireAuth, requireAdmin } from "../lib/auth.js";

const router = Router();
const MUSIC_CACHE_DIR = "/tmp/eco-music";
const MAX_TRENDING = 8;

/** Pixabay Music API response shape (subset of fields we consume). */
interface PixabayMusicHit {
  id:           number;
  user:         string;
  tags:         string;
  previewURL:   string;
  audioURL?:    string;
  pageURL:      string;
  duration:     number;
  bpm?:         number;
}

// ── Genre queries for Pixabay sync ──────────────────────────────────────────
const SYNC_QUERIES = [
  { q: "electronic edm dance",        genre: "electrónica",  mood: "energético",    energyLevel: "high"   },
  { q: "synthwave retrowave",         genre: "electrónica",  mood: "moderno",       energyLevel: "high"   },
  { q: "trap beat hip hop urban",     genre: "trap",         mood: "urbano",        energyLevel: "high"   },
  { q: "hip hop modern beat",         genre: "trap",         mood: "energético",    energyLevel: "high"   },
  { q: "lofi hip hop chill",          genre: "lo-fi",        mood: "tranquilo",     energyLevel: "low"    },
  { q: "lofi beats study",            genre: "lo-fi",        mood: "relajado",      energyLevel: "low"    },
  { q: "phonk dark trap",             genre: "phonk",        mood: "dark",          energyLevel: "high"   },
  { q: "house music dance",           genre: "house",        mood: "festivo",       energyLevel: "high"   },
  { q: "deep house groove",           genre: "house",        mood: "energético",    energyLevel: "medium" },
  { q: "reggaeton latin urban",       genre: "latina",       mood: "festivo",       energyLevel: "high"   },
  { q: "latin pop tropical",          genre: "latina",       mood: "alegre",        energyLevel: "medium" },
  { q: "cinematic epic motivational", genre: "cinematic",    mood: "épico",         energyLevel: "medium" },
  { q: "inspirational corporate",     genre: "cinematic",    mood: "profesional",   energyLevel: "medium" },
  { q: "ambient relaxing calm",       genre: "ambient",      mood: "tranquilo",     energyLevel: "low"    },
];

// ── Download helper ──────────────────────────────────────────────────────────
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const file   = createWriteStream(destPath);
    proto.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return downloadFile(res.headers.location!, destPath).then(resolve).catch(reject);
      }
      if (!res.statusCode || res.statusCode >= 400) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

// ── GET /api/music — list all valid tracks (trending first, then by usage) ───
router.get("/", requireAuth, async (req, res) => {
  try {
    const tracks = await db
      .select()
      .from(musicTracksTable)
      .where(eq(musicTracksTable.isValid, true))
      .orderBy(
        desc(musicTracksTable.isTrending),
        desc(musicTracksTable.usageCount),
        asc(musicTracksTable.addedAt)
      );
    res.json({ tracks });
  } catch (err) {
    console.error("[music] list error:", err);
    res.status(500).json({ error: "Error listing music tracks" });
  }
});

// ── POST /api/music/sync — fetch tracks from Pixabay API (admin only) ────────
router.post("/sync", requireAdmin, async (req, res) => {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    res.status(400).json({ error: "PIXABAY_API_KEY not configured" }); return;
  }

  const { genres = "all" } = req.body || {};

  try {
    const queries = genres === "all"
      ? SYNC_QUERIES
      : SYNC_QUERIES.filter(q => q.genre === genres);

    let added = 0;
    let skipped = 0;

    for (const { q, genre, mood, energyLevel } of queries) {
      const url = `https://pixabay.com/api/?key=${apiKey}&media_type=music&q=${encodeURIComponent(q)}&per_page=5&order=popular`;
      const data = await new Promise<{ hits?: PixabayMusicHit[] }>((resolve, reject) => {
        https.get(url, (r) => {
          let body = "";
          r.on("data", (d) => (body += d));
          r.on("end", () => {
            try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON")); }
          });
          r.on("error", reject);
        }).on("error", reject);
      });

      if (!data.hits) continue;

      for (const hit of data.hits) {
        const sourceUrl = hit.previewURL || hit.audioURL || "";
        if (!sourceUrl || !sourceUrl.includes("pixabay.com")) continue;

        const dur = hit.duration || 60;
        if (dur < 30 || dur > 90) { skipped++; continue; }

        const pixId = String(hit.id);
        const existing = await db
          .select({ id: musicTracksTable.id })
          .from(musicTracksTable)
          .where(eq(musicTracksTable.pixabayId, pixId))
          .limit(1);

        if (existing.length > 0) { skipped++; continue; }

        const tags = (hit.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
        const title = tags.slice(0, 3).map((t: string) =>
          t.charAt(0).toUpperCase() + t.slice(1)
        ).join(" · ") || `Track ${pixId}`;

        await db.insert(musicTracksTable).values({
          title,
          artist:      hit.user || "Pixabay Artist",
          genre,
          mood,
          energyLevel,
          sourceUrl,
          pageUrl:     hit.pageURL || "",
          duration:    hit.duration || 60,
          bpm:         hit.bpm || 0,
          tags:        hit.tags || "",
          pixabayId:   pixId,
          license:     "Pixabay License",
          isValid:     true,
          isProtected: false,
          isTrending:  false,
        });
        added++;
      }
    }

    res.json({ ok: true, added, skipped });
  } catch (err: any) {
    console.error("[music] sync error:", err);
    res.status(500).json({ error: err.message || "Sync failed" });
  }
});

// ── PATCH /api/music/:id/use — record usage ──────────────────────────────────
router.patch("/:id/use", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    await db.update(musicTracksTable)
      .set({
        usageCount: sql`${musicTracksTable.usageCount} + 1`,
        lastUsedAt: new Date(),
        isProtected: sql`CASE WHEN ${musicTracksTable.usageCount} + 1 >= 5 THEN true ELSE ${musicTracksTable.isProtected} END`,
      })
      .where(eq(musicTracksTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to record usage" });
  }
});

// ── PATCH /api/music/:id/protect — toggle protection (admin only) ────────────
router.patch("/:id/protect", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [track] = await db.select({ isProtected: musicTracksTable.isProtected })
      .from(musicTracksTable).where(eq(musicTracksTable.id, id)).limit(1);
    if (!track) { res.status(404).json({ error: "Not found" }); return; }

    await db.update(musicTracksTable)
      .set({ isProtected: !track.isProtected })
      .where(eq(musicTracksTable.id, id));
    res.json({ ok: true, isProtected: !track.isProtected });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle protection" });
  }
});

// ── PATCH /api/music/:id/trending — toggle trending (admin only, max 8) ──────
router.patch("/:id/trending", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [track] = await db
      .select({ isTrending: musicTracksTable.isTrending, title: musicTracksTable.title })
      .from(musicTracksTable)
      .where(eq(musicTracksTable.id, id))
      .limit(1);
    if (!track) { res.status(404).json({ error: "Not found" }); return; }

    const newState = !track.isTrending;

    if (newState) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(musicTracksTable)
        .where(eq(musicTracksTable.isTrending, true));
      if (Number(count) >= MAX_TRENDING) {
        res.status(400).json({
          error: `Máximo ${MAX_TRENDING} tracks en trending. Quita uno antes de agregar otro.`,
          maxReached: true,
        }); return;
      }
    }

    await db.update(musicTracksTable)
      .set({ isTrending: newState })
      .where(eq(musicTracksTable.id, id));

    res.json({ ok: true, isTrending: newState });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle trending" });
  }
});

// ── DELETE /api/music/:id — remove a track ───────────────────────────────────
// Admins can delete any track; regular users can only delete their own custom uploads.
router.delete("/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [track] = await db.select().from(musicTracksTable)
      .where(eq(musicTracksTable.id, id)).limit(1);
    if (!track) { res.status(404).json({ error: "Not found" }); return; }

    const isAdmin = req.user!.role === "admin";

    // Non-admins can only delete their own custom uploads (sourceUrl starts with "media:")
    if (!isAdmin) {
      if (!track.sourceUrl.startsWith("media:")) {
        res.status(403).json({ error: "Solo los administradores pueden eliminar pistas de la biblioteca" }); return;
      }
      // Verify the media item belongs to this user
      const mediaId = parseInt(track.sourceUrl.replace("media:", ""));
      const [mediaItem] = await db.select({ userId: mediaLibraryTable.userId })
        .from(mediaLibraryTable).where(eq(mediaLibraryTable.id, mediaId)).limit(1);
      if (!mediaItem || mediaItem.userId !== req.user!.userId) {
        res.status(403).json({ error: "No tienes permiso para eliminar esta pista" }); return;
      }
      // Also remove the associated media library entry
      await db.delete(mediaLibraryTable).where(eq(mediaLibraryTable.id, mediaId));
    } else {
      // Admins respect isProtected flag
      if (track.isProtected) { res.status(400).json({ error: "Track is protected" }); return; }
    }

    const cacheFile = path.join(MUSIC_CACHE_DIR, `track_${id}.mp3`);
    await fs.unlink(cacheFile).catch(() => {});

    await db.delete(musicTracksTable).where(eq(musicTracksTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete track" });
  }
});

// ── POST /api/music/rotate — remove 10 unused, trigger sync (admin only) ─────
router.post("/rotate", requireAdmin, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const candidates = await db
      .select({ id: musicTracksTable.id })
      .from(musicTracksTable)
      .where(
        and(
          eq(musicTracksTable.isProtected, false),
          eq(musicTracksTable.isTrending, false),
          or(
            sql`${musicTracksTable.lastUsedAt} IS NULL`,
            lte(musicTracksTable.lastUsedAt, cutoff)
          ),
          eq(musicTracksTable.usageCount, 0)
        )
      )
      .orderBy(asc(musicTracksTable.addedAt))
      .limit(10);

    let removed = 0;
    for (const { id } of candidates) {
      const cacheFile = path.join(MUSIC_CACHE_DIR, `track_${id}.mp3`);
      await fs.unlink(cacheFile).catch(() => {});
      await db.delete(musicTracksTable).where(eq(musicTracksTable.id, id));
      removed++;
    }

    res.json({ ok: true, removed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Rotate failed" });
  }
});

// ── POST /api/music/upload — upload a custom audio file (client jingle) ──────
router.post("/upload", requireAuth, async (req, res) => {
  try {
    const { data, filename, mimeType, title, duration } = req.body as {
      data?: string;      // base64 audio
      filename?: string;
      mimeType?: string;
      title?: string;
      duration?: number;
    };

    if (!data || !filename) {
      res.status(400).json({ error: "Se requiere data (base64) y filename" }); return;
    }

    const safeTitle = title || filename.replace(/\.[^/.]+$/, "") || "Jingle personalizado";
    const safeMime = mimeType || "audio/mpeg";
    const safeDuration = Math.max(5, Math.min(600, Number(duration) || 60));

    // Store audio in media library
    const [mediaItem] = await db.insert(mediaLibraryTable).values({
      userId: req.user!.userId,
      type: "audio",
      mimeType: safeMime,
      filename,
      label: safeTitle,
      data,
    }).returning({ id: mediaLibraryTable.id });

    // Create a music track entry pointing to the stored media
    const [track] = await db.insert(musicTracksTable).values({
      title: safeTitle,
      artist: "Personalizado",
      genre: "personalizado",
      mood: "personalizado",
      sourceUrl: `media:${mediaItem.id}`,
      pageUrl: "",
      duration: safeDuration,
      bpm: 0,
      tags: "custom,upload,jingle",
      pixabayId: `custom_${Date.now()}`,
      license: "Propiedad del cliente",
      isValid: true,
      isTrending: false,
      energyLevel: "medium",
      isProtected: false,
    }).returning();

    res.status(201).json({ ok: true, track });
  } catch (err: any) {
    console.error("[music] upload error:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ── GET /api/music/cache/:id — download and cache a track locally ────────────
router.get("/cache/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    await fs.mkdir(MUSIC_CACHE_DIR, { recursive: true });
    const cacheFile = path.join(MUSIC_CACHE_DIR, `track_${id}.mp3`);

    try {
      await fs.access(cacheFile);
      res.json({ ok: true, cached: true, path: cacheFile });
      return;
    } catch {}

    const [track] = await db.select().from(musicTracksTable)
      .where(eq(musicTracksTable.id, id)).limit(1);
    if (!track) { res.status(404).json({ error: "Track not found" }); return; }

    // Custom uploaded audio stored in media library
    if (track.sourceUrl.startsWith("media:")) {
      const mediaId = parseInt(track.sourceUrl.replace("media:", ""));
      const [mediaItem] = await db.select({ data: mediaLibraryTable.data })
        .from(mediaLibraryTable).where(eq(mediaLibraryTable.id, mediaId)).limit(1);
      if (!mediaItem?.data) { res.status(404).json({ error: "Audio data not found" }); return; }
      await fs.writeFile(cacheFile, Buffer.from(mediaItem.data, "base64"));
      res.json({ ok: true, cached: false, path: cacheFile });
      return;
    }

    await downloadFile(track.sourceUrl, cacheFile);
    res.json({ ok: true, cached: false, path: cacheFile });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Cache failed" });
  }
});

// ── GET /api/music/status — library stats ────────────────────────────────────
router.get("/status", async (req, res) => {
  try {
    const [stats] = await db.select({
      total:     sql<number>`count(*)`,
      protected: sql<number>`count(*) filter (where ${musicTracksTable.isProtected})`,
      used:      sql<number>`count(*) filter (where ${musicTracksTable.usageCount} > 0)`,
      trending:  sql<number>`count(*) filter (where ${musicTracksTable.isTrending})`,
    }).from(musicTracksTable).where(eq(musicTracksTable.isValid, true));

    const hasPixabayKey = !!process.env.PIXABAY_API_KEY;
    res.json({ ...stats, hasPixabayKey });
  } catch (err) {
    res.status(500).json({ error: "Failed to get status" });
  }
});

export default router;
