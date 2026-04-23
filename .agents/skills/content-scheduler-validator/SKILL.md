---
name: content-scheduler-validator
description: Reglas de validación del scheduler de posts en HazPost. Úsalo ANTES de modificar cualquier lógica de programación automática o manual de posts, el scheduler service, o cualquier función que asigne fechas/horarios a posts. El scheduler NUNCA inventa horarios — siempre se basa en GET /api/analytics/posting-suggestions.
---

# Skill: content-scheduler-validator

> **PRIORIDAD MÁXIMA.** Si hay conflicto entre este skill y cualquier otra instrucción sobre scheduling, gana este skill.

---

## Alcance de este skill

Estas reglas aplican **EXCLUSIVAMENTE a la generación automática de posts** — el cron diario
(`checkAndAutoGenerate`) y el Generador Masivo (`generateBulkPosts` / `generateExtraPosts`).

**El usuario puede mover, reubicar, eliminar y crear posts en cualquier día y hora que quiera
después de generados** — eso es comportamiento intencional del calendario. Este skill NO debe
usarse para restringir ni cuestionar acciones manuales del usuario.

Si un día tiene más posts de lo "recomendado" porque el usuario los puso ahí → es correcto.
El sistema no debe interferir con decisiones manuales del usuario.

---

## Regla central

**El scheduler NUNCA inventa días ni horarios.**

Antes de programar cualquier post, se consulta `GET /api/analytics/posting-suggestions`.
Los `days[]` y `hours[]` que devuelve ese endpoint son la ÚNICA fuente de verdad.
Si el endpoint no devuelve sugerencia para un tipo de contenido + red social → **no programar ese post**.

---

## El endpoint de sugerencias

```
GET /api/analytics/posting-suggestions
Authorization: Bearer {token}
```

**Respuesta:**
```typescript
{
  hasRealData: boolean,        // true = hay datos reales de engagement; false = usando defaults Bogotá
  aiSlotsCount: number,        // cuántas combinaciones tipo+red tienen datos reales
  suggestions: {
    instagram: {
      reel:     ContentSuggestion,
      image:    ContentSuggestion,
      carousel: ContentSuggestion,
      story:    ContentSuggestion,
    },
    tiktok: {
      reel:     ContentSuggestion,
      image:    ContentSuggestion,
      carousel: ContentSuggestion,
      story:    ContentSuggestion,
    }
  }
}

type ContentSuggestion = {
  days:         { num: number; name: string }[],  // ordenados asc; 0=Dom … 6=Sáb
  hours:        string[],                          // ordenados asc; ej: ["6:00", "13:00", "18:00"]
  source:       "ai" | "default",                 // "ai" = datos reales; "default" = calibrados Bogotá
  tip:          string,                            // consejo legible para el usuario
  weeklyTarget: { min: number; max: number },     // publicaciones/semana recomendadas
}
```

**Cuándo el endpoint usa datos reales (`source = "ai"`):**
El sistema analiza los posts publicados del negocio agrupados por platform + contentType + día + hora.
Si hay al menos **3 combinaciones día/hora distintas** con datos → usa IA (engagement = likes + saves×2 + comments).
Si no alcanza ese umbral → usa defaults calibrados para audiencias de Bogotá (UTC-5).

---

## Defaults calibrados (cuando `source = "default"`)

Estos son los valores que devuelve el endpoint cuando no hay datos reales suficientes.
**No hardcodearlos** — siempre leerlos del endpoint o de `schedulingDefaults.ts` (fuente única).

Fuente de verdad: `artifacts/api-server/src/lib/schedulingDefaults.ts`

| Red | Tipo | Pool de días | Set activo (min) | Horas sugeridas | Meta semanal |
|-----|------|-------------|------------------|-----------------|--------------|
| Instagram | Reel | Dom, Mié, Vie, Sáb | **Dom, Mié** (min=2) | 6:00, 13:00, 17:00, 18:00 | 2–4 |
| Instagram | Foto | Lun, Mar, Jue | **Lun, Mar** (min=2) | 8:00, 12:00, 18:00 | 2–3 |
| Instagram | Carrusel | Jue, Vie | **Jue** (min=1) | 8:00, 12:00 | 1–2 |
| Instagram | Historia | Dom, Mar, Jue, Sáb | Dom, Mar, Jue (min=3) | 7:00, 12:00, 20:00 | 3–7 |
| TikTok | Reel | Dom, Mar, Vie, Sáb | **Dom, Mar, Vie** (min=3) | 6:00, 19:00, 21:00 | 3–7 |
| TikTok | Foto | Lun, Mié | **Lun** (min=1) | 8:00, 17:00 | 1–2 |
| TikTok | Carrusel | Mié, Jue | **Mié** (min=1) | 12:00, 18:00 | 1–2 |
| TikTok | Historia | Lun, Jue, Sáb | Lun (min=1) | 8:00, 19:00 | 1–3 |

