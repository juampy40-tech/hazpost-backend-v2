---
name: performance
description: Performance and caching guidelines for HazPost. Use when adding new API endpoints with filtering, when loading large lists of posts or images, when calling OpenAI APIs, or when designing background processing jobs. Covers pagination rules, async processing, DB index requirements, and AI response caching.
---

# Rendimiento y Caché — HazPost

## Regla Principal

HazPost procesa contenido multimedia pesado (imágenes base64 de 1-3 MB cada una, generación de
reels con ffmpeg, llamadas a OpenAI que tardan 10-60s). Nunca bloquear el hilo principal ni
cargar datos innecesariamente.

---

## 1. PAGINACIÓN — NUNCA CARGAR TODO

### Posts
El usuario puede tener cientos de posts. NUNCA:
```typescript
// ❌ Carga todos los posts de la DB de una vez
const posts = await db.select().from(postsTable).where(eq(postsTable.userId, uid));
```

SIEMPRE:
```typescript
// ✅ Para el calendario — usar slim=1 (sin imageData base64)
GET /api/posts?slim=1&status=pending_approval,scheduled

// ✅ Para la cola de aprobación — cargar de a N con offset
GET /api/posts?status=pending_approval&limit=20&offset=0

// ✅ Para analytics — solo IDs y métricas, no imageData
db.select({
  id: postsTable.id,
  likes: postsTable.likes,
  reach: postsTable.reach,
}).from(postsTable)
```

### Imágenes (imageData base64)
`imageData` es el campo más pesado (puede ser 1-3 MB por variante). Reglas:
- Calendario: `slim=1` → NO carga imageData
- Cola de aprobación: carga full solo del post activo (no de todos)
- Biblioteca de slides: miniatura 120px @ q40, no la imagen completa

---

## 2. PROCESAMIENTO ASÍNCRONO — NO BLOQUEAR AL USUARIO

### Generación de imágenes (Phase 2 pattern)
El patrón establecido en `posts.ts`:
```typescript
// Phase 1: responde al usuario inmediatamente (~5-10s)
const { postIds, imageJobs } = await generateBulkPosts(...);
res.status(201).json({ posts, generated, imagesGenerating: true }); // ← responde YA

// Phase 2: genera imágenes en background (30-120s) — NO bloquea
generateImagesForPostsBg(imageJobs).catch(err =>
  console.error("[BG] Image generation error:", err)
);
// El cliente hace polling con GET /api/posts/:id hasta que imageVariants.length > 0
```

### Tareas largas → background con `.catch(logger.warn)`
```typescript
// ✅ No bloquea, no crashea si falla
schedulerService.doHeavyTask().catch(logger.warn);
```

---

## 3. CACHÉ DE IA — NO LLAMAR A OPENAI SI YA EXISTE

### Antes de generar una imagen nueva, verificar si ya existe una variante similar
```typescript
// ✅ Verificar por hash del rawBackground o de los parámetros del prompt
const [existing] = await db.select({ id: imageVariantsTable.id })
  .from(imageVariantsTable)
  .where(and(
    eq(imageVariantsTable.postId, postId),
    eq(imageVariantsTable.rawBackgroundHash, hash), // columna existente
  )).limit(1);
if (existing) return existing; // reusar — no gastar créditos de DALL-E
```

### Caché en memoria para recursos costosos de leer del disco
```typescript
// Patrón ya implementado para fuentes TTF (lazy + cache en module scope)
let _bebasB64: string | null = null;
export async function getBebasFontB64(): Promise<string> {
  if (_bebasB64) return _bebasB64; // cache hit
  _bebasB64 = (await readFile(BEBAS_PATH)).toString("base64");
  return _bebasB64;
}
```

Aplicar este patrón a cualquier recurso que se lea repetidamente del disco (logos, música, etc.)

---

## 4. ÍNDICES DE BASE DE DATOS

Antes de agregar una nueva query con WHERE sobre una columna que no sea PK, verificar si existe
índice. Si la tabla tiene > 1000 filas y la columna no es PK/FK, crear índice.

Columnas ya indexadas (verificado):
- `posts.user_id` — implicit index via FK
- `posts.business_id` — implicit index via FK
- `posts.status` — usado en queries de aprobación/publicación
- `posts.scheduled_at` — ordenamiento frecuente

Si agregas query sobre columna sin índice en tabla grande:
```sql
-- Agregar en startup migration de app.ts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_post_number
  ON posts(business_id, post_number)
  WHERE post_number IS NOT NULL;
```

---

## 5. QUERIES — EVITAR N+1

```typescript
// ❌ N+1 — 1 query por post
for (const post of posts) {
  const variants = await db.select().from(imageVariantsTable)
    .where(eq(imageVariantsTable.postId, post.id));
  post.imageVariants = variants;
}

// ✅ Batch — 1 query para todos
const allVariants = await db.select().from(imageVariantsTable)
  .where(inArray(imageVariantsTable.postId, postIds));
const variantsByPost = new Map<number, typeof allVariants>();
for (const v of allVariants) {
  if (!variantsByPost.has(v.postId)) variantsByPost.set(v.postId, []);
  variantsByPost.get(v.postId)!.push(v);
}
```

---

## 6. FRONTEND — LAZY LOADING

### Imágenes en calendario/cola
```tsx
// ✅ No cargar imageData hasta que el post sea el activo
const { data: fullPost } = useGetPost(postId, {
  enabled: postId === currentPostId, // solo cuando sea el post activo
});
```

