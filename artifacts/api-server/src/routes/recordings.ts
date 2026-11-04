import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, recordingsTable, meetingsTable } from "@workspace/db";
import {
  GetRecordingParams,
  DeleteRecordingParams,
  CreateRecordingParams,
  CreateRecordingBody,
  StopRecordingParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { isAdmin } from "../lib/permissions";
import { objectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import multer from "multer";
import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from "livekit-server-sdk";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const router: IRouter = Router();

// ─── Egress / S3 helpers ──────────────────────────────────────────────────────

interface EgressConfig {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string;
}

function getEgressConfig(): EgressConfig | null {
  const livekitUrl = process.env["LIVEKIT_URL"];
  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  const bucket = process.env["EGRESS_S3_BUCKET"];
  const region = process.env["EGRESS_S3_REGION"];
  const accessKey = process.env["EGRESS_S3_ACCESS_KEY"];
  const secretKey = process.env["EGRESS_S3_SECRET_KEY"];
  const endpoint = process.env["EGRESS_S3_ENDPOINT"];

  if (!livekitUrl || !apiKey || !apiSecret || !bucket || !region || !accessKey || !secretKey) {
    return null;
  }
  return { livekitUrl, apiKey, apiSecret, bucket, region, accessKey, secretKey, endpoint };
}

function buildEgressClient(cfg: EgressConfig) {
  return new EgressClient(cfg.livekitUrl, cfg.apiKey, cfg.apiSecret);
}

function buildS3Client(cfg: EgressConfig) {
  return new S3Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
  });
}

async function generateS3DownloadUrl(cfg: EgressConfig, key: string, ttlSec: number): Promise<string> {
  const client = buildS3Client(cfg);
  const command = new GetObjectCommand({ Bucket: cfg.bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: ttlSec });
}

/**
 * After stopEgress is called, LiveKit transitions through ENDING → COMPLETE
 * (or FAILED/ABORTED). We poll in the background so the HTTP response to the
 * mobile client is immediate. The recording row transitions:
 *   recording → processing (on stop) → available (on EGRESS_COMPLETE)
 */
async function pollEgressCompletion(cfg: EgressConfig, egressId: string, recordingId: number) {
  const client = buildEgressClient(cfg);
  const deadline = Date.now() + 5 * 60 * 1000; // 5-minute max wait
  const POLL_INTERVAL = 5_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    try {
      const list = await client.listEgress({ egressId });
      const info = list[0];
      if (!info) break;

      const status = Number(info.status);
      // EGRESS_COMPLETE=3, EGRESS_FAILED=4, EGRESS_ABORTED=5, EGRESS_LIMIT_REACHED=6
      if (status === EgressStatus.EGRESS_COMPLETE) {
        await db
          .update(recordingsTable)
          .set({ status: "available" })
          .where(eq(recordingsTable.id, recordingId));
        logger.info({ egressId, recordingId }, "egress complete — recording available");
        break;
      }
      if (status >= EgressStatus.EGRESS_FAILED) {
        await db
          .update(recordingsTable)
          .set({ status: "failed" })
          .where(eq(recordingsTable.id, recordingId));
        logger.warn({ egressId, recordingId, status }, "egress ended with failure");
        break;
      }
    } catch (err) {
      logger.warn({ egressId, err }, "egress poll error (will retry)");
    }
  }
}

// ─── Response shape ───────────────────────────────────────────────────────────

function toRecordingResponse(r: any) {
  return {
    ...r,
    startedAt: r.startedAt.toISOString(),
    stoppedAt: r.stoppedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// ─── GET /recordings ──────────────────────────────────────────────────────────

router.get("/recordings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const recordings = await db
    .select()
    .from(recordingsTable)
    .where(eq(recordingsTable.initiatedByClerkId, userId))
    .orderBy(desc(recordingsTable.createdAt));

  res.json(recordings.map(toRecordingResponse));
});

// ─── GET /recordings/:id ──────────────────────────────────────────────────────

router.get("/recordings/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetRecordingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [recording] = await db
    .select()
    .from(recordingsTable)
    .where(eq(recordingsTable.id, params.data.id));

  if (!recording) { res.status(404).json({ error: "Recording not found" }); return; }

  if (recording.initiatedByClerkId === userId) {
    res.json(toRecordingResponse(recording));
    return;
  }

  const [[meeting], admin] = await Promise.all([
    db.select({ hostClerkId: meetingsTable.hostClerkId })
      .from(meetingsTable)
      .where(eq(meetingsTable.id, recording.meetingId)),
    isAdmin(userId),
  ]);

  if (admin || meeting?.hostClerkId === userId) {
    res.json(toRecordingResponse(recording));
    return;
  }

  res.status(403).json({ error: "You do not have permission to view this recording" });
});

// ─── DELETE /recordings/:id ───────────────────────────────────────────────────

