---
name: backgrounds-library-rules
description: >
  Reglas estrictas de visibilidad, propiedad y arquitectura de la Biblioteca de Fondos
  (image_variants) en HazPost. Úsalo antes de modificar endpoints /api/backgrounds,
  tenantLibraryFilter, la tabla industry_groups, los inserts en ai.service.ts, o la
  sección Biblioteca Master del admin panel. Contiene las reglas de 2 niveles de
  visibilidad, el sistema de matching por tipo de negocio, la regla de borrado
  owner-only y los archivos clave.
---

# Skill: Reglas de la Biblioteca de Fondos

## Las reglas en lenguaje simple

| Pregunta | Respuesta |
|----------|-----------|
| ¿Qué veo en la biblioteca? | (N1) Mis propios fondos + (N2) Fondos de mi competencia directa |
| ¿Qué puedo borrar? | Solo mis propios fondos (N1). Nunca fondos ajenos. |
| ¿Cómo aprende la IA? | Por separado para cada tipo de negocio, basándose en todos los fondos de ese tipo |
| ¿Se mezclan industrias? | NUNCA. Una barbería no ve fondos de una clínica médica. |
| ¿Se mezclan negocios del mismo usuario? | Solo N1 (los que el usuario generó), N2 es por tipo de negocio, no por usuario |

---

## Regla 1 — Visibilidad de 2 niveles (NO negociable)

### Nivel 1 — Fondos del negocio activo (más importante)
- Solo fondos generados para el **negocio activo** del usuario (context de la sesión).
- Se identifica con `image_variants.business_id = activeBiz.id`.
- Fondos con `business_id = NULL` (imágenes huérfanas de pruebas de admin) quedan **excluidos** — no aparecen en la biblioteca de ningún negocio.
- Si el negocio activo no se puede determinar (raro): **set vacío** (`sql\`1 = 0\``) — la biblioteca queda vacía, nunca mezcla fondos de distintos negocios del mismo usuario. La UI muestra estado vacío, no contaminación.
- **IMPORTANTE**: Un usuario con ECO y panadería NO ve ambas en N1. Solo ve las del negocio que tiene activo en la UI.

### Nivel 2 — Inspiración de la misma industria en otros países
- Fondos generados por OTROS usuarios cuyo negocio es del **mismo tipo específico** y **diferente país**.
- "Mismo tipo específico" = mismo `industry_group_slug`.
- "Diferente país" = `image_variants.country != businesses.country` del usuario activo.
- **FAIL-CLOSED**: si el negocio activo no tiene `country` configurado → N2 completamente oculto.
- Un barbero colombiano ve fondos de barberías mexicanas o españolas — NO de barberías colombianas.
- Un psicólogo en Colombia NO ve fondos de otros psicólogos en Colombia (competidores directos).
- Una barbería NO ve fondos de una clínica médica, aunque ambas estén en "belleza/salud".
- **Política central**: esta lógica vive en `tenantLibraryFilter` en `tenant.ts` y en `data-isolation-audit/SKILL.md`.

### Contaminación PROHIBIDA
```
❌ Barbería  ↔ Médico           (tipos distintos — mismo grupo amplio)
❌ Psicólogo ↔ Veterinario      (tipos distintos — mismo grupo medicina)
❌ Pizzería  ↔ Fonda colombiana (tipos distintos — mismo grupo restaurante)
❌ Usuario A ↔ Usuario B        (fondos ajenos en N2 son visibles pero NO borrables)
❌ ECO       ↔ HazPost          (mismo usuario, negocios distintos — N1 aislado por businessId)
❌ Huérfanas (businessId=NULL) en cualquier biblioteca — son de pruebas de admin, excluir siempre
❌ Barbería CO ↔ Barbería CO    (mismo tipo, MISMO país — competidores directos, N2 prohibido)
```

### Orden de presentación en la respuesta (NO negociable)

**Regla absoluta**: N1 (propios) SIEMPRE antes que N2 (industria), sin excepción.

