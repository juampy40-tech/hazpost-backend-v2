# 🚨 ONBOARDING FLOW — HAZPOST

⚠️ DOCUMENTO OPERATIVO OFICIAL DEL ONBOARDING

Este documento define:

* flujo real del onboarding,
* ownership,
* source of truth,
* persistencia,
* riesgos,
* componentes sensibles,
* y reglas obligatorias antes de modificar onboarding.

NO resumir agresivamente.
NO asumir comportamiento.
Validar siempre runtime real.

============================================================
OBJETIVO DEL ONBOARDING
=======================

El onboarding existe para:

• crear perfil de negocio útil,
• alimentar correctamente la IA,
• generar branding coherente,
• personalizar contenido futuro,
• mejorar generación IA,
• facilitar generación de posts,
• y ayudar al usuario a obtener resultados reales.

El onboarding NO debe sentirse:
• pesado,
• técnico,
• confuso,
• ni largo.

Debe sentirse:
• fácil,
• rápido,
• premium,
• inteligente,
• y emocional.

============================================================
SOURCE OF TRUTH
===============

SOURCE OF TRUTH PRINCIPAL:

• OnboardingWizard data state.

NO crear:
• múltiples estados compitiendo,
• formularios paralelos,
• ni duplicación de ownership.

============================================================
COMPONENTES IMPORTANTES
=======================

COMPONENTE PRINCIPAL:

• OnboardingWizard.tsx

COMPONENTES RELACIONADOS:

• Step1
• Step2
• branding flow
• analyze flow
• business persistence flow

⚠️ IMPORTANTE

Validar siempre:
• cuál componente está ACTIVO realmente,
• cuál renderiza realmente,
• y cuál persiste realmente.

NO asumir runtime.

============================================================
PERSISTENCIA
============

El onboarding debe persistir correctamente:

• business profile,
• branding,
• IA suggestions,
• industry,
• subcategories,
• tone,
• colors,
• audience,
• website,
• logoUrls,
• y configuraciones relacionadas.

Validar siempre:

• save,
• refresh,
• reload,
• reopen,
• business switching,
• hydration,
• y persistencia real en DB.

============================================================
RIESGOS CONOCIDOS
=================

RIESGOS SENSIBLES:

• ownership ambiguo,
• múltiples source of truth,
• hydration incorrecta,
• stale state,
• overwrite involuntario,
• analyze agresivo,
• persistencia parcial,
• contaminación multi-business,
• branding cruzado,
• race conditions,
• reset desde initialData,
• y formularios duplicados.

============================================================
NO TOCAR SIN VALIDAR
====================

NO modificar sin validar flujo completo:

• analyze flow
• branding persistence
• overwrite protection
• business switching
• hydration
• save/reopen
• source of truth onboarding
• persistencia IA
• logoUrls handling

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios onboarding validar:

• creación negocio nueva,
• edición negocio existente,
• refresh,
• reload,
• business switching,
• persistencia DB,
• IA suggestions,
• branding,
• multiusuario,
• multi-business,
• save/reopen,
• y comportamiento post deploy.

============================================================
ANTI-PATTERNS PROHIBIDOS
========================

NO:

• duplicar formularios onboarding,
• crear múltiples source of truth,
• asumir qué componente está activo,
• resetear state agresivamente,
• crear persistencia paralela,
• hacer fixes visuales sin validar runtime,
• ni modificar onboarding sin revisar flujo completo.

============================================================
REGLA FINAL
===========

El onboarding es uno de los sistemas más sensibles de HazPost.

Toda modificación debe:
• preservar estabilidad,
• mantener ownership claro,
• evitar regresiones,
• respetar source of truth,
• y validar runtime real completo.

============================================================
ONBOARDING SOURCE OF TRUTH
==========================

## State writers

## Runtime hydration

## AI suggestion ingestion

## Backend persistence flow

## Business creation flow

## Brand profile persistence

## LocalStorage temporary persistence

## Active business detection

## Risk areas

## Sensitive effects

## Multi-business contamination risks

## Ownership rules

============================================================
INDUSTRY CATALOG SYSTEM
=======================

Archivo principal:

• industryCatalog.ts

============================================================
RESPONSABILIDAD
================

Este sistema actualmente controla:

• catálogo de industrias,
• subcategorías onboarding,
• caché frontend industrias,
• hydration onboarding,
• AI onboarding context,
• y suggestions de nuevas industrias.

============================================================
SOURCE OF TRUTH
===============

Source of truth oficial:

• backend /api/industries

Frontend utiliza:

• memory cache
• localStorage cache

⚠️ IMPORTANTE

Frontend cache:
• NO es source of truth definitivo.

============================================================
CACHE ARCHITECTURE
==================

Actualmente existe:

• memory cache runtime
• localStorage cache persistente
• TTL invalidation

Cache key:

• hz_industry_catalog_v1

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• catálogo stale,
• subcategorías incorrectas,
• onboarding inconsistente,
• IA context incorrecto,
• hydration conflictiva,
• cache inválido,
• y branding incorrecto desde onboarding.

============================================================
REGLAS IMPORTANTES
==================

NO:

• duplicar catálogo industrias,
• crear fetch paralelo industrias,
• usar subcategorías hardcodeadas inconsistentes,
• ni romper TTL invalidation.

============================================================
SUGGESTION FLOW
================

sendIndustrySuggestion():

• NO debe bloquear onboarding,
• funciona como feedback incremental,
• y permite evolución futura del catálogo.
