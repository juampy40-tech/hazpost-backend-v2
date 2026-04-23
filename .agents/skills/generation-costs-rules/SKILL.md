---
name: generation-costs-rules
description: >
  Reglas del sistema de costos de generación en HazPost. Úsalo ANTES de agregar
  un nuevo tipo de generación de imágenes o contenido que implique costo monetario
  (llamadas a OpenAI, gpt-image-1, DALL-E, etc.) o costo de créditos. Define dónde
  se configuran los costos, cómo se calculan, y cómo se añade un nuevo tipo.
---

# Generation Costs Rules — HazPost

## Arquitectura de costos de generación

Hay **dos sistemas de costo independientes** que deben mantenerse sincronizados:

| Sistema | Propósito | Dónde vive |
|---------|-----------|------------|
| **Créditos** | Costo para el usuario (descontado de `subscriptions.credits_remaining`) | `app_settings` table + `creditCosts.ts` |
| **USD** | Costo real para HazPost (llamada a OpenAI) | `generationCosts.ts` + `admin/metrics.ts` |

---

## 1. Sistema de Créditos

### Archivo clave
`artifacts/api-server/src/lib/creditCosts.ts`

### Cómo funciona
- Los costos se almacenan en `app_settings` con keys `credit_cost_*`.
- Se cargan al inicio vía `getCreditCosts()` con caché de 60s.
- El admin puede editarlos desde el panel: `PUT /api/admin/plans/credit-costs/config`.

### Costos actuales

| Tipo | Key en app_settings | Default |
|------|---------------------|---------|
| Imagen | `credit_cost_image` | 1 cr |
| Historia | `credit_cost_story` | 1 cr |
| Carrusel | `credit_cost_carousel` | 5 cr |
| Reel | `credit_cost_reel` | 6 cr |
| IA + Elemento | `credit_cost_element_ai` | 3 cr |

El costo de IA + Elemento se cobra **adicionalmente** al costo base de imagen:
`reserveCredits(uid, costs.elementAi + costs.image)` = 3 + 1 = 4 cr total.

### Verificar costos actuales
```sql
SELECT key, value::int AS creditos
FROM app_settings
WHERE key LIKE 'credit_cost_%'
ORDER BY key;
```

---

## 2. Sistema de Costos USD

### Archivo clave
`artifacts/api-server/src/lib/generationCosts.ts`

### Costos actuales

| Tipo | USD por llamada |
|------|----------------|
| Imagen | $0.020 |
| Historia | $0.020 |
| Carrusel | $0.020 (por slide) |
| Reel | $0.020 (por slide) |
| IA + Elemento | $0.040 (gpt-image-1 edit API, más costoso que DALL-E) |

### Seguimiento de costos USD
- Posts regulares: rastreados en `posts.generation_cost_usd` → `GET /api/admin/metrics/generation-costs`.
- Variantes `element_ai`: rastreadas contando `image_variants` con `style='element_ai'` × $0.040.
  Esto es porque cada llamada crea una **variante individual**, no un post completo.

---

## 3. Cómo añadir un nuevo tipo de generación

Cuando se agrega una nueva modalidad (ej: "video corto", "imagen 3D", etc.):

### Pasos obligatorios (en orden)

1. **`generationCosts.ts`** → Agregar `new_type: 0.XXX` al objeto `DEFAULT_GENERATION_COSTS_USD`.

2. **`creditCosts.ts`** → Agregar:
   - Campo en interfaz `CreditCosts`: `newType: number`
   - Valor en `DEFAULT_COSTS`: `newType: N`
   - Key en `CREDIT_COST_KEYS`: `"credit_cost_new_type"`
   - Mapeo en `_cache`: `newType: isFinite(map["credit_cost_new_type"]) ? map["credit_cost_new_type"] : DEFAULT_COSTS.newType`

3. **`admin/plans.ts`** → En `PUT /credit-costs/config`: añadir `{ newType }` al desestructurado del body y llamar `upsert("credit_cost_new_type", String(Number(newType)))`.

4. **`index.ts` (startup seeds)** → Añadir `"credit_cost_new_type": "N"` al objeto `defaults` en la sección de credit cost seeds (~línea 1097).

5. **`admin.tsx`** → Añadir `newType` a `CreditCosts` interface y al grid de inputs.

6. **`admin-metrics.tsx`** → Añadir a `TYPE_LABELS`, `TYPE_COLORS`, `TYPE_EMOJI`.

7. **Si es un beneficio diferenciador de plan**: añadir key a `plan_benefit_catalog` en `index.ts` y crear columna booleana en `plans`. Ver skills `beneficios-universales` y `element-library-rules`.

8. **Skill `generation-costs-rules`**: actualizar esta tabla con el nuevo tipo.

---

## 4. Guard de plan para IA + Elemento

El beneficio `element_ai_integration` está guardado por `plans.element_ai_enabled` (boolean).

```typescript
// posts.ts — guard correcto
const [planRow] = await db
  .select({ elementAiEnabled: plansTable.elementAiEnabled })
  .from(plansTable)
  .where(eq(plansTable.key, sub.planKey))
  .limit(1);
if (!planRow?.elementAiEnabled) {
  return res.status(403).json({ error: "Tu plan actual no incluye 'IA integra el elemento'." });
}
```

El admin habilita/deshabilita esto desde el panel → Configuración de Capacidades de Planes → columna "IA Elemento".

---

## 5. Endpoint de generación con elemento

`POST /api/posts/:id/generate-with-element`

Flujo:
1. Verificar `plans.element_ai_enabled` → 403 si false
2. Cargar elemento desde Object Storage (verificar `userId + businessId`)
3. Verificar `analysisStatus !== 'pending'`
4. `reserveCredits(uid, costs.elementAi + costs.image)` → 402 si insuficientes
5. Llamar `generateImageWithElement(elementBuffer, analysis, nicheContext, style, ...)`
6. INSERT `image_variants` con `style='element_ai'`, `businessId`, `industryGroupSlug`
7. Retornar `{ variant: inserted }`
