# Industry Suggestions Flow

## Objetivo

Permitir que usuarios sugieran nuevas industrias cuando el catálogo actual no cubre correctamente su negocio.

Esto ayuda a:
- mejorar cobertura del onboarding,
- detectar nuevos nichos,
- mejorar IA,
- priorizar industrias reales,
- construir inteligencia comercial SaaS.

---

# Flujo actual

Usuario escribe nueva industria →
frontend llama `/api/industries/suggestions` →
backend normaliza nombre →
PostgreSQL guarda sugerencia →
si ya existe:
- incrementa `request_count`
- actualiza `updated_at`

Admin revisa:
- pending
- approved
- rejected

Frontend:
- OnboardingWizard.tsx
- industryCatalog.ts
- BusinessIdentityStep.tsx
- businesses.tsx

Backend:
- app.py
- src/catalogs/industry_suggestions.py
- src/db.py

---
# Frontend Runtime

Source of truth frontend:

`src/lib/industryCatalog.ts`

Funciones oficiales:
- fetchIndustryCatalog()
- sendIndustrySuggestion()

Responsabilidades:
- fetch centralizado
- normalización
- cache runtime
- localStorage
- fallback UX
- suggestions API

Nunca duplicar:
- loaders
- fetches
- cache
- normalización
- lógica runtime

---

# Cache Runtime

Cache key oficial:

`hz_industry_catalog_v1`

TTL:
- 1 hora

Capas:
- memoria runtime
- localStorage

Objetivo:
- mejorar velocidad onboarding
- evitar requests repetidos
- mantener UX fluida

Si el catálogo cambia y frontend sigue mostrando datos viejos:

```js
localStorage.removeItem("hz_industry_catalog_v1")
location.reload()
```

---

# Bug Histórico Detectado

Se detectó duplicación de loaders frontend en:

- OnboardingWizard.tsx
- businesses.tsx

Esto causaba:
- orden inconsistente
- cache desincronizado
- comportamiento ambiguo
- riesgo de regresiones

Solución aplicada:
centralización completa en:

`src/lib/industryCatalog.ts`

---

# Regla Arquitectónica

Nunca duplicar loaders compartidos.

Todos los catálogos frontend deben consumir:
- loaders centralizados
- cache centralizado
- normalización centralizada
- source of truth única

Patrón oficial:

`src/lib/*`

Los componentes nunca deben consumir
`/api/industries`
directamente.

---

# Tabla PostgreSQL

PostgreSQL es la source of truth oficial para industry suggestions.
No usar archivos JSON temporales para persistencia.

Industry suggestions NO deben depender de:
- archivos JSON
- memoria runtime
- filesystem Railway
- variables temporales

La única source of truth válida es PostgreSQL.

## industry_suggestions

Campos:

- id
- name
- normalized_name
- status
- source
- user_id
- business_id
- request_count
- created_at
- updated_at

---

# Reglas

- `normalized_name` debe ser único
- evitar duplicados
- onboarding nunca debe romperse si falla suggestions
- `request_count` incrementa automáticamente
- status default = `pending`
- source default = `onboarding`
- nunca mezclar sugerencias entre usuarios
- nunca eliminar métricas históricas de request_count
- onboarding debe seguir funcionando aunque falle PostgreSQL
- el usuario nunca debe perder el progreso del onboarding
- sugerir industria no debe bloquear creación de negocio
- fallback UX obligatorio si falla endpoint

---

# Estados

## pending
Industria pendiente de revisión.

## approved
Industria aprobada para convertirse en categoría oficial.

## rejected
Industria descartada o ya cubierta por otra categoría existente.

---

# Validaciones realizadas

- Persistencia PostgreSQL validada
- request_count validado
- anti-duplicados validado
- multi-request validado
- onboarding validado
- endpoint `/api/industries/suggestions` validado
- frontend centralizado validado
- cache runtime validado
- order runtime validado
- localStorage invalidation validado
- onboarding runtime validado
- BusinessIdentityStep validado
- build frontend validado
- deploy frontend validado

---

# Roadmap futuro

## Admin panel
`/admin/industry-suggestions`

## Telegram alerts
Alertar nuevas industrias populares.

## Approval automation
Convertir automáticamente categorías aprobadas.

## IA runtime
Generar:
- prompts
- hooks
- hashtags
- CTAs
- subcategorías sugeridas

---

# Riesgos conocidos

- Railway Data UI puede cachear columnas visualmente
- usar queries SQL para validar columnas nuevas
- evitar depender de visual refresh de Railway

---

# Decisiones arquitectónicas

Se descartó persistencia en JSON porque:
- Railway filesystem no es persistente
- no escala multi-instancia
- no permite analytics reales
- no permite métricas de demanda
- no permite admin workflows
- no permite automatización IA futura

PostgreSQL queda como arquitectura oficial.