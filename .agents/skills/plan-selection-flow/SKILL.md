---
  name: plan-selection-flow
  description: Flujo de registro con elección de plan, cambio de plan desde la plataforma y visualización de información de planes para usuarios. Úsalo al trabajar en onboarding, suscripciones o pantallas de upgrade.
  ---
  # HazPost — Flujo de Selección y Cambio de Plan

  ## Al registrarse
  1. El usuario ve los 4 planes (Free, Emprendedor, Negocio, Agencia) con precios y beneficios
  2. Selecciona uno antes de completar el registro
  3. El plan Free está siempre disponible sin tarjeta de crédito
  4. El plan elegido se activa inmediatamente tras confirmar el registro

  ## Desde la plataforma (cambio de plan)
  - Siempre debe existir un botón/sección visible: "Cambiar plan" o "Actualizar plan"
  - El usuario ve todos los planes con su información completa
  - Puede hacer upgrade (paga diferencia prorrateada) o downgrade (efectivo al próximo ciclo)

  ## Visualización de planes
  La pantalla de planes debe mostrar:
  - Nombre del plan
  - Precio (en USD/mes)
  - Créditos incluidos
  - Lista de beneficios (checkboxes)
  - Botón de acción ("Elegir" / "Actual" / "Upgrade")

  ## Ajuste de créditos al cambiar plan
  - Upgrade: se suman los créditos del nuevo plan inmediatamente (minus lo ya consumido)
  - Downgrade: los créditos se ajustan al nuevo límite al próximo ciclo
  - Los créditos de paquetes adicionales no se tocan al cambiar plan

  ## Datos de planes
  Los planes se leen de la tabla `plans` via GET /api/plans (endpoint público, no requiere auth).
  Los textos y beneficios son los del CMS (skill `plan-descriptions-cms`).

  ## Archivos relevantes
  `artifacts/social-dashboard/src/pages/register.tsx` (o equivalente)
  `artifacts/social-dashboard/src/pages/billing.tsx` (o equivalente)
  `artifacts/api-server/src/routes/billing.ts`
  `lib/db/src/schema/plans.ts`
  `lib/db/src/schema/subscriptions.ts`
  