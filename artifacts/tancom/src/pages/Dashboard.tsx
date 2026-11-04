import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Video,
  Clock,
  Mic,
  Users,
  Plus,
  Calendar,
  ArrowRight,
  Activity,
  LogIn,
  Link2,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import {
  getDashboardSummary,
  getGetDashboardSummaryQueryKey,
  getUpcomingMeetings,
  getGetUpcomingMeetingsQueryKey,
  getRecentActivity,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import JoinMeetingModal from "@/components/JoinMeetingModal";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-gray-900">{value}</p>
            )}
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type UpcomingMeeting = { id: number; title: string; scheduledAt?: string | null; status: string; meetingCode?: string | null };

function UpcomingMeetingCard({ meeting: m }: { meeting: UpcomingMeeting }) {
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!m.meetingCode) return;
    navigator.clipboard.writeText(m.meetingCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [m.meetingCode]);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => setLocation(`/meetings/${m.id}`)}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 flex-shrink-0">
        <Video className="h-5 w-5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{m.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-xs text-gray-500">
            {m.scheduledAt ? format(new Date(m.scheduledAt), "MMM d 'at' h:mm a") : "Instant"}
          </p>
          {m.meetingCode && (
            <button
              onClick={copyCode}
              className="inline-flex items-center gap-1 text-xs font-mono bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-600 px-1.5 py-0.5 rounded transition-colors"
              title="Copy meeting ID"
            >
              {m.meetingCode}
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
      <Badge className={meetingStatusBadge(m.status)} variant="outline">
        {m.status}
      </Badge>
    </div>
  );
}

function meetingStatusBadge(status: string) {
  const map: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    active: "bg-green-50 text-green-700 border-green-200",
    ended: "bg-gray-50 text-gray-600 border-gray-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
  };
  return map[status] || map.scheduled;
}

function activityIcon(type: string) {
  const map: Record<string, { icon: React.ElementType; color: string }> = {
    meeting_started: { icon: Video, color: "text-green-500" },
    meeting_ended: { icon: Clock, color: "text-gray-500" },
    meeting_scheduled: { icon: Calendar, color: "text-blue-500" },
    recording_available: { icon: Mic, color: "text-purple-500" },
    participant_joined: { icon: Users, color: "text-orange-500" },
  };
  return map[type] || map.meeting_scheduled;
}

export default function DashboardPage() {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState(false);
  const joinInputRef = useRef<HTMLInputElement>(null);

  const handleQuickJoin = () => {
    const code = joinCode.trim();
    if (!code || code.length < 4) {
      setJoinError(true);
      joinInputRef.current?.focus();
      return;
    }
    // Extract code from full URL if pasted
    const urlMatch = code.match(/\/meetings\/([^/?#\s]+)(?:\/join)?/i);
    const resolved = urlMatch ? urlMatch[1] : code;
    setJoinOpen(false);
    setLocation(`/meetings/${encodeURIComponent(resolved)}/join`);
  };

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: getGetDashboardSummaryQueryKey(),
    queryFn: getDashboardSummary,
  });

  const { data: upcoming, isLoading: upcomingLoading } = useQuery({
    queryKey: getGetUpcomingMeetingsQueryKey(),
    queryFn: getUpcomingMeetings,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: getGetRecentActivityQueryKey(),
    queryFn: getRecentActivity,
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        <JoinMeetingModal open={joinOpen} onClose={() => setJoinOpen(false)} />

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {greeting()}, {user?.firstName ?? "there"}!
            </h1>
            <p className="text-gray-500 mt-1">Here's your meeting overview</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setJoinOpen(true)}>
              <LogIn className="h-4 w-4" />
              Join Meeting
            </Button>
            <Link href="/meetings/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Meeting
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick-join card */}
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <LogIn className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 mb-0.5">Join a meeting</p>
              <p className="text-xs text-gray-500">Enter a meeting ID or paste an invite link to join instantly</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  ref={joinInputRef}
                  value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value); setJoinError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleQuickJoin()}
                  placeholder="Meeting ID or link"
                  className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 transition-colors ${
                    joinError
                      ? "border-red-400 focus:ring-red-300"
                      : "border-gray-300 focus:ring-blue-300 focus:border-blue-400"
                  }`}
                  spellCheck={false}
                  autoComplete="off"
                />
                {joinError && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 pointer-events-none" />
                )}
              </div>
              <button
                onClick={handleQuickJoin}
                className="shrink-0 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors active:scale-95"
              >
                Join
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {joinError && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1.5 pl-14 sm:pl-0">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Please enter a valid meeting ID (at least 4 characters).
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Meetings"
            value={summary?.totalMeetings ?? 0}
            icon={Video}
            color="bg-blue-100 text-blue-600"
            loading={summaryLoading}
          />
          <StatCard
            title="Upcoming"
            value={summary?.upcomingMeetings ?? 0}
            icon={Calendar}
            color="bg-green-100 text-green-600"
            loading={summaryLoading}
          />
          <StatCard
            title="Recordings"
            value={summary?.totalRecordings ?? 0}
            icon={Mic}
            color="bg-purple-100 text-purple-600"
            loading={summaryLoading}
          />
          <StatCard
            title="Contacts"
            value={summary?.totalContacts ?? 0}
            icon={Users}
            color="bg-orange-100 text-orange-600"
            loading={summaryLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming meetings */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Upcoming Meetings</CardTitle>
                <Link href="/meetings">
                  <Button variant="ghost" size="sm" className="gap-1 text-blue-600 hover:text-blue-700 h-auto p-0">
                    View all <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : upcoming && upcoming.length > 0 ? (
                <div className="space-y-3">
                  {upcoming.map((m) => (
                    <UpcomingMeetingCard key={m.id} meeting={m} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No upcoming meetings</p>
                  <Link href="/meetings/new">
                    <Button size="sm" variant="outline" className="mt-3">
                      Schedule one
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : activity && activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.slice(0, 6).map((a) => {
                    const { icon: Icon, color } = activityIcon(a.type);
                    return (
                      <div key={a.id} className="flex items-start gap-3">
                        <div className={`mt-0.5 flex-shrink-0 ${color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">{a.description}</p>
                          <p className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(a.occurredAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* This month */}
        {summary && (
          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-blue-100 text-sm mb-1">This month</p>
                  <p className="text-3xl font-bold">{summary.meetingsThisMonth} meetings</p>
                  <p className="text-blue-200 text-sm mt-1">
                    {summary.totalMeetingMinutes} total minutes hosted
                  </p>
                </div>
                <Link href="/meetings/new">
                  <Button variant="secondary" className="bg-white text-blue-600 hover:bg-blue-50 gap-2">
                    <Plus className="h-4 w-4" />
                    Start a meeting
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
