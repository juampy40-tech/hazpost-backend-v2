# ECO-COL Social Media Manager

## Overview

Full-stack social media management platform for eco-col.com — a Colombian company specializing in solar energy, EV charger installation, and EV tax benefits. The platform uses AI to generate and schedule Instagram (@eco.sas) and TikTok (@eco.col) content.

pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Object Storage**: Replit GCS-backed Object Storage (for image hosting — needed by Instagram Graph API)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (API server), Vite (frontend)
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2 for text, gpt-image-1 for images)
- **Scheduler**: node-cron (every 5 min + daily at 6am Bogotá timezone, Monday-AM avoidance)

## Structure

```text
artifacts/
├── api-server/         # Express API server (port 8080)
│   ├── src/routes/social/  # niches, posts, social-accounts, publish-log, settings, oauth
│   ├── src/routes/storage.ts # Object Storage upload/serve endpoints
│   ├── src/lib/objectStorage.ts # GCS client wrapper
│   ├── src/services/       # ai.service, instagram.service, tiktok.service, scheduler.service
│   └── src/app.ts          # All routes mounted at /api
├── social-dashboard/   # React+Vite frontend (port dynamic)
│   ├── src/pages/          # dashboard, calendar, approval, generate, niches, history, settings
│   ├── src/components/     # layout with sidebar navigation
│   └── vite.config.ts      # Proxy: /api → http://localhost:8080
└── hazpost-monitor/    # Python+Flask monitor service for hazpost.app (port 5000)
    ├── app.py              # Entry point — Flask app + APScheduler (runs all jobs)
    ├── src/
    │   ├── scanner.py      # Scrapes hazpost.app every 6h, extracts skills
    │   ├── duplicados.py   # Fuzzy deduplication (>80% threshold, thefuzz)
    │   ├── telegram_alerts.py # All Telegram notifications (new/missing skills, down, backup, brute-force)
    │   ├── monitor.py      # Pings hazpost.app every 5min, detects downtime / slow responses >2s
    │   ├── security.py     # Security headers (CSP, X-Frame, HSTS), rate limiting, brute-force detection
    │   ├── seo.py          # Meta tags, OG, JSON-LD, sitemap.xml, robots.txt generation
    │   └── backup.py       # Daily 2AM backup of data/, logs/, .env → 30-day retention
    ├── templates/
    │   ├── index.html      # Dashboard home page
    │   └── skills.html     # Skills list + fusion history (auto-refreshed)
    ├── data/skills_auto.json  # Skills state, last_scan, fusion_history
    ├── requirements.txt    # Python dependencies (Flask, APScheduler, thefuzz, etc.)
    └── .env.example        # All required env vars documented

lib/
├── api-spec/           # OpenAPI spec + Orval codegen config
├── api-client-react/   # Generated React Query hooks
├── api-zod/            # Generated Zod schemas
├── db/                 # Drizzle ORM schema + DB connection
│   └── src/seed/music.ts  # Standalone seed script for SoundHelix music library (pnpm seed:music)
└── integrations-openai-ai-server/ # OpenAI client wrapper
```

## Authentication & Multi-Tenancy

- **Auth system**: JWT (30-day tokens) stored exclusively in httpOnly cookie (`eco_token`). All API calls use `credentials: "include"` — no Bearer tokens or localStorage token storage.
- **JWT secret**: `TOKEN_ENCRYPTION_KEY` env var (fallback: `JWT_SECRET`)
- **Routes**: `POST /api/user/register`, `POST /api/user/login`, `POST /api/user/logout`, `GET /api/user/me`, `GET /api/user/bootstrap`
- **Admin routes**: `GET /api/user/admin/users`, `PUT /api/user/admin/users/:id`
- **First-user bootstrap**: First registered user → `role=admin`, `plan=agency`; auto-claims all `null`-userId records
- **Route protection**: All `/api/*` routes require JWT except `/api/user/*` and `/api/auth/*`
- **Frontend**: `AuthContext` detects hasUsers on load; redirects to `/register` if no users, `/login` if not authenticated
- **Admin panel**: `/admin` page (admin-only) — user list, plan management, activate/deactivate

## Database Schema

Tables: `users`, `subscriptions`, `niches`, `posts`, `image_variants`, `social_accounts`, `publish_log`, `app_settings`

- **users**: `id`, `email`, `passwordHash`, `displayName`, `role` (admin/user), `plan` (free/starter/business/agency), `isActive`, `createdAt`
- **subscriptions**: `id`, `userId`, `plan`, `status`, `creditsRemaining`, `creditsTotal`, `periodEnd`
- **niches**: Market niches (name, description, keywords, active, userId)
- **posts**: Social media posts (nicheId, platform, contentType, slideCount, caption, hashtags, status, scheduledAt, userId, etc.)
- **image_variants**: AI-generated image variants per post (base64, style: photorealistic/graphic/infographic; carousel posts get one variant per slide)
- **social_accounts**: Instagram/TikTok credentials (accessToken, pageId, connected, userId)
- **publish_log**: Publication history (postId, platform, status, postUrl, errorMessage)
- **app_settings**: Key-value app configuration

