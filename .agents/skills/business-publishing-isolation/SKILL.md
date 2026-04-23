---
name: business-publishing-isolation
description: Arquitectura de aislamiento de publicación a redes sociales por negocio en HazPost. Úsalo cuando trabajes en publicación automática o manual a Instagram/TikTok/Facebook, cuando modifiques el scheduler, o cuando sospeches que posts de un negocio se publican en cuentas de otro negocio. Cubre el flujo completo de publicación, los vectores de riesgo VM-1/VM-2/VM-3/V-CAL/V-WARN/V-SCHEDULER, el patrón fail-closed de getInstagramAccount, el guard del scheduler para negocios sin cuentas, el hook useBusinessPosts con enabled:loaded, y las queries SQL de auditoría.
---

# Skill: Aislamiento de Publicación por Negocio

## Propósito

Garantizar que cada post se publique **exclusivamente en la cuenta de redes sociales del negocio al que pertenece**. En HazPost un usuario puede tener múltiples negocios (ej: ECO biz=1, HazPost biz=2, ambos con `userId=1`). Sin aislamiento por `businessId`, posts de HazPost podrían publicarse en la cuenta Instagram de ECO.

---

## Arquitectura real: tabla `social_accounts`

```sql
-- Cada cuenta de red social tiene tanto userId como businessId
SELECT id, user_id, business_id, platform, page_id, created_at
FROM social_accounts
ORDER BY business_id, platform;

-- Ejemplo en producción:
-- id=1, userId=1, businessId=1 (ECO), platform='instagram'
-- id=2, userId=1, businessId=1 (ECO), platform='facebook'
-- → Si HazPost conecta IG: id=3, userId=1, businessId=2 (HazPost), platform='instagram'
```

**Columnas clave**: `user_id`, `business_id`, `platform`, `page_id`, `access_token`  
**Archivo schema**: `lib/db/src/schema/social_accounts.ts`

---

## Cadena completa de publicación (flujo seguro — Task #125)

```
scheduler.service.ts: publishPost(postId)
  ↓ carga el post → obtiene post.userId, post.businessId
  ↓
  ├─ Instagram/Reel → publishToInstagram(imageData, caption, ..., post.userId, post.businessId)
  │    └─ getInstagramAccount(userId, businessId)   ← PUNTO CRÍTICO: AND filter
  │
  ├─ Instagram Reel → publishReelToInstagram(videoUrl, ..., post.userId, post.businessId)
  │    └─ getInstagramAccount(userId, businessId)   ← mismo AND filter
  │
  ├─ Facebook → publishToFacebook(imageData, ..., post.userId, post.businessId)
  │    └─ getFacebookPageCredentials(ownerUserId, ownerBusinessId)
  │         └─ getInstagramAccount(userId, businessId)   ← mismo AND filter
  │
  └─ TikTok → publishToTikTok(tiktokData, ..., post.userId, post.businessId)
       └─ getTikTokAccount(ownerUserId, ownerBusinessId)   ← AND filter
```

**Invariante**: `post.businessId` SIEMPRE se propaga completo por toda la cadena. Nunca usar solo `userId` en la cadena de publicación.

---

## Vectores de riesgo corregidos

