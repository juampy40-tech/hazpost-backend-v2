# Backend Runtime Map — HazPost

⚠️ IMPORTANTE

Este documento describe:
- ownership,
- responsabilidades,
- source of truth,
- riesgos,
- dependencias,
- y arquitectura runtime del backend principal de HazPost.

NO reemplaza:
- código real,
- Railway,
- PostgreSQL,
- logs,
- runtime real,
- ni validación real.

Siempre validar contra:
- app.py real,
- src/,
- Railway,
- DB,
- Network F12,
- y comportamiento real.

---

# Runtime principal actual

Archivo principal:
- hazpost-backend/app.py

Stack:
- Python
- Flask
- Gunicorn
- PostgreSQL
- OpenAI
- Cloudflare R2

Deploy:
- Railway

Responsabilidad:
app.py actualmente funciona como orquestador central del backend.

Centraliza:
- auth,
- sessions,
- onboarding,
- businesses,
- IA,
- storage,
- uploads,
- APIs principales,
- approval flow bootstrap,
- text blocks,
- integrations,
- dashboard APIs,
- y bootstrap runtime.

---

============================================================
ÁREAS CORE SENSIBLES
============================================================

Las siguientes áreas son críticas y NO deben modificarse sin:
- revisar dependencias,
- validar frontend + backend,
- revisar persistencia real,
- validar Network F12,
- validar multi-business,
- y probar flujo completo.

Áreas sensibles:
- _require_authenticated_user_id
- login/register/session lifecycle
- brand_profile
- businesses
- set_active_business
- generate_first_post
- text_blocks
- storage uploads
- CORS
- TEMP_USER_DATA
- onboarding persistence
- anti-contamination logic

---

============================================================
AUTH SYSTEM
============================================================

Responsabilidad:
- login
- register
- sessions
- auth validation
- subscription bootstrap

Endpoints principales:
- /api/user/login
- /api/user/register
- /api/user/me
- /api/user/logout

Ownership:
- Flask session
- PostgreSQL user persistence

Regla crítica:
Toda sesión válida debe tener:
- authVersion = 2

Riesgo:
Sesiones viejas o mock pueden romper aislamiento multiusuario.

---

============================================================
BRAND PROFILE SYSTEM
============================================================

Responsabilidad:
- persistencia onboarding
- identidad negocio
- branding
- audiencia
- tono
- colores
- website
- onboarding progress

Endpoint principal:
- /api/brand-profile

Source of truth actual:
HÍBRIDO.

Prioridad:
1. PostgreSQL
2. session fallback
3. TEMP_USER_DATA legacy

⚠️ IMPORTANTE
Todavía existe compatibilidad legacy temporal.

Riesgo:
Cambios incorrectos pueden generar:
- contaminación entre negocios,
- mezcla de branding,
- persistencia inconsistente.

---

============================================================
ANTI-CONTAMINATION SYSTEM
============================================================

Responsabilidad:
Evitar mezcla de identidad entre negocios distintos.

Ubicación:
- brand_profile()

Lógica importante:
Si cambia companyName/name:
- limpiar branding incompatible viejo.

Campos limpiados:
- description
- audience
- colors
- logos
- tone
- subIndustries
- etc.

⚠️ IMPORTANTE
Esta lógica es CRÍTICA para multi-business.

NO remover sin validar:
- onboarding,
- business switching,
- approval queue,
- generación IA,
- refresh,
- reload,
- persistencia DB.

---

============================================================
BUSINESSES SYSTEM
============================================================

Responsabilidad:
- multi-business
- business isolation
- active business
- onboarding persistence
- ownership real

Endpoints:
- /api/businesses
- /api/businesses/<id>
- /set-active

Source of truth:
PostgreSQL.

⚠️ IMPORTANTE
Businesses es el ownership REAL actual del negocio.

BrandProfile todavía tiene compatibilidad temporal legacy.

Riesgo:
Modificar business switching sin entender compatibilidad legacy puede:
- contaminar branding,
- romper onboarding,
- romper generación IA,
- romper posts.

---

============================================================
GENERATE FIRST POST SYSTEM
============================================================

Responsabilidad:
Sistema IA principal actual.

Responsable de:
- captions
- hooks
- hashtags
- prompts IA
- visualPlan
- approval queue seed
- persistencia inicial de posts

Endpoint:
- /api/generate-first-post

Dependencias:
- OpenAI
- brandProfile
- businesses
- text blocks
- posts DB

⚠️ IMPORTANTE
Este sistema usa:
- industry
- subIndustries
- businessDescription
- audience
- tone
- business context

