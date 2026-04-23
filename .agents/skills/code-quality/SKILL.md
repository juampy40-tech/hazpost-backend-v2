---
name: code-quality
description: Code quality and architecture guidelines for HazPost. Use when adding new routes, services, or components; when reviewing code before marking a task complete; or when a file exceeds 300 lines. Covers naming conventions, layer separation, function size, console.log rules, and TypeScript/Drizzle/Express/React+Vite patterns.
---

# Código Limpio y Arquitectura — HazPost

## Stack
| Capa | Tecnología | Directorio |
|------|-----------|-----------|
| Backend API | **Express** + TypeScript + esbuild | `artifacts/api-server/src/` |
| DB / ORM | PostgreSQL + Drizzle ORM | `lib/db/src/schema/` |
| Frontend | React + Vite + Tailwind + shadcn/ui | `artifacts/social-dashboard/src/` |
| AI | OpenAI (gpt-5.2 / gpt-image-1) | `artifacts/api-server/src/services/ai.service.ts` |

> **Nota de framework**: El backend usa **Express** (no Fastify). Los patrones de middleware,
> `req`/`res`, y `Router()` son propios de Express. `req.log` viene del middleware `pino-http`
> configurado en `app.ts`.

---

## 1. NAMING (nombres descriptivos)

```typescript
// ✅ Claro — se entiende sin leer el cuerpo
async function getNextPostNumberForBusiness(businessId: number): Promise<number>
async function deductCreditsFromSubscription(userId: number, count: number): Promise<void>
const pendingApprovalPosts = posts.filter(p => p.status === "pending_approval");

// ❌ Ambiguo — no comunica intención
async function doStuff(id: number)
const list = posts.filter(p => p.s === "pa");
function handle(x: any)
```

### Convenciones de nombres por tipo
| Tipo | Patrón | Ejemplo |
|------|--------|---------|
| Tabla Drizzle | `*Table` | `postsTable`, `businessesTable` |
| Función de ruta | verbo + sustantivo | `generateBulkPosts`, `approvePost` |
| Helper de tenant | tenant + recurso | `tenantFilter`, `tenantPostCond` |
| Estado React | sustantivo | `pendingPosts`, `isGenerating` |
| Handler React | `handle*` | `handleApprove`, `handleSchedule` |

---

## 2. TAMAÑO DE FUNCIONES (una sola responsabilidad)

Regla: **una función, una tarea**. Si necesitas scrollear para leer una función, es demasiado grande.

```typescript
// ❌ Demasiado grande — hace 4 cosas
async function generateAndPublishPosts(uid: number, body: any) {
  // 1. valida créditos
  // 2. genera captions con IA
  // 3. crea posts en DB
  // 4. programa publicación
  // 200 líneas...
}

// ✅ Separado en responsabilidades
async function validateCredits(uid: number): Promise<void> { ... }
async function generateCaptions(niches: Niche[]): Promise<string[]> { ... }
async function insertPosts(captions: string[], uid: number): Promise<number[]> { ... }
async function schedulePostSlots(postIds: number[]): Promise<void> { ... }
```

Límites orientativos:
- Función de ruta (route handler): ≤ 80 líneas
- Función de servicio: ≤ 120 líneas
- Componente React: ≤ 300 líneas (si excede, extraer sub-componentes)

---

## 3. PROHIBICIONES EN PRODUCCIÓN

### `console.log` — PROHIBIDO en production
```typescript
// ❌ Nunca en código de producción
console.log("Post generado:", post.id);
console.error("Error:", err);

// ✅ Usar el logger del proyecto (pino via req.log o logger directo)
const logger = req.log ?? console;  // en handlers de ruta
logger.info({ postId: post.id }, "Post generado");
logger.error({ err }, "Error al generar post");

// ✅ Excepción: background tasks que no tienen acceso a req.log
console.error("[BG] Image generation error:", err);  // prefijo [BG] aceptado
```

### Variables de entorno — NUNCA hardcodeadas
```typescript
// ❌
const apiKey = "sk-abc123...";
const dbUrl = "postgresql://...";

// ✅
const apiKey = process.env.OPENAI_API_KEY;
const dbUrl = process.env.DATABASE_URL;
```

