---
name: cross-user-contamination
description: Detecta y diagnostica contaminación de datos entre USUARIOS distintos en el sistema multi-tenant de HazPost. Usa cuando un usuario puede ver posts, analytics, marca o imágenes de otro usuario diferente. Más grave que cross-business-contamination (que es dentro del mismo usuario).
---

# Skill: Detector de Contaminación Entre Usuarios

## Propósito
Diagnosticar sistemáticamente si datos de un usuario A están siendo expuestos o usados en el contexto del usuario B. Es el nivel más grave de contaminación en un sistema multi-tenant: afecta privacidad, seguridad y correctitud del producto para TODOS los clientes.

**Diferencia con cross-business-contamination:**
| Tipo | Alcance | Gravedad | Skill |
|------|---------|----------|-------|
| Cross-business | Negocio A contamina Negocio B del **mismo usuario** | Media — error visual | `cross-business-contamination` |
| Cross-user | Usuario A ve/recibe datos del **Usuario B** | Alta — fuga de datos entre cuentas | `cross-user-contamination` (este) |

## Cuándo activar este skill
- Un usuario reporta ver posts, métricas o imágenes que no generó
- Las imágenes de un usuario tienen colores/logo de una empresa diferente que no es suya
- Un cliente reporta que ve datos de otro cliente en su panel
- Después de refactors en rutas de analytics, posts, generación en background o el scheduler
- Al agregar nuevas rutas de API: verificar que todas tengan filtro por `userId`
- Al detectar queries sin `WHERE user_id = ?` en tablas sensibles

---

## Arquitectura de defensa (Task #66 — implementado)

### `artifacts/api-server/src/lib/tenant.ts` — Librería centralizada (FUENTE DE VERDAD)

Exporta:
- `tenantFilterCol(col, req)` — filtro tenant para cualquier tabla con columna userId
- `contentHistoryScope(userId, businessId)` — scope fail-closed para content_history (throws si ambos null)
- `contentHistoryScopeSafe(userId, businessId)` — scope fail-safe (retorna null → usar para background jobs)
- `requireBusinessOwnership(businessId, userId, isAdmin)` — verifica ownership antes de operar

**REGLA:** Toda ruta nueva DEBE importar de `lib/tenant.ts`. Nunca escribir tenantFilter inline.

### Anti-patrón prohibido en Drizzle (causa directa de los vectores VA-VC)
```typescript
// ❌ CRÍTICO: Drizzle ignora `undefined` en and() → retorna datos de TODOS los usuarios
const userCond = userId != null ? eq(table.userId, userId) : undefined;
await db.select().from(table).where(and(..., userCond));  // FUGA GLOBAL

// ✅ FAIL-CLOSED: si no hay userId, retornar vacío
if (userId == null) return [];
await db.select().from(table).where(eq(table.userId, userId));
```

---

## Mapa de vectores de riesgo (código real de HazPost)

### Vectores nuevos identificados y corregidos (Task #66)

| # | Archivo | Función | Tipo de riesgo | Estado |
|---|---------|---------|----------------|--------|
| VA | `ai.service.ts:~1460` | `getRecentAutoTopics(daysAgo, userId?)` | `userId=undefined` → `userCond=undefined` → Drizzle ignora → retorna topics de TODOS los usuarios | **CORREGIDO** |
| VB | `ai.service.ts:~1484` | `getNicheMonthlyUsage(userId?)` | Mismo patrón que VA — conteo de nichos de todos los usuarios | **CORREGIDO** |
| VC | `ai.service.ts:~1393` | `getRecentHooks(platform, userId?, businessId?)` | `scopeCond=undefined` si ambos null → retorna hooks de TODOS los usuarios | **CORREGIDO** |
| VD | `ai.service.ts:~3358` | `recentCharHashes` en `generateImagesForPostsBg` | Query sin filtro de userId → hashes de personajes de TODOS los usuarios | **CORREGIDO** |
| VE | `ai.service.ts:~1770` | `getBrandContextBlock(userId?, businessId?)` | `businessId` lookup sin verificar ownership → puede retornar marca de otro usuario | **CORREGIDO** |
| VF | `ai.service.ts:~1515` | `buildWeightedNichePool(niches)` | ER% calculado sobre posts de TODOS los usuarios → ponderación de nichos contaminada | **CORREGIDO** |
| VG | `ai.service.ts:getBrandContextBlock` | GPT name inference | GPT infiere industria desde nombre del negocio si `industry=null` (ej: "Monica Lucia" → estética) | **CORREGIDO** |

