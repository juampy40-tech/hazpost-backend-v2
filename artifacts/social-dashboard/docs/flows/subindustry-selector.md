# SubIndustry Selector Flow

## Objetivo

Permitir selección múltiple de subcategorías de manera:
- rápida
- intuitiva
- escalable
- reusable
- compatible con onboarding y perfil de marca

---

# Componentes

Frontend:
- SubIndustryMultiSelect.tsx
- BusinessIdentityStep.tsx
- OnboardingWizard.tsx

Backend:
- src/catalogs/industries.py

---

# UX actual

El selector permite:
- multi-selección
- búsqueda rápida
- tags visuales
- remover subcategorías
- dropdown controlado
- click afuera para cerrar
- ESC para cerrar
- evitar duplicados

---

# Reglas UX

- nunca usar `<details>` legacy
- dropdown debe cerrar correctamente
- evitar overflow visual
- no bloquear onboarding
- feedback visual inmediato
- mantener selección persistente
- evitar clicks accidentales

---

# Source of truth

Las subcategorías oficiales viven en:

`src/catalogs/industries.py`

El frontend NO debe inventar subcategorías hardcodeadas fuera del catálogo central.

---

# Riesgos conocidos

- demasiadas subcategorías dañan UX
- categorías ambiguas dañan IA
- listas gigantes afectan onboarding
- duplicados afectan generación IA

---

# Roadmap futuro

- búsqueda IA de subcategorías
- sugerencias automáticas
- analytics por subindustria
- tags inteligentes
- clustering IA
- subcategorías dinámicas