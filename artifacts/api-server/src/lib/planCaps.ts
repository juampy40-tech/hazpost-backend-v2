/**
 * planCaps — helpers for reading plan capability snapshots from subscriptions.
 *
 * When a subscription is created or renewed, a snapshot of the plan's capabilities
 * is stored in lockedPlanConfig. This ensures that admin changes to plan settings
 * (credits, bulk limits, allowed content types, businesses, reels) only take effect
 * for new subscriptions and renewals, never for active subscriptions mid-cycle.
 */

export type PlanCaps = {
  creditsPerMonth: number;
  bulkMaxPosts: number;
  allowedContentTypes: string[];
  businessesAllowed: number;
  reelsPerMonth: number;
  /** Task #293: IA integra el elemento — gpt-image-1 multimodal. Default false. */
  elementAiEnabled?: boolean;
};

/**
 * Returns the effective plan capabilities for a subscription.
 * Prefers the locked snapshot if present; falls back to the live plan row.
 * The fallback handles subscriptions created before lockedPlanConfig existed.
 *
 * For boolean flags added after the initial snapshot (e.g. elementAiEnabled),
 * we fall back field-by-field to the live value if the locked config predates the flag.
 */
export function capsFromSnapshot(
  locked: PlanCaps | null | undefined,
  live: PlanCaps
): PlanCaps {
  if (!locked) return live;
  return {
    ...live,
    ...locked,
    // Boolean flags added post-launch: fall back to live value if missing from old snapshots.
    elementAiEnabled: locked.elementAiEnabled ?? live.elementAiEnabled ?? false,
  };
}

/**
 * Builds a PlanCaps snapshot from a plansTable row.
 * Use this when creating or renewing a subscription.
 */
export function buildPlanSnapshot(plan: {
  creditsPerMonth: number;
  bulkMaxPosts: number | null;
  allowedContentTypes: string[] | null;
  businessesAllowed: number | null;
  reelsPerMonth: number | null;
  elementAiEnabled?: boolean | null;
}): PlanCaps {
  return {
    creditsPerMonth:     plan.creditsPerMonth,
    bulkMaxPosts:        plan.bulkMaxPosts        ?? 0,
    allowedContentTypes: plan.allowedContentTypes ?? ["image", "story"],
    businessesAllowed:   plan.businessesAllowed   ?? 1,
    reelsPerMonth:       plan.reelsPerMonth        ?? 0,
    elementAiEnabled:    plan.elementAiEnabled     ?? false,
  };
}
