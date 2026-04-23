# Skill: Massive Post Generator v2.0

> Referencia maestra del motor de generación masiva de posts en HazPost.  
> Usa este skill ANTES de modificar `ai.service.ts`, `scheduler.service.ts` o cualquier lógica que afecte generación en bulk, diversidad visual o rotación de nichos.  
> Complementa (no reemplaza) los skills específicos referenciados en cada regla.

---

## Filosofía central

**"Un click y ven cosas totalmente nuevas"**

Cada vez que un usuario genera posts, debe obtener:
1. Imágenes que representan visualmente el CONTENIDO del post (no la industria genérica)
2. Posts con nichos distintos entre sí dentro del batch
3. Estilos visuales distintos entre posts (iluminación, encuadre, mood)
4. Captions con hooks distintos (estilos rotativos, anti-repetición)

Esto aplica para TODOS los usuarios, sin excepción.

---

## Regla 1: Imagen basada en contenido (driver primario)

### Principio
El título y el texto del post son la **directiva PRIMARIA** de DALL-E.  
La industria/nicho del negocio es el **contexto secundario** (estilo fotográfico, tipo de personaje).

### Por qué esto importa
**Error previo (hasta v1.0):** La escena de industria (100+ palabras) iba PRIMERO en el prompt.  
DALL-E sigue lo que viene primero → todas las imágenes salían estilo "marketing agency" sin importar el texto.

**Fix v2.0:** El captionHook + captionBody lideran el prompt con la etiqueta `Visual topic (PRIMARY directive)`.  
La escena de industria va al final con la etiqueta `Character and setting reference (secondary context)`.

### Estructura del prompt (paths 1c y 2c — regla universal)

```
Si captionHook existe:
  "Visual topic (PRIMARY directive): "{captionHook}". Content context: "{captionBody}".
   The image MUST visually depict this specific topic above all else.
   Character and setting reference (secondary context — use for photographic style and character type only):
   {industryScene}."

Si NO hay captionHook (fallback):
  "{industryScene}. Post topic: "{nicheHint}" — visually reflect this theme."
```

### Paths en ai.service.ts (aprox. línea 4500–4580)
- **Path 1c**: `industryScene` detectado por `deriveBusinessIndustryScene()`
- **Path 2c**: niche fallback vía `deriveNicheScene()`
- **Universal**: solar/batchRefStyle — mismo principio sobre `enrichedSceneDesc`

### Referencias
- `content-freshness-concordance` → Dimensión 3 (concordancia imagen-texto)
- `image-business-concordance` → diagnóstico cuando imagen no concuerda con negocio
- `title-post-concordance` → diagnóstico cuando el título del overlay no concuerda

---

## Regla 2: Rotación de nichos (ventana activa)

### Parámetros actuales (v2.0)
| Parámetro | Valor | Archivo |
|---|---|---|
| MAX_GAP | **15 días** | `ai.service.ts` L~1861 en `getAdaptiveTopicGapDays` |
| Ventana activa | 7 nichos por ventana de 15 días | `buildActiveNicheWindow` |
| Gap mínimo | 1 día | clamped en `getAdaptiveTopicGapDays` |
| Gap máximo | min(activeWindowSize, MAX_GAP) | = 7 si hay 7 nichos activos |

### Reglas de la ventana
1. El mismo nicho no se repite antes de `MAX_GAP` días
2. Si el usuario tiene menos de 15 nichos activos: gap = cantidad de nichos activos
3. Nichos con alto ER pueden repetir dentro de la ventana (ponderado)
4. Máximo 7 nichos en la ventana activa en cualquier punto del tiempo

### Weighted selection dentro de la ventana
- Base: todos los nichos elegibles (fuera del gap)
- Boost: nichos con `avg_er > umbral` → weight × 1.5
- Normalización: suma de pesos = 1.0

### Suspensión de nichos (Capa 1 — pendiente Task #367)
Un nicho con ≥ 3 rechazos en cola en 30 días → suspendido automáticamente 30 días.

### Referencias
- `niche-rotation-rules` → reglas detalladas + `buildActiveNicheWindow` + `getAdaptiveTopicGapDays`