### React Query — no invalidar todo, ser específico
```typescript
// ❌ Invalida todo (re-fetch innecesario)
queryClient.invalidateQueries();

// ✅ Solo lo que cambió
queryClient.invalidateQueries({ queryKey: getGetPostsQueryKey() });
queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
```

---

## 7. SHARP / IMAGEN — PROCESAMIENTO EFICIENTE

```typescript
// ✅ Pipeline encadenado — una sola pasada por la imagen
const result = await sharp(buffer)
  .resize(1024, 1024, { fit: "cover" })
  .composite([{ input: logoBuffer, top: 50, left: 50 }])
  .jpeg({ quality: 85 })
  .toBuffer();

// ❌ Múltiples instancias de sharp para la misma imagen
const resized = await sharp(buffer).resize(1024, 1024).toBuffer();
const composited = await sharp(resized).composite([...]).toBuffer();
// Use pipeline en su lugar
```

---

## 8. FFMPEG — REGLAS PARA REELS

- Siempre usar `CRF 26` (buena calidad, tamaño razonable) para output
- Output resolución máxima: `1080×1920` (9:16) o `1080×1350` (4:5)
- Duración máxima de procesamiento esperada: 30-60s por reel
- Guardar en Object Storage (no en disco local) para URLs públicas que Meta pueda descargar
- Cleanup de archivos temporales en `/tmp/` siempre con `finally`

---

## 9. RATE LIMITING — OPENAI

OpenAI impone rate limits por minuto. Para generación masiva:
- El lock de concurrencia (`generationLocks` en posts.ts) previene 2 runs simultáneos por usuario
- Si una llamada a OpenAI falla con 429, hacer `await sleep(2000)` y reintentar UNA vez
- No reintentar más de una vez — log el error y continuar con el siguiente post

---

## 10. TIMEOUTS — I/O EXTERNO EN JOBS DE BACKGROUND

### Regla crítica: NUNCA await sin timeout en jobs de background

Todo `await` sobre I/O externo (Object Storage, GCS, redes externas) dentro de un job de
background DEBE tener timeout. Un único `await` sin timeout puede bloquear un job
indefinidamente, haciendo que TODOS los posts queden pegados sin error ni log.

**Caso real (bug producción, abril 2026):** `file.download()` de GCS sin timeout bloqueó
la fase de precarga de datos de marca en `generateImagesForPostsBg`, impidiendo que
NINGUNA imagen se generara. El job mostraba "starting job 1/1" pero nunca completaba.

### Patrón correcto — Object Storage download

```typescript
const LOGO_TIMEOUT_MS = 8_000; // 8s — nunca bloquear por un logo

// ✅ Promise.race con timeout que resuelve null (no rechaza) para flujo no-fatal
const file = await _objectStorage.getObjectEntityFile(objectPath);
const result = await Promise.race([
  file.download().then(([data]: [Buffer]) => data),
  new Promise<null>(resolve => setTimeout(() => resolve(null), LOGO_TIMEOUT_MS)),
]);
// result es Buffer | null — null si el timeout ganó, continuar sin el recurso
```

### Anti-patrón prohibido

```typescript
// ❌ Sin timeout — cuelga infinitamente si GCS está lento
const file = await _objectStorage.getObjectEntityFile(logoUrl);
const [contents] = await file.download();

// ❌ Promise.all con reject — si el download termina pero antes de que el timer
//    se limpie, puede perderse el resultado
const [[contents]] = await Promise.all([
  file.download(),
  new Promise<never>((_, reject) => setTimeout(() => reject(...), ms)),
]).catch(() => [[null]]);
```

### Patrón correcto — withTimeout para fases de precarga completas

Cuando una fase de precarga tiene múltiples `await` (DB + logoBuffer + análisis),
envolver el bloque completo con `withTimeout` como red de seguridad global:

```typescript
const BRAND_PRELOAD_TIMEOUT_MS = 30_000; // 30s máx para toda la precarga
try {
  await withTimeout(
    Promise.all(jobs.map(async (job) => {
      const logo = await loadBusinessLogoBuffer(job.logoUrl); // ya tiene su propio timeout
      const brand = await db.select()...                      // query DB
      // ... más await ...
    })),
    BRAND_PRELOAD_TIMEOUT_MS,
    "brand-data pre-loading"
  );
} catch (e) {
  logger.error(e, "[phase] Brand preload failed (non-fatal) — continuing without brand data");
  // Continuar sin datos de marca: imágenes SÍ se generan, sin logo/tagline
}
```

### Tabla de timeouts establecidos

| Recurso                        | Timeout  | Patrón                            |
|-------------------------------|----------|-----------------------------------|
| Logo HTTP URL                 | 8s       | `AbortSignal.timeout(8000)`       |
| Logo Object Storage GCS       | 8s       | `Promise.race([download, timer])` |
| Brand data preload (fase completa) | 30s | `withTimeout(Promise.all, 30000)` |
| Generación imagen OpenAI      | 180s     | `withTimeout(generatePostImage)`  |
| Generación reel ffmpeg        | 300s     | timeout interno de ffmpeg         |

### Ubicación de `withTimeout`

La función `withTimeout` está definida en `ai.service.ts` (línea ~4042) como helper local:

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}
```

Usar esta función para cualquier Promise que pueda colgar más de N segundos en un job
de background. El label aparece en los logs de error para diagnóstico rápido.
