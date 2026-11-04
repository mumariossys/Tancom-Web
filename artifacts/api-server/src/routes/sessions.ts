import { Router, type IRouter } from "express";
import { eq, and, gte, sql, isNull, desc } from "drizzle-orm";
import { db, userSessionsTable, contactsTable, notificationsTable, userProfilesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { clerkClient } from "@clerk/express";

const router: IRouter = Router();

async function linkContactsAndUpsertProfile(clerkId: string): Promise<void> {
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) return;

  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    primaryEmail.split("@")[0];

  // Determine role: product owner email always gets elevated
  const isProductOwnerEmail = primaryEmail.toLowerCase() === "mctoday18@gmail.com";

  // Upsert user profile
  await db
    .insert(userProfilesTable)
    .values({
      clerkId,
      email: primaryEmail,
      name: fullName,
      lastLoginAt: new Date(),
      role: isProductOwnerEmail ? "product_owner" : "user",
    })
    .onConflictDoUpdate({
      target: userProfilesTable.clerkId,
      set: {
        email: primaryEmail,
        name: fullName,
        lastLoginAt: new Date(),
        ...(isProductOwnerEmail ? { role: "product_owner" } : {}),
      },
    });

  // Find contacts that reference this email but haven't been linked yet
  const unlinked = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.email, primaryEmail), isNull(contactsTable.contactClerkId)));

  if (unlinked.length === 0) return;

  // Link them all
  await db
    .update(contactsTable)
    .set({ contactClerkId: clerkId })
    .where(and(eq(contactsTable.email, primaryEmail), isNull(contactsTable.contactClerkId)));

  // Notify each unique owner
  const uniqueOwners = [...new Set(unlinked.map((c) => c.ownerClerkId))];
  for (const ownerClerkId of uniqueOwners) {
    if (ownerClerkId === clerkId) continue; // don't notify yourself
    await db.insert(notificationsTable).values({
      clerkId: ownerClerkId,
      type: "contact_joined",
      title: `${fullName} joined TanCom!`,
      body: `${fullName} (${primaryEmail}) is now on TanCom. You can now message and call them directly.`,
    });
  }
}

router.post("/sessions/start", requireAuth, async (req, res): Promise<void> => {
  const clerkId = (req as any).userId as string;

  const [session] = await db
    .insert(userSessionsTable)
    .values({ clerkId, loginAt: new Date(), lastPingAt: new Date() })
    .returning();

  // Fire-and-forget: link contacts + upsert profile (don't block session response)
  linkContactsAndUpsertProfile(clerkId).catch(() => {});

  res.json({ sessionId: session.id });
});

router.post("/sessions/end", requireAuth, async (req, res): Promise<void> => {
  const clerkId = (req as any).userId as string;
  const body = req.body as { sessionId?: number } | undefined;
  const sessionId = body?.sessionId;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }

  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.id, sessionId), eq(userSessionsTable.clerkId, clerkId)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const logoutAt = new Date();
  const durationSeconds = Math.round(
    (logoutAt.getTime() - session.loginAt.getTime()) / 1000
  );

  await db
    .update(userSessionsTable)
    .set({ logoutAt, durationSeconds })
    .where(eq(userSessionsTable.id, sessionId));

  res.json({ success: true });
});

router.post("/sessions/ping", requireAuth, async (req, res): Promise<void> => {
  const clerkId = (req as any).userId as string;
  const body = req.body as { sessionId?: number } | undefined;
  const sessionId = body?.sessionId;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }

  await db
    .update(userSessionsTable)
    .set({ lastPingAt: new Date() })
    .where(
      and(
        eq(userSessionsTable.id, sessionId),
        eq(userSessionsTable.clerkId, clerkId)
      )
    );

  res.json({ success: true });
});

export default router;
