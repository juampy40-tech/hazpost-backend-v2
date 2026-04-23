---
  name: admin-user-reports
  description: Reglas del panel de administrador para ver publicaciones y consumo por usuario. Solo visible para admin. Incluye tipo de publicación, cantidad, fechas y créditos consumidos por usuario.
  ---
  # HazPost — Panel Admin: Reporte de Publicaciones por Usuario

  ## Qué debe mostrar el admin por usuario
  En la lista de usuarios registrados, el admin debe poder ver:
  1. **Tipo de publicaciones** — Imagen, Historia, Carrusel, Reel
  2. **Cantidad de cada tipo** — conteos individuales
  3. **Fecha de última publicación** — timestamp legible
  4. **Créditos consumidos** — total y desglose por tipo

  ## Acceso
  - Solo visible para usuarios con rol = "admin"
  - Los usuarios normales NUNCA ven datos de otros usuarios

  ## Formato sugerido
  Vista expandible por usuario:
  ```
  Usuario: juan@ejemplo.com | Plan: Negocio | Créditos: 45/220
    Imágenes:   12   Historia: 3   Carrusel: 2   Reels: 1
    Última pub: 13 abr 2026 — Consumido: 37 créditos este mes
  ```

  ## Archivos relevantes
  `artifacts/api-server/src/routes/admin/`
  `artifacts/social-dashboard/src/pages/admin.tsx`
  `lib/db/src/schema/posts.ts`
  `lib/db/src/schema/subscriptions.ts`
  