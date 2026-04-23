---
name: business-selector-rules
description: Regla de arquitectura HazPost sobre selectores de negocio en el frontend. Úsalo ANTES de agregar o modificar cualquier selector de negocio en páginas del frontend (settings.tsx, generate.tsx, approval.tsx, niches.tsx, backgrounds.tsx), o antes de inicializar cualquier estado que dependa del negocio activo, o antes de hacer cualquier query de posts desde el frontend. Define el negocio global activo, ActiveBusinessContext, el hook useBusinessPosts (obligatorio para queries de posts), y los antipatrones prohibidos.
---

# Business Selector Rules — HazPost

## Regla fundamental

**Toda página del frontend SIEMPRE debe mostrar el negocio global activo al cargar.**

El usuario puede cambiar temporalmente el negocio dentro de una sección específica (ej: el dropdown de Elementos en Configuración), pero al navegar a cualquier otra página o regresar, el sistema **resetea automáticamente** al negocio global activo.

**Objetivo:** evitar confusión. Si el usuario opera principalmente el Negocio 1, todo debe comportarse como Negocio 1 sin importar qué exploró antes.

---

## Negocio global activo

El negocio global activo es el negocio con `isDefault = true` en la tabla `businesses`. Se actualiza en la DB cuando el usuario cambia de negocio en el sidebar (endpoint `POST /api/businesses/:id/set-active`), que además ejecuta `window.location.reload()`.

**Fuente de verdad:** `GET /api/businesses` → `businesses.find(b => b.isDefault) ?? businesses[0]`

---

## Mecanismo centralizado — ActiveBusinessContext

El negocio global activo se expone a través de un Context centralizado que realiza **un único fetch** a `/api/businesses` para toda la aplicación. Cada página consume este context en lugar de hacer su propio fetch.

### Ubicación

`artifacts/social-dashboard/src/contexts/ActiveBusinessContext.tsx`

### Uso en páginas (patrón correcto)

```typescript
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";

// En el componente:
const { id: activeBusinessId } = useActiveBusiness();
// o con más datos:
const { id, name, industry } = useActiveBusiness();
```

### Tipo retornado

```typescript
interface ActiveBusiness {
  id: number | undefined;       // undefined mientras carga
  name: string | undefined;
  industry: string | null | undefined;
}
```

### Dónde está registrado el Provider

En `App.tsx`, dentro de `<ProtectedRoute>` y fuera de `<AppLayout>`, aplica a todas las rutas protegidas:

```tsx
<ProtectedRoute>
  <ActiveBusinessProvider>
    <OnboardingGuard>
      <AppLayout>
        {/* todas las rutas del dashboard */}
      </AppLayout>
    </OnboardingGuard>
  </ActiveBusinessProvider>
</ProtectedRoute>
```

---

## Hook centralizado para queries de posts — `useBusinessPosts`

**Archivo**: `artifacts/social-dashboard/src/hooks/useBusinessPosts.ts`

### Regla OBLIGATORIA (VM-4a — Task #317)

> **Toda query de posts desde el frontend DEBE usar `useBusinessPosts` en lugar de `useGetPosts`.**  
> `useBusinessPosts` inyecta automáticamente el `businessId` del negocio activo del usuario.  
> Usar `useGetPosts` directamente desde una página es un ANTI-PATRÓN — devuelve posts de todos los negocios mezclados.

```typescript
// ✅ CORRECTO — inyecta businessId automáticamente
import { useBusinessPosts } from "@/hooks/useBusinessPosts";
const { data: posts } = useBusinessPosts({ status: 'pending_approval,scheduled', slim: '1' });

// ❌ PROHIBIDO — sin businessId, mezcla posts de todos los negocios
import { useGetPosts } from "@workspace/api-client-react";
const { data: posts } = useGetPosts({ status: 'pending_approval,scheduled', slim: '1' } as any);
```

El hook funciona esperando a que `ActiveBusinessContext` provea el `id`. Mientras carga (id=undefined), no inyecta el parámetro. En cuanto el context resuelve, el hook re-ejecuta la query con `businessId` correcto.

---

## Páginas con selector de negocio — estado al 2026-04

