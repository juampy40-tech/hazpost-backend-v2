---
name: credits-image-failure
description: Reglas de reembolso de créditos cuando falla la generación de imagen en HazPost. Úsalo ANTES de modificar cualquier lógica de cobro/reembolso en generación de imágenes, el endpoint retry-image, o generateImagesForPostsBg. Cubre la función centralizada refundImageFailure, el campo credits_refunded en posts, cuándo cobrar vs reembolsar, y el anti-patrón prohibido.
---

# Skill: Créditos en falla de imagen

## Principio fundamental

Cuando la generación de imagen falla (timeout, error del modelo, error de red),
el usuario **no debe perder créditos**. La imagen es el producto tangible por el
que se cobra — si no se entregó, se devuelve el crédito.

Toda lógica de reembolso por fallo de imagen pasa por **una sola función centralizada**.

---

## Función centralizada: `refundImageFailure`

```typescript
// artifacts/api-server/src/lib/creditCosts.ts

import { refundImageFailure } from "../../lib/creditCosts.js";

const refunded = await refundImageFailure(userId, contentType);
// Devuelve: number (créditos devueltos, 0 si userId es null)
```

### Cuándo llamarla

Llamar `refundImageFailure` **y solo esta función** en los siguientes casos:

| Situación | Dónde ocurre | Acción adicional |
|---|---|---|
| Todas las variantes de un post fallan (`successfulVariants === 0`) | `generateImagesForPostsBg` (ai.service.ts) | `posts.creditsRefunded = true` |
| El job-level del post falla (catch externo) | `generateImagesForPostsBg` (ai.service.ts) | `posts.creditsRefunded = true` |

### Anti-patrón prohibido

```typescript
// ❌ NUNCA calcular el reembolso de imagen inline
const costs = await getCreditCosts();
const refundAmount = creditCostOf(post.contentType, costs);
await refundCredits(userId, refundAmount);
// ← esto viola el principio de centralización
```

```typescript
// ✅ SIEMPRE usar la función centralizada
await refundImageFailure(job.userId, job.contentType);
```

---

## Campo `posts.credits_refunded`

```sql
-- Schema: lib/db/src/schema/posts.ts
credits_refunded BOOLEAN NOT NULL DEFAULT FALSE
```

**Semántica:**
- `false` (default): el crédito de este post no ha sido reembolsado. Un retry cobra normalmente.
- `true`: el crédito fue devuelto porque todas las imágenes fallaron. El próximo retry es **gratuito**.

**Reglas de escritura:**

```typescript
// Al fallar todas las imágenes → marcar como refunded
await db.update(postsTable)
  .set({ creditsRefunded: true })
  .where(eq(postsTable.id, postId));

// Al iniciar un retry (independiente de si era gratis o no) → resetear
await db.update(postsTable)
  .set({ creditsRefunded: false })
  .where(eq(postsTable.id, postId));
```

---

## Lógica del endpoint retry-image

```
POST /:id/retry-image
```

**Árbol de decisión de cobro:**

```
¿post.creditsRefunded === true?
  └─ SÍ → retry gratuito
           → resetear credits_refunded = false
           → borrar variantes error/pending
           → iniciar generateImagesForPostsBg
  └─ NO → cobrar crédito normal (checkAndDeductCredits)
           → si no hay créditos → 402 Créditos insuficientes
           → si ok → resetear credits_refunded = false
                   → borrar variantes
                   → iniciar generateImagesForPostsBg
```

---

## Campo `chargedCredits` en el job

```typescript
// PostImageJob en ai.service.ts
interface PostImageJob {
  chargedCredits?: boolean; // false = free retry, undefined/true = credits were charged
}
```

`generateImagesForPostsBg` solo llama `refundImageFailure` cuando `job.chargedCredits !== false`.
Si el job fue un retry gratuito y falla, solo actualiza el flag (`credits_refunded = true`) sin
llamar `refundImageFailure` — no hay crédito que devolver porque no se cobró ninguno.

---

## Árbol de decisión de reembolso en generateImagesForPostsBg

```
¿job.chargedCredits === false?
  └─ SÍ (retry gratuito) → fallo → solo marcar credits_refunded = true (NO refundImageFailure)
  └─ NO (generación pagada) → fallo → refundImageFailure() + marcar credits_refunded = true
```

---

## Tabla de comportamiento completo

| Evento | Cobro | Reembolso | credits_refunded |
|---|---|---|---|
| Bulk generation — post creado | ✅ Se descuenta (upfront reservation) | — | false |
| Bulk generation — imágenes OK | — | Surplus devuelto | **false** (reset explícito) |
| Bulk generation — TODAS imágenes error | — | `refundImageFailure()` | **true** |
| Bulk generation — excepción en job completo | — | `refundImageFailure()` | **true** |
| retry-image — credits_refunded=false (cobrado) | ✅ Se descuenta | — | reset a false, luego... |
| retry-image cobrado — falla | — | `refundImageFailure()` | **true** |
| retry-image cobrado — éxito | — | — | **false** |
| retry-image — credits_refunded=true (gratis) | ❌ Gratis | — | reset a false, luego... |
| retry-image gratuito — falla | — | ❌ Sin reembolso (chargedCredits=false) | **true** (flag restaurado) |
| retry-image gratuito — éxito | — | — | **false** |

---

## Flujo de reconciliación de seguridad (backup)

El sistema tiene una segunda línea de defensa: la tabla `pending_credit_deductions`
con el job de reconciliación (`reconcilePendingLedger`) que corre cada 30 min.
Si el proceso muere entre el cobro y la generación, esta reconciliación devuelve
los créditos automáticamente después de 30 minutos.

`refundImageFailure` + `credits_refunded` cubren el caso más común (generación
completa pero imagen fallida). `reconcilePendingLedger` cubre el caso de crash
del proceso.

---

## Archivos clave

| Archivo | Función |
|---|---|
| `artifacts/api-server/src/lib/creditCosts.ts` | `refundImageFailure()` — función centralizada ← SIEMPRE usar esta |
| `artifacts/api-server/src/services/ai.service.ts` | `generateImagesForPostsBg()` — llama refundImageFailure en ambas rutas de fallo |
| `artifacts/api-server/src/routes/social/posts.ts` | `POST /:id/retry-image` — maneja credits_refunded para retry gratuito |
| `lib/db/src/schema/posts.ts` | Campo `creditsRefunded: boolean` |