| # | Función | Bug original | Fix aplicado |
|---|---------|-------------|-------------|
| **VM-1** | `getInstagramAccount(userId)` | Filtraba solo por `userId` → ambos negocios del mismo usuario devolvían la misma cuenta (la primera en DB) | `AND(platform, userId, businessId)` — fail-closed |
| **VM-2a** | `syncPublishedPostMetrics()` | Tomaba `[igAccount]` (primera cuenta IG) sin filtrar por negocio → métricas de todos los negocios se sincronizaban en la misma cuenta | Itera TODAS las cuentas IG, scopea posts por `businessId` de cada cuenta |
| **VM-2b** | `refreshInstagramAudience()` | Tomaba `[igAccount]` (primera) + guardaba en clave global `"audience_snapshot"` → última cuenta sobreescribía el snapshot de las anteriores | `refreshInstagramAudienceForAccount()` per cuenta, clave `"audience_snapshot_biz_N"` |
| **VM-3** | Configuración de `social_accounts` | Dos negocios del mismo usuario se registraron con el mismo `page_id` (misma página de Facebook). `getInstagramAccount(userId, businessId2)` retornaba sa correcto pero ese registro apuntaba a la página del otro negocio → post de HazPost se publicó en @eco.sas | (a) Startup migration elimina CUALQUIER cuenta Instagram de HazPost (biz=2) con page_id de ECO — `WHERE user_id=1 AND business_id=2 AND platform='instagram' AND page_id='356577317549386'` (sin hardcodear id). (b) Guard 409 en endpoints de upsert. (c) Scheduler Step 3 relajado a WARN (no bloquea si ig_user_id=NULL — ECO publicó 7 veces sin ese campo). (d) Startup migration de pageId scoped a ECO (user_id=1, business_id=1) — antes aplicaba a TODOS los IG, corrompía page_id de HazPost. |
| **VM-4a** | `useGetPosts` en `approval.tsx` y `dashboard.tsx` | Consultas de posts sin `businessId` → la cola de aprobación y el dashboard mostraban posts de todos los negocios del usuario mezclados. Usuario podía aprobar/publicar post del negocio equivocado sin saberlo. | Hook centralizado `useBusinessPosts` reemplaza `useGetPosts` directo — inyecta automáticamente `businessId` del `ActiveBusinessContext`. Cada página que use el hook hereda el filtro. |
| **VM-4b** | OAuth Meta/TikTok redirect — `getActiveBusinessId` | `oauth.ts` usaba `getActiveBusinessId(userId)` que SIEMPRE retorna el negocio con `isDefault=true` en DB (ECO biz=1), sin importar qué tiene seleccionado el usuario en el frontend. Conectar Instagram con HazPost activo guardaba la cuenta en ECO. | Frontend (`settings.tsx`) pasa `?businessId=X` al redirect URL. Backend lee `req.query.businessId` primero con guard de ownership; fallback a `getActiveBusinessId` para usuarios legacy. |
| **VM-4c** | Sin indicador visual de negocio en la cola | Aprobación de posts de negocio equivocado era invisible — no había badge que indicara a qué negocio pertenece el post actual. | Badge `[NombreNegocio]` en la cabecera del post en `approval.tsx`, visible solo cuando el usuario tiene 2+ negocios (`Object.keys(businessNameMap).length > 1`). |
| **V-CAL** | Calendario mostraba todos los negocios por defecto | Cuando no había scope guardado en localStorage, `calendarBizScope` inicializaba en `null` / "all" → todos los posts de todos los negocios aparecían mezclados en el calendario, creando contaminación visual. | Al inicializar sin valor guardado y con 2+ negocios, el scope se fija en el ID del negocio activo global (`useActiveBusiness().id`). El usuario puede seleccionar "todos" manualmente. |
| **V-WARN** | Aprobación sin advertencia cuando el negocio no tiene cuentas | Si el negocio activo no tiene ninguna cuenta social conectada, el usuario podía aprobar posts sin saber que no se publicarían. El post pasaba a `scheduled` y fallaba en el scheduler sin feedback previo. | Banner amarillo visible en la cola de aprobación: "Este negocio no tiene cuentas de redes sociales conectadas". Derivado de `socialAccounts.some(a => a.businessId === globalBizId)`. |
| **V-SCHEDULER** | Scheduler intentaba publicar posts de negocios sin cuentas, reintentando cada ciclo | Si un negocio (ej: HazPost biz=2) no tenía ninguna cuenta en `social_accounts`, el scheduler llamaba `publishToInstagram` → fallaba → registraba failed en publish_log, pero el post podía quedar en `scheduled` en ciertos paths y ser reintentado indefinidamente. | Guard al inicio de `publishPost()`: verifica que `social_accounts` tenga al menos 1 fila para `businessId`. Si no tiene, marca el post como `failed` inmediatamente y retorna. Sin reintentos. |
| **V-QUERY** | `useBusinessPosts` hacía request sin businessId durante carga inicial | Mientras `ActiveBusinessContext` cargaba (`loaded=false`), el hook llamaba `useGetPosts({})` sin `businessId`. El backend aplicaba `getActiveBusinessId` (fallback al negocio default), que podía retornar posts del negocio equivocado brevemente. | Se pasa `{ query: { enabled: loaded } }` como segundo argumento de `useGetPosts`. La query queda deshabilitada hasta que el contexto esté completamente cargado. |
| **V-RESCHEDULE** | Scheduler nunca reintentaba posts que fallaron previamente, incluso después de reconectar OAuth | `publishScheduledPosts()` Query 2 (Instagram per-platform) tiene guarda `NOT EXISTS (SELECT 1 FROM publish_log WHERE platform='instagram' AND status='failed')`. Diseñada para evitar loops infinitos, pero también bloqueaba posts válidos que fallaron con token expirado y luego el usuario reconectó OAuth. El "Reintentar" manual funcionaba porque llama `publishPost()` directamente sin pasar por esa query. | `PUT /:id` handler (posts.ts) limpia los registros `failed` de `publish_log` cuando el usuario reagenda el post (cambia `scheduledAt`, `scheduledAtInstagram`, `scheduledAtTiktok`, o `status=scheduled`). El scheduler puede encontrarlo en el siguiente ciclo. Fix: 18 abr 2026. |

