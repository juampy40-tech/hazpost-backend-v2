---
  name: cross-business-contamination
  description: Detecta y diagnostica contaminación de datos de marca (colores, logo, firma) entre negocios distintos de un mismo usuario. Usa cuando los posts de un negocio aparecen con la identidad visual de otro negocio del mismo usuario.
  ---

  # Skill: Detector de Contaminación Entre Negocios

  ## Propósito
  Diagnosticar sistemáticamente si los datos de marca de un negocio están contaminando a otro negocio del mismo usuario. Los síntomas típicos son: colores equivocados en imágenes, logo del negocio incorrecto, firma/tagline del negocio A aparece en posts del negocio B.

  ## Cuándo activar este skill
  - El usuario reporta que los posts del negocio B tienen los colores/logo/firma del negocio A
  - Se detecta que `brand_profiles` (perfil legacy) contamina a las businesses configuradas
  - Después de refactors en `generateImagesForPostsBg`, `generateExtraPosts` o los route handlers de generación

  ---

  ## Protocolo de diagnóstico (paso a paso)

  ### Paso 1 — Identificar los negocios del usuario afectado

  ```sql
  -- Listar negocios del usuario con sus colores y logo
  SELECT id, name, primary_color, secondary_color, logo_url, default_location, is_default
  FROM businesses
  WHERE user_id = <userId>
  ORDER BY sort_order;

  -- Ver el perfil legacy (brand_profiles) del mismo usuario
  SELECT company_name, primary_color, secondary_color, logo_url, city, website
  FROM brand_profiles
  WHERE user_id = <userId>;
  ```

  Si los colores/logo de `brand_profiles` coinciden con lo que aparece en las imágenes del negocio equivocado → **contaminación por fallback legacy confirmada**.

  ### Paso 2 — Revisar los posts recientes del negocio afectado

  ```sql
  -- Posts recientes del negocio B (el que recibe contaminación)
  SELECT p.id, p.business_id, p.user_id, p.status, p.created_at,
         iv.overlay_caption_hook, iv.overlay_text_style
  FROM posts p
  LEFT JOIN image_variants iv ON iv.post_id = p.id AND iv.variant_index = 0
  WHERE p.business_id = <bizIdB>
  ORDER BY p.created_at DESC
  LIMIT 10;
  ```

  Si `overlay_text_style` o los datos de marca en las variantes no corresponden al negocio B → contaminación en imagen confirmada.

  ### Paso 3 — Verificar el punto de pérdida de businessId

  En `ai.service.ts`, buscar TODOS los `imageJobs.push({...` y confirmar que incluyan `businessId`:

  ```bash
  grep -n "imageJobs.push" artifacts/api-server/src/services/ai.service.ts
  # Para cada push, verificar que tenga: businessId: businessId ?? undefined
  ```

  En `posts.ts`, verificar los spreads de jobs:
  ```bash
  grep -n "taggedBulkJobs\|taggedExtraJobs\|imageJobs.map" artifacts/api-server/src/routes/social/posts.ts
  # Para cada .map, verificar que tenga: businessId: bulkBizId ?? undefined
  ```

  ### Paso 4 — Rastrear el flujo businessId en generateImagesForPostsBg

  En `generateImagesForPostsBg`, la clave del Map es `makeJobKey(job.userId, job.businessId)`. Si `job.businessId` es `undefined`, la clave queda como `"<userId>:"` y el sistema usa `brand_profiles` (legacy), retornando datos del primer negocio del usuario.

  Verificar función `makeJobKey`:
  ```typescript
  const makeJobKey = (uid?: number, bizId?: number) => `${uid ?? ""}:${bizId ?? ""}`;
  // Si bizId es undefined → "1:" → fallback a brand_profiles
  ```

  ### Paso 5 — Test de regresión manual

  1. Abrir la app como el usuario afectado
  2. Seleccionar el Negocio B en el panel
  3. Generar 1 post (platform="both")
  4. Verificar en la cola de aprobación que:
     - Los colores de la imagen corresponden a Negocio B
     - El logo es de Negocio B
     - La firma/tagline corresponde a Negocio B
  5. Verificar en logs del servidor:
     `[generateImagesForPostsBg]` → confirmar que `jobKey` incluye el bizId correcto

  ---

  ## Puntos del código a monitorear

  ### Puntos de riesgo (donde businessId puede perderse)

  | Archivo | Línea aprox. | Riesgo |
  |---------|-------------|--------|
  | `ai.service.ts` | `generateExtraPosts` "both" path | Puede omitir businessId en imageJobs.push |
  | `posts.ts` | `taggedBulkJobs.map` | Puede omitir businessId al spreade |
  | `posts.ts` | `taggedExtraJobs.map` | Puede omitir businessId al spread |
  | `ai.service.ts` | `generateImagesForPostsBg` preload | makeJobKey con bizId=undefined → fallback legacy |

  ### Función clave para diagnóstico de fallback
  ```typescript
  // En resolveBrandColor y resolveBrandTagline:
  // Si businessId != null → lee de businessesTable ✅
  // Si businessId == null/undefined → lee de brandProfilesTable ← AQUÍ está el fallback peligroso
  ```

  ---

  ## Fix estándar

  Si se detecta contaminación, aplicar TODOS los siguientes cambios:

  ### Fix 1 — imageJobs.push en modo "both" de generateExtraPosts
  ```typescript
  // ANTES (faltan userId/businessId):
  imageJobs.push({ postId: post.id, nicheContextShort, captionHook, contentType, ... });

  // DESPUÉS:
  imageJobs.push({
    postId: post.id,
    userId: userId ?? undefined,
    businessId: businessId ?? undefined,
    nicheContextShort, captionHook, contentType, ...
  });
  ```

  ### Fix 2 — Route handlers en posts.ts
  ```typescript
  // taggedBulkJobs — agregar businessId:
  const taggedBulkJobs = imageJobs.map(j => ({
    ...j,
    userId: uid,
    businessId: bulkBizId ?? undefined,   // ← agregar
    ...(bulkRefStyle && !j.imageScene ? { batchRefStyle: bulkRefStyle } : {}),
  }));

  // taggedExtraJobs — agregar businessId:
  const taggedExtraJobs = imageJobs.map(j => ({
    ...j,
    userId: uid,
    businessId: extraBizId ?? undefined,  // ← agregar
    ...(extraRefStyle && !j.imageScene ? { batchRefStyle: extraRefStyle } : {}),
  }));
  ```

  ### Fix 3 — Fix defensivo en generateImagesForPostsBg
  En la fase de pre-carga, si un job tiene `userId` definido pero `businessId` undefined, hacer lookup de businessId desde postsTable:
  ```typescript
  // Después de construir uniqueJobPairs, resolver businessIds faltantes desde DB:
  const missingBizPairs = uniqueJobPairs.filter(p => p.businessId == null && p.userId != null);
  if (missingBizPairs.length > 0) {
    const postIdsForMissing = jobs
      .filter(j => j.businessId == null && j.userId != null)
      .map(j => j.postId);
    const postRows = await db
      .select({ id: postsTable.id, businessId: postsTable.businessId })
      .from(postsTable)
      .where(inArray(postsTable.id, postIdsForMissing));
    for (const row of postRows) {
      const job = jobs.find(j => j.postId === row.id);
      if (job && row.businessId) job.businessId = row.businessId;
    }
    // Reconstruir uniqueJobPairs con los businessIds corregidos
  }
  ```

  ---

  ---

  ## Vector adicional: Nichos contaminados (NI-1)

  ### Síntoma
  Un usuario con múltiples negocios (ej. vidrios/ventanas + energía solar) recibe sugerencias de nichos del negocio equivocado. El negocio de vidrios recibe nichos de energía solar y viceversa.

  ### Causa raíz
  `suggestNichesForUser` en `ai.service.ts` leía el contexto de marca de `brandProfilesTable` (un registro por usuario, no por negocio). Al ser un perfil legacy compartido, la industria/descripción/audiencia reflejaba el negocio con el que el usuario completó el onboarding, contaminando la IA para todos los demás negocios.

  ### Fix aplicado (Task #273)
  La función ahora acepta un `businessId?: number` opcional y lee contexto de `businessesTable`:
  - **Con businessId** → WHERE id = businessId AND userId = userId (exactamente ese negocio)
  - **Sin businessId** → WHERE userId = userId AND isDefault = true (negocio por defecto)

  El endpoint `POST /api/niches/suggest` acepta `{ businessId?: number }` en el body y lo pasa a la función. El frontend (`niches.tsx`) obtiene el negocio activo vía `GET /api/businesses` y lo envía al endpoint.

  ### Archivos afectados
  | Archivo | Cambio |
  |---------|--------|
  | `ai.service.ts` | `suggestNichesForUser(userId, businessId?)` — lee de `businessesTable` en vez de `brandProfilesTable` |
  | `routes/social/niches.ts` | `POST /api/niches/suggest` lee `req.body.businessId` y lo pasa |
  | `social-dashboard/src/pages/niches.tsx` | Hook `useActiveBusinessId()` + envía `businessId` en el fetch |

  ### Diagnóstico rápido
  ```sql
  -- Confirmar que el negocio tiene industria configurada
  SELECT id, name, industry, description, audience_description
  FROM businesses
  WHERE user_id = <userId>;

  -- Si industry/description están vacíos aquí pero rellenos en brand_profiles,
  -- el onboarding no sincronizó correctamente → revisar el mirror call en brand-profile.ts
  ```

  ---

  ## Criterios de aceptación (cuándo el problema está resuelto)

  - [ ] Negocio A y Negocio B del mismo usuario generan posts con identidades visuales completamente distintas
  - [ ] Los colores de las imágenes corresponden al negocio para el que se generaron
  - [ ] El logo en las imágenes corresponde al negocio correcto
  - [ ] La firma/tagline en las imágenes corresponde al negocio correcto
  - [ ] El test manual (paso 5 del protocolo) pasa para todos los negocios del usuario afectado
  - [ ] Los nichos sugeridos (IA) corresponden a la industria del negocio activo, no de otro negocio del mismo usuario
  - [ ] API build sin errores TypeScript
  - [ ] No hay regresión en generación para usuarios con un solo negocio
  