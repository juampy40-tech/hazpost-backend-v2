# Skill: onboarding-brand-context

## Propósito
Documentar el flujo completo desde que el usuario llena el onboarding (web, logo, slogan, descripción, audiencia, tono, colores) hasta que la IA lo usa para generar contenido. Úsalo antes de modificar cualquier campo del onboarding, la función `getBrandContextBlock`, el endpoint `PUT /api/brand-profile`, o cualquier campo de la tabla `businesses` que afecte la generación de IA.

---

## 1. Mapa de campos: qué llena el usuario → qué usa la IA

| Campo en OnboardingWizard | Se guarda en | Nombre en `businesses` | Llega a `getBrandContextBlock` como |
|---|---|---|---|
| companyName | `brand_profiles.company_name` + `businesses.name` | `name` | `EMPRESA:` |
| industry | `brand_profiles.industry` + `businesses.industry` | `industry` | `INDUSTRIA:` |
| subIndustry | `brand_profiles.sub_industry` + `businesses.sub_industry` | `subIndustry` | (sub-industria) |
| slogan | `brand_profiles.slogan` + `businesses.slogan` | `slogan` | `SLOGAN DE LA MARCA:` |
| **businessDescription** | `brand_profiles.business_description` + **`businesses.description`** | `description` | `DESCRIPCIÓN DEL NEGOCIO:` |
| audienceDescription | `brand_profiles.audience_description` + `businesses.audience_description` | `audienceDescription` | `AUDIENCIA OBJETIVO:` |
| brandTone | `brand_profiles.brand_tone` + `businesses.brand_tone` | `brandTone` | `TONO DE COMUNICACIÓN:` |
| primaryColor | `brand_profiles.primary_color` + `businesses.primary_color` | `primaryColor` | `COLOR PRINCIPAL:` + overlay |
| secondaryColor | `brand_profiles.secondary_color` + `businesses.secondary_color` | `secondaryColor` | `COLOR SECUNDARIO:` + overlay |
| logoUrl / logoUrls | `brand_profiles.logo_url/s` + `businesses.logo_url/s` | `logoUrl`, `logoUrls` | Logo overlay en imagen |
| brandFont | `brand_profiles.brand_font` + `businesses.brand_font` | `brandFont` | `TIPOGRAFÍA:` + overlay font |
| defaultLocation | `brand_profiles.default_location` + `businesses.default_location` | `defaultLocation` | `CIUDAD/UBICACIÓN:` en firma |
| website | `brand_profiles.website` ÚNICAMENTE | _(no existe en businesses)_ | Dispara análisis AI → resultados se guardan en `brand_profiles` → mirror sync los propaga a `businesses` |
| referenceImages | `brand_profiles.reference_images` + `businesses.reference_images` | `referenceImages` | `ESTILO VISUAL:` |

⚠️ **Naming mismatch crítico**: `brand_profiles.business_description` → `businesses.description` (nombres diferentes). El mapeo es explícito en el mirror sync de `PUT /api/brand-profile`.

---

## 2. Arquitectura de dos tablas

```
brand_profiles (1 por userId)              businesses (1+ por userId)
────────────────────────────               ─────────────────────────
company_name                               name
industry / sub_industry                    industry / sub_industry
slogan                                     slogan
business_description         ───────────► description  (nombre distinto)
audience_description                       audience_description
brand_tone                                 brand_tone
primary_color / secondary_color            primary_color / secondary_color
logo_url / logo_urls                       logo_url / logo_urls
brand_font                                 brand_font
default_location                           default_location
website  (SOLO aquí)                       ❌ no existe website
reference_images                           reference_images
```

- **`brand_profiles`**: tabla legacy (1 por userId). Se usa como fallback cuando no hay `businessId`.
- **`businesses`**: tabla actual. Puede haber múltiples por usuario. Fuente de verdad para `generateBulkPosts`.
- **`getBrandContextBlock(userId, businessId?)`**:
  - Si hay `businessId` → lee de `businesses` (incluye todos los campos de marca)
  - Si solo hay `userId` → legacy path desde `brand_profiles` (solo para compatibilidad)

**Regla crítica**: Para que la IA use el contexto del onboarding, los datos DEBEN llegar a la tabla `businesses`. No basta guardarlos en `brand_profiles`.

---

## 3. El mirror sync — `PUT /api/brand-profile`

Archivo: `artifacts/api-server/src/routes/brand-profile.ts` (líneas ~99-112)

Cuando el usuario guarda via `PUT /api/brand-profile` (onboarding o edición de perfil), el endpoint:
1. Guarda/actualiza `brand_profiles`
2. Copia ciertos campos al negocio por defecto (`businesses.is_default = true`) del usuario

