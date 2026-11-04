import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  remoteDevicesTable,
  remoteSessionsTable,
  remoteSupportRequestsTable,
  meetingsTable,
  participantsTable,
  rcAuditLogTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { isAdmin } from "../lib/permissions";
import { z } from "zod";
import { RoomServiceClient, AccessToken } from "livekit-server-sdk";
import { broadcastCursor } from "../lib/rcCursor";

function getLiveKitRooms() {
  const url = process.env["LIVEKIT_URL"] ?? "";
  const key = process.env["LIVEKIT_API_KEY"] ?? "";
  const secret = process.env["LIVEKIT_API_SECRET"] ?? "";
  return new RoomServiceClient(url, key, secret);
}

const router: IRouter = Router();

const toISO = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const serialize = (row: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
};

// ── Devices ──────────────────────────────────────────────────────────────────

router.get("/remote/devices", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const devices = await db
    .select()
    .from(remoteDevicesTable)
    .where(eq(remoteDevicesTable.ownerClerkId, userId))
    .orderBy(desc(remoteDevicesTable.createdAt));
  res.json(devices.map(serialize));
});

router.post("/remote/devices", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const schema = z.object({
    name: z.string().min(1),
    os: z.string().optional(),
    ip: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [device] = await db
    .insert(remoteDevicesTable)
    .values({ ownerClerkId: userId, name: parsed.data.name, os: parsed.data.os ?? "Unknown", ip: parsed.data.ip ?? null, location: parsed.data.location ?? null, notes: parsed.data.notes ?? null })
    .returning();
  res.status(201).json(serialize(device));
});

router.patch("/remote/devices/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id as string);
  const schema = z.object({
    name: z.string().optional(),
    os: z.string().optional(),
    ip: z.string().optional(),
    location: z.string().optional(),
    status: z.enum(["online", "offline", "idle"]).optional(),
    trusted: z.boolean().optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [device] = await db
    .update(remoteDevicesTable)
    .set({ ...parsed.data })
    .where(and(eq(remoteDevicesTable.id, id), eq(remoteDevicesTable.ownerClerkId, userId)))
    .returning();
  if (!device) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(device));
});

router.delete("/remote/devices/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id as string);
  await db.delete(remoteDevicesTable).where(and(eq(remoteDevicesTable.id, id), eq(remoteDevicesTable.ownerClerkId, userId)));
  res.json({ ok: true });
});

// ── Sessions ─────────────────────────────────────────────────────────────────

router.get("/remote/sessions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const sessions = await db
    .select()
    .from(remoteSessionsTable)
    .where(eq(remoteSessionsTable.ownerClerkId, userId))
    .orderBy(desc(remoteSessionsTable.startedAt));
  res.json(sessions.map(serialize));
});

router.post("/remote/sessions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const schema = z.object({
    deviceId: z.number(),
    technicianName: z.string(),
    recorded: z.boolean().optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [session] = await db
    .insert(remoteSessionsTable)
    .values({ ownerClerkId: userId, technicianClerkId: userId, technicianName: parsed.data.technicianName, deviceId: parsed.data.deviceId, recorded: parsed.data.recorded ?? false, notes: parsed.data.notes ?? null })
    .returning();
  res.status(201).json(serialize(session));
});

router.patch("/remote/sessions/:id/end", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id as string);
  const now = new Date();
  const [session] = await db
    .select()
    .from(remoteSessionsTable)
    .where(eq(remoteSessionsTable.id, id));
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  if (session.ownerClerkId !== userId && session.technicianClerkId !== userId && !(await isAdmin(userId))) {
    res.status(403).json({ error: "Not authorized to end this session" }); return;
  }
  const duration = session.startedAt ? Math.round((now.getTime() - session.startedAt.getTime()) / 1000) : 0;
  const [updated] = await db
    .update(remoteSessionsTable)
    .set({ status: "ended", endedAt: now, duration })
    .where(eq(remoteSessionsTable.id, id))
    .returning();
  res.json(serialize(updated));
});

// ── Support Requests ─────────────────────────────────────────────────────────

