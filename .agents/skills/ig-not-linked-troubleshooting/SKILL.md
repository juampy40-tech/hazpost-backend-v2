---
name: ig-not-linked-troubleshooting
description: Diagnóstico y resolución del error IG_NOT_LINKED en HazPost. Úsalo cuando un usuario reporta que Instagram no publica, cuando ves el error "[IG_NOT_LINKED]" o "No se pudo obtener el ID de cuenta de Instagram Business" en publish_log, cuando el ig_user_id está vacío en social_accounts, o cuando el admin necesita verificar o resetear la conexión de Meta de un usuario. Cubre el diagnóstico desde DB, las causas raíz, las acciones del admin, el flujo de reconexión, y las queries SQL de auditoría.
---

# Skill: Diagnóstico IG_NOT_LINKED

## Qué significa IG_NOT_LINKED

El error `[IG_NOT_LINKED]` aparece cuando el sistema no puede obtener el
Instagram Business/Creator Account ID para la Página de Facebook conectada.
Sin `ig_user_id`, la API de Meta no puede publicar en Instagram.

---

## Arquitectura centralizada — resolveIgIdFromPageApi()

**REGLA FUNDAMENTAL**: Nunca hacer una query inline de Meta con solo
`instagram_business_account`. Siempre usar el helper centralizado:

```typescript
import { resolveIgIdFromPageApi } from "../../services/instagram.service.js";

const igId = await resolveIgIdFromPageApi(pageId, accessToken);
// Devuelve string | null
// Internamente prueba los 3 métodos en orden (ver abajo)
```

### Meta API versión

Todos los endpoints de Meta usan **v22.0** desde el 18 abr 2026 (migrado de v19.0).
Si ves una referencia a v19.0 en el código → actualizarla.

### Los 3 métodos de resolución (18 abr 2026)

Meta tiene TRES maneras de recuperar el Instagram ID de una Página:

| Método | Endpoint | Cuándo funciona |
|---|---|---|
| 1 | `/{pageId}?fields=instagram_business_account` | Page Settings (vinculación clásica) |
| 2 | `/{pageId}?fields=connected_instagram_account` | Account Center — método moderno |
| 3 | `/{pageId}/instagram_accounts` | **Fallback Account Center** — cuando los anteriores devuelven null aunque IG SÍ está vinculado |

**Por qué tres métodos**: Meta no garantiza que `connected_instagram_account` aparezca
en el response aunque la cuenta esté vinculada vía Account Center. El endpoint
`/instagram_accounts` es el fallback definitivo para estos casos.

Los métodos 1 y 2 se consultan en una sola llamada `?fields=instagram_business_account,connected_instagram_account`.
Si ambos devuelven null, se hace una segunda llamada al endpoint `/instagram_accounts`.

### Impacto (18 abr 2026)
El fix afecta a TODOS los usuarios y negocios de la plataforma de forma centralizada:
- `resolveIgIdFromPageApi()` — helper principal, ya tenía 1-2, ahora tiene 3
- `resolveIgUserId()` — ahora delega a `resolveIgIdFromPageApi` (eliminó código duplicado)
- `testInstagramConnection()` — "Probar conexión", ahora con método 3
- OAuth callback `oauth.ts` — detecta IG al autorizar, ahora con método 3 + logging detallado
- Admin `refresh-ig` — usa `testInstagramConnection`, recibe el fix automáticamente

---

## testInstagramConnection — check canPublish (18 abr 2026)

`testInstagramConnection()` en `instagram.service.ts` ahora valida que la cuenta
tenga el permiso `CREATE_CONTENT` en `permitted_tasks`. Retorna `canPublish: boolean`
junto con un mensaje accionable si falta ese permiso.

**Respuesta del endpoint `POST /api/social-accounts/instagram/test`**:
```json
{
  "connected": true,
  "username": "@eco.sas",
  "igUserId": "17841465780948955",
  "canPublish": true,
  "canPublishMessage": null
}
```

Si `canPublish = false`:
```json
{
  "connected": true,
  "username": "@eco.sas",
  "canPublish": false,
  "canPublishMessage": "La cuenta no tiene permiso CREATE_CONTENT — verifica en Meta Business Suite que HazPost tenga permisos de publicación"
}
```

**Causa más común de `canPublish=false`**: La App de Meta no tiene aprobado
`instagram_content_publish` en modo Live, o el usuario no otorgó ese permiso en el OAuth.

---

## REGLA CRÍTICA — NUNCA borrar ig_user_id automáticamente

