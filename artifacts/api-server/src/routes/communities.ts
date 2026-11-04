import { Router, type IRouter } from "express";
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import {
  db,
  communitiesTable,
  communityMembersTable,
  communityChannelsTable,
  communityEventsTable,
  communityEventRsvpsTable,
  communityGroupsTable,
  communityGroupMembersTable,
  chatRoomsTable,
  chatParticipantsTable,
  userProfilesTable,
  notificationsTable,
  groupsTable,
  groupMembersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { randomBytes } from "crypto";

const router: IRouter = Router();

function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

function generateInviteCode(): string {
  return randomBytes(6).toString("hex");
}

/** Insert a chat participant, falling back to a raw INSERT if the `archived`
 *  column is missing in production (schema not yet republished). */
async function insertChatParticipantSafe(roomId: number, clerkId: string) {
  try {
    await db.insert(chatParticipantsTable).values({ roomId, clerkId });
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes('column "archived"')) {
      await db.execute(
        sql`INSERT INTO chat_participants (room_id, clerk_id) VALUES (${roomId}, ${clerkId})`
      );
    } else {
      throw err;
    }
  }
}

/** Keep community membership and its backing chat-room membership in sync. */
async function revokeCommunityChannelAccess(communityId: number, clerkId: string) {
  const channelRooms = await db
    .select({ chatRoomId: communityChannelsTable.chatRoomId })
    .from(communityChannelsTable)
    .where(eq(communityChannelsTable.communityId, communityId));
  const roomIds = channelRooms
    .map((channel) => channel.chatRoomId)
    .filter((roomId): roomId is number => roomId !== null);
  if (roomIds.length) {
    await db.delete(chatParticipantsTable).where(
      and(
        inArray(chatParticipantsTable.roomId, roomIds),
        eq(chatParticipantsTable.clerkId, clerkId),
      ),
    );
  }
}

async function getCommunityWithMembership(communityId: number, clerkId: string) {
  const community = await db
    .select()
    .from(communitiesTable)
    .where(eq(communitiesTable.id, communityId))
    .then((r) => r[0]);
  if (!community) return { community: null, member: null };

  const member = await db
    .select()
    .from(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.communityId, communityId),
        eq(communityMembersTable.clerkId, clerkId)
      )
    )
    .then((r) => r[0] ?? null);

  return { community, member };
}

// ── List communities for current user ─────────────────────────────────────────
router.get("/communities", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const memberships = await db
    .select()
    .from(communityMembersTable)
    .where(eq(communityMembersTable.clerkId, userId));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const communityIds = memberships.map((m) => m.communityId);
  const communities = await Promise.all(
    communityIds.map(async (cid) => {
      const community = await db
        .select()
        .from(communitiesTable)
        .where(eq(communitiesTable.id, cid))
        .then((r) => r[0]);
      if (!community) return null;
      const memberCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(communityMembersTable)
        .where(eq(communityMembersTable.communityId, cid))
        .then((r) => Number(r[0]?.count ?? 0));
      const membership = memberships.find((m) => m.communityId === cid);
      return {
        id: community.id,
        name: community.name,
        description: community.description ?? null,
        iconUrl: community.iconUrl ?? null,
        ownerId: community.ownerId,
        inviteCode: community.inviteCode,
        isPublic: community.isPublic,
        memberCount,
        role: membership?.role ?? "member",
        createdAt: community.createdAt.toISOString(),
      };
    })
  );

  res.json(communities.filter(Boolean));
});

// ── Create community ───────────────────────────────────────────────────────────
router.post("/communities", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const inviteCode = generateInviteCode();
    const [community] = await db
      .insert(communitiesTable)
      .values({ name: name.trim(), description: description?.trim() ?? null, ownerId: userId, inviteCode })
      .returning();

    await db.insert(communityMembersTable).values({
      communityId: community.id,
      clerkId: userId,
      role: "owner",
    });

    // Create default #general text channel
    const [room] = await db
      .insert(chatRoomsTable)
      .values({ type: "group", communityId: community.id, name: "general" })
      .returning();

    await insertChatParticipantSafe(room.id, userId);

    await db.insert(communityChannelsTable).values({
      communityId: community.id,
      chatRoomId: room.id,
      name: "general",
      type: "text",
      position: 0,
      isDefault: true,
    });

    res.status(201).json({
      id: community.id,
      name: community.name,
      description: community.description ?? null,
      iconUrl: community.iconUrl ?? null,
      ownerId: community.ownerId,
      inviteCode: community.inviteCode,
      isPublic: community.isPublic,
      memberCount: 1,
      role: "owner",
      createdAt: community.createdAt.toISOString(),
    });
  } catch (err: any) {
    console.error("Create community error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to create community" });
  }
});

