---
  name: affiliates-system
  description: Sistema de afiliados en HazPost. Afiliados son socios de negocio con % de comisión configurable, código personalizado y condiciones diferentes por código. Separado del sistema de referidos de usuarios normales.
  ---
  # HazPost — Sistema de Afiliados

  ## Concepto
  Los afiliados son socios de negocio (no usuarios normales) que reciben comisión
  por cada cliente que traen. El admin crea y gestiona los códigos de afiliado.

  ## Datos por código de afiliado
  - Código único personalizado (ej: "AGENCIA-MEDELLIN")
  - % de comisión (editable, ej: 20%)
  - Número de meses que dura la comisión (ej: 3, 6, 12, ∞)
  - Estado: activo / inactivo
  - Email del afiliado (para reportes)
  - Fecha de creación y expiración

  ## Panel del admin — gestión de afiliados
  - Crear nuevo código de afiliado
  - Editar % y meses de cualquier código
  - Activar / desactivar código
  - Ver historial: quién usó el código, cuándo, cuánto genera en comisión
  - Calcular comisión acumulada por afiliado

  ## Reglas de negocio
  - Un código de afiliado puede tener condiciones diferentes a otro
  - El código se aplica al momento del registro o primer pago
  - La comisión se calcula sobre el monto del plan (sin impuestos)
  - Si el usuario cancela, la comisión se detiene

  ## Separación con referidos
  - Afiliados = socios de negocio gestionados por el admin
  - Referidos = cualquier usuario que invita a otro (self-service)
  - Son sistemas independientes con tablas separadas

  ## Archivos relevantes
  `lib/db/src/schema/` — nueva tabla `affiliate_codes`
  `artifacts/api-server/src/routes/admin/affiliates.ts`
  `artifacts/social-dashboard/src/pages/admin.tsx`
  