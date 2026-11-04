import { db, groupMembersTable, userProfilesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

/**
 * Resolve a user's membership in a group.
 *
 * Primary path: match by invitedClerkId + accepted status (fast, indexed).
 * Fallback path: match by email for members added before they created a
 * TanCom account (invitedClerkId is NULL). When matched by email, the row
 * is updated in-place to link the Clerk ID so future calls use the fast path.
 *
 * Members added directly (no invitation flow) have invitationStatus = NULL —
 * these are treated as full members.
 */
export async function resolveGroupMembership(
  groupId: number,
  userId: string,
): Promise<typeof groupMembersTable.$inferSelect | null> {
  // 1. Fast path: direct clerkId match with accepted status
  const direct = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.invitedClerkId, userId),
        eq(groupMembersTable.invitationStatus, "accepted"),
      ),
    )
    .then((r) => r[0] ?? null);

  if (direct) return direct;

  // 2. Fallback: look up by email for members added before they signed up
  const profile = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then((r) => r[0] ?? null);

  if (!profile?.email) return null;

  const byEmail = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.email, profile.email),
        isNull(groupMembersTable.invitedClerkId),
      ),
    )
    .then((r) => r[0] ?? null);

  if (!byEmail) return null;

  // 3. Link their Clerk ID so future calls use the fast path
  const [updated] = await db
    .update(groupMembersTable)
    .set({ invitedClerkId: userId, invitationStatus: "accepted" })
    .where(eq(groupMembersTable.id, byEmail.id))
    .returning();

  return updated ?? byEmail;
}
