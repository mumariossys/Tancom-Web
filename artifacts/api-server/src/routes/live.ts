import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { liveStreamsTable, streamFollowersTable } from "@workspace/db/schema";
import { eq, and, desc, or, count, inArray } from "drizzle-orm";
import { AccessToken, IngressClient, IngressInput, RoomServiceClient } from "livekit-server-sdk";
import { nanoid } from "nanoid";

const router = Router();

function getLiveKitClients() {
  const url = process.env["LIVEKIT_URL"] ?? "";
  const key = process.env["LIVEKIT_API_KEY"] ?? "";
  const secret = process.env["LIVEKIT_API_SECRET"] ?? "";
  return {
    ingress: new IngressClient(url, key, secret),
    rooms: new RoomServiceClient(url, key, secret),
    key,
    secret,
    url,
  };
}

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = auth.userId;
  next();
}

async function enrichStream(
  stream: typeof liveStreamsTable.$inferSelect,
  viewerClerkId?: string,
) {
  const [followerResult] = await db
    .select({ count: count() })
    .from(streamFollowersTable)
    .where(eq(streamFollowersTable.streamerClerkId, stream.streamerClerkId));

  let isFollowing = false;
  if (viewerClerkId && viewerClerkId !== stream.streamerClerkId) {
    const follow = await db
      .select()
      .from(streamFollowersTable)
      .where(
        and(
          eq(streamFollowersTable.followerClerkId, viewerClerkId),
          eq(streamFollowersTable.streamerClerkId, stream.streamerClerkId),
        ),
      )
      .limit(1);
    isFollowing = follow.length > 0;
  }

  return {
    ...stream,
    startedAt: stream.startedAt?.toISOString() ?? null,
    endedAt: stream.endedAt?.toISOString() ?? null,
    createdAt: stream.createdAt.toISOString(),
    updatedAt: stream.updatedAt.toISOString(),
    followerCount: followerResult?.count ?? 0,
    isFollowing,
    rtmpStreamKey: viewerClerkId === stream.streamerClerkId ? stream.rtmpStreamKey : null,
  };
}

