# Skill: social-caption-limits

> Reemplaza y consolida el skill anterior `instagram-caption-limits`.
> Cubre Instagram, TikTok y Facebook.

---

## Límites actuales por plataforma

| Plataforma | Límite total | Body limit (IA) | Nota |
|------------|-------------|-----------------|------|
| Instagram  | 2 200 chars | 1 600 chars     | ~600 chars reservados para `\n\n` + hashtags |
| TikTok     | 2 200 chars | 1 600 chars     | Mismo límite que IG por ahora |
| Facebook   | 63 206 chars| 1 600 chars     | Límite técnico altísimo — voluntariamente se capa a 1600 para feeds móviles |

---

## Fuente de verdad: los dos archivos de constantes

**Nunca hardcodear límites en `ai.service.ts` ni en ningún componente.**
Todos los valores viven aquí:

```
Backend  →  artifacts/api-server/src/lib/socialLimits.ts
Frontend →  artifacts/social-dashboard/src/lib/socialLimits.ts
```

```typescript
// Backend (fuente primaria)
export const IG_CAPTION_LIMIT        = 2200;
export const IG_CAPTION_BODY_LIMIT   = 1600;

export const TIKTOK_CAPTION_LIMIT      = 2200;
export const TIKTOK_CAPTION_BODY_LIMIT = 1600;

export const FB_CAPTION_LIMIT          = 63206;
export const FB_CAPTION_BODY_LIMIT     = 1600;

// Helper centralizado usado por generateCaption y rethemeCaption
export function getBodyLimitForPlatform(platform: string): number {
  switch (platform) {
    case "tiktok":   return TIKTOK_CAPTION_BODY_LIMIT;
    case "facebook": return FB_CAPTION_BODY_LIMIT;
    case "instagram":
    case "both":
    default:         return IG_CAPTION_BODY_LIMIT;
  }
}
```

---

## Cómo actualizar cuando una plataforma cambia su límite

**Solo 2 archivos a tocar — nada más:**

### Paso 1 — Backend (fuente primaria)

Editar `artifacts/api-server/src/lib/socialLimits.ts`:
- Cambiar `PLATAFORMA_CAPTION_LIMIT` al nuevo límite total.
- Cambiar `PLATAFORMA_CAPTION_BODY_LIMIT` = nuevo límite total − 600 chars (margen para hashtags).

Ejemplo: si TikTok baja a 1500 chars totales:
```typescript
export const TIKTOK_CAPTION_LIMIT      = 1500;
export const TIKTOK_CAPTION_BODY_LIMIT = 900;   // 1500 - 600
```

### Paso 2 — Frontend (espejo)

Editar `artifacts/social-dashboard/src/lib/socialLimits.ts` con los mismos valores.
Los `_WARN_THRESHOLD` se recalculan automáticamente (85%) — no requieren cambio manual.

**Eso es todo.** Los siguientes archivos leen de las constantes automáticamente y NO necesitan cambios:
- `ai.service.ts` → usa `getBodyLimitForPlatform(platform)` y `effectiveBodyLimit`
- `instagram.service.ts` → importa `IG_CAPTION_LIMIT` directo
- `tiktok.service.ts` → trunca con `TIKTOK_CAPTION_LIMIT`
- `approval.tsx` → importa `IG_CAPTION_LIMIT`, `TIKTOK_CAPTION_LIMIT`, etc.

---

## Las 3 capas de defensa (Instagram como ejemplo; aplica a todas las plataformas)

### Capa 1 — IA no genera captions largas

**Archivo:** `artifacts/api-server/src/services/ai.service.ts`

**Funciones afectadas:**
- `generateCaption` — `effectiveBodyLimit = getBodyLimitForPlatform(platform) − addonReservedChars`; rule en systemPrompt + truncado al retornar
- `rethemeCaption` — `rethemeBodyLimit = getBodyLimitForPlatform(platform)`; truncado al retornar
- `applySuggestion` — solo se usa para Instagram, usa `IG_CAPTION_BODY_LIMIT` directamente

