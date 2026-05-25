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

## Custom Subindustry Governance Runtime

`/api/industries/suggestions` ahora soporta:

- `type = industry`
- `type = subindustry`
- `parent_industry`

Ownership real:

- catálogo global oficial: `src/catalogs/industries.py`
- sugerencias / governance: `src/catalogs/industry_suggestions.py`
- frontend runtime: `src/lib/industryCatalog.ts`
- UX subcategorías: `SubIndustryMultiSelect.tsx`

Regla crítica:

- subcategorías custom pueden usarse por el negocio actual
- NO se promueven automáticamente al catálogo global
- NO aparecen automáticamente para otros negocios
- NO modificar `industries.py` desde suggestions sin revisión manual

Persistencia actual:

- `industry_suggestions` para governance
- `businesses.sub_industry` (legacy DB/runtime)
- `subIndustry` (frontend runtime contract)

NO migrar `subIndustry` a arrays/json sin auditoría completa de:
- onboarding
- businesses
- brand profile
- hydration
- prompts IA
- approval lifecycle
- analytics
- multi-business isolation

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

## Brand Color Extraction Runtime

Owner actual:

- `src/services/color_extractor.py`

Responsable de:

- extracción de colores desde logos,
- palette normalization,
- HEX normalization,
- anti-checkerboard filtering,
- anti-UI/bootstrap filtering,
- saturation-based filtering.

Regla oficial:

- Uploaded logo = source-of-truth visual recomendado.
- Website colors = heurísticos / sugerencia.
- AI-generated HEX = fallback, no verdad absoluta.
- Usuario siempre puede editar manualmente.

Lifecycle validado:

1. website analysis puede sugerir color inicial.
2. al subir logo, onboarding reanaliza.
3. logo color puede reemplazar website color.
4. frontend hidrata primaryColor/secondaryColor.
5. business profile guarda color final.
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

---

# BRANDING ASSETS OWNERSHIP

## Frontend owners

- `OnboardingWizard.tsx`
- `businesses.tsx`

Responsables de:

- custom fonts,
- branding hydration,
- visual assets runtime,
- branding persistence UX,
- visual onboarding state.

---

## Persistence owners

Endpoints principales:

- `/api/businesses`
- `/brand-profile`

Responsables de:

- persistencia branding,
- hydration DB,
- business visual identity,
- multi-business isolation.

---

## Branding assets governance

Documento oficial:

- `docs/core/brand-assets-governance.md`

---

## Custom font lifecycle

Documento oficial:

- `docs/flows/brand-font-lifecycle.md`

Runtime validado:

- upload
- save
- reload
- reopen
- catálogo/custom switching
- persistent font library
- business edit flow
- onboarding hydration

---

## Reglas críticas

`customFonts` representa una biblioteca persistente del negocio.

NO debe:

- depender del estado visual actual,
- limpiarse al cambiar presets,
- resetearse por hydration,
- perderse al editar negocio,
- ni destruirse durante onboarding.

---

## Riesgos futuros detectados

Pendientes futuros:

- storage orphan cleanup,
- font delete UX,
- drag/drop uploads,
- MIME validation avanzada,
- quotas por plan,
- visual font previews premium.