# Skill: Data Isolation Audit

## ACTIVAR SIEMPRE
Al leer o editar cualquier archivo del proyecto, aplica este audit automáticamente.
Si encuentras una violación, repórtala ANTES de continuar con la tarea.

---

## LA REGLA FUNDAMENTAL

```
❌ NUNCA: Datos del Usuario A visibles o modificables por el Usuario B
✅ OK:    La app usa patrones de industria para mejorar la experiencia de todos
           los usuarios de esa industria — sin exponer datos individuales
```

### Ejemplos de qué es OK vs qué no

| Situación | Veredicto | Por qué |
|-----------|-----------|---------|
| Todos los negocios de energía solar reciben prompts con contexto solar | ✅ OK | Es info de industria, no datos de usuario |
| El post de ECO aparece en la cola de aprobación de HazPost | ❌ FUGA | Dato de usuario A visible a usuario B |
| Los horarios óptimos de Instagram se calculan por industria global | ✅ OK | Dato agregado, no individual |
| El token de Instagram de ECO se guarda en la cuenta de otro usuario | ❌ FUGA | Credencial de usuario A en usuario B |
| El nombre de negocio de ECO aparece en el preview de otro usuario | ❌ FUGA | Branding de usuario A visible a usuario B |
| Una niche de un usuario aparece en el generador de otro | ❌ FUGA | Config de usuario A visible a usuario B |

---

## REGLA DE APRENDIZAJE POR NIVELES (misma industria)

La app PUEDE aprender de patrones de contenido de otros negocios de la misma industria
para mejorar la experiencia de un usuario, **siempre que sea dato agregado, no individual**.

Los datos se aplican en este orden de prioridad (de menor a mayor):

```
Nivel 1 — INTERNACIONAL (menor peso)
  Lo que funciona en España (o cualquier otro país) puede inspirar a un negocio en Cali.
  Aplicar con menor confianza — puede no ser culturalmente relevante.

Nivel 2 — NACIONAL
  Lo que funciona en Colombia es más relevante para negocios colombianos.
  Aplicar con confianza media.

Nivel 3 — LOCAL (mayor peso) ⭐
  Lo que funciona en Cali sirve para negocios en Cali.
  La app DEBE aprender de todos los negocios de la misma industria en la misma ciudad.
  Aplicar con máxima confianza.

⚡ EXCEPCIÓN VIRAL
  Si algo es viral (independientemente de su origen o nicho), gana más peso
  sin importar el nivel geográfico. Un reel viral de España aplica con más
  fuerza que uno local con bajo rendimiento.
```

### Ejemplos de aprendizaje por niveles

| Escenario | Nivel | Veredicto |
|-----------|-------|-----------|
| Restaurantes en Cali tienen mejor engagement los viernes a las 6 pm → se aplica a todos los restaurantes en Cali | 3 – Local | ✅ OK |
| Hashtags de farmacias en Bogotá tienen alto alcance → se sugieren a farmacias en Cali | 2 – Nacional | ✅ OK (con menor confianza) |
| Reel de fintech en España se volvió viral → se usa como referencia de formato | Viral | ✅ OK |
| La descripción específica del negocio de ECO se usa en el prompt de otro usuario | — | ❌ FUGA |
| El nombre del cliente de ECO aparece mencionado en el contenido de otro negocio | — | ❌ FUGA |

### La distinción clave: Tipo vs Instancia

```
Tipo de industria  → compartible  → "restaurante de comida rápida en Cali"
Instancia de usuario → NUNCA      → "Restaurante El Bodegón, calle 5 con carrera 8, dueño Juan"
```

---

## CÓMO AUDITAR MIENTRAS LEES CÓDIGO

### Paso 1 — ¿Hay branding/IDs hardcodeados?

Busca estos patrones en cualquier archivo de lógica de negocio:

