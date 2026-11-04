import { Router, type IRouter, type Request, type RequestHandler } from "express";
import twilio from "twilio";
import { eq, desc } from "drizzle-orm";
import { db, serverConfigTable, callLogTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getTwilioClient() {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token) return null;
  return twilio(sid, token);
}

/** Return the base URL visible to the outside world (handles the Replit proxy). */
function getPublicBase(req: Request): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim() ??
    req.protocol;
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0].trim() ??
    req.get("host") ??
    "localhost";
  return `${proto}://${host}`;
}

async function getOrCreateApiKey(
  client: twilio.Twilio,
): Promise<{ sid: string; secret: string }> {
  const [sidRow] = await db
    .select()
    .from(serverConfigTable)
    .where(eq(serverConfigTable.key, "twilio_api_key_sid"));
  const [secretRow] = await db
    .select()
    .from(serverConfigTable)
    .where(eq(serverConfigTable.key, "twilio_api_key_secret"));

  if (sidRow && secretRow) return { sid: sidRow.value, secret: secretRow.value };

  logger.info("Creating Twilio API Key for Voice SDK");
  const key = await client.newKeys.create({ friendlyName: "TanCom Voice" });
  await db
    .insert(serverConfigTable)
    .values([
      { key: "twilio_api_key_sid", value: key.sid },
      { key: "twilio_api_key_secret", value: key.secret },
    ])
    .onConflictDoNothing();

  return { sid: key.sid, secret: key.secret };
}

async function getOrCreateTwimlApp(
  client: twilio.Twilio,
  voiceUrl: string,
): Promise<string> {
  const [row] = await db
    .select()
    .from(serverConfigTable)
    .where(eq(serverConfigTable.key, "twilio_twiml_app_sid"));
  if (row) {
    try {
      await client.applications(row.value).update({ voiceUrl, voiceMethod: "POST" });
    } catch {
      // The existing application remains usable if its URL refresh fails.
    }
    return row.value;
  }

  const apps = await client.applications.list({ friendlyName: "TanCom Voice" });
  let sid: string;
  if (apps.length > 0) {
    await client.applications(apps[0].sid).update({ voiceUrl, voiceMethod: "POST" });
    sid = apps[0].sid;
  } else {
    const app = await client.applications.create({
      friendlyName: "TanCom Voice",
      voiceUrl,
      voiceMethod: "POST",
    });
    sid = app.sid;
  }

  await db
    .insert(serverConfigTable)
    .values({ key: "twilio_twiml_app_sid", value: sid })
    .onConflictDoNothing();
  return sid;
}

/**
 * Validate that a POST request genuinely originated from Twilio. Twilio signs
 * the full public URL and parsed POST parameters, so both voice webhooks are
 * rejected when credentials or the signature are missing or invalid.
 */
const validateTwilioSignature: RequestHandler = (req, res, next): void => {
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  if (!authToken) {
    logger.warn("TWILIO_AUTH_TOKEN not set — rejecting voice webhook");
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const signature = (req.headers["x-twilio-signature"] as string | undefined) ?? "";
  const url = `${getPublicBase(req)}${req.originalUrl}`;
  const params = (req.body ?? {}) as Record<string, string>;
  if (!twilio.validateRequest(authToken, signature, url, params)) {
    logger.warn({ url }, "Twilio signature validation failed");
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
};

/**
 * GET /api/calls/phone/token
 * Returns a short-lived Twilio Voice access token for the browser SDK.
 */
router.get("/calls/phone/token", requireAuth, async (req, res): Promise<void> => {
  const client = getTwilioClient();
  if (!client) {
    res.status(503).json({ error: "Phone calling is not configured on this server" });
    return;
  }

  const accountSid = process.env["TWILIO_ACCOUNT_SID"]!;
  const userId = (req as any).userId as string;
  const voiceUrl = `${getPublicBase(req)}/api/calls/phone/voice`;

  try {
    const [apiKey, twimlAppSid] = await Promise.all([
      getOrCreateApiKey(client),
      getOrCreateTwimlApp(client, voiceUrl),
    ]);
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    const token = new AccessToken(accountSid, apiKey.sid, apiKey.secret, {
      identity: userId,
      ttl: 3600,
    });
    token.addGrant(
      new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: false }),
    );
    res.json({ token: token.toJwt(), identity: userId });
  } catch (err) {
    logger.error({ err }, "Failed to generate Twilio Voice token");
    res.status(500).json({ error: "Could not initialise phone calling" });
  }
});

