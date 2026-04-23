---
name: task-suggestion-rules
description: Reglas permanentes sobre cuándo y cómo sugerir tareas de seguimiento (follow-up tasks) en HazPost. Úsalo ANTES de llamar a proposeFollowUpTasks en cualquier tarea. Define cuándo está prohibido sugerir, cuándo es obligatorio, y cómo priorizar cuando el usuario lo pida explícitamente.
---

# Skill: Reglas de sugerencia de tareas en HazPost

## Contexto

El proyecto está en **etapa de construcción activa** con presupuesto limitado y objetivo
claro: terminar la web para entrar a pruebas con 10-50 usuarios. Cada tarea de seguimiento
innecesaria consume tiempo y dinero, y puede desviar el foco.

---

## Regla principal: NO sugerir tareas por defecto

**Por defecto, NO llamar a `proposeFollowUpTasks` al terminar una tarea.**

La única excepción obligatoria es si en el código del task se encuentran:
1. **Errores de seguridad activos** (vulnerabilidad real, exposición de datos, auth bypass)
2. **Errores que rompen funcionalidad existente** (bug que el cambio introduce o descubre)

En esos dos casos, documentar el hallazgo DENTRO del plan de la tarea actual (no como follow-up separado) si el fix es pequeño. Si requiere trabajo significativo, crear una sola tarea de seguimiento con categoría `bug` o `security`.

---

## Cuándo SÍ está permitido sugerir tareas

### Condición A — El usuario lo pide explícitamente

Frases que activan el modo de sugerencia:
- "sugiere tareas", "qué tareas podemos hacer", "qué sigue", "qué mejoras propones"
- "dame ideas", "qué falta", "tengo tiempo libre"
- "ya terminé esta etapa, voy a entrar a pruebas" → activa modo pruebas (ver abajo)

### Condición B — Tarea relacionada con seguridad

Si durante la ejecución de cualquier tarea se descubre una vulnerabilidad real
(no teórica), se puede proponer UNA sola tarea de tipo `security`.

### Condición C — Bug introducido por el cambio actual

Si el cambio actual rompe algo que antes funcionaba, proponer UNA tarea de tipo `bug` para repararlo.

---

## Modo pruebas (cuando el usuario dice que entra a pruebas)

Cuando el usuario declare que está entrando a la etapa de pruebas con usuarios reales,
se activa el modo de sugerencia completo con estas restricciones:

- **Máximo 10 tareas cada 24 horas**
- **Orden de prioridad estricto:**
  1. **Errores de la web** — cosas que están rotas o causan mala experiencia a usuarios reales
  2. **Seguridad** — vulnerabilidades, exposición de datos, problemas de auth
  3. **Otras mejoras** — UX, rendimiento, nuevas funcionalidades

- Solo proponer lo más importante. Si hay 20 cosas pendientes, seleccionar las 10 de mayor impacto para usuarios reales.

---

## Reglas adicionales

- **Nunca duplicar tareas existentes.** Antes de proponer, revisar la lista de tareas existentes.
- **No proponer tareas de documentación, housekeeping de código, o refactors estéticos** — solo si el usuario los pide.
- **Incluir el fix en la tarea actual** siempre que sea pequeño (< 30 min de trabajo). Solo crear una tarea separada si el scope es significativo.
- **Las mejoras de UX opcionales** (animaciones, colores, textos) van al final de la lista de prioridades o no se proponen si no hay presupuesto.

---

## Anti-patrones prohibidos

```
❌ Proponer follow-ups "de completitud" al terminar cualquier tarea
❌ Proponer follow-ups porque "sería bueno tenerlo"
❌ Proponer más de 3 follow-ups cuando el usuario SÍ pide sugerencias (fuera de modo pruebas)
❌ Proponer tareas que ya existen en la lista del proyecto
❌ Crear tareas de "mejorar el código" o "agregar tests" sin que el usuario lo pida
❌ Sugerir nuevas features cuando hay bugs sin resolver
```

---

## Cómo aplicar este skill al completar una tarea

Antes de llamar a `proposeFollowUpTasks`, verificar:

```
1. ¿El usuario pidió explícitamente seguimiento? → Si no → NO proponer nada
2. ¿Encontré un bug de seguridad? → Proponer solo ese (máx 1)
3. ¿El cambio actual rompió algo? → Proponer solo ese fix (máx 1)
4. En cualquier otro caso → Pasar null o no llamar a proposeFollowUpTasks
```

---

## Este skill puede romperse (override) cuando:

- El usuario dice explícitamente: "sugiere tareas", "qué más podemos hacer", "dame ideas"
- El usuario dice que entra a pruebas → activa modo pruebas con max 10 tareas/24h
- El usuario dice "ya puedes sugerir libremente" → seguir las reglas de modo pruebas
- El usuario propone una tarea y dice "y sugiere las relacionadas" → incluir solo las directamente relacionadas, máx 3
