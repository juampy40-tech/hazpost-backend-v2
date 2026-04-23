---
  name: referrals-system
  description: Sistema de referidos en HazPost. Cualquier usuario puede invitar amigos con su código único. Beneficios para referidor y amigo son configurables por el admin. Separado del sistema de afiliados.
  ---
  # HazPost — Sistema de Referidos (Para Todos los Usuarios)

  ## Mecánica base
  1. Cada usuario tiene un enlace/código único de referido
  2. Su amigo se registra con ese código
  3. Cuando el amigo se suscribe a un plan de pago, ambos reciben beneficios

  ## Beneficios configurables (admin)
  ### Para el referidor (quien invitó)
  - Créditos gratis (cantidad editable, ej: 30)
  - Días gratis de su plan actual (cantidad editable, ej: 30)
  - Desbloqueo de funcionalidades (toggles independientes):
    - ¿Desbloquear Reels? (Sí/No)
    - ¿Desbloquear Carrusel? (Sí/No)
    - ¿Desbloquear Historias? (Sí/No)
    - ¿Imágenes ilimitadas? (Sí/No)

  ### Para el amigo (quien se registró)
  - Créditos de bienvenida (cantidad editable, ej: 15)
  - Días gratis de prueba (cantidad editable, ej: 7)
  - Desbloqueo temporal de funcionalidades (con días de duración)

  ## Reglas configurables por admin
  ```
  Sistema activo: Sí/No (global)
  Por referidor:
    - ¿Puede referir? (por usuario individual)
    - Límite máximo de referidos (número o "sin límite")
    - ¿Puede auto-referirse? (por defecto NO)
  Por amigo:
    - ¿Puede ser referido? (por usuario individual)
    - ¿Solo cuentas nuevas? (Sí/No)
  Condiciones de activación:
    - Plan mínimo requerido del amigo (Free / Emprendedor / Negocio / Agencia)
    - Tiempo máximo desde registro hasta suscripción (ej: 30 días)
  ```

  ## Panel admin
  - Configuración de todos los parámetros anteriores
  - Lista de usuarios con columnas "Puede referir" y "Puede ser referido"
  - Historial de referidos: quién refirió a quién, cuándo, si se pagó el bono

  ## Separación con afiliados
  Ver skill `affiliates-system`. Son sistemas independientes.

  ## Archivos relevantes
  `lib/db/src/schema/referral_conversions.ts` (ya existe, ampliar)
  `artifacts/api-server/src/routes/social/referrals.ts`
  `artifacts/api-server/src/routes/admin/referrals.ts`
  