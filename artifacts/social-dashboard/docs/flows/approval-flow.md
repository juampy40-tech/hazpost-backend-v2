# 🚨 APPROVAL FLOW — HAZPOST

⚠️ DOCUMENTO OPERATIVO OFICIAL DEL SISTEMA DE APPROVAL

Este documento define:

• lifecycle real de posts,
• ownership,
• source of truth,
• polling,
• variants,
• persistencia,
• scheduling,
• publish flow,
• riesgos,
• componentes sensibles,
• y reglas obligatorias antes de modificar approval queue.

NO asumir runtime.
Validar siempre frontend + backend real.

============================================================
ARCHIVOS PRINCIPALES
====================

FRONTEND PRINCIPAL:

• artifacts/social-dashboard/src/pages/approval.tsx

FRONTEND RELACIONADOS:

• useBusinessPosts
• post editor
• variants editor
• image retry flow
• scheduling UI
• polling hooks
• overlay editor
• caption editor
• publish controls

BACKEND RELACIONADO:

• endpoints generate
• endpoints retry image
• posts persistence
• imageVariants persistence
• scheduling endpoints
• publish endpoints

⚠️ IMPORTANTE

Validar siempre:
• cuál flujo está ACTIVO realmente,
• cuál persiste realmente,
• y cuál renderiza realmente.

NO asumir runtime.

============================================================
OBJETIVO DEL SISTEMA
====================

El approval flow existe para:

• revisar posts IA,
• editar contenido,
• aprobar publicaciones,
• regenerar imágenes,
• manejar variantes,
• programar publicaciones,
• y publicar contenido real.

Debe sentirse:

• rápido,
• estable,
• premium,
• claro,
• y confiable.

NO debe sentirse:

• ambiguo,
• lento,
• roto,
• inconsistente,
• ni impredecible.

============================================================
SOURCE OF TRUTH
===============

SOURCE OF TRUTH PRINCIPAL:

• posts state runtime
• backend persisted posts
• imageVariants persistidas

⚠️ IMPORTANTE

imageVariants:
• nunca debe ser null,
• nunca debe desaparecer,
• y siempre debe persistirse correctamente.

============================================================
SISTEMAS SENSIBLES
==================

SISTEMAS CRÍTICOS:

• polling
• retry image
• variants
• overlays
• scheduling
• optimistic updates
• hydration
• refresh posts
• publishing
• drag/drop ordering
• modal state
• approval persistence

============================================================
RIESGOS CONOCIDOS
=================

RIESGOS SENSIBLES:

• polling duplicado,
• race conditions,
• stale posts,
• imageVariants null,
• persistencia parcial,
• hydration incorrecta,
• optimistic overwrite,
• loaders infinitos,
• refresh agresivo,
• contaminación entre businesses,
• modals inconsistentes,
• scheduling corrupto,
• y estados ambiguos.

============================================================
NO TOCAR SIN VALIDAR
====================

NO modificar sin validar:

• polling flow
• retry image flow
• imageVariants persistence
• scheduling persistence
• approval persistence
• post lifecycle
• refresh logic
• modal ownership
• hydration
• optimistic updates

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• generación nueva,
• refresh,
• reload,
• retry image,
• polling,
• persistencia DB,
• imageVariants,
• scheduling,
• publish,
• multi-business,
• multiusuario,
• overlays,
• captions,
• y comportamiento post deploy.

============================================================
ANTI-PATTERNS PROHIBIDOS
========================

NO:

• duplicar polling,
• crear múltiples source of truth,
• hacer refresh agresivo,
• resetear posts runtime,
• crear estados paralelos inconsistentes,
• hacer fixes visuales sin validar persistencia,
• ni modificar approval flow sin revisar lifecycle completo.

============================================================
POST LIFECYCLE
===============

generate
→ processing
→ variants
→ approval
→ scheduling
→ publish

============================================================
APPROVAL SOURCE OF TRUTH
========================

## Polling ownership

## Runtime hydration

## Retry image flow

## imageVariants persistence

## Scheduling persistence

## Publish flow

## Overlay ownership

## Modal ownership

## Optimistic updates

## Risk areas

## Sensitive effects

## Multi-business contamination risks

## Ownership rules

============================================================
BUSINESS QUERY ISOLATION
========================

Archivo principal:

• useBusinessPosts.ts

============================================================
RESPONSABILIDAD
================

Este hook actualmente controla:

• aislamiento multi-business de posts,
• inyección obligatoria de businessId,
• hydration gating,
• prevención de queries sin contexto,
• y protección anti-contaminación runtime.

============================================================
SOURCE OF TRUTH
===============

Toda query de posts debe depender de:

• businessId válido
• ActiveBusinessContext
• hydration correcta

⚠️ IMPORTANTE

NO usar queries globales ambiguas.

============================================================
HYDRATION GATING
================

Actualmente utiliza:

• enabled: loaded

Esto evita:

• requests prematuros,
• hydration incompleta,
• businessId undefined,
• stale renders,
• flashes incorrectos,
• y contaminación multi-business.

============================================================
REGLA IMPORTANTE
================

⚠️ IMPORTANTE

NO usar:

• useGetPosts directamente

en páginas runtime sensibles.

Debe utilizarse:

• useBusinessPosts()

============================================================
RIESGOS IMPORTANTES
===================

Romper este hook puede causar:

• contaminación multi-business,
• posts cruzados,
• stale hydration,
• polling inconsistente,
• requests inválidos,
• approval incorrecto,
• y runtime desincronizado.

============================================================
ANTI-PATTERNS
==============

NO:

• cargar posts sin businessId,
• usar queries globales ambiguas,
• saltarse hydration gating,
• ni bypass de ActiveBusinessContext.
