---
name: reference-image-upload
description: Arquitectura y reglas del flujo de imagen de referencia en tiempo real en la Cola de Aprobación de HazPost. Úsalo ANTES de modificar el input de referencia en approval.tsx, la función analyzeReferenceImage en ai.service.ts, o cualquier lógica que procese body.referenceImageBase64. Cubre formatos soportados, conversión obligatoria a JPEG, distinción con imágenes de referencia guardadas del onboarding, prompt de análisis y prioridad en la generación.
---

# Skill: Imagen de referencia en tiempo real — Cola de Aprobación

## Distinción crítica: dos flows de referencia en HazPost

| Flow | Dónde se carga | Cómo se guarda | Quién lo procesa |
|------|---------------|----------------|-----------------|
| **Real-time** (ESTE SKILL) | Cola de Aprobación → "Imagen de referencia" | En memoria como `referenceImageBase64` (state) | `analyzeReferenceImage()` en ai.service.ts |
| **Onboarding** | Settings → Fotos de referencia del negocio | `businesses.referenceImages` en DB | `getBusinessSavedRefStyle()` en ai.service.ts |

**⚠️ No confundir.** El skill `image-business-concordance` cubre V8/V9 (flujo onboarding).
Este skill cubre el flujo real-time de la Cola de Aprobación.

---

## Regla obligatoria: convertir a JPEG antes de almacenar

### Por qué
GPT-4o Vision solo soporta: **JPEG, PNG, GIF, WebP**

Los siguientes formatos NO son soportados y fallan silenciosamente (retornan `""`):
- AVIF (formato moderno de Chrome/Android)
- HEIC / HEIF (iPhone)
- TIFF
- BMP
- WebP animado (con múltiples frames)

Si `analyzeReferenceImage()` recibe un formato no soportado, falla sin error visible y retorna
`""`. Resultado: la imagen de referencia tiene **cero influencia** en la generación — DALL-E
genera como si no hubiera referencia.

### Patrón correcto en approval.tsx

```tsx
// ✅ CORRECTO — convierte a JPEG via Canvas API antes de almacenar
reader.onload = ev => {
  const srcDataUri = ev.target?.result as string;
  setReferenceImagePreview(srcDataUri); // preview: browser maneja el original nativamente
  // Conversión obligatoria a JPEG para compatibilidad con GPT-4o Vision
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setReferenceImageBase64(canvas.toDataURL("image/jpeg", 0.85));
      } else {
        setReferenceImageBase64(srcDataUri); // fallback si no hay contexto 2D
      }
    } catch {
      setReferenceImageBase64(srcDataUri); // fallback ante cualquier error de canvas
    }
  };
  img.onerror = () => setReferenceImageBase64(srcDataUri); // fallback si no carga
  img.src = srcDataUri;
};
reader.readAsDataURL(file);
```

```tsx
// ❌ ANTI-PATRÓN — puede enviar AVIF, HEIC u otros no soportados
reader.onload = ev => {
  const dataUri = ev.target?.result as string;
  setReferenceImageBase64(dataUri); // ← sin conversión, puede ser AVIF
  setReferenceImagePreview(dataUri);
};
```

### Por qué preview y base64 son diferentes
- **`referenceImagePreview`**: se usa en `<img src={...}>` en el UI. Los navegadores modernos
  pueden mostrar AVIF nativamente en el DOM, por eso el original está bien aquí.
- **`referenceImageBase64`**: se envía a la API que llama a GPT-4o Vision. Debe ser JPEG/PNG.

---

## analyzeReferenceImage — comportamiento y prompt

**Archivo**: `artifacts/api-server/src/services/ai.service.ts`
**Línea**: ~1832 (`export async function analyzeReferenceImage`)

### Qué hace
1. Recibe un base64 o data URI de imagen (después del fix: siempre JPEG)
2. Llama a GPT-4o con la imagen vía Vision API (detail: "low")
3. Retorna una descripción textual en ≤ 400 chars
4. Si falla → retorna `""` silenciosamente (el caller continúa sin descripción)

### Prompt correcto (incluye escena Y estilo)

