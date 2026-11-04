import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Video,
  Calendar,
  Clock,
  Users,
  Copy,
  Play,
  Square,
  Lock,
  Unlock,
  Mic,
  Shield,
  Settings2,
  ExternalLink,
  FileText,
  Download,
  Sparkles,
  CheckSquare,
  Star,
  Lightbulb,
} from "lucide-react";
import {
  getMeeting,
  getGetMeetingQueryKey,
  useStartMeeting,
  useEndMeeting,
  useLockMeeting,
  listParticipants,
  getListParticipantsQueryKey,
  useAdmitAllParticipants,
  useMuteAllParticipants,
  useUpdateParticipant,
  useRemoveParticipant,
  useListMeetingNotes,
  useGetMeetingSummary,
  exportMeetingNotes,
  getListMeetingNotesQueryKey,
  getGetMeetingSummaryQueryKey,
} from "@workspace/api-client-react";
import type { Participant, MeetingNote } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

function ParticipantRow({ p, meetingId, onUpdate, onRemove }: {
  p: Participant;
  meetingId: number;
  onUpdate: (pid: number, data: any) => void;
  onRemove: (pid: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium flex-shrink-0">
        {(p.displayName ?? "?").slice(0, 1).toUpperCase() || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{p.displayName ?? "Guest"}</p>
        <p className="text-xs text-gray-500 capitalize">{p.role} · {p.status}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {p.isMuted ? (
          <Badge variant="outline" className="text-xs">Muted</Badge>
        ) : null}
        {p.status === "waiting" && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onUpdate(p.id, { status: "admitted" })}>
            Admit
          </Button>
        )}
        {p.role !== "host" && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => onRemove(p.id)}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const meetingId = parseInt(id, 10);

  const { data: meeting, isLoading } = useQuery({
    queryKey: getGetMeetingQueryKey(meetingId),
    queryFn: () => getMeeting(meetingId),
    enabled: !isNaN(meetingId),
  });

  const { data: participants } = useQuery({
    queryKey: getListParticipantsQueryKey(meetingId),
    queryFn: () => listParticipants(meetingId),
    enabled: !isNaN(meetingId) && meeting?.status === "active",
    refetchInterval: meeting?.status === "active" ? 5000 : false,
  });

  const startMutation = useStartMeeting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeetingQueryKey(meetingId) });
        toast({ title: "Meeting started" });
      },
    },
  });

  const endMutation = useEndMeeting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeetingQueryKey(meetingId) });
        toast({ title: "Meeting ended" });
      },
    },
  });

  const lockMutation = useLockMeeting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeetingQueryKey(meetingId) });
      },
    },
  });

  const admitAllMutation = useAdmitAllParticipants({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(meetingId) });
        toast({ title: "All participants admitted" });
      },
    },
  });

  const muteAllMutation = useMuteAllParticipants({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(meetingId) });
        toast({ title: "All participants muted" });
      },
    },
  });

  const updateParticipantMutation = useUpdateParticipant({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(meetingId) }),
    },
  });

  const removeParticipantMutation = useRemoveParticipant({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(meetingId) }),
    },
  });

  const { data: meetingNotes = [] } = useListMeetingNotes(meetingId, {
    query: { queryKey: getListMeetingNotesQueryKey(meetingId), enabled: !isNaN(meetingId) },
  });
  const { data: meetingSummary } = useGetMeetingSummary(meetingId, {
    query: { queryKey: getGetMeetingSummaryQueryKey(meetingId), enabled: !isNaN(meetingId), retry: false },
  });

  const handleExportNotes = async () => {
    try {
      const result = await exportMeetingNotes(meetingId);
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

  const copyInvite = () => {
    if (meeting) {
      navigator.clipboard.writeText(meeting.inviteLink);
      toast({ title: "Link copied" });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!meeting) {
    return (
      <AppLayout>
        <div className="p-6 text-center">
          <p className="text-gray-500">Meeting not found</p>
          <Link href="/meetings"><Button className="mt-4">Back to Meetings</Button></Link>
        </div>
      </AppLayout>
    );
  }

  const statusColor: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    active: "bg-green-50 text-green-700 border-green-200",
    ended: "bg-gray-50 text-gray-600 border-gray-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
  };

  const waitingCount = participants?.filter((p) => p.status === "waiting").length ?? 0;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Back */}
        <Link href="/meetings">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Meetings
          </Button>
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100">
              <Video className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
              {meeting.description && <p className="text-gray-500 mt-0.5">{meeting.description}</p>}
            </div>
          </div>
          <Badge variant="outline" className={statusColor[meeting.status]}>
            {meeting.status === "active" ? "● Live" : meeting.status}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {meeting.status === "active" && (
            <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => setLocation(`/room/${meeting.meetingCode}`)}>
              <ExternalLink className="h-4 w-4" />
              Enter Room
            </Button>
          )}
          {meeting.status === "scheduled" && (
            <Button className="gap-2" onClick={() => startMutation.mutate({ id: meetingId })}>
              <Play className="h-4 w-4" />
              Start Meeting
            </Button>
          )}
          {meeting.status === "active" && (
            <Button variant="destructive" className="gap-2" onClick={() => endMutation.mutate({ id: meetingId })}>
              <Square className="h-4 w-4" />
              End Meeting
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={copyInvite}>
            <Copy className="h-4 w-4" />
            Copy Invite Link
          </Button>
          {meeting.status === "active" && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => lockMutation.mutate({ id: meetingId, data: { locked: !meeting.isLocked } })}
            >
              {meeting.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {meeting.isLocked ? "Unlock" : "Lock"}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Meeting info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Meeting Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Meeting Code</span>
                <span className="font-mono font-medium">{meeting.meetingCode}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="capitalize">{meeting.type}</span>
              </div>
              <Separator />
              {meeting.scheduledAt && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Scheduled</span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(meeting.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                  <Separator />
                </>
              )}
              {meeting.duration && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Duration</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {meeting.duration} minutes
                    </span>
                  </div>
                  <Separator />
                </>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Participants</span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {meeting.participantCount}
                  {meeting.maxParticipants ? ` / ${meeting.maxParticipants}` : ""}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span>{format(new Date(meeting.createdAt), "MMM d, yyyy")}</span>
              </div>
            </CardContent>
          </Card>

          {/* Security settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Security & Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Waiting Room", value: meeting.waitingRoomEnabled },
                { label: "Password Protected", value: meeting.isPasswordProtected },
                { label: "Meeting Locked", value: meeting.isLocked },
                { label: "Screen Sharing", value: meeting.allowScreenShare },
                { label: "Chat Enabled", value: meeting.allowChat },
                { label: "Mute on Entry", value: meeting.muteOnEntry },
                { label: "Video Off on Entry", value: meeting.videoOffOnEntry },
              ].map((item, i) => (
                <div key={item.label}>
                  {i > 0 && <Separator className="mb-3" />}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{item.label}</span>
                    <Badge variant="outline" className={item.value ? "text-green-700 border-green-200 bg-green-50" : "text-gray-500 border-gray-200"}>
                      {item.value ? "On" : "Off"}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Meeting Notes card */}
        {meetingNotes.length > 0 || meetingSummary ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Meeting Notes
                  <Badge variant="outline" className="text-xs ml-1">{meetingNotes.length}</Badge>
                </CardTitle>
                {meetingNotes.length > 0 && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleExportNotes}>
                    <Download className="h-3.5 w-3.5" />
                    Export .md
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {meetingSummary && (
                <div className="rounded-xl bg-purple-50 border border-purple-100 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-purple-700 font-semibold text-sm">
                    <Sparkles className="h-4 w-4" />
                    AI Summary
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed">{meetingSummary.summary}</p>
                  {Array.isArray(meetingSummary.actionItems) && (meetingSummary.actionItems as string[]).length > 0 && (
                    <div>
                      <p className="text-purple-700 text-xs font-semibold mb-1.5">Action Items</p>
                      <ul className="space-y-1">
                        {(meetingSummary.actionItems as string[]).map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <CheckSquare className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(meetingSummary.decisions) && (meetingSummary.decisions as string[]).length > 0 && (
                    <div>
                      <p className="text-purple-700 text-xs font-semibold mb-1.5">Decisions</p>
                      <ul className="space-y-1">
                        {(meetingSummary.decisions as string[]).map((d, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <Star className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {meetingNotes.length > 0 && (
                <div className="space-y-2">
                  {(meetingNotes as MeetingNote[]).map((note) => {
                    const typeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
                      note: { label: "Note", color: "text-blue-700 bg-blue-50 border-blue-100", icon: <FileText className="h-3 w-3" /> },
                      action: { label: "Action", color: "text-orange-700 bg-orange-50 border-orange-100", icon: <CheckSquare className="h-3 w-3" /> },
                      decision: { label: "Decision", color: "text-yellow-700 bg-yellow-50 border-yellow-100", icon: <Star className="h-3 w-3" /> },
                      highlight: { label: "Highlight", color: "text-green-700 bg-green-50 border-green-100", icon: <Lightbulb className="h-3 w-3" /> },
                    };
                    const cfg = typeConfig[note.noteType] ?? typeConfig.note;
                    return (
                      <div key={note.id} className="flex gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 h-fit mt-0.5 ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 leading-relaxed">{note.content}</p>
                          <p className="text-xs text-gray-400 mt-1">{note.authorName}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Participants panel (active meetings) */}
        {meeting.status === "active" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Participants
                  {waitingCount > 0 && (
                    <Badge className="bg-orange-100 text-orange-700 border-orange-200 ml-2">
                      {waitingCount} waiting
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  {waitingCount > 0 && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => admitAllMutation.mutate({ id: meetingId })}>
                      Admit All
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => muteAllMutation.mutate({ id: meetingId })}>
                    <Mic className="h-3.5 w-3.5" />
                    Mute All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {participants && participants.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {participants.map((p) => (
                    <ParticipantRow
                      key={p.id}
                      p={p}
                      meetingId={meetingId}
                      onUpdate={(pid, data) => updateParticipantMutation.mutate({ id: meetingId, participantId: pid, data })}
                      onRemove={(pid) => removeParticipantMutation.mutate({ id: meetingId, participantId: pid })}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No participants yet</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
