import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, participantsTable, meetingsTable } from "@workspace/db";
import {
  JoinMeetingBody,
  JoinMeetingParams,
  ListParticipantsParams,
  UpdateParticipantBody,
  UpdateParticipantParams,
  RemoveParticipantParams,
  AdmitAllParticipantsParams,
  MuteAllParticipantsParams,
} from "@workspace/api-zod";
import { requireAuth, getUserId } from "../lib/auth";

const router: IRouter = Router();

function toParticipantResponse(p: any) {
  return {
    ...p,
    joinedAt: p.joinedAt?.toISOString() ?? null,
    leftAt: p.leftAt?.toISOString() ?? null,
  };
}

router.get("/meetings/:id/participants", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ListParticipantsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const participants = await db
    .select()
    .from(participantsTable)
    .where(
      and(
        eq(participantsTable.meetingId, params.data.id),
        inArray(participantsTable.status, ["waiting", "admitted", "active"]),
      ),
    );

  res.json(participants.map(toParticipantResponse));
});

router.post("/meetings/:id/participants", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const meetingId = parseInt(raw, 10);
  const params = JoinMeetingParams.safeParse({ id: meetingId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = JoinMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  // Determine if the joiner is the host — hosts bypass lock and passcode checks
  const userId = getUserId(req);
  const isHostJoining = userId === meeting.hostClerkId;

  if (meeting.isLocked && !isHostJoining) {
    res.status(403).json({ error: "Meeting is locked" });
    return;
  }

  if (meeting.isPasswordProtected && meeting.passcode && !isHostJoining && parsed.data.passcode !== meeting.passcode) {
    res.status(401).json({ error: "Invalid passcode" });
    return;
  }
  if (meeting.maxParticipants && !isHostJoining) {
    const [{ count: currentCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(participantsTable)
      .where(
        and(
          eq(participantsTable.meetingId, params.data.id),
          inArray(participantsTable.status, ["admitted", "active"]),
        )
      );
    if (Number(currentCount) >= meeting.maxParticipants) {
      res.status(403).json({ error: `Meeting is full (max ${meeting.maxParticipants} participants)` });
      return;
    }
  }
  const isHost = userId === meeting.hostClerkId;
  const status = meeting.waitingRoomEnabled && !isHost ? "waiting" : "admitted";
  const role = isHost ? "host" : (userId ? "participant" : "guest");
  const clerkId = parsed.data.clerkId ?? userId ?? null;

  // Upsert: if the same Clerk user already has a participant row for this
  // meeting (e.g. they rejoined from a second device), update it rather than
  // inserting a duplicate — prevents ghost tiles in the meeting room.
  if (clerkId) {
    const [existing] = await db
      .select()
      .from(participantsTable)
      .where(
        and(
          eq(participantsTable.meetingId, params.data.id),
          eq(participantsTable.clerkId, clerkId)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(participantsTable)
        .set({
          status,
          displayName: parsed.data.displayName,
          joinedAt: status === "admitted" ? new Date() : existing.joinedAt,
          leftAt: null,
        })
        .where(eq(participantsTable.id, existing.id))
        .returning();
      res.status(200).json(toParticipantResponse(updated));
      return;
    }
  }

  const [participant] = await db
    .insert(participantsTable)
    .values({
      meetingId: params.data.id,
      clerkId,
      displayName: parsed.data.displayName,
      role,
      status,
      isMuted: meeting.muteOnEntry,
      isVideoOff: meeting.videoOffOnEntry,
      joinedAt: status === "admitted" ? new Date() : null,
    })
    .returning();

  res.status(201).json(toParticipantResponse(participant));
});

router.patch("/meetings/:id/participants/:participantId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawPid = Array.isArray(req.params.participantId) ? req.params.participantId[0] : req.params.participantId;
  const params = UpdateParticipantParams.safeParse({
    id: parseInt(rawId, 10),
    participantId: parseInt(rawPid, 10),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const parsed = UpdateParticipantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, any> = {};
  const d = parsed.data;
  if (d.role != null) updateData.role = d.role;
  if (d.status != null) {
    updateData.status = d.status;
    if (d.status === "admitted") updateData.joinedAt = new Date();
    if (d.status === "left" || d.status === "removed") updateData.leftAt = new Date();
  }
  if (d.isMuted != null) updateData.isMuted = d.isMuted;
  if (d.isVideoOff != null) updateData.isVideoOff = d.isVideoOff;
  if (d.isHandRaised != null) updateData.isHandRaised = d.isHandRaised;
  if (d.displayName != null) updateData.displayName = d.displayName;

  const [participant] = await db
    .update(participantsTable)
    .set(updateData)
    .where(
      and(
        eq(participantsTable.id, params.data.participantId),
        eq(participantsTable.meetingId, params.data.id)
      )
    )
    .returning();

  if (!participant) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }

  res.json(toParticipantResponse(participant));
});

router.delete("/meetings/:id/participants/:participantId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawPid = Array.isArray(req.params.participantId) ? req.params.participantId[0] : req.params.participantId;
  const params = RemoveParticipantParams.safeParse({
    id: parseInt(rawId, 10),
    participantId: parseInt(rawPid, 10),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [removed] = await db
    .delete(participantsTable)
    .where(
      and(
        eq(participantsTable.id, params.data.participantId),
        eq(participantsTable.meetingId, params.data.id)
      )
    )
    .returning();

  if (!removed) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/meetings/:id/participants/admit-all", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdmitAllParticipantsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db
    .update(participantsTable)
    .set({ status: "admitted", joinedAt: new Date() })
    .where(
      and(
        eq(participantsTable.meetingId, params.data.id),
        eq(participantsTable.status, "waiting")
      )
    );

  res.json({ success: true, message: "All participants admitted" });
});

router.post("/meetings/:id/participants/mute-all", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = MuteAllParticipantsParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db
    .update(participantsTable)
    .set({ isMuted: true })
    .where(eq(participantsTable.meetingId, params.data.id));

  res.json({ success: true, message: "All participants muted" });
});

export default router;