### Secrets — NUNCA en logs
```typescript
// ❌ CRÍTICO — loguea token de usuario
logger.info({ token: req.cookies.hz_token }, "Request");

// ✅
logger.info({ userId: req.user?.userId }, "Request");
```

---

## 4. SEPARACIÓN DE CAPAS

```
Request HTTP → Route Handler → Service → Drizzle ORM → PostgreSQL
                   ↓
              Validation (Zod)
```

### Rutas (routes/*.ts)
- **SÍ**: parsing de req, validación Zod, llamar al servicio, enviar respuesta
- **NO**: lógica de negocio compleja, SQL directamente, llamadas a OpenAI

### Servicios (services/*.ts)
- **SÍ**: lógica de negocio, llamadas a OpenAI, transformaciones de datos
- **NO**: acceso directo a `req`/`res`, respuestas HTTP

### Schema (lib/db/src/schema/*.ts)
- **SÍ**: definición de tablas, tipos exportados, insert schemas Zod
- **NO**: lógica de negocio, queries

---

## 5. PATRONES DRIZZLE ORM — OBLIGATORIOS

### REGLAS DE AISLAMIENTO MULTI-TENANT (CRÍTICO)

> Estas reglas protegen a todos los usuarios actuales y futuros. Violarlas causa fuga de datos entre cuentas.

#### Regla 1 — NUNCA usar tenantFilter inline en un route file
```typescript
// ❌ PROHIBIDO — implementación duplicada, fácil de olvidar en rutas nuevas
function tenantFilter(req: Request) {
  if (req.user!.role === "admin") return undefined;
  return eq(postsTable.userId, req.user!.userId);  // Inline, no centralizado
}

// ✅ OBLIGATORIO — importar de la lib centralizada
import { tenantFilterCol } from "../../lib/tenant.js";
function tenantFilter(req: Request) {
  return tenantFilterCol(postsTable.userId, req);  // Centralizado, auditado
}
```

#### Regla 2 — NUNCA el patrón `userId != null ? cond : undefined` en Drizzle
```typescript
// ❌ ANTI-PATRÓN CRÍTICO — Drizzle ignora `undefined` en and() → retorna datos de TODOS los usuarios
const userCond = userId != null ? eq(contentHistoryTable.userId, userId) : undefined;
await db.select().from(contentHistoryTable).where(and(..., userCond));  // ← FUGA GLOBAL

// ✅ FAIL-CLOSED — si no hay userId, retornar vacío
if (userId == null) return new Set<string>();  // Nunca datos globales
await db.select().from(contentHistoryTable).where(eq(contentHistoryTable.userId, userId));
```

#### Regla 3 — SIEMPRE usar contentHistoryScope/contentHistoryScopeSafe para queries a content_history
```typescript
import { contentHistoryScope, contentHistoryScopeSafe } from "../../lib/tenant.js";

// Para queries que requieren userId o businessId (throws si ambos son null):
const scope = contentHistoryScope(userId, businessId);
await db.select().from(contentHistoryTable).where(and(scope, ...));

// Para queries en background jobs donde no tener userId es válido (retorna null → vacío):
const scope = contentHistoryScopeSafe(userId, businessId);
const rows = scope ? await db.select().from(contentHistoryTable).where(scope).limit(20) : [];
```

#### Regla 4 — VERIFICAR ownership con userId cuando se recibe un businessId externo
```typescript
import { requireBusinessOwnership } from "../../lib/tenant.js";

// ❌ INSEGURO — solo filtra por id → puede retornar negocios de otros usuarios
const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));

// ✅ SEGURO — verifica que businessId pertenece al userId del request
const biz = await requireBusinessOwnership(businessId, req.user!.userId, req.user!.role === "admin");
if (!biz) return res.status(403).json({ error: "Acceso denegado" });
```

#### Regla 5 — GUARDRAIL GPT: no inferir industria del nombre cuando industry es null
El campo `industry` de `businesses` es opcional. Si es null, GPT puede inferir el tipo de negocio
del nombre (ej: "Monica Lucia" → estética). Esto se previene en `getBrandContextBlock` con un
guardrail explícito. NO eliminar ese guardrail.

