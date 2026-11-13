import { useEffect, useRef, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  ConnectionState,
  LocalParticipant,
  AudioPresets,
  type TrackPublishOptions,
} from "livekit-client";
import {
  decideScreenShare,
  screenShareProfile,
  type ScreenShareHold,
} from "@/lib/screenShare";

export interface RemoteStream {
  userId: string;
  /** null when the participant has no video to show (camera off, or a paused share) */
  stream: MediaStream | null;
  cameraStream?: MediaStream | null;
  /** Microphone plus screen-share audio. Played on an <audio> element, not the video. */
  audioStream: MediaStream | null;
  /** Identity of the video tracks. Stable while the picture itself has not changed. */
  videoKey: string;
  audioKey: string;
  isScreenShare: boolean;
  /** Why a live share is not showing frames. Null while the picture is playing. */
  screenShareHold: ScreenShareHold;
}

export interface ScreenSharePublishOptions {
  audioTrack?: MediaStreamTrack | null;
  optimizeForVideo?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: string;
  senderId: string;
  text: string;
  recipientId?: string;
  recipientName?: string;
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

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Add and remove tracks without creating a new MediaStream (which would reset the element). */
function replaceTracks(stream: MediaStream, tracks: MediaStreamTrack[]): MediaStream | null {
  const next = new Set(tracks);
  for (const existing of stream.getTracks()) {
    if (!next.has(existing)) stream.removeTrack(existing);
  }
  for (const track of tracks) {
    if (!stream.getTracks().includes(track)) stream.addTrack(track);
  }
  return stream.getTracks().length > 0 ? stream : null;
}

/** How long to wait for a host response before expiring a pending RC request. */
const RC_REQUEST_TIMEOUT_MS = 60_000;

async function fetchToken(
  roomName: string,
  displayName: string,
  maxParticipants?: number,
): Promise<{ token: string; livekitUrl: string }> {
  const res = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, displayName, maxParticipants }),
  });
  if (!res.ok) {
    const err = new Error(`Token fetch failed: ${res.status}`);
    (err as any).httpStatus = res.status;
    throw err;
  }
  const data = await res.json() as { token: string; livekitUrl: string };
  if (!data.livekitUrl) throw new Error("Server did not return livekitUrl — check LIVEKIT_URL secret");
  return data;
}

export interface CaptionMessage {
  sender: string;
  text: string;
}

