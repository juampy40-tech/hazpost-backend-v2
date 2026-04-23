---
name: production-first
description: >
  Regla de alcance irrenunciable para HazPost: todo cambio (código, migración,
  configuración, feature) debe desplegarse en producción y afectar a TODOS los usuarios
  y negocios (nuevos y existentes) desde el primer momento. Úsalo antes de implementar
  cualquier feature, modificar el esquema DB, agregar endpoints o cambiar lógica de
  negocio. La única excepción es cuando el usuario diga explícitamente "modo de prueba",
  "test" o "solo dev".
---

# Skill: Producción-Primero (Production-First)

## Regla principal

**Toda feature se considera INCOMPLETA hasta estar desplegada en producción.**

El agente debe asumir siempre que el destino final es el servidor de producción con
datos reales, usuarios reales y negocios reales. No es aceptable que una feature
"funcione en dev" pero no en producción por columnas faltantes, datos legacy sin
backfill, migraciones que nunca se corrieron, o lógica condicionada al entorno.

Esta regla aplica a:
- Nuevas columnas en tablas existentes
- Nuevas tablas
- Cambios de lógica de negocio que afectan datos existentes
- Nuevos endpoints o rutas
- Nuevas validaciones o permisos
- Cambios de configuración

---

## La única excepción

El agente puede trabajar solo en dev (sin afectar producción) **únicamente** si el
usuario indica explícitamente alguna de estas frases o equivalentes:

- "modo de prueba"
- "test"
- "solo dev"
- "no subir a producción"
- "experimental"
- "prueba esto antes de aplicarlo"

Si el usuario **no** dice ninguna de estas frases, el agente asume producción completa.
**No asumir jamás que "esto es solo una prueba" sin instrucción explícita del usuario.**

---

## Migraciones idempotentes (OBLIGATORIO)

Toda migración de esquema debe ser idempotente: ejecutable múltiples veces sin error
y sin efecto secundario si ya está aplicada.

### Patrón correcto para columnas nuevas

```sql
-- CORRECTO: idempotente
ALTER TABLE image_variants ADD COLUMN IF NOT EXISTS industry_group_slug TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_group_slug TEXT;

-- INCORRECTO: falla si la columna ya existe
ALTER TABLE image_variants ADD COLUMN industry_group_slug TEXT;
```

### Patrón correcto para tablas nuevas

```sql
-- CORRECTO: idempotente
CREATE TABLE IF NOT EXISTS industry_groups (
  id   SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- INCORRECTO: falla si la tabla ya existe
CREATE TABLE industry_groups (...);
```

### Patrón correcto para índices

```sql
-- CORRECTO
CREATE INDEX IF NOT EXISTS idx_image_variants_user_id ON image_variants (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique ON users (my_referral_code)
  WHERE my_referral_code IS NOT NULL;

-- INCORRECTO
CREATE INDEX idx_image_variants_user_id ON image_variants (user_id);
```

### Patrón correcto para constraints (DO $$ ... END $$)

```sql
-- CORRECTO: verifica antes de agregar
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

---

## Backfill obligatorio para datos legacy

Cuando se agrega una nueva columna que debe tener datos para filas existentes,
**siempre se debe incluir un backfill** que actualice las filas históricas.

### Ejemplo: columna user_id en image_variants (backfill 5c)

```sql
-- Backfill: asignar user_id a filas legacy que lo tienen NULL
-- (recuperado desde la tabla posts a través del join)
UPDATE image_variants iv
SET user_id = p.user_id
FROM posts p
WHERE iv.post_id = p.id
  AND iv.user_id IS NULL
  AND p.user_id IS NOT NULL;
```

### Ejemplo: industry_group_slug en image_variants (backfill 5b)

```sql
-- Backfill: propagar slug desde businesses a image_variants existentes
UPDATE image_variants iv
SET industry_group_slug = b.industry_group_slug
FROM businesses b
WHERE iv.business_id = b.id
  AND iv.industry_group_slug IS NULL
  AND b.industry_group_slug IS NOT NULL;
