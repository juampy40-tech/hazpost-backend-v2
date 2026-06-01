# 🚨 SOURCE OF TRUTH — HAZPOST

⚠️ DOCUMENTO OFICIAL DE OWNERSHIP Y SOURCE OF TRUTH

Este documento define:
• qué sistema manda realmente,
• qué componente tiene ownership,
• qué flujo persiste,
• y qué responsabilidades son oficiales en HazPost.

NO asumir runtime.
NO inventar ownership.
Validar siempre comportamiento real.

============================================================
OBJETIVO
========

Evitar:

• múltiples source of truth,
• ownership ambiguo,
• formularios compitiendo,
• persistencia inconsistente,
• lógica duplicada,
• y regressions por arquitectura invisible.

Toda área CORE debe tener:
• ownership claro,
• source of truth clara,
• persistencia clara,
• y flujo definido.

============================================================
ONBOARDING
==========

SOURCE OF TRUTH:

• OnboardingWizard data state.

OWNER PRINCIPAL:

• OnboardingWizard.tsx

RESPONSABILIDADES:

• business profile
• onboarding state
• persistencia onboarding
• branding onboarding
• IA suggestions onboarding

RIESGOS:

• formularios duplicados
• hydration incorrecta
• stale state
• overwrite involuntario
• persistencia parcial

NO HACER:

• crear formularios onboarding paralelos
• crear múltiples ownership
• resetear onboarding desde initialData agresivamente

============================================================
AUTH Y SESIONES
===============

SOURCE OF TRUTH:

• backend auth/session validation

RESPONSABILIDADES:

• login
• sesión activa
• cookies
• autenticación
• protección endpoints privados

REGLAS:

• endpoints privados validan sesión
• frontend privado usa credentials: "include"

============================================================
MULTI-BUSINESS
==============

SOURCE OF TRUTH:

• businessId activo

RESPONSABILIDADES:

• aislamiento branding
• aislamiento onboarding
• aislamiento IA
• aislamiento persistencia
• business switching

### Negocio Activo

Source of truth oficial:

ActiveBusinessContext

No crear estados paralelos de negocio activo en:

- layouts
- sidebars
- pages
- business switchers

Todos los consumidores deben leer:

useActiveBusiness()

para evitar divergencia visual y de contexto.

RIESGOS:

• contaminación entre negocios
• branding cruzado
• IA suggestions mezcladas
• persistencia incorrecta

============================================================
POSTS
=====

SOURCE OF TRUTH:

• persistencia DB + posts pipeline

RESPONSABILIDADES:

• generación posts
• persistencia posts
• imageVariants
• status posts
• approval flow

REGLAS:

• imageVariants nunca null
• posts nunca incompletos
• status siempre válido

============================================================
REGLA FINAL
===========

Nunca modificar áreas CORE sin validar:

• ownership real
• source of truth real
• persistencia real
• runtime real
• y flujo completo del sistema.

============================================================
AUTH + BRAND HYDRATION BRIDGE
=============================

Archivo principal:

• src/contexts/AuthContext.tsx

============================================================
RESPONSABILIDAD
================

Este runtime actualmente controla:

• auth hydration,
• user bootstrap,
• subscription hydration,
• login cleanup,
• logout cleanup,
• query cache reset,
• pending brand persistence,
• y sincronización frontend/backend post-auth.

============================================================
PENDING BRAND PERSISTENCE
=========================

Actualmente existe persistencia temporal vía:

• localStorage

Keys detectadas:

• hz_pending_logo
• hz_pending_color
• hz_pending_website

============================================================
FLOW REAL
==========

Flow actual:

1. usuario anónimo genera branding parcial

2. frontend guarda temporalmente:
   • hz_pending_*

3. login/register ocurre

4. AuthContext detecta user hydration

5. frontend ejecuta:
   • PUT /brand-profile

6. branding persiste finalmente en DB

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• stale pending values,
• branding viejo persistido,
• contaminación multi-business,
• hydration conflictiva,
• overwrite accidental,
• branding cruzado,
• localStorage residual,
• y frontend/backend desincronizado.

============================================================
QUERY CACHE BOUNDARY
====================

queryClient.clear() actualmente funciona como:

• boundary anti-contaminación,
• reset de cache runtime,
• prevención de stale queries,
• y limpieza entre auth sessions.

⚠️ IMPORTANTE

NO remover sin validar:

• login,
• logout,
• business switching,
• onboarding,
• approval queue,
• branding,
• y hydration completa.

============================================================
BRANDING SOURCE OF TRUTH
========================

Documento oficial:

• docs/core/branding-intelligence.md

Prioridad visual oficial:

1. Uploaded logo
2. Referencias visuales reales
3. Website branding
4. IA contextual
5. Defaults neutros

REGLAS:

• Uploaded logo tiene prioridad alta.
• Website colors son heurísticos.
• AI-generated HEX es fallback.
• Nunca persistir branding mediocre automáticamente.
• Nunca mezclar branding entre negocios.
• Nunca usar colores bootstrap/UI accidentales como branding oficial.

============================================================
BRAND ASSETS SOURCE OF TRUTH
============================

Documento oficial:

• docs/core/brand-assets-governance.md

Campos oficiales branding assets:

• brandFont
• brandFontUrl
• customFonts
• logoUrl
• referenceImages
• primaryColor
• secondaryColor

============================================================
CUSTOM FONT GOVERNANCE
======================

`customFonts` representa la biblioteca persistente de tipografías del negocio.

NO debe limpiarse cuando:

• cambia brandFont,
• cambia brandFontUrl,
• se selecciona una fuente catálogo,
• se reabre onboarding,
• se refresca frontend,
• se hidrata business profile.

============================================================
VISUAL ASSET PERSISTENCE
========================

Los assets visuales deben sobrevivir:

• reload,
• refresh,
• reopen onboarding,
• business switching,
• polling,
• hydration frontend/backend,
• y edición de negocio.

Branding incorrecto destruye percepción premium.

Es mejor NO sugerir branding que sugerir branding mediocre.