// GET /live/streams
router.get("/live/streams", async (req, res) => {
  try {
    const auth = getAuth(req);
    const viewerId = auth?.userId ?? undefined;
    const { status, category, limit = "20" } = req.query as Record<string, string>;
    const streams = await db
      .select()
      .from(liveStreamsTable)
      .where(
        and(
          status ? eq(liveStreamsTable.status, status) : undefined,
          category ? eq(liveStreamsTable.category, category) : undefined,
          or(
            eq(liveStreamsTable.privacy, "public"),
            viewerId ? eq(liveStreamsTable.streamerClerkId, viewerId) : undefined,
          ),
        ),
      )
      .orderBy(desc(liveStreamsTable.viewerCount), desc(liveStreamsTable.createdAt))
      .limit(Math.min(parseInt(limit, 10) || 20, 100));

    const enriched = await Promise.all(streams.map((s) => enrichStream(s, viewerId)));
    res.json(enriched);
  } catch (err) {
    req.log.error(err, "listLiveStreams error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /live/streams
router.post("/live/streams", requireAuth, async (req: any, res) => {
  try {
    const {
      title,
      description,
      category = "general",
      tags,
      privacy = "public",
      chatEnabled = true,
      streamerName,
    } = req.body;
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const streamKey = nanoid(12);
    const [stream] = await db
      .insert(liveStreamsTable)
      .values({
        streamKey,
        streamerClerkId: req.userId,
        streamerName: streamerName ?? "Streamer",
        title,
        description,
        category,
        tags,
        privacy,
        chatEnabled,
        isPremium: false,
        premiumPriceCents: null,
        status: "idle",
      })
      .returning();

    res.status(201).json(await enrichStream(stream, req.userId));
  } catch (err) {
    req.log.error(err, "createLiveStream error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /live/streams/my  — must be before /:streamKey
router.get("/live/streams/my", requireAuth, async (req: any, res) => {
  try {
    const streams = await db
      .select()
      .from(liveStreamsTable)
      .where(eq(liveStreamsTable.streamerClerkId, req.userId))
      .orderBy(desc(liveStreamsTable.createdAt));
    const enriched = await Promise.all(streams.map((s) => enrichStream(s, req.userId)));
    res.json(enriched);
  } catch (err) {
    req.log.error(err, "getMyLiveStreams error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /live/streams/:streamKey
router.get("/live/streams/:streamKey", async (req, res) => {
  try {
    const auth = getAuth(req);
    const viewerId = auth?.userId ?? undefined;
    const [stream] = await db
      .select()
      .from(liveStreamsTable)
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .limit(1);
    if (!stream) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(await enrichStream(stream, viewerId));
  } catch (err) {
    req.log.error(err, "getLiveStream error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /live/streams/:streamKey
router.patch("/live/streams/:streamKey", requireAuth, async (req: any, res) => {
  try {
    const [stream] = await db
      .select()
      .from(liveStreamsTable)
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .limit(1);
    if (!stream) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (stream.streamerClerkId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { title, description, category, tags, privacy, chatEnabled, thumbnailUrl } = req.body;
    const [updated] = await db
      .update(liveStreamsTable)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(tags !== undefined && { tags }),
        ...(privacy !== undefined && { privacy }),
        ...(chatEnabled !== undefined && { chatEnabled }),
        isPremium: false,
        premiumPriceCents: null,
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
      })
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .returning();

    res.json(await enrichStream(updated, req.userId));
  } catch (err) {
    req.log.error(err, "updateLiveStream error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /live/streams/:streamKey
router.delete("/live/streams/:streamKey", requireAuth, async (req: any, res) => {
  try {
    const [stream] = await db
      .select()
      .from(liveStreamsTable)
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .limit(1);
    if (!stream) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (stream.streamerClerkId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.delete(liveStreamsTable).where(eq(liveStreamsTable.streamKey, req.params.streamKey));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "deleteLiveStream error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /live/streams/:streamKey/go-live
router.post("/live/streams/:streamKey/go-live", requireAuth, async (req: any, res) => {
  try {
    const [stream] = await db
      .select()
      .from(liveStreamsTable)
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .limit(1);
    if (!stream) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (stream.streamerClerkId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { key, secret, url, ingress } = getLiveKitClients();
    const roomName = `live-${stream.streamKey}`;

    let rtmpUrl: string | null = stream.rtmpUrl;
    let rtmpStreamKey: string | null = stream.rtmpStreamKey;
    let ingressId: string | null = stream.livekitIngressId;

    try {
      const ingressInfo = await ingress.createIngress(IngressInput.RTMP_INPUT, {
        name: stream.title,
        roomName,
        participantIdentity: `streamer-${req.userId}`,
        participantName: stream.streamerName,
      });
      rtmpUrl = ingressInfo.url ?? null;
      rtmpStreamKey = ingressInfo.streamKey ?? null;
      ingressId = ingressInfo.ingressId ?? null;
    } catch (err) {
      req.log.warn(err, "LiveKit ingress creation failed — continuing without RTMP ingest");
    }

    const token = new AccessToken(key, secret, {
      identity: `streamer-${req.userId}`,
      name: stream.streamerName,
      ttl: 14400,
    });
    token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    const streamerToken = await token.toJwt();

    const [updated] = await db
      .update(liveStreamsTable)
      .set({
        status: "live",
        livekitRoomName: roomName,
        livekitIngressId: ingressId,
        rtmpUrl,
        rtmpStreamKey,
        startedAt: new Date(),
        endedAt: null,
      })
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .returning();

    res.json({
      stream: await enrichStream(updated, req.userId),
      streamerToken,
      livekitUrl: url,
      rtmpUrl: rtmpUrl ?? "",
      rtmpStreamKey: rtmpStreamKey ?? "",
    });
  } catch (err) {
    req.log.error(err, "goLive error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /live/streams/:streamKey/end
router.post("/live/streams/:streamKey/end", requireAuth, async (req: any, res) => {
  try {
    const [stream] = await db
      .select()
      .from(liveStreamsTable)
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .limit(1);
    if (!stream) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (stream.streamerClerkId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (stream.livekitIngressId) {
      try {
        const { ingress } = getLiveKitClients();
        await ingress.deleteIngress(stream.livekitIngressId);
      } catch (err) {
        req.log.warn(err, "LiveKit ingress deletion failed");
      }
    }

    if (stream.livekitRoomName) {
      try {
        const { rooms } = getLiveKitClients();
        await rooms.deleteRoom(stream.livekitRoomName);
      } catch (err) {
        req.log.warn(err, "LiveKit room deletion failed");
      }
    }

    const [updated] = await db
      .update(liveStreamsTable)
      .set({ status: "ended", endedAt: new Date(), viewerCount: 0 })
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .returning();

    res.json(await enrichStream(updated, req.userId));
  } catch (err) {
    req.log.error(err, "endLiveStream error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /live/streams/:streamKey/token
router.get("/live/streams/:streamKey/token", requireAuth, async (req: any, res) => {
  try {
    const [stream] = await db
      .select()
      .from(liveStreamsTable)
      .where(eq(liveStreamsTable.streamKey, req.params.streamKey))
      .limit(1);
    if (!stream) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (stream.status !== "live") {
      res.status(400).json({ error: "Stream is not live" });
      return;
    }

    const { key, secret, url } = getLiveKitClients();
    const roomName = stream.livekitRoomName ?? `live-${stream.streamKey}`;
    const isStreamer = stream.streamerClerkId === req.userId;

    const token = new AccessToken(key, secret, {
      identity: `viewer-${req.userId}-${Date.now()}`,
      name: (req.query.displayName as string) ?? "Viewer",
      ttl: 7200,
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: isStreamer,
      canSubscribe: true,
      canPublishData: true,
    });

    if (!isStreamer) {
      await db
        .update(liveStreamsTable)
        .set({
          viewerCount: (stream.viewerCount ?? 0) + 1,
          totalViews: (stream.totalViews ?? 0) + 1,
        })
        .where(eq(liveStreamsTable.streamKey, req.params.streamKey));
    }

    res.json({ token: await token.toJwt(), livekitUrl: url, livekitRoomName: roomName });
  } catch (err) {
    req.log.error(err, "getLiveStreamToken error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /live/follow/:streamerClerkId
router.post("/live/follow/:streamerClerkId", requireAuth, async (req: any, res) => {
  try {
    const { streamerClerkId } = req.params;
    if (streamerClerkId === req.userId) {
      res.status(400).json({ error: "Cannot follow yourself" });
      return;
    }

    const existing = await db
      .select()
      .from(streamFollowersTable)
      .where(
        and(
          eq(streamFollowersTable.followerClerkId, req.userId),
          eq(streamFollowersTable.streamerClerkId, streamerClerkId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(streamFollowersTable)
        .where(
          and(
            eq(streamFollowersTable.followerClerkId, req.userId),
            eq(streamFollowersTable.streamerClerkId, streamerClerkId),
          ),
        );
    } else {
      await db.insert(streamFollowersTable).values({ followerClerkId: req.userId, streamerClerkId });
    }

    const [followerResult] = await db
      .select({ count: count() })
      .from(streamFollowersTable)
      .where(eq(streamFollowersTable.streamerClerkId, streamerClerkId));

    res.json({ following: existing.length === 0, followerCount: followerResult?.count ?? 0 });
  } catch (err) {
    req.log.error(err, "toggleFollowStreamer error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /live/following
router.get("/live/following", requireAuth, async (req: any, res) => {
  try {
    const follows = await db
      .select()
      .from(streamFollowersTable)
      .where(eq(streamFollowersTable.followerClerkId, req.userId))
      .orderBy(desc(streamFollowersTable.createdAt));

    if (follows.length === 0) {
      res.json([]);
      return;
    }

    const streamerIds = follows.map((f) => f.streamerClerkId);
    const liveStreams = await db
      .select()
      .from(liveStreamsTable)
      .where(and(inArray(liveStreamsTable.streamerClerkId, streamerIds), eq(liveStreamsTable.status, "live")));

    const liveMap = new Map(liveStreams.map((s) => [s.streamerClerkId, s]));

    res.json(
      follows.map((f) => {
        const live = liveMap.get(f.streamerClerkId);
        return {
          streamerClerkId: f.streamerClerkId,
          streamerName: live?.streamerName ?? "Unknown",
          followedAt: f.createdAt.toISOString(),
          isLive: !!live,
          currentStreamKey: live?.streamKey ?? null,
        };
      }),
    );
  } catch (err) {
    req.log.error(err, "getLiveFollowing error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /live/followers
router.get("/live/followers", requireAuth, async (req: any, res) => {
  try {
    const followers = await db
      .select()
      .from(streamFollowersTable)
      .where(eq(streamFollowersTable.streamerClerkId, req.userId))
      .orderBy(desc(streamFollowersTable.createdAt));

    res.json({
      count: followers.length,
      followers: followers.map((f) => ({
        followerClerkId: f.followerClerkId,
        followedAt: f.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error(err, "getLiveFollowers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