// ── Get community by id ────────────────────────────────────────────────────────
router.get("/communities/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const memberCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(communityMembersTable)
    .where(eq(communityMembersTable.communityId, id))
    .then((r) => Number(r[0]?.count ?? 0));

  res.json({
    id: community.id,
    name: community.name,
    description: community.description ?? null,
    iconUrl: community.iconUrl ?? null,
    ownerId: community.ownerId,
    inviteCode: community.inviteCode,
    isPublic: community.isPublic,
    memberCount,
    role: member.role,
    createdAt: community.createdAt.toISOString(),
  });
});

// ── Update community ───────────────────────────────────────────────────────────
router.patch("/communities/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { name, description } = req.body as { name?: string; description?: string };
  await db
    .update(communitiesTable)
    .set({
      ...(name ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description.trim() || null } : {}),
    })
    .where(eq(communitiesTable.id, id));

  res.json({ ok: true });
});

// ── Delete community ───────────────────────────────────────────────────────────
router.delete("/communities/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || member.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }

  await db.delete(communitiesTable).where(eq(communitiesTable.id, id));
  res.json({ ok: true });
});

// ── Get community members ──────────────────────────────────────────────────────
router.get("/communities/:id/members", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const members = await db
    .select()
    .from(communityMembersTable)
    .where(eq(communityMembersTable.communityId, id))
    .orderBy(communityMembersTable.joinedAt);

  const clerkIds = members.map((m) => m.clerkId);
  const profiles = clerkIds.length
    ? await db
        .select()
        .from(userProfilesTable)
        .where(inArray(userProfilesTable.clerkId, clerkIds))
    : [];
  const profileMap = new Map(profiles.map((p) => [p.clerkId, p]));

  res.json(
    members.map((m) => {
      const profile = profileMap.get(m.clerkId);
      return {
        id: m.id,
        clerkId: m.clerkId,
        name: profile?.name ?? "Unknown",
        email: profile?.email ?? "",
        role: m.role,
        customTags: m.customTags ?? [],
        joinedAt: m.joinedAt.toISOString(),
      };
    })
  );
});

// ── Update member role ─────────────────────────────────────────────────────────
router.patch("/communities/:id/members/:clerkId/role", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const targetClerkId = paramStr(req.params.clerkId);

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { role } = req.body as { role?: string };
  if (!role || !["admin", "member"].includes(role)) {
    res.status(400).json({ error: "role must be admin or member" }); return;
  }

  await db
    .update(communityMembersTable)
    .set({ role: role as "admin" | "member" })
    .where(
      and(
        eq(communityMembersTable.communityId, id),
        eq(communityMembersTable.clerkId, targetClerkId)
      )
    );

  res.json({ ok: true });
});

// ── Kick member ────────────────────────────────────────────────────────────────
router.delete("/communities/:id/members/:clerkId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const targetClerkId = paramStr(req.params.clerkId);

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }

  if (targetClerkId === userId) {
    // Leaving
    await db.delete(communityMembersTable).where(
      and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.clerkId, userId))
    );
    await revokeCommunityChannelAccess(id, userId);
    res.json({ ok: true });
    return;
  }

  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  await db.delete(communityMembersTable).where(
    and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.clerkId, targetClerkId))
  );
  await revokeCommunityChannelAccess(id, targetClerkId);
  res.json({ ok: true });
});

