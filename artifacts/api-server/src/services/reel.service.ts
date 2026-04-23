import ffmpeg from "fluent-ffmpeg";
import { promises as fs, existsSync, createWriteStream } from "fs";
import https from "https";
import http from "http";
import { spawn, execSync } from "child_process";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { db } from "@workspace/db";
import { imageVariantsTable, musicTracksTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";

// ── Resolve ffmpeg/ffprobe binary paths ───────────────────────────────────────
// Resolution order:
//   1. ffmpeg-static npm package (self-contained binary, works in production)
//   2. Walk every PATH directory and verify with existsSync (handles Nix store)
//   3. `which` shell fallback
//   4. Bare name — last resort, will fail with ENOENT if missing everywhere
function resolveFfmpeg(): string {
  // 1. ffmpeg-static bundled binary
  try {
    const require = createRequire(import.meta.url);
    const staticPath: string | null = require("ffmpeg-static");
    if (staticPath && existsSync(staticPath)) return staticPath;
  } catch { /* package not built yet */ }
  // 2. Walk PATH
  const dirs = (process.env.PATH ?? "").split(":");
  for (const dir of dirs) {
    const candidate = `${dir}/ffmpeg`;
    if (existsSync(candidate)) return candidate;
  }
  // 3. Shell which
  try {
    return execSync("which ffmpeg", { encoding: "utf8", env: process.env }).trim();
  } catch { /* ignore */ }
  return "ffmpeg";
}
function resolveFfprobe(): string {
  // 1. Same dir as ffmpeg-static, but there's also ffprobe-static
  try {
    const require = createRequire(import.meta.url);
    const staticPath: string | null = require("ffprobe-static").path;
    if (staticPath && existsSync(staticPath)) return staticPath;
  } catch { /* not installed */ }
  // 2. Walk PATH
  const dirs = (process.env.PATH ?? "").split(":");
  for (const dir of dirs) {
    const candidate = `${dir}/ffprobe`;
    if (existsSync(candidate)) return candidate;
  }
  // 3. Shell which
  try {
    return execSync("which ffprobe", { encoding: "utf8", env: process.env }).trim();
  } catch { /* ignore */ }
  return "ffprobe";
}
const FFMPEG_PATH  = resolveFfmpeg();
const FFPROBE_PATH = resolveFfprobe();
ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);
console.info(`[reel] ffmpeg  → ${FFMPEG_PATH}`);
console.info(`[reel] ffprobe → ${FFPROBE_PATH}`);

let storageService: ObjectStorageService | null = null;
function getStorage(): ObjectStorageService {
  if (!storageService) storageService = new ObjectStorageService();
  return storageService;
}

// ── Raw ffmpeg helper ─────────────────────────────────────────────────────────
/**
 * Runs ffmpeg directly via spawn so each argument is a distinct argv token —
 * avoids fluent-ffmpeg's internal argument re-serialisation which can corrupt
 * long -vf strings containing colons, quotes, and special chars.
 */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const proc = spawn(FFMPEG_PATH, args);
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
    });
    proc.on("error", (e) => reject(e));
  });
}

// ── Music helper ──────────────────────────────────────────────────────────────
const MUSIC_CACHE_DIR = path.join(os.tmpdir(), "eco-music");

// ── Music library lookup (no synthesis — all tracks are real MP3 URLs) ─────────

/** Infer the best-matching genre from a preset/mood/genre string. */
function inferMusicGenre(genreOrPreset: string): string {
  const p = genreOrPreset.toLowerCase();
  if (/trap|drill|808|drill|urbano|hip.hop/.test(p))       return 'trap';
  if (/phonk|dark|oscuro/.test(p))                         return 'phonk';
  if (/lofi|lo.fi|chill|relax|estudio|concentra/.test(p))  return 'lo-fi';
  if (/house|deep|groove|club/.test(p))                    return 'house';
  if (/latin|latina|tropical|reggaeton|dembow|cali/.test(p)) return 'latina';
  if (/corpo|empresa|negocio|profesional|brand|marca/.test(p)) return 'cinematic';
  if (/cinematic|epic|motiva|inspira|dramatic/.test(p))    return 'cinematic';
  if (/edm|electro|synth|pop.digital|electrónica/.test(p)) return 'electrónica';
  if (/ambient|paz|tranquil|calm|piano|piano/.test(p))     return 'ambient';
  if (/soul|funk|jazz|groove/.test(p))                     return 'soul';
  return ''; // fallback: any trending track
}

/**
 * Look up a matching track in the music library by genre/preset and download it.
 * Used as a fallback when the user has not selected a specific library track.
 * Returns null (no music) if no matching track is available.
 */
