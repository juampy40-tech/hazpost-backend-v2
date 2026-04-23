---
name: proactive-capabilities
description: >
  Instrucción permanente para HazPost: al implementar cualquier feature o fix,
  el agente debe identificar y crear proactivamente cualquier capacidad faltante —
  skills, endpoints, lógica DB, validaciones de seguridad, permisos, backfills o
  mejoras de estabilidad — que reduzca riesgo técnico u optimice el sistema.
  Úsalo al recibir cualquier tarea de implementación nueva antes de comenzar a codificar.
---

# Skill: Creación Proactiva de Capacidades

## Regla principal

**No implementar solo lo mínimo solicitado.** Siempre evaluar qué capacidades adicionales
son necesarias para que la feature sea completa, segura y estable en producción.

Una feature está completa cuando:
1. El código implementado funciona correctamente.
2. Los datos existentes (legacy) también funcionan correctamente con el código nuevo.
3. Los permisos y validaciones de seguridad están presentes y son correctos.
4. Las capacidades de soporte (skills, endpoints, índices, documentación) existen.

Si alguna de las 4 condiciones no se cumple, la feature **no está completa**.

---

## Cuándo activar el modo proactivo

Activar siempre que se reciba una tarea que involucre:

| Tipo de tarea | Por qué activa el modo |
|---------------|----------------------|
| Feature nueva | Puede necesitar endpoints de soporte, permisos, índices |
| Cambio de esquema DB | Requiere backfill legacy + migraciones idempotentes |
| Nuevo endpoint | Puede necesitar middleware de auth, rate limit, owner-check |
| Cambio de lógica de negocio | Puede afectar datos existentes (backfill) |
| Nueva tabla o columna | Requiere índices, constraints, seed data |
| Nuevo tipo de usuario/permiso | Requiere review de todos los endpoints afectados |
| Cambio de UI | Puede necesitar nuevos endpoints o campos en los existentes |

---

## Qué tipos de capacidades crear proactivamente

### 1. Skills de documentación y reglas de arquitectura

Cuando se implementa un sistema complejo (permisos, visibilidad, multi-tenancy,
pagos, generación de imágenes), crear un skill que documente las reglas.

**Por qué**: Un agente futuro que toque ese sistema sin leer el skill puede romperlo.

**Ejemplo — HazPost**:
- `backgrounds-library-rules`: reglas de visibilidad y borrado en Biblioteca de Fondos.
- `production-first`: regla de que todo va a producción para todos los usuarios.

**Cuándo crear**: Al terminar de implementar cualquier sistema que tenga reglas no
obvias de seguridad, visibilidad o propiedad.

---

### 2. Endpoints faltantes que la feature necesita

Al implementar una feature de UI, verificar que todos los endpoints necesarios existen.

**Checklist de endpoints a verificar**:
- ¿Existe GET para listar los recursos?
- ¿Existe GET por ID para detalle?
- ¿Existe POST/PUT para crear/editar?
- ¿Existe DELETE con owner-check estricto?
- ¿Existen endpoints de admin si aplica (sin admin bypass en rutas de usuario)?

**Ejemplo — HazPost**:
Al implementar la Biblioteca de Fondos, se necesitaron endpoints no pedidos explícitamente:
- `GET /api/backgrounds/:id/thumb` (thumbnail para previsualización)
- `GET /api/backgrounds/:id/raw` (imagen sin overlay)
- `DELETE /api/backgrounds/bulk` (borrado múltiple)
- `POST /api/backgrounds/deduplicate` (dedup de fondos duplicados)

---

### 3. Lógica DB: índices, constraints y triggers

Al agregar tablas o columnas, siempre evaluar:

**Índices necesarios**:
```sql
-- Índice para queries frecuentes por campo de filtro
CREATE INDEX IF NOT EXISTS idx_image_variants_user_id ON image_variants (user_id);

-- Índice parcial (para queries con WHERE)
CREATE INDEX IF NOT EXISTS idx_caption_addons_business
  ON caption_addons (business_id) WHERE business_id IS NOT NULL;

-- Índice único (para integridad)
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique
  ON users (my_referral_code) WHERE my_referral_code IS NOT NULL;
```

**Constraints de integridad**:
```sql
-- Constraint CHECK para valores válidos (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'niches_custom_text_position_check'
  ) THEN
    ALTER TABLE niches
      ADD CONSTRAINT niches_custom_text_position_check
      CHECK (custom_text_position IN ('before', 'after'));
  END IF;
END $$;
```

**Triggers de integridad referencial** (cuando FK no es suficiente):
```sql
-- Trigger que previene INSERT/UPDATE donde user_id no coincide con businesses.user_id
-- (PostgreSQL no permite subqueries en CHECK constraints, se usa trigger)
CREATE OR REPLACE FUNCTION enforce_post_tenant_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM businesses WHERE id = NEW.business_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'tenant integrity violation: post.user_id does not match business.user_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### 4. Validaciones de seguridad

Al agregar cualquier endpoint que accede a recursos de usuario, verificar:

**Owner-check estricto (sin admin bypass)**:
```typescript
// CORRECTO: owner-only, sin bypass
const [variant] = await db.select()
  .from(imageVariantsTable)
  .where(and(
    eq(imageVariantsTable.id, variantId),
    eq(imageVariantsTable.userId, uid),   // owner-check estricto
  ));
if (!variant) return res.status(404).json({ error: "Not found" });

// INCORRECTO: admin puede borrar fondos de cualquier usuario
const where = isAdmin
  ? eq(imageVariantsTable.id, variantId)
  : and(eq(imageVariantsTable.id, variantId), eq(imageVariantsTable.userId, uid));