---

## Patrón fail-closed: `getInstagramAccount`

**Archivo**: `artifacts/api-server/src/services/instagram.service.ts`

```typescript
// ❌ INSEGURO (antes de Task #125)
// Filtraba solo por userId — en multi-negocio devuelve la primera cuenta
const [account] = await db.select().from(socialAccountsTable)
  .where(and(
    eq(socialAccountsTable.userId, userId),
    eq(socialAccountsTable.platform, "instagram")
  ));

// ✅ SEGURO — fail-closed: userId=null → null (ownership no verificable)
// userId + businessId → AND filter (estricto, usado en la cadena de publicación)
// userId solo → filter por userId (legacy, un solo negocio por usuario)
export async function getInstagramAccount(userId?: number | null, businessId?: number | null) {
  if (userId == null) {
    // Sin userId no se puede verificar ownership del negocio — retornar null
    return null;
  }
  const platformCond = eq(socialAccountsTable.platform, "instagram");
  const cond = businessId != null
    ? and(platformCond, eq(socialAccountsTable.userId, userId), eq(socialAccountsTable.businessId, businessId))
    : and(platformCond, eq(socialAccountsTable.userId, userId));
  const [account] = await db.select().from(socialAccountsTable).where(cond);
  return account ?? null;
}
```

**Mismo patrón aplicado en `getTikTokAccount`** (`tiktok.service.ts`): userId=null → null.

---

## Patrón correcto: iteración por cuenta en scheduler

```typescript
// ❌ INSEGURO — toma solo la primera cuenta IG, ignora los demás negocios
const [igAccount] = await db.select().from(socialAccountsTable)
  .where(eq(socialAccountsTable.platform, "instagram"));
// → si hay 2 cuentas IG (ECO + HazPost), solo procesa ECO siempre

// ✅ SEGURO — itera TODAS las cuentas IG, aísla por businessId
const igAccounts = await db.select().from(socialAccountsTable)
  .where(eq(socialAccountsTable.platform, "instagram"));

for (const igAccount of igAccounts) {
  const posts = await db.select().from(postsTable).where(
    and(
      eq(postsTable.status, "published"),
      igAccount.businessId != null
        ? eq(postsTable.businessId, igAccount.businessId)
        : eq(postsTable.userId, igAccount.userId!)
    )
  );
  // procesar posts de ESTE negocio con ESTA cuenta
}
```

---

## Patrón correcto: snapshots de audiencia con scope por negocio