// ── Get channels ───────────────────────────────────────────────────────────────
router.get("/communities/:id/channels", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const channels = await db
    .select()
    .from(communityChannelsTable)
    .where(eq(communityChannelsTable.communityId, id))
    .orderBy(communityChannelsTable.position, communityChannelsTable.createdAt);

  res.json(
    channels.map((c) => ({
      id: c.id,
      communityId: c.communityId,
      chatRoomId: c.chatRoomId ?? null,
      name: c.name,
      type: c.type,
      description: c.description ?? null,
      position: c.position,
      isDefault: c.isDefault,
      createdAt: c.createdAt.toISOString(),
    }))
  );
});

// ── Create channel ─────────────────────────────────────────────────────────────
router.post("/communities/:id/channels", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { name, type, description } = req.body as { name?: string; type?: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name required" }); return; }

  const channelType = (["text", "voice", "announcement"].includes(type ?? "")
    ? type
    : "text") as "text" | "voice" | "announcement";

  let chatRoomId: number | null = null;
  if (channelType !== "voice") {
    const [room] = await db
      .insert(chatRoomsTable)
      .values({ type: "group", communityId: id, name: name.trim() })
      .returning();

    // Add all community members to the chat room
    const allMembers = await db
      .select()
      .from(communityMembersTable)
      .where(eq(communityMembersTable.communityId, id));
    if (allMembers.length > 0) {
      for (const m of allMembers) {
        await insertChatParticipantSafe(room.id, m.clerkId);
      }
    }
    chatRoomId = room.id;
  }

  const maxPositionResult = await db
    .select({ maxPos: sql<number>`coalesce(max(position), -1)` })
    .from(communityChannelsTable)
    .where(eq(communityChannelsTable.communityId, id));
  const nextPos = Number(maxPositionResult[0]?.maxPos ?? -1) + 1;

  const [channel] = await db
    .insert(communityChannelsTable)
    .values({
      communityId: id,
      chatRoomId,
      name: name.trim(),
      type: channelType,
      description: description?.trim() ?? null,
      position: nextPos,
    })
    .returning();

  res.status(201).json({
    id: channel.id,
    communityId: channel.communityId,
    chatRoomId: channel.chatRoomId ?? null,
    name: channel.name,
    type: channel.type,
    description: channel.description ?? null,
    position: channel.position,
    isDefault: channel.isDefault,
    createdAt: channel.createdAt.toISOString(),
  });
});

// ── Delete channel ─────────────────────────────────────────────────────────────
router.delete("/communities/:id/channels/:channelId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const channelId = parseInt(paramStr(req.params.channelId), 10);
  if (isNaN(id) || isNaN(channelId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const channel = await db
    .select()
    .from(communityChannelsTable)
    .where(and(eq(communityChannelsTable.id, channelId), eq(communityChannelsTable.communityId, id)))
    .then((r) => r[0]);
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
  if (channel.isDefault) { res.status(400).json({ error: "Cannot delete the default channel" }); return; }

  await db.delete(communityChannelsTable).where(eq(communityChannelsTable.id, channelId));
  res.json({ ok: true });
});

// ── Invite link info (pre-join) ────────────────────────────────────────────────
router.get("/communities/join/:code", requireAuth, async (req, res): Promise<void> => {
  const code = paramStr(req.params.code);
  const community = await db
    .select()
    .from(communitiesTable)
    .where(eq(communitiesTable.inviteCode, code))
    .then((r) => r[0]);
  if (!community) { res.status(404).json({ error: "Invite link not found" }); return; }

  const memberCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(communityMembersTable)
    .where(eq(communityMembersTable.communityId, community.id))
    .then((r) => Number(r[0]?.count ?? 0));

  res.json({
    id: community.id,
    name: community.name,
    description: community.description ?? null,
    iconUrl: community.iconUrl ?? null,
    memberCount,
  });
});

// ── Join via invite link ───────────────────────────────────────────────────────
router.post("/communities/join/:code", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const code = paramStr(req.params.code);
  const community = await db
    .select()
    .from(communitiesTable)
    .where(eq(communitiesTable.inviteCode, code))
    .then((r) => r[0]);
  if (!community) { res.status(404).json({ error: "Invite link not found" }); return; }

  const existing = await db
    .select()
    .from(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.communityId, community.id),
        eq(communityMembersTable.clerkId, userId)
      )
    )
    .then((r) => r[0]);
  if (existing) {
    res.json({ id: community.id, alreadyMember: true });
    return;
  }

  await db.insert(communityMembersTable).values({
    communityId: community.id,
    clerkId: userId,
    role: "member",
  });

  // Add user to all existing text channels
  const channels = await db
    .select()
    .from(communityChannelsTable)
    .where(and(eq(communityChannelsTable.communityId, community.id), sql`chat_room_id IS NOT NULL`));
  for (const ch of channels) {
    if (ch.chatRoomId) {
      const alreadyInRoom = await db
        .select()
        .from(chatParticipantsTable)
        .where(and(eq(chatParticipantsTable.roomId, ch.chatRoomId), eq(chatParticipantsTable.clerkId, userId)))
        .then((r) => r[0]);
      if (!alreadyInRoom) {
        await insertChatParticipantSafe(ch.chatRoomId, userId);
      }
    }
  }

  // Notify community owner
  const profile = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then((r) => r[0]);
  await db.insert(notificationsTable).values({
    clerkId: community.ownerId,
    type: "invite",
    title: "New member joined",
    body: `${profile?.name ?? "Someone"} joined ${community.name}`,
    relatedId: community.id,
    relatedType: "community",
  });

  res.json({ id: community.id, alreadyMember: false });
});

