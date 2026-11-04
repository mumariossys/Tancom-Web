import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { subscribeRoomCursor, unsubscribeRoomCursor } from "./lib/rcCursor";
import { ensureClerkRedirectUrls } from "./lib/ensureClerkRedirectUrls";
import { sweepInactiveMeetings } from "./lib/meetingReaper";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
// Dedicated lightweight WS server for mobile cursor position subscriptions.
const wssCursor = new WebSocketServer({ noServer: true });

// room -> (userId -> ws)
const rooms = new Map<string, Map<string, WebSocket>>();
// room -> (userId -> displayName)
const roomNames = new Map<string, Map<string, string>>();
// room -> (userId -> role: "host" | "cohost" | "participant" | "guest")
const roomRoles = new Map<string, Map<string, string>>();

// ── Heartbeat: ping every 25 s, drop connections that don't pong within 10 s ──
const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;

function startHeartbeat(ws: WebSocket & { isAlive?: boolean }) {
  ws.isAlive = true;
  ws.on("pong", () => { (ws as any).isAlive = true; });
}

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((rawWs) => {
    const ws = rawWs as WebSocket & { isAlive?: boolean };
    if (ws.isAlive === false) {
      ws.terminate(); // triggers 'close' event, which cleans up room state
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL_MS);

// Ensure the timer doesn't prevent process exit
heartbeatTimer.unref();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Remove a userId from all room state and broadcast user-left to remaining peers.
 * Used both on close and when the same userId reconnects.
 */
function evictUser(room: string, userId: string, exceptWs?: WebSocket) {
  const peers = rooms.get(room);
  if (!peers) return;

  peers.delete(userId);
  roomNames.get(room)?.delete(userId);
  roomRoles.get(room)?.delete(userId);

  const payload = JSON.stringify({ type: "user-left", userId });
  peers.forEach((peer) => {
    if (peer !== exceptWs && peer.readyState === WebSocket.OPEN) {
      peer.send(payload);
    }
  });

  // Clean up empty rooms
  if (peers.size === 0) {
    rooms.delete(room);
    roomNames.delete(room);
    roomRoles.delete(room);
  }
}

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://localhost`);
  if (url.pathname === "/api/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws);
    });
  } else if (url.pathname === "/api/ws/rc-cursor") {
    wssCursor.handleUpgrade(request, socket, head, (ws) => {
      wssCursor.emit("connection", ws);
    });
  } else {
    socket.destroy();
  }
});

wssCursor.on("connection", (ws: WebSocket) => {
  let subscribedRoom: string | null = null;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      if (msg["type"] === "subscribe" && typeof msg["roomName"] === "string") {
        if (subscribedRoom) unsubscribeRoomCursor(subscribedRoom, ws);
        subscribedRoom = msg["roomName"] as string;
        subscribeRoomCursor(subscribedRoom, ws);
      }
    } catch { /* ignore parse errors */ }
  });

  ws.on("close", () => {
    if (subscribedRoom) unsubscribeRoomCursor(subscribedRoom, ws);
  });
});