```typescript
// GET /api/backgrounds → orderBy:
// uid = req.user!.userId
.orderBy(
  sql`CASE WHEN ${imageVariantsTable.userId} = ${uid} THEN 0 ELSE 1 END`, // N1 primero SIEMPRE
  // N1: menos usadas primero (asc) — fondos nuevos sin uso aparecen primero para descubrir
  sql`CASE WHEN ${imageVariantsTable.userId} = ${uid} THEN ${imageVariantsTable.libraryUseCount} END ASC NULLS LAST`,
  // N2: más usadas primero (desc) — fondos probados/populares de la industria aparecen primero
  sql`CASE WHEN ${imageVariantsTable.userId} != ${uid} THEN ${imageVariantsTable.libraryUseCount} END DESC NULLS LAST`,
  desc(imageVariantsTable.createdAt)  // tiebreaker: más recientes primero
)
```

**Regla de ordenamiento interno por nivel:**
- N1 (propios): `asc(libraryUseCount), desc(createdAt)` — menos usadas primero, luego más recientes
- N2 (industria): `desc(libraryUseCount)` — más usadas primero (más probadas por la competencia)

**Frontend**: Dos secciones visuales separadas por un divisor:
1. `filteredOwn = filtered.filter(r => r.isOwn)` → sección "Mis fondos"
2. `filteredIndustry = filtered.filter(r => !r.isOwn)` → sección "Fondos del sector — [nombre]"

---

## Regla 2 — Borrado owner-only estricto (NO negociable)

El usuario solo puede borrar fondos donde `user_id = req.user.userId`. Sin excepciones.
Ni el admin puede borrar desde las rutas de usuario. El admin usa `/api/admin/backgrounds-master`.

### Patrón correcto

```typescript
// DELETE /api/backgrounds/:id — CORRECTO
const uid = req.user!.userId;
const [row] = await db.select({ id: imageVariantsTable.id })
  .from(imageVariantsTable)
  .where(and(
    eq(imageVariantsTable.id, id),
    eq(imageVariantsTable.userId, uid),  // ← owner-only, sin bypass
  ));
if (!row) return res.status(404).json({ error: "Not found or not your background" });
```

```typescript
// DELETE /api/backgrounds/bulk — CORRECTO
const cond = and(
  inArray(imageVariantsTable.id, ids),
  eq(imageVariantsTable.userId, uid),   // ← owner-only, sin bypass
);
await db.update(imageVariantsTable).set({ rawBackground: null }).where(cond);
```

### Patrón PROHIBIDO

```typescript
// ❌ NUNCA — permite al admin borrar fondos de cualquier usuario
const where = isAdmin
  ? eq(imageVariantsTable.id, id)
  : and(eq(imageVariantsTable.id, id), eq(imageVariantsTable.userId, uid));
```

---

## Regla 3 — tenantLibraryFilter() es la única función para leer backgrounds

**Archivo**: `artifacts/api-server/src/lib/tenant.ts`

```typescript
/**
 * Async library filter para la Biblioteca de Fondos.
 * N1: solo fondos del negocio activo (business_id = activeBizId).
 *     Fondos con businessId=NULL (huérfanos) → excluidos.
 * N2: misma industria de otros usuarios (industry_group_slug = mySlug, userId != uid).
 */
export async function tenantLibraryFilter(req: Request, businessId?: number): Promise<SQL> {
  const uid = req.user!.userId;
  const isAdmin = req.user!.role === "admin";

  const bizCond = businessId != null
    ? and(eq(businessesTable.id, businessId),
          isAdmin ? undefined : eq(businessesTable.userId, uid))
    : and(eq(businessesTable.userId, uid), eq(businessesTable.isDefault, true));

  const [activeBiz] = await db
    .select({ id: businessesTable.id, industryGroupSlug: businessesTable.industryGroupSlug })
    .from(businessesTable).where(bizCond!).limit(1);

  const mySlug      = activeBiz?.industryGroupSlug ?? null;
  const activeBizId = activeBiz?.id ?? null;

  // N1: solo fondos del negocio activo. Fallback sin negocio: todos los propios.
  const ownFilter: SQL = activeBizId != null
    ? eq(imageVariantsTable.businessId, activeBizId)   // ← solo este negocio
    : eq(imageVariantsTable.userId, uid);              // ← fallback

  if (!mySlug) return ownFilter;

  // N2: misma industria de otros usuarios
  const crossFilter = and(
    eq(imageVariantsTable.industryGroupSlug, mySlug),
    sql`${imageVariantsTable.userId} != ${uid}`,
    isNotNull(imageVariantsTable.industryGroupSlug),
  )!;

  return or(ownFilter, crossFilter)!;
}
```

