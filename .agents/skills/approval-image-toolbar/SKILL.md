---
name: approval-image-toolbar
description: Reglas de disposición del toolbar de generación de imágenes en la Cola de Aprobación (approval.tsx). Úsalo ANTES de agregar, mover o eliminar botones del toolbar de generación de imágenes en approval.tsx. Define la estructura de 2 filas obligatoria, qué botones van en cada fila, y el anti-patrón de fila única que oculta el botón "Crear imagen".
---

# Skill: Toolbar de Generación de Imágenes — Cola de Aprobación

## Regla fundamental: 2 filas, NO una sola

El toolbar de generación de imágenes en `approval.tsx` DEBE tener **2 filas** separadas.

```
❌ ANTI-PATRÓN — una sola fila (los botones shrink-0 empujan "Crear imagen" fuera del área visible):
<div className="flex gap-2">
  [Mismo fondo] [Subir foto] [Biblioteca de fondos] [Biblioteca de elementos] [Crear imagen]
</div>

✅ CORRECTO — 2 filas:
<div className="flex gap-2">   ← Fila 1: acciones primarias
  [Mismo fondo / Usar foto real / Usar biblioteca]   [Subir foto]   [Crear imagen]
</div>
<div className="flex gap-2">   ← Fila 2: bibliotecas
  [Biblioteca de fondos]   [Biblioteca de elementos]
</div>
```

---

## Fila 1 — Acciones primarias (SIEMPRE visibles)

| Botón | Condición | Propósito |
|-------|-----------|-----------|
| **Usar foto real** | `libraryMedia != null` | Aplica overlays sobre la foto real subida (sin DALL-E) |
| **Usar biblioteca** | `libraryBg != null` | Aplica texto/logo sobre fondo de biblioteca (sin DALL-E) |
| **Mismo fondo** | `activeImage?.rawBackground != null` | Re-aplica overlays sobre el fondo ya generado (sin DALL-E) |
| *(placeholder)* | `activeImage != null` (sin rawBackground) | Informa que hay que generar primero |
| *(ausente)* | `activeImage == null` | No se muestra nada en la primera posición |
| **Subir foto** | siempre | Sube una foto local para usar como fondo (sin DALL-E) |
| **Crear imagen** | siempre | Genera una nueva imagen con DALL-E |

**Los 3 botones de la fila 1 deben tener `flex-1`** para ocupar el espacio equitativamente.

### Prioridad del botón condicional (posición 1)

```
libraryMedia != null → "Usar foto real"
else libraryBg != null → "Usar biblioteca"
else activeImage?.rawBackground != null → "Mismo fondo"
else activeImage != null → placeholder informativo
else → null
```

### Botón "Crear imagen" (siempre en fila 1)

```tsx
<Button
  onClick={() => {
    setPendingVariantInstruction(imageInstruction || undefined);
    setVariantWarningOpen(true);
  }}
  disabled={generateImageVariant.isPending || isCheckingSpell}
  className="flex-1 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
  variant="outline"
>
  {generateImageVariant.isPending
    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generando...</>
    : isCheckingSpell
    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Verificando...</>
    : <><Sparkles className="w-4 h-4 mr-1.5" />Crear imagen</>
  }
</Button>
```

Este botón abre `setVariantWarningOpen(true)` (modal de confirmación) → genera con DALL-E.
**Nunca moverlo a la fila 2** — el usuario lo necesita visible cuando describe una imagen o sube una imagen de referencia.

---

## Fila 2 — Bibliotecas

| Botón | Propósito |
|-------|-----------|
| **Biblioteca de fondos** | Abre `bgDrawerOpen` (Sheet) con fondos IA ya generados |
| **Biblioteca de elementos** | Togglea `showElemLibraryPanel` (panel inline de IA+elemento) |

**Ambos botones usan `flex-1`** (no `shrink-0`) para llenar el ancho uniformemente.

```tsx
{/* ── Fila 2: bibliotecas ── */}
<div className="flex gap-2">
  <Button
    onClick={() => { setBgDrawerOpen(true); fetchBgItems(true); }}
    variant="outline"
    className="flex-1 gap-1.5 border-border/30 text-muted-foreground hover:text-primary hover:border-primary/40"
  >
    <Layers className="w-4 h-4" />
    Biblioteca de fondos
  </Button>
  <Button
    onClick={() => { /* toggle showElemLibraryPanel */ }}
    variant="outline"
    className={`flex-1 gap-1.5 border-border/30 transition-colors ${showElemLibraryPanel ? "text-fuchsia-400 ..." : "text-muted-foreground ..."}`}
  >
    <Sparkles className="w-4 h-4" />
    Biblioteca de elementos
  </Button>
</div>
```

---

## Archivo y ubicación

- **Archivo**: `artifacts/social-dashboard/src/pages/approval.tsx`
- **Sección**: buscar el comentario `{/* ── Fila 1: acciones primarias */}` (~línea 5845)
- **Wrapper externo**: `<div className="flex flex-col gap-2">` que contiene ambas filas
- **Línea aproximada (puede variar)**: 5840–6010

---

## Criterios de aceptación

- [ ] El botón "Crear imagen" es visible SIN hacer scroll horizontal en cualquier ancho de pantalla
- [ ] El botón "Crear imagen" aparece en la primera fila junto a "Mismo fondo" y "Subir foto"
- [ ] "Biblioteca de fondos" y "Biblioteca de elementos" están en la segunda fila
- [ ] Los botones de la fila 2 usan `flex-1` (no `shrink-0`)
- [ ] Al describir una imagen o subir imagen de referencia, "Crear imagen" sigue siendo visible
- [ ] Ninguna funcionalidad existente fue eliminada (todos los onClick se mantienen intactos)

---

## Contexto: por qué "Crear imagen" debe estar en fila 1

El usuario usa este flujo cuando quiere generar una nueva imagen con IA:
1. Escribe una descripción en "¿Qué imagen quieres?" (optional)
2. Sube una imagen de referencia (opcional)
3. Hace click en **"Crear imagen"** → abre el modal de confirmación de créditos → genera con DALL-E

Si "Crear imagen" está en la fila 2 junto a las bibliotecas, o peor, si se empuja fuera del área visible por botones con `shrink-0`, el usuario no puede generar nuevas imágenes. Este fue el bug original que motivó la creación de este skill.
