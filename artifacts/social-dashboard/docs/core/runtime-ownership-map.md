# 🚀 Runtime Ownership Map — HazPost

⚠️ IMPORTANTE

Este documento define:

- runtime ownership REAL actual
- source of truth por dominio
- boundaries sensibles
- estado legacy vs moderno
- riesgos de duplicación
- estado de migración

NO asumir arquitectura solamente por:
- frontend
- backend
- archivo madre
- snippets aislados

Validar siempre contra:
- runtime real
- app.py
- dashboard.tsx
- Network F12
- Railway logs
- persistencia real
- documentación oficial

---

# 🎯 OBJETIVO

HazPost actualmente opera con:

- runtime híbrido
- coexistencia legacy + moderna
- orchestration distribuida
- service layer parcial
- lifecycle sensible

Este documento existe para evitar:

- duplicación de source-of-truth
- ownership ambiguo
- migraciones peligrosas
- regressions
- lifecycle inconsistente

---

# 🧠 DOMINIOS Y OWNERSHIP

| Dominio | Runtime actual | Source of truth actual | Estado | Riesgo |
|---|---|---|---|---|
| Analyze onboarding | `/api/analyze-website` | app.py legacy runtime | híbrido | alto |
| Analyze moderno | `/api/businesses/<id>/analyze-website` | mixed runtime | transición | medio |
| Website analysis service | `website_analysis_service.py` | future source-of-truth | scaffold | medio |
| Dashboard orchestration | `dashboard.tsx` | frontend runtime coordinator | crítico | crítico |
| Polling | dashboard runtime | runtime híbrido | sensible | alto |
| Approval lifecycle | current orchestration | runtime actual | híbrido | alto |
| Publish lifecycle | inline orchestration | runtime actual | sensible | alto |
| imageVariants | posts contract | current runtime | estable | crítico |
| Branding intelligence | mixed runtime | parcial | transición | medio |
| Prompt governance | mixed runtime | parcial | transición | medio |
| Generate first post | `generate_first_post()` | orchestration runtime | crítico | crítico |

---

# ⚠️ ÁREAS SENSIBLES — NO REFACTOR AGRESIVO

NO mover agresivamente todavía:

- dashboard.tsx
- polling
- approval lifecycle
- publish lifecycle
- hydration
- retries
- imageVariants lifecycle
- onboarding persistence
- generate_first_post orchestration

Estas áreas actualmente contienen:
- orchestration real
- lifecycle distribuido
- bridges híbridos
- sincronización frontend/backend
- ownership implícito

---

# ✅ SAFE EXTRACTION AREAS

Áreas relativamente seguras para consolidación progresiva:

- scraping
- metadata extraction
- logo detection
- color extraction
- normalization
- AI helper utilities
- prompt fragments

---

# 🚀 DIRECCIÓN ARQUITECTÓNICA ACTUAL

Objetivo actual:

- consolidar ownership
- reducir duplicación
- centralizar IA progresivamente
- mantener compatibilidad legacy
- evitar romper lifecycle
- reducir complejidad accidental

NO objetivo actual:

- rewrite completo
- microservicios
- refactor masivo
- mover todo a services rápidamente

---

# 📌 ESTRATEGIA CORRECTA

La estrategia correcta actual es:

## CONSOLIDACIÓN PROGRESIVA

Primero:
- ownership claro
- boundaries claros
- reutilización progresiva
- extracción de lógica pura

Después:
- consolidación runtime
- reducción orchestration accidental
- migración gradual a service layer

---

# ⚠️ IMPORTANTE

El mayor riesgo actual NO es:

- Flask
- React
- Railway
- Vercel
- PostgreSQL

El mayor riesgo actual es:

# duplicación de source-of-truth
# ownership ambiguo
# lifecycle híbrido inconsistente