/**
 * POST /api/calls/phone/voice
 * TwiML webhook for outbound browser-SDK calls. The insert is awaited so the
 * later Dial action callback cannot race ahead of the call-log row.
 */
router.post(
  "/calls/phone/voice",
  validateTwilioSignature,
  async (req, res): Promise<void> => {
    const to = (req.body?.To ?? "") as string;
    const from = process.env["TWILIO_PHONE_NUMBER"] ?? "";
    const callSid = (req.body?.CallSid ?? "") as string;
    const rawIdentity = (req.body?.From ?? req.body?.Caller ?? "") as string;
    // Voice SDK supplies the access-token identity as "client:<clerk-user-id>".
    const identity = rawIdentity.startsWith("client:")
      ? rawIdentity.slice("client:".length)
      : rawIdentity;

    const twiml = new twilio.twiml.VoiceResponse();
    const sanitized = to.replace(/[^\d+]/g, "");
    if (sanitized.length >= 7) {
      const actionUrl = `${getPublicBase(req)}/api/calls/phone/status`;
      const dial = twiml.dial({
        callerId: from,
        timeout: 30,
        timeLimit: 14400,
        action: actionUrl,
      });
      dial.number(sanitized);

      if (callSid && identity) {
        try {
          await db
            .insert(callLogTable)
            .values({
              ownerClerkId: identity,
              phoneNumber: sanitized,
              callSid,
              status: "initiated",
            })
            .onConflictDoNothing();
        } catch (err) {
          logger.error({ err }, "Failed to insert call_log row");
        }
      }
    } else {
      twiml.say("The phone number provided is invalid.");
      twiml.hangup();
    }

    res.type("text/xml").send(twiml.toString());
  },
);

/**
 * POST /api/calls/phone/status
 * The Dial action's CallSid identifies the child call leg. ParentCallSid is
 * the browser SDK parent call that was saved in the call log.
 */
router.post(
  "/calls/phone/status",
  validateTwilioSignature,
  async (req, res): Promise<void> => {
    const parentSid = (req.body?.ParentCallSid ?? req.body?.CallSid ?? "") as string;
    const dialStatus = (
      (req.body?.DialCallStatus ?? req.body?.CallStatus ?? "completed") as string
    ).toLowerCase();
    const dialDuration = parseInt(req.body?.DialCallDuration ?? "0", 10);

    if (parentSid) {
      try {
        await db
          .update(callLogTable)
          .set({
            status: dialStatus,
            durationSeconds: Number.isNaN(dialDuration) ? null : dialDuration,
            updatedAt: new Date(),
          })
          .where(eq(callLogTable.callSid, parentSid));
      } catch (err) {
        logger.error({ err, parentSid }, "Failed to update call_log status");
      }
    }

    res.type("text/xml").send("<Response/>");
  },
);

/**
 * GET /api/calls/phone/history
 * Returns the authenticated user's most recent 100 calls, newest first.
 */
router.get(
  "/calls/phone/history",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as any).userId as string;
    try {
      const rows = await db
        .select()
        .from(callLogTable)
        .where(eq(callLogTable.ownerClerkId, userId))
        .orderBy(desc(callLogTable.createdAt))
        .limit(100);
      res.json(rows);
    } catch (err) {
      logger.error({ err }, "Failed to fetch call history");
      res.status(500).json({ error: "Could not fetch call history" });
    }
  },
);

export default router;