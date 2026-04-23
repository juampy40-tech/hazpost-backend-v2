---
name: auth-cache-rules
description: Reglas de invalidación de cachés de autenticación en HazPost. Úsalo ANTES de agregar o modificar cualquier endpoint de admin en user.ts, o cualquier operación que modifique el estado de un usuario (plan, rol, isActive, email verificado). Cubre los 3 cachés en memoria de auth.ts, sus funciones de invalidación y el lookup de qué llamar según qué campo cambia.
---

# Cachés de Autenticación — HazPost

## Regla Principal

`artifacts/api-server/src/lib/auth.ts` tiene **3 cachés en memoria con TTL de 5 minutos** que evitan consultas repetidas a la DB en cada request autenticado. Cualquier endpoint que modifique el estado de un usuario **DEBE** invalidar el caché correspondiente inmediatamente después del `UPDATE` en DB.

**Si no se invalida, el cambio del admin no surte efecto hasta que el TTL expire (~5 min).** El usuario sigue viendo el estado anterior y el sistema sigue aplicando permisos obsoletos.

---

## Los 3 Cachés y Sus Funciones de Invalidación

### 1. `activeCache` → `invalidateActiveCache(userId)`

**Protege:** si el usuario está activo y no está eliminado (`isActive`, `deletedAt`).

**Cuándo llamarlo:**
- Al cambiar `isActive` de un usuario
- Al eliminar (soft-delete) o restaurar un usuario
- Al banear o desbanear un usuario

```typescript
import { invalidateActiveCache } from "../lib/auth.js";

// Después de actualizar isActive en DB:
if (isActive !== undefined) invalidateActiveCache(userId);

// Después de soft-delete:
invalidateActiveCache(userId);
```

---

### 2. `trialCache` → `invalidateTrialCache(userId)`

**Protege:** el plan efectivo del usuario, considerando trials activos. Almacena `effectivePlan` y el `jwtPlan` que estaba en efecto al momento de cachear.

**Cuándo llamarlo:**
- Al cambiar el `plan` de un usuario
- Al cambiar el `role` de un usuario
- Al redimir un voucher (ya cubierto en `vouchers.ts`)
- Al activar o desactivar un trial de plan

```typescript
import { invalidateTrialCache } from "../lib/auth.js";

// Después de actualizar plan o role en DB:
if (plan || role) invalidateTrialCache(userId);
```

> **Nota:** `trialCache` tiene auto-invalidación parcial: si el `jwtPlan` del request cambia (ej. el usuario hace re-login), la entrada de caché se ignora automáticamente. Pero si el admin cambia el plan directamente en DB sin invalidar, la entrada antigua seguirá siendo servida hasta que expire.

---

### 3. `emailVerifiedCache` → `invalidateEmailVerifiedCache(userId)`

**Protege:** si el email del usuario está verificado (`emailVerified`).

**Cuándo llamarlo:**
- Al verificar el email manualmente desde el admin (`force-verify`)
- Al cambiar el email de un usuario (fuerza re-verificación)
- Cuando el usuario verifica su email por link/OTP

```typescript
import { invalidateEmailVerifiedCache } from "../lib/auth.js";

// Después de marcar emailVerified = true en DB:
invalidateEmailVerifiedCache(userId);

// Después de cambiar el email (requiere re-verificar):
invalidateEmailVerifiedCache(userId);
```

---

## Lookup Table: Qué Campo → Qué Invalidar

| Campo modificado en DB         | `invalidateActiveCache` | `invalidateTrialCache` | `invalidateEmailVerifiedCache` |
|-------------------------------|:-----------------------:|:----------------------:|:------------------------------:|
| `isActive`                    | ✅                      |                        |                                |
| `deletedAt` (soft-delete)     | ✅                      |                        |                                |
| `plan`                        |                         | ✅                     |                                |
| `role`                        |                         | ✅                     |                                |
| `emailVerified`               |                         |                        | ✅                              |
| `email` (cambio de email)     |                         |                        | ✅                              |
| voucher / trial de plan       |                         | ✅                     |                                |

---

## Anti-Patrón — NO Hacer Esto

```typescript
// ❌ INCORRECTO: actualiza DB pero no invalida el caché
const [user] = await db.update(usersTable)
  .set({ plan: "business" })
  .where(eq(usersTable.id, userId))
  .returning();
res.json({ success: true }); // El caché sigue sirviendo "free" durante ~5 min
```

```typescript
// ✅ CORRECTO: invalida inmediatamente después del UPDATE
const [user] = await db.update(usersTable)
  .set({ plan: "business" })
  .where(eq(usersTable.id, userId))
  .returning();
if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
invalidateTrialCache(userId); // ← limpia el caché inmediatamente
res.json({ success: true });
```

---

## Import Correcto en user.ts

```typescript
import {
  signToken, hashPassword, comparePassword,
  setAuthCookie, clearAuthCookie, requireAuth, requireAdmin,
  invalidateActiveCache, invalidateEmailVerifiedCache, invalidateTrialCache,
} from "../lib/auth.js";
```

---

## Estado Actual (Abril 2026)

| Endpoint | Campo | Función llamada | Estado |
|---|---|---|---|
| `PUT /admin/users/:id` | `isActive` | `invalidateActiveCache` | ✅ |
| `PUT /admin/users/:id` | `plan`, `role` | `invalidateTrialCache` | ✅ |
| `POST /admin/users/:id/force-verify` | `emailVerified` | `invalidateEmailVerifiedCache` | ✅ |
| `PATCH /admin/users/:id/email` | `email` | `invalidateEmailVerifiedCache` | ✅ |
| `POST /vouchers/redeem` | voucher/trial | `invalidateTrialCache` | ✅ |
| `DELETE /admin/users/:id` | soft-delete | `invalidateActiveCache` | ✅ |

> Si agregas un nuevo endpoint admin que modifique estado de usuario, consultar este skill y el lookup table de arriba.
