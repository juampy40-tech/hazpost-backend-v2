============================================================
BRAND PROFILE SYNC ARCHITECTURE
============================================================

Archivos relacionados:

• brand-profile.ts
• businesses.ts
• analyze-website.ts
• OnboardingWizard.tsx
• getBrandContextBlock()
• businessesTable
• brand_profiles

============================================================
RESPONSABILIDAD
============================================================

Este flujo actualmente controla:

• onboarding branding,
• sincronización profile/business,
• analyze website,
• generación IA,
• branding persistence,
• GPT brand context,
• logos,
• colores,
• tono,
• audience,
• y branding runtime.

============================================================
OBJETIVO
============================================================

El sistema debe mantener sincronizado:

• brand_profiles
• businesses

para garantizar:

• branding consistente,
• IA consistente,
• onboarding limpio,
• persistencia correcta,
• y aislamiento correcto entre negocios.

============================================================
PROBLEMA HISTÓRICO DETECTADO
============================================================

Se detectó contaminación de branding durante onboarding.

Síntomas observados:

• industrias viejas reviviendo,
• slogans antiguos apareciendo,
• ciudades antiguas reapareciendo,
• firmas legacy apareciendo,
• analyze-website mezclando contexto viejo,
• branding zombie,
• contaminación parcial.

Ejemplos reales detectados:

• ECO-COL
• Cali
• Fitness & Deporte

apareciendo durante onboarding de Triptico.

============================================================
ROOT CAUSE DETECTADA
============================================================

La sincronización:

brand_profiles → businesses

estaba DESACTIVADA.

El bloque mirror sync estaba comentado en:

• brand-profile.ts

Resultado:

• businessesTable conservaba branding viejo,
• brand_profiles recibía branding nuevo,
• la IA mezclaba contexto stale + actual,
• onboarding revivía datos legacy.

============================================================
BLOQUE CRÍTICO
============================================================

⚠️ CRÍTICO

NO comentar:

const bizUpdates = {}

ni el bloque:

await db.update(businessesTable)

Este sync es sensible.

============================================================
RIESGOS IMPORTANTES
============================================================

RIESGOS CORE:

• contaminación branding,
• IA usando contexto viejo,
• onboarding inconsistente,
• mezcla parcial de negocio,
• logos incorrectos,
• colores incorrectos,
• prompts contaminados,
• generación incorrecta,
• multi-source truth,
• branding stale.

============================================================
LIMPIEZA DEFENSIVA AGREGADA
============================================================

Se agregaron resets automáticos cuando frontend NO envía:

• industry
• subIndustry
• subIndustries
• slogan
• city
• defaultLocation
• defaultSignatureText
• audienceDescription
• brandTone

Objetivo:

• evitar persistencia zombie,
• evitar merges parciales,
• evitar contaminación onboarding.

============================================================
REGLAS IMPORTANTES
============================================================

NO:

• duplicar branding innecesariamente,
• comentar mirror sync,
• asumir businesses como source-of-truth,
• mezclar defaults legacy,
• persistir merges parciales,
• ni reutilizar onboarding incompleto.

============================================================
VALIDACIÓN OBLIGATORIA
============================================================

Siempre validar:

• payload frontend,
• Network F12,
• logs backend,
• persistencia DB,
• onboarding nuevo,
• onboarding refresh,
• analyze-website response,
• business limpio,
• multiusuario,
• branding aislado.

============================================================
BRAND COLOR SOURCE PRIORITY
============================================================

Nuevo lifecycle oficial de branding visual:

Prioridad de colores:

1. Uploaded logo
2. Website detected logo
3. Website visual heuristics
4. AI fallback suggestion

IMPORTANTE:

• website NO es source-of-truth visual absoluto,
• logos tienen prioridad sobre website,
• IA NO debe inventar branding visual fuerte,
• colores website son sugerencias,
• logo upload puede reemplazar colores previos.

============================================================
COLOR EXTRACTION RUNTIME
============================================================

Nuevo servicio agregado:

• src/services/color_extractor.py

Responsable de:

• dominant palette extraction,
• HEX normalization,
• anti-checkerboard filtering,
• anti-UI-color filtering,
• saturation filtering,
• logo-based color extraction.

============================================================
LIFECYCLE IMPORTANTE
============================================================

Analyze website puede ejecutarse ANTES de subir logo.

Flujo actual:

1. onboarding analiza website
2. onboarding sugiere branding inicial
3. usuario sube logo
4. onboarding rehidrata branding visual
5. logo puede reemplazar colores website
6. branding visual final prioriza logo

============================================================
REGLAS IMPORTANTES
============================================================

NO:

• asumir website como branding source-of-truth,
• persistir colores website como definitivos,
• priorizar colores neutros del hero,
• usar overlays oscuros como branding real,
• confiar ciegamente en AI-generated HEX.

SIEMPRE:

• priorizar uploaded logo,
• permitir override manual usuario,
• validar saturation real,
• ignorar checkerboard/transparency bleed,
• ignorar UI/bootstrap colors.

============================================================
ESTADO ACTUAL
============================================================