// ── Update member custom tags ──────────────────────────────────────────────────
router.patch("/communities/:id/members/:clerkId/tags", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const targetClerkId = paramStr(req.params.clerkId);

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { tags } = req.body as { tags?: string[] };
  if (!Array.isArray(tags)) { res.status(400).json({ error: "tags must be an array" }); return; }
  const cleaned = tags.map((t) => t.trim()).filter(Boolean).slice(0, 10);

  await db
    .update(communityMembersTable)
    .set({ customTags: cleaned })
    .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.clerkId, targetClerkId)));

  res.json({ ok: true, tags: cleaned });
});

// ── List events ────────────────────────────────────────────────────────────────
router.get("/communities/:id/events", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const events = await db
    .select()
    .from(communityEventsTable)
    .where(eq(communityEventsTable.communityId, id))
    .orderBy(communityEventsTable.startsAt);

  const eventIds = events.map((e) => e.id);

  // Fetch all RSVPs for these events
  const rsvps = eventIds.length
    ? await db.select().from(communityEventRsvpsTable).where(inArray(communityEventRsvpsTable.eventId, eventIds))
    : [];

  const rsvpByEvent = new Map<number, typeof rsvps>();
  for (const r of rsvps) {
    if (!rsvpByEvent.has(r.eventId)) rsvpByEvent.set(r.eventId, []);
    rsvpByEvent.get(r.eventId)!.push(r);
  }

  res.json(events.map((e) => {
    const eventRsvps = rsvpByEvent.get(e.id) ?? [];
    const myRsvp = eventRsvps.find((r) => r.clerkId === userId)?.status ?? null;
    return {
      id: e.id,
      communityId: e.communityId,
      title: e.title,
      description: e.description ?? null,
      location: e.location ?? null,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt?.toISOString() ?? null,
      createdBy: e.createdBy,
      createdAt: e.createdAt.toISOString(),
      attendingCount: eventRsvps.filter((r) => r.status === "attending").length,
      maybeCount: eventRsvps.filter((r) => r.status === "maybe").length,
      notGoingCount: eventRsvps.filter((r) => r.status === "not_attending").length,
      myRsvp,
    };
  }));
});

// ── Create event ───────────────────────────────────────────────────────────────
router.post("/communities/:id/events", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { title, description, location, startsAt, endsAt } = req.body as {
    title?: string; description?: string; location?: string; startsAt?: string; endsAt?: string;
  };
  if (!title?.trim()) { res.status(400).json({ error: "title required" }); return; }
  if (!startsAt) { res.status(400).json({ error: "startsAt required" }); return; }

  const [event] = await db.insert(communityEventsTable).values({
    communityId: id,
    title: title.trim(),
    description: description?.trim() || null,
    location: location?.trim() || null,
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
    createdBy: userId,
  }).returning();

  res.status(201).json({
    id: event.id, communityId: event.communityId, title: event.title,
    description: event.description ?? null, location: event.location ?? null,
    startsAt: event.startsAt.toISOString(), endsAt: event.endsAt?.toISOString() ?? null,
    createdBy: event.createdBy, createdAt: event.createdAt.toISOString(),
    attendingCount: 0, maybeCount: 0, notGoingCount: 0, myRsvp: null,
  });
});