```typescript
// ❌ INSEGURO — clave global, la última cuenta sobreescribe las anteriores
await db.update(appSettingsTable)
  .set({ value: JSON.stringify(snapshot) })
  .where(eq(appSettingsTable.key, "audience_snapshot"));

// ✅ SEGURO — clave por negocio, cada negocio tiene su propio snapshot
const snapshotKey = igAccount.businessId != null
  ? `audience_snapshot_biz_${igAccount.businessId}`
  : "audience_snapshot";  // fallback legacy para cuentas sin businessId
```

**Lectura en analytics.ts**: usa `getAudienceSnapshot(userId)` que lee la clave del negocio activo del usuario con fallback al legacy.

---

## Patrón centralizado VM-4a + V-QUERY: hook `useBusinessPosts`

**Archivo**: `artifacts/social-dashboard/src/hooks/useBusinessPosts.ts`

```typescript
// ✅ CORRECTO — siempre usar useBusinessPosts en lugar de useGetPosts
// La query está DESHABILITADA hasta que loaded=true (el contexto haya cargado).
// Esto garantiza que nunca se hace una request sin businessId definido.
import { useBusinessPosts } from "@/hooks/useBusinessPosts";
const { data: posts } = useBusinessPosts({ status: 'pending_approval,scheduled', slim: '1' });

// ❌ PROHIBIDO — useGetPosts directamente desde páginas
import { useGetPosts } from "@workspace/api-client-react";
const { data: posts } = useGetPosts({ status: 'pending_approval,scheduled' }); // sin businessId ni enabled guard
```

**Implementación actual del hook** (incluye guard V-QUERY):
```typescript
export function useBusinessPosts(params: Parameters<typeof useGetPosts>[0] = {}) {
  const { id: businessId, loaded } = useActiveBusiness();
  return useGetPosts(
    { ...params, ...(businessId != null ? { businessId: String(businessId) } : {}) },
    { query: { enabled: loaded } },  // ← V-QUERY fix: deshabilitado hasta que contexto cargue
  );
}
```

---

## Patrón V-SCHEDULER: guard de "negocio sin cuentas" en `publishPost`

**Archivo**: `artifacts/api-server/src/services/scheduler.service.ts`

```typescript
// ✅ OBLIGATORIO — Al inicio de publishPost(), antes de cualquier intento de publicación:
export async function publishPost(postId: number, platformOverride?: "instagram" | "tiktok"): Promise<void> {
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (!post) return;

  // Guard V-SCHEDULER: si el negocio no tiene ninguna cuenta social, falla inmediatamente
  if (post.businessId != null) {
    const [hasSocialAccount] = await db
      .select({ id: socialAccountsTable.id })
      .from(socialAccountsTable)
      .where(eq(socialAccountsTable.businessId, post.businessId))
      .limit(1);

    if (!hasSocialAccount) {
      const [biz] = await db.select({ name: businessesTable.name })
        .from(businessesTable).where(eq(businessesTable.id, post.businessId)).limit(1);
      const bizName = biz?.name ?? `negocio #${post.businessId}`;
      const errorMsg = `El negocio "${bizName}" no tiene cuentas de redes sociales conectadas — conecta Instagram o TikTok en Configuración`;
      await db.insert(publishLogTable).values({
        postId: post.id, userId: post.userId ?? undefined,
        platform: post.platform ?? "instagram", status: "failed", errorMessage: errorMsg,
      });
      await db.update(postsTable).set({ status: "failed" }).where(eq(postsTable.id, postId));
      return; // sin reintentos
    }
  }
  // ... continúa con la publicación normal
}

