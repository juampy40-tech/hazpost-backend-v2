# REGLA ÚNICA Y CENTRAL DE ZONA HORARIA — HazPost

## La regla (sin excepciones)

| Actor | Zona horaria |
|-------|-------------|
| **Base de datos** | Siempre UTC |
| **Admin** | Siempre `America/Bogota` |
| **Usuario** | La zona horaria del país que eligió al registrarse |

## Ejemplo crítico
Un usuario de Nueva Zelanda programa un post para las 8:00 AM (su hora local).  
Sin esta regla → se guardaría como 8:00 AM Bogotá (UTC-5) → diferencia de 17 horas.  
Con esta regla → se guarda como 8:00 AM Auckland (UTC+12) → publicación correcta.

---

## Implementación centralizada

### Backend (servidor)

**ÚNICO archivo con lógica de zonas horarias en el backend:**  
`artifacts/api-server/src/lib/timezone.ts`

Importar solo desde ahí — **ningún otro archivo del backend puede tener lógica de TZ propia.**

```typescript
import {
  resolveUserTimezone,      // User row → IANA string ("America/Bogota")
  countryToTimezone,        // ISO country code → IANA string
  toUserTz,                 // UTC Date → Date en zona del usuario
  toAdminTz,                // UTC Date → Date en Bogotá
  showToUser,               // UTC Date → string formateado en zona del usuario
  showToAdmin,              // UTC Date → string formateado en Bogotá
  dayKeyForTimezone,        // UTC Date + timezone → "YYYY-M-D" (clave de día)
  bogotaDayKey,             // UTC Date → "YYYY-M-D" en Bogotá (alias legado)
  startOfDayInTimezone,     // Date + timezone → UTC Date de medianoche en esa timezone
  ADMIN_TZ,                 // "America/Bogota"
  FALLBACK_TZ,              // "America/Bogota"
} from "../lib/timezone.js";
```

### Middleware Express

Cada request authenticated tiene `req.timezone: string` (IANA string resuelta).  
Los endpoints lo usan para convertir fechas al mostrarlas al cliente.

```typescript
// En app.ts se registra automáticamente
// req.timezone ya está disponible en todos los handlers
```

---

### Frontend (social-dashboard)

**ÚNICO archivo con lógica de zonas horarias en el frontend:**  
`artifacts/social-dashboard/src/lib/timezone.ts`

Importar solo desde ahí — **ningún otro archivo del frontend puede tener lógica de TZ propia.**

```typescript
import {
  ADMIN_TZ,              // "America/Bogota" — usar para UI de admin
  FALLBACK_TZ,           // "America/Bogota" — usar como fallback de user?.timezone
  SCHEDULING_TZ,         // "America/Bogota" — FIJO para agrupar calendario (= bogotaDayKey backend)
  OPTIMAL_HOURS,         // [7, 12, 19] — horas óptimas en SCHEDULING_TZ
  hourInTz,              // UTC ISO → hora (0-23) en la timezone dada
  sameDayInTz,           // Compara si UTC date cae el mismo día de calendario en la timezone
  localHourToUtcFn,      // dateStr local + hora + tz → UTC Date
  nextOptimalHour,       // Próxima hora óptima de publicación en la timezone dada
  getTimeLabel,          // UTC ISO → etiqueta "7pm" / "12:30pm" (usa ADMIN_TZ por defecto)
  formatCalendarDayKey,  // Date → "YYYY-MM-DD" en tiempo local del browser (para IDs de DnD)
  toLocalDatetimeInput,  // UTC Date → string para <input type="datetime-local"> en la tz del usuario
  localDatetimeInputToUtc, // datetime-local string → UTC ISO (para guardar en DB)
  toBogotaLocal,         // @deprecated — usar toLocalDatetimeInput(d, tz)
  bogotaLocalToUtc,      // @deprecated — usar localDatetimeInputToUtc(local, tz)
  utcHourToBogota,       // @deprecated — usar hourInTz(isoString, tz)
} from "@/lib/timezone";
```