// ── Update event ───────────────────────────────────────────────────────────────
router.patch("/communities/:id/events/:eventId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const eventId = parseInt(paramStr(req.params.eventId), 10);
  if (isNaN(id) || isNaN(eventId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { title, description, location, startsAt, endsAt } = req.body as {
    title?: string; description?: string; location?: string; startsAt?: string; endsAt?: string | null;
  };

  await db.update(communityEventsTable).set({
    ...(title ? { title: title.trim() } : {}),
    ...(description !== undefined ? { description: description?.trim() || null } : {}),
    ...(location !== undefined ? { location: location?.trim() || null } : {}),
    ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
    ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
  }).where(and(eq(communityEventsTable.id, eventId), eq(communityEventsTable.communityId, id)));

  res.json({ ok: true });
});

// ── Delete event ───────────────────────────────────────────────────────────────
router.delete("/communities/:id/events/:eventId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const eventId = parseInt(paramStr(req.params.eventId), 10);
  if (isNaN(id) || isNaN(eventId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  await db.delete(communityEventsTable).where(
    and(eq(communityEventsTable.id, eventId), eq(communityEventsTable.communityId, id))
  );
  res.json({ ok: true });
});

// ── RSVP to event ──────────────────────────────────────────────────────────────
router.post("/communities/:id/events/:eventId/rsvp", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const eventId = parseInt(paramStr(req.params.eventId), 10);
  if (isNaN(id) || isNaN(eventId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const { status } = req.body as { status?: string };
  if (!status || !["attending", "maybe", "not_attending"].includes(status)) {
    res.status(400).json({ error: "status must be attending, maybe, or not_attending" }); return;
  }

  const existing = await db.select().from(communityEventRsvpsTable)
    .where(and(eq(communityEventRsvpsTable.eventId, eventId), eq(communityEventRsvpsTable.clerkId, userId)))
    .then((r) => r[0]);

  if (existing) {
    await db.update(communityEventRsvpsTable)
      .set({ status: status as "attending" | "maybe" | "not_attending", updatedAt: new Date() })
      .where(eq(communityEventRsvpsTable.id, existing.id));
  } else {
    await db.insert(communityEventRsvpsTable).values({
      eventId, clerkId: userId, status: status as "attending" | "maybe" | "not_attending",
    });
  }

  res.json({ ok: true, status });
});

// ── Regenerate invite code ─────────────────────────────────────────────────────
router.post("/communities/:id/invite/regenerate", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const inviteCode = generateInviteCode();
  await db.update(communitiesTable).set({ inviteCode }).where(eq(communitiesTable.id, id));
  res.json({ inviteCode });
});

// ── Direct-add a member by clerkId or email ────────────────────────────────────
router.post("/communities/:id/members/direct", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { clerkId: targetClerkId, email: targetEmail } = req.body as { clerkId?: string; email?: string };

  // Resolve target clerkId
  let resolvedClerkId = targetClerkId?.trim() || null;
  if (!resolvedClerkId && targetEmail?.trim()) {
    const profile = await db.select().from(userProfilesTable)
      .where(eq(userProfilesTable.email, targetEmail.trim().toLowerCase()))
      .then((r) => r[0]);
    if (!profile) { res.status(404).json({ error: "No TanCom account found with that email" }); return; }
    resolvedClerkId = profile.clerkId;
  }

  if (!resolvedClerkId) { res.status(400).json({ error: "clerkId or email is required" }); return; }
  if (resolvedClerkId === userId) { res.status(400).json({ error: "You are already a member" }); return; }

  // Check already a member
  const existing = await db.select().from(communityMembersTable)
    .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.clerkId, resolvedClerkId)))
    .then((r) => r[0]);
  if (existing) { res.json({ ok: true, alreadyMember: true }); return; }

  await db.insert(communityMembersTable).values({ communityId: id, clerkId: resolvedClerkId, role: "member" });

  // Add to all text channel chat rooms
  const channels = await db.select().from(communityChannelsTable)
    .where(and(eq(communityChannelsTable.communityId, id), sql`chat_room_id IS NOT NULL`));
  for (const ch of channels) {
    if (ch.chatRoomId) {
      const inRoom = await db.select().from(chatParticipantsTable)
        .where(and(eq(chatParticipantsTable.roomId, ch.chatRoomId), eq(chatParticipantsTable.clerkId, resolvedClerkId)))
        .then((r) => r[0]);
      if (!inRoom) await insertChatParticipantSafe(ch.chatRoomId, resolvedClerkId);
    }
  }

  // Notify the added person
  const adderProfile = await db.select().from(userProfilesTable).where(eq(userProfilesTable.clerkId, userId)).then((r) => r[0]);
  await db.insert(notificationsTable).values({
    clerkId: resolvedClerkId,
    type: "invite",
    title: "Added to a community",
    body: `${adderProfile?.name ?? "Someone"} added you to ${community.name}`,
    relatedId: community.id,
    relatedType: "community",
  });

  res.json({ ok: true, alreadyMember: false });
});

