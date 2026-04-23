---
name: plan-descriptions-cms
description: Fuente única de verdad para los beneficios/características de planes en HazPost. Lo que el admin activa en el CMS de planes es EXACTAMENTE lo que se muestra en la landing, en facturación y dentro de la plataforma. Úsalo antes de modificar cualquier endpoint o frontend que muestre características de planes.
---

# HazPost — Plan Features: Single Source of Truth

## Regla fundamental
**Lo que el admin activa en el panel admin = lo que ve el usuario en TODO lugar:**
- Landing pública (`/`)
- Pantalla de facturación dentro de la plataforma
- Selección de plan al registrarse
- Cualquier pantalla futura que muestre comparación de planes

Nunca hardcodear features de planes en el frontend. Siempre leer del API.

---

## Arquitectura de datos

### Tabla `plans` — columna `description_json JSONB`
Contiene el array `features[]` con entradas de dos tipos:

**Tipo 1 — Catálogo** (sistema nuevo, prioritario):
```json
{ "catalogKey": "ai_credits", "enabled": true, "value": "40" }
{ "catalogKey": "scheduling", "enabled": false, "value": null }
```

**Tipo 2 — Legacy (texto libre)** (sistema anterior, fallback):
```json
{ "text": "40 créditos/mes", "enabled": true }
{ "text": "Programación de posts", "enabled": true }
```

### Tabla `plan_benefit_catalog`
Define los items disponibles del catálogo. Campos relevantes:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `key` | string | Identificador único (ej: `ai_credits`, `scheduling`) |
| `labelTemplate` | string | Texto con variables: `"Créditos de IA por mes: {value}"` o `"Generación automática de contenido"` |
| `hasValue` | boolean | Si necesita un valor configurable (`{value}` en el template) |
| `isAuto` | boolean | Si el valor se toma automáticamente de columnas del plan |

### Valores automáticos (isAuto = true)
Cuando `isAuto: true`, el valor no lo ingresa el admin manualmente — se toma del plan:
| catalogKey | Fuente |
|-----------|--------|
| `ai_credits` | `plan.creditsPerMonth` |
| `reels_per_month` | `plan.reelsPerMonth` |
| `businesses` | `plan.businessesAllowed` |

---

## Regla de prioridad (sin duplicados)

```
SI hay al menos un item de catálogo con enabled: true
  → mostrar SOLO los items de catálogo habilitados (resolvedFeatures)
  → ignorar completamente el legacy text para evitar duplicados

SI no hay ningún item de catálogo habilitado (o no hay catálogo configurado)
  → fallback a legacy text (items con enabled: true y campo "text")
  → si tampoco hay legacy, mostrar defaults hardcodeados del frontend
```

Esta regla **debe aplicarse en todos los endpoints** que exponen features de planes.

---

## Endpoints que resuelven features

### `GET /api/plans` — público, sin auth
Archivo: `artifacts/api-server/src/routes/index.ts`

Retorna cada plan con `resolvedFeatures: string[]` — array de textos ya listos para mostrar.

```typescript
// Lógica de resolución (función resolvePublicFeatureText):
const enabledCatalogFeatures = rawFeatures
  .filter(f => f.catalogKey && f.enabled !== false)
  .map(f => resolvePublicFeatureText(f, catalogMap, autoValues))
  .filter(Boolean);

const resolvedFeatures = enabledCatalogFeatures.length > 0
  ? enabledCatalogFeatures
  : rawFeatures
      .filter(f => !f.catalogKey)  // solo legacy
      .map(f => resolvePublicFeatureText(f, catalogMap, autoValues))
      .filter(Boolean);
```

### `GET /api/billing/plans` — requiere auth
Archivo: `artifacts/api-server/src/routes/billing.ts`

Retorna `features: string[]` con exactamente la misma lógica (función `resolveFeatureText`).

### `GET /api/billing/me` — requiere auth
Archivo: `artifacts/api-server/src/routes/billing.ts`

Retorna features del plan actual del usuario autenticado.

---

## ADVERTENCIA: código duplicado

Actualmente hay **dos funciones casi idénticas**:
- `resolvePublicFeatureText` en `index.ts`
- `resolveFeatureText` en `billing.ts`

**Si modificás la lógica de resolución, debés aplicar el cambio en AMBOS archivos.**

Mejora futura recomendada: extraer a un helper compartido en `lib/db/src/` o `lib/utils/`.

---

## Dónde se consumen las features (frontend)

### Landing pública — `artifacts/social-dashboard/src/pages/landing.tsx`
```typescript
// Usa resolvedFeatures si tiene items; si no, fallback a legacy
const resolved = Array.isArray(api.resolvedFeatures)
  ? api.resolvedFeatures.map(s => s?.trim()).filter(Boolean)
  : [];

if (resolved.length > 0) {
  feats = resolved;
} else {
  // fallback legacy: descriptionJson.features con campo "text"
  const djFeats = dj?.features
    .filter(f => f.enabled !== false)
    .map(f => f.text)
    .filter(Boolean);
  feats = djFeats.length ? djFeats : DEFAULT_PLANS_FALLBACK;
}
```

