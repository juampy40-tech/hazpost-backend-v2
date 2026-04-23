---
name: title-post-concordance
description: Detecta y diagnostica cuándo los títulos de texto superpuestos en las imágenes generadas (slides 2-N de carousels y reels) no concuerdan con el tema del post. Úsalo cuando slides muestran frases de otro negocio ("Únete al cambio", "Eficiente y tuyo"), frases genéricas sin relación con el producto, o cuando la primera imagen tiene título correcto pero las siguientes no. Complementa image-business-concordance (escena visual).
---

# Skill: Title-Post Concordance Checker

## Propósito
Detectar, diagnosticar y corregir discordancias entre el tema del post y los títulos
de texto superpuestos en los slides generados para carousels y reels.

**Diferencia con otros skills de concordancia:**
| Skill | Problema que resuelve |
|-------|-----------------------|
| `cross-user-contamination` | Usuario A ve datos del Usuario B |
| `cross-business-contamination` | Negocio A recibe marca/colores del Negocio B |
| `image-business-concordance` | El fondo/escena de la imagen no corresponde al tipo de negocio |
| `title-post-concordance` (ESTE) | Los títulos de texto en los slides no concuerdan con el tema del post |

## Cuándo activar este skill
- Slide 1 del carousel tiene título correcto ("Pan fresco todos los días"), pero slides 2-5 dicen cosas sin relación ("ÚNETE AL CAMBIO", "¿CUÁNTO PAGAS?")
- Los títulos de un post de panadería contienen frases de energía solar o frases genéricas corporativas
- Aparecen frases prohibidas en cualquier slide (ver sección siguiente)
- Después de modificar `CAROUSEL_HEADLINE_POOLS`, `REEL_HEADLINE_POOLS`, o `suggestHeadlines` en `ai.service.ts`
- Al agregar nuevos tipos de contenido con múltiples slides
- Al detectar que el campo `caption` no llega a `generateCarouselSlides` / `generateReelSlides`

---

## Frases prohibidas — detección de contaminación ECO

Si aparece alguna de estas frases en slides de un negocio distinto a ECO (energía solar),
es una señal de contaminación directa de los pools hardcodeados originales:

**Contaminación ECO confirmada:**
- "ÚNETE AL CAMBIO"
- "TU CAMBIO EMPIEZA AQUÍ"
- "SIMPLE. EFICIENTE. TUYO." / "EFICIENTE Y TUYO"
- "¿CUÁNTO PAGAS?" / "¿CUÁNTO TE CUESTA HOY?" / "¿CUÁNTO TE COBRAN?"
- "¿CUÁNTO PIERDES AL MES?" / "¿SIGUES PAGANDO DE MÁS?"
- "¿CUÁL ES EL COSTO REAL?" / "COSTO REAL"
- "EL COSTO SUBE. ¿Y TÚ?"
- "CAMBIA HOY" / "DA EL PASO HOY MISMO"

**Frases genéricas de muy baja calidad (aplican a cualquier negocio):**
- "LA SOLUCIÓN EXISTE" / "HAY UNA SALIDA"
- "EL CAMBIO ES POSIBLE" / "LLEGÓ EL MOMENTO"
- "EMPIEZA AHORA" / "NO ESPERES MÁS"

**Ciudades que NO deberían aparecer en posts de otros negocios:**
- "Palmira", "Candelaria", "Yumbo" (ciudades de ECO) — indican contaminación de tagline/firma

---

## Flujo de generación de títulos

El título de cada slide se determina en `generateCarouselSlides` y `generateReelSlides`
en `artifacts/api-server/src/services/ai.service.ts`.

### Slide 1 (siempre)
```
captionHook del post → primer párrafo del caption generado por GPT
```
El slide 1 siempre usa el hook del post — nunca se toca. Este es el correcto.

### Slides 2-N (post-fix Task #60)
```
SI job.caption disponible → suggestHeadlines(caption, platform, contentType)
  → 5 titulares contextuales en mayúsculas ≤ 55 chars
  → slide 2 = [0], slide 3 = [1], slide 4 = [2], etc.

SI job.caption ausente O suggestHeadlines falla (catch)
  → CAROUSEL_HEADLINE_POOLS[i] / REEL_HEADLINE_POOLS[i]
  → pickSlideHeadline() → anti-repetición últimas 15 veces
  → selección aleatoria del pool (fallback)
```

