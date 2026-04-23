---
name: posts-monitor
description: Post integrity monitoring for HazPost. Use when verifying that post numbering per business is correct, when debugging missing business_id or post_number values, when checking for duplicate counters, or when diagnosing inconsistent post states (published without published_at, etc.). Also use when a user reports posts disappearing, to audit deletions via audit_logs, and to verify no automatic deletion process is active. Contains ready-to-run SQL queries.
---

# Monitoreo de Posts — HazPost

> **Nota de uso**: Las queries que incluyen IDs concretos (bizId=1, bizId=2, userId=1, etc.)
> son ejemplos basados en el entorno de producción actual. Reemplaza esos valores por los IDs
> reales del negocio o usuario que estés auditando antes de ejecutar.

---

## REGLA DE PERSISTENCIA (CRÍTICA)

**Los posts son PERMANENTES hasta que el usuario los elimine explícitamente.**

- No hay TTL ni expiración automática en la tabla `posts`.
- No hay cron job que elimine posts.
- No hay límite de almacenamiento que borre posts antiguos.
- El ÚNICO código autorizado para borrar posts es la ruta `DELETE /api/posts/:id` (acción del usuario).
- El bloque de startup que borraba posts de `business_id = 2` al reiniciar el servidor fue **eliminado en Task #70** (commit `d0505c0`). Si reaparece en `index.ts`, es un bug crítico.

---

## 0. DETECCIÓN DE BORRADO AUTOMÁTICO (PRIMER CHECK)

Cuando un usuario reporta que sus posts desaparecen, ejecutar en este orden:

### ¿Existe algún proceso automático activo que borre posts?

```sql
-- Verificar que NO hay triggers de borrado automático en la tabla posts
SELECT trigger_name, event_manipulation, event_object_table, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'posts'
  AND event_manipulation = 'DELETE';
-- Solo debe aparecer el trigger enforce_post_tenant_integrity (BEFORE INSERT/UPDATE — no DELETE)
-- Si aparece cualquier trigger DELETE, es un bug grave
```

```sql
-- Ver últimas eliminaciones de posts registradas en audit_logs
SELECT
  al.id,
  al.user_id,
  u.email,
  al.business_id,
  al.entity_id as post_id,
  al.metadata,
  al.ip_address,
  al.created_at
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.action = 'POST_DELETED'
ORDER BY al.created_at DESC
LIMIT 20;
-- user_id NULL = eliminación automática (BUG — nunca debería ocurrir)
-- user_id con valor = eliminación manual del usuario (esperado)
```

```sql
-- Comparar posts creados vs posts eliminados en los últimos 7 días por negocio
SELECT
  b.name as negocio,
  b.id as biz_id,
  COUNT(p.id) as posts_actuales,
  (SELECT COUNT(*) FROM audit_logs al
   WHERE al.action = 'POST_DELETED'
     AND al.business_id = b.id
     AND al.created_at > NOW() - INTERVAL '7 days') as eliminados_7d
FROM businesses b
LEFT JOIN posts p ON p.business_id = b.id
GROUP BY b.id, b.name
ORDER BY eliminados_7d DESC;
```

---

## 1. VERIFICACIÓN DE INTEGRIDAD GENERAL

```sql
-- Resumen de integridad de todos los posts
SELECT
  COUNT(*) as total_posts,
  COUNT(*) FILTER (WHERE user_id IS NULL) as sin_user_id,
  COUNT(*) FILTER (WHERE business_id IS NULL) as sin_business_id,
  COUNT(*) FILTER (WHERE post_number IS NULL AND business_id IS NOT NULL) as sin_post_number_pero_con_biz,
  COUNT(*) FILTER (WHERE status = 'published' AND published_at IS NULL) as published_sin_fecha,
  COUNT(*) FILTER (WHERE status IN ('scheduled', 'approved') AND scheduled_at IS NULL) as scheduled_sin_fecha
FROM posts;
-- Todos deben ser 0 excepto total_posts
-- sin_business_id puede ser > 0 para posts legacy (antes del sistema multi-tenant)
```

---

## 2. DISTRIBUCIÓN DE POSTS POR ESTADO Y NEGOCIO