| Página | Patrón actual | ¿Selector local? | ¿Usa ActiveBusinessContext? | ¿Usa useBusinessPosts? |
|--------|---------------|------------------|------------------------------|------------------------|
| `generate.tsx` | `useActiveBusiness()` del context | No | ✅ Sí | N/A — no usa useGetPosts |
| `settings.tsx` | `useState` inicializado desde context | Sí — dropdown en Elementos | ✅ Sí | N/A |
| `approval.tsx` | Fetch propio (necesita datos adicionales: logo, colores, fuentes) | No | ⚠️ No (ver nota) | ✅ Sí |
| `niches.tsx` | `useActiveBusiness()` del context | No | ✅ Sí | N/A |
| `backgrounds.tsx` | `useActiveBusiness()` del context | No | ✅ Sí | N/A |
| `dashboard.tsx` | `useActiveBusiness()` via hook | No | ✅ Sí (via hook) | ✅ Sí |
| `calendar.tsx` | `useActiveBusiness()` del context | Sí — scope global/biz | ✅ Sí | N/A — usa fetch directo con businessId + credentials |
| `analytics.tsx` | Backend filtra por `getActiveBusinessId()` (server-side) | No | ✅ Sí (para nombre del negocio) | N/A — usa `useGetAnalyticsSummary` (gen.) + fetches con credentials |

> **Nota sobre approval.tsx:** Esta página necesita muchos más datos del negocio (logo, colores, fuente, firma, etc.) que los que provee el context. Por esta razón mantiene su propio fetch a `/api/businesses`. Sin embargo, usa `useBusinessPosts` para filtrar correctamente los posts de la cola.

---

## Caso especial: settings.tsx con dropdown local

La sección "Elementos de Marca" en Configuración tiene un dropdown que permite explorar los elementos de cualquier negocio. El patrón correcto es:

```typescript
const { id: globalBusinessId } = useActiveBusiness();
const [activeBusinessId, setActiveBusinessId] = useState<number | null>(null);

// Inicializar desde el context (solo una vez, cuando llega el ID global)
useEffect(() => {
  if (globalBusinessId != null && activeBusinessId == null) {
    setActiveBusinessId(globalBusinessId);
  }
}, [globalBusinessId]);

// Fetch de la lista completa para el dropdown (sin determinar isDefault aquí)
useEffect(() => {
  fetch(`${BASE}/api/businesses`, { credentials: "include" })
    .then(r => r.json())
    .then((d) => {
      setElBusinessList((d.businesses ?? []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })));
    })
    .catch(() => {});
}, []);
```

---

## Antipatrones PROHIBIDOS

```typescript
// ❌ NUNCA: llamar useGetPosts directamente desde una página (mezcla posts de todos los negocios)
import { useGetPosts } from "@workspace/api-client-react";
const { data: posts } = useGetPosts({ slim: '1' } as any);  // falta businessId

// ✅ SIEMPRE: usar el hook centralizado
import { useBusinessPosts } from "@/hooks/useBusinessPosts";
const { data: posts } = useBusinessPosts({ slim: '1' });  // businessId inyectado automáticamente

// ❌ NUNCA: crear un hook local por página que haga su propio fetch a /api/businesses
function useActiveBusinessId(): number | undefined { ... }  // Eliminar

// ❌ NUNCA: recordar la selección local entre navegaciones
localStorage.setItem("lastBusinessId", String(selectedId));

// ❌ NUNCA: inicializar con el primer negocio ignorando isDefault
const active = businesses[0];  // Incorrecto

// ❌ NUNCA: extender el context para incluir una selección local
//   que persista entre navegaciones — el context solo refleja isDefault

// ❌ NUNCA: redirigir a OAuth sin pasar businessId (conecta la cuenta al negocio equivocado)
window.location.href = `${BASE}/api/auth/meta/redirect`;  // falta ?businessId=X

// ✅ CORRECTO: pasar el negocio activo al redirect OAuth
const biz = activeBusinessId ? `?businessId=${activeBusinessId}` : "";
window.location.href = `${BASE}/api/auth/meta/redirect${biz}`;
```

---

## Regla de oro para futuros cambios

> Si agregas un selector de negocio a una nueva página, usa `useActiveBusiness()` del context como valor inicial. No hagas tu propio fetch a `/api/businesses` para obtener el isDefault. Si necesitas cambiar el negocio globalmente, hazlo a través del sidebar (que actualiza `isDefault` en DB y recarga la página).
