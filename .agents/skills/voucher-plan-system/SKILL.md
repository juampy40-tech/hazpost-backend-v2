---
name: voucher-plan-system
description: Arquitectura completa del sistema de vouchers, trials de plan y créditos en HazPost. Úsalo ANTES de modificar endpoints de redención de vouchers, lógica de créditos, plan_trials, resolución de plan efectivo, o formularios de admin de vouchers.
---

# Voucher & Plan System — HazPost

## Modelo de datos

### Tablas clave

```
voucher_codes
  id, code (UNIQUE), trial_plan (TEXT|NULL), trial_days, bonus_credits,
  max_uses (NULL=ilimitado), current_uses, is_active, expires_at, description

voucher_redemptions
  id, voucher_id → voucher_codes, user_id → users
  UNIQUE(voucher_id, user_id)  ← un usuario no puede redimir el mismo código dos veces

plan_trials
  id, user_id (UNIQUE), original_plan, trial_plan, trial_start, trial_end
  UNIQUE(user_id)  ← solo un trial activo por usuario

plans
  key (PK), name, credits_per_month, allowed_content_types[], bulk_max_posts, ...

subscriptions
  user_id, plan (= users.plan, nunca muta por trials), credits_remaining, credits_total, period_end
```

### Regla fundamental: users.plan NUNCA se muta por trials

`users.plan` refleja el plan base real (pagado). Los trials son un *overlay* temporal:
- Al redimir: se inserta/actualiza `plan_trials` y se reinician créditos
- Al expirar: se elimina `plan_trials`, el usuario vuelve a su `users.plan` original
- `subscriptions.plan` tampoco se muta — el plan efectivo se resuelve en runtime

---

## Plan keys válidos en la tabla `plans`

| key       | name        | credits/mes | content types                        |
|-----------|-------------|------------|--------------------------------------|
| `free`    | Gratis      | 40         | image, story                         |
| `starter` | Emprendedor | 120        | image, story                         |
| `business`| Negocio     | 220        | image, story, carousel, reel         |
| `agency`  | Agencia     | 1100       | image, story, carousel, reel         |

### Alias conocidos (NO usar directamente en DB)

| alias         | key real    |
|---------------|-------------|
| `negocio`     | `business`  |
| `emprendedor` | `starter`   |
| `agencia`     | `agency`    |
| `gratis`      | `free`      |
| `pro`         | `business`  |

**CRÍTICO**: Siempre usar `normalizePlanKey(key)` (exportado de `artifacts/api-server/src/lib/auth.ts`) antes de guardar cualquier plan key en la DB. Nunca guardar un alias.

---

## Flujo de creación de voucher (admin)

**Endpoint**: `POST /api/admin/vouchers`
**Archivo**: `artifacts/api-server/src/routes/admin/vouchers.ts`

1. Admin envía `{ code, trial_plan, trial_days, bonus_credits, max_uses, description, expires_at, is_active }`
2. El endpoint normaliza `trial_plan` con `normalizePlanKey()` antes del INSERT → la DB siempre almacena la key real
3. El formulario en `admin.tsx` usa `value="business"` (no `"negocio"`) en el `<Select>`

---

## Flujo de redención de voucher (usuario)

**Endpoint**: `POST /api/vouchers/redeem`
**Archivo**: `artifacts/api-server/src/routes/vouchers.ts`

Todo ocurre en una sola transacción DB:

1. **Lock** de la fila `voucher_codes` (FOR UPDATE) para atomicidad
2. **Validaciones**: is_active, no expirado, no superó max_uses
3. **Anti-duplicación**: verifica que el usuario no haya canjeado este código antes
4. **Normalización**: `normalizePlanKey(v.trial_plan)` → key real del plan trial
5. **Créditos**: Si hay `trial_plan`:
   - Lee `plans.credits_per_month` del plan normalizado
   - **Resetea** `subscriptions.credits_remaining = credits_per_month + bonus_credits`
   - **Resetea** `subscriptions.credits_total = credits_per_month + bonus_credits`
   - Esto garantiza que el usuario tenga exactamente los créditos del plan de prueba
   - Si no hay `trial_plan` pero sí `bonus_credits`: solo suma (no resetea)
6. **plan_trials**: INSERT con la key normalizada, ON CONFLICT actualiza trial_plan y trial_end
7. **Registro**: INSERT en `voucher_redemptions` + incrementa `current_uses`
8. **JWT**: Se emite un nuevo token con `plan = trial_plan_normalizado` para que el cliente lo refleje de inmediato
9. **Cache**: `invalidateTrialCache(userId)` → el próximo request lee el nuevo estado

