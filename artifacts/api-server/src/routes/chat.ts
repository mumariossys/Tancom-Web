import { Router, type IRouter } from "express";
import { eq, and, desc, lt, sql, inArray, ilike, or } from "drizzle-orm";
import {
  db,
  chatRoomsTable,
  chatParticipantsTable,
  chatMessagesTable,
  chatReactionsTable,
  chatConversationKeysTable,
  userProfilesTable,
  notificationsTable,
  groupsTable,
  groupMembersTable,
  communityChannelsTable,
  communityMembersTable,
} from "@workspace/db";
import { CreateChatRoomBody, SendChatMessageBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { isBlockedBetween, mutedRecipients } from "../lib/blocking";
import { ensureGroupChatRoom, ensureParticipant } from "../lib/chatHelpers";

const router: IRouter = Router();

function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

function serializeMessage(m: typeof chatMessagesTable.$inferSelect, senderName: string) {
  return {
    id: m.id,
    roomId: m.roomId,
    senderClerkId: m.senderClerkId,
    senderName,
    content: m.content ?? null,
    encryptedIv: m.encryptedIv ?? null,
    messageType: m.messageType,
    pollId: m.pollId ?? null,
    pinned: m.pinned,
    fileObjectPath: m.fileObjectPath ?? null,
    fileName: m.fileName ?? null,
    fileMimeType: m.fileMimeType ?? null,
    fileSizeBytes: m.fileSizeBytes ?? null,
    replyToId: m.replyToId ?? null,
    replyToContent: m.replyToContent ?? null,
    replyToSenderName: m.replyToSenderName ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

// ── List chat rooms ────────────────────────────────────────────────────────────
router.get("/chat/rooms", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  // ── Auto-sync group chat rooms ─────────────────────────────────────────────
  // Find all groups this user belongs to (owns or is an accepted member of)
  const [ownedGroups, memberGroupRows] = await Promise.all([
    db.select().from(groupsTable).where(eq(groupsTable.ownerClerkId, userId)),
    db.select().from(groupMembersTable).where(
      and(
        eq(groupMembersTable.invitedClerkId, userId),
        eq(groupMembersTable.invitationStatus, "accepted"),
      ),
    ),
  ]);

  const ownedIds = new Set(ownedGroups.map((g) => g.id));
  const joinedGroupIds = memberGroupRows
    .filter((r) => !ownedIds.has(r.groupId))
    .map((r) => r.groupId);

  const joinedGroups = joinedGroupIds.length > 0
    ? await db.select().from(groupsTable).where(inArray(groupsTable.id, joinedGroupIds))
    : [];

  const allGroups = [...ownedGroups, ...joinedGroups];

  // For each group, ensure a chat room exists and this user is a participant
  if (allGroups.length > 0) {
    await Promise.all(
      allGroups.map(async (group) => {
        const room = await ensureGroupChatRoom(group.id, group.name);
        await ensureParticipant(room.id, userId);
      }),
    );
  }

  // ── Fetch all rooms the user participates in ───────────────────────────────
  const participations = await db
    .select()
    .from(chatParticipantsTable)
    .where(eq(chatParticipantsTable.clerkId, userId));

  if (participations.length === 0) {
    res.json([]);
    return;
  }

  const roomIds = participations.map((p) => p.roomId);
  const rooms = await db
    .select()
    .from(chatRoomsTable)
    .where(inArray(chatRoomsTable.id, roomIds));

  // Exclude community channel rooms (handled via community channels)
  const filteredRooms = rooms.filter((r) => !r.communityId);

  const result = await Promise.all(
    filteredRooms.map(async (room) => {
      const [lastMsg] = await db
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.roomId, room.id))
        .orderBy(desc(chatMessagesTable.createdAt))
        .limit(1);

      let name = room.name ?? "";
      let otherLastSeenAt: string | null = null;
      let otherOnline = false;
      if (room.type === "direct") {
        const otherParticipant = await db
          .select()
          .from(chatParticipantsTable)
          .where(
            and(
              eq(chatParticipantsTable.roomId, room.id),
              sql`${chatParticipantsTable.clerkId} != ${userId}`
            )
          )
          .limit(1)
          .then((rows) => rows[0]);

        if (otherParticipant) {
          const profile = await db
            .select()
            .from(userProfilesTable)
            .where(eq(userProfilesTable.clerkId, otherParticipant.clerkId))
            .then((rows) => rows[0]);
          name = profile?.name ?? "Unknown";
          if (profile?.lastSeenAt) {
            otherLastSeenAt = profile.lastSeenAt.toISOString();
            otherOnline = Date.now() - profile.lastSeenAt.getTime() < 90_000;
          }
        }
      }

      const myParticipation = participations.find((p) => p.roomId === room.id);

      return {
        id: room.id,
        type: room.type,
        name,
        groupId: room.groupId ?? null,
        lastMessage: lastMsg
          ? lastMsg.messageType === "contact"
            ? "👤 Contact card"
            : lastMsg.content ?? (lastMsg.fileName ? `📎 ${lastMsg.fileName}` : null)
          : null,
        lastMessageAt: lastMsg?.createdAt.toISOString() ?? null,
        unreadCount: 0,
        archived: myParticipation?.archived ?? false,
        otherLastSeenAt,
        otherOnline,
        createdAt: room.createdAt.toISOString(),
      };
    })
  );

  result.sort((a, b) => {
    const ta = a.lastMessageAt ?? a.createdAt;
    const tb = b.lastMessageAt ?? b.createdAt;
    return tb.localeCompare(ta);
  });

  res.json(result);
});

