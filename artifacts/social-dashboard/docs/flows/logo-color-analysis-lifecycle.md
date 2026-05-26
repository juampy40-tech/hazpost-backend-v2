# Logo Color Analysis Lifecycle

## Objetivo

Centralizar y estabilizar el lifecycle completo de:

- logo upload
- website analysis
- AI suggestions
- color extraction
- onboarding create/edit
- branding hydration

sin duplicar source-of-truth ni romper runtime legacy.

---

# Source of Truth Oficial

## Branding visual

Prioridad oficial:

1. Uploaded logo
2. Existing business branding
3. Website branding heuristics
4. AI-generated fallback colors

Regla crítica:

- Uploaded logo SIEMPRE gana sobre website colors.
- AI NO debe inventar colores si existe logo válido.
- Website analysis se usa principalmente para:
  - descripción,
  - audiencia,
  - tono,
  - contexto comercial.

NO para reemplazar branding visual real.

---

# Runtime Lifecycle Validado

## Create business con logo

1. Usuario sube logo.
2. Frontend guarda:
   - logoUrl
   - logoUrls[]
3. analyze-website recibe:
   - context.logoUrl
   - context.logoUrls
4. Backend ejecuta:
   - WebsiteAnalysisService.scrape_website()
   - IA textual
   - ColorExtractor.extract()
5. ColorExtractor reemplaza colores IA.
6. Backend devuelve:
   - primaryColor
   - secondaryColor
   - palette
   - colorSource
   - colorConfidence
7. Frontend hidrata:
   - aiSuggestions
   - color pickers
   - preview visual
8. "Usar" persiste colores.
9. Reload/reopen mantiene colores.

---

## Edit business + upload logo después

Lifecycle oficial:

1. Usuario crea negocio SIN logo.
2. Negocio se guarda.
3. Usuario entra a editar.
4. Usuario sube logo posteriormente.
5. analyze-website debe comportarse EXACTAMENTE igual
   al onboarding inicial.
6. Frontend debe enviar:
   - logoUrl
   - logoUrls[]
7. Backend debe:
   - usar ColorExtractor
   - ignorar colores IA
   - priorizar logo real
8. Frontend hidrata:
   - primaryColor
   - secondaryColor
   - palette
   correctamente.

---

# Root Cause Encontrado

## Problema real

Backend SI estaba extrayendo correctamente:

- rojo Pepsi
- azul Pepsi
- palette completa

ColorExtractor NO era el problema.

## El problema real estaba en frontend

Problemas encontrados:

- hydration inconsistente
- secondaryColor no propagaba
- payload normalization roto
- suggestions/body root inconsistentes
- edit lifecycle distinto a create lifecycle
- logoUrls no siempre se enviaba igual

---

# Fixes Aplicados

## Frontend

Archivo:

- artifacts/social-dashboard/src/components/OnboardingWizard.tsx

Cambios:

- businessId isolation
- payload normalization
- hydration normalization
- support para:
  - body root
  - suggestions root
- hydration de:
  - secondaryColor
  - palette
  - colorSource
  - colorConfidence

---

## Backend

Archivo:

- hazpost-backend/app.py

Cambios:

- extracción real usando:
  ColorExtractor.extract()
- prioridad real para:
  - logoUrl
  - logoUrls[]
- secondaryColor real
- palette real
- logging runtime

---

# Runtime Ownership

## Frontend owner

- OnboardingWizard.tsx

Responsable de:

- hydration
- apply suggestions
- payload lifecycle
- UI sync
- onboarding consistency

---

## Backend owner

- analyze_business_website()

Responsable de:

- AI textual analysis
- logo extraction
- palette extraction
- branding governance

---

# Archivos Core Sensibles

## Frontend

- artifacts/social-dashboard/src/components/OnboardingWizard.tsx

## Backend

- hazpost-backend/app.py
- src/services/color_extractor.py
- src/services/website_analysis_service.py

---

# Reglas Oficiales

## Reglas críticas

- Nunca confiar en website colors sobre uploaded logo.
- Create/edit lifecycle deben ser idénticos.
- secondaryColor es obligatorio si extractor lo devuelve.
- palette debe mantenerse consistente.
- Frontend SIEMPRE debe normalizar:
  - body root
  - suggestions root
- Nunca duplicar branding source-of-truth.
- Nunca mezclar branding entre negocios.

---

# Commits Relacionados

- 2370807 Fix logo analysis lifecycle consistency
- 05a0fad Fix business logo color extraction lifecycle
- 5f370b9 Improve onboarding AI suggestion UX
- 64285a7 Fix AI suggestion hydration for brand colors

---

# QA Validado

Escenarios probados:

- create business con logo
- edit business upload posterior
- Pepsi transparent PNG
- multi-business isolation
- primaryColor hydration
- secondaryColor hydration
- palette extraction
- preview rendering
- apply suggestions
- persistencia tras refresh
- reopen wizard consistency

---

# Resultado Final

El onboarding create/edit ahora comparte el mismo runtime real de branding visual.

Logo upload ahora funciona como source-of-truth oficial para:

- primaryColor
- secondaryColor
- palette
- branding visual completo