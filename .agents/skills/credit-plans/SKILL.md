---
  name: credit-plans
  description: Reglas de planes, precios y costos de créditos por tipo de publicación en HazPost. Úsalo al modificar precios de planes, costos de generación, lógica de créditos restantes, o el panel de configuración de planes del admin.
  ---
  # HazPost — Planes, Precios y Créditos

  ## Costos por tipo de publicación
  Estos son los créditos que se descuentan al GENERAR (no al publicar):

  | Tipo | Créditos |
  |------|----------|
  | Imagen | 1 |
  | Historia | 1 |
  | Carrusel | 5 |
  | Reel | 6 |

  Constante maestra en `artifacts/api-server/src/routes/social/posts.ts`:
  ```typescript
  export const CREDIT_COST = { image: 1, story: 1, carousel: 5, reel: 6 };
  ```
  **Nunca duplicar esta constante.** Importarla donde se necesite.

  ## Planes y precios (USD)

  | Plan | Precio/mes | Créditos/mes | Negocios | Notas |
  |------|-----------|-------------|----------|-------|
  | Free | $0 | 40 | 1 | Solo imágenes (sin reels/carrusel) |
  | Emprendedor | $29.99 | 120 | 1 | Todos los tipos |
  | Negocio | $49.99 | 220 | 1 | + Flujo de aprobación |
  | Agencia | $199.99 | 1100 | 5 | Negocio adicional: $29.99 + 220 créditos |

  ## Paquetes adicionales
  - 100 créditos extra = $19.99 USD

  ## Política de créditos
  - **Úsalo o piérdelo**: los créditos NO se acumulan al mes siguiente.
  - El reset ocurre mensualmente en la fecha de renovación de la suscripción.
  - Los créditos del paquete adicional SÍ persisten hasta agotarse.

  ## Panel editable (admin)
  Los precios, créditos por plan y costos por tipo deben ser editables desde el panel admin
  sin tocar código. Los cambios se aplican a nuevas suscripciones y generaciones futuras.

  ---

  ## Regla de centralización de créditos — CRÍTICO

  ### Anti-patrón prohibido
  ```typescript
  // ❌ NUNCA hacer esto — totalmente ajeno al admin panel
  const creditsMap = { free: 30, starter: 90, business: 200, agency: 500 };
  creditsRemaining: creditsMap[plan] ?? 30
  ```

  ### Patrón correcto — siempre leer de plansTable
  Cada punto del código que crea una suscripción nueva DEBE leer de la DB:
  ```typescript
  // ✅ Correcto — respeta la config del admin
  const [planCreditRow] = await db.select({ creditsPerMonth: plansTable.creditsPerMonth })
    .from(plansTable).where(eq(plansTable.key, plan)).limit(1);
  const credits = planCreditRow?.creditsPerMonth ?? 40; // 40 como fallback de seguridad
  ```

  ### Puntos de creación de suscripción (todos deben usar el patrón correcto)
  | Archivo | Ruta | Estado |
  |---|---|---|
  | `artifacts/api-server/src/routes/user.ts:72-85` | Registro por email | ✅ |
  | `artifacts/api-server/src/routes/auth-google.ts:144-147` | Registro por Google OAuth | ✅ |
  | `artifacts/api-server/src/routes/user.ts:1140-1155` | Admin crea usuario | ✅ |

  ### Comportamiento al cambiar creditsPerMonth (u otras condiciones) desde el admin
  - **Regla de inmutabilidad de suscripción activa**: los cambios de plan (créditos, bulkMaxPosts,
    allowedContentTypes, businessesAllowed, reelsPerMonth) SOLO aplican a:
    1. **Nuevas suscripciones** (registro email, Google OAuth, admin crea usuario).
    2. **Renovaciones** (cuando el periodEnd vence y el scheduler renueva la suscripción).
  - Las suscripciones activas NO se modifican. El snapshot de las condiciones al momento de crear
    o renovar la suscripción se guarda en `subscriptions.locked_plan_config` (JSONB).
  - El endpoint `PUT /api/admin/plans/:key` actualiza solo la tabla `plans`. No toca `subscriptions`.
  - El helper `capsFromSnapshot(locked, live)` en `artifacts/api-server/src/lib/planCaps.ts` retorna
    el snapshot si existe, con fallback a la fila viva de `plansTable` (para subs pre-snapshot).

  ### Puntos de lectura de snapshot (enforcement)
  | Feature | Archivo | Patrón |
  |---|---|---|
  | `bulkMaxPosts` | `posts.ts:generate-bulk` | `capsFromSnapshot(sub.lockedPlanConfig, liveCaps)` |
  | `allowedContentTypes` | `posts.ts:generate-bulk,generate-extra` | ídem |
  | `businessesAllowed` | `businesses.ts:POST /,reactivate` | `sub.lockedPlanConfig?.businessesAllowed ?? planDef.businessesAllowed` |
  | reels | N/A — per-sub via `reelsRemaining` | Ya es per-suscripción desde siempre |

  ### Backfill de suscripciones existentes (startup idempotente)
  En `artifacts/api-server/src/index.ts:1585-1610`, al arrancar el servidor:
  - Actualiza `locked_plan_config` de todas las suscripciones activas con `locked_plan_config IS NULL`.
  - Captura el estado actual del plan (incluyendo cualquier cambio del admin previo al deploy).
  - Tras el primer arranque, todas las subs tienen snapshot y el backfill reporta 0 filas.
  - Log: `[PlanSnapshot] N suscripción(es) backfilled con locked_plan_config`
  - El `[CreditBackfill]` anterior también fue ajustado para saltarse subs con snapshot ya activo.

  ### Puntos de escritura de snapshot (cuándo se actualiza lockedPlanConfig)
  | Evento | Archivo |
  |---|---|
  | Registro por email | `user.ts:registro` |
  | Registro por Google OAuth | `auth-google.ts` |
  | Admin crea usuario | `user.ts:admin-create` |
  | Pago confirmado Wompi | `billing.ts:webhook` |
  | Cart checkout | `billing.ts:applyCartItems` |
  | Admin force-upgrade/downgrade | `billing.ts:handleChangePlan` |
  | Free upgrade | `billing.ts:free-upgrade` |
  | Renovación automática | `scheduler.service.ts:expireSubscriptions` |
  | Startup backfill | `index.ts` (solo subs con IS NULL) |

  ---

  ## Archivos clave
  `artifacts/api-server/src/lib/planCaps.ts` (helper buildPlanSnapshot, capsFromSnapshot)
  `artifacts/api-server/src/routes/social/posts.ts`
  `artifacts/api-server/src/routes/admin/plans.ts`
  `artifacts/api-server/src/routes/auth-google.ts`
  `artifacts/api-server/src/routes/user.ts`
  `artifacts/api-server/src/routes/billing.ts`
  `artifacts/api-server/src/routes/businesses.ts`
  `artifacts/api-server/src/services/scheduler.service.ts`
  `artifacts/api-server/src/index.ts` (backfill startup)
  `lib/db/src/schema/plans.ts`
  `lib/db/src/schema/subscriptions.ts`
  