### Código clave (ai.service.ts)
```typescript
// generateCarouselSlides (~línea 2460)
let gptHeadlines: string[] = [];
if (fullCaption && slidesToGenerate > 1) {
  try {
    const effectivePlatform = postPlatform === "tiktok" ? "tiktok" : "instagram";
    gptHeadlines = await suggestHeadlines(fullCaption, effectivePlatform, "carousel");
  } catch { /* non-fatal — fall through to static pools */ }
}
// Slides 2-N: gptHeadlines[(i-1) % gptHeadlines.length] || pool[i]
```

---

## Mapa de vectores de riesgo

| # | Descripción | Causa | Severidad | Estado |
|---|-------------|-------|-----------|--------|
| V1 | Frases ECO en slides de otros negocios | CAROUSEL/REEL_HEADLINE_POOLS con frases hardcodeadas de ECO | **ALTA** | Resuelto en Task #60 (GPT prioritario) |
| V2 | caption no llega al background job | imageJobs.push sin campo `caption` | **ALTA** | Resuelto en Task #60 |
| V3 | suggestHeadlines falla en producción → fallback al pool de ECO | Error de API de OpenAI o timeout | **MEDIA** | Fallback sigue siendo pools. Monitor required. |
| V4 | Nuevo tipo de contenido con slides sin implementar GPT | Agregar "story_multi" sin actualizar generateXxxSlides | **MEDIA** | Accionable al agregar nuevos tipos |
| V5 | Pool modificado con frases genéricas nuevas | Dev agrega phrase genérica al pool de fallback | **BAJA** | Revisión manual al hacer PR |

---

## Protocolo de diagnóstico (5 pasos)

### Paso 1 — Identificar el post afectado

```sql
-- Ver los últimos posts con sus títulos de slides en DB
SELECT
  p.id AS post_id,
  p.business_id,
  p.content_type,
  p.caption,
  iv.variant_index AS slide,
  iv.overlay_caption_hook AS slide_title
FROM posts p
JOIN image_variants iv ON iv.post_id = p.id
WHERE p.content_type IN ('carousel', 'reel')
  AND p.business_id = <bizId>
ORDER BY p.created_at DESC, iv.variant_index ASC
LIMIT 30;
-- Si slide 0 tiene título relevante pero slides 1-3 tienen frases de ECO → V1 o V2
```

### Paso 2 — Verificar que caption llega al job

```sql
-- ¿El post tiene caption en DB?
SELECT id, content_type, caption, LEFT(caption, 100) AS caption_preview
FROM posts
WHERE id = <postId>;
-- Si caption está en DB pero el slide tiene frases de ECO → V2: caption no llegó al job
```

### Paso 3 — Verificar que el job tenía caption

El campo `caption` en `PostImageJob` es opcional. Si llegó vacío, `generateCarouselSlides`
cayó al pool estático. Revisar los logs del servidor durante la generación:

```bash
# Buscar en logs si suggestHeadlines fue llamado (hay un GPT call con el caption)
# Si no aparece el call → el caption no llegó al job
grep -i "suggestHeadlines\|slide.*headline\|carousel.*headline" \
  /tmp/logs/artifactsapi-server_API_Server_*.log
```

### Paso 4 — Verificar si los pools de fallback siguen siendo los originales

```bash
# Verificar el contenido actual de los pools estáticos de fallback
grep -A 15 "CAROUSEL_HEADLINE_POOLS" \
  artifacts/api-server/src/services/ai.service.ts | head -30

grep -A 15 "REEL_HEADLINE_POOLS" \
  artifacts/api-server/src/services/ai.service.ts | head -20

# Buscar frases prohibidas en los pools:
grep -n '"ÚNETE AL CAMBIO"\|"EFICIENTE Y TUYO"\|"SIMPLE. EFICIENTE"\|"¿CUÁNTO PAGAS"' \
  artifacts/api-server/src/services/ai.service.ts
```

