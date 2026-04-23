// Cost per DALL-E/gpt-image-1 call (USD).
// Reels and carousels multiply by slide_count because each slide = 1 image call.
export const DEFAULT_GENERATION_COSTS_USD: Record<string, number> = {
  image:      0.020,
  story:      0.020,
  carousel:   0.020,
  reel:       0.020, // each reel slide = 1 image call
  element_ai: 0.040, // gpt-image-1 edit/compose with element reference
};

// GPT model pricing (USD per token) — estimates based on equivalent OpenAI tier pricing.
// Used to calculate text generation cost from response.usage token counts.
export const GPT_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.2":     { input: 2.50  / 1_000_000, output: 10.00 / 1_000_000 },
  "gpt-5.1":     { input: 2.00  / 1_000_000, output: 8.00  / 1_000_000 },
  "gpt-5":       { input: 2.00  / 1_000_000, output: 8.00  / 1_000_000 },
  "gpt-5-mini":  { input: 0.40  / 1_000_000, output: 1.60  / 1_000_000 },
  "gpt-4o":      { input: 2.50  / 1_000_000, output: 10.00 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15  / 1_000_000, output: 0.60  / 1_000_000 },
};

/**
 * Calculates the USD cost of a GPT call from its usage metadata.
 * Pass `response.usage` from an openai.chat.completions.create() call.
 */
export function calcGptCostUsd(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
): number {
  if (!usage) return 0;
  const pricing = GPT_PRICING[model] ?? GPT_PRICING["gpt-5.2"];
  return (
    (usage.prompt_tokens ?? 0) * pricing.input +
    (usage.completion_tokens ?? 0) * pricing.output
  );
}

/**
 * Computes the image generation cost (USD) for a post based on content type and slide count.
 * Returns a string with 4 decimal places.
 */
export function computeGenerationCostUsd(
  contentType: string,
  slideCount?: number | null,
): string {
  const sc = slideCount != null && slideCount > 0 ? slideCount : 1;
  let cost: number;
  switch (contentType) {
    case "reel":     cost = DEFAULT_GENERATION_COSTS_USD.reel * sc;          break;
    case "carousel": cost = DEFAULT_GENERATION_COSTS_USD.carousel * sc;      break;
    case "story":    cost = DEFAULT_GENERATION_COSTS_USD.story;              break;
    default:         cost = DEFAULT_GENERATION_COSTS_USD.image;
  }
  return cost.toFixed(4);
}

/**
 * Returns the fixed USD cost per element_ai (gpt-image-1 multimodal) call.
 * Use this when recording generation_cost_usd for posts that use "IA integra el elemento".
 */
export function estimateElementAICost(): number {
  return DEFAULT_GENERATION_COSTS_USD.element_ai;
}

/**
 * Combines image generation cost + text (GPT) cost into a single USD string.
 * Use this when inserting posts to record the full generation cost.
 */
export function totalGenerationCostUsd(
  contentType: string,
  slideCount: number | null | undefined,
  textCostUsd: number,
): string {
  const imageCost = parseFloat(computeGenerationCostUsd(contentType, slideCount));
  return (imageCost + textCostUsd).toFixed(4);
}
