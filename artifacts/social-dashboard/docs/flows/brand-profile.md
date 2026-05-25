============================================================
STORAGE URL NORMALIZATION
=========================

## Status

ACTIVE RUNTIME

## Last validated

2026-05-25

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
• y boundary oficial de rendering visual persistente.

---

# Logo Color Extraction

## Regla oficial

La prioridad visual del perfil de marca es:

1. Edición manual del usuario.
2. Logo subido.
3. Website analysis.
4. IA fallback.
5. Defaults neutros.

## Reglas críticas

- El website NO debe sobrescribir colores detectados desde logo.
- La IA NO debe inventar colores si no hay confianza.
- Si colorConfidence = low, no hidratar colores.
- Si el usuario edita manualmente, su decisión manda.
- Upload exitoso no depende de extracción exitosa.
- Filename original del usuario nunca debe romper uploads ni previews.
- Si falla extracción, onboarding debe seguir funcionando.

## Estado validado

Validado con:

- Ventolini
- Formula 1
- Pepsi

Resultado:

- upload OK
- preview OK
- filename largo OK
- extracción por logo OK
- fallback manual OK

============================================================
VALIDACIÓN REAL
============================

Casos reales validados:

• Ventolini
• Formula 1
• Pepsi

Escenarios validados:

• filename largo,
• upload persistente,
• preview hydration,
• storage normalization,
• extracción colores desde logo,
• fallback seguro,
• onboarding resiliente,
• y compatibilidad legacy URLs.