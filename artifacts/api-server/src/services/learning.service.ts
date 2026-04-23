/**
 * Content Learning Engine
 *
 * Implements the 6-level adaptive intelligence system:
 *
 *  Level 1 — User's own top posts (highest weight, most personalized)
 *  Level 2 — Same segment + same city (local geo)
 *  Level 3 — Same segment + same country (national geo)
 *  Level 4 — Same segment + global (any location)
 *  Level 5 — Geo hierarchy: local > national > global (within segment)
 *  Level 6 — Viral global (breaks all hierarchy — applied to everyone immediately)
 *
 * Personal learning signals (scoped to userId in content_learnings):
 *  - user_edit_pattern  — what the user consistently changes in AI-generated captions
 *  - rejection_pattern  — anti-patterns from posts the user rejected
 *
 * On first launch with a single user the engine learns from that user's own posts.
 * As more users join the same segment + location the cross-user learning kicks in
 * automatically without any code changes.
 */

import { db } from "@workspace/db";
import {
  postsTable,
  nichesTable,
  brandProfilesTable,
  contentLearningsTable,
  nicheApprovalSignalsTable,
  userVisualSignalsTable,
} from "@workspace/db";
import { eq, and, inArray, isNotNull, desc, gt, isNull, gte, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PostWithMetrics {
  caption: string;
  contentType: string;
  nicheName: string | null;
  er: number;
  likes: number;
  saves: number;
  comments: number;
  reach: number;
}

interface UserGeoProfile {
  userId: number;
  industry: string;
  country: string;
  city: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcER(likes: number, saves: number, comments: number, reach: number): number {
  if (reach <= 0) return 0;
  return ((likes + saves * 2 + comments) / reach) * 100;
}

/**
 * Computes keyword-level Jaccard similarity between two captions.
 * Used to detect topic shifts: if similarity < 0.3, the user changed the SUBJECT
 * of the post (not just the style), so the pair is excluded from edit-pattern analysis.
 */
function captionKeywordSimilarity(a: string, b: string): number {
  const STOPWORDS = new Set(["para", "con", "que", "una", "este", "esta", "pero", "como", "más", "por", "del", "los", "las", "nos", "sin", "hoy", "hay", "and", "the", "for", "with", "that", "this", "are", "you", "not"]);
  const tokenize = (text: string): Set<string> => {
    const tokens = new Set<string>();
    for (const word of text.toLowerCase().replace(/[^a-záéíóúüñ\w\s]/g, " ").split(/\s+/)) {
      if (word.length >= 4 && !STOPWORDS.has(word)) tokens.add(word);
    }
    return tokens;
  };
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) { if (setB.has(w)) intersection++; }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

async function getUserGeoProfile(userId: number): Promise<UserGeoProfile | null> {
  const [bp] = await db
    .select({
      industry: brandProfilesTable.industry,
      country: brandProfilesTable.country,
      city: brandProfilesTable.city,
    })
    .from(brandProfilesTable)
    .where(eq(brandProfilesTable.userId, userId))
    .limit(1);

  if (!bp?.industry) return null;
  return {
    userId,
    industry: bp.industry.trim(),
    country: (bp.country ?? "").trim(),
    city: (bp.city ?? "").trim(),
  };
}

async function getTopPostsForUser(userId: number, minPosts = 3): Promise<PostWithMetrics[]> {
  const rows = await db
    .select({
      caption: postsTable.caption,
      contentType: postsTable.contentType,
      nicheName: nichesTable.name,
      likes: postsTable.likes,
      saves: postsTable.saves,
      comments: postsTable.comments,
      reach: postsTable.reach,
    })
    .from(postsTable)
    .leftJoin(nichesTable, eq(postsTable.nicheId, nichesTable.id))
    .where(
      and(
        eq(postsTable.userId, userId),
        eq(postsTable.status, "published"),
        isNotNull(postsTable.reach),
        gt(postsTable.reach, 0),
      )
    )
    .orderBy(desc(postsTable.publishedAt))
    .limit(80);

  if (rows.length < minPosts) return [];

  const withER = rows
    .map(r => ({
      caption: r.caption?.trim() ?? "",
      contentType: r.contentType ?? "image",
      nicheName: r.nicheName ?? null,
      likes: r.likes ?? 0,
      saves: r.saves ?? 0,
      comments: r.comments ?? 0,
      reach: r.reach ?? 0,
      er: calcER(r.likes ?? 0, r.saves ?? 0, r.comments ?? 0, r.reach ?? 0),
    }))
    .filter(r => r.caption.length > 60);

  withER.sort((a, b) => b.er - a.er);

  // Return top 25% by ER (at least minPosts, max 15)
  const topCount = Math.min(Math.max(Math.ceil(withER.length * 0.25), minPosts), 15);
  return withER.slice(0, topCount);
}

// ── AI Extraction ──────────────────────────────────────────────────────────────

async function extractPatternsWithAI(
  posts: PostWithMetrics[],
  industry: string,
  geoDescription: string,
): Promise<string[]> {
  if (posts.length < 2) return [];

  const postsText = posts
    .map((p, i) =>
      `[POST ${i + 1}] ER: ${p.er.toFixed(2)}% | Tipo: ${p.contentType} | Nicho: ${p.nicheName ?? "general"}\n${p.caption.slice(0, 400)}`
    )
    .join("\n\n---\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 600,
      messages: [
        {
          role: "system",
          content: `Eres un experto en marketing de contenido y analítica de redes sociales. Analizas publicaciones de alto rendimiento para identificar patrones que generan engagement.`,
        },
        {
          role: "user",
          content: `Analiza estas ${posts.length} publicaciones de alto rendimiento de una empresa del segmento "${industry}" ubicada en ${geoDescription}.

${postsText}

Identifica exactamente 4 patrones específicos que hacen que estas publicaciones tengan alto engagement. Sé muy específico y accionable — no genérico.

REGLAS CRÍTICAS:
- Los patrones deben ser técnicas de escritura universales, NO menciones a marcas, empresas o productos concretos.
- PROHIBIDO incluir handles (@...), nombres de empresas, URLs o referencias a negocios reales.
- Los patrones deben poder aplicarse a cualquier empresa del mismo segmento, sin importar su nombre.

Responde SOLO con JSON válido: {"patterns": ["patrón 1", "patrón 2", "patrón 3", "patrón 4"]}

Cada patrón debe ser una instrucción clara de máximo 25 palabras que un redactor pueda aplicar directamente.`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const patterns: string[] = parsed.patterns ?? [];
    return patterns.filter((p: unknown) => typeof p === "string" && p.length > 10).slice(0, 5);
  } catch {
    return [];
  }
}

// ── Viral Detection ────────────────────────────────────────────────────────────

async function detectViralTrends(): Promise<void> {
  // Pull all published posts across all users with real metrics
  const rows = await db
    .select({
      caption: postsTable.caption,
      contentType: postsTable.contentType,
      userId: postsTable.userId,
      likes: postsTable.likes,
      saves: postsTable.saves,
      comments: postsTable.comments,
      reach: postsTable.reach,
    })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "published"),
        isNotNull(postsTable.reach),
        gt(postsTable.reach, 0),
      )
    )
    .orderBy(desc(postsTable.publishedAt))
    .limit(200);

  if (rows.length < 10) return;

  const withER = rows.map(r => ({
    ...r,
    er: calcER(r.likes ?? 0, r.saves ?? 0, r.comments ?? 0, r.reach ?? 0),
  }));

  const ers = withER.map(r => r.er);
  const mean = ers.reduce((a, b) => a + b, 0) / ers.length;
  const stdDev = Math.sqrt(ers.reduce((a, b) => a + (b - mean) ** 2, 0) / ers.length);
  const viralThreshold = mean + stdDev * 2;

  const viralPosts = withER.filter(r => r.er >= viralThreshold && r.reach >= 500);

  if (viralPosts.length < 2) return;

  // Get unique user industries for viral posts
  const userIds = [...new Set(viralPosts.map(r => r.userId).filter(Boolean))] as number[];
  if (userIds.length < 1) return;

  const posts: PostWithMetrics[] = viralPosts.map(r => ({
    caption: r.caption?.trim() ?? "",
    contentType: r.contentType ?? "image",
    nicheName: null,
    likes: r.likes ?? 0,
    saves: r.saves ?? 0,
    comments: r.comments ?? 0,
    reach: r.reach ?? 0,
    er: r.er,
  })).filter(p => p.caption.length > 60);

  if (posts.length < 2) return;

  const patterns = await extractPatternsWithAI(posts, "todos los sectores", "todas las ubicaciones");
  if (patterns.length === 0) return;

  // Remove old viral learnings before inserting fresh ones
  await db
    .delete(contentLearningsTable)
    .where(eq(contentLearningsTable.isViral, true));

  for (const pattern of patterns) {
    const avgER = viralPosts.reduce((a, r) => a + r.er, 0) / viralPosts.length;
    await db.insert(contentLearningsTable).values({
      userIndustry: "GLOBAL",
      geoLevel: "global",
      geoCountry: null,
      geoCity: null,
      learningType: "viral",
      insight: pattern,
      avgErPct: String(avgER.toFixed(4)),
      sampleSize: posts.length,
      isViral: true,
      active: true,
    });
  }
}

// ── Per-User Extraction ────────────────────────────────────────────────────────

async function extractLearningsForUser(profile: UserGeoProfile): Promise<void> {
  const posts = await getTopPostsForUser(profile.userId, 3);
  if (posts.length < 2) return;

  const avgER = posts.reduce((a, p) => a + p.er, 0) / posts.length;

  // Determine geo level
  const hasCity = profile.city.length > 2;
  const hasCountry = profile.country.length > 2;
  const geoLevel = hasCity ? "local" : hasCountry ? "national" : "global";
  const geoDescription = hasCity
    ? `${profile.city}, ${profile.country}`
    : hasCountry
    ? profile.country
    : "global";

  const patterns = await extractPatternsWithAI(posts, profile.industry, geoDescription);
  if (patterns.length === 0) return;

  // Delete old shared learnings for this user's industry + geo combo before inserting fresh
  // (only shared learnings — userId IS NULL — to avoid deleting personal signals)
  await db
    .delete(contentLearningsTable)
    .where(
      and(
        eq(contentLearningsTable.userIndustry, profile.industry),
        eq(contentLearningsTable.geoLevel, geoLevel),
        hasCity ? eq(contentLearningsTable.geoCity, profile.city) : isNull(contentLearningsTable.geoCity),
        hasCountry ? eq(contentLearningsTable.geoCountry, profile.country) : isNull(contentLearningsTable.geoCountry),
        eq(contentLearningsTable.isViral, false),
        isNull(contentLearningsTable.userId),
      )
    );

  for (const pattern of patterns) {
    await db.insert(contentLearningsTable).values({
      userIndustry: profile.industry,
      geoLevel,
      geoCountry: hasCountry ? profile.country : null,
      geoCity: hasCity ? profile.city : null,
      learningType: "content_pattern",
      insight: pattern,
      avgErPct: String(avgER.toFixed(4)),
      sampleSize: posts.length,
      isViral: false,
      active: true,
    });
  }
}

// ── User Edit Signal Extraction ────────────────────────────────────────────────

/**
 * Compares AI-generated captions (ai_caption_original) vs final user-edited captions
 * on approved/published posts to identify consistent editing patterns.
 * Stores as learning_type = "user_edit_pattern" scoped to userId.
 * These become the highest-priority signal injected into the prompt.
 */
export async function extractUserEditSignals(userId: number): Promise<void> {
  // Fetch posts where user approved/published AND the AI caption is known
  const rows = await db
    .select({
      id: postsTable.id,
      caption: postsTable.caption,
      aiCaptionOriginal: postsTable.aiCaptionOriginal,
    })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.userId, userId),
        inArray(postsTable.status, ["approved", "published"]),
        isNotNull(postsTable.aiCaptionOriginal),
      )
    )
    .orderBy(desc(postsTable.updatedAt))
    .limit(30);

  // Separate pairs into: style edits (same topic, style change) vs topic shifts (user changed the subject)
  const topicShiftPairs: { orig: string; final: string }[] = [];
  const edited = rows.filter(r => {
    const orig = r.aiCaptionOriginal?.trim() ?? "";
    const final = r.caption?.trim() ?? "";
    if (orig.length < 40 || final.length < 40 || orig === final) return false;
    const sim = captionKeywordSimilarity(orig, final);
    if (sim < 0.3) {
      // Topic shift: user rewrote the entire subject — collect separately for user_topic_shift learning
      topicShiftPairs.push({ orig, final });
      return false;
    }
    return true;
  });

  // ── user_topic_shift learning — extract recurring themes from topic-shift pairs ──
  if (topicShiftPairs.length >= 3) {
    try {
      const shiftText = topicShiftPairs
        .slice(0, 12)
        .map((p, i) => `[Reescritura ${i + 1}]\nIA generó: ${p.orig.slice(0, 250)}\nUsuario escribió sobre: ${p.final.slice(0, 250)}`)
        .join("\n\n---\n\n");

      const shiftResp = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_completion_tokens: 300,
        messages: [
          {
            role: "system",
            content: `Eres un experto en análisis de contenido. Analizas casos donde un usuario descartó completamente el tema de un post de IA y escribió sobre otro tema diferente.`,
          },
          {
            role: "user",
            content: `El usuario rechazó el tema del post y lo reescribió completamente ${topicShiftPairs.slice(0, 12).length} veces. Identifica los TEMAS RECURRENTES hacia los que el usuario suele redirigir el contenido cuando no le convence el tema de la IA.

${shiftText}

REGLAS:
- Máximo 2 temas recurrentes, máximo 20 palabras cada uno.
- Describe el TIPO de contenido o tema al que el usuario suele cambiar (ej: "contenidos educativos con datos concretos", "historias personales de clientes").
- NO menciones marcas ni nombres propios.

Responde SOLO con JSON: {"themes": ["tema 1", "tema 2"]}`,
          },
        ],
      });

      const shiftContent = shiftResp.choices[0]?.message?.content ?? "";
      const shiftParsed = JSON.parse(shiftContent.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      const themes: string[] = (shiftParsed.themes ?? [])
        .filter((t: unknown) => typeof t === "string" && t.length > 10)
        .slice(0, 2);

      if (themes.length > 0) {
        await db
          .delete(contentLearningsTable)
          .where(
            and(
              eq(contentLearningsTable.userId, userId),
              eq(contentLearningsTable.learningType, "user_topic_shift"),
            )
          );
        for (const theme of themes) {
          await db.insert(contentLearningsTable).values({
            userId,
            userIndustry: "PERSONAL",
            geoLevel: "personal",
            learningType: "user_topic_shift",
            insight: theme,
            sampleSize: topicShiftPairs.length,
            isViral: false,
            active: true,
          });
        }
      }
    } catch {
      // Silent fail — best-effort
    }
  }

  if (edited.length < 3) return;

  const postsText = edited
    .slice(0, 15)
    .map((r, i) =>
      `[Edición ${i + 1}]\nOriginal IA: ${r.aiCaptionOriginal!.slice(0, 300)}\nEditado por usuario: ${r.caption.slice(0, 300)}`
    )
    .join("\n\n---\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: `Eres un experto en análisis de patrones de escritura. Comparas textos originales y editados para identificar qué tipo de cambios hace consistentemente una persona.`,
        },
        {
          role: "user",
          content: `A continuación hay ${edited.slice(0, 15).length} pares de captions: el original de la IA y el editado por el usuario.

${postsText}

Identifica los patrones de edición más consistentes del usuario — qué cambia SIEMPRE o con frecuencia (tono, longitud, CTAs, emojis, estructura, nivel de formalidad).

REGLAS:
- Sé muy específico y accionable.
- NO menciones marcas, empresas, handles o URLs.
- Máximo 3 patrones, cada uno de máximo 20 palabras.

Responde SOLO con JSON: {"patterns": ["patrón 1", "patrón 2", "patrón 3"]}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const patterns: string[] = (parsed.patterns ?? [])
      .filter((p: unknown) => typeof p === "string" && p.length > 10)
      .slice(0, 3);

    if (patterns.length === 0) return;

    // Replace existing edit patterns for this user
    await db
      .delete(contentLearningsTable)
      .where(
        and(
          eq(contentLearningsTable.userId, userId),
          eq(contentLearningsTable.learningType, "user_edit_pattern"),
        )
      );

    for (const pattern of patterns) {
      await db.insert(contentLearningsTable).values({
        userId,
        userIndustry: "PERSONAL",
        geoLevel: "personal",
        learningType: "user_edit_pattern",
        insight: pattern,
        sampleSize: edited.length,
        isViral: false,
        active: true,
      });
    }
  } catch {
    // Silent fail — learning signals are best-effort
  }
}

// ── Rejection Signal Extraction ────────────────────────────────────────────────

/**
 * Analyzes posts the user has rejected to extract anti-patterns (what to avoid).
 * Stores as learning_type = "rejection_pattern" scoped to userId.
 * Injected into the prompt as "EVITAR — patrones rechazados por este usuario".
 */
export async function extractRejectionSignals(userId: number): Promise<void> {
  const rows = await db
    .select({
      id: postsTable.id,
      caption: postsTable.caption,
      contentType: postsTable.contentType,
    })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.userId, userId),
        eq(postsTable.status, "rejected"),
        isNotNull(postsTable.caption),
      )
    )
    .orderBy(desc(postsTable.updatedAt))
    .limit(30);

  const valid = rows.filter(r => (r.caption?.trim().length ?? 0) > 40);
  if (valid.length < 3) return;

  const postsText = valid
    .slice(0, 15)
    .map((r, i) =>
      `[Rechazado ${i + 1}] Tipo: ${r.contentType}\n${r.caption.slice(0, 350)}`
    )
    .join("\n\n---\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: `Eres un experto en marketing de contenido. Analizas publicaciones que un usuario rechazó para identificar qué tipo de contenido NO quiere publicar.`,
        },
        {
          role: "user",
          content: `El usuario rechazó estas ${valid.slice(0, 15).length} publicaciones. Analiza qué tienen en común.

${postsText}

Identifica exactamente 3 anti-patrones — qué tipo de tono, estructura, contenido o estilo rechaza este usuario consistentemente.

REGLAS:
- Cada anti-patrón debe ser una instrucción de qué EVITAR, máximo 20 palabras.
- NO menciones marcas, handles o URLs.
- Sé específico, no genérico.

Responde SOLO con JSON: {"antiPatterns": ["evitar X", "no usar Y", "evitar Z"]}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const antiPatterns: string[] = (parsed.antiPatterns ?? [])
      .filter((p: unknown) => typeof p === "string" && p.length > 10)
      .slice(0, 3);

    if (antiPatterns.length === 0) return;

    // Replace existing rejection patterns for this user
    await db
      .delete(contentLearningsTable)
      .where(
        and(
          eq(contentLearningsTable.userId, userId),
          eq(contentLearningsTable.learningType, "rejection_pattern"),
        )
      );

    for (const pattern of antiPatterns) {
      await db.insert(contentLearningsTable).values({
        userId,
        userIndustry: "PERSONAL",
        geoLevel: "personal",
        learningType: "rejection_pattern",
        insight: pattern,
        sampleSize: valid.length,
        isViral: false,
        active: true,
      });
    }
  } catch {
    // Silent fail — learning signals are best-effort
  }
}