// ── Create / open a chat room ──────────────────────────────────────────────────
router.post("/chat/rooms", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const parsed = CreateChatRoomBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const body = parsed.data;

  if (body.type === "direct") {
    let targetId = body.targetClerkId;

    // Allow callers to supply an email address and look up the clerkId
    const targetEmail = (req.body as any).targetEmail as string | undefined;
    if (!targetId && targetEmail) {
      const profile = await db
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.email, targetEmail.trim()))
        .then((rows) => rows[0]);
      if (!profile) {
        res.status(404).json({ error: "No user found with that email address" });
        return;
      }
      targetId = profile.clerkId;
    }

    if (!targetId) {
      res.status(400).json({ error: "targetClerkId or targetEmail required for direct rooms" });
      return;
    }

    // Block enforcement: no new direct conversations between blocked users.
    if (await isBlockedBetween(userId, targetId)) {
      res.status(403).json({ error: "You can't start a conversation with this user" });
      return;
    }

    const existing = await db.execute(sql`
      SELECT r.id FROM chat_rooms r
      JOIN chat_participants p1 ON p1.room_id = r.id AND p1.clerk_id = ${userId}
      JOIN chat_participants p2 ON p2.room_id = r.id AND p2.clerk_id = ${targetId}
      WHERE r.type = 'direct'
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      const existingId = (existing.rows[0] as any).id as number;
      const existingRoom = await db
        .select()
        .from(chatRoomsTable)
        .where(eq(chatRoomsTable.id, existingId))
        .then((rows) => rows[0]);

      const profile = await db
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.clerkId, targetId))
        .then((rows) => rows[0]);

      res.json({
        id: existingRoom.id,
        type: existingRoom.type,
        name: profile?.name ?? "Unknown",
        groupId: null,
        lastMessage: null,
        lastMessageAt: null,
        unreadCount: 0,
        createdAt: existingRoom.createdAt.toISOString(),
      });
      return;
    }

    const [room] = await db
      .insert(chatRoomsTable)
      .values({ type: "direct" })
      .returning();

    await db.insert(chatParticipantsTable).values([
      { roomId: room.id, clerkId: userId },
      { roomId: room.id, clerkId: targetId },
    ]);

    const profile = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, targetId))
      .then((rows) => rows[0]);

    res.json({
      id: room.id,
      type: room.type,
      name: profile?.name ?? "Unknown",
      groupId: null,
      lastMessage: null,
      lastMessageAt: null,
      unreadCount: 0,
      createdAt: room.createdAt.toISOString(),
    });
    return;
  }

  const roomName = body.name ?? "Group Chat";
  const [room] = await db
    .insert(chatRoomsTable)
    .values({ type: "group", groupId: body.groupId ?? null, name: roomName })
    .returning();

  await db.insert(chatParticipantsTable).values({ roomId: room.id, clerkId: userId });

  const addedClerkIds = new Set<string>([userId]);

  // Add members by clerkId directly (preferred — no email lookup needed)
  const memberClerkIds: string[] = (req.body as Record<string, unknown>).memberClerkIds as string[] ?? [];
  for (const clerkId of memberClerkIds) {
    if (!clerkId || addedClerkIds.has(clerkId)) continue;
    addedClerkIds.add(clerkId);
    await db.insert(chatParticipantsTable).values({ roomId: room.id, clerkId });
  }

  // Add members by email (fallback for non-contact invites)
  const memberEmails: string[] = (req.body as Record<string, unknown>).memberEmails as string[] ?? [];
  for (const email of memberEmails) {
    const profile = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.email, email.trim()))
      .then((r) => r[0]);
    if (profile && !addedClerkIds.has(profile.clerkId)) {
      addedClerkIds.add(profile.clerkId);
      await db.insert(chatParticipantsTable).values({ roomId: room.id, clerkId: profile.clerkId });
    }
  }

  res.json({
    id: room.id,
    type: room.type,
    name: roomName,
    groupId: room.groupId ?? null,
    lastMessage: null,
    lastMessageAt: null,
    unreadCount: 0,
    createdAt: room.createdAt.toISOString(),
  });
});

// ── Search messages ────────────────────────────────────────────────────────────
router.get("/chat/search", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const q = String(req.query.q ?? "").trim();
  if (!q) { res.json([]); return; }

  const participations = await db
    .select()
    .from(chatParticipantsTable)
    .where(eq(chatParticipantsTable.clerkId, userId));

  if (participations.length === 0) { res.json([]); return; }

  const roomIds = participations.map((p) => p.roomId);
  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(
      and(
        inArray(chatMessagesTable.roomId, roomIds),
        ilike(chatMessagesTable.content, `%${q}%`)
      )
    )
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(50);

  const senderIds = [...new Set(messages.map((m) => m.senderClerkId))];
  const profiles = senderIds.length
    ? await db.select().from(userProfilesTable).where(inArray(userProfilesTable.clerkId, senderIds))
    : [];
  const nameMap = new Map(profiles.map((p) => [p.clerkId, p.name]));

  res.json(messages.map((m) => serializeMessage(m, nameMap.get(m.senderClerkId) ?? "Unknown")));
});

// ── List messages ──────────────────────────────────────────────────────────────
router.get("/chat/rooms/:roomId/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params.roomId), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((rows) => rows[0]);
  if (!participant) { res.status(403).json({ error: "Not a member of this room" }); return; }

  const limitVal = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const beforeId = req.query.before ? parseInt(String(req.query.before), 10) : undefined;

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(
      beforeId !== undefined
        ? and(eq(chatMessagesTable.roomId, roomId), lt(chatMessagesTable.id, beforeId))
        : eq(chatMessagesTable.roomId, roomId)
    )
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limitVal);

  const senderIds = [...new Set(messages.map((m) => m.senderClerkId))];
  const profiles = senderIds.length
    ? await db.select().from(userProfilesTable).where(inArray(userProfilesTable.clerkId, senderIds))
    : [];
  const nameMap = new Map(profiles.map((p) => [p.clerkId, p.name]));

  res.json(messages.map((m) => serializeMessage(m, nameMap.get(m.senderClerkId) ?? "Unknown")));
});

// ── Send message ───────────────────────────────────────────────────────────────
router.post("/chat/rooms/:roomId/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params.roomId), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((rows) => rows[0]);
  if (!participant) { res.status(403).json({ error: "Not a member of this room" }); return; }

  // Block enforcement: no messages in a direct room where either side blocked the other.
  const roomInfo = await db
    .select({ type: chatRoomsTable.type })
    .from(chatRoomsTable)
    .where(eq(chatRoomsTable.id, roomId))
    .then((rows) => rows[0]);
  if (roomInfo?.type === "direct") {
    const otherMember = await db
      .select({ clerkId: chatParticipantsTable.clerkId })
      .from(chatParticipantsTable)
      .where(and(eq(chatParticipantsTable.roomId, roomId), sql`${chatParticipantsTable.clerkId} != ${userId}`))
      .then((rows) => rows[0]);
    if (otherMember && (await isBlockedBetween(userId, otherMember.clerkId))) {
      res.status(403).json({ error: "You can't message this user" });
      return;
    }
  }

  // Announcement channels are read-only for regular community members.  The
  // channel is identified by its chat room because all message writes enter
  // through this shared route.
  const announcementChannel = await db
    .select({
      communityId: communityChannelsTable.communityId,
      type: communityChannelsTable.type,
    })
    .from(communityChannelsTable)
    .where(eq(communityChannelsTable.chatRoomId, roomId))
    .then((rows) => rows[0]);
  if (announcementChannel?.type === "announcement") {
    const membership = await db
      .select({ role: communityMembersTable.role })
      .from(communityMembersTable)
      .where(
        and(
          eq(communityMembersTable.communityId, announcementChannel.communityId),
          eq(communityMembersTable.clerkId, userId),
        ),
      )
      .then((rows) => rows[0]);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      res.status(403).json({ error: "Only community admins can post announcements" });
      return;
    }
  }

  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const body = parsed.data;

  const rawBody = req.body as Record<string, unknown>;

  // Contact-card message: messageType "contact". Preferred path: the client
  // encrypts the card JSON with the conversation key and sends
  // { content: <ciphertext>, encryptedIv } like a normal E2EE message.
  // Plaintext fallback (rooms without E2EE): { contactCard: { name, email, ... } }.
  let messageType = "text";
  let contactCardContent: string | null = null;
  const rawEncryptedIv = body.encryptedIv ?? null;
  if (body.messageType === "contact") {
    messageType = "contact";
    if (rawEncryptedIv && body.content) {
      // Already encrypted client-side; store ciphertext as-is.
      contactCardContent = body.content;
    } else {
      const card = body.contactCard;
      if (!card || !card.name.trim()) {
        res.status(400).json({ error: "contactCard with name and email is required" });
        return;
      }
      // Strict email format check (Zod .email() already ran, but be explicit)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(card.email.trim())) {
        res.status(400).json({ error: "contactCard.email must be a valid email address" });
        return;
      }
      // If contactClerkId is supplied, verify the user actually exists
      if (card.contactClerkId) {
        const exists = await db
          .select({ clerkId: userProfilesTable.clerkId })
          .from(userProfilesTable)
          .where(eq(userProfilesTable.clerkId, card.contactClerkId))
          .then((rows) => rows[0]);
        if (!exists) {
          res.status(400).json({ error: "contactCard.contactClerkId does not match any known user" });
          return;
        }
      }
      contactCardContent = JSON.stringify({
        name: card.name.trim(),
        email: card.email.trim(),
        phone: card.phone?.trim() ? card.phone.trim() : null,
        username: card.username?.trim() ? card.username.trim() : null,
        contactClerkId: card.contactClerkId ?? null,
      });
    }
  }

  if (messageType !== "contact" && !body.content && !body.fileObjectPath) {
    res.status(400).json({ error: "Message must have content or a file" });
    return;
  }
  const replyToId = typeof rawBody["replyToId"] === "number" ? rawBody["replyToId"] : null;
  const replyToContent = typeof rawBody["replyToContent"] === "string" ? rawBody["replyToContent"] : null;
  const replyToSenderName = typeof rawBody["replyToSenderName"] === "string" ? rawBody["replyToSenderName"] : null;
  const encryptedIv = rawEncryptedIv;

  const [msg] = await db
    .insert(chatMessagesTable)
    .values({
      roomId,
      senderClerkId: userId,
      content: messageType === "contact" ? contactCardContent : (body.content ?? null),
      messageType,
      encryptedIv,
      fileObjectPath: body.fileObjectPath ?? null,
      fileName: body.fileName ?? null,
      fileMimeType: body.fileMimeType ?? null,
      fileSizeBytes: body.fileSizeBytes ?? null,
      replyToId,
      replyToContent,
      replyToSenderName,
    })
    .returning();

  const profile = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then((rows) => rows[0]);

  // Notify other participants
  const others = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId)));
  // Mute enforcement: recipients who muted the sender get no notification
  const recipientIds = others.map((p) => p.clerkId).filter((id) => id !== userId);
  const muted = await mutedRecipients(userId, recipientIds);
  for (const p of others) {
    if (p.clerkId !== userId && !muted.has(p.clerkId)) {
      await db.insert(notificationsTable).values({
        clerkId: p.clerkId,
        type: "message",
        title: `New message from ${profile?.name ?? "Someone"}`,
        body: messageType === "contact"
          ? "👤 Shared a contact"
          : (body.content?.slice(0, 80) ?? (body.fileName ? `📎 ${body.fileName}` : "")),
        relatedId: roomId,
        relatedType: "room",
      });
    }
  }

  res.status(201).json(serializeMessage(msg, profile?.name ?? "Unknown"));
});

// ── Archive / unarchive a room (per participant) ──────────────────────────────
router.patch("/chat/rooms/:roomId/archive", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params.roomId), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const archived = (req.body as { archived?: unknown })?.archived;
  if (typeof archived !== "boolean") {
    res.status(400).json({ error: "archived boolean is required" });
    return;
  }

  const [updated] = await db
    .update(chatParticipantsTable)
    .set({ archived })
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not a member of this room" }); return; }
  res.json({ archived: updated.archived });
});

// ── Delete message ─────────────────────────────────────────────────────────────
router.delete("/chat/rooms/:roomId/messages/:messageId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params.roomId), 10);
  const messageId = parseInt(paramStr(req.params.messageId), 10);
  if (isNaN(roomId) || isNaN(messageId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const msg = await db
    .select()
    .from(chatMessagesTable)
    .where(and(eq(chatMessagesTable.id, messageId), eq(chatMessagesTable.roomId, roomId)))
    .then((r) => r[0]);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }

  // Allow sender or room members who are also community admins
  if (msg.senderClerkId !== userId) {
    res.status(403).json({ error: "Cannot delete others' messages" });
    return;
  }

  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, messageId));
  res.json({ ok: true });
});

// ── Pin / unpin message ────────────────────────────────────────────────────────
router.post("/chat/rooms/:roomId/messages/:messageId/pin", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params.roomId), 10);
  const messageId = parseInt(paramStr(req.params.messageId), 10);
  if (isNaN(roomId) || isNaN(messageId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((r) => r[0]);
  if (!participant) { res.status(403).json({ error: "Not a member" }); return; }

  const msg = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.id, messageId))
    .then((r) => r[0]);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(chatMessagesTable).set({ pinned: !msg.pinned }).where(eq(chatMessagesTable.id, messageId));
  res.json({ pinned: !msg.pinned });
});

// ── Add a member to a group room ───────────────────────────────────────────────
router.post("/chat/rooms/:roomId/members", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params.roomId), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((r) => r[0]);
  if (!participant) { res.status(403).json({ error: "Not a member of this room" }); return; }

  const room = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).then((r) => r[0]);
  if (!room || room.type !== "group") { res.status(400).json({ error: "Can only add members to group rooms" }); return; }

  const { email, clerkId: directClerkId } = req.body as { email?: string; clerkId?: string };

  let targetClerkId: string;
  let memberName: string;
  let memberEmail: string;

  if (directClerkId?.trim()) {
    // Preferred path: add by clerkId directly (no email lookup needed)
    targetClerkId = directClerkId.trim();
    const profile = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, targetClerkId))
      .then((r) => r[0]);
    memberName = profile?.name ?? "Unknown User";
    memberEmail = profile?.email ?? "";
  } else if (email?.trim()) {
    // Fallback path: look up by email
    const profile = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.email, email.trim()))
      .then((r) => r[0]);
    if (!profile) { res.status(404).json({ error: "No TanCom user found with that email. Ask them to sign in to TanCom first." }); return; }
    targetClerkId = profile.clerkId;
    memberName = profile.name;
    memberEmail = profile.email;
  } else {
    res.status(400).json({ error: "clerkId or email required" }); return;
  }

  if (targetClerkId === userId) { res.status(400).json({ error: "Cannot add yourself" }); return; }

  const existing = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, targetClerkId)))
    .then((r) => r[0]);
  if (existing) {
    res.json({ clerkId: targetClerkId, name: memberName, email: memberEmail });
    return;
  }

  await db.insert(chatParticipantsTable).values({ roomId, clerkId: targetClerkId });
  res.status(201).json({ clerkId: targetClerkId, name: memberName, email: memberEmail });
});

// ── Remove a member from a group room ─────────────────────────────────────────
router.delete("/chat/rooms/:roomId/members/:targetClerkId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params.roomId), 10);
  const targetClerkId = paramStr(req.params.targetClerkId);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((r) => r[0]);
  if (!participant) { res.status(403).json({ error: "Not a member of this room" }); return; }

  const room = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).then((r) => r[0]);
  if (!room || room.type !== "group") { res.status(400).json({ error: "Can only remove members from group rooms" }); return; }

  await db
    .delete(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, targetClerkId)));

  res.json({ ok: true });
});

// ── List room members ──────────────────────────────────────────────────────────
router.get("/chat/rooms/:roomId/members", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params.roomId), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((rows) => rows[0]);
  if (!participant) { res.status(403).json({ error: "Not a member of this room" }); return; }

  const participants = await db
    .select()
    .from(chatParticipantsTable)
    .where(eq(chatParticipantsTable.roomId, roomId));

  const clerkIds = participants.map((p) => p.clerkId);
  const profiles = clerkIds.length
    ? await db.select().from(userProfilesTable).where(inArray(userProfilesTable.clerkId, clerkIds))
    : [];

  const profileMap = new Map(profiles.map((p) => [p.clerkId, p]));

  res.json(
    participants.map((p) => {
      const profile = profileMap.get(p.clerkId);
      return {
        clerkId: p.clerkId,
        name: profile?.name ?? "Unknown User",
        email: profile?.email ?? "",
      };
    })
  );
});

// ── Reactions: GET all reactions for a room ────────────────────────────────────
// Returns: { [messageId]: { [emoji]: { count, reacted } } }
router.get("/chat/rooms/:roomId/reactions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params["roomId"] ?? ""), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid room id" }); return; }

  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((rows) => rows[0]);
  if (!participant) { res.status(403).json({ error: "Not a member" }); return; }

  // Get all reactions for messages in this room
  const rows = await db
    .select({ messageId: chatReactionsTable.messageId, emoji: chatReactionsTable.emoji, clerkId: chatReactionsTable.clerkId })
    .from(chatReactionsTable)
    .innerJoin(chatMessagesTable, eq(chatReactionsTable.messageId, chatMessagesTable.id))
    .where(eq(chatMessagesTable.roomId, roomId));

  // Aggregate: { messageId -> { emoji -> { count, reacted } } }
  const result: Record<number, Record<string, { count: number; reacted: boolean }>> = {};
  for (const row of rows) {
    if (!result[row.messageId]) result[row.messageId] = {};
    if (!result[row.messageId][row.emoji]) result[row.messageId][row.emoji] = { count: 0, reacted: false };
    result[row.messageId][row.emoji].count += 1;
    if (row.clerkId === userId) result[row.messageId][row.emoji].reacted = true;
  }

  res.json(result);
});

// ── Reactions: toggle (add if absent, remove if present) ─────────────────────
router.post("/chat/rooms/:roomId/messages/:msgId/reactions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params["roomId"] ?? ""), 10);
  const msgId = parseInt(paramStr(req.params["msgId"] ?? ""), 10);
  const { emoji } = req.body as { emoji?: string };

  if (isNaN(roomId) || isNaN(msgId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!emoji || emoji.trim().length === 0) { res.status(400).json({ error: "Emoji required" }); return; }

  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((rows) => rows[0]);
  if (!participant) { res.status(403).json({ error: "Not a member" }); return; }

  // Check if reaction already exists
  const existing = await db
    .select()
    .from(chatReactionsTable)
    .where(and(
      eq(chatReactionsTable.messageId, msgId),
      eq(chatReactionsTable.clerkId, userId),
      eq(chatReactionsTable.emoji, emoji.trim()),
    ))
    .then((rows) => rows[0]);

  if (existing) {
    await db.delete(chatReactionsTable).where(eq(chatReactionsTable.id, existing.id));
    res.json({ action: "removed", emoji: emoji.trim() });
  } else {
    await db.insert(chatReactionsTable).values({ messageId: msgId, clerkId: userId, emoji: emoji.trim() });
    res.json({ action: "added", emoji: emoji.trim() });
  }
});

// ── E2EE: list member public keys ──────────────────────────────────────────────
router.get("/chat/rooms/:roomId/member-keys", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params["roomId"] ?? ""), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const participant = await db
    .select().from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((rows) => rows[0]);
  if (!participant) { res.status(403).json({ error: "Not a member" }); return; }

  const participants = await db
    .select().from(chatParticipantsTable)
    .where(eq(chatParticipantsTable.roomId, roomId));

  const clerkIds = participants.map((p) => p.clerkId);
  const profiles = await db
    .select({ clerkId: userProfilesTable.clerkId, publicKey: userProfilesTable.publicKey })
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.clerkId, clerkIds));

  const keyMap = new Map(profiles.map((p) => [p.clerkId, p.publicKey ?? null]));
  res.json(clerkIds.map((id) => ({ clerkId: id, publicKey: keyMap.get(id) ?? null })));
});

// ── E2EE: get my encrypted conversation key ────────────────────────────────────
router.get("/chat/rooms/:roomId/e2e-key", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params["roomId"] ?? ""), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const row = await db
    .select().from(chatConversationKeysTable)
    .where(and(
      eq(chatConversationKeysTable.roomId, roomId),
      eq(chatConversationKeysTable.clerkId, userId),
    ))
    .then((rows) => rows[0]);

  if (!row) { res.status(404).json({ error: "No key" }); return; }
  res.json({ encryptedKey: row.encryptedKey, iv: row.iv, ephemeralPublicKey: row.ephemeralPublicKey });
});

// ── E2EE: store encrypted conversation keys for all participants ────────────────
router.post("/chat/rooms/:roomId/e2e-key", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const roomId = parseInt(paramStr(req.params["roomId"] ?? ""), 10);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const participant = await db
    .select().from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((rows) => rows[0]);
  if (!participant) { res.status(403).json({ error: "Not a member" }); return; }

  const bundles = req.body as Array<{ clerkId: string; encryptedKey: string; iv: string; ephemeralPublicKey: string }>;
  if (!Array.isArray(bundles) || bundles.length === 0) {
    res.status(400).json({ error: "Body must be a non-empty array of key bundles" });
    return;
  }

  for (const b of bundles) {
    if (!b.clerkId || !b.encryptedKey || !b.iv || !b.ephemeralPublicKey) {
      res.status(400).json({ error: "Each bundle needs clerkId, encryptedKey, iv, ephemeralPublicKey" });
      return;
    }
    // Upsert: delete existing then insert
    await db.delete(chatConversationKeysTable).where(
      and(eq(chatConversationKeysTable.roomId, roomId), eq(chatConversationKeysTable.clerkId, b.clerkId)),
    );
    await db.insert(chatConversationKeysTable).values({
      roomId,
      clerkId: b.clerkId,
      encryptedKey: b.encryptedKey,
      iv: b.iv,
      ephemeralPublicKey: b.ephemeralPublicKey,
    });
  }

  res.json({ ok: true });
});

export default router;