### Siempre usar tenant filter en queries de datos de usuario
```typescript
// ✅ CORRECTO — nunca expone datos de otro usuario
const posts = await db.select().from(postsTable)
  .where(and(
    eq(postsTable.userId, req.user!.userId),
    eq(postsTable.businessId, bizId),
  ));

// ❌ FUGA — no filtra por userId
const posts = await db.select().from(postsTable)
  .where(eq(postsTable.businessId, bizId));
```

### Verificar ownership ANTES de mutación
```typescript
// ✅ Patrón seguro
const [post] = await db.select({ id: postsTable.id })
  .from(postsTable)
  .where(and(eq(postsTable.id, postId), eq(postsTable.userId, uid)));
if (!post) return res.status(404).json({ error: "No encontrado" });
await db.update(postsTable).set({ status: "approved" }).where(eq(postsTable.id, postId));

// ❌ Inseguro — no verifica ownership
await db.update(postsTable).set({ status: "approved" }).where(eq(postsTable.id, postId));
```

### Evitar N+1 queries
```typescript
// ❌ N+1 — una query por post
for (const post of posts) {
  const variants = await db.select().from(imageVariantsTable).where(eq(imageVariantsTable.postId, post.id));
}

// ✅ Una sola query + agrupación en memoria
const allVariants = await db.select().from(imageVariantsTable)
  .where(inArray(imageVariantsTable.postId, posts.map(p => p.id)));
const variantsByPost = new Map<number, typeof allVariants>();
for (const v of allVariants) {
  if (!variantsByPost.has(v.postId)) variantsByPost.set(v.postId, []);
  variantsByPost.get(v.postId)!.push(v);
}
```

---

## 6. PATRONES REACT — FRONTEND

### Nunca fetch directo — siempre React Query
```typescript
// ❌
const [posts, setPosts] = useState([]);
useEffect(() => { fetch("/api/posts").then(r => r.json()).then(setPosts); }, []);

// ✅ React Query (ya configurado con apiFetch en el proyecto)
const { data: posts } = useGetPosts({ status: "pending_approval" });
```

### Tipos explícitos — nunca `any` en interfaces críticas
```typescript
// ❌
const handleApprove = (post: any) => { ... };

// ✅
const handleApprove = (post: Post & { imageVariants: ImageVariant[] }) => { ... };
```

---

## 7. CHECKLIST ANTES DE HACER COMMIT

- [ ] ¿Todas las queries de usuario filtran por `userId`?
- [ ] ¿Las mutaciones verifican ownership antes de ejecutar?
- [ ] ¿No hay `console.log` de depuración olvidados?
- [ ] ¿No hay secrets/tokens hardcodeados?
- [ ] ¿Funciones > 80 líneas tienen una sola responsabilidad?
- [ ] ¿Los nombres de funciones y variables son descriptivos?
- [ ] ¿Los imports son correctos y no hay imports sin usar?
- [ ] ¿El schema de Drizzle refleja correctamente el estado de la DB?

---

## 8. ARCHIVOS GRANDES — CÓMO TRABAJAR EN ELLOS

`approval.tsx` tiene ~2200+ líneas. Antes de editar:
1. Leer el archivo completo con `offset`/`limit` en bloques de 500 líneas
2. Usar `grep` para encontrar la sección exacta antes de editar
3. Siempre verificar que `old_string` en el `edit` tool sea único en el archivo
4. No hacer refactor completo — solo la sección requerida

---

## 9. CORRECCIONES CENTRALIZADAS (regla obligatoria)

### Principio: toda corrección va en la función central, nunca en parches por userId o businessId

Cuando se detecta un bug en cómo se resuelve una cuenta, un perfil de marca, o cualquier dato de negocio, **la corrección va en la función central** que implementa esa lógica — no en un `if` en cada caller.