### Paso 5 — Test manual de concordancia

```
PASO 1: Crear/generar un post de carousel para la panadería con texto que contenga "pan"
PASO 2: Esperar que las imágenes se generen (background job)
PASO 3: Abrir el post en la UI → ver la cola de aprobación
PASO 4: Revisar CADA slide:
  Slide 1: ¿Habla del tema del post? Sí ✅ (siempre debería)
  Slide 2: ¿Habla del tema del post? Si no → FALLO
  Slide 3: ¿Habla del tema del post? Si no → FALLO
  Slide 4: ¿Habla del tema del post? Si no → FALLO
PASO 5: Si algún slide tiene frase de ECO → FALLO GRAVE (V1 regresó)
PASO 6: Si todos los slides son temáticos → CORRECTO ✅

Ejemplo esperado (panadería):
  Slide 1: "PAN FRESCO TODOS LOS DÍAS"  ← captionHook (siempre correcto)
  Slide 2: "MASA MADRE ARTESANAL"       ← GPT basado en caption
  Slide 3: "HORNEADO CADA MAÑANA"       ← GPT basado en caption
  Slide 4: "EL SABOR QUE ENAMORA"       ← GPT basado en caption

Ejemplo con regresión:
  Slide 1: "PAN FRESCO TODOS LOS DÍAS"  ← correcto
  Slide 2: "ÚNETE AL CAMBIO"            ← ECO CONTAMINACIÓN ❌
  Slide 3: "¿CUÁNTO PAGAS?"             ← ECO CONTAMINACIÓN ❌
```

---

## Patrones inseguros vs. seguros

### Patrón inseguro: pool con frases específicas de un negocio (V1)
```typescript
// ❌ INSEGURO — frases de ECO en pool global usado por TODOS los negocios
const CAROUSEL_HEADLINE_POOLS: (string[] | null)[] = [
  null, // Slide 1: always captionHook
  ["¿CUÁNTO PAGAS?", "¿CUÁNTO TE CUESTA HOY?", ...],  // frases de energía solar
  ["LA SOLUCIÓN EXISTE", "SIMPLE. EFICIENTE. TUYO.", ...],  // taglines de ECO
  ["ÚNETE AL CAMBIO", "TU CAMBIO EMPIEZA AQUÍ", ...],  // CTAs de ECO
];
// Una panadería que usa este pool ve "¿CUÁNTO PAGAS?" en sus imágenes de pan.

// ✅ SEGURO — usar GPT para generar headlines contextuales del post
// y mantener pools solo como fallback genérico neutral
let gptHeadlines = await suggestHeadlines(fullCaption, platform, "carousel");
// → Panadería recibe: "MASA MADRE ARTESANAL", "HORNEADO FRESCO", "EL PAN DE LA TRADICIÓN"
```

### Patrón inseguro: imageJobs.push sin caption (V2)
```typescript
// ❌ INSEGURO — caption no llega al background job
imageJobs.push({
  postId: post.id,
  captionHook: captionHookDraft,
  // caption NO incluido → generateCarouselSlides recibe fullCaption=undefined
  // → cae al pool estático de ECO
  contentType,
  ...
});

// ✅ SEGURO — caption incluido para que GPT pueda generar headlines temáticos
imageJobs.push({
  postId: post.id,
  captionHook: captionHookDraft,
  caption,      // ← campo requerido para concordancia temática
  contentType,
  ...
});
```

### Patrón inseguro: nuevo tipo de contenido multi-slide sin GPT (V4)
```typescript
// ❌ INSEGURO — nueva función para tipo "story_multi" sin implementar fullCaption
export async function generateStoryMultiSlides(...) {
  const slideHeadlines = await Promise.all(
    Array.from({ length: slidesToGenerate }, async (_, i) => {
      if (i === 0) return captionHook;
      return pickSlideHeadline(userId, STORY_HEADLINE_POOLS[i], `story:${i}`, businessId);
      // ← pool estático sin contexto del post → mismo bug que antes
    })
  );
}

// ✅ SEGURO — mismo patrón que carousel/reel: GPT primero, pool como fallback
export async function generateStoryMultiSlides(
  ...,
  fullCaption?: string,
  postPlatform?: string,
) {
  let gptHeadlines: string[] = [];
  if (fullCaption && slidesToGenerate > 1) {
    try {
      gptHeadlines = await suggestHeadlines(fullCaption, postPlatform ?? "instagram", "story");
    } catch { /* non-fatal */ }
  }
  // usar gptHeadlines para slides 2-N, pool como fallback
}
```

