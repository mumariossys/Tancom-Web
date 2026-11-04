import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, contactsTable, userProfilesTable } from "@workspace/db";

/**
 * Returns true if either user has blocked the other.
 *
 * Matching is done by contactClerkId AND (fallback) by the registered email of
 * the other user, so a block still holds even when the blocker's contact row
 * hasn't had its contactClerkId resolved yet (the lazy resolver only runs when
 * the blocker opens their contact list).
 */
export async function isBlockedBetween(aClerkId: string, bClerkId: string): Promise<boolean> {
  if (!aClerkId || !bClerkId || aClerkId === bClerkId) return false;

  const profiles = await db
    .select({ clerkId: userProfilesTable.clerkId, email: userProfilesTable.email })
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.clerkId, [aClerkId, bClerkId]));
  const emailOf = new Map(profiles.map((p) => [p.clerkId, p.email?.toLowerCase() ?? ""]));
  const aEmail = emailOf.get(aClerkId) ?? "";
  const bEmail = emailOf.get(bClerkId) ?? "";

  const matchDirection = (ownerId: string, otherId: string, otherEmail: string) =>
    and(
      eq(contactsTable.ownerClerkId, ownerId),
      eq(contactsTable.isBlocked, true),
      otherEmail
        ? or(
            eq(contactsTable.contactClerkId, otherId),
            eq(sql`lower(${contactsTable.email})`, otherEmail),
          )
        : eq(contactsTable.contactClerkId, otherId),
    );

  const row = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(or(matchDirection(aClerkId, bClerkId, bEmail), matchDirection(bClerkId, aClerkId, aEmail)))
    .limit(1)
    .then((r) => r[0]);

  return !!row;
}

/**
 * Returns the subset of `recipientIds` that have muted `senderClerkId` in
 * their contacts. Matching follows the same contactClerkId + email fallback
 * as blocking.
 */
export async function mutedRecipients(senderClerkId: string, recipientIds: string[]): Promise<Set<string>> {
  if (!senderClerkId || recipientIds.length === 0) return new Set();

  const senderProfile = await db
    .select({ email: userProfilesTable.email })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, senderClerkId))
    .then((r) => r[0]);
  const senderEmail = senderProfile?.email?.toLowerCase() ?? "";

  const rows = await db
    .select({ ownerClerkId: contactsTable.ownerClerkId })
    .from(contactsTable)
    .where(
      and(
        inArray(contactsTable.ownerClerkId, recipientIds),
        eq(contactsTable.isMuted, true),
        senderEmail
          ? or(
              eq(contactsTable.contactClerkId, senderClerkId),
              eq(sql`lower(${contactsTable.email})`, senderEmail),
            )
          : eq(contactsTable.contactClerkId, senderClerkId),
      ),
    );

  return new Set(rows.map((r) => r.ownerClerkId));
}

/** Filters out clerkIds that are in a block relation (either direction) with userId. */
export async function filterBlocked(userId: string, otherIds: string[]): Promise<string[]> {
  const results = await Promise.all(otherIds.map((id) => isBlockedBetween(userId, id)));
  return otherIds.filter((_, i) => !results[i]);
}
