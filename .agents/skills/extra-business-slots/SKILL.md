# Extra Business Slots — Arquitectura Centralizada HazPost

## Qué es esto

Sistema que permite a usuarios de plan **Negocio** y **Agencia** adquirir negocios adicionales más allá del límite base de su plan, pagando un add-on mensual o anual. Cada compra se registra y el límite efectivo se expande de forma per-user sin afectar a otros usuarios.

## Regla de Oro: Aislamiento total por usuario

**NUNCA hay contaminación cross-user ni cross-business.** Toda operación está anclada a `userId = req.user!.userId` (JWT-verified). El cuerpo del request (`req.body`) nunca puede influir sobre qué usuario se modifica.

```
// CORRECTO — siempre así:
const userId = req.user!.userId;
db.update(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));

// INCORRECTO — jamás así:
const { userId } = req.body; // ← vulnerabilidad de escalada de privilegios
```

## Columna clave: `subscriptions.extra_business_slots`

```sql
-- Tabla subscriptions
extra_business_slots  INTEGER  NOT NULL  DEFAULT 0
```

- Empieza en `0` para todos los usuarios.
- Se incrementa en `+1` por cada negocio adicional comprado.
- **Nunca se resetea** al renovar el plan (los slots son permanentes para el período).
- Propiedad: `subscriptionsTable.extraBusinessSlots` en Drizzle.

## Límite efectivo de negocios

```typescript
// businesses.ts — POST /api/businesses
const extraSlots  = sub?.extraBusinessSlots ?? 0;
const maxBusinesses = (planDef?.businessesAllowed ?? 1) + extraSlots;
```

| Plan     | businesses_allowed | extra_business_slots | Límite efectivo |
|----------|-------------------|----------------------|-----------------|
| free     | 1                 | 0                    | 1               |
| starter  | 1                 | 0                    | 1               |
| business | 1                 | 0                    | 1               |
| business | 1                 | 2                    | 3               |
| agency   | 5                 | 0                    | 5               |
| agency   | 5                 | 3                    | 8               |

## Precios configurados en plans (DB)

| Plan     | extra_business_price_usd | extra_business_price_annual_usd | extra_business_credits |
|----------|--------------------------|---------------------------------|------------------------|
| business | 49.99                    | 499.90                          | 100                    |
| agency   | 29.99                    | 0 (sin anual aún)               | 220                    |

Administrables desde el Admin Panel → Sección "Negocio adicional" de cada plan.

## Endpoint: `POST /api/billing/buy-extra-business`

**Archivo:** `artifacts/api-server/src/routes/billing/packages.ts`

**Auth:** Requiere JWT cookie `hz_token` (middleware `requireAuth`).

**Body:**
```json
{
  "pendingBusiness": {
    "name": "Mi segundo negocio",
    "industry": "Restaurante",
    "subIndustry": "Comida rápida",
    "description": "Descripción opcional"
  },
  "annual": false
}
```

**Flujo interno:**
1. Lee `userId` del JWT — nunca del body.
2. Valida que el plan sea `business` o `agency`.
3. Valida que `extra_business_price_usd > 0`.
4. Inserta en `credit_purchases` con `status = 'pending'`.
5. En **una sola transacción** (atómica):
   - Incrementa `subscriptions.extra_business_slots += 1` WHERE `user_id = userId`.
   - Incrementa `subscriptions.credits_remaining` y `credits_total` += `extraBusinessCredits`.
   - Crea el negocio en `businesses` con `user_id = userId` (del JWT).
   - Crea nichos iniciales en `niches` con `user_id = userId` y `business_id = nuevo_id`.
6. Registra en `audit_logs` con `action = 'EXTRA_BUSINESS_SLOT_PURCHASED'`.

**Respuesta exitosa (201):**
```json
{
  "success": true,
  "business": { "id": 5, "name": "Mi segundo negocio" },
  "purchaseId": 12,
  "creditsAdded": 100,
  "message": "Negocio creado. Se agendó el cobro de $49.99 USD. Los +100 créditos ya están disponibles."
}
```

## Confirmación de pago (admin)

El `credit_purchases` queda en `status = 'pending'`. El admin puede confirmarlo vía:

```
POST /api/billing/confirm-purchase/:id
Body: { "wompiTransactionId": "wom_xxx", "status": "completed" }
```

Esto actualiza el estado en `credit_purchases` (no agrega créditos de nuevo — ya se agregaron al momento de la compra).

## SQL de auditoría

```sql
-- Ver slots extra comprados por usuario
SELECT u.email, s.plan, s.extra_business_slots,
       COUNT(cp.id) AS purchases
FROM subscriptions s
JOIN users u ON u.id = s.user_id
LEFT JOIN credit_purchases cp ON cp.user_id = s.user_id
  AND cp.package_key LIKE 'extra_business_slot_%'
GROUP BY u.email, s.plan, s.extra_business_slots
HAVING s.extra_business_slots > 0
ORDER BY s.extra_business_slots DESC;

-- Ver el historial de compras de un usuario
SELECT * FROM credit_purchases
WHERE user_id = <userId>
  AND package_key LIKE 'extra_business_slot_%'
ORDER BY created_at DESC;

-- Ver límite efectivo de un usuario específico
SELECT u.email, s.plan, p.businesses_allowed,
       s.extra_business_slots,
       p.businesses_allowed + s.extra_business_slots AS effective_limit,
       COUNT(b.id) AS current_businesses
FROM subscriptions s
JOIN users u ON u.id = s.user_id
JOIN plans p ON p.key = s.plan
LEFT JOIN businesses b ON b.user_id = s.user_id AND b.is_active = true
WHERE u.id = <userId>
GROUP BY u.email, s.plan, p.businesses_allowed, s.extra_business_slots;
```

## Reglas para modificar este sistema

1. **Nunca** leer `userId` del request body en operaciones de escritura.
2. **Siempre** usar `WHERE user_id = userId` en todas las queries dentro de `buy-extra-business`.
3. **Siempre** usar una transacción para la trifecta: incremento de slot + créditos + creación de negocio.
4. Si se agrega un nuevo plan que soporte extra negocios, agregar `extra_business_price_usd > 0` en la tabla `plans` y actualizar la condición de validación en el endpoint (actualmente `plan !== 'agency' && plan !== 'business'`).
5. El `credit_purchases` con `status = 'pending'` es el registro del cobro pendiente — **no** es una barrera de acceso. El negocio y créditos se otorgan inmediatamente; el cobro se confirma manualmente.

## Archivos clave

| Archivo | Responsabilidad |
|---------|----------------|
| `lib/db/src/schema/subscriptions.ts` | Columna `extra_business_slots` |
| `artifacts/api-server/src/routes/businesses.ts` | Cálculo límite efectivo: `businessesAllowed + extraBusinessSlots` |
| `artifacts/api-server/src/routes/billing/packages.ts` | Endpoint `buy-extra-business` |
| `artifacts/api-server/src/lib/audit.ts` | `AuditAction.EXTRA_BUSINESS_SLOT_PURCHASED` |
| `artifacts/social-dashboard/src/pages/businesses.tsx` | Modal + `handleBuyExtraBusiness` |
| `artifacts/social-dashboard/src/pages/admin.tsx` | Config precios por plan (secciones "Negocio adicional") |
