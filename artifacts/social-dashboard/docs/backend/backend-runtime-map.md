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