router.get("/remote/requests", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const requests = await db
    .select()
    .from(remoteSupportRequestsTable)
    .where(eq(remoteSupportRequestsTable.requesterClerkId, userId))
    .orderBy(desc(remoteSupportRequestsTable.createdAt));
  res.json(requests.map(serialize));
});

router.get("/remote/requests/all", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" }); return;
  }
  const allRequests = await db
    .select()
    .from(remoteSupportRequestsTable)
    .orderBy(desc(remoteSupportRequestsTable.createdAt));
  res.json(allRequests.map(serialize));
});

router.post("/remote/requests", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const schema = z.object({
    requesterName: z.string(),
    message: z.string().min(1),
    deviceId: z.number().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [request] = await db
    .insert(remoteSupportRequestsTable)
    .values({ requesterClerkId: userId, requesterName: parsed.data.requesterName, message: parsed.data.message, deviceId: parsed.data.deviceId ?? null, priority: parsed.data.priority ?? "normal" })
    .returning();
  res.status(201).json(serialize(request));
});

// ── Launch (create a meeting for a remote session) ───────────────────────────

router.post("/remote/launch", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const schema = z.object({
    deviceName: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const suffix = Math.random().toString(36).slice(2, 11).toUpperCase();
  const meetingCode = suffix.slice(0, 3) + "-" + suffix.slice(3, 6) + "-" + suffix.slice(6, 9);
  const title = parsed.data.deviceName
    ? `Remote Session: ${parsed.data.deviceName}`
    : "Remote Session";
  const [meeting] = await db
    .insert(meetingsTable)
    .values({
      hostClerkId: userId,
      hostName: "Remote Session",
      title,
      meetingCode,
      type: "instant",
      status: "active",
      startedAt: new Date(),
    })
    .returning();
  // Also register the launcher as a host participant so RC participant checks pass
  await db.insert(participantsTable).values({
    meetingId: meeting.id,
    clerkId: userId,
    displayName: "Remote Host",
    role: "host",
    status: "active",
    joinedAt: new Date(),
  });
  // Return a LiveKit token so the caller can join the room directly via SDK
  const at = new AccessToken(
    process.env["LIVEKIT_API_KEY"] ?? "",
    process.env["LIVEKIT_API_SECRET"] ?? "",
    { identity: userId, name: parsed.data.deviceName ?? "Remote Host", ttl: 3600 }
  );
  at.addGrant({ roomJoin: true, room: meetingCode, canPublish: true, canSubscribe: true });
  const livekitToken = await at.toJwt();
  res.status(201).json({ meetingCode: meeting.meetingCode, meetingId: meeting.id, livekitToken });
});

// Alias: /remote-access/launch → same handler as /remote/launch
// Satisfies the API contract spec which refers to this path.
router.post("/remote-access/launch", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const schema = z.object({ deviceName: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const suffix = Math.random().toString(36).slice(2, 11).toUpperCase();
  const meetingCode = suffix.slice(0, 3) + "-" + suffix.slice(3, 6) + "-" + suffix.slice(6, 9);
  const title = parsed.data.deviceName ? `Remote Session: ${parsed.data.deviceName}` : "Remote Session";
  const [meeting] = await db
    .insert(meetingsTable)
    .values({ hostClerkId: userId, hostName: "Remote Session", title, meetingCode, type: "instant", status: "active", startedAt: new Date() })
    .returning();
  await db.insert(participantsTable).values({
    meetingId: meeting.id, clerkId: userId, displayName: "Remote Host", role: "host", status: "active", joinedAt: new Date(),
  });
  const at = new AccessToken(
    process.env["LIVEKIT_API_KEY"] ?? "",
    process.env["LIVEKIT_API_SECRET"] ?? "",
    { identity: userId, name: parsed.data.deviceName ?? "Remote Host", ttl: 3600 }
  );
  at.addGrant({ roomJoin: true, room: meetingCode, canPublish: true, canSubscribe: true });
  const livekitToken = await at.toJwt();
  res.status(201).json({ meetingCode: meeting.meetingCode, meetingId: meeting.id, livekitToken });
});

router.patch("/remote/requests/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id as string);
  const schema = z.object({
    status: z.enum(["pending", "active", "resolved", "declined"]).optional(),
    technicianClerkId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  // Fetch existing request first to enforce ownership.
  const [existing] = await db
    .select()
    .from(remoteSupportRequestsTable)
    .where(eq(remoteSupportRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  // Allow: the requester who submitted it, the assigned technician, or an admin.
  const isOwner = existing.requesterClerkId === userId;
  const isTech  = existing.technicianClerkId !== null && existing.technicianClerkId === userId;
  if (!isOwner && !isTech && !(await isAdmin(userId))) {
    res.status(403).json({ error: "Not authorized to update this request" }); return;
  }
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "resolved" || parsed.data.status === "declined") {
    updates.resolvedAt = new Date();
  }
  const [updated] = await db
    .update(remoteSupportRequestsTable)
    .set(updates)
    .where(eq(remoteSupportRequestsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(updated));
});

// ── In-memory RC state ───────────────────────────────────────────────────────
// Tracks who has control and whether the host is currently sharing per room.
// Used by mobile clients to poll for grant/revoke without LiveKit SDK.
const rcGrantState = new Map<string, string | null>(); // roomName -> controllerClerkId | null
const rcSharingState = new Map<string, boolean>();      // roomName -> isHostSharing
const rcPausedState = new Map<string, boolean>();       // roomName -> isRcPaused

// ── Shared helper: verify caller is a participant in a meeting ───────────────
async function verifyParticipant(meetingId: number, userId: string): Promise<boolean> {
  const [p] = await db.select({ id: participantsTable.id })
    .from(participantsTable)
    .where(and(eq(participantsTable.meetingId, meetingId), eq(participantsTable.clerkId, userId)))
    .limit(1);
  return !!p;
}

// ── RC state endpoints (for mobile polling) ──────────────────────────────────

router.get("/remote/rc-state", requireAuth, async (req, res): Promise<void> => {
  const roomName = req.query["roomName"] as string;
  if (!roomName) { res.status(400).json({ error: "roomName required" }); return; }
  const [meeting] = await db.select({ id: meetingsTable.id })
    .from(meetingsTable).where(eq(meetingsTable.meetingCode, roomName)).limit(1);
  if (!meeting) { res.status(404).json({ error: "Room not found" }); return; }
  const userId = (req as any).userId as string;
  if (!(await verifyParticipant(meeting.id, userId))) {
    res.status(403).json({ error: "Not a participant in this room" }); return;
  }
  res.json({
    grantedTo: rcGrantState.get(roomName) ?? null,
    isHostSharing: rcSharingState.get(roomName) ?? false,
  });
});

router.post("/remote/rc-state", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    roomName: z.string().min(1),
    grantedTo: z.string().nullable().optional(),
    isSharing: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [meeting] = await db.select({ id: meetingsTable.id })
    .from(meetingsTable).where(eq(meetingsTable.meetingCode, parsed.data.roomName)).limit(1);
  if (!meeting) { res.status(404).json({ error: "Room not found" }); return; }
  const userId = (req as any).userId as string;
  // Only the meeting host may mutate RC state (grantedTo, isSharing).
  // Any non-host participant could otherwise inject an unauthorized grant or
  // falsely set isSharing=true to trick mobile clients into enabling the
  // Control button.
  const [participant] = await db.select({ role: participantsTable.role })
    .from(participantsTable)
    .where(and(eq(participantsTable.meetingId, meeting.id), eq(participantsTable.clerkId, userId)))
    .limit(1);
  if (!participant) { res.status(403).json({ error: "Not a participant in this room" }); return; }
  if (participant.role !== "host") { res.status(403).json({ error: "Only the meeting host can update RC state" }); return; }
  if (parsed.data.grantedTo !== undefined) rcGrantState.set(parsed.data.roomName, parsed.data.grantedTo ?? null);
  if (parsed.data.isSharing !== undefined) rcSharingState.set(parsed.data.roomName, parsed.data.isSharing);
  res.json({ ok: true });
});

// ── RC event proxy ────────────────────────────────────────────────────────────
// Mobile clients POST here to publish an RC data message into a LiveKit room
// via the server-side Admin SDK.
//
// Supported types (must match useLiveKit.ts + mobile sendRc* helpers):
//   Controller input: rc-request, rc-cancel, rc-revoke, rc-click, rc-double-click, rc-key-tap,
//                     rc-move, rc-scroll,
//                     rc-drag-start, rc-drag-to, rc-drag-end,
//                     rc-clipboard-push, rc-clipboard-pull
router.post("/remote/rc-event", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    roomName: z.string().min(1),
    type: z.enum([
      "rc-request", "rc-cancel", "rc-revoke", "rc-click", "rc-double-click", "rc-key-tap",
      "rc-move", "rc-scroll",
      "rc-drag-start", "rc-drag-to", "rc-drag-end",
      "rc-clipboard-push", "rc-clipboard-pull",
      "rc-pause", "rc-resume",
    ]),
    name: z.string().optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    button: z.enum(["left", "right"]).optional(),
    key: z.string().optional(),
    modifiers: z.array(z.string()).optional(),
    // Scroll deltas (raw pixels, matching browser wheel event scale)
    dx: z.number().optional(),
    dy: z.number().optional(),
    // Clipboard push payload — cap at 1 MiB to prevent abuse
    text: z.string().max(1_048_576).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [meeting] = await db.select({ id: meetingsTable.id })
    .from(meetingsTable).where(eq(meetingsTable.meetingCode, parsed.data.roomName)).limit(1);
  if (!meeting) { res.status(404).json({ error: "Room not found" }); return; }

  // Security: caller must be a registered participant in the room
  const userId = (req as any).userId as string;
  const [callerParticipant] = await db.select({ role: participantsTable.role })
    .from(participantsTable)
    .where(and(eq(participantsTable.meetingId, meeting.id), eq(participantsTable.clerkId, userId)))
    .limit(1);
  if (!callerParticipant) {
    res.status(403).json({ error: "Not a participant in this room" }); return;
  }

  const { type, roomName } = parsed.data;

  // Caller-role enforcement per event type:
  // • Input events (click/key/drag/clipboard) — only the currently granted controller
  // • rc-revoke — granted controller OR host may revoke
  // • rc-request — any participant (checked above via membership)
  const INPUT_TYPES = new Set([
    "rc-click", "rc-double-click", "rc-key-tap",
    "rc-move", "rc-scroll",
    "rc-drag-start", "rc-drag-to", "rc-drag-end",
    "rc-clipboard-push", "rc-clipboard-pull",
  ]);
  if (INPUT_TYPES.has(type)) {
    const grantedTo = rcGrantState.get(roomName);
    if (grantedTo !== userId) {
      res.status(403).json({ error: "You are not the currently granted controller" }); return;
    }
    // Block input events while the sharer has paused RC.
    if (rcPausedState.get(roomName)) {
      res.status(403).json({ error: "Remote control is currently paused" }); return;
    }
  } else if (type === "rc-revoke") {
    const grantedTo = rcGrantState.get(roomName);
    const isHost = callerParticipant.role === "host";
    if (grantedTo !== userId && !isHost) {
      res.status(403).json({ error: "Only the granted controller or host can revoke control" }); return;
    }
    // Clear server-side grant immediately so the race window where a just-revoked
    // controller could still send input is eliminated.
    rcGrantState.set(roomName, null);
    rcPausedState.set(roomName, false);
  } else if (type === "rc-pause") {
    // Only the host/sharer may pause.
    if (callerParticipant.role !== "host") {
      res.status(403).json({ error: "Only the meeting host can pause remote control" }); return;
    }
    rcPausedState.set(roomName, true);
  } else if (type === "rc-resume") {
    if (callerParticipant.role !== "host") {
      res.status(403).json({ error: "Only the meeting host can resume remote control" }); return;
    }
    rcPausedState.set(roomName, false);
  }

  const message: Record<string, unknown> = {
    type: parsed.data.type,
    from: userId,
    name: parsed.data.name,
    x: parsed.data.x,
    y: parsed.data.y,
    button: parsed.data.button,
    key: parsed.data.key,
    modifiers: parsed.data.modifiers,
    dx: parsed.data.dx,
    dy: parsed.data.dy,
    text: parsed.data.text,
  };
  const payload = new TextEncoder().encode(JSON.stringify(message));

  // Audit log — fire-and-forget for events of compliance interest.
  // Written before the LiveKit publish so the record exists even when the room
  // is not yet live (no recipients yet — still a valid event to audit).
  const AUDIT_TYPES = new Set(["rc-request", "rc-revoke", "rc-pause", "rc-resume", "rc-double-click", "rc-clipboard-push", "rc-clipboard-pull"]);
  if (AUDIT_TYPES.has(type)) {
    db.insert(rcAuditLogTable).values({
      roomName,
      actorClerkId: userId,
      action: type,
      details: type === "rc-request" ? { name: parsed.data.name } : undefined,
    }).catch(() => { /* audit failures must not break the main flow */ });
  }

  try {
    const rooms = getLiveKitRooms();
    await (rooms as any).sendData(parsed.data.roomName, payload, 0);

    // Broadcast cursor position for any event that carries coordinates so mobile
    // clients can show a live cursor dot without a separate pointer event.
    const CURSOR_EVENTS = new Set(["rc-click", "rc-double-click", "rc-move", "rc-drag-start", "rc-drag-to", "rc-drag-end"]);
    if (CURSOR_EVENTS.has(type) && typeof parsed.data.x === "number" && typeof parsed.data.y === "number") {
      broadcastCursor(parsed.data.roomName, parsed.data.x, parsed.data.y);
    }

    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // "requested room does not exist" means no one has joined LiveKit yet —
    // the event was valid but had no recipients.  Return 200 rather than 502
    // so callers don't need to handle a spurious error for this normal condition.
    if (msg.includes("requested room does not exist") || msg.includes("room not found")) {
      res.json({ ok: true, noRoom: true });
      return;
    }
    res.status(502).json({ error: `LiveKit publish failed: ${msg}` });
  }
});

// ── RC pointer relay ────────────────────────────────────────────────────────
// Desktop hosts call this to relay real-time cursor position back to subscribed
// mobile clients. Mobile clients consume this via the /api/ws/rc-cursor WebSocket.
router.post("/remote/rc-pointer", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    roomName: z.string().min(1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [meeting] = await db.select({ id: meetingsTable.id })
    .from(meetingsTable).where(eq(meetingsTable.meetingCode, parsed.data.roomName)).limit(1);
  if (!meeting) { res.status(404).json({ error: "Room not found" }); return; }

  const userId = (req as any).userId as string;
  const [participant] = await db.select({ role: participantsTable.role })
    .from(participantsTable)
    .where(and(eq(participantsTable.meetingId, meeting.id), eq(participantsTable.clerkId, userId)))
    .limit(1);
  if (!participant) { res.status(403).json({ error: "Not a participant" }); return; }
  // Security: only the host machine (which holds the screen-share and the
  // cursor) is authorised to relay cursor position. Without this check any
  // participant could spam fake cursor positions to confuse other clients.
  if (participant.role !== "host") {
    res.status(403).json({ error: "Only the meeting host can relay cursor position" }); return;
  }

  broadcastCursor(parsed.data.roomName, parsed.data.x, parsed.data.y);
  res.json({ ok: true });
});

// ── RC audit endpoint (web-client path) ──────────────────────────────────────
// The LiveKit data-channel path (web grant/deny/revoke/pause/resume) bypasses
// the rc-event proxy, so the web client calls this separately to write audit rows.
// The mobile REST path already audits inside the rc-event handler above.
router.post("/remote/rc-audit", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    roomName: z.string().min(1),
    action: z.string().min(1),
    targetClerkId: z.string().nullable().optional(),
    details: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [meeting] = await db.select({ id: meetingsTable.id })
    .from(meetingsTable).where(eq(meetingsTable.meetingCode, parsed.data.roomName)).limit(1);
  if (!meeting) { res.status(404).json({ error: "Room not found" }); return; }
  const userId = (req as any).userId as string;
  if (!(await verifyParticipant(meeting.id, userId))) {
    res.status(403).json({ error: "Not a participant in this room" }); return;
  }
  await db.insert(rcAuditLogTable).values({
    roomName: parsed.data.roomName,
    actorClerkId: userId,
    action: parsed.data.action,
    targetClerkId: parsed.data.targetClerkId ?? null,
    details: (parsed.data.details ?? null) as Record<string, unknown> | null,
  });
  res.json({ ok: true });
});

export default router;