### Pantalla de facturación — `artifacts/social-dashboard/src/pages/billing.tsx`
Lee `resolvedFeatures` del mismo endpoint `GET /api/plans` (mismo que la landing).

### Panel admin — `artifacts/social-dashboard/src/pages/admin.tsx`
Sección "CMS de Planes — Descripciones y Beneficios":
- Muestra checklist de TODOS los items del catálogo (activados/desactivados)
- Muestra sección separada para features legacy (texto libre, preservados durante migración)
- Al guardar: persiste en `plans.description_json.features`

---

## Flujo cuando el admin configura un plan

1. Admin abre sección "CMS de Planes" en `/admin`
2. Para cada plan ve:
   - Checklist de beneficios del catálogo (marca los que quiere mostrar, agrega valor si aplica)
   - Lista de features legacy (texto libre, pueden editar o eliminar)
3. Al guardar → `PUT /api/admin/plans/:key` con `{ descriptionJson: { features: [...] } }`
4. El `descriptionJson.features` queda con: `[...todos los catalog items (enabled o no)...,...legacyFeatures]`
5. Los cambios se reflejan **inmediatamente** en landing y dentro de la plataforma (sin caché)

---

## Archivos clave

```
artifacts/api-server/src/routes/index.ts          ← GET /api/plans + resolvePublicFeatureText
artifacts/api-server/src/routes/billing.ts         ← GET /api/billing/plans + resolveFeatureText
artifacts/social-dashboard/src/pages/landing.tsx   ← landing pública (consume resolvedFeatures)
artifacts/social-dashboard/src/pages/billing.tsx   ← pantalla billing in-app
artifacts/social-dashboard/src/pages/admin.tsx     ← CMS del admin (sección "CMS de Planes")
lib/db/src/schema/plans.ts                         ← esquema DB (tabla plans + plan_benefit_catalog)
```

---

## Créditos por plan — regla crítica

### NUNCA hardcodear créditos por plan en código
**Bug histórico (corregido en Task #180):** `user.ts` tenía 3 instancias de:
```typescript
const creditsMap = { free: 30, starter: 90, business: 200, agency: 500 };
const credits = creditsMap[plan] ?? 30;
```
Esto ignoraba completamente `plans.credits_per_month` configurado por el admin.

**Patrón correcto — siempre leer de DB:**
```typescript
const [planRow] = await db.select({ creditsPerMonth: plansTable.creditsPerMonth })
  .from(plansTable).where(eq(plansTable.key, plan)).limit(1);
const credits = planRow?.creditsPerMonth ?? 40;  // fallback razonable: 40, no 30
```

### Backfill automático al arrancar el servidor
Si el admin cambia `credits_per_month` para un plan (ej: free 30→40), el servidor aplica
automáticamente al iniciar un backfill que actualiza `subscriptions.credits_total` y
`credits_remaining` para los usuarios activos cuyo `credits_total < plan.credits_per_month`.
El backfill está en `artifacts/api-server/src/index.ts`, función `runStartupMigrations`.

---

## Billing page — usar `resolvedFeatures`, NO `descriptionJson.features` raw

**Bug histórico (corregido en Task #180):** `billing.tsx` usaba:
```tsx
{(currentPlanData.descriptionJson.features as PlanFeature[]).filter(f => f.enabled).map(f => f.text)}
```
Los items de catálogo tienen `catalogKey` pero **no tienen campo `text`**, causando chulos ✓ en blanco.

**Código correcto:**
```tsx
{currentPlanData!.resolvedFeatures && currentPlanData!.resolvedFeatures.length > 0
  ? currentPlanData!.resolvedFeatures.map((feat, i) => <li>{feat}</li>)
  : (currentPlanData!.descriptionJson?.features as PlanFeature[] ?? [])
      .filter(f => f.enabled && f.text?.trim())
      .map((f, i) => <li>{f.text}</li>)
}
```

`resolvedFeatures` ya llega correctamente resuelto desde `GET /api/plans` (catálogo + legacy).

---

## Checklist para nuevas pantallas que muestren features de planes

- [ ] Leer del API, nunca hardcodear
- [ ] Usar `resolvedFeatures` (del `GET /api/plans`) o `features` (del `GET /api/billing/plans`)
- [ ] Aplicar la regla de prioridad: catálogo habilitado > legacy > defaults
- [ ] Si el array viene vacío, mostrar fallback razonable (no pantalla en blanco)
- [ ] No mostrar catalog items con `enabled: false`
- [ ] Nunca leer créditos de un map hardcodeado — siempre consultar `plans.credits_per_month` en DB
