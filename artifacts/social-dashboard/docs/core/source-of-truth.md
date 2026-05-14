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