// ── Visual Signal Recording + Extraction (Task #368) ──────────────────────────

/**
 * Records a real-time visual preference signal from the user's interaction.
 * Non-blocking — call with `void recordVisualSignal(...)` from route handlers.
 *
 * Signal types:
 *  - 'style_regen'      — user regenerated an image with explicit style/filter/font params
 *  - 'reference_image'  — user uploaded a reference photo (imageDescription = vision analysis)
 *  - 'manual_prompt'    — user typed a custom DALL-E prompt in /create-manual
 */
export async function recordVisualSignal(params: {
  userId: number;
  businessId?: number | null;
  postId?: number | null;
  signalType: "style_regen" | "reference_image" | "manual_prompt";
  style?: string | null;
  overlayFilter?: string | null;
  textStyle?: string | null;
  overlayFont?: string | null;
  logoPosition?: string | null;
  imageDescription?: string | null;
}): Promise<void> {
  try {
    await db.insert(userVisualSignalsTable).values({
      userId: params.userId,
      businessId: params.businessId ?? null,
      postId: params.postId ?? null,
      signalType: params.signalType,
      style: params.style ?? null,
      overlayFilter: params.overlayFilter ?? null,
      textStyle: params.textStyle ?? null,
      overlayFont: params.overlayFont ?? null,
      logoPosition: params.logoPosition ?? null,
      imageDescription: params.imageDescription ?? null,
    });
  } catch {
    // Silent fail — visual signals are best-effort, must never interrupt UI flow
  }
}

