# Migration Plan — HazPost

============================================================
OBJETIVO
============================================================

Definir estrategia oficial de migración progresiva del runtime HazPost.

⚠️ IMPORTANTE

HazPost actualmente usa arquitectura híbrida.

NO realizar:
- refactors agresivos,
- migraciones masivas,
- ni modularización apresurada.

La prioridad actual es:
- estabilidad,
- lifecycle,
- hydration,
- ownership,
- multi-business isolation,
- y reducción de regresiones.

============================================================
ESTADO ACTUAL REAL
============================================================

Actualmente coexisten:

------------------------------------------------------------
RUNTIME LEGACY
------------------------------------------------------------

Incluye:

- /api/analyze-website
- onboarding fallback runtime
- TEMP_USER_DATA
- session bridges
- branding temporal onboarding
- persistence parcial legacy

------------------------------------------------------------
RUNTIME MODERNO
------------------------------------------------------------

Incluye:

- PostgreSQL businesses
- active business runtime
- generate_first_post()
- approval runtime
- image variants
- scheduling
- contextual AI
- GPT business analyze
- business isolation

============================================================
WEBSITE ANALYZE — ESTADO REAL
============================================================

Actualmente existen DOS runtimes separados.

------------------------------------------------------------
1. ONBOARDING ANALYZE (LEGACY)
------------------------------------------------------------

Endpoint:

- /api/analyze-website

Características:

- deterministic fallback
- onboarding UX helper
- NO GPT contextual real
- branding limitado
- runtime legacy parcial

⚠️ IMPORTANTE

Todavía participa en onboarding REAL.

NO remover todavía.

------------------------------------------------------------
2. BUSINESS ANALYZE (MODERNO PARCIAL)
------------------------------------------------------------

Endpoint:

- /api/businesses/<id>/analyze-website

Características:

- GPT analysis
- contextual branding
- audience context
- colors
- logos
- visual intelligence
- business-aware prompts

============================================================
CENTRALIZATION STRATEGY
============================================================

Objetivo oficial:

Centralizar progresivamente:

- scraping
- prompt generation
- normalization
- AI analysis
- contextual analysis
- branding extraction

en:

- src/services/website_analysis_service.py

============================================================
CURRENT SERVICE STATUS
============================================================

website_analysis_service.py actualmente:

⚠️ ES CONTRATO SOLAMENTE

Todavía NO reemplaza:
- onboarding analyze runtime
- business analyze runtime

Actualmente contiene:

- architecture contract
- migration target
- future source of truth

============================================================
MIGRATION RULES
============================================================

La migración debe ser:

- progresiva
- reversible
- compatible
- validada
- sin romper lifecycle

============================================================
PROHIBIDO
============================================================

NO hacer:

- mover toda lógica fuera de app.py agresivamente
- eliminar analyze legacy rápido
- duplicar prompts
- duplicar normalization
- romper onboarding runtime
- romper anti contamination
- romper hydration
- romper approval runtime
- romper imageVariants persistence

============================================================
MIGRATION ORDER
============================================================

ORDEN CORRECTO:

1. Extraer normalization
2. Extraer scraping
3. Extraer prompt builders
4. Extraer AI parsing
5. Reutilizar desde endpoints
6. Validar runtime real
7. Migrar gradualmente ownership

============================================================
VALIDACIONES OBLIGATORIAS
============================================================

Antes de cualquier migración validar:

- onboarding
- generate post
- approval queue
- retry image
- hydration
- polling
- active business
- multi-business isolation
- PostgreSQL persistence
- session runtime
- Railway logs
- frontend hydration
- refresh/reload

============================================================
OBJETIVO FINAL
============================================================

Objetivo futuro:

- AI runtime centralizado
- scraping centralizado
- normalization centralizada
- ownership claro
- menos duplicación
- menos runtime ambiguo
- menos bridges legacy

SIN romper:

- onboarding UX
- lifecycle actual
- approval runtime
- persistence real
- ni business isolation
