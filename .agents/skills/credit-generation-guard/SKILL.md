---
  name: credit-generation-guard
  description: Reglas estrictas de verificación de créditos antes de TODA generación de contenido en HazPost. Sin créditos suficientes = NO generar. Aplica a generación manual, masiva, automática y por API.
  ---
  # HazPost — Control de Generación Sin Créditos

  ## Regla fundamental
  **NUNCA generar contenido sin verificar créditos primero.**
  Si el usuario no tiene créditos suficientes → NO generar → mostrar mensaje claro.

  ## Verificación pre-generación (checklist)
  Antes de llamar a OpenAI/DALL-E para CUALQUIER tipo de generación:

  1. Obtener créditos disponibles del usuario
  2. Obtener costo del tipo de publicación (CREDIT_COST[contentType])
  3. Si disponibles < costo → retornar error 402 con mensaje
  4. Descontar créditos en la misma transacción DB que el insert del post (atómico)

  ## Mensaje de error al usuario
  ```
  "Créditos insuficientes. Tienes X créditos pero este tipo de publicación cuesta Y.
   Recarga tu plan o elige un tipo de contenido más económico."
  ```

  ## Casos que DEBEN verificar créditos
  - Generación manual (Cola de Aprobación)
  - Generación masiva (Generador Masivo)
  - Generación automática del scheduler (06:00 Bogotá)
  - Regeneración de imagen/caption
  - API externa (si existe)

  ## Generación automática
  Si el scheduler va a generar automáticamente y el usuario no tiene créditos:
  - NO generar → NO lanzar error → solo loggear como "saltado por créditos insuficientes"
  - No bloquear el scheduler para otros usuarios

  ## Transacción atómica (crítico)
  ```typescript
  // Dentro de una transacción DB:
  await db.transaction(async (tx) => {
    // 1. Lock para evitar race conditions
    const sub = await tx.select().from(subscriptions)
      .where(eq(subscriptions.userId, uid))
      .for("update");
    // 2. Verificar créditos
    if (sub.creditsRemaining < cost) throw new Error("Insufficient credits");
    // 3. Descontar
    await tx.update(subscriptions).set({ creditsRemaining: sub.creditsRemaining - cost });
    // 4. Insert del post
    await tx.insert(postsTable).values({...});
  });
  ```

  ## Archivos clave
  `artifacts/api-server/src/routes/social/posts.ts`
  `artifacts/api-server/src/services/scheduler.ts` (o donde esté el auto-gen)
  `lib/db/src/schema/subscriptions.ts`
  