---
name: element-library-rules
description: Reglas estrictas de arquitectura de la Biblioteca de Elementos de Marca (business_elements) en HazPost. Úsalo ANTES de modificar endpoints /api/elements, la composición Sharp en ai.service.ts, el endpoint /apply-elements en posts.ts, o el panel "Elementos de marca" en approval.tsx. Cubre límites, ownership, flujo de composición, orden de capas y campos clave.
---

# Element Library Rules — HazPost

## Concepto

La **Biblioteca de Elementos de Marca** permite a cada negocio subir **elementos ilimitados** (PNG con transparencia — logos secundarios, stickers, sellos, marcos, cualquier asset gráfico) que el usuario puede componer sobre las imágenes de sus posts sin regenerar DALL-E.

**Regla de capas por foto**: Máximo **5 elementos simultáneos** por foto en el panel de composición de `approval.tsx` (guard en frontend `activeElementLayers.length < 5` antes de agregar).

---

## Política de Aislamiento (fuente única de verdad)

La Biblioteca de Elementos es un recurso **exclusivo** — ningún usuario puede ver ni modificar elementos de otro usuario, sin excepción. Esto se aplica mediante `strictOwnerFilter` (sin admin bypass) en todos los endpoints `/api/elements`.

Para la especificación completa del patrón, las tablas de recursos con sus mecanismos de aislamiento, y el historial de fixes aplicados, ver:

👉 **`.agents/skills/data-isolation-audit/SKILL.md`** — Política centralizada de aislamiento (fuente única de verdad)

Resumen rápido para esta biblioteca:
| Función | Admin bypass | Uso |
|---------|-------------|-----|
| `strictOwnerFilter(userId, req, bizIdCol, bizId)` | ❌ NUNCA | Todos los endpoints de /api/elements |

---

## Tablas Clave

### `business_elements`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | serial PK | ID del elemento |
| `userId` | integer | FK → users.id (owner) |
| `businessId` | integer | FK → businesses.id (negocio asociado) |
| `name` | varchar(120) | Nombre del elemento |
| `storageKey` | varchar | Clave en Object Storage |
| `thumbUrl` | text | URL pública del thumbnail (null hasta generación) |
| `mimeType` | varchar | Tipo MIME del archivo |
| `analysis` | text | Descripción generada por GPT-4o Vision |
| `analysisStatus` | varchar | Estado del análisis: `pending` / `done` / `error` |
| `sortOrder` | integer | Orden visual en la biblioteca |
| `createdAt` | timestamp | Fecha de creación |

### `image_variants.overlay_element_configs`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `overlayElementConfigs` | jsonb | Array de `[{ elementId, position, sizePercent }]` — configuración de capas aplicadas a la variante. Se guarda como valor JSON nativo (no string), usando Drizzle. |

### `composition_presets`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | serial PK | ID del preset |
| `userId` | integer | FK → users.id |
| `businessId` | integer | FK → businesses.id |
| `name` | varchar(120) | Nombre del preset |
| `configJson` | jsonb | Objeto de composición: `{ logo: {enabled, position?, color?}, text: {enabled, style?, position?}, elements: [{elementId, position, sizePercent}] }` |
| `isDefault` | boolean | Si es el preset activo por defecto |
| `createdAt` / `updatedAt` | timestamp | Fechas |

---

## Endpoints

### GET `/api/elements`
- Query params: `businessId` (requerido)
- Solo devuelve elementos del `userId` autenticado + `businessId` especificado
- Devuelve: `{ elements: [...] }`

### POST `/api/elements/upload-url`
- Body: `{ businessId, filename, mimeType }`
- **Verifica que el negocio pertenece al usuario** (assertBizOwner)
- **Sin límite de cantidad** — biblioteca ilimitada
- Devuelve: `{ uploadURL, objectPath }`

### POST `/api/elements` (crear metadata post-upload)
- Body: `{ businessId, name, storageKey }`
- **Verifica que el negocio pertenece al usuario** (assertBizOwner)
- **Sin límite de cantidad** — biblioteca ilimitada
- Registra el elemento en DB
- Dispara análisis async con GPT-4o Vision (no bloquea la respuesta)
- Devuelve: `{ element }`

### PATCH `/api/elements/:id`
- Body: `{ name?, sortOrder? }`
- Solo puede editar el owner (userId)

