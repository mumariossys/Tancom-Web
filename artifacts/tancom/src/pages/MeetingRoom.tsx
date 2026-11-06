import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser, useAuth } from "@clerk/react";
import {
  Mic, MicOff, Video, VideoOff, Monitor, MessageSquare,
  Users, Phone, PhoneOff, Shield, Hand, Copy, Lock, Unlock, AlertTriangle, Wifi, WifiOff, Wand2, Pencil, Pause, Play, Smile, MoreVertical, Crown,
  MousePointer2, ShieldCheck, X, LayoutGrid, Maximize2, Columns, Pin, PinOff, UserCheck, Captions,
  ChevronLeft, ChevronRight, ChevronUp, Minus, SendHorizonal, Bell, CheckCheck, UserX, Minimize2, SlidersHorizontal,
  FileText, Download, Upload, Sparkles, CheckSquare, Star, Lightbulb, Trash2,
  MoreHorizontal, Volume2, BarChart2, Layers, EyeOff, Eye, PanelBottomClose, PenLine, UserMinus, ChevronRight as ChevronRightIcon,
  Loader2, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getMeetingByCode, getGetMeetingByCodeQueryKey,
  listParticipants, getListParticipantsQueryKey,
  useEndMeeting, useAdmitAllParticipants, useMuteAllParticipants, useLockMeeting,
  useCreateRecording, useStopRecording, useUpdateParticipant, useUpdateMeeting, useRemoveParticipant,
  useListMeetingNotes, useCreateMeetingNote, useDeleteMeetingNote,
  useGetMeetingSummary, useGenerateMeetingSummary,
  getListMeetingNotesQueryKey, getGetMeetingSummaryQueryKey,
  exportMeetingNotes,
} from "@workspace/api-client-react";
import type { Participant, MeetingNote } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLiveKit, type RemoteStream } from "@/hooks/useLiveKit";
import { isScreenShareCancel, screenShareProfile, shouldCommitLocalScreenShare } from "@/lib/screenShare";
import { useCaptions } from "@/hooks/useCaptions";
import {
  useVirtualBackground, getSavedBackground, saveBackground, type VirtualBg,
} from "@/hooks/useVirtualBackground";
import VideoSettingsPanel from "@/components/VideoSettingsPanel";
import { cameraStore } from "@/lib/cameraStore";
import { useVideoEnhancement } from "@/hooks/useVideoEnhancement";
import { MeetingPopupStack, type RoomPopupEntry } from "@/components/room/MeetingPopup";

// ── Stale-cursor pulse config ─────────────────────────────────────────────────
/** Number of ring-pulse iterations played when the cursor goes stale. */
const STALE_PULSE_COUNT = 3;
/** Duration of each individual ring-pulse cycle, in milliseconds. */
const STALE_PULSE_DURATION_MS = 400;
/** Download page for TanCom Desktop (Electron app). Shown when RC is granted by a browser host. */
const TANCOM_DESKTOP_DOWNLOAD_URL = "/download";

// Passes cssFilter + cssTransform down to every LocalVideoTile without prop-drilling.
// The MeetingRoom component provides the value; LocalVideoTile consumes it.
const VideoEnhancementContext = createContext<{ cssFilter: string; cssTransform: string }>({
  cssFilter: "", cssTransform: "",
});

// ── Caption types ─────────────────────────────────────────────────────────────
interface CaptionLine {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

// ── Presenter camera PiP tile (shown in filmstrip when presenter is sharing) ──
function PresenterCameraTile({ cameraStream, displayName }: { cameraStream: MediaStream; displayName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = cameraStream;
    el.play().catch(() => {});
    return () => { if (el) el.srcObject = null; };
  }, [cameraStream]);
  const initials = (displayName ?? "").split(" ").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
  return (
    <div className="relative overflow-hidden bg-gray-800 rounded-xl h-full ring-2 ring-green-500/50">
      <video
        ref={videoRef} autoPlay muted playsInline disablePictureInPicture
        className="w-full h-full object-cover"
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="hidden only:flex h-10 w-10 rounded-full bg-blue-600 items-center justify-center text-white text-sm font-bold">{initials}</div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 flex items-center gap-1">
        <Monitor className="h-2.5 w-2.5 text-green-400 shrink-0" />
        <p className="text-white text-[10px] font-medium truncate">{displayName}</p>
      </div>
    </div>
  );
}

// Plays remote microphone and screen-share audio. The video elements stay muted
// so a blocked autoplay policy cannot freeze the picture on a black frame.
function RemoteAudio({ stream, trackKey }: { stream: MediaStream | null; trackKey: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream && stream.getAudioTracks().some((t) => t.readyState === "live")) {
      void el.play().catch(() => {});
    }
  }, [stream, trackKey]);
  return <audio ref={ref} data-remote-media="" autoPlay className="sr-only" />;
}

// ── Local video tile ──────────────────────────────────────────────────────────
function LocalVideoTile({ displayName, stream, screenStream, videoOn, micOn, handRaised, isHost, sharing,
  controllerPointer, isBeingControlled, rcClickPos, compact, fill, onPin, isPinned }: {
  displayName: string; stream: MediaStream | null; screenStream: MediaStream | null;
  videoOn: boolean; micOn: boolean; handRaised: boolean; isHost: boolean; sharing: boolean;
  controllerPointer?: { x: number; y: number } | null;
  isBeingControlled?: boolean;
  rcClickPos?: { x: number; y: number } | null;
  compact?: boolean;
  fill?: boolean;
  onPin?: () => void;
  isPinned?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const [showPinBtn, setShowPinBtn] = useState(false);
  const [cursorStale, setCursorStale] = useState(false);
  const activeStream = sharing && screenStream ? screenStream : stream;
  const { cssFilter, cssTransform } = useContext(VideoEnhancementContext);

  // Reset the stale flag whenever the cursor moves; mark stale after 3 s of silence.
  useEffect(() => {
    if (!controllerPointer) { setCursorStale(false); return; }
    setCursorStale(false);
    const id = setTimeout(() => setCursorStale(true), 3000);
    return () => clearTimeout(id);
  }, [controllerPointer]);
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = activeStream ?? null;
    if (activeStream) videoRef.current.play().catch(() => {});
    const bgEl = bgVideoRef.current;
    if (bgEl) {
      bgEl.srcObject = activeStream ?? null;
      if (activeStream) bgEl.play().catch(() => {});
    }
  }, [activeStream]);
  const initials = (displayName ?? "").split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
  const showVideo = sharing ? !!screenStream : (!!stream && videoOn);

  return (
    <div
      className={`relative overflow-hidden bg-gray-900 flex items-center justify-center ring-1 ring-white/10
        ${fill ? "w-full h-full rounded-2xl" : "rounded-2xl aspect-video"}`}
      onMouseEnter={() => setShowPinBtn(true)}
      onMouseLeave={() => setShowPinBtn(false)}
    >
      {/* Blurred backdrop for screen share — fills letterbox bars with a dimmed,
          blurred version of the shared content instead of solid black. */}
      {sharing && showVideo && (
        <video
          ref={bgVideoRef}
          autoPlay playsInline muted
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.35] pointer-events-none"
        />
      )}
      <video
        ref={videoRef} autoPlay muted playsInline disablePictureInPicture
        className={`absolute inset-0 w-full h-full ${sharing ? "object-contain" : "object-cover"} ${showVideo ? "" : "hidden"}`}
        style={{
          willChange: "transform",
          backfaceVisibility: "hidden",
          ...(!sharing && (cssFilter || cssTransform) ? {
            filter: cssFilter || undefined,
            transform: cssTransform || undefined,
          } : {}),
        }}
      />
      {!showVideo && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "radial-gradient(circle at 50% 38%, #1e3a5f 0%, #0f172a 65%)" }}
        >
          <div className={`rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shadow-xl ring-2 ring-blue-400/30 ${compact ? "h-11 w-11 text-sm" : "h-20 w-20 text-2xl"}`}>
            {initials}
          </div>
        </div>
      )}
      {/* Remote controller's pointer overlay */}
      {isBeingControlled && controllerPointer && (
        <div className="absolute pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2 transition-none" style={{ left: `${controllerPointer.x * 100}%`, top: `${controllerPointer.y * 100}%` }}>
          {cursorStale && (
            <div
              style={{
                position: "absolute",
                width: 32, height: 32,
                top: "50%", left: "50%",
                marginTop: -16, marginLeft: -16,
                borderRadius: "50%",
                border: "2px solid #fbbf24",
                animationName: "rc-stale-pulse",
                animationDuration: `${STALE_PULSE_DURATION_MS}ms`,
                animationIterationCount: STALE_PULSE_COUNT,
                animationTimingFunction: "ease-out",
                animationFillMode: "forwards",
              }}
            />
          )}
          <MousePointer2 className={`h-5 w-5 drop-shadow-lg ${cursorStale ? "text-amber-400" : "text-orange-400"}`} />
        </div>
      )}
      {/* Click ripple from remote controller */}
      {isBeingControlled && rcClickPos && (
        <div
          key={`${rcClickPos.x}-${rcClickPos.y}`}
          className="absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${rcClickPos.x * 100}%`, top: `${rcClickPos.y * 100}%` }}
        >
          <div className="h-8 w-8 rounded-full border-2 border-orange-400 animate-ping opacity-80" />
          <div className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-orange-400 translate-x-[-50%] translate-y-[-50%]" style={{ left: "50%", top: "50%" }} />
        </div>
      )}
      {isBeingControlled && (
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-orange-500/90 rounded-md px-2 py-0.5 text-white text-xs font-medium">
          <MousePointer2 className="h-3 w-3" /> Being Controlled
        </div>
      )}
      {/* Pin / unpin on hover */}
      {onPin && showPinBtn && (
        <button onClick={onPin} className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-black/50 hover:bg-black/75 backdrop-blur-sm rounded-lg px-2 py-1 text-white text-xs transition-colors">
          {isPinned ? <><PinOff className="h-3 w-3" /> Unpin</> : <><Pin className="h-3 w-3" /> Pin</>}
        </button>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-white font-medium truncate drop-shadow ${compact ? "text-[10px]" : "text-xs"}`}>
            {displayName} (You){sharing ? " — Screen" : ""}
          </span>
          {isHost && <span className="shrink-0 text-[9px] font-semibold bg-blue-500/90 text-white px-1.5 py-0.5 rounded">Host</span>}
        </div>
        {!compact && (
          <div className="flex items-center gap-1.5">
            {handRaised && <span className="text-yellow-300 text-xs">✋</span>}
            {!micOn && <MicOff className="h-3 w-3 text-red-400" />}
            {!videoOn && !sharing && <VideoOff className="h-3 w-3 text-red-400" />}
            {sharing && <Monitor className="h-3 w-3 text-green-400" />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sharing placeholder tile ──────────────────────────────────────────────────
// Shown in the featured area when the LOCAL user is presenting — prevents the
// recursive "infinite mirror" that occurs when the screen capture stream is
// played back inside the very window being captured.
function SharingPlaceholderTile({ displayName, stream, videoOn }: {
  displayName: string; stream: MediaStream | null; videoOn: boolean;
}) {
  const cameraRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = cameraRef.current;
    if (!el) return;
    el.srcObject = videoOn && stream ? stream : null;
    if (videoOn && stream) el.play().catch(() => {});
    return () => { if (el) el.srcObject = null; };
  }, [stream, videoOn]);

  return (
    <div className="relative w-full h-full rounded-2xl bg-gray-950 flex items-center justify-center ring-1 ring-white/10 overflow-hidden">
      {/* Faint blurred camera backdrop so the tile isn't pure black */}
      {videoOn && stream && (
        <video autoPlay playsInline muted
          ref={(el) => { if (el) { el.srcObject = stream; el.play().catch(() => {}); } }}
          className="absolute inset-0 w-full h-full object-cover blur-2xl brightness-[0.18] pointer-events-none scale-110"
        />
      )}

      {/* Centre message */}
      <div className="relative z-10 flex flex-col items-center gap-4 text-center px-8">
        <div className="h-20 w-20 rounded-full bg-green-900/40 ring-2 ring-green-700/50 flex items-center justify-center shadow-xl">
          <Monitor className="h-10 w-10 text-green-400" />
        </div>
        <div>
          <p className="text-white font-semibold text-xl tracking-tight">You are sharing your screen</p>
          <p className="text-gray-400 text-sm mt-1.5">Everyone else in the meeting can see your screen</p>
        </div>
      </div>

      {/* Camera inset — bottom-right, like Zoom's self-view during sharing */}
      {videoOn && stream && (
        <div className="absolute bottom-4 right-4 w-40 aspect-video rounded-xl overflow-hidden ring-2 ring-white/20 shadow-2xl">
          <video ref={cameraRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
            <span className="text-white text-[10px] font-medium truncate block">{displayName}</span>
          </div>
        </div>
      )}

      {/* Name label at bottom-left */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2.5">
        <span className="text-white text-xs font-medium">{displayName} (You) — Screen</span>
      </div>
    </div>
  );
}

// ── Remote video tile ─────────────────────────────────────────────────────────
function RemoteVideoTile({ remote, displayName, isHost, handRaised, index, connectionState,
  haveControl, isRcRequesting, controllerPointer, localDisplayName, onRequestControl, onCancelRequest, rcRequestPending, isRcPaused = false,
  onPointerMove, onSendClick,
  onSendScroll, onSendKey, onDragStart, onDragTo, onDragEnd, onDoubleClick,
  compact, fill, onPin, isPinned }: {
  remote: RemoteStream; displayName: string; isHost: boolean; handRaised: boolean; index: number;
  connectionState?: RTCPeerConnectionState;
  haveControl: boolean;
  isRcRequesting?: boolean;
  controllerPointer: { x: number; y: number } | null;
  localDisplayName: string;
  onRequestControl: () => void;
  onCancelRequest: () => void;
  rcRequestPending?: boolean;
  isRcPaused?: boolean;
  onPointerMove: (x: number, y: number) => void;
  onSendClick?: (x: number, y: number, button?: "left" | "right") => void;
  onSendScroll?: (x: number, y: number, dx: number, dy: number) => void;
  onSendKey?: (key: string, modifiers: string[]) => void;
  onDragStart?: (x: number, y: number) => void;
  onDragTo?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onDoubleClick?: (x: number, y: number) => void;
  compact?: boolean;
  fill?: boolean;
  onPin?: () => void;
  isPinned?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [showRequestBtn, setShowRequestBtn] = useState(false);
  const [localClickPos, setLocalClickPos] = useState<{ x: number; y: number } | null>(null);
  const localClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursorStale, setCursorStale] = useState(false);
  // Controller's own cursor position — updated locally on every mousemove so the
  // controller sees immediate feedback without waiting for the host to echo it back.
  const [localPointerPos, setLocalPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Reset the stale flag whenever the cursor moves; mark stale after 3 s of silence.
  useEffect(() => {
    if (!controllerPointer) { setCursorStale(false); return; }
    setCursorStale(false);
    const id = setTimeout(() => setCursorStale(true), 3000);
    return () => clearTimeout(id);
  }, [controllerPointer]);
  // Drag state — track whether we're in an active drag and suppress the
  // synthetic onClick that fires at the end of a drag gesture.
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const wasDraggingRef = useRef(false);
  const COLORS = ["#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
  const color = COLORS[index % COLORS.length];
  const initials = (displayName ?? "").split(" ").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // stream is null when the participant has camera + mic both off — show avatar only
    if (!remote.stream) {
      el.srcObject = null;
      const bgEl = bgVideoRef.current;
      if (bgEl) bgEl.srcObject = null;
      setHasVideo(false);
      return;
    }
    el.srcObject = remote.stream;
    void el.play().catch(() => {});
    const bgEl = bgVideoRef.current;
    if (bgEl) {
      bgEl.srcObject = remote.stream;
      void bgEl.play().catch(() => {});
    }
    const videoTracks = remote.stream.getVideoTracks();
    setHasVideo(videoTracks.some((t) => t.readyState === "live"));
    const ms = remote.stream;
    const onChange = () => setHasVideo(ms.getVideoTracks().some((t) => t.readyState === "live"));
    ms.addEventListener("addtrack", onChange);
    ms.addEventListener("removetrack", onChange);
    videoTracks.forEach((t) => t.addEventListener("unmute", onChange));
    return () => {
      ms.removeEventListener("addtrack", onChange);
      ms.removeEventListener("removetrack", onChange);
      videoTracks.forEach((t) => t.removeEventListener("unmute", onChange));
      el.srcObject = null;
      if (bgEl) bgEl.srcObject = null;
    };
  }, [remote.stream, remote.videoKey]);

  // Auto-focus tile when control is granted so keyboard events work immediately
  useEffect(() => {
    if (haveControl && remote.isScreenShare) {
      tileRef.current?.focus();
    }
  }, [haveControl, remote.isScreenShare]);

  // For object-contain screen-share video, the actual content occupies a sub-rect
  // of the tile container (letterbox bars on top/bottom or left/right).
  // Use the video's intrinsic resolution to compute the real content bounds so
  // that normalized (0-1) coordinates map to the shared screen, not the container.
  const getScreenShareBounds = useCallback((): { left: number; top: number; width: number; height: number } | null => {
    const tile = tileRef.current;
    const video = videoRef.current;
    if (!tile) return null;
    const rect = tile.getBoundingClientRect();
    if (!video || !video.videoWidth || !video.videoHeight) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const cw = video.videoWidth * scale;
    const ch = video.videoHeight * scale;
    return {
      left: rect.left + (rect.width - cw) / 2,
      top: rect.top + (rect.height - ch) / 2,
      width: cw,
      height: ch,
    };
  }, []);

  // ── Mouse & drag event handlers ─────────────────────────────────────────────
  //
  // Drag detection: record mousedown position; once the pointer moves more than
  // 0.5% of the share-area in any direction while the left button is held, begin
  // a drag sequence (drag-start → drag-to… → drag-end).  The synthetic onClick
  // that the browser fires at the end of the gesture is suppressed via
  // wasDraggingRef so it does not double-fire a left click.

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!haveControl || isRcPaused || !remote.isScreenShare || e.button !== 0) return;
    e.preventDefault(); // prevent accidental text-selection during drag
    const bounds = getScreenShareBounds();
    if (!bounds) return;
    const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
    dragStartPosRef.current = { x, y };
    isDraggingRef.current = false;
    wasDraggingRef.current = false;
  }, [haveControl, remote.isScreenShare, getScreenShareBounds]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!haveControl) return;
    if (isRcPaused) { setLocalPointerPos(null); return; }
    const bounds = remote.isScreenShare ? getScreenShareBounds() : (() => {
      const r = tileRef.current?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    })();
    if (!bounds) return;
    const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));

    // Drag detection: left button held + moved > 2% of content area.
    // 0.5% (0.005) was too sensitive — normal click jitter (~4 px on a 400 px tile)
    // exceeded it, setting wasDraggingRef and silently suppressing the click.
    // 2% (0.02) ≈ 8 px on a 400 px tile, which is a comfortable click tolerance.
    if (e.buttons === 1 && dragStartPosRef.current !== null) {
      const dx = Math.abs(x - dragStartPosRef.current.x);
      const dy = Math.abs(y - dragStartPosRef.current.y);
      if (!isDraggingRef.current && (dx > 0.02 || dy > 0.02)) {
        isDraggingRef.current = true;
        wasDraggingRef.current = true;
        onDragStart?.(dragStartPosRef.current.x, dragStartPosRef.current.y);
      }
      if (isDraggingRef.current) {
        onDragTo?.(x, y);
        return; // don't also send a pointer-move event while dragging
      }
    }
    onPointerMove(x, y);
    setLocalPointerPos({ x, y });
  }, [haveControl, remote.isScreenShare, onPointerMove, getScreenShareBounds, onDragStart, onDragTo]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!haveControl || !remote.isScreenShare) return;
    if (isDraggingRef.current) {
      const bounds = getScreenShareBounds();
      if (bounds) {
        const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
        onDragEnd?.(x, y);
      }
      isDraggingRef.current = false;
      dragStartPosRef.current = null;
      return;
    }
    dragStartPosRef.current = null;
  }, [haveControl, remote.isScreenShare, getScreenShareBounds, onDragEnd]);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setShowRequestBtn(false);
    setLocalPointerPos(null);
    // Cancel any in-progress drag when the cursor leaves the tile to avoid a
    // "stuck drag" state where the host mouse button stays pressed.
    if (isDraggingRef.current) {
      const bounds = getScreenShareBounds();
      if (bounds) {
        const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
        onDragEnd?.(x, y);
      }
      isDraggingRef.current = false;
      dragStartPosRef.current = null;
    }
  }, [getScreenShareBounds, onDragEnd]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!haveControl || isRcPaused || !remote.isScreenShare) return;
    // Suppress the synthetic onClick fired at the end of a drag gesture
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    // Suppress both companion onClick calls that flank a double-click event
    if (wasDblClickRef.current) {
      wasDblClickRef.current = false;
      return;
    }
    const bounds = getScreenShareBounds();
    if (!bounds) return;
    const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
    const button = e.button === 2 ? "right" : "left";
    onSendClick?.(x, y, button);
    setLocalClickPos({ x, y });
    if (localClickTimerRef.current) clearTimeout(localClickTimerRef.current);
    localClickTimerRef.current = setTimeout(() => setLocalClickPos(null), 600);
  }, [haveControl, remote.isScreenShare, onSendClick, getScreenShareBounds]);

  // True double-click: browser fires onDoubleClick before the second onClick,
  // so wasDraggingRef is not yet set. We suppress the companion onClick events
  // by tracking a separate ref so the host gets exactly one double-click, not
  // two singles + a double.
  const wasDblClickRef = useRef(false);
  const handleDblClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!haveControl || isRcPaused || !remote.isScreenShare) return;
    // Suppress both companion onClick calls that bracket the dblclick event.
    wasDblClickRef.current = true;
    const bounds = getScreenShareBounds();
    if (!bounds) return;
    const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
    onDoubleClick?.(x, y);
    setLocalClickPos({ x, y });
    if (localClickTimerRef.current) clearTimeout(localClickTimerRef.current);
    localClickTimerRef.current = setTimeout(() => setLocalClickPos(null), 600);
  }, [haveControl, remote.isScreenShare, onDoubleClick, getScreenShareBounds]);

  // Intercept the browser's native context menu on the RC tile so right-clicks
  // are forwarded to the host instead of opening the browser popup.
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!haveControl || isRcPaused || !remote.isScreenShare) return;
    e.preventDefault();
    const bounds = getScreenShareBounds();
    if (!bounds) return;
    const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
    onSendClick?.(x, y, "right");
    setLocalClickPos({ x, y });
    if (localClickTimerRef.current) clearTimeout(localClickTimerRef.current);
    localClickTimerRef.current = setTimeout(() => setLocalClickPos(null), 600);
  }, [haveControl, remote.isScreenShare, onSendClick, getScreenShareBounds]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!haveControl || isRcPaused || !remote.isScreenShare) return;
    e.preventDefault();
    const bounds = getScreenShareBounds();
    if (!bounds) return;
    const x = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height));
    const dx = Math.round(e.deltaX / 30);
    const dy = Math.round(e.deltaY / 30);
    if (dx !== 0 || dy !== 0) onSendScroll?.(x, y, dx, dy);
  }, [haveControl, remote.isScreenShare, onSendScroll, getScreenShareBounds]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!haveControl || isRcPaused || !remote.isScreenShare) return;
    e.preventDefault();
    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push("control");
    if (e.shiftKey) modifiers.push("shift");
    if (e.altKey) modifiers.push("alt");
    if (e.metaKey) modifiers.push("command");
    // Map browser key names to robotjs key names
    const keyMap: Record<string, string> = {
      Enter: "enter", Backspace: "backspace", Delete: "delete", Tab: "tab",
      Escape: "escape", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
      F1: "f1", F2: "f2", F3: "f3", F4: "f4", F5: "f5", F6: "f6",
      F7: "f7", F8: "f8", F9: "f9", F10: "f10", F11: "f11", F12: "f12",
      " ": "space",
    };
    const key = keyMap[e.key] ?? (e.key.length === 1 ? e.key.toLowerCase() : null);
    if (key) onSendKey?.(key, modifiers);
  }, [haveControl, remote.isScreenShare, onSendKey]);

  const connDot = (() => {
    if (!connectionState || connectionState === "connected") return null;
    if (connectionState === "connecting" || connectionState === "new")
      return <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" title="Connecting…" />;
    if (connectionState === "disconnected")
      return <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" title="Connection unstable" />;
    if (connectionState === "failed")
      return <span className="h-2 w-2 rounded-full bg-red-500" title="Connection failed" />;
    return null;
  })();

  return (
    <div
      ref={tileRef}
      tabIndex={haveControl && remote.isScreenShare ? 0 : undefined}
      className={`relative overflow-hidden bg-gray-900 flex items-center justify-center
        ${fill ? "w-full h-full rounded-2xl" : "rounded-2xl aspect-video"}
        ${haveControl && remote.isScreenShare ? (isRcPaused ? "cursor-not-allowed ring-2 ring-amber-600/70 outline-none" : "cursor-crosshair ring-2 ring-orange-400 outline-none") : "ring-1 ring-white/10"}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onDoubleClick={handleDblClick}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setShowRequestBtn(true)}
      onMouseLeave={handleMouseLeave}
    >
      {/* Blurred backdrop for screen share — fills the letterbox bars left/right/top/bottom
          with a dimmed, blurred version of the shared content instead of solid black. */}
      {remote.isScreenShare && (
        <video
          ref={bgVideoRef}
          autoPlay playsInline muted
          aria-hidden
          data-remote-media=""
          className={`absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.35] pointer-events-none ${hasVideo && remote.screenShareHold !== "sender" ? "" : "hidden"}`}
        />
      )}
      <video
        ref={videoRef} autoPlay playsInline muted disablePictureInPicture
        data-remote-media=""
        className={`absolute inset-0 w-full h-full ${remote.isScreenShare ? "object-contain" : "object-cover"} ${hasVideo && remote.screenShareHold !== "sender" ? "" : "hidden"}`}
        style={{
          willChange: "transform",
          backfaceVisibility: "hidden",
          // object-contain keeps the capture's own aspect ratio. object-cover
          // would crop a window or a second monitor to fill the tile.
          objectFit: remote.isScreenShare ? "contain" : "cover",
        }}
      />
      {remote.isScreenShare && remote.screenShareHold === "sender" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-gray-950 text-center px-6">
          <Monitor className="h-8 w-8 text-amber-400" />
          <p className="text-white text-sm font-medium">Screen share is paused</p>
          <p className="text-gray-400 text-xs">The picture will come back when {displayName} resumes.</p>
        </div>
      )}
      {remote.isScreenShare && remote.screenShareHold === "link" && (
        <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 text-center px-6 ${hasVideo ? "bg-black/55" : "bg-gray-950"}`}>
          <Loader2 className="h-6 w-6 text-green-400 animate-spin" />
          <p className="text-white text-sm font-medium">Reconnecting screen…</p>
        </div>
      )}
      {!hasVideo && remote.screenShareHold !== "sender" && remote.screenShareHold !== "link" && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: `radial-gradient(circle at 50% 38%, ${color}28 0%, #0f172a 65%)` }}
        >
          <div
            className={`rounded-full flex items-center justify-center text-white font-bold shadow-xl ring-2 ring-white/20 ${compact ? "h-11 w-11 text-sm" : "h-20 w-20 text-2xl"}`}
            style={{ background: `linear-gradient(135deg, ${color}dd 0%, ${color}99 100%)` }}
          >
            {initials}
          </div>
        </div>
      )}
      {/* Controller's pointer overlay */}
      {remote.isScreenShare && controllerPointer && (
        <div className="absolute pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: `${controllerPointer.x * 100}%`, top: `${controllerPointer.y * 100}%` }}>
          {cursorStale && (
            <div
              style={{
                position: "absolute",
                width: 32, height: 32,
                top: "50%", left: "50%",
                marginTop: -16, marginLeft: -16,
                borderRadius: "50%",
                border: "2px solid #fbbf24",
                animationName: "rc-stale-pulse",
                animationDuration: `${STALE_PULSE_DURATION_MS}ms`,
                animationIterationCount: STALE_PULSE_COUNT,
                animationTimingFunction: "ease-out",
                animationFillMode: "forwards",
              }}
            />
          )}
          <MousePointer2 className={`h-5 w-5 drop-shadow-lg ${cursorStale ? "text-amber-400" : "text-orange-400"}`} />
        </div>
      )}
      {/* Controller's own cursor — shown locally so the controller sees immediate
          feedback when they move the mouse, without needing a round-trip to the host. */}
      {haveControl && localPointerPos && (
        <div className="absolute pointer-events-none z-25 -translate-x-1/2 -translate-y-1/2" style={{ left: `${localPointerPos.x * 100}%`, top: `${localPointerPos.y * 100}%` }}>
          <MousePointer2 className="h-5 w-5 text-orange-400 drop-shadow-lg" />
        </div>
      )}
      {/* Local click ripple (shown to the controller after clicking) */}
      {remote.isScreenShare && localClickPos && (
        <div
          key={`click-${localClickPos.x}-${localClickPos.y}`}
          className="absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${localClickPos.x * 100}%`, top: `${localClickPos.y * 100}%` }}
        >
          <div className="h-8 w-8 rounded-full border-2 border-orange-400 animate-ping opacity-80" />
          <div className="absolute rounded-full bg-orange-400 h-2 w-2" style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)" }} />
        </div>
      )}
      {/* Watermark on screen share */}
      {remote.isScreenShare && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center select-none">
          <span className="text-white/10 text-3xl font-bold rotate-[-35deg] whitespace-nowrap tracking-widest uppercase">TanCom Meeting</span>
        </div>
      )}
      {/* Request Control / Cancel Request — hover on screen share */}
      {remote.isScreenShare && showRequestBtn && !haveControl && (
        rcRequestPending ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCancelRequest(); }}
            className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-gray-600/90 hover:bg-gray-600 rounded-lg px-2.5 py-1 text-white text-xs font-medium shadow-lg transition-colors"
          >
            <MousePointer2 className="h-3.5 w-3.5" /> Cancel Request
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onRequestControl(); }}
            disabled={isRcRequesting}
            className={`absolute top-2 right-2 z-30 flex items-center gap-1 rounded-lg px-2.5 py-1 text-white text-xs font-medium shadow-lg transition-colors ${isRcRequesting ? "bg-blue-400/90 cursor-not-allowed" : "bg-blue-600/90 hover:bg-blue-600"}`}
          >
            <MousePointer2 className="h-3.5 w-3.5" />
            {isRcRequesting ? "Requesting…" : "Request Control"}
          </button>
        )
      )}
      {/* Active control badge */}
      {remote.isScreenShare && haveControl && (
        <div className={`absolute top-2 right-2 z-30 flex items-center gap-1 rounded-lg px-2.5 py-1 text-white text-xs font-medium ${isRcPaused ? "bg-amber-600/90" : "bg-orange-500/90"}`}>
          <MousePointer2 className="h-3.5 w-3.5" /> {isRcPaused ? "Control paused" : "You have control"}
        </div>
      )}
      {/* Pin / unpin on hover — not shown on screen share tiles */}
      {!remote.isScreenShare && onPin && showRequestBtn && (
        <button onClick={onPin} className="absolute top-2 left-2 z-30 flex items-center gap-1 bg-black/60 hover:bg-black/80 rounded-lg px-2 py-1 text-white text-xs transition-colors">
          {isPinned ? <><PinOff className="h-3 w-3" /> Unpin</> : <><Pin className="h-3 w-3" /> Pin</>}
        </button>
      )}
      {connectionState === "failed" && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <p className="text-red-400 text-xs font-medium">Connection failed</p>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {remote.isScreenShare && <Monitor className="h-3 w-3 text-green-400 shrink-0" />}
          <span className={`text-white font-medium truncate drop-shadow ${compact ? "text-[10px]" : "text-xs"}`}>
            {displayName}{remote.isScreenShare ? " — Screen" : ""}
          </span>
          {isHost && <span className="shrink-0 text-[9px] font-semibold bg-blue-500/90 text-white px-1.5 py-0.5 rounded">Host</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {connDot}
          {handRaised && <span className="text-yellow-300 text-xs">✋</span>}
        </div>
      </div>
    </div>
  );
}

