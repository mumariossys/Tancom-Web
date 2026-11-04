import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Video, VideoOff, Mic, MicOff, Phone, Lock, Clock,
  Users, ArrowLeft, AlertTriangle, Wand2, UserX,
} from "lucide-react";
import {
  getMeetingByCode, getGetMeetingByCodeQueryKey, useJoinMeeting,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { format } from "date-fns";
import VerificationGate from "@/components/VerificationGate";
import {
  useVirtualBackground, getSavedBackground, saveBackground, type VirtualBg,
} from "@/hooks/useVirtualBackground";
import VirtualBackgroundPicker from "@/components/VirtualBackgroundPicker";
import { cameraStore } from "@/lib/cameraStore";
import { useVideoEnhancement } from "@/hooks/useVideoEnhancement";

export default function PreJoinLobbyPage() {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState(user?.fullName ?? "");
  const [passcode, setPasscode] = useState("");
  const [videoOn, setVideoOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraError, setCameraError] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [virtualBg, setVirtualBg] = useState<VirtualBg>(getSavedBackground);

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handedOffRef = useRef(false);   // set true when stream is passed to MeetingRoom
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraErrorType, setCameraErrorType] = useState<"denied" | "notfound" | "inuse" | "insecure" | "unknown" | null>(null);
  const [audioOnlyFallback, setAudioOnlyFallback] = useState(false);

  // Acquire camera + mic with granular error reporting + audio-only fallback
  useEffect(() => {
    let active = true;

    if (!window.isSecureContext) {
      setCameraError(true);
      setCameraErrorType("insecure");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setCameraStream(stream);
        setHasPermission(true);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const name = err instanceof DOMException ? err.name : "";
        let kind: "denied" | "notfound" | "inuse" | "insecure" | "unknown" = "unknown";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") kind = "denied";
        else if (name === "NotFoundError" || name === "DevicesNotFoundError") kind = "notfound";
        else if (name === "NotReadableError" || name === "TrackStartError") kind = "inuse";
        else if (name === "SecurityError") kind = "insecure";
        setCameraError(true);
        setCameraErrorType(kind);
        // Attempt audio-only fallback so they can still join
        navigator.mediaDevices
          .getUserMedia({ video: false, audio: true })
          .then((audioStream) => {
            if (!active) { audioStream.getTracks().forEach((t) => t.stop()); return; }
            streamRef.current = audioStream;
            setCameraStream(audioStream);
            setAudioOnlyFallback(true);
            setHasPermission(true);
          })
          .catch(() => { /* mic also denied — join silently */ });
      });

    return () => {
      active = false;
      // Do NOT stop tracks if they were handed off to MeetingRoom — stopping
      // them here kills the stream that MeetingRoom is about to use.
      if (!handedOffRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      setCameraStream(null);
    };
  }, []);

  // Toggle tracks on the raw camera stream
  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = videoOn; });
  }, [videoOn]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = micOn; });
  }, [micOn]);

  // Virtual background processing
  const { processedStream, isLoading: vbLoading } = useVirtualBackground({
    cameraStream,
    background: virtualBg,
  });

  // Video enhancement settings — mirror, low-light, touch-up, brightness, contrast.
  // Reads from localStorage so settings persist from one meeting to the next.
  const { cssFilter, cssTransform } = useVideoEnhancement();

  // Point the video preview at the processed stream (or raw camera if no VB)
  const previewStream = processedStream ?? cameraStream;
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = previewStream ?? null;
  }, [previewStream]);

  const handleBgChange = (bg: VirtualBg) => {
    setVirtualBg(bg);
    saveBackground(bg);
  };

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: getGetMeetingByCodeQueryKey(meetingCode),
    queryFn: () => getMeetingByCode(meetingCode),
    enabled: !!meetingCode,
  });

  const joinMutation = useJoinMeeting({
    mutation: {
      onSuccess: () => setLocation(`/room/${meetingCode}`),
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        const isFull = message.toLowerCase().includes("full") || message.toLowerCase().includes("max");
        toast({
          title: isFull ? "Meeting is full" : "Failed to join meeting",
          description: isFull
            ? "This meeting has reached its maximum number of participants."
            : (message || "Please check your passcode and try again."),
          variant: "destructive",
        });
      },
    },
  });

  const handleJoin = () => {
    if (!meeting || !displayName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }
    // Hand the raw camera stream to MeetingRoom so it never has to re-acquire
    // it. This avoids the NotReadableError race condition on camera takeover.
    if (streamRef.current) {
      cameraStore.set(streamRef.current);
      handedOffRef.current = true; // prevent cleanup from stopping these tracks
    }
    joinMutation.mutate({
      id: meeting.id,
      data: {
        displayName: displayName.trim(),
        passcode: meeting.isPasswordProtected ? passcode : undefined,
        clerkId: user?.id ?? undefined,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-6 w-48 mx-auto" />
            <Skeleton className="h-4 w-32 mx-auto" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Meeting Not Found</h2>
            <p className="text-gray-500 mb-4">
              The meeting code <span className="font-mono font-medium">{meetingCode}</span> doesn't exist or has expired.
            </p>
            <Link href="/dashboard"><Button>Go to Dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isHost = !!user?.id && user.id === meeting.hostClerkId;

  if (meeting.isLocked && !isHost) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Meeting Locked</h2>
            <p className="text-gray-500 mb-4">The host has locked this meeting. No new participants can join.</p>
            <Link href="/dashboard"><Button variant="outline">Go to Dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Proactive capacity gate — shown before the user tries to click Join.
  // Hosts always bypass this check (they can never be blocked by capacity).
  const isFull = !isHost &&
    !!meeting.maxParticipants &&
    meeting.participantCount >= meeting.maxParticipants;
  if (isFull) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <UserX className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Meeting is Full</h2>
            <p className="text-gray-500 mb-1">
              This meeting has reached its maximum of{" "}
              <strong>{meeting.maxParticipants}</strong> participant{meeting.maxParticipants !== 1 ? "s" : ""}.
            </p>
            <p className="text-gray-400 text-sm mb-6">
              No new participants can join until someone leaves. Contact the host if you need access.
            </p>
            <Link href="/dashboard"><Button variant="outline">Go to Dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <VerificationGate>
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-6">
        {/* Camera preview + controls */}
        <div className="flex-1">
          {/* Preview */}
          <div className="rounded-2xl bg-gray-800 overflow-hidden aspect-video flex items-center justify-center relative">
            {cameraError ? (
              <div className="text-center text-gray-500 px-6">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-yellow-500" />
                {cameraErrorType === "denied" && (
                  <>
                    <p className="text-white font-medium mb-1">Camera permission blocked</p>
                    <p className="text-gray-400 text-sm mb-2">
                      Click the camera icon in your browser's address bar and choose <strong className="text-gray-200">Allow</strong>, then refresh.
                    </p>
                  </>
                )}
                {cameraErrorType === "notfound" && (
                  <>
                    <p className="text-white font-medium mb-1">No camera detected</p>
                    <p className="text-gray-400 text-sm mb-2">
                      No camera was found on this device. You can still join with audio only.
                    </p>
                  </>
                )}
                {cameraErrorType === "inuse" && (
                  <>
                    <p className="text-white font-medium mb-1">Camera in use by another app</p>
                    <p className="text-gray-400 text-sm mb-2">
                      Close any other apps or browser tabs using your camera, then refresh.
                    </p>
                  </>
                )}
                {cameraErrorType === "insecure" && (
                  <>
                    <p className="text-white font-medium mb-1">Camera requires HTTPS</p>
                    <p className="text-gray-400 text-sm mb-2">
                      Camera access requires a secure connection. Make sure you're visiting the site via <strong className="text-gray-200">https://</strong>.
                    </p>
                  </>
                )}
                {(cameraErrorType === "unknown" || !cameraErrorType) && (
                  <>
                    <p className="text-white font-medium mb-1">Camera unavailable</p>
                    <p className="text-gray-400 text-sm mb-2">
                      Could not access your camera or microphone. Check browser permissions and try refreshing.
                    </p>
                  </>
                )}
                {audioOnlyFallback && (
                  <p className="text-green-400 text-xs mt-1 flex items-center justify-center gap-1">
                    <span>✓</span> Microphone acquired — you can join audio-only
                  </p>
                )}
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  disablePictureInPicture
                  className={`w-full h-full object-cover ${!videoOn || !hasPermission ? "hidden" : ""}`}
                  style={{
                    willChange: "transform",
                    backfaceVisibility: "hidden",
                    ...(cssFilter || cssTransform ? {
                      filter: cssFilter || undefined,
                      transform: cssTransform || undefined,
                    } : {}),
                  }}
                />
                {(!videoOn || !hasPermission) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    {videoOn && !hasPermission ? (
                      <div className="text-center">
                        <div className="h-16 w-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
                          {(displayName || user?.firstName || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <p className="text-gray-400 text-sm">Loading camera…</p>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500">
                        <VideoOff className="h-16 w-16 mx-auto mb-3" />
                        <p>Camera off</p>
                      </div>
                    )}
                  </div>
                )}
                {/* VB loading spinner overlay */}
                {vbLoading && videoOn && hasPermission && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="text-center">
                      <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-white text-xs">Loading background…</p>
                    </div>
                  </div>
                )}
                {/* Active VB badge */}
                {virtualBg && !vbLoading && (
                  <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Wand2 className="h-3 w-3" />
                    {virtualBg === "blur" ? "Blur" : "Virtual BG"}
                  </div>
                )}
              </>
            )}
          </div>

          {/* A/V controls + background button */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setMicOn(!micOn)}
              className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-colors ${
                micOn ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-red-600/20 text-red-400 hover:bg-red-600/30"
              }`}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              <span className="text-xs">{micOn ? "Mute" : "Unmute"}</span>
            </button>
            <button
              onClick={() => setVideoOn(!videoOn)}
              className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-colors ${
                videoOn ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-red-600/20 text-red-400 hover:bg-red-600/30"
              }`}
            >
              {videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              <span className="text-xs">{videoOn ? "Stop Video" : "Start Video"}</span>
            </button>
            <button
              onClick={() => setShowBgPicker((v) => !v)}
              className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-colors ${
                virtualBg ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30" : "bg-gray-700 text-white hover:bg-gray-600"
              } ${showBgPicker ? "ring-2 ring-blue-500/40" : ""}`}
            >
              <Wand2 className="h-5 w-5" />
              <span className="text-xs">Background</span>
            </button>
          </div>

          {/* Background picker panel */}
          {showBgPicker && (
            <div className="mt-3 rounded-xl bg-gray-800 border border-gray-700">
              <VirtualBackgroundPicker selected={virtualBg} onChange={handleBgChange} onClose={() => setShowBgPicker(false)} />
            </div>
          )}
        </div>

        {/* Join panel */}
        <div className="lg:w-80 flex flex-col gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 text-gray-400 hover:text-white -ml-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{meeting.title}</CardTitle>
                  {meeting.scheduledAt && (
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(meeting.scheduledAt), "MMM d 'at' h:mm a")}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={
                    meeting.status === "active"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }
                >
                  {meeting.status === "active" ? "● Live" : meeting.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Users className="h-4 w-4" />
                <span>
                  {meeting.participantCount} participant{meeting.participantCount !== 1 ? "s" : ""}
                  {meeting.maxParticipants ? (
                    <span className={`ml-1 font-medium ${
                      meeting.participantCount >= meeting.maxParticipants * 0.9
                        ? "text-orange-500"
                        : "text-gray-400"
                    }`}>
                      / {meeting.maxParticipants}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded ml-auto">
                  {meeting.meetingCode}
                </span>
              </div>
              {meeting.maxParticipants && meeting.participantCount >= meeting.maxParticipants * 0.8 && (
                <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                  <Users className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {meeting.maxParticipants - meeting.participantCount <= 0
                      ? "Meeting is full — no spots remaining"
                      : `Almost full — ${meeting.maxParticipants - meeting.participantCount} spot${meeting.maxParticipants - meeting.participantCount !== 1 ? "s" : ""} left`}
                  </span>
                </div>
              )}

              {meeting.waitingRoomEnabled && (
                <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  <span>Waiting room enabled — host must admit you</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="displayName">Your name</Label>
                <Input
                  id="displayName"
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
              </div>

              {meeting.isPasswordProtected && (
                <div className="space-y-2">
                  <Label htmlFor="passcode" className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    Passcode required
                  </Label>
                  <Input
                    id="passcode"
                    type="password"
                    placeholder="Enter passcode"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  />
                </div>
              )}

              <Button
                className="w-full gap-2"
                onClick={handleJoin}
                disabled={joinMutation.isPending || !displayName.trim()}
              >
                <Phone className="h-4 w-4" />
                {joinMutation.isPending ? "Joining..." : "Join Meeting"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </VerificationGate>
  );
}