**Anti-patrón prohibido** (causó 4 bugs distintos hasta abr 2026):

```typescript
// ❌ NUNCA hacer esto — Meta API es no determinista
await db.update(socialAccountsTable).set({ igUserId: null });
```

Meta puede devolver `null` aunque el vínculo exista (Account Center, demoras de
propagación, token sin `pages_read_engagement`). Un null del API NO confirma que
la cuenta no esté vinculada.

**Patrón correcto — solo escribir si hay un valor positivo**:

```typescript
// ✅ CORRECTO en TODOS los lugares que tocan ig_user_id
if (igId) {
  await db.update(socialAccountsTable).set({ igUserId: igId });
}
// Si igId es null, NO tocar la columna — preservar valor existente
```

### Historial de fixes anti-patrón

| Fecha | Archivo | Función | Bug |
|---|---|---|---|
| 16 abr 2026 | `routes/social/social-accounts.ts` | `POST /instagram/test` | Borraba ig_user_id si Meta devolvía instagramLinked=false |
| 16 abr 2026 | `routes/admin/user-stats.ts` | `POST /refresh-ig` | Borraba ig_user_id si Meta API fallaba |
| 16 abr 2026 | `routes/social/oauth.ts` | `connectMetaPage()` | `igId ?? existing[0].igUserId ?? null` (preservar) |
| 16 abr 2026 | `services/instagram.service.ts` | `resolveIgUserId()` | Siempre escribía igId incluso cuando era null |
| 18 abr 2026 | `routes/social/social-accounts.ts` | `POST /meta/exchange-token` | `igUserId: igTest.igId ?? null` borraba el ID existente |

---

## Guard VM-3 — aislamiento de páginas entre usuarios

El guard VM-3 en `connectMetaPage()` previene que la misma página de Facebook
sea usada por USUARIOS DISTINTOS (cross-tenant contamination).

**Comportamiento correcto (post fix 16 abr 2026)**:
- ✅ Permite que el MISMO usuario use la misma página en sus diferentes negocios (patrón agencia)
- ❌ Bloquea que USUARIOS DISTINTOS compartan una página

```typescript
// ✅ CORRECTO — solo bloquea cross-user
const conflictRows = await db.select(...)
  .where(and(
    ne(socialAccountsTable.userId, userId),  // ← diferente USER
    eq(socialAccountsTable.platform, "instagram"),
    eq(socialAccountsTable.pageId, fbPageId),
  ));
```

**Anti-patrón anterior** (bloqueaba cuentas agencia legítimas):
```typescript
// ❌ MAL — bloqueaba negocios del mismo usuario
.where(and(
  eq(socialAccountsTable.userId, userId),   // mismo user
  ne(socialAccountsTable.businessId, businessId), // diferente negocio → rechazaba
))
```

---

## Diagnóstico desde la DB (producción)

```sql
-- 1. Estado de social_accounts de un usuario
SELECT id, platform, username, page_id, ig_user_id,
       connected, access_token IS NOT NULL AS has_token,
       business_id, updated_at
FROM social_accounts
WHERE user_id = <USER_ID>
ORDER BY platform;

-- 2. Últimos intentos de publicación Instagram
SELECT pl.platform, pl.status, pl.error_message, pl.published_at
FROM publish_log pl
WHERE pl.user_id = <USER_ID> AND pl.platform = 'instagram'
ORDER BY pl.published_at DESC LIMIT 20;

-- 3. Buscar usuario por email
SELECT id, email, display_name, plan, ai_credits, is_active
FROM users WHERE email = '<EMAIL>';
```

### Diagnóstico con Meta API directamente (para casos difíciles)

Cuando el ig_user_id está null y Refresh IG no ayuda, consultar Meta directo:

