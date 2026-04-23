---
name: eco-social-manager
description: Full context for the ECO Social Manager project — a full-stack AI social media management platform for ECO (Energy Capital Operation, eco-col.com, Cali, Colombia). Use this skill whenever working on this project to understand architecture, key patterns, DB rules, endpoints, and feature state.
---

# ECO Social Manager — Contexto Completo del Proyecto

## Empresa
**ECO — Energy Capital Operation** | eco-col.com | Cali, Colombia
- Instala paneles solares, cargadores de vehículos eléctricos y combos de ambos
- Redes: Instagram @eco.sas · TikTok @eco.col · Facebook (vinculada a IG via Meta)
- Término correcto: "carro eléctrico" (NO VE/EV)
- WhatsApp: 301 1285672 | Tagline: "Cali pone el sol, ¡ECO la solución!"
- Mall Puerto 125 = cliente notable (@puerto125cali)

## Stack Técnico
| Capa | Tecnología |
|------|-----------|
| Backend | Express + TypeScript + esbuild (`artifacts/api-server`) |
| Frontend | React + Vite + Tailwind + shadcn/ui (`artifacts/social-dashboard`) |
| DB | PostgreSQL + Drizzle ORM (`lib/db/src/schema/`) |
| AI text | `gpt-5.2` (captions) · `gpt-4o-mini` (spell-check only) |
| AI image | `gpt-image-1` (1024×1024 o 1024×1536) |
| Compositing | `sharp` en `ai.service.ts` |
| Object Storage | Replit Object Storage (para URLs públicas que Meta pueda descargar) |

**BASE_PATH**: `/` (raíz)  
**DB push**: `cd lib/db && pnpm run push`

## Archivos clave
```
artifacts/api-server/src/
  app.ts                           → Límites de body, router mounting
  routes/index.ts                  → uploadBodyParser (10 MB global / 120 MB en upload routes)
  routes/social/posts.ts           → Todos los endpoints de posts
  routes/social/analytics.ts       → Endpoints de analytics e insights
  services/ai.service.ts           → generateCaption, rethemeCaption, evaluateCaptionImprovements,
                                     generatePostImage, applyOverlays, generateCarouselSlides, etc.
  services/scheduler.service.ts    → Cron de publicación y generación automática
lib/db/src/schema/
  posts.ts                         → postsTable
  image_variants.ts                → imageVariantsTable (6 columnas overlay)
  niches.ts, social_accounts.ts, publish_log.ts, app_settings.ts
artifacts/social-dashboard/src/pages/
  approval.tsx                     → Página de aprobación (~2200 líneas)
  analytics.tsx                    → Estadísticas + panel "¿Qué está funcionando?"
  backgrounds.tsx, calendar.tsx, settings.tsx
```

## Horarios de publicación (Bogotá = UTC-5, sin DST)
- **OPTIMAL_HOURS** (Bogotá): 8h, 12h, 18h → UTC: 13, 17, 23
- SIEMPRE usar `setUTCHours()` — NUNCA `setHours()` o `toLocaleString()`
- **Días feed Instagram**: lun, mié, vie, sáb (days 1,3,5,6)
- **Días feed TikTok**: mar, jue, sáb, dom (days 2,4,6,0)

## Overlay metadata — CRÍTICO
Toda inserción en `imageVariantsTable` DEBE incluir las 6 columnas:
```
overlayLogoPosition · overlayLogoColor · overlayCaptionHook
overlayTextStyle · overlayTextPosition · overlayTextSize
```
Legacy variants sin estos campos hacen fallback a defaults en el endpoint de aprobación.

## Reglas de tamaño de imagen
| Platform | ContentType | Generado | Post-Processing |
|----------|-------------|----------|-----------------|
| instagram / both | reel / story | 1024×1536 | `cropTo4by5()` → 1024×1280 |
| tiktok only | reel / story | 1024×1536 | ninguno |
| cualquiera | image / carousel | 1024×1024 | ninguno |

Helpers: `shouldCropTo4by5(contentType, platform)` · `cropTo4by5(base64)`

## Carousel / slideOrder
- `slideOrder`: array de TODOS los variant IDs en orden (sin filtrar)
- `previewSlideId`: ID del slide activo en el phone preview
- `lastInitPostId` ref: evita re-inicializar al cambiar post
- Videos: `variant.mimeType?.startsWith("video/")` → renderizar `<video>` no `<img>`
- Raw uploads: `style = "raw_upload"`, MIME real en `mimeType`

