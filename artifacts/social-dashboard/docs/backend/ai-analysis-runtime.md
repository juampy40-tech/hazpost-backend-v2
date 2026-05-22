# AI Analysis Runtime

## Estado actual

HazPost actualmente está en transición entre:

- runtime legacy monolítico en app.py
- arquitectura moderna basada en services

Actualmente coexisten ambos sistemas.

---

# Legacy actual

Actualmente aún existen:

- prompts embebidos en app.py
- lógica IA acoplada a routes
- parsing mezclado con runtime HTTP
- ownership parcial mezclado

Esto existe por compatibilidad y migración progresiva.

---

# Nuevo runtime moderno

Nuevo ownership introducido:

src/services/ai_brand_analyzer.py

Responsable de:

- AI brand understanding
- prompt building
- onboarding-aware AI context
- centralized AI analysis ownership
- future AI enrichment pipeline

---

# Website Analysis Runtime (V33)

Nuevo ownership parcial introducido:

src/services/website_analysis_service.py

Responsable actualmente de:

- website scraping MVP
- visible text extraction
- title extraction
- meta description extraction
- headings extraction
- basic website normalization
- centralized website analysis foundation

---

# Website Content Intelligence

El onboarding analyze ahora utiliza:

- website URL
- scraped website content
- slogan
- industry
- business type
- location

El contenido scrapeado se consolida como:

website_content

Y se envía al prompt IA para:

- reducir alucinaciones
- evitar categorías incorrectas
- mejorar branding contextual
- detectar realmente qué vende la empresa

---

# Context Priority Rules

Prioridad contextual actual:

1. uploaded logos (future priority)
2. website content
3. slogan
4. industry/subindustry
5. business type
6. location

---

# Estado actual del scraping

Actualmente el sistema YA puede extraer:

- title
- meta description
- h1/h2
- paragraphs
- visible website content

---

# Limitaciones actuales

Actualmente NO existe todavía:

- real logo color extraction
- favicon color extraction
- CSS palette extraction
- image-aware branding analysis
- visual dominance analysis

Por eso algunos secondaryColor todavía terminan en:
- #ffffff

---

# Validaciones reales realizadas

Validado correctamente con:

- Ventolini
- PSG
- Tiffany & Co
- Ferrari

Mejoras confirmadas:

- menos respuestas genéricas
- menos industrias incorrectas
- mejor detección comercial
- branding más coherente
- mejores colores primarios

---

# Ownership Rules

## app.py

Responsable únicamente de:

- routes
- request handling
- orchestration
- HTTP lifecycle
- auth/session validation

NO debe crecer nuevamente como ownership principal de IA.

---

## ai_brand_analyzer.py

Responsable de:

- prompt engineering
- onboarding-aware prompts
- AI business understanding
- future AI normalization
- future response parsing ownership

---

# Regla crítica

Nueva lógica IA NO debe agregarse directamente en app.py.

Toda nueva lógica debe migrarse progresivamente hacia:

- services/
- runtime ownership separado
- source of truth centralizado

---

# Estado de migración

## Migrado

- centralized AI prompt builder
- onboarding-aware context priority
- business-first prompt ownership

## Pendiente

- OpenAI request execution centralization
- response parsing
- retry logic
- AI normalization
- website intelligence pipeline
- business intelligence enrichment
- image-aware branding analysis

---

# Arquitectura objetivo

Objetivo final:

routes
→ services
→ AI orchestration
→ parsing
→ normalization
→ persistence

Sin lógica IA gigante dentro de app.py.

---

# Riesgos conocidos

Actualmente existe riesgo de:

- duplicated prompts
- mixed ownership
- legacy/runtime inconsistency
- duplicated AI behaviors

Por esto toda migración debe ser:

- progresiva
- validada
- sin romper onboarding actual
- sin romper analyze-business endpoint
