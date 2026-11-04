import { Router, type IRouter } from "express";
import twilio from "twilio";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getTwilioClient() {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token) return null;
  return twilio(sid, token);
}

router.post("/sms/send", requireAuth, async (req, res): Promise<void> => {
  const { to, body } = req.body as { to?: string; body?: string };

  if (!to || !body) {
    res.status(400).json({ error: "to and body are required" });
    return;
  }

  const from = process.env["TWILIO_PHONE_NUMBER"];
  if (!from) {
    res.status(500).json({ error: "Twilio phone number not configured" });
    return;
  }

  const client = getTwilioClient();
  if (!client) {
    res.status(500).json({ error: "Twilio not configured" });
    return;
  }

  try {
    const message = await client.messages.create({ to, from, body });
    logger.info({ sid: message.sid, to }, "SMS sent");
    res.json({ success: true, sid: message.sid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, to }, "SMS send failed");
    res.status(500).json({ error: msg });
  }
});

export default router;