### DELETE `/api/elements/:id`
- Borra registro de DB + archivo de Object Storage
- Solo puede borrar el owner

### POST `/api/elements/apply-layers`
- **Uso**: preview en frontend — toma rawBackground + configs → retorna base64 compuesto SIN persistir
- Body: `{ rawBackground, businessId, elements: [{elementId, position, sizePercent}], logo: {enabled, logoBase64?}, text: {enabled, headline?, style?, position?} }`
- Verifica ownership de elementos (userId + businessId)
- Retorna: `{ imageData: string }` (base64)

### PATCH `/api/posts/:id/variants/:variantId/apply-elements`
- **Uso**: aplicación definitiva — guarda la imagen compuesta en la variante
- Body: `{ elements: [{elementId, position, sizePercent}] }`
- **Rechaza si variant.businessId es null** (evita cross-business)
- Verifica ownership de elementos (userId + businessId estricto — sin fallback)
- Toma `rawBackground` de la variante (o `imageData` si no hay rawBackground)
- Aplica SOLO elementos (logo: false, text: false) → luego `applyOverlays` aplica logo+texto con los overlayParams existentes de la variante
- Guarda `imageData` (nuevo) + `overlayElementConfigs` (jsonb nativo, no JSON.stringify) en `image_variants`
- Retorna: `{ imageData: string, variant: ImageVariant }`

---

## Orden de Capas (Sharp) — OBLIGATORIO

El orden de composición en `applyCompositionLayers` es siempre:

```
1. rawBackground (fondo limpio — sin logo ni texto)
2. Elementos de marca (compositeElementOnImage por cada elemento)
3. Logo del negocio (posición configurable) — applyOverlays lo aplica después
4. Texto/tipografía del post — applyOverlays lo aplica después
```

En `apply-elements`: `applyCompositionLayers` recibe `logo: {enabled: false}` y `text: {enabled: false}` — solo aplica elementos. `applyOverlays` se llama después para logo + texto.

---

## Posiciones válidas (ElementPosition)

```
top-left | top-center | top-right
center-left | center | center-right
bottom-left | bottom-center | bottom-right
```

**CRÍTICO**: Usar `center-left/center/center-right` — **NUNCA** `middle-*`. El tipo `ElementPosition` en `ai.service.ts` (línea ~6240) usa "center" como fila del medio. Enviar `middle-*` genera posicionamiento incorrecto (defaults a center silenciosamente).

---

## Límites

- **Biblioteca ilimitada** — Sin límite de elementos por negocio en el backend
- **Máximo 5 elementos simultáneos por foto** — Doble guard:
  - **Frontend**: `activeElementLayers.length < 5` antes de agregar en `approval.tsx`. Badge muestra `N/5` (ámbar cuando llega a 5)
  - **Backend**: `PATCH /apply-elements` valida `elementConfigs.length > 5` → HTTP 400 `{ code: "element_layer_limit" }`
- Los elementos son assets gráficos PNG con transparencia — no imágenes de fondo, no logos principales

---

## Ownership y Seguridad

**Doble validación siempre**: `userId === req.user!.userId` Y `businessId` pertenece a ese userId.

Función de validación en elements.ts:
```typescript
async function assertBizOwner(userId: number, businessId: number): Promise<boolean> {
  const [biz] = await db.select({ id: businessesTable.id })
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId)))
    .limit(1);
  return !!biz;
}
```

En el endpoint `apply-elements` de posts.ts: si `variant.businessId` es null → HTTP 400, sin fallback a user-only.

---

## Presets (composition_presets)

El `configJson` es un **objeto de composición completo**:
```json
{
  "logo": { "enabled": true },
  "text": { "enabled": true },
  "elements": [
    { "elementId": 5, "position": "bottom-right", "sizePercent": 25 }
  ]
}
```

En el UI actual, el preset solo almacena `elements` desde el panel de composición. Los campos `logo` y `text` pueden expandirse en futuras tareas.

**Al guardar preset** → `POST /api/composition-presets`:
```json
{ "businessId": 3, "name": "Mi preset", "configJson": { "elements": [...activeElementLayers] } }
```