---

## SQL queries de auditoría

### Nota: content_history vs. image_variants

`content_history` registra el `captionHook` de cada post (slide 1 solamente) con el fin
de aplicar la regla de anti-repetición de 15 posts. **No almacena los títulos de slides 2-N**.

`image_variants` almacena `overlay_caption_hook` por cada slide generado — esta es la
fuente de verdad para auditar los títulos de texto superpuestos en los slides.

Por esto, las auditorías de concordancia de títulos usan `image_variants` (títulos reales
en imagen) y las auditorías de anti-repetición de hooks usan `content_history` (hooks del post).

```sql
-- content_history: detectar hooks del post 1 con frases de ECO en el captionHook principal
-- Útil para verificar que el slide 1 tampoco está contaminado
SELECT
  ch.user_id,
  ch.business_id,
  ch.caption_hook,
  ch.content_type,
  ch.created_at
FROM content_history ch
WHERE ch.created_at > NOW() - INTERVAL '7 days'
  AND (
    ch.caption_hook ILIKE '%ÚNETE AL CAMBIO%'
    OR ch.caption_hook ILIKE '%CUÁNTO PAGAS%'
    OR ch.caption_hook ILIKE '%EFICIENTE Y TUYO%'
    OR ch.caption_hook ILIKE '%SIMPLE. EFICIENTE%'
  )
ORDER BY ch.created_at DESC
LIMIT 10;
-- Si retorna filas → el hook del slide 1 también está contaminado (problema diferente,
-- el caption generado por GPT ya contiene frases de ECO — revisar el prompt de generateCaption)
```

```sql
-- Auditoría 1: posts recientes con títulos de ECO en slides 2+ (contaminación V1)
SELECT
  p.id AS post_id,
  p.business_id,
  b.name AS business_name,
  p.content_type,
  p.created_at,
  iv.variant_index AS slide,
  iv.overlay_caption_hook AS slide_title
FROM image_variants iv
JOIN posts p ON p.id = iv.post_id
JOIN businesses b ON b.id = p.business_id
WHERE iv.variant_index > 0
  AND (
    iv.overlay_caption_hook ILIKE '%ÚNETE AL CAMBIO%'
    OR iv.overlay_caption_hook ILIKE '%CUÁNTO PAGAS%'
    OR iv.overlay_caption_hook ILIKE '%EFICIENTE Y TUYO%'
    OR iv.overlay_caption_hook ILIKE '%SIMPLE. EFICIENTE%'
    OR iv.overlay_caption_hook ILIKE '%TU CAMBIO EMPIEZA%'
    OR iv.overlay_caption_hook ILIKE '%CUÁNTO TE CUESTA%'
  )
ORDER BY p.created_at DESC
LIMIT 20;
-- Si retorna filas → posible regresión de V1 (GPT fallando → pool de ECO activándose)

-- Auditoría 2: distribución de títulos en slides 2+ (detecta patrones repetitivos del pool)
SELECT
  iv.overlay_caption_hook,
  COUNT(*) AS frequency,
  MIN(p.created_at) AS first_seen,
  MAX(p.created_at) AS last_seen
FROM image_variants iv
JOIN posts p ON p.id = iv.post_id
WHERE iv.variant_index > 0
  AND p.created_at > NOW() - INTERVAL '7 days'
GROUP BY iv.overlay_caption_hook
ORDER BY frequency DESC
LIMIT 20;
-- Títulos que se repiten mucho → probablemente vienen del pool estático (GPT falla)
-- Títulos únicos y variados → GPT funcionando correctamente

-- Auditoría 3: posts de carousel/reel sin caption en la tabla (edge case)
SELECT id, business_id, content_type, created_at, caption
FROM posts
WHERE content_type IN ('carousel', 'reel')
  AND (caption IS NULL OR caption = '')
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
-- Si hay posts sin caption → sus slides 2-N nunca pudieron tener GPT headlines
```