router.delete("/recordings/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteRecordingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(recordingsTable)
    .where(eq(recordingsTable.id, params.data.id));

  if (!existing) { res.status(404).json({ error: "Recording not found" }); return; }

  const [[meeting], admin] = await Promise.all([
    db.select({ hostClerkId: meetingsTable.hostClerkId })
      .from(meetingsTable)
      .where(eq(meetingsTable.id, existing.meetingId)),
    isAdmin(userId),
  ]);

  if (!admin && meeting?.hostClerkId !== userId) {
    res.status(403).json({ error: "Only the meeting host or an admin can delete recordings" });
    return;
  }

  // Stop any active egress before deleting the row
  const cfg = getEgressConfig();
  if (cfg && existing.egressId && existing.status === "recording") {
    try {
      await buildEgressClient(cfg).stopEgress(existing.egressId);
    } catch {
      // best-effort
    }
  }

  await db.delete(recordingsTable).where(eq(recordingsTable.id, params.data.id));
  res.sendStatus(204);
});

// ─── POST /meetings/:id/recordings ────────────────────────────────────────────
// Starts a LiveKit Egress room-composite recording.
// Requires LIVEKIT_*, EGRESS_S3_BUCKET, EGRESS_S3_REGION,
// EGRESS_S3_ACCESS_KEY, EGRESS_S3_SECRET_KEY to be set.
// EGRESS_S3_ENDPOINT is optional (for Cloudflare R2, MinIO, etc.).
router.post("/meetings/:id/recordings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CreateRecordingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateRecordingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.id));

  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

  const isMeetingHost = meeting.hostClerkId === userId;
  if (!isMeetingHost) {
    const admin = await isAdmin(userId);
    if (!admin) {
      res.status(403).json({ error: "Only the meeting host or an admin can start a recording" });
      return;
    }
  }

  const cfg = getEgressConfig();
  if (!cfg) {
    res.status(422).json({
      error:
        "Server-side recording requires S3 storage credentials. " +
        "Set EGRESS_S3_BUCKET, EGRESS_S3_REGION, EGRESS_S3_ACCESS_KEY, " +
        "EGRESS_S3_SECRET_KEY (and optionally EGRESS_S3_ENDPOINT for " +
        "Cloudflare R2 or other S3-compatible storage) in your environment secrets.",
    });
    return;
  }

  // Insert the recording row first so we have an ID for the S3 key.
  const [recording] = await db
    .insert(recordingsTable)
    .values({
      meetingId: params.data.id,
      meetingTitle: meeting.title,
      initiatedByClerkId: userId,
      status: "recording",
    })
    .returning();

  // S3 key: recordings/meeting-{meetingId}/recording-{id}-{uuid}.mp4
  const s3Key = `recordings/meeting-${meeting.id}/recording-${recording.id}-${randomUUID()}.mp4`;

  try {
    const egressClient = buildEgressClient(cfg);

    // EncodedFileOutput.output is a protobuf oneof — the S3 destination is
    // encoded as { case: "s3", value: S3Upload } per the @bufbuild/protobuf API.
    // S3Upload uses "secret" (not "secretKey") as the field name.
    const fileOutput = new EncodedFileOutput({
      filepath: s3Key,
      fileType: EncodedFileType.MP4,
      disableManifest: true,
      output: {
        case: "s3",
        value: new S3Upload({
          accessKey: cfg.accessKey,
          secret: cfg.secretKey,
          region: cfg.region,
          bucket: cfg.bucket,
          ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
        }),
      },
    });

    const egressInfo = await egressClient.startRoomCompositeEgress(
      meeting.meetingCode,
      fileOutput,
      { layout: "grid" },
    );

    // Update recording row with egressId and fileUrl
    const [updated] = await db
      .update(recordingsTable)
      .set({
        egressId: egressInfo.egressId,
        // Store as "s3-egress:{key}" so the download endpoint knows the source
        fileUrl: `s3-egress:${s3Key}`,
      })
      .where(eq(recordingsTable.id, recording.id))
      .returning();

    logger.info({ egressId: egressInfo.egressId, meetingCode: meeting.meetingCode, s3Key }, "egress started");
    res.status(201).json(toRecordingResponse(updated));
  } catch (err: any) {
    // Clean up the recording row if Egress could not be started
    await db.delete(recordingsTable).where(eq(recordingsTable.id, recording.id));
    logger.error({ err }, "failed to start egress");
    res.status(500).json({ error: `Could not start recording: ${err?.message ?? "unknown error"}` });
  }
});

// ─── POST /recordings/:id/stop ────────────────────────────────────────────────

