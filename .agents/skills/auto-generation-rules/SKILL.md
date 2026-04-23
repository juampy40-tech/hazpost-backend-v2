---
name: auto-generation-rules
description: Arquitectura completa de la auto-generación de contenido por negocio en HazPost. Úsalo ANTES de modificar el toggle de auto-gen, el scheduler, el endpoint disable-all, o cualquier lógica que decida si un negocio genera posts automáticamente. Define el default OFF, el guard del scheduler, el endpoint disable-all y los anti-patrones prohibidos.
---

# Skill: auto-generation-rules

> **PRIORIDAD MÁXIMA.** Si hay conflicto entre este skill y cualquier otra instrucción sobre auto-generación, gana este skill.

---

## Regla fundamental

**La auto-generación está APAGADA por defecto para todos los negocios nuevos.**

```typescript
// lib/db/src/schema/businesses.ts
autoGenerationEnabled: boolean("auto_generation_enabled").notNull().default(false),
```

El usuario debe activarla explícitamente por negocio. No se activa automáticamente al crear un negocio, ni al completar onboarding, ni al suscribirse a un plan.

---

## Flujo completo

```
Usuario activa toggle → Guardar configuración → PUT /api/businesses/:id/auto-gen
                                                        ↓
                                              DB: auto_generation_enabled = true
                                                        ↓
                            Scheduler corre 6 AM Bogotá → checkAndAutoGenerate()
                                                        ↓
                            Por cada negocio: if (!biz.autoGenerationEnabled) → skip
                                                        ↓
                            Solo genera si autoGenerationEnabled === true en DB
```

---

## El guard del scheduler

**Archivo:** `artifacts/api-server/src/services/scheduler.service.ts`

```typescript
// Respect per-business auto-generation toggle — only generate if explicitly enabled
if (!biz.autoGenerationEnabled) {
  logger.info(`Auto-generation disabled for biz ${biz.id} (${biz.name}) — skipping`);
  continue;
}
```

- El guard usa `!biz.autoGenerationEnabled` (no `=== false`) para cubrir cualquier valor falsy.
- Solo pasa negocios donde el valor es estrictamente `true`.
- Además existe un guard global en `app_settings`: si `auto_generation = "false"` en esa tabla, el scheduler saltea TODOS los negocios sin importar su toggle individual.

---

## Endpoints

### GET /api/businesses/:id/auto-gen
Devuelve la configuración de auto-gen de un negocio específico del usuario autenticado.

```typescript
Response: {
  autoGenerationEnabled: boolean,   // true | false — NUNCA null (columna notNull)
  generationFrequency: string,       // "7" | "15" | "30"
  businessName: string,
}
```

### PUT /api/businesses/:id/auto-gen
Guarda la configuración de auto-gen de un negocio específico.

```typescript
Body: {
  autoGenerationEnabled?: boolean,
  generationFrequency?: "7" | "15" | "30",
}
```

### PUT /api/businesses/auto-gen/disable-all
Apaga la auto-generación para TODOS los negocios activos del usuario autenticado en una sola operación.

```typescript
Response: { disabled: number }  // cuántos negocios fueron desactivados
```

**IMPORTANTE:** Esta ruta debe estar declarada ANTES de `GET /:id` en el router para evitar que "disable-all" sea interpretado como un ID numérico.

---

## Frontend — toggle en settings.tsx

**Archivo:** `artifacts/social-dashboard/src/pages/settings.tsx`

### Estado inicial correcto
```typescript
const [autoGenEnabled, setAutoGenEnabled] = useState(false);  // default OFF
```

### Al cargar la configuración del negocio
```typescript
setAutoGenEnabled(d.autoGenerationEnabled === true);  // ← CORRECTO
// NO usar: d.autoGenerationEnabled !== false  ← ANTI-PATRÓN (ver abajo)
```

### Botón "Apagar para todos"
```typescript
async function handleDisableAllAutoGen() {
  const res = await fetch(`${BASE}/api/businesses/auto-gen/disable-all`, {
    method: "PUT", credentials: "include",
  });
  // Después: recargar toggle del negocio activo con loadAutoGenSettings(bizId)
}
```

---

## Default al crear negocios

Hay DOS lugares donde se crean negocios. Ambos deben usar `false`:

| Lugar | Archivo | Campo |
|-------|---------|-------|
| Schema Drizzle | `lib/db/src/schema/businesses.ts:58` | `.default(false)` |
| Billing (pago) | `artifacts/api-server/src/routes/billing.ts:120` | `autoGenerationEnabled: false` |

Si se agrega un tercer lugar de creación de negocio, DEBE establecer `autoGenerationEnabled: false`.

---

## Backfill de producción

Cuando se despliega el cambio de default `true → false`, el schema Drizzle no modifica
datos existentes (solo cambia el default para INSERTs futuros). Para apagar los negocios
existentes se ejecuta el siguiente SQL en el post-merge setup:

```sql
UPDATE businesses SET auto_generation_enabled = false WHERE auto_generation_enabled = true;
```

Este comando es **idempotente** — puede ejecutarse múltiples veces sin efecto negativo.

---

## Anti-patrones prohibidos

### ❌ Usar `!== false` para leer el toggle
```typescript
// ❌ PROHIBIDO — si el valor es null/undefined, muestra el toggle como ON incorrectamente
setAutoGenEnabled(d.autoGenerationEnabled !== false);

// ✅ CORRECTO — solo muestra ON si el valor es explícitamente true
setAutoGenEnabled(d.autoGenerationEnabled === true);
```

### ❌ Default `true` al crear un negocio
```typescript
// ❌ PROHIBIDO — activa auto-gen sin consentimiento del usuario
autoGenerationEnabled: true,

// ✅ CORRECTO
autoGenerationEnabled: false,
```

### ❌ Guard con `=== false` en el scheduler
```typescript
// ❌ INCOMPLETO — no cubre otros valores falsy edge cases
if (biz.autoGenerationEnabled === false) { skip }

// ✅ CORRECTO — cubre false, null, undefined, 0, ""
if (!biz.autoGenerationEnabled) { skip }
```

### ❌ useState con true como default en el frontend
```typescript
// ❌ PROHIBIDO — antes de cargar del backend, el toggle muestra azul (ON)
const [autoGenEnabled, setAutoGenEnabled] = useState(true);

// ✅ CORRECTO — el estado inicial debe ser apagado hasta que el backend responda
const [autoGenEnabled, setAutoGenEnabled] = useState(false);
```

---

## Archivos clave

| Archivo | Líneas relevantes | Función |
|---------|-----------------|---------|
| `lib/db/src/schema/businesses.ts` | 58 | Columna `autoGenerationEnabled` con `default(false)` |
| `artifacts/api-server/src/routes/businesses.ts` | 802-899 | GET/PUT per-business + PUT disable-all |
| `artifacts/api-server/src/services/scheduler.service.ts` | 365-372 | Guard `!biz.autoGenerationEnabled` |
| `artifacts/api-server/src/routes/billing.ts` | 120 | `autoGenerationEnabled: false` al crear negocio desde billing |
| `artifacts/social-dashboard/src/pages/settings.tsx` | 293-381 | Toggle state + handleDisableAllAutoGen |

---

## Relación con otros skills

| Skill | Relación |
|-------|----------|
| `content-scheduler-validator` | Define CUÁNDO y CÓMO el scheduler programa posts. Este skill define SI el scheduler corre para un negocio. Son complementarios. |
| `beneficios-universales` | La auto-gen puede ser un beneficio diferenciador de plan. Verificar con este skill antes de restricciones por plan. |