// ❌ PROHIBIDO — No agregar esta verificación como parche ad-hoc por negocio específico:
if (post.businessId === 2) return; // ← hardcoded, no escala
```

---

## Patrón V-RESCHEDULE: limpiar publish_log al reagendar un post

**Problema (descubierto 18 abr 2026)**: `publishScheduledPosts()` tiene esta guarda en
la Query 2 (Instagram per-platform):

```sql
NOT EXISTS (
  SELECT 1 FROM publish_log
  WHERE post_id = posts.id AND platform = 'instagram' AND status = 'failed'
)
```

Diseñada para evitar bucles infinitos. Pero si un post falló con token expirado
(antes de reconectar OAuth), ese registro `failed` queda en `publish_log` y el
scheduler NUNCA lo vuelve a intentar automáticamente, incluso después de reconectar.
El "Reintentar" manual sí funciona porque llama `publishPost()` directamente,
sin pasar por la query del scheduler.

**Fix (18 abr 2026)** — `PUT /:id` en `routes/social/posts.ts`:

```typescript
// ✅ OBLIGATORIO — Al final del PUT /:id handler, DESPUÉS del update:
const isRescheduling =
  body.scheduledAt !== undefined ||
  body.scheduledAtInstagram !== undefined ||
  body.scheduledAtTiktok !== undefined ||
  body.status === "scheduled";

if (isRescheduling) {
  // Limpiar registros fallidos para que el scheduler pueda encontrar el post
  await db.delete(publishLogTable).where(
    and(
      eq(publishLogTable.postId, post.id),
      eq(publishLogTable.status, "failed"),
    )
  );
}
```

**¿Cuándo se activa?**: Cada vez que el usuario edita la hora del post o lo
aprueba (status → "scheduled"). La lógica de "no reintentar infinito" sigue
intacta porque solo limpia al reagendar explícitamente, no en cada ciclo.

**Anti-patrón a evitar**:
```typescript
// ❌ NO borrar publish_log en el scheduler — pierde el mecanismo anti-loop
// ❌ NO borrar publish_log incondicionalmente — solo cuando hay un reschedule explícito
// ✅ Solo borrar en el PUT /:id cuando se cambia scheduledAt o status
```

---

## Patrón V-WARN: banner de advertencia en la cola de aprobación

**Archivo**: `artifacts/social-dashboard/src/pages/approval.tsx`

```tsx
// ✅ CORRECTO — El banner se muestra cuando:
// 1. El contexto global haya cargado (globalBizLoaded)
// 2. Hay un negocio activo (globalBizId != null)
// 3. Ese negocio NO tiene ninguna cuenta en el array socialAccounts

// socialAccounts: Array<{ id; platform; username; businessId }>
// globalBizId: del useActiveBusiness() del ActiveBusinessContext

{globalBizLoaded && globalBizId != null && !socialAccounts.some(a => a.businessId === globalBizId) && (
  <div className="...banner-amarillo...">
    <AlertTriangle ... />
    <p>{activeBusinessName} no tiene cuentas de redes sociales conectadas.</p>
    <p>Los posts que apruebes no se publicarán automáticamente.</p>
    <a href="/settings">Configuración → Cuentas Sociales</a>
  </div>
)}
```

---

## Patrón centralizado VM-4a: hook `useBusinessPosts`

---

## Patrón seguro VM-4b: OAuth redirect con businessId explícito

**Frontend** (`settings.tsx`):
```typescript
// ✅ CORRECTO — usar globalBusinessId del contexto global (ActiveBusinessContext)
// NUNCA usar activeBusinessId (estado local de la sección de Elementos) porque
// ese estado puede diferir del negocio seleccionado en el top nav.
const { id: globalBusinessId } = useActiveBusiness(); // del ActiveBusinessContext

const handleConnectMeta = () => {
  const biz = globalBusinessId ? `?businessId=${globalBusinessId}` : "";
  window.location.href = `${BASE}/api/auth/meta/redirect${biz}`;
};

// ❌ PROHIBIDO — redirect sin businessId
window.location.href = `${BASE}/api/auth/meta/redirect`;
// getActiveBusinessId en el backend siempre retorna el isDefault (ECO), no el activo