> **Set activo** = días que el generador usa realmente con `source="default"` (primeros `min` del pool).
> Los días en negrita son los que ve el usuario en el calendario cuando no hay datos reales de engagement.
> Con `source="ai"` se usa el pool completo hasta `weeklyTarget.max`.

---

## Las 10 reglas del scheduler

### Regla 1 — Sugerencia IA es la fuente de verdad
Consultar `GET /api/analytics/posting-suggestions` **antes** de cada programación.
Si no hay sugerencia para el tipo+red → no programar ese post en esa red.

### Regla 2 — Máximo 1 publicación por tipo+red por día (IA). El usuario puede agregar sin límite.

**Regla para generación automática (IA):**
- ❌ El mismo tipo no puede repetirse el mismo día: no puede haber 2 Reels de Instagram el mismo día.
- ✅ Tipos distintos pueden coexistir el mismo día: Reel + Carrusel en lunes = correcto.
- ✅ El usuario puede agregar, mover o crear posts manualmente sin ningún límite de tipo o cantidad.

Si el slot de un tipo está ocupado → mover al siguiente día que tenga ese tipo+red en su `days[]`.

**Esta regla NO prohíbe que un día tenga múltiples posts de tipos distintos.** Lo que prohíbe
es que la IA genere el mismo tipo dos veces en el mismo día para la misma red social.

### Regla 3 — No repetir horario en la misma red el mismo día
Si ya hay un post a las 6:00 en Instagram ese día → usar el siguiente horario de la lista `hours[]`.
Si `hours[]` ya está agotada para ese día → mover al día siguiente sugerido.

### Regla 4 — Mezclar horarios entre días (no repetir patrón)
Rotar los horarios de `hours[]` entre días para evitar publicar siempre a la misma hora:
```
Día 1: hours[0], hours[2]
Día 2: hours[1], hours[3]
Día 3: hours[0], hours[2]   ← ciclo
```
Si `hours[]` tiene menos de 4 elementos, repetir el ciclo desde el índice 0.

### Regla 5 — Skip si tipo+red ya está lleno ese día
Si un día ya tiene su único post permitido para ese tipo+red → saltar a la siguiente
combinación tipo+red sugerida por el endpoint (no forzar el mismo tipo en otro horario).

### Regla 6 — No dejar días vacíos si hay sugerencias pendientes
Si un día aparece en `days[]` de una sugerencia y no está ocupado → programar.
Solo saltar el día si ya tiene el máximo de posts para todos sus tipos sugeridos.

### Regla 7 — Días y horarios son dinámicos
Re-evaluar el endpoint antes de **cada** sesión de programación.
Si la audiencia cambia, el endpoint devuelve nuevos días/horas y el scheduler debe respetarlos.
Nunca cachear los valores de días/horas entre sesiones de programación distintas.

### Regla 8 — Peso 70/30 cuando hay datos reales (`source = "ai"`)
El sistema eligió los mejores horarios para incluirlos en `hours[]` (top performers por score).
Todos los horarios de la lista son candidatos válidos, pero **no tienen igual probabilidad**:
asignar **70%** de probabilidad a un horario de la lista y repartir el **30%** restante entre los demás.
El horario "preferido" para el 70% se determina por el contexto del negocio (el que históricamente
genera más engagement en esa franja) — si no se conoce, usar el primero de la sesión de forma rotativa.

> **Nota técnica:** El endpoint devuelve `hours[]` **ordenados cronológicamente** (ej: `["6:00","13:00","18:00"]`),
> no por ranking de engagement. Todos los hours de la lista ya pasaron el filtro de top performers.
> Si en el futuro el backend devuelve un campo `rankedHours[]` con orden por score, ese campo
> toma precedencia para determinar el "mejor horario".

**Nunca abandonar el 30%**: todos los mercados/horarios deben tener cobertura mínima.

Pesos configurados en `artifacts/api-server/src/config/scheduler-config.json`:
```json
{ "bestHourWeight": 0.7, "otherHoursWeight": 0.3 }
```

### Regla 9 — Distribución equitativa cuando solo hay defaults (`source = "default"`)
Si todos los slots tienen `source = "default"` → probabilidad uniforme entre todos los `hours[]`.
No aplicar el peso 70/30 cuando no hay datos reales que respalden el mejor horario.

### Regla 10 — Checklist obligatorio antes de programar
Antes de asignar fecha/hora a cualquier post, responder internamente:

