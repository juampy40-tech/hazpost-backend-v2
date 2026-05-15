# 🚨 AFFILIATE PROGRAM FLOW — HAZPOST

⚠️ DOCUMENTO OFICIAL DEL SISTEMA DE AFILIADOS

Este documento define:

• affiliate application flow,
• approval lifecycle,
• affiliate runtime,
• commission settings,
• ownership,
• persistencia,
• estados,
• y riesgos del sistema de afiliados.

============================================================
OBJETIVO
=========

El sistema de afiliados existe para:

• adquisición orgánica,
• crecimiento SaaS,
• revenue sharing,
• creators partnerships,
• referrals,
• y expansión comercial de HazPost.

============================================================
SOURCE OF TRUTH
===============

Persistencia oficial:

• backend affiliates endpoints
• PostgreSQL affiliate persistence

Frontend:
• runtime hydration únicamente.

============================================================
ENDPOINTS IMPORTANTES
=====================

• /api/affiliates/status
• /api/affiliates/settings
• /api/affiliates/apply

============================================================
LIFECYCLE
==========

Affiliate lifecycle actual:

pending
→ approved
→ rejected

============================================================
RUNTIME STATES
===============

Estados runtime importantes:

• loading
• submitting
• application hydrated
• approved runtime
• rejected runtime

============================================================
SETTINGS CENTRALIZADO
=====================

Comisiones y duración actualmente dependen de:

• /api/affiliates/settings

⚠️ IMPORTANTE

NO hardcodear:

• porcentajes,
• duración,
• ni reglas comerciales.

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• affiliate state inconsistente,
• hydration incorrecta,
• stale commission settings,
• status incorrecto,
• race conditions,
• UX inconsistente,
• y persistencia parcial.

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• apply flow,
• pending status,
• approved status,
• rejected status,
• hydration,
• refresh,
• reload,
• persistencia DB,
• y runtime post deploy.

============================================================
REGLAS IMPORTANTES
==================

NO:

• hardcodear comisiones,
• asumir affiliate status frontend-only,
• duplicar lifecycle states,
• ni romper hydration runtime.

============================================================
REGLA FINAL
===========

Affiliate program es un sistema comercial sensible.

Toda modificación debe:

• preservar persistencia,
• mantener lifecycle claro,
• evitar inconsistencias,
• y validar runtime real completo.
