---
name: niche-rotation-rules
description: Reglas del sistema de rotación de nichos en HazPost. Úsalo ANTES de modificar la selección de nichos en generación automática (generateBulkPosts, generateExtraPosts), la función buildActiveNicheWindow, getAdaptiveTopicGapDays, o cualquier lógica que decida cuándo y cuántas veces aparece cada nicho. Cubre la ventana de 7 nichos, gap adaptativo, weighted selection dentro de la ventana, prioridad de alto ER, y bypass en selección manual.
---

# Skill: Reglas de Rotación de Nichos en Generación Automática

## Propósito
Documentar las reglas completas de selección y rotación de nichos para la generación automática de posts. Estas reglas garantizan:
1. Concentración temática: no más de 7 nichos distintos en 15 días
2. Rotación orgánica: gap adaptativo evita repetir el mismo nicho demasiado pronto
3. Visibilidad equitativa: los nichos de alto ER tienen prioridad, pero todos rotan
4. Diversidad visual: cada niche + post recibe una variante de imagen distinta (ver `image-business-concordance`)

---

## Reglas completas (solo aplican a generación AUTOMÁTICA)

| Regla | Valor | Descripción |
|-------|-------|-------------|
| **CAPA 1: Suspensión automática** | ≥3 rechazos / 30 días | Nichos rechazados repetidamente se suspenden de la ventana activa |
| **CAPA 1: Boost de aprobación** | +10/aprobación, -5/rechazo | Score de aprobación: 60% del combined score final |
| **CAPA 2: ER score** | ER% del negocio | Score de mercado: 40% del combined score final |
| Combined score | `approvalNorm * 0.6 + erPct * 0.4` | Score final para ordenar tiers 2 y 3 (no tier 1 garantizado) |
| Ventana de nichos activos | ≤ 7 | Máximo 7 nichos únicos por ventana de 15 días |
| Nichos con ER ≥ 3% | Garantizados | Slots reservados en el top-7 (ordenados por combined score) |
| Resto de slots | 80% por combined score + 20% exploración determinista | Epoch seed garantiza misma ventana en todos los runs de 15 días |
| Pool boost | hasta 3 entradas extra | Nichos aprobados frecuentemente tienen mayor chance de selección |
| Gap entre repeticiones | `min(activeWindowSize, 15)` días | Si hay 3 nichos activos → gap 3 días; si hay 15+ → gap 15 días siempre (MAX_GAP=15) |
| Selección dentro del run | Sin repetición | `topicsUsedThisRun` evita repetir en el mismo batch |
| Selección manual del usuario | Ignora todas estas reglas | El usuario elige el nicho directamente |
| Suspensión se reinicia | 30 días deslizantes | Si el usuario deja de rechazar un nicho, se reactiva automáticamente |

---

## Funciones clave

### `buildActiveNicheWindow(niches, userId)`
**Ubicación:** `artifacts/api-server/src/services/ai.service.ts` (después de `buildWeightedNichePool`)

```typescript
async function buildActiveNicheWindow(
  niches: NicheRow[],
  userId?: number,
): Promise<{ activeWindow: NicheRow[]; weightedPool: NicheRow[] }>
```

**Algoritmo con 3 tiers de prioridad, ventana rolling verdadera y scope por negocio:**

```
buildActiveNicheWindow(niches, userId?, businessId?)
```

0. **CAPA 1 — Suspensión** (ANTES de todo): `getSuspendedNiches(businessId, userId)` → filtra nichos con ≥3 rechazos en 30 días. Nunca aparecen en la ventana activa.
1. Si ≤ 7 nichos elegibles → retorna todos con `buildWeightedNichePool`
2. **ER scoreMap** scoped a `businessId` (o `userId` como fallback)
3. **Approval scoreMap**: `getApprovalScoreMap(businessId, userId)` → último 30 días: +10 por aprobación, -5 por rechazo
4. **Combined score** = `normalizedApproval * 0.6 + erPct * 0.4` → usado para ordenar tiers 2 y 3
5. **Tier 1 (GARANTIZADO)**: nichos con ER ≥ 3% siempre entran a la ventana, ordenados por combined score desc
6. **Tier 2 (ANCHORED)**: `getRecentAutoTopics(15, userId, businessId)` → nichos ya usados recientemente (no high-ER) anclan la ventana; ordenados por combined score
7. **Tier 3 (FILLER)**: rellena slots restantes con mejores candidatos no usados + 20% exploración determinista por epoch seed
8. Construye weighted pool solo con los ≤7 activos (ER-based weights)
9. **CAPA 1 boost**: nichos con `approvalScore > 0` reciben hasta 3 entradas extra en el pool (cada 10 puntos = 1 entrada extra, max 3)

**Garantías:**
- Nichos con ≥3 rechazos en 30 días **nunca aparecen** en la ventana (suspensión automática)
- High-ER siempre en la ventana → no se pueden bloquear por historial reciente
- Anchored niches → rolling window real; múltiples runs en 15 días producen mismo set
- BusinessId scope → negocios del mismo usuario no se contaminan entre sí
- Max 7 nichos únicos en cualquier ventana rolling de 15 días (por negocio)
- Suspensión se reinicia automáticamente al cabo de 30 días (ventana deslizante)

