---
name: test-business-cleanup
description: Diagnóstico y limpieza de negocios de prueba duplicados en HazPost. Úsalo cuando un usuario reporta que sus posts no generan imágenes, la generación automática es muy lenta, o sospechás que tiene muchos negocios de prueba activos. Contiene queries SQL de diagnóstico, los endpoints admin para desactivar en masa, y explicación del impacto en el sistema.
---

# Skill: Limpieza de negocios de prueba (test business cleanup)

## Problema raíz

Cuando un usuario crea muchos negocios de prueba (ej. 15-20 "Club Ventas" de ensayo), el scheduler de auto-generación itera sobre **todos los negocios activos del sistema** (tabla `businesses` WHERE `is_active = true`). Resultado:

- N negocios activos → N llamadas paralelas a `generateImagesForPostsBg`
- Cada llamada tiene concurrencia interna de 4 workers
- **N × 4 = N×4 llamadas simultáneas a OpenAI DALL-E**
- Con N=15: 60 llamadas paralelas → rate limit 429 → imágenes que nunca terminan

Esto afecta a **todos** los usuarios del sistema mientras dura la ráfaga, no solo al usuario con muchos negocios.

## Fixes estructurales (todos ya implementados, abril 2026)

### Fix 1 — Scheduler procesa negocios secuencialmente (18 abr 2026, primera iteración)

`scheduler.service.ts` → `checkAndAutoGenerate()`:
- Antes: `void generateImagesForPostsBg(stampedJobs)` dentro del loop → N ejecuciones paralelas
- Ahora: Acumula jobs en `pendingImageQueues[]`, los procesa secuencialmente después del loop → máximo 4 llamadas paralelas a OpenAI en cualquier momento

Si ves el bug regresionar, buscar en `scheduler.service.ts` la variable `pendingImageQueues`.

### Fix 2 — Delete de usuario cascadea deactivación de negocios (18 abr 2026)

**Causa raíz nueva**: Al borrar usuarios de prueba (admin delete = soft-delete), sus negocios
**NO se desactivaban** → `is_active = true` + `auto_generation_enabled = true` seguían activos.
El scheduler y la cola de imagen los procesaban como si fueran negocios reales.

**Fix en `user.ts`** (DELETE `/api/user/admin/users/:id`):
```typescript
// CORRECTO — cascadea deactivación de negocios al eliminar usuario
await db.update(usersTable)
  .set({ deletedAt: new Date(), isActive: "false", updatedAt: new Date() })
  .where(eq(usersTable.id, targetId));
// NUEVO: desactivar todos sus negocios
await db.update(businessesTable)
  .set({ isActive: false, autoGenerationEnabled: false })
  .where(eq(businessesTable.userId, targetId));
```

```typescript
// ANTI-PATRÓN PROHIBIDO — solo marca el usuario, negocios quedan activos
await db.update(usersTable).set({ deletedAt: new Date() }).where(...);
// ← falta deactivar businessesTable
```

### Fix 3 — Scheduler excluye negocios de usuarios eliminados (18 abr 2026)

**Guard adicional en `scheduler.service.ts`** → `checkAndAutoGenerate()`:
```typescript
// CORRECTO: JOIN con users para excluir negocios de usuarios soft-deleted
const activeBusinesses = await db
  .select({ id, userId, name, autoGenerationEnabled, generationFrequency })
  .from(businessesTable)
  .innerJoin(usersTable, eq(usersTable.id, businessesTable.userId))
  .where(and(
    eq(businessesTable.isActive, true),
    isNull(usersTable.deletedAt),   // ← excluye usuarios eliminados
  ));
```

### Fix 4 — Startup migration limpia negocios huérfanos (18 abr 2026)

En `index.ts` → `runStartupMigrations()`, al final:
```sql
UPDATE businesses b
SET is_active = FALSE, auto_generation_enabled = FALSE
FROM users u
WHERE b.user_id = u.id
  AND u.deleted_at IS NOT NULL
  AND (b.is_active = TRUE OR b.auto_generation_enabled = TRUE)
```
Esto desactiva retroactivamente todos los negocios huérfanos de usuarios eliminados en producción.
Al primer deploy después de eliminar usuarios, esta migración los limpia automáticamente.

## Diagnóstico

### 1. Identificar usuarios con demasiados negocios