#### Regla crítica del calendario

El calendario usa `SCHEDULING_TZ` (hardcoded `"America/Bogota"`) para:
- Agrupar posts en celdas del mes y semana (`sameDayInTz`, `hourInTz`)
- IDs de celdas drag-and-drop (`formatCalendarDayKey`)
- Construcción del timestamp al reprogramar por DnD (`localHourToUtcFn`)

**Esto es INTENCIONAL** — debe coincidir con `bogotaDayKey` del backend.
No usar `userTz` para esto aunque el usuario esté en otra zona horaria.

#### Patrón de userTz en el frontend

```typescript
// En cualquier componente que muestre fechas al usuario:
const { user } = useAuth();
const userTz = user?.timezone ?? FALLBACK_TZ;

// Para operaciones del calendario: SIEMPRE usar SCHEDULING_TZ (no userTz)
sameDayInTz(d, date, SCHEDULING_TZ)   // ✅
sameDayInTz(d, date, userTz)          // ❌ — puede diferir del backend

// Para mostrar hora al usuario: usar userTz
hourInTz(isoString, userTz)           // ✅ — para etiquetas de UI
hourInTz(isoString, SCHEDULING_TZ)    // ✅ — para ubicar el post en la grilla
```

---

## Regla de oro

```
❌ PROHIBIDO: bogota = new Date(d.getTime() - 5 * 60 * 60 * 1000)
❌ PROHIBIDO: "America/Bogota" hardcodeado fuera de timezone.ts (backend o frontend)
❌ PROHIBIDO: UTC-5 en cualquier archivo fuera de los timezone.ts centrales
❌ PROHIBIDO: lógica de TZ duplicada en múltiples archivos
❌ PROHIBIDO: d.getDate() / d.getHours() para comparar fechas de posts (UTC crudo)
❌ PROHIBIDO: date.toISOString().split('T')[0] para IDs de celdas DnD
❌ PROHIBIDO: new Date(); setHours(0,0,0,0) — esto da medianoche UTC, NO del usuario
             → los posts entre 00:00-05:00 UTC (19:00-24:00 Bogotá) quedan fuera de la ventana

✅ CORRECTO (backend): import { dayKeyForTimezone, startOfDayInTimezone } from "../lib/timezone.js"
✅ CORRECTO (frontend): import { SCHEDULING_TZ, sameDayInTz } from "@/lib/timezone"
✅ CORRECTO: sameDayInTz(d, date, SCHEDULING_TZ) — para calendario
✅ CORRECTO: formatCalendarDayKey(date) — para IDs DnD
✅ CORRECTO: localHourToUtcFn(dateStr, hour, SCHEDULING_TZ) — para reprogramar
✅ CORRECTO: startOfDayInTimezone(now, userTimezone) — medianoche real del usuario
```

---

## Estado de migración

### ✅ Fase 1 — COMPLETADA
- `artifacts/api-server/src/lib/timezone.ts` creado con todas las funciones del backend
- `artifacts/social-dashboard/src/lib/timezone.ts` creado con todas las funciones del frontend
- Columna `users.timezone` añadida (nullable — se resuelve desde `brandCountry` si es null)
- Columna `businesses.timezone` añadida (nullable — override por negocio)
- Middleware `req.timezone` en Express
- `/api/user/me` retorna `timezone` (IANA string resuelta)
- `PATCH /api/user/me` acepta `timezone` (IANA string)
- `PUT /api/businesses/:id` acepta `timezone`
- `AuthContext.AuthUser.timezone` disponible en frontend
- `platformDates.ts` — `bogotaDayKey` ahora es alias de `dayKeyForTimezone`
- `settings.tsx` — card "Zona horaria" con selector doble (usuario y negocio activo)