Estado actual validado:

✅ logo extraction funcionando
✅ onboarding hydration funcionando
✅ logo override funcionando
✅ anti-blue contamination funcionando
✅ website color extraction mejorada
⚠️ website colors siguen siendo heurísticos
⚠️ logo sigue siendo source-of-truth recomendado

============================================================
DIRECCIÓN FUTURA
============================================================

Objetivo futuro:

• brand_profiles = source-of-truth branding
• businesses = metadata operativa

⚠️ NO migrar todavía hasta estabilizar onboarding.

---

# Custom Fonts Sync

La sincronización de perfil de marca debe incluir:

- `brandFont`
- `brandFontUrl`
- `customFonts`

## Riesgo crítico

Persistir solamente `brandFontUrl` rompe la biblioteca de fuentes del negocio.

## Regla

`customFonts` debe hidratarse tanto en:

- onboarding,
- edición de negocio,
- bootstrap business profile,
- runtime `/api/businesses`.

============================================================
CUSTOM FONTS RUNTIME
============================================================

Archivos relacionados:

• OnboardingWizard.tsx
• businesses.tsx
• src/lib/fonts.ts
• image_variants.py
• businessesTable
• brand_profiles
• Cloudflare R2

============================================================
OBJETIVO
============================================================

Permitir:

• tipografías premium por negocio,
• branding visual consistente,
• previews reales,
• persistencia correcta,
• render estable frontend,
• aislamiento multi-business,
• y reutilización futura para generación IA.

============================================================
SOURCE OF TRUTH
============================================================

Brand profile debe persistir:

• brandFont
• brandFontUrl
• customFonts

IMPORTANTE:

`brandFontUrl` SOLO NO es suficiente.

La biblioteca completa de fuentes debe persistirse en:

• businesses
• brand_profiles

para permitir:

• rehidratación correcta,
• edición futura,
• previews correctos,
• reutilización runtime,
• y render consistente.

============================================================
FLUJO OFICIAL
============================================================

Lifecycle actual:

1. usuario selecciona fuente catálogo
o
2. usuario sube fuente custom

↓

3. archivo se guarda en Cloudflare R2

↓

4. frontend guarda:

• brandFont
• brandFontUrl
• customFonts

↓

5. onboarding preview hidrata fuente

↓

6. edición futura rehidrata correctamente

============================================================
RUNTIME FRONTEND
============================================================

Frontend utiliza:

• injectCustomFont()
• resolveStorageUrl()
• FontPreview

Objetivo:

• cargar dinámicamente fuentes custom,
• evitar colisiones entre nombres,
• soportar múltiples negocios,
• permitir previews reales.

============================================================
BUG HISTÓRICO DETECTADO
============================================================

Síntomas observados:

• preview no cambiaba,
• fuente incorrecta aparecía seleccionada,
• Fjalla One reaparecía,
• onboarding perdía fuente real,
• custom fonts no rehidrataban,
• runtime mezclaba nombres.

============================================================
ROOT CAUSE DETECTADA
============================================================

Problemas detectados:

1. customFonts no hidrataba correctamente
2. brandFontUrl persistía sin customFonts
3. safeFontName no era estable
4. R2 no tenía CORS configurado
5. preview runtime usaba nombres inconsistentes

Resultado:

• navegador cargaba fuente,
• pero React renderizaba otra,
• o fallback default.

============================================================
FIXES APLICADOS
============================================================

Se validó:

✅ persistencia `customFonts`
✅ hydration en businesses.tsx
✅ hydration onboarding
✅ runtime safeFontName
✅ injectCustomFont()
✅ resolveStorageUrl()
✅ Cloudflare R2 CORS
✅ preview runtime funcional
✅ multi-font runtime estable

============================================================
CORS R2
============================================================

Cloudflare R2 requiere CORS válido para renderizar fuentes custom.

Configuración validada:

• app.hazpost.app
• hazpost.app
• www.hazpost.app
• hazpost.com
• www.hazpost.com

Métodos:

• GET
• HEAD

============================================================
REGLAS IMPORTANTES
============================================================

NO:

• persistir solo brandFontUrl
• perder customFonts
• usar nombres inconsistentes
• asumir fuentes catálogo
• romper hydration
• comentar injectCustomFont()

SIEMPRE:

• persistir customFonts
• validar R2 CORS
• usar safeFontName estable
• hidratar edición correctamente
• validar preview runtime
• validar refresh/reload
• validar multi-business isolation

============================================================
VALIDACIÓN OBLIGATORIA
============================================================

Siempre validar:

• preview cambia visualmente
• reload mantiene fuente
• editar negocio mantiene fuente
• Network carga .woff/.ttf
• Status 200 OK
• sin CORS errors
• hydration correcta
• multiusuario aislado
• brand profile consistente

============================================================
ESTADO ACTUAL
============================================================

Estado validado:

✅ custom fonts funcionando
✅ preview runtime funcionando
✅ R2 CORS funcionando
✅ onboarding hydration funcionando
✅ edición funcionando
✅ safe font runtime estable
✅ reload persistente funcionando