### Dos funciones de filtro — cuándo usar cada una

| Función | Cuándo usar | N1 scope | Propósito |
|---------|-------------|----------|-----------|
| `tenantLibraryFilter(req, bizId)` | `GET /backgrounds` (lista) | `businessId = activeBizId` | Evita contaminación entre negocios del mismo usuario en el listado |
| `tenantLibraryAccessFilter(req)` | `GET /backgrounds/:id/thumb`, `/raw`, `/:id` | `userId = uid` (cualquier negocio) | Permite acceder al thumbnail/raw aunque el negocio activo ≠ negocio default |

**REGLA**: Nunca usar `tenantLibraryFilter` sin businessId en rutas de acceso individual. Si el negocio activo ≠ default, el filtro por businessId=default bloquearía imágenes propias → thumbnails rotos.

### Reglas de uso

| Regla | Descripción |
|-------|-------------|
| **SIN admin bypass** | Aplica a TODOS los usuarios por igual, incluso admin |
| **NUNCA reemplazar** | No usar `tenantFilterVariants()` ni `tenantFilterVariantsJoined()` en rutas de biblioteca |
| **Async** | Siempre `await tenantLibraryFilter(req, businessId?)` o `await tenantLibraryAccessFilter(req)` |
| **Fail-closed** | Si no hay slug, retorna solo fondos propios — nunca datos globales |

---

## Regla 4 — Tabla de endpoints y sus filtros

| Endpoint | Método | Filtro | Notas |
|----------|--------|--------|-------|
| `GET /api/backgrounds` | Lectura | `tenantLibraryFilter(req, bizId)` | Incluye `isOwn` en respuesta — N1 estricto por businessId |
| `GET /api/backgrounds/:id` | Lectura | `tenantLibraryAccessFilter(req)` | Detalle — N1 permisivo (userId) |
| `GET /api/backgrounds/:id/thumb` | Lectura | `tenantLibraryAccessFilter(req)` | Thumbnail — N1 permisivo (userId) |
| `GET /api/backgrounds/:id/raw` | Lectura | `tenantLibraryAccessFilter(req)` | Bytes JPEG — N1 permisivo (userId) |
| `DELETE /api/backgrounds/:id` | Borrado | `eq(userId, uid)` estricto | Sin admin bypass |
| `DELETE /api/backgrounds/bulk` | Borrado | `eq(userId, uid)` estricto | Sin admin bypass |
| `POST /api/backgrounds/rehash` | Admin | `requireAdmin` | Mantenimiento — OK bypass |
| `POST /api/backgrounds/deduplicate` | Admin | `requireAdmin` | Mantenimiento — OK bypass |
| `GET /api/admin/backgrounds-master` | Admin | `requireAdmin` | Ve todos los fondos |
| `DELETE /api/admin/backgrounds-master/:id` | Admin | `requireAdmin` | Admin puede borrar cualquiera |
| `GET /api/admin/industry-groups` | Admin | `requireAdmin` | CRUD de grupos de industria |

---

## Regla 5 — Sistema de matching por tipo de negocio

### Estado actual: industry_group_slug (17 grupos)

Los negocios se clasifican automáticamente en uno de 17 grupos via keyword matching
en `runStartupMigrations()`. El matching usa el campo `businesses.industry` (texto libre).