### Vectores de publicación cruzada por negocio (Task #125)

| # | Archivo | Función | Tipo de riesgo | Estado |
|---|---------|---------|----------------|--------|
| VM-1 | `instagram.service.ts:~200` | `getInstagramAccount(userId?, businessId?)` | Filtraba solo por `userId`, ignorando `businessId`. ECO (biz=1) y HazPost (biz=2) comparten `userId=1` → posts de HazPost se publicaban en la cuenta Instagram de ECO | **CORREGIDO** |
| VM-2a | `scheduler.service.ts:syncPublishedPostMetrics` | `syncPublishedPostMetrics()` | Usaba la primera cuenta IG (`[igAccount]`) sin filtrar por negocio → las métricas de publicación se sincronizaban sobre posts de todos los negocios sin discriminar cuenta | **CORREGIDO** |
| VM-2b | `scheduler.service.ts:refreshInstagramAudience` | `refreshInstagramAudience()` | Tomaba solo la primera cuenta Instagram sin iterar por negocio + guardaba snapshot en clave global `"audience_snapshot"` → último negocio sobreescribía snapshot de los anteriores | **CORREGIDO** |

### Vector de generación cruzada por stale state del frontend (Task #152)

| # | Archivo | Función | Tipo de riesgo | Estado |
|---|---------|---------|----------------|--------|
| VG-2 | `routes/social/posts.ts` + `ai.service.ts` | `POST /generate-bulk`, `POST /generate-extra`, `generateBulkPosts()` | El navegador enviaba un `businessId` en stale state de una sesión anterior (ej: admin tenía `businessId=2` de HazPost activo, usuario #8 inició sesión y el frontend no limpió el estado). El servidor aceptaba ese `businessId` sin verificar ownership → niches y brand context del negocio ajeno se usaban en la generación → contenido de otro tenant en posts del usuario #8 | **CORREGIDO (Task #152)** |

**Síntoma detectado en producción:** Usuario #8 (`contacto@clubventas.com`, negocio de relojes) recibió posts con contenido sobre marketing digital, IA y SaaS — temas de los nichos de HazPost (negocio del admin, `userId=1`).

### Vectores de contaminación de handle e identidad (Task #196)

| # | Archivo | Función/Componente | Tipo de riesgo | Estado |
|---|---------|-------------------|----------------|--------|
| VH-1 | `approval.tsx:~2914,~3084` | Preview de cola de aprobación | `@eco.sas` / `@eco.col` hardcodeado como handle para TODOS los usuarios → cualquier usuario que abre la vista de aprobación ve el handle de ECO | **CORREGIDO** |
| VH-2 | `ai.service.ts:generateBulkPosts` | Fallback de nichos globales | Cuando `userId==null && businessId==null`, la query no tenía guard → `nicheCond = eq(nichesTable.active, true)` fetching niches de TODOS los negocios | **CORREGIDO** |
| VH-3 | `ai.service.ts:generateExtraPosts` | Fallback de nichos globales | Mismo patrón que VH-2 en generateExtraPosts | **CORREGIDO** |
| VH-4 | `learning.service.ts:extractPatternsWithAI` | Learning engine, prompt AI | Prompt no prohibía que GPT usara nombres de empresa, handles o URLs de los captions analizados → patrones virales podían contener "según @eco.sas..." o similar | **CORREGIDO** |
| VH-5 | `content_learnings` (tabla DB) | Viral learnings históricos | Learnings virales generados con datos de un solo usuario (ECO) antes de la corrección VH-4 podían contaminar el contexto de todos los usuarios | **PURGADO (startup migration)** |

**Fix VH-1 — resolvePostHandle helper en approval.tsx:**
```typescript
// Prioridad: cuenta social vinculada por businessId > nombre del negocio > "@tunegocio"
const resolvePostHandle = (post: any): string => {
  const platform = post.platform === "tiktok" ? "tiktok" : "instagram";
  const match = socialAccounts.find(a => a.platform === platform && (post.businessId == null || a.businessId === post.businessId));
  if (match?.username) return `@${match.username.replace(/^@/, "")}`;
  if (activeBusinessName) return `@${activeBusinessName.toLowerCase().replace(/\s+/g, "").slice(0, 20)}`;
  return "@tunegocio";
};
```

**Fix VH-2/VH-3 — guard fail-closed en generación:**
```typescript
if (userId == null && businessId == null) {
  logger.warn("[generateBulkPosts] fail-closed: userId and businessId are both null");
  return { postIds: [], imageJobs: [], stoppedByCredits: false, actualCreditsUsed: 0 };
}
// Eliminado el ternario con rama global — ahora solo userId! cuando businessId==null
const nicheCond = businessId != null
  ? and(eq(nichesTable.active, true), eq(nichesTable.businessId, businessId))
  : and(eq(nichesTable.active, true), eq(nichesTable.userId, userId!));
```

**Fix VH-4 — Reglas en prompt de extractPatternsWithAI:**
```
REGLAS CRÍTICAS:
- Los patrones deben ser técnicas de escritura universales, NO menciones a marcas.
- PROHIBIDO incluir handles (@...), nombres de empresas, URLs o referencias a negocios.
- Los patrones deben poder aplicarse a cualquier empresa del mismo segmento.
```

**Fix VH-5 — Startup migration idempotente:**
```typescript
// Flag: "purge_viral_learnings_v1" en app_settings
DELETE FROM content_learnings WHERE is_viral = true;
```

**Root cause confirmado:** El frontend React mantenía el `businessId` seleccionado en estado global entre navegaciones. Al cambiar de cuenta sin recargar, el `businessId` de la sesión anterior se enviaba en el body de la request de generación. El servidor no verificaba ownership antes de usarlo para cargar nichos y contexto de marca.

**Fix aplicado en 4 capas (Task #152):**

1. **Ownership guard en rutas HTTP** (`posts.ts`) — Antes de cualquier llamada a AI, verifica que `body.businessId` pertenece al `uid` del token JWT. Si no → 403 `business_not_owned` + log de error. Es la primera línea de defensa.

2. **Tenant assertion con throw en `generateBulkPosts()`** (`ai.service.ts`) — Al inicio de la función, si `userId` y `businessId` son ambos no-null, verifica en DB que el negocio pertenece al usuario. Si no coinciden → `throw new Error(...)` (no retorno silencioso). Protege callers programáticos futuros.

3. **`assertPostInsertOwnership()` a nivel de módulo** (`ai.service.ts`) — Función fail-closed declarada antes de `generateBulkPosts` y `generateExtraPosts`. Verifica que cada `values` object tiene el mismo `userId`/`businessId` validados **antes de pasarlo al `db.insert`**. Falla si los campos están ausentes o no coinciden. Llamada en los 7 sitios de insert: `bothFeed`, `bothStory`, `spFeed`, `spStory`, `extraBoth`, `extraSpFeed`, `extraSpStory`.

4. **Null owner guard en scheduler** (`scheduler.service.ts`) — Si `biz.userId` es null, el negocio se salta con warn. Previene que un negocio sin owner genere posts sin contexto de tenant.

```typescript
// ✅ PATRÓN APLICADO en posts.ts — ownership guard antes de cualquier llamada AI
const [bizOwned] = await db.select({ id: businessesTable.id })
  .from(businessesTable)
  .where(and(eq(businessesTable.id, body.businessId), eq(businessesTable.userId, uid), eq(businessesTable.isActive, true)))
  .limit(1);
if (!bizOwned) {
  console.error(`[generate-bulk] OWNERSHIP VIOLATION: uid=${uid} tried to use businessId=${body.businessId}`);
  return res.status(403).json({ error: "...", code: "business_not_owned" });
}

// ✅ PATRÓN APLICADO en ai.service.ts — assertPostInsertOwnership (fail-closed)
function assertPostInsertOwnership(values, site, expectedUserId, expectedBusinessId) {
  if (expectedUserId != null) {
    if (values.userId == null || values.userId !== expectedUserId) throw new Error(`INSERT OWNERSHIP MISMATCH at ${site}`);
  }
  if (expectedBusinessId != null) {
    if (values.businessId == null || values.businessId !== expectedBusinessId) throw new Error(`INSERT OWNERSHIP MISMATCH at ${site}`);
  }
}
```

**Patrón fail-closed implementado en VM-1:**
```typescript
// ❌ INSEGURO — filtra solo por userId; si dos negocios del mismo usuario tienen IG,
// retorna la primera cuenta (posiblemente del negocio equivocado)
const [account] = await db.select().from(socialAccountsTable)
  .where(and(eq(socialAccountsTable.userId, userId), eq(socialAccountsTable.platform, "instagram")));

// ✅ SEGURO — fail-closed: requiere ambos userId Y businessId; sin ellos retorna null
export async function getInstagramAccount(userId?: number | null, businessId?: number | null) {
  if (userId == null && businessId == null) return null;
  const conditions = [eq(socialAccountsTable.platform, "instagram")];
  if (userId != null) conditions.push(eq(socialAccountsTable.userId, userId));
  if (businessId != null) conditions.push(eq(socialAccountsTable.businessId, businessId));
  const [account] = await db.select().from(socialAccountsTable).where(and(...conditions));
  return account ?? null;
}
```

**Propagación de businessId en cadena de publicación:**
- `publishPost(post)` → pasa `post.businessId` a todas las funciones de publicación
- `publishToInstagram(... userId, businessId)` → pasa a `getInstagramAccount(userId, businessId)`
- `publishReelToInstagram(... userId, businessId)` → pasa a `getInstagramAccount(userId, businessId)`
- `publishToFacebook(... userId, businessId)` → pasa a `getFacebookPageCredentials(userId, businessId)` → `getInstagramAccount(userId, businessId)`
- `publishToTikTok(... userId, businessId)` → pasa a `getTikTokAccount(userId, businessId)`
- `syncPublishedPostMetrics()` → itera sobre TODAS las cuentas IG (una por negocio), scopea posts por `businessId`

### Vectores históricos (pre-Task #66)

| # | Archivo | Función / Línea | Tipo de riesgo | Severidad |
|---|---------|-----------------|----------------|-----------|
| V1 | `posts.ts:169` | `getPostWithVariants(postId, userId?, isAdmin=true)` | `isAdmin=true` por defecto: si se llama sin userId, no filtra por tenant | **ALTA** |
| V2 | `ai.service.ts:3108-3129` | `resolveBrandColor(userId?, businessId?)` | (a) Si `userId=undefined` y `businessId=undefined` → retorna `undefined` sin error (seguro). (b) Si `businessId` definido pero no pertenece al userId → retorna colores de otro usuario | **MEDIA** |
| V2b | `ai.service.ts:3131-3164` | `resolveBrandTagline(userId?, businessId?)` | Mismo patrón que V2: lookup por `businessId` sin verificar ownership del userId | **MEDIA** |
| V3 | `analytics.ts:13-15` | `tenantCond(req)` devuelve `undefined` para admin | Admin ve datos de TODOS los usuarios (diseño intencional, pero peligroso si se replica en contextos no-admin) | **MEDIA** |
| V4 | `analytics.ts:126` | `.where(tc ? eq(...userId) : undefined)` | Si `tc` es falsy, no hay filtro de usuario → fuga de publish logs a admin | **MEDIA** |
| V5 | `ai.service.ts:3173+` | `generateImagesForPostsBg` — jobs sin userId | Si un job llega con `userId=undefined`, el brand lookup puede usar otro usuario (ya tiene fix defensivo de Task #56) | **MEDIA** |
| V6 | `posts.ts:33-46` | `loadSavedReferenceAnalyses(userId: number)` | Si se llama con el userId equivocado, inyecta los estilos visuales de referencia de otro usuario en los prompts de AI — contaminando el estilo de imagen | **MEDIA** |
| V7 | `posts.ts:789,798` | `getNextAvailableSlot(... isAdmin=false)` | Cuando `isAdmin=true`, la query de scheduling no filtra por userId → considera posts de TODOS los usuarios para calcular slots disponibles, revelando indirectamente la actividad de otros | **MEDIA** |
| V8 | `posts.ts:852,866` | `getNextSlotForPlatformAndType(... isAdmin=false)` | Mismo patrón que V7 — admin path sin filtro de tenant en la query de scheduling por tipo de contenido | **MEDIA** |
| V9 | `posts.ts:207-208` | `?userId=<n>` en query params | El `scopeUser` verifica `isAdmin` antes de usar `targetUid` — actualmente seguro, pero patrón frágil si cambia la lógica | **BAJA** |
| V10 | `scheduler.service.ts` + `ai.service.ts` + `routes/social/posts.ts` | Cadena de generación sin ownership check | El scheduler pasaba `biz.userId` correctamente, pero las rutas HTTP aceptaban cualquier `businessId` del body sin verificar ownership, y `generateBulkPosts` no abortaba ante mismatch. Ver vector **VG-2** para la descripción completa del incidente y el fix de 4 capas aplicado en Task #152. | **CORREGIDO (Task #152)** |

---

## Protocolo de diagnóstico (paso a paso)

### Paso 1 — Confirmar si hay fuga de datos entre usuarios en DB

```sql
-- ¿Hay posts con userId incorrecto (el post está en negocio de otro usuario)?
SELECT p.id, p.user_id, p.business_id, b.user_id AS biz_owner_id, b.name AS biz_name
FROM posts p
JOIN businesses b ON b.id = p.business_id
WHERE p.user_id != b.user_id
ORDER BY p.created_at DESC
LIMIT 20;
-- Resultado esperado: 0 filas. Si hay filas → contaminación de datos confirmada.

-- ¿Hay image_variants con userId diferente al userId del post?
SELECT iv.id, iv.post_id, iv.user_id AS iv_user_id, p.user_id AS post_user_id
FROM image_variants iv
JOIN posts p ON p.id = iv.post_id
WHERE iv.user_id IS NOT NULL AND iv.user_id != p.user_id
LIMIT 20;
-- Resultado esperado: 0 filas.

-- ¿Hay niches de un usuario asignados a negocios de otro usuario?
SELECT n.id, n.user_id AS niche_user_id, n.business_id, b.user_id AS biz_owner
FROM niches n
JOIN businesses b ON b.id = n.business_id
WHERE n.user_id != b.user_id
LIMIT 10;
```

### Paso 2 — Verificar analytics y publish logs

```sql
-- ¿Los publish logs de usuario A aparecen en consultas de usuario B?
-- (simular la query de analytics.ts:126 con tc=undefined/admin):
SELECT user_id, COUNT(*) AS total
FROM publish_logs
GROUP BY user_id
ORDER BY total DESC;
-- Si todos los logs se agrupan correctamente por user_id → los datos están aislados en DB.
-- El riesgo es que la ruta de analytics los exponga todos al admin (diseño intencional).

-- ¿Hay posts cuyo negocio tiene un brand_profile de un usuario diferente al userId del post?
-- (detecta si un negocio fue reasignado a otro usuario pero los posts mantienen el userId original)
SELECT p.id AS post_id, p.user_id AS post_uid,
       b.user_id AS biz_uid,
       bp.user_id AS brand_profile_uid,
       b.name AS biz_name
FROM posts p
JOIN businesses b ON b.id = p.business_id
LEFT JOIN brand_profiles bp ON bp.user_id = b.user_id
WHERE p.user_id IS NOT NULL
  AND p.user_id != b.user_id
LIMIT 10;
-- Resultado esperado: 0 filas. Si hay → post pertenece a usuario diferente al dueño del negocio.
```

### Paso 3 — Auditar el código: funciones internas sin filtro de tenant

```bash
# V1: buscar llamadas a getPostWithVariants sin pasar userId
grep -n "getPostWithVariants(" artifacts/api-server/src/routes/social/posts.ts | grep -v ", req.user\|, uid\|userId"

# V2/V2b: buscar llamadas a resolveBrandColor/resolveBrandTagline
grep -n "resolveBrandColor\|resolveBrandTagline" artifacts/api-server/src/services/ai.service.ts
# Para cada llamada: verificar que se pasen userId Y businessId correctos (del mismo usuario)

# V6: verificar callers de loadSavedReferenceAnalyses — deben usar uid de req.user
grep -n "loadSavedReferenceAnalyses" artifacts/api-server/src/routes/social/posts.ts
# Resultado esperado: solo llamadas con `uid` (de req.user!.userId), nunca con literal o variable incorrecta

# V7/V8: verificar que getNextAvailableSlot y getNextSlotForPlatformAndType
# reciben el userId correcto del request (no hardcoded ni de otro contexto)
grep -n "getNextAvailableSlot\|getNextSlotForPlatformAndType" artifacts/api-server/src/routes/social/posts.ts
# Para cada llamada: confirmar que el userId es req.user!.userId, no undefined ni de otro usuario

# Buscar queries en tablas sensibles sin filtro userId (posible fuga de tenant):
grep -rn "\.from(postsTable\|\.from(brandProfilesTable\|\.from(businessesTable" artifacts/api-server/src/ \
  | grep -v "userId\|user_id\|businessId\|business_id\|\.id)\|id =\|\.id =" \
  | grep -v "//\|console"
```

### Paso 4 — Auditar rutas de API: ¿todas tienen tenantCond?

```bash
# Listar todos los router.get/post/put/patch/delete en analytics.ts
grep -n "router\.\(get\|post\|put\|patch\|delete\)" artifacts/api-server/src/routes/social/analytics.ts
# Para cada ruta, verificar que usa tenantCond o tenantCondWithBusiness

# Buscar rutas que NO aplican ningún filtro de usuario:
grep -rn "router\.\(get\|post\|put\|delete\)\b" artifacts/api-server/src/routes/ --include="*.ts" -A 10 \
  | grep -B 5 "\.where(undefined\|\.where()\|select().from(" \
  | grep -v "req.user\|userId\|tenantCond"
```

### Paso 5 — Test manual de aislamiento entre usuarios

1. Crear (o usar) dos cuentas distintas: `userA@test.com` (userId=1) y `userB@test.com` (userId=X)
2. Generar posts con userA (plataforma="both")
3. Iniciar sesión como userB en otra ventana del navegador
4. Verificar en el panel de userB que NO aparecen los posts de userA
5. Verificar en analytics de userB que las métricas no incluyen datos de userA
6. Verificar en los logs del servidor que cada request de userB usa `userId=X` consistentemente:
   ```bash
   # En logs del servidor, buscar si userId de userA (ej: 1) aparece en requests de userB:
   grep "userId.*1" /tmp/logs/artifactsapi-server_API_Server_*.log | grep -v "admin"
   ```

---

## Patrones de código inseguros vs. seguros

### Patrón inseguro: isAdmin=true por defecto (V1)
```typescript
// ❌ INSEGURO — isAdmin=true hace que cualquier postId sea accesible sin filtro de usuario
async function getPostWithVariants(postId: number, userId?: number, isAdmin = true) {
  const cond = isAdmin
    ? eq(postsTable.id, postId)                                    // ← sin filtro de userId
    : and(eq(postsTable.id, postId), eq(postsTable.userId, userId!));
  // ...
}

// Si alguien llama así: getPostWithVariants(postId) → isAdmin=true → ve cualquier post

// ✅ SEGURO — cambiar el default o exigir userId siempre
async function getPostWithVariants(postId: number, userId: number, isAdmin = false) {
  const cond = isAdmin
    ? eq(postsTable.id, postId)
    : and(eq(postsTable.id, postId), eq(postsTable.userId, userId));
  // ...
}
```

### Patrón inseguro: businessId lookup sin verificar owner (V2)
```typescript
// ❌ INSEGURO — si businessId=1 (ECO, de userId=1), un caller con userId=99 obtiene datos de ECO
const [biz] = await db
  .select({ primaryColor: businessesTable.primaryColor })
  .from(businessesTable)
  .where(eq(businessesTable.id, businessId))  // ← solo filtra por id, no por userId
  .limit(1);

// ✅ SEGURO — verificar también que el negocio pertenece al usuario
const [biz] = await db
  .select({ primaryColor: businessesTable.primaryColor })
  .from(businessesTable)
  .where(and(
    eq(businessesTable.id, businessId),
    eq(businessesTable.userId, userId)  // ← garantiza ownership
  ))
  .limit(1);
```

### Patrón inseguro: tenantCond condicional (V3/V4)
```typescript
// ❌ FRÁGIL — si tc es undefined (admin), no hay WHERE → retorna datos de todos los usuarios
const tc = tenantCond(req);  // undefined para admin
await db.select().from(publishLogTable).where(tc ? eq(publishLogTable.userId, uid) : undefined);

// ✅ SEGURO — siempre aplicar filtro de userId, incluso para admin (a menos que sea admin-panel explícito)
const uid = req.user!.userId;
await db.select().from(publishLogTable).where(eq(publishLogTable.userId, uid));

// ✅ SEGURO — si admin debe ver todo, hacerlo explícito con un parámetro separado:
const isAdminAll = req.user!.role === "admin" && req.query.scope === "all";
const condition = isAdminAll ? undefined : eq(publishLogTable.userId, uid);
await db.select().from(publishLogTable).where(condition);
```

### Patrón inseguro: background job sin userId (V5)
```typescript
// ❌ INSEGURO — job sin userId: resolveBrandColor recibirá userId=undefined → usa datos incorrectos
imageJobs.push({
  postId: post.id,
  nicheContextShort,
  captionHook,
  // userId y businessId AUSENTES
});

// ✅ SEGURO — siempre propagar userId y businessId al job:
imageJobs.push({
  postId: post.id,
  userId: userId ?? undefined,
  businessId: businessId ?? undefined,
  nicheContextShort,
  captionHook,
});
```

---

## Fix estándar por vector

### Fix V1 — Cambiar default de isAdmin en getPostWithVariants
```typescript
// posts.ts ~línea 169
// ANTES:
async function getPostWithVariants(postId: number, userId?: number, isAdmin = true)

// DESPUÉS: cambiar default a false y hacer userId requerido para el path no-admin
async function getPostWithVariants(postId: number, userId?: number, isAdmin = false)
// Actualizar todos los call sites que esperaban isAdmin=true:
// - Llamadas internas administrativas deben pasar isAdmin=true explícitamente
```

### Fix V2 — Agregar ownership check en resolveBrandColor/Tagline
```typescript
// ai.service.ts ~línea 3110-3116
// Agregar userId al WHERE del businessesTable lookup:
.where(and(
  eq(businessesTable.id, businessId),
  ...(userId != null ? [eq(businessesTable.userId, userId)] : [])
))
```

### Fix V3/V4 — tenantCond: nunca devolver undefined en rutas de usuario regular
```typescript
// analytics.ts: si la ruta es para usuario (no panel admin), reemplazar:
.where(tc ? eq(publishLogTable.userId, uid) : undefined)
// Por:
.where(eq(publishLogTable.userId, uid))
// Y si la ruta es para admin-panel, documentarlo explícitamente:
// ADMIN ONLY — no tenant filter intentional
```

### Fix V5 — Propagación de userId/businessId en jobs (ya aplicado en Task #56)
Ver skill `cross-business-contamination` para el fix detallado ya aplicado.

### Fix V6 — loadSavedReferenceAnalyses: verificar que userId es correcto antes de llamar
```typescript
// posts.ts ~líneas 364 y 485 — los callers deben garantizar que uid viene de req.user
// ANTES (riesgo si uid es undefined o incorrecto):
const savedAnalyses = await loadSavedReferenceAnalyses(uid);

// ✅ SEGURO — exigir que uid sea un número válido antes de llamar:
if (uid != null && Number.isInteger(uid)) {
  const savedAnalyses = await loadSavedReferenceAnalyses(uid);
  // ... usar savedAnalyses
}

// La función internamente ya filtra por userId correctamente:
// .where(eq(brandProfilesTable.userId, userId))
// El riesgo es pasarle un userId incorrecto desde el caller.
```

### Fix V7/V8 — getNextAvailableSlot / getNextSlotForPlatformAndType con isAdmin
```typescript
// posts.ts ~línea 798 y 866
// ESTADO ACTUAL (riesgo en path admin):
const tenantCond = isAdmin ? statusCond : and(statusCond, eq(postsTable.userId, userId));

// Para scheduling, incluso admin debe ver solo sus propios posts ocupados,
// a menos que esté en el panel "scope=all". El fix es agregar userId también para admin:
const tenantCond = and(statusCond, eq(postsTable.userId, userId));
// Y si la ruta de reschedule es admin-exclusiva con visión global, documentarlo:
// ADMIN GLOBAL VIEW — intentional, no per-tenant filter

// Verificar en los callers (posts.ts ~línea 695):
const scheduledAt = await getNextAvailableSlot(platform, excludeId, req.user!.userId, req.user!.role === "admin");
// Si isAdmin=true se pasa para admin, y la query no filtra por userId → admin
// obtiene slots considerando posts de TODOS los usuarios como "ocupados"
```

---

## Queries SQL de auditoría preventiva

Ejecutar periódicamente o antes de desplegar cambios en rutas de generación, analytics o scheduler:

```sql
-- Auditoría 1: posts con userId/businessId inconsistente
SELECT p.id, p.user_id, p.business_id,
       b.user_id AS biz_owner,
       b.name    AS biz_name
FROM posts p
LEFT JOIN businesses b ON b.id = p.business_id
WHERE p.business_id IS NOT NULL
  AND p.user_id IS DISTINCT FROM b.user_id
ORDER BY p.created_at DESC;

-- Auditoría 2: negocios con userId incorrecto
SELECT b.id, b.name, b.user_id, u.email
FROM businesses b
JOIN users u ON u.id = b.user_id
ORDER BY b.user_id, b.id;

-- Auditoría 3: niches sin userId consistente con su negocio
SELECT n.id, n.name, n.user_id AS niche_uid, b.user_id AS biz_uid, b.name AS biz_name
FROM niches n
JOIN businesses b ON b.id = n.business_id
WHERE n.user_id != b.user_id;

-- Auditoría 4: image_variants con userId inconsistente
SELECT iv.id, iv.post_id, iv.user_id AS iv_uid, p.user_id AS post_uid
FROM image_variants iv
JOIN posts p ON p.id = iv.post_id
WHERE iv.user_id IS NOT NULL
  AND iv.user_id != p.user_id
LIMIT 20;

-- Auditoría 5: brand_profiles huérfanos (userId que no existe en users)
SELECT bp.user_id, bp.company_name
FROM brand_profiles bp
LEFT JOIN users u ON u.id = bp.user_id
WHERE u.id IS NULL;

-- Auditoría 6: scheduling — slots duplicados entre usuarios distintos (misma fecha/hora/plataforma)
-- Detecta si getNextAvailableSlot produjo colisiones por no filtrar por userId
SELECT p1.user_id AS uid_a, p2.user_id AS uid_b,
       p1.id AS post_a, p2.id AS post_b,
       p1.platform,
       p1.scheduled_at
FROM posts p1
JOIN posts p2 ON p1.scheduled_at = p2.scheduled_at
             AND p1.platform = p2.platform
             AND p1.user_id != p2.user_id
             AND p1.id < p2.id
WHERE p1.status IN ('pending_approval','scheduled')
  AND p2.status IN ('pending_approval','scheduled')
  AND p1.scheduled_at IS NOT NULL
ORDER BY p1.scheduled_at DESC
LIMIT 20;
-- Filas aquí no son necesariamente un bug (dos usuarios pueden schedulear en la misma hora)
-- pero es señal de posible mezcla de scheduling si los horarios son idénticos al milisegundo.
```

---

## Criterios de aceptación (cuándo el aislamiento entre usuarios es correcto)

- [ ] Las auditorías SQL preventivas (sección anterior) retornan 0 filas
- [ ] Un usuario NO-admin que pasa `?userId=<otro>` en la URL recibe sus propios datos (nunca los de otro)
- [ ] Un usuario que genera posts solo ve en su panel posts asociados a su `userId`
- [ ] Los analytics de cada usuario solo incluyen métricas de sus propios posts/negocios
- [ ] Las imágenes generadas para userId=X usan colores/logo/firma del negocio de userId=X (nunca de userId=Y)
- [ ] El scheduler genera posts para cada negocio con el `userId` correcto del dueño del negocio (V10)
- [ ] `getPostWithVariants` solo es llamada con `isAdmin=true` en contextos verificados como admin (V1)
- [ ] `resolveBrandColor` y `resolveBrandTagline` no devuelven datos de un negocio que no pertenece al userId del request (V2/V2b)
- [ ] `loadSavedReferenceAnalyses` solo es llamada con el `userId` del usuario autenticado, nunca con valores hardcoded o de otro contexto (V6)
- [ ] `getNextAvailableSlot` y `getNextSlotForPlatformAndType` cuando se llaman para un usuario regular, retornan slots considerando solo los posts de ese usuario (no de todos) (V7/V8)
- [ ] No hay queries activas a tablas sensibles (`posts`, `brand_profiles`, `niches`, `image_variants`, `publish_logs`) sin filtro de `userId` en rutas de usuario regular
- [ ] `getInstagramAccount` siempre recibe `businessId` en la cadena de publicación — nunca solo `userId` (VM-1)
- [ ] `publishPost` propaga `post.businessId` a todas las funciones de publicación downstream (VM-1)
- [ ] `syncPublishedPostMetrics` itera sobre todas las cuentas IG y scopea posts por `businessId` (VM-2)
- [ ] `refreshInstagramAudience` itera sobre todas las cuentas IG con `refreshInstagramAudienceForAccount` (VM-2)
- [ ] `getTikTokAccount` y `getFacebookPageCredentials` tienen parámetro `ownerBusinessId` y lo usan en el filtro DB (VM-1 equiv.)