## Flujo "Subir fondo" (add-raw-slide)
1. Upload → `/api/media` → recibe `mediaId`
2. `POST /api/posts/:id/add-raw-slide` → agrega a `slideOrder`, actualiza `previewSlideId`
3. Llama `refreshCurrentPost()` en el frontend

## Endpoints — Posts (`routes/social/posts.ts`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/posts` | Lista (usar `?slim=1` para evitar base64 pesado) |
| GET | `/api/posts/:id` | Full post con imageData |
| POST | `/api/posts/generate-bulk` | Genera captions + programa (imágenes en BG) |
| POST | `/api/posts/:id/approve` | Aprueba → status=scheduled |
| POST | `/api/posts/:id/reject` | Rechaza (slot NO se libera) |
| POST | `/api/posts/:id/regenerate-caption` | Nuevo caption mismo tema |
| POST | `/api/posts/:id/apply-suggestion` | Edita caption con instrucción |
| POST | `/api/posts/:id/generate-image-variant` | Nueva variante de imagen |
| POST | `/api/posts/:id/reorder-slides` | Reordena slideOrder |
| POST | `/api/posts/:id/add-raw-slide` | Agrega foto/video como slide raw |
| POST | `/api/posts/:id/evaluate-caption` | Score 1-10 + sugerencias (no modifica) |
| POST | `/api/posts/:id/retheme` | **CAMBIA EL TEMA** — body: `{ topic: string }` |
| DELETE | `/api/posts/:id` | Elimina y reordena slots subsiguientes |

## Endpoints — Analytics (`routes/social/analytics.ts`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/analytics/summary` | Resumen general (overview, byPlatform, byContentType, topPosts) |
| GET | `/api/analytics/content-insights` | Ranking formatos, top 3 hooks, trend %, mejor día |
| POST | `/api/analytics/sync-metrics` | Sincroniza likes/reach desde Instagram API |
| POST | `/api/analytics/refresh-audience` | Snapshot de audiencia Instagram |
| GET | `/api/analytics/audience-insights` | Online followers + demographics |

## AI Learning System
```typescript
fetchTopPerformingCaptions(n)  // Top N captions por (likes + saves*2 + comments) / reach
getPerformanceContext()        // Insight en lenguaje natural (mejor formato, mejor día, tendencia)
```
Ambos se inyectan en el system prompt de TODA generación de captions.

## Funciones AI relevantes (`ai.service.ts`)
| Función | Descripción |
|---------|-------------|
| `generateCaption(niche, platform, contentType)` | Caption nuevo (mismo tema del niche) |
| `rethemeCaption(topic, platform, contentType)` | Caption completamente nuevo sobre NUEVO TEMA |
| `evaluateCaptionImprovements(caption, platform, ct)` | Score + sugerencias (no modifica) |
| `applySuggestion(caption, suggestion)` | Edita caption con instrucción del usuario |
| `generatePostImage(...)` | Genera imagen + composita logo y texto |
| `applyOverlays(rawBg, params)` | Re-composita rawBackground con nuevos overlay params |
| `generateCarouselSlides(...)` | Genera N slides para carousel |

## Paneles en la UI de Aprobación (`approval.tsx`)
| Panel | Trigger | Descripción |
|-------|---------|-------------|
| Ortografía | Automático | Spell-check del headline (gpt-4o-mini) |
| "Analizar caption con IA" | Botón 🔍 | Score 1-10 + 2-3 sugerencias concretas |
| **"Cambiar tema del post"** | Botón 🪄 (naranja) | Textarea → genera caption nuevo sobre nuevo tema |

### Flujo "Cambiar tema":
1. Usuario abre panel naranja "Cambiar tema del post"
2. Escribe resumen del nuevo tema (max 500 chars)
3. Clic "Generar nuevo caption" → `POST /api/posts/:id/retheme` → preview
4. "Usar este caption" → `setEditedCaption(newCaption)` + invalidate queries
5. Usuario revisa en el editor y aprueba