async function ensureMusicTrackByGenre(genreOrPreset: string): Promise<string | null> {
  if (!genreOrPreset || genreOrPreset === "none") return null;
  try {
    const genre = inferMusicGenre(genreOrPreset);
    const [track] = genre
      ? await db.select({ id: musicTracksTable.id, sourceUrl: musicTracksTable.sourceUrl })
          .from(musicTracksTable)
          .where(eq(musicTracksTable.genre, genre))
          .orderBy(desc(musicTracksTable.isTrending))
          .limit(1)
      : await db.select({ id: musicTracksTable.id, sourceUrl: musicTracksTable.sourceUrl })
          .from(musicTracksTable)
          .where(eq(musicTracksTable.isTrending, true))
          .orderBy(desc(musicTracksTable.usageCount))
          .limit(1);
    if (!track) return null;
    return ensureMusicTrackFromLibrary(track.id, track.sourceUrl);
  } catch (err) {
    console.warn("[music] genre lookup failed:", (err as Error).message);
    return null;
  }
}

/** Downloads a track from the music library (by URL) and caches it as MP3 in MUSIC_CACHE_DIR.
 *  All tracks use direct external URLs (SoundHelix CC BY-SA 4.0 or Pixabay CDN). */
async function ensureMusicTrackFromLibrary(trackId: number, sourceUrl: string): Promise<string | null> {
  await fs.mkdir(MUSIC_CACHE_DIR, { recursive: true });

  // Skip any legacy synthetic: URLs that may remain — never synthesize
  if (sourceUrl.startsWith("synthetic:") || sourceUrl.includes("/stream/seed/")) {
    console.warn("[music] Refusing to synthesize — use real library tracks only");
    return null;
  }

  const cachePath = path.join(MUSIC_CACHE_DIR, `track_${trackId}.mp3`);
  try { await fs.access(cachePath); return cachePath; } catch {}

  // Resolve relative API URLs to localhost for server-side download
  let downloadUrl = sourceUrl;
  if (sourceUrl.startsWith("/")) {
    const port = process.env.PORT || "8080";
    downloadUrl = `http://localhost:${port}${sourceUrl}`;
  }

  console.log(`[music] downloading library track ${trackId} from ${downloadUrl}…`);
  try {
    await new Promise<void>((resolve, reject) => {
      const proto = downloadUrl.startsWith("https") ? https : http;
      const file  = createWriteStream(cachePath);
      proto.get(downloadUrl, (res: any) => {
        if ((res.statusCode ?? 0) >= 400) { file.close(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", reject);
      }).on("error", reject);
    });
    return cachePath;
  } catch (e) {
    console.warn(`[music] failed to download track ${trackId}:`, (e as Error).message);
    await fs.unlink(cachePath).catch(() => {});
    return null;
  }
}

/** Mixes a music track into a silent MP4. Returns the output path (temp file, caller cleans up). */
async function mixAudioIntoVideo(videoPath: string, musicPath: string, durationSec: number): Promise<string> {
  const outPath = videoPath.replace(".mp4", "-audio.mp4");
  const fadeStart = Math.max(0, durationSec - 1.5).toFixed(2);
  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .input(musicPath)
      .inputOptions(["-stream_loop", "-1"])
      .complexFilter([
        `[1:a]volume=0.28,atrim=0:${durationSec.toFixed(2)},afade=t=out:st=${fadeStart}:d=1.5[aout]`,
      ])
      .outputOptions([
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
      ])
      .on("start", (cmd) => console.log("[music] mix cmd:", cmd))
      .on("end", () => { console.log("[music] mix complete"); resolve(); })
      .on("error", (e) => { console.warn("[music] mix error:", e.message); reject(e); })
      .save(outPath);
  });
  return outPath;
}

