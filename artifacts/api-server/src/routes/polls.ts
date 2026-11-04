import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  pollsTable,
  pollVotesTable,
  chatParticipantsTable,
  chatMessagesTable,
  communityChannelsTable,
  communityMembersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

async function getAuthorizedRoomAccess(userId: string, chatRoomId: number) {
  const participant = await db
    .select({ clerkId: chatParticipantsTable.clerkId })
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, chatRoomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((rows) => rows[0]);
  if (!participant) return null;

  const channel = await db
    .select({
      communityId: communityChannelsTable.communityId,
      type: communityChannelsTable.type,
    })
    .from(communityChannelsTable)
    .where(eq(communityChannelsTable.chatRoomId, chatRoomId))
    .then((rows) => rows[0]);
  if (!channel) return { channel: null, membership: null };

  const membership = await db
    .select({ role: communityMembersTable.role })
    .from(communityMembersTable)
    .where(and(
      eq(communityMembersTable.communityId, channel.communityId),
      eq(communityMembersTable.clerkId, userId),
    ))
    .then((rows) => rows[0]);
  if (!membership) return null;
  return { channel, membership };
}

// ── Create poll ────────────────────────────────────────────────────────────────
router.post("/polls", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { chatRoomId, question, options, allowMultiple, endsAt } = req.body as {
    chatRoomId?: number;
    question?: string;
    options?: string[];
    allowMultiple?: boolean;
    endsAt?: string;
  };

  if (!chatRoomId || !question?.trim() || !Array.isArray(options) || options.length < 2) {
    res.status(400).json({ error: "chatRoomId, question, and at least 2 options required" });
    return;
  }

  const roomAccess = await getAuthorizedRoomAccess(userId, chatRoomId);
  if (!roomAccess) { res.status(403).json({ error: "Not a member" }); return; }
  if (roomAccess.channel?.type === "announcement") {
    if (roomAccess.membership?.role !== "owner" && roomAccess.membership?.role !== "admin") {
      res.status(403).json({ error: "Only community admins can post announcements" });
      return;
    }
  }

  const [poll] = await db
    .insert(pollsTable)
    .values({
      chatRoomId,
      creatorClerkId: userId,
      question: question.trim(),
      options: options.map((o) => o.trim()).filter(Boolean),
      allowMultiple: allowMultiple ?? false,
      endsAt: endsAt ? new Date(endsAt) : null,
    })
    .returning();

  // Create a message in the chat room for this poll
  const [msg] = await db
    .insert(chatMessagesTable)
    .values({
      roomId: chatRoomId,
      senderClerkId: userId,
      messageType: "poll",
      pollId: poll.id,
      content: `📊 Poll: ${question.trim()}`,
    })
    .returning();

  res.status(201).json({
    id: poll.id,
    messageId: msg.id,
    chatRoomId: poll.chatRoomId,
    question: poll.question,
    options: poll.options,
    allowMultiple: poll.allowMultiple,
    endsAt: poll.endsAt?.toISOString() ?? null,
    votes: [],
    userVotes: [],
    createdAt: poll.createdAt.toISOString(),
  });
});

// ── Get poll ───────────────────────────────────────────────────────────────────
router.get("/polls/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const poll = await db
    .select()
    .from(pollsTable)
    .where(eq(pollsTable.id, id))
    .then((r) => r[0]);
  if (!poll) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await getAuthorizedRoomAccess(userId, poll.chatRoomId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  const votes = await db
    .select()
    .from(pollVotesTable)
    .where(eq(pollVotesTable.pollId, id));

  const options = poll.options as string[];
  const voteCounts = options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);
  const userVotes = votes.filter((v) => v.clerkId === userId).map((v) => v.optionIndex);

  res.json({
    id: poll.id,
    chatRoomId: poll.chatRoomId,
    question: poll.question,
    options: poll.options,
    allowMultiple: poll.allowMultiple,
    endsAt: poll.endsAt?.toISOString() ?? null,
    voteCounts,
    totalVotes: votes.length,
    userVotes,
    createdAt: poll.createdAt.toISOString(),
  });
});

// ── Vote ───────────────────────────────────────────────────────────────────────
router.post("/polls/:id/vote", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const poll = await db
    .select()
    .from(pollsTable)
    .where(eq(pollsTable.id, id))
    .then((r) => r[0]);
  if (!poll) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await getAuthorizedRoomAccess(userId, poll.chatRoomId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  const options = poll.options as string[];
  const { optionIndex } = req.body as { optionIndex?: number };
  if (optionIndex === undefined || optionIndex < 0 || optionIndex >= options.length) {
    res.status(400).json({ error: "Invalid optionIndex" }); return;
  }

  // Remove previous votes if not allowMultiple
  if (!poll.allowMultiple) {
    await db.delete(pollVotesTable).where(
      and(eq(pollVotesTable.pollId, id), eq(pollVotesTable.clerkId, userId))
    );
  } else {
    // Check for duplicate vote on same option
    const existing = await db
      .select()
      .from(pollVotesTable)
      .where(
        and(
          eq(pollVotesTable.pollId, id),
          eq(pollVotesTable.clerkId, userId),
          eq(pollVotesTable.optionIndex, optionIndex)
        )
      )
      .then((r) => r[0]);
    if (existing) {
      // Toggle off
      await db.delete(pollVotesTable).where(eq(pollVotesTable.id, existing.id));
      const allVotes = await db.select().from(pollVotesTable).where(eq(pollVotesTable.pollId, id));
      const voteCounts = options.map((_, i) => allVotes.filter((v) => v.optionIndex === i).length);
      const userVotes = allVotes.filter((v) => v.clerkId === userId).map((v) => v.optionIndex);
      res.json({ voteCounts, totalVotes: allVotes.length, userVotes });
      return;
    }
  }

  await db.insert(pollVotesTable).values({ pollId: id, optionIndex, clerkId: userId });

  const allVotes = await db.select().from(pollVotesTable).where(eq(pollVotesTable.pollId, id));
  const voteCounts = options.map((_, i) => allVotes.filter((v) => v.optionIndex === i).length);
  const userVotes = allVotes.filter((v) => v.clerkId === userId).map((v) => v.optionIndex);
  res.json({ voteCounts, totalVotes: allVotes.length, userVotes });
});

export default router;
