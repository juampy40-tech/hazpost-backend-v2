---
name: image-business-concordance
description: Detecta y diagnostica cuándo las imágenes generadas no concuerdan con el tipo de negocio. Úsalo cuando una panadería recibe un médico, una boutique recibe un mecánico, o cualquier negocio recibe una escena de una industria diferente a la suya. También cubre la contaminación de escena entre negocios del mismo usuario.
---

# Skill: Concordancia Industria-Negocio vs. Imagen Generada

## Propósito
Detectar, diagnosticar y corregir discordancias entre el tipo de negocio registrado y
la escena/personaje que aparece en las imágenes generadas por IA.

**Diferencia con los otros skills de contaminación:**
| Skill | Problema que resuelve |
|-------|-----------------------|
| `cross-user-contamination` | Usuario A ve datos del Usuario B |
| `cross-business-contamination` | Negocio A recibe colores/logo/firma del Negocio B (mismo usuario) |
| `image-business-concordance` (ESTE) | El negocio recibe una escena de imagen de la industria equivocada |

## Cuándo activar este skill
- Una panadería genera un post y la imagen muestra un médico con estetoscopio
- Una boutique de ropa recibe una imagen de un mecánico de autos
- Un gimnasio recibe una imagen de un restaurante
- Una clínica dental recibe una imagen de una farmacia
- Un negocio recibe caracteres aleatorios sin relación con su actividad
- Después de modificar `NICHE_SCENE_ENTRIES` o `CHARACTER_BANK` en `ai.service.ts`
- Después de agregar nuevas opciones al enum `INDUSTRIES` de `businesses.tsx`
- Al configurar un negocio sin seleccionar su campo `industry`

---

## Flujo completo de selección de escena de imagen

La escena de imagen se determina en `generateImagesForPostsBg` siguiendo este orden de prioridad estricto:

```
1. job.imageScene                              ← brief del usuario (mayor prioridad — override total)
2. deriveBusinessIndustryScene(industry, idx)  ← industria del negocio registrada (rotación por jobIdx)
3. deriveNicheScene(nicheContextShort, idx)    ← keywords del texto del nicho (rotación por jobIdx)
4. job.batchRefStyle                           ← imagen de referencia subida en este batch
5. CHARACTER_BANK + BACKGROUND_SCENES          ← genérico (menor prioridad)
```