// ── View switcher ─────────────────────────────────────────────────────────────
type ViewMode = "gallery" | "speaker" | "sidebar";

function ViewSwitcher({ viewMode, onChange }: { viewMode: ViewMode; onChange: (v: ViewMode) => void }) {
  const btn = (v: ViewMode, icon: React.ReactNode, label: string) => (
    <button
      key={v}
      onClick={() => onChange(v)}
      title={label}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
        viewMode === v ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
      }`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
  return (
    <div className="flex items-center bg-gray-800/80 rounded-lg p-0.5 border border-gray-700 gap-0.5">
      {btn("gallery", <LayoutGrid className="h-3.5 w-3.5" />, "Gallery")}
      {btn("speaker", <Maximize2 className="h-3.5 w-3.5" />, "Speaker")}
      {btn("sidebar", <Columns className="h-3.5 w-3.5" />, "Side by Side")}
    </div>
  );
}

// ── Waiting room alert ─────────────────────────────────────────────────────────
function WaitingRoomAlert({ waiting, onAdmit, onAdmitAll, onDeny }: {
  waiting: Participant[];
  onAdmit: (p: Participant) => void;
  onAdmitAll: () => void;
  onDeny: (p: Participant) => void;
}) {
  if (waiting.length === 0) return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-80 bg-gray-900 border border-orange-500/40 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-orange-500/10 border-b border-orange-500/20">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-orange-400 animate-pulse" />
          <span className="text-orange-300 text-sm font-medium">
            {waiting.length} {waiting.length === 1 ? "person" : "people"} in waiting room
          </span>
        </div>
        {waiting.length > 1 && (
          <button onClick={onAdmitAll} className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg transition-colors">
            <CheckCheck className="h-3 w-3" /> Admit all
          </button>
        )}
      </div>
      {/* Per-person rows */}
      <div className="max-h-52 overflow-y-auto divide-y divide-gray-800">
        {waiting.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="h-8 w-8 rounded-full bg-purple-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(p.displayName ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <span className="text-white text-sm flex-1 truncate">{p.displayName ?? "Guest"}</span>
            <button onClick={() => onDeny(p)} className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-red-600/80 text-gray-300 hover:text-white px-2 py-1 rounded-lg transition-colors">
              <UserX className="h-3 w-3" /> Deny
            </button>
            <button onClick={() => onAdmit(p)} className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-lg transition-colors">
              <UserCheck className="h-3 w-3" /> Admit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Remote control request banner ──────────────────────────────────────────────
function RemoteControlBanner({ requests, isSharing, isHost, onGrant, onDeny }: {
  requests: Array<{ userId: string; name: string }>;
  isSharing: boolean;
  isHost: boolean;
  onGrant: (userId: string, hostBridgeReady: boolean) => void;
  onDeny: (userId: string) => void;
}) {
  // Remote control grant is only executable from the Electron Desktop app.
  // Two-level detection:
  //   1. window.electronRC — contextBridge injection from preload.ts (ideal).
  //   2. navigator.userAgent containing "Electron/" — fallback when the preload
  //      fails to inject the bridge (e.g. stale asar build).
  const electronBridgeReady = typeof window !== "undefined" && "electronRC" in window;
  const isElectronHost = typeof window !== "undefined" && (
    electronBridgeReady ||
    /Electron\//.test(navigator.userAgent)
  );
  if (requests.length === 0 || (!isSharing && !isHost)) return null;
  const req = requests[0];
  const canAct = isSharing || isHost;
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-gray-800 border border-blue-500/60 rounded-xl px-4 py-3 flex flex-col gap-2 shadow-xl max-w-sm w-full">
      <div className="flex items-center gap-3">
        <MousePointer2 className="h-4 w-4 text-blue-400 shrink-0" />
        <span className="text-white text-sm flex-1">
          <strong>{req.name}</strong> is requesting remote control
        </span>
        {canAct ? (
          <>
            <Button
              size="sm"
              className="h-7 text-xs shrink-0 bg-blue-600 hover:bg-blue-700"
              onClick={() => onGrant(req.userId, electronBridgeReady)}
            >
              Allow
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-300 hover:text-white shrink-0" onClick={() => onDeny(req.userId)}>Deny</Button>
          </>
        ) : (
          <span className="text-gray-400 text-xs">Waiting for host…</span>
        )}
      </div>
      {canAct && !isElectronHost && (
        <div className="flex items-start gap-2 bg-red-900/40 border border-red-700/50 rounded-lg px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-300 text-xs leading-snug">
            <strong>Desktop app required.</strong> You are using a web browser — remote control cannot execute real mouse or keyboard actions here.{" "}
            The host must use <strong>TanCom Desktop</strong> (.exe) to grant real cursor control.
          </p>
        </div>
      )}
      {canAct && isElectronHost && !electronBridgeReady && (
        <div className="flex items-start gap-2 bg-amber-900/40 border border-amber-700/50 rounded-lg px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs leading-snug">
            <strong>TanCom Desktop detected</strong> but the RC bridge failed to load.{" "}
            Quit and relaunch TanCom Desktop to fix this.{" "}
            Press <kbd className="bg-amber-900/60 border border-amber-700 rounded px-1">F12</kbd> → Console and look for{" "}
            <code className="text-amber-200">[TanCom Desktop] preload</code> lines to diagnose.
          </p>
        </div>
      )}
      {canAct && electronBridgeReady && (
        <div className="flex items-start gap-2 bg-green-900/40 border border-green-700/50 rounded-lg px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-green-400 shrink-0 mt-1" />
          <p className="text-green-300 text-xs leading-snug">
            <strong>TanCom Desktop active.</strong> Allowing will give {req.name} real cursor and keyboard control of your screen.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Security panel ─────────────────────────────────────────────────────────────
// Rendered as a dropdown anchored to the Security button in the header
function SecurityPanel({ meeting, isHost, isSharing, rcGrantedTo, peerNames, pendingRcCount, rcPaused,
  onRevoke, onPause, onResume, onLock, onToggleWaitingRoom,
  grantableParticipants, onGrantTo }: {
  meeting: { isLocked?: boolean; requiresPasscode?: boolean; waitingRoomEnabled?: boolean } | undefined | null;
  isHost: boolean;
  isSharing: boolean;
  rcGrantedTo: string | null;
  peerNames: Map<string, string>;
  pendingRcCount: number;
  rcPaused: boolean;
  onRevoke: () => void;
  onPause: () => void;
  onResume: () => void;
  onLock: () => void;
  onToggleWaitingRoom: () => void;
  grantableParticipants?: Array<{ liveKitId: string; name: string }>;
  onGrantTo?: (liveKitId: string) => void;
}) {
  const controllerName = rcGrantedTo ? (peerNames.get(rcGrantedTo) ?? rcGrantedTo.slice(0, 8)) : null;
  return (
    <div className="absolute top-full right-0 mt-2 z-50 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <ShieldCheck className="h-4 w-4 text-green-400 shrink-0" />
        <h2 className="text-white font-semibold text-sm">Meeting Security</h2>
      </div>
      <div className="p-3 space-y-2">
        {/* Encryption */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-800">
          <div className="h-2 w-2 rounded-full bg-green-400 mt-1.5 shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">End-to-End Encrypted</p>
            <p className="text-gray-400 text-xs mt-0.5">DTLS-SRTP media + TLS signaling via LiveKit</p>
          </div>
        </div>
        {/* Meeting Lock */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-2 w-2 rounded-full shrink-0 ${meeting?.isLocked ? "bg-green-400" : "bg-gray-500"}`} />
            <div className="min-w-0">
              <p className="text-white text-sm font-medium">Meeting Lock</p>
              <p className="text-gray-400 text-xs truncate">{meeting?.isLocked ? "No new participants can join" : "Meeting is open"}</p>
            </div>
          </div>
          {isHost && (
            <button onClick={onLock} className={`ml-2 shrink-0 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${meeting?.isLocked ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
              {meeting?.isLocked ? "Unlock" : "Lock"}
            </button>
          )}
        </div>
        {/* Waiting Room */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-2 w-2 rounded-full shrink-0 ${meeting?.waitingRoomEnabled ? "bg-green-400" : "bg-gray-500"}`} />
            <div className="min-w-0">
              <p className="text-white text-sm font-medium">Waiting Room</p>
              <p className="text-gray-400 text-xs truncate">{meeting?.waitingRoomEnabled ? "Participants wait for approval" : "Not enabled"}</p>
            </div>
          </div>
          {isHost && (
            <button
              onClick={onToggleWaitingRoom}
              className={`ml-2 shrink-0 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${meeting?.waitingRoomEnabled ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-blue-600 text-white hover:bg-blue-700"}`}
            >
              {meeting?.waitingRoomEnabled ? "Disable" : "Enable"}
            </button>
          )}
        </div>
        {/* Passcode */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-800">
          <div className={`h-2 w-2 rounded-full shrink-0 ${meeting?.requiresPasscode ? "bg-green-400" : "bg-gray-500"}`} />
          <div>
            <p className="text-white text-sm font-medium">Passcode</p>
            <p className="text-gray-400 text-xs">{meeting?.requiresPasscode ? "Required to join" : "Not set"}</p>
          </div>
        </div>
        {/* Remote Control */}
        <div className={`flex items-center justify-between p-3 rounded-xl ${pendingRcCount > 0 && !controllerName ? "bg-blue-900/40 border border-blue-500/40" : rcPaused && controllerName ? "bg-amber-900/30 border border-amber-700/40" : "bg-gray-800"}`}>
          <div className="flex items-center gap-3 min-w-0">
            {pendingRcCount > 0 && !controllerName ? (
              <Loader2 className="h-3.5 w-3.5 text-blue-400 shrink-0 animate-spin" />
            ) : (
              <div className={`h-2 w-2 rounded-full shrink-0 ${controllerName ? (rcPaused ? "bg-amber-400" : "bg-orange-400") : "bg-gray-500"}`} />
            )}
            <div className="min-w-0">
              <p className="text-white text-sm font-medium">Remote Control</p>
              <p className={`text-xs truncate ${pendingRcCount > 0 && !controllerName ? "text-blue-300" : rcPaused ? "text-amber-400" : "text-gray-400"}`}>
                {controllerName
                  ? rcPaused ? `${controllerName} has control — paused` : `${controllerName} has control`
                  : pendingRcCount > 0
                    ? `${pendingRcCount} pending request${pendingRcCount > 1 ? "s" : ""} — awaiting your response`
                    : "Not active"}
              </p>
            </div>
          </div>
          {(isHost || isSharing) && controllerName && (
            <div className="flex gap-1.5 ml-2 shrink-0">
              <button
                onClick={rcPaused ? onResume : onPause}
                className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${rcPaused ? "bg-amber-600 text-white hover:bg-amber-500" : "bg-gray-600 text-white hover:bg-gray-500"}`}
              >
                {rcPaused ? "Resume" : "Pause"}
              </button>
              <button onClick={onRevoke} className="text-xs px-2 py-1 rounded-lg font-medium bg-red-600/80 text-white hover:bg-red-600 transition-colors">
                Revoke
              </button>
            </div>
          )}
        </div>
        {/* Give Control To — sharer proactively grants to a participant without waiting for a request */}
        {isSharing && !controllerName && (grantableParticipants?.length ?? 0) > 0 && (
          <div className="p-3 rounded-xl bg-gray-800">
            <p className="text-white text-sm font-medium mb-2 flex items-center gap-1.5">
              <MousePointer2 className="h-3.5 w-3.5 text-blue-400" />
              Give Control To
            </p>
            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
              {grantableParticipants!.map(p => (
                <div key={p.liveKitId} className="flex items-center justify-between gap-2 bg-gray-700/60 rounded-lg px-2.5 py-1.5">
                  <span className="text-gray-200 text-xs truncate">{p.name}</span>
                  <button
                    onClick={() => onGrantTo?.(p.liveKitId)}
                    className="shrink-0 text-xs px-2 py-0.5 rounded-md font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    Grant
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Watermark */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-800">
          <div className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">Screen Share Watermark</p>
            <p className="text-gray-400 text-xs">"TanCom.us meeting Sharing" is overlaid on shared screens</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
// LiveKit identities now include a nanoid suffix (userId-nanoid8) so we can
// support the same Clerk user on multiple devices simultaneously. This helper
// matches both the old exact format and the new suffixed format.
function isHostLiveKitId(livekitId: string, hostClerkId: string | undefined): boolean {
  if (!hostClerkId) return false;
  return livekitId === hostClerkId || livekitId.startsWith(hostClerkId + '-');
}

// Extract the Clerk user ID from a LiveKit identity (strips the nanoid suffix if present).
function clerkIdFromLiveKitId(livekitId: string): string {
  const lastDash = livekitId.lastIndexOf('-');
  // nanoid(8) = exactly 8 alphanumeric chars; guard against plain user IDs
  if (lastDash > 0 && livekitId.length - lastDash - 1 === 8) {
    return livekitId.slice(0, lastDash);
  }
  return livekitId;
}

export default function MeetingRoomPage() {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [sharingDisplayLabel, setSharingDisplayLabel] = useState<string | null>(null);
  const [screenPickerSources, setScreenPickerSources] = useState<ElectronScreenSource[] | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [saveRecordingBlob, setSaveRecordingBlob] = useState<Blob | null>(null);
  const [saveRecordingFilename, setSaveRecordingFilename] = useState("");
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; sender: string; senderId: string; text: string; recipientId?: string; recipientName?: string; isSystem?: boolean }>>([]);
  const [chatRecipient, setChatRecipient] = useState<{ userId: string; name: string } | null>(null);
  const [dmUnread, setDmUnread] = useState<Map<string, number>>(new Map());
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [reactions, setReactions] = useState<Map<string, Map<string, Set<string>>>>(new Map());
  const [activePickerMsgId, setActivePickerMsgId] = useState<string | null>(null);
  const [showInputEmoji, setShowInputEmoji] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputEmojiRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const scrollFilmstrip = (dir: "left" | "right") =>
    filmstripRef.current?.scrollBy({ left: dir === "left" ? -252 : 252, behavior: "smooth" });
  const [myRole, setMyRole] = useState<string>("participant");
  const [reclaimBannerVisible, setReclaimBannerVisible] = useState(false);
  const [reclaimDismissed, setReclaimDismissed] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [editingCaptionText, setEditingCaptionText] = useState("");
  const [editingCaptionOriginal, setEditingCaptionOriginal] = useState("");
  const [editingCaptionDirty, setEditingCaptionDirty] = useState(false);
  const [showCaptionCloseConfirm, setShowCaptionCloseConfirm] = useState(false);
  const [rewritingCaptionId, setRewritingCaptionId] = useState<string | null>(null);
  const [savingCaptionId, setSavingCaptionId] = useState<string | null>(null);
  const [activePeerMenu, setActivePeerMenu] = useState<string | null>(null);
  const peerMenuRef = useRef<HTMLDivElement>(null);
  const [cameraError, setCameraError] = useState(false);
  const [audioOnlyMode, setAudioOnlyMode] = useState(false);
  const [cameraRetrying, setCameraRetrying] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  // "browser" | "monitor" | "window" | "application" | "unknown" | null
  const [screenSurface, setScreenSurface] = useState<string | null>(null);
  const [virtualBg, setVirtualBg] = useState<VirtualBg>(getSavedBackground);
  const [showVideoSettings, setShowVideoSettings] = useState(false);
  const [localDisplayName, setLocalDisplayName] = useState(() => user?.fullName ?? "You");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [showSecurityPanel, setShowSecurityPanel] = useState(false);
  const securityPanelRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [galleryPage, setGalleryPage] = useState(0);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  // ── Zoom-style popup notifications ──────────────────────────────────────────
  const [roomPopups, setRoomPopups] = useState<RoomPopupEntry[]>([]);
  const pushRoomPopup = useCallback((popup: Omit<RoomPopupEntry, "id">) => {
    const id = crypto.randomUUID();
    setRoomPopups(prev => [...prev, { ...popup, id }]);
  }, []);
  const dismissRoomPopup = useCallback((id: string) => {
    setRoomPopups(prev => prev.filter(p => p.id !== id));
  }, []);
  const [noteType, setNoteType] = useState<"note" | "action" | "decision" | "highlight">("note");
  const [floatMinimized, setFloatMinimized] = useState(false);
  const [floatMaximized, setFloatMaximized] = useState(false);
  const [showPip, setShowPip] = useState(true);
  const [floatPos, setFloatPos] = useState<{ left: number; top: number }>(() => ({
    left: typeof window !== "undefined" ? Math.max(window.innerWidth - 340, 16) : 16,
    top: 80,
  }));

  // ── More menu state ──────────────────────────────────────────────────────────
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [annotationDisabled, setAnnotationDisabled] = useState(false);
  const [hideAnnotatorNames, setHideAnnotatorNames] = useState(false);
  const [hideVideoPanel, setHideVideoPanel] = useState(false);
  const [hideFloatingControls, setHideFloatingControls] = useState(false);
  const [shareComputerSound, setShareComputerSound] = useState(false);
  const [optimizeForVideoClip, setOptimizeForVideoClip] = useState(false);
  const [showBreakoutRooms, setShowBreakoutRooms] = useState(false);
  const [showPolls, setShowPolls] = useState(false);
  const [breakoutRoomCount, setBreakoutRoomCount] = useState(2);
  const [breakoutRoomsCreated, setBreakoutRoomsCreated] = useState<Array<{ id: string; name: string }>>([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["Option A", "Option B"]);
  const [pollLive, setPollLive] = useState(false);
  const [pollVotes, setPollVotes] = useState<Record<number, number>>({});
  const [myPollVote, setMyPollVote] = useState<number | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingRafRef = useRef<number>(0);
  const recordingAudioCtxRef = useRef<AudioContext | null>(null);
  const recordingVideosRef = useRef<HTMLVideoElement[]>([]);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  // Guard: prevents getDisplayMedia from being called while already in-flight
  const sharingInProgressRef = useRef(false);
  // Stop and a newer start advance this so a publish that resolves late cannot
  // paint "You are sharing your screen" again.
  const shareEpochRef = useRef(0);
  const stopSharingRef = useRef<() => void>(() => {});
  const floatPanelRef = useRef<HTMLDivElement>(null);
  const floatDragRef = useRef(false);
  const floatDragStartRef = useRef<{ mx: number; my: number; left: number; top: number } | null>(null);

  // Acquire camera + mic — four-tier strategy:
  //   0. Claim stream handed off from PreJoinLobby (avoids re-acquiring the camera entirely)
  //   1. HD ideal constraints (no hard mins — avoids OverconstrainedError)
  //   2. Basic video + audio (any resolution the device supports)
  //   3. Audio-only
  //   4. No media (show permanent error)
  useEffect(() => {
    let active = true;

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1,
    };

    const accept = (stream: MediaStream) => {
      if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
      localStreamRef.current = stream;
      setLocalStream(stream);
    };

    const tryAudioOnly = () => {
      navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        .then(stream => {
          if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
          localStreamRef.current = stream;
          setLocalStream(stream);
          setCameraError(true);
          setAudioOnlyMode(true);
        })
        .catch(() => {
          if (active) setCameraError(true);
        });
    };

    const tryBasicVideo = () => {
      navigator.mediaDevices.getUserMedia({ video: true, audio: audioConstraints })
        .then(stream => accept(stream))
        .catch(() => { if (!active) return; tryAudioOnly(); });
    };

    // Tier 0 — reuse the stream already open from the PreJoinLobby.
    // Verify the video tracks are still live before trusting it; if they were
    // accidentally stopped during navigation the stream silently shows black.
    const inherited = cameraStore.take();
    const inheritedVideoLive = inherited
      ? inherited.getVideoTracks().length === 0 || inherited.getVideoTracks().some(t => t.readyState === "live")
      : false;
    if (inherited && inheritedVideoLive) {
      // The stream is still live — MeetingRoom now owns it
      localStreamRef.current = inherited;
      setLocalStream(inherited);
    } else {
      // Discard a dead inherited stream (tracks stopped during navigation)
      if (inherited) inherited.getTracks().forEach(t => t.stop());
      // Fresh acquisition — Tier 1: ideal HD constraints
      navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // 30 fps matches the VB pipeline and the encoder ceiling.
          // At the same bitrate, 30 fps gives the encoder ~2× more bits
          // per frame than 60 fps, producing noticeably sharper video.
          frameRate: { ideal: 30 },
          facingMode: "user",
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: audioConstraints,
      })
        .then(stream => accept(stream))
        .catch((err: unknown) => {
          if (!active) return;
          const name = err instanceof DOMException ? err.name : "";
          if (name === "NotAllowedError" || name === "SecurityError") {
            // Permission denied — no point retrying with different constraints
            tryAudioOnly();
          } else if (name === "NotReadableError" || name === "TrackStartError") {
            // Camera in use / hardware busy — wait 600 ms then retry
            setTimeout(() => { if (active) tryBasicVideo(); }, 600);
          } else {
            // Overconstrained or unknown — retry immediately with simpler constraints
            tryBasicVideo();
          }
        });
    }

    return () => {
      active = false;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Sync display name once Clerk user loads (only on first load)
  useEffect(() => {
    if (user?.fullName) setLocalDisplayName((prev) => prev === "You" ? user.fullName! : prev);
  }, [user?.fullName]);

  // Retry camera access after initial failure — lets users grant permission
  // without leaving the meeting.
  const retryCameraAccess = () => {
    if (cameraRetrying) return;
    setCameraRetrying(true);
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      sampleRate: 48000, channelCount: 1,
    };
    navigator.mediaDevices.getUserMedia({ video: true, audio: audioConstraints })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
      .then((stream) => {
        // Stop old audio-only stream if present
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCameraError(false);
        setAudioOnlyMode(false);
        setVideoOn(true);
      })
      .catch(() => { /* still denied — keep existing audio-only stream */ })
      .finally(() => setCameraRetrying(false));
  };

  // Toggle video/mic tracks — depend on localStream too so effect re-runs when
  // the stream first arrives (videoOn/micOn don't change, so stream arrival
  // must be in the dep array to guarantee tracks are enabled on first render).
  useEffect(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = videoOn; });
  }, [videoOn, localStream]);
  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = micOn; });
  }, [micOn, localStream]);

  const { data: meeting } = useQuery({
    queryKey: getGetMeetingByCodeQueryKey(meetingCode),
    queryFn: () => getMeetingByCode(meetingCode),
    enabled: !!meetingCode,
    refetchInterval: 30000,
  });

  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: getListParticipantsQueryKey(meeting?.id ?? 0),
    queryFn: () => listParticipants(meeting!.id),
    enabled: !!meeting?.id,
    refetchInterval: 10000,
  });

  // ── Compute waiting-room state BEFORE useLiveKit so we can gate the connection ──
  const isHost = meeting?.hostClerkId === user?.id;
  // Two-level Electron detection:
  //   1. window.electronRC — preload contextBridge injection (ideal path).
  //   2. navigator.userAgent "Electron/" — fallback when preload fails to inject
  //      (e.g. stale asar build).  Allows RC UI to activate even before rebuild.
  const electronBridgeReady = typeof window !== "undefined" && "electronRC" in window;
  const isElectronHost = typeof window !== "undefined" && (
    electronBridgeReady ||
    /Electron\//.test(navigator.userAgent)
  );
  const myParticipant = user?.id ? participants?.find(p => p.clerkId === user.id) : null;
  // Guard against the race condition where the participants query hasn't resolved yet:
  // if the meeting has a waiting room and we're not the host, assume we're still waiting
  // until the query returns and confirms our status is "admitted" or "active". Without this,
  // participants === undefined → myParticipant?.status === "waiting" is false → enabled flips
  // true immediately → useLiveKit fetches a token → server returns 403 because status is "waiting".
  const isWaitingForAdmission = !isHost && (
    myParticipant?.status === "waiting" ||
    (!!meeting?.waitingRoomEnabled && participantsLoading)
  );

  // ── Guard: redirect to join page if user has no participant row ─────────────
  // Scenario: user navigated directly to /room/:code without going through the
  // PreJoinLobby, or their join request was saved with clerkId=null (race
  // condition if Clerk hadn't loaded yet).  Without a participant row the
  // LiveKit token endpoint returns 403, so they can see themselves (local
  // camera) but never connect to the SFU and can't see anyone else.
  useEffect(() => {
    if (!meetingCode) return;
    if (!user?.id) return;            // not signed in yet — wait
    if (isHost) return;               // host is authorised via hostClerkId, always fine
    if (participantsLoading) return;  // participants not loaded yet — wait
    if (participants === undefined) return; // query hasn't run
    if (myParticipant) return;        // already in the list — all good
    // No participant row found → redirect to the join page so they go through
    // the proper flow and get a participant row with their clerkId.
    setLocation(`/meetings/${meetingCode}/join`);
  }, [meetingCode, user?.id, isHost, participantsLoading, participants, myParticipant, setLocation]);

  const applyReaction = (msgId: string, emoji: string, userId: string) => {
    setReactions((prev) => {
      const next = new Map(prev);
      const byEmoji = new Map(next.get(msgId) ?? []);
      // Check if user is toggling off their existing emoji
      const existingUsers = new Set(byEmoji.get(emoji) ?? []);
      const isTogglingOff = existingUsers.has(userId);
      // Remove user from ALL emojis first (one emoji per user per message)
      for (const [em, users] of byEmoji.entries()) {
        const updated = new Set(users);
        updated.delete(userId);
        if (updated.size === 0) byEmoji.delete(em); else byEmoji.set(em, updated);
      }
      // Add new emoji unless toggling off
      if (!isTogglingOff) {
        const users = new Set(byEmoji.get(emoji) ?? []);
        users.add(userId);
        byEmoji.set(emoji, users);
      }
      if (byEmoji.size === 0) { next.delete(msgId); } else { next.set(msgId, byEmoji); }
      return next;
    });
  };

  const {
    remoteStreams, wsConnected, connectionError, tracksPublished, replaceVideoTrack, publishScreenShare, unpublishScreenShare, startRoomAudio,
    sendChatMessage, sendReaction, rename, sendHandRaise, sendRoleChange, sendCaption, sendForceAction,
    peerNames, peerIds, peerHands, peerRoles, peerConnectionStates,
    hostLeftId, clearHostLeft,
    isReconnecting, rcRequests, rcGrantedTo, haveControl, isRcRequesting, controllerPointer, rcClickPos, rcClipboardData,
    requestControl, cancelRcRequest, grantControl, denyControl, revokeControl, pauseControl, resumeControl, rcPaused,
    clearLocalControlState, recoverControlState, sendPointerEvent, sendClickEvent, sendScrollEvent, sendKeyEvent,
    sendDragStart, sendDragTo, sendDragEnd, sendDoubleClick, sendClipboardPush, sendClipboardPull,
  } = useLiveKit({
    roomId: meetingCode,
    userId: user?.id ?? "",
    displayName: localDisplayName,
    localStream,
    enabled: !!user?.id && (!!localStream || cameraError) && !isWaitingForAdmission,
    maxParticipants: meeting?.maxParticipants ?? undefined,
    onParticipantJoined: (_, name) => {
      try {
        const ctx = new AudioContext();
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const gain = ctx.createGain();
        o1.connect(gain); o2.connect(gain); gain.connect(ctx.destination);
        o1.type = "sine"; o1.frequency.setValueAtTime(523, ctx.currentTime);
        o1.frequency.setValueAtTime(659, ctx.currentTime + 0.12);
        o2.type = "sine"; o2.frequency.setValueAtTime(784, ctx.currentTime + 0.24);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.22, ctx.currentTime + 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
        o1.start(); o1.stop(ctx.currentTime + 0.25);
        o2.start(ctx.currentTime + 0.24); o2.stop(ctx.currentTime + 0.65);
        o2.onended = () => ctx.close();
      } catch { /* AudioContext unavailable */ }
      toast({ title: `${name} joined the meeting` });
    },
    onChatMessage: (msg) => {
      setMessages((prev) => [...prev, msg]);
      // Track unread DMs from others
      if (msg.recipientId && msg.senderId !== (user?.id ?? "")) {
        setChatOpen(prev => {
          // If chat isn't open, always bump unread
          if (!prev) {
            setDmUnread(u => { const next = new Map(u); next.set(msg.senderId, (next.get(msg.senderId) ?? 0) + 1); return next; });
          } else {
            // Chat is open — bump only if we're not looking at this DM thread
            setChatRecipient(cr => {
              if (cr?.userId !== msg.senderId) {
                setDmUnread(u => { const next = new Map(u); next.set(msg.senderId, (next.get(msg.senderId) ?? 0) + 1); return next; });
              }
              return cr;
            });
          }
          return prev;
        });
      }
    },
    onReaction: ({ msgId, emoji, userId }) => applyReaction(msgId, emoji, userId),
    onRoleChange: ({ userId: targetId, role }) => {
      if (targetId === user?.id) {
        setMyRole(role);
        const label = role === "host" ? "You are now the Host" : role === "cohost" ? "You are now a Co-host" : "Your role has been updated";
        toast({ title: label });
      }
    },
    onCaption: ({ sender, text }) => {
      setCaptionLines(prev => [
        ...prev.slice(-4),
        { id: `${Date.now()}-${Math.random()}`, sender, text, timestamp: Date.now() },
      ]);
    },
    onForceMute: () => {
      setMicOn(false);
      toast({ title: "Host muted your microphone" });
    },
    onForceCamOff: () => {
      setVideoOn(false);
      toast({ title: "Host turned off your camera" });
    },
    onForceStopShare: () => {
      stopSharing();
      toast({ title: "Host stopped your screen share" });
    },
    onForceKick: () => {
      toast({ title: "You have been removed from the meeting", variant: "destructive" });
      setTimeout(() => { localStreamRef.current?.getTracks().forEach(t => t.stop()); setLocation("/meetings"); }, 1500);
    },
    onRcRevokedByDisconnect: (name) => {
      toast({ title: `Remote control ended — ${name} left the meeting` });
      setMessages(prev => [
        ...prev,
        {
          id: `sys-rc-disconnect-${Date.now()}`,
          sender: "",
          senderId: "__system__",
          text: `${name} left — remote control ended`,
          isSystem: true,
        },
      ]);
    },
    onRcRequestTimeout: () => {
      // The host did not respond within 60 s. Clear the re-grant latch so the
      // next successful grant shows "Control Granted!" instead of "re-granted".
      lostControlDueToReconnectRef.current = false;
      // Also clear the pending indicator so it doesn't stay stuck, and show
      // a toast so the user knows why their request ended.
      myRcRequestPendingRef.current = false;
      setMyRcRequestPending(false);
      toast({
        title: "Request timed out",
        description: "The host did not respond to your control request.",
      });
    },
    onScreenShareInterrupted: () => {
      toast({
        title: "Screen share interrupted",
        description: "The connection dropped and the share could not be restored. Start it again if you still want to share.",
        variant: "destructive",
      });
      stopSharingRef.current();
    },
    onRcDenied: () => {
      // The host explicitly denied the request — clear the pending indicator and notify.
      myRcRequestPendingRef.current = false;
      setMyRcRequestPending(false);
      toast({ title: "Remote control request denied" });
    },
    onRcGrantedByBrowserHost: () => {
      // Fires on the CONTROLLER when the host approved RC but is running in a
      // web browser (no Desktop bridge). The data-channel routing works but no
      // real OS cursor/keyboard actions will execute on the host machine.
      toast({
        title: "Host is using a web browser",
        description:
          "Remote control was granted, but the host needs TanCom Desktop for real cursor and keyboard control. Your actions will not move their cursor.",
        action: (
          <ToastAction
            altText="Download TanCom Desktop"
            onClick={() => window.open(TANCOM_DESKTOP_DOWNLOAD_URL, "_blank", "noopener")}
          >
            Download Desktop App
          </ToastAction>
        ),
        duration: 12000,
      });
    },
  });

  // ── Live captions (Web Speech API) ──────────────────────────────────────────
  const { interimText, supported: captionsSupported } = useCaptions({
    enabled: captionsOn && micOn,
    onFinalCaption: (text) => {
      // Show locally
      setCaptionLines(prev => [
        ...prev.slice(-4),
        { id: `local-${Date.now()}`, sender: localDisplayName, text, timestamp: Date.now() },
      ]);
      // Broadcast to peers
      sendCaption(localDisplayName, text);
    },
  });

  // Auto-expire caption lines after 6 seconds (editing pins the line with a far-future timestamp)
  useEffect(() => {
    if (captionLines.length === 0) return;
    const timer = setTimeout(() => {
      const cutoff = Date.now() - 6000;
      setCaptionLines(prev => prev.filter(l => l.timestamp > cutoff));
    }, 6000);
    return () => clearTimeout(timer);
  }, [captionLines]);

  // ── Remote control helpers ────────────────────────────────────────────────
  // Wraps the raw requestControl from useLiveKit to also set the pending flag
  // so we can notify this participant if the host stops sharing before answering.
  // Guard against duplicate requests while one is already in flight.
  const handleRequestControl = useCallback(() => {
    if (isRcRequesting) return;
    myRcRequestPendingRef.current = true;
    setMyRcRequestPending(true);
    requestControl();
  }, [isRcRequesting, requestControl]);

  const handleCancelRequest = useCallback(() => {
    myRcRequestPendingRef.current = false;
    setMyRcRequestPending(false);
    cancelRcRequest();
  }, [cancelRcRequest]);

  // ── Remote control feedback toasts ───────────────────────────────────────
  const prevHaveControlRef = useRef(false);
  // Latches true when a reconnect starts while the user holds control.
  // Consumed (cleared) when control is subsequently lost, to record that the
  // loss was disconnect-triggered rather than an explicit host revoke.
  const wasReconnectingRef = useRef(false);
  // Latches true when control was lost due to a reconnect.
  // Survives the loss event so the next re-grant can show "re-granted" instead
  // of the first-time "granted" toast.  Cleared once the re-grant toast fires.
  const lostControlDueToReconnectRef = useRef(false);
  // Holds the dismiss function for the active "Re-request" toast so it can be
  // auto-dismissed when the host stops sharing before the controller clicks it.
  const reRequestToastDismissRef = useRef<(() => void) | null>(null);
  // Tracks whether this participant has an RC request in flight (sent but not
  // yet granted or denied). Used to show a cancellation notice when the host
  // stops sharing before answering the request.
  const myRcRequestPendingRef = useRef(false);
  // Mirror of the ref as state so the UI can react to pending changes.
  const [myRcRequestPending, setMyRcRequestPending] = useState(false);
  useEffect(() => {
    // Only arm the latch when the user is actively holding control.
    // If they don't have control, a reconnect is irrelevant to the RC toast
    // and we must not poison a later explicit-revoke message.
    if (isReconnecting && haveControl) wasReconnectingRef.current = true;
  }, [isReconnecting, haveControl]);
  // When a reconnect completes (isReconnecting true→false), verify with the
  // server that the RC grant is still ours.  If the host cleared the grant
  // during the outage (or if the rc-revoke data-channel message was lost),
  // haveControl will be stale-true and the "You are controlling…" banner will
  // linger forever.  Fetching the REST state and revoking locally closes that gap.
  // This also runs on initial join (wsConnected: false→true) so a participant
  // who joins after the grant was already issued can recover haveControl=true
  // without needing to receive the rc-granted data-channel message.
  const prevIsReconnectingRef = useRef(false);
  const prevWsConnectedRef = useRef(false);
  useEffect(() => {
    const wasReconnecting = prevIsReconnectingRef.current;
    prevIsReconnectingRef.current = isReconnecting;
    const wasConnected = prevWsConnectedRef.current;
    prevWsConnectedRef.current = wsConnected;

    // Fire on reconnect completion (true→false) OR initial connect (false→true).
    const reconnectComplete = wasReconnecting && !isReconnecting;
    const initialConnect = !wasConnected && wsConnected && !isReconnecting;
    if (!reconnectComplete && !initialConnect) return;
    if (!meetingCode) return;

    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `/api/remote/rc-state?roomName=${encodeURIComponent(meetingCode)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { grantedTo: string | null; isHostSharing: boolean };
        const myId = user?.id ?? "";
        if (data.grantedTo === myId && myId) {
          // Server says we are the active controller — restore local state.
          // This handles late-join and reconnect scenarios where the rc-granted
          // data-channel message was never received.
          recoverControlState();
        } else if (data.grantedTo !== myId && haveControl) {
          // Server no longer shows us as the active controller → clear local state.
          // Use clearLocalControlState (not revokeControl) so we do NOT broadcast
          // an rc-revoke: the host may have re-granted to someone else during the
          // outage, and a broadcast revoke would incorrectly end their session.
          clearLocalControlState();
        }
      } catch { /* non-critical — banner will still clear on next RC message */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReconnecting, wsConnected]);
  useEffect(() => {
    if (haveControl && !prevHaveControlRef.current) {
      // Request was answered — clear the pending flag before showing the toast.
      myRcRequestPendingRef.current = false;
      setMyRcRequestPending(false);
      if (lostControlDueToReconnectRef.current) {
        // Host re-granted after a disconnect-caused loss (with or without re-request).
        toast({
          title: "Remote control re-granted",
          description: "The host restored your control. Move your cursor over the screen share tile to interact.",
        });
        lostControlDueToReconnectRef.current = false;
      } else {
        toast({
          title: "Remote control granted",
          description: "Move your cursor over the screen share tile and click or type to interact.",
        });
      }
    } else if (!haveControl && prevHaveControlRef.current) {
      if (wasReconnectingRef.current) {
        const { dismiss } = toast({
          title: "Remote control ended — you were disconnected",
          action: (
            <ToastAction altText="Re-request control" onClick={handleRequestControl}>
              Re-request
            </ToastAction>
          ),
        });
        reRequestToastDismissRef.current = dismiss;
        // Remember that this loss was disconnect-triggered so the next grant
        // can surface "re-granted" rather than the first-time "granted" message.
        lostControlDueToReconnectRef.current = true;
      } else {
        toast({ title: "Remote control ended" });
      }
      wasReconnectingRef.current = false;
    }
    prevHaveControlRef.current = haveControl;
  }, [haveControl, toast, handleRequestControl]);

  // Video enhancement settings (mirror, low-light, touch-up, brightness, contrast)
  const { enhancement, update: updateEnhancement, reset: resetEnhancement, cssFilter, cssTransform, anyActive: anyEnhancementActive } = useVideoEnhancement();

  // Virtual background — process the camera stream before sending to peers
  const { processedStream, isLoading: vbLoading } = useVirtualBackground({
    cameraStream: localStream,
    background: virtualBg,
  });

  // Active stream for local display and recording (processed if VB on, else raw camera)
  const activeStream = processedStream ?? localStream;
  // Keep ref current so handleRecord always reads the VB-processed stream on click
  useEffect(() => { activeStreamRef.current = activeStream; }, [activeStream]);

  // Whenever the processed stream changes (VB on/off/switch) OR after LiveKit finishes
  // publishing the initial camera track, push the correct track to all peers.
  // The tracksPublished guard is critical: replaceVideoTrack is a no-op until the
  // camera publication exists, so we must re-run this effect once it is ready.
  useEffect(() => {
    if (!tracksPublished || sharing) return; // wait for publish; screen share takes priority
    const track = processedStream
      ? processedStream.getVideoTracks()[0]
      : localStreamRef.current?.getVideoTracks()[0];
    if (track) replaceVideoTrack(track ?? null);
  }, [processedStream, sharing, replaceVideoTrack, tracksPublished]);

  const handleBgChange = (bg: VirtualBg) => {
    setVirtualBg(bg);
    saveBackground(bg);
  };

  const endMutation = useEndMeeting({ mutation: { onSuccess: () => { toast({ title: "Meeting ended" }); setLocation("/meetings"); } } });
  const admitAllMutation = useAdmitAllParticipants({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(meeting?.id ?? 0) }) } });
  const muteAllMutation = useMuteAllParticipants({ mutation: { onSuccess: () => toast({ title: "All participants muted" }) } });
  const lockMutation = useLockMeeting({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeetingByCodeQueryKey(meetingCode) }) } });
  const updateMeetingMutation = useUpdateMeeting({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeetingByCodeQueryKey(meetingCode) }) } });
  const startRecordingMutation = useCreateRecording({ mutation: { onSuccess: (data) => setRecordingId(data.id) } });
  const stopRecordingMutation = useStopRecording({ mutation: { onSuccess: () => setRecordingId(null) } });
  const updateParticipantMutation = useUpdateParticipant({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(meeting?.id ?? 0) }) },
  });
  const removeParticipantMutation = useRemoveParticipant({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(meeting?.id ?? 0) }) },
  });

  // ── Meeting Notes ──────────────────────────────────────────────────────────
  const meetingNumericId = meeting?.id ?? 0;
  const { data: meetingNotes = [] } = useListMeetingNotes(meetingNumericId, {
    query: { queryKey: getListMeetingNotesQueryKey(meetingNumericId), enabled: !!meetingNumericId && notesOpen, staleTime: 0, refetchOnMount: true },
  });
  const { data: meetingSummary } = useGetMeetingSummary(meetingNumericId, {
    query: { queryKey: getGetMeetingSummaryQueryKey(meetingNumericId), enabled: !!meetingNumericId && notesOpen, retry: false, staleTime: 0, refetchOnMount: true },
  });
  const createNoteMutation = useCreateMeetingNote({
    mutation: {
      onSuccess: () => {
        setNoteInput("");
        queryClient.invalidateQueries({ queryKey: getListMeetingNotesQueryKey(meetingNumericId) });
      },
      onError: () => toast({ title: "Failed to save note", variant: "destructive" }),
    },
  });
  const deleteNoteMutation = useDeleteMeetingNote({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMeetingNotesQueryKey(meetingNumericId) }),
      onError: () => toast({ title: "Failed to delete note", variant: "destructive" }),
    },
  });

  // ── Caption editing handlers ──────────────────────────────────────────────────
  const handleCaptionEditStart = useCallback((line: CaptionLine) => {
    setEditingCaptionId(line.id);
    setEditingCaptionText(line.text);
    setEditingCaptionOriginal(line.text);
    setEditingCaptionDirty(false);
    // Prevent auto-expiry while editing by extending timestamp far into future
    setCaptionLines(prev => prev.map(l => l.id === line.id ? { ...l, timestamp: Date.now() + 3_600_000 } : l));
  }, []);

  const handleCaptionSave = useCallback(async (id: string, text: string) => {
    if (!meetingNumericId) return;
    setSavingCaptionId(id);
    try {
      await createNoteMutation.mutateAsync({ id: meetingNumericId, data: { content: text, noteType: "note" } });
      toast({ title: "Caption saved to notes ✓" });
      setEditingCaptionId(null);
      setEditingCaptionDirty(false);
    } finally {
      setSavingCaptionId(null);
    }
  }, [meetingNumericId, createNoteMutation, toast]);

  const handleCaptionRewrite = useCallback(async (id: string, text: string) => {
    setRewritingCaptionId(id);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context: "live meeting caption transcript" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { rewritten: string };
      setEditingCaptionText(data.rewritten);
      setEditingCaptionDirty(true);
      setCaptionLines(prev => prev.map(l => l.id === id ? { ...l, text: data.rewritten } : l));
    } catch {
      toast({ title: "Rewrite failed", variant: "destructive" });
    } finally {
      setRewritingCaptionId(null);
    }
  }, [toast]);

  const handleCaptionEditAndRewrite = useCallback(async (line: CaptionLine) => {
    handleCaptionEditStart(line);
    setRewritingCaptionId(line.id);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.text, context: "live meeting caption transcript" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { rewritten: string };
      setEditingCaptionText(data.rewritten);
      setEditingCaptionDirty(true);
      setCaptionLines(prev => prev.map(l => l.id === line.id ? { ...l, text: data.rewritten } : l));
    } catch {
      toast({ title: "Rewrite failed", variant: "destructive" });
    } finally {
      setRewritingCaptionId(null);
    }
  }, [handleCaptionEditStart, toast]);

  const handleCaptionsToggle = useCallback(() => {
    if (captionsOn && editingCaptionId && editingCaptionDirty) {
      setShowCaptionCloseConfirm(true);
      return;
    }
    setEditingCaptionId(null);
    setEditingCaptionDirty(false);
    setCaptionsOn(v => !v);
  }, [captionsOn, editingCaptionId, editingCaptionDirty]);
  const generateSummaryMutation = useGenerateMeetingSummary({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeetingSummaryQueryKey(meetingNumericId) });
        toast({ title: "AI summary generated" });
      },
      onError: () => toast({ title: "Failed to generate summary", variant: "destructive" }),
    },
  });

  const addNote = () => {
    if (!noteInput.trim() || !meetingNumericId) return;
    createNoteMutation.mutate({ id: meetingNumericId, data: { content: noteInput.trim(), noteType } });
  };

  const handleExportNotes = async () => {
    if (!meetingNumericId) return;
    try {
      const result = await exportMeetingNotes(meetingNumericId);
      const blob = new Blob([result.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meeting?.title ?? "meeting"}-notes.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const admitted = participants?.filter(p => p.status === "admitted" || p.status === "active") ?? [];
  const waiting = participants?.filter(p => p.status === "waiting") ?? [];

  // ── Waiting room helpers ────────────────────────────────────────────────────
  const admitParticipant = (p: Participant) => {
    if (!meeting) return;
    updateParticipantMutation.mutate({ id: meeting.id, participantId: p.id, data: { status: "admitted" } });
  };
  const denyParticipant = (p: Participant) => {
    if (!meeting) return;
    updateParticipantMutation.mutate({ id: meeting.id, participantId: p.id, data: { status: "denied" } });
  };

  // Ring + toast when someone new enters the waiting room
  const prevWaitingCountRef = useRef(0);
  useEffect(() => {
    if (!isHost) return;
    const prev = prevWaitingCountRef.current;
    const curr = waiting.length;
    prevWaitingCountRef.current = curr;
    if (curr > prev) {
      // Soft chime via Web Audio API — no external file needed
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
        osc.start();
        osc.stop(ctx.currentTime + 0.7);
        osc.onended = () => ctx.close();
      } catch { /* AudioContext unavailable in some envs */ }
      const newPerson = waiting[waiting.length - 1];
      toast({ title: "Someone is waiting", description: `${newPerson?.displayName ?? "A participant"} is in the waiting room` });
    }
  }, [waiting.length, isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Popup: "Note-taking is available" fires 2s after user is admitted ───────
  const firstJoinPopupRef = useRef(false);
  useEffect(() => {
    if (!myParticipant || firstJoinPopupRef.current) return;
    firstJoinPopupRef.current = true;
    const t = setTimeout(() => {
      pushRoomPopup({
        title: "Note-taking is available",
        subtitle: "TanCom",
        action: { label: "Take notes", onClick: () => setNotesOpen(true) },
      });
    }, 2000);
    return () => clearTimeout(t);
  }, [myParticipant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Popup: "[Name] joined" when a new participant is admitted ────────────────
  const prevAdmittedIdsRef = useRef<Set<string | number>>(new Set());
  useEffect(() => {
    const currIds = new Set(admitted.map(p => p.clerkId ?? p.id));
    const newOnes = admitted.filter(p => {
      const key = p.clerkId ?? p.id;
      return !prevAdmittedIdsRef.current.has(key) && key !== user?.id;
    });
    // Only show join popups after the first load (prevAdmittedIds is populated)
    if (prevAdmittedIdsRef.current.size > 0 && newOnes.length > 0) {
      newOnes.forEach(p => {
        pushRoomPopup({
          title: `${p.displayName ?? "Someone"} joined`,
          subtitle: "TanCom Meeting",
          autoDismissMs: 4000,
        });
      });
    }
    prevAdmittedIdsRef.current = currIds;
  }, [admitted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Popup: "Recording started" ───────────────────────────────────────────────
  const prevIsRecordingRef = useRef(false);
  useEffect(() => {
    if (isRecording && !prevIsRecordingRef.current) {
      pushRoomPopup({ title: "Recording started", subtitle: "This meeting is being recorded" });
    }
    prevIsRecordingRef.current = isRecording;
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync myRole from the participants query (DB source of truth) and from WS role-change events
  useEffect(() => {
    const me = participants?.find(p => p.clerkId === user?.id);
    if (me?.role) setMyRole(me.role);
  }, [participants, user?.id]);

  // Initialise from isHost once meeting loads (before participants query completes)
  useEffect(() => {
    if (isHost) setMyRole("host");
  }, [isHost]);

  const isPrivileged = isHost || myRole === "host" || myRole === "cohost";

  // Close peer-action menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (peerMenuRef.current && !peerMenuRef.current.contains(e.target as Node)) {
        setActivePeerMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close security panel on outside click
  useEffect(() => {
    if (!showSecurityPanel) return;
    const handler = (e: MouseEvent) => {
      if (securityPanelRef.current && !securityPanelRef.current.contains(e.target as Node)) {
        setShowSecurityPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSecurityPanel]);

  const handleRoleChange = (peerId: string, newRole: string) => {
    const peerParticipant = admitted.find(p => p.clerkId === peerId);
    if (peerParticipant && meeting) {
      updateParticipantMutation.mutate({ id: meeting.id, participantId: peerParticipant.id, data: { role: newRole as "host" | "cohost" | "participant" | "guest" } });
    }
    sendRoleChange(peerId, newRole);
    setActivePeerMenu(null);
    const label = newRole === "cohost" ? `Co-host granted` : newRole === "host" ? `Host transferred` : `Role updated`;
    toast({ title: label });
  };

  // ── Automatic host election when the host leaves ───────────────────────────
  // When LiveKit fires ParticipantDisconnected for a participant carrying the
  // "host" role, useLiveKit sets hostLeftId. Only the "election leader" — the
  // participant with the lexicographically smallest userId among everyone still
  // in the room — performs the promotion to avoid duplicate actions.
  useEffect(() => {
    if (!hostLeftId || !meeting || !user?.id) return;
    clearHostLeft();

    // All remaining participant identities (remote peers + local user)
    const remaining = [...peerIds, user.id];
    const sortedRemaining = [...remaining].sort();
    const amLeader = sortedRemaining[0] === user.id;
    if (!amLeader) return;

    // Prefer co-hosts, then fall back to regular participants
    const cohostIds = peerIds.filter(id => peerRoles.get(id) === "cohost").sort();
    const otherIds  = peerIds.filter(id => peerRoles.get(id) !== "cohost").sort();

    if (cohostIds.length > 0) {
      // Promote the first co-host
      handleRoleChange(cohostIds[0], "host");
      toast({ title: "Host left — a co-host has been promoted to host" });
    } else if (otherIds.length > 0) {
      // Promote the first remaining participant
      handleRoleChange(otherIds[0], "host");
      toast({ title: "Host left — a participant has been promoted to host" });
    } else {
      // I'm the only one left — I become host
      setMyRole("host");
      toast({ title: "You are now the Host" });
      const me = admitted.find(p => p.clerkId === user.id);
      if (me) updateParticipantMutation.mutate({ id: meeting.id, participantId: me.id, data: { role: "host" } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostLeftId]);

  // ── Reclaim-host banner — original host rejoins after handoff ──────────────
  const isOriginalHost = meeting?.hostClerkId === user?.id;
  useEffect(() => {
    if (isOriginalHost && myRole !== "host" && wsConnected && !reclaimDismissed && (participants?.length ?? 0) > 1) {
      setReclaimBannerVisible(true);
    } else {
      setReclaimBannerVisible(false);
    }
  }, [isOriginalHost, myRole, wsConnected, reclaimDismissed, participants?.length]);

  // ── Keyboard shortcut: Ctrl+Alt+Shift+H → toggle floating controls ───────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setHideFloatingControls(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Close More menu on outside click ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu]);

  const handleReclaimHost = () => {
    setReclaimBannerVisible(false);
    setReclaimDismissed(false);
    // Demote whoever currently holds the host role
    const currentHost = admitted.find(p => p.role === "host" && p.clerkId !== user?.id);
    if (currentHost && meeting) {
      updateParticipantMutation.mutate({ id: meeting.id, participantId: currentHost.id, data: { role: "participant" } });
      sendRoleChange(currentHost.clerkId ?? "", "participant");
    }
    // Promote self to host
    setMyRole("host");
    const me = admitted.find(p => p.clerkId === user?.id);
    if (me && meeting) {
      updateParticipantMutation.mutate({ id: meeting.id, participantId: me.id, data: { role: "host" } });
    }
    sendRoleChange(user?.id ?? "", "host");
    toast({ title: "You have reclaimed the Host role" });
  };

  const handleMuteParticipant = (peerId: string) => {
    const peerParticipant = admitted.find(p => p.clerkId === peerId);
    if (peerParticipant && meeting) {
      updateParticipantMutation.mutate({ id: meeting.id, participantId: peerParticipant.id, data: { isMuted: true } });
    }
    sendForceAction(peerId, "force-mute");
    setActivePeerMenu(null);
    toast({ title: "Participant muted" });
  };

  const handleForceCamOff = (peerId: string) => {
    sendForceAction(peerId, "force-cam-off");
    setActivePeerMenu(null);
    toast({ title: "Participant's camera turned off" });
  };

  const handleForceStopShare = (peerId: string) => {
    sendForceAction(peerId, "force-stop-share");
    setActivePeerMenu(null);
    toast({ title: "Screen share stopped" });
  };

  const handleRemoveParticipant = (peerId: string) => {
    const peerParticipant = admitted.find(p => p.clerkId === peerId);
    if (peerParticipant && meeting) {
      removeParticipantMutation.mutate({ id: meeting.id, participantId: peerParticipant.id });
    }
    sendForceAction(peerId, "force-kick");
    setActivePeerMenu(null);
    toast({ title: "Participant removed from meeting" });
  };

  const handleSpotlight = (peerId: string) => {
    setPinnedUserId(peerId);
    if (viewMode !== "speaker") setViewMode("speaker");
    setActivePeerMenu(null);
  };

  const copyInvite = () => {
    if (meeting) { navigator.clipboard.writeText(meeting.inviteLink); toast({ title: "Invite link copied" }); }
  };

  const handleLeave = () => { localStreamRef.current?.getTracks().forEach(t => t.stop()); setLocation("/meetings"); };
  const handleEnd = () => { localStreamRef.current?.getTracks().forEach(t => t.stop()); if (meeting) endMutation.mutate({ id: meeting.id }); };

  // Chrome pauses remote media when a display capture starts or its track
  // stops, and it does not resume them. Replay now (the click is still a
  // gesture) and again shortly after, once the capture track is gone.
  const resumeRemoteAudio = useCallback(() => {
    void startRoomAudio();
    window.setTimeout(() => { void startRoomAudio(); }, 300);
  }, [startRoomAudio]);

  const stopSharing = useCallback(async () => {
    shareEpochRef.current += 1;
    sharingInProgressRef.current = false;
    const captured = screenStreamRef.current;

    // Belt-and-suspenders: stop Electron cursor tracking immediately so no
    // rc:cursor-pos IPC events arrive between this call and the useEffect
    // cleanup that fires after the sharing → false re-render completes.
    // This mirrors the same direct call in handleRevoke.
    if (isElectronHost) {
      window.electronRC?.stopCursorTracking();
    }

    // ── Step 1: update local UI immediately ──────────────────────────────
    // React state changes are synchronous here — the next render will show
    // the camera view without waiting for any async work, so the local user
    // never sees a black tile.
    // We also reset the view back to gallery here (not just via the effect)
    // so the transition is instant and the intermediate speaker-without-sharing
    // state is never visible.
    setScreenStream(null);
    setSharing(false);
    setScreenSurface(null);
    setSharingDisplayLabel(null);
    setViewMode("gallery");
    setPinnedUserId(null);
    resumeRemoteAudio();

    // ── Step 2: unpublish BEFORE stopping the track ──────────────────────
    // Calling unpublishScreenShare() while the track is still live lets
    // LiveKit send the proper "track removed" signal to all remote
    // participants.  If we stop() the track first, remotes get stuck on
    // a black tile until the WebRTC cleanup propagates.
    // Don't wait forever: a hung unpublish would leave the capture live and
    // Windows would keep the tab muted, so nobody else is audible.
    try {
      await Promise.race([
        unpublishScreenShare(),
        new Promise<void>((resolve) => { window.setTimeout(resolve, 1500); }),
      ]);
    } finally {
      // ── Step 3: stop only the capture this stop started with ───────────
      // A second share may already have replaced the ref.
      if (screenStreamRef.current === captured) screenStreamRef.current = null;
      captured?.getTracks().forEach(t => t.stop());
      resumeRemoteAudio();
    }
  }, [unpublishScreenShare, isElectronHost, resumeRemoteAudio]);
  useEffect(() => { stopSharingRef.current = () => { void stopSharing(); }; }, [stopSharing]);

  // Browsers block audio until a gesture. Video stays muted so the picture
  // still plays; this retries the remote audio elements after a click.
  useEffect(() => {
    const unlock = () => { void startRoomAudio(); };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [startRoomAudio]);
  useEffect(() => {
    if (wsConnected) void startRoomAudio();
  }, [wsConnected, startRoomAudio]);


  // Float panel drag — manipulates DOM directly for smooth motion, syncs to state on release
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!floatDragRef.current || !floatDragStartRef.current || !floatPanelRef.current) return;
      const { mx, my, left, top } = floatDragStartRef.current;
      const newLeft = Math.max(0, Math.min(window.innerWidth - 320, left + (e.clientX - mx)));
      const newTop = Math.max(0, Math.min(window.innerHeight - 48, top + (e.clientY - my)));
      floatPanelRef.current.style.left = `${newLeft}px`;
      floatPanelRef.current.style.top = `${newTop}px`;
    };
    const onUp = () => {
      if (!floatDragRef.current || !floatPanelRef.current) return;
      floatDragRef.current = false;
      const rect = floatPanelRef.current.getBoundingClientRect();
      setFloatPos({ left: rect.left, top: rect.top });
      floatDragStartRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startFloatDrag = (e: React.MouseEvent) => {
    if (!floatPanelRef.current) return;
    floatDragRef.current = true;
    floatDragStartRef.current = { mx: e.clientX, my: e.clientY, left: floatPos.left, top: floatPos.top };
    e.preventDefault();
  };

  const startScreenShare = useCallback(async () => {
    if (sharingInProgressRef.current) return;
    sharingInProgressRef.current = true;
    const epoch = shareEpochRef.current;

    const profile = screenShareProfile(optimizeForVideoClip);
    const wantSystemAudio = shareComputerSound;
    let acquired: MediaStream | null = null;
    const releaseAcquired = () => {
      if (acquired && screenStreamRef.current === acquired) screenStreamRef.current = null;
      acquired?.getTracks().forEach(t => t.stop());
    };

    try {
      // Keep getDisplayMedia options minimal — passing resolution/framerate
      // constraints into the picker can break Window and Entire Screen capture
      // on Windows (Desktop Duplication API rejects unsupported constraints).
      // Frame rate is applied AFTER acquisition. Width and height are left
      // alone so a window or ultrawide display keeps its real aspect ratio.
      const displayOptions = {
        video: true,
        audio: wantSystemAudio,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: wantSystemAudio ? "include" : "exclude",
      } as DisplayMediaStreamOptions;
      acquired = await navigator.mediaDevices.getDisplayMedia(displayOptions);
      if (shareEpochRef.current !== epoch) {
        releaseAcquired();
        return;
      }

      const screenTrack = acquired.getVideoTracks()[0];
      if (!screenTrack) {
        releaseAcquired();
        acquired = null;
        return;
      }

      screenTrack.contentHint = profile.contentHint;
      try {
        await screenTrack.applyConstraints({
          frameRate: { ideal: profile.maxFramerate, max: profile.maxFramerate },
        });
      } catch { /* unsupported on this platform — keep the source frame rate */ }

      if (screenTrack.readyState !== "live" || shareEpochRef.current !== epoch) {
        releaseAcquired();
        return;
      }

      const audioTrack = wantSystemAudio ? acquired.getAudioTracks()[0] ?? null : null;
      screenStreamRef.current = acquired;
      // Stop from the browser's own share bar must end the session even if
      // publish is still in flight. The epoch check ignores the "ended" that
      // our own track.stop() fires after Stop already ran.
      screenTrack.addEventListener("ended", () => {
        if (shareEpochRef.current === epoch) void stopSharingRef.current();
      }, { once: true });
      await publishScreenShare(screenTrack, { audioTrack, optimizeForVideo: optimizeForVideoClip });

      const readyState = screenTrack.readyState === "live" ? "live" : "ended";
      if (!shouldCommitLocalScreenShare({
        attempt: epoch,
        currentAttempt: shareEpochRef.current,
        trackReadyState: readyState,
      })) {
        // Stop, or a capture that died during publish, already owns the UI.
        // Committing here is what left the banner and Stop Share stuck.
        const stillOurs = shareEpochRef.current === epoch;
        releaseAcquired();
        if (stillOurs && shareEpochRef.current === epoch) void stopSharingRef.current();
        return;
      }

      // Detect the surface type so we can adapt the layout accordingly.
      // "browser" = Chrome Tab (works great in-line), "monitor" / "window" /
      // "application" = full-screen or app window sharing where the user's
      // camera should float as a movable PiP instead of living in the strip.
      const surface = (screenTrack.getSettings() as Record<string, unknown>)
        .displaySurface as string | undefined;
      const resolvedSurface = surface ?? "unknown";
      setScreenSurface(resolvedSurface);

      // For non-browser shares reposition the PiP to bottom-right so it sits
      // like a typical self-view bubble rather than overlapping the header.
      if (resolvedSurface !== "browser") {
        setFloatPos({
          left: Math.max(window.innerWidth - 344, 16),
          top: Math.max(window.innerHeight - 280, 16),
        });
      }

      setScreenStream(acquired);
      setSharing(true);
      // Capture just started; Chrome will have paused remote playback.
      resumeRemoteAudio();

      // ── Electron multi-monitor: tell the main process which display is shared ──
      // preload.getDisplays() returns { id: number, x, y, width, height, isPrimary }
      // Match by resolution then call setSharedDisplayId so RC offsets are correct
      // for non-primary monitors.
      if (typeof window !== "undefined" && window.electronRC) {
        try {
          const displays = await window.electronRC.getDisplays();
          if (shareEpochRef.current !== epoch) return;
          const settings = screenTrack.getSettings() as { width?: number; height?: number; deviceId?: string };
          // Prefer deterministic matching via deviceId: Electron's desktopCapturer
          // sets deviceId to "screen:<electronDisplayId>:<windowIndex>", so we can
          // parse the Electron display ID directly and avoid the resolution-collision
          // problem that occurs when multiple monitors share the same pixel dimensions.
          //
          // `match` intentionally starts undefined — setSharedDisplayId is only
          // called when we are confident a specific display was identified.
          // Window/tab shares produce no valid match and must not override the
          // existing RC offset (which would corrupt multi-monitor targeting).
          let match: typeof displays[number] | undefined;
          const deviceId = settings.deviceId ?? "";
          const electronIdFromDevice = parseInt(deviceId.split(":")[1] ?? "", 10);
          if (!isNaN(electronIdFromDevice)) {
            // Deterministic path: deviceId encodes the Electron display id directly.
            match = displays.find(d => d.id === electronIdFromDevice);
          } else {
            // Fallback: require an explicit resolution match + primary-bias.
            // If no display matches the track dimensions (e.g. window/tab share),
            // `match` stays undefined and we skip setSharedDisplayId entirely.
            const trackW = settings.width ?? 0;
            const trackH = settings.height ?? 0;
            if (trackW > 0 && trackH > 0) {
              const sameRes = displays.filter(d => d.width === trackW && d.height === trackH);
              match = sameRes.find(d => d.isPrimary) ?? sameRes[0];
            }
          }
          if (match !== undefined) {
            await window.electronRC.setSharedDisplayId(match.id);
            if (shareEpochRef.current !== epoch) return;
            // Derive a human-readable label for the matched display.
            // Primary display gets a simple label; secondary monitors are
            // numbered starting at 2 (mirrors OS display numbering conventions).
            let label: string;
            if (match.isPrimary) {
              label = "Primary display";
            } else {
              const nonPrimary = displays.filter(d => !d.isPrimary);
              const idx = nonPrimary.findIndex(d => d.id === match!.id);
              const num = idx + 2;
              label = `Display ${num} (${match.width}\u00d7${match.height})`;
            }
            setSharingDisplayLabel(label);
            toast({ title: `Sharing: ${label}` });
          }
        } catch { /* non-fatal: Electron display detection failed */ }

        // When the shared monitor is physically disconnected mid-meeting the
        // track's "ended" event fires before stopSharing() clears state.
        // Reset the RC offset to the primary display so coordinate mapping
        // doesn't stay pointed at the now-gone monitor.
        screenTrack.addEventListener("ended", () => {
          void (async () => {
            try {
              const ds = await window.electronRC!.getDisplays();
              const primary = ds.find(d => d.isPrimary) ?? ds[0];
              if (primary) await window.electronRC!.setSharedDisplayId(primary.id);
            } catch { /* non-fatal */ }
          })();
        }, { once: true });
      }
    } catch (err) {
      // Publish failed or the picker was dismissed. Stop the capture so the
      // browser share indicator cannot stay up after the session did not start.
      // Snapshot the epoch first: track.stop() fires "ended", which stops the
      // session, and that must not look like a user Stop that already happened.
      const userStopped = shareEpochRef.current !== epoch;
      releaseAcquired();
      if (userStopped || isScreenShareCancel(err)) return;
      if (shareEpochRef.current === epoch) void unpublishScreenShare();
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (message === "Screen capture has ended") return;
      toast({
        title: "Couldn't start screen share",
        description: message,
        variant: "destructive",
      });
    } finally {
      if (shareEpochRef.current === epoch) sharingInProgressRef.current = false;
    }
  }, [publishScreenShare, unpublishScreenShare, optimizeForVideoClip, shareComputerSound, toast, resumeRemoteAudio]);

  const handleScreenShare = useCallback(async () => {
    if (sharing) {
      await stopSharing();
      return;
    }
    void startScreenShare();
  }, [sharing, stopSharing, startScreenShare]);

  // ── Toast when an RC request arrives while sharing from browser (not Electron) ──
  // The RemoteControlBanner shows a visual warning, but a toast ensures the user
  // notices even if the banner is obscured by content or they're scrolled away.
  const prevRcRequestsLenRef = useRef(0);
  useEffect(() => {
    const prev = prevRcRequestsLenRef.current;
    prevRcRequestsLenRef.current = rcRequests.length;
    if (rcRequests.length > prev && sharing) {
      // Play a subtle two-tone chime on the very first RC request (queue was
      // empty). Subsequent additions to the same queue are silent so the host
      // isn't spammed while they're already reviewing the pending request.
      if (prev === 0) {
        try {
          const ctx = new AudioContext();
          const gain = ctx.createGain();
          gain.connect(ctx.destination);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

          // First tone
          const osc1 = ctx.createOscillator();
          osc1.connect(gain);
          osc1.type = "sine";
          osc1.frequency.setValueAtTime(1047, ctx.currentTime); // C6
          osc1.start(ctx.currentTime);
          osc1.stop(ctx.currentTime + 0.25);

          // Second tone (slightly lower, 80 ms after first)
          const osc2 = ctx.createOscillator();
          osc2.connect(gain);
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
          osc2.start(ctx.currentTime + 0.08);
          osc2.stop(ctx.currentTime + 0.55);

          osc2.onended = () => ctx.close();
        } catch { /* AudioContext unavailable in some envs */ }
      }
    }
    if (rcRequests.length > prev && sharing && !isElectronHost) {
      const name = rcRequests[rcRequests.length - 1]?.name ?? "A participant";
      toast({
        title: isElectronHost ? "RC bridge not initialised — restart Desktop" : "Desktop app required to share control",
        description: isElectronHost
          ? `${name} requested remote control. TanCom Desktop was detected but the RC bridge failed to load. Quit and relaunch TanCom Desktop, then try again.`
          : `${name} requested remote control. You are in a web browser. Open TanCom Desktop and join from there to grant cursor access.`,
      });
    }
  }, [rcRequests, sharing, isElectronHost, toast]);

  // ── RC state sync ─────────────────────────────────────────────────────────
  // Updates REST endpoint so mobile pollers (without LiveKit) detect grant/revoke
  // and know whether the host is actively sharing (isSharing gates the Control button).
  const syncRcState = useCallback(async (updates: { grantedTo?: string | null; isSharing?: boolean }) => {
    if (!meetingCode) return;
    try {
      const token = await getToken();
      await fetch("/api/remote/rc-state", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ roomName: meetingCode, ...updates }),
      });
    } catch { /* non-critical */ }
  }, [meetingCode, getToken]);

  // Sync isHostSharing whenever the screen-share state changes so that mobile
  // clients see an up-to-date gate on the "Control" button. When sharing stops,
  // also clear any active RC grant (the shared surface is gone).
  // NOTE: only clear grantedTo on the true→false transition, NOT on initial mount
  // (sharing starts false). Clearing on mount would wipe a server-side grant
  // before the initial-connect rc-state recovery check has a chance to run,
  // breaking the late-join haveControl recovery path.
  const prevSharingRef = useRef(false);
  useEffect(() => {
    const wasSharing = prevSharingRef.current;
    prevSharingRef.current = sharing;
    if (sharing) {
      void syncRcState({ isSharing: true });
    } else {
      // Clear grantedTo only when transitioning away from an active share.
      // On initial mount (wasSharing=false, sharing=false) preserve any existing
      // server-side grant so late-join recovery can restore haveControl=true.
      void syncRcState({ isSharing: false, ...(wasSharing ? { grantedTo: null } : {}) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing]);

  // ── Cursor position relay to mobile subscribers ─────────────────────────
  // When this desktop host has an active controller and is sharing, relay the
  // controller's pointer position to /remote/rc-pointer so that mobile clients
  // subscribed to the /api/ws/rc-cursor WebSocket can show a live cursor dot.
  // controllerPointer is already throttled at ~30 fps by useLiveKit.ts so each
  // state change here represents a meaningful cursor movement.
  useEffect(() => {
    if (!sharing || !rcGrantedTo || !controllerPointer || !meetingCode) return;
    const { x, y } = controllerPointer;
    void getToken().then((token) => {
      fetch("/api/remote/rc-pointer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ roomName: meetingCode, x, y }),
      }).catch(() => {});
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllerPointer]);

  // ── Electron OS-cursor tracking relay ─────────────────────────────────────
  // When the web app runs inside the Electron desktop wrapper, robotjs can move
  // the OS cursor independently of web mouse events (e.g. when executing an RC
  // click from a mobile controller).  The web client would never learn about
  // those movements through its own mousemove listeners alone.
  //
  // Here we ask the Electron main process to poll robotjs.getMousePos() at
  // ~30 fps and push normalised coordinates back via IPC.  Each tick posts to
  // /remote/rc-pointer so mobile subscribers see a fully-accurate cursor dot.
  // A pending-fetch guard prevents fetch pileup on slow networks.
  useEffect(() => {
    if (!sharing || !rcGrantedTo || !meetingCode || !isElectronHost) return;
    const erc = window.electronRC;
    if (!erc) return;

    let pending = false;

    const unsubscribe = erc.onCursorMove((normX, normY) => {
      if (pending) return;
      pending = true;
      void getToken()
        .then((token) =>
          fetch("/api/remote/rc-pointer", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ roomName: meetingCode, x: normX, y: normY }),
          }).catch(() => {})
        )
        .catch(() => {})
        .finally(() => { pending = false; });
    });

    erc.startCursorTracking();

    return () => {
      unsubscribe();
      // Called on every dep change (including rcGrantedTo → null when RC is
      // revoked) and on unmount.  This is the primary cleanup path; the
      // handleRevoke function below also fires stopCursorTracking immediately
      // so that the interval is cleared before the next render cycle runs.
      erc.stopCursorTracking();
    };
  // rcGrantedTo is intentionally in the dep array: when the host revokes RC
  // the value becomes null, React re-runs this effect, the cleanup above fires
  // stopCursorTracking, and the early-return guard prevents tracking restart.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, rcGrantedTo, meetingCode, isElectronHost]);

  // ── Electron screen-share source picker ────────────────────────────────────
  // When the web app calls getDisplayMedia() inside Electron, the main process
  // intercepts it, fetches desktopCapturer sources, and pushes them here via
  // screen:sources-ready.  We show the picker modal; the user clicks a source,
  // which calls pickScreenSource(id) → main calls callback({ video: source })
  // → getDisplayMedia() resolves and startScreenShare() continues normally.
  useEffect(() => {
    if (!window.electronRC) return;
    const unsub = window.electronRC.onScreenSourcesReady((sources) => {
      setScreenPickerSources(sources);
    });
    return unsub;
  }, []);

  const handleScreenPickerSelect = useCallback((sourceId: string) => {
    window.electronRC?.pickScreenSource(sourceId, shareComputerSound);
    setScreenPickerSources(null);
  }, [shareComputerSound]);

  const handleScreenPickerCancel = useCallback(() => {
    window.electronRC?.pickScreenSource(null);
    setScreenPickerSources(null);
    sharingInProgressRef.current = false;
  }, []);

  // ── Audit logging helper ──────────────────────────────────────────────────────
  // Fire-and-forget write to the RC audit log endpoint.  Used for events that
  // travel via the LiveKit data-channel path (grant/deny/revoke/pause/resume)
  // which bypass the mobile REST proxy where auditing normally happens.
  const fireAudit = useCallback(async (action: string, targetId?: string | null, details?: Record<string, unknown>) => {
    if (!meetingCode) return;
    try {
      const token = await getToken();
      await fetch("/api/remote/rc-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ roomName: meetingCode, action, targetClerkId: targetId ?? null, details }),
      });
    } catch { /* audit failures must not block the main flow */ }
  }, [meetingCode, getToken]);

  // Wraps revokeControl and also clears the REST RC state.
  // Immediately stops Electron cursor tracking so no rc:cursor-pos events
  // arrive in the window between this call and the useEffect cleanup that
  // fires after the rcGrantedTo → null re-render completes.
  const handleRevoke = useCallback(() => {
    if (isElectronHost) {
      window.electronRC?.stopCursorTracking();
    }
    revokeControl();
    void syncRcState({ grantedTo: null });
    void fireAudit("rc-revoke", rcGrantedTo, { trigger: "manual" });
  }, [isElectronHost, revokeControl, syncRcState, fireAudit, rcGrantedTo]);

  const handlePause = useCallback(() => {
    pauseControl();
    void fireAudit("rc-pause", rcGrantedTo);
    void syncRcState({ grantedTo: rcGrantedTo });
  }, [pauseControl, fireAudit, rcGrantedTo, syncRcState]);

  const handleResume = useCallback(() => {
    resumeControl();
    void fireAudit("rc-resume", rcGrantedTo);
  }, [resumeControl, fireAudit, rcGrantedTo]);

  // ── Clipboard sync handlers (controller side) ───────────────────────────────

  // Request the host's clipboard — host will read it and send rc-clipboard-data back.
  const handleClipboardGet = useCallback(() => {
    sendClipboardPull();
    toast({ title: "Requesting host clipboard…" });
  }, [sendClipboardPull, toast]);

  // Read the local browser clipboard and push it to the host's OS clipboard.
  const handleClipboardPush = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { toast({ title: "Your clipboard is empty" }); return; }
      sendClipboardPush(text);
      toast({ title: "Clipboard pushed to host ✓" });
    } catch {
      toast({ title: "Cannot read clipboard — check browser permissions", variant: "destructive" });
    }
  }, [sendClipboardPush, toast]);

  // When the host sends clipboard data back, write it to the browser clipboard and show a toast.
  useEffect(() => {
    if (!rcClipboardData) return;
    const { text } = rcClipboardData;
    const preview = text.length > 40 ? text.slice(0, 40) + "…" : text;
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Host clipboard copied ✓", description: preview || "(empty)" });
    }).catch(() => {
      // Clipboard write requires user gesture / HTTPS — show the content in the toast
      // so the user can copy it manually if the API is unavailable.
      toast({
        title: "Host clipboard received",
        description: preview || "(empty)",
      });
    });
  }, [rcClipboardData, toast]);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.volume = 1;
    utt.rate = 1;
    utt.pitch = 1;
    window.speechSynthesis.speak(utt);
  };

  const handleRecord = () => {
    if (isRecording) {
      // ── Stop ──────────────────────────────────────────────────────────────
      // Cancel the composite draw loop
      cancelAnimationFrame(recordingRafRef.current);
      recordingRafRef.current = 0;
      // Close the audio context
      recordingAudioCtxRef.current?.close().catch(() => {});
      recordingAudioCtxRef.current = null;
      // Release hidden video elements used for compositing
      recordingVideosRef.current.forEach(v => { v.pause(); v.srcObject = null; });
      recordingVideosRef.current = [];
      // Stop the MediaRecorder — onstop fires and shows the save dialog
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (recordingId) stopRecordingMutation.mutate({ id: recordingId });
      speak("Recording stopped");
      toast({ title: "⏹ Recording stopped", description: "The recording has been saved to your Recordings library." });
    } else {
      // ── Always: mark recording active + call server API ───────────────────
      // The DB-level recording is independent of whether a real camera stream
      // is available. Set state first so the REC badge appears immediately.
      setIsRecording(true);
      setElapsed(0);
      speak("Recording started");
      if (meeting) startRecordingMutation.mutate({ id: meeting.id, data: { initiatedByClerkId: user?.id ?? "" } });

      // ── Optional: local MediaRecorder composite (needs camera) ────────────
      // Use activeStreamRef so VB-processed video is captured, not the raw camera
      const localS = activeStreamRef.current ?? localStreamRef.current;
      if (!localS) {
        toast({
          title: "⏺ Recording started",
          description: "Server-side recording is active. Enable your camera for local video capture.",
        });
        return;
      }

      // Picture and sound are separate. Remote microphone and screen-share audio
      // live on audioStream so the video element can stay muted.
      const pictureStreams: MediaStream[] = [localS, ...remoteStreams.map(r => r.stream).filter((s): s is MediaStream => s !== null)];
      const audioSources: MediaStream[] = [localS, ...remoteStreams.map(r => r.audioStream).filter((s): s is MediaStream => s !== null)];

      // ── 1. Composite canvas ───────────────────────────────────────────────
      const REC_W = 1280, REC_H = 720;
      const recCanvas = document.createElement("canvas");
      recCanvas.width = REC_W; recCanvas.height = REC_H;
      const recCtx = recCanvas.getContext("2d")!;

      // One muted <video> per stream — used only for drawing to the canvas
      const recVideos: HTMLVideoElement[] = pictureStreams.map(s => {
        const v = document.createElement("video");
        v.srcObject = s; v.autoplay = true; v.playsInline = true; v.muted = true;
        v.play().catch(() => {});
        return v;
      });
      recordingVideosRef.current = recVideos;

      // Tile grid: 1→1×1, 2→2×1, 3-4→2×2, 5-6→3×2, 7+→3×3
      const n = recVideos.length;
      const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 6 ? 3 : 4;
      const rows = Math.ceil(n / cols);
      const tileW = REC_W / cols, tileH = REC_H / rows;

      const drawLoop = () => {
        recCtx.fillStyle = "#111827";
        recCtx.fillRect(0, 0, REC_W, REC_H);
        recVideos.forEach((v, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          const x = col * tileW, y = row * tileH;
          if (v.readyState >= 2 && v.videoWidth > 0) {
            // Cover-fit the video into the tile without distortion
            const vAR = v.videoWidth / v.videoHeight, tAR = tileW / tileH;
            let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
            if (vAR > tAR) { sw = v.videoHeight * tAR; sx = (v.videoWidth - sw) / 2; }
            else { sh = v.videoWidth / tAR; sy = (v.videoHeight - sh) / 2; }
            recCtx.drawImage(v, sx, sy, sw, sh, x, y, tileW, tileH);
          } else {
            recCtx.fillStyle = "#1f2937";
            recCtx.fillRect(x, y, tileW, tileH);
            recCtx.fillStyle = "#6b7280";
            recCtx.font = "bold 13px sans-serif";
            recCtx.textAlign = "center";
            recCtx.textBaseline = "middle";
            recCtx.fillText(i === 0 ? "You" : (peerNames.get(remoteStreams[i - 1]?.userId) ?? "Participant"), x + tileW / 2, y + tileH / 2);
          }
        });
        recordingRafRef.current = requestAnimationFrame(drawLoop);
      };
      recordingRafRef.current = requestAnimationFrame(drawLoop);

      // ── 2. Audio mix via AudioContext ─────────────────────────────────────
      let mixedAudioTrack: MediaStreamTrack | null = null;
      try {
        const audioCtx = new AudioContext();
        recordingAudioCtxRef.current = audioCtx;
        const destination = audioCtx.createMediaStreamDestination();
        audioSources.forEach(s => {
          const audio = s.getAudioTracks();
          if (audio.length > 0) {
            try {
              audioCtx.createMediaStreamSource(new MediaStream(audio)).connect(destination);
            } catch { /* stream audio not connectable — skip */ }
          }
        });
        mixedAudioTrack = destination.stream.getAudioTracks()[0] ?? null;
      } catch { /* AudioContext unavailable — record video-only */ }

      // ── 3. MediaRecorder on the composite stream ──────────────────────────
      const canvasVideoTrack = recCanvas.captureStream(30).getVideoTracks()[0];
      const tracks: MediaStreamTrack[] = [canvasVideoTrack];
      if (mixedAudioTrack) tracks.push(mixedAudioTrack);
      const compositeStream = new MediaStream(tracks);

      const mimeType =
        MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" :
        MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" :
        MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";

      recordedChunksRef.current = [];
      try {
        const recorder = new MediaRecorder(compositeStream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        recorder.onstop = () => {
          // Stop the canvas capture track (composite is done)
          canvasVideoTrack.stop();
          if (!recordedChunksRef.current.length) return;
          const blob = new Blob(recordedChunksRef.current, { type: mimeType || "video/webm" });
          // Show save dialog — user picks filename before the file touches their disk
          const ts = new Date().toISOString().slice(0, 16).replace("T", "_").replace(/:/g, "-");
          setSaveRecordingFilename(`TanCom-${meetingCode}-${ts}`);
          setSaveRecordingBlob(blob);
        };
        recorder.start(100); // 100 ms chunks — low-latency accumulation
        mediaRecorderRef.current = recorder;
        // isRecording, elapsed, speak, and the server API call were already
        // triggered above (before the stream guard) so the REC badge appears
        // immediately regardless of whether the MediaRecorder setup succeeds.
        toast({
          title: "⏺ Recording started",
          description: remoteStreams.length
            ? `Capturing ${1 + remoteStreams.length} participants — audio and video`
            : "Capturing your camera and microphone",
        });
      } catch (err) {
        // Clean up everything on failure
        cancelAnimationFrame(recordingRafRef.current); recordingRafRef.current = 0;
        recordingAudioCtxRef.current?.close().catch(() => {}); recordingAudioCtxRef.current = null;
        recordingVideosRef.current.forEach(v => { v.pause(); v.srcObject = null; });
        recordingVideosRef.current = [];
        canvasVideoTrack.stop();
        // Roll back state — the server recording was already started above, so stop it too
        setIsRecording(false);
        if (recordingId) stopRecordingMutation.mutate({ id: recordingId });
        toast({ title: "Recording failed", description: String(err), variant: "destructive" });
      }
    }
  };

  const handleSaveRecording = () => {
    if (!saveRecordingBlob) return;
    const name = saveRecordingFilename.trim() || `TanCom-${meetingCode}-${Date.now()}`;
    const ext = saveRecordingBlob.type.includes("webm") ? ".webm" : ".mp4";
    const filename = name.endsWith(ext) ? name : `${name}${ext}`;
    const url = URL.createObjectURL(saveRecordingBlob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaveRecordingBlob(null);
  };

  const handlePauseResume = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (isPaused) {
      recorder.resume();
      setIsPaused(false);
      speak("Recording resumed");
    } else {
      recorder.pause();
      setIsPaused(true);
      speak("Recording paused");
    }
  };

  const handleRename = () => {
    const name = renameInput.trim();
    if (!name) return;
    setLocalDisplayName(name);
    rename(name);
    setShowRenameDialog(false);
    setRenameInput("");
  };

  const REACTION_EMOJIS = ["👍", "👎", "😂", "😮", "😢", "❤️", "🎉", "🔥"];
  const INPUT_EMOJIS = [
    "😀","😂","😍","🥰","😎","🤔","😅","🙄","😭","😡",
    "👍","👎","👏","🙌","🤝","💪","✌️","🤞","👀","🙏",
    "❤️","🔥","⭐","✅","❌","💯","🎉","🎊","🚀","💡",
    "😊","😉","🤣","😇","🥳","🤩","😏","🫡","🤗","😴",
  ];

  // Close pickers when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setActivePickerMsgId(null);
      }
      if (inputEmojiRef.current && !inputEmojiRef.current.contains(e.target as Node)) {
        setShowInputEmoji(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleReact = (msgId: string, emoji: string) => {
    const myId = user?.id ?? "local";
    applyReaction(msgId, emoji, myId);
    sendReaction(msgId, emoji);
    setActivePickerMsgId(null);
  };

  const insertEmoji = (emoji: string) => {
    const el = chatInputRef.current;
    if (!el) { setChatInput(prev => prev + emoji); return; }
    const start = el.selectionStart ?? chatInput.length;
    const end = el.selectionEnd ?? chatInput.length;
    const next = chatInput.slice(0, start) + emoji + chatInput.slice(end);
    setChatInput(next);
    // restore cursor after emoji
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const myId = user?.id ?? "local";
    const msg = {
      id, sender: localDisplayName, senderId: myId, text,
      recipientId: chatRecipient?.userId, recipientName: chatRecipient?.name,
    };
    setMessages((prev) => [...prev, msg]);
    sendChatMessage(id, localDisplayName, myId, text, chatRecipient?.userId, chatRecipient?.name);
    setChatInput("");
    setShowInputEmoji(false);
  };

  // Build tile list: local + remote camera streams (screen-share entries shown separately, not as grid tiles)
  const cameraRemotes = remoteStreams.filter(r => !r.isScreenShare);
  const GALLERY_PAGE_SIZE = 11; // + 1 local tile = 12 max rendered tiles
  const galleryTotalPages = Math.max(1, Math.ceil(cameraRemotes.length / GALLERY_PAGE_SIZE));
  const galleryPageClamped = Math.min(galleryPage, galleryTotalPages - 1);
  const galleryRemotes = cameraRemotes.slice(
    galleryPageClamped * GALLERY_PAGE_SIZE,
    (galleryPageClamped + 1) * GALLERY_PAGE_SIZE,
  );
  const totalTiles = 1 + galleryRemotes.length;

  // Gallery grid: cols + rows so up to 12 tiles always fill the screen without scrolling
  const galleryGridCols =
    totalTiles === 1 ? "grid-cols-1"
    : totalTiles === 2 ? "grid-cols-2"
    : totalTiles <= 4 ? "grid-cols-2"
    : totalTiles <= 6 ? "grid-cols-3"
    : totalTiles <= 9 ? "grid-cols-3"
    : "grid-cols-4";
  const galleryGridRows =
    totalTiles === 1 ? "grid-rows-1"
    : totalTiles === 2 ? "grid-rows-1"
    : totalTiles <= 4 ? "grid-rows-2"
    : totalTiles <= 6 ? "grid-rows-2"
    : totalTiles <= 9 ? "grid-rows-3"
    : "grid-rows-3";
  const galleryScrolls = totalTiles > 12;

  // Speaker / Sidebar: determine featured tile (auto-selects local screen share → remote screen share → first remote → local)
  const screenShareRemote = remoteStreams.find(r => r.isScreenShare);
  const defaultFeaturedId = sharing ? "__local__" : (screenShareRemote?.userId ?? remoteStreams[0]?.userId ?? "__local__");
  const activePinnedId = pinnedUserId ?? defaultFeaturedId;
  const featuredIsLocal = activePinnedId === "__local__" || remoteStreams.length === 0;
  const featuredRemote = !featuredIsLocal ? (remoteStreams.find(r => r.userId === activePinnedId) ?? null) : null;
  const otherRemotes = remoteStreams.filter(r => r.userId !== activePinnedId);
  const showLocalInStrip = !featuredIsLocal;

  // When sharing Entire Screen or Window (non-"browser" surface), the local
  // camera must NOT appear in the side strips — it lives exclusively in the
  // floating PiP so the shared content can fill the maximum available space.
  const showSelfCamPip = sharing && !!screenSurface && screenSurface !== "browser";

  // Auto-dismiss the "Re-request" toast when the host stops sharing so the
  // button can never be clicked against a host with no active screen share.
  // Also notify this participant if they had a pending RC request in flight
  // that was implicitly cancelled when the host stopped sharing.
  const prevScreenShareRemoteRef = useRef(screenShareRemote);
  useEffect(() => {
    const wasSharing = !!prevScreenShareRemoteRef.current;
    const isSharing = !!screenShareRemote;
    if (wasSharing && !isSharing) {
      if (reRequestToastDismissRef.current) {
        reRequestToastDismissRef.current();
        reRequestToastDismissRef.current = null;
      }
      if (myRcRequestPendingRef.current) {
        myRcRequestPendingRef.current = false;
        setMyRcRequestPending(false);
        toast({
          title: "Request cancelled",
          description: "The host stopped sharing — your remote control request was cancelled.",
        });
      }
    }
    prevScreenShareRemoteRef.current = screenShareRemote;
  }, [screenShareRemote, toast]);

  // ── Auto-switch to speaker view when screen sharing starts / stops ───────────
  const anyoneSharing = sharing || !!screenShareRemote;
  const shareBannerText = sharing
    ? "You are sharing your screen"
    : screenShareRemote
      ? `${peerNames.get(screenShareRemote.userId) ?? "A participant"} is sharing their screen${
          screenShareRemote.screenShareHold === "sender" ? " — paused"
          : screenShareRemote.screenShareHold === "link" ? " — reconnecting"
          : ""
        }`
      : "";
  const prevAnyoneSharingRef = useRef(false);
  useEffect(() => {
    const was = prevAnyoneSharingRef.current;
    prevAnyoneSharingRef.current = anyoneSharing;
    if (anyoneSharing && !was) {
      setViewMode("speaker");
    } else if (!anyoneSharing && was) {
      setViewMode("gallery");
      setPinnedUserId(null);
      // Mirror the mobile hook fix: when the host stops sharing, clear any
      // stale "You are controlling…" banner.  Normally the host sends an
      // rc-revoke before unpublishing, but if that message is lost (network
      // drop, crash) haveControl stays true and the banner lingers.  Calling
      // revokeControl here clears the local state and, if the host is still
      // reachable, notifies them too — a harmless no-op on their end since
      // they are already done sharing.
      if (haveControl) revokeControl();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyoneSharing]);

  // Self-cam PiP: auto-show when sharing a non-browser surface so the local
  // camera has a home without occupying the side strip (which shows remotes only).
  useEffect(() => {
    if (showSelfCamPip) {
      setShowPip(true);
      setFloatMinimized(false);
      setFloatMaximized(false);
    }
  }, [showSelfCamPip]);

  // Chat PiP: auto-show the cameras popup when the chat panel opens, but only
  // when nobody is sharing (during screen share, cameras live in the side strip).
  useEffect(() => {
    if (chatOpen && !anyoneSharing) {
      setShowPip(true);
      setFloatMinimized(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);

  // ── Waiting-room screen (participant hasn't been admitted yet) ────────────────
  if (isWaitingForAdmission) {
    return (
      <div className="flex flex-col h-screen bg-gray-950 items-center justify-center gap-0">
        {/* Card */}
        <div className="w-full max-w-sm mx-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Pulsing top bar */}
          <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-purple-500 to-blue-600 animate-pulse" />

          <div className="p-8 flex flex-col items-center text-center gap-5">
            {/* Spinner */}
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-gray-700" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-400" />
              </div>
            </div>

            <div>
              <h2 className="text-white font-semibold text-lg mb-1">
                {meeting?.title ?? "Meeting"}
              </h2>
              <p className="text-gray-400 text-sm">
                You're in the waiting room. The host will admit you shortly.
              </p>
            </div>

            {/* Meeting code */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-2.5 w-full justify-center">
              <span className="text-gray-400 text-xs">Meeting ID</span>
              <span className="font-mono text-white text-sm font-medium tracking-wider">{meetingCode}</span>
            </div>

            {/* Status dot */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
              </span>
              Waiting for host to admit you…
            </div>

            <button
              onClick={handleLeave}
              className="w-full mt-1 flex items-center justify-center gap-2 rounded-xl bg-gray-800 hover:bg-red-600/20 border border-gray-700 hover:border-red-600/50 text-gray-300 hover:text-red-400 py-2.5 text-sm font-medium transition-colors"
            >
              <PhoneOff className="h-4 w-4" />
              Leave
            </button>
          </div>
        </div>

        <p className="mt-4 text-gray-600 text-xs">Checking every few seconds…</p>
      </div>
    );
  }

  const presenterStripCamera = !sharing && screenShareRemote?.cameraStream ? (
    <div className="shrink-0 rounded-2xl overflow-hidden" style={{ height: "99px" }}>
      <PresenterCameraTile
        cameraStream={screenShareRemote.cameraStream}
        displayName={peerNames.get(screenShareRemote.userId) ?? screenShareRemote.userId.slice(0, 8)}
      />
    </div>
  ) : null;

  return (
    <VideoEnhancementContext.Provider value={{ cssFilter, cssTransform }}>
    <div className="flex flex-col h-screen bg-gray-950">
      {remoteStreams.map((remote) => (
        <RemoteAudio key={remote.userId} stream={remote.audioStream} trackKey={remote.audioKey} />
      ))}
      {/* ── Zoom-style popup notifications ──────────────────────────────────── */}
      <MeetingPopupStack popups={roomPopups} onDismiss={dismissRoomPopup} />
      {/* ── Persistent RC banners ──────────────────────────────────────────── */}
      {haveControl && (
        <div className={`fixed top-0 inset-x-0 z-[60] flex flex-wrap items-center justify-center gap-2 ${rcPaused ? "bg-amber-600" : "bg-orange-500"} px-4 py-2 shadow-lg select-none`}>
          <MousePointer2 className="h-4 w-4 text-white shrink-0" />
          <span className="text-white text-sm font-medium">
            {rcPaused
              ? "Remote control paused — host suspended your access"
              : `You are controlling ${peerNames.get(rcGrantedTo ?? "") ?? "a participant"}'s screen`}
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={handleClipboardGet}
              title="Copy host clipboard → your clipboard"
              className="flex items-center gap-1 px-2.5 py-0.5 bg-white/20 hover:bg-white/35 rounded-md text-white text-xs font-medium transition-colors"
            >
              <Download className="h-3 w-3" /> Get Clipboard
            </button>
            <button
              onClick={handleClipboardPush}
              title="Send your clipboard → host clipboard"
              className="flex items-center gap-1 px-2.5 py-0.5 bg-white/20 hover:bg-white/35 rounded-md text-white text-xs font-medium transition-colors"
            >
              <Upload className="h-3 w-3" /> Push Clipboard
            </button>
          </div>
          <button
            onClick={handleRevoke}
            className="ml-2 flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Stop Controlling
          </button>
        </div>
      )}
      {sharing && rcGrantedTo && !haveControl && (
        <div className={`fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-3 ${rcPaused ? "bg-amber-600" : "bg-red-600"} px-4 py-2 shadow-lg select-none`}>
          <ShieldCheck className="h-4 w-4 text-white shrink-0" />
          <span className="text-white text-sm font-medium">
            {rcPaused
              ? `${peerNames.get(rcGrantedTo) ?? "A participant"}'s access is paused`
              : `${peerNames.get(rcGrantedTo) ?? "A participant"} is controlling your screen`}
          </span>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={rcPaused ? handleResume : handlePause}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-colors"
            >
              {rcPaused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={handleRevoke}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Revoke
            </button>
          </div>
        </div>
      )}
      {/* ── Pending RC request banner (host only) ───────────────────────────── */}
      {isHost && rcRequests.length > 0 && !rcGrantedTo && (
        <div className="fixed top-0 inset-x-0 z-[59] bg-amber-600 shadow-lg select-none">
          {rcRequests.length === 1 ? (
            /* ── Single request: compact one-liner ── */
            <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 animate-pulse-subtle">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              <Bell className="h-4 w-4 text-white shrink-0" />
              <span className="text-white text-sm font-medium">
                <strong>{rcRequests[0].name}</strong> is waiting for control approval
              </span>
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  onClick={() => {
                    const req = rcRequests[0];
                    grantControl(req.userId, electronBridgeReady);
                    void syncRcState({ grantedTo: req.userId });
                    void fireAudit("rc-grant", req.userId);
                    const name = peerNames.get(req.userId) ?? req.name;
                    toast({
                      title: "Remote control granted",
                      description: electronBridgeReady
                        ? `${name} can now move your cursor and type on your screen.`
                        : `${name} was granted access. Install TanCom Desktop for real cursor control.`,
                    });
                  }}
                  className="flex items-center gap-1 px-3 py-0.5 rounded-md text-sm font-semibold transition-colors bg-white text-amber-700 hover:bg-amber-50"
                >
                  Allow
                </button>
                <button
                  onClick={() => {
                    void fireAudit("rc-deny", rcRequests[0].userId);
                    denyControl(rcRequests[0].userId);
                    toast({ title: "Remote control request declined" });
                  }}
                  className="flex items-center gap-1 px-3 py-0.5 bg-white/20 hover:bg-white/35 rounded-md text-white text-sm font-medium transition-colors"
                >
                  Deny
                </button>
              </div>
              {!isElectronHost && (
                <span className="text-amber-100 text-xs ml-1">
                  (Desktop app required for real cursor control)
                </span>
              )}
            </div>
          ) : (
            /* ── Multiple requests: expanded queue list ── */
            <div className="px-4 py-2">
              {/* Header row */}
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                </span>
                <Bell className="h-4 w-4 text-white shrink-0" />
                <span className="text-white text-sm font-semibold">
                  {rcRequests.length} participants waiting for control approval
                </span>
                {!isElectronHost && (
                  <span className="text-amber-100 text-xs ml-1">
                    (Desktop app required for real cursor control)
                  </span>
                )}
              </div>
              {/* Per-requester rows */}
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {rcRequests.map((req) => (
                  <div
                    key={req.userId}
                    className="flex items-center justify-between gap-2 bg-amber-700/50 rounded-md px-3 py-1"
                  >
                    <span className="text-white text-sm font-medium truncate">{req.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          grantControl(req.userId, electronBridgeReady);
                          void syncRcState({ grantedTo: req.userId });
                          void fireAudit("rc-grant", req.userId);
                          const name = peerNames.get(req.userId) ?? req.name;
                          toast({
                            title: "Remote control granted",
                            description: electronBridgeReady
                              ? `${name} can now move your cursor and type on your screen.`
                              : `${name} was granted access. Install TanCom Desktop for real cursor control.`,
                          });
                        }}
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold transition-colors bg-white text-amber-700 hover:bg-amber-50"
                      >
                        Allow
                      </button>
                      <button
                        onClick={() => {
                          void fireAudit("rc-deny", req.userId);
                          denyControl(req.userId);
                          toast({ title: "Remote control request declined", description: `${req.name}'s request was denied.` });
                        }}
                        className="flex items-center gap-1 px-2.5 py-0.5 bg-white/20 hover:bg-white/35 rounded-md text-white text-xs font-medium transition-colors"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Phone className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">{meeting?.title ?? "Meeting"}</p>
            <p className="text-gray-400 text-xs font-mono">{meetingCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isRecording && (
            <div className={`flex items-center gap-1.5 text-xs ${isPaused ? "text-yellow-400" : "text-red-500 animate-pulse"}`}>
              <div className={`h-2 w-2 rounded-full ${isPaused ? "bg-yellow-400" : "bg-red-500"}`} />
              REC {formatTime(elapsed)}
            </div>
          )}
          {/* WebRTC connection indicator */}
          <div className="flex items-center gap-1.5" title={wsConnected ? "Signaling connected" : connectionError ? "Connection failed" : "Connecting…"}>
            {wsConnected
              ? <Wifi className="h-3.5 w-3.5 text-green-400" />
              : connectionError
                ? <WifiOff className="h-3.5 w-3.5 text-red-400" />
                : <WifiOff className="h-3.5 w-3.5 text-yellow-400 animate-pulse" />}
          </div>
          {cameraError && (
            <div className="flex items-center gap-1.5 text-yellow-400 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{audioOnlyMode ? "Audio only" : "No camera/mic"}</span>
              <button
                onClick={retryCameraAccess}
                disabled={cameraRetrying}
                className="ml-0.5 underline underline-offset-2 hover:text-yellow-200 disabled:opacity-50 disabled:no-underline"
              >
                {cameraRetrying ? "Trying…" : "Enable camera"}
              </button>
            </div>
          )}
          <Button size="sm" variant="ghost" className="gap-1.5 text-gray-300 hover:text-white" onClick={copyInvite}>
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Copy invite</span>
          </Button>
          <ViewSwitcher viewMode={viewMode} onChange={(v) => { setViewMode(v); if (v !== "speaker" && v !== "sidebar") setPinnedUserId(null); }} />
          <div className="relative" ref={securityPanelRef}>
            <button
              onClick={() => setShowSecurityPanel(v => !v)}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${showSecurityPanel ? "bg-green-600/30 text-green-400" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}
              title="Meeting security"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Security</span>
              {isHost && rcRequests.length > 0 && !rcGrantedTo && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                </span>
              )}
            </button>
            {showSecurityPanel && (
              <SecurityPanel
                meeting={meeting} isHost={isHost} isSharing={sharing} rcGrantedTo={rcGrantedTo} peerNames={peerNames}
                pendingRcCount={isHost ? rcRequests.length : 0}
                rcPaused={rcPaused}
                onRevoke={() => { handleRevoke(); setShowSecurityPanel(false); }}
                onPause={() => { handlePause(); }}
                onResume={() => { handleResume(); }}
                onLock={() => { if (meeting) lockMutation.mutate({ id: meeting.id, data: { locked: !meeting.isLocked } }); }}
                onToggleWaitingRoom={() => { if (meeting) updateMeetingMutation.mutate({ id: meeting.id, data: { waitingRoomEnabled: !meeting.waitingRoomEnabled } }); }}
                grantableParticipants={sharing && !rcGrantedTo
                  ? peerIds.map(id => ({ liveKitId: id, name: peerNames.get(id) ?? id.slice(0, 8) }))
                  : undefined}
                onGrantTo={sharing && !rcGrantedTo ? (liveKitId) => {
                  grantControl(liveKitId, electronBridgeReady);
                  void syncRcState({ grantedTo: liveKitId });
                  void fireAudit("rc-grant", liveKitId, { initiatedBySharer: true });
                  const name = peerNames.get(liveKitId) ?? "Participant";
                  toast({
                    title: "Remote control granted",
                    description: electronBridgeReady
                      ? `${name} can now move your cursor and type on your screen.`
                      : `${name} was granted access. Install TanCom Desktop for real cursor control.`,
                  });
                  setShowSecurityPanel(false);
                } : undefined}
              />
            )}
          </div>
        </div>
      </div>

      {/* Reconnecting banner */}
      {isReconnecting && !connectionError && (
        <div className="flex items-center gap-3 bg-amber-950 border-b border-amber-800 px-4 py-2.5 text-sm text-amber-300">
          <Loader2 className="h-4 w-4 shrink-0 text-amber-400 animate-spin" />
          <span className="flex-1">Reconnecting… Your connection dropped. Trying to reconnect.</span>
        </div>
      )}

      {/* Connection error banner */}
      {connectionError && !wsConnected && (
        <div className="flex items-center gap-3 bg-red-950 border-b border-red-800 px-4 py-2.5 text-sm text-red-300">
          <WifiOff className="h-4 w-4 shrink-0 text-red-400" />
          <span className="flex-1">
            {connectionError === "__not_admitted__"
              ? "You haven't joined this meeting yet. Please go through the join page first."
              : connectionError}
          </span>
          {connectionError === "__not_admitted__" ? (
            <button
              onClick={() => setLocation(`/meetings/${meetingCode}/join`)}
              className="shrink-0 rounded-md bg-red-800 hover:bg-red-700 text-red-100 text-xs font-medium px-3 py-1 transition-colors"
            >
              Join Meeting
            </button>
          ) : (
            <button
              onClick={() => window.location.reload()}
              className="shrink-0 rounded-md bg-red-800 hover:bg-red-700 text-red-100 text-xs font-medium px-3 py-1 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Share indicator — stays visible even if the video panel is hidden. */}
      {anyoneSharing && shareBannerText && (
        <div className="flex items-center gap-2 bg-green-950 border-b border-green-800 px-4 py-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <Monitor className="h-4 w-4 text-green-400 shrink-0" />
          <span className="text-green-100 font-medium flex-1 truncate">{shareBannerText}</span>
          {sharing && (
            <button
              onClick={() => { void stopSharing(); }}
              className="shrink-0 rounded-md bg-green-700 hover:bg-green-600 text-white text-xs font-medium px-3 py-1 transition-colors"
            >
              Stop sharing
            </button>
          )}
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video grid */}
        <div className={`relative flex-1 overflow-hidden p-2 ${hideVideoPanel ? "hidden" : ""}`}>
          {isHost && <WaitingRoomAlert waiting={waiting} onAdmit={admitParticipant} onAdmitAll={() => meeting && admitAllMutation.mutate({ id: meeting.id })} onDeny={denyParticipant} />}
          <RemoteControlBanner
            requests={rcRequests}
            isSharing={sharing}
            isHost={isHost}
            onGrant={(uid, hostBridgeReady) => {
              grantControl(uid, hostBridgeReady);
              void syncRcState({ grantedTo: uid });
              void fireAudit("rc-grant", uid);
              const name = peerNames.get(uid) ?? "Participant";
              toast({
                title: "Remote control granted",
                description: hostBridgeReady
                  ? `${name} can now move your cursor and type on your screen.`
                  : `${name} was granted access, but TanCom Desktop RC bridge is not ready — restart Desktop for real cursor control.`,
              });
            }}
            onDeny={(uid) => {
              void fireAudit("rc-deny", uid);
              denyControl(uid);
              toast({ title: "Remote control request declined" });
            }}
          />

          {/* ── Active Remote Control Banner ─────────────────────────────── */}
          {haveControl && (
            <div className="absolute top-0 left-0 right-0 z-40 flex items-center gap-2.5 bg-orange-500/20 border-b border-orange-500/30 backdrop-blur-sm px-4 py-1.5">
              <MousePointer2 className="h-3.5 w-3.5 text-orange-400 shrink-0" />
              <span className="text-orange-200 text-xs font-medium flex-1">
                You have remote control — hover the screen share tile and click or type to interact
              </span>
              <button
                onClick={handleRevoke}
                className="text-xs text-orange-300 hover:text-white border border-orange-500/40 hover:border-orange-400 rounded-lg px-2 py-0.5 transition-colors"
              >
                Release
              </button>
            </div>
          )}

          {/* ── Reclaim Host Banner ─────────────────────────────────────────── */}
          {reclaimBannerVisible && (
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-amber-500/15 border border-amber-500/40 px-4 py-3 text-sm">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                <UserCheck className="h-4 w-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-amber-300 font-medium leading-none mb-0.5">You were the original host</p>
                <p className="text-amber-400/80 text-xs">The meeting continued while you were away and someone else was promoted to host. Would you like to reclaim the host role?</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleReclaimHost}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors"
                >
                  Reclaim Host
                </button>
                <button
                  onClick={() => { setReclaimBannerVisible(false); setReclaimDismissed(true); }}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          {/* ── Gallery view ────────────────────────────────────────────────── */}
          {viewMode === "gallery" && (
            anyoneSharing ? (
              /* ── Gallery + screen share: big content left, equal camera strip right ── */
              <div className="flex h-full gap-2">
                {/* Main share area — takes most of the space */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  {/* "X is presenting" banner */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 border border-green-700/40 rounded-xl text-sm shrink-0">
                    <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                    <Monitor className="h-3.5 w-3.5 text-green-400 shrink-0" />
                    <span className="text-green-300 font-medium">
                      {shareBannerText}
                    </span>
                  </div>
                  {/* Screen share tile fills remaining height */}
                  <div className="flex-1 min-h-0">
                    {sharing ? (
                      /* Show a placeholder instead of the screen feed — playing the
                         capture stream back creates an infinite mirror effect. */
                      <SharingPlaceholderTile
                        displayName={localDisplayName} stream={activeStream} videoOn={videoOn}
                      />
                    ) : screenShareRemote ? (
                      <RemoteVideoTile
                        remote={screenShareRemote}
                        displayName={peerNames.get(screenShareRemote.userId) ?? screenShareRemote.userId.slice(0, 8)}
                        isHost={isHostLiveKitId(screenShareRemote.userId, meeting?.hostClerkId)}
                        handRaised={peerHands.has(screenShareRemote.userId)} index={0}
                        connectionState={peerConnectionStates.get(screenShareRemote.userId)}
                        haveControl={haveControl} isRcRequesting={isRcRequesting} controllerPointer={controllerPointer}
                        localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} isRcPaused={rcPaused} onPointerMove={sendPointerEvent} onSendClick={sendClickEvent} onSendScroll={sendScrollEvent} onSendKey={sendKeyEvent}
                        onDragStart={sendDragStart} onDragTo={sendDragTo} onDragEnd={sendDragEnd} onDoubleClick={sendDoubleClick}
                        fill
                      />
                    ) : null}
                  </div>
                </div>

                {/* Right camera strip — hidden entirely when self-cam PiP is active and no remotes */}
                {(!showSelfCamPip || cameraRemotes.length > 0) && (
                <div className="shrink-0 w-44 flex flex-col gap-2 overflow-y-auto">
                  {/* Local camera — hidden when sharing Entire Screen/Window (lives in floating PiP) */}
                  {!showSelfCamPip && (
                  <div className="shrink-0 rounded-2xl overflow-hidden" style={{ height: "99px" }}>
                    <LocalVideoTile
                      displayName={localDisplayName} stream={activeStream} screenStream={null}
                      videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost} sharing={false}
                      controllerPointer={null} isBeingControlled={false}
                      fill compact
                    />
                  </div>
                  )}
                  {presenterStripCamera}
                  {/* Remote camera tiles — capped at 8 in sidebar strip */}
                  {remoteStreams.filter(r => !r.isScreenShare).slice(0, 8).map((remote, i) => {
                    const name = peerNames.get(remote.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(remote.userId))?.displayName ?? remote.userId.slice(0, 8);
                    return (
                      <div key={remote.userId} className="shrink-0 rounded-2xl overflow-hidden" style={{ height: "99px" }}>
                        <RemoteVideoTile remote={remote} displayName={name}
                          isHost={isHostLiveKitId(remote.userId, meeting?.hostClerkId)} handRaised={peerHands.has(remote.userId)}
                          index={i + 1} connectionState={peerConnectionStates.get(remote.userId)}
                          haveControl={false} controllerPointer={null}
                          localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent}
                          fill compact
                        />
                      </div>
                    );
                  })}
                  {/* Overflow badge — shows count of participants not visible in strip */}
                  {remoteStreams.filter(r => !r.isScreenShare).length > 8 && (
                    <div className="shrink-0 rounded-2xl overflow-hidden bg-gray-800 flex items-center justify-center" style={{ height: "99px", minWidth: "72px" }}>
                      <span className="text-gray-300 text-xs font-medium text-center leading-tight px-1">
                        +{remoteStreams.filter(r => !r.isScreenShare).length - 8}<br />more
                      </span>
                    </div>
                  )}
                </div>
                )}
              </div>
            ) : (
              /* ── Gallery: paginated grid — max 12 tiles (11 remote + local) per page ── */
              (() => {
                const total = 1 + galleryRemotes.length;
                const cols = total === 1 ? 1 : total <= 2 ? 2 : total <= 6 ? 3 : 4;
                const rows = Math.ceil(total / cols);
                return (
                  <div className="h-full w-full relative flex flex-col">
                    <div
                      className="flex-1 p-2 relative"
                      style={{
                        display: "grid",
                        gap: "8px",
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gridTemplateRows: `repeat(${rows}, 1fr)`,
                      }}
                    >
                      {/* Your own tile */}
                      <LocalVideoTile
                        displayName={localDisplayName} stream={activeStream} screenStream={null}
                        videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost} sharing={false}
                        controllerPointer={controllerPointer} isBeingControlled={!!rcGrantedTo} rcClickPos={rcClickPos}
                        fill
                        onPin={cameraRemotes.length > 0 ? () => { setViewMode("speaker"); setPinnedUserId("__local__"); } : undefined}
                        isPinned={false}
                      />
                      {/* Remote participant tiles — current page only */}
                      {galleryRemotes.map((remote, i) => {
                        const name = peerNames.get(remote.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(remote.userId))?.displayName ?? remote.userId.slice(0, 8);
                        return (
                          <RemoteVideoTile key={remote.userId} remote={remote} displayName={name}
                            isHost={isHostLiveKitId(remote.userId, meeting?.hostClerkId)} handRaised={peerHands.has(remote.userId)}
                            index={galleryPageClamped * GALLERY_PAGE_SIZE + i + 1} connectionState={peerConnectionStates.get(remote.userId)}
                            haveControl={false} controllerPointer={null}
                            localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent} onSendClick={sendClickEvent} onSendScroll={sendScrollEvent} onSendKey={sendKeyEvent}
                            fill
                            onPin={() => { setViewMode("speaker"); setPinnedUserId(remote.userId); }}
                            isPinned={false}
                          />
                        );
                      })}
                      {/* Invite prompt when alone */}
                      {cameraRemotes.length === 0 && localStream && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
                          <p className="text-gray-500 text-sm bg-gray-900/70 rounded-xl px-4 py-2">
                            Share the invite link so others can join
                          </p>
                        </div>
                      )}
                    </div>
                    {/* Pagination controls — only shown when there are multiple pages */}
                    {galleryTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 py-1.5 bg-gray-950/80 backdrop-blur-sm text-gray-300 text-xs select-none shrink-0">
                        <button
                          onClick={() => setGalleryPage(p => Math.max(0, p - 1))}
                          disabled={galleryPageClamped === 0}
                          className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          ← Prev
                        </button>
                        <span className="text-gray-400">
                          Page {galleryPageClamped + 1} / {galleryTotalPages}
                          <span className="ml-2 text-gray-500">({cameraRemotes.length + 1} participants)</span>
                        </span>
                        <button
                          onClick={() => setGalleryPage(p => Math.min(galleryTotalPages - 1, p + 1))}
                          disabled={galleryPageClamped >= galleryTotalPages - 1}
                          className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()
            )
          )}

          {/* ── Speaker view ─────────────────────────────────────────────────── */}
          {viewMode === "speaker" && (
            anyoneSharing ? (
              /* ── Speaker + screen share: same two-column layout as Gallery ── */
              <div className="flex h-full gap-2">
                {/* Main share area */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  {/* "X is presenting" banner */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 border border-green-700/40 rounded-xl text-sm shrink-0">
                    <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                    <Monitor className="h-3.5 w-3.5 text-green-400 shrink-0" />
                    <span className="text-green-300 font-medium">
                      {shareBannerText}
                    </span>
                  </div>
                  {/* Screen share tile fills remaining height */}
                  <div className="flex-1 min-h-0">
                    {sharing ? (
                      <SharingPlaceholderTile
                        displayName={localDisplayName} stream={activeStream} videoOn={videoOn}
                      />
                    ) : screenShareRemote ? (
                      <RemoteVideoTile
                        remote={screenShareRemote}
                        displayName={peerNames.get(screenShareRemote.userId) ?? screenShareRemote.userId.slice(0, 8)}
                        isHost={isHostLiveKitId(screenShareRemote.userId, meeting?.hostClerkId)}
                        handRaised={peerHands.has(screenShareRemote.userId)} index={0}
                        connectionState={peerConnectionStates.get(screenShareRemote.userId)}
                        haveControl={haveControl} isRcRequesting={isRcRequesting} controllerPointer={controllerPointer}
                        localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} isRcPaused={rcPaused} onPointerMove={sendPointerEvent} onSendClick={sendClickEvent} onSendScroll={sendScrollEvent} onSendKey={sendKeyEvent}
                        onDragStart={sendDragStart} onDragTo={sendDragTo} onDragEnd={sendDragEnd} onDoubleClick={sendDoubleClick}
                        fill
                      />
                    ) : null}
                  </div>
                </div>

                {/* Right camera strip */}
                {(!showSelfCamPip || cameraRemotes.length > 0) && (
                  <div className="shrink-0 w-44 flex flex-col gap-2 overflow-y-auto">
                    {!showSelfCamPip && (
                      <div className="shrink-0 rounded-2xl overflow-hidden" style={{ height: "99px" }}>
                        <LocalVideoTile
                          displayName={localDisplayName} stream={activeStream} screenStream={null}
                          videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost} sharing={false}
                          controllerPointer={null} isBeingControlled={false}
                          fill compact
                        />
                      </div>
                    )}
                    {presenterStripCamera}
                    {cameraRemotes.map((remote, i) => {
                      const name = peerNames.get(remote.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(remote.userId))?.displayName ?? remote.userId.slice(0, 8);
                      return (
                        <div key={remote.userId} className="shrink-0 rounded-2xl overflow-hidden" style={{ height: "99px" }}>
                          <RemoteVideoTile remote={remote} displayName={name}
                            isHost={isHostLiveKitId(remote.userId, meeting?.hostClerkId)} handRaised={peerHands.has(remote.userId)}
                            index={i + 1} connectionState={peerConnectionStates.get(remote.userId)}
                            haveControl={false} controllerPointer={null}
                            localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent}
                            fill compact
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ── Speaker without screen share: featured tile + bottom filmstrip ── */
              <div className="flex flex-col h-full gap-2">
                {/* Featured / main tile */}
                <div className="flex-1 min-h-0">
                  {featuredIsLocal ? (
                    <LocalVideoTile
                      displayName={localDisplayName} stream={activeStream} screenStream={screenStream}
                      videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost} sharing={sharing}
                      controllerPointer={controllerPointer} isBeingControlled={!!rcGrantedTo} rcClickPos={rcClickPos}
                      fill
                      onPin={remoteStreams.length > 0 ? () => setPinnedUserId(null) : undefined}
                      isPinned={false}
                    />
                  ) : (
                    <RemoteVideoTile
                      remote={featuredRemote!}
                      displayName={peerNames.get(featuredRemote!.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(featuredRemote!.userId))?.displayName ?? featuredRemote!.userId.slice(0, 8)}
                      isHost={isHostLiveKitId(featuredRemote!.userId, meeting?.hostClerkId)}
                      handRaised={peerHands.has(featuredRemote!.userId)} index={0}
                      connectionState={peerConnectionStates.get(featuredRemote!.userId)}
                      haveControl={haveControl && featuredRemote!.isScreenShare}
                      controllerPointer={featuredRemote!.isScreenShare ? controllerPointer : null}
                      localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent} onSendClick={sendClickEvent} onSendScroll={sendScrollEvent} onSendKey={sendKeyEvent}
                      onDragStart={sendDragStart} onDragTo={sendDragTo} onDragEnd={sendDragEnd} onDoubleClick={sendDoubleClick}
                      fill onPin={() => { setPinnedUserId(null); }} isPinned
                    />
                  )}
                </div>

                {/* Bottom filmstrip — scrollable left/right with arrow buttons */}
                {(otherRemotes.length > 0 || showLocalInStrip || !!featuredRemote?.cameraStream) && (
                  <div className="relative shrink-0" style={{ height: "170px" }}>
                    <button
                      onClick={() => scrollFilmstrip("left")}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 flex items-center justify-center bg-gray-900/90 hover:bg-gray-800 rounded-full border border-gray-700 text-white shadow-lg transition-colors"
                      aria-label="Scroll left"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div ref={filmstripRef} className="flex gap-2 h-full overflow-x-auto px-10 scroll-smooth" style={{ scrollbarWidth: "none" }}>
                      {!featuredIsLocal && featuredRemote?.cameraStream && (
                        <div className="shrink-0" style={{ width: "226px" }}>
                          <PresenterCameraTile
                            cameraStream={featuredRemote.cameraStream}
                            displayName={peerNames.get(featuredRemote.userId) ?? featuredRemote.userId.slice(0, 8)}
                          />
                        </div>
                      )}
                      {showLocalInStrip && !showSelfCamPip && (
                        <div className="shrink-0 cursor-pointer" style={{ width: "226px" }} onClick={() => setPinnedUserId("__local__")}>
                          <LocalVideoTile
                            displayName={localDisplayName} stream={activeStream} screenStream={null}
                            videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost} sharing={false}
                            controllerPointer={null} isBeingControlled={false}
                            compact onPin={() => setPinnedUserId("__local__")} isPinned={pinnedUserId === "__local__"}
                          />
                        </div>
                      )}
                      {otherRemotes.map((remote, i) => {
                        const name = peerNames.get(remote.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(remote.userId))?.displayName ?? remote.userId.slice(0, 8);
                        return (
                          <div key={remote.userId} className="shrink-0 cursor-pointer" style={{ width: "226px" }} onClick={() => setPinnedUserId(remote.userId)}>
                            <RemoteVideoTile remote={remote} displayName={name}
                              isHost={isHostLiveKitId(remote.userId, meeting?.hostClerkId)} handRaised={peerHands.has(remote.userId)}
                              index={i + 1} connectionState={peerConnectionStates.get(remote.userId)}
                              haveControl={haveControl && remote.isScreenShare} controllerPointer={remote.isScreenShare ? controllerPointer : null}
                              localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent} onSendClick={sendClickEvent} onSendScroll={sendScrollEvent} onSendKey={sendKeyEvent}
                              compact onPin={() => setPinnedUserId(remote.userId)} isPinned={pinnedUserId === remote.userId}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => scrollFilmstrip("right")}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 flex items-center justify-center bg-gray-900/90 hover:bg-gray-800 rounded-full border border-gray-700 text-white shadow-lg transition-colors"
                      aria-label="Scroll right"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {/* ── Side by Side view ─────────────────────────────────────────────── */}
          {viewMode === "sidebar" && (
            <div className="flex flex-col h-full gap-2">
              {/* "X is presenting" banner */}
              {anyoneSharing && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 border border-green-700/40 rounded-xl text-sm shrink-0">
                  <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                  <Monitor className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  <span className="text-green-300 font-medium">
                    {shareBannerText}
                  </span>
                </div>
              )}
              <div className="flex flex-1 min-h-0 gap-3">
                {/* Main content area */}
                <div className="flex-1 min-w-0">
                  {featuredIsLocal ? (
                    sharing ? (
                      <SharingPlaceholderTile
                        displayName={localDisplayName} stream={activeStream} videoOn={videoOn}
                      />
                    ) : (
                    <LocalVideoTile
                      displayName={localDisplayName} stream={activeStream} screenStream={screenStream}
                      videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost} sharing={sharing}
                      controllerPointer={controllerPointer} isBeingControlled={!!rcGrantedTo} rcClickPos={rcClickPos}
                      fill
                    />
                    )
                  ) : (
                    <RemoteVideoTile
                      remote={featuredRemote!}
                      displayName={peerNames.get(featuredRemote!.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(featuredRemote!.userId))?.displayName ?? featuredRemote!.userId.slice(0, 8)}
                      isHost={isHostLiveKitId(featuredRemote!.userId, meeting?.hostClerkId)}
                      handRaised={peerHands.has(featuredRemote!.userId)} index={0}
                      connectionState={peerConnectionStates.get(featuredRemote!.userId)}
                      haveControl={haveControl && featuredRemote!.isScreenShare}
                      controllerPointer={featuredRemote!.isScreenShare ? controllerPointer : null}
                      localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent} onSendClick={sendClickEvent} onSendScroll={sendScrollEvent} onSendKey={sendKeyEvent}
                      onDragStart={sendDragStart} onDragTo={sendDragTo} onDragEnd={sendDragEnd} onDoubleClick={sendDoubleClick}
                      fill
                    />
                  )}
                </div>
                {/* Right filmstrip — vertical scroll */}
                <div className="w-52 flex flex-col gap-2 overflow-y-auto shrink-0 py-1 pr-1" style={{ scrollbarWidth: "thin" }}>
                  {/* Presenter camera PiP */}
                  {!featuredIsLocal && featuredRemote?.cameraStream && (
                    <div className="shrink-0 aspect-video">
                      <PresenterCameraTile
                        cameraStream={featuredRemote.cameraStream}
                        displayName={peerNames.get(featuredRemote.userId) ?? featuredRemote.userId.slice(0, 8)}
                      />
                    </div>
                  )}
                  {showLocalInStrip && !showSelfCamPip && (
                    <div className="shrink-0 cursor-pointer aspect-video" onClick={() => setPinnedUserId("__local__")}>
                      <LocalVideoTile
                        displayName={localDisplayName} stream={activeStream} screenStream={null}
                        videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost} sharing={false}
                        controllerPointer={null} isBeingControlled={false}
                        compact onPin={() => setPinnedUserId("__local__")} isPinned={pinnedUserId === "__local__"}
                      />
                    </div>
                  )}
                  {otherRemotes.map((remote, i) => {
                    const name = peerNames.get(remote.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(remote.userId))?.displayName ?? remote.userId.slice(0, 8);
                    return (
                      <div key={remote.userId} className="shrink-0 cursor-pointer aspect-video" onClick={() => setPinnedUserId(remote.userId)}>
                        <RemoteVideoTile remote={remote} displayName={name}
                          isHost={isHostLiveKitId(remote.userId, meeting?.hostClerkId)} handRaised={peerHands.has(remote.userId)}
                          index={i + 1} connectionState={peerConnectionStates.get(remote.userId)}
                          haveControl={haveControl && remote.isScreenShare} controllerPointer={remote.isScreenShare ? controllerPointer : null}
                          localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent} onSendClick={sendClickEvent} onSendScroll={sendScrollEvent} onSendKey={sendKeyEvent}
                          onDragStart={sendDragStart} onDragTo={sendDragTo} onDragEnd={sendDragEnd} onDoubleClick={sendDoubleClick}
                          compact onPin={() => setPinnedUserId(remote.userId)} isPinned={pinnedUserId === remote.userId}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        {(chatOpen || participantsOpen || notesOpen) && (
          <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
            <div className="flex items-stretch border-b border-gray-800">
              <button onClick={() => { setParticipantsOpen(true); setChatOpen(false); setNotesOpen(false); }}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${participantsOpen ? "text-white border-b-2 border-blue-500" : "text-gray-400 hover:text-gray-200"}`}>
                People
              </button>
              <button onClick={() => { setChatOpen(true); setParticipantsOpen(false); setNotesOpen(false); }}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${chatOpen ? "text-white border-b-2 border-blue-500" : "text-gray-400 hover:text-gray-200"}`}>
                Chat
              </button>
              <button onClick={() => { setNotesOpen(true); setChatOpen(false); setParticipantsOpen(false); }}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${notesOpen ? "text-white border-b-2 border-blue-500" : "text-gray-400 hover:text-gray-200"}`}>
                Notes
              </button>
              <button
                onClick={() => { setChatOpen(false); setParticipantsOpen(false); setNotesOpen(false); }}
                className="px-3 text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                title="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {participantsOpen && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {/* Privileged actions bar — host and co-host both see Mute All / Admit All */}
                {isPrivileged && (
                  <div className="flex gap-2 mb-3">
                    <Button size="sm" variant="outline" className="flex-1 text-xs border-gray-700 text-gray-300"
                      onClick={() => meeting && muteAllMutation.mutate({ id: meeting.id })}>Mute All</Button>
                    {waiting.length > 0 && (
                      <Button size="sm" className="flex-1 text-xs" onClick={() => meeting && admitAllMutation.mutate({ id: meeting.id })}>Admit All</Button>
                    )}
                  </div>
                )}
                {/* Self */}
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-800/50">
                  <div className="h-7 w-7 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {localDisplayName.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-gray-200 text-sm flex-1 truncate">{localDisplayName} (You)</span>
                  {isHost && <span className="shrink-0 text-[9px] font-semibold bg-blue-500/90 text-white px-1.5 py-0.5 rounded">Host</span>}
                  {!isHost && myRole === "cohost" && <span className="shrink-0 text-[9px] font-semibold bg-yellow-500/90 text-white px-1.5 py-0.5 rounded">Co-host</span>}
                  {!micOn && <MicOff className="h-3.5 w-3.5 text-red-400" />}
                  <button
                    onClick={() => { setRenameInput(localDisplayName); setShowRenameDialog(true); }}
                    className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                    title="Change your name"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                {/* ── Waiting room section (host only) ─────────────────── */}
                {isHost && waiting.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-xs font-medium text-orange-400 flex items-center gap-1">
                        <Bell className="h-3 w-3" /> Waiting Room ({waiting.length})
                      </span>
                      {waiting.length > 1 && (
                        <button onClick={() => meeting && admitAllMutation.mutate({ id: meeting.id })} className="text-xs text-blue-400 hover:text-blue-300">
                          Admit all
                        </button>
                      )}
                    </div>
                    {waiting.map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 mb-1">
                        <div className="h-7 w-7 rounded-full bg-orange-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(p.displayName ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                        <span className="text-gray-200 text-sm flex-1 truncate">{p.displayName ?? "Guest"}</span>
                        <button onClick={() => denyParticipant(p)} title="Deny" className="p-1 rounded hover:bg-red-600/30 text-gray-400 hover:text-red-400 transition-colors">
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => admitParticipant(p)} title="Admit" className="p-1 rounded hover:bg-blue-600/30 text-gray-400 hover:text-blue-400 transition-colors">
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="border-t border-gray-800 my-2" />
                  </div>
                )}
                {/* Remote peers — driven by WebSocket room membership (always up-to-date) */}
                {peerIds.map(peerId => {
                  const name = peerNames.get(peerId) ?? admitted.find(a => a.clerkId === peerId)?.displayName ?? peerId.slice(0, 8);
                  const peerIsHost = meeting?.hostClerkId === peerId;
                  const peerRole = peerRoles.get(peerId) ?? admitted.find(a => a.clerkId === peerId)?.role ?? "participant";
                  const peerIsCohost = peerRole === "cohost";
                  const hasStream = remoteStreams.some(r => r.userId === peerId);
                  const menuOpen = activePeerMenu === peerId;
                  return (
                    <div key={peerId} className="relative">
                      <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 ${hasStream ? "" : "opacity-60"}`}>
                        <div className="h-7 w-7 rounded-full bg-purple-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="text-gray-200 text-sm flex-1 truncate">{name}</span>
                        {peerHands.has(peerId) && <span className="text-yellow-400 text-xs">✋</span>}
                        {peerIsHost && <span className="shrink-0 text-[9px] font-semibold bg-blue-500/90 text-white px-1.5 py-0.5 rounded">Host</span>}
                        {!peerIsHost && peerIsCohost && <span className="shrink-0 text-[9px] font-semibold bg-yellow-500/90 text-white px-1.5 py-0.5 rounded">Co-host</span>}
                        {/* Action menu button — visible to host and co-host */}
                        {isPrivileged && (
                          <button
                            onClick={() => setActivePeerMenu(menuOpen ? null : peerId)}
                            className={`p-1 rounded transition-colors ${menuOpen ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-200 hover:bg-gray-700"}`}
                            title="Participant actions"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {/* Context menu */}
                      {menuOpen && (
                        <div
                          ref={peerMenuRef}
                          className="absolute right-0 top-full mt-1 z-20 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden"
                        >
                          {/* Mute mic — host and co-host */}
                          <button
                            onClick={() => handleMuteParticipant(peerId)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 text-left"
                          >
                            <MicOff className="h-3.5 w-3.5 text-gray-400" /> Mute Mic
                          </button>
                          {/* Turn off camera — host and co-host */}
                          <button
                            onClick={() => handleForceCamOff(peerId)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 text-left"
                          >
                            <VideoOff className="h-3.5 w-3.5 text-gray-400" /> Turn Off Camera
                          </button>
                          {/* Stop screen share — host and co-host, only when sharing */}
                          {remoteStreams.some(r => r.userId === peerId && r.isScreenShare) && (
                            <button
                              onClick={() => handleForceStopShare(peerId)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 text-left"
                            >
                              <Monitor className="h-3.5 w-3.5 text-gray-400" /> Stop Screen Share
                            </button>
                          )}
                          {/* Spotlight — host and co-host */}
                          <button
                            onClick={() => handleSpotlight(peerId)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 text-left"
                          >
                            <Pin className="h-3.5 w-3.5 text-gray-400" /> Spotlight
                          </button>
                          {/* Role management + remove — host only, not targeting another host */}
                          {isHost && !peerIsHost && (
                            <>
                              <div className="border-t border-gray-700" />
                              {peerIsCohost ? (
                                <button
                                  onClick={() => handleRoleChange(peerId, "participant")}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 text-left"
                                >
                                  <Crown className="h-3.5 w-3.5 text-gray-400" /> Remove Co-host
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRoleChange(peerId, "cohost")}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-300 hover:bg-gray-700 text-left"
                                >
                                  <Crown className="h-3.5 w-3.5 text-yellow-400" /> Make Co-host
                                </button>
                              )}
                              <button
                                onClick={() => handleRoleChange(peerId, "host")}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-300 hover:bg-gray-700 text-left"
                              >
                                <Shield className="h-3.5 w-3.5 text-blue-400" /> Make Host
                              </button>
                              <div className="border-t border-gray-700" />
                              <button
                                onClick={() => handleRemoveParticipant(peerId)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/30 text-left"
                              >
                                <UserX className="h-3.5 w-3.5 text-red-400" /> Remove from Meeting
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {chatOpen && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* ── To: recipient picker ──────────────────────────────── */}
                <div className="border-b border-gray-800 px-3 py-2 relative">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 shrink-0">To:</span>
                    <button
                      onClick={() => setShowRecipientPicker(v => !v)}
                      className="flex-1 flex items-center justify-between text-sm bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 text-left transition-colors"
                    >
                      <span className={chatRecipient ? "text-blue-300 font-medium" : "text-white"}>
                        {chatRecipient ? chatRecipient.name : "Everyone"}
                      </span>
                      <span className="text-gray-500 text-xs">▾</span>
                    </button>
                  </div>
                  {showRecipientPicker && (
                    <div className="absolute left-3 right-3 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
                      <button
                        onClick={() => { setChatRecipient(null); setShowRecipientPicker(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${!chatRecipient ? "text-white font-medium" : "text-gray-300"}`}
                      >
                        <Users className="h-4 w-4 text-gray-400" />
                        Everyone
                        {!chatRecipient && <span className="ml-auto text-blue-400 text-xs">✓</span>}
                      </button>
                      <div className="border-t border-gray-700" />
                      {peerIds.map(pid => {
                        const name = peerNames.get(pid) ?? pid;
                        const unread = dmUnread.get(pid) ?? 0;
                        return (
                          <button
                            key={pid}
                            onClick={() => {
                              setChatRecipient({ userId: pid, name });
                              setDmUnread(u => { const next = new Map(u); next.delete(pid); return next; });
                              setShowRecipientPicker(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${chatRecipient?.userId === pid ? "text-white font-medium" : "text-gray-300"}`}
                          >
                            <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold shrink-0">
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate flex-1">{name}</span>
                            {unread > 0 && (
                              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{unread}</span>
                            )}
                            {chatRecipient?.userId === pid && <span className="text-blue-400 text-xs">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Message list (filtered by recipient) ─────────────── */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                  {(() => {
                    const myId = user?.id ?? "local";
                    const filtered = messages.filter(m => {
                      if (!chatRecipient) return !m.recipientId; // Everyone: public only
                      // DM thread: messages between me and the selected peer
                      return (m.recipientId === chatRecipient.userId && m.senderId === myId) ||
                             (m.recipientId === myId && m.senderId === chatRecipient.userId);
                    });
                    if (filtered.length === 0) {
                      return (
                        <p className="text-gray-500 text-sm text-center py-8">
                          {chatRecipient ? `No messages with ${chatRecipient.name} yet` : "No messages yet"}
                        </p>
                      );
                    }
                    return filtered.map((m) => {
                      if (m.isSystem) {
                        return (
                          <div key={m.id} className="flex items-center gap-2 my-1">
                            <div className="flex-1 h-px bg-gray-700/60" />
                            <p className="text-xs text-gray-500 italic text-center shrink-0 px-1">{m.text}</p>
                            <div className="flex-1 h-px bg-gray-700/60" />
                          </div>
                        );
                      }
                      const msgReactions = reactions.get(m.id);
                      const pickerOpen = activePickerMsgId === m.id;
                      const isMe = m.senderId === myId;
                      return (
                        <div key={m.id} className="relative group">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-xs text-gray-500">{m.sender}</p>
                            {m.recipientId && (
                              <span className="text-xs bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded px-1 py-px">
                                {isMe ? `→ ${m.recipientName ?? ""}` : "private"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-start gap-1">
                            <div className={`flex-1 rounded-lg px-3 py-2 ${m.recipientId ? "bg-purple-900/30 border border-purple-700/30" : "bg-gray-800"}`}>
                              <p className="text-gray-200 text-sm">{m.text}</p>
                            </div>
                            <button
                              onClick={() => setActivePickerMsgId(pickerOpen ? null : m.id)}
                              className={`shrink-0 p-1 rounded-lg transition-colors mt-0.5 ${
                                pickerOpen
                                  ? "bg-blue-600/30 text-blue-300"
                                  : "text-gray-600 hover:text-gray-300 hover:bg-gray-700"
                              }`}
                              title="React to message"
                            >
                              <Smile className="h-4 w-4" />
                            </button>
                          </div>

                          {msgReactions && msgReactions.size > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Array.from(msgReactions.entries()).map(([emoji, users]) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReact(m.id, emoji)}
                                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                                    users.has(myId)
                                      ? "bg-blue-600/30 border-blue-500 text-blue-200"
                                      : "bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400"
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="font-medium">{users.size}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {pickerOpen && (
                            <div
                              ref={pickerRef}
                              className="mt-1.5 z-10 flex flex-wrap gap-0.5 bg-gray-900 border border-gray-700 rounded-xl px-2 py-1.5 shadow-lg"
                            >
                              {REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReact(m.id, emoji)}
                                  className="text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 hover:scale-110 transition-all leading-none"
                                  title={emoji}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="p-3 border-t border-gray-800 space-y-2">
                  {/* Emoji grid for inserting into message */}
                  {showInputEmoji && (
                    <div
                      ref={inputEmojiRef}
                      className="bg-gray-800 border border-gray-700 rounded-xl p-2 grid grid-cols-10 gap-0.5"
                    >
                      {INPUT_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => insertEmoji(emoji)}
                          className="text-base w-7 h-7 flex items-center justify-center rounded hover:bg-gray-700 hover:scale-110 transition-all leading-none"
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 overflow-hidden">
                    <button
                      onClick={() => setShowInputEmoji(v => !v)}
                      className={`shrink-0 p-2 rounded-lg transition-colors ${
                        showInputEmoji
                          ? "bg-blue-600/30 text-blue-300"
                          : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                      }`}
                      title="Insert emoji"
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                    <input
                      ref={chatInputRef}
                      className="flex-1 min-w-0 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500"
                      placeholder="Type a message..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendChat()}
                    />
                    <button
                      onClick={sendChat}
                      disabled={!chatInput.trim()}
                      className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                      title="Send message"
                    >
                      <SendHorizonal className="h-4 w-4 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Notes panel ────────────────────────────────────────── */}
            {notesOpen && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Actions bar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
                  <button
                    onClick={handleExportNotes}
                    disabled={meetingNotes.length === 0}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded-lg hover:bg-gray-800"
                    title="Export notes as Markdown"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                  {isHost && (
                    <button
                      onClick={() => generateSummaryMutation.mutate({ id: meetingNumericId })}
                      disabled={generateSummaryMutation.isPending || meetingNotes.length === 0}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-purple-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded-lg hover:bg-purple-900/30 ml-auto"
                      title="Generate AI summary"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {generateSummaryMutation.isPending ? "Thinking…" : "AI Summary"}
                    </button>
                  )}
                </div>

                {/* AI Summary card */}
                {meetingSummary && (
                  <div className="mx-3 mt-3 rounded-xl bg-purple-900/20 border border-purple-700/30 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-purple-300 text-xs font-semibold">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Summary
                    </div>
                    <p className="text-gray-200 text-xs leading-relaxed">{meetingSummary.summary}</p>
                    {Array.isArray(meetingSummary.actionItems) && meetingSummary.actionItems.length > 0 && (
                      <div>
                        <p className="text-purple-300 text-xs font-medium mb-1">Action Items</p>
                        <ul className="space-y-0.5">
                          {(meetingSummary.actionItems as string[]).map((item, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                              <CheckSquare className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(meetingSummary.decisions) && meetingSummary.decisions.length > 0 && (
                      <div>
                        <p className="text-purple-300 text-xs font-medium mb-1">Decisions</p>
                        <ul className="space-y-0.5">
                          {(meetingSummary.decisions as string[]).map((d, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                              <Star className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {meetingNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm gap-2">
                      <FileText className="h-8 w-8 opacity-30" />
                      <span>No notes yet</span>
                    </div>
                  ) : (
                    (meetingNotes as MeetingNote[]).map((note) => {
                      const typeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
                        note: { label: "Note", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", icon: <FileText className="h-3 w-3" /> },
                        action: { label: "Action", color: "bg-orange-500/20 text-orange-300 border-orange-500/30", icon: <CheckSquare className="h-3 w-3" /> },
                        decision: { label: "Decision", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", icon: <Star className="h-3 w-3" /> },
                        highlight: { label: "Highlight", color: "bg-green-500/20 text-green-300 border-green-500/30", icon: <Lightbulb className="h-3 w-3" /> },
                      };
                      const cfg = typeConfig[note.noteType] ?? typeConfig.note;
                      return (
                        <div key={note.id} className="group relative bg-gray-800/60 rounded-xl p-3 space-y-1.5 border border-gray-700/50">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cfg.color}`}>
                              {cfg.icon}{cfg.label}
                            </span>
                            <button
                              onClick={() => deleteNoteMutation.mutate({ id: meetingNumericId, noteId: note.id })}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-all"
                              title="Delete note"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-gray-200 text-sm leading-relaxed">{note.content}</p>
                          <p className="text-gray-500 text-xs">{note.authorName}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Note input */}
                <div className="border-t border-gray-800 p-3 space-y-2">
                  {/* Type selector */}
                  <div className="flex gap-1">
                    {(["note", "action", "decision", "highlight"] as const).map((t) => {
                      const labels: Record<string, string> = { note: "Note", action: "Action", decision: "Decision", highlight: "Highlight" };
                      return (
                        <button
                          key={t}
                          onClick={() => setNoteType(t)}
                          className={`flex-1 text-xs py-1 rounded-lg transition-colors ${noteType === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
                        >
                          {labels[t]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea
                      className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500 resize-none min-h-[3rem] max-h-28"
                      placeholder="Add a note…"
                      value={noteInput}
                      rows={2}
                      onChange={e => setNoteInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(); }}
                    />
                    <button
                      onClick={addNote}
                      disabled={!noteInput.trim() || createNoteMutation.isPending}
                      className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                      title="Save note (⌘+Enter)"
                    >
                      <SendHorizonal className="h-4 w-4 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video & Background settings panel — floats above controls */}
      {showVideoSettings && (
        <VideoSettingsPanel
          selectedBg={virtualBg}
          onBgChange={handleBgChange}
          enhancement={enhancement}
          onEnhancementChange={updateEnhancement}
          onReset={resetEnhancement}
          onClose={() => setShowVideoSettings(false)}
        />
      )}

      {/* Live caption bar — sits above the controls */}
      {captionsOn && (
        <div className="bg-gray-950/95 border-t border-gray-800 px-4 py-2 flex flex-col gap-1.5" style={{ minHeight: editingCaptionId ? "auto" : "3.5rem" }}>
          {captionLines.slice(-3).map(line => {
            const isEditing = editingCaptionId === line.id;
            const isRewrit = rewritingCaptionId === line.id;
            const isSaving = savingCaptionId === line.id;
            return isEditing ? (
              /* ── Inline editor ─────────────────────────────────────── */
              <div key={line.id} className="space-y-1.5 py-1">
                <p className="text-xs text-blue-400 font-medium">{line.sender}:</p>
                <textarea
                  className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-400 outline-none resize-none"
                  value={editingCaptionText}
                  rows={2}
                  autoFocus
                  onChange={e => { setEditingCaptionText(e.target.value); setEditingCaptionDirty(e.target.value !== editingCaptionOriginal); }}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Rewrite */}
                  <button
                    type="button"
                    disabled={isRewrit}
                    onClick={() => handleCaptionRewrite(line.id, editingCaptionText)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-violet-900/50 text-violet-300 border border-violet-700 hover:bg-violet-800/60 disabled:opacity-50 transition-colors"
                  >
                    {isRewrit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {isRewrit ? "Rewriting…" : "Rewrite"}
                  </button>
                  {/* Undo rewrite */}
                  {editingCaptionDirty && (
                    <button
                      type="button"
                      onClick={() => { setEditingCaptionText(editingCaptionOriginal); setEditingCaptionDirty(false); }}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-700 hover:bg-amber-800/50 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Undo
                    </button>
                  )}
                  {/* Save to notes */}
                  <button
                    type="button"
                    disabled={isSaving || !editingCaptionText.trim()}
                    onClick={() => handleCaptionSave(line.id, editingCaptionText)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-green-900/50 text-green-300 border border-green-700 hover:bg-green-800/60 disabled:opacity-50 transition-colors"
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3 w-3" />}
                    {isSaving ? "Saving…" : "Save to Notes"}
                  </button>
                  {/* Cancel */}
                  <button
                    type="button"
                    onClick={() => { setEditingCaptionId(null); setEditingCaptionDirty(false); }}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── Normal line with hover actions ─────────────────────── */
              <div key={line.id} className="group flex items-start gap-2">
                <p className="flex-1 text-sm text-white leading-snug">
                  <span className="text-blue-400 font-medium mr-1.5">{line.sender}:</span>
                  {line.text}
                </p>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                  {/* Edit */}
                  <button
                    type="button"
                    title="Edit caption"
                    onClick={() => handleCaptionEditStart(line)}
                    className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {/* Rewrite */}
                  <button
                    type="button"
                    title="Rewrite with AI"
                    onClick={() => handleCaptionEditAndRewrite(line)}
                    className="p-1 rounded text-gray-500 hover:text-violet-300 hover:bg-violet-900/50 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </button>
                  {/* Quick save (no edit) */}
                  <button
                    type="button"
                    title="Save to Notes"
                    disabled={isSaving}
                    onClick={() => handleCaptionSave(line.id, line.text)}
                    className="p-1 rounded text-gray-500 hover:text-green-300 hover:bg-green-900/50 disabled:opacity-50 transition-colors"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
          {interimText && (
            <p className="text-sm text-gray-400 italic leading-snug">{interimText}</p>
          )}
          {captionLines.length === 0 && !interimText && (
            <p className="text-xs text-gray-600 italic">Listening for speech…</p>
          )}
        </div>
      )}

      {/* Controls bar */}
      <div className={`flex items-center justify-between px-4 py-4 bg-gray-900 border-t border-gray-800 flex-wrap gap-2 transition-all ${hideFloatingControls ? "opacity-0 pointer-events-none h-0 py-0 overflow-hidden border-0" : ""}`}>
        <div className="flex items-center gap-1">
          <button onClick={() => setMicOn(!micOn)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${micOn ? "bg-gray-800 hover:bg-gray-700" : "bg-red-600/20"}`}>
            {micOn ? <Mic className="h-5 w-5 text-white" /> : <MicOff className="h-5 w-5 text-red-400" />}
            <span className="text-xs text-gray-400">{micOn ? "Mute" : "Unmute"}</span>
          </button>
          <button onClick={() => setVideoOn(!videoOn)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${videoOn ? "bg-gray-800 hover:bg-gray-700" : "bg-red-600/20"}`}>
            {videoOn ? <Video className="h-5 w-5 text-white" /> : <VideoOff className="h-5 w-5 text-red-400" />}
            <span className="text-xs text-gray-400">{videoOn ? "Stop Video" : "Start Video"}</span>
          </button>
          <button
            onClick={() => setShowVideoSettings((v) => !v)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors relative ${
              virtualBg || anyEnhancementActive ? "bg-blue-600/20" : "bg-gray-800 hover:bg-gray-700"
            } ${showVideoSettings ? "ring-2 ring-blue-500/40" : ""}`}
            title="Background & video effects"
          >
            {vbLoading
              ? <div className="h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              : (virtualBg || anyEnhancementActive)
                ? <SlidersHorizontal className="h-5 w-5 text-blue-400" />
                : <Wand2 className="h-5 w-5 text-white" />
            }
            <span className="text-xs text-gray-400">
              {virtualBg || anyEnhancementActive ? "Effects" : "Background"}
            </span>
          </button>
          {meeting?.allowScreenShare && (
            <div className="flex items-center gap-1.5 relative group">
              <button onClick={handleScreenShare}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${sharing ? "bg-green-600/30" : "bg-gray-800 hover:bg-gray-700"}`}>
                <Monitor className={`h-5 w-5 ${sharing ? "text-green-400" : "text-white"}`} />
                <span className="text-xs text-gray-400">{sharing ? "Stop Share" : "Share"}</span>
              </button>
              {/* Tooltip — shown on hover when NOT in Electron and not already sharing */}
              {!isElectronHost && !sharing && (
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover:block z-50 w-56">
                  <div className="bg-gray-900 border border-amber-600/50 rounded-xl px-3 py-2.5 shadow-2xl">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-200 leading-snug">
                        <span className="text-amber-300 font-semibold">Desktop app required</span> to let others control your screen.{" "}
                        <a
                          href="/download"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pointer-events-auto text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          Download TanCom Desktop
                        </a>
                        {" "}<span className="text-gray-400 text-[10px] block mt-1">In Desktop: press F12 → Console → type <code>window.electronRC</code></span>
                      </p>
                    </div>
                  </div>
                  {/* Arrow */}
                  <div className="flex justify-center">
                    <div className="w-2.5 h-2.5 bg-gray-900 border-b border-r border-amber-600/50 rotate-45 -mt-[5px]" />
                  </div>
                </div>
              )}
              {sharing && sharingDisplayLabel && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600/20 border border-green-500/30 max-w-[140px]">
                  <span className="text-xs text-green-300 truncate leading-tight">{sharingDisplayLabel}</span>
                  <button
                    onClick={() => setSharingDisplayLabel(null)}
                    className="shrink-0 text-green-400/60 hover:text-green-300 transition-colors"
                    title="Dismiss"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Cameras PiP re-open — shown when panel was manually closed */}
          {(showSelfCamPip || (chatOpen && !anyoneSharing)) && !showPip && (
            <button onClick={() => { setShowPip(true); setFloatMinimized(false); }}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors bg-gray-800 hover:bg-gray-700">
              <Users className="h-5 w-5 text-white" />
              <span className="text-xs text-gray-400">Cameras</span>
            </button>
          )}
          {/* Request Control — visible to viewers when someone is sharing */}
          {screenShareRemote && !haveControl && !sharing && !myRcRequestPending && (
            <button onClick={handleRequestControl}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors bg-gray-800 hover:bg-gray-700">
              <MousePointer2 className="h-5 w-5 text-white" />
              <span className="text-xs text-gray-400">Control</span>
            </button>
          )}
          {/* Pending control request indicator in toolbar */}
          {screenShareRemote && !haveControl && !sharing && myRcRequestPending && (
            <button
              onClick={handleCancelRequest}
              title="Cancel control request"
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors group"
            >
              <div className="relative">
                <Loader2 className="h-5 w-5 text-yellow-400 animate-spin group-hover:opacity-0 transition-opacity" />
                <X className="h-5 w-5 text-yellow-400 absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs text-yellow-300">Waiting…</span>
            </button>
          )}
          {/* Release remote control — visible to the controller */}
          {haveControl && (
            <button onClick={handleRevoke}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors bg-orange-500/20 hover:bg-orange-500/40">
              <MousePointer2 className="h-5 w-5 text-orange-400" />
              <span className="text-xs text-orange-300">Release</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => { const next = !handRaised; setHandRaised(next); sendHandRaise(next); }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${handRaised ? "bg-yellow-500/20" : "bg-gray-800 hover:bg-gray-700"}`}>
            <Hand className={`h-5 w-5 ${handRaised ? "text-yellow-400" : "text-white"}`} />
            <span className="text-xs text-gray-400">Hand</span>
          </button>
          <button onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setParticipantsOpen(false); }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors relative ${chatOpen ? "bg-blue-600/30" : "bg-gray-800 hover:bg-gray-700"}`}>
            <MessageSquare className={`h-5 w-5 ${chatOpen ? "text-blue-400" : "text-white"}`} />
            <span className="text-xs text-gray-400">Chat</span>
            {(() => { const total = Array.from(dmUnread.values()).reduce((a, b) => a + b, 0); return total > 0 ? (
              <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold leading-none">{total > 9 ? "9+" : total}</span>
            ) : null; })()}
          </button>
          <button onClick={() => { setParticipantsOpen(!participantsOpen); if (!participantsOpen) { setChatOpen(false); setNotesOpen(false); } }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${participantsOpen ? "bg-blue-600/30" : "bg-gray-800 hover:bg-gray-700"}`}>
            <Users className={`h-5 w-5 ${participantsOpen ? "text-blue-400" : "text-white"}`} />
            <span className="text-xs text-gray-400">Participants</span>
          </button>
          <button onClick={() => { setNotesOpen(v => !v); if (!notesOpen) { setChatOpen(false); setParticipantsOpen(false); } }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${notesOpen ? "bg-blue-600/30" : "bg-gray-800 hover:bg-gray-700"}`}>
            <FileText className={`h-5 w-5 ${notesOpen ? "text-blue-400" : "text-white"}`} />
            <span className="text-xs text-gray-400">Notes</span>
          </button>
          {/* Live Captions toggle */}
          {captionsSupported && (
            <button
              onClick={handleCaptionsToggle}
              title={captionsOn ? "Turn off captions" : "Turn on captions"}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${captionsOn ? "bg-blue-600/30" : "bg-gray-800 hover:bg-gray-700"}`}
            >
              <Captions className={`h-5 w-5 ${captionsOn ? "text-blue-400" : "text-white"}`} />
              <span className="text-xs text-gray-400">Captions</span>
            </button>
          )}
          {/* Record & Lock — host only */}
          {isHost && (
            <>
              <button onClick={handleRecord} aria-pressed={isRecording} aria-label={isRecording ? "Stop recording" : "Start recording"}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${isRecording ? "bg-red-600/30" : "bg-gray-800 hover:bg-gray-700"}`}>
                <div className="h-5 w-5 flex items-center justify-center">
                  <div className={`h-3 w-3 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-white"}`} />
                </div>
                <span className="text-xs text-gray-400">{isRecording ? "Stop Rec" : "Record"}</span>
              </button>
              {isRecording && (
                <button onClick={handlePauseResume}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${isPaused ? "bg-yellow-500/20" : "bg-gray-800 hover:bg-gray-700"}`}>
                  {isPaused
                    ? <Play className="h-5 w-5 text-yellow-400" />
                    : <Pause className="h-5 w-5 text-white" />
                  }
                  <span className="text-xs text-gray-400">{isPaused ? "Resume" : "Pause"}</span>
                </button>
              )}
              <button onClick={() => meeting && lockMutation.mutate({ id: meeting.id, data: { locked: !meeting.isLocked } })}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors">
                {meeting?.isLocked ? <Unlock className="h-5 w-5 text-white" /> : <Lock className="h-5 w-5 text-white" />}
                <span className="text-xs text-gray-400">{meeting?.isLocked ? "Unlock" : "Lock"}</span>
              </button>
            </>
          )}
          {/* Co-host badge in controls bar */}
          {!isHost && myRole === "cohost" && (
            <div className="flex flex-col items-center gap-1 px-3 py-2">
              <Crown className="h-5 w-5 text-yellow-400" />
              <span className="text-xs text-yellow-400">Co-host</span>
            </div>
          )}

          {/* ── More menu ──────────────────────────────────────────────────── */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${showMoreMenu ? "bg-blue-600/30" : "bg-gray-800 hover:bg-gray-700"}`}
              title="More options"
            >
              <MoreHorizontal className={`h-5 w-5 ${showMoreMenu ? "text-blue-400" : "text-white"}`} />
              <span className="text-xs text-gray-400">More</span>
            </button>

            {showMoreMenu && (
              <div className="absolute bottom-full right-0 mb-2 z-50 w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
                {/* Group 1 */}
                <button
                  onClick={() => { setShowMoreMenu(false); setChatOpen(false); setParticipantsOpen(false); setNotesOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                >
                  <Layers className="h-4 w-4 text-gray-400 shrink-0" /> Show meeting windows
                </button>

                <div className="border-t border-gray-800 my-1" />

                {/* Group 2 */}
                {isHost && (
                  <>
                    <button
                      onClick={() => { setShowMoreMenu(false); setShowBreakoutRooms(true); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                    >
                      <Columns className="h-4 w-4 text-gray-400 shrink-0" /> Breakout rooms
                    </button>
                    <button
                      onClick={() => { setShowMoreMenu(false); setShowPolls(true); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                    >
                      <BarChart2 className="h-4 w-4 text-gray-400 shrink-0" /> Polls
                    </button>
                  </>
                )}

                <div className="border-t border-gray-800 my-1" />

                {/* Group 3 — annotation */}
                {isHost && (
                  <>
                    <button
                      onClick={() => { setAnnotationDisabled(v => !v); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                    >
                      <PenLine className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="flex-1">{annotationDisabled ? "Enable annotation for others" : "Disable annotation for others"}</span>
                      {annotationDisabled && <span className="text-xs text-blue-400 font-medium">On</span>}
                    </button>
                    <button
                      onClick={() => { setHideAnnotatorNames(v => !v); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                    >
                      <UserMinus className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="flex-1">Hide names of annotators</span>
                      {hideAnnotatorNames && <span className="text-xs text-blue-400 font-medium">On</span>}
                    </button>
                  </>
                )}

                <div className="border-t border-gray-800 my-1" />

                {/* Group 4 — view */}
                <button
                  onClick={() => { setHideVideoPanel(v => !v); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                >
                  {hideVideoPanel ? <Eye className="h-4 w-4 text-gray-400 shrink-0" /> : <EyeOff className="h-4 w-4 text-gray-400 shrink-0" />}
                  <span className="flex-1">{hideVideoPanel ? "Show video panel" : "Hide video panel"}</span>
                  {hideVideoPanel && <span className="text-xs text-blue-400 font-medium">Hidden</span>}
                </button>
                <button
                  onClick={() => { setHideFloatingControls(v => !v); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                >
                  <PanelBottomClose className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="flex-1">Hide floating meeting controls</span>
                  <span className="text-xs text-gray-500 font-mono">Ctrl+Alt+Shift+H</span>
                </button>

                <div className="border-t border-gray-800 my-1" />

                {/* Group 5 — audio/video quality */}
                <button
                  onClick={() => {
                    setShareComputerSound(v => !v);
                    setShowMoreMenu(false);
                    if (sharing) {
                      toast({ title: "Share computer sound", description: "Stop sharing and start again to apply this.", duration: 3000 });
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                >
                  <Volume2 className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="flex-1">Share computer sound</span>
                  {shareComputerSound && <span className="text-xs text-blue-400 font-medium">On</span>}
                </button>
                <button
                  onClick={() => {
                    const turningOn = !optimizeForVideoClip;
                    setOptimizeForVideoClip(turningOn);
                    setShowMoreMenu(false);
                    toast({
                      title: turningOn ? "Optimized for video clip" : "Optimize for video clip disabled",
                      description: sharing
                        ? "Stop sharing and start again to apply this."
                        : turningOn
                          ? "The next share uses a higher frame rate for motion."
                          : "The next share favors sharp text.",
                      duration: 3000,
                    });
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 text-left"
                >
                  <Video className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="flex-1">Optimize for video clip</span>
                  {optimizeForVideoClip && <span className="text-xs text-blue-400 font-medium">On</span>}
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          {isHost ? (
            <Button variant="destructive" className="gap-2 bg-red-600 hover:bg-red-700" onClick={() => setLeaveDialogOpen(true)} disabled={endMutation.isPending}>
              <Phone className="h-4 w-4 rotate-135" /> End Meeting
            </Button>
          ) : (
            <Button variant="destructive" className="gap-2 bg-red-600 hover:bg-red-700" onClick={() => setLeaveDialogOpen(true)}>
              <Phone className="h-4 w-4 rotate-135" /> Leave
            </Button>
          )}
        </div>
      </div>

      {/* Rename dialog */}
      <AlertDialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <AlertDialogContent className="bg-gray-900 border border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Change your name</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This name will be visible to everyone in the meeting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 text-sm"
            placeholder="Your name"
            value={renameInput}
            onChange={e => setRenameInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleRename()}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleRename}
              disabled={!renameInput.trim()}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Floating PiP camera panel — shown during self-cam share or when chat is open ── */}
      {showPip && (showSelfCamPip || (chatOpen && !anyoneSharing)) && (
        <div
          ref={floatPanelRef}
          style={
            floatMaximized
              ? { position: "fixed", left: "5%", top: "10%", width: "90%", height: "80%", zIndex: 9999 }
              : { position: "fixed", left: floatPos.left, top: floatPos.top, zIndex: 9999, width: 320, minWidth: 220, minHeight: 120, resize: "both" }
          }
          className="bg-gray-900/97 backdrop-blur-md border border-gray-700 rounded-2xl shadow-2xl overflow-hidden select-none"
        >
          {/* Header — drag handle (disabled when maximized) */}
          <div
            onMouseDown={floatMaximized ? undefined : startFloatDrag}
            className={`flex items-center justify-between px-3 py-2 bg-gray-800/90 border-b border-gray-700/60 ${floatMaximized ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
          >
            <div className="flex items-center gap-2">
              {/* macOS-style traffic dots */}
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs font-semibold text-gray-200 ml-1">
                {showSelfCamPip ? "Your Camera" : "Participants"}
              </span>
              {!showSelfCamPip && (
                <span className="text-xs text-gray-500 font-mono">({1 + cameraRemotes.length})</span>
              )}
            </div>
            <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()}>
              {/* Minimize */}
              {!floatMaximized && (
                <button
                  onClick={() => { setFloatMinimized(v => !v); }}
                  className="p-1 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                  title={floatMinimized ? "Expand" : "Minimize"}
                >
                  {floatMinimized
                    ? <ChevronUp className="h-3.5 w-3.5" />
                    : <Minus className="h-3.5 w-3.5" />}
                </button>
              )}
              {/* Maximize / Restore */}
              <button
                onClick={() => { setFloatMaximized(v => !v); setFloatMinimized(false); }}
                className="p-1 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                title={floatMaximized ? "Restore" : "Maximize"}
              >
                {floatMaximized
                  ? <Minimize2 className="h-3.5 w-3.5" />
                  : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              {/* Close PiP */}
              <button
                onClick={() => { setShowPip(false); setFloatMaximized(false); setFloatMinimized(false); }}
                className="p-1 rounded-md hover:bg-red-700/60 text-gray-400 hover:text-white transition-colors"
                title="Close cameras panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Video tiles */}
          {!floatMinimized && (
            floatMaximized ? (
              /* Maximized: grid layout */
              <div
                className="p-3 overflow-y-auto h-full"
                style={{ maxHeight: "calc(100% - 40px)", scrollbarWidth: "thin" }}
              >
                <div className={`grid gap-3 ${
                  showSelfCamPip || (1 + cameraRemotes.length) === 1 ? "grid-cols-1"
                  : (1 + cameraRemotes.length) <= 4 ? "grid-cols-2"
                  : (1 + cameraRemotes.length) <= 9 ? "grid-cols-3"
                  : "grid-cols-4"
                }`}>
                  {/* Local camera tile */}
                  <div className="rounded-xl overflow-hidden aspect-video">
                    <LocalVideoTile
                      displayName={localDisplayName}
                      stream={activeStream}
                      screenStream={null}
                      videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost}
                      sharing={false} controllerPointer={null} isBeingControlled={false}
                      fill compact
                    />
                  </div>
                  {/* Remote camera tiles — hidden in self-cam PiP mode (they live in the side strip) */}
                  {!showSelfCamPip && cameraRemotes.map((remote, i) => {
                    const name = peerNames.get(remote.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(remote.userId))?.displayName ?? remote.userId.slice(0, 8);
                    return (
                      <div key={remote.userId} className="rounded-xl overflow-hidden aspect-video">
                        <RemoteVideoTile
                          remote={remote} displayName={name}
                          isHost={isHostLiveKitId(remote.userId, meeting?.hostClerkId)}
                          handRaised={peerHands.has(remote.userId)} index={i + 1}
                          connectionState={peerConnectionStates.get(remote.userId)}
                          haveControl={false} controllerPointer={null}
                          localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent}
                          fill compact
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Normal: horizontal scrollable row */
              <div
                className="flex gap-2 p-2 overflow-x-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {/* Local camera */}
                <div className="shrink-0 rounded-xl overflow-hidden" style={{ width: 148, height: 111 }}>
                  <LocalVideoTile
                    displayName={localDisplayName}
                    stream={activeStream}
                    screenStream={null}
                    videoOn={videoOn} micOn={micOn} handRaised={handRaised} isHost={isHost}
                    sharing={false} controllerPointer={null} isBeingControlled={false}
                    fill compact
                  />
                </div>
                {/* Remote camera tiles — hidden in self-cam PiP mode (they live in the side strip) */}
                {!showSelfCamPip && cameraRemotes.map((remote, i) => {
                  const name = peerNames.get(remote.userId) ?? admitted.find(p => p.clerkId === clerkIdFromLiveKitId(remote.userId))?.displayName ?? remote.userId.slice(0, 8);
                  return (
                    <div key={remote.userId} className="shrink-0 rounded-xl overflow-hidden" style={{ width: 148, height: 111 }}>
                      <RemoteVideoTile
                        remote={remote} displayName={name}
                        isHost={isHostLiveKitId(remote.userId, meeting?.hostClerkId)}
                        handRaised={peerHands.has(remote.userId)} index={i + 1}
                        connectionState={peerConnectionStates.get(remote.userId)}
                        haveControl={false} controllerPointer={null}
                        localDisplayName={localDisplayName} onRequestControl={handleRequestControl} onCancelRequest={handleCancelRequest} rcRequestPending={myRcRequestPending} onPointerMove={sendPointerEvent}
                        fill compact
                      />
                    </div>
                  );
                })}
                {!showSelfCamPip && cameraRemotes.length === 0 && (
                  <div className="flex items-center justify-center text-gray-500 text-xs px-4 py-2">
                    No other participants yet
                  </div>
                )}
              </div>
            )
          )}

          {/* Minimized hint */}
          {floatMinimized && (
            <div className="px-4 py-2 text-xs text-gray-500 text-center">
              {showSelfCamPip
                ? (videoOn ? "Camera on" : "Camera off")
                : cameraRemotes.length === 0
                  ? "No other participants"
                  : `${cameraRemotes.length} participant${cameraRemotes.length !== 1 ? "s" : ""} in call`}
            </div>
          )}
        </div>
      )}

      {/* ── Breakout Rooms Modal ──────────────────────────────────────────────── */}
      {showBreakoutRooms && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Columns className="h-4 w-4 text-blue-400" />
                <h2 className="text-white font-semibold">Breakout Rooms</h2>
              </div>
              <button onClick={() => setShowBreakoutRooms(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {breakoutRoomsCreated.length === 0 ? (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Number of rooms</label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setBreakoutRoomCount(v => Math.max(1, v - 1))} className="h-8 w-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center font-bold">−</button>
                      <span className="text-white font-semibold text-lg w-8 text-center">{breakoutRoomCount}</span>
                      <button onClick={() => setBreakoutRoomCount(v => Math.min(50, v + 1))} className="h-8 w-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center font-bold">+</button>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const rooms = Array.from({ length: breakoutRoomCount }, (_, i) => ({ id: `room-${i + 1}`, name: `Room ${i + 1}` }));
                      setBreakoutRoomsCreated(rooms);
                      toast({ title: `${breakoutRoomCount} breakout room${breakoutRoomCount !== 1 ? "s" : ""} created`, description: "Participants can now be assigned to rooms.", duration: 3000 });
                    }}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors"
                  >
                    Create Rooms
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {breakoutRoomsCreated.map((room) => (
                      <div key={room.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-400" />
                          <span className="text-white text-sm font-medium">{room.name}</span>
                        </div>
                        <span className="text-gray-500 text-xs">0 participants</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setBreakoutRoomsCreated([]); toast({ title: "Breakout rooms closed", duration: 2000 }); }}
                      className="flex-1 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-400 font-medium text-sm transition-colors"
                    >
                      Close All Rooms
                    </button>
                    <button
                      onClick={() => toast({ title: "All participants opened", description: "Sent join invitation to all participants.", duration: 2000 })}
                      className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors"
                    >
                      Open All Rooms
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Polls Modal ────────────────────────────────────────────────────────── */}
      {showPolls && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-400" />
                <h2 className="text-white font-semibold">Polls</h2>
                {pollLive && <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-medium animate-pulse">Live</span>}
              </div>
              <button onClick={() => setShowPolls(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!pollLive ? (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5 font-medium">Question</label>
                    <input
                      className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
                      placeholder="Ask your question…"
                      value={pollQuestion}
                      onChange={e => setPollQuestion(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5 font-medium">Options</label>
                    <div className="space-y-2">
                      {pollOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
                            placeholder={`Option ${i + 1}`}
                            value={opt}
                            onChange={e => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next); }}
                          />
                          {pollOptions.length > 2 && (
                            <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {pollOptions.length < 6 && (
                      <button onClick={() => setPollOptions([...pollOptions, ""])} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                        + Add option
                      </button>
                    )}
                  </div>
                  <button
                    disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                    onClick={() => { setPollLive(true); setPollVotes({}); setMyPollVote(null); toast({ title: "Poll launched!", description: "Participants can now vote.", duration: 3000 }); }}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                  >
                    Launch Poll
                  </button>
                </>
              ) : (
                <>
                  <p className="text-white font-medium text-sm">{pollQuestion}</p>
                  <div className="space-y-2">
                    {pollOptions.filter(o => o.trim()).map((opt, i) => {
                      const totalVotes = Object.values(pollVotes).reduce((a, b) => a + b, 0);
                      const count = pollVotes[i] ?? 0;
                      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            if (myPollVote !== null) return;
                            setMyPollVote(i);
                            setPollVotes(v => ({ ...v, [i]: (v[i] ?? 0) + 1 }));
                          }}
                          className={`w-full text-left relative overflow-hidden rounded-xl border px-4 py-2.5 text-sm transition-colors ${myPollVote === i ? "border-blue-500 text-blue-300" : myPollVote !== null ? "border-gray-700 text-gray-400" : "border-gray-700 text-gray-200 hover:border-gray-600"}`}
                        >
                          <div className="absolute inset-0 bg-blue-600/20 transition-all" style={{ width: `${pct}%` }} />
                          <div className="relative flex items-center justify-between">
                            <span>{opt}</span>
                            <span className="text-xs text-gray-400">{count} vote{count !== 1 ? "s" : ""} ({pct}%)</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => { setPollLive(false); setPollQuestion(""); setPollOptions(["Option A", "Option B"]); toast({ title: "Poll ended", duration: 2000 }); }}
                    className="w-full py-2 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-400 font-medium text-sm transition-colors"
                  >
                    End Poll
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leave / End confirmation dialog */}
      {/* ── Caption close-with-unsaved-edits confirmation ──────────────────────── */}
      <AlertDialog open={showCaptionCloseConfirm} onOpenChange={setShowCaptionCloseConfirm}>
        <AlertDialogContent className="bg-gray-900 border border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Save caption before closing?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              You have unsaved edits to a caption. Would you like to save them to your meeting notes before turning off captions?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white"
              onClick={() => { setEditingCaptionId(null); setEditingCaptionDirty(false); setCaptionsOn(false); setShowCaptionCloseConfirm(false); }}
            >
              Discard &amp; Close
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-500 text-white"
              onClick={async () => {
                setShowCaptionCloseConfirm(false);
                if (editingCaptionId) await handleCaptionSave(editingCaptionId, editingCaptionText);
                setCaptionsOn(false);
              }}
            >
              Save &amp; Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent className="bg-gray-900 border border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {isHost ? "End the meeting?" : "Leave the meeting?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {isHost
                ? "This will end the meeting for everyone. All participants will be disconnected."
                : "Are you sure you want to leave the meeting?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white">
              Stay in Meeting
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={isHost ? handleEnd : handleLeave}
            >
              {isHost ? "End for Everyone" : "Leave Meeting"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Save Recording Dialog ────────────────────────────────────────── */}
      {saveRecordingBlob && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-700 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                <Download className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-base">Save Recording</h2>
                <p className="text-gray-400 text-xs mt-0.5">
                  {(saveRecordingBlob.size / 1024 / 1024).toFixed(1)} MB · WebM video
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Filename</label>
              <input
                type="text"
                value={saveRecordingFilename}
                onChange={e => setSaveRecordingFilename(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveRecording()}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
                spellCheck={false}
              />
              <p className="text-gray-500 text-xs mt-1">.webm will be appended automatically</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveRecording}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
              >
                <Download className="h-4 w-4" />
                Save to PC
              </button>
              <button
                onClick={() => setSaveRecordingBlob(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Electron screen-share source picker ──────────────────────────── */}
      {screenPickerSources !== null && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-white font-semibold text-lg">Choose what to share</h2>
              <button
                onClick={handleScreenPickerCancel}
                className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
                aria-label="Cancel"
              >
                ×
              </button>
            </div>
            {screenPickerSources.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12 text-gray-400 text-sm">
                No screens or windows found.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                {/* Screens first, then windows */}
                {[
                  { label: "Screens", items: screenPickerSources.filter(s => s.id.startsWith("screen:")) },
                  { label: "Windows", items: screenPickerSources.filter(s => !s.id.startsWith("screen:")) },
                ].map(({ label, items }) =>
                  items.length === 0 ? null : (
                    <div key={label} className="mb-4">
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 px-1">{label}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {items.map((src) => (
                          <button
                            key={src.id}
                            onClick={() => handleScreenPickerSelect(src.id)}
                            className="group flex flex-col rounded-xl overflow-hidden border border-gray-700 hover:border-blue-500 bg-gray-800 hover:bg-gray-750 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <div className="w-full aspect-video bg-gray-950 overflow-hidden">
                              {src.thumbnail ? (
                                <img
                                  src={src.thumbnail}
                                  alt={src.name}
                                  className="w-full h-full object-contain"
                                  draggable={false}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No preview</div>
                              )}
                            </div>
                            <div className="px-2 py-1.5 text-left">
                              <p className="text-white text-xs font-medium truncate group-hover:text-blue-300 transition-colors">{src.name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={handleScreenPickerCancel}
                className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </VideoEnhancementContext.Provider>
  );
}
