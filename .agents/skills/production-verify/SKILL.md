---
  name: production-verify
  description: Verificar que un cambio de código o DB está activo en producción y aplica correctamente a todos los usuarios y negocios de HazPost. Usar después de cualquier deployment o DB update en producción. Cubre smoke tests, queries multi-tenant, y validación de estado.
  ---

  # Verificación en Producción — HazPost

  ## Cuándo usar esta skill
  - Después de hacer `suggest_deploy` / publicar la app
  - Después de ejecutar un UPDATE/INSERT en la DB de producción
  - Cuando el usuario reporta que "funciona en local pero no en producción"
  - Antes de marcar una tarea como completa si el cambio afecta producción

  ---

  ## 1. Confirmar que el código está en producción

  ### Ver versión desplegada
  Usando fetch_deployment_logs:
  ```
  message: "Server listening|startup|initialized"
  ```
  Confirmar que el timestamp del log es posterior al último commit.

  ### Verificar endpoint clave
  ```bash
  curl -s https://hazpost.app/api/health 2>/dev/null || echo "No health endpoint"
  ```

  ---

  ## 2. Verificar que el cambio aplica a TODOS los usuarios

  ### Query: estado de todos los negocios
  ```sql
  SELECT id, name, user_id, brand_text_style, brand_font, primary_color, secondary_color,
         default_show_signature, is_active
  FROM businesses
  ORDER BY id;
  ```

  ### Query: variantes generadas recientemente (últimas 24h)
  ```sql
  SELECT iv.post_id, p.business_id, b.name as biz_name,
         iv.overlay_text_style, iv.overlay_font,
         iv.overlay_title_color1, iv.overlay_title_color2,
         iv.generation_status, iv.created_at
  FROM image_variants iv
  JOIN posts p ON p.id = iv.post_id
  JOIN businesses b ON b.id = p.business_id
  WHERE iv.created_at > NOW() - INTERVAL '24 hours'
  ORDER BY iv.created_at DESC
  LIMIT 30;
  ```

  ### Query: distribución de estilos por negocio
  ```sql
  SELECT p.business_id, b.name, iv.overlay_text_style, COUNT(*) as cnt
  FROM image_variants iv
  JOIN posts p ON p.id = iv.post_id
  JOIN businesses b ON b.id = p.business_id
  WHERE iv.created_at > NOW() - INTERVAL '7 days'
  GROUP BY p.business_id, b.name, iv.overlay_text_style
  ORDER BY p.business_id, cnt DESC;
  ```

  ---

  ## 3. Smoke tests por tipo de cambio

  ### Si el cambio fue en el FRONTEND (approval.tsx, generate.tsx, etc.)
  - [ ] Abrir https://hazpost.app/approval en Chrome en modo incógnito
  - [ ] Verificar que el cambio visual aparece correctamente
  - [ ] Probar con el negocio ECO (bizId=1) Y con HazPost (bizId=2)
  - [ ] Revisar la consola del browser: no debe haber errores nuevos

  ### Si el cambio fue en el BACKEND (API routes, services)
  ```bash
  # Verificar que el endpoint responde
  curl -s -o /dev/null -w "%{http_code}" https://hazpost.app/api/posts
  # Esperado: 401 (sin auth) — confirma que el servidor está corriendo
  ```

  ### Si el cambio fue en la DB (UPDATE/INSERT en producción)
  ```sql
  -- Confirmar el estado post-update
  SELECT id, name, <campo_modificado>
  FROM <tabla>
  WHERE id = <id_afectado>;
  ```
  Usar `environment: "production"` en executeSql.

  ---

  ## 4. Verificación multi-tenant (crítico)

  Para cambios que afectan a todos los usuarios, verificar al menos 2 negocios distintos:

  ### Listar usuarios activos y sus negocios
  ```sql
  SELECT u.id as user_id, u.email, b.id as biz_id, b.name,
         b.brand_text_style, b.brand_font,
         COUNT(p.id) as total_posts,
         MAX(p.created_at) as last_post
  FROM users u
  JOIN businesses b ON b.user_id = u.id
  LEFT JOIN posts p ON p.business_id = b.id
  GROUP BY u.id, u.email, b.id, b.name, b.brand_text_style, b.brand_font
  ORDER BY last_post DESC NULLS LAST;
  ```
  Usar `environment: "production"`.

  ### Confirmar que el fix aplica a todos
  Para cada usuario activo (con posts en los últimos 7 días), verificar que:
  - El campo modificado tiene el valor correcto
  - No hay datos corruptos o inconsistentes por tenant

  ---

  ## 5. Rollback si algo falla

  ### Código
  - Ir al último checkpoint antes del deploy en Replit
  - O hacer revert del commit específico

  ### DB
  - Si fue un UPDATE, ejecutar el UPDATE inverso en producción:
    ```sql
    UPDATE <tabla> SET <campo> = <valor_anterior> WHERE id = <id>;
    ```
  - NUNCA hacer DELETE de datos de producción sin backup previo

  ---

  ## 6. Confirmación final

  Antes de comunicar al usuario que el cambio está activo:
  - [ ] fetch_deployment_logs no muestra errores nuevos
  - [ ] Query de verificación confirma el estado correcto en producción
  - [ ] Al menos 1 smoke test manual aprobado
  - [ ] Para cambios multi-tenant: verificado con ≥ 2 negocios distintos
  