### Campos en el mirror sync (completo):
```typescript
if ("logoUrl" in updates)             bizUpdates.logoUrl = updates.logoUrl;
if ("logoUrls" in updates)            bizUpdates.logoUrls = updates.logoUrls;
if ("primaryColor" in updates)        bizUpdates.primaryColor = updates.primaryColor;
if ("secondaryColor" in updates)      bizUpdates.secondaryColor = updates.secondaryColor;
if ("industry" in updates)            bizUpdates.industry = updates.industry;
if ("subIndustry" in updates)         bizUpdates.subIndustry = updates.subIndustry;
if ("slogan" in updates)              bizUpdates.slogan = updates.slogan;
if ("businessDescription" in updates) bizUpdates.description = updates.businessDescription; // ← nombre distinto
if ("audienceDescription" in updates) bizUpdates.audienceDescription = updates.audienceDescription;
if ("brandTone" in updates)           bizUpdates.brandTone = updates.brandTone;
if ("brandFont" in updates)           bizUpdates.brandFont = updates.brandFont;
if ("defaultLocation" in updates)     bizUpdates.defaultLocation = updates.defaultLocation;
```

### REGLA: Si agregas un campo que afecta la IA
1. Agrégalo a `brand_profiles` (Drizzle schema + migration)
2. Agrégalo a `businesses` si es un campo de contexto de marca
3. Agrégalo al mirror sync en `PUT /api/brand-profile`
4. Verifica que `getBrandContextBlock` lo lea y lo incluya en el prompt

---

## 4. Análisis automático de website

**Flujo completo:**
1. Usuario ingresa su URL en el campo "Sitio web" del step 0 del OnboardingWizard
2. Al hacer clic en "Siguiente" → `handleNext()` en el OnboardingWizard detecta si hay `data.website` y no hay `aiSuggestions`
3. Llama `triggerAnalyze(url)` en background (sin `await` bloqueante) → el usuario avanza al step 1 sin esperar
4. El análisis llama `POST /api/analyze-website` → OpenAI analiza el sitio → devuelve `{ description, audience, tone, primaryColor }`
5. Los resultados se guardan vía `PUT /api/brand-profile` con esos campos → `brand_profiles` + mirror sync → `businesses`

**Endpoint**: `POST /api/analyze-website` (o `POST /api/businesses/:id/analyze-website`)
**Output**: `{ description, audience, tone, primaryColor }`
**El `website` no se envía directamente a GPT** — se usa para scraping/análisis, los resultados sí.

---

## 5. La cola de aprobación (approval queue)

Lee de `businesses` en cada render (no cachea):
- `logoUrl`, `logoUrls` → logo en overlay
- `primaryColor`, `secondaryColor` → colores en overlay
- `brandFont`, `brandTextStyle` → tipografía en overlay
- `defaultLocation`, `defaultSignatureText`, `defaultShowSignature` → firma al pie

Cambios en Settings/Businesses (`PUT /api/businesses/:id`) → efecto inmediato en próxima imagen generada.
Cambios en OnboardingWizard o perfil (`PUT /api/brand-profile`) → pasan por mirror sync → mismo efecto.

---

## 6. Archivos clave

| Archivo | Rol |
|---|---|
| `artifacts/api-server/src/routes/brand-profile.ts` | Mirror sync brand_profiles → businesses |
| `artifacts/api-server/src/services/ai.service.ts` | `getBrandContextBlock()` — construye el prompt de marca |
| `artifacts/social-dashboard/src/components/OnboardingWizard.tsx` | UI del onboarding, incluye `triggerAnalyze` en `handleNext()` |
| `artifacts/api-server/src/lib/industries.ts` | Catálogo de industrias (fuente de verdad) |
| `artifacts/api-server/src/db/schema.ts` | Definición de `brand_profiles` y `businesses` |

---

## 7. Diagnóstico rápido: "la IA genera sin contexto"

```sql
-- Verifica si los campos llegaron a businesses (no basta con brand_profiles)
SELECT b.id, b.name, b.description, b.slogan, b.audience_description, b.brand_tone, b.brand_font
FROM businesses b
WHERE b.user_id = <USER_ID> AND b.is_default = true;

-- Compara con brand_profiles
SELECT bp.company_name, bp.business_description, bp.slogan, bp.audience_description, bp.brand_tone
FROM brand_profiles bp
WHERE bp.user_id = <USER_ID>;
```

Si `businesses.description` es NULL pero `brand_profiles.business_description` tiene valor → el mirror sync no está funcionando o el usuario completó el onboarding antes de que se implementara el fix.

**Fix de backfill para usuarios existentes** (startup migration):
```sql
UPDATE businesses b
SET
  slogan = COALESCE(b.slogan, bp.slogan),
  description = COALESCE(b.description, bp.business_description),
  audience_description = COALESCE(b.audience_description, bp.audience_description),
  brand_tone = COALESCE(b.brand_tone, bp.brand_tone),
  brand_font = COALESCE(b.brand_font, bp.brand_font),
  logo_urls = COALESCE(b.logo_urls, bp.logo_urls),
  default_location = COALESCE(b.default_location, bp.default_location)
FROM brand_profiles bp
WHERE bp.user_id = b.user_id
  AND b.is_default = true
  AND (b.slogan IS NULL OR b.description IS NULL OR b.audience_description IS NULL OR b.brand_tone IS NULL);
```
