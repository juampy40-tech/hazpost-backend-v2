# Brand Font Lifecycle — HazPost

## Status

ACTIVE RUNTIME

## Last validated

2026-05-25

## Responsabilidad

Este flujo controla la selección, subida, persistencia y rehidratación de tipografías de marca.

## Source of Truth

La tipografía activa del negocio se representa con:

- `brandFont`
- `brandFontUrl`

La biblioteca persistente de fuentes subidas se representa con:

- `customFonts`

## Formato persistido

`customFonts` se guarda como string JSON:

```json
[
  {
    "name": "Mi Fuente",
    "url": "/storage/objects/uploads/user/font.ttf"
  }
]