```typescript
// ❌ PROHIBIDO — parche individual por negocio (hecho en cada caller)
// Cada función que llama a getInstagramAccount tiene que acordarse del workaround
async function publishToInstagram(...) {
  const account = post.businessId === 2
    ? await getInstagramAccount(post.userId, post.businessId)  // HazPost necesita businessId
    : await getInstagramAccount(post.userId);                  // ECO funciona sin businessId
}

// ✅ CORRECTO — fix centralizado en getInstagramAccount
// Todos los callers simplemente pasan userId + businessId; la función decide cómo filtrar
export async function getInstagramAccount(userId?: number | null, businessId?: number | null) {
  if (userId == null) return null;  // fail-closed
  const cond = businessId != null
    ? and(platformCond, eq(...userId), eq(...businessId))   // AND filter estricto
    : and(platformCond, eq(...userId));                     // solo userId (legacy)
  // ...
}
// Ahora publishToInstagram, publishReelToInstagram, getFacebookPageCredentials,
// publishToTikTok — TODOS se benefician del fix automáticamente
```

### Flujo estándar de corrección centralizada

1. **Identificar la función central** que implementa la lógica incorrecta
2. **Corregir en esa función** aplicando el patrón fail-closed o el fix genérico
3. **Verificar que todos los callers se benefician** — sin necesidad de tocarlos
4. **No tocar los callers** a menos que necesiten pasar un nuevo parámetro a la función central

### Funciones centrales de HazPost — NO bifurcar por userId/businessId

Estas funciones deben mantenerse genéricas. Nunca agregar `if (userId === X)` o `if (businessId === Y)` dentro de ellas:

| Función | Archivo | Qué hace |
|---------|---------|----------|
| `getInstagramAccount(userId, businessId)` | `instagram.service.ts` | Resuelve cuenta IG por negocio |
| `getTikTokAccount(userId, businessId)` | `tiktok.service.ts` | Resuelve cuenta TikTok por negocio |
| `getFacebookPageCredentials(userId, businessId)` | `facebook.service.ts` | Resuelve credenciales FB por negocio |
| `publishPost(postId)` | `scheduler.service.ts` | Publica un post en todas sus plataformas |
| `generateCaption(niche, platform, contentType)` | `ai.service.ts` | Genera caption con IA |
| `rethemeCaption(topic, platform, contentType)` | `ai.service.ts` | Genera caption sobre nuevo tema |
| `generatePostImage(...)` | `ai.service.ts` | Genera imagen con IA + overlays |
| `expireSubscriptions()` | `scheduler.service.ts` | Expira suscripciones vencidas |
| `assignBatchPostNumbers(postIds, bizId)` | `posts.ts` | Asigna post_number atómico por negocio |
| `deductCredits(userId, count)` | (billing) | Descuenta créditos del usuario |
| `syncPublishedPostMetrics()` | `scheduler.service.ts` | Sincroniza métricas IG para todos los negocios |

### Prohibición explícita: no hardcodear userId o businessId en lógica de negocio

```typescript
// ❌ ABSOLUTAMENTE PROHIBIDO — lógica específica por usuario
if (userId === 1) {
  // ECO tiene configuración especial...
}

// ❌ PROHIBIDO — lógica específica por negocio
if (businessId === 2) {
  // HazPost no tiene cuenta TikTok...
}

// ✅ CORRECTO — la función central es genérica y retorna null si no hay cuenta
const tikTokAccount = await getTikTokAccount(userId, businessId);
if (!tikTokAccount) {
  logger.info(`publishPost: no TikTok account for businessId=${businessId} — skipping`);
  return { postId: null, error: "No TikTok account configured for this business" };
}
```

### Corrección correcta vs. parche: ejemplo real (VM-1, Task #125)

**Situación**: HazPost (biz=2) publicaba en Instagram de ECO (biz=1) porque ambos tienen `userId=1`.

```
❌ Parche incorrecto: en el scheduler, antes de llamar publishToInstagram,
   verificar si el post.businessId === 2 y llamar diferente.
   → Hay 4 callers (publishToInstagram, publishReel, publishToFacebook, publishToTikTok).
   → En 6 meses alguien agrega un 5to caller y se olvida del parche.

✅ Fix correcto: en getInstagramAccount(), agregar el parámetro businessId
   y aplicar AND filter cuando está presente.
   → Todos los callers actuales y futuros reciben el fix automáticamente.
   → El parche no existe: la función es genérica por diseño.
```