```typescript
// Asignado automáticamente al arrancar el servidor (artifacts/api-server/src/index.ts)
// Keyword matching: si industry.toLowerCase().includes(keyword), asignar slug
const groups = await db.select({ slug, keywords }).from(industryGroupsTable);
for (const biz of unclassifiedBusinesses) {
  const lower = (biz.industry ?? biz.name).toLowerCase();
  for (const group of groups) {
    const kws: string[] = JSON.parse(group.keywords);
    if (kws.some(kw => lower.includes(kw.toLowerCase()))) {
      await db.update(businessesTable).set({ industryGroupSlug: group.slug }).where(eq(id, biz.id));
      break;
    }
  }
}
```

### Problema actual: grupos demasiado amplios

Algunos grupos agrupan tipos de negocio completamente distintos:

| Grupo actual | Tipos mezclados (INCORRECTO) |
|--------------|------------------------------|
| `medicina` | médico ≠ psicólogo ≠ veterinario ≠ óptico ≠ fisioterapeuta |
| `estetica` | peluquería femenina ≠ spa ≠ manicure ≠ micropigmentación |
| `restaurante` | sushi ≠ pizzería ≠ fonda colombiana ≠ heladería ≠ cafetería |
| `tecnologia` | software ≠ agencia marketing ≠ reparación de celulares |
| `gym` | gimnasio de pesas ≠ yoga ≠ natación ≠ artes marciales |
| `construccion` | constructora ≠ ferretería ≠ decoración de interiores |
| `transporte` | taxi ≠ mecánica ≠ venta de motos |
| `supermercado` | abarrotes ≠ farmacia ≠ droguería |
| `eventos` | fotógrafo ≠ DJ ≠ catering ≠ decoradora |
| `moda` | boutique ropa ≠ zapatería ≠ bisutería |

### Solución pendiente de implementar: main_keyword_slug

Se debe agregar una **segunda capa de matching más específica** para que solo compartan
fondos los negocios del mismo tipo concreto, no del mismo grupo amplio.

**Columnas a agregar** (cuando se implemente T109):
- `businesses.main_keyword_slug` — tipo específico del negocio
- `image_variants.main_keyword_slug` — copiado del negocio al generar

**Lógica en tenantLibraryFilter** (cuando esté implementado):
```typescript
// N2 usa main_keyword_slug (específico) si está disponible
// Si no, cae al industry_group_slug (amplio) como fallback
const myKeyword = activeBiz?.mainKeywordSlug ?? null;
const mySlug    = activeBiz?.industryGroupSlug ?? null;

if (myKeyword) {
  // Matching preciso: solo negocios del mismo tipo específico
  crossFilter = and(eq(imageVariantsTable.mainKeywordSlug, myKeyword), notOwnUser);
} else if (mySlug) {
  // Fallback: matching amplio por grupo de industria
  crossFilter = and(eq(imageVariantsTable.industryGroupSlug, mySlug), notOwnUser);
}
```

**Diccionario de tipos específicos** (~60 tipos, dividiendo los grupos problemáticos):
- De `medicina`: `medicina-general`, `psicologia`, `veterinaria`, `optica`, `fisioterapia`, `nutricion`
- De `estetica`: `peluqueria-femenina`, `spa`, `manicure-unas`, `maquillaje-cejas`, `micropigmentacion`
- De `restaurante`: `restaurante-colombiano`, `restaurante-internacional`, `cafeteria`, `heladeria`, `comida-rapida`, `pizzeria`
- De `gym`: `gimnasio-pesas`, `yoga-pilates`, `natacion`, `artes-marciales`
- De `tecnologia`: `software-saas`, `marketing-digital`, `reparacion-electronica`
- De `transporte`: `servicio-transporte`, `mecanica-taller`, `motos`
- De `supermercado`: `tienda-abarrotes`, `farmacia-drogueria`
- De `eventos`: `fotografia-video`, `decoracion-eventos`, `catering`, `musica-entretenimiento`
- Los ya específicos (barberia, odontologia, panaderia, inmobiliaria, joyeria, energia) se mantienen sin split

---

## Regla 6 — Stamping en ai.service.ts (7 inserts) y en posts.ts

Todo nuevo `INSERT` en `imageVariantsTable` dentro de `ai.service.ts` o `posts.ts` **DEBE** incluir:
- `businessId: job.businessId ?? null`
- `industryGroupSlug: industryGroupSlugByKey.get(jobKey) ?? null`
- `mainKeywordSlug: mainKeywordSlugByKey.get(jobKey) ?? null` ← cuando T109 esté implementado

