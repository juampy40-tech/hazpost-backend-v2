---
name: user-recovery
description: Recuperar un usuario eliminado accidentalmente en HazPost. Úsalo cuando un administrador reporte que borró un usuario por error y necesite recuperar su cuenta, datos o archivos. Cubre diagnóstico previo (audit_logs, Object Storage, tablas huérfanas), recuperación parcial sin backup, recuperación completa con backup de DB, limpieza de huérfanos y recomendaciones preventivas.
---

# Skill: Recuperación de usuario eliminado accidentalmente

Usa este skill cuando un usuario haya sido eliminado del sistema (hard-delete desde el admin panel o el endpoint DELETE) y necesites recuperar su cuenta total o parcialmente.

---

## 1. Diagnóstico previo — qué se puede recuperar

### audit_logs (append-only, NUNCA se borra)
Busca por `user_id` aunque la fila del usuario ya no exista:
```sql
SELECT * FROM audit_logs WHERE user_id = <ID> ORDER BY created_at DESC;
```
Esto muestra el historial de acciones: creación de negocios, posts generados, cambios de plan, etc.

### Object Storage (archivos del bucket)
El endpoint `DELETE /api/user/admin/users/:id` **NO borra archivos del bucket**. Logos, imágenes generadas y fuentes siguen accesibles si se conoce el `user_id` original. Las rutas típicas son:
- `/users/{userId}/logos/...`
- `/users/{userId}/posts/...`
- `/users/{userId}/fonts/...`

### Tablas que quedan huérfanas (no borradas por el endpoint)
Estas tablas pueden conservar datos del usuario eliminado:
- `affiliate_codes` (referencia `user_id → users`)
- `conversations` (referencia `user_id → users`)
- `messages` (referencia `user_id → users`)
- `credit_purchases` (referencia `user_id → users`)
- `content_learnings` (referencia `business_id → businesses`)
- `pending_credit_deductions` (referencia `user_id → users`)

---

## 2. Lo que se pierde sin backup de DB

Si no hay backup disponible, estas tablas se pierden con el borrado:
- `users`, `businesses`, `brand_profiles`, `niches`
- `posts`, `image_variants`, `publish_log`
- `social_accounts`, `media_library`, `landing_pages`
- `content_history`, `publishing_schedules`, `subscriptions`
- `password_reset_tokens`, `trusted_devices`

---

## 3. Recuperación parcial (sin backup de DB)

### Paso 1 — Re-crear el usuario
Desde el admin panel (Admin → Usuarios → Crear usuario) o via endpoint:
```
POST /api/user/admin/users
{ "email": "...", "password": "...", "displayName": "...", "plan": "...", "role": "user" }
```
Anota el nuevo `user_id` asignado.

### Paso 2 — Consultar audit_logs para reconstruir datos
```sql
-- Ver negocios que tenía
SELECT metadata FROM audit_logs
WHERE user_id = <ID_ORIGINAL> AND entity_type = 'business'
ORDER BY created_at ASC;

-- Ver historial de plan
SELECT metadata FROM audit_logs
WHERE user_id = <ID_ORIGINAL> AND entity_type = 'subscription'
ORDER BY created_at ASC;
```

### Paso 3 — Re-crear el negocio manualmente
```sql
INSERT INTO businesses (user_id, name, industry, description, created_at)
VALUES (<NUEVO_ID>, '<nombre>', '<industria>', '<descripcion>', NOW());
```

### Paso 4 — Re-vincular archivos del Object Storage
Si conoces el `user_id` original, los archivos siguen en el bucket. Actualiza las URLs en el nuevo registro:
```sql
UPDATE businesses SET logo_url = '/users/<ID_ORIGINAL>/logos/<archivo>'
WHERE user_id = <NUEVO_ID>;
```

### Paso 5 — Restaurar suscripción
```sql
INSERT INTO subscriptions (user_id, plan, status, period_end, created_at)
VALUES (<NUEVO_ID>, '<plan>', 'active', NOW() + INTERVAL '30 days', NOW());

UPDATE users SET plan = '<plan>' WHERE id = <NUEVO_ID>;
```

---

## 4. Recuperación completa (con backup de DB)

Replit genera backups automáticos de la base de datos. Para recuperar:
1. Ir a **Database → Backups** en el panel de Replit
2. Restaurar al punto anterior al borrado, O hacer un dump puntual del usuario y re-insertarlo

### SQL para extraer datos del backup (correr contra la DB de backup)
```sql
SELECT * FROM users WHERE id = <ID>;
SELECT * FROM businesses WHERE user_id = <ID>;
SELECT * FROM posts WHERE user_id = <ID>;
SELECT * FROM subscriptions WHERE user_id = <ID>;
SELECT * FROM social_accounts WHERE user_id = <ID>;
SELECT * FROM brand_profiles WHERE user_id = <ID>;
SELECT * FROM niches WHERE user_id = <ID>;
SELECT * FROM media_library WHERE user_id = <ID>;
SELECT * FROM content_history WHERE user_id = <ID>;
SELECT * FROM publishing_schedules WHERE user_id = <ID>;
SELECT * FROM image_variants WHERE post_id IN (SELECT id FROM posts WHERE user_id = <ID>);
SELECT * FROM publish_log WHERE post_id IN (SELECT id FROM posts WHERE user_id = <ID>);
SELECT * FROM audit_logs WHERE user_id = <ID>;
SELECT * FROM credit_purchases WHERE user_id = <ID>;
SELECT * FROM affiliate_codes WHERE user_id = <ID>;
```

---

## 5. Limpiar huérfanos tras un borrado

Si el usuario fue borrado y quedaron registros huérfanos en tablas sin CASCADE:
```sql
DELETE FROM affiliate_codes WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM credit_purchases WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM pending_credit_deductions WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM content_learnings WHERE business_id NOT IN (SELECT id FROM businesses);
```

> ⚠️ Ejecutar estas queries con cuidado. Confirmar primero con un SELECT antes de borrar.

---

## 6. Mejora preventiva recomendada: soft-delete

La forma correcta de evitar pérdida accidental de datos es implementar **soft-delete** en la tabla `users`: en lugar de borrar la fila, marcar `deleted_at = NOW()` y filtrar `WHERE deleted_at IS NULL` en todos los endpoints de lectura.

```sql
-- Patrón de soft-delete recomendado
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;

-- Borrado seguro
UPDATE users SET deleted_at = NOW() WHERE id = <ID>;

-- Restauración
UPDATE users SET deleted_at = NULL WHERE id = <ID>;
```

**Estado actual en HazPost:** Esta mejora ya está implementada desde la tarea #168. La columna `deleted_at` existe en `users`. Los usuarios eliminados desde el admin panel van primero a una **Papelera** con opción de restaurar antes del purge definitivo. El purge permanente corre a las 02:00 Bogotá como cron diario.

Si el usuario está en papelera (soft-deleted, `deleted_at IS NOT NULL`), simplemente usa **Restaurar** desde Admin → Papelera — no se necesita ningún procedimiento de este skill.

Este skill aplica cuando el usuario ya fue **purgado definitivamente** (hard-delete del cron o borrado antes de que existiera el soft-delete).
