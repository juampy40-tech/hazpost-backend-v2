# AI Learning Engine — Arquitectura y Reglas

## ¿Qué es?

El motor de aprendizaje IA de HazPost extrae patrones de las publicaciones con mayor engagement y los inyecta automáticamente en el prompt de generación de contenido. Cuantos más posts y usuarios activos, más preciso se vuelve.

## Archivos clave

| Archivo | Propósito |
|---|---|
| `artifacts/api-server/src/services/learning.service.ts` | Toda la lógica del motor: extracción, queries de inyección + funciones de Capa 1 y señales visuales |
| `lib/db/src/schema/content_learnings.ts` | Tabla `content_learnings` — fuente de verdad de los aprendizajes |
| `lib/db/src/schema/niche_approval_signals.ts` | Tabla `niche_approval_signals` — señales de aprobación/rechazo en tiempo real (Capa 1) |
| `lib/db/src/schema/user_visual_signals.ts` | Tabla `user_visual_signals` — señales visuales en tiempo real (Task #368) |
| `lib/db/src/schema/posts.ts` | Tabla `posts` — columna `ai_caption_original` para señales de edición |
| `artifacts/api-server/src/services/scheduler.service.ts` | Cron diario 10:00 Bogotá (learning), semanal domingo 09:00 (reporte feedback Telegram) |
| `artifacts/api-server/src/services/ai.service.ts` | Llama `getSmartContextForUser()`, `getUserTopCaptions()`, `getSuspendedNiches()`, `getApprovalScoreMap()`, `getUserVisualPrefs()` |
| `artifacts/api-server/src/routes/social/posts.ts` | Llama `recordApprovalSignal()` en /approve y DELETE; `recordVisualSignal()` en generate-image-variant, generate-bulk, create-manual |
| `artifacts/api-server/src/index.ts` | Startup migrations para columnas nuevas (ADD COLUMN IF NOT EXISTS) |

---

## CAPA 1 — Feedback en tiempo real (approval queue) ← Task #367

La Capa 1 captura señales directas del usuario desde la cola de aprobación y las usa para personalizar la selección de nichos.

### Flujo
1. Usuario **aprueba** un post → `POST /api/posts/:id/approve` → `recordApprovalSignal({ signal: "approved" })` (fire-and-forget)
2. Usuario **rechaza** un post (elimina draft/pending) → `DELETE /api/posts/:id` → `recordApprovalSignal({ signal: "rejected" })`
3. **En la próxima generación automática**, `buildActiveNicheWindow` consulta:
   - `getSuspendedNiches()` → filtra nichos con ≥3 rechazos en 30 días
   - `getApprovalScoreMap()` → score combinado 60% aprobación / 40% ER para ordenar
4. **Cron domingo 09:00 Bogotá** → envía resumen semanal por Telegram: nichos más aprobados y rechazados

### Funciones en `learning.service.ts`
| Función | Propósito |
|---|---|
| `recordApprovalSignal(params)` | Graba señal en `niche_approval_signals`. Non-blocking (catch silenciado). |
| `getSuspendedNiches(businessId, userId)` | Retorna `Set<nicheId>` con ≥3 rechazos / 30 días |
| `getApprovalScoreMap(businessId, userId)` | Retorna `Map<nicheId, score>` (+10/aprobación, -5/rechazo) |
| `getWeeklyApprovalStats(businessId, userId, daysBack)` | Top 5 más aprobados / rechazados para el reporte Telegram |

### Tabla `niche_approval_signals`
```sql
id SERIAL PK | user_id FK users | business_id FK businesses | niche_id FK niches | post_id FK posts
signal TEXT CHECK ('approved','rejected') | created_at TIMESTAMP DEFAULT NOW()
```

---

## Tabla `content_learnings`

```sql
id              SERIAL PRIMARY KEY
user_industry   TEXT NOT NULL       -- segmento (ej: "Panadería") o "GLOBAL" o "PERSONAL"
geo_level       TEXT NOT NULL       -- "local" | "national" | "global" | "personal"
geo_country     TEXT                -- null para global/personal
geo_city        TEXT                -- null para national/global/personal
user_id         INTEGER             -- null = aprendizaje compartido; set = aprendizaje personal
learning_type   TEXT NOT NULL       -- ver tipos abajo
insight         TEXT NOT NULL       -- el patrón extraído (instrucción concreta ≤25 palabras)
avg_er_pct      NUMERIC(8,4)        -- ER promedio de los posts que generaron este insight
sample_size     INTEGER DEFAULT 0   -- cantidad de posts analizados
is_viral        BOOLEAN DEFAULT false
active          BOOLEAN DEFAULT true
detected_at     TIMESTAMP
updated_at      TIMESTAMP
```

### Tipos de `learning_type`

| Tipo | Scope | Descripción |
|---|---|---|
| `content_pattern` | Shared (userId=null) | Patrones de alto engagement por segmento+geo |
| `viral` | Global | Patrones de posts virales cross-sector (is_viral=true) |
| `user_edit_pattern` | Personal (userId=N) | Cómo este usuario edita los captions de la IA (solo pares con Jaccard ≥ 0.30) |
| `user_topic_shift` | Personal (userId=N) | Temas recurrentes hacia los que el usuario redirige el contenido (pares con Jaccard < 0.30) — Task #368 |
| `rejection_pattern` | Personal (userId=N) | Anti-patrones: qué rechaza consistentemente este usuario |
| `user_visual_pattern` | Personal (userId=N) | Preferencias visuales aprendidas de regeneraciones de imagen, fotos de referencia y prompts manuales |
| `user_visual_defaults` | Personal (userId=N) | Defaults estructurados de renderizado (textStyle, filter, font) — aplicados directamente en bulk generation |
| `extraction_checkpoint` | Personal (userId=N) | Centinela de frescura — activo=false, invisible al prompt |

---

## Tabla `posts` — columna clave

```sql
ai_caption_original  TEXT   -- Caption puro de la IA ANTES de applyAddon y ediciones del usuario
                            -- Se escribe solo en el INSERT inicial, NUNCA en updates posteriores
```

Esta columna permite a `extractUserEditSignals()` detectar qué cambios hace el usuario sobre el caption generado.

---

## Funciones exportadas

### `runLearningExtraction(): Promise<void>`
Orquestador principal. Llamado por el scheduler diario y en el startup (30s delay).

**Flujo:**
1. Para cada usuario con `brand_profile.industry` definido:
   - Ejecuta `shouldSkipUserExtraction(userId)` — **freshness guard**: si ya hay learnings <20h Y no hubo actividad de posts en ese lapso, salta al siguiente usuario (evita llamadas innecesarias a OpenAI).
   - `extractLearningsForUser(profile)` — extrae patrones de alto ER por segmento+geo (learnings compartidos)
   - `extractUserEditSignals(userId)` — señales de edición personal
   - `extractRejectionSignals(userId)` — anti-patrones de rechazo
2. `detectViralTrends()` — cross-user, detecta posts virales (ER >2σ + reach ≥500)

### `getSmartContextForUser(userId): Promise<string>`
Construye el bloque de "inteligencia de contenido" inyectado en el prompt.

**Prioridad de señales** (de mayor a menor):
1. `user_edit_pattern` (personal) — cómo prefiere escribir este usuario
2. `user_topic_shift` (personal) — temas hacia los que el usuario suele redirigir el contenido
3. `rejection_pattern` (personal) — qué evitar según rechazos
4. Virales globales
5. Segmento+geo (local > nacional > global)
6. Top 5 hashtags por ER real del usuario

### `getUserTopCaptions(userId, limit): Promise<Array<{caption, note}>>`
Devuelve los mejores posts del usuario (Level 1) para inyectar como ejemplos de estilo.
Ordenados por ER si tienen métricas, por engagement raw si no.

### `extractUserEditSignals(userId): Promise<void>`
- Requiere ≥3 posts aprobados/publicados con `ai_caption_original` ≠ `caption`
- **Detección de topic shift**: separa pares según similitud de keywords (Jaccard) con umbral **0.30**:
  - Jaccard ≥ 0.30 → mismo tema, cambio de estilo → van a `user_edit_pattern`
  - Jaccard < 0.30 → usuario cambió el tema completo → GPT-4.1-mini extrae temas recurrentes → guardados como `user_topic_shift` (si ≥3 pares de topic shift)
- Usa `gpt-4.1-mini` (hasta 15 pares para edit_pattern, hasta 12 pares para topic_shift)
- Guarda hasta 3 patrones como `user_edit_pattern` + hasta 2 como `user_topic_shift` scoped a userId

### `extractRejectionSignals(userId): Promise<void>`
- Requiere ≥3 posts con `status = 'rejected'` y caption >40 chars
- Usa `gpt-4.1-mini` (hasta 15 captions rechazados)
- Guarda hasta 3 anti-patrones como `rejection_pattern` scoped a userId

---

### `recordVisualSignal(params): Promise<void>` — Task #368
- Registra una señal visual en `user_visual_signals` (fire-and-forget, silenciado)
- Llamada con `void recordVisualSignal(...)` desde posts.ts (no bloquea)
- `signalType`: `'style_regen'` | `'reference_image'` | `'manual_prompt'`

### `extractVisualEditSignals(userId): Promise<void>` — Task #368
- Requiere ≥3 señales en `user_visual_signals` de los últimos 60 días
- Para `style_regen`: calcula moda de style/filter/font/logoPosition → insight de estilo preferido
- Para `reference_image`/`manual_prompt`: usa GPT-4.1-mini para extraer keywords visuales recurrentes
- Guarda hasta 3 patrones como `user_visual_pattern` scoped a userId (reemplaza los anteriores)

### `getUserVisualPrefs(userId): Promise<string>` — Task #368
- Lee `user_visual_pattern` de `content_learnings` para este userId
- Retorna bloque formateado para inyección en prompts de caption
- También se usa en `generateImagesForPostsBg` para enriquecer `enrichedSceneDesc` (baja prioridad)

### `getUserVisualStructuredDefaults(userId): Promise<{imageStyle, textStyle, overlayFilter, overlayFont} | null>` — Task #368
- Consulta señales `style_regen` de los últimos 60 días (min 3)
- Calcula moda de imageStyle, textStyle, overlayFilter y overlayFont
- Retorna objeto estructurado para aplicar como params REALES de renderizado (no solo hints de texto)
- Prioridad de aplicación en `generateImagesForPostsBg` (caller > config de marca > aprendido > default sistema):
  - `imageStyle` (photorealistic/graphic/infographic): llena el gap cuando el rotatedStyle es "photorealistic" (default del sistema)
  - `overlayFont`: llena el gap cuando brand no tiene `brandFont`
  - `overlayFilter`: nuevo map `overlayFilterByKey` — threaded a carousel, reel y regular posts
  - `textStyle`: sobreescribe el default genérico "cinema" o unset cuando el usuario tiene preferencia aprendida

### Arquitectura de aplicación en generación bulk
- `generateBulkPosts` → llama `generateImagesForPostsBg` → aquí se aplican todos los defaults aprendidos
- `generateImagesForPostsBg` es el punto de inyección centralizado para TODOS los content types:
  - `carousel`: vía `generateCarouselSlides(... overlayFilter)`
  - `reel`: vía `generateReelSlides(... overlayFilter)`
  - `regular/image/story`: vía `variantStyles = [jobEffectiveStyle]`
- NO hay lógica de defaults aprendidos en `generateBulkPosts` directamente — es intencional

---

## Tabla `user_visual_signals` — Task #368

```sql
id              SERIAL PRIMARY KEY
user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
business_id     INTEGER REFERENCES businesses(id) ON DELETE CASCADE  -- señales huérfanas se borran con el negocio
post_id         INTEGER REFERENCES posts(id) ON DELETE SET NULL         -- la señal persiste aunque el post se borre
signal_type     TEXT NOT NULL   -- 'style_regen' | 'reference_image' | 'manual_prompt'
style           TEXT            -- 'photorealistic' | 'graphic' | 'infographic'
overlay_filter  TEXT            -- 'warm' | 'cool' | 'dramatic' | 'vintage' | 'dark' | etc.
text_style      TEXT            -- 'cinema' | 'neon' | 'bebas' | etc.
overlay_font    TEXT            -- nombre de la fuente elegida
logo_position   TEXT            -- 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
image_description TEXT          -- para reference_image y manual_prompt: descripción textual
created_at      TIMESTAMP NOT NULL DEFAULT NOW()
```

### Puntos de registro (tiempo real)
| Endpoint | Signal | Condición |
|---|---|---|
| `POST /:id/generate-image-variant` (async DALL-E) | `style_regen` | Siempre, con los params de style elegidos |
| `POST /:id/generate-image-variant` | `reference_image` | Solo si `analyzeReferenceImage()` retorna desc no vacía |
| `POST /generate-bulk` | `reference_image` | Solo si `analyzeReferenceImage()` retorna desc no vacía |
| `POST /generate-extra` | `reference_image` | Solo si `analyzeReferenceImage()` retorna desc no vacía |
| `POST /create-manual` | `manual_prompt` | Solo si imagePrompt está presente |

---

## Jerarquía de 6 niveles

```
Nivel 1 — Top posts propios del usuario (getUserTopCaptions — más personalizado)
Nivel 2 — Mismo segmento + misma ciudad (geoLevel = "local")
Nivel 3 — Mismo segmento + mismo país (geoLevel = "national")
Nivel 4 — Mismo segmento + global (geoLevel = "global")
Nivel 5 — Geo hierarchy aplicada: local > national > global dentro del segmento
Nivel 6 — Viral global (rompe toda jerarquía — aplica a todos inmediatamente)
```

Los learnings personales (`user_edit_pattern`, `rejection_pattern`) tienen **mayor prioridad** que todos los demás porque son señales directas de las preferencias del usuario específico.

---

## Scheduler

- **Cron**: `0 10 * * *` (diario a las 10:00 Bogotá = 15:00 UTC)
- **Guard de frescura** (`shouldSkipUserExtraction(userId, _industry)`):
  Evalúa cualquier fila con `userId = N` en `content_learnings` (señales reales O el checkpoint sentinel).
  Los learnings compartidos (`userId IS NULL`) están excluidos a propósito — si los incluyeran,
  una extracción de otro usuario en la misma industria causaría skip en los demás.
  1. Sin ninguna fila para ese userId → primera extracción → procesa siempre.
  2. Última fila >20h → stale → procesa.
  3. Última fila <20h → compara posts del usuario contra ese timestamp → si hay posts más nuevos: procesa; si no: salta.
- **Checkpoint de extracción** (`upsertExtractionCheckpoint(userId, industry)`):
  Al finalizar cada ciclo de extracción por usuario (incluso si no se generaron señales por falta de datos),
  se escribe/actualiza una fila centinela con `learningType="extraction_checkpoint"`, `active=false`
  (invisible al prompt). Esto garantiza que el guard funcione correctamente para usuarios que aún no
  tienen suficientes posts editados/rechazados.
- **Startup**: también corre 30 segundos después del arranque del servidor (con el mismo guard)

---

## Reglas para no romper el sistema

### NUNCA hacer:
1. **Sobrescribir `ai_caption_original` en un UPDATE** — esta columna es write-once. Solo se escribe en el INSERT.
2. **Borrar learnings personales** (`userId IS NOT NULL`) cuando se refrescan los learnings compartidos — el DELETE de `extractLearningsForUser` incluye `isNull(userId)` a propósito.
3. **Quitar el `isNull(contentLearningsTable.userId)` del WHERE** en `getSmartContextForUser` al consultar segment learnings — evita mezclar personal con compartido.
4. **Cambiar el orden de prioridad** en `getSmartContextForUser` sin revisar el impacto — los patrones personales tienen prioridad máxima.

### Al agregar un nuevo tipo de señal:
1. Agregar la función de extracción en `learning.service.ts`
2. Llamarla dentro del loop de `runLearningExtraction`
3. Agregar el tipo en la tabla de `learning_type` de este skill
4. Inyectarlo en `getSmartContextForUser` con la prioridad correcta
5. Documentar en este skill

### Al agregar campos a `posts`:
- Si es para alimentar señales de aprendizaje, debe escribirse en el INSERT inicial (como `ai_caption_original`), nunca en updates del usuario.

---

## Puntos de inyección en `ai.service.ts`

`getSmartContextForUser` y `getUserTopCaptions` se llaman antes de cada generación:

- Bulk generator "both" feed (~línea 2133): `getSmartContextForUser` + `getUserTopCaptions`
- Cada variante de contentType/platform también recibe el contexto

Los 7 puntos de INSERT de posts (líneas ~4782, ~4912, ~5125, ~5255, ~5616, ~5811, ~5933) ya stampa `aiCaptionOriginal` con el caption puro antes de `applyAddon`.

---

## Arquitectura de aprendizaje en 2 capas (v2.0 — Task #366 documentado, Task #367 pendiente)

El sistema de aprendizaje opera en 2 capas secuenciales para personalizar la generación:

```
CAPA 1 — Filtro de gusto del usuario (cola de aprobación)
         Determina QUÉ SE GENERA en el futuro
         Aprobado (+10 pts) → generar más de este nicho/estilo
         Rechazado (−5 pts) → generar menos; suspender si ≥3 rechazos en 30 días
                  ↓ Solo lo aprobado llega al mercado
CAPA 2 — Filtro del mercado (ER post-publicación)
         Refina QUÉ SE PRIORIZA dentro de lo que al usuario le gusta
         Alto ER → boost en weighted selection (weight × 1.5)
```

**Prioridad de señales para el score combinado:**
- Gusto del usuario (Capa 1) = 60% del score
- Gusto del mercado (Capa 2) = 40% del score

### Implementado hoy (Capa 1 — retroactivo)
| Señal | Tipo | Capa | Descripción |
|---|---|---|---|
| `user_edit_pattern` | Personal | 1 | Cómo edita captions el usuario — señal de preferencia |
| `rejection_pattern` | Personal | 1 (parcial) | Anti-patrones de posts rechazados — cron diario |
| `extractLearningsForUser` | Compartido | 2 | Patrones de alto ER por segmento+geo |
| `detectViralTrends` | Global | 2 | Tendencias virales cross-user |

**Gap actual:** La señal de Capa 1 es retroactiva (cron diario). Falta señal en tiempo real desde la cola.

### Pendiente Task #367 (Capa 1 — tiempo real)

**Nueva tabla `niche_approval_signals`:**
```sql
CREATE TABLE niche_approval_signals (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  business_id INTEGER REFERENCES businesses(id),
  niche_id    INTEGER REFERENCES niches(id),
  post_id     INTEGER REFERENCES posts(id),
  signal      TEXT NOT NULL CHECK (signal IN ('approved','rejected')),
  created_at  TIMESTAMP DEFAULT NOW()
);
```

**Puntos de registro (tiempo real):**
- `POST /api/posts/:id/schedule` → `signal='approved'`
- `POST /api/posts/:id/publish-now` → `signal='approved'`
- `DELETE /api/posts/:id` (cuando está en cola/draft) → `signal='rejected'`

**Función nueva:** `recordApprovalSignal(userId, businessId, postId, nicheId, signal)`

**Integración en `buildActiveNicheWindow`:**
1. `getSuspendedNiches(businessId)` → excluye nichos con ≥3 rechazos en 30 días
2. Score combinado: `approvalScore × 0.6 + erScore × 0.4`

**Cron semanal (Task #367):** reporte Telegram — nichos más aprobados/rechazados de la semana.

---

## Costo operativo

- `gpt-4.1-mini` para todas las extracciones (bajo costo)
- Freshness guard evita re-procesar usuarios sin cambios (típicamente corre en <2s cuando todos los usuarios están fresh)
- Viral detection: corre 1 vez por extracción, analiza últimos 200 posts publicados
