---
name: credits-audit
description: Credit system audit for HazPost. Use when the user asks about credit behavior, when debugging credit deduction issues, or when verifying that credits are being correctly consumed per post generation. Contains ready-to-run SQL queries to check credit state, negative balances, deduction history, and monthly resets.
---

# Auditoría de Créditos — HazPost

## Arquitectura Actual de Créditos (abril 2026)

Los créditos viven en `subscriptions.credits_remaining` y están scoped por `user_id`.
Un usuario con múltiples negocios comparte el mismo contador de créditos.

| Campo | Tabla | Descripción |
|-------|-------|-------------|
| `credits_remaining` | `subscriptions` | Créditos disponibles (se decrementa al generar) |
| `credits_total` | `subscriptions` | Capacidad total del plan |
| `plan` | `subscriptions` | free=30 / starter=90 / business=200 / agency=500 |
| `period_end` | `subscriptions` | Fecha de reset mensual |

### Deducción de créditos
Cada post generado (bulk o extra) descuenta créditos según el tipo:

| Tipo | Créditos | App setting key |
|------|----------|-----------------|
| Imagen/Story | 1 cr | `credit_cost_image` / `credit_cost_story` |
| Carrusel | 5 cr | `credit_cost_carousel` |
| Reel | 6 cr | `credit_cost_reel` |
| IA + Elemento | +3 cr extra (sobre el costo base de imagen) | `credit_cost_element_ai` |

Los costos configurables se almacenan en `app_settings` y se leen via `getCreditCosts()` en `creditCosts.ts`.
El costo de "IA integra el elemento" se reserva junto con el costo base de imagen: `reserveCredits(uid, costs.elementAi + costs.image)`.

```typescript
// En posts.ts (generate-bulk y generate-extra)
const newCredits = Math.max(0, sub.creditsRemaining - postIds.length);
await db.update(subscriptionsTable).set({ creditsRemaining: newCredits })
  .where(eq(subscriptionsTable.userId, uid));
```

### Verificar costos configurados
```sql
SELECT key, value FROM app_settings
WHERE key LIKE 'credit_cost_%'
ORDER BY key;
-- Debe retornar: credit_cost_image, story, carousel, reel, element_ai
```

---

> **Nota de uso**: Las queries usan IDs y valores de ejemplo del entorno de producción actual
> (userId=1, bizId=1/2, plan=agency). Reemplaza los IDs concretos por los del entorno o usuario
> que estés auditando antes de ejecutar.

## 1. ESTADO ACTUAL DE CRÉDITOS

```sql
-- Créditos de todos los usuarios
SELECT
  u.id as user_id,
  u.email,
  u.plan,
  s.credits_remaining,
  s.credits_total,
  s.period_end,
  s.status as sub_status,
  ROUND(100.0 * s.credits_remaining / NULLIF(s.credits_total, 0), 1) as pct_restante
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id
ORDER BY u.id;
```

### Créditos de un usuario específico
```sql
SELECT
  u.email,
  s.credits_remaining,
  s.credits_total,
  s.period_end,
  (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_totales,
  (SELECT COUNT(*) FROM posts WHERE user_id = u.id
   AND created_at > NOW() - INTERVAL '30 days') as posts_ultimos_30d
FROM users u
JOIN subscriptions s ON s.user_id = u.id
WHERE u.id = 1;  -- cambiar por el userId a consultar
```

---

## 2. DETECCIÓN DE ANOMALÍAS

### Créditos negativos (NO debería ocurrir — hay un `Math.max(0, ...)`)
```sql
SELECT u.email, s.credits_remaining, s.credits_total
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.credits_remaining < 0;
-- Resultado esperado: 0 filas
-- Si hay filas: BUG — el Math.max(0) no se aplicó correctamente
```

### Créditos mayores que el total (reset incorrecto o manual)
```sql
SELECT u.email, s.credits_remaining, s.credits_total
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.credits_remaining > s.credits_total;
-- Puede ser legítimo si se ajustó manualmente — verificar con el usuario
```

### Usuarios sin suscripción (deberían tener una al registrarse)
```sql
SELECT u.id, u.email, u.plan, u.created_at
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE s.id IS NULL;
-- Resultado esperado: 0 filas
-- Si hay filas: el trigger de creación de suscripción falló en el registro
```