---

## Reglas al modificar código relacionado

### Al modificar CAROUSEL_HEADLINE_POOLS o REEL_HEADLINE_POOLS
1. Los pools son **solo fallback** — se usan cuando GPT falla o caption está vacío
2. Ninguna frase en los pools debe ser específica de un sector (no frases de energía, médico, comida)
3. Ninguna frase en los pools debe ser tagline de un negocio específico
4. Preferir frases completamente neutras: "DESCUBRE MÁS", "EMPIEZA HOY", "DA EL PRIMER PASO"
5. Verificar con: `grep -n "POOL" ai.service.ts | head -20` para confirmar ubicaciones

### Al agregar un nuevo tipo de contenido con múltiples slides
Checklist obligatorio:
- [ ] La nueva función acepta `fullCaption?: string` y `postPlatform?: string`
- [ ] Llama `suggestHeadlines(fullCaption, platform, contentType)` si fullCaption disponible
- [ ] Tiene fallback al pool estático si GPT falla (try/catch)
- [ ] El pool estático de fallback contiene frases neutras (no de ECO ni de ningún negocio)
- [ ] `PostImageJob` incluye el nuevo tipo en la lógica de distribución de `caption`
- [ ] `generateImagesForPostsBg` pasa `job.caption` y `job.platform` a la nueva función

### Al modificar suggestHeadlines (ai.service.ts ~línea 2164)
1. Verificar que sigue generando titulares en MAYÚSCULAS
2. Verificar que el max de caracteres es ≤ 55 (el renderer SVG tiene límite de espacio)
3. Verificar que el formato de respuesta sigue siendo JSON array de strings
4. Test manual: panadería + carousel → slides 2-3 deben ser sobre pan

---

## Criterios de aceptación (checklist)

### Funcionalidad core (post-Task #60)
- [ ] Un carousel de panadería tiene slides 2-N sobre pan/horneado/masa (nunca ECO)
- [ ] Un reel de boutique tiene títulos en slides 2-4 sobre ropa/moda/estilo (nunca "¿CUÁNTO PAGAS?")
- [ ] Slide 1 de cualquier post siempre usa el captionHook del post (sin cambio)
- [ ] La auditoría SQL 1 retorna 0 filas para posts de los últimos 7 días

### Fallback funcional
- [ ] Si `suggestHeadlines` falla (simular bloqueando la API) → el carousel se genera igual usando el pool estático
- [ ] Los pools de fallback no contienen ninguna de las "frases prohibidas" de ECO listadas arriba

### Prevención de regresión
- [ ] Todos los nuevos tipos de contenido multi-slide usan el mismo patrón fullCaption + GPT + pool fallback
- [ ] El campo `caption` está presente en todos los imageJobs.push para posts de tipo feed (carousel, reel, image)
- [ ] La auditoría SQL 2 muestra baja frecuencia de repetición de títulos (variedad = GPT activo)

---

## Archivos relevantes

| Archivo | Qué contiene |
|---------|-------------|
| `artifacts/api-server/src/services/ai.service.ts:843-898` | REEL_HEADLINE_POOLS y CAROUSEL_HEADLINE_POOLS (pools de fallback) |
| `artifacts/api-server/src/services/ai.service.ts:960-1008` | `pickSlideHeadline()` — anti-repetición para el pool de fallback |
| `artifacts/api-server/src/services/ai.service.ts:2161-2208` | `suggestHeadlines()` — generación GPT de titulares contextuales |
| `artifacts/api-server/src/services/ai.service.ts:2440-2560` | `generateCarouselSlides()` y `generateReelSlides()` — lógica principal |
| `artifacts/api-server/src/services/ai.service.ts:3024-3043` | `PostImageJob` interface — incluye `caption?: string` |
| `artifacts/api-server/src/services/ai.service.ts:3508-3545` | Llamadas a carousel y reel en `generateImagesForPostsBg` |
| `.agents/skills/image-business-concordance/SKILL.md` | Skill hermano para escena visual (no títulos) |