wss.on("connection", (ws: WebSocket) => {
  startHeartbeat(ws);

  let currentRoom: string | null = null;
  let currentUserId: string | null = null;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;

      if (msg["type"] === "join") {
        currentRoom = msg["room"] as string;
        currentUserId = msg["userId"] as string;
        const displayName = (msg["displayName"] as string | undefined) || currentUserId.slice(0, 8);
        const role = (msg["role"] as string | undefined) || "participant";

        if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Map());
        if (!roomNames.has(currentRoom)) roomNames.set(currentRoom, new Map());
        if (!roomRoles.has(currentRoom)) roomRoles.set(currentRoom, new Map());

        const room = rooms.get(currentRoom)!;
        const names = roomNames.get(currentRoom)!;
        const roles = roomRoles.get(currentRoom)!;

        // ── Evict ghost: same userId already in room (page refresh / reconnect) ──
        if (room.has(currentUserId)) {
          const oldWs = room.get(currentUserId)!;
          // Notify all other peers that the old connection left
          evictUser(currentRoom, currentUserId, oldWs);
          // Terminate stale socket gracefully
          if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
            oldWs.terminate();
          }
          // Re-fetch maps (evictUser deletes from them)
          if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Map());
          if (!roomNames.has(currentRoom)) roomNames.set(currentRoom, new Map());
          if (!roomRoles.has(currentRoom)) roomRoles.set(currentRoom, new Map());
        }

        const room2 = rooms.get(currentRoom)!;
        const names2 = roomNames.get(currentRoom)!;
        const roles2 = roomRoles.get(currentRoom)!;

        // Tell new user about each existing peer (with their display name and role)
        room2.forEach((_, peerId) => {
          ws.send(JSON.stringify({
            type: "existing-user",
            userId: peerId,
            displayName: names2.get(peerId) ?? peerId.slice(0, 8),
            role: roles2.get(peerId) ?? "participant",
          }));
        });

        // Tell existing peers about the new arrival (with display name and role)
        room2.forEach((peer) => {
          if (peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: "user-joined", userId: currentUserId, displayName, role }));
          }
        });

        room2.set(currentUserId, ws);
        names2.set(currentUserId, displayName);
        roles2.set(currentUserId, role);
        logger.info({ room: currentRoom, userId: currentUserId, role, peers: room2.size }, "user joined room");

      } else if (
        msg["type"] === "offer" ||
        msg["type"] === "answer" ||
        msg["type"] === "ice-candidate"
      ) {
        const room = rooms.get(currentRoom ?? "");
        const target = room?.get(msg["to"] as string);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ ...msg, from: currentUserId }));
        }

      } else if (msg["type"] === "chat") {
        const room = rooms.get(currentRoom ?? "");
        if (room) {
          const payload = JSON.stringify({ type: "chat", from: currentUserId, id: msg["id"], sender: msg["sender"], text: msg["text"] });
          room.forEach((peer, peerId) => {
            if (peerId !== currentUserId && peer.readyState === WebSocket.OPEN) {
              peer.send(payload);
            }
          });
        }

      } else if (msg["type"] === "reaction") {
        const room = rooms.get(currentRoom ?? "");
        if (room && currentUserId) {
          const payload = JSON.stringify({ type: "reaction", msgId: msg["msgId"], emoji: msg["emoji"], userId: currentUserId });
          room.forEach((peer, peerId) => {
            if (peerId !== currentUserId && peer.readyState === WebSocket.OPEN) {
              peer.send(payload);
            }
          });
        }

      } else if (msg["type"] === "hand-raise") {
        const room = rooms.get(currentRoom ?? "");
        if (room && currentUserId) {
          const payload = JSON.stringify({ type: "hand-raise", userId: currentUserId, raised: msg["raised"] });
          room.forEach((peer, peerId) => {
            if (peerId !== currentUserId && peer.readyState === WebSocket.OPEN) {
              peer.send(payload);
            }
          });
        }

      } else if (msg["type"] === "rename") {
        const newName = msg["displayName"] as string;
        const names = roomNames.get(currentRoom ?? "");
        if (names && currentUserId) names.set(currentUserId, newName);
        const room = rooms.get(currentRoom ?? "");
        if (room && currentUserId) {
          const payload = JSON.stringify({ type: "rename", userId: currentUserId, displayName: newName });
          room.forEach((peer, peerId) => {
            if (peerId !== currentUserId && peer.readyState === WebSocket.OPEN) {
              peer.send(payload);
            }
          });
        }

      } else if (msg["type"] === "role-change") {
        // Broadcast role change to all participants in the room (including self)
        const targetUserId = msg["targetUserId"] as string;
        const newRole = msg["newRole"] as string;
        const room = rooms.get(currentRoom ?? "");
        const roles = roomRoles.get(currentRoom ?? "");
        if (roles) roles.set(targetUserId, newRole);
        if (room && currentUserId) {
          const payload = JSON.stringify({
            type: "role-change",
            userId: targetUserId,
            role: newRole,
            grantedBy: currentUserId,
          });
          room.forEach((peer) => {
            if (peer.readyState === WebSocket.OPEN) {
              peer.send(payload);
            }
          });
        }
        logger.info({ room: currentRoom, targetUserId, newRole, grantedBy: currentUserId }, "role changed");
      }
    } catch {
      // ignore parse errors
    }
  });

  ws.on("close", () => {
    if (currentRoom && currentUserId) {
      evictUser(currentRoom, currentUserId);
      logger.info({ room: currentRoom, userId: currentUserId }, "user left room");
    }
  });
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Ensure the native OAuth callback scheme is allowlisted on whichever Clerk
  // instance this server is bound to (production uses sk_live, only reachable
  // from the deployed runtime). Required for "Continue with Google" on native.
  void ensureClerkRedirectUrls(logger);

  // ── Inactive-meeting reaper ───────────────────────────────────────────────
  // Sweeps the database every 5 minutes and closes any meeting that has been
  // active but empty (no participants present) for more than 25 minutes.
  // The timer is unref'd so it won't prevent a clean process exit.
  const REAPER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const reaperTimer = setInterval(async () => {
    try {
      await sweepInactiveMeetings();
    } catch (err) {
      logger.error({ err }, "Meeting reaper error");
    }
  }, REAPER_INTERVAL_MS);
  reaperTimer.unref();

  // ── Keepalive self-ping ────────────────────────────────────────────────────
  // Replit containers go to sleep when idle. Hitting /api/healthz every 4 min
  // generates enough internal HTTP traffic to prevent the idle-shutdown.
  // Using the internal port directly (no proxy) so this never adds latency
  // to real user requests. The timer is unref'd so it won't block clean exits.
  const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
  const keepaliveTimer = setInterval(async () => {
    try {
      const { default: http } = await import("http");
      await new Promise<void>((resolve) => {
        const req = http.get(`http://localhost:${port}/api/healthz`, (res) => {
          res.resume();
          res.on("end", resolve);
        });
        req.on("error", () => resolve()); // ignore errors — server may be mid-restart
        req.setTimeout(5000, () => { req.destroy(); resolve(); });
      });
    } catch {
      // Swallow all errors — keepalive failure is non-fatal
    }
  }, KEEPALIVE_INTERVAL_MS);
  keepaliveTimer.unref();
});

// ── Process-level error guards ────────────────────────────────────────────────
// These prevent the entire server from dying on an unhandled route error,
// uncaught promise rejection, or other unexpected throw.
// The dev-server.mjs auto-restart script is the outer safety net — these
// handlers are the inner one that avoids a restart in the first place.

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — keeping server alive");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — keeping server alive");
});