## Panel Analytics "¿Qué está funcionando?" (`analytics.tsx`)
- Fetch a `/api/analytics/content-insights` en `useEffect` al montar
- Con datos: ranking formatos (medallas + barras), top 3 hooks, mejor día tile, trend tile
- Sin datos: guía al usuario a ingresar métricas

## Panel Analytics "Análisis de Hashtags" (`analytics.tsx` + `analytics.ts`)
- Fetch a `GET /api/analytics/hashtag-insights` en el mismo `useEffect` al montar
- **Estado frecuencia** (sin métricas): cloud de hashtags por categoría con colores + leyenda de pools
- **Estado engagement** (con métricas): barras por engagement rate + tier badge (⭐ Siempre usar / 🧪 Probar / ⚠️ Revisar) + breakdown por pool
- 5 pools: `brand` (ECO marca), `local` (Cali), `solar`, `ev` (carro eléctrico), `trending`
- Tipo `HashtagInsights`: `{ hasData, hasEngagementData, totalPostsWithHashtags, totalUniqueTags, top[], byPool[] }`

## Video Generation (`reel.service.ts` + `reels.ts`)

### 1. Multi-shot Dynamic Reel (9:16 → Reels/Stories)
- **Función**: `generateReelForVariant(variantId)` — 5 crop windows distintos sobre imagen 3× escalada (3072×3840), hard cuts entre tomas, 20s total (75+50+75+125+175 frames = 500 @ 25fps)
- **Input priority**: `originalRawBackground` > `tiktokImageData` > `imageData`
- **Output**: 1080×1920 MP4 H.264 CRF 26
- **Endpoints**: `POST /api/reels/variants/:variantId/generate` · `GET .../url` · `GET .../status`
- **DB**: columna `reel_object_path text` en `image_variants`
- **UI**: botón morado "🎬 Generar Video Reel" — solo aparece si `contentType === "reel" | "story"` y NO es video

### 2. Carrusel-Video desde variantes del post (4:5 → Feed)
- **Función**: `generateCarouselVideoForPost(postId)` — toma todos los `imageData` de las variantes, 5s/slide (125 frames), zoom 1.0→1.06 (texto legible), output 1080×1350
- **Endpoint**: `POST /api/reels/posts/:postId/carousel`
- **UI**: botón azul "🎞 Carrusel como Video" — aparece en TODOS los tipos de post (cuando hay imageData)

### 3. 🎬 Reel Studio — mezcla libre de fuentes con transiciones + música (4:5 → Feed)
- **Función**: `generateCarouselVideoFromImages(images, { transition?, music? })` — recibe array de base64 (máx 10), escala+pad cada imagen a 1080×1350, 5s/slide, zoom 1.0→1.06
- **`CarouselTransition`** — 30+ efectos organizados en grupos:
  - **⭐ Populares**: `wipeleft` (📖 Libro — DEFAULT), `zoomin` (🔍 Zoom), `circleopen` (⭕ Círculo), `pixelize` (🟫 Pixel), `hblur` (💨 Blur), `dissolve` (✨), `hardcut` (✂️)
  - **📖 Página**: `wiperight`, `smoothleft`, `smoothright`, `coverleft`, `coverright`, `revealleft`, `revealright`
  - **⚡ Explosión**: `circleclose`, `squeezev`, `squeezeh`, `vertopen`, `horzopen`
  - **🌀 Geométrico**: `radial`, `diagtl`, `diagtr`, `wipetl`, `wipetr`
  - **🌬 Viento**: `hlwind`, `hrwind`, `vuwind`, `vdwind`
  - **🎞 Fade**: `fadeblack`, `fadewhite`, `fadegrays`, `slideleft`, `slideright`
  - xfade params: duración 0.4s, offset_i = (i+1) × 4.6s. Duración total = (n-1)×4.6+5
- **Música** (`music` param en endpoint + servicio `ensureMusicTrack`):
  - `"none"` (default) — sin música
  - `"electronica"` — Night Owl by Broke for Free (FMA, ~7.8MB MP3), chill electronic
  - `"corporativa"` — drone sintetizado via ffmpeg `aevalsrc` (110+165+220Hz, echo+lowpass)
  - Mezcla: `mixAudioIntoVideo()` — vol 0.28, loop audio, atrim, afade out último 1.5s, aac 128k
  - Cache: `/tmp/eco-music/`
