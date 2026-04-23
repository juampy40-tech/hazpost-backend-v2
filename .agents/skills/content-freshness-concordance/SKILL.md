---
name: content-freshness-concordance
description: Arquitectura completa del sistema de frescura y concordancia de contenido en HazPost. Cubre la triada imagen+título+estilo, cómo cada clic genera algo visualmente nuevo, y la concordancia entre el hook del post y la imagen DALL-E. Úsalo ANTES de modificar generateImagesForPostsBg, la lógica de enrichment del prompt, SCENE_MOODS, batchSceneOffset, o cualquier código que afecte diversidad visual o concordancia foto-texto.
---

# Skill: Sistema de Frescura y Concordancia de Contenido

## La promesa central de HazPost

> **"Un clic → contenido completamente nuevo"**: fotos distintas, títulos distintos, estilos distintos.  
> El usuario nunca debería ver la misma combinación dos veces.

Este skill documenta la **triada de diversidad** que hace posible esa promesa:

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  CAPTION    │    │   IMAGEN     │    │   ESTILO     │
│  (hook)     │◄──►│   (DALL-E)   │◄──►│  (mood/luz)  │
│  diverso    │    │  concordante │    │  rotativo    │
└─────────────┘    └──────────────┘    └──────────────┘
        ↕                  ↕                  ↕
  caption-diversity  image-business    SCENE_MOODS array
  -rules skill       -concordance      en ai.service.ts
                     skill