**Log esperado:**
```
[nicheWindow] suspended niches (≥3 rejections/30d): 1 → eligible=11/12
[nicheWindow] biz=3 active=7/11 (highER=2 anchored=3 approval=5): [Recetas Saludables, Panadería, ...]
[nicheWindow] active=5 niches (all fit within window=7): [Panadería, Repostería, ...]
```

**Llamada:**
```typescript
const { activeWindow, weightedPool } = isAutomatic
  ? await buildActiveNicheWindow(realNiches, userId)
  : { activeWindow: realNiches, weightedPool: await buildWeightedNichePool(realNiches, userId) };
```

### `getAdaptiveTopicGapDays(userId?, activeWindowSize?)`
**Ubicación:** `artifacts/api-server/src/services/ai.service.ts`

```typescript
async function getAdaptiveTopicGapDays(userId?: number, activeWindowSize?: number): Promise<number>
```

**Cálculo:** `gap = min(activeWindowSize, MAX_GAP)` donde `MAX_GAP = 15`
- 3 nichos activos → gap 3 días
- 5 nichos activos → gap 5 días
- 7 nichos activos → gap 7 días
- 15+ nichos activos → gap 15 días (máximo siempre — v2.0, antes era 7)

**Llamada (con activeWindowSize ya conocido):**
```typescript
const TOPIC_GAP_DAYS = isAutomatic
  ? await getAdaptiveTopicGapDays(userId, activeWindow.length)
  : 7;
```

### `getRecentAutoTopics(daysAgo, userId?)`
Retorna un `Set<string>` de topic keys usados en los últimos `daysAgo` días.
Solo incluye posts generados automáticamente (registro en `content_history`).

### `buildWeightedNichePool(niches, userId?)`
Construye un pool donde nichos con alto ER aparecen más frecuentemente:
- ER ≥ 3% → peso 3 (aparece 3x en el pool)
- ER ≥ 0.5% → peso 2
- Sin datos / nuevo → peso 1

**Sigue siendo la función base que `buildActiveNicheWindow` llama internamente.**

### `recordApprovalSignal(params)` — Capa 1
**Ubicación:** `artifacts/api-server/src/services/learning.service.ts`

Graba una señal de aprobación/rechazo en `niche_approval_signals`. No-blocking.
- Llamado en `POST /api/posts/:id/approve` → signal=`"approved"`
- Llamado en `DELETE /api/posts/:id` (solo si status era draft/pending) → signal=`"rejected"`

### `getSuspendedNiches(businessId, userId)` — Capa 1
Retorna `Set<number>` de IDs de nichos con ≥3 rechazos en los últimos 30 días.
Llamado en `buildActiveNicheWindow` ANTES de construir la ventana.

### `getApprovalScoreMap(businessId, userId)` — Capa 1
Retorna `Map<nicheId, score>` donde score = suma(+10 por aprobación, -5 por rechazo) en últimos 30 días.
Usado en `buildActiveNicheWindow` para el combined score 60/40.

### `getWeeklyApprovalStats(businessId, userId, daysBack)` — Capa 1
Retorna listas de nichos más aprobados y más rechazados en los últimos N días.
Usada por el cron semanal del domingo para enviar el reporte Telegram.

### Tabla `niche_approval_signals`
**Schema:** `lib/db/src/schema/niche_approval_signals.ts`
```sql
id          SERIAL PRIMARY KEY
user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE
niche_id    INTEGER REFERENCES niches(id) ON DELETE SET NULL
post_id     INTEGER REFERENCES posts(id) ON DELETE SET NULL
signal      TEXT NOT NULL CHECK (signal IN ('approved', 'rejected'))
created_at  TIMESTAMP NOT NULL DEFAULT NOW()
```
**Índices:**
- `idx_nas_business_niche ON (business_id, niche_id)`
- `idx_nas_business_signal ON (business_id, signal, created_at DESC)`

---

## Flujo completo de selección de niche en `generateBulkPosts`

```typescript
// 1. Construir ventana activa + pool ponderado
const { activeWindow, weightedPool } = isAutomatic
  ? await buildActiveNicheWindow(realNiches, userId)
  : { activeWindow: realNiches, weightedPool: await buildWeightedNichePool(realNiches, userId) };

// 2. Gap adaptativo basado en tamaño de ventana
const TOPIC_GAP_DAYS = isAutomatic
  ? await getAdaptiveTopicGapDays(userId, activeWindow.length)
  : 7;
const recentAutoTopics = isAutomatic
  ? await getRecentAutoTopics(TOPIC_GAP_DAYS, userId)
  : new Set<string>();

// 3. En el loop de generación, saltar nichos recientes o ya usados en este run
let niche = nichePool[nicheIndex % nichePool.length];
if (isAutomatic && niches.length > 1) {
  let attempts = 0;
  while (attempts < nichePool.length - 1) {
    if (recentAutoTopics.has(niche.name) || topicsUsedThisRun.has(niche.name)) {
      nicheIndex++; attempts++; niche = nichePool[nicheIndex % nichePool.length];
    } else break;
  }
}
nicheIndex++;
// Registrar uso en este run
topicsUsedThisRun.add(niche.name);
```