// ── Bulk-add members from a standalone group ────────────────────────────────────
router.post("/communities/:id/members/bulk-from-group", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { groupId } = req.body as { groupId?: number };
  if (!groupId) { res.status(400).json({ error: "groupId is required" }); return; }

  // Verify caller is owner/admin of that group
  const group = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId)).then((r) => r[0]);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const isGroupOwner = group.ownerClerkId === userId;
  if (!isGroupOwner) {
    const callerMembership = await db.select().from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.invitedClerkId, userId)))
      .then((r) => r[0]);
    if (!callerMembership || callerMembership.memberRole !== "admin") {
      res.status(403).json({ error: "You must be an owner or admin of that group" }); return;
    }
  }

  // Collect all accepted/direct group members
  const groupMembers = await db.select().from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, groupId),
      or(
        sql`invitation_status IS NULL`,
        eq(groupMembersTable.invitationStatus, "accepted")
      )
    ));

  const clerkIds = groupMembers
    .map((m) => m.invitedClerkId)
    .filter((c): c is string => !!c && c !== userId);

  if (clerkIds.length === 0) { res.json({ added: 0, skipped: 0 }); return; }

  // Get existing community members to skip them
  const existingMembers = await db.select().from(communityMembersTable).where(eq(communityMembersTable.communityId, id));
  const existingSet = new Set(existingMembers.map((m) => m.clerkId));

  const toAdd = clerkIds.filter((c) => !existingSet.has(c));
  const skipped = clerkIds.length - toAdd.length;

  const channels = await db.select().from(communityChannelsTable)
    .where(and(eq(communityChannelsTable.communityId, id), sql`chat_room_id IS NOT NULL`));

  for (const clerkId of toAdd) {
    await db.insert(communityMembersTable).values({ communityId: id, clerkId, role: "member" });
    for (const ch of channels) {
      if (ch.chatRoomId) {
        const inRoom = await db.select().from(chatParticipantsTable)
          .where(and(eq(chatParticipantsTable.roomId, ch.chatRoomId), eq(chatParticipantsTable.clerkId, clerkId)))
          .then((r) => r[0]);
        if (!inRoom) await insertChatParticipantSafe(ch.chatRoomId, clerkId);
      }
    }
    // Notify each added person
    const adderProfile = await db.select().from(userProfilesTable).where(eq(userProfilesTable.clerkId, userId)).then((r) => r[0]);
    await db.insert(notificationsTable).values({
      clerkId,
      type: "invite",
      title: "Added to a community",
      body: `${adderProfile?.name ?? "Someone"} added you to ${community.name}`,
      relatedId: community.id,
      relatedType: "community",
    });
  }

  res.json({ added: toAdd.length, skipped });
});

// ── List groups ────────────────────────────────────────────────────────────────
router.get("/communities/:id/groups", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const groups = await db.select().from(communityGroupsTable)
    .where(eq(communityGroupsTable.communityId, id))
    .orderBy(communityGroupsTable.createdAt);

  // Attach member counts
  const result = await Promise.all(groups.map(async (g) => {
    const members = await db.select().from(communityGroupMembersTable)
      .where(eq(communityGroupMembersTable.groupId, g.id));
    return { ...g, memberCount: members.length };
  }));

  res.json(result);
});