## Post Status Flow

`draft` → `pending_approval` (after bulk generate) → `scheduled` (after user approval) → `published`/`failed` (after scheduler runs)

## Key Features

- **Bulk Generation**: Generate 15/30 days of content; select content types (image, reel, carousel) and platforms
- **Content Types**: image (static), reel (vertical video 9:16), carousel (3-5 slides) — each with platform-optimized prompts
- **Geographic Focus**: All AI prompts target Cali + Valle del Cauca (Yumbo, Jamundí, Candelaria, Palmira)
- **Approval Queue**: Review/edit posts with content-type badge; carousel shows slide count
- **Content Calendar**: Monthly/weekly view with type icons (▶ reel, ⊞ carousel)
- **Market Niches**: Manage content categories (5 pre-seeded niches, all focused on Cali region)
- **Image Variants**: 2 AI styles for image/reel; per-slide variants for carousels
- **Auto Publishing**: node-cron scheduler publishes at 7am/12pm/7pm Bogotá time
- **Timezone Architecture**: DB stores UTC; admin always sees America/Bogota; users see their country's timezone. Centralized in `artifacts/api-server/src/lib/timezone.ts`. Column `users.timezone` (IANA string, nullable — resolved dynamically from `brand_country` if null). Skill: `.agents/skills/timezone-rules/SKILL.md`
- **Social Connections**: Meta Business API (Instagram) + TikTok Content Posting API

## API Endpoints

All under `/api`:
- `GET/POST /niches`, `GET/PUT/DELETE /niches/:id`
- `GET/POST /posts`, `POST /posts/generate-bulk`
- `GET/PUT/DELETE /posts/:id`, `POST /posts/:id/approve`, `POST /posts/:id/reject`
- `POST /posts/:id/regenerate-caption`, `POST /posts/:id/generate-image-variant`
- `GET/PUT /social-accounts`, `POST /social-accounts/:platform/test`
- `GET /publish-log`
- `GET/PUT /settings`

## Design