```sql
SELECT
  b.name as negocio,
  b.id as biz_id,
  u.email as owner,
  COUNT(p.id) as total,
  COUNT(p.id) FILTER (WHERE p.status = 'published') as publicados,
  COUNT(p.id) FILTER (WHERE p.status IN ('scheduled', 'approved')) as programados,
  COUNT(p.id) FILTER (WHERE p.status = 'pending_approval') as en_cola_aprobacion,
  COUNT(p.id) FILTER (WHERE p.status = 'rejected') as rechazados,
  COUNT(p.id) FILTER (WHERE p.status = 'failed') as fallidos,
  MAX(p.post_number) as ultimo_numero_secuencia
FROM businesses b
JOIN users u ON u.id = b.user_id
LEFT JOIN posts p ON p.business_id = b.id
GROUP BY b.id, b.name, u.email
ORDER BY b.id;
```

---

## 3. CONTADORES POST_NUMBER POR NEGOCIO

### Estado actual de contadores
```sql
SELECT
  b.name as negocio,
  p.business_id,
  COUNT(*) as total_posts,
  MIN(p.post_number) as primer_numero,
  MAX(p.post_number) as ultimo_numero,
  COUNT(*) FILTER (WHERE p.post_number IS NULL) as sin_numero
FROM posts p
JOIN businesses b ON b.id = p.business_id
WHERE p.business_id IS NOT NULL
GROUP BY p.business_id, b.name
ORDER BY p.business_id;
```

### Posts sin post_number (deberían ser 0 para posts con business_id)
```sql
SELECT p.id, p.business_id, p.status, p.created_at
FROM posts p
WHERE p.business_id IS NOT NULL
  AND p.post_number IS NULL
ORDER BY p.id DESC
LIMIT 20;
-- Resultado esperado: 0 filas (después de la migración de backfill)
-- Si hay filas: el insert o el UPDATE de backfill no se ejecutó
```

### Duplicados de post_number (NUNCA debe haber dos posts con el mismo número en el mismo negocio)
```sql
SELECT
  business_id,
  post_number,
  COUNT(*) as cnt,
  STRING_AGG(CAST(id AS TEXT), ', ') as post_ids
FROM posts
WHERE post_number IS NOT NULL
GROUP BY business_id, post_number
HAVING COUNT(*) > 1
ORDER BY cnt DESC;
-- Resultado esperado: 0 filas
```

---

## 4. ESTADOS INCONSISTENTES

### Published sin published_at
```sql
SELECT id, user_id, business_id, status, published_at, updated_at
FROM posts
WHERE status = 'published' AND published_at IS NULL
ORDER BY id DESC;
-- Fix: UPDATE posts SET published_at = updated_at WHERE status = 'published' AND published_at IS NULL;
```

### Scheduled sin scheduled_at
```sql
SELECT id, user_id, business_id, status, scheduled_at, created_at
FROM posts
WHERE status IN ('scheduled', 'approved')
  AND scheduled_at IS NULL
ORDER BY id DESC;
```

### Posts en estado limbo (failed hace más de 7 días, sin retry)
```sql
SELECT id, user_id, business_id, status, updated_at
FROM posts
WHERE status = 'failed'
  AND updated_at < NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;
```

### Posts pending_approval sin image variants (generación de imagen falló)
```sql
SELECT
  p.id,
  p.business_id,
  p.status,
  p.created_at,
  COUNT(iv.id) as variant_count
FROM posts p
LEFT JOIN image_variants iv ON iv.post_id = p.id
WHERE p.status = 'pending_approval'
GROUP BY p.id, p.business_id, p.status, p.created_at
HAVING COUNT(iv.id) = 0
ORDER BY p.id DESC;
-- Si hay filas: usar POST /api/posts/retry-missing-images para regenerar
```

---

## 5. POSTS SIN BUSINESS_ID

```sql
SELECT
  p.id,
  p.user_id,
  p.status,
  p.created_at,
  u.email
FROM posts p
JOIN users u ON u.id = p.user_id
WHERE p.business_id IS NULL
ORDER BY p.id DESC
LIMIT 20;
```