```
✅ Checklist de validación de scheduling
────────────────────────────────────────
1. Fecha evaluada:                [YYYY-MM-DD]
2. Tipo + red social:             [reel/image/carousel/story] en [instagram/tiktok]
3. ¿El endpoint devuelve sugerencia para este tipo+red?  [Sí | No → no programar]
4. ¿Ya hay post de ese tipo+red en esa fecha?            [Sí → siguiente día | No → continuar]
5. ¿El horario elegido ya está usado en esa red hoy?     [Sí → siguiente hours[] | No → continuar]
6. Source del endpoint:           [ai → usar peso 70/30 | default → distribución equitativa]
7. ¿Se puede programar?           [Sí | No — motivo]
```

---

## Algoritmo de selección de horario

```typescript
// 1. Obtener sugerencia del endpoint
const sugg = suggestions[platform][contentType]; // ContentSuggestion
if (!sugg) return; // ← Regla 1: sin sugerencia → no programar

// 2. Verificar disponibilidad del día
const day = nextAvailableDay(sugg.days, existingPostsForTypeAndPlatform); // ← Regla 2

// 3. Seleccionar horario
const availableHours = sugg.hours.filter(h => !usedHoursThisDayAndPlatform.has(h)); // ← Regla 3
if (availableHours.length === 0) return moveToNextDay();

// 4. Aplicar peso 70/30 o equitativo según source
const hour = sugg.source === "ai"
  ? weightedPick(availableHours, config.optimization.bestHourWeight)  // ← Regla 8
  : uniformPick(availableHours);                                        // ← Regla 9

// 5. Rotar índice para el día siguiente (← Regla 4)
rotationIndex = (rotationIndex + 1) % sugg.hours.length;
```

---

## Configuración central

**Archivo:** `artifacts/api-server/src/config/scheduler-config.json`

```json
{
  "optimization": {
    "bestHourWeight": 0.7,
    "otherHoursWeight": 0.3,
    "minCoverageOtherMarkets": true
  },
  "dynamicRules": {
    "allowDaysChange": true,
    "allowHoursChange": true
  }
}
```

**Cómo actualizar los pesos:**
1. Cambiar `bestHourWeight` / `otherHoursWeight` en el JSON.
2. Actualizar la sección "Regla 8" de este skill con los nuevos valores.
Solo esos 2 archivos necesitan cambio — ningún otro archivo hardcodea los pesos.

---

## Relación con otros skills

| Skill | Relación |
|-------|----------|
| `niche-rotation-rules` | Decide QUÉ tema/nicho se publica. Este skill decide CUÁNDO. Complementarios, no se solapan. |
| `publicacion-plataformas` | Decide EN QUÉ plataformas se publica (resolución de platform). Este skill decide el horario dentro de esas plataformas. |
| `social-caption-limits` | Límites de caracteres por plataforma. No afecta el scheduling. |

---

## Anti-patrones prohibidos

### ❌ Hardcodear días u horas sin consultar el endpoint
```typescript
// ❌ PROHIBIDO — los horarios hardcodeados ignoran el engagement real del negocio
const scheduledAt = setHours(nextMonday, 18); // ← ¿de dónde salió el 18?

// ✅ CORRECTO — leer del endpoint
const sugg = await fetchPostingSuggestions(); // GET /api/analytics/posting-suggestions
const hour = pickHour(sugg.instagram.reel.hours, sugg.instagram.reel.source);
```

### ❌ Programar sin verificar si ya hay post del mismo tipo+red ese día
```typescript
// ❌ PROHIBIDO — puede crear 2 Reels de Instagram el mismo día
await schedulePost({ type: "reel", platform: "instagram", date: "2026-04-21 18:00" });

// ✅ CORRECTO — verificar primero
const alreadyScheduled = await hasPostOfTypeAndPlatform("reel", "instagram", "2026-04-21");
if (alreadyScheduled) moveToNextAvailableDay();
```

### ❌ Aplicar 70/30 cuando no hay datos reales
```typescript
// ❌ PROHIBIDO — source="default" no tiene datos que respalden un "mejor" horario
if (sugg.source === "default") applyWeightedPick(hours, 0.7); // sin respaldo empírico

// ✅ CORRECTO — solo aplicar 70/30 cuando source="ai"
const hour = sugg.source === "ai" ? weightedPick(hours, 0.7) : uniformPick(hours);
```

### ❌ Cachear las sugerencias entre sesiones de programación
```typescript
// ❌ PROHIBIDO — la audiencia cambia; los días/horas óptimos pueden cambiar
const cachedSuggestions = localStorage.getItem("posting_suggestions"); // stale data

// ✅ CORRECTO — fetch fresco antes de cada sesión de programación
const suggestions = await fetch("/api/analytics/posting-suggestions");
```