```
isEcoContext | ECO_USER_IDS | ECO_BUSINESS_IDS
userId === 1 | userId == 1 | businessId === 1
"@eco.sas" | "@eco.col" | "Energy Capital Operation" | "eco-col.com"
"356577317549386"           ← Page ID de Facebook de ECO (eliminado)
ecoLogoWhite | ecoLogoBlue | ecoIcon | LOGO_PATH_*
ecoSuffix | ecoKeywords | ecoCityPool
"solar energy company in Cali"
"Cali, Colombia"            ← solo si hardcodeado, no si viene de DB
```

Si están en lógica de negocio (no en assets/ ni comentarios históricos) → **BUG**.

### Paso 2 — ¿Toda query de datos de usuario filtra por userId?

```typescript
// ✅ CORRECTO — usuario solo ve sus propios datos
WHERE user_id = $userId AND business_id = $businessId

// ❌ FUGA — usuario B puede ver datos de usuario A
WHERE business_id = $businessId   // falta userId
WHERE id = $postId                // falta userId completamente
```

Patrón correcto en este proyecto:
```typescript
function tenantFilter(req: Request) {
  if (req.user!.role === "admin") return undefined; // admin ve todo — intencional
  return eq(tabla.userId, req.user!.userId);
}
```

### Paso 3 — ¿Las mutaciones (UPDATE/DELETE) verifican ownership antes de ejecutar?

El patrón seguro es:
```typescript
// 1. Primero verificar que el recurso pertenece al usuario
const [item] = await db.select().from(tabla)
  .where(and(eq(tabla.id, id), eq(tabla.userId, userId)));
if (!item) return res.status(404).json({ error: "No encontrado" });

// 2. Solo entonces mutar
await db.update(tabla).set({ ... }).where(eq(tabla.id, id));
```

Si ves un UPDATE o DELETE que no tiene un SELECT de ownership previo → revisar.

### Paso 4 — ¿El branding en la UI viene de la DB, no hardcodeado?

```typescript
// ❌ Hardcodeado — todos los usuarios ven datos de ECO
<div>@eco.sas — Energy Capital Operation</div>

// ✅ Dinámico — cada usuario ve su propio negocio
<div>@{activeBusinessName} — {activeBusinessDescription}</div>
```

### Paso 5 — ¿El aprendizaje de industria respeta los niveles geográficos?

```typescript
// ✅ OK — usa industria + ciudad para mejorar prompts (dato agregado)
if (business.industry === "solar" && business.city === "Cali") {
  prompt += "Contexto: empresa de energía solar en Cali.";
}

// ✅ OK — da más peso a patrones locales, menos a internacionales
const score = localEngagement * 3 + nationalEngagement * 2 + internationalEngagement * 1;

// ✅ OK — boost si el contenido es viral (sin importar origen)
if (content.isViral) score *= 5;

// ❌ NO OK — usa datos específicos de un negocio para otro
if (business.industry === "solar") {
  prompt += "Como ECO en Cali, líder en paneles solares en Colombia"; // ← instancia de ECO
}
```

---

## FORMATO DE REPORTE

```
⚠️ [CRÍTICO|ALTO|MEDIO|BAJO] ISOLATION en [archivo]:[línea]
   Patrón: [código o string encontrado]
   Riesgo: [qué datos de quién pueden ver quién]
   Fix:    [qué cambiar]
```

| Severidad  | Descripción |
|------------|-------------|
| 🔴 CRÍTICO | Query sin userId → usuario B lee/modifica datos de usuario A |
| 🟠 ALTO    | Credenciales/tokens hardcodeados de un usuario específico |
| 🟡 MEDIO   | Branding de un negocio hardcodeado visible a otros usuarios |
| 🟢 BAJO    | Strings de branding en comentarios o logs internos |

---

## POLÍTICA CENTRALIZADA DE AISLAMIENTO — TENANT ISOLATION (Fuente única de verdad)