/**
 * Computes the statistical mode of a string array (most frequent value).
 * Returns null when the array is empty or all values are null/undefined.
 */
function computeMode(values: (string | null | undefined)[]): string | null {
  const freq = new Map<string, number>();
  for (const v of values) {
    if (v && v !== "none" && v !== "default") freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  if (freq.size === 0) return null;
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Reads user_visual_signals from the last 60 days and extracts persistent visual preferences.
 * Saves results as learning_type='user_visual_pattern' scoped to userId.
 * Called daily by the learning cron; requires ≥3 signals to run.
 *
 * Three signal types are analyzed:
 *   1. style_regen   → mode of style/filter/font/logoPosition
 *   2. reference_image + manual_prompt → GPT-4.1-mini extracts recurring visual keywords
 */
export async function extractVisualEditSignals(userId: number): Promise<void> {
  try {
    const since60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const signals = await db
      .select()
      .from(userVisualSignalsTable)
      .where(
        and(
          eq(userVisualSignalsTable.userId, userId),
          gte(userVisualSignalsTable.createdAt, since60d),
        )
      )
      .orderBy(desc(userVisualSignalsTable.createdAt))
      .limit(100);

    if (signals.length < 3) return;

    const patterns: string[] = [];

    // ── 1. Style mode analysis from style_regen signals ──────────────────────
    const styleSignals = signals.filter(s => s.signalType === "style_regen");
    if (styleSignals.length >= 3) {
      const styleMode      = computeMode(styleSignals.map(s => s.style));
      const filterMode     = computeMode(styleSignals.map(s => s.overlayFilter));
      const textStyleMode  = computeMode(styleSignals.map(s => s.textStyle));
      const fontMode       = computeMode(styleSignals.map(s => s.overlayFont));
      const logoPosMode    = computeMode(styleSignals.map(s => s.logoPosition));

      const styleParts: string[] = [];
      if (styleMode)     styleParts.push(`estilo visual: ${styleMode}`);
      if (filterMode)    styleParts.push(`filtro: ${filterMode}`);
      if (textStyleMode) styleParts.push(`estilo de texto: ${textStyleMode}`);
      if (fontMode)      styleParts.push(`tipografía: ${fontMode}`);
      if (logoPosMode)   styleParts.push(`logo en ${logoPosMode}`);

      if (styleParts.length >= 2) {
        patterns.push(`El usuario prefiere consistentemente: ${styleParts.join(", ")}`);
      }
    }

    // ── 2. Keyword analysis from reference_image + manual_prompt signals ─────
    const descriptionSignals = signals
      .filter(s => (s.signalType === "reference_image" || s.signalType === "manual_prompt") && s.imageDescription?.trim())
      .slice(0, 15);

    if (descriptionSignals.length >= 2) {
      const descriptionsText = descriptionSignals
        .map((s, i) => `[Referencia ${i + 1} — ${s.signalType}]: ${s.imageDescription!.slice(0, 300)}`)
        .join("\n\n---\n\n");

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_completion_tokens: 400,
        messages: [
          {
            role: "system",
            content: `Eres un director de arte. Analizas descripciones de imágenes de referencia y prompts que un usuario eligió repetidamente para identificar sus preferencias visuales consistentes.`,
          },
          {
            role: "user",
            content: `El usuario subió estas ${descriptionSignals.length} referencias visuales/prompts en los últimos 60 días.

${descriptionsText}

Identifica máximo 2 preferencias visuales PERSISTENTES — patrones que se repiten entre varias referencias (estilo de foto, ambiente, tipo de composición, paleta de colores recurrente, tipo de escena preferida, etc.).

REGLAS:
- Máximo 25 palabras por preferencia. Sé concreto y visual (no abstracto).
- Solo menciona preferencias que aparecen en AL MENOS 2 referencias.
- NO menciones marcas, logos ni nombres propios.

Responde SOLO con JSON: {"preferences": ["preferencia visual 1", "preferencia visual 2"]}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      const prefs: string[] = (parsed.preferences ?? [])
        .filter((p: unknown) => typeof p === "string" && p.length > 10)
        .slice(0, 2);

      for (const pref of prefs) {
        patterns.push(pref);
      }
    }

    if (patterns.length === 0) return;

    // Replace existing visual patterns for this user
    await db
      .delete(contentLearningsTable)
      .where(
        and(
          eq(contentLearningsTable.userId, userId),
          eq(contentLearningsTable.learningType, "user_visual_pattern"),
        )
      );

    for (const pattern of patterns.slice(0, 3)) {
      await db.insert(contentLearningsTable).values({
        userId,
        userIndustry: "PERSONAL",
        geoLevel: "personal",
        learningType: "user_visual_pattern",
        insight: pattern,
        sampleSize: signals.length,
        isViral: false,
        active: true,
      });
    }
  } catch {
    // Silent fail — best-effort learning signal
  }
}

/**
 * Returns a formatted string of the user's visual preferences for injection into image prompts.
 * Returns "" when no visual patterns have been learned yet.
 */
export async function getUserVisualPrefs(userId: number): Promise<string> {
  try {
    const rows = await db
      .select({ insight: contentLearningsTable.insight })
      .from(contentLearningsTable)
      .where(
        and(
          eq(contentLearningsTable.userId, userId),
          eq(contentLearningsTable.learningType, "user_visual_pattern"),
          eq(contentLearningsTable.active, true),
        )
      )
      .limit(3);

    if (rows.length === 0) return "";

    const lines = ["🎨 PREFERENCIAS VISUALES APRENDIDAS DEL USUARIO (aplicar al estilo de imagen):"];
    for (const r of rows) {
      lines.push(`  • ${r.insight}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/**
 * Returns structured visual defaults (textStyle, overlayFilter, overlayFont) derived from
 * the user's recent style_regen signals (mode of last 60 days, min 3 signals).
 * These are applied as actual rendering parameters in generateImagesForPostsBg when
 * the business brand hasn't set an explicit override.
 * Returns null when there are insufficient signals to establish a preference.
 */
export async function getUserVisualStructuredDefaults(userId: number): Promise<{
  imageStyle: string | null;   // 'photorealistic' | 'graphic' | 'infographic'
  textStyle: string | null;
  overlayFilter: string | null;
  overlayFont: string | null;
} | null> {
  try {
    const since60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const signals = await db
      .select({
        style: userVisualSignalsTable.style,
        textStyle: userVisualSignalsTable.textStyle,
        overlayFilter: userVisualSignalsTable.overlayFilter,
        overlayFont: userVisualSignalsTable.overlayFont,
      })
      .from(userVisualSignalsTable)
      .where(
        and(
          eq(userVisualSignalsTable.userId, userId),
          eq(userVisualSignalsTable.signalType, "style_regen"),
          gte(userVisualSignalsTable.createdAt, since60d),
        )
      )
      .orderBy(desc(userVisualSignalsTable.createdAt))
      .limit(50);

    if (signals.length < 3) return null;

    const imageStyle    = computeMode(signals.map(s => s.style));
    const textStyle     = computeMode(signals.map(s => s.textStyle));
    const overlayFilter = computeMode(signals.map(s => s.overlayFilter));
    const overlayFont   = computeMode(signals.map(s => s.overlayFont));

    if (!imageStyle && !textStyle && !overlayFilter && !overlayFont) return null;
    return {
      imageStyle: imageStyle ?? null,
      textStyle: textStyle ?? null,
      overlayFilter: overlayFilter ?? null,
      overlayFont: overlayFont ?? null,
    };
  } catch {
    return null;
  }
}

// ── Top Hashtags by Real ER ────────────────────────────────────────────────────

/**
 * Calculates top hashtags used by this user ranked by average ER of posts that used them.
 * Parses the space-separated `hashtags` field from published posts.
 * Requires at least 2 uses to be included (avoids noise from one-off hashtags).
 */
async function getTopHashtagsByER(
  userId: number,
  limit = 5,
): Promise<Array<{ hashtag: string; avgER: number; count: number }>> {
  const rows = await db
    .select({
      hashtags: postsTable.hashtags,
      likes: postsTable.likes,
      saves: postsTable.saves,
      comments: postsTable.comments,
      reach: postsTable.reach,
    })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.userId, userId),
        eq(postsTable.status, "published"),
        isNotNull(postsTable.reach),
        gt(postsTable.reach, 0),
        isNotNull(postsTable.hashtags),
      )
    )
    .orderBy(desc(postsTable.publishedAt))
    .limit(60);

  const tagStats = new Map<string, { totalER: number; count: number }>();

  for (const row of rows) {
    const er = calcER(row.likes ?? 0, row.saves ?? 0, row.comments ?? 0, row.reach ?? 0);
    const tags = (row.hashtags ?? "").split(/\s+/).filter(t => t.startsWith("#") && t.length > 2);
    for (const tag of tags) {
      const existing = tagStats.get(tag) ?? { totalER: 0, count: 0 };
      tagStats.set(tag, { totalER: existing.totalER + er, count: existing.count + 1 });
    }
  }

  return Array.from(tagStats.entries())
    .map(([hashtag, { totalER, count }]) => ({ hashtag, avgER: totalER / count, count }))
    .filter(t => t.count >= 2)
    .sort((a, b) => b.avgER - a.avgER)
    .slice(0, limit);
}

// ── Freshness Guard ────────────────────────────────────────────────────────────

/**
 * Writes (or refreshes) a per-user extraction checkpoint row in content_learnings.
 * This lets the freshness guard work correctly for users who have never accumulated
 * enough posts to generate real personal signals (edit/rejection patterns).
 *
 * active=false ensures the sentinel is invisible to getSmartContextForUser queries.
 */
async function upsertExtractionCheckpoint(userId: number, userIndustry: string): Promise<void> {
  try {
    // Delete any previous checkpoint for this user, then insert a fresh one
    await db
      .delete(contentLearningsTable)
      .where(
        and(
          eq(contentLearningsTable.userId, userId),
          eq(contentLearningsTable.learningType, "extraction_checkpoint"),
        )
      );
    await db
      .insert(contentLearningsTable)
      .values({
        userId,
        userIndustry,
        geoLevel: "personal",
        learningType: "extraction_checkpoint",
        insight: "checkpoint",
        sampleSize: 0,
        isViral: false,
        active: false,
        detectedAt: new Date(),
        updatedAt: new Date(),
      });
  } catch {
    // Non-critical — log and continue
    console.warn(`[LearningEngine] Could not write extraction checkpoint for user ${userId}`);
  }
}

async function shouldSkipUserExtraction(
  userId: number,
  _userIndustry: string,
): Promise<boolean> {
  try {
    const cutoff20h = new Date(Date.now() - 20 * 60 * 60 * 1000);

    // Look for any per-user row (real personal signals OR checkpoint sentinel).
    // Shared segment learnings (userId IS NULL) are intentionally excluded to
    // prevent cross-user contamination within the same industry.
    const [latestForUser] = await db
      .select({ updatedAt: contentLearningsTable.updatedAt })
      .from(contentLearningsTable)
      .where(eq(contentLearningsTable.userId, userId))
      .orderBy(desc(contentLearningsTable.updatedAt))
      .limit(1);

    // No record at all → first extraction ever for this user → must process
    if (!latestForUser?.updatedAt) return false;

    const lastExtractionAt = latestForUser.updatedAt;

    // Extraction record is older than 20h → stale → must process
    if (lastExtractionAt < cutoff20h) return false;

    // Check if any post was updated AFTER the timestamp of the last extraction.
    // If yes → new signals may exist → must process.
    // If no  → nothing changed → safe to skip.
    const [newerPost] = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(
        and(
          eq(postsTable.userId, userId),
          gte(postsTable.updatedAt, lastExtractionAt),
        )
      )
      .limit(1);

    return !newerPost;
  } catch {
    return false; // on error, process anyway (safe default)
  }
}

// ── Main Orchestrator (called by scheduler) ────────────────────────────────────

export async function runLearningExtraction(): Promise<void> {
  try {
    // Get all users with brand profiles that have industry defined
    const profiles = await db
      .select({
        userId: brandProfilesTable.userId,
        industry: brandProfilesTable.industry,
        country: brandProfilesTable.country,
        city: brandProfilesTable.city,
      })
      .from(brandProfilesTable)
      .where(isNotNull(brandProfilesTable.industry));

    for (const p of profiles) {
      if (!p.industry || !p.userId) continue;

      // Freshness guard — skip if learnings are fresh and no new post activity since last extraction
      const skip = await shouldSkipUserExtraction(p.userId, p.industry.trim());
      if (skip) continue;

      const profile: UserGeoProfile = {
        userId: p.userId,
        industry: p.industry.trim(),
        country: (p.country ?? "").trim(),
        city: (p.city ?? "").trim(),
      };

      // Segment + geo learnings (shared / cross-user signal)
      await extractLearningsForUser(profile);

      // Personal signals: edit patterns + rejection anti-patterns + visual preferences
      await extractUserEditSignals(p.userId);
      await extractRejectionSignals(p.userId);
      await extractVisualEditSignals(p.userId);

      // Write a per-user checkpoint so the freshness guard correctly skips this user
      // on the next run if no posts have been updated since this extraction.
      await upsertExtractionCheckpoint(p.userId, p.industry.trim());
    }

    // After per-user extraction, detect viral trends across all users
    await detectViralTrends();
  } catch (err) {
    console.error("[LearningEngine] Error during extraction:", err);
  }
}

// ── Query: Get Learnings for AI Injection ──────────────────────────────────────

/**
 * Builds a formatted "intelligence block" for a specific user.
 * Used to inject into the AI generation prompt.
 *
 * Priority order (highest to lowest):
 *  0. Personal edit patterns (how THIS user prefers captions written — max priority)
 *  1. Personal rejection anti-patterns (what THIS user rejects — inject as EVITAR block)
 *  2. Viral global (breaks all hierarchy)
 *  3. Local geo match (same city + industry)
 *  4. National geo match (same country + industry)
 *  5. Global match (same industry, any location)
 *  6. Top hashtags by real ER for this user
 */
export async function getSmartContextForUser(userId: number): Promise<string> {
  try {
    const profile = await getUserGeoProfile(userId);
    if (!profile) return "";

    // 0. Personal learnings scoped to this userId — ordered by most recent first for determinism
    const personalRows = await db
      .select()
      .from(contentLearningsTable)
      .where(
        and(
          eq(contentLearningsTable.userId, userId),
          eq(contentLearningsTable.active, true),
        )
      )
      .orderBy(desc(contentLearningsTable.updatedAt))
      .limit(10);

    const editPatterns = personalRows.filter(r => r.learningType === "user_edit_pattern");
    const topicShiftPatterns = personalRows.filter(r => r.learningType === "user_topic_shift");
    const rejectionPatterns = personalRows.filter(r => r.learningType === "rejection_pattern");
    const visualPatterns = personalRows.filter(r => r.learningType === "user_visual_pattern");

    // 1. Viral learnings (always applied regardless of segment)
    const viralRows = await db
      .select()
      .from(contentLearningsTable)
      .where(and(eq(contentLearningsTable.isViral, true), eq(contentLearningsTable.active, true)))
      .limit(3);

    // 2. Segment-specific learnings with geo hierarchy (shared — userId IS NULL)
    const segmentRows = await db
      .select()
      .from(contentLearningsTable)
      .where(
        and(
          eq(contentLearningsTable.active, true),
          eq(contentLearningsTable.isViral, false),
          eq(contentLearningsTable.userIndustry, profile.industry),
          isNull(contentLearningsTable.userId),
        )
      )
      .orderBy(desc(contentLearningsTable.avgErPct))
      .limit(20);

    // Apply geo hierarchy: prefer local > national > global
    const local = segmentRows.filter(
      r => r.geoLevel === "local" && r.geoCity?.toLowerCase() === profile.city.toLowerCase()
    );
    const national = segmentRows.filter(
      r => r.geoLevel === "national" && r.geoCountry?.toLowerCase() === profile.country.toLowerCase()
    );
    const global = segmentRows.filter(r => r.geoLevel === "global");

    // Pick top insights: local first, fill with national, fill rest with global
    const segmentInsights = [...local, ...national, ...global].slice(0, 5);

    // 3. Top hashtags by real engagement rate
    const topHashtags = await getTopHashtagsByER(userId, 5);

    const hasContent = editPatterns.length > 0 || topicShiftPatterns.length > 0 ||
      rejectionPatterns.length > 0 || visualPatterns.length > 0 ||
      viralRows.length > 0 || segmentInsights.length > 0 || topHashtags.length > 0;
    if (!hasContent) return "";

    const lines: string[] = [
      `INTELIGENCIA DE CONTENIDO PROBADA — patrones extraídos de publicaciones con alto engagement en tu segmento (${profile.industry}):`,
    ];

    // Highest priority: how this user personally writes
    if (editPatterns.length > 0) {
      lines.push(`\n✏️ ESTILO PREFERIDO POR ESTE USUARIO (máxima prioridad — así prefiere los captions):`);
      for (const r of editPatterns) {
        lines.push(`  • ${r.insight}`);
      }
    }

    // Second priority: recurring topic redirections (user consistently changes the subject to these themes)
    if (topicShiftPatterns.length > 0) {
      lines.push(`\n🔁 TEMAS QUE ESTE USUARIO PREFIERE (cuando la IA propone temas que no le convencen, suele redirigir hacia):`);
      for (const r of topicShiftPatterns) {
        lines.push(`  • ${r.insight}`);
      }
    }

    // Third priority: what to avoid (rejection anti-patterns)
    if (rejectionPatterns.length > 0) {
      lines.push(`\n🚫 EVITAR — patrones que este usuario ha rechazado consistentemente:`);
      for (const r of rejectionPatterns) {
        lines.push(`  • ${r.insight}`);
      }
    }

    // Visual preferences learned from reference images and regenerations
    if (visualPatterns.length > 0) {
      lines.push(`\n🎨 PREFERENCIAS VISUALES DE ESTE USUARIO (aplica al estilo de imagen cuando sea posible):`);
      for (const r of visualPatterns) {
        lines.push(`  • ${r.insight}`);
      }
    }

    if (viralRows.length > 0) {
      lines.push(`\n🔥 TENDENCIAS VIRALES GLOBALES (aplica inmediatamente — rompen todos los sectores):`);
      for (const r of viralRows) {
        lines.push(`  • ${r.insight}`);
      }
    }

    if (segmentInsights.length > 0) {
      const geoTag = local.length > 0
        ? `📍 ${profile.city}`
        : national.length > 0
        ? `🇨🇴 ${profile.country}`
        : "🌐 Global";
      lines.push(`\n${geoTag} — Lo que funciona en tu industria (${profile.industry}):`);
      for (const r of segmentInsights) {
        const geoLabel = r.geoLevel === "local"
          ? `[Local: ${r.geoCity}]`
          : r.geoLevel === "national"
          ? `[Nacional: ${r.geoCountry}]`
          : "[Global]";
        lines.push(`  • ${geoLabel} ${r.insight}`);
      }
    }

    if (topHashtags.length > 0) {
      lines.push(`\n📊 HASHTAGS QUE MÁS ENGAGEMENT GENERAN PARA ESTE NEGOCIO (datos reales, complementan los pools por industria):`);
      lines.push(`  ${topHashtags.map(t => `${t.hashtag} (ER promedio: ${t.avgER.toFixed(1)}%)`).join("  •  ")}`);
    }

    lines.push(`\nÚsalos como inspiración — no como copia. Adapta el patrón al tema específico del post.`);

    return lines.join("\n");
  } catch {
    return "";
  }
}

/**
 * Returns top-performing posts for a specific user + optional niche,
 * formatted for AI injection (Level 1 — most personalized signal).
 */
export async function getUserTopCaptions(
  userId: number,
  limit = 4,
): Promise<Array<{ caption: string; note: string }>> {
  try {
    const rows = await db
      .select({
        caption: postsTable.caption,
        contentType: postsTable.contentType,
        nicheName: nichesTable.name,
        likes: postsTable.likes,
        saves: postsTable.saves,
        comments: postsTable.comments,
        reach: postsTable.reach,
      })
      .from(postsTable)
      .leftJoin(nichesTable, eq(postsTable.nicheId, nichesTable.id))
      .where(
        and(
          eq(postsTable.userId, userId),
          inArray(postsTable.status, ["published", "approved", "scheduled"]),
        )
      )
      .orderBy(desc(postsTable.updatedAt))
      .limit(limit * 6);

    const withScore = rows
      .map(r => {
        const caption = r.caption?.trim() ?? "";
        if (caption.length < 80) return null;
        const likes = r.likes ?? 0;
        const saves = r.saves ?? 0;
        const comments = r.comments ?? 0;
        const reach = r.reach ?? 0;
        const rawScore = likes + saves * 2 + comments;
        const er = reach > 0 ? rawScore / reach : 0;
        const hasMetrics = likes > 0 || saves > 0 || reach > 0;
        return { caption, contentType: r.contentType ?? "image", nicheName: r.nicheName, rawScore, er, hasMetrics };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    withScore.sort((a, b) => {
      if (a.hasMetrics !== b.hasMetrics) return a.hasMetrics ? -1 : 1;
      if (a.er !== b.er) return b.er - a.er;
      return b.rawScore - a.rawScore;
    });

    return withScore.slice(0, limit).map(r => ({
      caption: r.caption,
      note: r.hasMetrics
        ? `(${r.contentType}${r.nicheName ? ` — ${r.nicheName}` : ""} — alto rendimiento)`
        : `(${r.contentType}${r.nicheName ? ` — ${r.nicheName}` : ""})`,
    }));
  } catch {
    return [];
  }
}

// ── Capa 1: Approval signal functions (Task #367) ──────────────────────────────

/**
 * Records a real-time approval or rejection signal from the post approval queue.
 * Non-blocking — failures are silenced so they never interrupt the UI flow.
 *
 * Called from:
 *   - POST /api/posts/:id/approve → signal='approved'
 *   - DELETE /api/posts/:id (draft/pending) → signal='rejected'
 */
export async function recordApprovalSignal(params: {
  userId: number;
  businessId?: number | null;
  postId: number;
  nicheId: number | null;
  signal: "approved" | "rejected";
}): Promise<void> {
  if (!params.nicheId) return;
  try {
    await db.insert(nicheApprovalSignalsTable).values({
      userId: params.userId,
      businessId: params.businessId ?? null,
      nicheId: params.nicheId,
      postId: params.postId,
      signal: params.signal,
    });
  } catch (err) {
    console.warn("[ApprovalSignal] Failed to record signal:", err);
  }
}

/**
 * Returns the set of niche IDs suspended for automatic generation.
 * A niche is suspended if it has ≥3 rejections in the last 30 days
 * for the given business (or user if no businessId).
 *
 * Used by buildActiveNicheWindow to filter BEFORE building the active window.
 */
export async function getSuspendedNiches(
  businessId: number | null | undefined,
  userId: number | undefined,
): Promise<Set<number>> {
  if (!businessId && !userId) return new Set();
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const scopeCond = businessId != null
      ? and(
          eq(nicheApprovalSignalsTable.businessId, businessId),
          eq(nicheApprovalSignalsTable.signal, "rejected"),
          gte(nicheApprovalSignalsTable.createdAt, thirtyDaysAgo),
          isNotNull(nicheApprovalSignalsTable.nicheId),
        )
      : and(
          eq(nicheApprovalSignalsTable.userId, userId!),
          eq(nicheApprovalSignalsTable.signal, "rejected"),
          gte(nicheApprovalSignalsTable.createdAt, thirtyDaysAgo),
          isNotNull(nicheApprovalSignalsTable.nicheId),
        );

    const rows = await db
      .select({
        nicheId: nicheApprovalSignalsTable.nicheId,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(nicheApprovalSignalsTable)
      .where(scopeCond)
      .groupBy(nicheApprovalSignalsTable.nicheId)
      .having(sql`COUNT(*) >= 3`);

    return new Set(rows.filter(r => r.nicheId != null).map(r => r.nicheId!));
  } catch {
    return new Set();
  }
}

/**
 * Returns an approval score map for each niche, based on the last 30 days.
 * Score formula:
 *   +10 per approval signal
 *   -5  per rejection signal
 *
 * Used in buildActiveNicheWindow for the 2-layer combined score:
 *   combinedScore = approvalScore * 0.6 + erPct * 0.4
 */
export async function getApprovalScoreMap(
  businessId: number | null | undefined,
  userId: number | undefined,
): Promise<Map<number, number>> {
  if (!businessId && !userId) return new Map();
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const scopeCond = businessId != null
      ? and(
          eq(nicheApprovalSignalsTable.businessId, businessId),
          gte(nicheApprovalSignalsTable.createdAt, thirtyDaysAgo),
          isNotNull(nicheApprovalSignalsTable.nicheId),
        )
      : and(
          eq(nicheApprovalSignalsTable.userId, userId!),
          gte(nicheApprovalSignalsTable.createdAt, thirtyDaysAgo),
          isNotNull(nicheApprovalSignalsTable.nicheId),
        );

    const rows = await db
      .select({
        nicheId: nicheApprovalSignalsTable.nicheId,
        signal: nicheApprovalSignalsTable.signal,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(nicheApprovalSignalsTable)
      .where(scopeCond)
      .groupBy(nicheApprovalSignalsTable.nicheId, nicheApprovalSignalsTable.signal);

    const scoreMap = new Map<number, number>();
    for (const r of rows) {
      if (!r.nicheId) continue;
      const current = scoreMap.get(r.nicheId) ?? 0;
      const delta = r.signal === "approved"
        ? Number(r.cnt) * 10
        : -Number(r.cnt) * 5;
      scoreMap.set(r.nicheId, current + delta);
    }
    return scoreMap;
  } catch {
    return new Map();
  }
}

/**
 * Returns the top-N most approved and most rejected niches in the last N days.
 * Used by the weekly feedback cron to build the Telegram report.
 */
export async function getWeeklyApprovalStats(
  businessId: number | null | undefined,
  userId: number | undefined,
  daysBack = 7,
): Promise<{
  mostApproved: Array<{ nicheName: string; count: number }>;
  mostRejected: Array<{ nicheName: string; count: number }>;
}> {
  if (!businessId && !userId) return { mostApproved: [], mostRejected: [] };
  try {
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const scopeBase = businessId != null
      ? eq(nicheApprovalSignalsTable.businessId, businessId)
      : eq(nicheApprovalSignalsTable.userId, userId!);

    const rows = await db
      .select({
        nicheId: nicheApprovalSignalsTable.nicheId,
        nicheName: sql<string>`n.name`,
        signal: nicheApprovalSignalsTable.signal,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(nicheApprovalSignalsTable)
      .leftJoin(sql`niches n`, sql`n.id = ${nicheApprovalSignalsTable.nicheId}`)
      .where(
        and(
          scopeBase,
          gte(nicheApprovalSignalsTable.createdAt, since),
          isNotNull(nicheApprovalSignalsTable.nicheId),
        ),
      )
      .groupBy(nicheApprovalSignalsTable.nicheId, sql`n.name`, nicheApprovalSignalsTable.signal)
      .orderBy(sql`COUNT(*) DESC`);

    const approvedMap = new Map<string, number>();
    const rejectedMap = new Map<string, number>();

    for (const r of rows) {
      const name = r.nicheName ?? `niche_${r.nicheId}`;
      if (r.signal === "approved") approvedMap.set(name, Number(r.cnt));
      else rejectedMap.set(name, Number(r.cnt));
    }

    const mostApproved = [...approvedMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nicheName, count]) => ({ nicheName, count }));

    const mostRejected = [...rejectedMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nicheName, count]) => ({ nicheName, count }));

    return { mostApproved, mostRejected };
  } catch {
    return { mostApproved: [], mostRejected: [] };
  }
}

/**
 * Returns the top N niches by ER% for the given user based on their published posts.
 * Used in the weekly Telegram report to show market-resonance data alongside user preference data.
 * Minimum 2 published posts per niche for a stable ER estimate.
 */
export async function getTopERNichesByUser(
  userId: number,
  daysBack = 30,
  limit = 5,
): Promise<Array<{ nicheName: string; erPct: number; pubCount: number }>> {
  try {
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        nicheName: sql<string>`n.name`,
        erPct: sql<number>`
          COALESCE(
            (AVG(NULLIF(${postsTable.likes}, 0)) + AVG(NULLIF(${postsTable.comments}, 0)) * 2 + AVG(NULLIF(${postsTable.saves}, 0)) * 2)
            / GREATEST(AVG(NULLIF(${postsTable.reach}, 0)), 1) * 100,
            0
          )`,
        pubCount: sql<number>`COUNT(*)`,
      })
      .from(postsTable)
      .leftJoin(sql`niches n`, sql`n.id = ${postsTable.nicheId}`)
      .where(
        and(
          eq(postsTable.userId, userId),
          eq(postsTable.status, "published"),
          isNotNull(postsTable.nicheId),
          gte(postsTable.createdAt, since),
        ),
      )
      .groupBy(postsTable.nicheId, sql`n.name`)
      .having(sql`COUNT(*) >= 2`)
      .orderBy(sql`2 DESC`)
      .limit(limit);

    return rows.map(r => ({
      nicheName: r.nicheName ?? "—",
      erPct: Math.round(Number(r.erPct) * 10) / 10,
      pubCount: Number(r.pubCount),
    }));
  } catch {
    return [];
  }
}