---

## Arquitectura centralizada de defaults (Task #383)

Los defaults de días/horas por plataforma+tipo viven en **un único archivo**:

```
artifacts/api-server/src/lib/schedulingDefaults.ts
```

Dos funciones exportadas:

| Función | Devuelve | Usado por |
|---------|----------|-----------|
| `getSchedulingDefaults()` | `SchedulingDefaults` — incluye `tip` y `weeklyTarget` | `analytics.ts` → endpoint `/posting-suggestions` |
| `getSchedulingDefaultsSimple()` | `Record<string, Record<string, { days, hours }>>` | `ai.service.ts` → `DEFAULT_CT_SCHEDULE` (alias) |

**Regla de modificación:** Si cambias los días u horas por defecto, editar **SOLO** `schedulingDefaults.ts`.  
No modificar los defaults directamente en `ai.service.ts` ni en `analytics.ts` — ambos leen del módulo central.

---

## Timing de los cron jobs del scheduler

| Cron | Bogotá | Función |
|------|--------|---------|
| `*/5 * * * *` | Cada 5 min | `publishScheduledPosts()` — publica posts cuya hora llegó |
| `0 6 * * *` | 06:00 | `checkAndAutoGenerate()` — genera contenido si hay pocos posts |
| `0 10,14,18,22 * * *` | 10:00, 14:00, 18:00, 22:00 | `checkDailyGapsAndFill()` — rellena días vacíos en próximas 48h |
| `0 7 */3 * *` | 07:00 c/3 días | `syncPublishedPostMetrics()` — sincroniza métricas de IG |
| `30 8 1,16 * *` | 08:30 días 1 y 16 | Refresh audience snapshot de Instagram |
| `0 10 * * *` | 10:00 | Learning extraction (freshness guard) |
| `0 8 * * *` | 08:00 | Pre-warm TRM |
| `0 11 * * *` | 11:00 | Meta token renewal |
| `0 2 * * *` | 02:00 | Trash purge |
| `0 1 * * *` | 01:00 | Subscription expiry check |

### Ventana timezone-aware en `generateBulkPosts` y `checkDailyGapsAndFill` (Task #385)

**Problema resuelto:** `windowEnd.setHours(23,59,59,999)` era UTC, no la timezone del usuario.  
Posts a las 8 PM Bogotá (= 1 AM UTC del día siguiente) quedaban **fuera** del `windowEnd` → el mapa de ocupación no los veía → el generador creaba un post duplicado.

**Corrección implementada:**
```typescript
// ai.service.ts — generateBulkPosts()
// ❌ ANTES (UTC crudo):
const windowStart = new Date(); windowStart.setHours(0, 0, 0, 0);
const windowEnd = new Date(windowStart); windowEnd.setHours(23, 59, 59, 999);

// ✅ AHORA (timezone del usuario):
const windowStart = startOfDayInTimezone(refNow, userTimezone);
const windowEnd   = new Date(
  startOfDayInTimezone(new Date(windowStart.getTime() + (days + 1) * 24 * 3_600_000), userTimezone).getTime() - 1,
);
```

```typescript
// scheduler.service.ts — checkDailyGapsAndFill() — DENTRO del loop de negocios:
// ❌ ANTES (Bogotá hardcodeado, calculado UNA VEZ fuera del loop):
const bogotaOffsetMs = BOGOTA_UTC_OFFSET_H * 3_600_000;
const day1Start = mkBogotaMidnight(1); // siempre UTC-5, sin importar el timezone del usuario

// ✅ AHORA (por negocio, timezone real):
const bizTz    = resolveUserTimezone(biz);
const todayStart = startOfDayInTimezone(now, bizTz);
const day1Start  = startOfDayInTimezone(new Date(todayStart.getTime() + 25 * 3_600_000), bizTz);
const day2Start  = startOfDayInTimezone(new Date(day1Start.getTime()  + 25 * 3_600_000), bizTz);
const day3Start  = startOfDayInTimezone(new Date(day2Start.getTime()  + 25 * 3_600_000), bizTz);
// (+25h como margen para cambios de DST)
```

**Regla para el futuro:** Cualquier comparación de ventana de día DEBE usar `startOfDayInTimezone(date, tz)` desde `lib/timezone.ts`. Nunca usar `setHours(0,0,0,0)` en código que opere sobre posts de usuarios.

### Race condition guard en `checkDailyGapsAndFill`

`checkDailyGapsAndFill` usa semántica de **completion** (no de inicio) para detectar
solapamiento con el auto-gen:

