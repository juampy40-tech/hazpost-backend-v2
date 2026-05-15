============================================================
STORAGE URL NORMALIZATION
=========================

Archivo relacionado:

• resolveStorageObjectUrl.ts

============================================================
RESPONSABILIDAD
================

Este helper actualmente controla:

• normalización de storage URLs,
• compatibilidad frontend/backend,
• branding assets rendering,
• logo rendering,
• imageVariants rendering,
• y compatibilidad legacy de paths.

============================================================
OBJETIVO
=========

El sistema debe resolver correctamente assets desde:

• object storage,
• branding uploads,
• image variants,
• overlays,
• y assets persistidos históricos.

============================================================
COMPATIBILIDAD LEGACY
=====================

Actualmente soporta:

• /storage/objects/
• storage/objects/
• /objects/
• objects/

⚠️ IMPORTANTE

Esto existe para mantener:

• compatibilidad legacy,
• persistencia histórica,
• y rendering estable.

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• logos rotos,
• previews rotos,
• imageVariants inválidas,
• assets invisibles,
• hydration visual inconsistente,
• URLs inconsistentes,
• y rendering roto frontend/backend.

============================================================
REGLAS IMPORTANTES
==================

NO:

• hardcodear URLs storage,
• duplicar lógica de normalización,
• romper compatibilidad legacy,
• ni construir URLs manualmente fuera del helper.

============================================================
REGLA FINAL
===========

resolveStorageObjectUrl() funciona como:

• adapter layer,
• compatibility layer,
• y boundary de rendering visual persistente.