### Valores válidos para el campo `style`
| Valor | Generado por | Descripción |
|-------|-------------|-------------|
| `photorealistic` | generatePostImage | Imagen fotorrealista DALL-E |
| `graphic` | generatePostImage | Estilo gráfico/ilustración |
| `infographic` | generatePostImage | Infografía |
| `raw_upload` | upload endpoint | Imagen subida manualmente por usuario |
| `element_ai` | `POST /:id/generate-with-element` | Generado con gpt-image-1 multimodal usando elemento de marca como referencia. Requiere `plans.element_ai_enabled = true`. Costo: +3 cr (`credit_cost_element_ai`). |

Las variantes con `style='element_ai'` también participan en la Biblioteca de Fondos (N1 del negocio), siguen exactamente las mismas reglas de visibilidad que cualquier otra variante.

### Patrón correcto

```typescript
// ✅ CORRECTO — incluye business_id e industry_group_slug
await db.insert(imageVariantsTable).values({
  postId:            savedPost.id,
  userId:            job.userId,
  businessId:        job.businessId ?? null,            // ← OBLIGATORIO
  industryGroupSlug: industryGroupSlugByKey.get(jobKey) ?? null,  // ← OBLIGATORIO
  variantIndex:      0,
  style:             job.styleHint ?? "default",
  prompt:            imagePlan.imagePrompt,
  // ... resto de campos
});
```

```typescript
// ❌ INCORRECTO — faltan campos de clasificación
await db.insert(imageVariantsTable).values({
  postId: savedPost.id,
  userId: job.userId,
  // sin businessId, sin industryGroupSlug → fondo NO participa en N2
});
```

### Dónde está industryGroupSlugByKey

```typescript
// En la función principal de generación, antes de los 7 inserts:
const industryGroupSlugByKey = new Map<string, string | null>();

for (const job of jobs) {
  const key = makeJobKey(job.userId, job.businessId);
  const [biz] = await db.select({ industryGroupSlug: businessesTable.industryGroupSlug })
    .from(businessesTable)
    .where(eq(businessesTable.id, job.businessId!))
    .limit(1);
  industryGroupSlugByKey.set(key, biz?.industryGroupSlug ?? null);
}
```

**Nota**: El `catch` block de cada insert usa `makeJobKey(job.userId, job.businessId)` porque
`jobKey` puede estar fuera de scope en el `catch`.

---

## Regla 7 — Startup migrations (idempotentes)

Las migraciones de la Biblioteca de Fondos están en `runStartupMigrations()` dentro de
`artifacts/api-server/src/index.ts`. Se ejecutan en 3 bloques independientes.

### Bloque 5a — DDL de tablas y columnas

```sql
-- industry_groups table
CREATE TABLE IF NOT EXISTS industry_groups (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  keywords     TEXT NOT NULL DEFAULT '[]',
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Columnas en image_variants
ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS business_id INTEGER;
ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS industry_group_slug TEXT;

-- Columna en businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_group_slug TEXT;

-- Seed de 17 grupos (idempotente)
INSERT INTO industry_groups (slug, display_name, keywords) VALUES
  ('barberia', 'Barbería', '["barbería","barberías","barbero","barber","peluquería masculina"]'),
  ('medicina', 'Salud / Medicina', '["médico","clínica","salud","medicina","psicología","veterinaria","óptica"]'),
  -- ... 15 grupos más
ON CONFLICT (slug) DO NOTHING;
```

### Bloque 5b — JS backfill businesses.industry_group_slug

