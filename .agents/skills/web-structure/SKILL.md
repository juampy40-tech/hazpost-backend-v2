---
name: web-structure
description: >
  Fuente de verdad para registrar páginas, rutas y endpoints nuevos en HazPost.
  Úsala ANTES de crear cualquier archivo nuevo en pages/, components/, o routes/.
  Define el patrón exacto de 3 pasos para el frontend y 2 pasos para el backend.
  Incluye la lista completa de rutas actuales, secciones del sidebar y patrones de auth.
---

# Estructura centralizada de la web — HazPost

## Regla de Oro

> Cualquier feature nuevo que toque el frontend o el backend DEBE seguir los patrones de este
> skill. Si la página no está registrada en App.tsx, no existe. Si el router no está en
> index.ts, el endpoint no existe.

---

## FRONTEND — Cómo agregar una nueva página al dashboard

**3 pasos obligatorios. Si falta alguno, la página no aparece o el sidebar queda roto.**

### Paso 1 — Crear el componente de página

```
artifacts/social-dashboard/src/pages/mi-nueva-pagina.tsx
```

- Exportar por defecto un componente React
- Seguir el patrón de páginas existentes (ej: `settings.tsx`, `approval.tsx`)
- No incluir layout/sidebar — lo provee `AppLayout` automáticamente

### Paso 2 — Registrar la ruta en App.tsx

**Archivo:** `artifacts/social-dashboard/src/App.tsx`

**Para páginas de usuario autenticado con onboarding completo (la mayoría):**
```tsx
// Dentro del bloque <ProtectedRoute><OnboardingGuard><AppLayout><Switch>
<Route path="/mi-ruta" component={MiNuevaPagina} />
```
También agregar el import al inicio del archivo:
```tsx
import MiNuevaPagina from "@/pages/mi-nueva-pagina";
```

**Para páginas solo de admin (sub-rutas del panel admin independientes):**
```tsx
// Mismo bloque protegido — las rutas /admin/* ya están bajo el bloque protegido
<Route path="/admin/mi-seccion" component={MiSeccionAdmin} />
```

**Para páginas públicas (sin autenticación):**
```tsx
// En la sección "Public pages", fuera de cualquier ProtectedRoute
<Route path="/mi-pagina-publica" component={MiPaginaPublica} />
```

### Paso 3 — Agregar al sidebar en layout.tsx (solo si tiene entrada en el menú)

**Archivo:** `artifacts/social-dashboard/src/components/layout.tsx`

**Sección "Módulos" (array `menuItems`, línea ~12):**
```typescript
const menuItems = [
  { title: "Panel", icon: LayoutDashboard, url: "/dashboard" },
  // ... items existentes ...
  { title: "Mi Sección", icon: NombreIconoLucide, url: "/mi-ruta" },
];
```

**Opciones disponibles por item del menuItems:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `title` | `string` | Texto visible en el sidebar |
| `icon` | `LucideIcon` | Ícono de la librería Lucide React |
| `url` | `string` | Ruta exacta registrada en App.tsx |
| `adminOnly` | `boolean` | Si `true`, solo se muestra a usuarios con `role === "admin"` |
| `activeUrls` | `string[]` | Rutas adicionales que también activan el highlight de este item |

**Agregar el ícono al import de Lucide (línea 4 de layout.tsx):**
```tsx
import { LayoutDashboard, Calendar, ..., NuevoIcono } from "lucide-react";
```

### ⚠️ Regla absoluta
SIEMPRE los 3 pasos en la misma implementación.
- Nunca crear solo el componente sin la ruta
- Nunca agregar item al sidebar sin la ruta en App.tsx

---

## Estructura del sidebar (secciones actuales)

El sidebar tiene 4 secciones en `layout.tsx`. Cada una tiene su propio patrón:

### Sección 1 — "Módulos" (array `menuItems`, dinámico, con `adminOnly`)
Controlada por el array `menuItems` + filtro `.filter(item => !item.adminOnly || user?.role === "admin")`.
Para agregar aquí: añadir objeto al array `menuItems`.

### Sección 2 — "Crecer" (array inline dentro del JSX, con condición por plan)
```tsx
{ title: "Referidos", icon: Gift, url: "/referidos" },
{ title: "Afiliados", icon: Handshake, url: "/afiliados" },
// Solo agency o admin:
...(user?.plan === "agency" || user?.role === "admin" ? [{ title: "Recursos Agencia", ... }] : []),
```
Para agregar aquí: modificar el array inline en el JSX de AppLayout (~línea 294).

### Sección 3 — "Agencia" (solo si `user.plan === "agency" || user.role === "admin"`)
Contiene "Mis Negocios" → `/businesses`.
Para agregar aquí: modificar el bloque condicional en AppLayout (~línea 318).

