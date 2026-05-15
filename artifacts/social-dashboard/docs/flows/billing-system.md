# 🚨 BILLING SYSTEM — HAZPOST

⚠️ DOCUMENTO OFICIAL DEL SISTEMA DE BILLING

Este documento define:

• subscriptions,
• credits,
• proration,
• upgrades,
• downgrades,
• billing cart,
• business slots,
• vouchers,
• trials,
• y monetización runtime.

============================================================
OBJETIVO
=========

El billing system existe para:

• monetización SaaS,
• upgrades,
• downgrades,
• consumo IA,
• multi-business,
• trials,
• vouchers,
• y expansión comercial.

============================================================
BOUNDARIES PRINCIPALES
======================

Sistemas principales detectados:

• subscriptions
• billing cart
• credits economy
• proration engine
• vouchers
• trials
• business slots
• downgrade scheduler
• reactivation flow

============================================================
SOURCE OF TRUTH
===============

Persistencia oficial:

• backend billing endpoints
• PostgreSQL billing persistence

Frontend:
• runtime hydration únicamente.

============================================================
SISTEMAS SENSIBLES
==================

Áreas críticas:

• creditsRemaining
• creditsTotal
• proration
• scheduled downgrade
• business slot allocation
• cart persistence
• checkout
• trials
• vouchers
• business reactivation

============================================================
PRORATION ENGINE
================

Endpoints importantes:

• /api/billing/prorate-upgrade
• /api/billing/apply-free-proration

⚠️ IMPORTANTE

Toda modificación debe validar:

• créditos,
• ciclo activo,
• upgrade timing,
• y consistencia financiera.

============================================================
BUSINESS SLOT SYSTEM
====================

HazPost actualmente soporta:

• negocios activos
• negocios inactivos
• reactivación
• slots adicionales monetizados

⚠️ IMPORTANTE

Negocios inactivos:
• NO deben perder información.

============================================================
CREDITS ECONOMY
================

Sistema actual:

• créditos mensuales
• créditos adicionales
• costos por tipo contenido
• consumo runtime

Tipos detectados:

• image
• reel
• carousel
• story

============================================================
BILLING CART
============

BillingCart actualmente soporta:

• plan upgrades
• extra slots
• credit packs
• reactivaciones

============================================================
VOUCHERS + TRIALS
=================

Sistema actual soporta:

• trials temporales
• bonus credits
• vouchers
• códigos promocionales

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• cálculo financiero incorrecto,
• stale billing state,
• credits inconsistentes,
• downgrade corrupto,
• business slots inconsistentes,
• trials incorrectos,
• hydration conflictiva,
• race conditions,
• y persistencia parcial.

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• checkout,
• upgrade,
• downgrade,
• proration,
• reload,
• refresh,
• credits,
• vouchers,
• trials,
• business reactivation,
• y persistencia DB.

============================================================
REGLAS IMPORTANTES
==================

NO:

• hardcodear pricing,
• duplicar cálculos billing,
• modificar créditos sin validar persistencia,
• romper proration,
• ni asumir frontend como source of truth.

============================================================
REGLA FINAL
===========

Billing system es uno de los boundaries comerciales más sensibles de HazPost.

Toda modificación debe:

• preservar consistencia financiera,
• mantener persistencia correcta,
• evitar pérdida de negocios,
• y validar runtime real completo.