- `lastAutoGenCompletedAt` se setea en el bloque `finally` de `checkAndAutoGenerate()`,
  es decir, cuando el job **terminó** (éxito o error) y los posts ya están en DB.
- Si el gap filler detecta que el auto-gen **completó hace menos de 1 hora**, salta.
- El cron `0 10,14,18,22 * * *` garantiza que el primer run del día (10:00) esté
  siempre al menos 3 horas después del auto-gen (06:00), eliminando el solapamiento
  sin depender del guard. El guard es solo un safety net para reinicios del servidor.

```typescript
// En scheduler.service.ts
let lastAutoGenCompletedAt: Date | null = null;

// checkAndAutoGenerate() — bloque finally (siempre ejecuta al terminar):
} finally {
  lastAutoGenCompletedAt = new Date();
}

// checkDailyGapsAndFill() — guard al inicio:
if (lastAutoGenCompletedAt && Date.now() - lastAutoGenCompletedAt.getTime() < 3600 * 1000) {
  logger.info("[GapFill] Skipping — completion guard (< 1h since auto-gen finished)");
  return;
}
```

---

## Regla 11 — Límite semanal centralizado: pre-filtro de días con `getWeeklySlots`

> **Vinculante para todos los caminos de generación: `generateBulkPosts`, `generateExtraPosts`.**

### Origen y función centralizada

El límite semanal de posts por `(platform, contentType)` se implementa mediante un **pre-filtro de días**
en la función:

```typescript
// artifacts/api-server/src/lib/postingSchedule.ts
export function getWeeklySlots(
  ctSchedule: Record<string, Record<string, { days: number[]; hours: number[]; source?: string; weeklyTarget?: { min: number; max: number } }>>,
  platform: string,
  ct: string,
): Set<number>; // días-de-semana (0=Dom..6=Sáb) que son VÁLIDOS para generar
```

**`getWeeklySlots` es la ÚNICA función que determina qué días son válidos por semana.**
Devuelve los **primeros N días del pool** según el `weeklyTarget`:

| `source` del ctSchedule | N días del pool | Razonamiento |
|-------------------------|-----------------|--------------|
| `"ai"`      | `weeklyTarget.max` | Datos reales respaldan esa frecuencia máxima |
| `"default"` | `weeklyTarget.min` | Sin datos → conservador para no saturar la audiencia |
| sin `weeklyTarget` (DEFAULT_CT_SCHEDULE) | `schedulingDefaults.min` | Igual que "default" |

> **Ejemplo:** pool = `[1, 3, 5]` (Lun, Mié, Vie), `weeklyTarget.min = 2`, `source = "default"`
> → `getWeeklySlots` devuelve `Set{1, 3}` — solo Lunes y Miércoles son válidos.
> El generador producirá MÁXIMO 2 posts por semana para ese tipo, automáticamente,
> sin necesidad de contadores.

### Valores de defaults (schedulingDefaults.ts)

| platform | contentType | min/semana | max/semana |
|----------|-------------|-----------|-----------|
| instagram | reel     | 2 | 4 |
| instagram | image    | 2 | 3 |
| instagram | carousel | 1 | 2 |
| instagram | story    | 3 | 7 |
| tiktok   | reel      | 3 | 7 |
| tiktok   | image     | 1 | 2 |
| tiktok   | carousel  | 1 | 2 |
| tiktok   | story     | 1 | 3 |

### Implementación en los loops de generación

Cada loop de generación (feed y story, en modos "both" y single-platform) debe:

1. **Antes del loop de días:** pre-calcular los días válidos UNA VEZ por tipo:
   ```typescript
   const validDaysByType = new Map<string, Set<number>>();
   for (const ct of feedCts) validDaysByType.set(ct, getWeeklySlots(ctSchedule, platform, ct));
   const storyValidDays = getWeeklySlots(ctSchedule, platform, "story");
   ```
2. **Dentro del loop:** reemplazar `ctSched.days.includes(dow)` con el pre-filtro:
   ```typescript
   if (!validDaysByType.get(contentType)?.has(dow)) continue; // ← reemplaza days.includes + contador
   ```
3. **No se necesitan contadores** (`existWeekCount`, `inRunWeekCount`) — el pre-filtro garantiza
   el límite automáticamente: si solo hay 2 días válidos en la semana, máximo 2 posts se pueden generar.

### Para `findNextDay` (modo "both" stories)

Pasar el Set de días válidos como `validDaysOverride`:
```typescript
const igStoryValidDays = getWeeklySlots(ctSchedule, "instagram", "story");
findNextDay("instagram", ..., "story", usedHoursPerDay, igStoryValidDays);
```

