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
RELACIÓN CON AI BRANDING
========================

⚠️ IMPORTANTE

El runtime IA onboarding y branding contextual ahora dependen también de:

• logos persistidos,
• branding assets,
• imageVariants,
• visual previews,
• y assets renderizados correctamente.

Problemas de URLs o rendering pueden impactar:

• análisis IA contextual,
• branding consistency,
• color detection futura,
• previews onboarding,
• visual identity,
• y coherencia visual de posts.

============================================================
REGLA NUEVA
========================

Antes de modificar rendering de assets validar SIEMPRE:

• onboarding analyze,
• logos,
• brand profile,
• imageVariants,
• preview rendering,
• overlays,
• y persistencia visual real.

============================================================
REGLA FINAL
===========

resolveStorageObjectUrl() funciona como:

• adapter layer,
• compatibility layer,
• y boundary de rendering visual persistente.