// ── Create group ───────────────────────────────────────────────────────────────
router.post("/communities/:id/groups", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { name, description } = req.body as { name?: string; description?: string };
  const trimmedName = name?.trim() ?? "";
  if (!trimmedName) { res.status(400).json({ error: "Group name is required" }); return; }

  const [group] = await db.insert(communityGroupsTable).values({
    communityId: id,
    name: trimmedName,
    description: description?.trim() || null,
    createdBy: userId,
  }).returning();

  res.json({ ...group, memberCount: 0 });
});

// ── Update group ───────────────────────────────────────────────────────────────
router.patch("/communities/:id/groups/:groupId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(id) || isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { name, description } = req.body as { name?: string; description?: string | null };
  const updates: Partial<{ name: string; description: string | null }> = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) { res.status(400).json({ error: "Name cannot be empty" }); return; }
    updates.name = trimmed;
  }
  if (description !== undefined) updates.description = description?.trim() || null;

  const [updated] = await db.update(communityGroupsTable)
    .set(updates)
    .where(and(eq(communityGroupsTable.id, groupId), eq(communityGroupsTable.communityId, id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Group not found" }); return; }
  res.json(updated);
});

// ── Delete group ───────────────────────────────────────────────────────────────
router.delete("/communities/:id/groups/:groupId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(id) || isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  await db.delete(communityGroupsTable)
    .where(and(eq(communityGroupsTable.id, groupId), eq(communityGroupsTable.communityId, id)));
  res.json({ ok: true });
});

// ── List group members ─────────────────────────────────────────────────────────
router.get("/communities/:id/groups/:groupId/members", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(id) || isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const groupMembers = await db.select().from(communityGroupMembersTable)
    .where(eq(communityGroupMembersTable.groupId, groupId));

  if (groupMembers.length === 0) { res.json([]); return; }

  const clerkIds = groupMembers.map((m) => m.clerkId);
  const profiles = await db.select().from(userProfilesTable)
    .where(inArray(userProfilesTable.clerkId, clerkIds));

  const result = groupMembers.map((gm) => {
    const profile = profiles.find((p) => p.clerkId === gm.clerkId);
    return {
      id: gm.id,
      clerkId: gm.clerkId,
      name: profile?.name ?? profile?.email ?? gm.clerkId,
      email: profile?.email ?? "",
      addedAt: gm.addedAt.toISOString(),
    };
  });

  res.json(result);
});

// ── Add group member ───────────────────────────────────────────────────────────
router.post("/communities/:id/groups/:groupId/members", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(id) || isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const { clerkId } = req.body as { clerkId?: string };
  if (!clerkId) { res.status(400).json({ error: "clerkId is required" }); return; }

  // Must be a community member
  const targetMember = await db.select().from(communityMembersTable)
    .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.clerkId, clerkId)))
    .then((r) => r[0]);
  if (!targetMember) { res.status(400).json({ error: "User is not a community member" }); return; }

  // Avoid duplicates
  const existing = await db.select().from(communityGroupMembersTable)
    .where(and(eq(communityGroupMembersTable.groupId, groupId), eq(communityGroupMembersTable.clerkId, clerkId)))
    .then((r) => r[0]);
  if (existing) { res.json({ ok: true, alreadyMember: true }); return; }

  await db.insert(communityGroupMembersTable).values({ groupId, clerkId });
  res.json({ ok: true, alreadyMember: false });
});

// ── Remove group member ────────────────────────────────────────────────────────
router.delete("/communities/:id/groups/:groupId/members/:clerkId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const targetClerkId = paramStr(req.params.clerkId);
  if (isNaN(id) || isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { community, member } = await getCommunityWithMembership(id, userId);
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  await db.delete(communityGroupMembersTable)
    .where(and(eq(communityGroupMembersTable.groupId, groupId), eq(communityGroupMembersTable.clerkId, targetClerkId)));
  res.json({ ok: true });
});

export default router;