export function useLiveKit({
  roomId,
  userId,
  displayName,
  localStream,
  enabled,
  onChatMessage,
  onReaction,
  onRoleChange,
  onCaption,
  onParticipantJoined,
  onForceMute,
  onForceCamOff,
  onForceStopShare,
  onForceKick,
  onRcRevokedByDisconnect,
  onRcRequestTimeout,
  onRcGrantedByBrowserHost,
  onRcDenied,
  onScreenShareInterrupted,
  maxParticipants,
}: {
  roomId: string;
  userId: string;
  displayName: string;
  localStream: MediaStream | null;
  enabled: boolean;
  onChatMessage?: (msg: ChatMessage) => void;
  onReaction?: (r: ReactionMessage) => void;
  onRoleChange?: (r: RoleChangeMessage) => void;
  onCaption?: (msg: CaptionMessage) => void;
  onParticipantJoined?: (userId: string, name: string) => void;
  onForceMute?: () => void;
  onForceCamOff?: () => void;
  onForceStopShare?: () => void;
  onForceKick?: () => void;
  onRcRevokedByDisconnect?: (name: string) => void;
  onRcRequestTimeout?: () => void;
  /** Fired on the controller when the host allows RC but is in browser mode (no Desktop bridge).
   *  RC event routing will work but no real OS cursor/keyboard actions will execute on the host. */
  onRcGrantedByBrowserHost?: () => void;
  onRcDenied?: () => void;
  /** The local screen share could not be restored after a drop. */
  onScreenShareInterrupted?: () => void;
  /** When set, the LiveKit room is created with this hard cap before the first token is issued. */
  maxParticipants?: number;
}) {
  const roomRef = useRef<Room | null>(null);
  const onChatRef = useRef(onChatMessage);
  const onReactionRef = useRef(onReaction);
  const onRoleChangeRef = useRef(onRoleChange);
  const onCaptionRef = useRef(onCaption);
  const onParticipantJoinedRef = useRef(onParticipantJoined);
  const onForceMuteRef = useRef(onForceMute);
  const onForceCamOffRef = useRef(onForceCamOff);
  const onForceStopShareRef = useRef(onForceStopShare);
  const onForceKickRef = useRef(onForceKick);
  const onRcRevokedByDisconnectRef = useRef(onRcRevokedByDisconnect);
  const onRcRequestTimeoutRef = useRef(onRcRequestTimeout);
  const onRcGrantedByBrowserHostRef = useRef(onRcGrantedByBrowserHost);
  const onRcDeniedRef = useRef(onRcDenied);
  const onScreenShareInterruptedRef = useRef(onScreenShareInterrupted);
  useEffect(() => { onChatRef.current = onChatMessage; }, [onChatMessage]);
  useEffect(() => { onReactionRef.current = onReaction; }, [onReaction]);
  useEffect(() => { onRoleChangeRef.current = onRoleChange; }, [onRoleChange]);
  useEffect(() => { onCaptionRef.current = onCaption; }, [onCaption]);
  useEffect(() => { onParticipantJoinedRef.current = onParticipantJoined; }, [onParticipantJoined]);
  useEffect(() => { onForceMuteRef.current = onForceMute; }, [onForceMute]);
  useEffect(() => { onForceCamOffRef.current = onForceCamOff; }, [onForceCamOff]);
  useEffect(() => { onForceStopShareRef.current = onForceStopShare; }, [onForceStopShare]);
  useEffect(() => { onForceKickRef.current = onForceKick; }, [onForceKick]);
  useEffect(() => { onRcRevokedByDisconnectRef.current = onRcRevokedByDisconnect; }, [onRcRevokedByDisconnect]);
  useEffect(() => { onRcRequestTimeoutRef.current = onRcRequestTimeout; }, [onRcRequestTimeout]);
  useEffect(() => { onRcGrantedByBrowserHostRef.current = onRcGrantedByBrowserHost; }, [onRcGrantedByBrowserHost]);
  useEffect(() => { onRcDeniedRef.current = onRcDenied; }, [onRcDenied]);
  useEffect(() => { onScreenShareInterruptedRef.current = onScreenShareInterrupted; }, [onScreenShareInterrupted]);

  // Mirror localStream in a ref so the main connection effect does not restart
  // the entire room when the camera stream is replaced (e.g. virtual background).
  // Track mutations are handled by a separate, lighter effect below.
  const localStreamRef = useRef(localStream);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  // Mirror displayName in a ref so Clerk asynchronously loading the user's
  // real name (typically ~20s after mount) does not disconnect and reconnect
  // the room. The name in the token is resolved at connect time from the ref.
  const displayNameRef = useRef(displayName);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  // Mirror userId in a ref so buildStreams/buildPeerMeta can filter out stale
  // self-connections without needing userId in their useCallback dep arrays
  // (which would cause the main room effect to restart whenever Clerk resolves
  // the user ID — the same problem we already solved for displayName above).
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Set when all retries are exhausted so the UI can show a "connection failed"
  // banner instead of a silent spinning indicator.
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // True only after the initial camera track has been successfully published.
  // Used by MeetingRoom to know when it is safe to call replaceVideoTrack.
  const [tracksPublished, setTracksPublished] = useState(false);
  const [peerNames, setPeerNames] = useState<Map<string, string>>(new Map());
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const [peerHands, setPeerHands] = useState<Set<string>>(new Set());
  const [peerRoles, setPeerRoles] = useState<Map<string, string>>(new Map());
  const [peerConnectionStates, setPeerConnectionStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());

  // Ref mirror of peerRoles — readable inside event-handler closures without stale values
  const peerRolesRef = useRef<Map<string, string>>(new Map());

  // ── Host-left detection ────────────────────────────────────────────────────
  // Set to the departing host's identity when the participant carrying the
  // "host" role disconnects. Consumers watch this value and run the election.
  const [hostLeftId, setHostLeftId] = useState<string | null>(null);
  const clearHostLeft = useCallback(() => setHostLeftId(null), []);

  // ── Remote Control state ───────────────────────────────────────────────────
  const [rcRequests, setRcRequests] = useState<Array<{ userId: string; name: string }>>([]);
  const [rcGrantedTo, setRcGrantedTo] = useState<string | null>(null);
  const [haveControl, setHaveControl] = useState(false);
  // True while a request has been sent and no grant/deny/timeout has arrived yet.
  const [isRcRequesting, setIsRcRequesting] = useState(false);
  const [controllerPointer, setControllerPointer] = useState<{ x: number; y: number } | null>(null);
  const [rcClickPos, setRcClickPos] = useState<{ x: number; y: number } | null>(null);
  // Updated whenever the host sends its clipboard contents back to this controller.
  // Consumers (MeetingRoom) watch this state to show a toast + write to local clipboard.
  const [rcClipboardData, setRcClipboardData] = useState<{ text: string; ts: number } | null>(null);
  const lastPointerRef = useRef<number>(0);
  const rcClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs kept in sync with state so the data-channel handler (a closure from
  // the LiveKit useEffect) can read current values without stale captures.
  const rcGrantedToRef = useRef<string | null>(null);
  const haveControlRef = useRef(false);
  // Ref to revokeControl — kept in sync after the callback is defined below so
  // the onParticipantDisconnected event handler (a closure inside the room
  // useEffect) can call it without capturing a stale reference.
  const revokeControlRef = useRef<(() => void) | null>(null);
  // Timestamp (Date.now()) when the most recent rc-request was sent. Used to
  // detect requests that went unanswered beyond RC_REQUEST_TIMEOUT_MS.
  const rcRequestedAtRef = useRef<number | null>(null);
  // Handle for the pending request-timeout timer so it can be cancelled on grant/deny.
  const rcRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the sharer has explicitly paused the active RC grant.
  const [rcPaused, setRcPaused] = useState(false);
  const rcPausedRef = useRef(false);
  useEffect(() => { rcGrantedToRef.current = rcGrantedTo; }, [rcGrantedTo]);
  useEffect(() => { haveControlRef.current = haveControl; }, [haveControl]);
  useEffect(() => { rcPausedRef.current = rcPaused; }, [rcPaused]);

  // One MediaStream per kind per participant. Replacing srcObject on every
  // track event (someone mutes, a caption, a second participant joins) restarts
  // the <video> element and flashes a black frame. Sync tracks in place instead.
  const mediaPoolsRef = useRef<Map<string, { video: MediaStream; audio: MediaStream; camera: MediaStream }>>(new Map());

  // Local screen-share session. Survives a LiveKit reconnect so the same
  // capture can be published again instead of leaving the sharer "live" with
  // nobody receiving frames.
  const screenGenRef = useRef(0);
  const screenSessionRef = useRef<{
    generation: number;
    video: MediaStreamTrack;
    audio: MediaStreamTrack | null;
    optimizeForVideo: boolean;
  } | null>(null);
  const republishScreenShareRef = useRef<() => Promise<void>>(async () => {});

  const buildStreams = useCallback((room: Room) => {
    const myId = userIdRef.current;
    const streams: RemoteStream[] = [];
    const seen = new Set<string>();
    room.remoteParticipants.forEach((participant) => {
      // Skip stale self-connections — the same Clerk user can appear as a
      // "remote" participant with a different nanoid suffix during the brief
      // overlap window when we reconnect and the old session hasn't been evicted
      // yet by LiveKit. Identity format is "${clerkId}-${nanoid(8)}", so a
      // startsWith check reliably filters our own ghost tile (black, no camera).
      // We read userId from a ref so this callback stays stable (empty dep array)
      // and never causes the main room effect to restart.
      if (myId && participant.identity.startsWith(myId + "-")) return;
      seen.add(participant.identity);

      const screenSharePub = participant.getTrackPublication(Track.Source.ScreenShare);
      const cameraPub = participant.getTrackPublication(Track.Source.Camera);
      const micPub = participant.getTrackPublication(Track.Source.Microphone);
      const screenAudioPub = participant.getTrackPublication(Track.Source.ScreenShareAudio);

      const screenMedia = screenSharePub?.track?.mediaStreamTrack ?? null;
      const decision = decideScreenShare({
        hasPublication: !!screenSharePub,
        trackReadyState: !screenMedia ? "missing" : screenMedia.readyState === "live" ? "live" : "ended",
        publicationMuted: !!screenSharePub?.isMuted,
        trackMuted: !!screenMedia?.muted,
        streamPaused: screenSharePub?.track?.streamState === Track.StreamState.Paused,
      });

      const cameraMedia = cameraPub?.track?.mediaStreamTrack ?? null;
      const cameraLive = cameraMedia && cameraMedia.readyState === "live" ? cameraMedia : null;

      // A muted or not-yet-subscribed screen track must not become the picture:
      // the element would show black and hide this person's camera. While the
      // publication is still up we keep the share session (decision.active) and
      // tell the UI to show paused / reconnecting instead.
      const showScreenFrames = decision.active && decision.hold !== "sender" && !!screenMedia && screenMedia.readyState === "live";
      const videoTracks: MediaStreamTrack[] = [];
      if (showScreenFrames && screenMedia) videoTracks.push(screenMedia);
      else if (!decision.active && cameraLive) videoTracks.push(cameraLive);

      const audioTracks: MediaStreamTrack[] = [];
      const micMedia = micPub?.track?.mediaStreamTrack ?? null;
      if (micMedia && micMedia.readyState === "live" && !micPub?.isMuted && !micMedia.muted) {
        audioTracks.push(micMedia);
      }
      const sysMedia = screenAudioPub?.track?.mediaStreamTrack ?? null;
      if (sysMedia && sysMedia.readyState === "live" && !screenAudioPub?.isMuted && !sysMedia.muted) {
        audioTracks.push(sysMedia);
      }

      let pools = mediaPoolsRef.current.get(participant.identity);
      if (!pools) {
        pools = { video: new MediaStream(), audio: new MediaStream(), camera: new MediaStream() };
        mediaPoolsRef.current.set(participant.identity, pools);
      }

      const cameraTracks = decision.active && cameraLive ? [cameraLive] : [];
      streams.push({
        userId: participant.identity,
        stream: replaceTracks(pools.video, videoTracks),
        cameraStream: replaceTracks(pools.camera, cameraTracks),
        audioStream: replaceTracks(pools.audio, audioTracks),
        videoKey: videoTracks.map((t) => t.id).join(","),
        audioKey: audioTracks.map((t) => t.id).join(","),
        isScreenShare: decision.active,
        screenShareHold: decision.hold,
      });
    });
    for (const id of mediaPoolsRef.current.keys()) {
      if (!seen.has(id)) mediaPoolsRef.current.delete(id);
    }
    setRemoteStreams(streams);
  }, []);

  const buildPeerMeta = useCallback((room: Room) => {
    const myId = userIdRef.current;
    const names = new Map<string, string>();
    const ids: string[] = [];
    room.remoteParticipants.forEach((p) => {
      // Skip stale self-connections (same filter as buildStreams)
      if (myId && p.identity.startsWith(myId + "-")) return;
      names.set(p.identity, p.name ?? p.identity);
      ids.push(p.identity);
    });
    setPeerNames(names);
    setPeerIds(ids);
  }, []);

  useEffect(() => {
    if (!enabled || !roomId || !userId) return;

    const room = new Room({
      // adaptiveStream disabled: the browser uses srcObject directly (not
      // track.attach()), so the adaptive-stream controller has no viewport data.
      // Leaving it enabled would cause the SFU to throttle or pause remote tracks
      // because it never receives a size signal, making iOS participants invisible.
      adaptiveStream: false,
      // dynacast disabled: without adaptiveStream there is no subscription-quality
      // data for dynacast to act on, and it can suppress iOS→browser video.
      dynacast: false,
      // Keep the WebSocket alive even when the browser tab is hidden.
      // The default (true) disconnects the user whenever they switch tabs or
      // minimise the window, making them appear to "drop" for all other participants.
      disconnectOnPageLeave: false,
      publishDefaults: {
        videoEncoding: {
          // 4.5 Mbps gives clean 1080p detail.
          maxBitrate: 4_500_000,
          maxFramerate: 30,
        },
        // Explicit H.264 matches iOS (which also publishes H.264 with backupCodec:
        // false). Using the browser default (VP8/AV1 + backup) risks the SFU
        // forwarding a codec iOS can't decode, making remote video invisible.
        videoCodec: "h264",
        // No backup codec needed when the primary is H.264 — universally supported
        // by all platforms in this app (browser, iOS, Android).
        backupCodec: false,
        // Opus speech preset — optimised for voice clarity in calls.
        audioPreset: AudioPresets.speech,
      },
    });
    roomRef.current = room;

    // Mutable flag: was there a successful connection during this effect's lifetime?
    // Used by onDisconnected to decide whether to auto-reconnect.
    let hadConnected = false;
    // Forward reference so onDisconnected can call connectWithRetry, which is
    // defined later in the same closure.
    let connectWithRetryFn: null | ((attempt?: number) => Promise<void>) = null;

    const onConnected = () => {
      hadConnected = true;
      setWsConnected(true);
      buildPeerMeta(room);
      buildStreams(room);
    };

    const onDisconnected = () => {
      setWsConnected(false);
      setRemoteStreams([]);
      mediaPoolsRef.current.clear();
      setPeerIds([]);
      setPeerNames(new Map());
      // Auto-reconnect: if the room had already connected successfully and the
      // disconnect was unexpected (not triggered by effect cleanup / leave),
      // keep the "reconnecting" banner up and try again. LiveKit has already
      // exhausted its own brief-drop recovery before Disconnected fires.
      // The `active` guard prevents firing after unmount or after the meeting ends.
      if (active && hadConnected) {
        setIsReconnecting(true);
        setTimeout(() => {
          if (active && connectWithRetryFn) void connectWithRetryFn(0);
        }, 1_500);
      } else {
        setIsReconnecting(false);
      }
    };

    const onParticipantConnected = (participant: RemoteParticipant) => {
      buildPeerMeta(room);
      // Rebuild streams so the new participant appears in the grid immediately
      // as an avatar tile, even before they publish any camera/mic track.
      buildStreams(room);
      onParticipantJoinedRef.current?.(participant.identity, participant.name ?? participant.identity);
      setPeerConnectionStates((prev) => {
        const next = new Map(prev);
        next.set(participant.identity, "connected" as RTCPeerConnectionState);
        return next;
      });
    };

    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      // Check role BEFORE removing from state — use ref to avoid stale closure
      const departingRole = peerRolesRef.current.get(participant.identity);

      setRemoteStreams((prev) => prev.filter((s) => s.userId !== participant.identity));
      setPeerIds((prev) => prev.filter((id) => id !== participant.identity));
      setPeerNames((prev) => { const next = new Map(prev); next.delete(participant.identity); return next; });
      setPeerConnectionStates((prev) => { const next = new Map(prev); next.delete(participant.identity); return next; });
      peerRolesRef.current.delete(participant.identity);
      setPeerRoles((prev) => { const next = new Map(prev); next.delete(participant.identity); return next; });

      // Trigger host election in the consumer (MeetingRoom) if the host left
      if (departingRole === "host") {
        setHostLeftId(participant.identity);
      }

      // Remove any pending RC request from the departing participant so the
      // host's amber banner clears automatically when they leave.
      setRcRequests(prev => prev.filter(r => r.userId !== participant.identity));

      // If the departing participant was the active RC controller, revoke control
      // immediately so the Electron cursor-tracking interval is stopped and no
      // zombie intervals remain after an unexpected controller dropout.
      // Notify the host via callback so the UI can show a toast.
      if (rcGrantedToRef.current === participant.identity) {
        const controllerName = participant.name ?? participant.identity;
        onRcRevokedByDisconnectRef.current?.(controllerName);
        revokeControlRef.current?.();
      }
    };

    const onTrackSubscribed = (_track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      buildStreams(room);
    };

    const onTrackUnsubscribed = (_track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      buildStreams(room);
    };

    const onDataReceived = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const msg = JSON.parse(decoder.decode(payload)) as Record<string, unknown>;
        const type = msg["type"] as string;
        if (type === "chat") {
          const recipientId = msg["recipientId"] as string | undefined;
          const senderId = msg["senderId"] as string;
          // Only deliver: public messages, or DMs where we are the recipient or the sender
          if (!recipientId || recipientId === userId || senderId === userId) {
            onChatRef.current?.({
              id: msg["id"] as string,
              sender: msg["sender"] as string,
              senderId,
              text: msg["text"] as string,
              recipientId,
              recipientName: msg["recipientName"] as string | undefined,
            });
          }
        } else if (type === "reaction") {
          onReactionRef.current?.({ msgId: msg["msgId"] as string, emoji: msg["emoji"] as string, userId: (participant?.identity ?? "") });
        } else if (type === "hand-raise") {
          const raised = msg["raised"] as boolean;
          const pid = participant?.identity ?? "";
          setPeerHands((prev) => { const next = new Set(prev); if (raised) next.add(pid); else next.delete(pid); return next; });
        } else if (type === "rename") {
          const pid = participant?.identity ?? "";
          const name = msg["displayName"] as string;
          setPeerNames((prev) => { const next = new Map(prev); next.set(pid, name); return next; });
        } else if (type === "role-change") {
          const targetId = msg["userId"] as string;
          const role = msg["role"] as string;
          const grantedBy = msg["grantedBy"] as string;
          // Keep the ref in sync so onParticipantDisconnected can read current roles
          peerRolesRef.current.set(targetId, role);
          setPeerRoles((prev) => { const next = new Map(prev); next.set(targetId, role); return next; });
          onRoleChangeRef.current?.({ userId: targetId, role, grantedBy });
        } else if (type === "rc-request") {
          const fromId = msg["from"] as string;
          const fromName = msg["name"] as string;
          setRcRequests(prev => [...prev.filter(r => r.userId !== fromId), { userId: fromId, name: fromName }]);
        } else if (type === "rc-cancel") {
          // Participant withdrew their pending control request — remove it from the host's queue.
          const fromId = msg["from"] as string;
          setRcRequests(prev => prev.filter(r => r.userId !== fromId));
        } else if (type === "rc-granted") {
          const toId = msg["to"] as string;
          // hostBridgeReady: true  → host has window.electronRC, RC will execute for real.
          // hostBridgeReady: false → host is in browser mode; UI works but no OS cursor/keys.
          // Absent in messages from old clients — treat as true to avoid false positives.
          const hostBridgeReady = msg["hostBridgeReady"] !== false;
          // Cancel the pending request-timeout timer only when this participant
          // is the one being granted — rc-granted is broadcast so every client
          // processes this message, but only the grantee's pending request is
          // actually being answered here.
          if (toId === userId) {
            if (rcRequestTimeoutRef.current !== null) {
              clearTimeout(rcRequestTimeoutRef.current);
              rcRequestTimeoutRef.current = null;
            }
            rcRequestedAtRef.current = null;
            setIsRcRequesting(false);
            setHaveControl(true);
            // Notify the controller immediately if the host is in browser mode.
            if (!hostBridgeReady) {
              onRcGrantedByBrowserHostRef.current?.();
            }
          }
          setRcGrantedTo(toId);
          setRcRequests([]);
        } else if (type === "rc-denied") {
          const toId = msg["to"] as string;
          // Cancel any pending request-timeout timer — the host responded.
          if (toId === userId) {
            if (rcRequestTimeoutRef.current !== null) {
              clearTimeout(rcRequestTimeoutRef.current);
              rcRequestTimeoutRef.current = null;
            }
            rcRequestedAtRef.current = null;
            setIsRcRequesting(false);
            setHaveControl(false);
            // Notify consumer so it can clear the pending-request UI state.
            onRcDeniedRef.current?.();
          }
          setRcRequests(prev => prev.filter(r => r.userId !== toId));
        } else if (type === "rc-revoke") {
          setRcGrantedTo(null);
          setHaveControl(false);
          setControllerPointer(null);
          setRcRequests([]);
          setRcPaused(false);
        } else if (type === "rc-pause") {
          // Sharer paused RC — controller's inputs are blocked until resume.
          setRcPaused(true);
        } else if (type === "rc-resume") {
          setRcPaused(false);
        } else if (type === "rc-pointer" || type === "rc-move") {
          // rc-pointer: sent by web controllers directly via LiveKit data channel.
          // rc-move:    sent by mobile controllers via the API proxy (/remote/rc-event),
          //             which publishes the message to LiveKit preserving the original type.
          //             Both carry the same payload { x, y } so the same handler works.
          const pos = { x: msg["x"] as number, y: msg["y"] as number };
          setControllerPointer(pos);
          // Electron desktop: inject OS mouse movement on the machine being controlled.
          // The sharer is identified by having rcGrantedTo set while NOT holding control.
          if (rcGrantedToRef.current && !haveControlRef.current) {
            (window as Window & { electronRC?: ElectronRC }).electronRC?.moveMouseTo(pos.x, pos.y);
          }
        } else if (type === "rc-click") {
          const pos = { x: msg["x"] as number, y: msg["y"] as number };
          const button = (msg["button"] as "left" | "right" | undefined) ?? "left";
          setRcClickPos(pos);
          if (rcClickTimerRef.current) clearTimeout(rcClickTimerRef.current);
          rcClickTimerRef.current = setTimeout(() => setRcClickPos(null), 600);
          // Electron desktop: inject OS mouse click on the machine being controlled.
          if (rcGrantedToRef.current && !haveControlRef.current) {
            (window as Window & { electronRC?: ElectronRC }).electronRC?.click(pos.x, pos.y, button);
          }
        } else if (type === "rc-scroll") {
          // Electron desktop: inject scroll wheel on the machine being controlled.
          if (rcGrantedToRef.current && !haveControlRef.current) {
            (window as Window & { electronRC?: ElectronRC }).electronRC?.scroll(
              msg["x"] as number, msg["y"] as number,
              msg["dx"] as number, msg["dy"] as number,
            );
          }
        } else if (type === "rc-key-tap") {
          // Electron desktop: inject keyboard event on the machine being controlled.
          if (rcGrantedToRef.current && !haveControlRef.current) {
            (window as Window & { electronRC?: ElectronRC }).electronRC?.keyTap(
              msg["key"] as string,
              (msg["modifiers"] as string[] | undefined) ?? [],
            );
          }

        // ── Drag & Drop ──────────────────────────────────────────────────────
        } else if (type === "rc-drag-start") {
          if (rcGrantedToRef.current && !haveControlRef.current) {
            (window as Window & { electronRC?: ElectronRC }).electronRC?.dragStart(
              msg["x"] as number, msg["y"] as number,
            );
          }
        } else if (type === "rc-drag-to") {
          if (rcGrantedToRef.current && !haveControlRef.current) {
            (window as Window & { electronRC?: ElectronRC }).electronRC?.dragTo(
              msg["x"] as number, msg["y"] as number,
            );
          }
        } else if (type === "rc-drag-end") {
          if (rcGrantedToRef.current && !haveControlRef.current) {
            (window as Window & { electronRC?: ElectronRC }).electronRC?.dragEnd(
              msg["x"] as number, msg["y"] as number,
            );
          }

        } else if (type === "rc-double-click") {
          // Host receives a true double-click from the controller — forward to
          // the OS via the Electron IPC handler (robot.mouseClick('left', true)).
          if (rcGrantedToRef.current && !haveControlRef.current) {
            (window as Window & { electronRC?: ElectronRC }).electronRC?.doubleClick(
              msg["x"] as number, msg["y"] as number,
            );
          }

        // ── Clipboard Sync ───────────────────────────────────────────────────
        } else if (type === "rc-clipboard-push") {
          // Host receives text from the controller — write it to the OS clipboard.
          if (rcGrantedToRef.current && !haveControlRef.current) {
            const text = msg["text"] as string;
            const erc = (window as Window & { electronRC?: ElectronRC }).electronRC;
            if (erc) {
              erc.setClipboard(text);
            } else {
              navigator.clipboard.writeText(text).catch(() => {});
            }
          }
        } else if (type === "rc-clipboard-pull") {
          // Host receives a pull request — read clipboard and send it back.
          if (rcGrantedToRef.current && !haveControlRef.current) {
            const erc = (window as Window & { electronRC?: ElectronRC }).electronRC;
            const reading = erc ? erc.getClipboard() : navigator.clipboard.readText();
            reading.then((text: string) => {
              sendDataRef.current({ type: "rc-clipboard-data", text });
            }).catch(() => {});
          }
        } else if (type === "rc-clipboard-data") {
          // Controller receives clipboard data from the host — write to local clipboard.
          if (haveControlRef.current) {
            const text = msg["text"] as string;
            navigator.clipboard.writeText(text).catch(() => {});
            setRcClipboardData({ text, ts: Date.now() });
          }

        } else if (type === "force-action") {
          const targetId = msg["targetId"] as string;
          const action = msg["action"] as string;
          if (targetId === userId) {
            if (action === "force-mute") onForceMuteRef.current?.();
            else if (action === "force-cam-off") onForceCamOffRef.current?.();
            else if (action === "force-stop-share") onForceStopShareRef.current?.();
            else if (action === "force-kick") onForceKickRef.current?.();
          }
        } else if (type === "caption") {
          const sender = msg["sender"] as string;
          const text = msg["text"] as string;
          onCaptionRef.current?.({ sender, text });
        }
      } catch {
        // ignore
      }
    };

    const onReconnecting = () => {
      setWsConnected(false);
      setIsReconnecting(true);
    };

    const onReconnected = () => {
      setWsConnected(true);
      setIsReconnecting(false);
      buildPeerMeta(room);
      buildStreams(room);
      // Publications are gone after a full restart. Put the screen share back
      // if the capture track is still live, so viewers don't sit on a black tile
      // while the sharer still thinks they are presenting.
      void republishScreenShareRef.current();
    };

    const refreshStreams = () => buildStreams(room);

    room
      .on(RoomEvent.Connected, onConnected)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.Reconnecting, onReconnecting)
      .on(RoomEvent.Reconnected, onReconnected)
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.TrackPublished, refreshStreams)
      .on(RoomEvent.TrackUnpublished, refreshStreams)
      .on(RoomEvent.TrackMuted, refreshStreams)
      .on(RoomEvent.TrackUnmuted, refreshStreams)
      .on(RoomEvent.TrackStreamStateChanged, refreshStreams)
      .on(RoomEvent.DataReceived, onDataReceived);

    let active = true;
    // Clear any previous error when a fresh connection effect starts.
    setConnectionError(null);

    // Keep retries conservative so we don't hammer a rate-limited server.
    // 3 attempts: delays of 3 s, 6 s → total ~12 s before giving up.
    const MAX_RETRIES = 2;
    const BASE_DELAY_MS = 3_000;

    const connectWithRetry = async (attempt = 0): Promise<void> => {
      try {
        // Use ref values so this closure always reads the latest display name
        // without the effect needing displayName in its dependency array.
        const { token, livekitUrl } = await fetchToken(roomId, displayNameRef.current, maxParticipants);
        if (!active) return;
        await room.connect(livekitUrl, token);
        if (!active) { await room.disconnect(); return; }
        // Successfully connected — clear any previous error.
        setConnectionError(null);

        // Use the ref so we always read the stream that was current when the
        // effect ran — without including localStream in the dep array (which
        // would tear down the whole room every time the camera track changes).
        const stream = localStreamRef.current;
        if (stream) {
          const videoTrack = stream.getVideoTracks()[0];
          const audioTrack = stream.getAudioTracks()[0];
          if (videoTrack) {
            await room.localParticipant.publishTrack(videoTrack, {
              source: Track.Source.Camera,
              videoEncoding: {
                maxBitrate: 4_500_000,
                maxFramerate: 30,
              },
              // No simulcast: H.264 simulcast has limited browser support and is
              // not needed for cross-platform calls (iOS + browser both use H.264).
            });
          }
          if (audioTrack) {
            await room.localParticipant.publishTrack(audioTrack, {
              source: Track.Source.Microphone,
              audioPreset: AudioPresets.speech,
            });
          }
          // Signal that the camera publication now exists — safe to replaceTrack.
          if (active) setTracksPublished(true);
        }
        if (active) {
          setIsReconnecting(false);
          await republishScreenShareRef.current();
        }
      } catch (err) {
        if (!active) return;
        const errMsg = err instanceof Error ? err.message : String(err);
        const errCode = (err as Record<string, unknown>)?.code;
        // Report the error back to the server so it shows up in production logs.
        void fetch("/api/livekit/error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room: roomId, attempt,
            message: errMsg,
            name: err instanceof Error ? err.name : undefined,
            code: errCode,
          }),
        }).catch(() => {});

        // 403 means this user is not an admitted participant of the meeting.
        // Retrying will never succeed — surface a clear message immediately.
        const httpStatus = (err as Record<string, unknown>)?.httpStatus;
        const isNotAdmitted = httpStatus === 403 ||
          (typeof errMsg === "string" && errMsg.includes("403"));

        if (isNotAdmitted) {
          console.error("LiveKit token denied (403) — user not an admitted participant:", err);
          setWsConnected(false);
          setIsReconnecting(false);
          setConnectionError("__not_admitted__");
          return;
        }

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`LiveKit connection attempt ${attempt + 1} failed, retrying in ${delay}ms…`, err);
          await new Promise<void>((res) => setTimeout(res, delay));
          if (active) await connectWithRetry(attempt + 1);
        } else {
          console.error("LiveKit connection failed after all retries:", err);
          setWsConnected(false);
          setIsReconnecting(false);
          // Surface a user-readable message. errCode=1 from LiveKit is
          // ServerUnreachable — commonly caused by a rate limit (HTTP 429) or
          // the LiveKit project being over its plan limits.
          const isRateLimit = errCode === 1 || (typeof errMsg === "string" && errMsg.toLowerCase().includes("websocket"));
          setConnectionError(
            isRateLimit
              ? "Video server is temporarily unavailable (too many connections). Wait a moment, then click Retry."
              : `Could not connect to video server: ${errMsg}`,
          );
        }
      }
    };

    // Wire the forward reference so onDisconnected can trigger a fresh reconnect.
    connectWithRetryFn = connectWithRetry;
    connectWithRetry();

    return () => {
      active = false;
      // Cancel any pending RC request-timeout timer so it cannot fire after unmount.
      if (rcRequestTimeoutRef.current !== null) {
        clearTimeout(rcRequestTimeoutRef.current);
        rcRequestTimeoutRef.current = null;
      }
      rcRequestedAtRef.current = null;
      room.disconnect();
      roomRef.current = null;
      mediaPoolsRef.current.clear();
      setWsConnected(false);
      setIsReconnecting(false);
      setTracksPublished(false);
      setRemoteStreams([]);
      setPeerIds([]);
      setPeerNames(new Map());
      setPeerHands(new Set());
      setPeerRoles(new Map());
      peerRolesRef.current.clear();
    };
  // NOTE: localStream and displayName are intentionally excluded from this dep array.
  // • localStream — including it would tear down the room every time the camera
  //   track changes (virtual background, etc.). Track mutations are handled by
  //   the separate effect below.
  // • displayName — Clerk resolves the user's real name ~20 s after mount.
  //   Including it would restart the room mid-meeting when the name loads.
  //   Both values are kept current via refs and read inside connectWithRetry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, userId, buildStreams, buildPeerMeta]);

  // ── Track-mutation effect ──────────────────────────────────────────────────
  // When localStream changes while the room is already connected (e.g. the user
  // applied a virtual background, switched cameras, or toggled the mic), update
  // the published tracks in-place instead of reconnecting the whole room.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    if (!localStream) return;

    const local = room.localParticipant;
    const newVideo = localStream.getVideoTracks()[0] ?? null;
    const newAudio = localStream.getAudioTracks()[0] ?? null;

    // Replace or publish video
    const videoPub = local.getTrackPublication(Track.Source.Camera);
    if (newVideo) {
      if (videoPub?.track) {
        videoPub.track.replaceTrack(newVideo).catch((e: unknown) =>
          console.warn("useLiveKit: replaceTrack (video) failed", e),
        );
      } else {
        local
          .publishTrack(newVideo, {
            source: Track.Source.Camera,
            videoEncoding: { maxBitrate: 4_500_000, maxFramerate: 30 },
          })
          .catch((e: unknown) =>
            console.warn("useLiveKit: publishTrack (video) failed", e),
          );
      }
    } else if (videoPub) {
      local.unpublishTrack(videoPub.track!.mediaStreamTrack).catch(() => {});
    }

    // Replace or publish audio
    const audioPub = local.getTrackPublication(Track.Source.Microphone);
    if (newAudio) {
      if (audioPub?.track) {
        audioPub.track.replaceTrack(newAudio).catch((e: unknown) =>
          console.warn("useLiveKit: replaceTrack (audio) failed", e),
        );
      } else {
        local
          .publishTrack(newAudio, { source: Track.Source.Microphone })
          .catch((e: unknown) =>
            console.warn("useLiveKit: publishTrack (audio) failed", e),
          );
      }
    }
  }, [localStream]);

  const sendData = useCallback((payload: object, reliable = true) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    room.localParticipant.publishData(encoder.encode(JSON.stringify(payload)), { reliable });
  }, []);

  // Stable ref so the data-received closure (captured in the LiveKit useEffect)
  // can call sendData without becoming stale after re-renders.
  const sendDataRef = useRef(sendData);
  useEffect(() => { sendDataRef.current = sendData; }, [sendData]);

  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack | null) => {
    const room = roomRef.current;
    if (!room) return;
    const local: LocalParticipant = room.localParticipant;
    const pub = local.getTrackPublication(Track.Source.Camera);
    if (!pub) return;
    // Skip if the track being requested is already the one published —
    // calling replaceTrack with the same track can trigger unnecessary WebRTC
    // renegotiation in some browsers and causes brief video glitches.
    if (newTrack && newTrack !== pub.track?.mediaStreamTrack) {
      await pub.track?.replaceTrack(newTrack);
    }
  }, []);

  // ── Remote Control helpers ─────────────────────────────────────────────────

  const requestControl = useCallback(() => {
    // Cancel any previous pending timer before (re-)requesting.
    if (rcRequestTimeoutRef.current !== null) {
      clearTimeout(rcRequestTimeoutRef.current);
    }
    rcRequestedAtRef.current = Date.now();
    setIsRcRequesting(true);
    rcRequestTimeoutRef.current = setTimeout(() => {
      rcRequestTimeoutRef.current = null;
      rcRequestedAtRef.current = null;
      setIsRcRequesting(false);
      // Notify the consumer so it can clear the re-grant latch, ensuring the
      // next successful grant shows "Control Granted!" rather than "re-granted".
      onRcRequestTimeoutRef.current?.();
    }, RC_REQUEST_TIMEOUT_MS);
    sendData({ type: "rc-request", from: userId, name: displayName });
  }, [sendData, userId, displayName]);

  /** Cancel a pending control request before the host responds. */
  const cancelRcRequest = useCallback(() => {
    if (rcRequestTimeoutRef.current !== null) {
      clearTimeout(rcRequestTimeoutRef.current);
      rcRequestTimeoutRef.current = null;
    }
    rcRequestedAtRef.current = null;
    setIsRcRequesting(false);
    // Send a cancel signal so the host can dismiss the approval prompt.
    sendData({ type: "rc-cancel", from: userId });
  }, [sendData, userId]);

  const grantControl = useCallback((targetUserId: string, hostBridgeReady = false) => {
    setRcGrantedTo(targetUserId);
    setRcRequests([]);
    // Include hostBridgeReady so the controller knows immediately whether real
    // OS cursor/keyboard actions will execute on the host machine.
    sendData({ type: "rc-granted", to: targetUserId, hostBridgeReady });
  }, [sendData]);

  const denyControl = useCallback((targetUserId: string) => {
    setRcRequests(prev => prev.filter(r => r.userId !== targetUserId));
    sendData({ type: "rc-denied", to: targetUserId });
  }, [sendData]);

  const revokeControl = useCallback(() => {
    setRcGrantedTo(null);
    setHaveControl(false);
    setControllerPointer(null);
    setRcRequests([]);
    setRcPaused(false);
    sendData({ type: "rc-revoke" });
  }, [sendData]);

  /** Temporarily suspend the active RC grant without ending it. */
  const pauseControl = useCallback(() => {
    setRcPaused(true);
    sendData({ type: "rc-pause" });
  }, [sendData]);

  /** Re-enable an RC grant that was previously paused. */
  const resumeControl = useCallback(() => {
    setRcPaused(false);
    sendData({ type: "rc-resume" });
  }, [sendData]);

  // Clears only the local "I have control" state without broadcasting any
  // rc-revoke message.  Use this for reconciliation after a reconnect when the
  // server confirms the grant is gone — calling revokeControl() here would
  // broadcast an unwanted revoke that could disrupt a grant the host issued to
  // someone else during the outage.
  const clearLocalControlState = useCallback(() => {
    setHaveControl(false);
  }, []);
  // Restores "I have control" from a server-side rc-state poll without sending
  // any LiveKit message. Used when a participant (re)joins after the grant was
  // already issued so they never received the rc-granted data-channel message.
  const recoverControlState = useCallback(() => {
    setHaveControl(true);
  }, []);
  // Keep the ref in sync so onParticipantDisconnected (a closure captured in
  // the room useEffect) can call revokeControl without a stale reference.
  useEffect(() => { revokeControlRef.current = revokeControl; }, [revokeControl]);

  const sendPointerEvent = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastPointerRef.current < 33) return;
    lastPointerRef.current = now;
    sendData({ type: "rc-pointer", x, y }, false);
  }, [sendData]);

  const sendClickEvent = useCallback((x: number, y: number, button: "left" | "right" = "left") => {
    sendData({ type: "rc-click", x, y, button });
  }, [sendData]);

  const sendScrollEvent = useCallback((x: number, y: number, dx: number, dy: number) => {
    sendData({ type: "rc-scroll", x, y, dx, dy }, false);
  }, [sendData]);

  const sendKeyEvent = useCallback((key: string, modifiers: string[] = []) => {
    sendData({ type: "rc-key-tap", key, modifiers });
  }, [sendData]);

  // ── Drag & Drop send helpers ─────────────────────────────────────────────────

  const sendDragStart = useCallback((x: number, y: number) => {
    sendData({ type: "rc-drag-start", x, y });
  }, [sendData]);

  const sendDragTo = useCallback((x: number, y: number) => {
    // Unreliable delivery for smooth motion — dropped frames are invisible at 30fps+
    sendData({ type: "rc-drag-to", x, y }, false);
  }, [sendData]);

  const sendDragEnd = useCallback((x: number, y: number) => {
    sendData({ type: "rc-drag-end", x, y });
  }, [sendData]);

  // Sends a guaranteed true double-click to the host (uses robotjs double flag,
  // not two rapid singles which are timing-dependent).
  const sendDoubleClick = useCallback((x: number, y: number) => {
    sendData({ type: "rc-double-click", x, y });
  }, [sendData]);

  // ── Clipboard sync send helpers ──────────────────────────────────────────────

  const sendClipboardPush = useCallback((text: string) => {
    sendData({ type: "rc-clipboard-push", text });
  }, [sendData]);

  const sendClipboardPull = useCallback(() => {
    sendData({ type: "rc-clipboard-pull" });
  }, [sendData]);

  const dropPublishedScreen = useCallback(async (video: MediaStreamTrack, audio: MediaStreamTrack | null) => {
    const room = roomRef.current;
    if (!room) return;
    const videoPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (videoPub?.track?.mediaStreamTrack === video) {
      // Leave the capture running; the meeting page stops it after the UI clears.
      await room.localParticipant.unpublishTrack(videoPub.track, false);
    }
    const audioPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (audio && audioPub?.track?.mediaStreamTrack === audio) {
      await room.localParticipant.unpublishTrack(audioPub.track, false);
    }
  }, []);

  const publishScreenTracks = useCallback(async (
    video: MediaStreamTrack,
    audio: MediaStreamTrack | null,
    optimizeForVideo: boolean,
    generation: number,
  ) => {
    const stillCurrent = () => screenGenRef.current === generation;
    const room = roomRef.current;
    if (!stillCurrent()) return;
    if (!room || room.state !== ConnectionState.Connected) {
      throw new Error("Not connected to the meeting");
    }
    if (video.readyState !== "live") {
      throw new Error("Screen capture has ended");
    }
    // Stop can win while publishTrack is in flight. The publication then
    // appears only after unpublish already looked, so drop it here.
    const dropIfStale = async (source: Track.Source, media: MediaStreamTrack) => {
      if (stillCurrent()) return false;
      const pub = room.localParticipant.getTrackPublication(source);
      if (pub?.track && pub.track.mediaStreamTrack === media) {
        await room.localParticipant.unpublishTrack(pub.track, false);
      }
      return true;
    };
    const profile = screenShareProfile(optimizeForVideo);
    video.contentHint = profile.contentHint;

    const videoOptions: TrackPublishOptions = {
      source: Track.Source.ScreenShare,
      // H.264 matches the room default so every client can decode the share.
      // scalabilityMode L1T3 is VP8/VP9/AV1-only; pairing it with H.264 makes
      // publishTrack reject and the share never leaves this machine.
      videoCodec: "h264",
      simulcast: false,
      degradationPreference: profile.degradationPreference,
      videoEncoding: {
        maxBitrate: profile.maxBitrate,
        maxFramerate: profile.maxFramerate,
      },
    };

    const existingVideo = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (existingVideo?.track && existingVideo.track.mediaStreamTrack !== video) {
      await room.localParticipant.unpublishTrack(existingVideo.track, false);
    }
    if (await dropIfStale(Track.Source.ScreenShare, video)) return;
    if (!existingVideo?.track || existingVideo.track.mediaStreamTrack !== video) {
      await room.localParticipant.publishTrack(video, videoOptions);
    }
    if (await dropIfStale(Track.Source.ScreenShare, video)) return;

    const existingAudio = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (audio && audio.readyState === "live") {
      if (existingAudio?.track && existingAudio.track.mediaStreamTrack !== audio) {
        await room.localParticipant.unpublishTrack(existingAudio.track, false);
      }
      if (await dropIfStale(Track.Source.ScreenShareAudio, audio)) {
        await dropIfStale(Track.Source.ScreenShare, video);
        return;
      }
      if (!existingAudio?.track || existingAudio.track.mediaStreamTrack !== audio) {
        try {
          await room.localParticipant.publishTrack(audio, { source: Track.Source.ScreenShareAudio });
        } catch (err) {
          // The picture is the share. A missing system-audio track should not
          // take the whole share down (the picker checkbox is optional).
          console.warn("useLiveKit: screen share audio publish failed", err);
        }
      }
      if (await dropIfStale(Track.Source.ScreenShareAudio, audio)) {
        await dropIfStale(Track.Source.ScreenShare, video);
        return;
      }
    } else if (existingAudio?.track) {
      await room.localParticipant.unpublishTrack(existingAudio.track, false);
    }
    if (await dropIfStale(Track.Source.ScreenShare, video)) {
      if (audio) await dropIfStale(Track.Source.ScreenShareAudio, audio);
    }
  }, []);

  const publishScreenShare = useCallback(async (track: MediaStreamTrack, options?: ScreenSharePublishOptions) => {
    const generation = ++screenGenRef.current;
    const audio = options?.audioTrack && options.audioTrack.readyState === "live" ? options.audioTrack : null;
    const optimizeForVideo = !!options?.optimizeForVideo;
    screenSessionRef.current = { generation, video: track, audio, optimizeForVideo };
    try {
      await publishScreenTracks(track, audio, optimizeForVideo, generation);
    } catch (err) {
      if (screenSessionRef.current?.generation === generation) {
        screenSessionRef.current = null;
      }
      await dropPublishedScreen(track, audio);
      throw err;
    }
    if (screenSessionRef.current?.generation !== generation) {
      // Stop won the race — drop what we just published.
      await dropPublishedScreen(track, audio);
    }
  }, [publishScreenTracks, dropPublishedScreen]);

  const republishScreenShare = useCallback(async () => {
    const session = screenSessionRef.current;
    const room = roomRef.current;
    if (!session || !room || room.state !== ConnectionState.Connected) return;
    if (session.video.readyState !== "live") {
      if (screenSessionRef.current?.generation === session.generation) {
        screenSessionRef.current = null;
      }
      return;
    }
    try {
      await publishScreenTracks(session.video, session.audio, session.optimizeForVideo, session.generation);
    } catch (err) {
      console.warn("useLiveKit: screen share republish failed", err);
      if (screenSessionRef.current?.generation === session.generation) {
        onScreenShareInterruptedRef.current?.();
      }
      return;
    }
    // Stop won the race while the republish was in flight.
    if (screenSessionRef.current?.generation !== session.generation) {
      await dropPublishedScreen(session.video, session.audio);
    }
  }, [publishScreenTracks, dropPublishedScreen]);
  republishScreenShareRef.current = republishScreenShare;

  const unpublishScreenShare = useCallback(async () => {
    // Invalidate any in-flight publish/republish before awaiting network I/O.
    screenGenRef.current += 1;
    screenSessionRef.current = null;
    const room = roomRef.current;
    if (room) {
      const videoPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (videoPub?.track) {
        await room.localParticipant.unpublishTrack(videoPub.track, false);
      }
      const audioPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
      if (audioPub?.track) {
        await room.localParticipant.unpublishTrack(audioPub.track, false);
      }
    }
    setRcGrantedTo(null);
    setHaveControl(false);
    setControllerPointer(null);
    setRcRequests([]);
    sendData({ type: "rc-revoke" });
  }, [sendData]);

  const startRoomAudio = useCallback(async () => {
    // Play before any await so a Stop/Share click's user activation still
    // applies. getDisplayMedia pauses these elements, and waiting on
    // startAudio() first drops the gesture.
    const replay = () => {
      if (typeof document === "undefined") return;
      document.querySelectorAll<HTMLMediaElement>("[data-remote-media]").forEach((el) => {
        if (el.srcObject) void el.play().catch(() => {});
      });
    };
    replay();
    const room = roomRef.current;
    try {
      await room?.startAudio();
    } catch {
      // Autoplay is still locked until the next gesture.
    }
    replay();
  }, []);

  const sendChatMessage = useCallback((
    id: string, sender: string, senderId: string, text: string,
    recipientId?: string, recipientName?: string,
  ) => {
    sendData({ type: "chat", id, sender, senderId, text, ...(recipientId ? { recipientId, recipientName } : {}) });
  }, [sendData]);

  const sendReaction = useCallback((msgId: string, emoji: string) => {
    sendData({ type: "reaction", msgId, emoji });
  }, [sendData]);

  const rename = useCallback((newName: string) => {
    sendData({ type: "rename", displayName: newName });
  }, [sendData]);

  const sendHandRaise = useCallback((raised: boolean) => {
    sendData({ type: "hand-raise", raised });
  }, [sendData]);

  const sendRoleChange = useCallback((targetUserId: string, newRole: string) => {
    const room = roomRef.current;
    // Keep our own ref in sync when we send role changes
    peerRolesRef.current.set(targetUserId, newRole);
    sendData({ type: "role-change", userId: targetUserId, role: newRole, grantedBy: room?.localParticipant.identity ?? "" });
  }, [sendData]);

  const sendCaption = useCallback((sender: string, text: string) => {
    sendData({ type: "caption", sender, text });
  }, [sendData]);

  const sendForceAction = useCallback((targetId: string, action: string) => {
    sendData({ type: "force-action", targetId, action });
  }, [sendData]);

  return {
    remoteStreams,
    wsConnected,
    connectionError,
    tracksPublished,
    replaceVideoTrack,
    publishScreenShare,
    unpublishScreenShare,
    startRoomAudio,
    sendChatMessage,
    sendReaction,
    rename,
    sendHandRaise,
    sendRoleChange,
    sendCaption,
    sendForceAction,
    peerNames,
    peerIds,
    peerHands,
    peerRoles,
    peerConnectionStates,
    // Host election
    hostLeftId,
    clearHostLeft,
    // Remote Control
    isReconnecting,
    rcRequests,
    rcGrantedTo,
    haveControl,
    isRcRequesting,
    controllerPointer,
    rcClickPos,
    requestControl,
    cancelRcRequest,
    grantControl,
    denyControl,
    revokeControl,
    pauseControl,
    resumeControl,
    rcPaused,
    clearLocalControlState,
    recoverControlState,
    sendPointerEvent,
    sendClickEvent,
    sendScrollEvent,
    sendKeyEvent,
    // Drag & Drop
    sendDragStart,
    sendDragTo,
    sendDragEnd,
    sendDoubleClick,
    // Clipboard sync
    sendClipboardPush,
    sendClipboardPull,
    rcClipboardData,
  };
}