### Sección 4 — "Admin" (solo si `user.role === "admin"`)
```tsx
{ title: "Usuarios", icon: ShieldAlert, url: "/admin" },
{ title: "Panel de Control", icon: Activity, url: "/admin/metricas" },
{ title: "Monitor Backend", icon: RefreshCw, url: "/admin/monitor" },
```
Para agregar una nueva sección admin al sidebar: modificar el array inline en el bloque `user?.role === "admin"` (~línea 338).

---

## Lista completa de rutas actuales (actualizar al agregar nuevas)

### Rutas en App.tsx bajo `<ProtectedRoute><OnboardingGuard><AppLayout>`
| Ruta | Componente | En sidebar |
|------|-----------|-----------|
| `/dashboard` | `Dashboard` | ✓ Módulos |
| `/calendar` | `Calendar` | ✓ Módulos |
| `/approval` | `Approval` | ✓ Módulos |
| `/generate` | `Generate` | ✓ Módulos |
| `/niches` | `Niches` | ✓ Módulos |
| `/caption-addons` | `CaptionAddons` | — |
| `/history` | `History` | ✓ Módulos |
| `/analytics` | `Analytics` (adminOnly) | ✓ Módulos (adminOnly) |
| `/backgrounds` | `Backgrounds` | ✓ Módulos |
| `/landings` | `Landings` | ✓ Módulos (adminOnly) |
| `/chatbot` | `Chatbot` | ✓ Módulos (adminOnly) |
| `/settings` | `Settings` | ✓ Módulos |
| `/businesses` | `Businesses` | ✓ Agencia |
| `/referidos` | `Referidos` | ✓ Crecer |
| `/afiliados` | `Afiliados` | ✓ Crecer |
| `/recursos` | `Recursos` | ✓ Crecer (agency+) |
| `/admin/metricas` | `AdminMetrics` | ✓ Admin |
| `/admin/monitor` | `AdminMonitor` | ✓ Admin |
| `/admin/plantillas` | `AdminContentTemplates` | — |
| `/profile` | `Profile` | — |
| `/credits` | `Credits` | — |
| `/billing` | `Billing` | ✓ Módulos (activeUrls) |

### Rutas bajo `<AppLayout>` directo (sin OnboardingGuard)
| Ruta | Componente | Notas |
|------|-----------|-------|
| `/admin` | `Admin` | Panel admin principal |

### Rutas bajo `<ProtectedRoute>` sin AppLayout
| Ruta | Componente | Notas |
|------|-----------|-------|
| `/onboarding` | `Onboarding` | Sin layout — flujo standalone |

### Rutas públicas (sin autenticación)
```
/ → Landing
/features → Features
/about → About
/privacy-policy → PrivacyPolicy
/terms-of-service → TermsOfService
/tiktok-guide → TikTokGuide
/data-deletion → DataDeletion
/verify-email → VerifyEmail
/login → Login
/register → Register
/reset-password → ResetPassword
/pricing → Pricing
```

---

## BACKEND — Cómo agregar un nuevo router de API

**2 pasos obligatorios.**

**Archivo central de registro:** `artifacts/api-server/src/routes/index.ts`

### Paso 1 — Crear el archivo de router

```
artifacts/api-server/src/routes/mi-recurso.ts
```

**Patrón base (ruta protegida de usuario):**
```typescript
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "@workspace/db";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const uid = req.user!.userId;
    // ...
    res.json({ data: [] });
  } catch {
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;
```

**Para rutas solo de admin:**
```typescript
import { requireAdmin } from "../lib/auth.js";

const router = Router();
router.use(requireAdmin); // aplica requireAdmin a TODAS las rutas del router
// ...
export default router;
```

### Paso 2 — Registrar en index.ts

```typescript
// 1. Agregar import al inicio del archivo (con extensión .js aunque el archivo sea .ts)
import miRecursoRouter from "./mi-recurso.js";

// 2. Montar el router en la sección correcta:

// Ruta de usuario autenticado:
router.use("/mi-recurso", requireAuth, miRecursoRouter);

// Ruta de admin:
router.use("/admin/mi-recurso", requireAdmin, miRecursoRouter);

// Ruta con upload (body > 10mb):
router.use("/mi-recurso", requireAuth, uploadBodyParser, miRecursoRouter);

// Ruta con rate limit de IA:
router.post("/mi-recurso/generar", requireAuth, aiGenerationRateLimit);
router.use("/mi-recurso", requireAuth, miRecursoRouter);
```

### Secciones de index.ts (referencia de líneas)
| Sección | Línea aprox. | Para qué |
|---------|-------------|---------|
| Rutas públicas | ~66–84 | Sin auth — login, register, health, música |
| Rutas de usuario autenticado | ~201–253 | Protegidas con `requireAuth` |
| Rutas de admin | ~228–243 | Protegidas con `requireAdmin` |