- **Endpoint**: `POST /api/reels/carousel-from-images` — body `{ slides: [{b64?, variantId?}], transition?, music? }` (backward compat: también acepta `{ images: string[] }`)
  - Resuelve `variantId` → `imageData` automáticamente desde DB usando `inArray`
- **Endpoint biblioteca**: `GET /api/reels/slide-library?limit=48` — retorna thumbnails 120px @ q40 + metadata + ER% para todos los variants con imageData
- **UI Reel Studio** — panel colapsable con:
  - **3 pestañas**: 📸 Este post (DEFAULT), 📚 Biblioteca, 📤 Subir
  - **Selector música** (🔇/⚡/🏢) — verde cuando seleccionada
  - **Selector transición** — 7 botones populares por defecto; botón "Ver todos" expande 5 categorías más
  - **Lista slides**: reordenable ↑↓, eliminable ✕, duración en tiempo real
- **Estado key**: `studioSlides`, `studioTransition`, `studioMusic`, `studioTab`, `showMoreTransitions`

### 4. 📱 "Publicado manualmente" — marcar reels subidos a mano
- **Botón**: "📱 Publicado manualmente (reel/video subido a mano)" en panel de acciones de aprobación
- **Función**: `handleMarkManualPublish()` → `updatePost.mutate({ status: "published" })` → post sale de la cola
- **UI**: botón sutil de altura 9 (h-9), texto xs, hover verde esmeralda — no compite con Aprobar/Rechazar
- **Caso de uso**: usuario genera reel en Reel Studio → descarga → sube manualmente en Instagram/TikTok app → clic aquí para cerrar el loop en el sistema

### 5. Selector de tipo de publicación (badge clickable)
- **Ubicación**: header de la página de aprobación, junto al contador "Revisando X de N"
- **Tipos**: 📷 Imagen / 🎞 Carrusel / 🎬 Reel / 📖 Historia — pills horizontales
- **Acción**: `updatePost.mutate({ contentType: t.id })` — llamada directa, sin confirmación
- **Estado activo**: coloreado (azul=reel, secondary=carrusel, violeta=historia, blanco=imagen)

## Credenciales Meta (en `social_accounts` table, cifradas)
- FB Page ID: `356577317549386`
- IG Business Account ID: `17841465780948955`
- FB App ID: `985574667482965`
- Token válido ~60 días (última renovación: abril 3 2026)
- **Facebook siempre publica junto a Instagram** usando el mismo Page Access Token

## Niches activos
1. Paneles solares residenciales
2. Cargadores de carro eléctrico (NO VE/EV)
3. Combo paneles + cargador carro eléctrico

## Plantilla de marca (en `BRAND_TEMPLATE` de `ai.service.ts`)
- 7 secciones: Hook → Contexto → Solución → CTA → Simulador → Contacto → Tagline
- Cierra siempre: `"Cali pone el sol, ¡ECO la solución! ✨"`
- Línea simulador OBLIGATORIA: `"🌐 Simula GRATIS cuánto ahorras en: www.eco-col.com"`
- Hashtags: asignados automáticamente por `pickHashtags()`, string vacío en el payload

## Notificaciones Telegram (`telegram.service.ts`)
- **Bot**: @eco_social_alerts_bot | token guardado en `app_settings.telegram_bot_token` (masked)
- **Chat ID**: `app_settings.telegram_chat_id` — detección automática vía `POST /api/settings/detect-telegram-chat-id`
- Endpoints: `POST /api/settings/test-telegram`, `POST /api/settings/detect-telegram-chat-id`
- **Mensajes HTML ricos** con íconos, preview del caption, plataformas y timestamp Bogotá
- **3 tipos de notificación**:
  - `notifyPostPublished()` → ✅ éxito con plataformas, ⚠️ parcial si alguna falló
  - `notifyPostFailed()` → ❌ fallo total con detalle del error
  - `notifyAutoGenerated()` → 🤖 auto-generación completada
- Hooks en `scheduler.service.ts`: disparan `.catch(logger.warn)` — nunca bloquean el flujo
- Settings UI: panel azul Telegram en Configuración — Token (enmascarado), Chat ID + botón lupa auto-detect, botón "Enviar prueba", guía colapsable

