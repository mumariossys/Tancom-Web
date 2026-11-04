import { useEffect, useRef, useState, useCallback } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Loader2 } from "lucide-react";

interface CallModalProps {
  callRoomName: string;
  token: string;
  livekitUrl: string;
  displayName: string;
  callType?: "audio" | "video";
  onEnd: () => void;
}

interface RemoteVideo {
  participantId: string;
  participantName: string;
  stream: MediaStream;
  isCamera: boolean;
}

function VideoTile({ stream, name, muted = false }: { stream: MediaStream; name: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play().catch(() => {});
    return () => { if (el) el.srcObject = null; };
  }, [stream]);
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-800 aspect-video flex items-center justify-center">
      <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      {/* Fallback avatar shown when video track is absent */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="hidden only:flex h-16 w-16 rounded-full bg-blue-600 items-center justify-center text-white text-xl font-bold">
          {initials}
        </div>
      </div>
      <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">{name}</div>
    </div>
  );
}

/** Hidden audio element — plays a remote participant's audio track. */
function AudioTrack({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play().catch(() => {});
    return () => {
      if (el) { el.pause(); el.srcObject = null; }
    };
  }, [stream]);
  // Render nothing visible — the audio element exists purely to play sound.
  return <audio ref={ref} autoPlay />;
}

// ── Fully stops all tracks published by the local participant ─────────────────
function stopRoomTracks(room: Room) {
  try {
    room.localParticipant?.trackPublications.forEach((pub) => {
      pub.track?.mediaStreamTrack?.stop();
    });
  } catch {
    // ignore — room may already be gone
  }
}

