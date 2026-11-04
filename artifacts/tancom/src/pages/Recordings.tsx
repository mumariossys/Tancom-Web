import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mic, Trash2, Download, Play, Clock, Calendar, VideoOff } from "lucide-react";
import {
  listRecordings,
  getListRecordingsQueryKey,
  useDeleteRecording,
} from "@workspace/api-client-react";
import type { Recording } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

function formatSeconds(s: number | null | undefined) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    recording: { label: "● Recording", cls: "bg-red-50 text-red-700 border-red-200 animate-pulse" },
    processing: { label: "Processing", cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    available: { label: "Available", cls: "bg-green-50 text-green-700 border-green-200" },
    failed: { label: "Failed", cls: "bg-gray-50 text-gray-600 border-gray-200" },
  };
  const s = map[status] ?? map.available;
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
}

function PlayerDialog({ recording, onClose }: { recording: Recording; onClose: () => void }) {
  const isVideo = recording.fileUrl?.match(/\.(mp4|webm|mov|ogg)(\?|$)/i);
  const isAudio = recording.fileUrl?.match(/\.(mp3|wav|m4a|aac|ogg)(\?|$)/i);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{recording.meetingTitle}</DialogTitle>
        </DialogHeader>

        {recording.fileUrl ? (
          <div className="mt-2">
            {isVideo || (!isAudio && recording.fileUrl) ? (
              <video
                src={recording.fileUrl}
                controls
                autoPlay
                className="w-full rounded-xl max-h-96 bg-black"
              />
            ) : (
              <audio
                src={recording.fileUrl}
                controls
                autoPlay
                className="w-full mt-4"
              />
            )}
            <p className="text-xs text-gray-400 mt-2 text-center">
              {format(new Date(recording.startedAt), "MMM d, yyyy · h:mm a")}
              {recording.durationSeconds ? ` · ${formatSeconds(recording.durationSeconds)}` : ""}
              {formatFileSize(recording.fileSizeBytes) ? ` · ${formatFileSize(recording.fileSizeBytes)}` : ""}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <VideoOff className="h-8 w-8 text-gray-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-800">No media file available</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">
                This recording was created in a simulated meeting session.
                No audio or video was captured — only the session metadata was saved.
              </p>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <p>{format(new Date(recording.startedAt), "MMM d, yyyy · h:mm a")}</p>
              {recording.durationSeconds && <p>Duration: {formatSeconds(recording.durationSeconds)}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordingCard({ recording, onDelete }: { recording: Recording; onDelete: (id: number) => void }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const { toast } = useToast();

  const handleDownload = () => {
    if (recording.fileUrl) {
      const a = document.createElement("a");
      a.href = recording.fileUrl;
      a.download = `${recording.meetingTitle.replace(/[^a-z0-9]/gi, "_")}_recording`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      toast({
        title: "No file to download",
        description: "This session was simulated — no audio or video file was captured.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 flex-shrink-0">
              <Mic className="h-6 w-6 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-gray-900 truncate">{recording.meetingTitle}</h3>
                {statusBadge(recording.status)}
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(recording.startedAt), "MMM d, yyyy")}
                </span>
                {recording.durationSeconds && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {formatSeconds(recording.durationSeconds)}
                  </span>
                )}
                {formatFileSize(recording.fileSizeBytes) && (
                  <span className="text-xs text-gray-400">{formatFileSize(recording.fileSizeBytes)}</span>
                )}
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(recording.startedAt), { addSuffix: true })}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {recording.status === "available" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setShowPlayer(true)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Play
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={handleDownload}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-red-600 hover:text-red-700 ml-auto"
                  onClick={() => onDelete(recording.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showPlayer && (
        <PlayerDialog recording={recording} onClose={() => setShowPlayer(false)} />
      )}
    </>
  );
}

export default function RecordingsPage() {
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: recordings, isLoading } = useQuery({
    queryKey: getListRecordingsQueryKey(),
    queryFn: listRecordings,
  });

  const deleteMutation = useDeleteRecording({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRecordingsQueryKey() });
        toast({ title: "Recording deleted" });
        setDeleteId(null);
      },
      onError: () => {
        toast({ title: "Failed to delete recording", variant: "destructive" });
      },
    },
  });

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recordings</h1>
          <p className="text-gray-500 mt-1">Meetings you've recorded</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : recordings && recordings.length > 0 ? (
          <div className="space-y-4">
            {recordings.map((r) => (
              <RecordingCard key={r.id} recording={r} onDelete={setDeleteId} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Mic className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-gray-900 font-medium mb-2">No recordings yet</h3>
            <p className="text-gray-500 text-sm">
              Start recording from within a meeting room using the Record button.
            </p>
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recording?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the recording and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
