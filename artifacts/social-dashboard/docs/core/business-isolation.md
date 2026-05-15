# 🚨 BUSINESS ISOLATION — HAZPOST

⚠️ DOCUMENTO OFICIAL DE AISLAMIENTO MULTI-BUSINESS

Este documento define:

• aislamiento entre negocios,
• ownership de business data,
• source of truth multi-business,
• riesgos de contaminación,
• persistencia correcta,
• hydration segura,
• y reglas obligatorias para evitar mezcla de datos.

============================================================
OBJETIVO
=========

Cada negocio debe comportarse como una entidad completamente aislada.

HazPost NO debe:

• mezclar branding,
• mezclar IA,
• mezclar onboarding,
• mezclar captions,
• mezclar industrias,
• mezclar configuraciones,
• ni compartir estado accidentalmente entre negocios.

============================================================
SOURCE OF TRUTH
===============

Toda data sensible debe depender de:

• businessId

⚠️ IMPORTANTE

NO depender únicamente de:

• React state global,
• localStorage global,
• cache global,
• session runtime ambiguo,
• ni variables compartidas sin ownership claro.

============================================================
RIESGOS CRÍTICOS
================

RIESGOS SENSIBLES:

• contaminación onboarding,
• branding cruzado,
• IA suggestions cruzadas,
• hydration incorrecta,
• stale state,
• overwrite accidental,
• selected business incorrecto,
• persistencia parcial,
• cache reutilizado,
• y reuse incorrecto de initialData.

============================================================
REGLAS OBLIGATORIAS
===================

Toda persistencia debe validar:

• ownership,
• userId,
• businessId,
• y source of truth real.

============================================================
NO HACER
=========

NO:

• usar estado compartido ambiguo,
• asumir business activo,
• reutilizar onboarding state sin validar,
• usar cache global sin aislamiento,
• ni persistir datos sin businessId claro.

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• crear negocio nuevo,
• cambiar negocio,
• reload,
• refresh,
• reopen onboarding,
• persistencia DB,
• multiusuario,
• multi-business,
• hydration,
• y comportamiento runtime real.

============================================================
REGLA FINAL
===========

Multi-business isolation es uno de los pilares críticos de HazPost.

Toda modificación debe:

• preservar aislamiento,
• evitar contaminación,
• mantener ownership claro,
• y validar runtime real completo.
