---
name: precios-cop
description: Regla de precios en HazPost. Úsalo ANTES de implementar, mostrar o modificar cualquier precio dentro de la plataforma. Define la fórmula única COP = round(TRM × USD × 1.05), la función disponible computeCopPrice, la fuente del TRM y cuándo mostrar ambas monedas.
---

# Regla de Precios COP en HazPost

## Regla de Oro

> **Todo precio en HazPost tiene USD como fuente de verdad. El precio en COP se calcula SIEMPRE como `round(TRM × priceUsd × 1.05)`. Esta fórmula aplica a TODOS los precios sin excepción: planes, add-ons, paquetes de créditos, negocio adicional, prorraciones, etc.**

No existe ningún precio fijo en COP. El COP es siempre dinámico y depende de la TRM del día.

---

## Fórmula

```
priceCop = Math.round(trm × priceUsd × 1.05)
```

- `trm` = tasa representativa del mercado COP/USD (fuente: datos.gov.co)
- `priceUsd` = precio en dólares (fuente de verdad)
- `1.05` = margen del 5% para cubrir variación de tasa intradía

### Casos especiales
- Si `priceUsd === 0` (plan Gratis), el resultado es `0` — no aplicar la fórmula.
- Nunca redondear a miles manualmente en el backend; `Math.round` ya da el entero exacto.

---

## Función disponible en el backend

```typescript
import { computeCopPrice, getCurrentTrm } from "../services/trm.service.js";

// Dentro de un route handler async:
const trm = await getCurrentTrm();
const priceCop = computeCopPrice(priceUsd, trm);
```

**Archivo**: `artifacts/api-server/src/services/trm.service.ts`

### Comportamiento del servicio TRM

| Aspecto | Detalle |
|---------|---------|
| Fuente | datos.gov.co (`/resource/32sa-8pi3.json`) — datos oficiales del Banco de la República |
| Caché | 24 horas en memoria (proceso del servidor) |
| Fallback | 4200 COP/USD si el API falla y no hay caché |
| Pre-warm | El scheduler lo actualiza diariamente a las 08:00 hora Bogotá |
| Endpoint diagnóstico | `GET /api/billing/trm` — retorna `{ trm, fetchedAt }` |

---

## Cuándo mostrar ambas monedas (USD + COP)

**Siempre que se muestre un precio pagable al usuario colombiano**, mostrar ambas:

```
$49.99 USD/mes
≈ $189.000 COP/mes
```

- El USD va primero, es el valor cobrado.
- El COP va segundo, como referencia en pesos.
- En displays compactos (tablas, pills), mostrar solo COP con formato `$XXX.XXX COP`.
- En el panel **admin**, mostrar COP como valor computado read-only junto al campo USD editable.

**No mostrar COP** en:
- Logs internos
- Respuestas de API internas (entre microservicios)
- Campos de configuración del admin donde solo se edita USD

---

## Precios actuales de la plataforma (referencia a TRM ≈ 3.608 — verificado 2026-04-14)

| Concepto | USD | COP estimado |
|----------|-----|-------------|
| Plan Gratis | $0 | $0 |
| Plan Emprendedor / mes | $29.99 | ≈ $113.600 |
| Plan Negocio / mes | $49.99 | ≈ $189.400 |
| Plan Agencia / mes | $199.99 | ≈ $757.500 |
| Negocio adicional (Agencia) / mes | $29.99 | ≈ $113.600 |
| Paquete de créditos (30 créditos + 2 reels) | $10.00 | ≈ $37.800 |

> **Importante**: Los valores de los planes son configurables por admin en `GET /api/admin/plans`. El paquete de créditos (`priceUsd`, `credits`, `reels`) también es editable por admin (`app_settings` keys: `credit_pack_price_usd`, `credit_pack_credits`, `credit_pack_reels`). Esta tabla es solo referencia histórica; los valores reales pueden haber cambiado.

### Endpoints autoritativos para precios actuales

| Endpoint | Qué devuelve |
|----------|-------------|
| `GET /api/billing/plans` | Planes públicos con `price_cop` dinámico |
| `GET /api/billing/packages` | Paquetes disponibles con `priceCop` dinámico |
| `GET /api/billing/trm` | TRM actual y `fetchedAt` |
| `GET /api/admin/plans` | Planes + paquete créditos + TRM (solo admin) |

> Para obtener precios reales en código, consultar estos endpoints o llamar `computeCopPrice(priceUsd, await getCurrentTrm())` directamente.

---

## Dónde ya está implementado (fuente de verdad para consulta)

| Archivo | Qué computa |
|---------|-------------|
| `artifacts/api-server/src/routes/billing.ts:59-70` | COP de planes principales (`priceCop`, `priceAnnualCop`) |
| `artifacts/api-server/src/routes/billing/packages.ts:13-27` | COP del paquete de créditos |
| `artifacts/api-server/src/routes/admin/plans.ts:46-61` | COP computado en admin (`computedPriceCop`, `computedPriceAnnualCop`, `creditPack.priceCop`) |

---

## Lo que NO está implementado aún (pendiente Tarea #140)

- `extra_business_price_cop` en el endpoint público `GET /api/plans`
- `priceCop` en la respuesta 402 de `POST /api/businesses`
- Precio COP visible en el modal de "Negocio adicional" en `businesses.tsx`
- Precio COP visible en `PlanCard.tsx` para el add-on de negocio extra
- COP mostrado en el panel admin para negocio extra mensual y paquete de créditos

---

## CORRECTO vs INCORRECTO

### CORRECTO — precio COP dinámico

```typescript
const trm = await getCurrentTrm();
res.json({
  priceUsd: plan.priceUsd,
  priceCop: computeCopPrice(plan.priceUsd, trm),   // dinámico
});
```

### INCORRECTO — precio COP estático hardcodeado

```typescript
res.json({
  priceUsd: 29.99,
  priceCop: 113600,   // ❌ NUNCA hardcodear COP
});
```

### INCORRECTO — fórmula inventada

```typescript
const priceCop = Math.round(plan.priceUsd * 4000);     // ❌ sin margen 1.05
const priceCop = Math.round(plan.priceUsd * trm * 1.1); // ❌ margen diferente
```

### INCORRECTO — omitir COP en un precio visible al usuario

```typescript
// Si el usuario puede ver este precio y pagar con él, DEBE incluir priceCop
res.json({ priceUsd: cfg.priceUsd });  // ❌ falta priceCop
```

---

## Instrucción Explícita para el Agente

1. **Antes de agregar cualquier precio a un endpoint o componente**, verificar que incluye `priceCop` calculado con `computeCopPrice`.
2. **Nunca hardcodear un valor COP**. Si no tienes acceso al TRM, llama `getCurrentTrm()`.
3. **La fórmula es única**: `Math.round(trm × priceUsd × 1.05)`. Cualquier variación es un bug.
4. **Precios de $0 retornan $0 COP** — la función ya lo maneja, no necesitas if adicional.
5. Si añades un nuevo precio cobrable (nuevo plan, nuevo add-on, nueva suscripción), **siempre exponer ambos**: `priceUsd` y `priceCop`.