**Arquitectura multi-variante (Task #361):**
- `NicheSceneEntry` cambió de `scene: string` a `scenes: string[]` (4-6 variantes por industria)
- `deriveBusinessIndustryScene(industry, variantIdx)` y `deriveNicheScene(text, variantIdx)` aceptan un índice
- `variantIdx = jobIdx` — cada post en un batch de 30 recibe un índice distinto (0, 1, 2...) que rota entre las 4-6 variantes disponibles
- **Enriquecimiento temático**: cuando la escena viene de `deriveBusinessIndustryScene`, se añade el topic del nicho como directiva sutil: `"reflect this theme subtly in the character's expression, activity, or props"`

### Código real del flujo
```typescript
// variantIdx = jobIdx permite rotación de variante visual entre posts del mismo batch
const industryScene = deriveBusinessIndustryScene(jobIndustry, jobIdx);
if (industryScene) {
  nicheSpecificScene = industryScene;
  // Enriquecimiento temático del nicho
  const nicheHint = job.nicheContextShort?.trim().slice(0, 60);
  if (nicheHint) {
    nicheSpecificScene = `${nicheSpecificScene}. The post is about "${nicheHint}" — reflect this theme subtly in the character's expression, activity, or the props in the scene.`;
  }
} else {
  // Fallback keyword whitelist con rotación de variante
  nicheSpecificScene = deriveNicheScene(job.nicheContextShort, jobIdx);
}
```

**Resultado:** Un batch de 30 posts para una panadería producirá imágenes visualmente distintas:
- Post 0: panadero presentando tray de panes (variante 0)
- Post 1: pastelera decorando torta de cumpleaños (variante 1)
- Post 2: display counter con croissants y almojábanas (variante 2)
- Post 3: dueña hablando con clientes en la sala (variante 3)
- Post 4: close-up de manos amasando (variante 4) → ciclo vuelve a 0

---

## Mapa de vectores de riesgo de concordancia

| # | Descripción | Causa | Severidad |
|---|-------------|-------|-----------|
| V1 | Negocio de bienestar/panadería recibe imagen médica | Keyword genérico ("bienestar") en entrada médica de NICHE_SCENE_ENTRIES — ya corregido en Task #58 | **ALTA** — corregido |
| V2 | Negocio sin `industry` configurada | Solo se usan keywords del nicho → mayor probabilidad de mismatch | **ALTA** — accionable |
| V3 | Niche text genérico ("motivación", "finanzas personales") | No matchea keywords → CHARACTER_BANK random → cualquier personaje | **MEDIA** |
| V4 | `nicheContextShort` muy corto o vacío | Sin keywords → CHARACTER_BANK → sin contexto de industria | **MEDIA** |
| V5 | Nuevo keyword genérico añadido a NICHE_SCENE_ENTRIES | Puede crear falsos positivos en otras industrias | **ALTA** (al agregar) |
| V6 | Nueva industria en INDUSTRIES enum sin mapeo en deriveBusinessIndustryScene | El negocio nuevo caerá a keyword fallback, sin prioridad de industria | **ALTA** — corregido en Task #261 |
| V7 | Industria en selector del onboarding no coincide con INDUSTRY_CATALOG del backend | String guardado en DB no matchea ningún case de deriveBusinessIndustryScene | **ALTA** — corregido en Task #261 |
| V8 | Fotos de referencia del onboarding guardadas como base64 plano sin análisis | El motor de imágenes ignora entradas sin campo `analysis` | **ALTA** — corregido en Task #261 |
| V9 | brand_profiles.referenceImages no propagada a businesses.referenceImages | generateImagesForPostsBg lee de businesses, no de brand_profiles | **ALTA** — corregido en Task #261 |

**Regla derivada de V6+V7:** Ver skill `industry-scene-sync-rule` — esta regla debe consultarse ANTES de modificar el selector de industrias o el motor de escenas.

---

## Protocolo de diagnóstico (paso a paso)

### Paso 1 — Identificar el negocio y su industry

```sql
-- Ver industry registrada del negocio afectado
SELECT id, name, industry, description
FROM businesses
WHERE id = <bizId>;
-- Si industry es NULL → V2: el negocio no tiene industria configurada
-- Si industry tiene un valor → verificar si está en deriveBusinessIndustryScene
```

### Paso 2 — Ver los últimos posts y su nicheContextShort

```sql
-- Últimos posts del negocio con su contexto de nicho
SELECT p.id, p.content_type, p.platform, p.created_at,
       n.name AS niche_name, n.context_short AS niche_context_short
FROM posts p
LEFT JOIN niches n ON n.id = p.niche_id
WHERE p.business_id = <bizId>
ORDER BY p.created_at DESC
LIMIT 10;
```

### Paso 3 — Simular qué escena se habría seleccionado

```bash
# Verificar si la industria del negocio tiene mapeo en deriveBusinessIndustryScene:
grep -A 3 "deriveBusinessIndustryScene" artifacts/api-server/src/services/ai.service.ts \
  | grep -i "<industry-keyword>"
# Si no aparece → V6: industria sin mapeo

