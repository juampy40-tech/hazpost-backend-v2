# 🚨 BRAND PROFILE FLOW — HAZPOST

⚠️ DOCUMENTO OPERATIVO OFICIAL DEL BRAND PROFILE

Este documento define:

• ownership del perfil de negocio,
• branding runtime,
• source of truth,
• persistencia,
• business isolation,
• AI context,
• uploads,
• hydration,
• riesgos,
• componentes sensibles,
• y reglas obligatorias antes de modificar branding/profile.

NO asumir runtime.
Validar siempre frontend + backend real.

============================================================
OBJETIVO DEL BRAND PROFILE
==========================

El brand profile existe para:

• definir identidad del negocio,
• alimentar correctamente la IA,
• mantener coherencia visual,
• personalizar captions,
• personalizar hooks,
• personalizar branding,
• generar contenido más humano,
• y evitar generación genérica.

El brand profile NO debe sentirse:

• técnico,
• complejo,
• inconsistente,
• ni ambiguo.

Debe sentirse:

• claro,
• premium,
• rápido,
• coherente,
• y confiable.

============================================================
ARCHIVOS PRINCIPALES
====================

FRONTEND PRINCIPAL:

• profile.tsx

FRONTEND RELACIONADOS:

• ActiveBusinessContext
• onboarding branding flow
• AI suggestion ingestion
• branding persistence
• logo upload flow
• visual identity flow

BACKEND RELACIONADO:

• brand profile endpoints
• business endpoints
• upload endpoints
• AI context endpoints
• persistence DB

⚠️ IMPORTANTE

Validar siempre:
• cuál flujo está ACTIVO realmente,
• cuál persiste realmente,
• y cuál renderiza realmente.

NO asumir runtime.

============================================================
SOURCE OF TRUTH
===============

SOURCE OF TRUTH PRINCIPAL:

• active business profile runtime
• backend persisted business data
• ActiveBusinessContext

NO crear:

• múltiples brand states,
• branding paralelo,
• persistencia duplicada,
• ni ownership ambiguo.

============================================================
BUSINESS ISOLATION
==================

CRÍTICO:

Cada business debe mantener aislamiento completo de:

• branding,
• tone,
• audience,
• logos,
• colors,
• prompts,
• AI context,
• website,
• description,
• y assets visuales.

⚠️ NUNCA mezclar branding entre businesses.

============================================================
AI CONTEXT
===========

El brand profile alimenta:

• generación IA,
• captions,
• hooks,
• tono,
• branding,
• overlays,
• prompts,
• y comportamiento contextual de la IA.

⚠️ IMPORTANTE

Si el brand profile falla:
• la IA puede volverse genérica,
• inconsistente,
• o contaminada.

============================================================
PERSISTENCIA
============

El sistema debe persistir correctamente:

• tone,
• audience,
• colors,
• website,
• logos,
• description,
• industry,
• subcategories,
• branding assets,
• y configuraciones relacionadas.

Validar siempre:

• save,
• refresh,
• reload,
• hydration,
• business switching,
• y persistencia real DB.

============================================================
UPLOADS Y ASSETS
================

SISTEMAS SENSIBLES:

• logo uploads
• asset persistence
• object storage
• runtime hydration
• asset ownership
• preview rendering

⚠️ IMPORTANTE

Los assets:
• nunca deben cruzarse entre businesses,
• nunca deben perder ownership,
• y deben persistirse correctamente.

============================================================
RIESGOS CONOCIDOS
=================

RIESGOS SENSIBLES:

• branding cruzado,
• contaminación multi-business,
• hydration incorrecta,
• stale state,
• ownership ambiguo,
• overwrite involuntario,
• persistencia parcial,
• uploads huérfanos,
• AI context inconsistente,
• race conditions,
• y múltiples source of truth.

============================================================
NO TOCAR SIN VALIDAR
====================

NO modificar sin validar:

• ActiveBusinessContext
• branding persistence
• logo upload flow
• AI context
• hydration
• business switching
• profile save flow
• onboarding integration
• runtime branding state

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• creación business nueva,
• edición business existente,
• refresh,
• reload,
• hydration,
• business switching,
• branding persistido,
• logos,
• IA context,
• multi-business,
• multiusuario,
• uploads,
• y comportamiento post deploy.

============================================================
ANTI-PATTERNS PROHIBIDOS
========================

NO:

• duplicar branding state,
• crear múltiples source of truth,
• asumir active business incorrectamente,
• hidratar branding agresivamente,
• mezclar branding entre businesses,
• hacer fixes visuales sin validar persistencia,
• ni modificar branding sin revisar aislamiento completo.

============================================================
BRAND PROFILE SOURCE OF TRUTH
=============================

## ActiveBusinessContext ownership

## Runtime hydration

## AI context ownership

## Branding persistence

## Logo uploads ownership

## Asset persistence

## Business switching flow

## Risk areas

## Sensitive effects

## Multi-business contamination risks

## Ownership rules
