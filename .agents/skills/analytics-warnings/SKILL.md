---
name: analytics-warnings
description: Reglas para mostrar advertencias y banners en la página de Estadísticas (analytics.tsx) de HazPost. Úsalo ANTES de agregar, modificar o eliminar cualquier banner de advertencia en analytics.tsx. Define cuándo mostrar el banner de permisos de Meta, el anti-patrón de activarlo solo con métricas 0, y el patrón correcto con verificación de conexión.
---

# Skill: Warnings y banners en Estadísticas — HazPost

## Regla fundamental: verificar conexión antes de mostrar advertencias de permisos

El banner de "faltan permisos de Meta" en `analytics.tsx` **solo debe aparecer si el negocio
activo tiene Meta/Instagram conectado**. Si no hay cuenta conectada, es normal que no haya
métricas de engagement — el banner es un falso positivo y genera confusión.

---

## Banner de permisos de Meta

**Archivo**: `artifacts/social-dashboard/src/pages/analytics.tsx`
**Línea aproximada**: ~715 (buscar el comentario `{/* Permissions warning */}`)

### Condición correcta

```tsx
{ov.published > 0 && ov.likes === 0 && ov.reach === 0 && hasMetaConnected && (
  <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 flex gap-3">
    ...banner...
  </div>
)}
```

### Anti-patrón (causa false positives)

```tsx
{/* ❌ NUNCA — activa el banner aunque el usuario no tenga Meta conectado */}
{ov.published > 0 && ov.likes === 0 && ov.reach === 0 && (
```

---

## Cómo computar `hasMetaConnected`

Se necesitan 2 variables de estado más el cómputo derivado, igual al patrón V-WARN de `generate.tsx`:

### State y fetch

```tsx
const [socialAccounts, setSocialAccounts] = useState<Array<{
  id: number; platform: string; username: string | null;
  businessId: number | null; connected?: string;
}>>([]);
const [socialAccountsLoaded, setSocialAccountsLoaded] = useState(false);

React.useEffect(() => {
  fetch(`${BASE}/api/social-accounts`, { credentials: "include" })
    .then(r => r.json())
    .then((d) => { setSocialAccounts(d.accounts ?? []); setSocialAccountsLoaded(true); })
    .catch(() => setSocialAccountsLoaded(true));
}, []);
```

### Cómputo de hasMetaConnected

```tsx
// Debe tener en cuenta el scope de analytics (negocio específico vs todos)
const hasMetaConnected = !socialAccountsLoaded ? false
  : analyticsBizScope === "all"
    ? socialAccounts.some(a =>
        (a.platform === "instagram" || a.platform === "both") && a.connected === "true")
    : socialAccounts.some(a =>
        a.businessId === analyticsBizScope &&
        (a.platform === "instagram" || a.platform === "both") &&
        a.connected === "true");
```

**Notas importantes**:
- `analyticsBizScope === "all"` → cualquier cuenta Meta conectada activa el banner
- `analyticsBizScope === <number>` → solo la cuenta conectada para ese negocio específico
- `socialAccountsLoaded === false` → `hasMetaConnected = false` (no mostrar hasta tener certeza)

---

## Tabla de comportamiento esperado

| ¿Meta conectado? | published > 0 | likes === 0 | reach === 0 | ¿Se muestra el banner? |
|-----------------|---------------|-------------|-------------|------------------------|
| No | Cualquiera | Cualquiera | Cualquiera | ❌ No (normal, no hay Meta) |
| Sí | Sí | Sí | Sí | ✅ Sí (permisos faltantes) |
| Sí | Sí | No | Cualquiera | ❌ No (hay métricas) |
| Sí | No | Sí | Sí | ❌ No (no hay posts publicados) |
| Cargando... | Cualquiera | Cualquiera | Cualquiera | ❌ No (esperar a cargar) |

---

## Relación con otros patterns de warnings en HazPost

| Página | Banner | Condición | Fuente de verdad |
|--------|--------|-----------|-----------------|
| `generate.tsx` | Sin cuentas sociales (V-WARN) | `!socialAccounts.some(a => a.businessId === bizId && a.connected === "true")` | Patrón original |
| `approval.tsx` | Sin cuentas sociales | Mismo patrón con `currentPost?.businessId ?? globalBizId` | Derivado de V-WARN |
| `dashboard.tsx` | Sin cuentas sociales | Mismo patrón con `globalBizId` | Task #338 |
| `analytics.tsx` | Permisos Meta insuficientes | `ov.published > 0 && likes === 0 && reach === 0 && hasMetaConnected` | Este skill |

**Diferencia clave**: el banner de analytics es el ÚNICO que se muestra cuando SÍ hay conexión Meta (verifica permisos), mientras que los otros se muestran cuando NO hay conexión.

---

## Criterios de aceptación

- [ ] El banner NO aparece para el negocio "ECO Energía Solar" si no tiene Meta conectado
- [ ] El banner SÍ aparece si el negocio tiene Instagram conectado (connected='true') y las métricas son 0
- [ ] Con `analyticsBizScope === "all"`, el banner aplica si HAY alguna cuenta Meta conectada y métricas 0
- [ ] Mientras se cargan las cuentas (`socialAccountsLoaded === false`), el banner está oculto
- [ ] Ninguna otra funcionalidad de analytics.tsx fue afectada