```

**Regla**: Si el backfill requiere lógica de aplicación (no solo SQL), ejecutarlo
en TypeScript dentro de `runStartupMigrations()` usando el ORM, después del DDL.

---

## Dónde ejecutar las migraciones (Startup Migration Pattern)

HazPost usa el patrón de **startup migrations**: las migraciones se ejecutan
automáticamente al iniciar el servidor, dentro de `runStartupMigrations()`.

**Archivo**: `artifacts/api-server/src/index.ts`
**Función**: `runStartupMigrations()` — llamada antes de `app.listen()`

### Estructura de la función

```typescript
async function runStartupMigrations() {
  // Bloque 1: DDL agrupado (columnas y tablas nuevas)
  try {
    await db.execute(sql`ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TEXT`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS baz (...)`);
    logger.info("Startup migrations applied");
  } catch (err) {
    logger.warn({ err }, "Startup migration skipped or already applied");
  }

  // Bloque 2: DDL aislado (columna que necesita backfill posterior)
  try {
    await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_number INTEGER`);
  } catch (err) {
    logger.warn({ err }, "post_number column DDL skipped");
  }

  // Bloque 3: Backfill JS (lógica de aplicación, separado del DDL)
  try {
    // Lógica de backfill con ORM...
    logger.info("Backfill complete");
  } catch (err) {
    logger.warn({ err }, "Backfill skipped");
  }
}
```

**Reglas del patrón**:
1. Cada bloque `try/catch` es independiente — un error en uno no cancela los demás.
2. Los backfills que dependen de lógica JS van en bloques separados DESPUÉS del DDL.
3. Nunca usar transacciones que agrupen DDL y DML — PostgreSQL hace DDL implícitamente
   en una transacción, pero mezclarlos dificulta el diagnóstico de errores.
4. Siempre loggear el resultado (`logger.info` en éxito, `logger.warn` en skip).

---

## Verificación post-deploy

Después de implementar y desplegar, correr estas queries en producción para confirmar
que los cambios están aplicados:

### Verificar columnas nuevas

```sql
-- Confirma que la columna existe en prod
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'image_variants'
  AND column_name = 'industry_group_slug';
```

### Verificar backfill completo

```sql
-- Debe retornar 0 filas si el backfill fue exitoso
SELECT COUNT(*) AS pending_backfill
FROM image_variants
WHERE user_id IS NULL
  AND post_id IS NOT NULL;
```

### Verificar tablas nuevas

```sql
-- Confirma que la tabla existe en prod
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'industry_groups';
```

### Verificar índices nuevos

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'image_variants'
  AND indexname = 'idx_image_variants_user_id';
```

**Acceso a producción**: usar `executeSql` con `environment: "production"` (solo lectura).
Para writes en producción, el servidor de producción corre `runStartupMigrations()` al
reiniciar — no se necesita acceso directo de escritura.

---

## Qué NUNCA hacer sin instrucción explícita del usuario

| Prohibido | Por qué |
|-----------|---------|
| Feature flags condicionados a `NODE_ENV !== 'production'` | La feature no llega a producción |
| Migraciones solo para tablas vacías (`IF NOT EXISTS` omitido) | Falla en producción donde la tabla ya tiene datos |
| Asumir que producción ya tiene la columna nueva | Puede no tenerla si el deploy no se corrió |
| Dejar datos legacy sin backfill | Comportamiento inconsistente para usuarios existentes vs. nuevos |
| Seed data hardcoded para `NODE_ENV === 'development'` | Los 17 grupos de industria deben existir en producción también |
| Columnas nuevas con `NOT NULL` sin `DEFAULT` | Falla en producción al agregar la columna a tabla con datos |
| Tests o validaciones que solo funcionan en dev | No detectan regresiones en el ambiente real |

---

## Checklist de producción (antes de marcar la tarea completa)

Antes de llamar `mark_task_complete`, verificar:

- [ ] **Migraciones idempotentes**: cada `ALTER TABLE` y `CREATE TABLE` usa `IF NOT EXISTS`
- [ ] **Backfill incluido**: filas legacy reciben los nuevos datos automáticamente
- [ ] **En `runStartupMigrations()`**: las migraciones corren al iniciar el servidor, no son manuales
- [ ] **Sin feature flags de entorno**: la lógica nueva no está condicionada a `NODE_ENV`
- [ ] **Seed data en producción**: tablas de configuración (industry_groups, niches, plans) se
      populan con `INSERT ... ON CONFLICT DO NOTHING` en startup
- [ ] **Sin `NOT NULL` sin `DEFAULT`** en columnas nuevas de tablas con datos existentes
- [ ] **Queries de verificación disponibles**: se pueden correr contra producción para confirmar

---

## Seed data idempotente (tablas de configuración)

Para tablas de configuración que deben existir en producción (industry_groups, plans, niches):

```typescript
// CORRECTO: idempotente, no duplica en cada restart
await db.execute(sql`
  INSERT INTO industry_groups (slug, display_name, active)
  VALUES
    ('barberia', 'Barbería y Estética Masculina', true),
    ('panaderia', 'Panadería y Repostería', true)
  ON CONFLICT (slug) DO NOTHING
`);

// INCORRECTO: duplica en cada restart
await db.insert(industryGroupsTable).values([...]);
```
