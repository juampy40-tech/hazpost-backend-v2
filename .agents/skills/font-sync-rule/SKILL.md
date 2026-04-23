---
name: font-sync-rule
description: Regla de sincronización de fuentes en HazPost. Úsalo ANTES de agregar, quitar o modificar cualquier fuente en la cola de aprobación O en el wizard de inscripción. Si agregas una fuente en uno, debes agregarla en el otro.
---

# Regla de Sincronización de Fuentes — HazPost

## Arquitectura (post-task #13)

> **Hay un único archivo fuente de verdad: `artifacts/social-dashboard/src/lib/fonts.ts`**
> Todos los demás archivos importan de ahí. Si agregas o quitas una fuente, solo editas `fonts.ts`.

La sincronización entre la cola de aprobación y el wizard de inscripción es AUTOMÁTICA —
ambos importan del mismo catálogo. Ya no existe el riesgo de desincronización manual.

---

## Archivo fuente único

**`artifacts/social-dashboard/src/lib/fonts.ts`**

```ts
export interface FontEntry {
  key: string;     // clave interna única (ej: "bebas")
  label: string;   // nombre visible en la UI (ej: "BEBAS")
  family: string;  // CSS font-family con fallbacks (ej: "'Bebas Neue', Impact, sans-serif")
  category: "display" | "sans" | "serif" | "script" | "handwriting" | "tech";
}

export const FONT_CATALOG: FontEntry[] = [ ... ];

// Derivado automáticamente — no editar directamente
export const FONT_NAMES: string[] = FONT_CATALOG.map(f =>
  f.family.split(",")[0].replace(/'/g, "").trim()
);
```

### Quién consume qué
- **Cola de aprobación** (`approval.tsx`): importa `FONT_CATALOG` — usa `key`, `label`, `family`
- **Wizard de inscripción** (`OnboardingWizard.tsx`): importa `FONT_NAMES` — usa nombre CSS

---

## Checklist al AGREGAR una fuente nueva (1 solo paso + 1 opcional)

- [ ] **Agregar la entrada en `FONT_CATALOG`** en `fonts.ts` con key, label, family, category
- [ ] Si es **Google Font**: agregar `&family=Nombre+de+la+Fuente:wght@700` al `<link>` de
  Google Fonts en `index.html` (~línea 142)
- [ ] Si **NO es Google Font** (ej: Cooper Hewitt): agregar `@import url(...)` en `index.css`
  desde CDNFonts u otra fuente confiable

### Pesos recomendados por categoría
- Display / Bold: `:wght@700` o `:wght@700;800`
- Sans moderno / Serif: `:wght@700`
- Script / Handwriting: solo peso 400 (la mayoría no tiene 700) — omitir `:wght@`
- Tech: `:wght@700`

## Checklist al ELIMINAR una fuente

- [ ] Quitar la entrada de `FONT_CATALOG` en `fonts.ts`
- [ ] Si nadie más la usa: quitar del `<link>` en `index.html` o del `@import` en `index.css`

---

## Dos catálogos que NO deben confundirse

| Catálogo | Archivo | Propósito |
|---------|---------|-----------|
| **Frontend** `FONT_CATALOG` | `src/lib/fonts.ts` | Preview CSS en el navegador (selector) |
| **Backend** `FONT_CATALOG` | `api-server/src/services/fontLoader.ts` | Renderizar la imagen real con Sharp |

Las fuentes del backend requieren archivos `.ttf/.woff2` locales en `api-server/src/assets/`.
Si una fuente está en el frontend pero NO en el backend, se muestra correctamente en el preview
pero el renderizado de la imagen usa el fallback (Inter/Impact). Eso es aceptable por diseño.

---

## Nota sobre fuentes no-Google

- **Cooper Hewitt**: no es Google Font. Cargada via `@import` en `index.css`. Wizard la carga
  desde Google Fonts y falla silenciosamente, pero el `@import` global la hace funcionar.
- **Electra**: no es Google Font (es comercial). Usa fallback `Georgia, serif`. Normal.
- El resto son Google Fonts.

---

## Estado post-task #13 — ~89 fuentes totales por categoría

**Display / Bold (16):** Bebas Neue, Anton, Fjalla One, Oswald, Barlow Condensed, Unbounded,
Righteous, Black Han Sans, Russo One, Teko, Abril Fatface, Dela Gothic One, Bungee,
League Spartan, Graduate, Squada One

**Sans-serif moderno (28):** Montserrat, Inter, Poppins, Raleway, Lato, Plus Jakarta Sans,
DM Sans, Space Grotesk, Syne, Outfit, Roboto, Open Sans, Source Sans 3, Nunito, Ubuntu,
Noto Sans, Fira Sans, Work Sans, Barlow, Quicksand, Josefin Sans, Exo 2, Titillium Web,
Yanone Kaffeesatz, Cabin, Cooper Hewitt, Sora, Manrope, Lexend, Figtree, Hanken Grotesk,
Albert Sans, Urbanist, PT Sans, Bricolage Grotesque, Instrument Sans, Onest, Karla, Chivo

**Serif (19):** Playfair Display, Cinzel, Fraunces, Libre Baskerville, Merriweather,
Crimson Text, EB Garamond, Bitter, Arvo, Crete Round, Electra, Cormorant Garamond,
Italiana, Spectral, Lora, Bodoni Moda, DM Serif Display, Yeseva One, Zilla Slab

**Script / Cursiva (8):** Pacifico, Lobster, Dancing Script, Great Vibes, Sacramento,
Satisfy, Kaushan Script, Allura

**Handwriting casual (3):** Caveat, Architects Daughter, Indie Flower

**Tech / Futurista (3):** Orbitron, Chakra Petch, Audiowide
