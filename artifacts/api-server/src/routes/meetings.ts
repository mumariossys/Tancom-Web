import { Router, type IRouter } from "express";
import { eq, and, desc, gte, lt, sql, inArray } from "drizzle-orm";
import { db, meetingsTable, participantsTable, recordingsTable, groupMembersTable, groupsTable, userProfilesTable } from "@workspace/db";
import {
  CreateMeetingBody,
  UpdateMeetingBody,
  GetMeetingParams,
  UpdateMeetingParams,
  DeleteMeetingParams,
  GetMeetingByCodeParams,
  StartMeetingParams,
  EndMeetingParams,
  LockMeetingParams,
  LockMeetingBody,
  ListMeetingsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, getUserId } from "../lib/auth";
import { generateMeetingCode, normalizeMeetingCode } from "../lib/meetingCode";

const router: IRouter = Router();

function buildInviteLink(req: any, meetingCode: string): string {
  const host = req.get("host") || "localhost";
  const protocol = req.protocol || "https";
  return `${protocol}://${host}/meetings/${meetingCode}/join`;
}

function toMeetingResponse(meeting: any, req: any) {
  return {
    ...meeting,
    scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
    startedAt: meeting.startedAt?.toISOString() ?? null,
    endedAt: meeting.endedAt?.toISOString() ?? null,
    recurrenceEndDate: meeting.recurrenceEndDate?.toISOString() ?? null,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
    participantCount: 0,
    inviteLink: buildInviteLink(req, meeting.meetingCode),
  };
}

