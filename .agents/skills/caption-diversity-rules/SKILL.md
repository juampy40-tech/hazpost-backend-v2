# Skill: caption-diversity-rules

## Problema que resuelve

HazPost genera N posts en un batch y todos salen con el **mismo gancho estructural** (ej: "Deslizá para descubrir: X") y el **mismo patrón de caption** (ej: "Ayer un X nos dijo algo que se siente demasiado real"), haciendo que la marca parezca un bot sin creatividad.

**Causa raíz (3 vectores):**

1. **Vector 1 — Hardcode de frase carousel**: `generateCaption` tenía en `contentTypeInstr`:
   ```
   "Tipo CARRUSEL — la primera línea invita a deslizar. Incluye '👉 Desliza para descubrir'."
   ```
   → Todos los carousels del batch recibían la misma instrucción → mismo gancho.

2. **Vector 2 — avoidHooks vacío en primer intento**: La primera llamada a `generateCaption` pasaba `getMostSimilarHooks("", allUsedHooks)` que **siempre devuelve `[]`** (Jaccard de string vacío = 0). La IA no sabía qué evitar hasta el segundo intento.

3. **Vector 3 — Jaccard no detecta repetición estructural de prefijo**: "DESLIZA PARA DESCUBRIR: X" vs "DESLIZA PARA DESCUBRIR: Y" tienen Jaccard ~25% (las palabras de contenido difieren). El threshold de 60% no los atrapa aunque el formato sea idéntico.

---

## Arquitectura del sistema de diversidad

**Archivo central:** `artifacts/api-server/src/services/ai.service.ts`

### 1. `CAROUSEL_HOOK_STYLES` — Paleta de 10 estilos de gancho

```typescript
export const CAROUSEL_HOOK_STYLES: string[] = [
  "Comienza con una PREGUNTA que genere curiosidad genuina...",
  "Comienza con un DATO SORPRENDENTE o estadística concreta...",
  "Comienza con una CONTRADICCIÓN o paradoja...",
  "Comienza con una CONFESIÓN o revelación personal...",
  "Comienza con una ADVERTENCIA o alerta urgente...",
  "Comienza con un RESULTADO concreto que la audiencia quiere...",
  "Comienza con una frase de CONTRASTE radical...",
  "Comienza con una INVITACIÓN directa...",
  "Comienza con una CITA o frase de un cliente real...",
  "Comienza con una PROMESA de transformación específica...",
];
```

**Regla de rotación:** cada post en el batch usa `CAROUSEL_HOOK_STYLES[batchHooks.length % 10]`. Así el post 0 recibe el estilo 0, el post 1 el estilo 1, etc. → **nunca dos posts consecutivos del mismo batch pueden tener el mismo formato de gancho**.

### 2. `generateCaption(... hookStyleHint?)` — Parámetro 8

```typescript
export async function generateCaption(
  nicheContext: string,
  platform: string,
  contentType: string = "image",
  avoidHooks?: string[],
  userId?: number,
  defaultLocationOverride?: string | null,
  businessId?: number,
  hookStyleHint?: string   // ← NUEVO: estilo obligatorio para carousel
): Promise<...>
```

El `hookStyleHint` se inyecta en `contentTypeInstr` cuando `contentType === "carousel"`:
```
🎯 ESTILO DE GANCHO OBLIGATORIO para este post: [estilo elegido]
NUNCA empieces con la misma frase que posts anteriores...
```

### 3. `isTooSimilar` — Detección de prefijo estructural

```typescript
function isTooSimilar(newHook: string, recentHooks: string[]): boolean {
  if (recentHooks.length === 0) return false;
  const newPre = prefixTokens(newHook, 3);
  return recentHooks.some(h => {
    // Jaccard word-level (threshold 60%)
    if (jaccardSimilarity(newHook, h) > 0.6) return true;
    // Prefix structural match: primeros 3 tokens iguales = repetición estructural
    if (newPre.length >= 2) {
      const hPre = prefixTokens(h, 3);
      const matchCount = newPre.filter((t, i) => hPre[i] === t).length;
      if (matchCount >= Math.min(2, newPre.length)) return true;
    }
    return false;
  });
}
```

`prefixTokens` usa `tokenize()` (ya filtra stopwords) para extraer los primeros N tokens significativos.

### 4. Primer intento recibe avoidHooks reales

**Anti-patrón prohibido:**
```typescript
// ❌ NUNCA — getMostSimilarHooks("", list) siempre devuelve []
captionResult = await generateCaption(ctx, platform, contentType,
  getMostSimilarHooks("", allUsedHooks), ...);
```