Riesgo:
Cambios incorrectos pueden:
- generar contenido genérico,
- contaminar escenarios visuales,
- romper coherencia negocio,
- degradar conversión.

---

============================================================
AI GENERATION RUNTIME — CORE SYSTEM
============================================================

⚠️ IMPORTANTE

generate_first_post() actualmente NO es solamente un endpoint simple.

Actualmente funciona como:

• AI orchestration engine,
• prompt governance layer,
• branding intelligence layer,
• visual generation orchestrator,
• anti-generic enforcement system,
• anti-repetition system,
• visual context selector,
• fallback orchestration layer,
• caption generation engine,
• visualPlan generator,
• y persistence bridge frontend/backend.

============================================================
AI PROMPT GOVERNANCE
============================================================

El sistema actualmente ya contiene reglas activas para evitar:

• contenido genérico,
• contaminación de contexto,
• escenarios repetitivos,
• sesgo residencial,
• branding incorrecto,
• visuales abstractos,
• y pérdida de identidad comercial.

============================================================
VISUAL INTELLIGENCE
============================================================

El sistema actualmente ya evalúa:

• industry,
• subIndustry,
• subIndustries,
• businessDescription,
• audience,
• tone,
• slogan,
• location,
• website,
• referenceImages,
• y branding context

para construir visual prompts coherentes con el negocio real.

============================================================
ARQUITECTURA ACTUAL
============================================================

Actualmente gran parte del AI orchestration runtime vive todavía inline dentro de app.py.

⚠️ IMPORTANTE

NO realizar refactors agresivos sin mapear primero:

• ownership IA,
• prompt dependencies,
• fallback lifecycle,
• visualPlan lifecycle,
• parsing lifecycle,
• y persistencia frontend/backend.

============================================================
ARQUITECTURA FUTURA
============================================================

La evolución futura debe migrar progresivamente hacia:

• AI services reutilizables,
• prompt builders centralizados,
• visual orchestration services,
• AI governance layers,
• y runtime IA modular.

La migración debe hacerse progresivamente.

NO romper:
• onboarding,
• approval,
• dashboard,
• visualPlan,
• image generation,
• ni persistencia actual.

============================================================
TEXT BLOCKS SYSTEM
============================================================

Responsabilidad:
Bloques comerciales reutilizables.

Ejemplos:
- CTA
- WhatsApp
- promociones
- disclaimers
- hooks

Endpoints:
- /api/text-blocks
- /api/caption-addons

Dependencia crítica:
generate_first_post()

---

============================================================
UPLOADS / STORAGE SYSTEM
============================================================

Responsabilidad:
- logos
- imágenes onboarding
- uploads branding

Stack:
- Cloudflare R2

Endpoints:
- /api/storage/uploads/request-url
- /api/storage/uploads/direct

Riesgo:
Modificar uploads puede romper:
- onboarding,
- branding,
- imágenes IA,
- persistencia visual.

---

============================================================
CORS SYSTEM
============================================================

Responsabilidad:
Permitir comunicación frontend/backend.

Configuración centralizada:
- DEFAULT_ALLOWED_ORIGINS
- _apply_cors()

⚠️ IMPORTANTE
No eliminar dominios existentes sin validar:
- producción,
- localhost,
- Vercel,
- staging.

---

============================================================
TEMP_USER_DATA
============================================================

⚠️ LEGACY TEMPORAL

Responsabilidad:
Persistencia temporal fallback.

Estado:
Temporal.

Objetivo futuro:
Eliminar gradualmente.

Riesgo:
No usar como source of truth definitivo.

---

============================================================
ANTI-PATTERNS
============================================================

❌ Agregar lógica nueva en app.py sin ownership claro.

❌ Duplicar source of truth.

❌ Crear fallback silencioso sin documentación.

❌ Romper compatibilidad legacy sin migración real.

❌ Asumir runtime sin validar Railway + frontend.

❌ Agregar persistencia híbrida sin documentarla.

❌ Modificar onboarding sin validar:
- refresh,
- reload,
- business switching,
- multiusuario.

---

============================================================
REGLAS ACTIVAS
============================================================

- Diagnóstico antes de modificar.
- Validar frontend + backend.
- Validar runtime real.
- NO asumir source of truth.
- Detectar ownership antes de tocar lógica.
- Evitar regresiones.
- Mantener arquitectura centralizada.
- Documentar descubrimientos importantes.
- Toda nueva arquitectura sensible debe documentarse.

