import { useEffect, useRef, useState, useCallback } from "react";

// STUN servers for direct P2P (no bandwidth cost, best effort)
// TURN servers relay traffic when direct P2P fails (NAT/firewall)
// OpenRelay is a free public TURN — limited bandwidth, use as last resort
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:openrelay.metered.ca:80" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turns:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export interface RemoteStream {
  userId: string;
  stream: MediaStream;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
}

export interface ReactionMessage {
  msgId: string;
  emoji: string;
  userId: string;
}

export interface RoleChangeMessage {
  userId: string;
  role: string;
  grantedBy: string;
}

export function useWebRTC({
  roomId,
  userId,
  displayName,
  myRole,
  localStream,
  enabled,
  onChatMessage,
  onReaction,
  onRoleChange,
}: {
  roomId: string;
  userId: string;
  displayName: string;
  myRole?: string;
  localStream: MediaStream | null;
  enabled: boolean;
  onChatMessage?: (msg: ChatMessage) => void;
  onReaction?: (reaction: ReactionMessage) => void;
  onRoleChange?: (change: RoleChangeMessage) => void;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const onChatMessageRef = useRef(onChatMessage);
  useEffect(() => { onChatMessageRef.current = onChatMessage; }, [onChatMessage]);
  const onReactionRef = useRef(onReaction);
  useEffect(() => { onReactionRef.current = onReaction; }, [onReaction]);
  const onRoleChangeRef = useRef(onRoleChange);
  useEffect(() => { onRoleChangeRef.current = onRoleChange; }, [onRoleChange]);
  // Keep latest role available for the WS join message without re-connecting on role changes
  const myRoleRef = useRef(myRole ?? "participant");
  useEffect(() => { myRoleRef.current = myRole ?? "participant"; }, [myRole]);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  // Real-time name registry: userId -> displayName for everyone in the room
  const [peerNames, setPeerNames] = useState<Map<string, string>>(new Map());
  // Real-time set of peer userIds currently in the room (excluding self)
  const [peerIds, setPeerIds] = useState<string[]>([]);
  // Peer userIds who currently have their hand raised
  const [peerHands, setPeerHands] = useState<Set<string>>(new Set());
  // Real-time role registry: userId -> role
  const [peerRoles, setPeerRoles] = useState<Map<string, string>>(new Map());
  // RTCPeerConnection state per peer: connected | connecting | disconnected | failed | closed | new
  const [peerConnectionStates, setPeerConnectionStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());

  const removeRemote = useCallback((peerId: string) => {
    setRemoteStreams((prev) => prev.filter((s) => s.userId !== peerId));
    setPeerIds((prev) => prev.filter((id) => id !== peerId));
    setPeerNames((prev) => { const next = new Map(prev); next.delete(peerId); return next; });
    setPeerHands((prev) => { const next = new Set(prev); next.delete(peerId); return next; });
    setPeerRoles((prev) => { const next = new Map(prev); next.delete(peerId); return next; });
    setPeerConnectionStates((prev) => { const next = new Map(prev); next.delete(peerId); return next; });
  }, []);

  const flushPendingCandidates = useCallback(async (pc: RTCPeerConnection, peerId: string) => {
    const pending = pendingCandidatesRef.current.get(peerId) ?? [];
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // stale candidate — safe to ignore
      }
    }
  }, []);

  const createPC = useCallback(
    (peerId: string, ws: WebSocket): RTCPeerConnection => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      if (localStream) {
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      }

      const remoteStream = new MediaStream();
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => {
          if (!remoteStream.getTracks().includes(t)) remoteStream.addTrack(t);
        });
        setRemoteStreams((prev) => {
          const filtered = prev.filter((s) => s.userId !== peerId);
          return [...filtered, { userId: peerId, stream: remoteStream }];
        });
      };

      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ice-candidate", to: peerId, candidate: e.candidate }));
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setPeerConnectionStates((prev) => { const next = new Map(prev); next.set(peerId, state); return next; });
        if (state === "failed" || state === "closed") {
          pcsRef.current.delete(peerId);
          pendingCandidatesRef.current.delete(peerId);
          removeRemote(peerId);
        }
      };

      pcsRef.current.set(peerId, pc);
      return pc;
    },
    [localStream, removeRemote]
  );

  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack | null) => {
    const promises: Promise<void>[] = [];
    pcsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        promises.push(sender.replaceTrack(newTrack));
      }
    });
    await Promise.all(promises);
  }, []);

  useEffect(() => {
    if (!enabled || !roomId || !userId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "join", room: roomId, userId, displayName, role: myRoleRef.current }));
    };

    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = async (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const type = msg["type"] as string;

      if (type === "existing-user") {
        const peerId = msg["userId"] as string;
        const name = msg["displayName"] as string | undefined;
        const role = msg["role"] as string | undefined;
        if (name) {
          setPeerNames((prev) => { const next = new Map(prev); next.set(peerId, name); return next; });
        }
        if (role) {
          setPeerRoles((prev) => { const next = new Map(prev); next.set(peerId, role); return next; });
        }
        setPeerIds((prev) => prev.includes(peerId) ? prev : [...prev, peerId]);
        const pc = createPC(peerId, ws);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await flushPendingCandidates(pc, peerId);
        ws.send(JSON.stringify({ type: "offer", to: peerId, sdp: offer }));

      } else if (type === "user-joined") {
        const peerId = msg["userId"] as string;
        const name = msg["displayName"] as string | undefined;
        const role = msg["role"] as string | undefined;
        if (name) {
          setPeerNames((prev) => { const next = new Map(prev); next.set(peerId, name); return next; });
        }
        if (role) {
          setPeerRoles((prev) => { const next = new Map(prev); next.set(peerId, role); return next; });
        }
        setPeerIds((prev) => prev.includes(peerId) ? prev : [...prev, peerId]);
        createPC(peerId, ws);

      } else if (type === "offer") {
        const peerId = msg["from"] as string;
        const pc = createPC(peerId, ws);
        await pc.setRemoteDescription(new RTCSessionDescription(msg["sdp"] as RTCSessionDescriptionInit));
        await flushPendingCandidates(pc, peerId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", to: peerId, sdp: answer }));

      } else if (type === "answer") {
        const peerId = msg["from"] as string;
        const pc = pcsRef.current.get(peerId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg["sdp"] as RTCSessionDescriptionInit));
          await flushPendingCandidates(pc, peerId);
        }

      } else if (type === "ice-candidate") {
        const peerId = msg["from"] as string;
        const candidate = msg["candidate"] as RTCIceCandidateInit;
        const pc = pcsRef.current.get(peerId);

        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            // stale candidate
          }
        } else {
          const pending = pendingCandidatesRef.current.get(peerId) ?? [];
          pending.push(candidate);
          pendingCandidatesRef.current.set(peerId, pending);
        }

      } else if (type === "hand-raise") {
        const peerId = msg["userId"] as string;
        const raised = msg["raised"] as boolean;
        setPeerHands((prev) => {
          const next = new Set(prev);
          if (raised) next.add(peerId); else next.delete(peerId);
          return next;
        });

      } else if (type === "rename") {
        const peerId = msg["userId"] as string;
        const name = msg["displayName"] as string;
        setPeerNames((prev) => { const next = new Map(prev); next.set(peerId, name); return next; });

      } else if (type === "role-change") {
        const peerId = msg["userId"] as string;
        const role = msg["role"] as string;
        const grantedBy = msg["grantedBy"] as string;
        setPeerRoles((prev) => { const next = new Map(prev); next.set(peerId, role); return next; });
        onRoleChangeRef.current?.({ userId: peerId, role, grantedBy });

      } else if (type === "chat") {
        onChatMessageRef.current?.({
          id: msg["id"] as string,
          sender: msg["sender"] as string,
          text: msg["text"] as string,
        });

      } else if (type === "reaction") {
        onReactionRef.current?.({
          msgId: msg["msgId"] as string,
          emoji: msg["emoji"] as string,
          userId: msg["userId"] as string,
        });

      } else if (type === "user-left") {
        const peerId = msg["userId"] as string;
        pcsRef.current.get(peerId)?.close();
        pcsRef.current.delete(peerId);
        pendingCandidatesRef.current.delete(peerId);
        removeRemote(peerId);
      }
    };

    return () => {
      ws.close();
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      pendingCandidatesRef.current.clear();
      setRemoteStreams([]);
      setPeerIds([]);
      setPeerNames(new Map());
      setPeerHands(new Set());
      setPeerRoles(new Map());
    };
  }, [enabled, roomId, userId, displayName, localStream, createPC, removeRemote, flushPendingCandidates]);

  const sendChatMessage = useCallback((id: string, sender: string, text: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "chat", id, sender, text }));
    }
  }, []);

  const sendReaction = useCallback((msgId: string, emoji: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "reaction", msgId, emoji }));
    }
  }, []);

  const rename = useCallback((newName: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "rename", displayName: newName }));
    }
  }, []);

  const sendHandRaise = useCallback((raised: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "hand-raise", raised }));
    }
  }, []);

  const sendRoleChange = useCallback((targetUserId: string, newRole: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "role-change", targetUserId, newRole }));
    }
  }, []);

  return {
    remoteStreams,
    wsConnected,
    replaceVideoTrack,
    sendChatMessage,
    sendReaction,
    rename,
    sendHandRaise,
    sendRoleChange,
    peerNames,
    peerIds,
    peerHands,
    peerRoles,
    peerConnectionStates,
  };
}