```

---

## Arquitectura completa de diversidad (ai.service.ts)

### Dimensión 1 — Diversidad de caption/hook

**Archivo:** `ai.service.ts` → `CAROUSEL_HOOK_STYLES`, `generateCaption`, `isTooSimilar`

Ver skill `caption-diversity-rules` para detalles completos.

Resumen:
- `CAROUSEL_HOOK_STYLES[10]`: paleta de 10 estilos (pregunta, dato, contradicción, confesión, etc.)
- Rotación por batch: post 0 → estilo 0, post 1 → estilo 1, etc.
- `isTooSimilar()`: bloquea hooks con Jaccard >60% O prefijo estructural de 2+ tokens iguales
- Primer intento recibe `allUsedHooks.slice(-15)` (nunca lista vacía)

### Dimensión 2 — Concordancia imagen-industria

**Archivo:** `ai.service.ts` → `deriveBusinessIndustryScene`, `NICHE_SCENE_ENTRIES`, `deriveNicheScene`

Ver skill `image-business-concordance` para detalles completos.

Resumen del flujo de escena:
```
1. job.imageScene (brief explícito del usuario)  ← override total
2. deriveBusinessIndustryScene(industry, sceneIdx)  ← industria del negocio
3. deriveNicheScene(nicheContextShort, sceneIdx)  ← keywords del nicho
4. job.batchRefStyle / userRefStyle  ← imagen de referencia
5. CHARACTER_BANK  ← personaje genérico (sin escena)
```

### Dimensión 3 — Concordancia imagen↔título+texto (REGLA UNIVERSAL — v2.0 Task #366)

**Archivo:** `ai.service.ts` ~líneas 4500-4625 en `generateImagesForPostsBg`

**Regla fundamental (v2.0 — TOPIC FIRST):** el título (`captionHook`) y el texto (`caption`) del post
son el driver **PRIMARIO** de la imagen — lideran el prompt de DALL-E con etiqueta explícita.
La industria/nicho es el contexto visual **SECUNDARIO** (estilo fotográfico, tipo de personaje).
Esta regla aplica a **TODOS** los usuarios y negocios sin excepción (incluye solar/ECO).

**Por qué topic-FIRST importa (fix v2.0):**  
En v1.0 la escena de industria (100+ palabras) iba PRIMERO → DALL-E la seguía sin importar el texto.
En v2.0 el captionHook lidera con `Visual topic (PRIMARY directive)` → DALL-E representa el contenido real.

**Cobertura de paths:**
| Path | Mecanismo | Estructura del prompt |
|------|-----------|----------------------|
| No-solar con industria mapeada (1c) | `nicheSpecificScene` topic-first | `PRIMARY: topic → SECONDARY: industryScene` |
| No-solar con niche fallback (2c) | `nicheSpecificScene` topic-first | `PRIMARY: topic → SECONDARY: nicheScene` |
| Solar/ECO (`isSolar=true`) | `enrichedSceneDesc` universal topic-first | `PRIMARY: topic → SECONDARY: enrichedSceneDesc` |
| Negocio con `batchRefStyle` | `enrichedSceneDesc` universal topic-first | `PRIMARY: topic → SECONDARY: enrichedSceneDesc` |
| `imageScene` explícito del usuario | Respetado sin cambios | — |

**Estructura del prompt v2.0 (paths 1c y 2c — cuando captionHook existe):**
```typescript
// Topic-FIRST: el contenido del post lidera, la industria es contexto secundario
if (captionTopicHint1) {
  const bodyCtx1 = captionBodyHint1 ? ` Content context: "${captionBodyHint1}".` : '';
  nicheSpecificScene = `Visual topic (PRIMARY directive): "${captionTopicHint1}".${bodyCtx1} The image MUST visually depict this specific topic above all else. Character and setting reference (secondary context — use for photographic style and character type only): ${industryScene}${subIndustrySuffix1}.`;
} else {
  // Fallback cuando no hay captionHook: industria lidera (comportamiento original)
  nicheSpecificScene = jobSubIndustry
    ? `${industryScene}. Specifically, this is a "${jobSubIndustry}" business...`
    : industryScene;
}
```

**Estructura del prompt v2.0 (bloque universal — solar/batchRefStyle — cuando captionHook existe):**
```typescript
if (!job.imageScene && !nicheSpecificScene) {
  if (captionHookHint) {
    // Topic-FIRST: captionHook lidera, enrichedSceneDesc es contexto secundario
    const bodyCtx = captionBodyHint ? ` Content context: "${captionBodyHint}".` : '';
    enrichedSceneDesc = `Visual topic (PRIMARY directive): "${captionHookHint}".${bodyCtx} The image MUST visually depict this specific topic above all else. Character and setting reference (secondary context — use for photographic style only): ${enrichedSceneDesc}.`;
  } else if (nicheHint) {
    enrichedSceneDesc = `${enrichedSceneDesc}. Post topic: "${nicheHint}" — visually reflect this theme.`;
  }
}
```

**Resultado esperado:**
- Heladería: "Ese primer bocado" → imagen con helado/heladería, NO estudio de marketing
- Tech: "Tu mejor clase" (programación) → imagen con código/tech, NO estudio de agencia
- Autos: "Si no mostrás la compra" → imagen con auto/concesionario
- ECO: "HANGARES SIN FACTURAS ALTAS" → hangar industrial, no mercado genérico
- Mismo batch de 5 posts → 5 imágenes VISUALMENTE DISTINTAS entre sí

### Dimensión 4 — Diversidad de estilo/iluminación

**Archivo:** `ai.service.ts` → `SCENE_MOODS` array (~línea 4551)

```typescript
const SCENE_MOODS = [
  "golden morning light from large windows, warm soft shadows",      // 0
  "clean bright midday daylight, even and flattering",               // 1
  "warm afternoon ambient light, rich golden tones",                 // 2
  "cool professional studio lighting, blue-toned and sharp",         // 3
  "cozy warm tungsten lighting, intimate atmosphere",                // 4
  "bright airy white studio light, minimalist and modern",           // 5
  "dramatic window side light, shallow depth of field background",   // 6
  "wide establishing shot, environment and context prominent",        // 7
  "close-up intimate framing, subject fills frame confidently",       // 8
  "overcast diffused light, cinematic even quality",                 // 9
];
nicheSpecificScene = `${nicheSpecificScene} Lighting and framing: ${SCENE_MOODS[sceneIdx % 10]}.`;
```

`sceneIdx` = `batchSceneOffset + jobIdx * 3` (rotación prime-step) → cada post en el batch
recibe un mood distinto, y el offset aleatorio garantiza que batches distintos empiezan
en posiciones diferentes.

### Dimensión 5 — Anti-repetición de escena dentro del batch

**Archivo:** `ai.service.ts` → `batchSceneOffset`, `resolvedSceneIdx`

```typescript
// Asignación pre-paralela para garantizar que cada job tiene sceneIdx único
const batchSceneOffset = Math.floor(Math.random() * 100);
for (let i = 0; i < imageJobs.length; i++) {
  resolvedSceneIdxMap.set(job.postId, (batchSceneOffset + i * 3) % 200);
}
```

El multiplicador 3 (primo) garantiza que 5 posts consecutivos nunca caigan en el mismo
bucket de la paleta de escenas, incluso cuando el módulo es pequeño.

---

## Mapa completo de diversidad por componente

| Componente | Mecanismo | Período de no-repetición |
|------------|-----------|--------------------------|
| Caption hook | `isTooSimilar` + `allUsedHooks.slice(-15)` | 15 posts anteriores |
| Hook estilo (carousel) | `CAROUSEL_HOOK_STYLES[batch % 10]` | 10 posts del batch |
| Escena de imagen | `NICHE_SCENE_ENTRIES` (4-10 variantes/industria) + `sceneIdx` rotativo | Varía por industria |
| Concordancia imagen-tema | `captionHook` en prompt DALL-E | Por post (es el post mismo) |
| Iluminación/encuadre | `SCENE_MOODS[sceneIdx % 10]` | 10 posts por ciclo |
| Offset cross-batch | `batchSceneOffset` random (0-99) | Aleatorio por batch |
| Títulos de slides 2-N | `suggestHeadlines(caption, platform)` via GPT | Por post (contexto del caption) |

---

## Vectores de riesgo de repetición

| # | Síntoma | Causa | Archivo | Severidad |
|---|---------|-------|---------|-----------|
| R1 | Todos los posts del batch tienen la misma foto | `deriveBusinessIndustryScene` retorna null → todos caen a CHARACTER_BANK genérico | `ai.service.ts` → `deriveBusinessIndustryScene` | **ALTA** |
| R2 | Posts de temas distintos lucen igual (mismo estudio) | `captionHook` no inyectado en prompt DALL-E → solo el nombre del nicho llega | `ai.service.ts` ~4516 | **ALTA** — corregido Task #365 |
| R3 | Batches sucesivos de mismo negocio tienen mismas fotos | `batchSceneOffset` random pero range limitado / industria con pocas escenas | `ai.service.ts` → `NICHE_SCENE_ENTRIES` scenes array | **MEDIA** |
| R4 | Títulos slides 2-N son genéricos o vacíos | `suggestHeadlines` falla → fallback al pool estático | `ai.service.ts` → `CAROUSEL_HEADLINE_POOLS` | **MEDIA** |
| R5 | Imagen no tiene nada que ver con el tema del post | Industria sin mapeo en `deriveBusinessIndustryScene` → CHARACTER_BANK random | `deriveBusinessIndustryScene` | **ALTA** |
| R6 | 5 posts de batch con mismo mood de iluminación | `sceneIdx` colisión → revisar el prime-step multiplier | `batchSceneOffset` assignment | **BAJA** |
| R7 | ECO/solar genera imágenes sin relación con el post | `isSolar=true` → salta el bloque `if (!isSolar)` → `enrichedSceneDesc` sin captionHook | `ai.service.ts` ~4601 | **ALTA** — corregido Task #365 |
| R8 | Imagen refleja el nicho genérico pero no el tema del post | `caption` body nunca llegaba al prompt DALL-E (solo `captionHook`, sin el texto) | `ai.service.ts` paths 1c, 2c y universal | **ALTA** — corregido Task #365 |

---

## Protocolo de diagnóstico para "el contenido se ve repetitivo"

### Paso 1 — Identificar qué dimensión se repite

```
¿El TEXTO del caption se repite? → ver skill caption-diversity-rules
¿El TIPO DE ESCENA se repite (todos en oficina, todos en estudio)? → R1 o R5
¿Los posts son temáticamente distintos pero las FOTOS lucen igual? → R2
¿La ILUMINACIÓN es la misma en todos? → R6
¿Los TÍTULOS de los slides 2-N son genéricos? → R4
```

### Paso 2 — Verificar que captionHook llega al prompt

```sql
-- Ver caption_hook de posts recientes del negocio afectado
SELECT p.id, p.business_id, p.caption, 
       LEFT(p.caption, 50) AS caption_preview,
       iv.overlay_caption_hook AS slide1_title,
       p.content_type, p.created_at
