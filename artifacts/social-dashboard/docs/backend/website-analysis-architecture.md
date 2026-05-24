# Website Analysis Architecture

## Objetivo

Centralizar toda la lógica de:

- website scraping
- branding extraction
- AI business understanding
- onboarding enrichment
- brand normalization

en una arquitectura modular y reutilizable.

---

# Source of Truth

Archivo principal:

- `src/services/website_analysis_service.py`

Este servicio será el único entrypoint oficial para:

- onboarding website analysis
- business profile analysis
- future AI enrichment pipelines

---

# Arquitectura

## website_analysis_service.py

Orquestador principal.

Responsable de:

- coordinar pipeline completo
- ejecutar scraping
- ejecutar branding extraction
- ejecutar AI analysis
- retornar payload normalizado

NO contiene:
- Flask routes
- DB logic
- request/session usage

---

## website_scraper.py

Responsable de:

- descargar HTML
- normalizar contenido
- extraer texto visible
- detectar assets base
- sanitizar contenido

---

## metadata_extractor.py

Responsable de:

- title
- meta description
- OpenGraph tags
- favicon
- canonical
- social metadata

---

## logo_detector.py

Responsable de:

- detectar logos
- favicon fallback
- SVG/logo discovery
- priorización de branding assets

---

## color_extractor.py

Responsable de:

- extraer colores dominantes
- normalizar HEX
- detectar primary/secondary colors

Responsable de:

- extraer colores dominantes,
- normalizar HEX,
- detectar primary/secondary colors,
- filtrar colores neutros,
- ignorar checkerboard/transparency bleed,
- ignorar UI/bootstrap contamination,
- priorizar colores saturados,
- extraer branding visual desde logos.

IMPORTANTE:

Website colors son heurísticos.

Uploaded logos tienen prioridad sobre website colors.

Logo extraction puede reemplazar colores detectados previamente
durante onboarding hydration.

Brand visual source priority:

1. uploaded logo
2. detected website logo
3. website heuristics
4. AI fallback suggestion

NO:

- asumir website como source-of-truth visual,
- persistir colores heurísticos como definitivos,
- confiar ciegamente en AI-generated HEX.

---

## brand_extractor.py

Responsable de:

- consolidar branding
- generar payload normalizado
- unificar metadata + logos + colors

---

## ai_brand_analyzer.py

Responsable de:

- understanding del negocio
- tono de marca
- audiencia
- propuesta de valor
- contexto social media
- enriquecimiento onboarding

Consume:
- contexto ya normalizado

NO realiza scraping.

---

# Objetivo de Migración

Migrar progresivamente lógica existente desde:

- `/api/analyze-website`
- `/api/businesses/<id>/analyze-website`

hacia esta arquitectura centralizada.

---

# Reglas Arquitectónicas

## IMPORTANTE

- NO duplicar lógica IA.
- NO duplicar scraping.
- NO mezclar Flask routes con servicios.
- Mantener responsabilidades separadas.
- Toda nueva funcionalidad debe reutilizar esta arquitectura.
- onboarding y business analysis deben compartir pipeline.

---

# Estado Actual

## Implementado

- scaffolds arquitectónicos
- separación modular
- source of truth definido
- logo-based color extraction
- onboarding color hydration
- logo color override lifecycle
- anti-checkerboard filtering
- anti-UI-color filtering
- saturation-based color filtering
- visual branding source priority

## Pendiente

- migración runtime real
- integración progresiva
- validación end-to-end
- fallback/error handling
- testing real
