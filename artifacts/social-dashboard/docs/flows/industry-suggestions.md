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

Backend:
- app.py
- src/catalogs/industry_suggestions.py
- src/db.py

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

# Decisiones arquitectónicas

Se descartó persistencia en JSON porque:
- Railway filesystem no es persistente
- no escala multi-instancia
- no permite analytics reales
- no permite métricas de demanda
- no permite admin workflows
- no permite automatización IA futura

PostgreSQL queda como arquitectura oficial.