FROM posts p
LEFT JOIN image_variants iv ON iv.post_id = p.id AND iv.variant_index = 0
WHERE p.business_id = <bizId>
ORDER BY p.created_at DESC
LIMIT 10;
```

Si `slide1_title` es el hook correcto → el captionHook llegó bien al job.
El caption debe llegar al image job, verificar en el código:
```typescript
// ✅ Verificar que imageJobs.push incluye captionHook:
imageJobs.push({
  postId: post.id,
  captionHook: captionHookDraft,  // ← debe estar presente
  caption,                         // ← también necesario para suggestHeadlines
  ...
});
```

### Paso 3 — Simular la cadena de escena para un post

```typescript
// Pseudo-código para simular qué escena recibe un post:
const industry = "Publicidad & Comunicaciones / Producción audiovisual";
const nicheText = "Agencias de marketing digital - marketing agencia social media...";
const captionHook = "El B2B también puede ser viral";

// Step 1: ¿deriveBusinessIndustryScene(industry) retorna algo?
// "publicidad" → findScene("marketing") ✓

// Step 2: La escena base sería una de las 10 escenas de marketing
// (variant según sceneIdx)

// Step 3: Se enriquece con captionHook:
// "...The post hook says: 'El B2B también puede ser viral' — the character's
// activity... MUST visually communicate this specific message..."

