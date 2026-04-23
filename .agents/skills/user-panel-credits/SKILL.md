---
  name: user-panel-credits
  description: Reglas de diseño del panel de usuario en HazPost. El panel debe mostrar ÚNICAMENTE créditos disponibles e historial de consumo, sin métricas de imágenes/reels/carruseles/historias.
  ---
  # HazPost — Panel de Usuario (Solo Créditos)

  ## Qué mostrar
  El panel del usuario debe mostrar ÚNICAMENTE:
  1. **Créditos disponibles** — número grande y prominente, con barra de progreso
  2. **Historial de consumo** — fecha, tipo de publicación, créditos gastados

  ## Qué NO mostrar
  - Cantidad de imágenes generadas
  - Cantidad de reels generados
  - Cantidad de carruseles
  - Cantidad de historias

  ## Principio de diseño
  El usuario distribuye sus créditos como quiera. Los créditos son la única unidad
  de consumo. No debe existir ningún contador separado por tipo de contenido en la
  vista del usuario (sí puede existir en el panel del admin para analytics).

  ## Costo visual de referencia
  Mostrar en la UI qué cuesta cada tipo para que el usuario sepa cómo optimizar:
  - Imagen = 1 crédito
  - Historia = 1 crédito
  - Carrusel = 5 créditos
  - Reel = 6 créditos

  ## Archivos relevantes
  `artifacts/social-dashboard/src/pages/` — panel de usuario
  `artifacts/api-server/src/routes/social/credits.ts` (si existe) o posts.ts
  