export default function CallModal({
  callRoomName,
  token,
  livekitUrl,
  displayName,
  callType = "video",
  onEnd,
}: CallModalProps) {
  const roomRef = useRef<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(callType === "video");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Map of identity → display-name for all currently-connected remote participants.
  // Populated from ParticipantConnected events (and a Connected-time scan) so
  // it is accurate even when the remote joins with their mic already muted
  // (muted tracks are never subscribed, so audioRemotes would be empty).
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, string>>(new Map());
  // identity → muted: tracks which remote participants have their mic off
  const [remoteMutedIds, setRemoteMutedIds] = useState<Set<string>>(new Set());
  // identity set of participants currently speaking (non-empty audio level)
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());

  // ── Stable ref for onEnd — prevents the useEffect from re-running when the
  // parent re-renders (e.g. on new chat messages) and passes a new arrow fn.
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  // ── Connect to LiveKit once (stable deps: only token/url/callType) ──────────
  useEffect(() => {
    let disposed = false;

    const room = new Room({ adaptiveStream: false, dynacast: false });
    roomRef.current = room;

    // Helper: read current mic mute state from a participant's publications.
    // Called both at connect-time (for participants already in the room) and
    // when a new participant joins, so we always have the correct initial state.
    const seedMuteState = (identity: string, isMuted: boolean) => {
      if (isMuted) {
        setRemoteMutedIds((prev) => new Set([...prev, identity]));
      }
    };

    room.on(RoomEvent.Connected, () => {
      if (!disposed) {
        setConnected(true);
        // Scan participants already in the room (e.g. we joined late).
        const entries: [string, string][] = [];
        room.remoteParticipants.forEach((p) => {
          entries.push([p.identity, p.name ?? p.identity]);
          // Check if their mic publication is currently muted.
          const micPub = p.getTrackPublication(Track.Source.Microphone);
          if (micPub?.isMuted) {
            seedMuteState(p.identity, true);
          }
        });
        if (entries.length > 0) {
          setRemoteParticipants((prev) => new Map([...prev, ...entries]));
        }
      }
    });

    // Use the ref — calling onEndRef.current means we always get the latest
    // callback without making it a dependency.
    room.on(RoomEvent.Disconnected, () => {
      if (!disposed) onEndRef.current();
    });

    // Re-attempt audio unlock when the browser's autoplay policy initially
    // blocks playback (e.g. the room connected before a user gesture).
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) {
        room.startAudio().catch(() => {});
      }
    });

    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (disposed) return;
      if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;
      const isCamera = track.kind === Track.Kind.Video;
      const stream = new MediaStream([track.mediaStreamTrack]);
      setRemoteVideos((prev) => {
        if (prev.find((v) => v.participantId === participant.identity && v.isCamera === isCamera)) return prev;
        return [...prev, {
          participantId: participant.identity,
          participantName: participant.name ?? participant.identity,
          stream,
          isCamera,
        }];
      });
      // Capture initial mute state — track may already be muted on subscribe
      if (track.kind === Track.Kind.Audio && pub.isMuted) {
        setRemoteMutedIds((prev) => new Set([...prev, participant.identity]));
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      const isCamera = track.kind === Track.Kind.Video;
      setRemoteVideos((prev) =>
        prev.filter((v) => !(v.participantId === participant.identity && v.isCamera === isCamera))
      );
    });

    // Track remote mic mute/unmute changes
    // When a new remote participant joins, register their identity + name and
    // seed mute state from their current mic publication.  This fires even when
    // they join with the mic already muted (no TrackSubscribed will follow).
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      if (disposed) return;
      setRemoteParticipants((prev) =>
        new Map([...prev, [participant.identity, participant.name ?? participant.identity]])
      );
      const micPub = participant.getTrackPublication(Track.Source.Microphone);
      if (micPub?.isMuted) {
        seedMuteState(participant.identity, true);
      }
    });

    // Track remote mic mute/unmute changes
    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      if (disposed) return;
      if (pub.kind !== Track.Kind.Audio) return;
      setRemoteMutedIds((prev) => new Set([...prev, participant.identity]));
    });

    room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      if (disposed) return;
      if (pub.kind !== Track.Kind.Audio) return;
      setRemoteMutedIds((prev) => {
        const next = new Set(prev);
        next.delete(participant.identity);
        return next;
      });
    });

    // Track active speakers for the speaking animation ring
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      if (disposed) return;
      setActiveSpeakerIds(new Set(speakers.map((p) => p.identity)));
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setRemoteVideos((prev) => prev.filter((v) => v.participantId !== participant.identity));
      setRemoteParticipants((prev) => {
        const next = new Map(prev);
        next.delete(participant.identity);
        return next;
      });
      setRemoteMutedIds((prev) => {
        const next = new Set(prev);
        next.delete(participant.identity);
        return next;
      });
      setActiveSpeakerIds((prev) => {
        const next = new Set(prev);
        next.delete(participant.identity);
        return next;
      });
    });

    (async () => {
      try {
        await room.connect(livekitUrl, token);
        if (disposed) { stopRoomTracks(room); room.disconnect(); return; }

        // Unlock browser audio playback. The user just tapped "Call" so a
        // gesture is in the stack — this succeeds immediately in most browsers.
        // If the browser blocks it anyway, AudioPlaybackStatusChanged fires later
        // and we retry on the next user interaction.
        room.startAudio().catch(() => {});

        await room.localParticipant.enableCameraAndMicrophone();
        if (disposed) { stopRoomTracks(room); room.disconnect(); return; }

        // Build a local preview stream from the published tracks
        const videoTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
        const audioTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
        const previewTracks: MediaStreamTrack[] = [];
        if (videoTrack && callType === "video") previewTracks.push(videoTrack);
        if (audioTrack) previewTracks.push(audioTrack);
        if (previewTracks.length > 0) setLocalStream(new MediaStream(previewTracks));

        // For audio-only calls, disable the camera after publishing
        if (callType === "audio") {
          await room.localParticipant.setCameraEnabled(false);
        }
      } catch (err) {
        console.error("Call connection error", err);
        if (!disposed) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg || "Could not connect to call server");
        }
      }
    })();

    return () => {
      disposed = true;
      // Always stop media tracks before disconnecting so the camera LED
      // turns off immediately and the next caller can acquire it cleanly.
      stopRoomTracks(room);
      room.disconnect();
      setConnected(false);
      setLocalStream(null);
      setRemoteVideos([]);
      setRemoteParticipants(new Map());
      setRemoteMutedIds(new Set());
      setActiveSpeakerIds(new Set());
    };
    // ⚠️  Intentionally omit onEnd — use onEndRef instead to keep this stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, livekitUrl, callType]);

  // ── Hang up — always works regardless of localStream timing ─────────────────
  const handleDisconnect = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      stopRoomTracks(room);
      room.disconnect();
    }
    onEndRef.current();
  }, []); // no deps — everything accessed via refs

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }, [camOn]);

  const cameraRemotes = remoteVideos.filter((v) => v.isCamera);
  const audioRemotes  = remoteVideos.filter((v) => !v.isCamera);

  // ── Error screen — shown when connection fails ────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-red-400 text-4xl">⚠️</div>
          <p className="text-white font-semibold text-lg">Call failed to connect</p>
          <p className="text-white/60 text-sm break-words">{error}</p>
          <button
            onClick={onEnd}
            className="mt-2 px-6 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      {/* Hidden audio players — one per remote participant's audio track.
          These MUST be rendered for any sound to play. Previously missing. */}
      {audioRemotes.map((v) => (
        <AudioTrack key={v.participantId} stream={v.stream} />
      ))}

      <div className="w-full max-w-2xl space-y-4">
        {/* Connection status */}
        {!connected && (
          <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
          </div>
        )}

        {/* Video grid */}
        <div className={`grid gap-3 ${cameraRemotes.length <= 1 ? "grid-cols-2" : "grid-cols-2"}`}>
          {localStream && callType === "video" && (
            <VideoTile stream={localStream} name={`${displayName} (You)`} muted />
          )}
          {cameraRemotes.map((v) => (
            <VideoTile key={`${v.participantId}-${v.isCamera}`} stream={v.stream} name={v.participantName} />
          ))}
          {/* Audio-only placeholder */}
          {callType === "audio" && connected && (
            <div className="col-span-2 flex flex-col items-center gap-4 py-12 text-white">
              {(() => {
                // Derive the remote identity and name from the participant registry,
                // not from subscribed tracks. A muted remote joins without any
                // subscribed audio track — audioRemotes would be empty — but
                // remoteParticipants is seeded by ParticipantConnected regardless.
                const [[remoteId, remoteName] = [undefined, undefined]] =
                  remoteParticipants.entries();
                const isMuted    = remoteId ? remoteMutedIds.has(remoteId)    : false;
                const isSpeaking = remoteId ? activeSpeakerIds.has(remoteId)  : false;
                // Use the remote participant's actual name from LiveKit, falling back
                // to displayName (the prop) only while they haven't joined yet.
                const shownName = remoteName ?? displayName;
                const initials = shownName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
                return (
                  <>
                    {/* Avatar with optional speaking ring and mute badge */}
                    <div className="relative flex-shrink-0">
                      {/* Speaking ring — pulsing blue outline when the remote mic is live */}
                      {isSpeaking && !isMuted && (
                        <span className="absolute inset-0 rounded-full animate-ping bg-blue-400 opacity-40 pointer-events-none" />
                      )}
                      <div className="h-20 w-20 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold relative">
                        {initials}
                      </div>
                      {/* Muted badge — bottom-right corner of the avatar */}
                      {isMuted && (
                        <span
                          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 ring-2 ring-black"
                          title={`${shownName} is muted`}
                        >
                          <MicOff className="h-3.5 w-3.5 text-white" />
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-medium">{shownName}</p>
                    <p className="text-white/60 text-sm animate-pulse">
                      {!remoteId
                        ? "Waiting for other participant…"
                        : isMuted
                        ? "Microphone muted"
                        : isSpeaking
                        ? "Speaking…"
                        : "Audio call in progress"}
                    </p>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={toggleMic}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              micOn ? "bg-white/20 hover:bg-white/30 text-white" : "bg-red-500 hover:bg-red-600 text-white"
            }`}
            title={micOn ? "Mute microphone" : "Unmute microphone"}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          {callType === "video" && (
            <button
              onClick={toggleCam}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                camOn ? "bg-white/20 hover:bg-white/30 text-white" : "bg-red-500 hover:bg-red-600 text-white"
              }`}
              title={camOn ? "Stop camera" : "Start camera"}
            >
              {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
          )}

          <button
            onClick={handleDisconnect}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
            title="End call"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        {/* Call type label */}
        <p className="text-center text-white/40 text-xs">
          {callType === "video" ? "Video call" : "Voice call"} · {callRoomName}
        </p>
      </div>
    </div>
  );
}
