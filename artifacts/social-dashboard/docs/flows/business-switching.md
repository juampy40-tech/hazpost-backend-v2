# 🚨 BUSINESS SWITCHING FLOW — HAZPOST

⚠️ DOCUMENTO OFICIAL DEL BUSINESS SWITCHING

Este documento define:

• active business runtime,
• business switching,
• hydration,
• selected business ownership,
• localStorage cleanup,
• persistencia,
• y riesgos multi-business frontend.

============================================================
OBJETIVO
=========

HazPost debe permitir múltiples negocios completamente aislados.

El usuario debe poder:

• cambiar negocio,
• persistir negocio activo,
• mantener branding correcto,
• mantener onboarding correcto,
• mantener calendario correcto,
• y mantener aislamiento completo entre negocios.

============================================================
SOURCE OF TRUTH
===============

Business activo depende de:

• backend persistence
• user business ownership
• active business persistence

⚠️ IMPORTANTE

Frontend NO debe asumir negocio activo únicamente por React state.

============================================================
COMPONENTES IMPORTANTES
=======================

ARCHIVO PRINCIPAL:

• AppLayout.tsx

COMPONENTE PRINCIPAL:

• BusinessSwitcher()

ENDPOINTS IMPORTANTES:

• /api/businesses
• /api/businesses/<id>/set-active

============================================================
RUNTIME ACTUAL
===============

BusinessSwitcher actualmente:

• carga businesses,
• detecta active business,
• cambia negocio activo,
• limpia calendar scope,
• y fuerza reload runtime.

============================================================
LOCALSTORAGE
=============

Actualmente se limpia:

• hz_cal_scope_<user.id>

⚠️ IMPORTANTE

localStorage:
• NO es source of truth.

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• contaminación multi-business,
• stale active business,
• hydration conflictiva,
• cache incorrecto,
• branding cruzado,
• onboarding cruzado,
• selected business incorrecto,
• reload parcial,
• persistencia parcial,
• y React state desincronizado.

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• switch business,
• refresh,
• reload,
• onboarding,
• branding,
• calendario,
• approval queue,
• generación IA,
• multiusuario,
• multi-business,
• persistencia DB,
• y runtime completo.

============================================================
ANTI-PATTERNS PROHIBIDOS
========================

NO:

• asumir negocio activo por frontend únicamente,
• persistir estado ambiguo,
• reutilizar branding entre negocios,
• reutilizar onboarding state,
• ni usar cache compartido sin ownership claro.

============================================================
REGLA FINAL
===========

Business switching es uno de los flows más sensibles de HazPost.

Toda modificación debe:

• preservar aislamiento,
• evitar contaminación,
• mantener ownership claro,
• y validar runtime real completo.

============================================================
ACTIVE BUSINESS CONTEXT RUNTIME
================================

Archivo principal:

• src/contexts/ActiveBusinessContext.tsx

============================================================
RESPONSABILIDAD
================

Este context actualmente controla:

• active business runtime,
• business hydration,
• active business ownership,
• frontend business switching,
• loaded state,
• business list runtime,
• y sincronización frontend/backend.

============================================================
SOURCE OF TRUTH REAL
====================

El negocio activo depende de:

• backend persistence
• /api/businesses
• business.isDefault === true

⚠️ IMPORTANTE

El backend actualmente define el negocio activo oficial.

Frontend:
• NO debe crear source of truth paralela.

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• stale business runtime,
• hydration race conditions,
• loaded state inconsistente,
• React stale renders,
• contaminación multi-business,
• reload parcial,
• selected business incorrecto,
• hydration incompleta,
• y frontend/backend desincronizado.

============================================================
LOADED STATE
=============

loaded actualmente controla:

• hydration UX,
• runtime readiness,
• fallback rendering,
• y prevención de pantallas vacías.

⚠️ IMPORTANTE

Romper loaded puede generar:

• loaders infinitos,
• flashes incorrectos,
• business incorrecto,
• y hydration inconsistente.

============================================================
SWITCH BUSINESS FLOW
====================

switchBusiness actualmente:

1. llama:
   • /api/businesses/<id>/set-active

2. backend persiste negocio activo

3. frontend recarga:
   • loadBusinesses()

## Runtime Validado (2026-06-01)

Se validó que el cambio de negocio activo debe utilizar exclusivamente:

- ActiveBusinessContext
- switchBusiness()

BusinessSwitcher fue migrado para consumir:

- activeBusinessId
- businesses
- switchBusiness()

desde ActiveBusinessContext.

Se eliminó dependencia de:

- fetch("/api/businesses") local
- window.location.reload()

como mecanismo principal de sincronización.

Resultado:

- cambio inmediato de negocio activo
- sidebar sincronizado
- source-of-truth único para negocio activo
- sin refresh manual

Validado en runtime real.

============================================================
REGLAS IMPORTANTES
==================

NO:

• asumir negocio activo localmente,
• crear cache paralelo,
• persistir business runtime ambiguo,
• ni romper loaded state hydration.