Para corregirlos (asignar el negocio por defecto del usuario):
```sql
-- PREVIEW — qué se va a asignar (no ejecutar sin revisar)
SELECT p.id, p.user_id, b.id as default_biz_id, b.name
FROM posts p
JOIN businesses b ON b.user_id = p.user_id AND b.is_default = true
WHERE p.business_id IS NULL;

-- EJECUTAR solo si el PREVIEW es correcto
UPDATE posts p
SET business_id = b.id
FROM businesses b
WHERE b.user_id = p.user_id
  AND b.is_default = true
  AND p.business_id IS NULL;
```

---

## 6. AUDIT LOG DE ELIMINACIONES MANUALES

```sql
-- Historial completo de posts eliminados manualmente (por el usuario)
SELECT
  al.id as log_id,
  al.created_at as eliminado_en,
  al.user_id,
  u.email as usuario,
  al.entity_id as post_id,
  al.business_id as biz_id,
  al.metadata->>'platform' as plataforma,
  al.metadata->>'contentType' as tipo,
  al.metadata->>'status' as estado_al_borrar,
  al.ip_address
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.action = 'POST_DELETED'
ORDER BY al.created_at DESC
LIMIT 50;
```

```sql
-- Cuántos posts eliminó cada usuario esta semana
SELECT
  u.email,
  COUNT(*) as posts_eliminados
FROM audit_logs al
JOIN users u ON u.id = al.user_id
WHERE al.action = 'POST_DELETED'
  AND al.created_at > NOW() - INTERVAL '7 days'
GROUP BY u.email
ORDER BY posts_eliminados DESC;
```

---

## 7. VERIFICACIÓN DE QUE NO HAY BORRADO AUTOMÁTICO EN CÓDIGO

Al inspeccionar el código del servidor, verificar que `src/index.ts` NO contiene:

```
DELETE FROM posts WHERE business_id
```

Si existe ese patrón en el código de startup, es el bug de Task #70 que reapreció y debe eliminarse inmediatamente.

```bash
grep -n "DELETE FROM posts" artifacts/api-server/src/index.ts
# Resultado esperado: ninguna línea
```

---

## 8. CHECKLIST DE MONITOREO SEMANAL

Ejecutar estas queries para detectar problemas antes de que los reporte el usuario:

```sql
-- 1. Posts eliminados automáticamente (user_id NULL en audit_logs) — debe ser siempre 0
SELECT COUNT(*) FROM audit_logs
WHERE action = 'POST_DELETED'
  AND user_id IS NULL
  AND created_at > NOW() - INTERVAL '7 days';

-- 2. Posts sin business_id (debería ser 0 en negocios nuevos)
SELECT COUNT(*) FROM posts WHERE business_id IS NULL AND created_at > NOW() - INTERVAL '7 days';

-- 3. Post_number duplicados
SELECT COUNT(*) FROM (
  SELECT business_id, post_number, COUNT(*) c FROM posts
  WHERE post_number IS NOT NULL GROUP BY business_id, post_number HAVING COUNT(*) > 1
) x;

-- 4. Posts published sin fecha
SELECT COUNT(*) FROM posts WHERE status = 'published' AND published_at IS NULL;

-- 5. Posts sin imagen en cola de aprobación (generación fallida)
SELECT COUNT(*) FROM (
  SELECT p.id FROM posts p
  LEFT JOIN image_variants iv ON iv.post_id = p.id
  WHERE p.status = 'pending_approval'
  GROUP BY p.id HAVING COUNT(iv.id) = 0
) x;
```

Todos deben devolver 0. Si alguno > 0, investigar.

---

## 9. ESTRUCTURA DE TABLA (REFERENCIA)

| Campo | Tipo | Debe ser |
|-------|------|----------|
| `id` | serial (PK) | Auto-incremental global — NUNCA modificar |
| `user_id` | integer | NUNCA null en posts > 2025 |
| `business_id` | integer | NUNCA null para usuarios con negocios |
| `post_number` | integer | Secuencia 1,2,3... por business_id (nullable para posts legacy) |
| `status` | text | Solo valores válidos del enum |
| `published_at` | timestamp | Requerido si status='published' |
| `scheduled_at` | timestamp | Requerido si status IN ('scheduled','approved') |
