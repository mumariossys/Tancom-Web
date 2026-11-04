import { Router } from "express";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, meetingsTable, participantsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireAuth } from "../lib/auth";
import { normalizeMeetingCode } from "../lib/meetingCode";

const router = Router();

// Validate LiveKit credentials once at startup so problems surface in logs
// immediately rather than silently failing when users join meetings.
let credentialsValidated = false;
async function validateCredentialsOnce(apiKey: string, apiSecret: string, livekitUrl: string) {
  if (credentialsValidated) return;
  credentialsValidated = true;
  try {
    const svc = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
    await svc.listRooms();
    logger.info({ livekitHost: new URL(livekitUrl).host }, "livekit credentials OK");
  } catch (err) {
    logger.error(
      { livekitHost: (() => { try { return new URL(livekitUrl).host; } catch { return livekitUrl; } })(), err },
      "livekit credential check FAILED — check LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET secrets",
    );
  }
}

router.post("/livekit/token", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;

  const { roomName: roomNameRaw, displayName, maxParticipants } =
    req.body as { roomName?: string; displayName?: string; maxParticipants?: number };
  if (!roomNameRaw) {
    res.status(400).json({ error: "roomName is required" });
    return;
  }
  // Always normalise so iOS ("9DB-512-A75"), browser ("/room/9db512a75"), and
  // any other client all resolve to the same canonical room name regardless of
  // casing or dash presence. Without this, two clients that send the same
  // logical code in different formats get tokens for different LiveKit rooms and
  // can never see each other's video.
  const roomName = normalizeMeetingCode(roomNameRaw);

  // ── Authorization ──────────────────────────────────────────────────────────
  // Only the host or an already-admitted participant of THIS meeting may mint a
  // media token. Without this, any signed-in user could join (and eavesdrop on)
  // an arbitrary room by guessing its code. The client must POST the participant
  // row (and, for waiting-room meetings, be admitted) before requesting a token.
  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.meetingCode, roomName));

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  let authorized = userId === meeting.hostClerkId;
  if (!authorized) {
    const [participant] = await db
      .select({ id: participantsTable.id })
      .from(participantsTable)
      .where(
        and(
          eq(participantsTable.meetingId, meeting.id),
          eq(participantsTable.clerkId, userId),
          inArray(participantsTable.status, ["admitted", "active"]),
        ),
      );
    authorized = !!participant;
  }

  if (!authorized) {
    logger.warn(
      { room: roomName, userId },
      "livekit token denied — caller is not an admitted participant of this meeting",
    );
    res.status(403).json({ error: "Not authorized to join this meeting" });
    return;
  }

  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  const livekitUrl = process.env["LIVEKIT_URL"];

  if (!apiKey || !apiSecret || !livekitUrl) {
    logger.error("LIVEKIT_API_KEY, LIVEKIT_API_SECRET or LIVEKIT_URL not configured");
    res.status(500).json({ error: "LiveKit not configured" });
    return;
  }

  // Fire-and-forget credential validation (runs once per server process)
  void validateCredentialsOnce(apiKey, apiSecret, livekitUrl);

  // Pre-create the LiveKit room with the participant cap so LiveKit itself
  // enforces the limit as a second layer (our DB is the primary gate).
  // createRoom is idempotent — calling it on an existing room is a no-op.
  if (typeof maxParticipants === "number" && maxParticipants > 0) {
    try {
      const svc = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
      await svc.createRoom({ name: roomName, maxParticipants });
      logger.info({ room: roomName, maxParticipants }, "livekit room pre-created with participant cap");
    } catch (err) {
      // Non-fatal: the room may already exist, or LiveKit may not support createRoom
      // in this configuration. Log and continue — the DB cap is still enforced.
      logger.warn({ room: roomName, err }, "livekit createRoom failed (non-fatal)");
    }
  }

  // Append a short random suffix so the same Clerk user can join from multiple
  // devices (e.g. Desktop + iOS) simultaneously without LiveKit treating them as
  // the same participant and kicking one out. The display name is unchanged so
  // other participants still see "Mostafizur Chowdhury", not the raw identity.
  //
  // We store the plain userId in `metadata` so clients can map LiveKit participant
  // identity → Clerk user ID without parsing the random suffix. Without this,
  // cameraTracks is keyed by the full identity (e.g. "user_abc-xK9mP2qR") while
  // tile lookup uses the bare clerkId ("user_abc"), so video tracks are never found.
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `${userId}-${nanoid(8)}`,
    name: displayName ?? userId.slice(0, 8),
    metadata: userId,
    ttl: 7200, // 2 hours
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  // ── Invariant guard ─────────────────────────────────────────────────────────
  // The `metadata` field MUST equal userId. Without it, mobile clients key their
  // cameraTracks map by the raw identity (which has a nanoid suffix) instead of
  // the plain clerkId, so renderVideo() never finds the track and every
  // participant sees blank avatar tiles. Decode the JWT and assert immediately
  // so any future refactor that accidentally drops metadata produces a loud
  // server-side log rather than a silent client-side video failure.
  try {
    const [, payloadB64] = jwt.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    // LiveKit encodes the participant metadata as a top-level JWT claim
    // (`payload.metadata`), NOT inside `payload.video`. Checking the wrong
    // field caused the guard to silently mis-fire on every token without logging.
    const embeddedMetadata = payload.metadata;
    if (embeddedMetadata !== userId) {
      logger.error(
        { room: roomName, userId, embeddedMetadata },
        "livekit token metadata invariant violated — metadata !== userId; mobile video will be broken",
      );
    }
  } catch (guardErr) {
    logger.warn({ room: roomName, userId, guardErr }, "livekit token metadata guard parse error (non-fatal)");
  }

  const livekitHost = (() => { try { return new URL(livekitUrl).host; } catch { return livekitUrl; } })();
  logger.info({ room: roomName, userId, livekitHost }, "livekit token issued");
  // Return the URL alongside the token so the client never relies on a
  // build-time baked value — this prevents stale-URL issues after re-deployment.
  res.json({ token: jwt, livekitUrl });
});

// Receives connection-failure details from the browser so they show up in
// production logs (browser console is not visible server-side).
router.post("/livekit/error", async (req, res) => {
  const userId = (req as any).userId as string | undefined;
  const { room, attempt, message, name, code } =
    req.body as { room?: string; attempt?: number; message?: string; name?: string; code?: unknown };
  logger.error(
    { room, attempt, errName: name, errCode: code, errMessage: message, reporter: userId ?? "anon" },
    "livekit browser connect failure",
  );
  res.json({ ok: true });
});

export default router;