// Step 4: Se agrega SCENE_MOODS[sceneIdx % 10]
// → "golden morning light from large windows, warm soft shadows"

// Resultado DALL-E: marketing professional + B2B visual context + morning light
```

### Paso 4 — Verificar coverage de industria

```bash
# ¿La industria del negocio tiene mapeo en deriveBusinessIndustryScene?
grep -A 5 "deriveBusinessIndustryScene" artifacts/api-server/src/services/ai.service.ts \
  | grep -i "publicidad\|marketing\|saas\|tecnolog"

# ¿El nicho tiene coverage en NICHE_SCENE_ENTRIES?
grep -n '"marketing"\|"publicidad"\|"redes sociales"' \
  artifacts/api-server/src/services/ai.service.ts | head -5
```

---

## Reglas al modificar el sistema de diversidad

### Regla #0 — Invariante universal (NO romper)

> **El título (`captionHook`) y el texto (`caption`) del post SIEMPRE llegan al prompt DALL-E.**  
> Cualquier nuevo bypass (como `isSolar`, `batchRefStyle`, o futuros flags) debe terminar  
> en el bloque universal de `enrichedSceneDesc` (~línea 4597) para mantener esta garantía.

### Al modificar el enriquecimiento de prompt (líneas 4515-4615)

1. **Regla universal primero**: post title + body = driver primario. Industria/nicho = setting.
2. **Tres paths que deben mantenerse sincronizados**:
   - Path 1c: industria detectada → `nicheSpecificScene`
   - Path 2c: niche fallback → `nicheSpecificScene`
   - Bloque universal: solar + batchRefStyle → `enrichedSceneDesc`
3. **Caption body incluido**: usar `job.caption.replace(/\n+/g, ' ').trim().slice(0, 200)` (no solo el hook)
4. **Lenguaje imperativo** para DALL-E: "MUST visually represent", no "may reflect"
5. **Límites de chars**: hook ≤ 100, caption body ≤ 200 para no dominar el prompt de escena

### Al modificar SCENE_MOODS

1. Mantener exactamente 10 moods (el índice `sceneIdx % 10` depende de esto).
2. Los moods deben ser VISUALMENTE DISTINTOS entre sí (distintas temperaturas de color,
   distintos ángulos de cámara, distintas atmósferas).
3. Nunca repetir el mismo tipo de iluminación en dos entradas consecutivas.
4. Mezclar: moods de iluminación natural (mañana, tarde, ventana) + artificiales (estudio,
   tungsteno) + composición (primer plano, plano general, lateral).

### Al agregar nuevas escenas a NICHE_SCENE_ENTRIES

1. Cada industria debe tener MÍNIMO 5 escenas para garantizar diversidad en batches de 5 posts.
2. Las escenas de una industria deben ser visualmente DISTINTAS (diferentes ambientes, no
   variaciones del mismo estudio).
3. Mezclar exteriores e interiores dentro de la misma industria cuando sea posible.
4. Verificar que ningún keyword nuevo es genérico (puede afectar otras industrias).

### Al agregar una nueva industria al selector (businesses.tsx)

**Obligatorio (ver skill `industry-scene-sync-rule`):**
1. Agregar mapeo en `deriveBusinessIndustryScene`
2. Si la industria necesita escenas distintas, agregar entrada en `NICHE_SCENE_ENTRIES`
3. Si la industria no existe en NICHE_SCENE_ENTRIES, documentar el fallback esperado

---

## Anti-patrones prohibidos

```typescript
// ❌ Solo el nombre del nicho como hint — DALL-E lo ignora (muy genérico, sin fuerza)
nicheSpecificScene = `${scene}. The post is about "${nicheHint}" — subtly reflect.`;