export type ReelStatus =
  | { status: "none" }
  | { status: "generating" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

/**
 * Generates a 20-second dynamic multi-shot video montage from a base64 image.
 *
 * Technique: scale the source 3× for quality, extract 5 different 1080×1920
 * crop windows (simulating different camera angles / shots), apply aggressive
 * zoom to each, and concat with hard cuts — producing a professional-looking
 * social-media reel from a single photo.
 *
 * Shot map (total 500 frames @ 25 fps = 20 s):
 *  #1  75f  3 s   top-center crop   — fast snap zoom 1.0 → 2.0
 *  #2  50f  2 s   bottom-left crop  — ultra-fast close-up 1.5 → 4.0
 *  #3  75f  3 s   top-right crop    — medium zoom 1.0 → 2.5
 *  #4 125f  5 s   center crop       — slow establishing 1.0 → 1.8
 *  #5 175f  7 s   bottom-center     — building finale 1.0 → 2.25
 */
export async function generateReelFromBase64(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<string> {
  const tmpDir = os.tmpdir();
  const uid = randomUUID();
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const inputPath   = path.join(tmpDir, `reel-in-${uid}.${ext}`);
  const outputPath  = path.join(tmpDir, `reel-out-${uid}.mp4`);
  const filterPath  = path.join(tmpDir, `reel-filter-${uid}.txt`);

  try {
    await fs.writeFile(inputPath, Buffer.from(imageBase64, "base64"));

    // Source image is typically 1024×1280 (4:5).
    // Scale 3× → 3072×3840 for high-quality crops.
    // Then extract five 1080×1920 (9:16) windows at different offsets.
    // Each window is processed independently with zoompan, then all are
    // concatenated with direct (hard) cuts.
    //
    // Crop coordinates in the 3072×3840 scaled frame:
    //   top-center   : x=996,  y=0    (2076..3072 wide, 0..1920 tall)
    //   bottom-left  : x=0,    y=1920 (0..1080 wide, 1920..3840 tall)
    //   top-right    : x=1992, y=0    (1992..3072 wide, 0..1920 tall)
    //   center       : x=996,  y=960  (center of the full scaled image)
    //   bottom-center: x=996,  y=1920 (996..2076 wide, 1920..3840 tall)

    const complexFilter = [
      "[0:v]scale=3072:3840[big]",
      "[big]split=5[a][b][c][d][e]",

      // Shot 1 — top-center, fast snap zoom in
      "[a]crop=1080:1920:996:0," +
        "zoompan=z='min(1+0.013*on,2.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':" +
        "d=75:fps=25:s=1080x1920,setsar=1[s1]",

      // Shot 2 — bottom-left, ultra-fast close-up snap
      "[b]crop=1080:1920:0:1920," +
        "zoompan=z='min(1.5+0.05*on,4.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':" +
        "d=50:fps=25:s=1080x1920,setsar=1[s2]",

      // Shot 3 — top-right, medium zoom
      "[c]crop=1080:1920:1992:0," +
        "zoompan=z='min(1+0.02*on,2.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':" +
        "d=75:fps=25:s=1080x1920,setsar=1[s3]",

      // Shot 4 — center, slow establishing zoom (feels like wide shot)
      "[d]crop=1080:1920:996:960," +
        "zoompan=z='min(1+0.0064*on,1.8)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':" +
        "d=125:fps=25:s=1080x1920,setsar=1[s4]",

      // Shot 5 — bottom-center, building zoom finale
      "[e]crop=1080:1920:996:1920," +
        "zoompan=z='min(1+0.007*on,2.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':" +
        "d=175:fps=25:s=1080x1920,setsar=1[s5]",

      "[s1][s2][s3][s4][s5]concat=n=5:v=1:a=0[out]",
    ].join(";");

    await fs.writeFile(filterPath, complexFilter);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions(["-loop 1"])
        .outputOptions([
          `-filter_complex_script ${filterPath}`,
          "-map [out]",
          "-t 20",
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-r 25",
          "-preset fast",
          "-crf 23",
          "-movflags +faststart",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    const storage = getStorage();
    const uploadUrl = await storage.getObjectEntityUploadURL();
    const videoBuffer = await fs.readFile(outputPath);

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(videoBuffer.length),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      throw new Error(`GCS upload failed: ${uploadRes.status}`);
    }

    const objectPath = storage.normalizeObjectEntityPath(uploadUrl);
    return objectPath;
  } finally {
    fs.unlink(inputPath).catch(() => {});
    fs.unlink(outputPath).catch(() => {});
    fs.unlink(filterPath).catch(() => {});
  }
}

/**
 * Generates a reel for the given image variant.
 * Picks the best source image (9:16 preferred for portrait reels).
 * Updates the DB with the resulting GCS object path.
 */
export async function generateReelForVariant(variantId: number): Promise<string> {
  const [variant] = await db
    .select()
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.id, variantId));

  if (!variant) throw new Error(`Variant ${variantId} not found`);

  const sourceBase64 =
    variant.originalRawBackground ??
    variant.tiktokImageData ??
    variant.imageData;

  const objectPath = await generateReelFromBase64(sourceBase64, "image/jpeg");

  await db
    .update(imageVariantsTable)
    .set({ reelObjectPath: objectPath, mimeType: "video/mp4" })
    .where(eq(imageVariantsTable.id, variantId));

  return objectPath;
}

/**
 * Generates a carousel video from raw base64 images supplied by the caller.
 * Supports xfade transitions: wipeleft (libro), dissolve, slideleft, fadeblack, radial.
 * Output: 1080×1350 (4:5 Instagram feed ratio) H.264 MP4.
 */
// ── Text overlay helpers ───────────────────────────────────────────────────────
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

/** Strips emoji and non-ASCII characters that DejaVu font can't render. */
function stripEmoji(s: string): string {
  // Remove emoji ranges + variation selectors; keep Latin, basic punctuation, numbers, accented chars
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")   // emoji supplementary planes
    .replace(/[\u{2600}-\u{27BF}]/gu, "")       // misc symbols, dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")       // variation selectors
    .replace(/[\u{200B}-\u{200D}]/gu, "")       // zero-width spaces
    .replace(/\uFEFF/g, "")                      // BOM
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Escapes text for use inside ffmpeg drawtext filter option value. */
function escapeDrawtext(s: string): string {
  return stripEmoji(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "pct");  // %% triggers ffmpeg 6.x drawtext expansion parser silently → text not drawn; bare % also risky
}

/**
 * Applies text captions and/or closing slide overlay onto an existing video using ffmpeg.
 * Returns the output path (caller is responsible for cleanup).
 */
async function applyTextOverlaysToVideo(
  inputPath: string,
  outputPath: string,
  totalDuration: number,
  slideCount: number,
  transition: CarouselTransition,
  overlays: {
    captions?: (string | null | undefined)[];
    closingSlide?: { enabled: boolean; showBullets?: boolean; bullets: string[]; cta: string };
  }
): Promise<void> {
  const SLIDE_SEC = 5;
  const T_DUR = 0.4;
  const slideOffset = transition === "hardcut" ? SLIDE_SEC : SLIDE_SEC - T_DUR; // 5 or 4.6

  const vf: string[] = [];

  // 1. Per-slide caption subtitles at bottom
  if (overlays.captions) {
    for (let i = 0; i < slideCount; i++) {
      const cap = overlays.captions[i];
      if (!cap?.trim()) continue;
      const t0 = (i * slideOffset).toFixed(2);
      const t1 = Math.min(i * slideOffset + slideOffset - 0.5, totalDuration).toFixed(2);
      vf.push(
        `drawtext=fontfile='${FONT_BOLD}':text='${escapeDrawtext(cap)}':` +
        `fontsize=44:fontcolor=white:x=(main_w-text_w)/2:y=main_h-140:` +
        `shadowx=2:shadowy=3:shadowcolor=black@0.9:` +
        `box=1:boxcolor=black@0.5:boxborderw=14:` +
        `enable='between(t,${t0},${t1})'`
      );
    }
  }

  // 2. Closing slide overlay on last slide
  // Brand colors: ECO blue #0077FF, cyan #00C2FF
  const cs = overlays.closingSlide;
  const hasBullets = cs?.enabled && (cs.showBullets !== false) && cs.bullets.filter(Boolean).length > 0;
  const hasCta     = cs?.enabled && cs.cta?.trim().length > 0;
  if (hasBullets || hasCta) {
    const lastT0 = ((slideCount - 1) * slideOffset).toFixed(2);
    const totalT = totalDuration.toFixed(2);

    if (hasBullets) {
      const bulletH   = 64;    // vertical spacing per bullet line
      const bulletGap = 10;    // extra gap between lines
      const topStart   = 60;   // y where first bullet starts

      // Filter out empty bullets up-front so positions and backdrop are correct
      const bullets = cs!.bullets.map(b => escapeDrawtext(b)).filter(Boolean);
      const totalBulletH = bullets.length * (bulletH + bulletGap);

      // Dark semi-transparent backdrop behind bullets area
      const backdropH = topStart + totalBulletH + 20;
      vf.push(`drawbox=x=0:y=0:w=iw:h=${backdropH}:color=black@0.55:t=fill:enable='between(t,${lastT0},${totalT})'`);

      // Each bullet: ECO-blue text with black shadow (border effect), centered
      bullets.forEach((cleaned, bi) => {
        const textY  = topStart + bi * (bulletH + bulletGap);
        const t0b    = (parseFloat(lastT0) + bi * 0.2).toFixed(2);
        vf.push(
          `drawtext=fontfile='${FONT_BOLD}':text='${cleaned}':` +
          `fontsize=34:fontcolor=0x0077FF:x=(main_w-text_w)/2:y=${textY}:` +
          `shadowx=2:shadowy=2:shadowcolor=black@0.95:` +
          `enable='between(t,${t0b},${totalT})'`
        );
      });
    }

    if (hasCta) {
      // CTA appears after all bullets (or immediately if no bullets)
      const bulletCount = hasBullets ? cs!.bullets.filter(Boolean).length : 0;
      const ctaT0 = (parseFloat(lastT0) + bulletCount * 0.2 + 0.2).toFixed(2);
      // When there are no bullets, add a small backdrop at the bottom so the CTA has contrast
      if (!hasBullets) {
        vf.push(`drawbox=x=0:y=main_h-140:w=iw:h=140:color=black@0.60:t=fill:enable='between(t,${ctaT0},${totalT})'`);
      }
      vf.push(
        `drawtext=fontfile='${FONT_BOLD}':text='${escapeDrawtext(cs!.cta)}':` +
        `fontsize=36:fontcolor=white:x=(main_w-text_w)/2:y=main_h-90:` +
        `box=1:boxcolor=0x0077FF@1:boxborderw=22:` +
        `shadowx=1:shadowy=1:shadowcolor=black@0.35:` +
        `enable='between(t,${ctaT0},${totalT})'`
      );
    }
  }

  if (vf.length === 0) return; // nothing to overlay — skip second pass

  const vfStr = vf.join(",");
  // Use raw spawn so the -vf value is a single, unmodified argv token.
  // fluent-ffmpeg re-parses its outputOptions array and can corrupt long filter strings.
  console.log("[overlay] filter length:", vfStr.length, "chars");
  await runFfmpeg([
    "-i", inputPath,
    "-vf", vfStr,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "23",
    "-movflags", "+faststart",
    "-c:a", "copy",
    "-y", outputPath,
  ]);
  console.log("[overlay] done");
}

/** Valid xfade transition names. "hardcut" = concat (no transition). All others use ffmpeg xfade filter. */
export type CarouselTransition =
  | "hardcut"
  // Suaves
  | "dissolve" | "fadeblack" | "fadewhite" | "fadegrays" | "hblur"
  // Libro / página
  | "wipeleft" | "wiperight" | "smoothleft" | "smoothright" | "coverleft" | "coverright" | "revealleft" | "revealright"
  // Zoom / explosión
  | "zoomin" | "circleopen" | "circleclose" | "squeezev" | "squeezeh" | "pixelize"
  // Geométrico
  | "radial" | "diagtl" | "diagtr" | "wipetl" | "wipetr" | "vertopen" | "horzopen"
  // Viento / cortina
  | "hlwind" | "hrwind" | "vuwind" | "vdwind" | "slideleft" | "slideright";

export async function generateCarouselVideoFromImages(
  images: string[],
  options: {
    transition?: CarouselTransition;
    music?: string;
    musicTrackId?: number;
    musicTrackUrl?: string;
    captions?: (string | null | undefined)[];
    closingSlide?: { enabled: boolean; showBullets?: boolean; bullets: string[]; cta: string };
  } = {}
): Promise<{ url: string; slideCount: number; transition: CarouselTransition; music: string }> {
  if (images.length === 0) throw new Error("No images provided");
  const slideCount = Math.min(images.length, 10);
  const transition: CarouselTransition = options.transition ?? "hardcut";

  // xfade parameters
  const SLIDE_SEC = 5;               // seconds per slide (visible portion)
  const T_DUR    = 0.4;              // transition duration in seconds
  const FRAMES   = SLIDE_SEC * 25;   // 125 frames @ 25 fps per slide

  const tmpDir = os.tmpdir();
  const uid = randomUUID();
  const outputPath = path.join(tmpDir, `carousel-custom-out-${uid}.mp4`);
  const filterPath = path.join(tmpDir, `carousel-custom-filter-${uid}.txt`);
  const imagePaths: string[] = [];

  try {
    for (let i = 0; i < slideCount; i++) {
      const imgPath = path.join(tmpDir, `carousel-custom-img-${uid}-${i}.jpg`);
      await fs.writeFile(imgPath, Buffer.from(images[i], "base64"));
      imagePaths.push(imgPath);
    }

    const filterLines: string[] = [];

    // 1. Scale + subtle zoompan for each slide
    for (let i = 0; i < slideCount; i++) {
      filterLines.push(
        `[${i}:v]scale=1080:1350:force_original_aspect_ratio=decrease,` +
        `pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,` +
        `zoompan=z='min(1+0.00048*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${FRAMES}:fps=25:s=1080x1350[s${i}]`
      );
    }

    // 2. Concatenate or xfade chain
    let totalDuration: number;
    if (transition === "hardcut" || slideCount === 1) {
      const labels = Array.from({ length: slideCount }, (_, i) => `[s${i}]`).join("");
      filterLines.push(`${labels}concat=n=${slideCount}:v=1:a=0[out]`);
      totalDuration = slideCount * SLIDE_SEC;
    } else {
      // Chain xfade transitions: each offset is (i+1) * (SLIDE_SEC - T_DUR)
      for (let i = 0; i < slideCount - 1; i++) {
        const inputA = i === 0 ? "s0" : `xf${i - 1}`;
        const inputB = `s${i + 1}`;
        const outputLabel = i === slideCount - 2 ? "out" : `xf${i}`;
        const offset = (i + 1) * (SLIDE_SEC - T_DUR);
        filterLines.push(
          `[${inputA}][${inputB}]xfade=transition=${transition}:duration=${T_DUR}:offset=${offset.toFixed(2)}[${outputLabel}]`
        );
      }
      totalDuration = (slideCount - 1) * (SLIDE_SEC - T_DUR) + SLIDE_SEC;
    }

    await fs.writeFile(filterPath, filterLines.join(";"));

    const cmd = ffmpeg();
    for (let i = 0; i < slideCount; i++) {
      cmd.input(imagePaths[i]).inputOptions(["-loop 1"]);
    }

    await new Promise<void>((resolve, reject) => {
      cmd
        .outputOptions([
          `-filter_complex_script ${filterPath}`,
          "-map [out]",
          `-t ${totalDuration.toFixed(2)}`,
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-r 25",
          "-preset fast",
          "-crf 23",
          "-movflags +faststart",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    // 3. Optional: apply text overlays (captions + closing slide)
    const hasOverlays = (options.captions?.some(c => c?.trim())) ||
                        (options.closingSlide?.enabled && (
                          (options.closingSlide.showBullets !== false && options.closingSlide.bullets.filter(Boolean).length > 0) ||
                          options.closingSlide.cta?.trim().length > 0
                        ));
    if (hasOverlays) {
      const overlayPath = path.join(tmpDir, `carousel-overlay-${uid}.mp4`);
      try {
        await applyTextOverlaysToVideo(outputPath, overlayPath, totalDuration, slideCount, transition, {
          captions: options.captions,
          closingSlide: options.closingSlide,
        });
        await fs.rename(overlayPath, outputPath);
      } catch (e) {
        console.warn("[reel] overlay pass failed, proceeding without text:", (e as Error).message);
        fs.unlink(overlayPath).catch(() => {});
      }
    }

    // 4. Optional: mix music audio into the silent video
    const music = options.music ?? "none";
    let audioTmpPath: string | null = null;
    const hasLibraryTrack = options.musicTrackId && options.musicTrackUrl;
    if (hasLibraryTrack || music !== "none") {
      try {
        const musicPath = hasLibraryTrack
          ? await ensureMusicTrackFromLibrary(options.musicTrackId!, options.musicTrackUrl!)
          : await ensureMusicTrackByGenre(music);
        if (musicPath) {
          audioTmpPath = await mixAudioIntoVideo(outputPath, musicPath, totalDuration);
          // Replace the silent video with the audio-mixed version
          await fs.rename(audioTmpPath, outputPath);
          audioTmpPath = null; // already renamed, no need to clean up separately
        }
      } catch (e) {
        console.warn("[reel] music mix failed, proceeding without audio:", (e as Error).message);
        if (audioTmpPath) fs.unlink(audioTmpPath).catch(() => {});
        audioTmpPath = null;
      }
    }

    const storage = getStorage();
    const uploadUrl = await storage.getObjectEntityUploadURL();
    const videoBuffer = await fs.readFile(outputPath);
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBuffer.length) },
      body: videoBuffer,
    });
    if (!uploadRes.ok) throw new Error(`GCS upload failed: ${uploadRes.status}`);

    const objectPath = storage.normalizeObjectEntityPath(uploadUrl);
    const url = await storage.getObjectEntityGetURL(objectPath, 3600);
    return { url, slideCount, transition, music };
  } finally {
    for (const p of imagePaths) fs.unlink(p).catch(() => {});
    fs.unlink(outputPath).catch(() => {});
    fs.unlink(filterPath).catch(() => {});
  }
}

/**
 * Gets a presigned download URL for an existing reel.
 * Returns null if no reel has been generated for this variant.
 */
export async function getReelDownloadUrl(
  variantId: number
): Promise<string | null> {
  const [variant] = await db
    .select({ reelObjectPath: imageVariantsTable.reelObjectPath })
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.id, variantId));

  if (!variant?.reelObjectPath) return null;

  const storage = getStorage();
  try {
    const url = await storage.getObjectEntityGetURL(variant.reelObjectPath, 3600);
    return url;
  } catch {
    return null;
  }
}