**Al cargar preset** → extraer `configJson.elements`:
```typescript
setActiveElementLayers(Array.isArray(p.configJson?.elements) ? p.configJson.elements : []);
```

**Al marcar predeterminado** → `POST /api/composition-presets/:id/set-default`

**Auto-carga en panel**: Al abrir el panel, `fetchBizElements(bizId)` carga elementos y presets en paralelo. Si hay un preset con `isDefault = true`, sus `configJson.elements` se aplican automáticamente a `activeElementLayers`.

---

## UI — Panel "Elementos de marca" en approval.tsx

### Cuándo aparece
- `activeImage?.rawBackground` existe
- `!activeImage?.mimeType?.startsWith("video/")`
- `!libraryMedia`
- `selectedVariant > 0`

### Estados React
```typescript
const [showElementsPanel, setShowElementsPanel] = useState(false);
const [bizElements, setBizElements] = useState<{id, name, storageKey, thumbUrl?}[]>([]);
const [bizElementsLoading, setBizElementsLoading] = useState(false);
const [activeElementLayers, setActiveElementLayers] = useState<{elementId, position, sizePercent}[]>([]);
const [applyingElements, setApplyingElements] = useState(false);
const [compPresets, setCompPresets] = useState<{id, name, configJson: {logo?: {enabled: boolean}, text?: {enabled: boolean}, elements?: {...}[]}, isDefault}[]>([]);
const [savingPreset, setSavingPreset] = useState(false);
const [newPresetName, setNewPresetName] = useState("");
const [compLogoEnabled, setCompLogoEnabled] = useState(true);   // controla si el logo se incluye al aplicar capas
const [compTextEnabled, setCompTextEnabled] = useState(true);   // controla si el texto se incluye al aplicar capas
```

### Flujo UI
1. Usuario abre panel colapsable → `fetchBizElements(bizId)` carga elementos + presets en paralelo
2. Si hay preset predeterminado → `activeElementLayers`, `compLogoEnabled` y `compTextEnabled` se pueblan automáticamente
3. **Toggles de capas** (mostrados al tope del panel): botones Logo y Texto con estado activo/inactivo
   - Logo desactivado → `skipLogo: true` en el body del `PATCH /apply-elements` → backend omite logo en `applyOverlays`
   - Texto desactivado → `skipText: true` → backend omite `overlayCaptionHook`
4. Preset guarda la config completa: `{logo: {enabled}, text: {enabled}, elements: [...]}`
5. Usuario selecciona elementos (toggle), configura posición + tamaño
6. Puede guardar configuración como preset (nombre + botón "Guardar")
7. Al hacer clic en "Aplicar capas" → `PATCH /apply-elements` → `queryClient.invalidateQueries`

---

## Análisis GPT-4o Vision (async)

Al subir un elemento, se dispara `analyzeElement(elementId, storageKey)` en background (sin await). GPT-4o Vision describe el elemento y actualiza `analysis` y `analysisStatus`. El análisis no bloquea la respuesta al usuario.

---

## Universal (sin restricción de plan)

La biblioteca de elementos es un **beneficio universal** — NO tiene guard de plan. Todos los usuarios (Gratis, Emprendedor, Negocio, Agencia) pueden usar hasta 20 elementos por negocio. Ver skill `beneficios-universales`.

---

## Inline Upload — Patrón de subida rápida en contexto

Cuando el usuario no tiene elementos o quiere agregar uno nuevo desde `approval.tsx` o `generate.tsx`, se muestra un widget inline sin salir del flujo.

**Flujo completo (frontend):**
1. Usuario elige archivo (`input type="file"`, `accept="image/png,image/jpeg,image/webp"`)
2. Auto-nombre: filename sin extensión, max 60 chars
3. `POST /api/elements/upload-url` con `{ businessId }` → `{ uploadURL, objectPath }`
4. `PUT uploadURL` con el archivo (Content-Type del archivo)
5. `POST /api/elements` con `{ businessId, name, storageKey: objectPath }` → `{ element }`
6. Refrescar la lista de elementos (ver diferencia por página abajo)
7. Reset del estado local de upload

**Estados React involucrados (en ambas páginas):**
```typescript
const [elUploadFile, setElUploadFile] = useState<File | null>(null);
const [elUploadName, setElUploadName] = useState("");
const [elUploading, setElUploading] = useState(false);
```

