---
name: agency-oauth-rules
description: Reglas de OAuth Meta/TikTok para admins y agencias en HazPost. Úsalo ANTES de modificar el flujo de autorización OAuth, la validación de businessId, la función connectMetaPage, o cualquier lógica que vincule cuentas sociales a negocios. Cubre el bypass de admin, la resolución de conflictos de página duplicada y la migración de negocio entre usuarios.
---

# Agency OAuth Rules — HazPost

## Arquitectura de usuarios y negocios

HazPost soporta dos modos de operación:

| Modo | Descripción | Ejemplo |
|------|-------------|---------|
| **Usuario directo** | Un usuario tiene sus propios negocios | user_id=1, business_id=1 (ECO) |
| **Agencia admin** | Un usuario (role='admin') gestiona negocios de otros usuarios | user_id=1 gestiona business_id=4 (Club Ventas) |

El rol `admin` en `users.role` tiene acceso transversal a todos los negocios de la plataforma.

---

## Admin Bypass en OAuth (18 abr 2026)

### El problema
El flujo OAuth Meta/TikTok valida que el `?businessId=X` en la URL pertenezca al `userId` del usuario autenticado. Esto bloqueaba a los admins que intentaban conectar Meta para negocios de otros usuarios.

### La solución (oauth.ts)

**Archivo**: `artifacts/api-server/src/routes/social/oauth.ts`

**Flujo de validación del redirect handler** (líneas ~139-164):
```
1. bizFromQuery = ?businessId=X del query param
2. Si bizFromQuery != null:
   a. ¿biz X pertenece a userId? → OK, procede
   b. Si NO: ¿userId tiene role='admin'? → admin bypass, verifica que el biz exista
   c. Si no es admin → 403
3. businessId = bizFromQuery ?? getActiveBusinessId(userId)
```

**Implicación**: El `social_account` se guarda con `user_id=adminId` + `business_id=X`. Esto es correcto porque el scheduler usa `business_id` para buscar cuentas sociales.

---

## Resolución de conflictos: misma página en 2 negocios

### Patrón prohibido (anti-pattern)
Nunca crear 2 registros en `social_accounts` con el mismo `page_id` para el mismo `user_id`. El `ISOLATION_GUARD` del scheduler bloqueará publicaciones.

### Flujo de detección + confirmación (18 abr 2026)

Cuando se detecta que el mismo `user_id` + `page_id` existe en un negocio diferente al que se está conectando:

1. **Backend** (`connectMetaPage`): lanza error `PAGE_TRANSFER_REQUIRED` con statusCode 409 y `transferConflict: { fromBusinessId, fromBusinessName, toBusinessId, accountId }`
2. **Endpoint `POST /api/auth/meta/select-page`**: devuelve ese 409 con `transferConflict` al frontend
3. **Frontend** (`settings.tsx`): detecta el 409 con `transferConflict`, muestra un Dialog de confirmación con:
   - Nombre del negocio que perdería la conexión
   - Advertencia de que dejará de publicar
   - Botón "Sí, transferir" (amber) + "Cancelar"
4. **Si confirma**: re-POST con `confirmTransfer: true` → backend ejecuta el UPDATE
5. **Si cancela**: no ocurre nada, la sesión OAuth sigue válida para reintentar con el negocio correcto

```
Log éxito: "Meta OAuth: transferring page connection to new business (user confirmed)"
Campos: userId, fromBusinessId, toBusinessId, pageId
```

### Por qué requerir confirmación
Evita mover conexiones por "error de dedo" al seleccionar el negocio incorrecto antes de hacer OAuth. Sin la confirmación, la conexión se mueve silenciosamente y el negocio original deja de publicar sin aviso.

---

## Migración de negocio entre usuarios

Si un negocio fue creado en una cuenta y debe pasarse a otra:

### Paso a paso (con integridad de datos)

**IMPORTANTE**: El trigger `enforce_post_tenant_integrity` valida que `posts.user_id` sea dueño de `posts.business_id`. Siempre migrar en este orden:

```sql
-- 1. Primero migrar el negocio
UPDATE businesses SET user_id = :nuevo_user_id WHERE id = :biz_id;

-- 2. Luego migrar posts (el trigger ahora pasa)
UPDATE posts SET user_id = :nuevo_user_id WHERE business_id = :biz_id;

-- 3. Migrar image_variants
UPDATE image_variants SET user_id = :nuevo_user_id WHERE business_id = :biz_id;

-- 4. Migrar otras tablas
UPDATE niches SET user_id = :nuevo_user_id WHERE business_id = :biz_id;
UPDATE content_learnings SET user_id = :nuevo_user_id WHERE user_id = :old_user_id;
UPDATE brand_profiles SET user_id = :nuevo_user_id WHERE user_id = :old_user_id;
```

### Por qué el orden importa
El trigger `enforce_post_tenant_integrity` corre en cada UPDATE de posts. Si el negocio aún tiene el `user_id` viejo cuando actualizas posts con el `user_id` nuevo → trigger falla.

---

## Archivos clave

| Archivo | Función |
|---------|---------|
| `artifacts/api-server/src/routes/social/oauth.ts` | Admin bypass (líneas ~141-163), conflict transfer en `connectMetaPage` (líneas ~408-432) |
| `artifacts/api-server/src/lib/businesses.ts` | `getActiveBusinessId(userId)` — retorna el negocio default |
| `artifacts/api-server/src/services/scheduler.service.ts` | `ISOLATION_GUARD` — bloquea publicación si misma página en 2 negocios |

---

## Casos de uso y acciones

| Escenario | Acción del sistema |
|-----------|-------------------|
| Admin conecta Meta para su propio negocio | Flujo normal |
| Admin conecta Meta para negocio de otro usuario | Admin bypass → guarda con businessId correcto |
| Misma página Meta ya conectada a otro negocio (mismo user) | Dialog de confirmación (requiere `confirmTransfer: true`) |
| Misma página Meta ya conectada a otro usuario diferente | **"Último OAuth gana"**: revoca conexión anterior + notifica al dueño previo |
| Negocio debe moverse de user A a user B | SQL migration en orden: biz → posts → variants → resto |

---

## Notificaciones cuando se revoca una conexión (cross-user takeover)

Cuando un nuevo usuario reclama una página que ya tenía otro usuario:

1. **Conexión anterior** se borra de `social_accounts`
2. **Telegram** → `notifyInstagramAccountClaimed(prevUserId, igUsername, businessName)` en `telegram.service.ts`
   - Usa el bot del usuario; si no tiene bot, usa el admin global
3. **Email** → `sendAccountClaimedEmail(prevEmail, igUsername, businessName)` en `oauth.ts`
   - SMTP Hostinger primero; fallback a Resend. Fire & forget, nunca bloquea el OAuth
4. **Alerta en plataforma** → Insert en `platform_alerts` (tipo `account_claimed`)
   - Se muestra como banner rojo dismissible en el layout al próximo login

### Tabla platform_alerts (startup migration en index.ts)
```sql
platform_alerts(id, user_id → users.id, type, title, message, metadata JSONB, is_read BOOLEAN, created_at)
```

### Endpoints: `GET /api/alerts`, `POST /api/alerts/:id/dismiss`, `POST /api/alerts/dismiss-all`
### Frontend (layout.tsx): banner rojo sticky con X por cada alerta no leída

---

## Historial de cambios

- **18 abr 2026**: Admin bypass + conflict transfer implementados
- **18 abr 2026**: Club Ventas (biz_id=4) migrado de user_id=3 a user_id=1 (todos los posts, image_variants, niches, content_learnings, brand_profiles)
