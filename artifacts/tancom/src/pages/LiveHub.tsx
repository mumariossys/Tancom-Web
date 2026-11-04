import { useState } from "react";
import { Link } from "wouter";
import {
  useListLiveStreams,
  useGetMyLiveStreams,
  getListLiveStreamsQueryKey,
  getGetMyLiveStreamsQueryKey,
} from "@workspace/api-client-react";
import type { LiveStream, ListLiveStreamsParams } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Radio, Plus, Users, Clock, TrendingUp } from "lucide-react";

const CATEGORIES = ["All", "Gaming", "Music", "Education", "Tech", "Business", "Fitness", "Just Chatting", "General"];

function StreamCard({ stream }: { stream: LiveStream }) {
  return (
    <Link href={`/live/watch/${stream.streamKey}`}>
      <div className="group rounded-xl overflow-hidden border border-gray-100 bg-white hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer">
        <div className="relative bg-gradient-to-br from-indigo-600 to-purple-700 aspect-video flex items-center justify-center">
          {stream.thumbnailUrl ? (
            <img src={stream.thumbnailUrl} alt={stream.title} className="w-full h-full object-cover" />
          ) : (
            <Radio className="w-10 h-10 text-white/50" />
          )}
          {stream.status === "live" && (
            <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
              LIVE
            </span>
          )}
          {stream.status === "idle" && (
            <span className="absolute top-2 left-2 bg-gray-500 text-white text-xs font-bold px-2 py-0.5 rounded">
              OFFLINE
            </span>
          )}
          {stream.status === "live" && (
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
              <Users className="w-3 h-3" />
              {stream.viewerCount}
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="font-semibold text-gray-900 text-sm line-clamp-1">{stream.title}</p>
          <p className="text-gray-500 text-xs mt-0.5">{stream.streamerName}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
              {stream.category}
            </span>
            <span className="text-xs text-gray-400">{stream.followerCount} followers</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function LiveHub() {
  const { user } = useUser();
  const [category, setCategory] = useState("All");
  const [tab, setTab] = useState<"all" | "live" | "following">("all");

  const params: ListLiveStreamsParams = {
    ...(tab === "live" ? { status: "live" as const } : {}),
    ...(category !== "All" ? { category: category.toLowerCase() } : {}),
    limit: 40,
  };

  const { data: liveStreams = [], isLoading: loadingLive } = useListLiveStreams(params, {
    query: { queryKey: getListLiveStreamsQueryKey(params), refetchInterval: 15000 },
  });

  const { data: myStreams = [] } = useGetMyLiveStreams({
    query: { queryKey: getGetMyLiveStreamsQueryKey(), enabled: !!user },
  });

  const myLiveStream = myStreams.find((s) => s.status === "live");

  const displayStreams =
    tab === "all"
      ? liveStreams.filter((s) => s.status !== "ended")
      : tab === "live"
        ? liveStreams.filter((s) => s.status === "live")
        : liveStreams.filter((s) => s.isFollowing && s.status !== "ended");

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radio className="w-6 h-6 text-red-500" />
            Live Marketing
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Broadcast to the world in real time</p>
        </div>
        <div className="flex items-center gap-3">
          {myLiveStream && (
            <Link href={`/live/stream/${myLiveStream.streamKey}/studio`}>
              <button className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                You're Live
              </button>
            </Link>
          )}
          <Link href="/live/dashboard">
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              <TrendingUp className="w-4 h-4" />
              Dashboard
            </button>
          </Link>
          <Link href="/live/new">
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" />
              Go Live
            </button>
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Radio className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {liveStreams.filter((s) => s.status === "live").length}
            </p>
            <p className="text-xs text-gray-500">Live now</p>
          </div>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {liveStreams
                .filter((s) => s.status === "live")
                .reduce((acc: number, s: LiveStream) => acc + s.viewerCount, 0)}
            </p>
            <p className="text-xs text-gray-500">Total viewers</p>
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{myStreams.length}</p>
            <p className="text-xs text-gray-500">Your streams</p>
          </div>
        </div>
      </div>

      {/* Tabs + category filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden w-fit">
          {(["all", "live", "following"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                tab === t ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t === "live" ? "🔴 Live" : t === "following" ? "⭐ Following" : "All"}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                category === c
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Streams grid */}
      {loadingLive ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-gray-100 bg-white animate-pulse">
              <div className="aspect-video bg-gray-200" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : displayStreams.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No streams yet</p>
          <p className="text-sm mt-1">Be the first to go live</p>
          <Link href="/live/new">
            <button className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Start Streaming
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayStreams.map((s: LiveStream) => (
            <StreamCard key={s.id} stream={s} />
          ))}
        </div>
      )}
    </div>
  );
}