```

**Auth middleware obligatorio**:
```typescript
// Toda ruta de usuario requiere requireAuth
router.delete("/:id", requireAuth, async (req, res) => { ... });

// Toda ruta de admin requiere requireAdmin (que incluye requireAuth)
router.get("/master", requireAdmin, async (req, res) => { ... });
```

**Tenant filter en consultas de lectura**:
```typescript
// Para Biblioteca de Fondos: usar tenantLibraryFilter (nunca tenantFilterVariants)
const filter = await tenantLibraryFilter(req, businessId);
const items = await db.select().from(imageVariantsTable).where(filter);
```

---

### 5. Funciones de backfill y migración para datos legacy

Al agregar una columna que debe tener datos para filas existentes:

```typescript
// Patrón en runStartupMigrations() — artifacts/api-server/src/index.ts
// Bloque separado para el backfill (después del DDL)
try {
  const legacyRows = await db.select({ id: imageVariantsTable.id, postId: imageVariantsTable.postId })
    .from(imageVariantsTable)
    .where(isNull(imageVariantsTable.userId));

  for (const row of legacyRows) {
    const [post] = await db.select({ userId: postsTable.userId })
      .from(postsTable)
      .where(eq(postsTable.id, row.postId));
    if (post?.userId) {
      await db.update(imageVariantsTable)
        .set({ userId: post.userId })
        .where(eq(imageVariantsTable.id, row.id));
    }
  }
  logger.info({ count: legacyRows.length }, "Backfill user_id complete");
} catch (err) {
  logger.warn({ err }, "Backfill user_id skipped");
}
```

---

### 6. Queries de verificación post-deploy

Al terminar cualquier cambio de esquema, documentar (en el commit o en el skill)
las queries de verificación para confirmar que producción está actualizado:

```sql
-- Verificar columna nueva
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'image_variants' AND column_name = 'industry_group_slug';

-- Verificar backfill completo (debe retornar 0)
SELECT COUNT(*) FROM image_variants WHERE user_id IS NULL AND post_id IS NOT NULL;

-- Verificar seed data
SELECT slug, display_name FROM industry_groups ORDER BY slug;
```

---

## Cómo priorizar las capacidades proactivas

Orden de prioridad estricto:

1. **Seguridad** — owner-checks, tenant filters, auth middleware, validaciones de permisos
2. **Integridad de datos** — constraints, triggers, backfill de datos legacy
3. **Estabilidad** — índices para queries frecuentes, manejo de errores, logging
4. **Documentación** — skills con reglas de arquitectura y patrones del sistema
5. **UX** — endpoints de conveniencia, paginación, ordenamiento, filtros adicionales

No sacrificar niveles superiores por niveles inferiores. Mejor entregar sin UX extra
que entregar con un owner-check faltante.

---

## Qué NUNCA omitir aunque no se pida

| Capacidad | Razón |
|-----------|-------|
| Owner-check en DELETE | Sin él, cualquier usuario puede borrar recursos ajenos |
| Tenant filter en GET | Sin él, un usuario puede ver datos de otro usuario |
| Backfill para columnas nuevas | Sin él, usuarios existentes tienen comportamiento diferente a nuevos |
| `requireAuth` en endpoints privados | Sin él, endpoints accesibles sin sesión |
| Idempotencia en migraciones | Sin ella, el servidor no arranca en prod si la migración ya corrió |
| Índices en columnas de filtro frecuente | Sin ellos, queries lentas en producción con datos reales |

---

## Patrón de reporte en el commit

Al crear capacidades proactivas (no pedidas explícitamente), documentarlo en el
commit message bajo la sección "Capacidades proactivas creadas":

```
feat: Biblioteca de Fondos con aislamiento por industria

Implementa sistema de visibilidad por niveles (N1: propios, N2: competencia directa)
y borrado owner-only estricto.

Capacidades proactivas creadas:
- Skill backgrounds-library-rules: reglas de visibilidad y borrado
- Índice idx_image_variants_industry_group en image_variants.industry_group_slug
- Backfill 5c: user_id propagado a 93 filas legacy
- Endpoint DELETE /api/backgrounds/bulk para borrado múltiple
- tenantLibraryFilter() en tenant.ts como función centralizada
```

---

## Ejemplo completo — HazPost Biblioteca de Fondos

Al implementar la Biblioteca de Fondos (T105), se identificaron y crearon proactivamente:

**Seguridad**:
- `tenantLibraryFilter()` — función centralizada sin admin bypass
- Owner-check estricto en DELETE individual y bulk
- Separación explícita entre rutas de usuario (`/api/backgrounds`) y admin (`/api/admin/backgrounds-master`)

**Integridad de datos**:
- Columnas `business_id` e `industry_group_slug` en `image_variants`
- Backfill SQL: `UPDATE image_variants SET user_id = posts.user_id` (93 filas legacy)
- Backfill SQL: `UPDATE image_variants SET industry_group_slug FROM businesses`

**Estabilidad**:
- 17 grupos de industria en seed idempotente (`INSERT ... ON CONFLICT DO NOTHING`)
- Startup migration idempotente en 3 bloques separados (DDL, backfill JS, backfill SQL)

**Documentación**:
- Skill `backgrounds-library-rules` con 9 secciones de reglas no negociables

**UX**:
- Badge "Otra [grupo]" en frontend para fondos de competencia (N2)
- Delete button oculto para fondos ajenos
- `queryKey: ["backgrounds", activeBusinessId]` para invalidación correcta de cache
