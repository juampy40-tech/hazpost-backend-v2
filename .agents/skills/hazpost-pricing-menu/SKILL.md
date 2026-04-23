# Skill: hazpost-pricing-menu

## Descripción
Componente compartido `PricingSection` que renderiza el grid de planes de HazPost.
**Regla cardinal**: NUNCA duplicar la lógica de planes fuera de `PricingSection`.
Si necesitas mostrar planes en algún lugar nuevo, usá `PricingSection`.

---

## Arquitectura

```
PricingSection (fetch + toggle + grid wrapper)
    └── PlanCard (card individual por plan)
```

`PricingSection` hace el fetch a `/api/plans`, mapea cada `ApiPlan` a `PlanCardData`,
y renderiza una grilla de `PlanCard`. Toda la lógica de presentación de la tarjeta
(features, precios, herencia de beneficios, CTA) vive en `PlanCard`.

---

## Componente: `PricingSection`

**Ruta**: `artifacts/social-dashboard/src/components/PricingSection.tsx`

### Props

```tsx
interface PricingSectionProps {
  mode: "landing" | "register" | "billing";
  onSelectPlan?: (key: string) => void;
  currentPlanKey?: string;       // mode="billing": plan activo del usuario
  selectedPlanKey?: string;      // mode="register": plan seleccionado actualmente
  annual?: boolean;              // controlled: si el padre controla el toggle
  onAnnualChange?: (val: boolean) => void;
  loadingPlanKey?: string | null;
}
```

### Comportamiento por modo

| Modo | Click en plan | PlanCard mode | Quién maneja annual |
|------|--------------|---------------|---------------------|
| `"landing"` | Navega a `/register?plan=key` | `"register"` | Interno |
| `"register"` | Llama `onSelectPlan(key)` | `"register"` | Interno |
| `"billing"` | Llama `onSelectPlan(key)` | `"billing"` | Controlado via props |

### Qué hace el componente
- Fetcha `/api/plans` una vez al montar
- Extrae `creditPack` de la respuesta para el footer
- Muestra toggle mensual/anual solo si algún plan tiene precio anual
- Skeleton durante la carga (4 tarjetas animadas)
- Mapea `ApiPlan → PlanCardData` (respetando precio anual cuando aplica)
- Pasa `inheritedFeatures` solo a planes con `includesBusinessPlan=true`
- Detecta downgrades comparando `priceCop` con el plan actual

---

## Componente: `PlanCard`

**Ruta**: `artifacts/social-dashboard/src/components/PlanCard.tsx`

### Datos clave de `PlanCardData`

```tsx
interface PlanCardData {
  key: string;
  name: string;
  priceUsd: number;      // ya resuelto (mensual o anual según toggle)
  priceCop: number;      // ya resuelto
  creditsPerMonth: number;
  resolvedFeatures?: string[];    // strings del catálogo admin (preferido)
  descriptionJson?: {
    description?: string;
    badge?: string | null;
    features?: PlanFeature[];     // fallback si no hay resolvedFeatures
  };
  includesBusinessPlan?: boolean;
  parentPlanName?: string;
  extraBusinessPriceUsd?: number;
  extraBusinessPriceCop?: number;
  extraBusinessPriceAnnualUsd?: number;
  extraBusinessPriceAnnualCop?: number;
}
```

### Lógica de features en PlanCard

1. Si `resolvedFeatures` existe y no está vacío → se usan como strings (prioridad)
2. Si no, usa `descriptionJson.features` filtrando `enabled !== false`
3. Si tampoco → fallback: `["X créditos IA/mes"]`

### Filtro de features heredadas (Agency)

Cuando `includesBusinessPlan=true`, `PlanCard` muestra la sección
"Todo lo del plan Negocio incluido" con `inheritedFeatures`.
**Los features que mencionan créditos (`/crédito|credit/i`) se filtran automáticamente**
para evitar mostrar el crédito del plan Negocio (220) en el contexto de Agencia (1100).

### CTA labels por modo

| Modo | Estado | Label |
|------|--------|-------|
| `"register"` | seleccionado | "Plan seleccionado" |
| `"register"` | gratis | "Comenzar gratis" |
| `"register"` | pago | "Elegir X" |
| `"billing"` | plan actual | "Plan actual" |
| `"billing"` | downgrade | "Plan inferior" |
| `"billing"` | gratis | "Cambiar a Gratis" |
| `"billing"` | pago | "Contratar X" |

---

## API: `GET /api/plans`

Endpoint público (sin auth). Responde:

```json
{
  "plans": [
    {
      "key": "free",
      "name": "Básico",
      "priceUsd": 0,
      "priceAnnualUsd": 0,
      "priceCop": 0,
      "priceAnnualCop": 0,
      "creditsPerMonth": 60,
      "resolvedFeatures": ["1 negocio", "60 créditos IA/mes", "..."],
      "descriptionJson": { "headline": "...", "cta": "...", "features": [...] },
      "includesBusinessPlan": false,
      "extraBusinessPriceUsd": 0,
      "extraBusinessPriceCop": 0
    }
  ],
  "creditCosts": { "image": 3, "story": 2, "carousel": 5, "reel": 8 },
  "creditPack": { "priceUsd": 19.99, "credits": 100 }
}
```

### `creditPack`
Se lee de `app_settings`:
- `credit_pack_price_usd` → precio en USD
- `credit_pack_credits` → cantidad de créditos

Si alguno es 0 o no existe, el footer dinámico NO se muestra.

---

## Dónde se usa (los 4 puntos de entrada)

| Archivo | Modo | Props principales |
|---------|------|-------------------|
| `src/pages/landing.tsx` | `"landing"` | ninguna (autónomo) |
| `src/pages/register.tsx` | `"register"` | `selectedPlanKey`, `onSelectPlan` |
| `src/pages/billing.tsx` | `"billing"` | `currentPlanKey`, `onSelectPlan`, `loadingPlanKey`, `annual`, `onAnnualChange` |
| `src/pages/pricing.tsx` | `"billing"` | `currentPlanKey`, `onSelectPlan`, `loadingPlanKey` |

---

## Cómo agregar un nuevo lugar donde mostrar planes

```tsx
import { PricingSection } from "@/components/PricingSection";

// En tu componente:
<PricingSection
  mode="billing"           // o "register" / "landing"
  currentPlanKey={user.plan}
  onSelectPlan={handleSelect}
  loadingPlanKey={loadingPlan}
/>
```

NO hagas fetch de `/api/plans` en el componente padre — `PricingSection` lo hace solo.

---

## Archivos clave

```
artifacts/social-dashboard/src/components/PricingSection.tsx  ← fetch + toggle + grid
artifacts/social-dashboard/src/components/PlanCard.tsx        ← tarjeta individual
artifacts/api-server/src/routes/index.ts                      ← GET /api/plans
```
