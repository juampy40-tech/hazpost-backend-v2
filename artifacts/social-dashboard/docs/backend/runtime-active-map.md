# Runtime Active Map — HazPost

============================================================
OBJETIVO
============================================================

Este documento describe el runtime ACTIVO REAL actual de HazPost.

⚠️ IMPORTANTE

La arquitectura actual es híbrida.

Coexisten:
- runtime legacy,
- runtime moderno,
- bridges temporales,
- persistencia híbrida,
- y migraciones progresivas.

La documentación NO reemplaza:
- runtime real,
- logs,
- Network,
- Railway,
- Vercel,
- ni PostgreSQL.

============================================================
BACKEND RUNTIME REAL
============================================================

Archivo principal:

- hazpost-backend/app.py

Actualmente controla:

- auth runtime
- onboarding runtime
- AI generation runtime
- website analyze runtime
- business runtime
- storage runtime
- compatibility runtime
- session runtime
- hydration bridges
- anti contamination logic

⚠️ IMPORTANTE

app.py NO es bootstrap simple.

Actualmente funciona como:
- orchestration layer,
- runtime coordinator,
- y compatibility runtime.

NO modularizar agresivamente sin validar lifecycle completo.

============================================================
DASHBOARD RUNTIME
============================================================

Runtime real actual:

- hazpost-backend/src/dashboard_routes.py

⚠️ IMPORTANTE

dashboard.py ya NO existe como runtime activo principal.

dashboard_routes.py actualmente controla:

- approval runtime
- retry image runtime
- scheduling
- overlays
- image variants
- publish orchestration
- reorder runtime
- selected variant persistence
- Instagram publish
- caption addons

============================================================
WEBSITE ANALYZE RUNTIMES
============================================================

Actualmente existen DOS runtimes distintos.

------------------------------------------------------------
1. LEGACY ONBOARDING ANALYZE
------------------------------------------------------------

Endpoint:

- /api/analyze-website

Características:

- fallback determinístico
- branding simple
- NO GPT real
- NO scraping avanzado
- onboarding UX helper
- runtime legacy parcial

Actualmente genera textos tipo:

"Tu negocio es un negocio de productos y servicios..."

⚠️ IMPORTANTE

Este runtime todavía participa en onboarding real.

NO remover agresivamente.

------------------------------------------------------------
2. MODERN BUSINESS ANALYZE
------------------------------------------------------------

Endpoint:

- /api/businesses/<id>/analyze-website

Características:

- GPT analysis
- branding context
- audience context
- colors
- logos
- business context
- visual analysis
- contextual AI

============================================================
WEBSITE ANALYSIS SERVICE
============================================================

Archivo:

- hazpost-backend/src/services/website_analysis_service.py

Estado actual:

⚠️ CONTRATO SOLAMENTE

Actualmente:
- NO es runtime activo principal
- NO reemplaza analyze endpoints todavía

Objetivo futuro:

- centralizar scraping
- centralizar prompts
- centralizar normalization
- centralizar AI analysis
- evitar duplicación IA

Migración debe ser:
- progresiva,
- controlada,
- sin romper onboarding,
- sin romper approval runtime.

============================================================
PERSISTENCE REAL
============================================================

PRIMARY SOURCE OF TRUTH:

- PostgreSQL

Especialmente:

- businesses
- posts
- imageVariants
- scheduling
- approval
- active business

------------------------------------------------------------
LEGACY / TEMPORARY LAYERS
------------------------------------------------------------

Todavía existen:

- TEMP_USER_DATA
- session bridges
- onboarding temporary persistence
- compatibility hydration

⚠️ IMPORTANTE

NO asumir que todo ya está migrado.

============================================================
MULTI-BUSINESS ISOLATION
============================================================

Source of truth:

- business_id

NO confiar en:
- React local state
- stale hydration
- localStorage ambiguo
- onboarding state viejo
- caches no reseteados

============================================================
FRONTEND RUNTIME REAL
============================================================

Frontend actual funciona como:

- hydration-driven runtime
- orchestration frontend
- multi-business runtime
- AI contextual runtime
- lifecycle-sensitive frontend

------------------------------------------------------------
CRITICAL FILES
------------------------------------------------------------

dashboard.tsx
- orchestration layer
- approval coordinator
- hydration coordinator
- polling boundary

OnboardingWizard.tsx
- onboarding runtime
- AI ingestion
- branding runtime
- localStorage bridge
- onboarding persistence

useBusinessPosts.ts
- anti contamination boundary
- hydration gate
- business isolation enforcement

AuthContext.tsx
- auth hydration
- session synchronization
- query cleanup
- anti contamination reset

ActiveBusinessContext.tsx
- active business runtime
- business switching
- backend synchronization

============================================================
CRITICAL RISKS
============================================================

RIESGOS MÁS IMPORTANTES ACTUALES:

- romper hydration
- romper ownership híbrido
- romper anti contamination
- romper onboarding lifecycle
- romper approval runtime
- romper imageVariants persistence
- romper business isolation
- crear múltiples source of truth

============================================================
REGLA CRÍTICA
============================================================

NO hacer:
- refactors agresivos,
- simplificaciones grandes,
- migraciones masivas,
- ni limpieza de runtime
sin validar:

- frontend
- backend
- DB
- polling
- hydration
- persistence
- Railway
- Vercel
- Network
- multi-business runtime
