import { db, pool } from "@workspace/db";
import { appSettingsTable, pendingCreditDeductionsTable } from "@workspace/db";
import { inArray, sql, eq } from "drizzle-orm";

export interface CreditCosts {
  image: number;
  story: number;
  carousel: number;
  reel: number;
  elementAi: number;
}

export const DEFAULT_COSTS: CreditCosts = {
  image: 1,
  story: 1,
  carousel: 5,
  reel: 6,
  elementAi: 3,
};

const CREDIT_COST_KEYS = [
  "credit_cost_image",
  "credit_cost_story",
  "credit_cost_carousel",
  "credit_cost_reel",
  "credit_cost_element_ai",
] as const;

let _cache: CreditCosts | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

export async function getCreditCosts(): Promise<CreditCosts> {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;

  try {
    const rows = await db
      .select()
      .from(appSettingsTable)
      .where(inArray(appSettingsTable.key, [...CREDIT_COST_KEYS]));

    const map: Record<string, number> = {};
    for (const row of rows) {
      map[row.key] = Number(row.value);
    }

    _cache = {
      image:     isFinite(map["credit_cost_image"])       ? map["credit_cost_image"]       : DEFAULT_COSTS.image,
      story:     isFinite(map["credit_cost_story"])       ? map["credit_cost_story"]       : DEFAULT_COSTS.story,
      carousel:  isFinite(map["credit_cost_carousel"])    ? map["credit_cost_carousel"]    : DEFAULT_COSTS.carousel,
      reel:      isFinite(map["credit_cost_reel"])        ? map["credit_cost_reel"]        : DEFAULT_COSTS.reel,
      elementAi: isFinite(map["credit_cost_element_ai"]) ? map["credit_cost_element_ai"]  : DEFAULT_COSTS.elementAi,
    };
    _cacheExpiry = now + CACHE_TTL_MS;
    return _cache;
  } catch {
    return _cache ?? { ...DEFAULT_COSTS };
  }
}

export function invalidateCreditCostsCache(): void {
  _cache = null;
  _cacheExpiry = 0;
}

export function creditCostOf(contentType: string | null | undefined, costs: CreditCosts): number {
  switch (contentType) {
    case "story":    return costs.story;
    case "carousel": return costs.carousel;
    case "reel":     return costs.reel;
    default:         return costs.image;
  }
}

export interface DeductResult {
  ok: boolean;
  creditsHad: number;
  cost: number;
  creditsRemaining: number;
}

/**
 * Atomically checks and deducts credits for a content generation operation.
 *
 * Uses a dedicated pg connection (pool.connect) so the SELECT FOR UPDATE and
 * the UPDATE run inside a single session — guaranteeing that two concurrent
 * requests cannot both pass the credit check and both deduct.
 *
 * @param userId      The user whose subscription to deduct from.
 * @param contentType The content type being generated (image | story | carousel | reel).
 * @param count       Number of units being generated (default 1).
 * @returns `{ ok: true, ... }` if credits were successfully deducted, or
 *          `{ ok: false, creditsHad, cost, creditsRemaining }` if insufficient.
 */
export async function checkAndDeductCredits(
  userId: number,
  contentType: string,
  count = 1,
): Promise<DeductResult> {
  const costs = await getCreditCosts();
  const cost = creditCostOf(contentType, costs) * count;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ id: number; credits_remaining: number }>(
      "SELECT id, credits_remaining FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [userId],
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, creditsHad: 0, cost, creditsRemaining: 0 };
    }

    const { id: subId, credits_remaining } = result.rows[0];

    if (credits_remaining < cost) {
      await client.query("ROLLBACK");
      return { ok: false, creditsHad: credits_remaining, cost, creditsRemaining: credits_remaining };
    }

    await client.query(
      "UPDATE subscriptions SET credits_remaining = credits_remaining - $1 WHERE id = $2",
      [cost, subId],
    );

    await client.query("COMMIT");
    return { ok: true, creditsHad: credits_remaining, cost, creditsRemaining: credits_remaining - cost };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Transaction-composable version of checkAndDeductCredits.
 * Runs the credit check + deduction inside the provided Drizzle transaction,
 * so the caller can combine it with post inserts in a single atomic DB transaction.
 *
 * The tx must already be open (called from within db.transaction(async tx => { ... })).
 * If insufficient credits, throws an Error with code "INSUFFICIENT_CREDITS" so the
 * outer transaction rolls back automatically.
 *
 * Usage:
 *   await db.transaction(async tx => {
 *     await checkAndDeductCreditsInTx(tx, userId, contentType);
 *     await tx.insert(postsTable).values(...);
 *   });
 */
