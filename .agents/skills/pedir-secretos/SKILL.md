---
name: pedir-secretos
description: Cuando necesites pedirle al usuario un secreto, API key, token o contraseña, SIEMPRE usa requestEnvVar directamente en el chat. NUNCA expliques dónde está el panel de Secrets en Replit ni des instrucciones de navegación — eso confunde al usuario.
---

# Cómo pedir secretos al usuario

## Regla de oro
**SIEMPRE usa `requestEnvVar` en code_execution.** Esto abre el formulario directamente en el chat del usuario — no necesita buscar nada en la interfaz.

## Método correcto (SIEMPRE)

```javascript
await requestEnvVar({
    requestType: "secret",
    keys: ["NOMBRE_DEL_SECRETO"],
    userMessage: "Explicación breve de para qué sirve este secreto"
});
```

## Lo que NO debes hacer nunca
- ❌ Decirle al usuario "ve a la barra lateral y busca el ícono de candado"
- ❌ Explicar cómo navegar el panel de Secrets de Replit
- ❌ Dar instrucciones paso a paso sobre la UI de Replit
- ❌ Decir "Tools → Secrets en el menú superior"

## Por qué
El usuario solo ve el chat. Cuando usas `requestEnvVar`, el formulario aparece directamente ahí. Es un clic, no una búsqueda.

## Ejemplo real
```javascript
// ✅ CORRECTO — el formulario aparece directamente en el chat
await requestEnvVar({
    requestType: "secret",
    keys: ["API_KEY", "HAZPOST_BACKEND_API_KEY"],
    userMessage: "Pega el mismo valor en ambos campos: <token-generado>"
});
```
