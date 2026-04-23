import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * Returns the active (default) business ID for a user, or null if the user
 * has no businesses configured. Used to scope all queries to the active business.
 */
export async function getActiveBusinessId(userId: number): Promise<number | null> {
  const [biz] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(
      and(
        eq(businessesTable.userId, userId),
        eq(businessesTable.isDefault, true),
        eq(businessesTable.isActive, true),
      ),
    )
    .limit(1);
  return biz?.id ?? null;
}