# Verificar si el nicheContextShort matchea algún keyword en NICHE_SCENE_ENTRIES:
# Abrir ai.service.ts y buscar en NICHE_SCENE_ENTRIES los keywords del niche text
grep -n "NICHE_SCENE_ENTRIES" artifacts/api-server/src/services/ai.service.ts
# Ver las entradas y verificar si algún keyword aparece en el nicheContextShort del post
```

### Paso 4 — Verificar que "bienestar" no está en keywords médicos (V1)

```bash
# Este keyword fue removido en Task #58. Confirmar que no regresó:
grep -n '"bienestar"' artifacts/api-server/src/services/ai.service.ts
# Resultado esperado: 0 resultados (o solo en comentarios)
```

### Paso 5 — Test manual de concordancia

1. Abrir la app como el usuario afectado
2. Seleccionar el negocio afectado
3. Generar 1-2 posts con el mismo nicho/tema que produjo la imagen incorrecta
4. Verificar en la cola de aprobación que la imagen muestra el tipo correcto:
   - Panadería → panadero con pan artesanal
   - Restaurante → chef con plato elaborado
   - Clínica → médico/doctor en clínica
   - Boutique → modelo con ropa en tienda
5. Si la imagen sigue siendo incorrecta, revisar Paso 3 nuevamente

---

## Patrones inseguros vs. seguros

### Patrón inseguro: keyword genérico en NICHE_SCENE_ENTRIES (V1/V5)
```typescript
// ❌ INSEGURO — "bienestar" es demasiado genérico, afecta a cualquier negocio
// que mencione salud/bienestar en sus posts aunque no sea un negocio médico
{
  keywords: ["clínica", "clinica", "médico", ..., "bienestar"],  // ← peligroso
  scene: "a professional Colombian doctor...",
}

// ✅ SEGURO — keywords específicos del sector médico únicamente
{
  keywords: ["clínica", "clinica", "médico", "medico", "salud", "consulta", "enfermera", "hospital"],
  scene: "a professional Colombian doctor...",
}
// Regla: un keyword solo debe pertenecer a UNA industria. Si es ambiguo, no incluirlo.
```

### Patrón inseguro: industry del negocio ignorada en selección de escena
```typescript
// ❌ INSEGURO — ANTES de Task #58: solo keywords del niche text determinan la escena
if (!job.imageScene && !job.batchRefStyle && !isSolar) {
  nicheSpecificScene = deriveNicheScene(job.nicheContextShort); // solo texto, ignora industry
}
// Una panadería que escribe sobre "bienestar" → escena médica

// ✅ SEGURO — DESPUÉS de Task #58: industry del negocio tiene prioridad
if (!job.imageScene && !job.batchRefStyle && !isSolar) {
  const industryScene = deriveBusinessIndustryScene(jobIndustry); // ← primero
  if (industryScene) {
    nicheSpecificScene = industryScene;
  } else {
    nicheSpecificScene = deriveNicheScene(job.nicheContextShort); // ← fallback
  }
}
```

### Patrón inseguro: nueva industria sin mapeo (V6)
```typescript
// ❌ INSEGURO — agregar "Mascotas & Veterinaria" al INDUSTRIES enum sin actualizar
// deriveBusinessIndustryScene → el negocio cae a keyword fallback
const INDUSTRIES = [
  ..., "Mascotas & Veterinaria"  // ← sin mapeo en deriveBusinessIndustryScene
];

// ✅ SEGURO — siempre agregar el mapeo correspondiente
function deriveBusinessIndustryScene(industry: string | null | undefined): string | null {
  // ...
  if (lower.includes("mascota") || lower.includes("veterinar"))
    return findScene("mascota");  // ← nuevo mapeo requerido
  // ...
}
```

---

## Fix estándar

### Fix V1/V5 — Keyword genérico en NICHE_SCENE_ENTRIES
```typescript
// ai.service.ts — NICHE_SCENE_ENTRIES (~línea 2803)
// 1. Identificar el keyword genérico problemático
// 2. Verificar si ese keyword puede aparecer en posts de OTRA industria
// 3. Si es ambiguo → removerlo del keywords array
// 4. Si pertenece claramente a una industria → dejarlo, pero hacer más específico el niche text

// Ejemplo: "bienestar" removido del médico → correcto
// Ejemplo: "restaurante" en entrada de comida → aceptable (no ambiguo)
```

### Fix V2 — Negocio sin industry configurada
```sql
-- Detectar negocios sin industry:
SELECT id, name, industry FROM businesses WHERE industry IS NULL OR industry = '';

