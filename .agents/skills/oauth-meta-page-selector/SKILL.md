---
name: oauth-meta-page-selector
description: Arquitectura del selector de página en el flujo OAuth Meta de HazPost. Úsalo cuando trabajes en la conexión de cuentas Instagram/Facebook, cuando un usuario reporte que se conectó la página equivocada, cuando modifiques el callback OAuth de Meta, o cuando toques el endpoint exchange-token. Cubre el flujo de PendingOAuthSessions en DB, los endpoints GET/POST, y cómo el frontend detecta oauth_pending.
---

# Skill: OAuth Meta — Selector de Página

## Por qué existe este selector

Un usuario de Facebook puede administrar **múltiples Páginas de Facebook**.
Cuando hace OAuth con Meta, el sistema recibe tokens para TODAS esas páginas.
Sin un selector explícito, el sistema conectaría la primera página de la lista,
que podría NO ser el negocio del cliente (ej: conectar "HazPost" en lugar de "Ikigai Seguros").

**Regla invariable**: SIEMPRE mostrar el selector, sin importar cuántas páginas haya.
Nunca auto-conectar silenciosamente.

---

## Arquitectura — Flujo completo

```
Usuario en /settings → clic "Autorizar con Meta"
  ↓
window.location.href → /api/auth/meta/redirect (misma pestaña — NO nueva pestaña)
  ↓
Meta OAuth dialog (Facebook) — usuario autoriza HazPost
  ↓
Meta → GET /api/auth/meta/callback?code=...&state=...
  ↓
Backend:
  1. Valida HMAC state (CSRF protection)
  2. Exchangea code → short-lived token
  3. Exchangea → long-lived token
  4. GET /me/accounts?fields=id,name,access_token,instagram_business_account
  5. Enriquece TODAS las páginas con @ig_username vía Graph API
  6. Encripta cada page.access_token con TOKEN_ENCRYPTION_KEY
  7. Guarda en DB: pending_oauth_sessions (TTL 30 min)
  8. Redirige: /settings?oauth_pending={sessionId}  ← SIEMPRE, sin auto-connect
  ↓
Frontend settings.tsx detecta oauth_pending en URL (useEffect)
  ↓
GET /api/auth/meta/pending-pages/{sessionId}  ← requiere auth
  ↓
Modal "Elige cuál Página conectar" — no se puede cerrar sin seleccionar (onInteractOutside prevented)
  ↓
Usuario elige su Página
  ↓
POST /api/auth/meta/select-page { sessionId, pageId }
  ↓
Backend:
  1. Carga sesión de DB
  2. Valida que session.userId === req.user.userId
  3. Desencripta accessToken de la página elegida
  4. Llama connectMetaPage() → guarda en social_accounts con igUserId
  5. Elimina pending_oauth_sessions row
  ↓
Frontend: toast "Instagram Conectado", refetchAccounts()
```

---

## Tabla DB: pending_oauth_sessions

Creada por startup migration en `artifacts/api-server/src/index.ts` (idempotente).

```sql
CREATE TABLE IF NOT EXISTS pending_oauth_sessions (
  session_id   TEXT        PRIMARY KEY,
  user_id      INTEGER     NOT NULL,
  business_id  INTEGER,
  pages_enc    TEXT        NOT NULL,  -- JSON array, access tokens encriptados
  expires_at   TIMESTAMPTZ NOT NULL,  -- TTL = 30 minutos
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_oauth_sessions_user    ON pending_oauth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_oauth_sessions_expires ON pending_oauth_sessions(expires_at);
```

`pages_enc` es JSON del tipo `PageOption[]`:
```typescript
interface PageOption {
  id: string;             // Facebook Page ID (ej: "107229471035689")
  name: string;           // "Ikigai Tu Propósito Seguro"
  accessTokenEnc: string; // encryptToken(page.access_token)
  igUsername?: string;    // "@ikigai.seguros" (si tiene IG Business vinculado)
  igId?: string;          // "17841431745001274" (ig_user_id de Meta)
}
```

**NUNCA** guardar tokens en plaintext. Usar `encryptToken()` al insertar.
**SIEMPRE** usar `decryptToken()` antes de pasar el token a `connectMetaPage()`.

---

## Funciones helper en oauth.ts

