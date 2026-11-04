import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  useGetLiveStream,
  useGoLive,
  useEndLiveStream,
  getGetLiveStreamQueryKey,
  getGetMyLiveStreamsQueryKey,
} from "@workspace/api-client-react";
import type { GoLiveResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Room,
  RoomEvent,
  VideoPresets,
  Track,
  createLocalVideoTrack,
  createLocalAudioTrack,
} from "livekit-client";
import {
  Radio,
  StopCircle,
  Copy,
  Check,
  Eye,
  MessageSquare,
  Settings,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Share2,
  ChevronLeft,
  Wifi,
  WifiOff,
} from "lucide-react";

type ChatMsg = { id: string; sender: string; text: string; ts: number };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex-shrink-0"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function LiveStudio() {
  const { streamKey } = useParams<{ streamKey: string }>();
  const [, navigate] = useLocation();
  const { user } = useUser();
  const qc = useQueryClient();

  const { data: stream, isLoading } = useGetLiveStream(streamKey!, {
    query: {
      queryKey: getGetLiveStreamQueryKey(streamKey!),
      refetchInterval: (d: unknown) => ((d as { status?: string })?.status === "live" ? 5000 : false),
    },
  });

  const { mutate: goLiveMutation, isPending: goingLive } = useGoLive();
  const { mutate: endStreamMutation, isPending: ending } = useEndLiveStream();

  const [lkToken, setLkToken] = useState<string | null>(null);
  const [rtmpUrl, setRtmpUrl] = useState<string>("");
  const [rtmpKey, setRtmpKey] = useState<string>("");
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"chat" | "obs">("chat");
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  useEffect(() => {
    if (stream?.viewerCount !== undefined) setViewerCount(stream.viewerCount);
  }, [stream?.viewerCount]);

  const connectRoom = useCallback(async (token: string, url: string) => {
    const r = new Room({ adaptiveStream: true, dynacast: true });
    r.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "chat") {
          setChat((prev) => [
            ...prev.slice(-199),
            { id: Date.now().toString(), sender: msg.sender, text: msg.text, ts: Date.now() },
          ]);
        }
      } catch {}
    });
    r.on(RoomEvent.ParticipantConnected, () => setViewerCount((c) => c + 1));
    r.on(RoomEvent.ParticipantDisconnected, () => setViewerCount((c) => Math.max(0, c - 1)));
    r.on(RoomEvent.Disconnected, () => setConnected(false));

    try {
      await r.connect(url, token);
      const camTrack = await createLocalVideoTrack({ resolution: VideoPresets.h720.resolution });
      const micTrack = await createLocalAudioTrack();
      await r.localParticipant.publishTrack(camTrack);
      await r.localParticipant.publishTrack(micTrack);
      if (videoRef.current) {
        camTrack.attach(videoRef.current);
      }
      setRoom(r);
      setConnected(true);
    } catch (err) {
      console.error("LiveKit connect error:", err);
    }
  }, []);

  const handleGoLive = () => {
    goLiveMutation(
      { streamKey: streamKey! },
      {
        onSuccess: (result: GoLiveResult) => {
          setLkToken(result.streamerToken);
          setRtmpUrl(result.rtmpUrl);
          setRtmpKey(result.rtmpStreamKey);
          connectRoom(result.streamerToken, result.livekitUrl);
          qc.invalidateQueries({ queryKey: getGetLiveStreamQueryKey(streamKey!) });
          qc.invalidateQueries({ queryKey: getGetMyLiveStreamsQueryKey() });
        },
      },
    );
  };

  const handleEndStream = async () => {
    if (!confirm("End your live stream? Viewers will be disconnected.")) return;
    if (room) {
      await room.disconnect();
      setRoom(null);
      setConnected(false);
    }
    endStreamMutation(
      { streamKey: streamKey! },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetLiveStreamQueryKey(streamKey!) });
          qc.invalidateQueries({ queryKey: getGetMyLiveStreamsQueryKey() });
          navigate("/live/dashboard");
        },
      },
    );
  };

  const toggleCam = async () => {
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!camEnabled);
    setCamEnabled((v) => !v);
  };

  const toggleMic = async () => {
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!micEnabled);
    setMicEnabled((v) => !v);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !room) return;
    const msg = JSON.stringify({ type: "chat", sender: user?.firstName ?? "Streamer", text: chatInput.trim() });
    await room.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
    setChat((prev) => [
      ...prev.slice(-199),
      { id: Date.now().toString(), sender: "You", text: chatInput.trim(), ts: Date.now() },
    ]);
    setChatInput("");
  };

  const shareLink = () => {
    const link = `${window.location.origin}/live/watch/${streamKey}`;
    navigator.clipboard.writeText(link);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stream) {
    return <div className="p-6 text-gray-500">Stream not found.</div>;
  }

  const isOwner = stream.streamerClerkId === user?.id;
  if (!isOwner) {
    navigate(`/live/watch/${streamKey}`);
    return null;
  }

  const isLive = stream.status === "live";

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-950">
      {/* Main video area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/live/dashboard")}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="text-white font-semibold text-sm">{stream.title}</p>
              <p className="text-gray-400 text-xs capitalize">{stream.category}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isLive && (
              <>
                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                  <Eye className="w-3.5 h-3.5 text-red-400" />
                  {viewerCount} watching
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 rounded text-xs text-red-400 font-bold">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  LIVE
                </div>
              </>
            )}
            <button
              onClick={shareLink}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Copy share link"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video preview */}
        <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover ${!camEnabled ? "hidden" : ""}`}
          />
          {(!camEnabled || !connected) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center mb-3">
                <span className="text-white text-2xl font-bold">{user?.firstName?.[0] ?? "S"}</span>
              </div>
              <p className="text-white font-medium">{stream.streamerName}</p>
              {!isLive && <p className="text-gray-400 text-sm mt-1">Preview — not yet live</p>}
            </div>
          )}
          {!isLive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <button
                onClick={handleGoLive}
                disabled={goingLive}
                className="flex items-center gap-3 px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl text-lg font-bold shadow-2xl transition-all hover:scale-105 disabled:opacity-50"
              >
                {goingLive ? (
                  <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Radio className="w-6 h-6" />
                )}
                {goingLive ? "Starting..." : "Go Live"}
              </button>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              className={`p-2.5 rounded-lg transition-colors ${
                micEnabled ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-red-500/20 text-red-400"
              }`}
            >
              {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleCam}
              className={`p-2.5 rounded-lg transition-colors ${
                camEnabled ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-red-500/20 text-red-400"
              }`}
            >
              {camEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                connected ? "text-green-400" : "text-gray-500"
              }`}
            >
              {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {connected ? "Connected" : "Disconnected"}
            </div>
          </div>
          {isLive && (
            <button
              onClick={handleEndStream}
              disabled={ending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <StopCircle className="w-4 h-4" />
              End Stream
            </button>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-80 flex flex-col bg-gray-900 border-l border-gray-800 flex-shrink-0">
        {/* Sidebar tabs */}
        <div className="flex border-b border-gray-800">
          {([
            { key: "chat" as const, label: "Chat", icon: MessageSquare },
            { key: "obs" as const, label: "OBS Setup", icon: Settings },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
                activeTab === key
                  ? "text-white border-b-2 border-indigo-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "chat" && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chat.length === 0 && (
                <p className="text-center text-gray-600 text-sm py-8">Chat will appear here</p>
              )}
              {chat.map((msg) => (
                <div key={msg.id} className="text-sm">
                  <span className="text-indigo-400 font-medium">{msg.sender}</span>
                  <span className="text-gray-300 ml-2">{msg.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-gray-800">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder={isLive ? "Say something..." : "Go live to chat"}
                  disabled={!isLive}
                  className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none border border-gray-700 focus:border-indigo-500 placeholder-gray-600 disabled:opacity-50"
                />
                <button
                  onClick={sendChat}
                  disabled={!isLive || !chatInput.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === "obs" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div>
              <h3 className="text-white text-sm font-semibold mb-2">OBS / External Encoder Setup</h3>
              <p className="text-gray-400 text-xs leading-relaxed">
                Use these credentials in OBS or any RTMP-capable encoder. Click "Go Live" first to generate
                them.
              </p>
            </div>
            {rtmpUrl ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">RTMP Server URL</p>
                  <div className="flex items-start gap-2 bg-gray-800 rounded-lg p-2.5">
                    <code className="text-green-400 text-xs flex-1 break-all">{rtmpUrl}</code>
                    <CopyButton text={rtmpUrl} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Stream Key</p>
                  <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-2.5">
                    <code className="text-green-400 text-xs flex-1 break-all font-mono">{rtmpKey}</code>
                    <CopyButton text={rtmpKey} />
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                  <p className="font-medium text-gray-300">Quick setup in OBS:</p>
                  <p>1. Open OBS → Settings → Stream</p>
                  <p>2. Service: Custom</p>
                  <p>3. Paste the Server URL above</p>
                  <p>4. Paste the Stream Key above</p>
                  <p>5. Click OK and press Start Streaming</p>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Settings className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">RTMP credentials will appear here after you go live</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
