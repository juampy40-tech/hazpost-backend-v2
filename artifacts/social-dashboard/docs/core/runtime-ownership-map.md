# 🚀 Runtime Ownership Map — HazPost

⚠️ IMPORTANTE

Este documento define:

- runtime ownership REAL actual
- source of truth por dominio
- boundaries sensibles
- estado legacy vs moderno
- riesgos de duplicación
- estado de migración

NO asumir arquitectura solamente por:
- frontend
- backend
- archivo madre
- snippets aislados

Validar siempre contra:
- runtime real
- app.py
- dashboard.tsx
- Network F12
- Railway logs
- persistencia real
- documentación oficial

---

# 🎯 OBJETIVO

HazPost actualmente opera con:

- runtime híbrido
- coexistencia legacy + moderna
- orchestration distribuida
- service layer parcial
- lifecycle sensible

Este documento existe para evitar:

- duplicación de source-of-truth
- ownership ambiguo
- migraciones peligrosas
- regressions
- lifecycle inconsistente

---

# 🧠 DOMINIOS Y OWNERSHIP

# Industry Catalog Runtime

## Backend source of truth

`src/catalogs/industries.py`

Responsable de:
- categorías oficiales
- subcategorías
- aiContext
- onboarding catalog
- IA contextual
- industry suggestions compatibility

---

## Frontend source of truth

`src/lib/industryCatalog.ts`

Responsable de:
- fetch centralizado
- normalización
- cache runtime
- localStorage cache
- suggestions runtime
- fallback UX

---

## APIs

- `/api/industries`
- `/api/industries/suggestions`

---

## Consumidores frontend

- OnboardingWizard.tsx
- BusinessIdentityStep.tsx
- businesses.tsx
- SubIndustryMultiSelect.tsx

---

## Riesgo histórico detectado

Se detectó duplicación de loaders frontend en:

- OnboardingWizard.tsx
- businesses.tsx

Esto causaba:
- cache desincronizado
- orden inconsistente
- comportamiento ambiguo
- riesgo de regresiones

Solución aplicada:
centralización completa en:

`src/lib/industryCatalog.ts`

---

## Regla arquitectónica

Nunca duplicar:
- catalog loaders
- cache runtime
- fetches
- normalización

Los componentes nunca deben consumir:
`/api/industries`
directamente.

Patrón oficial:

`src/lib/*`

| Dominio | Runtime actual | Source of truth actual | Estado | Riesgo |
|---|---|---|---|---|
| Analyze onboarding | `/api/analyze-website` | app.py legacy runtime | híbrido | alto |
| Analyze moderno | `/api/businesses/<id>/analyze-website` | mixed runtime | transición | medio |
| Website analysis service | `website_analysis_service.py` | future source-of-truth | scaffold | medio |
| Website content intelligence | `website_content` contextual pipeline | onboarding analyze runtime | MVP activo | medio |
| Dashboard orchestration | `dashboard.tsx` | frontend runtime coordinator | crítico | crítico |
| Polling | dashboard runtime | runtime híbrido | sensible | alto |
| Approval lifecycle | current orchestration | runtime actual | híbrido | alto |
| Publish lifecycle | inline orchestration | runtime actual | sensible | alto |
| imageVariants | posts contract | current runtime | estable | crítico |
| Branding intelligence | mixed runtime | parcial | transición | medio |
| Prompt governance | mixed runtime | parcial | transición | medio |
| Generate first post | `generate_first_post()` | orchestration runtime | crítico | crítico |

---

# ⚠️ ÁREAS SENSIBLES — NO REFACTOR AGRESIVO

NO mover agresivamente todavía:

- dashboard.tsx
- polling
- approval lifecycle
- publish lifecycle
- hydration
- retries
- imageVariants lifecycle
- onboarding persistence
- generate_first_post orchestration

Estas áreas actualmente contienen:
- orchestration real
- lifecycle distribuido
- bridges híbridos
- sincronización frontend/backend
- ownership implícito

---

# ✅ SAFE EXTRACTION AREAS

Áreas relativamente seguras para consolidación progresiva:

- scraping
- metadata extraction
- logo detection
- color extraction
- normalization
- AI helper utilities
- prompt fragments

---

# 🚀 DIRECCIÓN ARQUITECTÓNICA ACTUAL

Objetivo actual:

- consolidar ownership
- reducir duplicación
- centralizar IA progresivamente
- mantener compatibilidad legacy
- evitar romper lifecycle
- reducir complejidad accidental

NO objetivo actual:

- rewrite completo
- microservicios
- refactor masivo
- mover todo a services rápidamente

---

# 📌 ESTRATEGIA CORRECTA

La estrategia correcta actual es:

## CONSOLIDACIÓN PROGRESIVA

Primero:
- ownership claro
- boundaries claros
- reutilización progresiva
- extracción de lógica pura

Después:
- consolidación runtime
- reducción orchestration accidental
- migración gradual a service layer

---

# ⚠️ IMPORTANTE

El mayor riesgo actual NO es:

- Flask
- React
- Railway
- Vercel
- PostgreSQL

El mayor riesgo actual es:

# duplicación de source-of-truth
# ownership ambiguo
# lifecycle híbrido inconsistente

---

# AI Analysis Ownership

## Legacy runtime

Actualmente parte del AI analysis aún vive en:

- app.py

Incluye:
- orchestration parcial
- request lifecycle
- compatibilidad legacy
- onboarding analysis legacy flow

---

## Modern runtime

Nuevo ownership centralizado:

- src/services/ai_brand_analyzer.py

Responsable de:
- prompt engineering
- onboarding-aware AI analysis
- business-first context handling
- centralized AI ownership
- future AI runtime extraction

---

## Current migration state

Estado actual:
- híbrido
- coexistencia legacy + moderno

Actualmente:
- app.py aún ejecuta parte del lifecycle
- ai_brand_analyzer.py centraliza prompt governance
- website_analysis_service.py sigue parcialmente scaffold

---

## IMPORTANT RULE

Nueva lógica IA NO debe crecer directamente dentro de:

- app.py

Nueva lógica IA debe vivir progresivamente en:

- src/services/
- centralized ownership runtime

---

## Current strategy

La estrategia correcta actual es:

1. centralizar prompts
2. centralizar AI helpers
3. reducir duplicación
4. mantener compatibilidad legacy
5. extraer orchestration gradualmente
6. evitar regressions

NO hacer:
- rewrites masivos
- migración agresiva
- mover lifecycle crítico prematuramente
