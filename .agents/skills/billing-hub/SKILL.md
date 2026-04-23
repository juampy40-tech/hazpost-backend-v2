# Billing Hub — HazPost

Fuente de verdad para el módulo de suscripciones, planes, carrito y negocios en billing.tsx.

## Arquitectura

### Frontend
- **`billing.tsx`** — Página principal de Plan y Créditos. Secciones: créditos, plan activo, grid de planes, negocios activos, negocios inactivos, carrito, voucher.
- **`BillingCart.tsx`** — Drawer sticky con ítems del carrito; soporta `credit_pack`, `extra_business`, `plan_change`.
- **`DowngradeModal.tsx`** — Modal 3-pasos: (1) Confirmar fechas, (2) Seleccionar negocios a conservar, (3) Resumen. Muestra advertencia si el nuevo plan permite menos negocios.
- **`DeleteBusinessModal.tsx`** — Modal de desactivación segura con verificación de contraseña + TOTP.

### Backend Endpoints (todos con `credentials: "include"`, userId siempre de JWT)

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/subscriptions/me` | Plan activo, créditos, `pendingDowngradePlan`, `pendingDowngradeBusinessIds`, `extraBusinessSlots` |
| POST | `/api/billing/schedule-downgrade` | Programar downgrade al fin del ciclo |
| DELETE | `/api/billing/schedule-downgrade` | Cancelar downgrade programado |
| POST | `/api/billing/cart-checkout` | Procesar carrito (créditos, negocios, cambios de plan) |
| GET | `/api/businesses` | Negocios activos del usuario |
| GET | `/api/businesses/inactive` | Negocios inactivos del usuario |
| POST | `/api/businesses/:id/reactivate` | Reactivar negocio inactivo (verifica slot disponible) |
| DELETE | `/api/businesses/:id` | Desactivar negocio (confirmPassword + TOTP opcional) |

### DB Schema — `subscriptionsTable`
```typescript
pendingDowngradePlan: varchar("pending_downgrade_plan")      // plan key destino
pendingDowngradeAt: timestamp("pending_downgrade_at")          // fecha de aplicación
pendingDowngradeBusinessIds: jsonb("pending_downgrade_business_ids").default([]) // IDs a conservar
extraBusinessSlots: integer("extra_business_slots").default(0)
```

### Validación en POST /api/billing/schedule-downgrade
- `keepBusinessIds` deben ser IDs de negocios activos **propios del usuario** (se valida contra DB)
- Si `activeBusinesses.count > effectiveLimit` y `keepBusinessIds` está vacío → error 400
- Si algún ID no pertenece al usuario o no está activo → error 400 con lista de IDs inválidos
- `primaryBusinessId` debe estar en `keepBusinessIds`

### Scheduler — `expireSubscriptions()`
Al vencer el ciclo con `pendingDowngradePlan`:
1. Aplica el downgrade (cambia `plan`, `creditsRemaining`, `creditsTotal`)
2. Inactiva negocios NOT IN `pendingDowngradeBusinessIds`
3. Establece el primero como `isDefault = true`
4. Limpia campos pending
5. Registra `AuditAction.DOWNGRADE_APPLIED`

### Límite efectivo de negocios
```
effectiveLimit = plan.businessesAllowed + subscription.extraBusinessSlots
```

### Reglas anti-contaminación
- `userId` SIEMPRE de `req.user!.userId` (JWT). NUNCA de body/params.
- Todas las queries con `WHERE user_id = userId`.
- Transacciones para operaciones atómicas.

### Verificación segura en DELETE /api/businesses/:id
Tres caminos según tipo de cuenta:
1. **TOTP habilitado**: password + totpCode (6 dígitos Google Authenticator)
2. **Solo contraseña**: confirmPassword (bcrypt check)
3. **OAuth puro** (sin password ni TOTP): emailCode — llamar primero `POST /api/businesses/:id/send-delete-code` para recibir OTP por correo

Comportamiento de eliminación:
- Si el negocio tiene **0 posts** → hard-delete (eliminación física permanente)
- Si el negocio tiene posts → soft-delete (is_active=false, datos conservados)

```typescript
// GET /api/user/delete-account/method → { method: "totp" | "password" | "email" }
// POST /api/businesses/:id/send-delete-code → { sentTo: "ma***@gmail.com" }  (solo OAuth)
// DELETE /api/businesses/:id body: { confirmPassword?, totpCode?, emailCode? }
```

OTP store para negocio: en memoria `Map<"userId:bizId", { hash, expiry }>`. Cooldown 60s, expiry 10min.

## Flujo de Downgrade
1. Usuario hace clic en "Programar cambio" desde grid de planes.
2. Se abre `DowngradeModal` con pasos:
   - Paso 1: Confirma fechas (activo hasta X, nuevo plan empieza X+1 día)
   - Paso 2 (si activeBusinesses > effectiveLimit): Selección de negocios a conservar + elegir principal
   - Paso 3: Resumen → POST /api/billing/schedule-downgrade
3. En billing.tsx se muestra banner naranja con botón "Cancelar cambio".
4. Al vencer el ciclo, el scheduler aplica automáticamente el downgrade.

## Carrito
- Estado local en `billing.tsx` → `cartItems: CartItem[]`
- Tipos: `credit_pack | extra_business | plan_change`
- Checkout: POST /api/billing/cart-checkout → redirige a Wompi si hay monto

## Archivos clave
```
artifacts/social-dashboard/src/pages/billing.tsx
artifacts/social-dashboard/src/components/BillingCart.tsx
artifacts/social-dashboard/src/components/DowngradeModal.tsx
artifacts/social-dashboard/src/components/DeleteBusinessModal.tsx
artifacts/api-server/src/routes/billing.ts
artifacts/api-server/src/routes/businesses.ts
artifacts/api-server/src/services/scheduler.service.ts
lib/db/src/schema/subscriptions.ts
artifacts/api-server/src/lib/audit.ts          (AuditAction.DOWNGRADE_APPLIED, etc.)
```