**Diferencia de refresh por página:**
- `approval.tsx` → usa estado local (`setBizElements`) → llamar `await fetchBizElements(bizId)` al éxito
- `generate.tsx` → usa React Query → llamar `queryClient.invalidateQueries({ queryKey: ["biz-elements", activeBusinessId] })`

**El widget se muestra:**
- En `approval.tsx`: en el empty state (cuando `bizElements.length === 0`) Y como botón colapsable "+ Subir elemento" cuando ya hay elementos (controlado por `showElUploadWidget` booleano)
- En `generate.tsx`: solo en el empty state (reemplaza el mensaje de redirección a Configuración)

**Estado adicional solo en approval.tsx:**
```typescript
const [showElUploadWidget, setShowElUploadWidget] = useState(false);
```
Este estado controla la expansión del formulario de upload cuando ya existen elementos.

---

## Gestión inline — Borrar y renombrar elementos desde la Cola de Aprobación

Desde el panel "Elementos de marca" en `approval.tsx`, el usuario puede borrar o renombrar
elementos sin salir del flujo.

**Interacción (UX):**
- Cada tarjeta de elemento (48×48px) tiene un `<div className="relative group/el">` wrapper.
- Al hacer hover, aparecen dos botones absolutamente posicionados:
  - **✕ Borrar** (`-top-1.5 -left-1.5`): rojo, llama `DELETE /api/elements/:id`
  - **✎ Renombrar** (`-bottom-1.5 -left-1.5`): gris/primario, activa el modo rename
- Los botones usan `opacity-0 group-hover/el:opacity-100` para la transición.

**Flujo borrar:**
1. Clic en ✕ → `handleDeleteElement(elId)`
2. `DELETE /api/elements/:id` (owner validation en backend)
3. Si ok → `setActiveElementLayers(prev => prev.filter(l => l.elementId !== elId))` + `fetchBizElements(bizId)`

**Flujo renombrar:**
1. Clic en ✎ → `setElRenamingId(el.id); setElRenameValue(el.name)`
2. Input inline aparece bajo el grid (con `autoFocus`, Enter confirma, Escape cancela)
3. `PATCH /api/elements/:id` con `{ name }` (max 100 chars)
4. Si ok → actualización optimista: `setBizElements(prev => prev.map(...))`

**Estados React involucrados (approval.tsx):**
```typescript
const [elDeletingId, setElDeletingId] = useState<number | null>(null);
const [elRenamingId, setElRenamingId] = useState<number | null>(null);
const [elRenameValue, setElRenameValue] = useState("");
```

**Endpoints del backend (ya existentes en elements.ts):**
- `DELETE /api/elements/:id` — valida `userId` en WHERE, borra objeto del storage
- `PATCH /api/elements/:id` — acepta `{ name, sortOrder }`, valida `userId` en WHERE

---

## ⚠️ Regla crítica: formato válido del storageKey

El campo `storageKey` en `business_elements` **siempre** tiene el formato `/objects/uploads/<UUID>`.

### Origen del valor
`normalizeObjectEntityPath(uploadURL)` en `objectStorage.ts` siempre retorna:
```
/objects/uploads/<UUID>
```
(empieza con `/objects/`)

### Contrato entre funciones

| Función | Requisito del storageKey |
|---------|--------------------------|
| `getObjectEntityFile(path)` | **Exige** que empiece con `/objects/` — lanza `ObjectNotFoundError` si no |
| `POST /api/elements` validation | **Debe** permitir `/objects/` — rechazar solo `://`, `..`, o `/` que NO sea `/objects/` |

### Regla de validación correcta (elements.ts)
```typescript
// ✅ CORRECTO — permite /objects/ pero rechaza paths arbitrarios
(cleanKey.startsWith("/") && !cleanKey.startsWith("/objects/"))

// ❌ INCORRECTO — rechaza /objects/ y rompe el flujo de subida
cleanKey.startsWith("/")
```

### Páginas que hacen el flujo completo
- `approval.tsx` — `handleElementUploadApproval()`
- `generate.tsx` — `handleElementUpload()`
- `settings.tsx` — `handleElementUploadSettings()`

**Nunca endurecer la validación del storageKey sin verificar que `getObjectEntityFile()` pueda leer el path resultante.**