/**
 * Generates a "carousel-as-video": one slide per image variant, each showing
 * for 5 seconds with a very subtle zoom (1.0→1.06) so all text stays readable.
 *
 * Output: 1080×1350 (4:5, Instagram feed/carousel ratio) H.264 MP4.
 * Duration: min(variantCount, 10) × 5 seconds.
 *
 * Returns a temporary GCS presigned URL (valid 1 hour).
 */
export async function generateCarouselVideoForPost(
  postId: number
): Promise<{ objectPath: string; url: string; slideCount: number }> {
  const variants = await db
    .select()
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.postId, postId))
    .orderBy(asc(imageVariantsTable.id));

  if (variants.length === 0) throw new Error(`No image variants for post ${postId}`);

  const slideCount = Math.min(variants.length, 10);
  const tmpDir = os.tmpdir();
  const uid = randomUUID();
  const outputPath = path.join(tmpDir, `carousel-out-${uid}.mp4`);
  const filterPath = path.join(tmpDir, `carousel-filter-${uid}.txt`);
  const imagePaths: string[] = [];

  try {
    for (let i = 0; i < slideCount; i++) {
      const imgPath = path.join(tmpDir, `carousel-img-${uid}-${i}.jpg`);
      await fs.writeFile(imgPath, Buffer.from(variants[i].imageData, "base64"));
      imagePaths.push(imgPath);
    }

    // 5 s per slide = 125 frames @ 25 fps
    // Zoom 1.0 → 1.06 over 125 frames → 0.06/125 ≈ 0.00048/frame (barely noticeable,
    // just enough to add life without cropping text)
    const FRAMES = 125;
    const filterLines: string[] = [];
    const labels: string[] = [];

    for (let i = 0; i < slideCount; i++) {
      const label = `s${i}`;
      filterLines.push(
        `[${i}:v]scale=1080:1350:force_original_aspect_ratio=decrease,` +
        `pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,` +
        `zoompan=z='min(1+0.00048*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${FRAMES}:fps=25:s=1080x1350[${label}]`
      );
      labels.push(`[${label}]`);
    }

    filterLines.push(`${labels.join("")}concat=n=${slideCount}:v=1:a=0[out]`);
    const complexFilter = filterLines.join(";");
    await fs.writeFile(filterPath, complexFilter);

    const cmd = ffmpeg();
    for (let i = 0; i < slideCount; i++) {
      cmd.input(imagePaths[i]).inputOptions(["-loop 1"]);
    }

    await new Promise<void>((resolve, reject) => {
      cmd
        .outputOptions([
          `-filter_complex_script ${filterPath}`,
          "-map [out]",
          `-t ${slideCount * 5}`,
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-r 25",
          "-preset fast",
          "-crf 23",
          "-movflags +faststart",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    const storage = getStorage();
    const uploadUrl = await storage.getObjectEntityUploadURL();
    const videoBuffer = await fs.readFile(outputPath);

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(videoBuffer.length),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) throw new Error(`GCS upload failed: ${uploadRes.status}`);

    const objectPath = storage.normalizeObjectEntityPath(uploadUrl);
    const url = await storage.getObjectEntityGetURL(objectPath, 3600);
    return { objectPath, url, slideCount };
  } finally {
    for (const p of imagePaths) fs.unlink(p).catch(() => {});
    fs.unlink(outputPath).catch(() => {});
    fs.unlink(filterPath).catch(() => {});
  }
}

/**
 * Generates a multi-scene Reel video from a post's reel slides.
 * Each slide (scene) gets its own 5-second Ken Burns segment.
 * Output: 1080×1920 (9:16) H.264 MP4 — ready for Instagram Reels and TikTok.
 *
 * Uses the post's stored imageData variants (ordered by variantIndex).
 * The resulting reelObjectPath is saved on the FIRST variant for retrieval.
 */
export async function generateReelVideoForPost(
  postId: number,
  options: { transition?: CarouselTransition; music?: string; musicTrackId?: number; musicTrackUrl?: string; variantOrder?: number[] } = {}
): Promise<{ objectPath: string; url: string; slideCount: number }> {
  const allVariants = await db
    .select()
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.postId, postId))
    .orderBy(asc(imageVariantsTable.id));

  // Respect custom ordering if provided, otherwise use default (by id asc)
  const variants = options.variantOrder && options.variantOrder.length > 0
    ? [
        ...options.variantOrder
          .map(id => allVariants.find(v => v.id === id))
          .filter(Boolean) as typeof allVariants,
        ...allVariants.filter(v => !options.variantOrder!.includes(v.id)),
      ]
    : allVariants;

  if (variants.length === 0) throw new Error(`No image variants for post ${postId}`);

  const slideCount = Math.min(variants.length, 6);
  const transition: CarouselTransition = options.transition ?? "dissolve";
  const SLIDE_SEC = 5;
  const T_DUR = 0.5;
  const FRAMES = SLIDE_SEC * 25; // 125 frames @ 25 fps

  const tmpDir = os.tmpdir();
  const uid = randomUUID();
  const outputPath = path.join(tmpDir, `reel-multi-out-${uid}.mp4`);
  const filterPath = path.join(tmpDir, `reel-multi-filter-${uid}.txt`);
  const imagePaths: string[] = [];

  try {
    for (let i = 0; i < slideCount; i++) {
      // Use composited images (with logo + text): tiktokImageData (9:16 format) > imageData (4:5 format)
      // NEVER use originalRawBackground — it has no logo or text overlay
      const src = variants[i].tiktokImageData ?? variants[i].imageData;
      const imgPath = path.join(tmpDir, `reel-multi-img-${uid}-${i}.jpg`);
      await fs.writeFile(imgPath, Buffer.from(src, "base64"));
      imagePaths.push(imgPath);
    }

    const filterLines: string[] = [];

    // Scale each slide to 1080×1920 (9:16) with subtle Ken Burns zoom
    for (let i = 0; i < slideCount; i++) {
      filterLines.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
        `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,` +
        `zoompan=z='min(1+0.00048*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${FRAMES}:fps=25:s=1080x1920[s${i}]`
      );
    }

    // Chain transitions or hard concat
    let totalDuration: number;
    if (transition === "hardcut" || slideCount === 1) {
      const labels = Array.from({ length: slideCount }, (_, i) => `[s${i}]`).join("");
      filterLines.push(`${labels}concat=n=${slideCount}:v=1:a=0[out]`);
      totalDuration = slideCount * SLIDE_SEC;
    } else {
      for (let i = 0; i < slideCount - 1; i++) {
        const inputA = i === 0 ? "s0" : `xf${i - 1}`;
        const inputB = `s${i + 1}`;
        const outputLabel = i === slideCount - 2 ? "out" : `xf${i}`;
        const offset = (i + 1) * (SLIDE_SEC - T_DUR);
        filterLines.push(
          `[${inputA}][${inputB}]xfade=transition=${transition}:duration=${T_DUR}:offset=${offset.toFixed(2)}[${outputLabel}]`
        );
      }
      totalDuration = (slideCount - 1) * (SLIDE_SEC - T_DUR) + SLIDE_SEC;
    }

    await fs.writeFile(filterPath, filterLines.join(";"));

    const cmd = ffmpeg();
    for (let i = 0; i < slideCount; i++) {
      cmd.input(imagePaths[i]).inputOptions(["-loop 1"]);
    }

    await new Promise<void>((resolve, reject) => {
      cmd
        .outputOptions([
          `-filter_complex_script ${filterPath}`,
          "-map [out]",
          `-t ${totalDuration.toFixed(2)}`,
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-r 25",
          "-preset fast",
          "-crf 23",
          "-movflags +faststart",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    // Optional music
    const music = options.music ?? "none";
    let audioTmpPath: string | null = null;
    const hasLibraryTrack2 = options.musicTrackId && options.musicTrackUrl;
    if (hasLibraryTrack2 || music !== "none") {
      try {
        const musicPath = hasLibraryTrack2
          ? await ensureMusicTrackFromLibrary(options.musicTrackId!, options.musicTrackUrl!)
          : await ensureMusicTrackByGenre(music);
        if (musicPath) {
          audioTmpPath = await mixAudioIntoVideo(outputPath, musicPath, totalDuration);
          await fs.rename(audioTmpPath, outputPath);
          audioTmpPath = null;
        }
      } catch (e) {
        console.warn("[reel-multi] music mix failed:", (e as Error).message);
        if (audioTmpPath) fs.unlink(audioTmpPath).catch(() => {});
      }
    }

    const storage = getStorage();
    const uploadUrl = await storage.getObjectEntityUploadURL();
    const videoBuffer = await fs.readFile(outputPath);
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBuffer.length) },
      body: videoBuffer,
    });
    if (!uploadRes.ok) throw new Error(`GCS upload failed: ${uploadRes.status}`);

    const objectPath = storage.normalizeObjectEntityPath(uploadUrl);

    // Store the reel path on the first variant so it can be retrieved later
    await db
      .update(imageVariantsTable)
      .set({ reelObjectPath: objectPath, mimeType: "video/mp4" })
      .where(eq(imageVariantsTable.id, variants[0].id));

    const url = await storage.getObjectEntityGetURL(objectPath, 3600);
    return { objectPath, url, slideCount };
  } finally {
    for (const p of imagePaths) fs.unlink(p).catch(() => {});
    fs.unlink(outputPath).catch(() => {});
    fs.unlink(filterPath).catch(() => {});
  }
}