### Comportamiento para el usuario

- Si solicita **20 posts para los próximos 30 días**, el sistema los distribuye en múltiples semanas, cada una respetando el límite por tipo.
- Si una semana ya tiene posts en los días válidos, el loop avanza a la siguiente semana de forma natural (los días válidos del pool son los mismos cada semana).
- `generateExtraPosts` también respeta los límites — incluye `getWeeklySlots` para single-platform (previamente sin límite).

### Anti-patrones prohibidos

```typescript
// ❌ PROHIBIDO — usar días sin pre-filtrar (puede generar más del máximo por semana)
if (ctSchedule.instagram.reel.days.includes(dow)) generatePost();

// ❌ PROHIBIDO — contadores manuales post-hoc
const weekLimit = getWeeklyPostLimit(ctSchedule, platform, contentType); // deprecated
if (existWeekCount + inRunWeekCount >= weekLimit) continue;

// ❌ PROHIBIDO — hardcodear límite semanal
const maxPerWeek = 3;
if (weekCount >= maxPerWeek) continue;

// ✅ CORRECTO — pre-filtro con getWeeklySlots() de postingSchedule.ts
const validDays = getWeeklySlots(ctSchedule, platform, contentType);
if (!validDays.has(dow)) continue; // límite semanal garantizado por restricción de días
```

---

## Regla 12 — Expansión de platform="both" en el análisis IA + Defaults sin solapamiento

> **Vinculante para `fetchPostingSuggestionsInternal` y cualquier función que analice engagement.**

### El problema: platform="both" invisible al análisis IA

Los posts generados con plataforma dual tienen `platform="both"` en la DB. Si la función de análisis
agrupa directamente por `postsTable.platform`, estos posts caen bajo la key `"both"` — que no
coincide con "instagram" ni "tiktok". Resultado: `source="default"` perpetuo aunque el usuario
tenga docenas de posts publicados.

**Síntoma observable**: El panel de Sugerencias IA siempre muestra la misma distribución de días
(los defaults), sin importar cuántos posts se hayan publicado.

### La regla: expansión obligatoria

En **toda** función que agrupe posts por plataforma para análisis de engagement:

**`platform="both"` debe expandirse a AMBAS plataformas — "instagram" Y "tiktok".**

```typescript
// ✅ CORRECTO — Regla 12: expansión en el loop de agrupación
for (const row of realData) {
  const plats = row.platform === "both"
    ? ["instagram", "tiktok"]
    : [row.platform ?? "instagram"];
  const ct = row.contentType ?? "image";
  for (const plat of plats) {
    if (!observed[plat])     observed[plat] = {};
    if (!observed[plat][ct]) observed[plat][ct] = [];
    observed[plat][ct].push({ day: row.dayOfWeek, hour: row.hour, score: row.totalScore, count: row.postCount });
  }
}

// ❌ PROHIBIDO — agrupación directa sin expansión
const plat = row.platform ?? "instagram"; // "both" nunca llega a "instagram" ni "tiktok"
observed[plat][ct].push(slot);
```

### Umbral de activación IA

El mínimo de slots distintos para activar `source="ai"` es **`MIN_SLOTS_FOR_AI = 2`**
(2 combinaciones distintas de día+hora publicadas para ese platform+contentType).
Con MIN=3 muchos usuarios con pocos posts publicados nunca activarían la IA.

### Regla complementaria — Defaults sin solapamiento entre tipos feed

> **La exclusividad aplica al SET ACTIVO** (los primeros `weeklyTarget.min` días del pool que
> `getWeeklySlots` selecciona), **no al pool completo**. El pool puede contener más días
> como reserva para cuando source="ai" o para futuros ajustes, pero los primeros `min` días
> de diferentes tipos NO deben coincidir.

**¿Por qué?** `getWeeklySlots(ctSchedule, platform, ct)` toma los primeros `weeklyTarget.min`
días del array ordenado del pool. Si reel y carousel tienen el mismo día en su posición ≤ min,
ese día queda activo para ambos → el usuario recibe 2 tipos de feed distintos el mismo día,
percibido como "repite tipos".

**Distribución activa (source="default") para Instagram:**

| Tipo | Pool completo | min | Set activo | Días exclusivos |
|------|--------------|-----|------------|-----------------|
| reel | [0,3,5,6] | 2 | {0,3} | Dom + Mié |
| image | [1,2,4] | 2 | {1,2} | Lun + Mar |
| carousel | [4,5] | 1 | {4} | Jue |

> Nota: `image[4]=Jue` y `carousel[4]=Jue` comparten en el pool pero NO en el Set activo
> (image usa {1,2} con min=2; carousel usa {4} con min=1). Safe en la configuración actual.
> Si `min` de image sube a 3, Jue entraría en ambos sets → eso está prohibido.

