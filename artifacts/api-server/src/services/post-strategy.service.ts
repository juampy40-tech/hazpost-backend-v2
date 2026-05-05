/**
 * Post Strategy Engine — HazPost
 *
 * Este servicio NO genera captions ni imágenes directamente.
 * Su trabajo es pensar la estrategia comercial del post antes de llamar a la IA.
 *
 * Objetivo:
 * - leer perfil completo del negocio
 * - detectar mercados: residencial, comercial, industrial, agrícola, etc.
 * - elegir un enfoque por post
 * - construir captionBrief y visualScene coherentes
 * - evitar contenido genérico tipo "casa + familia" cuando el negocio tiene más mercados
 *
 * Flujo deseado:
 * posts.ts / ai.service.ts
 *   → post-strategy.service.ts
 *   → generateCaption()
 *   → generatePostImage()
 */