```typescript
savePendingOAuthSession(userId, businessId, pages)  → Promise<sessionId>
getPendingOAuthSession(sessionId)  → Promise<{ userId, businessId, pages } | null>
deletePendingOAuthSession(sessionId)  → Promise<void>
```

La startup migration borra automáticamente sesiones expiradas al arrancar:
```sql
DELETE FROM pending_oauth_sessions WHERE expires_at < NOW()
```

---

## Endpoints

| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| `GET` | `/api/auth/meta/redirect` | requireAuth | Genera URL OAuth y redirige a Meta |
| `GET` | `/api/auth/meta/callback` | Public (llamado por Meta) | Procesa código, guarda sesión en DB, redirige |
| `GET` | `/api/auth/meta/pending-pages/:sessionId` | requireAuth | Lista de páginas sin tokens (solo display) |
| `POST` | `/api/auth/meta/select-page` | requireAuth | Conecta la página elegida, borra sesión |

---

## Archivos clave

| Archivo | Función |
|---|---|
| `artifacts/api-server/src/routes/social/oauth.ts` | Todo el flujo OAuth Meta + TikTok |
| `artifacts/api-server/src/index.ts` | Startup migration de `pending_oauth_sessions` |
| `artifacts/social-dashboard/src/pages/settings.tsx` | UI del selector (modal, useEffect, handlePageSelect) |
| `artifacts/api-server/src/lib/tokenEncryption.ts` | `encryptToken` / `decryptToken` |

---

## Reglas de seguridad

1. **Validar userId**: En `pending-pages` y `select-page`, verificar `session.userId === req.user.userId`.
2. **CSRF state**: Parámetro `state` es HMAC firmado. `validateOAuthState()` verifica firma + TTL + platform.
3. **TTL 30 min**: SELECT incluye `AND expires_at > NOW()`. Limpieza automática al startup.
4. **Tokens encriptados**: `encryptToken()` al guardar, `decryptToken()` al leer.

---

## Causa raíz original (post-mortem abril 2026)

**Bug**: `ikigaisegurosltda@gmail.com` conectó `@hazpost.app` en lugar de "Ikigai Tu Propósito Seguro".

**3 causas encadenadas**:
1. El OAuth abría en **nueva pestaña** → el selector aparecía allí → el usuario miraba la pestaña original → sesión expirada
2. Cuando `pagesWithIG.length === 1`, el sistema **auto-conectaba** sin preguntar → podía elegir la página incorrecta
3. Las sesiones eran **in-memory** → moría si el servidor reiniciaba durante el flujo OAuth

**Fix definitivo**:
1. `window.open(...)` → `window.location.href` (misma pestaña)
2. Auto-connect eliminado → **SIEMPRE mostrar selector**
3. `Map in-memory` → tabla `pending_oauth_sessions` en PostgreSQL
4. Page access tokens → encriptados en DB
5. Modal `onInteractOutside` bloqueado cuando source=oauth
6. Selector muestra IG username O advertencia "⚠ Sin Instagram vinculado aún"

---

## Anti-patrones — NUNCA hacer esto

```typescript
// ❌ Auto-conectar sin preguntar
const pageWithIG = pagesWithIG[0] ?? pages[0];
await connectMetaPage({ ... }); // NUNCA

// ❌ Abrir OAuth en nueva pestaña
window.open(`${BASE}/api/auth/meta/redirect`, "_blank"); // NUNCA

// ❌ In-memory para sesiones pendientes
const pendingOAuthSessions = new Map(); // NUNCA

// ❌ Tokens en plaintext en DB
{ ...p, accessToken: p.rawToken } // NUNCA — usar encryptToken()
```

---

## Query de diagnóstico admin

```sql
-- Ver sesiones OAuth pendientes activas
SELECT session_id, user_id, business_id, expires_at
FROM pending_oauth_sessions
WHERE expires_at > NOW()
ORDER BY created_at DESC;

-- Ver páginas de una sesión (SOLO en dev — pages_enc contiene tokens encriptados)
SELECT session_id, user_id,
       jsonb_array_elements(pages_enc::jsonb)->>'name'       AS page_name,
       jsonb_array_elements(pages_enc::jsonb)->>'igUsername'  AS ig_username,
       jsonb_array_elements(pages_enc::jsonb)->>'igId'        AS ig_id
FROM pending_oauth_sessions
WHERE user_id = <USER_ID>
  AND expires_at > NOW();
```