**Respuesta**:
```json
{
  "ok": true,
  "bonus_credits": 0,
  "trial_plan": "business",
  "trial_days": 30,
  "trial_end": "2026-05-15T...",
  "new_plan": "business"
}
```

---

## Resolución de plan efectivo en cada request

**Función**: `resolveEffectivePlan()` en `artifacts/api-server/src/lib/auth.ts`

El middleware `requireAuth` llama esta función y sobreescribe `req.user.plan` con el plan efectivo:

```
Si plan_trials existe Y no expiró → devuelve normalizePlanKey(trial.trial_plan)
Si plan_trials existe Y expiró    → DELETE plan_trials, emite nuevo JWT con users.plan
Si no hay plan_trials             → devuelve jwtPlan (= users.plan)
```

**Caché**: en memoria, TTL 5 min, invalidado por `invalidateTrialCache(userId)`.

---

## Expiración de trial

Ocurre al detectarse en la primera request del usuario post-expiración:
1. Se borra `plan_trials`
2. Se lee `users.plan` (el plan base real, nunca mutado)
3. Se emite nuevo JWT con el plan base
4. El usuario recupera sus créditos del próximo ciclo de `expireSubscriptions` (scheduler, 01:00 Bogotá)

---

## Endpoint de estado del trial (billing)

**Endpoint**: `GET /api/vouchers/my-trial`

Devuelve el trial activo del usuario. El campo `trial_plan` siempre está normalizado (`normalizePlanKey`) antes de enviarse al cliente para que el frontend pueda hacer `plans.find(p => p.key === trial_plan)` sin fallas.

---

## Validación de vouchers (pública)

**Endpoint**: `GET /api/vouchers/validate/:code`

No requiere auth. Retorna el voucher con sus campos tal como están en la DB (el `trial_plan` puede ser el alias si es un voucher antiguo). El frontend solo usa esto para mostrar un preview antes de canjear.

---

## Queries SQL de diagnóstico

```sql
-- Ver trials activos y su estado
SELECT u.email, pt.original_plan, pt.trial_plan, pt.trial_end,
       s.credits_remaining, s.credits_total,
       (pt.trial_end > NOW()) AS is_active
FROM plan_trials pt
JOIN users u ON u.id = pt.user_id
JOIN subscriptions s ON s.user_id = pt.user_id
ORDER BY pt.trial_end DESC;

-- Verificar aliases residuales (deben ser 0 después del backfill)
SELECT COUNT(*) FROM plan_trials
WHERE trial_plan IN ('negocio','emprendedor','agencia','gratis','pro');

-- Ver historial de redenciones de un usuario
SELECT vc.code, vc.trial_plan, vc.bonus_credits, vr.redeemed_at
FROM voucher_redemptions vr
JOIN voucher_codes vc ON vc.id = vr.voucher_id
WHERE vr.user_id = <USER_ID>
ORDER BY vr.redeemed_at DESC;

-- Vouchers activos con estadísticas
SELECT vc.code, vc.trial_plan, vc.trial_days, vc.bonus_credits,
       vc.current_uses, vc.max_uses, vc.expires_at, vc.is_active,
       COUNT(vr.id) AS total_redemptions
FROM voucher_codes vc
LEFT JOIN voucher_redemptions vr ON vr.voucher_id = vc.id
GROUP BY vc.id
ORDER BY vc.created_at DESC;
```

---

## Archivos clave

- `artifacts/api-server/src/routes/vouchers.ts` — redención y endpoint /my-trial
- `artifacts/api-server/src/routes/admin/vouchers.ts` — CRUD admin de vouchers
- `artifacts/api-server/src/lib/auth.ts` — `normalizePlanKey()`, `resolveEffectivePlan()`, `invalidateTrialCache()`
- `artifacts/api-server/src/index.ts` — backfill de aliases en plan_trials (startup)
- `artifacts/social-dashboard/src/pages/admin.tsx` — UI del admin (VouchersManagement, PLAN_NAME_MAP)
- `artifacts/social-dashboard/src/pages/billing.tsx` — display del trial y créditos

---

## Reglas de oro

1. **Nunca mutar `users.plan`** — ni en redención, ni en expiración de trial. Solo `plan_trials` como overlay.
2. **Siempre normalizar** con `normalizePlanKey()` antes de guardar en `plan_trials` o `voucher_codes.trial_plan`.
3. **El reset de créditos** al redimir un trial es COMPLETO: `credits_remaining = credits_per_month + bonus_credits` (no sumatorio). Esto garantiza la experiencia del plan de prueba independientemente del balance anterior.
4. **El `bonus_credits` del voucher** representa créditos extra ENCIMA del plan mensual, no en vez de.
5. **Invalidar el trial cache** (`invalidateTrialCache`) después de cualquier cambio en `plan_trials`.
