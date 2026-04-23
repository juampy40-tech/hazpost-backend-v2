---
name: textos-guia-genericos
description: Regla permanente de HazPost sobre textos de ejemplo, placeholders y copy instructivo en la plataforma. Úsalo antes de escribir o modificar cualquier texto guía, placeholder, tooltip, mensaje de onboarding, ejemplo de formulario o copy instructivo en cualquier parte de la web. Los textos NO deben mencionar industrias específicas.
---

# Textos Guía Genéricos — HazPost

## Regla fundamental

Los textos de ejemplo, placeholders, instrucciones guía, tooltips, mensajes de onboarding y cualquier copy instructivo de la plataforma **deben ser genéricos** y aplicables a cualquier tipo de negocio.

**NUNCA mencionar industrias específicas** en textos guía, aunque el primer usuario o negocio de prueba pertenezca a esa industria.

## Palabras y frases prohibidas en textos guía

- "paneles solares", "panel solar", "placas solares"
- "energía solar", "energía fotovoltaica", "sistema fotovoltaico"
- "instalación solar", "kWh", "vatios"
- Cualquier referencia a una industria vertical concreta: medicina, restaurantes específicos, abogados, etc.

## Ejemplos correcto vs incorrecto

| Contexto | ❌ Incorrecto | ✅ Correcto |
|----------|--------------|------------|
| Placeholder "descripción del negocio" | "Vendemos e instalamos paneles solares en toda la región" | "Ofrecemos productos y servicios de calidad para nuestros clientes" |
| Placeholder "nicho o industria" | "Energía solar residencial" | "Tu sector o especialidad (ej: moda, comida, servicios)" |
| Ejemplo de post generado | "Hoy instalamos 20 paneles en Cali..." | "Hoy completamos otro proyecto exitoso para nuestro cliente..." |
| Tooltip de marca | "Ideal para empresas de energía" | "Ideal para cualquier tipo de negocio" |

## Alcance

Aplica a **toda la web de HazPost**:
- Formulario de registro y onboarding (`register.tsx`, pasos de configuración de negocio)
- Inputs con placeholder en ajustes de negocio / marca
- Tooltips y descripciones de funcionalidades
- Modales de ayuda
- Ejemplos de captions o posts generados que aparezcan como demo
- Textos de planes y landing page

## Acción proactiva

Si durante una sesión de trabajo el agente detecta algún texto guía con una referencia a industria específica, debe **corregirlo proactivamente** sin esperar a que el usuario lo señale (ver skill `proactive-capabilities`).
