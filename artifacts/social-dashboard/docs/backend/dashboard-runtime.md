# 🚨 DASHBOARD RUNTIME — HAZPOST

⚠️ DOCUMENTO OFICIAL DEL DASHBOARD BACKEND RUNTIME

Archivo principal documentado:

• hazpost-backend/src/dashboard.py

⚠️ IMPORTANTE

Este archivo actualmente contiene múltiples sistemas críticos centralizados.

NO modificar sin validar impacto completo.

============================================================
RESPONSABILIDADES DEL ARCHIVO
=============================

Este runtime maneja:

• posts,
• approval queue,
• image variants,
• retry image,
• overlays,
• publish flows,
• Instagram publishing,
• social accounts,
• schedule,
• spellcheck,
• media,
• fonts,
• caption addons,
• alerts,
• y compatibilidad frontend legacy.

============================================================
SISTEMAS SENSIBLES
==================

ÁREAS CORE:

• /posts
• /posts/<id>
• /retry-image
• /approve
• /publish
• /publish-now
• imageVariants
• selectedImageVariant
• overlay params
• regenerate hashtags
• reorder slides

============================================================
SOURCE OF TRUTH
===============

Persistencia oficial:

• PostgreSQL

Frontend runtime:
• React state.

⚠️ IMPORTANTE

localStorage:
• NO es source of truth.

============================================================
RIESGOS IMPORTANTES
===================

RIESGOS SENSIBLES:

• contaminación multi-business,
• pérdida de variants,
• overwrite accidental,
• hydration conflictiva,
• selected variant inválida,
• imageVariants null,
• race conditions,
• retry inconsistente,
• persistencia parcial,
• y compatibilidad frontend rota.

============================================================
CONTRATOS OBLIGATORIOS
======================

POSTS:

Todo post debe tener:

• id
• status
• createdAt
• imageVariants[]

⚠️ IMPORTANTE

imageVariants:
• nunca debe ser null.

============================================================
IMAGE VARIANTS
==============

El sistema depende críticamente de:

• normalize_variants
• create_overlay_variant
• select_variant
• reorder_variants
• delete_variant

⚠️ IMPORTANTE

Cambios aquí pueden romper:

• approval queue,
• overlays,
• preview frontend,
• retry image,
• y persistencia visual.

============================================================
RETRY IMAGE
===========

Retry image:

• genera imagen REAL,
• sube imagen REAL,
• crea variante REAL,
• persiste DB REAL,
• y actualiza frontend REAL.

⚠️ IMPORTANTE

NO hacer fake retries.
NO hacer placeholders falsos.

============================================================
INSTAGRAM PUBLISH
=================

El runtime maneja:

• media container,
• media publish,
• social default account,
• y persistencia post-publicación.

⚠️ IMPORTANTE

Validar siempre:

• access token,
• instagram_business_account_id,
• ownership usuario,
• y publicación real.

============================================================
VALIDACIONES OBLIGATORIAS
=========================

Antes de cerrar cambios validar:

• create post,
• edit post,
• reload,
• refresh,
• retry image,
• overlays,
• reorder slides,
• publish Instagram,
• approval queue,
• multi-business,
• multiusuario,
• persistencia DB,
• y comportamiento post deploy.

============================================================
ANTI-PATTERNS PROHIBIDOS
========================

NO:

• duplicar ownership,
• crear imageVariants paralelas,
• romper selectedImageVariant,
• asumir runtime frontend,
• crear fake persistence,
• hacer fixes visuales únicamente,
• ni modificar dashboard runtime sin validar flujo completo.

============================================================
REGLA FINAL
===========

dashboard.py es actualmente uno de los archivos más sensibles del backend.

Toda modificación debe:

• preservar estabilidad,
• evitar regresiones,
• validar runtime real,
• respetar source of truth,
• y mantener aislamiento multi-business.