// ❌ TAMBIÉN PROHIBIDO — usar activeBusinessId (estado local de la sección Elementos)
// activeBusinessId solo se inicializa desde globalBusinessId en el mount,
// pero el dropdown de Elementos puede cambiarlo independientemente.
const biz = activeBusinessId ? `?businessId=${activeBusinessId}` : ""; // ← INSEGURO
```

**Backend** (`oauth.ts`):
```typescript
// ✅ CORRECTO — query param primero, fallback a DB default
const bizFromQuery = req.query.businessId ? Number(req.query.businessId) : null;
if (bizFromQuery != null) {
  const [owned] = await db.select({ id: businessesTable.id }).from(businessesTable)
    .where(and(eq(businessesTable.id, bizFromQuery), eq(businessesTable.userId, userId))).limit(1);
  if (!owned) { res.status(403).json({ error: "businessId no pertenece al usuario" }); return; }
}
const businessId = bizFromQuery ?? await getActiveBusinessId(userId);

// ❌ PROHIBIDO — usar solo getActiveBusinessId en redirect handler
const businessId = await getActiveBusinessId(userId); // siempre retorna isDefault (puede ser incorrecto)
```

---

## Anti-patrones prohibidos

### 1. Publicar sin `businessId`
```typescript
// ❌ PROHIBIDO — publishPost no pasa businessId a publishToInstagram
await publishToInstagram(imageData, caption, hashtags, ..., post.userId);

// ✅ OBLIGATORIO — siempre pasar post.businessId
await publishToInstagram(imageData, caption, hashtags, ..., post.userId, post.businessId);
```

### 2. Lookup de cuenta solo por `userId` en contexto de publicación
```typescript
// ❌ PROHIBIDO — en contexto de publicación, siempre necesitas businessId
const account = await getInstagramAccount(post.userId);  // puede devolver cuenta equivocada

// ✅ OBLIGATORIO
const account = await getInstagramAccount(post.userId, post.businessId);
```

### 3. Parche por negocio en lugar de fix centralizado
```typescript
// ❌ PROHIBIDO — parche específico por negocio
if (post.businessId === 2) {
  account = await getInstagramAccount(post.userId, 2);
} else {
  account = await getInstagramAccount(post.userId);
}

// ✅ CORRECTO — la función centralizada maneja ambos casos
account = await getInstagramAccount(post.userId, post.businessId);
// getInstagramAccount ya aplica el AND filter cuando businessId está presente
```

---

## Queries SQL de auditoría — publicación

Ejecutar antes de modificar el scheduler, la cadena de publicación, o la tabla `social_accounts`:

```sql
-- 1. ¿Hay posts publicados que no coinciden con ninguna cuenta social de su negocio?
-- (detecta si un post fue publicado con la cuenta equivocada)
SELECT p.id, p.business_id, p.user_id, p.platform, p.status,
       sa.id AS sa_id, sa.business_id AS sa_biz_id, sa.platform AS sa_platform
FROM posts p
LEFT JOIN social_accounts sa ON sa.user_id = p.user_id
  AND sa.platform = 'instagram'
  AND sa.business_id = p.business_id
WHERE p.status = 'published'
  AND p.platform IN ('instagram', 'both')
  AND sa.id IS NULL  -- no hay cuenta IG para este negocio
ORDER BY p.published_at DESC
LIMIT 20;
-- Si hay filas: el post se publicó sin cuenta IG propia para ese negocio.
-- (posible contaminación o publicación en cuenta equivocada)

-- 2. ¿Cuántas cuentas IG tiene cada negocio?
SELECT b.id AS biz_id, b.name, COUNT(sa.id) AS ig_accounts
FROM businesses b
LEFT JOIN social_accounts sa ON sa.business_id = b.id AND sa.platform = 'instagram'
GROUP BY b.id, b.name
ORDER BY b.id;
-- Esperado: max 1 cuenta IG por negocio (multi-cuenta = configuración anómala)

-- 3. ¿Hay publish_logs de posts de un negocio pero la cuenta es de otro negocio?
-- (requiere que publish_logs tenga business_id — si no existe, usar join con posts)
SELECT pl.id, pl.post_id, p.business_id AS post_biz, p.user_id,
       sa.business_id AS account_biz, sa.platform