## Investigación Instagram Reels 2025 (aplicar al generar contenido)
- **Señal #1 del algoritmo**: Watch time (Adam Mosseri confirmado). Primer 1.7s CRÍTICO.
- **Señal #2 (alcance no-seguidores)**: Sends/DM shares — más que likes. Diseñar para compartir.
- **Interacciones**: Reels +55% vs imagen única; +29% vs video estándar (Emplifi 2025).
- **Transiciones más efectivas 2025**: Smooth Zoom > Whip Pan > Swipe > Spin > Page flip.
  - Page/book flip = efecto libro tendencia en TikTok/Reels (implementado con `xfade=wipeleft`).
- **Slides óptimos**: 3-5 slides para efecto libro. Hook en slide 1 (número impactante).
- **Música para ECO** (energía solar/EV en Cali): Electronic/ambient con beat drop en 2-3s.
  - NO reggaetón (entretenimiento). SÍ: beats instrumentales corporativos-cinéticos.
- **ER fórmula**: `(likes + saves×2 + comments) / reach × 100`

## Renovación automática token Meta
- **Cron**: diario a las 11:00 Bogotá → `checkAndRenewMetaToken()` en `scheduler.service.ts`
- **Lógica**: verifica `tokenExpiresAt` en cuentas Instagram. Si quedan ≤ 15 días → llama `fb_exchange_token` con `meta_app_id`/`meta_app_secret` de `app_settings` → actualiza token IG+FB del mismo userId
- **Alertas Telegram**: 🔄 renovado / ⚠️ expiring_soon (sin credenciales) / ❌ renewal_failed
- **Endpoint manual**: `POST /api/social-accounts/meta/refresh-token` (admin only) → botón "🔄 Renovar ahora" en Settings → Cuentas Sociales → Instagram
- **Nota**: token expira ~junio 2026 (último setup: 3 abril 2026 = ~60 días). El cron empezará a alertar ~15 días antes.