// ✅ Título + body del post con lenguaje imperativo
const titleLine = `Post title: "${job.captionHook?.slice(0, 100)}"`;
const bodyLine = job.caption ? ` Post body: "${job.caption.replace(/\n+/g, ' ').slice(0, 200)}".` : '';
nicheSpecificScene = `${scene}. ${titleLine}.${bodyLine} MUST visually represent this topic.`;

// ❌ Bypass para solar sin bloque universal — viola la regla fundamental
if (!job.imageScene && !job.batchRefStyle && !isSolar) {
  // enriquecimiento con captionHook aquí...
}
// ← ECO (isSolar=true) nunca entra → imagen no refleja el tema del post (R7)

// ✅ Bloque universal después de enrichedSceneDesc cubre TODOS los paths
if (!job.imageScene && !nicheSpecificScene) {
  // captionHook + caption body → enrichedSceneDesc (cubre solar, batchRefStyle, etc.)
}

// ❌ Usar solo captionHook sin el texto del post — "HANGARES" llega pero sin contexto
// aeronáutico → DALL-E podría generar cualquier hangar sin el contexto de manufactura solar
nicheSpecificScene = `${scene}. Post title: "${job.captionHook}".`;

// ✅ Incluir el body del caption con el contexto completo
const captionBody = job.caption?.replace(/\n+/g, ' ').trim().slice(0, 200);
nicheSpecificScene = `${scene}. Post title: "${job.captionHook}". Post body: "${captionBody}". MUST visually represent.`;

// ❌ SCENE_MOODS de solo 5 items → batches de 5 posts con el mismo mood
const SCENE_MOODS = ["morning light", "midday", "afternoon", "studio", "tungsten"];

