import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Video,
  Plus,
  Search,
  MoreVertical,
  Calendar,
  Clock,
  Users,
  Copy,
  Trash2,
  ExternalLink,
  Play,
} from "lucide-react";
import {
  listMeetings,
  getListMeetingsQueryKey,
  useDeleteMeeting,
  useStartMeeting,
} from "@workspace/api-client-react";
import type { Meeting } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type Tab = "all" | "upcoming" | "past";

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled: { label: "Scheduled", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    active: { label: "Live", cls: "bg-green-50 text-green-700 border-green-200" },
    ended: { label: "Ended", cls: "bg-gray-50 text-gray-600 border-gray-200" },
    cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const s = map[status] || map.scheduled;
  return (
    <Badge variant="outline" className={s.cls}>
      {s.label}
    </Badge>
  );
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    instant: "bg-orange-50 text-orange-700 border-orange-200",
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    recurring: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return (
    <Badge variant="outline" className={map[type] || map.scheduled}>
      {type}
    </Badge>
  );
}

function MeetingCard({
  meeting,
  onDelete,
  onStart,
}: {
  meeting: Meeting;
  onDelete: (id: number) => void;
  onStart: (id: number) => void;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const copyInvite = () => {
    navigator.clipboard.writeText(meeting.inviteLink);
    toast({ title: "Link copied", description: "Invite link copied to clipboard" });
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 flex-shrink-0">
            <Video className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex-1">
                <h3
                  className="text-base font-semibold text-gray-900 hover:text-blue-600 cursor-pointer transition-colors"
                  onClick={() => setLocation(`/meetings/${meeting.id}`)}
                >
                  {meeting.title}
                </h3>
                {meeting.description && (
                  <p className="text-sm text-gray-500 mt-0.5 truncate">{meeting.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {statusBadge(meeting.status)}
                {meeting.type !== meeting.status && typeBadge(meeting.type)}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4 text-sm text-gray-500 flex-wrap">
              {meeting.scheduledAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(meeting.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
              )}
              {meeting.duration && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {meeting.duration} min
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {meeting.participantCount} participant{meeting.participantCount !== 1 ? "s" : ""}
              </span>
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                {meeting.meetingCode}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {meeting.status === "active" && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700"
                  onClick={() => setLocation(`/room/${meeting.meetingCode}`)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Join Room
                </Button>
              )}
              {meeting.status === "scheduled" && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onStart(meeting.id)}
                >
                  <Play className="h-3.5 w-3.5" />
                  Start
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={copyInvite}>
                <Copy className="h-3.5 w-3.5" />
                Copy Link
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 ml-auto">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setLocation(`/meetings/${meeting.id}`)}>
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600" onClick={() => onDelete(meeting.id)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MeetingsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: meetings, isLoading } = useQuery({
    queryKey: [...getListMeetingsQueryKey({ type: tab === "all" ? undefined : tab }), tab],
    queryFn: () => listMeetings({ type: tab === "all" ? undefined : tab }),
  });

  const deleteMutation = useDeleteMeeting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        toast({ title: "Meeting deleted" });
        setDeleteId(null);
      },
      onError: () => {
        toast({ title: "Failed to delete meeting", variant: "destructive" });
      },
    },
  });

  const startMutation = useStartMeeting({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        toast({ title: "Meeting started" });
      },
    },
  });

  const filtered = meetings?.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.meetingCode.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All Meetings" },
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
            <p className="text-gray-500 mt-1">Manage all your meetings</p>
          </div>
          <Link href="/meetings/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Meeting
            </Button>
          </Link>
        </div>

        {/* Tabs & search */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm sm:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search meetings..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Meeting list */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-4">
            {filtered.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                onDelete={(id) => setDeleteId(id)}
                onStart={(id) => startMutation.mutate({ id })}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Video className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-gray-900 font-medium mb-2">No meetings found</h3>
            <p className="text-gray-500 text-sm mb-4">
              {search ? "Try a different search term" : "Get started by creating your first meeting"}
            </p>
            {!search && (
              <Link href="/meetings/new">
                <Button>Create Meeting</Button>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the meeting and cannot be undone.
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
