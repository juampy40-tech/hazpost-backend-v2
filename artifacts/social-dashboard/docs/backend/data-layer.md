# 🚨 DATA LAYER — HAZPOST

⚠️ DOCUMENTO OFICIAL DE PERSISTENCIA Y SOURCE OF TRUTH

Este documento define:

• ownership real de datos,
• source of truth oficial,
• persistencia backend,
• aislamiento multi-business,
• tablas oficiales,
• riesgos de contaminación,
• compatibilidad legacy,
• y reglas críticas del data layer.

NO asumir persistencia.
NO asumir runtime.
Validar siempre contra PostgreSQL real.

============================================================
ARQUITECTURA GENERAL
====================

HazPost utiliza PostgreSQL como:

• source of truth principal,
• capa oficial de persistencia,
• ownership real de negocio,
• persistencia multi-business,
• persistencia de posts,
• auth persistente,
• y aislamiento entre usuarios.

⚠️ IMPORTANTE

Frontend:
• NO es source of truth.

React state:
• NO es source of truth persistente.

localStorage:
• SOLO cache temporal o hydration auxiliar.

============================================================
SOURCE OF TRUTH OFICIAL
=======================

SOURCE OF TRUTH REAL:

• PostgreSQL

Tablas principales:

• users
• businesses
• posts
• text_blocks
• brand_profiles

============================================================
TABLAS OFICIALES
================

## users

Ownership:
• autenticación,
• roles,
• planes,
• créditos IA,
• timezone,
• email verification.

Fuente oficial de auth persistente.

============================================================

## businesses

⚠️ TABLA MÁS IMPORTANTE MULTI-BUSINESS

Ownership:

• identidad del negocio,
• branding,
• audience,
• tone,
• website,
• logoUrls,
• colors,
• IA context,
• configuración comercial,
• y ownership business-level.

⚠️ IMPORTANTE

Esta tabla representa:

• source of truth multi-business REAL.

NO duplicar ownership fuera de businesses.

============================================================

## posts

Ownership:

• posts generados,
• approval queue,
• business_id,
• status,
• persistencia de generación IA,
• numeración por usuario,
• image variants,
• y estado operativo del contenido.

⚠️ IMPORTANTE

posts.business_id es CRÍTICO para aislamiento multi-business.

============================================================

## text_blocks

Ownership:

• bloques reutilizables,
• textos persistentes,
• snippets dinámicos,
• contenido modular del usuario.

============================================================

## brand_profiles

⚠️ LEGACY COMPATIBILITY LAYER

IMPORTANTE:

brand_profiles parece coexistir parcialmente con businesses.

Riesgo:
• múltiples source of truth,
• contaminación histórica,
• persistencia híbrida,
• hydration conflictiva,
• overwrite accidental.

⚠️ IMPORTANTE

Migraciones futuras deben tender a centralizar ownership en:

• businesses

============================================================
MULTI-BUSINESS ISOLATION
========================

HazPost debe mantener aislamiento ESTRICTO entre:

• usuarios,
• negocios,
• branding,
• posts,
• IA context,
• approval queue,
• onboarding,
• y persistencia visual.

NO mezclar:
• logos,
• audience,
• colores,
• IA suggestions,
• subcategorías,
• ni branding entre negocios.

============================================================
BOUNDARIES IMPORTANTES
======================

Frontend:
• runtime coordinators.

Backend:
• ownership persistente oficial.

PostgreSQL:
• source of truth final.

============================================================
RIESGOS CONOCIDOS
=================

RIESGOS SENSIBLES:

• ownership ambiguo,
• persistencia híbrida,
• coexistencia businesses + brand_profiles,
• stale state frontend,
• hydration conflictiva,
• race conditions,
• overwrite involuntario,
• contaminación multi-business,
• source of truth duplicada,
• y runtime desalineado con DB.

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• persistencia real DB,
• reload,
• refresh,
• business switching,
• multiusuario,
• multi-business,
• approval queue,
• onboarding persistence,
• branding persistence,
• post persistence,
• y runtime real post deploy.

============================================================
ANTI-PATTERNS PROHIBIDOS
========================

NO:

• usar localStorage como source of truth,
• duplicar ownership,
• crear persistencia paralela,
• mezclar branding entre negocios,
• asumir runtime frontend,
• ni bypass de DB oficial.

============================================================
REGLA FINAL
===========

Toda modificación sensible debe:

• respetar ownership,
• respetar source of truth,
• preservar aislamiento multi-business,
• validar runtime real,
• y evitar regresiones estructurales.