// ✅ SCENE_MOODS de exactamente 10 items con multiplicador 3 (primo)
// sceneIdx[0..4] = offset+0, offset+3, offset+6, offset+9, offset+12
// Los 5 valores mod 10 son siempre diferentes (3 no divide 10 → no hay colisión en 5 posts)
```

---

## Flujo completo de un post desde generación hasta imagen

```
Usuario hace clic "Generar 5 posts"
    │
    ▼
generateBulkPosts()
    │
    ├── Para cada post:
    │   ├── CAPTION: generateCaption(ctx, platform, contentType, avoidHooks.slice(-15), ..., hookStyleHint)
    │   │   └── hookStyleHint = CAROUSEL_HOOK_STYLES[batchIdx % 10]  (si carousel)
    │   │
    │   └── POST guardado en DB con: caption, captionHook, niche_id, content_type
    │
    ├── imageJobs.push({ postId, captionHook, caption, nicheContextShort, ... })
    │   └── captionHook = primer párrafo del caption generado
    │
    └── generateImagesForPostsBg(imageJobs)
        │
        ├── Pre-asignación de sceneIdx (antes del pool paralelo):
        │   └── resolvedSceneIdxMap.set(postId, batchSceneOffset + jobIdx * 3)
        │
        └── Para cada job (en paralelo):
            │
            ├── ESCENA BASE:
            │   ├── deriveBusinessIndustryScene(industry, sceneIdx)  → 4-10 variantes
            │   └── fallback: deriveNicheScene(nicheContextShort, sceneIdx)
            │
            ├── ENRIQUECIMIENTO TEMÁTICO (captionHook-first):
            │   └── "The post hook says: '{captionHook}' — MUST visually communicate"
            │
            ├── MOOD DE ILUMINACIÓN:
            │   └── SCENE_MOODS[sceneIdx % 10]
            │
            └── DALL-E genera la imagen con:
                Base scene + Topic concordance + Lighting mood
                → Imagen única y concordante con el hook del post ✅
```

---

## Criterios de aceptación

- [ ] Un batch de 5 posts con la misma industria produce 5 imágenes visualmente distintas
- [ ] Un post sobre "agenda" y un post sobre "B2B viral" (misma industria) producen imágenes con temas claramente distintos
- [ ] Los 10 SCENE_MOODS se distribuyen sin repetición en batches de 5 posts (verificar con prime-step)
- [ ] Cambiar el texto del caption hook entre dos posts de la misma industria cambia visiblemente la imagen generada
- [ ] Batches generados en días distintos (diferente batchSceneOffset) no producen la misma secuencia de imágenes

---

## Archivos relevantes

| Archivo | Líneas | Contenido |
|---------|--------|-----------|
| `artifacts/api-server/src/services/ai.service.ts` | ~4500-4550 | `generateImagesForPostsBg` — enriquecimiento de prompt con captionHook + nicheHint + SCENE_MOODS |
| `artifacts/api-server/src/services/ai.service.ts` | ~3336-3840 | `NICHE_SCENE_ENTRIES` — banco de escenas por industria/nicho (4-10 variantes cada uno) |
| `artifacts/api-server/src/services/ai.service.ts` | ~3860-3990 | `deriveBusinessIndustryScene` — mapeo industria → escena |
| `artifacts/api-server/src/services/ai.service.ts` | ~3837-3850 | `CAROUSEL_HOOK_STYLES` — 10 estilos de gancho para diversidad de captions |
| `artifacts/api-server/src/services/ai.service.ts` | ~4465-4500 | `batchSceneOffset` + `resolvedSceneIdxMap` — anti-repetición de escena en batch |
| `.agents/skills/caption-diversity-rules/SKILL.md` | - | Sistema de diversidad de hooks/captions |
| `.agents/skills/image-business-concordance/SKILL.md` | - | Concordancia industria ↔ escena de imagen |
| `.agents/skills/title-post-concordance/SKILL.md` | - | Concordancia título ↔ tema del post (slides 2-N) |
