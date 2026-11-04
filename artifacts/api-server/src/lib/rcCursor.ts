import { WebSocket } from "ws";

// roomName → set of connected mobile WS clients watching cursor position
const cursorSubscribers = new Map<string, Set<WebSocket>>();

export function subscribeRoomCursor(roomName: string, ws: WebSocket): void {
  if (!cursorSubscribers.has(roomName)) cursorSubscribers.set(roomName, new Set());
  cursorSubscribers.get(roomName)!.add(ws);
}

export function unsubscribeRoomCursor(roomName: string, ws: WebSocket): void {
  const subs = cursorSubscribers.get(roomName);
  if (!subs) return;
  subs.delete(ws);
  if (subs.size === 0) cursorSubscribers.delete(roomName);
}

export function broadcastCursor(roomName: string, x: number, y: number): void {
  const subs = cursorSubscribers.get(roomName);
  if (!subs || subs.size === 0) return;
  const payload = JSON.stringify({ type: "rc-cursor", x, y });
  subs.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}
