# Industry Catalog Runtime

## Source of truth

El catálogo oficial de industrias vive en:

`hazpost-backend/src/catalogs/industries.py`

Este catálogo alimenta:
- onboarding
- business profile
- IA context
- generación de contenido
- subcategorías
- UX de selección

---

# Reglas

- mantener estructura centralizada
- evitar categorías duplicadas
- priorizar nombres comerciales claros
- priorizar industrias reales
- mantener compatibilidad con onboarding
- subcategorías deben ser escalables
- NO mezclar categorías experimentales con oficiales

---

# Ownership

Frontend:
- OnboardingWizard.tsx
- BusinessIdentityStep.tsx
- SubIndustryMultiSelect.tsx
- industryCatalog.ts

Backend:
- src/catalogs/industries.py
- /api/industries

---

# IA Runtime

El catálogo impacta:
- prompts
- hashtags
- CTAs
- tono
- hooks
- ideas de contenido
- aprendizaje IA futuro

---

# Riesgos

- categorías duplicadas dañan UX
- categorías ambiguas dañan IA
- demasiadas categorías dañan onboarding
- subcategorías inconsistentes dañan segmentación

---

# Futuro

- panel admin categorías
- analytics por industria
- IA suggestions
- auto clustering
- industrias dinámicas