export async function checkAndDeductCreditsInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: number,
  contentType: string,
  count = 1,
): Promise<DeductResult> {
  const costs = await getCreditCosts();
  const cost = creditCostOf(contentType, costs) * count;

  // SELECT FOR UPDATE within the Drizzle transaction session
  const rows = await tx.execute(
    sql`SELECT id, credits_remaining FROM subscriptions WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1 FOR UPDATE`,
  );

  if (!rows.rows.length) {
    const err = new Error("No subscription found") as Error & { code?: string };
    err.code = "INSUFFICIENT_CREDITS";
    throw err;
  }

  const row = rows.rows[0] as { id: number; credits_remaining: number };
  const { id: subId, credits_remaining } = row;

  if (credits_remaining < cost) {
    const err = new Error(`Créditos insuficientes: tienes ${credits_remaining}, necesitas ${cost}`) as Error & { code?: string; creditsHad?: number; cost?: number };
    err.code = "INSUFFICIENT_CREDITS";
    err.creditsHad = credits_remaining;
    err.cost = cost;
    throw err;
  }

  await tx.execute(
    sql`UPDATE subscriptions SET credits_remaining = credits_remaining - ${cost} WHERE id = ${subId}`,
  );

  return { ok: true, creditsHad: credits_remaining, cost, creditsRemaining: credits_remaining - cost };
}

export interface CreditReservation {
  ok: boolean;
  reserved: number;
  creditsHad: number;
  maxCostPerPost: number;
}

/**
 * Estimates the maximum cost of a bulk generation job.
 * Uses the most expensive content type in the requested mix × count as a conservative
 * ceiling so we never over-generate. Surplus is always refunded after generation.
 *
 * @param count        Number of posts to generate.
 * @param contentTypes Array of content types that will be generated (e.g. ["image","reel","carousel"]).
 * @param costs        Current credit costs from getCreditCosts().
 */
export function estimateBulkCost(count: number, contentTypes: string[], costs: CreditCosts): number {
  const relevantCosts = contentTypes.length > 0
    ? contentTypes.map(t => creditCostOf(t, costs))
    : [costs.image];
  const maxCostPerPost = Math.max(...relevantCosts);
  return count * maxCostPerPost;
}

export interface BulkReservation {
  ok: boolean;
  reserved: number;
  creditsHad: number;
  maxCostPerPost: number;
  /** Affordable count (may be less than requested — caller should cap generation to this) */
  affordableCount: number;
  /** Original requested count */
  requestedCount: number;
  /** True when affordableCount < requestedCount — generation will be partial */
  partial: boolean;
}

/**
 * Atomically reserves (deducts) credits before a bulk AI call.
 * Uses a dedicated pg connection so SELECT FOR UPDATE and UPDATE share one session.
 *
 * Strategy: reserve the maximum possible cost upfront, capped to what the user can
 * afford (partial generation). The caller MUST refund any surplus (reservation.reserved
 * - actualCost) on success, or refund the full amount on failure, using `refundCredits()`.
 *
 * Returns `{ ok: false }` only when the user cannot afford even a single post.
 * When the user can afford a partial set, `ok: true` and `partial: true` are returned
 * with `affordableCount` indicating how many posts to generate.
 */
