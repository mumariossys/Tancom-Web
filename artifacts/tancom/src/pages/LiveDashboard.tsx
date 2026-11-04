import { Link, useLocation } from "wouter";
import {
  useGetMyLiveStreams,
  useDeleteLiveStream,
  useGetLiveFollowers,
  getGetMyLiveStreamsQueryKey,
} from "@workspace/api-client-react";
import type { LiveStream } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Radio, Plus, Trash2, ExternalLink, Eye, Users } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> LIVE
      </span>
    );
  if (status === "idle")
    return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">Offline</span>;
  return <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">Ended</span>;
}

function StreamRow({ stream, onDelete }: { stream: LiveStream; onDelete: (key: string) => void }) {
  const [, navigate] = useLocation();
  return (
    <div className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-xl hover:border-indigo-100 transition-all">
      <div className="w-16 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
        <Radio className="w-4 h-4 text-white/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">{stream.title}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
          <span className="capitalize">{stream.category}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {stream.totalViews} views
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {stream.peakViewerCount} peak
          </span>
        </div>
      </div>
      <StatusBadge status={stream.status} />
      <div className="flex items-center gap-2">
        {stream.status === "idle" && (
          <button
            onClick={() => navigate(`/live/stream/${stream.streamKey}/studio`)}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1"
          >
            <Radio className="w-3 h-3" /> Go Live
          </button>
        )}
        {stream.status === "live" && (
          <button
            onClick={() => navigate(`/live/stream/${stream.streamKey}/studio`)}
            className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1"
          >
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Studio
          </button>
        )}
        {stream.status !== "idle" && (
          <Link href={`/live/watch/${stream.streamKey}`}>
            <button className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors">
              <ExternalLink className="w-4 h-4" />
            </button>
          </Link>
        )}
        <button
          onClick={() => onDelete(stream.streamKey)}
          className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function LiveDashboard() {
  const qc = useQueryClient();
  const { data: streams = [], isLoading } = useGetMyLiveStreams();
  const { data: followersData } = useGetLiveFollowers();
  const { mutate: deleteStream } = useDeleteLiveStream();

  const liveStream = streams.find((s: LiveStream) => s.status === "live");
  const totalViews = streams.reduce((a: number, s: LiveStream) => a + s.totalViews, 0);
  const peakViewers = streams.reduce((a: number, s: LiveStream) => Math.max(a, s.peakViewerCount), 0);

  const handleDelete = (streamKey: string) => {
    if (!confirm("Delete this stream?")) return;
    deleteStream(
      { streamKey },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMyLiveStreamsQueryKey() });
        },
      },
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Streaming Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your live streams and track performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/live">
            <button className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
              Browse Streams
            </button>
          </Link>
          <Link href="/live/new">
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> New Stream
            </button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Streams</p>
          <p className="text-2xl font-bold text-gray-900">{streams.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Views</p>
          <p className="text-2xl font-bold text-gray-900">{totalViews.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Peak Viewers</p>
          <p className="text-2xl font-bold text-gray-900">{peakViewers}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Followers</p>
          <p className="text-2xl font-bold text-gray-900">{followersData?.count ?? 0}</p>
        </div>
      </div>

      {/* Live now banner */}
      {liveStream && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-4">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-800 text-sm">You are currently live: {liveStream.title}</p>
            <p className="text-xs text-red-600 mt-0.5">
              {liveStream.viewerCount} watching now · {liveStream.peakViewerCount} peak viewers
            </p>
          </div>
          <Link href={`/live/stream/${liveStream.streamKey}/studio`}>
            <button className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">
              Open Studio
            </button>
          </Link>
        </div>
      )}

      {/* Streams list */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your Streams</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : streams.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
            <Radio className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium text-sm">No streams yet</p>
            <Link href="/live/new">
              <button className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                Create Your First Stream
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {streams.map((s: LiveStream) => (
              <StreamRow key={s.id} stream={s} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