---

## Regla 3: Variedad visual y textual

### 3.1 Diversidad de caption
- 10 `CAROUSEL_HOOK_STYLES` que rotan por sceneIdx
- Anti-repetición: `isTooSimilar()` compara contra últimos 15 hooks generados
- Lookback de 60 posts para evitar repetición de temas recientes

### 3.2 Diversidad de escena
- `NICHE_SCENE_ENTRIES`: 4–10 variantes por industria, rotadas por `sceneIdx`
- `batchSceneOffset`: cada batch usa un offset diferente → posts distintos entre batches
- `sceneIdx = (postIndex + batchSceneOffset) % totalScenes`

### 3.3 Diversidad de iluminación y encuadre
10 `SCENE_MOODS` en ai.service.ts (aprox. L4560–4575):
```
0: golden morning light from large windows
1: clean bright midday daylight
2: warm afternoon ambient light
3: cool professional studio lighting
4: cozy warm tungsten lighting
5: bright airy white studio light
6: dramatic window side light
7: wide establishing shot
8: close-up intimate framing
9: overcast diffused light
```
Se aplican como: `sceneIdx % SCENE_MOODS.length` → multiplicador primo asegura que no haya patrones.

### 3.4 Anti-patrones prohibidos
- ❌ Todos los posts del batch con la misma escena de fondo
- ❌ La misma iluminación más de 2 veces en un batch de 5
- ❌ La misma composición (close-up + golden morning) más de 1 vez en el batch
- ❌ Caption hooks que comienzan con la misma palabra 2 veces seguidas

### Referencias
- `caption-diversity-rules` → estilos de hooks + `isTooSimilar()`
- `content-freshness-concordance` → `batchSceneOffset`, `SCENE_MOODS`, anti-patrones

---

## Regla 4: Aprendizaje y personalización (2 capas)

### Arquitectura de 2 capas (en secuencia, no en paralelo)

```
CAPA 1 — Filtro de gusto del usuario (cola de aprobación)
         Decides QUÉ SE GENERA en el futuro
         Aprobado (+10 puntos) → crear más de este nicho/estilo
         Rechazado (−5 puntos) → crear menos; suspender si ≥3 rechazos en 30 días
                  ↓
         Solo lo que pasó Capa 1 se publica y recibe métricas reales
                  ↓
CAPA 2 — Filtro del mercado (ER post-publicación)
         Refina QUÉ SE PRIORIZA dentro de lo que al usuario le gusta
         Alto ER → boost en weighted selection (weight × 1.5)
         Bajo ER → peso base (sin penalización — el usuario ya lo aprobó)
```

**Prioridad de señales:**
- Gusto del usuario (Capa 1) = 60% del score combinado
- Gusto del mercado (Capa 2) = 40% del score combinado

### Implementado hoy (v2.0)
| Mecanismo | Capa | Descripción | Archivo |
|---|---|---|---|
| `user_edit_pattern` | 1 | Aprende cómo edita captions el usuario | `learning.service.ts` |
| `rejection_pattern` | 1 (parcial) | Aprende qué posts rechaza → evita en generaciones | `learning.service.ts` |
| `extractLearningsForUser` | 2 | Patrones de alto ER por segmento | `learning.service.ts` |
| `detectViralTrends` | 2 | Tendencias cross-user de alto ER | `learning.service.ts` |
| Daily cron 10:00 Bogotá | — | `runLearningExtraction()` para todos los usuarios activos | `scheduler.service.ts` |

### Gap actual (pendiente Task #367)
La señal de Capa 1 actual es **retroactiva** (cron diario sobre posts ya procesados).  
Falta: señal en **tiempo real** cuando el usuario aprueba/rechaza en la cola.

