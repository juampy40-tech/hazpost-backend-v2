---
name: beneficios-universales
description: Regla fundamental de HazPost sobre restricciones de plan. Úsalo ANTES de implementar cualquier guard, validación de plan, o restricción de acceso a una funcionalidad nueva. Define qué está en la lista de beneficios diferenciadores y qué es universal para todos los usuarios.
---

# Beneficios Universales HazPost

## Regla de Oro

> **Si una funcionalidad NO está en la lista de beneficios diferenciadores, entonces ES UNIVERSAL y TODOS los usuarios pueden usarla sin restricción de plan.**

En HazPost existen dos categorías:

- **Categoría A — Beneficios diferenciadores**: Son los únicos que dependen del plan del usuario. Están definidos en la tabla `plan_benefit_catalog` de la base de datos. Solo estos pueden tener guards de plan.
- **Categoría B — Beneficios universales**: Todo lo demás. No importa si el usuario tiene plan Gratis, Emprendedor, Negocio o Agencia — puede usar estas funcionalidades sin restricción.

---

## Lista de Beneficios Diferenciadores (catálogo actual — 22 keys)

Estos son los ÚNICOS keys que justifican un guard de plan en el backend o frontend:

| Key | Descripción |
|-----|-------------|
| `ai_credits` | Créditos de IA por mes |
| `reels_per_month` | Reels por mes |
| `businesses` | Cantidad de negocios simultáneos |
| `auto_generation` | Generación automática de contenido |
| `scheduling` | Publicación programada a Instagram, TikTok y Facebook |
| `bulk_scheduling` | Publicación masiva y cola de aprobación |
| `brand_profile` | Perfil de marca personalizado |
| `analytics` | Métricas de engagement |
| `landing_pages` | Landing pages con IA |
| `multi_business` | Gestión multi-negocio |
| `support_email` | Soporte por email |
| `support_priority` | Soporte prioritario |
| `calendar_scheduling` | Calendario y programación |
| `bulk_max_7` | Bulk scheduling hasta 7 posts |
| `bulk_max_30` | Bulk scheduling hasta 30 posts |
| `bulk_max_60` | Bulk scheduling hasta 60 posts |
| `content_images_only` | Tipo de publicación: solo imágenes e historias |
| `content_all_types` | Todos los tipos de publicación |
| `statistics` | Estadísticas e informes |
| `telegram_notifications` | Notificaciones Telegram |
| `includes_business_plan` | Todo lo del plan Negocio incluido |
| `extra_business_addon` | Negocios adicionales por precio |
| `element_ai_integration` | IA integra el elemento (gpt-image-1 multimodal, +3 cr/uso). Guard: `plans.element_ai_enabled = true`. |

> **Fuente de verdad**: `SELECT key, label_template FROM plan_benefit_catalog ORDER BY sort_order;`
> Si un key no aparece aquí, la funcionalidad asociada es universal.

---

## Flujo de Decisión (aplicar antes de codificar)

### PASO 1 — Pregunta obligatoria
Antes de agregar cualquier `if (plan !== 'pro')`, `403`, o condición de plan:

> **"¿Esta funcionalidad tiene un key en la lista de beneficios diferenciadores?"**

### PASO 2 — Si NO está en la lista → UNIVERSAL
- Implementas la funcionalidad **sin ningún guard de plan**
- Todos los usuarios la tienen disponible desde el primer día
- **No agregas restricción alguna en el backend ni en el frontend**

### PASO 3 — Si SÍ está en la lista → DIFERENCIADOR
- Puedes aplicar restricción de plan
- Verifica qué planes tienen el key habilitado en `plan_benefit_assignments` (o en `plans.description_json`)
- Implementas el guard solo para ese key

---

## Ejemplos

### Funcionalidades UNIVERSALES (no restringir por plan)

- Cambiar nombre del negocio
- Subir o cambiar el logo
- Ver historial de posts generados
- Exportar contenido a borrador
- Editar el perfil de usuario
- Cambiar contraseña o email
- Ver la página de configuración
- Conectar/desconectar cuentas de redes sociales (el permiso de conexión es universal; lo que varía es cuántos posts se publican)
- Ver notificaciones dentro de la app
- Cualquier CRUD básico sobre datos propios del usuario
- **Biblioteca de Elementos de Marca** (`element_library`): subir, editar, eliminar y aplicar elementos gráficos sobre imágenes. No hay guard de plan — todos los usuarios pueden usar hasta 20 elementos por negocio. Ver skill `element-library-rules`.

### Funcionalidades DIFERENCIADAS (sí restringir por plan)

- Cuántos créditos de IA tiene disponibles → `ai_credits`
- Si puede generar reels → `reels_per_month`
- Si puede tener más de 1 negocio → `businesses` / `multi_business`
- Si puede programar publicaciones → `scheduling` / `calendar_scheduling`
- Si puede hacer bulk scheduling y cuántos posts → `bulk_scheduling` / `bulk_max_*`
- Si puede ver estadísticas avanzadas → `analytics` / `statistics`
- Qué tipos de contenido puede generar → `content_images_only` / `content_all_types`

---

## Instrucción Explícita para el Agente

**NUNCA** implementar un guard de plan para una funcionalidad que no esté en la lista de 22 keys.

Si hay duda, la respuesta por defecto es: **ES UNIVERSAL — no restringir.**

Si el usuario pide agregar una funcionalidad nueva y quiere que sea diferenciadora de plan, primero se agrega el key a `plan_benefit_catalog` (tarea separada), y luego se implementa el guard.