Toda la lógica de aislamiento vive en `artifacts/api-server/src/lib/tenant.ts`.

### Tipos de filtro — cuándo usar cada uno

| Función | Admin bypass | Cuándo usar |
|---------|-------------|-------------|
| `tenantFilterCol(col, req)` | ✅ sí — admin ve todo | Posts, niches, analytics, landings, social-accounts, reels — recursos que el admin necesita ver globalmente |
| `strictOwnerFilter(userIdCol, req, bizIdCol?, bizId?)` | ❌ NUNCA | Galería de Medios Reales, Biblioteca de Elementos — recursos exclusivos donde nadie puede ver datos de otro |
| `tenantLibraryFilter(req, bizId?)` | ❌ NUNCA | Biblioteca de Fondos (lista) — N1 propios + N2 misma industria/país diferente |
| `tenantLibraryAccessFilter(req)` | ❌ NUNCA | Biblioteca de Fondos (acceso individual — thumb, raw, detalle) |

### Política por recurso

| Recurso | Tabla | ¿Compartido entre usuarios? | Condición de visibilidad cruzada |
|---------|-------|----------------------------|----------------------------------|
| Posts, niches, analytics | `posts`, `niches` | No | Exclusivo userId+businessId |
| **Galería de Medios Reales** | `media_library` | **No** | **Exclusivo — sin excepción, sin bypass de admin** |
| **Biblioteca de Elementos** | `business_elements` | **No** | **Exclusivo — sin excepción, sin bypass de admin** |
| **Biblioteca de Fondos** | `image_variants` | Solo N2 | N2: mismo `industry_group_slug` + `country != myCountry` |

### Anti-patrón CRÍTICO — no usar tenantFilterCol en recursos exclusivos

```typescript
// ❌ NUNCA para media_library ni business_elements
const tf = tenantFilterCol(mediaLibraryTable.userId, req);
// → admin bypass: tf=undefined → query sin WHERE → todos los medios de todos los usuarios

// ✅ CORRECTO para recursos exclusivos
const filter = strictOwnerFilter(mediaLibraryTable.userId, req);
// → siempre filtra por userId, sin excepción
```

---

## ESTADO AUDITADO (Abril 2026)

### Rutas de API — aislamiento verificado ✅