---

## 3. HISTORIAL DE CONSUMO DE CRÉDITOS

El sistema NO tiene tabla de historial de créditos (solo el valor actual). Para estimar el consumo:

```sql
-- Posts generados por usuario en los últimos 30 días (proxy del consumo de créditos)
SELECT
  u.email,
  COUNT(p.id) as posts_generados_30d,
  s.credits_remaining,
  s.credits_total,
  s.credits_total - s.credits_remaining as creditos_consumidos_estimados
FROM users u
JOIN subscriptions s ON s.user_id = u.id
LEFT JOIN posts p ON p.user_id = u.id
  AND p.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email, s.credits_remaining, s.credits_total
ORDER BY posts_generados_30d DESC;
```

---

## 4. VERIFICACIÓN DE DEDUCCIÓN CORRECTA

Para verificar que la deducción funciona correctamente:

### Antes de generar
```sql
SELECT credits_remaining FROM subscriptions WHERE user_id = 1;
-- Anotar valor: X
```

### Después de generar N posts
```sql
SELECT credits_remaining FROM subscriptions WHERE user_id = 1;
-- Debe ser: X - N (o 0 si X < N)
```

### Si el valor no bajó — posibles causas
1. La query de deducción no ejecutó (error silencioso en el handler)
2. La subscripción del usuario no existe (`s.id IS NULL` en el join)
3. `postIds.length === 0` (no se generaron posts)

```sql
-- Verificar que la suscripción existe y tiene el userId correcto
SELECT id, user_id, plan, credits_remaining, status
FROM subscriptions
WHERE user_id = 1;
```

---

## 5. RESET MENSUAL DE CRÉDITOS

El reset actualmente está en `scheduler.service.ts` (cron mensual / vía webhook de Wompi).
Para verificar que funcionó:

```sql
-- ¿Los créditos fueron reseteados a credits_total?
SELECT
  u.email,
  s.credits_remaining,
  s.credits_total,
  s.period_end,
  CASE WHEN s.credits_remaining = s.credits_total THEN 'RESETEADO' ELSE 'CONSUMIDO' END as estado
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.period_end < NOW()  -- plan ya venció pero podría haberse renovado
ORDER BY s.period_end;
```

---

## 6. AJUSTE MANUAL DE CRÉDITOS (ADMIN)

Para ajustar créditos de un usuario desde la API admin:
```bash
# PUT /api/user/admin/users/:id
curl -b /tmp/cookies_admin.txt -s -X PUT http://localhost:8080/api/user/admin/users/1 \
  -H "Content-Type: application/json" \
  -d '{"credits": 800, "creditsTotal": 800}' | jq '.success'
```

O directamente en DB (solo en desarrollo/emergencia):
```sql
UPDATE subscriptions
SET credits_remaining = 800, credits_total = 800
WHERE user_id = 1;
-- Confirmar:
SELECT credits_remaining, credits_total FROM subscriptions WHERE user_id = 1;
```

---

## 7. PLANES Y CRÉDITOS POR DEFECTO

```
free:     30 créditos / mes
starter:  90 créditos / mes
business: 200 créditos / mes
agency:   500 créditos / mes  (admin)
```

Nota: El admin (userId=1, juampy40@gmail.com) tiene plan `agency` con 800/800 créditos
(se asignaron manualmente — el estándar de agency es 500).

---

## 8. CHECKLIST DE AUDITORÍA RÁPIDA

Cuando el usuario reporta un problema con créditos, ejecutar en orden:

```sql
-- 1. Estado actual
SELECT u.email, s.credits_remaining, s.credits_total, s.plan FROM subscriptions s JOIN users u ON u.id = s.user_id;

-- 2. Posts generados recientemente
SELECT COUNT(*), DATE(created_at) FROM posts WHERE user_id = X GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC LIMIT 7;

-- 3. ¿Créditos negativos?
SELECT COUNT(*) FROM subscriptions WHERE credits_remaining < 0;

-- 4. ¿Suscripción existe?
SELECT COUNT(*) FROM subscriptions WHERE user_id = X;
```
