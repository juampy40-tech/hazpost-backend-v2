# Repository Active Systems Map

⚠️ IMPORTANTE

HazPost actualmente contiene múltiples sistemas y estructuras dentro del mismo repositorio.

NO asumir que todos los directorios representan sistemas activos principales.

Antes de modificar:
• validar qué sistema está activo,
• validar ownership,
• validar deploy real,
• y validar qué runtime usa producción.

============================================================
ACTIVE PRODUCTION SYSTEMS
=========================

## Frontend principal (ACTIVO)

Ruta:
artifacts/social-dashboard/

Stack:
• React
• Vite
• TypeScript

Responsabilidad:
• dashboard principal
• onboarding
• generación IA
• approval queue
• multi-business
• brand profile
• UX principal del usuario

Deploy:
• Vercel

⚠️ IMPORTANTE
La mayoría del frontend productivo actual vive aquí.

============================================================

## Backend principal (ACTIVO)

Ruta:
hazpost-backend/

Stack:
• Python
• Flask
• Gunicorn

Responsabilidad:
• APIs principales
• auth
• business data
• IA
• persistence
• uploads
• onboarding backend
• runtime business logic

Deploy:
• Railway

============================================================
AUXILIARY / NON-PRIMARY SYSTEMS
===============================

## API Server auxiliar

Ruta:
artifacts/api-server/

⚠️ IMPORTANTE

Este sistema NO representa necesariamente el frontend/backend principal activo de producción.

Puede contener:
• pruebas,
• sistemas auxiliares,
• prototipos,
• APIs legacy,
• o experimentos internos.

Antes de modificar:
• validar si realmente está conectado al runtime productivo,
• validar deploy real,
• validar imports reales,
• y validar tráfico real.

============================================================
REGLAS IMPORTANTES
==================

NO asumir:

• ownership,
• runtime,
• deploy,
• o criticidad

solo por el nombre de carpetas o archivos.

Siempre validar:

• imports reales,
• deploy real,
• Vercel,
• Railway,
• Network F12,
• logs reales,
• y tráfico/runtime real.

============================================================
RIESGO ARQUITECTÓNICO
=====================

Modificar accidentalmente sistemas no principales puede causar:

• debugging incorrecto,
• documentación incorrecta,
• fixes aplicados al sistema equivocado,
• duplicación de lógica,
• regresiones invisibles,
• y pérdida de tiempo significativa.

============================================================
FILOSOFÍA
=========

HazPost debe evolucionar hacia:

• ownership claro,
• boundaries visibles,
• source of truth explícita,
• arquitectura modular,
• y separación clara entre sistemas activos y auxiliares.
