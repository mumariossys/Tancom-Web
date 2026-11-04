import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import {
  db,
  chatParticipantsTable,
  chatRoomsTable,
  notificationsTable,
  userProfilesTable,
  contactsTable,
  communityChannelsTable,
  communityMembersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { isBlockedBetween, filterBlocked, mutedRecipients } from "../lib/blocking";

const router: IRouter = Router();

function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

function getLiveKitCredentials() {
  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

// ── LiveKit health check (no auth required — for diagnostics) ─────────────────
router.get("/calls/health", (_req, res): void => {
  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  const url = process.env["LIVEKIT_URL"];
  res.json({
    livekitUrl: url || null,
    livekitUrlSet: !!url,
    livekitUrlProtocol: url ? url.split(":")[0] : null,
    apiKeySet: !!apiKey,
    apiSecretSet: !!apiSecret,
    configured: !!(apiKey && apiSecret && url),
  });
});

async function generateToken(apiKey: string, apiSecret: string, userId: string, displayName: string, roomName: string): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: displayName,
    ttl: 3600,
  });
  token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return token.toJwt();
}

// ── Start a call in a DM/group room ───────────────────────────────────────────
router.post("/calls/start", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { roomId, callType } = req.body as { roomId?: number; callType?: "audio" | "video" };
  if (!roomId) { res.status(400).json({ error: "roomId required" }); return; }

  const creds = getLiveKitCredentials();
  if (!creds) { res.status(500).json({ error: "LiveKit not configured" }); return; }

  // Verify membership
  const participant = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId), eq(chatParticipantsTable.clerkId, userId)))
    .then((r) => r[0]);
  if (!participant) { res.status(403).json({ error: "Not a member" }); return; }

  const profile = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then((r) => r[0]);

  const callRoomName = `chat-call-${roomId}-${Date.now()}`;
  const token = await generateToken(creds.apiKey, creds.apiSecret, userId, profile?.name ?? userId.slice(0, 8), callRoomName);

  // Notify other participants
  const others = await db
    .select()
    .from(chatParticipantsTable)
    .where(and(eq(chatParticipantsTable.roomId, roomId)));

  let otherClerkIds = others.map((p) => p.clerkId).filter((id) => id !== userId);

  // Block enforcement: in a direct room, refuse the call outright if either
  // side blocked the other. In group rooms, don't notify blocked members.
  const room = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).then((r) => r[0]);
  if (room?.type === "direct" && otherClerkIds.length > 0) {
    if (await isBlockedBetween(userId, otherClerkIds[0])) {
      res.status(403).json({ error: "This user is not accepting calls from you" });
      return;
    }
  } else {
    otherClerkIds = await filterBlocked(userId, otherClerkIds);
  }

  if (otherClerkIds.length > 0) {
    // Mute enforcement: don't ring participants who muted the caller
    const muted = await mutedRecipients(userId, otherClerkIds);
    for (const clerkId of otherClerkIds) {
      if (muted.has(clerkId)) continue;
      await db.insert(notificationsTable).values({
        clerkId,
        type: "call",
        title: `Incoming ${callType ?? "video"} call`,
        body: `${profile?.name ?? "Someone"} is calling you`,
        relatedId: roomId,
        relatedType: "call",
      });
    }
    logger.info({ roomId, callRoomName, callerCount: otherClerkIds.length }, "call started");
  }

  res.json({
    callRoomName,
    token,
    livekitUrl: process.env["LIVEKIT_URL"] ?? "",
    callType: callType ?? "video",
  });
});

// ── Join a call ────────────────────────────────────────────────────────────────
router.post("/calls/join", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { callRoomName } = req.body as { callRoomName?: string };
  if (!callRoomName) { res.status(400).json({ error: "callRoomName required" }); return; }

  const creds = getLiveKitCredentials();
  if (!creds) { res.status(500).json({ error: "LiveKit not configured" }); return; }

  const profile = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then((r) => r[0]);

  const token = await generateToken(creds.apiKey, creds.apiSecret, userId, profile?.name ?? userId.slice(0, 8), callRoomName);

  res.json({
    callRoomName,
    token,
    livekitUrl: process.env["LIVEKIT_URL"] ?? "",
  });
});

// ── Direct peer-to-peer call (contact → contact) ───────────────────────────────
router.post("/calls/direct", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { targetClerkId, callType } = req.body as { targetClerkId?: string; callType?: "audio" | "video" };
  if (!targetClerkId) { res.status(400).json({ error: "targetClerkId required" }); return; }

  const creds = getLiveKitCredentials();
  if (!creds) { res.status(500).json({ error: "LiveKit not configured" }); return; }

  // Respect blocking (either direction).
  if (await isBlockedBetween(userId, targetClerkId)) {
    res.status(403).json({ error: "This user is not accepting calls from you" });
    return;
  }

  const profile = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then((r) => r[0]);
  const callerName = profile?.name ?? userId.slice(0, 8);

  // Stable room name so both sides agree (sorted IDs) with timestamp to make it unique
  const callRoomName = `direct-${[userId, targetClerkId].sort().join("-")}-${Date.now()}`;
  const token = await generateToken(creds.apiKey, creds.apiSecret, userId, callerName, callRoomName);

  // Mute enforcement: if the target muted the caller, create the notification
  // pre-read — it appears silently in their notification history, but never
  // rings (IncomingCallBanner only rings for unread notifications).
  const targetMutedCaller = (await mutedRecipients(userId, [targetClerkId])).has(targetClerkId);

  // Notify target with structured JSON body so IncomingCallBanner can parse it
  await db.insert(notificationsTable).values({
    clerkId: targetClerkId,
    read: targetMutedCaller,
    type: "call",
    title: `Incoming ${callType ?? "video"} call`,
    body: JSON.stringify({ callRoomName, callType: callType ?? "video", callerName, callerClerkId: userId }),
    relatedType: "call",
  });

  logger.info({ callRoomName, targetClerkId, callType }, "direct call started");

  res.json({
    callRoomName,
    token,
    livekitUrl: process.env["LIVEKIT_URL"] ?? "",
    callType: callType ?? "video",
  });
});

// ── Join a community voice channel ─────────────────────────────────────────────
router.post("/calls/voice-channel", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { channelId } = req.body as { channelId?: number };
  if (!channelId) { res.status(400).json({ error: "channelId required" }); return; }

  const creds = getLiveKitCredentials();
  if (!creds) { res.status(500).json({ error: "LiveKit not configured" }); return; }

  const channel = await db
    .select({
      id: communityChannelsTable.id,
      communityId: communityChannelsTable.communityId,
      type: communityChannelsTable.type,
    })
    .from(communityChannelsTable)
    .where(eq(communityChannelsTable.id, channelId))
    .then((rows) => rows[0]);
  if (!channel || channel.type !== "voice") {
    res.status(404).json({ error: "Voice channel not found" });
    return;
  }
  const membership = await db
    .select({ clerkId: communityMembersTable.clerkId })
    .from(communityMembersTable)
    .where(and(
      eq(communityMembersTable.communityId, channel.communityId),
      eq(communityMembersTable.clerkId, userId),
    ))
    .then((rows) => rows[0]);
  if (!membership) { res.status(403).json({ error: "Not a community member" }); return; }

  const profile = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then((r) => r[0]);

  const callRoomName = `voice-channel-${channelId}`;
  const token = await generateToken(creds.apiKey, creds.apiSecret, userId, profile?.name ?? userId.slice(0, 8), callRoomName);

  res.json({
    callRoomName,
    token,
    livekitUrl: process.env["LIVEKIT_URL"] ?? "",
  });
});

export default router;
