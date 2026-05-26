# Brand Assets Governance — HazPost

## Status

ACTIVE CORE GOVERNANCE

## Last validated

2026-05-25

---

# Objetivo

Centralizar las reglas oficiales para:

- branding visual,
- assets persistentes,
- uploads,
- logos,
- tipografías,
- colores,
- imágenes de referencia,
- ownership visual,
- persistencia,
- hydration,
- y lifecycle visual del negocio.

Este documento define la governance transversal de assets visuales en HazPost.

---

# Filosofía HazPost

HazPost NO usa branding genérico.

Cada negocio debe:

- verse único,
- verse profesional,
- mantener coherencia visual,
- conservar identidad persistente,
- y evitar pérdida de assets.

La IA debe respetar la identidad visual del negocio.

---

# Source of Truth

## Branding principal

El branding del negocio vive en:

- `BusinessProfile`
- onboarding
- business editor
- DB persistida

---

# Assets visuales soportados

## Logos

Campos:

- `logoUrl`
- `logoUrls`

Prioridad:

```txt
uploaded logo
→ reference images
→ website analysis
→ AI fallback
→ defaults
```

---

## Custom Fonts

Campos:

- `brandFont`
- `brandFontUrl`
- `customFonts`

Storage:

- Cloudflare R2

IMPORTANTE:

• Custom fonts are stored in Cloudflare R2.
• Browser rendering requires valid CORS configuration.
• `customFonts` must persist alongside `brandFontUrl`.
• Frontend hydration depends on `customFonts`.
• Preview runtime depends on successful font injection.