---
name: publicacion-plataformas
description: Reglas de resolución de plataformas en HazPost al publicar posts. Úsalo ANTES de modificar publishPost(), el endpoint /:id/retry, el scheduler de split-scheduling, o cualquier lógica que decida en qué plataformas se publica un post. Cubre la firma de publishPost, la tabla de resolución de plataformas, la regla "instagram lleva facebook", la regla de retry seguro, y los campos clave de publish_log.
---

# Skill: Publicación por Plataforma en HazPost

## Propósito

Documentar y centralizar las reglas que determinan **en qué plataformas se publica un post**
en cada escenario: publicación unificada, split scheduling (fechas independientes por plataforma),
y retry manual desde el Historial. Sin este conocimiento es fácil introducir duplicados en
Facebook o saltar plataformas que deberían reintentarse.

---

## Función central: `publishPost`

**Archivo**: `artifacts/api-server/src/services/scheduler.service.ts`

```typescript
export async function publishPost(
  postId: number,
  platformOverride?: "instagram" | "tiktok"
): Promise<void>
```

- **Sin `platformOverride`**: publica en TODAS las plataformas configuradas para el post.
- **Con `platformOverride="instagram"`**: publica solo el leg de Instagram (+ Facebook como
  compañero, salvo que Facebook ya publicó — ver regla de retry a continuación).
- **Con `platformOverride="tiktok"`**: publica solo TikTok.

---

## Tabla de resolución de plataformas

| `post.platform` | `platformOverride` | Facebook ya publicó | → `platforms` finales |
|---|---|---|---|
| `"both"` | — | — | `["instagram", "tiktok", "facebook"]` |
| `"instagram"` | — | — | `["instagram", "facebook"]` |
| `"tiktok"` | — | — | `["tiktok"]` |
| cualquiera | `"instagram"` | **no** | `["instagram", "facebook"]` |
| cualquiera | `"instagram"` | **sí** | `["instagram"]` ← retry seguro |
| cualquiera | `"tiktok"` | — | `["tiktok"]` |

---

## Regla: "Instagram siempre lleva Facebook"

Facebook usa las mismas credenciales de Meta que Instagram (mismo Page Access Token y Page ID).
Por eso, cuando se publica en Instagram, siempre se intenta publicar también en Facebook.

Si Meta App Review aún no aprobó `pages_manage_posts`, Facebook retorna un error `SKIP`:
`"SKIP:pages_manage_posts no aprobado — requiere App Review de Meta"`

El scheduler maneja este SKIP marcando el log como `status="crossposted"` (no `"failed"`),
de modo que el post se muestra como "Omitido" en gris en el Historial — no como error rojo.

---

## Regla de retry seguro — no duplicar Facebook

**Problema sin esta regla**: Si Instagram falla pero Facebook publica con éxito en la primera
pasada, al reintentar (Reintentar en Historial o split-schedule automático) se volvería a
llamar `publishPost(id, "instagram")`. Sin protección, Facebook se publicaría dos veces.