/**
 * Converts an ordered list of base64 JPEG images into an MP4 slideshow buffer.
 * Each slide shows for 5 seconds with a subtle Ken Burns zoom (1.0→1.06).
 * Output: 1080×1350 (4:5), H.264, 25 fps — suitable for TikTok sandbox video upload.
 */
export async function imagesToMp4Buffer(imagesBase64: string[]): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const uid = randomUUID();
  const outputPath = path.join(tmpDir, `tiktok-sandbox-${uid}.mp4`);
  const filterPath = path.join(tmpDir, `tiktok-filter-${uid}.txt`);
  const imagePaths: string[] = [];
  const slideCount = Math.min(imagesBase64.length, 10);
  const SLIDE_SEC = 5;
  const FRAMES = SLIDE_SEC * 25;

  try {
    for (let i = 0; i < slideCount; i++) {
      const imgPath = path.join(tmpDir, `tiktok-img-${uid}-${i}.jpg`);
      await fs.writeFile(imgPath, Buffer.from(imagesBase64[i], "base64"));
      imagePaths.push(imgPath);
    }

    const filterLines: string[] = [];
    for (let i = 0; i < slideCount; i++) {
      filterLines.push(
        `[${i}:v]scale=1080:1350:force_original_aspect_ratio=decrease,` +
        `pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,` +
        `zoompan=z='min(1+0.00048*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${FRAMES}:fps=25:s=1080x1350[s${i}]`
      );
    }
    const labels = Array.from({ length: slideCount }, (_, i) => `[s${i}]`).join("");
    filterLines.push(`${labels}concat=n=${slideCount}:v=1:a=0[out]`);
    await fs.writeFile(filterPath, filterLines.join(";"));

    const cmd = ffmpeg();
    for (let i = 0; i < slideCount; i++) {
      cmd.input(imagePaths[i]).inputOptions(["-loop 1"]);
    }

    await new Promise<void>((resolve, reject) => {
      cmd
        .outputOptions([
          `-filter_complex_script ${filterPath}`,
          "-map [out]",
          `-t ${slideCount * SLIDE_SEC}`,
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-r 25",
          "-preset fast",
          "-crf 26",
          "-movflags +faststart",
        ])
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    return await fs.readFile(outputPath);
  } finally {
    for (const p of imagePaths) fs.unlink(p).catch(() => {});
    fs.unlink(outputPath).catch(() => {});
    fs.unlink(filterPath).catch(() => {});
  }
}