### ✅ Fase 1b — COMPLETADA (Task #380)
- `calendar.tsx` — funciones TZ movidas a `@/lib/timezone`, usa `SCHEDULING_TZ` fijo para agrupamiento
  - `getPostsForDay()` usa `sameDayInTz(d, date, SCHEDULING_TZ)`
  - `weekHourSlots` usa `sameDayInTz` y `hourInTz` con `SCHEDULING_TZ`
  - `handleDragEnd` usa `sameDayInTz` + `localHourToUtcFn` con `SCHEDULING_TZ`
  - IDs de celdas DnD usan `formatCalendarDayKey(date)` (no `toISOString().split('T')[0]`)
- `approval.tsx` — funciones TZ movidas a `@/lib/timezone`, usa `FALLBACK_TZ` como fallback

### ✅ Fase 2a — COMPLETADA (Task #383)
- `artifacts/api-server/src/routes/social/analytics.ts` — endpoint `GET /posting-suggestions`
  - SQL queries ya NO usan `'America/Bogota'` hardcodeado
  - Al inicio del handler se hace query a DB con `usersTable` para obtener el usuario
  - Se llama `resolveUserTimezone(userRow)` → `userTz` (IANA string dinámica)
  - SQL usa `AT TIME ZONE '${userTz}'` en lugar de `AT TIME ZONE 'America/Bogota'`
  - `DEFAULTS` para el endpoint viene de `getSchedulingDefaults()` en `schedulingDefaults.ts`
    (fuente única de verdad compartida con `ai.service.ts`)

> **Nota importante sobre `req.timezone`:** El middleware Express NO inyecta `req.timezone`
> de forma automática — el tipo no existe en el Request de Express. En `analytics.ts` se resuelve
> con una query explícita a DB (`select from usersTable where id = req.user.id`) y luego
> `resolveUserTimezone(userRow)`. No intentar usar `req.timezone` directamente.

### ✅ Fase 2b — PARCIALMENTE COMPLETADA (Task #385)

**Fix crítico de ventana de generación (duplicados de posts):**
- `ai.service.ts` — `windowStart`/`windowEnd` en `generateBulkPosts` ahora usan `startOfDayInTimezone(refNow, userTimezone)`.  
  Ya no se calcula con `setHours(0,0,0,0)` (UTC crudo) → posts a las 8 PM Bogotá (= 1 AM UTC) ya no quedan fuera de la ventana.
- `ai.service.ts` — variable `today` en el helper `findNextDay` ahora apunta a `windowStart` (timezone-aware) en lugar de `new Date(); setHours(0,0,0,0)`.
- `scheduler.service.ts` — `checkDailyGapsAndFill`: bloque Bogotá hardcodeado (`BOGOTA_UTC_OFFSET_H`) eliminado.  
  Los límites `day1Start`, `day2Start`, `day3Start` ahora se calculan POR NEGOCIO con `startOfDayInTimezone(now, resolveUserTimezone(biz))`.

**Pendiente migración completa (40+ referencias restantes):**
- `artifacts/api-server/src/services/ai.service.ts` — `bogotaHourToUTC`, `bogotaDayKey` en otros paths
- `artifacts/api-server/src/services/scheduler.service.ts` — `BOGOTA_TZ`, cron jobs (Bogotá strings)
- `artifacts/api-server/src/routes/social/posts.ts` — reschedule logic
- `artifacts/api-server/src/routes/admin/metrics.ts` — SQL queries
- `artifacts/api-server/src/services/telegram.service.ts` — timestamps en notificaciones

---

## Mapping de países → zonas horarias

Definido en `artifacts/api-server/src/lib/timezone.ts` en el objeto `COUNTRY_TZ`.  
Cubre los países más comunes en América Latina, Europa, Asia y Oceanía.  
Si un país no está mapeado → cae a `FALLBACK_TZ = "America/Bogota"`.

---

## DB: columna `users.timezone`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT;
-- null = resolver desde brandCountry
-- Cuando el usuario elige su país en onboarding, la TZ se auto-asigna vía resolveUserTimezone()
```

La función `resolveUserTimezone(user)` prioriza:
1. `user.timezone` (si fue seteado explícitamente)
2. `countryToTimezone(user.brandCountry)` (si tiene país)
3. `FALLBACK_TZ` = `"America/Bogota"`
