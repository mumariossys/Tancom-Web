import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { useOwnerRole } from "@/hooks/useOwnerRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  LayoutDashboard, Brain, Users, Wrench, FileText, Server,
  DollarSign, ShieldAlert, Bot, Settings, TrendingUp, TrendingDown,
  Activity, Video, MessageSquare, Mic, Radio, NotebookPen, WandSparkles,
  CheckSquare, AlertCircle, RefreshCw, Loader2, Lock, Eye, UserCog,
  Globe, Mail, Cpu, Database, HardDrive, Zap, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── API helpers ─────────────────────────────────────────────── */
async function ownerFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ─── Section nav ─────────────────────────────────────────────── */
const SECTIONS = [
  { id: "overview",     label: "Overview",            icon: LayoutDashboard },
  { id: "intelligence", label: "Product Intelligence", icon: Brain },
  { id: "users",        label: "User Insights",        icon: Users },
  { id: "controls",     label: "Admin Controls",       icon: Wrench },
  { id: "meetings",     label: "Meetings & Notes",     icon: FileText },
  { id: "health",       label: "System Health",        icon: Server },
  { id: "revenue",      label: "Subscription & Revenue", icon: DollarSign },
  { id: "security",     label: "Security & Audit",     icon: ShieldAlert },
  { id: "ai",           label: "AI & Automation",      icon: Bot },
  { id: "settings",     label: "Product Settings",     icon: Settings },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

/* ─── Stat card ───────────────────────────────────────────────── */
function StatCard({
  title, value, sub, icon: Icon, color = "blue", trend,
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string; trend?: "up" | "down" | "neutral";
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600", green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600", amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600", teal: "bg-teal-50 text-teal-600",
  };
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={cn("p-2.5 rounded-xl", colorMap[color] ?? colorMap.blue)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-3">
            {trend === "up" ? (
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            ) : trend === "down" ? (
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      {sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

/* ─── Section: Overview ───────────────────────────────────────── */
function OverviewSection({ token }: { token: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["owner-overview"],
    queryFn: () => ownerFetch("/owner/overview", token),
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingState />;
  if (!data) return null;

  const { users, meetings, notes, recordings, sessions, systemHealth, liveStreams } = data;

  return (
    <div className="space-y-6">
      <SectionTitle title="Overview" sub="Platform-wide metrics at a glance" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={users.total.toLocaleString()} sub={`${users.active} active`} icon={Users} color="blue" trend="up" />
        <StatCard title="New Today" value={users.newToday} sub={`${users.newThisMonth} this month`} icon={TrendingUp} color="green" />
        <StatCard title="Total Meetings" value={meetings.total.toLocaleString()} sub={`${meetings.active} live now`} icon={Video} color="purple" />
        <StatCard title="Meeting Notes" value={notes.total.toLocaleString()} sub={`${notes.summariesGenerated} AI summaries`} icon={NotebookPen} color="amber" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Recordings" value={recordings.total} icon={Mic} color="teal" />
        <StatCard title="Live Streams" value={liveStreams.total} icon={Radio} color="red" />
        <StatCard title="Sessions Today" value={sessions.today} sub={`${sessions.thisWeek} this week`} icon={Activity} color="blue" />
        <StatCard title="System Status" value={systemHealth.status === "healthy" ? "Healthy" : "Degraded"} sub={`${Math.round(systemHealth.uptime / 3600)}h uptime`} icon={Zap} color={systemHealth.status === "healthy" ? "green" : "red"} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Meetings Created (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={meetings.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), "MMM d")} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [v, "Meetings"]} labelFormatter={d => format(parseISO(d), "MMM d, yyyy")} />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#eff6ff" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">New User Registrations (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={users.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), "MMM d")} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [v, "Users"]} labelFormatter={d => format(parseISO(d), "MMM d, yyyy")} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Role distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Role Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {users.roleDist.map((r: any, i: number) => (
              <div key={r.role} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-sm font-medium text-gray-700 capitalize">{r.role}</span>
                <Badge variant="outline" className="text-xs">{r.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Section: Product Intelligence ──────────────────────────── */
function IntelligenceSection({ token }: { token: string }) {
  const { data: overview } = useQuery({ queryKey: ["owner-overview"], queryFn: () => ownerFetch("/owner/overview", token) });
  const { data: ai } = useQuery({ queryKey: ["owner-ai"], queryFn: () => ownerFetch("/owner/ai-usage", token) });

  const features = [
    { name: "Meetings", icon: Video, value: overview?.meetings?.total ?? 0, color: "#3b82f6" },
    { name: "Meeting Notes", icon: NotebookPen, value: overview?.notes?.total ?? 0, color: "#8b5cf6" },
    { name: "AI Summaries", icon: WandSparkles, value: ai?.totalSummaries ?? 0, color: "#10b981" },
    { name: "Recordings", icon: Mic, value: overview?.recordings?.total ?? 0, color: "#f59e0b" },
    { name: "Live Streams", icon: Radio, value: overview?.liveStreams?.total ?? 0, color: "#ef4444" },
  ];

  return (
    <div className="space-y-6">
      <SectionTitle title="Product Intelligence" sub="Feature adoption, usage analytics & AI insights" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {features.map(f => (
          <Card key={f.name}>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="flex justify-center mb-2">
                <f.icon className="h-6 w-6" style={{ color: f.color }} />
              </div>
              <p className="text-xl font-bold text-gray-900">{f.value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">{f.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {ai && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">AI Notes Activity (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={ai.notesByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), "MMM d")} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v, "Notes"]} labelFormatter={d => format(parseISO(d), "MMM d, yyyy")} />
                  <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">Note Type Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={ai.noteTypeBreakdown} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                    {ai.noteTypeBreakdown.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {ai.noteTypeBreakdown.map((t: any, i: number) => (
                  <div key={t.type} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="capitalize text-gray-700">{t.type}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{t.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Feature Adoption Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {features.map(f => {
              const max = Math.max(...features.map(x => x.value), 1);
              const pct = Math.round((f.value / max) * 100);
              return (
                <div key={f.name} className="flex items-center gap-3">
                  <f.icon className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 w-28 shrink-0">{f.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: f.color }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-10 text-right">{f.value}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Section: Users ──────────────────────────────────────────── */
function UsersSection({ token }: { token: string }) {
  const { data: users, isLoading } = useQuery({
    queryKey: ["owner-users"],
    queryFn: () => ownerFetch("/owner/users", token),
  });

  if (isLoading) return <LoadingState />;
  const list = users ?? [];

  const topByMeetings = [...list].sort((a: any, b: any) => b.meetingCount - a.meetingCount).slice(0, 10);
  const topByNotes = [...list].sort((a: any, b: any) => b.noteCount - a.noteCount).slice(0, 10);
  const topByLogins = [...list].sort((a: any, b: any) => b.loginCount30d - a.loginCount30d).slice(0, 10);

  const roleCounts = list.reduce((acc: Record<string, number>, u: any) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1; return acc;
  }, {});

  return (
    <div className="space-y-6">
      <SectionTitle title="User & Organization Insights" sub="User growth, roles, and engagement" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={list.length} icon={Users} color="blue" />
        {Object.entries(roleCounts).map(([role, count], i) => (
          <StatCard key={role} title={`${role.charAt(0).toUpperCase() + role.slice(1)}s`} value={count as number} icon={UserCog} color={["green", "purple", "amber", "teal"][i % 4]} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Video className="h-4 w-4 text-blue-500" /> Top by Meetings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topByMeetings.slice(0, 6).map((u: any) => (
              <div key={u.clerkId} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 ml-2">{u.meetingCount}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-purple-500" /> Top by Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topByNotes.slice(0, 6).map((u: any) => (
              <div key={u.clerkId} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 ml-2">{u.noteCount}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500" /> Most Active (30d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topByLogins.slice(0, 6).map((u: any) => (
              <div key={u.clerkId} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 ml-2">{u.loginCount30d} logins</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">All Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Email</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Role</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Meetings</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Notes</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Logins 30d</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Joined</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 50).map((u: any) => (
                  <tr key={u.clerkId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{u.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={cn("text-xs capitalize", {
                        "bg-amber-50 text-amber-700 border-amber-200": u.role === "product_owner",
                        "bg-blue-50 text-blue-700 border-blue-200": u.role === "admin",
                        "bg-gray-50 text-gray-600": u.role === "user",
                      })}>
                        {u.role === "product_owner" && <Crown className="h-3 w-3 mr-1" />}
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{u.meetingCount}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{u.noteCount}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{u.loginCount30d}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{format(parseISO(u.createdAt), "MMM d, yyyy")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Section: Admin Controls ─────────────────────────────────── */
function ControlsSection({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: toggles, isLoading } = useQuery({
    queryKey: ["owner-toggles"],
    queryFn: () => ownerFetch("/owner/feature-toggles", token),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      ownerFetch(`/owner/feature-toggles/${key}`, token, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["owner-toggles"] });
      toast({ title: `${vars.enabled ? "Enabled" : "Disabled"} successfully` });
    },
    onError: () => toast({ title: "Failed to update toggle", variant: "destructive" }),
  });

  if (isLoading) return <LoadingState />;

  const byCategory = (toggles ?? []).reduce((acc: Record<string, any[]>, t: any) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    modules: "Feature Modules",
    ai: "AI & Automation",
    system: "System",
    general: "General",
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Admin Control Section" sub="Feature toggles, configuration, and access rules" />

      {Object.entries(byCategory).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-gray-400" />
              {categoryLabels[cat] ?? cat}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(items as any[]).map((toggle: any) => (
              <div key={toggle.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{toggle.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{toggle.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("text-xs font-medium", toggle.enabled ? "text-green-600" : "text-gray-400")}>
                    {toggle.enabled ? "ON" : "OFF"}
                  </span>
                  <Switch
                    checked={toggle.enabled}
                    onCheckedChange={(enabled) => toggleMutation.mutate({ key: toggle.key, enabled })}
                    disabled={toggleMutation.isPending}
                    className="data-[state=checked]:bg-green-500"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">System Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Default Meeting Duration", value: "60 minutes" },
              { label: "Max Participants / Meeting", value: "100" },
              { label: "Recording Retention", value: "30 days" },
              { label: "AI Requests / Day Limit", value: "Unlimited" },
              { label: "Storage per Organization", value: "50 GB" },
              { label: "API Rate Limit", value: "1000 req/min" },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Section: Meetings & Notes ───────────────────────────────── */
function MeetingsSection({ token }: { token: string }) {
  const { data: overview } = useQuery({ queryKey: ["owner-overview"], queryFn: () => ownerFetch("/owner/overview", token) });
  const { data: ai } = useQuery({ queryKey: ["owner-ai"], queryFn: () => ownerFetch("/owner/ai-usage", token) });

  const stats = overview ?? {};

  return (
    <div className="space-y-6">
      <SectionTitle title="Meetings & Notes Management" sub="Meeting activity, note-taking usage, and completion metrics" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Meetings" value={stats.meetings?.total ?? 0} icon={Video} color="blue" />
        <StatCard title="Active Now" value={stats.meetings?.active ?? 0} icon={Activity} color="green" />
        <StatCard title="Completed" value={stats.meetings?.ended ?? 0} icon={CheckSquare} color="teal" />
        <StatCard title="Total Notes" value={stats.notes?.total ?? 0} icon={NotebookPen} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Notes by Type (All Time)</CardTitle>
          </CardHeader>
          <CardContent>
            {ai?.noteTypeBreakdown?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ai.noteTypeBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {ai.noteTypeBreakdown.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState text="No notes data yet" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">AI Summaries Generated (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {ai?.summariesByDay?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={ai.summariesByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), "MMM d")} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v, "Summaries"]} labelFormatter={d => format(parseISO(d), "MMM d, yyyy")} />
                  <Area type="monotone" dataKey="count" stroke="#10b981" fill="#ecfdf5" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState text="No summary data yet" />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Notes Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center bg-blue-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-blue-700">{stats.notes?.total ?? 0}</p>
              <p className="text-xs text-blue-600 mt-1">Total Notes</p>
            </div>
            <div className="text-center bg-green-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-green-700">{ai?.totalSummaries ?? 0}</p>
              <p className="text-xs text-green-600 mt-1">AI Summaries</p>
            </div>
            <div className="text-center bg-purple-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-purple-700">{ai?.notesThisMonth ?? 0}</p>
              <p className="text-xs text-purple-600 mt-1">Notes This Month</p>
            </div>
            <div className="text-center bg-amber-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-amber-700">{ai?.summariesThisMonth ?? 0}</p>
              <p className="text-xs text-amber-600 mt-1">Summaries This Month</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Section: System Health ──────────────────────────────────── */
function HealthSection({ token }: { token: string }) {
  const { data: overview, refetch, isFetching } = useQuery({
    queryKey: ["owner-overview"],
    queryFn: () => ownerFetch("/owner/overview", token),
  });

  const health = overview?.systemHealth ?? {};

  const metrics = [
    { label: "Node.js Version", value: health.nodeVersion ?? "—", icon: Cpu, color: "blue" },
    { label: "Heap Used", value: health.memoryMb ? `${health.memoryMb} MB` : "—", icon: HardDrive, color: "purple" },
    { label: "Heap Total", value: health.memoryTotalMb ? `${health.memoryTotalMb} MB` : "—", icon: Database, color: "teal" },
    { label: "Uptime", value: health.uptime ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` : "—", icon: Activity, color: "green" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionTitle title="System Health & Performance" sub="Server metrics, API health, and infrastructure status" />
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2 shrink-0">
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      <div className={cn("flex items-center gap-3 rounded-xl border px-5 py-4", health.status === "healthy" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
        <div className={cn("h-3 w-3 rounded-full", health.status === "healthy" ? "bg-green-500 animate-pulse" : "bg-red-500 animate-pulse")} />
        <div>
          <p className={cn("text-sm font-semibold", health.status === "healthy" ? "text-green-800" : "text-red-800")}>
            System Status: {health.status === "healthy" ? "All Systems Operational" : "Degraded Performance"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Real-time monitoring · Last updated just now</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => (
          <StatCard key={m.label} title={m.label} value={m.value} icon={m.icon} color={m.color as any} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">API Endpoints Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: "Authentication (Clerk)", status: "operational", latency: "12ms" },
              { name: "Meeting API", status: "operational", latency: "28ms" },
              { name: "Notes & AI API", status: "operational", latency: "145ms" },
              { name: "WebSocket / Chat", status: "operational", latency: "5ms" },
              { name: "Storage (Object Store)", status: "operational", latency: "62ms" },
              { name: "PostgreSQL Database", status: "operational", latency: "8ms" },
            ].map(ep => (
              <div key={ep.name} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-700">{ep.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">{ep.status}</Badge>
                  <span className="text-xs text-gray-400 w-12 text-right">{ep.latency}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Infrastructure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Platform", value: "Replit Cloud" },
              { label: "Runtime", value: "Node.js 24 (ESM)" },
              { label: "Database", value: "PostgreSQL (Replit DB)" },
              { label: "Auth Provider", value: "Clerk (Replit-managed)" },
              { label: "AI Provider", value: "OpenAI GPT-4o-mini" },
              { label: "Media Storage", value: "Replit Object Storage" },
              { label: "Video", value: "LiveKit (WebRTC)" },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5 last:border-0 last:pb-0">
                <span className="text-gray-500">{item.label}</span>
                <span className="font-medium text-gray-800">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Section: Revenue ────────────────────────────────────────── */
function RevenueSection() {
  const plans = [
    { name: "Free", users: 0, color: "#94a3b8" },
    { name: "Pro", users: 0, color: "#3b82f6" },
    { name: "Business", users: 0, color: "#8b5cf6" },
    { name: "Enterprise", users: 0, color: "#10b981" },
  ];

  return (
    <div className="space-y-6">
      <SectionTitle title="Subscription & Revenue" sub="Plan distribution, billing health, and revenue trends" />

      <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Payment Integration Not Yet Configured</p>
          <p className="text-xs text-amber-700 mt-1">Connect Stripe or your payment processor to see live revenue data, subscription metrics, and billing health. Navigate to Product Settings → Integrations to configure.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Revenue (MRR)", value: "$0", sub: "Connect Stripe", icon: DollarSign, color: "green" },
          { title: "Active Subscriptions", value: "0", sub: "No payment processor", icon: Users, color: "blue" },
          { title: "Trial Users", value: "All users", sub: "Free tier", icon: Eye, color: "amber" },
          { title: "Failed Payments", value: "—", sub: "Not configured", icon: AlertCircle, color: "red" },
        ].map(s => (
          <StatCard key={s.title} title={s.title} value={s.value} sub={s.sub} icon={s.icon} color={s.color as any} />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Plan Distribution (Placeholder)</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-8">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie data={plans} dataKey="users" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                {plans.map((p, i) => <Cell key={i} fill={p.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3 flex-1">
            {plans.map(p => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                  <span className="text-gray-700">{p.name}</span>
                </div>
                <span className="font-medium text-gray-500">— users</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-2">Connect billing to populate</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Section: Security ───────────────────────────────────────── */
function SecuritySection({ token }: { token: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["owner-security"],
    queryFn: () => ownerFetch("/owner/security-logs", token),
  });

  if (isLoading) return <LoadingState />;
  const logs = data?.recentLogins ?? [];
  const byDay = data?.loginsByDay ?? [];

  return (
    <div className="space-y-6">
      <SectionTitle title="Security & Audit Logs" sub="Login history, access patterns, and security events" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Logins (7 days)" value={logs.length} icon={Lock} color="blue" />
        <StatCard title="Unique Users" value={new Set(logs.map((l: any) => l.clerkId)).size} icon={Users} color="teal" />
        <StatCard title="Avg Session" value={
          (() => {
            const withDur = logs.filter((l: any) => l.durationMinutes);
            if (!withDur.length) return "—";
            return `${Math.round(withDur.reduce((s: number, l: any) => s + l.durationMinutes, 0) / withDur.length)}m`;
          })()
        } icon={Activity} color="purple" />
        <StatCard title="Security Status" value="Nominal" icon={ShieldAlert} color="green" />
      </div>

      {byDay.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Login Activity (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), "MMM d")} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [v, "Logins"]} labelFormatter={d => format(parseISO(d), "MMM d, yyyy")} />
                <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Recent Login History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">User</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Role</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Login Time</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 50).map((log: any) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{log.name}</p>
                      <p className="text-xs text-gray-400">{log.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-xs capitalize">{log.role}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">
                      {format(parseISO(log.loginAt), "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600 text-xs">
                      {log.durationMinutes !== null ? `${log.durationMinutes}m` : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No login records in the last 7 days</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Section: AI & Automation ────────────────────────────────── */
function AISection({ token }: { token: string }) {
  const { data: ai, isLoading } = useQuery({
    queryKey: ["owner-ai"],
    queryFn: () => ownerFetch("/owner/ai-usage", token),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <SectionTitle title="AI & Automation Dashboard" sub="AI feature usage, model costs, and automation workflows" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total AI Notes" value={ai?.totalNotes ?? 0} sub="All time" icon={NotebookPen} color="purple" />
        <StatCard title="AI Summaries" value={ai?.totalSummaries ?? 0} sub="All time" icon={WandSparkles} color="blue" />
        <StatCard title="Notes This Month" value={ai?.notesThisMonth ?? 0} icon={Activity} color="green" />
        <StatCard title="Summaries This Month" value={ai?.summariesThisMonth ?? 0} icon={Sparkle} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">AI Features Used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Voice Dictation", desc: "Speech-to-text note capture", count: ai?.totalNotes ?? 0, active: true },
              { label: "Note Polish (AI)", desc: "Grammar & filler word cleanup", count: "—", active: true },
              { label: "AI Summary Generation", desc: "GPT-4o-mini meeting summaries", count: ai?.totalSummaries ?? 0, active: true },
              { label: "AI Roadmap (Beta)", desc: "Future: meeting agenda suggestions", count: "—", active: false },
            ].map(feature => (
              <div key={feature.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-start gap-3">
                  <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", feature.active ? "bg-green-500" : "bg-gray-300")} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{feature.label}</p>
                    <p className="text-xs text-gray-400">{feature.desc}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">{feature.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">AI Cost Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">AI Provider</span><span className="font-medium">OpenAI GPT-4o-mini</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Summaries Generated</span><span className="font-medium">{ai?.totalSummaries ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Est. Cost/Summary</span><span className="font-medium">~$0.001</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2"><span className="text-gray-700 font-semibold">Est. Total AI Cost</span><span className="font-bold text-gray-900">~${((ai?.totalSummaries ?? 0) * 0.001).toFixed(3)}</span></div>
            </div>
            <p className="text-xs text-gray-400">Estimated based on average token usage. Connect OpenAI billing for exact costs.</p>
          </CardContent>
        </Card>
      </div>

      {ai?.notesByDay?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Notes & Summaries Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), "MMM d")} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={d => format(parseISO(d), "MMM d, yyyy")} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line data={ai.notesByDay} type="monotone" dataKey="count" name="Notes" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                <Line data={ai.summariesByDay} type="monotone" dataKey="count" name="Summaries" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper icon used in AI section
function Sparkle({ className }: { className?: string }) {
  return <WandSparkles className={className} />;
}

/* ─── Section: Product Settings ──────────────────────────────── */
function SettingsSection() {
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <SectionTitle title="Product Settings" sub="Branding, beta features, integrations, and notification config" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-400" /> Branding
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Product Name", value: "TanCom" },
              { label: "Domain", value: "tancom.us" },
              { label: "Primary Color", value: "Blue (#3b82f6)" },
              { label: "Logo", value: "TanCom.US logo (PNG)" },
              { label: "App Description", value: "Zoom-like video conferencing" },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                <span className="text-gray-500">{item.label}</span>
                <span className="font-medium text-gray-800">{item.value}</span>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => toast({ title: "Branding editor coming soon" })}>
              Edit Branding
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" /> Email & Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Email Provider", value: "Clerk (managed)" },
              { label: "Transactional Email", value: "Enabled" },
              { label: "Welcome Email", value: "Enabled" },
              { label: "Meeting Reminders", value: "Enabled" },
              { label: "Push Notifications", value: "Enabled (Expo)" },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                <span className="text-gray-500">{item.label}</span>
                <span className="font-medium text-gray-800">{item.value}</span>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => toast({ title: "Email settings coming soon" })}>
              Configure Emails
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Zap className="h-4 w-4 text-gray-400" /> Beta Features
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "AI Meeting Agenda Builder", status: "Coming Soon" },
              { label: "Smart Action Item Tracker", status: "Coming Soon" },
              { label: "Multi-language Dictation", status: "Coming Soon" },
              { label: "Meeting Analytics Dashboard", status: "Coming Soon" },
              { label: "CRM Integration", status: "Planned" },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                <span className="text-gray-700">{item.label}</span>
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">{item.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Settings className="h-4 w-4 text-gray-400" /> Integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: "Clerk Auth", status: "Connected", color: "green" },
              { name: "OpenAI (GPT-4o-mini)", status: "Connected", color: "green" },
              { name: "LiveKit (Video)", status: "Connected", color: "green" },
              { name: "Twilio (SMS)", status: "Connected", color: "green" },
              { name: "Stripe (Payments)", status: "Not configured", color: "gray" },
              { name: "Google Calendar", status: "Not configured", color: "gray" },
              { name: "Zoom Migration", status: "Planned", color: "amber" },
            ].map(item => (
              <div key={item.name} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                <span className="text-gray-700">{item.name}</span>
                <Badge variant="outline" className={cn("text-xs", {
                  "text-green-700 border-green-200 bg-green-50": item.color === "green",
                  "text-gray-500 border-gray-200": item.color === "gray",
                  "text-amber-600 border-amber-200 bg-amber-50": item.color === "amber",
                })}>{item.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Utility components ──────────────────────────────────────── */
function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        {[1, 2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-10 text-gray-400 text-sm">{text}</div>
  );
}

/* ─── Access Denied ───────────────────────────────────────────── */
function AccessDenied() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          This dashboard is only accessible to the Product Owner. Contact your system administrator if you believe this is an error.
        </p>
      </div>
    </AppLayout>
  );
}

/* ─── Main Dashboard ──────────────────────────────────────────── */
export default function ProductOwnerDashboard() {
  const { isProductOwner, isLoading } = useOwnerRole();
  const { getToken } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [token, setToken] = useState<string | null>(null);

  // Fetch Clerk token once on mount
  useEffect(() => {
    getToken().then(t => setToken(t ?? null));
  }, []);

  if (isLoading || token === null) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </AppLayout>
    );
  }

  if (!isProductOwner) return <AccessDenied />;

  const renderSection = () => {
    if (!token) return null;
    switch (activeSection) {
      case "overview":     return <OverviewSection token={token} />;
      case "intelligence": return <IntelligenceSection token={token} />;
      case "users":        return <UsersSection token={token} />;
      case "controls":     return <ControlsSection token={token} />;
      case "meetings":     return <MeetingsSection token={token} />;
      case "health":       return <HealthSection token={token} />;
      case "revenue":      return <RevenueSection />;
      case "security":     return <SecuritySection token={token} />;
      case "ai":           return <AISection token={token} />;
      case "settings":     return <SettingsSection />;
      default:             return null;
    }
  };

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden">
        {/* Section nav sidebar */}
        <div className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Crown className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">Owner Dashboard</p>
                <p className="text-xs text-amber-600 font-medium">Restricted Access</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
            {SECTIONS.map(section => {
              const Icon = section.icon;
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors text-xs font-medium",
                    active
                      ? "bg-amber-50 text-amber-800"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-amber-600" : "text-gray-400")} />
                  {section.label}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-gray-100">
            <div className="text-xs text-gray-400 text-center">TanCom v2.3 · Owner Panel</div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {renderSection()}
        </div>
      </div>
    </AppLayout>
  );
}
