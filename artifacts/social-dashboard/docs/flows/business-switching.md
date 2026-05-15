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