## Aislamiento multi-tenant — AUDITADO (abril 2026)
- **posts.ts**: ✅ `scopeFilter()` → `eq(postsTable.userId, req.user.userId)` si no-admin
- **analytics.ts**: ✅ scoped por userId; sync-metrics solo admin
- **brand-profile.ts**: ✅ todas las rutas usan `eq(brandProfilesTable.userId, userId)`
- **billing.ts**: ✅ scoped por user.userId en checkout y status
- **social-accounts.ts**: ✅ `ownerUserId` scope en `getTikTokAccount`, `testInstagramConnection`, etc.
- **CORS, Helmet, rate limiting**: ✅ ya implementados desde antes
- **Publicación por negocio (Task #125)**: ✅ `getInstagramAccount(userId, businessId)` fail-closed; `publishPost()` propaga `businessId` completo por toda la cadena; `syncPublishedPostMetrics` y `refreshInstagramAudience` iteran cuentas por negocio

### Skills relevantes para trabajo en publicación o bugs de tenant
| Cuándo | Skill a cargar |
|--------|---------------|
| Trabajar en publicación a IG/TikTok/FB, modificar scheduler, sospechar que posts van a cuenta equivocada | `.agents/skills/business-publishing-isolation/SKILL.md` |
| Detectar que un usuario ve datos de otro usuario diferente | `.agents/skills/cross-user-contamination/SKILL.md` |
| Detectar que un negocio ve datos de otro negocio del mismo usuario | `.agents/skills/cross-business-contamination/SKILL.md` (si existe) |
| Corregir cualquier bug recurrente o patchy — para garantizar que el fix es centralizado | `.agents/skills/code-quality/SKILL.md` (sección 9: Correcciones Centralizadas) |
| Agregar features, esquemas, migraciones o cambios que deben estar en producción desde el día 1 | `.agents/skills/production-first/SKILL.md` |

## Roadmap Completado (abril 8 2026)
- **Forgot Password / Reset Password**: POST /api/user/forgot-password, POST /api/user/reset-password, tabla password_reset_tokens, página reset-password.tsx, fix font-size móvil ≥16px
- **Deduplicación biblioteca fondos**: rawBackgroundHash en image_variants, papelera con AlertDialog en backgrounds.tsx y approval.tsx, POST /api/backgrounds/deduplicate
- **Selector tipografía + filtros imagen**: overlayFont y overlayFilter en DB, 8 filtros sharp (warm/cool/dramatic/vintage/dark/vivid/haze/none), dropdown 15+ estilos en approval.tsx
- **Upload tipografía propia**: botón "Aa · Subir mi tipografía" (TTF/OTF/WOFF), GET /api/fonts, auto-selección al subir
- **Upload jingle propio**: botón "🎙 Subir jingle" en Música de fondo de approval.tsx
- **Guías API en Settings**: pestaña "📋 Guías" con Instagram Business, TikTok, Facebook + badge Conectado/Sin configurar
- **WhatsApp sharing**: botón wa.me en approval.tsx
- **GET /api/health/status**: widget estado sistema en dashboard
- **Wompi Payments**: POST /api/billing/checkout, GET /api/billing/plans, POST /api/billing/webhook, página /pricing, widget sidebar créditos
- **Onboarding wizard 5 pasos**: mostrado al primer login en onboarding.tsx

## Tipografías embebidas en imágenes (abril 7 2026)
- **PROBLEMA RESUELTO**: servidor Linux solo tenía 8 fuentes DejaVu → todas las imágenes se veían iguales
- **4 TTF descargados en `artifacts/api-server/assets/`**: BebasNeue-Regular.ttf, Oswald-Bold.ttf, Montserrat-ExtraBold.ttf, PlayfairDisplay-Bold.ttf
- **Helper `resolveEmbeddedFont(textStyle)`**: mapea cada estilo a su grupo de fuente y devuelve `@font-face` CSS + `font-family`
- **Helper `fontFaceDataUri(name, b64)`**: genera el bloque `@font-face` completo como data URI
- **Lazy loaders**: `getBebasFontB64()`, `getOswaldFontB64()`, `getMontserratFontB64()`, `getPlayfairFontB64()` — leen TTF del disco una vez y cachean en memoria
- **Todos los bloques SVG actualizados**: `cinema/neon/bloque/bebas` → BebasNeue; `oswald/fjalla/barlow/anton/titanio/duotono` → Oswald; `playfair/editorial/ptserif` → PlayfairDisplay; `montserrat/raleway/poppins/nunito/lato/sourcesans/exo2/rajdhani/roboto` → Montserrat; `eco` → Inter (WOFF2 ya existente)
- **Cada bloque SVG inyecta** `<style>${embeddedFontCss}</style>` en `<defs>` y usa `font-family="${embeddedFontFamily}"`

## Checkpoint de referencia estable
- Commit `91bbce90` — estado sólido al 4 de abril 2026
- **Checkpoint abril 7 2026** — todas las fuentes embebidas en SVG, roadmap completo
- Telegram notifications: abril 4 2026
- Hashtag analysis: abril 4 2026
- Video Reels Ken Burns: abril 4 2026
- Multi-shot Dynamic Reel (5 tomas, hard cuts, 20s): abril 4 2026
- Carrusel-Video desde variantes del post (azul): abril 4 2026
- Carrusel-Video desde imágenes propias (morado, subida multi-imagen + reordenamiento): abril 4 2026
- Reel Studio con tab "Este post" + transiciones xfade (wipeleft/dissolve/slideleft/fadeblack): abril 4 2026
- **30+ transiciones xfade en 5 categorías (Populares/Página/Explosión/Geométrico/Viento/Fade): abril 4 2026**
- **Selector de música en Reel Studio (Electrónica FMA + Corporativa drone): abril 4 2026**
- **Botón "Publicado manualmente" para cerrar loop de reels subidos a mano: abril 4 2026**
- **Selector de tipo de publicación clickable en header de aprobación: abril 4 2026**
- **Forgot password + reset password + onboarding + pricing Wompi + health status: abril 7 2026**
- **Tipografías reales embebidas en todas las imágenes generadas (BebasNeue/Oswald/Montserrat/Playfair): abril 7 2026**
- **Rastreo por tipo de contenido en bulk generator**: `existingByType` Map — un día con carousel NO bloquea slot de reel (mismo tipo bloquea mismo tipo): abril 8 2026
- **Video reel auto-cargado en approval**: `GET /api/reels/variants/:variantId/status` devuelve URL presignada; `useEffect` carga video al abrir post; badge verde "✅ Video listo": abril 8 2026
- **Fechas per-plataforma en cola de aprobación**: `getNextSlotForPlatformAndType()` + `GET /api/posts/next-slot-per-platform?contentType=reel&excludeId=42` devuelve `{ instagram, tiktok }` con días de estrategia independientes (IG: 8h, TK: 19h Bogotá); frontend reemplaza hack "+2 días": abril 8 2026
- **Renovación automática token Meta**: cron diario 11:00 Bogotá, alerta Telegram 3 estados, endpoint manual admin + botón en Settings: abril 9 2026
- **Onboarding mejorado**: preview logo subido, imágenes referencia en paso 2 (marca), botón "Saltar este paso" en pasos 2-4: abril 9 2026
- **Auditoría multi-tenant**: posts/analytics/brand/billing/social-accounts todos correctamente scoped por userId: abril 9 2026
- **Auditoría de seguridad completa**: 3 vulnerabilidades corregidas — (1) rate limit TOTP `POST /api/auth/totp/login` (5 intentos/5min), (2) rate limit leads `/lp/:slug/lead` (3/10min), (3) sanitización inputs de leads (length caps + trim). Base confirmada OK: Helmet, CORS allowlist, bcrypt×12, JWT httpOnly, Drizzle ORM, aislamiento multi-tenant, Zod validation, anti-enumeración: abril 9 2026
- **Fix fuga de datos multi-tenant (CRÍTICO)**: dos bugs corregidos (abril 9 2026):
  1. **React Query caché**: `queryClient.clear()` ahora se llama en `login()`, `register()` y `logout()` de `AuthContext.tsx`. El queryClient se extrajo a `src/lib/queryClient.ts` (módulo compartido). Evitaba que datos de un usuario se vieran al cambiar de sesión.
  2. **AI service content contamination**: `generateBulkPosts()` y `generateExtraPosts()` usaban nicho hardcodeado "Energía Solar Cali" como fallback cuando el usuario no tenía nichos → ahora retornan array vacío. El custom topic context ya no inyecta ECO-brand para non-ECO users. `pickHashtags()` y `pickHashtagsTiktok()` aceptan `userId` y solo sirven hashtags ECO (`#ECOcol`, `#SimulaConECO`, etc.) a usuarios en `ECO_USER_IDS = Set([1, 2])`.
- **Producción confirmada**: DB prod tiene 3 usuarios: id=1 juampy40 (admin/agency), id=2 juan.yanguas (user/agency, todo el contenido ECO: 158 posts, 86 nichos, 3 social accounts), id=3 clonenationco (user/free). No hay brecha de seguridad real — clonenationco generó contenido ECO porque el AI usaba nicho ECO como fallback.
- **Fix assignBatchPostNumbers (abril 11 2026)**: error "duplicate key idx_posts_business_post_number" en `/api/posts/generate-extra` y `/api/posts/generate-bulk`. Causa: window de race condition entre `SELECT MAX(post_number)` y los `UPDATE` secuenciales permitía conflictos. Fix: reemplazado por un único UPDATE atómico con CTE que: (1) calcula MAX excluyendo los IDs del batch actual, (2) usa `ROW_NUMBER() OVER (ORDER BY id)` para asignar secuencialmente, (3) incluye `AND p.post_number IS NULL` para evitar doble asignación si el startup backfill ya los rellenó. El advisory lock `pg_advisory_xact_lock(bizId)` se conserva como red de seguridad adicional. **Aplica para TODOS los usuarios y negocios** — la función es genérica por `bizId`.

## Regla crítica: asignación de post_number
NUNCA asignar `post_number` con el patrón `SELECT MAX → UPDATE uno a uno` — crea race condition.
SIEMPRE usar la función `assignBatchPostNumbers(postIds, bizId)` en `posts.ts` que usa CTE atómica:
```sql
WITH
  base AS (SELECT COALESCE(MAX(post_number), 0) AS maxn
           FROM posts WHERE business_id = $bizId AND post_number IS NOT NULL
           AND id NOT IN ($batch_ids)),
  ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY id) + (SELECT maxn FROM base) AS new_num
             FROM (SELECT unnest(ARRAY[$batch_ids]::int[]) AS id) t)
UPDATE posts p SET post_number = r.new_num
FROM ranked r WHERE p.id = r.id AND p.post_number IS NULL
```
