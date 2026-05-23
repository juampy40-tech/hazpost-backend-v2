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
- mantener compatibilidad multiusuario
- evitar romper prompts IA existentes
- mantener nombres consistentes entre frontend y backend

---

# Ownership

## Frontend

- OnboardingWizard.tsx
- BusinessIdentityStep.tsx
- SubIndustryMultiSelect.tsx
- src/lib/industryCatalog.ts

## Backend

- src/catalogs/industries.py
- /api/industries
- /api/industries/suggestions

---

# Frontend Runtime

Source of truth frontend:

`src/lib/industryCatalog.ts`

Responsabilidades:
- fetch centralizado
- normalización
- cache local
- suggestions API
- fallback runtime

Todos los componentes frontend deben consumir:

- fetchIndustryCatalog()
- sendIndustrySuggestion()

Nunca duplicar:
- fetches
- loaders
- cache
- normalización
- localStorage

---

# Cache Strategy

Cache key oficial:

`hz_industry_catalog_v1`

TTL:
- 1 hora

Capas:
- memoria runtime
- localStorage

Objetivo:
- reducir requests repetidos
- mejorar velocidad onboarding
- mantener UX fluida

Importante:
si el catálogo cambia y frontend sigue mostrando orden viejo:
- limpiar localStorage
- invalidar cache manualmente

Console:

```js
localStorage.removeItem("hz_industry_catalog_v1")
location.reload()
```

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
- segmentación comercial
- recomendaciones IA
- análisis contextual
- generación de copies

Cada industria puede tener:

- aiContext.description
- aiContext.content_topics
- aiContext.recommended_tone
- aiContext.audience
- aiContext.content_formats
- aiContext.keywords

Fallback oficial:

`DEFAULT_AI_CONTEXT`

Objetivo:
- evitar prompts vacíos
- mantener calidad IA estable
- evitar errores runtime
- mejorar personalización SaaS

---

# Industry Suggestions Runtime

Sistema evolutivo de sugerencias de industrias.

Objetivo:
- detectar nichos reales
- mejorar onboarding
- aprender industrias emergentes
- mejorar cobertura IA

Persistencia oficial:
PostgreSQL

Tabla:
`industry_suggestions`

Estados:
- pending
- approved
- rejected

El onboarding nunca debe romperse si falla suggestions.

---

# Bug Histórico Detectado

Se detectó duplicación de loaders frontend en:

- OnboardingWizard.tsx
- businesses.tsx

Esto causaba:
- orden inconsistente
- cache desincronizado
- comportamiento ambiguo
- riesgo de regressions
- diferencias entre pantallas

Solución aplicada:
centralización completa en:

`src/lib/industryCatalog.ts`

---

# Regla Arquitectónica

Nunca duplicar loaders compartidos.

Todos los catálogos frontend deben usar:
- loaders centralizados
- cache centralizado
- normalización centralizada
- source of truth única

Patrón oficial:

`src/lib/*`

---

# Validaciones Realizadas

- build frontend validado
- onboarding validado
- business profile validado
- cache validado
- order runtime validado
- deploy Vercel validado
- industries API validada
- suggestions API validada
- fallback UX validado
- localStorage validado
- persistencia PostgreSQL validada
- frontend centralizado validado

---

# Riesgos

- categorías duplicadas dañan UX
- categorías ambiguas dañan IA
- demasiadas categorías dañan onboarding
- subcategorías inconsistentes dañan segmentación
- loaders duplicados generan comportamiento ambiguo
- cache desincronizado genera inconsistencias visuales
- cambios frontend sin invalidar cache pueden mostrar datos viejos

---

# Futuro

- panel admin categorías
- analytics por industria
- IA suggestions
- auto clustering
- industrias dinámicas
- subcategorías dinámicas
- IA runtime adaptativo
- categorías automáticas por demanda
- clustering semántico IA
- scoring comercial por industria
- tendencias por país/ciudad
- recomendaciones automáticas onboarding

---

# Decisiones Arquitectónicas

Se descartó:
- persistencia JSON temporal
- loaders duplicados
- fetches aislados
- cache local por componente

Arquitectura oficial:
- backend centralizado
- frontend centralizado
- PostgreSQL como source of truth
- runtime IA desacoplado
- cache frontend controlado

---

# QA Obligatorio

Validar siempre:

- onboarding
- business profile
- orden categorías
- subcategorías
- cache frontend
- refresh navegador
- localStorage
- multiusuario
- build frontend
- deploy frontend
- deploy backend
- fallback UX
- industries suggestions
- PostgreSQL persistence
- comportamiento post-refresh
```

---

# Custom Subindustry Governance Runtime

## Objetivo

Permitir que un negocio use subcategorías personalizadas
sin contaminar automáticamente el catálogo global.

Ejemplo:

- "Relojes de lujo"
- "Mampostería"
- "Merengón"

Estas subcategorías:
- pueden ser útiles para IA,
- ayudan onboarding,
- mejoran personalización,
- pero NO deben aprobarse globalmente automáticamente.

---

# Arquitectura Oficial

## Catálogo global

Source of truth oficial:

`src/catalogs/industries.py`

Solo contiene:
- categorías aprobadas
- subcategorías aprobadas
- taxonomía oficial

Nunca agregar automáticamente sugerencias aquí.

---

## Runtime híbrido

### Global

- catálogo oficial
- compartido entre usuarios

### Local por negocio

Cada negocio puede usar:
- subcategorías personalizadas
- aunque todavía no estén aprobadas globalmente

Persistencia:
- CSV legacy runtime
- `subIndustry`

Compatibilidad:
- onboarding legacy
- prompts IA existentes
- hydration actual
- approval queue actual

---

# Suggestions Runtime

Persistencia oficial:
`industry_suggestions`

Nuevas columnas:

- `type`
- `parent_industry`

Tipos soportados:

- industry
- subindustry

Ejemplo:

```txt
type = subindustry
parent_industry = Arquitectura & Espacios
```

---

# UX Runtime

## Industria personalizada

Puede:
- enviarse como suggestion
- quedar pending
- revisarse después

---

## Subindustria personalizada

Puede:
- enviarse como suggestion
- quedar pending
- usarse inmediatamente por el negocio actual

NO debe:
- aparecer automáticamente para otros negocios
- contaminar catálogo global
- romper onboarding legacy

---

# Ownership

## Frontend

`SubIndustryMultiSelect.tsx`

Responsabilidades:
- multi-select runtime
- custom suggestions UX
- persistencia CSV compatible
- dropdown adaptive runtime
- onboarding UX

---

## Backend

`industry_suggestions.py`

Responsabilidades:
- deduplicación
- request_count
- governance queue
- persistence PostgreSQL
- lifecycle pending/approved/rejected

---

# Regla Arquitectónica Crítica

NO promover automáticamente suggestions a catálogo oficial.

Toda aprobación global debe pasar por:
- governance
- revisión manual
- validación IA
- validación UX
- validación taxonomy

---

# Riesgo Conocido

`subIndustry` sigue siendo CSV legacy runtime.

NO migrar todavía a:
- arrays
- json
- relaciones complejas

Sin validar antes:
- hydration
- onboarding
- prompts IA
- businesses viejos
- analytics
- approval queue
- multiusuario
- runtime IA

---

# QA Obligatorio

Validar siempre:

- onboarding
- reload
- persistencia custom
- suggestions DB
- request_count
- deduplicación
- multiusuario
- dropdown UX
- modal overflow
- fallback UX
- cache runtime
- deploy frontend
- deploy backend