**Patrón correcto:**
```typescript
// ✅ Pasar últimos 15 hooks reales para que la IA sepa qué evitar desde el primer intento
captionResult = await generateCaption(ctx, platform, contentType,
  allUsedHooks.slice(-15), userId, undefined, businessId, hookStyleHint);
```

---

## Flujo completo de generación en el batch

Para cada post en `generateBulkPosts` / `generateExtraPosts`:

```
1. hookStyleHint = CAROUSEL_HOOK_STYLES[batchHooks.length % 10]  (solo si carousel)
2. allUsedHooks = [...recentHooks (DB 90 días), ...batchHooks (en memoria)]
3. Intento 1: generateCaption(ctx, platform, contentType, allUsedHooks.slice(-15), ..., hookStyleHint)
4. Si isTooSimilar(hook, allUsedHooks):
     Intento 2: generateCaption(ctx, platform, contentType, getMostSimilarHooks(hook, all, 8), ..., hookStyleHint)
5. Si aún isTooSimilar:
     Intento 3: generateCaption(ctx + " — ÁNGULO COMPLETAMENTE DIFERENTE", ..., getMostSimilarHooks(hook, all, 12), ..., hookStyleHint)
6. batchHooks.push(captionHookDraft)  ← actualiza para el siguiente post del batch
```

**Secciones donde aplica (4 lugares en ai.service.ts):**
- `generateBulkPosts` — both-feed (Instagram + TikTok simultáneo)
- `generateBulkPosts` — SP-feed (TikTok-only)
- `generateExtraPosts` — both-feed extra
- `generateExtraPosts` — SP-feed extra

---

## Reglas de mantenimiento

### Si agregas un nuevo tipo de contenido carousel

1. El `contentTypeInstr` para carousel en `generateCaption` ya es genérico — no necesita cambio.
2. Verifica que se pasa `hookStyleHint` en la llamada a `generateCaption`.

### Si quieres agregar más estilos de gancho

Agrega al array `CAROUSEL_HOOK_STYLES`. El módulo rotará automáticamente por todos los estilos.
**Mantén mínimo 5 estilos** para garantizar diversidad en batches de 5 posts.

### Si el usuario reporta repetición de ganchos

**Diagnóstico paso a paso:**

```sql
-- Últimos 20 hooks de un negocio (reemplaza business_id)
SELECT caption_hook, created_at, platform
FROM content_history
WHERE business_id = <id>
ORDER BY created_at DESC
LIMIT 20;
```

Verificar:
1. ¿Los hooks tienen el mismo prefijo estructural? → `isTooSimilar` con prefixTokens debería haberlos bloqueado. Si no lo hizo, aumentar `matchCount >= 2` a `>= 1`.
2. ¿Todos son del mismo batch reciente? → El `batchHooks` array en memoria funciona secuencialmente. Si hay un bug de concurrencia, el problema es en la gestión del pool de workers.
3. ¿Son posts de plataformas distintas? → `batchHooks` es compartido cross-platform en el batch — ambas secciones (both + SP-feed) comparten el mismo array.

### Anti-patrones prohibidos

```typescript
// ❌ Hardcodear la frase exacta del gancho en el prompt
contentType === "carousel" ? "Incluye '👉 Desliza para descubrir'." : ...

// ❌ Pasar lista vacía al primer intento de generateCaption
getMostSimilarHooks("", allUsedHooks)  // Siempre retorna [] — no avisa nada a la IA

// ❌ Omitir hookStyleHint en nuevas secciones de generación de carousels
await generateCaption(ctx, platform, "carousel", hooks, uid, null, bizId)
// ↑ Falta el 8vo parámetro hookStyleHint
```

---

## Historial de bugs y fixes

| Fecha | Bug | Fix |
|-------|-----|-----|
| 2026-04-18 | 5 carousels de HazPost con gancho idéntico "DESLIZÁ PARA DESCUBRIR" | Eliminado hardcode → `CAROUSEL_HOOK_STYLES` rotativo + `hookStyleHint` |
| 2026-04-18 | `getMostSimilarHooks("", list)` siempre retorna `[]` | Primer intento ahora recibe `allUsedHooks.slice(-15)` |
| 2026-04-18 | Jaccard no detecta "DESLIZA X" vs "DESLIZA Y" (25% < 60%) | Agregado `prefixTokens` check: 2 de 3 primeros tokens iguales = bloqueado |