### ⚠️ Regla de extensión .js en imports
**SIEMPRE usar `.js` en imports del backend aunque el archivo sea `.ts`:**
```typescript
// ✅ Correcto (TypeScript ESM)
import miRouter from "./mi-recurso.js";

// ❌ Incorrecto — falla en runtime
import miRouter from "./mi-recurso";
import miRouter from "./mi-recurso.ts";
```

---

## Patrones de autenticación en el frontend

| Situación | Patrón |
|-----------|--------|
| Página pública | `<Route path="/ruta" component={Comp} />` (fuera de ProtectedRoute) |
| Usuario autenticado + onboarding | Dentro del bloque `<ProtectedRoute><OnboardingGuard><AppLayout>` |
| Solo admin (item en sidebar) | `adminOnly: true` en el objeto del `menuItems` |
| Solo admin (ruta con redirect) | `<ProtectedRoute adminOnly adminRedirectTo="/credits"><MiPagina /></ProtectedRoute>` |
| Panel admin sin OnboardingGuard | `<Route path="/admin"><AppLayout><Admin /></AppLayout></Route>` |
| Onboarding (flujo sin layout) | `<Route path="/onboarding"><ProtectedRoute><Onboarding /></ProtectedRoute></Route>` |

---

## Regla de BASE_URL — obligatoria en todos los fetch del frontend

Todas las llamadas `fetch` al API deben usar `BASE_URL` como prefijo:
```typescript
// Patrón correcto (usado en layout.tsx y todas las páginas)
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const res = await fetch(`${BASE}/api/mi-recurso`, { credentials: "include" });
```

**NUNCA usar rutas hardcoded sin `${BASE}`** — el dashboard vive en una ruta base proxied
y en producción las rutas absolutas como `/api/...` fallan.

---

## Estructura de carpetas del frontend

```
artifacts/social-dashboard/src/
  App.tsx                   ← RUTAS: paso 2 de cualquier página nueva
  components/
    layout.tsx              ← SIDEBAR menuItems: paso 3 de cualquier página nueva
    ui/                     ← Componentes Shadcn/UI (no tocar sin razón)
    ProtectedRoute.tsx      ← Guard de autenticación
    OnboardingGuard.tsx     ← Guard de onboarding completo
    ErrorBoundary.tsx       ← Wrapper global de errores
  pages/                    ← Componentes de página: paso 1 de cualquier página nueva
  contexts/
    AuthContext.tsx         ← Estado global de sesión, user, subscription
  hooks/                    ← Hooks personalizados reutilizables
  lib/
    queryClient.ts          ← TanStack Query client (React Query)
```

---

## Errores comunes

| Error | Consecuencia | Solución |
|-------|-------------|----------|
| Crear página sin registrar ruta en App.tsx | La página existe pero es inaccesible | Agregar `<Route>` + import |
| Agregar item al sidebar sin ruta en App.tsx | Click en sidebar lanza 404/NotFound | Registrar ruta primero |
| Usar `/api/ruta` sin `${BASE}` en fetch | Falla en producción | Siempre `${BASE}/api/...` |
| Montar router sin `requireAuth` en index.ts | Endpoint expuesto sin protección | Agregar `requireAuth` |
| Olvidar `.js` en imports del backend | `Error: Cannot find module` en runtime | Usar `.js` siempre |
| Agregar page import en App.tsx pero olvidar la `<Route>` | Build exitoso, página inaccesible | Agregar el `<Route>` |

---

## Cuándo actualizar esta skill

Actualizar la tabla de rutas y/o secciones del sidebar en este SKILL.md cada vez que:
- Se agrega una nueva sección permanente al dashboard (nueva entrada en sidebar)
- Se agrega un nuevo grupo de endpoints (nuevo router en index.ts)
- Cambia la estructura de autenticación o se agrega un nuevo tipo de guard

---

## Nota sobre el sidebar: arquitectura multi-sección

El sidebar de HazPost tiene **4 secciones separadas**, cada una gestionada de forma diferente
en `layout.tsx`. El array `menuItems` controla solo la sección "Módulos":

| Sección | Controlada por | Condición de visibilidad |
|---------|---------------|--------------------------|
| **Módulos** | Array `menuItems` + filtro `adminOnly` | Todos los usuarios; items `adminOnly` solo para admin |
| **Crecer** | Array inline en JSX (~línea 294) | Todos; "Recursos Agencia" solo para `agency` o `admin` |
| **Agencia** | Bloque condicional en JSX (~línea 318) | Solo `user.plan === "agency"` o `user.role === "admin"` |
| **Admin** | Array inline en JSX (~línea 338) | Solo `user.role === "admin"` |

**Regla**: para agregar a "Módulos" → usar `menuItems`. Para las demás secciones, modificar
el JSX inline correspondiente en `AppLayout` dentro de `layout.tsx`.