router.post("/recordings/:id/stop", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = StopRecordingParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(recordingsTable)
    .where(eq(recordingsTable.id, params.data.id));

  if (!existing) { res.status(404).json({ error: "Recording not found" }); return; }

  if (existing.initiatedByClerkId !== userId) {
    const [[meeting], admin] = await Promise.all([
      db.select({ hostClerkId: meetingsTable.hostClerkId })
        .from(meetingsTable)
        .where(eq(meetingsTable.id, existing.meetingId)),
      isAdmin(userId),
    ]);
    if (!admin && meeting?.hostClerkId !== userId) {
      res.status(403).json({ error: "Only the recording initiator, meeting host, or an admin can stop a recording" });
      return;
    }
  }

  const stoppedAt = new Date();
  const durationSeconds = existing.startedAt
    ? Math.round((stoppedAt.getTime() - existing.startedAt.getTime()) / 1000)
    : 0;

  // Tell LiveKit to stop the Egress job
  const cfg = getEgressConfig();
  if (cfg && existing.egressId) {
    try {
      await buildEgressClient(cfg).stopEgress(existing.egressId);
      logger.info({ egressId: existing.egressId }, "egress stop requested");
    } catch (err) {
      logger.warn({ egressId: existing.egressId, err }, "stopEgress call failed (egress may have already ended)");
    }
  }

  // Mark as "processing" — background polling will flip to "available" when
  // the Egress finishes encoding and uploading the file to S3.
  const [recording] = await db
    .update(recordingsTable)
    .set({ status: "processing", stoppedAt, durationSeconds })
    .where(eq(recordingsTable.id, params.data.id))
    .returning();

  // Respond immediately — client can poll GET /recordings/:id for status.
  res.json(toRecordingResponse(recording));

  // Fire-and-forget background poll
  if (cfg && existing.egressId) {
    pollEgressCompletion(cfg, existing.egressId, params.data.id).catch((err) =>
      logger.warn({ err, egressId: existing.egressId }, "pollEgressCompletion error"),
    );
  }
});

// ─── POST /recordings/:id/upload ─────────────────────────────────────────────
// Legacy endpoint kept for backwards-compatibility. New recordings use Egress.
router.post(
  "/recordings/:id/upload",
  requireAuth,
  upload.single("recording"),
  async (req, res): Promise<void> => {
    const userId = (req as any).userId as string;
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid recording id" }); return; }

    const [existing] = await db
      .select()
      .from(recordingsTable)
      .where(eq(recordingsTable.id, id));

    if (!existing) { res.status(404).json({ error: "Recording not found" }); return; }

    if (existing.initiatedByClerkId !== userId) {
      const [[meeting], admin] = await Promise.all([
        db.select({ hostClerkId: meetingsTable.hostClerkId })
          .from(meetingsTable)
          .where(eq(meetingsTable.id, existing.meetingId)),
        isAdmin(userId),
      ]);
      if (!admin && meeting?.hostClerkId !== userId) {
        res.status(403).json({ error: "Not authorized to upload this recording" });
        return;
      }
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded (field name must be 'recording')" });
      return;
    }

    const mimeType = req.file.mimetype || "audio/m4a";
    const ext =
      mimeType.includes("m4a") || mimeType.includes("aac") ? ".m4a"
      : mimeType.includes("mp4") ? ".mp4"
      : mimeType.includes("ogg") ? ".ogg"
      : mimeType.includes("webm") ? ".webm"
      : ".audio";

    const filename = `recording-${existing.id}-${randomUUID()}${ext}`;
    const objectPath = await objectStorageService.uploadBuffer(req.file.buffer, filename, mimeType);

    const [updated] = await db
      .update(recordingsTable)
      .set({ fileUrl: objectPath, fileSizeBytes: req.file.size, status: "available" })
      .where(eq(recordingsTable.id, id))
      .returning();

    res.json(toRecordingResponse(updated));
  },
);

// ─── GET /recordings/:id/download-url ────────────────────────────────────────

router.get(
  "/recordings/:id/download-url",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as any).userId as string;
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid recording id" }); return; }

    const [recording] = await db
      .select()
      .from(recordingsTable)
      .where(eq(recordingsTable.id, id));

    if (!recording) { res.status(404).json({ error: "Recording not found" }); return; }

    if (recording.initiatedByClerkId !== userId) {
      const [[meeting], admin] = await Promise.all([
        db.select({ hostClerkId: meetingsTable.hostClerkId })
          .from(meetingsTable)
          .where(eq(meetingsTable.id, recording.meetingId)),
        isAdmin(userId),
      ]);
      if (!admin && meeting?.hostClerkId !== userId) {
        res.status(403).json({ error: "Not authorized to access this recording" });
        return;
      }
    }

    if (!recording.fileUrl) {
      res.status(404).json({ error: "No recording file available yet" });
      return;
    }

    try {
      // Egress recordings: fileUrl = "s3-egress:{s3Key}"
      if (recording.fileUrl.startsWith("s3-egress:")) {
        const cfg = getEgressConfig();
        if (!cfg) {
          res.status(500).json({ error: "S3 credentials not configured" });
          return;
        }
        const s3Key = recording.fileUrl.slice("s3-egress:".length);
        const url = await generateS3DownloadUrl(cfg, s3Key, 3600);
        res.json({ url });
        return;
      }

      // Legacy GCS recordings: fileUrl = "/objects/..."
      const url = await objectStorageService.generateSignedDownloadURL(recording.fileUrl, 3600);
      res.json({ url });
    } catch {
      res.status(500).json({ error: "Could not generate download URL" });
    }
  },
);

export default router;