**Pendiente (Task #367 — Feedback loop 2 capas):**
- Nueva tabla `niche_approval_signals` con campos: `user_id`, `business_id`, `niche_id`, `post_id`, `signal (approved|rejected)`, `created_at`
- `recordApprovalSignal()` llamada en tiempo real desde `/api/posts/:id/schedule` y `DELETE /api/posts/:id`
- `getSuspendedNiches(businessId)` → excluye nichos con ≥3 rechazos en 30 días de `buildActiveNicheWindow`
- Score combinado en `buildActiveNicheWindow`: `approvalScore × 0.6 + erScore × 0.4`
- Cron semanal: reporte de nichos más aprobados/rechazados → Telegram

### Referencias
- `ai-learning-engine` → implementación de learning, señales retroactivas, ER patterns
- Task #367 → implementación de la señal en tiempo real y score combinado

---

## Regla 5: Calidad — cada post es único

### Definición de "único"
Un post es único si:
1. Su imagen representa visualmente su contenido específico (no la industria genérica)
2. Su caption hook es distinto a los últimos 15 hooks del negocio
3. Su combinación de escena + iluminación + encuadre no se repite en el mismo batch
4. Su nicho no se repitió antes de `MAX_GAP` días

### Validación en producción
Cuando un usuario reporta imágenes visualmente idénticas en un batch:
1. Verificar `sceneIdx` de cada post — deben ser distintos
2. Verificar `batchSceneOffset` — debe cambiar entre batches
3. Verificar que `captionHook` es distinto y no vacío en cada post
4. Verificar que `deriveBusinessIndustryScene()` retorna la industria correcta (no "marketing")
5. Verificar orden del prompt en `nicheSpecificScene` — topic debe ser `PRIMARY directive`

---

## Archivos clave

| Archivo | Función |
|---|---|
| `artifacts/api-server/src/services/ai.service.ts` | Motor principal: generación de imágenes, prompts DALL-E, `buildActiveNicheWindow`, `getAdaptiveTopicGapDays`, `SCENE_MOODS` |
| `artifacts/api-server/src/services/learning.service.ts` | Learning engine: extracción de patrones, rejection signals, ER analysis |
| `artifacts/api-server/src/services/scheduler.service.ts` | Crons: generación automática, daily learning extraction, reporte semanal (Task #367) |
| `artifacts/api-server/src/routes/posts.ts` | Endpoints: schedule, delete (puntos donde registrar approval signals en Task #367) |

---

## Regla 6: Ventana de generación es timezone-aware (Task #385)

### El bug que había

La ventana de ocupación (`windowStart`/`windowEnd`) se calculaba en UTC crudo:
```typescript
// ❌ ANTES — daba UTC midnight, no la medianoche del usuario
const windowStart = new Date(); windowStart.setHours(0, 0, 0, 0);
const windowEnd = new Date(windowStart); windowEnd.setHours(23, 59, 59, 999);
```

Un post de las 8 PM Bogotá = 1:00 AM UTC del día siguiente.  
`windowEnd` en UTC era las 23:59 UTC → ese post quedaba **fuera** → no se veía en el mapa de ocupación → el generador lo recreaba → **duplicado**.

### El fix

```typescript
// ✅ AHORA — medianoche real en el timezone del usuario
const windowStart = startOfDayInTimezone(refNow, userTimezone);
const windowEnd   = new Date(
  startOfDayInTimezone(new Date(windowStart.getTime() + (days + 1) * 24 * 3_600_000), userTimezone).getTime() - 1,
);
```

### Regla permanente

❌ NUNCA calcular `windowStart` con `setHours(0,0,0,0)` — es UTC, no la hora local del usuario.  
✅ SIEMPRE usar `startOfDayInTimezone(now, userTimezone)` de `lib/timezone.ts`.  
✅ `windowEnd = startOfDayInTimezone(windowStart + (days+1)*24h, userTimezone) - 1ms` — cubre la noche completa del último día local.

---

## Historial de versiones

| Versión | Cambio |
|---|---|
| v1.0 | Industria primero en prompt DALL-E → imágenes genéricas tipo "marketing agency" |
| v2.0 | Topic-FIRST en paths 1c/2c/universal + MAX_GAP 7→15 + arquitectura de 2 capas documentada |
| v2.1 | Ventana timezone-aware: windowStart/windowEnd usan startOfDayInTimezone() (Task #385) |