FROM publish_logs pl
JOIN posts p ON p.id = pl.post_id
JOIN social_accounts sa ON sa.user_id = p.user_id AND sa.platform = 'instagram'
WHERE p.business_id != sa.business_id
LIMIT 20;
-- Si hay filas: contaminación confirmada de publicación cross-business

-- 4. Snapshot de audiencias por clave (¿cuántas claves de snapshot hay?)
SELECT key, LENGTH(value) AS size_bytes, updated_at
FROM app_settings
WHERE key LIKE 'audience_snapshot%'
ORDER BY key;
-- Esperado post-Task #125: 'audience_snapshot_biz_1', 'audience_snapshot_biz_2', etc.
-- (o 'audience_snapshot' si solo hay un negocio legacy)

-- 5. ¿Hay posts publicados sin businessId?
SELECT id, user_id, business_id, platform, status, published_at
FROM posts
WHERE status = 'published'
  AND business_id IS NULL
ORDER BY published_at DESC
LIMIT 20;
-- Si hay filas: posts que se publicaron antes del backfill de businessId (Task #125)
-- Verificar que no hay nuevos posts sin businessId desde Task #125

-- 6. VM-3: ¿Hay page_id duplicados entre negocios del mismo usuario? (Task #127)
SELECT user_id, page_id, platform,
       COUNT(DISTINCT business_id) AS biz_count,
       array_agg(business_id ORDER BY business_id) AS business_ids,
       array_agg(id ORDER BY id) AS sa_ids
FROM social_accounts
WHERE page_id IS NOT NULL
GROUP BY user_id, page_id, platform
HAVING COUNT(DISTINCT business_id) > 1;
-- Esperado: 0 filas (cada page_id debe estar vinculado a un solo negocio por usuario)
-- Si hay filas: hay riesgo de que posts de un negocio se publiquen en la cuenta de otro

-- 7. VM-4b: ¿Cuántas cuentas por negocio y usuario? (verificación post-conexión OAuth)
-- Correr DESPUÉS de conectar Instagram con un negocio específico activo.
-- El último registro actualizado (updated_at DESC) debe tener el businessId del negocio activo.
SELECT
  sa.id,
  sa.user_id,
  sa.business_id,
  b.name AS negocio,
  b.is_default,
  sa.platform,
  sa.username,
  sa.page_id,
  sa.connected,
  sa.updated_at
FROM social_accounts sa
LEFT JOIN businesses b ON b.id = sa.business_id
WHERE sa.platform IN ('instagram', 'tiktok')
ORDER BY sa.updated_at DESC
LIMIT 10;
-- ✅ PASS: El registro más reciente tiene business_id = el negocio activo al conectar
-- ❌ FAIL: business_id = isDefault (biz=1) aunque el negocio activo fuera biz=2
--          (indica que el bug VM-4b no está corregido)

-- 8. VM-4b: ¿Hay pending_oauth_sessions con business_id correcto? (durante el flujo)
-- Correr mientras hay un flujo OAuth en curso para verificar que business_id se grabó bien.
SELECT
  session_id,
  user_id,
  business_id,
  expires_at,
  NOW() < expires_at AS vigente
FROM pending_oauth_sessions
ORDER BY expires_at DESC
LIMIT 5;
-- ✅ PASS: business_id = el negocio activo al iniciar el OAuth (no siempre el default)
-- Script completo de prueba: .local/tests/test-318-oauth-business-isolation.sh
```

---

## Criterios de aceptación

- [ ] `getInstagramAccount(userId=null, businessId=X)` retorna `null` (fail-closed: sin userId no hay ownership verificable)
- [ ] `getInstagramAccount(userId=1, businessId=2)` retorna la cuenta de businessId=2 (no la de businessId=1 del mismo usuario)
- [ ] `getTikTokAccount(userId=null, businessId=X)` retorna `null` (mismo patrón fail-closed)
- [ ] `publishPost(postId)` propaga `post.businessId` a todos los publishers downstream
- [ ] **V-SCHEDULER**: Si el post tiene `businessId=X` y no hay ninguna fila en `social_accounts` con `business_id=X`, `publishPost` marca el post como `failed` inmediatamente sin llamar a ningún publisher
- [ ] **V-SCHEDULER**: El publish_log de un post abortado por V-SCHEDULER tiene `status='failed'` y `error_message` que menciona "no tiene cuentas de redes sociales conectadas"
- [ ] **V-WARN**: Al abrir la cola de aprobación con HazPost activo (biz=2, sin cuentas sociales), se muestra el banner amarillo de advertencia
- [ ] **V-WARN**: Con ECO activo (biz=1, que SÍ tiene cuentas sociales), el banner NO se muestra
- [ ] **V-QUERY**: `useBusinessPosts` con context `loaded=false` no hace ninguna request al backend (React Query disabled)
- [ ] **V-QUERY**: En cuanto `loaded` cambia a `true`, el hook hace su primera request con `businessId` correcto
- [ ] **V-CAL**: Al abrir el calendario por primera vez (sin localStorage), el scope se inicializa al ID del negocio activo (no "todos")
- [ ] Posts de HazPost (biz=2) no aparecen en el publish log de ECO (biz=1) en la misma sesión
- [ ] `syncPublishedPostMetrics()` itera todas las cuentas IG y scopea posts por `businessId` de cada cuenta
- [ ] `refreshInstagramAudience()` guarda snapshots en claves distintas por negocio (`audience_snapshot_biz_N`)
- [ ] Analytics de audiencia muestra datos del negocio activo del admin, no del primer negocio en DB
- [ ] No hay ningún `getInstagramAccount(userId)` (sin `businessId`) en la cadena de publicación
- [ ] No hay ningún `getTikTokAccount(userId)` (sin `businessId`) en la cadena de publicación
- [ ] **VM-3**: La query de auditoría #6 retorna 0 filas — no hay `page_id` duplicados entre negocios del mismo usuario
- [ ] **VM-3**: Endpoint de social accounts retorna 409 si se intenta registrar un `page_id` ya vinculado a otro negocio del mismo usuario
- [ ] **VM-4b**: `handleConnectMeta` y `handleConnectTikTok` en `settings.tsx` usan `globalBusinessId` (del `ActiveBusinessContext`) — NUNCA `activeBusinessId` (estado local de la sección Elementos)
- [ ] **VM-4b**: `/api/auth/meta/redirect?businessId=X` retorna 403 si `X` no pertenece al usuario autenticado
- [ ] **VM-4b**: Tras el flujo OAuth completo con negocio biz=2 activo, `social_accounts.business_id = 2` (verificar con query #7)
- [ ] **VM-4b**: `pending_oauth_sessions.business_id` durante el flujo coincide con el negocio activo al iniciar (query #8)
- [ ] **VM-4b**: Script de prueba documentado: `.local/tests/test-318-oauth-business-isolation.sh`

---

## Archivos clave

| Archivo | Función crítica |
|---------|----------------|
| `artifacts/api-server/src/services/instagram.service.ts` | `getInstagramAccount()`, `publishToInstagram()`, `publishReelToInstagram()` |
| `artifacts/api-server/src/services/facebook.service.ts` | `getFacebookPageCredentials()`, `publishToFacebook()` |
| `artifacts/api-server/src/services/tiktok.service.ts` | `getTikTokAccount()`, `publishToTikTok()` |
| `artifacts/api-server/src/services/scheduler.service.ts` | `publishPost()`, `syncPublishedPostMetrics()`, `refreshInstagramAudience()`, `refreshInstagramAudienceForAccount()` |
| `lib/db/src/schema/social_accounts.ts` | Tabla `social_accounts` con columnas `userId`, `businessId`, `platform` |
| `artifacts/api-server/src/routes/social/analytics.ts` | `getAudienceSnapshot(userId)` — lectura scoped por negocio |