router.get("/meetings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = ListMeetingsQueryParams.safeParse(req.query);
  const type = params.success ? params.data.type : "all";
  const limit = (params.success && params.data.limit) ? params.data.limit : 50;
  const offset = (params.success && params.data.offset) ? params.data.offset : 0;

  const now = new Date();
  let conditions: any[] = [eq(meetingsTable.hostClerkId, userId)];

  if (type === "upcoming") {
    conditions.push(gte(meetingsTable.scheduledAt, now));
  } else if (type === "past") {
    conditions.push(lt(meetingsTable.scheduledAt, now));
  }

  const meetings = await db
    .select()
    .from(meetingsTable)
    .where(and(...conditions))
    .orderBy(desc(meetingsTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Single batch query instead of N+1 — one COUNT per meeting_id using GROUP BY.
  const meetingIds = meetings.map((m) => m.id);
  const countMap = new Map<number, number>();
  if (meetingIds.length > 0) {
    const rows = await db
      .select({ meetingId: participantsTable.meetingId, count: sql<number>`count(*)` })
      .from(participantsTable)
      .where(and(
        inArray(participantsTable.meetingId, meetingIds),
        inArray(participantsTable.status, ["admitted", "active"]),
      ))
      .groupBy(participantsTable.meetingId);
    for (const r of rows) countMap.set(r.meetingId, Number(r.count));
  }
  const withCounts = meetings.map((m) => ({
    ...toMeetingResponse(m, req),
    participantCount: countMap.get(m.id) ?? 0,
  }));

  res.json(withCounts);
});

router.post("/meetings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const meetingCode = generateMeetingCode();
  const data = parsed.data;

  // Accept optional groupId from the request body (not in the generated schema).
  // Validate it as a positive integer and verify the caller has a role in the group.
  const rawGroupId = (req.body as any).groupId;
  let groupId: number | null = null;
  if (rawGroupId != null) {
    const gid = parseInt(String(rawGroupId), 10);
    if (isNaN(gid) || gid <= 0) {
      res.status(400).json({ error: "groupId must be a positive integer" });
      return;
    }
    groupId = gid;

    // Only group owners/admins may create group-linked meetings and mass-invite members.
    // A regular member cannot trigger invitations on behalf of the whole group.
    const [groupRecord] = await db.select({ ownerClerkId: groupsTable.ownerClerkId })
      .from(groupsTable)
      .where(eq(groupsTable.id, gid));

    if (!groupRecord) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    if (groupRecord.ownerClerkId !== userId) {
      // Check that caller is an accepted admin of the group
      const [adminRow] = await db.select({ id: groupMembersTable.id })
        .from(groupMembersTable)
        .where(
          and(
            eq(groupMembersTable.groupId, gid),
            eq(groupMembersTable.invitedClerkId, userId),
            eq(groupMembersTable.invitationStatus, "accepted"),
            eq(groupMembersTable.memberRole, "admin"),
          )
        );
      if (!adminRow) {
        res.status(403).json({ error: "Only group owners and admins can create a group meeting" });
        return;
      }
    }
  }

  // Lookup host name
  const hostProfile = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId)).then(r => r[0]);
  const hostName = hostProfile?.name ?? "Host";

  const [meeting] = await db
    .insert(meetingsTable)
    .values({
      meetingCode,
      title: data.title,
      description: data.description ?? null,
      hostClerkId: userId,
      hostName,
      type: data.type,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      plannedDuration: data.plannedDuration ?? null,
      timezone: data.timezone ?? "UTC",
      passcode: data.passcode ?? null,
      isPasswordProtected: !!(data.passcode),
      waitingRoomEnabled: data.waitingRoomEnabled ?? false,
      maxParticipants: data.maxParticipants ?? null,
      allowScreenShare: data.allowScreenShare ?? true,
      allowChat: data.allowChat ?? true,
      muteOnEntry: data.muteOnEntry ?? false,
      videoOffOnEntry: data.videoOffOnEntry ?? false,
      status: data.type === "instant" ? "active" : "scheduled",
      groupId: groupId ?? null,
      recurrencePattern: data.recurrencePattern ?? null,
      recurrenceInterval: data.recurrenceInterval ?? null,
      recurrenceDays: data.recurrenceDays ?? null,
      recurrenceEndDate: data.recurrenceEndDate ? new Date(data.recurrenceEndDate) : null,
      recurrenceCount: data.recurrenceCount ?? null,
    })
    .returning();

  // Insert host as participant
  if (data.type === "instant") {
    await db.insert(participantsTable).values({
      meetingId: meeting.id,
      clerkId: userId,
      displayName: hostName,
      role: "host",
      status: "active",
      joinedAt: new Date(),
    });
  }

  let participantCount = data.type === "instant" ? 1 : 0;

  // If a groupId was provided, auto-invite all accepted group members as participants
  if (groupId) {
    const groupMembers = await db.select().from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.invitationStatus, "accepted"),
      ));

    // Deduplicate by clerkId in case member rows weren't yet cleaned up
    const inviteeMap = new Map<string, typeof groupMembers[number]>();
    for (const m of groupMembers) {
      if (m.invitedClerkId && m.invitedClerkId !== userId) {
        if (!inviteeMap.has(m.invitedClerkId)) inviteeMap.set(m.invitedClerkId, m);
      }
    }
    const uniqueInvitees = [...inviteeMap.values()];

    if (uniqueInvitees.length > 0) {
      // Look up display names
      const profileMap = new Map<string, string>();
      const profiles = await db.select().from(userProfilesTable)
        .where(inArray(userProfilesTable.clerkId, uniqueInvitees.map(m => m.invitedClerkId!)));
      for (const p of profiles) profileMap.set(p.clerkId, p.name ?? p.email ?? "Member");

      // Meeting is new; invitees are already deduplicated by clerkId above.
      // No conflict is expected, so no onConflictDoNothing is needed.
      const inserted = await db.insert(participantsTable).values(
        uniqueInvitees.map(m => ({
          meetingId: meeting.id,
          clerkId: m.invitedClerkId!,
          displayName: profileMap.get(m.invitedClerkId!) ?? m.name,
          role: "participant" as const,
          status: "waiting" as const,
        }))
      ).returning({ id: participantsTable.id });

      participantCount += inserted.length;
    }
  }

  res.status(201).json({ ...toMeetingResponse(meeting, req), participantCount });
});

router.get("/meetings/join/:meetingCode", async (req, res): Promise<void> => {
  const rawInput = Array.isArray(req.params.meetingCode) ? req.params.meetingCode[0] : req.params.meetingCode;
  const raw = normalizeMeetingCode(rawInput);
  const params = GetMeetingByCodeParams.safeParse({ meetingCode: raw });
  if (!params.success) {
    res.status(400).json({ error: "Invalid meeting code" });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.meetingCode, params.data.meetingCode));

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(participantsTable)
    .where(and(
      eq(participantsTable.meetingId, meeting.id),
      inArray(participantsTable.status, ["admitted", "active"]),
    ));

  res.json({ ...toMeetingResponse(meeting, req), participantCount: Number(count) });
});

router.get("/meetings/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetMeetingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.id));

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(participantsTable)
    .where(and(
      eq(participantsTable.meetingId, meeting.id),
      inArray(participantsTable.status, ["admitted", "active"]),
    ));

  res.json({ ...toMeetingResponse(meeting, req), participantCount: Number(count) });
});

