# 🚀 RUNTIME SYSTEM MAP — HAZPOST

⚠️ Este documento representa el mapa operativo REAL del sistema.
NO es roadmap.
NO es visión futura.
NO es marketing.

Este documento existe para:

• entender el runtime real,
• reducir caos arquitectónico,
• evitar regresiones,
• identificar ownership,
• detectar dependencias sensibles,
• acelerar debugging,
• y mantener continuidad entre chats y desarrolladores.

============================================================
ESTADO GENERAL DEL PROYECTO
============================

HazPost es un SaaS IA de generación, optimización y publicación de contenido para redes sociales.

Arquitectura actual:

• Frontend:
  • React
  • Vite
  • TypeScript
  • Vercel

• Backend:
  • Python Flask
  • gunicorn
  • Railway

• DB:
  • PostgreSQL

============================================================
OBJETIVO PRINCIPAL ACTUAL
==========================

Prioridad actual del proyecto:

✅ generación IA de posts
✅ optimización de contenido
✅ approval queue
✅ publicación social
✅ multi-business
✅ onboarding inteligente
✅ brand profile

⚠️ Features futuras existen parcialmente pero NO son prioridad actual.

============================================================
CORE CRÍTICO DEL SISTEMA
=========================

⚠️ Estas áreas NO deben modificarse sin validar:

• frontend
• backend
• DB
• ownership
• persistencia
• multi-business
• polling
• runtime real
• approval flow completo

============================================================
AUTH / SESSION
================

Ownership principal:
• AuthContext
• Protected routes
• sesión backend
• cookies/sessions

Responsabilidades:

• login
• register
• persistencia sesión
• protección rutas privadas
• ownership usuario

Áreas sensibles:

• pérdida de sesión
• contaminación multiusuario
• cookies
• credenciales
• refresh runtime

============================================================
MULTI-BUSINESS
===============

Ownership principal:
• ActiveBusinessContext

Responsabilidades:

• business activo
• aislamiento entre negocios
• switching de negocio
• ownership de posts
• ownership de assets
• ownership IA

⚠️ CRÍTICO:
Nunca mezclar:
• posts,
• métricas,
• brand profile,
• assets,
• memoria IA,
• configuraciones,
entre negocios distintos.

============================================================
ONBOARDING
============

Documentación relacionada:
• docs/flows/onboarding.md

Responsabilidades:

• captura de identidad negocio
• industria
• subcategorías
• tono
• audiencia
• colores
• website
• redes sociales
• información comercial
• contexto IA

Principio crítico:

⚠️ La IA debe usar TODO el contexto disponible.

Mientras más información entregue el usuario:
• mejor copy,
• mejor CTA,
• mejor tono,
• mejor personalización,
• mejor contenido generado.

⚠️ Muchos negocios NO tienen website.
El sistema debe funcionar incluso sin website.

Fallbacks actuales esperados:

• colores neutrales si no hay branding
• blanco/negro como fallback seguro
• NO bloquear onboarding por falta de website

============================================================
BRAND PROFILE
===============

Ownership principal:
• components/brand-profile/*
• BusinessIdentityStep
• BrandProfileWizard

Responsabilidades:

• identidad negocio
• branding
• tono marca
• contexto comercial
• personalidad marca

⚠️ CRÍTICO:
Brand profile impacta directamente:
• generación IA
• captions
• hooks
• CTA
• tono
• estilo visual

============================================================
IA GENERATION
==============

Objetivo principal:

La IA NO debe sonar genérica.

Debe:
• vender,
• conectar emocionalmente,
• sonar humana,
• parecer negocio real,
• generar confianza,
• y producir contenido publicable.

La IA debe usar:
• onboarding,
• brand profile,
• negocio activo,
• contexto comercial,
• industria,
• audiencia,
• CTA,
• y señales futuras de performance.

============================================================
APPROVAL FLOW
===============

Sistema sensible.

Responsabilidades:

• revisión posts
• aprobación
• rechazo
• regeneración
• image variants
• polling

⚠️ Nunca devolver:
• posts incompletos
• estados ambiguos
• imageVariants null

============================================================
PUBLICACIÓN SOCIAL
===================

Objetivo:
• publicar contenido real
• manejar redes sociales reales

Estado:
⚠️ parcialmente implementado / en evolución

============================================================
FEATURES ESTABLES
==================

Actualmente existen páginas/features para:

• dashboard
• analytics
• billing
• calendar
• profile
• settings
• generate
• approval
• businesses
• pricing
• register/login

============================================================
FEATURES EXPERIMENTALES O EN PAUSA
===================================

⚠️ Estas áreas NO son prioridad actual:

• landing builder
• afiliados
• chatbot
• pruebas imágenes
• features exploratorias

Ejemplo:
• landing.tsx

Contexto:
La visión futura es permitir generación de landing pages con IA,
pero actualmente la prioridad es:
• posts
• generación IA
• approval
• publicación social

============================================================
UI SYSTEM
===========

Ownership:
• components/ui/*

Responsabilidades:

• componentes reutilizables
• sistema visual
• inputs
• modals
• dropdowns
• tables
• loaders
• toasts
• dialogs

⚠️ Cambios aquí impactan TODA la aplicación.

============================================================
PRINCIPIOS UX OFICIALES
========================

HazPost debe sentirse:

• extremadamente fácil,
• rápido,
• intuitivo,
• premium,
• emocional,
• humano,
• y usable incluso por usuarios no técnicos.

Objetivo UX:
“Que incluso un niño pueda usarlo.”

============================================================
REGLAS OPERATIVAS
==================

Antes de modificar cualquier área:

1. validar runtime real
2. revisar documentación existente
3. validar ownership
4. validar source of truth
5. revisar frontend + backend
6. validar persistencia real
7. detectar impacto multi-business
8. evitar regresiones

============================================================
DOCUMENTACIÓN
===============

⚠️ La documentación oficial es parte activa del sistema.

Antes de crear nueva documentación:
• revisar si ya existe documentación relacionada.

Nunca redefinir:
• ownership,
• arquitectura,
• source of truth,
sin revisar documentación previa.

============================================================
ESTADO ACTUAL DE MADUREZ
=========================

HazPost ya NO es un prototipo pequeño.

Actualmente ya tiene:

• múltiples flows
• múltiples contexts
• múltiples páginas
• onboarding complejo
• runtime multi-business
• arquitectura sensible
• features en distintas fases
• lógica IA contextual
• sistema UI compartido

⚠️ A partir de este punto:
la claridad arquitectónica y documental es crítica.