```bash
cd artifacts/api-server && node --input-type=module << 'EOF'
import { createDecipheriv, scryptSync } from "crypto";
const key = scryptSync(process.env.TOKEN_ENCRYPTION_KEY, "eco-col-social-manager", 32);
const buf = Buffer.from("<ACCESS_TOKEN_ENC_FROM_DB>", "base64");
const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 16), { authTagLength: 16 });
decipher.setAuthTag(buf.subarray(16, 32));
const token = decipher.update(buf.subarray(32)) + decipher.final("utf8");

const r = await fetch(`https://graph.facebook.com/v22.0/<PAGE_ID>?fields=instagram_business_account,connected_instagram_account,name&access_token=${token}`);
const d = await r.json();
console.log(JSON.stringify(d, null, 2));
EOF
```

Si el resultado muestra `instagram_business_account: undefined` Y `connected_instagram_account: undefined` sin error → el token no tiene visibilidad del IG (ver Causa 6).
Si el resultado muestra `error: {code: 100}` → el token no tiene `pages_read_engagement` (ver Causa 7).

---

## Causas raíz y soluciones

### Causa 1 — Instagram no vinculado a ninguna Página de Facebook
La cuenta IG no está conectada ni via Page Settings ni Account Center.
**Solución**: El usuario vincula desde Instagram → Configuración → Centro de Cuentas.

### Causa 2 — Cuenta IG en modo Personal
Meta no devuelve el IG ID para cuentas personales via Graph API.
**Solución**: Instagram → Configuración → Tipo de cuenta → Empresarial o Creador.

### Causa 3 — Página de Facebook incorrecta conectada
`username` en `social_accounts` muestra un nombre que no es del negocio.
**Solución**: Admin usa "Reset Meta" → usuario hace OAuth de nuevo, selecciona su página correcta.

### Causa 4 — ig_user_id conocido pero Meta API no lo devuelve
Meta a veces tiene demoras en propagar el vínculo via API.
**Solución**: Admin usa "Fijar ID" con el ID numérico conocido.

### Causa 5 — Sin cuentas sociales en DB
El usuario nunca completó el OAuth o se eliminó la cuenta.
**Solución**: Usuario hace OAuth completo desde Configuración → Autorizar con Meta.

### Causa 6 — OAuth hecho por la persona equivocada (la más sutil)
El OAuth fue hecho por un administrador de la página (ej: Juan Pablo) cuyo
Facebook NO tiene el Instagram del negocio vinculado en Account Center. Aunque
es admin de la página, el token de esa persona no ve el `connected_instagram_account`
porque ese IG pertenece a otro usuario de Facebook.

**Síntomas**:
- Meta API devuelve la página correctamente pero sin campos de Instagram
- El token de Facebook que fue guardado NO pertenece al dueño de @negocio.seguros
- Refresh IG siempre devuelve null
- Al intentar publicar con ig_user_id fijado manualmente → error `(#10) Application does not have permission`

**Solución**: El dueño de la cuenta de Instagram (no el admin de la página) debe
hacer el OAuth en HazPost desde su computador con su propio Facebook.
Si la persona intenta desde celular y Meta pide "otro celular" → hacer desde desktop.

**Cómo confirmar**: Llamar Meta API directamente con el token guardado (ver sección diagnóstico). Si devuelve la página con nombre correcto pero sin igId → token de persona equivocada.

### Causa 7 — Token antiguo sin pages_read_engagement
Tokens creados antes de que se agregara `pages_read_engagement` a los scopes OAuth
no pueden consultar qué Instagram está vinculado a la página.

**Síntomas**:
- Meta API devuelve `(#100) This endpoint requires the 'pages_read_engagement' permission`
- Facebook publica correctamente, Instagram falla con IG_NOT_LINKED
- El error aparece cuando ig_user_id está null (si ig_user_id está en DB, publica OK)

**Solución**: El usuario re-autoriza con Meta → nuevo token incluye todos los scopes.
El botón "Autorizar con Meta" en Configuración puede aparecer deshabilitado si
los campos de App ID / App Secret están vacíos en el formulario (son password inputs
que no pre-llenan). Verificar que los campos tengan valores antes de hacer clic.

---

## Flujo correcto que el usuario debe seguir

```
1. Instagram (celular):
   Configuración → Tipo de cuenta y herramientas
   → Cambiar a "Empresarial" o "Creador" (no Personal)

2. Instagram (celular) O Facebook:
   Configuración → Centro de Cuentas
   → Verificar que aparece la Página de Facebook del negocio
   → Si no aparece: "Agregar cuentas" → Conectar Facebook → seleccionar la Página

3. HazPost (DESDE COMPUTADOR si el celular pide "otro celular"):
   Configuración → Cuentas Sociales
   → "Autorizar con Meta"
   → Seleccionar la Página de Facebook correcta
   → El sistema detecta automáticamente la cuenta IG vinculada
```

**IMPORTANTE**: La persona que hace el OAuth en HazPost debe ser el dueño del
Instagram o alguien cuya cuenta de Facebook tenga el Instagram vinculado en
Account Center. Un admin de página que no es dueño del IG no puede publicar.

---

## Acciones del Admin desde /admin

Expandir fila de usuario → sección "Cuentas Sociales":

### "Refresh IG"
`POST /api/admin/users/:id/social-accounts/instagram/refresh-ig`
Reintenta la resolución del ig_user_id con el token existente.
**Usar**: cuando el usuario ya vinculó en Meta pero HazPost no lo detectó.
**Nota**: Si el token es de la persona equivocada o no tiene pages_read_engagement, este refresh devuelve null sin borrar el ig_user_id existente (post-fix abr 2026).

### "Reset Meta"
`DELETE /api/admin/users/:id/social-accounts/instagram`
Elimina ambas entradas (instagram + facebook). El usuario debe reconectar.
**Usar**: página incorrecta, token corrupto, o para empezar desde cero.

### "Fijar ID"
`POST /api/admin/users/:id/social-accounts/instagram/set-ig-id`
Body: `{ igUserId: "17841431745001274" }` — solo números.
**Usar**: cuando se conoce el ID numérico pero Meta API no lo devuelve via Graph.
**Nota**: Solo funciona si el token guardado tiene permisos para ese igId. Si el token
es de la persona equivocada → error `(#10)` al publicar.

---

## Árbol de decisión

```
¿Instagram falla en publish_log?
  ↓
¿Error = IG_NOT_LINKED?
  └─ SÍ → ig_user_id está null en DB
           ↓
           ¿Sin cuenta social en DB?
             └─ SÍ → OAuth desde cero
             └─ NO → Refresh IG
                      ↓
                     ¿Sigue null?
                       └─ NO → ✅ Resuelto
                       └─ SÍ → ¿Meta API devuelve error #100?
                                 └─ SÍ (falta pages_read_engagement) → Re-autorizar con Meta
                                 └─ NO → ¿Meta API devuelve igId=null sin error?
                                           └─ SÍ → Token de persona equivocada
                                                    → Dueño del IG hace OAuth desde desktop
                                           └─ NO → Fijar ID manualmente
  ↓
¿Error = (#10) Application does not have permission?
  └─ ig_user_id está fijado pero token no tiene derecho sobre ese IG
  └─ → Dueño del IG hace OAuth desde desktop con su Facebook

¿Facebook publica OK pero Instagram falla?
  └─ Token tiene pages_manage_posts pero no instagram_content_publish para ese IG
  └─ → Ver Causa 6 (persona equivocada) o Causa 7 (token antiguo)
```

---

## Distinción de escenarios

| Escenario | ig_user_id en DB | Error en publish_log | Solución |
|---|---|---|---|
| IG no linked en Meta | NULL | `[IG_NOT_LINKED]` | Vincular en Account Center + reconectar |
| Cuenta IG personal | NULL | `[IG_NOT_LINKED]` | Cambiar a Empresarial/Creador |
| Token vencido | NULL/presente | `token inválido` o `400` | Re-autorizar con Meta |
| Página incorrecta conectada | NULL | `[IG_NOT_LINKED]` | Reset Meta + OAuth correcto |
| Token sin pages_read_engagement | NULL | `[IG_NOT_LINKED]` | Re-autorizar con Meta |
| OAuth hecho por admin externo (no dueño IG) | NULL o fijado | `(#10)` | Dueño IG hace OAuth en desktop |
| IG linked via Account Center | Valor presente | — | ✅ OK |
| VM-3 bloqueando cuenta agencia | — | Error 409 UI | Ya corregido (16 abr 2026) |

---

## Nota sobre Stories publicadas pero invisibles

Si publish_log muestra `status=published` para Instagram pero el usuario no ve nada:
1. Verificar `content_type` del post — si es `story`, expira en 24 horas
2. El post pudo haber publicado en una cuenta IG diferente (ig_user_id incorrecto)
3. Las stories no aparecen en el grid del perfil — aparecen en la barra de stories (arriba)

---

## Archivos clave

| Archivo | Función |
|---|---|
| `services/instagram.service.ts` | `resolveIgIdFromPageApi()` — helper centralizado ← USAR SIEMPRE |
| `services/instagram.service.ts` | `resolveIgUserId()` — cache DB + live lookup (no borra null) |
| `services/instagram.service.ts` | `testInstagramConnection()` |
| `routes/admin/user-stats.ts` | Endpoints admin: diagnostic, refresh-ig, set-ig-id, delete |
| `routes/social/oauth.ts` | `connectMetaPage()` — guard VM-3 cross-user, preserva ig_user_id |
| `routes/social/social-accounts.ts` | Test de conexión — no borra ig_user_id |
| `pages/admin.tsx` | UI: Refresh IG, Reset Meta, Fijar ID |
| `pages/settings.tsx` | Mensaje de error accionable + botón Autorizar con Meta |