router.patch("/meetings/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateMeetingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(meetingsTable)
    .where(and(eq(meetingsTable.id, params.data.id), eq(meetingsTable.hostClerkId, userId)));

  if (!existing) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  const updateData: Record<string, any> = {};
  const d = parsed.data;
  if (d.title != null) updateData.title = d.title;
  if (d.description != null) updateData.description = d.description;
  if (d.scheduledAt != null) updateData.scheduledAt = new Date(d.scheduledAt);
  if (d.timezone != null) updateData.timezone = d.timezone;
  if (d.passcode != null) { updateData.passcode = d.passcode; updateData.isPasswordProtected = true; }
  if (d.waitingRoomEnabled != null) updateData.waitingRoomEnabled = d.waitingRoomEnabled;
  if (d.maxParticipants != null) updateData.maxParticipants = d.maxParticipants;
  if (d.allowScreenShare != null) updateData.allowScreenShare = d.allowScreenShare;
  if (d.allowChat != null) updateData.allowChat = d.allowChat;
  if (d.muteOnEntry != null) updateData.muteOnEntry = d.muteOnEntry;
  if (d.videoOffOnEntry != null) updateData.videoOffOnEntry = d.videoOffOnEntry;
  if (d.status != null) updateData.status = d.status;

  const [updated] = await db
    .update(meetingsTable)
    .set(updateData)
    .where(eq(meetingsTable.id, params.data.id))
    .returning();

  res.json({ ...toMeetingResponse(updated, req), participantCount: 0 });
});

router.delete("/meetings/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteMeetingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(meetingsTable)
    .where(and(eq(meetingsTable.id, params.data.id), eq(meetingsTable.hostClerkId, userId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/meetings/:id/start", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = StartMeetingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [meeting] = await db
    .update(meetingsTable)
    .set({ status: "active", startedAt: new Date() })
    .where(and(eq(meetingsTable.id, params.data.id), eq(meetingsTable.hostClerkId, userId)))
    .returning();

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  res.json({ ...toMeetingResponse(meeting, req), participantCount: 1 });
});

router.post("/meetings/:id/end", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = EndMeetingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(meetingsTable)
    .where(and(eq(meetingsTable.id, params.data.id), eq(meetingsTable.hostClerkId, userId)));

  if (!existing) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  const now = new Date();
  const durationMs = existing.startedAt ? now.getTime() - existing.startedAt.getTime() : 0;
  const durationMinutes = Math.round(durationMs / 60000);

  await db
    .update(participantsTable)
    .set({ status: "left", leftAt: now })
    .where(and(eq(participantsTable.meetingId, params.data.id)));

  const [meeting] = await db
    .update(meetingsTable)
    .set({ status: "ended", endedAt: now, duration: durationMinutes })
    .where(eq(meetingsTable.id, params.data.id))
    .returning();

  res.json({ ...toMeetingResponse(meeting, req), participantCount: 0 });
});

router.post("/meetings/:id/lock", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = LockMeetingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = LockMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [meeting] = await db
    .update(meetingsTable)
    .set({ isLocked: parsed.data.locked })
    .where(and(eq(meetingsTable.id, params.data.id), eq(meetingsTable.hostClerkId, userId)))
    .returning();

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  res.json({ ...toMeetingResponse(meeting, req), participantCount: 0 });
});

// ── In-room chat (in-memory, per meeting session) ────────────────────────────
// Lightweight message store for live in-meeting chat. Messages persist as long
// as the server process is running. On server restart the history clears, which
// is acceptable for a live meeting chat (not persistent conversations).
interface RoomChatMessage {
  id: number;
  clerkId: string;
  displayName: string;
  text: string;
  createdAt: string;
}
const roomChatStore = new Map<number, RoomChatMessage[]>();
let roomChatIdSeq = 1;

router.get("/meetings/:id/room-chat", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const meetingId = parseInt(raw, 10);
  if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const msgs = roomChatStore.get(meetingId) ?? [];
  res.json(msgs.slice(-100)); // return last 100 messages
});

router.post("/meetings/:id/room-chat", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const meetingId = parseInt(raw, 10);
  if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { clerkId, displayName, text } = req.body as { clerkId?: string; displayName?: string; text?: string };
  if (!text || !displayName) { res.status(400).json({ error: "displayName and text are required" }); return; }

  const msg: RoomChatMessage = {
    id: roomChatIdSeq++,
    clerkId: clerkId ?? "guest",
    displayName,
    text: String(text).slice(0, 1000),
    createdAt: new Date().toISOString(),
  };

  const msgs = roomChatStore.get(meetingId) ?? [];
  msgs.push(msg);
  if (msgs.length > 200) msgs.splice(0, msgs.length - 200); // cap at 200
  roomChatStore.set(meetingId, msgs);

  res.status(201).json(msg);
});

export default router;
