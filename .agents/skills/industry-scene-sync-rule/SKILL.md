---
name: industry-scene-sync-rule
description: Regla de sincronización obligatoria de industrias y escenas DALL-E en HazPost. Úsalo ANTES de agregar, quitar o modificar cualquier industria en el selector del formulario O en el motor de imágenes. Si agregas una industria al selector, DEBES agregar su escena DALL-E en la misma operación. Nunca puede existir una industria sin cobertura en el motor de imágenes.
---

# Regla de Sincronización Industria–Escena — HazPost

## Regla fundamental

> **Si agregas una industria al selector del formulario, DEBES agregar en la misma operación:**
> 1. Su entrada en `NICHE_SCENE_ENTRIES` (con los keywords apropiados y la escena DALL-E)
> 2. Su case en `deriveBusinessIndustryScene` (que mapea el nombre exacto de la industria a la escena)
> 3. Su entrada en `INDUSTRY_CATALOG` en `industries.ts` (fuente de verdad del backend)
> 4. Opcionalmente: su `aiContext` en `INDUSTRY_CATALOG` para enriquecer los prompts de IA
>
> **Si eliminas una industria del selector, DEBES eliminar su case de `deriveBusinessIndustryScene`.**
>
> **Nunca puede existir una industria en el selector sin cobertura en el motor de imágenes.**

---

## Arquitectura actual de industrias (actualizado)

### Fuente de verdad: `industries.ts`
- **Archivo:** `artifacts/api-server/src/lib/industries.ts`
- **Array:** `INDUSTRY_CATALOG` — catálogo estructurado con name, slug, subcategories y `aiContext` opcional
- **Endpoint:** `GET /api/industries` — retorna static + custom industries (tabla `custom_industries`)

### Industrias custom: tabla `custom_industries`
- Los usuarios pueden registrar industrias fuera del catálogo usando "Otro" en los formularios
- Se validan via `POST /api/industries/validate-custom` con fuzzy match + GPT-4o-mini
- Se almacenan en `custom_industries` y se incluyen en `GET /api/industries`

### Selectores del formulario
Todos los selectores ahora **cargan desde la API** (`GET /api/industries`) con fallback a `INDUSTRIES_FALLBACK`:

- **`artifacts/social-dashboard/src/pages/onboarding.tsx`**
  - Fallback: `INDUSTRIES_FALLBACK` (~línea 26)
  - Estado dinámico: `industries` (useState, cargado desde API)
  - El select usa `{industries.map(...)}` — incluye "Otro" al final
  
- **`artifacts/social-dashboard/src/pages/profile.tsx`**
  - Fallback: `INDUSTRIES_FALLBACK` (~línea 47)
  - Estado dinámico: `industries` (useState, cargado desde API)
  - "Otro" muestra input custom con validación vía `validate-custom` en `onBlur`
  
- **`artifacts/social-dashboard/src/pages/businesses.tsx`**
  - Carga el catálogo completo con subcategorías vía `fetchIndustryCatalog()` → `GET /api/industries`
  - "Otro (especificar)" al final del select; input custom con validación `onBlur`
  - Al editar un negocio con industria custom, el useEffect mapea automáticamente a "Otro"

### Motor de imágenes — Backend
- **Archivo:** `artifacts/api-server/src/services/ai.service.ts`
- **Array:** `NICHE_SCENE_ENTRIES` (~línea 3049) — cada entrada tiene `keywords[]` y `scene`
- **Función:** `deriveBusinessIndustryScene(industry)` — mapea el nombre de industria → escena

### Pipeline aiContext (NUEVO)
- **Cache:** `artifacts/api-server/src/lib/industryAiContext.ts` — Map en memoria con TTL 1h
- **Función:** `resolveIndustryAiContext(industryName)` en `ai.service.ts`
- **Inyección:** en `getBrandContextBlock()`, tanto en el path businesses como en el legacy brand_profiles
- Bloque inyectado al prompt: CONTEXTO DE LA INDUSTRIA, TEMAS RECOMENDADOS, TONO, AUDIENCIA

---

## Cómo funciona el motor de escenas

El motor prioriza la selección de escena en este orden estricto:

```
1. job.imageScene          ← brief del usuario (mayor prioridad)
2. deriveBusinessIndustryScene(industry)  ← industria registrada del negocio
3. deriveNicheScene(nicheContextShort)    ← keywords del texto del post
4. job.batchRefStyle       ← imagen de referencia del batch
5. CHARACTER_BANK + BACKGROUND_SCENES    ← genérico (menor prioridad — imagen aleatoria)
```

