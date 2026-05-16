============================================================
BRAND PROFILE SYNC ARCHITECTURE
============================================================

Archivos relacionados:

• brand-profile.ts
• businesses.ts
• analyze-website.ts
• OnboardingWizard.tsx
• getBrandContextBlock()
• businessesTable
• brand_profiles

============================================================
RESPONSABILIDAD
============================================================

Este flujo actualmente controla:

• onboarding branding,
• sincronización profile/business,
• analyze website,
• generación IA,
• branding persistence,
• GPT brand context,
• logos,
• colores,
• tono,
• audience,
• y branding runtime.

============================================================
OBJETIVO
============================================================

El sistema debe mantener sincronizado:

• brand_profiles
• businesses

para garantizar:

• branding consistente,
• IA consistente,
• onboarding limpio,
• persistencia correcta,
• y aislamiento correcto entre negocios.

============================================================
PROBLEMA HISTÓRICO DETECTADO
============================================================

Se detectó contaminación de branding durante onboarding.

Síntomas observados:

• industrias viejas reviviendo,
• slogans antiguos apareciendo,
• ciudades antiguas reapareciendo,
• firmas legacy apareciendo,
• analyze-website mezclando contexto viejo,
• branding zombie,
• contaminación parcial.

Ejemplos reales detectados:

• ECO-COL
• Cali
• Fitness & Deporte

apareciendo durante onboarding de Triptico.

============================================================
ROOT CAUSE DETECTADA
============================================================

La sincronización:

brand_profiles → businesses

estaba DESACTIVADA.

El bloque mirror sync estaba comentado en:

• brand-profile.ts

Resultado:

• businessesTable conservaba branding viejo,
• brand_profiles recibía branding nuevo,
• la IA mezclaba contexto stale + actual,
• onboarding revivía datos legacy.

============================================================
BLOQUE CRÍTICO
============================================================

⚠️ CRÍTICO

NO comentar:

const bizUpdates = {}

ni el bloque:

await db.update(businessesTable)

Este sync es sensible.

============================================================
RIESGOS IMPORTANTES
============================================================

RIESGOS CORE:

• contaminación branding,
• IA usando contexto viejo,
• onboarding inconsistente,
• mezcla parcial de negocio,
• logos incorrectos,
• colores incorrectos,
• prompts contaminados,
• generación incorrecta,
• multi-source truth,
• branding stale.

============================================================
LIMPIEZA DEFENSIVA AGREGADA
============================================================

Se agregaron resets automáticos cuando frontend NO envía:

• industry
• subIndustry
• subIndustries
• slogan
• city
• defaultLocation
• defaultSignatureText
• audienceDescription
• brandTone

Objetivo:

• evitar persistencia zombie,
• evitar merges parciales,
• evitar contaminación onboarding.

============================================================
REGLAS IMPORTANTES
============================================================

NO:

• duplicar branding innecesariamente,
• comentar mirror sync,
• asumir businesses como source-of-truth,
• mezclar defaults legacy,
• persistir merges parciales,
• ni reutilizar onboarding incompleto.

============================================================
VALIDACIÓN OBLIGATORIA
============================================================

Siempre validar:

• payload frontend,
• Network F12,
• logs backend,
• persistencia DB,
• onboarding nuevo,
• onboarding refresh,
• analyze-website response,
• business limpio,
• multiusuario,
• branding aislado.

============================================================
DIRECCIÓN FUTURA
============================================================

Objetivo futuro:

• brand_profiles = source-of-truth branding
• businesses = metadata operativa

⚠️ NO migrar todavía hasta estabilizar onboarding.