-- Fix: pedirle al usuario que configure su industria en la página de Negocios
-- O en el código: asegurarse que el onboarding requiera el campo industry
```

### Fix V6 — Nueva industria sin mapeo en deriveBusinessIndustryScene
```typescript
// Siempre que se agregue a INDUSTRIES en businesses.tsx, agregar aquí también:
// ai.service.ts — función deriveBusinessIndustryScene (~línea 2959)
function deriveBusinessIndustryScene(industry: string | null | undefined): string | null {
  // ...
  if (lower.includes("<nueva-industria-keyword>"))
    return findScene("<keyword-en-NICHE_SCENE_ENTRIES>");
  // ...
}
```

---

## Queries SQL de auditoría preventiva

```sql
-- Auditoría 1: negocios sin industry configurada (V2)
SELECT b.id, b.name, b.user_id, u.email
FROM businesses b
JOIN users u ON u.id = b.user_id
WHERE b.industry IS NULL OR b.industry = ''
ORDER BY b.created_at DESC;

-- Auditoría 2: distribución de industries registradas
SELECT industry, COUNT(*) AS total
FROM businesses
GROUP BY industry
ORDER BY total DESC;
-- Verifica que los valores usados coincidan con el enum INDUSTRIES de businesses.tsx

-- Auditoría 3: posts recientes de negocios sin industry (alto riesgo de V2)
SELECT p.id, p.business_id, b.name AS biz_name, b.industry,
       n.name AS niche_name, n.context_short
FROM posts p
JOIN businesses b ON b.id = p.business_id
LEFT JOIN niches n ON n.id = p.niche_id
WHERE (b.industry IS NULL OR b.industry = '')
  AND p.created_at > NOW() - INTERVAL '7 days'
ORDER BY p.created_at DESC
LIMIT 20;
```

---

## Reglas al modificar NICHE_SCENE_ENTRIES o INDUSTRIES

Cada vez que se toque cualquiera de estos dos lugares, verificar:

1. **Al agregar un keyword a NICHE_SCENE_ENTRIES:**
   - ¿Es el keyword específico de esa industria o puede aparecer en posts de otras? Si es genérico → no agregar
   - ¿Ya existe en otro entry? Buscar con `grep` antes de agregar

2. **Al agregar una entrada nueva a NICHE_SCENE_ENTRIES:**
   - ¿Existe el mapeo en `deriveBusinessIndustryScene`? Si no → agregar inmediatamente

3. **Al agregar un valor al enum INDUSTRIES (businesses.tsx):**
   - ¿Existe el mapeo en `deriveBusinessIndustryScene`? Si no → agregar inmediatamente
   - Si la nueva industria no tiene escena clara (return null es aceptable), documentar por qué

4. **Comando de verificación rápida post-cambio:**
```bash
# Verificar que todos los INDUSTRIES del enum tienen cobertura en deriveBusinessIndustryScene:
grep -A 60 "function deriveBusinessIndustryScene" artifacts/api-server/src/services/ai.service.ts
# Comparar manualmente con INDUSTRIES en businesses.tsx:13-18
```

---

## Criterios de aceptación

- [ ] Una panadería con industry="Restaurante & Comida" genera imágenes de chef/panadero (nunca médico)
- [ ] Un negocio médico (industry="Salud & Bienestar") genera imágenes de doctor aunque sus posts no mencionen "clínica"
- [ ] El texto "bienestar emocional" en el nicho de una panadería NO produce escena médica
- [ ] `grep '"bienestar"' ai.service.ts` retorna 0 resultados en NICHE_SCENE_ENTRIES keywords
- [ ] Todo valor en el enum INDUSTRIES de businesses.tsx tiene cobertura en `deriveBusinessIndustryScene`
- [ ] Negocios sin industry configurada generan imágenes razonables (keyword fallback, no crash)
- [ ] Negocios solares siguen usando el flujo solar especial (no afectados por los cambios)
- [ ] Las auditorías SQL de negocios sin industry retornan 0 o el equipo fue notificado para configurarlas
