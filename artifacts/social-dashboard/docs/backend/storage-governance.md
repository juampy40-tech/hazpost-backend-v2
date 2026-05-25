# Storage Governance — HazPost

## Objetivo

Centralizar reglas oficiales de almacenamiento persistente.

Este documento define:

- ownership de storage,
- persistencia de assets,
- aislamiento multi-business,
- lifecycle de uploads,
- hydration runtime,
- reglas de seguridad.

---

# Storage domains

## Branding assets

Assets soportados actualmente:

- logos
- reference images
- custom fonts

---

## Ownership actual

Frontend:

- `OnboardingWizard.tsx`
- `businesses.tsx`

Backend:

- `/api/businesses`
- `/brand-profile`

Storage runtime:

- object storage uploads
- persisted object paths

---

# Custom fonts governance

## Persistencia oficial

Las custom fonts NO son estado temporal UI.

Representan assets persistentes del negocio.

Source of truth:

- `customFonts`

Formato:

```json
[
  {
    "name": "Mi Fuente",
    "url": "/storage/objects/uploads/font.ttf"
  }
]