---

## Anti-patrones prohibidos

### ❌ Regla "max 2 por mes" (ELIMINADA en Task #361)
```typescript
// ❌ NUNCA volver a agregar esta regla — fue reemplazada por el gap adaptativo
const monthTotal = (nicheMonthlyUsage.get(n) ?? 0) + (runMonthlyCount.get(n) ?? 0);
if (recentAutoTopics.has(n) || topicsUsedThisRun.has(n) || monthTotal >= 2) { // ← PROHIBIDO
  nicheIndex++;
}
```
**Por qué se eliminó:** Bloqueaba nichos después de 2 apariciones/mes independientemente del gap. Con el gap adaptativo y la ventana de 7, la rotación es más natural y predecible sin necesidad de un contador mensual.

### ❌ Usar `buildWeightedNichePool` directamente en generación automática
```typescript
// ❌ No llames buildWeightedNichePool directamente si isAutomatic
const pool = await buildWeightedNichePool(niches, userId); // ← perdería la ventana de 7
```
```typescript
// ✅ Usar siempre buildActiveNicheWindow en modo automático
const { activeWindow, weightedPool } = isAutomatic
  ? await buildActiveNicheWindow(niches, userId)
  : { ..., weightedPool: await buildWeightedNichePool(niches, userId) };
```

### ❌ Aplicar reglas de rotación en selección manual
La selección manual del usuario (endpoint que especifica `nicheId`) debe ignorar TODAS estas reglas:
- No verificar `recentAutoTopics`
- No verificar `topicsUsedThisRun`
- No usar `buildActiveNicheWindow`

---

## Queries SQL de auditoría

```sql
-- Auditoría 1: distribución de nichos usados en los últimos 15 días por usuario
SELECT
  u.email,
  ch.topic_key,
  COUNT(*) AS uses,
  MAX(ch.created_at) AS last_used
FROM content_history ch
JOIN users u ON u.id = ch.user_id
WHERE ch.topic_key IS NOT NULL
  AND ch.created_at > NOW() - INTERVAL '15 days'
GROUP BY u.email, ch.topic_key
ORDER BY u.email, uses DESC;

-- Auditoría 2: verificar que no hay más de 7 nichos únicos por usuario por ventana de 15 días
SELECT
  user_id,
  COUNT(DISTINCT topic_key) AS unique_niches_15d
FROM content_history
WHERE topic_key IS NOT NULL
  AND created_at > NOW() - INTERVAL '15 days'
GROUP BY user_id
ORDER BY unique_niches_15d DESC;
-- Si algún user tiene > 7 → revisar si tenía > 7 nichos (legítimo) o bug en buildActiveNicheWindow

-- Auditoría 3: nichos de alto ER que NO están en los últimos 7 posts de su negocio
-- (para verificar que el sistema de prioridad de alto ER funciona)
SELECT
  b.name AS business,
  n.name AS niche,
  AVG((NULLIF(p.likes,0) + NULLIF(p.comments,0)*2 + NULLIF(p.saves,0)*2)::float /
       GREATEST(NULLIF(p.reach,0), NULLIF(p.likes,0)+1) * 100) AS er_pct
FROM niches n
JOIN businesses b ON b.id = n.business_id
JOIN posts p ON p.niche_id = n.id AND p.status = 'published'
GROUP BY b.name, n.name
HAVING AVG((NULLIF(p.likes,0) + NULLIF(p.comments,0)*2 + NULLIF(p.saves,0)*2)::float /
       GREATEST(NULLIF(p.reach,0), NULLIF(p.likes,0)+1) * 100) >= 3
ORDER BY er_pct DESC;
```

---

## Impacto en generación masiva (caso de uso que motivó Task #361)

**Antes de Task #361:**
- 30 posts masivos para "Arte & Diseño Creativo" → 30 imágenes IDÉNTICAS
- Causa: `deriveBusinessIndustryScene()` retorna un string fijo → DALL-E recibe el mismo prompt
- Regla max-2/mes bloqueaba nichos arbitrariamente sin garantizar rotación visual

**Después de Task #361:**
- 30 posts → ≤7 nichos distintos (ventana activa)
- Cada post recibe `variantIdx = jobIdx` → imagen visualmente diferente (5 variantes de escena por industria)
- Enriquecimiento temático: la escena base se enriquece con el tema del nicho para aún más variedad
- Gap de 7 días máximo = rotación semanal natural

---

## Archivos relevantes

- `artifacts/api-server/src/services/ai.service.ts`: `buildActiveNicheWindow`, `buildWeightedNichePool`, `getAdaptiveTopicGapDays`, `getRecentAutoTopics`, `getNicheMonthlyUsage` (solo para historial — ya no gobierna la rotación)
- `.agents/skills/image-business-concordance/SKILL.md`: arquitectura multi-variante de imágenes (`scenes[]`, `variantIdx`)
- `.agents/skills/industry-scene-sync-rule/SKILL.md`: regla para sincronizar industrias con el motor de escenas
