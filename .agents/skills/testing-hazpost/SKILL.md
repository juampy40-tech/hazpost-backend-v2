---
name: testing-hazpost
description: Testing strategy and pre-completion checklist for HazPost. Use before marking any task complete, when adding new API endpoints, or when modifying generation or publishing logic. Covers manual integration testing via curl, regression checklist, and validation commands.
---

# Estrategia de Pruebas — HazPost

## Principio General

HazPost es producción real con datos reales. Nunca ejecutar pruebas destructivas en prod sin
respaldo. Las pruebas de escritura (POST, PUT, DELETE) deben hacerse con datos de prueba o con
confirmación explícita del usuario.

**API base**: `http://localhost:8080`  
**Cookie de auth**: `hz_token` (JWT)  
**DB push**: `cd lib/db && pnpm run push`

---

## 1. CHECKLIST PRE-COMMIT (ejecutar antes de marcar tarea completa)

### Backend
- [ ] El servidor reinicia sin errores (`pnpm --filter @workspace/api-server run dev`)
- [ ] El endpoint nuevo/modificado responde correctamente a la solicitud principal
- [ ] El endpoint nuevo rechaza solicitudes sin auth (401) o sin permisos (403)
- [ ] Las queries de DB usan `userId` en el WHERE (no exponen datos de otros usuarios)
- [ ] Si se modificó el schema de Drizzle: `cd lib/db && pnpm run push` ejecutado sin errores

### Frontend
- [ ] El componente nuevo/modificado compila sin errores de TypeScript
- [ ] Vite HMR actualiza sin errores en el navegador
- [ ] No hay `console.error` ni `Unhandled Promise Rejection` en la consola del browser
- [ ] El flujo principal funciona de punta a punta (ej: generar post → aparece en cola)

### DB
- [ ] Si se agregó columna: confirmar con `SELECT column_name FROM information_schema.columns WHERE table_name = 'posts'`
- [ ] Si se hizo backfill: confirmar que los datos son correctos con una SELECT de verificación

---

## 2. PRUEBAS DE INTEGRACIÓN — ENDPOINTS CRÍTICOS

### Autenticación
```bash
# Login (debe devolver 200 + cookie hz_token)
curl -c /tmp/cookies.txt -s -X POST http://localhost:8080/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpass"}' | jq '.user.id'

# Sin auth (debe devolver 401)
curl -s http://localhost:8080/api/posts | jq '.error'
```

### Generate Bulk (endpoint más crítico)
```bash
# Con auth — debe devolver generated > 0
curl -b /tmp/cookies.txt -s -X POST http://localhost:8080/api/posts/generate-bulk \
  -H "Content-Type: application/json" \
  -d '{"days":7,"platform":"instagram","contentTypes":["image"]}' | jq '{generated, imagesGenerating}'

# Sin créditos — debe devolver 402
# Concurrent (segunda llamada inmediata) — debe devolver 429
```

### Posts CRUD
```bash
# Listar posts (scoped por usuario + negocio activo)
curl -b /tmp/cookies.txt -s "http://localhost:8080/api/posts?status=pending_approval" | jq 'length'

# Aprobar post (verifica ownership)
curl -b /tmp/cookies.txt -s -X POST http://localhost:8080/api/posts/1/approve | jq '.status'

# Aprobar post de OTRO usuario (debe devolver 404 — no 403, para no revelar existencia)
curl -b /tmp/cookies2.txt -s -X POST http://localhost:8080/api/posts/1/approve | jq '.error'
```

### Aislamiento multi-tenant (CRÍTICO)
```bash
# Usuario B NO debe ver posts de Usuario A
# 1. Login como usuario A → obtener ID de un post
# 2. Login como usuario B (cookies distintas)
# 3. GET /api/posts/:id_de_A → debe devolver 404
curl -b /tmp/cookies_userB.txt -s http://localhost:8080/api/posts/1 | jq '.error'
# Esperado: "No encontrado" (404) — nunca datos del post de A
```

---

## 3. PRUEBAS DE REGRESIÓN — QUÉ VERIFICAR AL TOCAR POSTS.TS

Si modificas `artifacts/api-server/src/routes/social/posts.ts`, verificar:

| Funcionalidad | Cómo verificar |
|---|---|
| Lista de posts | `GET /api/posts` devuelve solo posts del usuario activo |
| Filtro por negocio | `GET /api/posts?businessId=1` devuelve solo posts de bizId=1 |
| Generación masiva | `POST /generate-bulk` crea posts con `business_id` y `user_id` correctos |
| Lock de concurrencia | Segunda llamada a generate-bulk devuelve 429 |
| Deducción de créditos | `subscriptions.credits_remaining` baja en N (N = posts generados) |
| Aprobación | Post cambia de `pending_approval` a `scheduled` |
| Rechazo | Post cambia a `rejected`; slot no se libera |

---

## 4. PRUEBAS DE SCHEMA (después de `pnpm run push`)

```sql
-- Verificar que la columna fue creada
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'posts'
ORDER BY ordinal_position;

-- Verificar que el backfill funcionó
SELECT business_id, COUNT(*), MIN(post_number), MAX(post_number)
FROM posts
WHERE business_id IS NOT NULL
GROUP BY business_id;

-- Verificar que no hay duplicados de post_number dentro de un negocio
SELECT business_id, post_number, COUNT(*) as cnt
FROM posts
WHERE post_number IS NOT NULL
GROUP BY business_id, post_number
HAVING COUNT(*) > 1;
-- Resultado esperado: 0 filas
```

---

## 5. PRUEBAS DE CARGA — RECOMENDACIONES

Para el generador masivo (máx 20 posts concurrentes por usuario):

```bash
# Prueba de lock de concurrencia — ambas llamadas simultáneas
# La segunda debe devolver 429
curl -b /tmp/cookies.txt -s -X POST http://localhost:8080/api/posts/generate-extra \
  -H "Content-Type: application/json" \
  -d '{"count":5}' &

curl -b /tmp/cookies.txt -s -X POST http://localhost:8080/api/posts/generate-extra \
  -H "Content-Type: application/json" \
  -d '{"count":5}' | jq '.error'
# Esperado: "Ya hay una generación en curso..."
```

No ejecutar pruebas de carga reales (múltiples usuarios) sin el permiso del usuario — pueden
agotar los créditos de OpenAI.

---

## 6. COMANDOS DE VALIDACIÓN REGISTRADOS

El proyecto usa el sistema de `validation` para verificaciones automatizadas.
Antes de marcar un task completo, correr los scripts de validación si existen:

```bash
# TypeScript check del backend
pnpm --filter @workspace/api-server exec tsc --noEmit

# TypeScript check del frontend
pnpm --filter @workspace/social-dashboard exec tsc --noEmit

# DB schema push (sin --force en prod)
cd lib/db && pnpm run push
```

---

## 7. DATOS DE PRUEBA EN PRODUCCIÓN

Estado actual (abril 2026):
- **userId=1** (juampy40@gmail.com, admin, plan=agency): ECO (bizId=1), HazPost (bizId=2)
- **ECO** (bizId=1): 97 posts (7 published, 90 rejected) — NO TOCAR
- **HazPost** (bizId=2): 0 posts — puede usarse para pruebas
- `subscriptions.credits_remaining` = 800 (plan agency)

Para pruebas destructivas (DELETE masivo, reset de datos), confirmar con el usuario primero.