**El nivel 2 es el punto de entrada de `INDUSTRIES`:** si una industria está en el selector pero no en `deriveBusinessIndustryScene`, cae al nivel 3 (keywords de texto) y luego al 5 (imagen aleatoria). Un negocio de relojes puede recibir una imagen de chef o escuela.

---

## Checklist al AGREGAR una industria nueva (al catálogo estático)

- [ ] Agregar entrada a `INDUSTRY_CATALOG` en `industries.ts` (name, slug, subcategories)
- [ ] Agregar `aiContext` en la misma entrada (description, content_topics, recommended_tone, audience, content_formats, keywords)
- [ ] Agregar el string exacto al array `INDUSTRIES_FALLBACK` en `onboarding.tsx`
- [ ] Agregar el mismo string exacto al array `INDUSTRIES_FALLBACK` en `profile.tsx`
- [ ] Agregar entrada a `NICHE_SCENE_ENTRIES` en `ai.service.ts`:
  - Keywords que identifiquen esta industria en el texto del post (específicos, no genéricos)
  - Escena DALL-E descriptiva con contexto colombiano (persona + ambiente del sector)
- [ ] Agregar case en `deriveBusinessIndustryScene` que llame `findScene("<keyword-único>")`:
  - El keyword debe ser exactamente igual a uno de los keywords en `NICHE_SCENE_ENTRIES`
  - Verificar que el nombre de industria en el case (`lower.includes(...)`) no colisione con otras industrias
- [ ] Verificar que el nuevo case no colisiona con industrias ya existentes (probar con el nombre exacto)

## Checklist al ELIMINAR una industria

- [ ] Quitar de `INDUSTRY_CATALOG` en `industries.ts`
- [ ] Quitar del array `INDUSTRIES_FALLBACK` en `onboarding.tsx`
- [ ] Quitar del array `INDUSTRIES_FALLBACK` en `profile.tsx`
- [ ] Quitar el case de `deriveBusinessIndustryScene`
- [ ] Si la entrada de `NICHE_SCENE_ENTRIES` solo era usada por esa industria, quitarla también. Si la comparte con otras industrias (por keywords del texto), dejarla.

---

## Reglas de keywords en NICHE_SCENE_ENTRIES

1. **Un keyword solo debe pertenecer a UNA industria.** Si el mismo keyword puede aparecer en posts de distintas industrias, no incluirlo.
2. **Usar keywords de 2+ palabras cuando sea necesario** para evitar falsos positivos ("coach de vida" vs "coaching" a secas).
3. **Nunca usar como keyword una palabra genérica:** "negocio", "empresa", "producto", "servicio" — estas aparecen en cualquier post.
4. **Los keywords de `NICHE_SCENE_ENTRIES` se usan para dos cosas:** (a) matching desde `deriveNicheScene` contra el texto del post y (b) como identificador para `findScene(keyword)` desde `deriveBusinessIndustryScene`. El keyword pasado a `findScene()` debe ser exactamente igual a uno de los strings del array `keywords`.

---

## Nota sobre inventario

No mantengas un listado estático de industrias en este skill — se desactualiza.
Para ver la lista actual, leer directamente:
- `INDUSTRY_CATALOG` en `artifacts/api-server/src/lib/industries.ts` (fuente de verdad)
- `INDUSTRIES_FALLBACK` en `artifacts/social-dashboard/src/pages/onboarding.tsx`
- `NICHE_SCENE_ENTRIES` y `deriveBusinessIndustryScene` en `artifacts/api-server/src/services/ai.service.ts`

---

## Verificación rápida post-cambio

```bash
# Verificar que deriveBusinessIndustryScene cubre todas las industrias nuevas:
grep -A 120 "function deriveBusinessIndustryScene" artifacts/api-server/src/services/ai.service.ts

# Comparar con la lista INDUSTRIES_FALLBACK del onboarding:
grep -A 50 "^const INDUSTRIES_FALLBACK" artifacts/social-dashboard/src/pages/onboarding.tsx

# Verificar que los keywords pasados a findScene() existen en NICHE_SCENE_ENTRIES:
grep -n "findScene\|keywords:" artifacts/api-server/src/services/ai.service.ts | head -60

# Verificar aiContext en industries.ts:
grep -n "aiContext:" artifacts/api-server/src/lib/industries.ts
```