---

============================================================
DOCUMENTACIÓN RELACIONADA
============================================================

Leer también:
- docs/core/project-constitution.md
- docs/core/source-of-truth.md
- docs/core/repository-map.md
- docs/flows/onboarding.md

---

============================================================
ESTADO ACTUAL
============================================================

Estado:
FUNCIONAL PERO EN TRANSICIÓN ARQUITECTÓNICA.

Actualmente:
- el backend funciona,
- pero todavía existen compatibilidades legacy,
- ownership híbridos,
- y zonas sensibles en migración progresiva.

Objetivo futuro:
- ownership más claros,
- separación modular,
- menor dependencia de app.py,
- documentación arquitectónica más madura,
- y reducción gradual de compatibilidad legacy.

============================================================
ANALYZE WEBSITE — RUNTIME REAL (CRÍTICO)
========================================

⚠️ HALLAZGO CRÍTICO — MAYO 2026

Durante debugging de contaminación de branding se confirmó que:

* existen múltiples implementaciones de analyze website,
* pero el runtime REAL activo en producción actualmente sigue dependiendo principalmente de Flask.

Endpoints involucrados:

* /api/analyze-website
* /api/businesses/<id>/analyze-website

⚠️ IMPORTANTE

Aunque existe lógica moderna en:

* artifacts/api-server/src/routes/analyze-website.ts

el flujo real de onboarding/business/profile actualmente sigue pasando por:

* hazpost-backend/app.py

y por lógica central Flask.

============================================================
PROBLEMA DETECTADO
==================

Se detectó contaminación de branding:

Ejemplos:

* ECO-COL reviviendo
* Cali reviviendo
* Fitness & Deporte reviviendo
* slogans legacy reapareciendo

Síntomas:

* analyzeWebsite generaba contexto incorrecto
* onboarding heredaba branding viejo
* IA mezclaba negocios

============================================================
CAUSA RAÍZ CONFIRMADA
=====================

NO era:

* OpenAI
* GPT
* localStorage principal
* frontend payload
* analyze request frontend

La causa raíz principal fue:

1. ownership híbrido
2. compatibilidad legacy
3. múltiples runtimes coexistiendo
4. contaminación en persistence/backend
5. lógica antigua Flask todavía activa

============================================================
DESCUBRIMIENTO CRÍTICO
======================

Los cambios realizados en:

* artifacts/api-server/src/routes/analyze-website.ts

NO impactaban completamente producción porque:

* Flask seguía siendo runtime principal del flujo onboarding/business analysis.

============================================================
REGLA OBLIGATORIA
=================

Antes de debuggear onboarding IA o analyzeWebsite:

SIEMPRE validar:

1. runtime real Railway
2. endpoint real respondiendo
3. backend ownership real
4. Network F12
5. logs Flask reales
6. source of truth real

NO asumir que artifacts/api-server controla producción.

============================================================
DECISIÓN ARQUITECTÓNICA FUTURA
==============================

Objetivo futuro:

* una sola lógica analyzeWebsite
* ownership único
* IA centralizada
* menos compatibilidad legacy
* menos dependencia de app.py
* eliminación gradual de duplicación Flask/TS

⚠️ IMPORTANTE

NO migrar agresivamente todavía.

Primero:

* estabilizar onboarding
* estabilizar anti-contamination
* estabilizar business ownership
* validar persistencia real
* validar multi-business
* validar generación IA real

Luego:

* modularizar
* centralizar
* eliminar duplicaciones runtime.

============================================================
MONOREPO TYPECHECK REALITY (MAY 2026)
============================================================

⚠️ HALLAZGO IMPORTANTE

Se validó `npm run build` a nivel monorepo completo.

Resultado:
el proyecto contiene deuda TypeScript histórica importante fuera de varios flujos CORE actuales.

============================================================
ARQUITECTURA FUTURA — WEBSITE ANALYSIS
======================================

La arquitectura objetivo confirmada es migrar progresivamente
toda la lógica analyzeWebsite hacia:

• src/services/website_analysis_service.py

Objetivos:

• single source of truth,
• reusable AI analysis engine,
• shared normalization,
• shared scraping,
• shared prompt building,
• shared AI parsing,
• y menor dependencia directa de app.py.

⚠️ IMPORTANTE

Actualmente:
• onboarding,
• business analyze,
• y branding analysis

todavía dependen parcialmente de lógica inline en app.py.

La migración debe hacerse progresivamente.

NO romper onboarding actual.

NO eliminar compatibilidad legacy prematuramente.