| Ruta | Mecanismo |
|------|-----------|
| `/posts` | tenantFilterCol userId + businessId |
| `/niches` | tenantFilterCol userId + businessId |
| `/media` | **strictOwnerFilter userId + businessId** ✅ (fix Task #358 — eliminado admin bypass) |
| `/backgrounds` | tenantLibraryFilter (N1 businessId + N2 misma industria + país diferente) — fail-closed si country=null |
| `/elements` | assertBizOwner (userId + businessId, sin bypass) |
| `/reels` | variantTenantCond userId |
| `/social-accounts` | tenantCond userId + businessId |
| `/landings` | tenantFilterCol userId |
| `/brand-profile` | query directa por userId |
| `/businesses` | query directa por userId |
| `/publish-log GET` | JOIN con posts, filtrado por userId |
| `/publish-log PATCH` | verificación de ownership via JOIN antes de update ✅ (fix Apr 2026) |
| `/music DELETE` | verifica ownership via media_library.userId |
| `/analytics` | scoped por userId |
| `/locations` | scoped por userId |
| `app_settings` | global intencional — config del sistema, no datos de usuarios |

### Funciones de AI generación — aislamiento verificado ✅

| Función | Mecanismo |
|---------|-----------|
| `getBrandContextBlock()` | Lee de `businessesTable` por businessId, o `brandProfilesTable` por userId |
| `resolveBrandColor()` | Lee `primaryColor` de `businessesTable` / `brandProfilesTable` por ID |
| `resolveBrandTagline()` | Lee `name + defaultLocation` de `businessesTable` por ID |
| `loadBusinessLogoBuffer()` | Lee `logo_url` de DB; soporta HTTP(S) y ruta local (path.basename) |
| `pickSlideHeadline()` | Scoped por businessId en `contentHistoryTable` |
| `generateBulkPosts()` | Lee niches por businessId+userId; `bizLocationSuffix` desde DB. Al inicio verifica en DB que `businessId` pertenece al `userId` → `throw` si no coinciden (Task #152) |
| `generateExtraPosts()` | `assertPostInsertOwnership()` llamada en 3 sitios de insert (`extraBoth`, `extraSpFeed`, `extraSpStory`) — fail-closed antes de cada `db.insert` (Task #152) |
| `assertPostInsertOwnership()` | Función module-level fail-closed en `ai.service.ts`. Parámetros: `(values, site, expectedUserId, expectedBusinessId)`. Si el campo en `values` es null o difiere del expected → `throw Error`. Llamada en 7 sitios de insert: `bothFeed`, `bothStory`, `spFeed`, `spStory`, `extraBoth`, `extraSpFeed`, `extraSpStory` (Task #152) |
| `generateImagesForPostsBg()` | Logo, textStyle, industry cargados desde `businessesTable` por bizId |
| `isSolarIndustry()` | Compara `business.industry` — nunca compara businessId === 1 |

### Logo de negocios — configuración verificada ✅

- Logos sirven via `/api/static/*` → `artifacts/api-server/assets/`
- ECO: `logo_url = '/api/static/eco-logo-blue.png'` ✅
- HazPost: `logo_url = NULL` → sin logo overlay ✅
- `loadBusinessLogoBuffer('/api/static/eco-logo-blue.png')` → `path.basename()` → lee `assets/eco-logo-blue.png` ✅

### Fixes aplicados ✅
- `social-accounts.ts`: eliminado `PAGE_ID = "356577317549386"` (FB page ID de ECO)
- `social-accounts.ts`: eliminado `"@eco.sas"` / `"Energy Capital Operation"` como username default
  Ahora usa `connectedPage.id` y `connectedPage.name` desde la API de Facebook
- `publish-log.ts`: PATCH mark-published ahora verifica que el log pertenece al usuario vía JOIN
- `ai.service.ts`: textStyle default `"eco"` → `"cinema"`
- `ai.service.ts`: comentarios "overrides userId for ECO check" → actualizado a descripción genérica
- `approval.tsx`: logo picker, post preview header, y todos los labels → dinámicos por negocio activo
- `generate.tsx`: foto de referencia eliminada del Generador Masivo
- **Task #359**: `tenant.ts`: tenantLibraryFilter y tenantLibraryAccessFilter ahora requieren `country != myCountry`
  para N2. Fail-closed si `myCountry` es null (negocio sin país → solo fondos propios N1).
  `businesses.country` y `image_variants.country` agregados via startup migration + schema Drizzle.
  `ai.service.ts`: stamping country en todos los inserts de image_variants.
  `businesses.ts`: PATCH acepta `country`; GET /:id agregado (al final para no interferir con /inactive).
  `settings.tsx`: selector de país (20 países LATAM+España). backgrounds.tsx: texto N2 actualizado.
- **Task #358**: `media.ts`: eliminado admin bypass en `GET /api/media` — reemplazado `tenantFilterCol`
  (que retornaba `undefined` para admin → query sin WHERE) por `strictOwnerFilter` que SIEMPRE filtra.
  Agregado `business_id` a `media_library` para aislamiento por negocio. Agregado `strictOwnerFilter`
  centralizado en `tenant.ts` como función estándar para recursos exclusivos sin excepción.

### Pendiente — branding en templates (no es fuga de datos, es cosmético) ❌
- `landings.ts`: templates HTML de landing pages con contenido de ECO hardcodeado
  (paneles solares, PPA, Deepal, schema.org con "ECO Energy Capital Operation")
  Riesgo: 🟡 MEDIO — solo si otro usuario usa el generador de landings