```typescript
// Keyword matching para negocios sin slug asignado
const unclassifiedBiz = await db.select()
  .from(businessesTable)
  .where(isNull(businessesTable.industryGroupSlug));

const groups = await db.select({ slug, keywords }).from(industryGroupsTable);

for (const biz of unclassifiedBiz) {
  const lower = (biz.industry ?? biz.name ?? "").toLowerCase();
  for (const group of groups) {
    const kws: string[] = JSON.parse(group.keywords);
    if (kws.some(kw => lower.includes(kw.toLowerCase()))) {
      await db.update(businessesTable)
        .set({ industryGroupSlug: group.slug })
        .where(eq(businessesTable.id, biz.id));
      break;
    }
  }
}
// Luego: propagar de businesses a image_variants
// UPDATE image_variants iv SET industry_group_slug = b.industry_group_slug
// FROM businesses b WHERE iv.business_id = b.id AND iv.industry_group_slug IS NULL
```

### Bloque 5c — Backfill user_id en image_variants legacy

```sql
-- Filas legacy que tienen post_id pero user_id = NULL
UPDATE image_variants iv
SET user_id = p.user_id
FROM posts p
WHERE iv.post_id = p.id
  AND iv.user_id IS NULL
  AND p.user_id IS NOT NULL;
```

---

## Regla 8 — Frontend: backgrounds.tsx

### Hook y queryKey

```typescript
// Siempre usar el businessId activo como parte del queryKey
// enabled: bizLoaded && !!activeBusinessId evita queries prematuras sin negocio resuelto
const { id: activeBusinessId, loaded: bizLoaded } = useActiveBusiness();
const { data: backgrounds } = useQuery({
  queryKey: ["backgrounds", activeBusinessId],
  queryFn: () => fetch(`${BASE}/api/backgrounds?businessId=${activeBusinessId}`, { credentials: "include" }).then(r => r.json()),
  enabled: bizLoaded && !!activeBusinessId,   // ← OBLIGATORIO: no lanzar sin negocio definido
});
```

### Badge de competencia (N2)

```tsx
// Mostrar badge "Otra [grupo]" cuando isOwn === false
{!bg.isOwn && bg.groupDisplayName && (
  <span className="badge badge-secondary">
    Otra {bg.groupDisplayName}
  </span>
)}
```

### Botón de borrado condicional

```tsx
// El botón de borrar SOLO aparece si el fondo es propio (isOwn)
{bg.isOwn && (
  <button onClick={() => handleDelete(bg.id)}>
    Eliminar
  </button>
)}
```

### Campo isOwn en la respuesta de la API

```typescript
// GET /api/backgrounds — campo isOwn calculado en el server
const enriched = rows.map(r => ({
  ...r,
  isOwn: r.userId === uid,                                          // ← boolean
  groupDisplayName: groupMap.get(r.industryGroupSlug ?? "") ?? null, // ← nombre legible del grupo
}));
```

---

## Regla 9 — Bug de repetitividad de fondos (documentado 18 abr 2026)

### Causa raíz

La función `deriveBusinessIndustryScene(jobIndustry, **jobIdx**)` usaba `jobIdx` como
`variantIdx` para seleccionar la escena del banco de NICHE_SCENE_ENTRIES.

Con un banco de 5 escenas de marketing y 30 posts:
- jobIdx 0 → scenes[0], jobIdx 1 → scenes[1], ..., jobIdx 4 → scenes[4]
- jobIdx 5 → scenes[0] (REPITE), jobIdx 6 → scenes[1] (REPITE)...
- Resultado: cada escena aparece **6 veces** en un batch de 30 posts.

Problema adicional: el `sceneIdx` de `BACKGROUND_SCENES` siempre empezaba en la misma
posición determinista → batchs consecutivos generaban la misma secuencia.

### Fix aplicado (ai.service.ts)

**1. Random offset cross-batch** — evita que generaciones consecutivas empiecen igual:
```typescript
const batchSceneOffset = Math.floor(Math.random() * BACKGROUND_SCENES.length);
// Aplicado a: (jobIdx * 3 + charIdx + batchSceneOffset) % BACKGROUND_SCENES.length
```

**2. `sceneIdx` en vez de `jobIdx` para niche scenes** — aprovecha el deduplicado ya existente:
```typescript
// ANTES (causa la repetición):
const industryScene = deriveBusinessIndustryScene(jobIndustry, jobIdx);
const nicheCompositeKey = `${isSolar}:${job.nicheContextShort}:${jobIdx}`;

// DESPUÉS (fix):
const industryScene = deriveBusinessIndustryScene(jobIndustry, sceneIdx);
const nicheCompositeKey = `${isSolar}:${job.nicheContextShort}:${sceneIdx}`;
```