```sql
SELECT 
  u.id as user_id, u.email,
  COUNT(b.id) as total_businesses,
  array_agg(b.name ORDER BY b.created_at) as business_names,
  array_agg(b.id ORDER BY b.created_at) as business_ids,
  array_agg(b.is_active ORDER BY b.created_at) as active_flags
FROM users u
JOIN businesses b ON b.user_id = u.id
GROUP BY u.id, u.email
HAVING COUNT(b.id) > 3
ORDER BY COUNT(b.id) DESC;
```

### 2. Ver negocios de un usuario específico con actividad

```sql
SELECT 
  b.id, b.name, b.industry, b.is_active, b.auto_generation_enabled,
  b.created_at::date as created,
  (SELECT COUNT(*)::int FROM posts WHERE business_id = b.id) as post_count,
  (SELECT MAX(created_at)::date FROM posts WHERE business_id = b.id) as last_post
FROM businesses b
WHERE b.user_id = <USER_ID>
ORDER BY b.created_at;
```

### 3. Ver cuántos jobs de imagen hay en vuelo (posts sin imagen)

```sql
SELECT b.name, COUNT(iv.id) as posts_sin_imagen
FROM posts p
JOIN businesses b ON b.id = p.business_id
LEFT JOIN image_variants iv ON iv.post_id = p.id
WHERE p.user_id = <USER_ID>
  AND iv.id IS NULL
  AND p.created_at > NOW() - INTERVAL '24 hours'
GROUP BY b.name
ORDER BY posts_sin_imagen DESC;
```

## Endpoints admin (ya implementados)

### Listar negocios de un usuario con conteos

```
GET /api/admin/users/:userId/businesses
Authorization: admin cookie

Response:
{
  "businesses": [
    { "id": 42, "name": "Club Ventas", "industry": null, "isActive": true,
      "autoGenerationEnabled": true, "createdAt": "...", "postCount": 3,
      "lastPostAt": "...", "hasLogo": false }
  ],
  "total": 18
}
```

### Desactivar negocios de prueba en masa

```
POST /api/admin/users/:userId/businesses/deactivate-bulk
Authorization: admin cookie
Content-Type: application/json

Body: { "businessIds": [43, 44, 45, 46, ...] }  ← IDs a desactivar

Response: { "ok": true, "deactivated": 17, "remaining": 1 }
```

**Reglas de seguridad del endpoint:**
- Todos los IDs deben pertenecer al usuario (`userId`) — si alguno no pertenece → 403
- Debe quedar al menos 1 negocio activo — si deactivás todos → 400
- Desactiva `is_active = false` Y `auto_generation_enabled = false`

## Flujo recomendado para limpiar a un usuario

1. **Obtener userId** del usuario afectado desde el admin panel
2. **Listar sus negocios**: `GET /api/admin/users/:userId/businesses`
3. **Identificar cuál es el "real"**: el que tiene más posts, o el más reciente con datos correctos (industry, logo)
4. **Desactivar los de prueba**: `POST /api/admin/users/:userId/businesses/deactivate-bulk` con todos los IDs excepto el real
5. **Verificar**: volver a listar y confirmar que solo queda 1 activo
6. **Para el negocio real**: si le falta industry o logo, orientar al usuario a configurarlo en Settings

## Cómo encontrar el userId en la DB

```sql
SELECT id, email FROM users WHERE email ILIKE '%clubventas%' OR email ILIKE '%<nombre>%';
```

O buscarlo en la lista de usuarios del admin panel (sección Users).

## Archivos clave

- `artifacts/api-server/src/services/scheduler.service.ts` → `checkAndAutoGenerate()` → variable `pendingImageQueues` (fix secuencial)
- `artifacts/api-server/src/routes/admin/user-stats.ts` → `GET /:id/businesses` y `POST /:id/businesses/deactivate-bulk`
- `artifacts/api-server/src/services/ai.service.ts` → `generateImagesForPostsBg()` → `const CONCURRENCY = 4` (concurrencia interna por lote)

## Prevención futura

- En onboarding: considerar mostrar un aviso si el usuario tiene más de 3 negocios inactivos
- En el scheduler: `pendingImageQueues` garantiza que N negocios nunca supere CONCURRENCY=4 llamadas OpenAI paralelas
- Si un usuario reporta imágenes lentas o timeouts: **siempre verificar primero cuántos negocios activos tiene**