**Solución implementada (Task #205)**: Dentro de `publishPost`, **antes** de armar el array
`platforms`, se consulta `publish_log` para verificar si ya existe un registro:
```
platform = "facebook" AND status = "published" AND post_id = postId
```
- Si existe → `platforms = ["instagram"]` (Facebook excluido, no se duplica).
- Si no existe → `platforms = ["instagram", "facebook"]` (comportamiento estándar).

Esta lógica vive en `publishPost` (no en el endpoint de retry), así cualquier llamador
que pase `platformOverride="instagram"` se beneficia automáticamente.

---

## Tabla `publish_log` — campos clave

**Schema**: `lib/db/src/schema/publish_log.ts`

| Campo | Tipo | Valores | Descripción |
|---|---|---|---|
| `id` | serial | — | PK |
| `postId` | integer | — | FK a `posts.id` |
| `userId` | integer | — | Owner del post al momento de publicar |
| `platform` | text | `instagram`, `tiktok`, `facebook` | Plataforma de este log |
| `status` | text | `published`, `failed`, `skipped`, `crossposted` | Resultado |
| `postUrl` | text | URL o null | URL del post publicado |
| `errorMessage` | text | mensaje o null | Error si `status = "failed"` |
| `publishedAt` | timestamp | — | Momento de publicación |
| `source` | text | `auto`, `manual` | Origen: scheduler automático o mark-as-published manual |

---

## Cuándo usar este skill

Leer este skill **antes** de modificar cualquiera de estos archivos o funciones:

- `publishPost()` en `scheduler.service.ts` — cualquier cambio en resolución de plataformas
- `publishScheduledPosts()` en `scheduler.service.ts` — lógica del cron de split-scheduling
- `POST /:id/retry` en `posts.ts` — endpoint de retry manual
- Cualquier función que inserte en `publish_log` — para no crear registros inconsistentes
- Cualquier función que lea `publish_log` para decidir si reintentar

---

## Relación con otros skills

| Skill | Relación |
|---|---|
| `business-publishing-isolation` | Cubre QUIÉN publica (aislamiento por negocio/userId/businessId). Este skill cubre EN QUÉ plataformas. Complementarios, no se solapan. |
| `telegram-notifications` | Cubre notificaciones post-publicación. No afecta la resolución de plataformas. |
| `posts-monitor` | Queries SQL de auditoría para verificar integridad de publish_log. |

---

## Anti-patrones prohibidos

### 1. Incluir Facebook incondicionalmente en retry de Instagram

```typescript
// ❌ PROHIBIDO — duplica Facebook si ya publicó antes
if (platformOverride === "instagram") {
  platforms = ["instagram", "facebook"];
}

// ✅ CORRECTO — consulta publish_log primero (comportamiento actual en Task #205)
if (platformOverride === "instagram") {
  const [fbPublished] = await db.select({ id: publishLogTable.id })
    .from(publishLogTable)
    .where(and(
      eq(publishLogTable.postId, postId),
      eq(publishLogTable.platform, "facebook"),
      eq(publishLogTable.status, "published"),
    ));
  platforms = fbPublished ? ["instagram"] : ["instagram", "facebook"];
}
```

### 2. Resolver plataformas en el endpoint de retry (no en `publishPost`)

```typescript
// ❌ PROHIBIDO — la lógica de plataformas dispersa en el endpoint no es centralizada
// Si mañana hay otro caller de publishPost(id, "instagram"), también tendría el bug.
router.post("/:id/retry", async (req, res) => {
  const fbAlreadyPublished = await checkFacebook(id);
  if (!fbAlreadyPublished) await publishPost(id, "instagram"); // solo si no publicó
});

// ✅ CORRECTO — publishPost mismo hace la consulta; el endpoint llama sin lógica extra
router.post("/:id/retry", async (req, res) => {
  await publishPost(id, "instagram"); // ya internamente excluye FB si publicó
});
```

### 3. Omitir el `source` al insertar en `publish_log`

```typescript
// ❌ INCOMPLETO — no se sabe si fue automático o manual
await db.insert(publishLogTable).values({ postId, platform, status, ... });

// ✅ CORRECTO
await db.insert(publishLogTable).values({ postId, platform, status, ..., source: "auto" });
// o source: "manual" para mark-as-published
```

---

## Query de auditoría — detectar duplicados en Facebook

```sql
-- ¿Hay posts con más de un publish_log "published" en Facebook? (duplicados)
SELECT post_id, COUNT(*) AS veces_publicado, MIN(published_at), MAX(published_at)
FROM publish_log
WHERE platform = 'facebook' AND status = 'published'
GROUP BY post_id
HAVING COUNT(*) > 1
ORDER BY veces_publicado DESC;
-- Esperado post-Task #205: 0 filas para posts publicados después de la corrección.
-- Si hay filas con fechas anteriores: son duplicados previos al fix (no hay regresión futura).
```

---

## Archivos clave

| Archivo | Función relevante |
|---|---|
| `artifacts/api-server/src/services/scheduler.service.ts` | `publishPost()`, `publishScheduledPosts()` |
| `artifacts/api-server/src/routes/social/posts.ts` | `POST /:id/retry`, `POST /:id/mark-published` |
| `lib/db/src/schema/publish_log.ts` | Schema de `publish_log` |
| `artifacts/api-server/src/services/facebook.service.ts` | `publishToFacebook()`, lógica de SKIP |
| `artifacts/api-server/src/services/instagram.service.ts` | `publishToInstagram()`, `publishReelToInstagram()` |
