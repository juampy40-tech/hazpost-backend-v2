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
ANALYZE WEBSITE + BUSINESS CREATION FLOW
============================================================

PROBLEMA DETECTADO
==================

Se detectó un problema crítico:

❌ onboarding creaba businesses prematuramente
antes de finalizar el wizard.

Esto generaba:

• consumo incorrecto de slots,
• duplicados,
• contaminación multi-business,
• businesses basura,
• persistencia accidental,
• y análisis IA asociados incorrectamente.

============================================================
FIX IMPLEMENTADO
================

Se desacopló completamente:

• analyzeWebsite
de
• createBusiness

Ahora:

STEP 0:
✅ analyze website
✅ sugerencias IA
❌ NO crea business

FINAL DEL ONBOARDING:
✅ recién ahí crea business REAL

============================================================
VALIDACIÓN REAL
================

Validado en Railway logs:

✅ POST /api/analyze-website
❌ sin POST /api/businesses prematuro

============================================================
REGLA OBLIGATORIA
=================

AnalyzeWebsite:

• nunca debe persistir DB
• nunca debe crear business
• nunca debe consumir slots
• solo debe generar sugerencias temporales UX

Persistencia REAL:

• solamente al finalizar onboarding completo

============================================================
PENDIENTE ACTUAL
================

Existe aún un fallback visual frontend:

"Tu negocio es un negocio de productos y servicios..."

aparece antes de finalizar analyze.

IMPORTANTE:

❌ NO es backend
❌ NO crea businesses
❌ NO contamina DB

Es solamente:

⚠️ fallback UX/frontend en OnboardingWizard.tsx

OBJETIVO:

ANTES de analyze:
✅ loading real
✅ skeleton
✅ estado vacío

NUNCA:
❌ descripción fake genérica
❌ placeholders persistentes IA

============================================================
WEBSITE CONTENT CONTEXTUAL ANALYSIS
============================================================

El onboarding analyze ahora utiliza:

• website scraping MVP,
• title extraction,
• meta description,
• headings,
• paragraphs,
• y website_content contextual.

Objetivo:

• reducir respuestas genéricas,
• detectar mejor el negocio real,
• mejorar branding contextual,
• mejorar audience,
• mejorar tone,
• y reducir industrias incorrectas.

⚠️ IMPORTANTE

Actualmente:
• website_content YA participa en runtime real onboarding.
• scraping YA afecta respuestas IA.
• WebsiteAnalysisService YA participa parcialmente en analyze runtime.

LIMITACIONES ACTUALES:

❌ todavía NO existe extracción visual real,
❌ NO existe color extraction desde logos,
❌ NO existe favicon palette extraction,
❌ NO existe CSS branding extraction.

Actualmente los colores siguen siendo:
⚠️ parcialmente inferidos por IA.

============================================================
INDUSTRY CATALOG SYSTEM
=======================

Archivo principal:

• artifacts/api-server/src/lib/industries.ts

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

============================================================
BUSINESS OWNERSHIP REFACTOR (MAYO 2026)
============================================================

PROBLEMA DETECTADO
==================

Existía ownership ambiguo entre:

• register.tsx
• OnboardingWizard.tsx

Ambos podían crear businesses.

Esto generaba riesgo de:

• duplicados,
• contaminación multi-business,
• lifecycle inconsistente,
• ownership confuso,
• y persistencia accidental.

============================================================
FIX IMPLEMENTADO
================

Nuevo ownership oficial:

• register.tsx
→ ownership principal creación business inicial.

• businesses.tsx
→ ownership creación/edición manual business.

• OnboardingWizard.tsx
→ onboarding UI + fallback legacy controlado.

============================================================
REGLA OBLIGATORIA
=================

NO volver a mover ownership business
sin validar lifecycle completo:

• register
• onboarding
• businesses
• settings
• profile
• dashboard
• multi-business
• hydration
• persistencia DB
• y runtime post deploy.

============================================================
VALIDACIÓN REAL
================

Validado correctamente:

✅ registro nuevo
✅ onboarding completo
✅ analyze website
✅ persistencia branding
✅ business activo
✅ no duplicados
✅ reload
✅ refresh
✅ multi-business estable

============================================================
INDUSTRY SYSTEM — SOURCE OF TRUTH
============================================================

Source of truth oficial industrias:

• artifacts/api-server/src/lib/industries.ts

El catálogo onboarding NO debe:

❌ duplicarse frontend/backend
❌ hardcodearse en formularios
❌ divergir entre onboarding/profile/businesses

Todo onboarding debe consumir:

• GET /api/industries

============================================================
PENDIENTE SIGUIENTE FASE
========================

FASE INDUSTRY SYSTEM:

• completar industrias faltantes,
• mejorar subindustrias,
• ordenar industrias A-Z,
• limpiar duplicados,
• mejorar aiContext,
• mejorar UX onboarding,
• searchable industry selector futuro (UX premium),
• y mejorar IA contextual orientada a ventas y conversión.

============================================================
REGLA UX + IA
=============

Las industrias NO existen solamente para clasificar negocios.

El objetivo real es:

• mejorar captions,
• mejorar hooks,
• mejorar CTAs,
• mejorar segmentación,
• mejorar contenido IA,
• mejorar anuncios,
• mejorar conexión emocional,
• y ayudar negocios reales a conseguir clientes.