- Dark glassmorphism UI: near-black background (#0A0F0D), emerald green (#00C853) / electric blue (#00B0FF) accents
- Fonts: Space Grotesk (headings), Inter (body)
- Framer Motion animations on all state changes

## Default Niches (pre-seeded)

1. Paneles Solares Residenciales
2. Cargadores Vehículos Eléctricos
3. Beneficios Tributarios VE Colombia
4. Energía Solar Empresarial
5. Movilidad Sostenible Colombia

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **API codegen** — `pnpm --filter @workspace/api-spec run codegen`
- **DB push** — `pnpm --filter @workspace/db run push`

---

## Preferencias del usuario — Estilo visual aprobado

> Aprendidas en sesión de diseño (abril 2026). Aplicar por defecto al sugerir o generar imágenes.

### Tipografía en imagen (headline)
- **Tamaño favorito**: **SM** (escala 0.050 del ancho, ~28 chars/línea) — texto pequeño y elegante, no ocupa toda la imagen
- **Estilo**: Sin preferencia fija aún, pero aprobó resultados con todos los estilos disponibles
- El texto debe verse limpio y no saturar la imagen de fondo

### Tagline de marca (ECO-COL.COM · CALI, COLOMBIA)
- **Layout aprobado**: `[══] ECO-COL.COM · CALI, COLOMBIA [══]` — centrado horizontalmente
- **Dos rayas azules** (gradiente #0077FF → #00C2FF → #0077FF) simétricas a izquierda y derecha del texto
- Tagline **siempre presente** en los 7 estilos (Cinema, Neon, Bloque, ECO, Duotono, Titanio, Editorial)
- Para SM: multiplicador de tagFontSz = **0.50** (más grande relativo al headline para ser legible)

### Imágenes limpias
- **Sin badges de estilo** en la imagen descargada/publicada (se eliminó el `styleLabel` SVG)
- La diferenciación de estilo es **solo en la UI**: bordes de color por estilo en el grid de variantes
  - No seleccionada: borde tintado al 31% de opacidad del color de estilo
  - Seleccionada: borde brillante + doble glow

### Flujo de trabajo preferido
- **Biblioteca de Fondos**: reutilizar backgrounds DALL-E ya generados para nuevos posts (sin costo adicional)
  - Fondos ordenados: sin usar primero (badge verde "Nuevo"), usados con contador "Nx usado"
  - Filtro "Sin usar" para encontrar rápidamente fondos frescos
- **Mismo fondo**: cambiar tipografía/logo sin regenerar la imagen de fondo
- **Logo**: posición top-right por defecto; color blanco sobre fondos oscuros

### Paleta y marca
- Colores primarios: `#0077FF` (azul ECO), `#00C2FF` (cian)
- Fondo app: navy oscuro HSL 222 47% 6%
- Logo: `eco-logo-white.png`, `eco-logo-blue.png`, `eco-logo-icon.png` en `/assets/`

### Colores de estilo (para UI — NO aparecen en imagen final)
| Estilo     | Color hex |
|------------|-----------|
| Cinema     | #F59E0B   |
| Neon       | #22D3EE   |
| Bloque     | #EF4444   |
| ECO        | #0077FF   |
| Duotono    | #A855F7   |
| Titanio    | #94A3B8   |
| Editorial  | #F1F5F9   |

## Landing Pages — Características actuales

- **Sección de vehículos EV**: Para landings tipo `alianza`/`ev`, la plantilla incluye sección `#vehiculos` con tarjetas Deepal S05 Ultra 620 ($108M) y S07 Ultra 630 ($120M), tabla comparativa vs concesionario, y badges de ahorro ($35M/$60M).
- **ECO_EV_PRESET**: Preset fijo para landings "Alianza ECO + Carros Eléctricos" con contenido detallado de Deepal S05/S07 y FAQ específico.
- **Editor visual inline**: Añadir `?edit=true` a cualquier URL `/lp/:slug` activa el editor. Toolbar flotante con Save/Export HTML/Versiones/Salir. Elementos texto tienen `contenteditable`. Save llama a `PATCH /api/landings/:id/html`. Triple-click en footer también activa el editor.
- **Endpoints clave**: `PATCH /api/landings/:id/html` (guardar HTML editado), `POST /api/landings/:id/regenerate` (reconstruir HTML con plantilla actual).
- **Dashboard**: Cada tarjeta de landing tiene botón "Editor visual" (link `?edit=true`), "Regenerar HTML" y botón de generación de imagen hero.

## Funcionalidades implementadas (abril 2026)

- **T001 Login móvil + forgot password**: ForgotPasswordDialog en login.tsx, reset-password.tsx, `/api/user/forgot-password` + `/api/user/reset-password`, password_reset_tokens table, font-size 16px en inputs móviles
- **T002 Deduplicación biblioteca fondos**: rawBackgroundHash en image_variants, `DELETE /api/reels/slide-library/:id` soft-delete, AlertDialog confirmación en backgrounds.tsx
- **T003 Selector tipografía + filtros imagen**: `overlayFont` state en approval.tsx, selector 6 fuentes (Auto/Bebas/Oswald/Montserrat/Playfair/Roboto), `resolveOverlayFontPreset()` en ai.service.ts, `applyOverlays()`/`compositeLogoOnImage()` aceptan `overlayFont`, 8 filtros de imagen (warm/cool/dramatic/vintage/dark/vivid/haze)
- **T004 Guías API en Settings**: pestaña "📋 Guías" con instrucciones step-by-step para Instagram Business, TikTok for Business y Facebook cross-posting
- **T005 Facebook/WhatsApp + errores**: manejo graceful del error #200 de FB, botón "Compartir por WhatsApp" con wa.me link, `GET /api/health/status`, widget estado sistema en dashboard
- **T006 Wompi Payments**: billing.ts con `POST /api/billing/checkout`, `GET /api/billing/plans`, `POST /api/billing/webhook`, pricing.tsx
- **T007 Onboarding wizard**: onboarding.tsx (652 líneas), wizard 5 pasos, mostrado al primer login (onboardingStep < 5)
- **Per-platform scheduling**: `scheduledAtInstagram`/`scheduledAtTiktok` en DB + API + frontend (2 date pickers cuando platform="both")
- **Bulk actions calendario**: modo selección con checkboxes, barra flotante de acciones (Eliminar/Pendiente/Programar), AlertDialog de confirmación, botón "Todo" para seleccionar todos

## Preferencias del usuario

- **Recordar republicar**: Siempre sugerir al usuario que republique la app (`suggest_deploy`) al final de cada sesión de cambios.
- **Confirmar producción activa**: Después de cada republicación, confirmar explícitamente que el deploy quedó activo y en producción. No asumir — siempre cerrar el ciclo con el usuario.
- **UX no técnica — REGLA CRÍTICA**: Esta app la usan personas sin conocimientos de programación ni diseño gráfico. Toda nueva función, pantalla o mensaje debe ser autoexplicativo. Aplicar siempre: (1) textos descriptivos en cada sección explicando para qué sirve, (2) notas contextuales con asterisco cuando algo requiere atención especial, (3) evitar jerga técnica en la UI, (4) estados vacíos con mensaje amigable y acción clara, (5) acciones destructivas con confirmación antes de ejecutar. Si algo no es obvio para un usuario no técnico, se le agrega texto de ayuda.
