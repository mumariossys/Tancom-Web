import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useUser } from "@clerk/react";
import {
  useGetLiveStream,
  useGetLiveStreamToken,
  useToggleFollowStreamer,
  getGetLiveStreamQueryKey,
  getGetLiveStreamTokenQueryKey,
} from "@workspace/api-client-react";
import type { LiveStreamToken } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Room, RoomEvent, Track } from "livekit-client";
import { Radio, Eye, Heart, ChevronLeft, AlertCircle, Wifi } from "lucide-react";

type ChatMsg = { id: string; sender: string; text: string; ts: number };

const REACTIONS = ["❤️", "🔥", "😂", "👏", "🎉", "💯"];

export default function LiveWatch() {
  const { streamKey } = useParams<{ streamKey: string }>();
  const [, navigate] = useLocation();
  const { user } = useUser();
  const qc = useQueryClient();

  const { data: stream, isLoading } = useGetLiveStream(streamKey!, {
    query: { queryKey: getGetLiveStreamQueryKey(streamKey!), refetchInterval: 8000 },
  });

  const { data: tokenData, isLoading: loadingToken, refetch: fetchToken } = useGetLiveStreamToken(
    streamKey!,
    { query: { queryKey: getGetLiveStreamTokenQueryKey(streamKey!), enabled: false } },
  );

  const { mutate: toggleFollow } = useToggleFollowStreamer();

  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [reaction, setReaction] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const connectRoom = useCallback(async (token: string, url: string) => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
    }
    const r = new Room({ adaptiveStream: true, dynacast: false });
    roomRef.current = r;

    r.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "chat") {
          setChat((prev) => [
            ...prev.slice(-199),
            { id: Date.now().toString(), sender: msg.sender, text: msg.text, ts: Date.now() },
          ]);
        }
        if (msg.type === "reaction") {
          setReaction(msg.emoji);
          setTimeout(() => setReaction(null), 1500);
        }
      } catch {}
    });

    r.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current);
      }
      if (track.kind === Track.Kind.Audio && audioRef.current) {
        track.attach(audioRef.current);
      }
    });

    r.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach();
    });

    r.on(RoomEvent.Disconnected, () => {
      setConnected(false);
      setRoom(null);
    });

    try {
      await r.connect(url, token);
      setRoom(r);
      setConnected(true);
    } catch (err) {
      console.error("LiveKit viewer connect error:", err);
    }
  }, []);

  useEffect(() => {
    if (tokenData) {
      connectRoom((tokenData as LiveStreamToken).token, (tokenData as LiveStreamToken).livekitUrl);
    }
  }, [tokenData, connectRoom]);

  useEffect(() => {
    if (stream?.status === "live" && !connected && !loadingToken) {
      fetchToken();
    }
  }, [stream?.status]);

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  const sendChat = async () => {
    if (!chatInput.trim() || !room) return;
    const msg = JSON.stringify({ type: "chat", sender: user?.firstName ?? "Viewer", text: chatInput.trim() });
    await room.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
    setChat((prev) => [
      ...prev.slice(-199),
      { id: Date.now().toString(), sender: user?.firstName ?? "You", text: chatInput.trim(), ts: Date.now() },
    ]);
    setChatInput("");
  };

  const sendReaction = async (emoji: string) => {
    if (!room) return;
    const msg = JSON.stringify({ type: "reaction", emoji, sender: user?.firstName ?? "Viewer" });
    await room.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: false });
    setReaction(emoji);
    setTimeout(() => setReaction(null), 1500);
  };

  const handleFollow = () => {
    if (!stream) return;
    toggleFollow(
      { streamerClerkId: stream.streamerClerkId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetLiveStreamQueryKey(streamKey!) });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Stream not found.</p>
        <Link href="/live">
          <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
            Back to Live Hub
          </button>
        </Link>
      </div>
    );
  }

  const isEnded = stream.status === "ended";
  const isLive = stream.status === "live";
  const isOwner = stream.streamerClerkId === user?.id;

  if (isOwner) {
    navigate(`/live/stream/${streamKey}/studio`);
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-950">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button onClick={() => navigate("/live")} className="text-gray-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{stream.title}</p>
            <p className="text-gray-400 text-xs">
              {stream.streamerName} · <span className="capitalize">{stream.category}</span>
            </p>
          </div>
          {isLive && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-300">
                <Eye className="w-3.5 h-3.5 text-red-400" />
                {stream.viewerCount} watching
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 rounded text-xs text-red-400 font-bold">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                LIVE
              </div>
            </div>
          )}
        </div>

        {/* Video */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-contain ${!connected ? "hidden" : ""}`} />
          <audio ref={audioRef} autoPlay />

          {!connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center mb-4">
                <span className="text-white text-4xl font-bold">{stream.streamerName[0]}</span>
              </div>
              <h2 className="text-white text-xl font-bold mb-1">{stream.streamerName}</h2>
              <p className="text-gray-400 text-sm mb-6">{stream.title}</p>

              {isLive ? (
                <button
                  onClick={() => fetchToken()}
                  disabled={loadingToken}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {loadingToken ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Radio className="w-5 h-5" />
                  )}
                  {loadingToken ? "Joining..." : "Watch Live"}
                </button>
              ) : isEnded ? (
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-4">This stream has ended</p>
                  <Link href="/live">
                    <button className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                      Browse More Streams
                    </button>
                  </Link>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Stream is offline</p>
              )}
            </div>
          )}

          {reaction && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-5xl animate-bounce pointer-events-none select-none">
              {reaction}
            </div>
          )}

          {connected && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-green-400 bg-black/50 px-2 py-1 rounded">
              <Wifi className="w-3 h-3" /> Live
            </div>
          )}
        </div>

        {/* Reactions bar */}
        {isLive && connected && (
          <div className="flex items-center justify-center gap-3 py-2 bg-gray-900 border-t border-gray-800">
            {REACTIONS.map((e) => (
              <button key={e} onClick={() => sendReaction(e)} className="text-xl hover:scale-125 transition-transform">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="w-80 flex flex-col bg-gray-900 border-l border-gray-800 flex-shrink-0">
        {/* Streamer info */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold">{stream.streamerName[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">{stream.streamerName}</p>
              <p className="text-gray-400 text-xs">{stream.followerCount} followers</p>
            </div>
            {user && user.id !== stream.streamerClerkId && (
              <button
                onClick={handleFollow}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  stream.isFollowing
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${stream.isFollowing ? "fill-current" : ""}`} />
                {stream.isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
          {stream.description && (
            <p className="text-gray-400 text-xs mt-2 line-clamp-2">{stream.description}</p>
          )}
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chat.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-8">
              {isLive ? "Be the first to chat!" : "Chat unavailable"}
            </p>
          )}
          {chat.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span className="text-indigo-400 font-medium">{msg.sender}</span>
              <span className="text-gray-300 ml-2">{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Chat input */}
        {stream.chatEnabled && (
          <div className="p-3 border-t border-gray-800">
            {user ? (
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder={connected ? "Say something..." : "Join stream to chat"}
                  disabled={!connected}
                  className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none border border-gray-700 focus:border-indigo-500 placeholder-gray-600 disabled:opacity-50"
                />
                <button
                  onClick={sendChat}
                  disabled={!connected || !chatInput.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40"
                >
                  →
                </button>
              </div>
            ) : (
              <p className="text-center text-gray-500 text-xs">Sign in to chat</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
