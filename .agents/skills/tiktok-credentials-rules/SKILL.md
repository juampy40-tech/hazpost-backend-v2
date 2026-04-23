# TikTok Credentials Rules — HazPost

Úsalo ANTES de modificar cualquier lógica relacionada con las credenciales de TikTok
(`getTikTokClientKey`, `getTikTokClientSecret`, scopes OAuth, flujo sandbox/producción).

---

## Fuente de verdad: `oauth.ts`

Archivo: `artifacts/api-server/src/routes/social/oauth.ts`

Funciones clave:
- `getTikTokClientKey()` → línea ~696
- `getTikTokClientSecret()` → línea ~704

---

## Prioridad de credenciales — REGLA INAMOVIBLE

**La base de datos siempre gana sobre el env var.**

```
DB (app_settings) → tiene valor → úsalo
DB vacío o sin fila → usa env var TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET
```

### Por qué:
El admin puede cambiar entre sandbox y producción desde la UI de Settings
(`Configuración → TikTok → Guardar App IDs y Secrets`) sin tocar Replit Secrets.
Si el env var tuviera prioridad, lo que el admin guarda en la UI sería ignorado silenciosamente.

### Anti-patrón prohibido:
```typescript
// ❌ MAL — env var gana, UI ignorada
if (process.env["TIKTOK_CLIENT_KEY"]) return process.env["TIKTOK_CLIENT_KEY"];
const [row] = await db.select()...
return row?.value ?? null;
```

### Patrón correcto:
```typescript
// ✅ BIEN — DB primero, env var como respaldo
const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "tiktok_client_key"));
if (row?.value) return row.value;
return process.env["TIKTOK_CLIENT_KEY"] ?? null;
```

---

## Scopes OAuth — Sandbox vs Producción

El sandbox de TikTok **NO soporta `video.publish`**. Si se pide ese scope en sandbox, TikTok
muestra "Hubo un problema — client_key".

La detección es automática por prefijo de la clave:

```typescript
const isSandbox = clientKey.startsWith("sbaw");
const scopes = isSandbox
  ? "user.info.basic,video.upload"           // sandbox: solo 2 scopes
  : "user.info.basic,video.publish,video.upload"; // producción: 3 scopes
```

### Claves de referencia:
| Entorno    | Prefijo de client_key | Scopes disponibles                              |
|------------|-----------------------|-------------------------------------------------|
| Sandbox    | `sbaw…`               | `user.info.basic`, `video.upload`               |
| Producción | `awtun…`              | `user.info.basic`, `video.publish`, `video.upload` |

---

## Flujo para grabar demo (revisión TikTok)

TikTok exige sandbox en el video demo pero sandbox no tiene `video.publish`.
El flujo correcto es:

1. Guardar credenciales **sandbox** en la UI de Settings → "Guardar App IDs y Secrets"
2. El backend detecta prefijo `sbaw` → pide solo 2 scopes → OAuth completa sin error
3. Grabar video mostrando: OAuth → cuenta conectada → contenido subido (draft)
4. Después del video, volver a Settings → guardar credenciales de **producción**
5. No es necesario tocar Replit Secrets para este cambio

---

## post_mode y privacy_level — Sandbox vs Producción

| Parámetro       | Sandbox (`sbaw…`)   | Producción (`awtun…`)    |
|-----------------|---------------------|--------------------------|
| `post_mode`     | `"MEDIA_UPLOAD"`    | `"DIRECT_POST"`          |
| `privacy_level` | `"SELF_ONLY"`       | `"PUBLIC_TO_EVERYONE"`   |

**Regla crítica:** `DIRECT_POST` requiere el scope `video.publish`. El sandbox no otorga ese scope, por lo que usar `DIRECT_POST` en sandbox devuelve `[invalid_params]: The request parameter type is incorrect`. Siempre usar `MEDIA_UPLOAD` cuando el client key empieza con `sbaw`.

La función `isTikTokSandbox()` en `tiktok.service.ts` detecta esto automáticamente leyendo `app_settings.tiktok_client_key` (DB primero, env var como respaldo).

---

## Parámetros de API — Posts tipo PHOTO

Endpoint: `POST /v2/post/publish/content/init/`

`disable_duet` y `disable_stitch` son campos **exclusivos de video**. Incluirlos en posts
de tipo `PHOTO` genera el error `[invalid_params]: The request parameter type is incorrect`.

### Campos válidos en `post_info` para PHOTO:
| Campo            | Tipo    | Válido para foto |
|------------------|---------|-----------------|
| `title`          | string  | ✅              |
| `privacy_level`  | string  | ✅              |
| `disable_comment`| boolean | ✅              |
| `auto_add_music` | boolean | ✅              |
| `disable_duet`   | boolean | ❌ VIDEO ONLY   |
| `disable_stitch` | boolean | ❌ VIDEO ONLY   |

---

## Redirect URI registrado en TikTok Portal

```
https://hazpost.app/api/auth/tiktok/callback
```

Verificar que coincida exactamente en: TikTok Developer Portal → App → Login Kit → Redirect URI → Web.

---

## Tabla `app_settings` — claves relevantes

| key                    | valor esperado                |
|------------------------|-------------------------------|
| `tiktok_client_key`    | clave sandbox o producción    |
| `tiktok_client_secret` | secret correspondiente        |
