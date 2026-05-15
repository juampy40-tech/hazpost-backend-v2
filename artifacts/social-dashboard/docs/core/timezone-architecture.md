# 🚨 TIMEZONE ARCHITECTURE — HAZPOST

⚠️ DOCUMENTO OFICIAL DE ZONAS HORARIAS

Archivo principal:

• timezone.ts

============================================================
OBJETIVO
=========

HazPost debe mantener consistencia completa entre:

• frontend,
• backend,
• scheduler,
• calendario,
• drag/drop,
• publishing,
• approval,
• y persistencia DB.

============================================================
SOURCE OF TRUTH
===============

Frontend timezone source of truth:

• timezone.ts

⚠️ IMPORTANTE

NO duplicar lógica timezone fuera de este archivo.

============================================================
TIMEZONES OFICIALES
===================

## ADMIN_TZ

Zona horaria oficial del scheduler backend.

Actualmente:

• America/Bogota

============================================================

## SCHEDULING_TZ

Timezone usada para:

• calendar grouping
• drag/drop IDs
• scheduler consistency

⚠️ IMPORTANTE

Debe coincidir con:

• bogotaDayKey backend

NO usar user timezone aquí.

============================================================

## FALLBACK_TZ

Timezone fallback cuando el usuario no tiene configuración definida.

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• UTC drift,
• posts en día incorrecto,
• drag/drop corrupto,
• scheduling inconsistente,
• hydration conflictiva,
• publish incorrecto,
• render incorrecto,
• frontend/backend mismatch,
• y timezone duplication.

============================================================
REGLAS IMPORTANTES
==================

NO:

• duplicar lógica timezone,
• crear helpers timezone paralelos,
• usar timezone distinta en scheduler,
• usar user timezone para calendar IDs,
• ni modificar conversiones sin validar runtime completo.

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• calendar rendering,
• scheduling,
• publish,
• reload,
• drag/drop,
• approval queue,
• datetime-local inputs,
• persistencia DB,
• frontend/backend consistency,
• y comportamiento cross-timezone.

============================================================
BOUNDARY ARQUITECTÓNICO
=======================

Timezone architecture es un boundary crítico del sistema.

Toda modificación debe:

• preservar consistencia frontend/backend,
• evitar UTC drift,
• mantener scheduler estable,
• y validar runtime real completo.
