import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  Users,
  Video,
  Mic,
  Activity,
  TrendingUp,
  MoreVertical,
  Search,
  Shield,
  UserCheck,
  UserPlus,
  Clock,
  Timer,
  CalendarDays,
} from "lucide-react";
import {
  adminListUsers,
  getAdminListUsersQueryKey,
  getAdminAnalytics,
  getGetAdminAnalyticsQueryKey,
  adminListMeetings,
  getAdminListMeetingsQueryKey,
  useAdminUpdateUser,
  getAdminSessionAnalytics,
  getGetAdminSessionAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";

type Tab = "analytics" | "sessions" | "users" | "meetings";

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-1">{title}</p>
            {loading ? (
              <Skeleton className="h-7 w-14" />
            ) : (
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            )}
            {sub && !loading && (
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            )}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function fmtMinutes(mins: number): string {
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtHours(hours: number): string {
  if (hours < 0.017) return "< 1 min";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: getGetAdminAnalyticsQueryKey(),
    queryFn: getAdminAnalytics,
    enabled: tab === "analytics",
  });

  const { data: sessionAnalytics, isLoading: sessionLoading } = useQuery({
    queryKey: getGetAdminSessionAnalyticsQueryKey(),
    queryFn: getAdminSessionAnalytics,
    enabled: tab === "sessions",
    refetchInterval: 60_000,
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: getAdminListUsersQueryKey(),
    queryFn: () => adminListUsers(),
    enabled: tab === "users",
  });

  const { data: meetings, isLoading: meetingsLoading } = useQuery({
    queryKey: getAdminListMeetingsQueryKey(),
    queryFn: () => adminListMeetings(),
    enabled: tab === "meetings",
  });

  const updateUserMutation = useAdminUpdateUser({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() }),
    },
  });

  const filteredUsers = users?.filter(
    (u) =>
      (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const tabs: { key: Tab; label: string }[] = [
    { key: "analytics", label: "Analytics" },
    { key: "sessions", label: "Sessions" },
    { key: "users", label: "Users" },
    { key: "meetings", label: "All Meetings" },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <Shield className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm">Platform management and analytics</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Analytics ───────────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Users"
                value={analytics?.totalUsers ?? 0}
                icon={Users}
                color="bg-blue-100 text-blue-600"
                loading={analyticsLoading}
              />
              <StatCard
                title="Active Users"
                value={analytics?.activeUsers ?? 0}
                icon={UserCheck}
                color="bg-green-100 text-green-600"
                loading={analyticsLoading}
              />
              <StatCard
                title="New Today"
                value={analytics?.newUsersToday ?? 0}
                sub={`${analytics?.newUsersThisWeek ?? 0} this week`}
                icon={UserPlus}
                color="bg-emerald-100 text-emerald-600"
                loading={analyticsLoading}
              />
              <StatCard
                title="Total Meetings"
                value={analytics?.totalMeetings ?? 0}
                sub={`${analytics?.activeMeetings ?? 0} active now`}
                icon={Video}
                color="bg-purple-100 text-purple-600"
                loading={analyticsLoading}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Meetings per day */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    Meetings per Day — Last 7 Days
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={analytics?.meetingsByDay ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          tickFormatter={(v) => format(new Date(v), "MMM d")}
                        />
                        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
                        <Tooltip
                          labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")}
                          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                        />
                        <Bar dataKey="count" name="Meetings" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Registrations per day */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-emerald-500" />
                    New Registrations — Last 7 Days
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={analytics?.registrationsByDay ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          tickFormatter={(v) => format(new Date(v), "MMM d")}
                        />
                        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
                        <Tooltip
                          labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")}
                          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                        />
                        <Bar dataKey="count" name="New Users" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StatCard
                title="Total Recordings"
                value={analytics?.totalRecordings ?? 0}
                icon={Mic}
                color="bg-red-100 text-red-600"
                loading={analyticsLoading}
              />
              <StatCard
                title="Active Meetings Now"
                value={analytics?.activeMeetings ?? 0}
                icon={Activity}
                color="bg-orange-100 text-orange-600"
                loading={analyticsLoading}
              />
            </div>
          </div>
        )}

        {/* ── Sessions ────────────────────────────────────────────────────── */}
        {tab === "sessions" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Sessions Today"
                value={sessionAnalytics?.totalSessionsToday ?? 0}
                icon={Activity}
                color="bg-blue-100 text-blue-600"
                loading={sessionLoading}
              />
              <StatCard
                title="Login Hours Today"
                value={fmtHours(sessionAnalytics?.totalLoginHoursToday ?? 0)}
                icon={Clock}
                color="bg-purple-100 text-purple-600"
                loading={sessionLoading}
              />
              <StatCard
                title="Avg Session Length"
                value={fmtMinutes(sessionAnalytics?.avgSessionMinutesToday ?? 0)}
                sub="today"
                icon={Timer}
                color="bg-orange-100 text-orange-600"
                loading={sessionLoading}
              />
              <StatCard
                title="Login Hours This Week"
                value={fmtHours(sessionAnalytics?.totalLoginHoursThisWeek ?? 0)}
                icon={CalendarDays}
                color="bg-green-100 text-green-600"
                loading={sessionLoading}
              />
            </div>

            {/* Login minutes by day chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-500" />
                  Daily Login Time — Last 14 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sessionLoading ? (
                  <Skeleton className="h-56 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={(sessionAnalytics?.loginMinutesByDay ?? []).map((d) => ({
                      ...d,
                      hours: +(d.minutes / 60).toFixed(2),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickFormatter={(v) => format(new Date(v), "MMM d")}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickFormatter={(v) => `${v}h`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                      />
                      <Tooltip
                        labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")}
                        formatter={(value: number, name: string) =>
                          name === "hours"
                            ? [`${value}h`, "Login Hours"]
                            : [value, "Sessions"]
                        }
                        contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                      />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="hours"
                        name="Login Hours"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="sessions"
                        name="Sessions"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        strokeDasharray="5 5"
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top users by login time */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  Users by Login Time This Week
                </CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Today</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">This Week</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Sessions</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Last Login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sessionLoading
                      ? [...Array(4)].map((_, i) => (
                          <tr key={i}>
                            <td colSpan={5} className="px-4 py-3">
                              <Skeleton className="h-8 w-full" />
                            </td>
                          </tr>
                        ))
                      : (sessionAnalytics?.topUsersByTime ?? []).map((u) => (
                          <tr key={u.clerkId} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-medium flex-shrink-0">
                                  {(u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{u.name ?? "—"}</p>
                                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                              {fmtMinutes(u.totalMinutesToday)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                              {fmtMinutes(u.totalMinutesThisWeek)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{u.sessionCount}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {u.lastLoginAt
                                ? format(new Date(u.lastLoginAt), "MMM d, h:mm a")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
                {!sessionLoading && (sessionAnalytics?.topUsersByTime ?? []).length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Clock className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">No session data yet</p>
                    <p className="text-xs text-gray-400 mt-1">Session data will appear as users log in</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Users ───────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search users..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {usersLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Meetings</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Last Login</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredUsers.map((u) => (
                        <tr key={u.clerkId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium flex-shrink-0">
                                {(u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{u.name ?? "—"}</p>
                                <p className="text-xs text-gray-500 truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={u.role === "admin" ? "bg-blue-50 text-blue-700 border-blue-200" : "text-gray-600"}>
                              {u.role}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{u.meetingCount}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={u.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500"}>
                              {u.isActive ? "Active" : "Suspended"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {u.lastLoginAt ? format(new Date(u.lastLoginAt), "MMM d, h:mm a") : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {format(new Date(u.createdAt), "MMM d, yyyy")}
                          </td>
                          <td className="px-4 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => updateUserMutation.mutate({
                                    userId: u.clerkId,
                                    data: { role: u.role === "admin" ? "user" : "admin" }
                                  })}
                                >
                                  {u.role === "admin" ? "Remove admin" : "Make admin"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => updateUserMutation.mutate({
                                    userId: u.clerkId,
                                    data: { isActive: !u.isActive }
                                  })}
                                >
                                  {u.isActive ? "Suspend user" : "Reactivate user"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <Users className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No users found</p>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── All Meetings ─────────────────────────────────────────────────── */}
        {tab === "meetings" && (
          <div className="space-y-4">
            {meetingsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Meeting</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Host</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(meetings ?? []).map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{m.title}</p>
                            <p className="text-xs text-gray-500 font-mono">{m.meetingCode}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{m.hostName}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={
                              m.status === "active" ? "bg-green-50 text-green-700 border-green-200" :
                              m.status === "scheduled" ? "bg-blue-50 text-blue-700 border-blue-200" :
                              "bg-gray-50 text-gray-600"
                            }>
                              {m.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="capitalize text-gray-600">{m.type}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {format(new Date(m.createdAt), "MMM d, yyyy")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(meetings ?? []).length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <Video className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No meetings found</p>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
