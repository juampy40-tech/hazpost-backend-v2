import * as zod from "zod";

export const GenerateExtraPostsBody = zod.object({
  count: zod.number().describe("Number of posts to generate (1-20)"),
  nicheIds: zod.array(zod.number()).optional().describe("Niche IDs to use (empty = use all active)"),
  platform: zod.string().optional().describe("Target platform (instagram | tiktok | both)"),
  contentTypes: zod.array(zod.string()).optional().describe("Content types to include (image, reel, carousel, story)"),
  customTopic: zod.string().optional().describe("Custom topic or idea to guide content generation"),
  businessId: zod.number().optional().describe("Business ID to associate posts with"),
  referenceImageBase64: zod.string().optional().describe("Base64-encoded reference image for visual style extraction"),
  elementId: zod.number().optional().describe("Business element ID to integrate via AI into generated images"),
  useDeepElementAI: zod.boolean().optional().describe("When true, AI integrates the selected element into every generated image (requires elementId and plan feature)"),
});

export const ApplySuggestionParams = zod.object({
  id: zod.coerce.number(),
});

export const ApplySuggestionBody = zod.object({
  instruction: zod.string().describe("AI rewrite instruction to apply to the caption"),
});