```typescript
// ✅ CORRECTO — incluye tipo de sujeto/escena para que DALL-E pueda replicar ambos
content:
  "Eres un director de arte especializado en fotografía comercial para redes sociales. " +
  "Analiza la imagen de referencia y describe en 2-3 oraciones TANTO el tipo de escena " +
  "COMO el estilo visual que el cliente quiere replicar en su imagen generada. " +
  "Incluye: si hay personas (tipo, expresión, postura), entorno o fondo de la escena, " +
  "ambiente/atmósfera, iluminación, paleta de colores dominante, tipo de composición, " +
  "sensación general (profesional/cálida/industrial/etc). " +
  "NO menciones marcas, logos, texto visible ni nombres de empresas de la imagen. " +
  "Responde solo con la descripción, sin títulos ni bullet points.",
```

```typescript
// ❌ ANTI-PATRÓN — excluye el sujeto/escena, solo captura estilo abstracto
// Si el usuario sube una persona, DALL-E no sabe que debe incluir una persona
"Describe SOLO el estilo visual puro — no el contenido específico de la marca."
```

---

## Prioridad del estilo de referencia en la generación

En el endpoint `POST /:id/generate-image-variant` (posts.ts ~línea 1966):

```
1. body.referenceImageBase64 existe →
   analyzeReferenceImage(base64) → enrichedInstruction += styleDesc   ← MAYOR PRIORIDAD

2. body.referenceImageBase64 es vacío Y existe bizId →
   getBusinessSavedRefStyle(bizId, userId) → enrichedInstruction += savedRefStyle

3. Ninguno → sin influencia de referencia (solo industria/niche)
```

La descripción de referencia se añade a `enrichedInstruction` que va como instrucción
adicional al prompt de DALL-E (no como parámetro de imagen — es texto).

---

## Persistencia del styleDescription (Task #368)

Cuando `analyzeReferenceImage()` retorna una descripción no vacía, el resultado se persiste automáticamente como señal de aprendizaje visual:

```typescript
// posts.ts — en /:id/generate-image-variant, /generate-bulk, /generate-extra
if (styleDesc) {
  // ... aplica al prompt ...
  void recordVisualSignal({
    userId,
    businessId,
    postId,
    signalType: "reference_image",
    imageDescription: styleDesc,  // ← se guarda para aprendizaje futuro
  });
}
```

Después de ≥3 referencias, el cron diario (`extractVisualEditSignals`) analiza las descripciones con GPT-4.1-mini y extrae preferencias visuales persistentes (`user_visual_pattern`) que se inyectan en futuras generaciones automáticas.

**NUNCA registrar la señal si `styleDesc` está vacío** — `analyzeReferenceImage` retorna `""` cuando falla.

---

## Archivos relevantes

| Archivo | Propósito |
|---------|-----------|
| `artifacts/social-dashboard/src/pages/approval.tsx` | Input de referencia + conversión a JPEG (~línea 6882) |
| `artifacts/api-server/src/services/ai.service.ts` | `analyzeReferenceImage()` (~línea 1832) + `getBusinessSavedRefStyle()` (~línea 1896) |
| `artifacts/api-server/src/routes/social/posts.ts` | Endpoint `/:id/generate-image-variant` que usa `body.referenceImageBase64` (~línea 1968) |
| `artifacts/api-server/src/services/learning.service.ts` | `recordVisualSignal()` + `extractVisualEditSignals()` + `getUserVisualPrefs()` |
| `lib/db/src/schema/user_visual_signals.ts` | Tabla de señales visuales — ver ai-learning-engine skill para más detalle |

---

## Criterios de aceptación

- [ ] Subir AVIF en "Imagen de referencia" → `referenceImageBase64` tiene MIME `image/jpeg`
- [ ] La preview sigue mostrando la imagen original (AVIF) en el UI
- [ ] Los logs del servidor muestran `[analyzeReferenceImage] extracted style (N chars)` con N > 0 al subir AVIF
- [ ] La imagen generada incluye tipo de sujeto/escena de la referencia (persona si la ref muestra persona)
- [ ] El fallback funciona: si canvas falla, se usa el data URI original
- [ ] El flujo de "Subir foto" (bgUpload con mediaId) NO fue afectado

---

## Debugging

```bash
# Verificar que analyzeReferenceImage retorna descripción no vacía:
# Revisar logs del API server al generar una imagen con referencia:
grep "\[analyzeReferenceImage\]" /tmp/logs/api-server*.log
# Debe mostrar: extracted style (N chars) con N > 0

# Si retorna 0 chars → el formato aún es incorrecto o GPT-4o falló
# Si retorna chars pero la imagen no parece la referencia → prompt insuficiente
```
