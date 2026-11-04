import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { and, eq } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  db,
  chatMessagesTable,
  chatParticipantsTable,
  communityChannelsTable,
  communityMembersTable,
  groupsTable,
  groupPostsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { resolveGroupMembership } from "../lib/groupHelpers";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

async function canReadAttachment(userId: string, objectPath: string): Promise<boolean> {
  const messages = await db
    .select({ roomId: chatMessagesTable.roomId })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.fileObjectPath, objectPath));
  for (const message of messages) {
    const channel = await db
      .select({ communityId: communityChannelsTable.communityId })
      .from(communityChannelsTable)
      .where(eq(communityChannelsTable.chatRoomId, message.roomId))
      .then((rows) => rows[0]);
    if (channel) {
      const member = await db
        .select({ clerkId: communityMembersTable.clerkId })
        .from(communityMembersTable)
        .where(and(
          eq(communityMembersTable.communityId, channel.communityId),
          eq(communityMembersTable.clerkId, userId),
        ))
        .then((rows) => rows[0]);
      if (member) return true;
      continue;
    }

    const participant = await db
      .select({ clerkId: chatParticipantsTable.clerkId })
      .from(chatParticipantsTable)
      .where(and(
        eq(chatParticipantsTable.roomId, message.roomId),
        eq(chatParticipantsTable.clerkId, userId),
      ))
      .then((rows) => rows[0]);
    if (participant) return true;
  }

  const groupPosts = await db
    .select({ groupId: groupPostsTable.groupId })
    .from(groupPostsTable)
    .where(eq(groupPostsTable.fileObjectPath, objectPath));
  for (const groupPost of groupPosts) {
    const group = await db
      .select({ ownerClerkId: groupsTable.ownerClerkId })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupPost.groupId))
      .then((rows) => rows[0]);
    if (group?.ownerClerkId === userId || await resolveGroupMembership(groupPost.groupId, userId)) {
      return true;
    }
  }
  return false;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.post("/storage/download-url", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    const objectPath = typeof req.body?.objectPath === "string" ? req.body.objectPath : "";
    if (!userId || !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "Valid objectPath required" });
      return;
    }
    if (!(await canReadAttachment(userId, objectPath))) {
      res.status(403).json({ error: "Not authorized to access this attachment" });
      return;
    }
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const [downloadURL] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
      version: "v4",
    });
    res.json({ downloadURL });
  } catch (error) {
    req.log.error({ err: error }, "Error creating attachment download URL");
    res.status(500).json({ error: "Failed to open attachment" });
  }
});

router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    if (!userId || !(await canReadAttachment(userId, objectPath))) {
      res.status(403).json({ error: "Not authorized to access this attachment" });
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