export async function reserveCredits(
  userId: number,
  requestedCount: number,
  contentTypes: string[],
): Promise<BulkReservation> {
  const costs = await getCreditCosts();
  const relevantCosts = contentTypes.length > 0
    ? contentTypes.map(t => creditCostOf(t, costs))
    : [costs.image];
  const maxCostPerPost = Math.max(...relevantCosts);

  if (requestedCount <= 0) {
    return { ok: true, reserved: 0, creditsHad: 0, maxCostPerPost, affordableCount: 0, requestedCount, partial: false };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ id: number; credits_remaining: number }>(
      "SELECT id, credits_remaining FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [userId],
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false, reserved: 0, creditsHad: 0, maxCostPerPost, affordableCount: 0, requestedCount, partial: false };
    }

    const { id: subId, credits_remaining } = result.rows[0];

    // How many posts can the user afford at worst-case cost?
    const affordableCount = Math.floor(credits_remaining / maxCostPerPost);
    if (affordableCount <= 0) {
      await client.query("ROLLBACK");
      return { ok: false, reserved: 0, creditsHad: credits_remaining, maxCostPerPost, affordableCount: 0, requestedCount, partial: false };
    }

    const actualCount = Math.min(requestedCount, affordableCount);
    const reserveAmount = actualCount * maxCostPerPost;

    await client.query(
      "UPDATE subscriptions SET credits_remaining = credits_remaining - $1 WHERE id = $2",
      [reserveAmount, subId],
    );

    await client.query("COMMIT");
    return {
      ok: true,
      reserved: reserveAmount,
      creditsHad: credits_remaining,
      maxCostPerPost,
      affordableCount: actualCount,
      requestedCount,
      partial: actualCount < requestedCount,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Refunds (adds back) credits to a user's subscription.
 * Used to return surplus credits after generation (reservation - actual cost)
 * or to fully refund on generation failure.
 */
export async function refundCredits(userId: number, amount: number): Promise<void> {
  if (amount <= 0) return;
  await db.execute(
    sql`UPDATE subscriptions
        SET credits_remaining = credits_remaining + ${amount}
        WHERE id = (SELECT id FROM subscriptions WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1)`,
  );
}

/**
 * CENTRALIZED refund for image generation failure.
 *
 * Call this — and ONLY this — whenever ALL image variants for a post end up
 * with generationStatus = 'error'. It calculates the correct cost for the
 * content type and returns the credit to the user's balance.
 *
 * After calling this, mark `posts.creditsRefunded = true` so that any
 * subsequent retry is free (skip checkAndDeductCredits in retry-image).
 *
 * ANTI-PATTERN: never compute the refund amount inline outside this function.
 *
 * @param userId      User to refund (post owner, NOT the actor in admin retries).
 * @param contentType Content type of the failed post (image | story | carousel | reel).
 * @returns Amount of credits refunded (0 if userId is null/undefined).
 */
export async function refundImageFailure(
  userId: number | undefined | null,
  contentType: string | null | undefined,
): Promise<number> {
  if (userId == null) return 0;
  const costs = await getCreditCosts();
  const amount = creditCostOf(contentType, costs);
  await refundCredits(userId, amount);
  return amount;
}

/**
 * Non-locking snapshot check: reads credits_remaining without locking.
 * Use as a pre-AI advisory guard to avoid spending OpenAI tokens when credits
 * are clearly exhausted. The real atomic enforcement happens at insert time
 * via checkAndDeductCreditsInTx (SELECT FOR UPDATE inside db.transaction).
 *
 * Returns the current credits_remaining, or -1 if userId is undefined/null.
 */
export async function snapshotCredits(userId: number | undefined | null): Promise<number> {
  if (userId == null) return Infinity; // no limit for admin/scheduler without user
  const rows = await db.execute(
    sql`SELECT credits_remaining FROM subscriptions WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
  );
  if (!rows.rows.length) return 0;
  const row = rows.rows[0] as { credits_remaining: number };
  return row.credits_remaining ?? 0;
}

/**
 * Durable credit deduction ledger helpers.
 *
 * Used to implement "durable workflow semantics" for AI generation:
 *   Step 1 (pre-AI, in TX):  deductCreditsAndCreateLedger(tx, userId, cost) → ledgerId
 *   Step 2 (no TX):           AI call (caption/image generation)
 *   Step 3 (in TX):          settleLedger(tx, ledgerId, postId)  +  tx.insert(post)
 *
 * If the process crashes between steps 1 and 3, the 'pending' ledger row is
 * visible to a background reconciliation job that can refund the user automatically.
 */

/**
 * Step 1: Atomically deducts credits AND creates a 'pending' ledger row.
 * Call inside db.transaction(). Throws INSUFFICIENT_CREDITS if balance too low.
 * Returns the new ledger row id for later settlement.
 */
export async function deductAndCreateLedger(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: number,
  contentType: string,
): Promise<number> {
  // Reuse existing checkAndDeductCreditsInTx for the credit deduction
  await checkAndDeductCreditsInTx(tx, userId, contentType);
  // Record the pending deduction in the durable ledger
  const costs = await getCreditCosts();
  const cost = creditCostOf(contentType, costs);
  const [row] = await tx.insert(pendingCreditDeductionsTable).values({
    userId,
    cost,
    status: "pending",
  }).returning({ id: pendingCreditDeductionsTable.id });
  return row.id;
}

/**
 * Step 3: Atomically settles the ledger entry (marks it used) alongside the post insert.
 * Call inside db.transaction() together with the post insert.
 * This is the "settle" half of the durable workflow.
 */
export async function settleLedger(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ledgerId: number,
  postId: number,
): Promise<void> {
  await tx.update(pendingCreditDeductionsTable)
    .set({ status: "settled", postId, settledAt: new Date() })
    .where(eq(pendingCreditDeductionsTable.id, ledgerId));
}

/**
 * Reconciliation: refunds all 'pending' ledger entries older than maxAgeMinutes.
 * Called by a background job to recover credits from crashed generation runs.
 */
export async function reconcilePendingLedger(maxAgeMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
  // Find stale pending entries
  const stale = await db
    .select({ id: pendingCreditDeductionsTable.id, userId: pendingCreditDeductionsTable.userId, cost: pendingCreditDeductionsTable.cost })
    .from(pendingCreditDeductionsTable)
    .where(
      sql`status = 'pending' AND created_at < ${cutoff.toISOString()}`
    );
  if (stale.length === 0) return 0;
  // Refund each user
  for (const entry of stale) {
    await refundCredits(entry.userId, entry.cost).catch(() => {});
    await db.update(pendingCreditDeductionsTable)
      .set({ status: "refunded", settledAt: new Date() })
      .where(eq(pendingCreditDeductionsTable.id, entry.id));
  }
  return stale.length;
}