**Distribución activa (source="default") para TikTok:**

| Tipo | Pool completo | min | Set activo | Días exclusivos |
|------|--------------|-----|------------|-----------------|
| reel | [0,2,5,6] | 3 | {0,2,5} | Dom + Mar + Vie |
| image | [1,3] | 1 | {1} | Lun |
| carousel | [3,4] | 1 | {3} | Mié |

**Invariante que debe mantenerse siempre:**
```
Para toda pareja (tipoA, tipoB) de tipos feed distintos de la misma plataforma:
  Set_activo(tipoA) ∩ Set_activo(tipoB) = ∅
```

> ⚠️ Este invariante es de **configuración de defaults**, NO una restricción en tiempo de ejecución.
> El generador NO impide que un día tenga reel + carousel (eso está permitido — Regla 2).
> Lo que evita Regla 12 es que los defaults queden configurados de forma que la IA
> *automáticamente* genere múltiples tipos distintos el mismo día (sin que el usuario lo pidiera).

**Excepción**: Cuando `source="ai"`, los días vienen del engagement real del usuario
→ puede haber solapamiento natural. Solo los defaults deben satisfacer este invariante.
Las stories sí pueden coincidir con días feed (son publicaciones independientes).

### Alcance de Regla 12

Esta regla aplica **solo a la configuración** de:
- `schedulingDefaults.ts` al definir o modificar los pools de días por tipo
- `fetchPostingSuggestionsInternal` en `postingSchedule.ts` (fuente central)
- Cualquier endpoint de analytics que desglose métricas por plataforma

---

## Guard: máximo 1 post por tipo+red por día (implementación en código)

El guard de Regla 2 está implementado en **4 ubicaciones** dentro de `ai.service.ts`.
No modificar la lógica — solo los comentarios si se actualizan.

| Ubicación | Función | Guard |
|-----------|---------|-------|
| `ai.service.ts:5629-5630` | `generateBulkPosts` — modo both (Instagram+TikTok) | `igExistByType.get(ct)?.has(dayKey)` (en DB) y `igInRunByType.get(ct)?.has(dayKey)` (en ejecución) |
| `ai.service.ts:5990` | `generateBulkPosts` — modo single-platform | `existingByType.get(ct)?.has(dayKey)` (en DB; sin inRun porque el loop visita cada día una vez) |
| `ai.service.ts:6451` | `generateExtraPosts` — modo both | `igUsedByType.get(ct)?.has(dayKey)` |
| `ai.service.ts:6689` | `generateExtraPosts` — modo single-platform | `existingByType.get(ct)?.has(dayKey)` (en DB; previo filtro `extraSpValidDaysByType`) |

**Comentario uniforme en el código:**
```typescript
// Guard IA: max 1 post del mismo tipo por día. Tipos distintos el mismo día son válidos (Regla 2).
```

---

## Estados de post que ocupan (o liberan) el espacio del calendario

El scheduler usa **Retry-first**: un post que falla NO libera inmediatamente el espacio.
Se reintenta hasta `MAX_PUBLISH_RETRIES = 3` veces (con 30 min de espera entre intentos)
antes de marcarse como `failed`. Solo en ese momento el espacio queda libre para la IA.

| Estado | Efecto en el calendario |
|--------|------------------------|
| `pending_approval` — pendiente de aprobación | 🔴 **Ocupado** |
| `approved` — aprobado | 🔴 **Ocupado** |
| `scheduled` — programado (incluye reintentos en curso) | 🔴 **Ocupado** |
| `published` — publicado | 🔴 **Ocupado** |
| `draft` — borrador | 🔴 **Ocupado** |
| `failed` — fallido (reintentos agotados) | 🟢 **Libre** — la IA puede generar nuevo contenido |
| (sin post) | 🟢 **Libre** |

> **Retry-first:** un post que falla en la publicación queda en `status="scheduled"` con
> `scheduled_at = ahora + 30 min`. El scheduler lo reintenta automáticamente. Solo después
> de 3 intentos fallidos pasa a `status="failed"` y el espacio queda disponible para nueva generación.

### Flujo completo de un post que falla

```
Intento 1 (hora original) → falla → status="scheduled", publish_retries=1, scheduled_at+=30min
Intento 2 (+30 min)       → falla → status="scheduled", publish_retries=2, scheduled_at+=30min
Intento 3 (+60 min)       → falla → status="failed",    publish_retries=3  ← espacio libre
                                   → la IA puede generar nuevo post para ese slot
```