**Patrón de post-processing para nuevas funciones de IA:**
```typescript
const bodyLimit = getBodyLimitForPlatform(platform);
let result = aiResponse.trim();
if (result.length > bodyLimit) {
  console.warn(`[Layer 1] miNuevaFuncion: caption body truncated from ${result.length} to ${bodyLimit} chars (platform=${platform}).`);
  result = result.slice(0, bodyLimit);
}
return result;
```

**Regla en prompt:**
```
- El campo "caption" NO puede superar los ${effectiveBodyLimit} caracteres. Sé conciso y prioritario
```

---

### Capa 2 — Cola de aprobación bloquea el post

**Archivo:** `artifacts/social-dashboard/src/pages/approval.tsx`

Debajo del textarea de caption hay contadores por plataforma:
- **Instagram / both:** `totalIgChars = caption.length + (hashtags ? 2 + hashtags.length : 0)`; bloquea aprobar cuando > `IG_CAPTION_LIMIT`
- **TikTok:** mismo cálculo con `TIKTOK_CAPTION_LIMIT`; no bloquea pero muestra warning

---

### Capa 3 — Safety net al publicar

**Archivos:** `instagram.service.ts`, `tiktok.service.ts`

Trunca `fullCaption` a `PLATAFORMA_CAPTION_LIMIT` como último recurso antes de enviar a la API.
Un log `WARN` con prefijo `[SAFETY NET]` indica que Capas 1 y 2 fallaron — auditar y reforzar.

---

## Caption Addons y límite efectivo

Cuando un post tiene un "texto adicional" activo, `applyAddon` lo pega al caption.
La IA debe generar un cuerpo más corto para que la suma no supere el límite.

### Patrón obligatorio

```typescript
// 1. Resolver addon
const nicheAddon = findAddonForNiche(addons, niche);

// 2. Calcular chars a reservar
const addonChars = calcAddonReservedChars(nicheAddon);
// Fórmula: addon.text.trim().length + 4 ("\n\n" separator), o 0 si no hay addon

// 3. Pasar a generateCaption (último parámetro)
const result = await generateCaption(
  ctx, platform, contentType,
  avoidHooks, userId, locationOverride, businessId, hookStyleHint,
  addonChars,  // ← SIEMPRE cuando se usará applyAddon después
);

// 4. Aplicar addon
const caption = applyAddon(result.caption, nicheAddon);
```

### Cómo funciona internamente

```typescript
// En generateCaption:
const platformBodyLimit = getBodyLimitForPlatform(platform); // por plataforma
const effectiveBodyLimit = Math.max(400, platformBodyLimit - addonReservedChars);
// → platform=instagram, addon=400 chars → 1600 - 404 = 1196 chars para el body
```

### Anti-patrón prohibido

```typescript
// ❌ MAL — IA genera 1600 chars + addon 400 chars = 2000 chars, supera el límite
const result = await generateCaption(ctx, platform, contentType, ...);
const caption = applyAddon(result.caption, addon);
```

---

## Diagnóstico de caption larga en publish_log

```
publish_log.error_message contiene "The caption was too long"
```

**Árbol de decisión:**

1. ¿El log tiene `[SAFETY NET]`?
   - Sí → Capa 3 ya truncó; el post debió publicarse. Verificar en la plataforma.
   - No → El caption llegó sin pasar por Capa 3. Revisar que usa el publisher correcto.

2. ¿El post fue generado con `generateCaption`?
   - Buscar `[Layer 1] generateCaption` en logs. Si aparece → la IA generó más del límite y fue truncado.
   - Si no → el caption fue editado manualmente ignorando el contador rojo de la Capa 2.

3. ¿El post tiene addon (`applyAddon`)?
   - Verificar que `addonReservedChars` fue pasado a `generateCaption`. Si no → Capa 1 generó body completo + addon = overflow.