============================================================
REGLAS CRÍTICAS — WEBSITE ANALYSIS
==================================

NO duplicar lógica IA entre:

• onboarding,
• business profile,
• dashboard,
• onboarding wizard,
• ni futuras herramientas IA.

Toda lógica futura debe centralizarse progresivamente en:

• WebsiteAnalysisService

Primero migrar:

• prompt generation,
• normalization,
• parsing,
• scraping,
• y AI logic reusable.

Luego:
• consolidar rutas/runtime.


============================================================
CONCLUSIONES
============================================================

Los errores detectados NO fueron causados por:

* onboarding fixes recientes
* anti-contamination fixes
* analyzeWebsite fixes
* AI isolation fixes
* scheduler fixes recientes

Los fixes recientes sí mejoraron:

* business isolation
* onboarding consistency
* anti-brand contamination
* analyzeWebsite routing
* business-aware generation

============================================================
ÁREAS CON MAYOR DEUDA TS
============================================================

Se detectó deuda TypeScript especialmente en:

* admin/*
* affiliate/*
* referrals/*
* support/*
* social/posts.ts
* auth typings
* drizzle/sql typings
* nullable handling legacy
* OTP typings
* legacy social routes

============================================================
REALIDAD ACTUAL
============================================================

El monorepo actualmente:

* NO debe considerarse completamente type-safe
* contiene migraciones parciales
* tiene typings híbridos legacy/modernos
* mezcla runtime Flask + módulos TS modernos

Sin embargo:

* runtime principal sigue funcionando
* Railway continúa iniciando
* frontend continúa operativo
* onboarding sigue funcional
* generación IA sigue operativa

============================================================
REGLA OBLIGATORIA
============================================================

NO intentar corregir toda la deuda TypeScript en una sola sesión.

Priorizar SIEMPRE:

1. runtime funcional
2. onboarding
3. AI generation
4. approval queue
5. publishing
6. scheduler
7. multi-business isolation
8. persistence correctness

============================================================
ESTRATEGIA FUTURA
============================================================

La deuda TypeScript debe corregirse:

* gradualmente
* por módulos
* con validación runtime real
* sin romper CORE
* sin refactors masivos simultáneos

⚠️ IMPORTANTE

TypeScript limpio NO garantiza:
* estabilidad SaaS,
* UX correcta,
* ni aislamiento multi-business.

Priorizar siempre:
* comportamiento real,
* persistencia real,
* y runtime real.

============================================================
WEBSITE ANALYSIS RUNTIME SPLIT (MAY 2026)
============================================================

⚠️ HALLAZGO IMPORTANTE

Se confirmó que actualmente existen DOS implementaciones activas/parciales de website analysis:

1. Legacy onboarding analyze endpoint
2. Modern business analyze endpoint

============================================================
LEGACY ONBOARDING ANALYZE
============================================================

Endpoint:
`/api/analyze-website`

Estado:
LEGACY / MVP compatibility runtime.

Características:

* usa templates hardcoded
* NO usa OpenAI contextual analysis real
* devuelve:
  - descriptions genéricas
  - tone genérico
  - colores fallback
* onboarding todavía depende parcialmente de este flujo

Ejemplo de síntomas detectados:

* "Tu negocio es un negocio..."
* tone = "cercano"
* primaryColor = "#2563eb"

⚠️ IMPORTANTE

Este endpoint fue confundido inicialmente con el analyze moderno,
lo cual generó debugging incorrecto sobre:
- GPT
- prompts
- frontend hydration
- contaminación IA

============================================================
MODERN BUSINESS ANALYZE
============================================================

Endpoint:
`/api/businesses/<id>/analyze-website`

Estado:
runtime moderno IA real.

Características:

* usa OpenAI
* usa branding context
* usa slogan
* usa industry
* usa audience
* usa logos/reference images
* genera branding mucho más contextual

============================================================
DECISIÓN ARQUITECTÓNICA
============================================================

Dirección futura confirmada:

Centralizar website analysis en:

`hazpost-backend/src/services/website_analysis_service.py`

Objetivos:

* source of truth único
* shared scraping
* shared prompt building
* shared normalization
* shared OpenAI analysis
* evitar lógica analyze duplicada

⚠️ IMPORTANTE

NO migrar agresivamente onboarding todavía.

Primero:
- estabilizar onboarding lifecycle
- estabilizar business ownership
- estabilizar anti-contamination
- validar multi-business runtime real

Luego:
- reutilizar servicio centralizado desde ambos endpoints.