`sceneIdx` es 0-19 (tamaño de BACKGROUND_SCENES) y ya está deduplicado dentro del batch
por `usedScenesInBatch`. Esto garantiza que el selector de variante sea único por job.

**3. Más variantes para `marketing`** — aumentado de 5 a 10 escenas:
- Antes: 5 variantes × 6 repeticiones = cada escena 6 veces en 30 posts
- Después: 10 variantes × 2-3 repeticiones = cada escena 2-3 veces max

### Anti-patrón prohibido

```typescript
// ❌ NUNCA usar jobIdx como variantIdx — cycla desde 0 en cada batch
const industryScene = deriveBusinessIndustryScene(jobIndustry, jobIdx);

// ❌ NUNCA iniciar sceneIdx sin offset aleatorio — secuencia idéntica entre runs
let candidate = (jobIdx * 3 + charIdx) % BACKGROUND_SCENES.length; // sin batchSceneOffset
```

### Si el usuario reporta repetitividad futura

1. Verificar que `batchSceneOffset` esté presente en `generateImagesForPostsBg`
2. Verificar que `deriveBusinessIndustryScene` recibe `sceneIdx` (no `jobIdx`)
3. Verificar que el NICHE_SCENE_ENTRIES de su industria tiene ≥8 variantes
4. Si el negocio es de una industria con pocas variantes, agregar más en `NICHE_SCENE_ENTRIES`

---

## Regla 10 — Cuántas variantes mínimas necesita cada industria

| Escenas necesarias | Para que un batch de 30 posts no repita más de 3× |
|--------------------|---------------------------------------------------|
| ≥10 escenas | Ideal — cada escena aparece max 3× en 30 posts |
| 8 escenas | Aceptable — max 4× |
| 5 escenas | MAL — 6 repeticiones en 30 posts |

Industrias con el mínimo aceptable (8+):
- `tecnolog`: 10 ✅
- `marketing`: 10 ✅ (ampliado 18 abr 2026)
- `restaurante`: 6 ⚠️ (agregar 2 más)
- `construcción`: verificar

---

## Regla 11 — Reglas NO negociables (NUNCA)

| Prohibición | Consecuencia si se viola |
|-------------|--------------------------|
| ❌ NUNCA admin bypass en `/api/backgrounds` | Admins verían y borrarían fondos de cualquier usuario |
| ❌ NUNCA `tenantFilterVariants()` en endpoints de biblioteca | Tiene admin bypass — viola aislamiento |
| ❌ NUNCA `tenantFilterVariantsJoined()` en biblioteca | Tiene admin bypass — viola aislamiento |
| ❌ NUNCA borrar fondos ajenos desde ruta de usuario | Usuarios pueden borrar fondos de la competencia |
| ❌ NUNCA omitir `businessId` en inserts de ai.service.ts | Fondos no participan en N2 para ese negocio |
| ❌ NUNCA omitir `industryGroupSlug` en inserts de ai.service.ts | Fondos no participan en N2 para esa industria |
| ❌ NUNCA mezclar tipos distintos dentro de un grupo | Una barbería ve fondos de una clínica médica |
| ❌ NUNCA usar texto libre para matching de industria | Usar slugs exactos, no texto variable |

---

## Regla 10 — Rutas de admin vs. rutas de usuario

```
/api/backgrounds/*          → Usuario. Filtros: tenantLibraryFilter + owner-only delete.
/api/admin/backgrounds-master/* → Admin only. Ve y borra CUALQUIER fondo. No exponer a usuarios.
/api/admin/industry-groups/* → Admin only. CRUD de grupos de industria. No exponer a usuarios.
```

El admin tiene su propio panel "Biblioteca Master" que usa `/api/admin/backgrounds-master`.
Las rutas de usuario (`/api/backgrounds`) aplican `tenantLibraryFilter` incluso cuando
el usuario autenticado es admin — no hay bypass.