### Fallas permanentes (NO se reintentan)

Algunas fallas son de configuración, no transitorias, y se marcan como `failed` inmediatamente
sin consumir reintentos:

| Error | Por qué no se reintenta |
|-------|------------------------|
| Sin cuentas sociales conectadas | Requiere acción del usuario (conectar cuenta) |
| `[ISOLATION_GUARD]` businessId=null | Error de integridad — no hay cuenta que usar |
| `[ISOLATION_GUARD]` sin cuenta IG activa | Usuario no tiene IG conectado para este negocio |
| `[ISOLATION_GUARD]` VM-3 contaminación | Dos negocios comparten la misma página — configuración incorrecta |

### Implementación en código

**Constantes (`scheduler.service.ts`):**
```typescript
const MAX_PUBLISH_RETRIES = 3;      // intentos totales (1 original + 2 reintentos)
const RETRY_DELAY_MS      = 30 * 60 * 1000; // 30 min entre reintentos
```

**Columna en DB:** `posts.publish_retries` (integer, default 0) — contador de reintentos.

**Query de ocupación en las 4 ubicaciones de ai.service.ts:**
```typescript
inArray(postsTable.status, ["draft", "pending_approval", "approved", "scheduled", "published"])
// "failed" ausente → espacio libre para la IA
```

| Línea | Función |
|-------|---------|
| `ai.service.ts:5520` | `generateBulkPosts` — modo both (Instagram+TikTok) |
| `ai.service.ts:5950` | `generateBulkPosts` — modo single-platform |
| `ai.service.ts:6407` | `generateExtraPosts` — modo both |
| `ai.service.ts:6633` | `generateExtraPosts` — modo single-platform |

**Guards per-plataforma en `publishScheduledPosts` (`scheduler.service.ts`):**
```typescript
// Permite hasta MAX_PUBLISH_RETRIES intentos antes de bloquear el slot.
sql`(SELECT COUNT(*) FROM publish_log WHERE post_id = ... AND platform = 'instagram' AND status = 'failed') < ${MAX_PUBLISH_RETRIES}`
```

**Regla de consistencia:** Si se agrega un nuevo estado al schema, evaluar si debe incluirse
en el array de ocupación de la IA. Por defecto, todo estado que representa "el usuario tiene
intención de publicar" debe bloquear el espacio.

---

## Archivos clave

| Archivo | Función relevante |
|---------|-----------------|
| `artifacts/api-server/src/lib/schedulingDefaults.ts` | **ÚNICO lugar** con los defaults de días/horas por plataforma+tipo |
| `artifacts/api-server/src/lib/platformDates.ts` | `getEffectiveDateForPlatform`, `buildOccupationMap`, `bogotaDayKey` |
| `artifacts/api-server/src/lib/postingSchedule.ts` | **Fuente única compartida**: `fetchPostingSuggestionsInternal()` (endpoint) y `fetchSchedulerSuggestions()` (scheduler+auto-gen). Devuelve `source: "ai"\|"default"` por entrada. |
| `artifacts/api-server/src/routes/social/analytics.ts` | Endpoint `GET /posting-suggestions` — delega a `fetchPostingSuggestionsInternal()` |
| `artifacts/social-dashboard/src/components/AIPostingSuggestionsPanel.tsx` | Panel visual de sugerencias en la Parrilla de Contenido |
| `artifacts/api-server/src/services/scheduler.service.ts` | `publishPost()`, `publishScheduledPosts()`, `checkAndAutoGenerate()`, `checkDailyGapsAndFill()` |
| `artifacts/api-server/src/services/ai.service.ts` | `DEFAULT_CT_SCHEDULE`, `weightedPick()`, `pickHour()` (Reglas 8/9), `BEST_HOUR_WEIGHT = 0.7`. Ambos `generateBulkPosts` y `generateExtraPosts` llaman `fetchSchedulerSuggestions()`. |
| `artifacts/api-server/src/config/scheduler-config.json` | Pesos 70/30 (`bestHourWeight`) — valor espejado en `BEST_HOUR_WEIGHT` de `ai.service.ts` (actualizar ambos si se cambia) |

### Cómo agregar una nueva red social

1. Agregar columna `scheduled_at_<red>` en `lib/db/src/schema/posts.ts`
2. Agregar `case "<red>"` en `getEffectiveDateForPlatform` de `platformDates.ts`
3. Agregar la nueva red en `schedulingDefaults.ts` (tanto `getSchedulingDefaults` como `getSchedulingDefaultsSimple`)
4. Nada más — `buildOccupationMap` y todos los paths de `generateBulkPosts`/`generateExtraPosts`
   funcionan automáticamente para la nueva plataforma.
