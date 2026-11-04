import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SmartTextarea, SmartInput } from "@/components/SmartField";
import { useUser, useAuth } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import {
  Monitor, Plus, Trash2, Wifi, WifiOff, Clock, Shield, ShieldCheck,
  FileText, MessageSquare, Users, Activity, AlertTriangle, CheckCircle2,
  XCircle, PlayCircle, StopCircle, RefreshCw, Download, Upload,
  Settings, ChevronDown, Search, Filter, MoreVertical, Laptop,
  Globe, MapPin, Cpu, BarChart2, Bell, Lock, Eye, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = "/api";

type Tab = "dashboard" | "devices" | "sessions" | "requests" | "settings";

interface Device {
  id: number;
  name: string;
  os: string;
  ip: string | null;
  location: string | null;
  status: "online" | "offline" | "idle";
  trusted: boolean;
  agentVersion: string | null;
  notes: string | null;
  lastActiveAt: string | null;
  createdAt: string;
}

interface Session {
  id: number;
  deviceId: number;
  technicianName: string;
  status: "active" | "ended";
  recorded: boolean;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
}

interface SupportRequest {
  id: number;
  requesterName: string;
  message: string;
  status: "pending" | "active" | "resolved" | "declined";
  priority: "low" | "normal" | "high" | "urgent";
  createdAt: string;
  resolvedAt: string | null;
  deviceId: number | null;
}

function fetchJson(url: string, opts?: RequestInit) {
  return fetch(url, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

function StatusDot({ status }: { status: Device["status"] }) {
  const colors = { online: "bg-green-400", offline: "bg-gray-500", idle: "bg-yellow-400" };
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${colors[status]}`} />;
}

function PriorityBadge({ priority }: { priority: SupportRequest["priority"] }) {
  const cfg = {
    low: "bg-gray-100 text-gray-600",
    normal: "bg-blue-100 text-blue-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg[priority]}`}>{priority}</span>;
}

function StatusBadge({ status }: { status: SupportRequest["status"] }) {
  const cfg = {
    pending: "bg-yellow-100 text-yellow-700",
    active: "bg-green-100 text-green-700",
    resolved: "bg-gray-100 text-gray-600",
    declined: "bg-red-100 text-red-600",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg[status]}`}>{status}</span>;
}

function formatDuration(secs: number | null) {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function RemoteAccessPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const apiFetch = async (url: string, opts?: RequestInit) => {
    const token = await getToken();
    const res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const [tab, setTab] = useState<Tab>("dashboard");
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [activeSession, setActiveSession] = useState<{ deviceId: number; deviceName: string } | null>(null);
  const [pendingSession, setPendingSession] = useState<{
    meetingCode: string;
    meetingId: number;
    deviceName: string;
    status: "waiting" | "connected";
  } | null>(null);
  const [sessionChat, setSessionChat] = useState<Array<{ from: string; text: string; time: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [searchDevice, setSearchDevice] = useState("");

  // ── Forms ──────────────────────────────────────────────────────────────────
  const [deviceForm, setDeviceForm] = useState({ name: "", os: "Windows", ip: "", location: "", notes: "" });
  const [requestForm, setRequestForm] = useState({ message: "", priority: "normal" as SupportRequest["priority"], deviceId: "" });

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["remote-devices"],
    queryFn: () => apiFetch(`${BASE}/remote/devices`),
  });

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["remote-sessions"],
    queryFn: () => apiFetch(`${BASE}/remote/sessions`),
  });

  const { data: requests = [] } = useQuery<SupportRequest[]>({
    queryKey: ["remote-requests"],
    queryFn: () => apiFetch(`${BASE}/remote/requests`),
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const addDevice = useMutation({
    mutationFn: (data: typeof deviceForm) => apiFetch(`${BASE}/remote/devices`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["remote-devices"] }); setShowAddDevice(false); setDeviceForm({ name: "", os: "Windows", ip: "", location: "", notes: "" }); toast({ title: "Device registered" }); },
    onError: () => toast({ title: "Failed to register device", description: "Please try again.", variant: "destructive" }),
  });

  const deleteDevice = useMutation({
    mutationFn: (id: number) => apiFetch(`${BASE}/remote/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["remote-devices"] }); toast({ title: "Device removed" }); },
    onError: () => toast({ title: "Failed to remove device", variant: "destructive" }),
  });

  const toggleTrust = useMutation({
    mutationFn: ({ id, trusted }: { id: number; trusted: boolean }) =>
      apiFetch(`${BASE}/remote/devices/${id}`, { method: "PATCH", body: JSON.stringify({ trusted }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remote-devices"] }),
    onError: () => toast({ title: "Failed to update device", variant: "destructive" }),
  });

  const startSession = useMutation({
    mutationFn: async ({ deviceId }: { deviceId: number }) => {
      const dev = devices.find(d => d.id === deviceId);
      const result = await apiFetch(`${BASE}/remote/launch`, {
        method: "POST",
        body: JSON.stringify({ deviceName: dev?.name }),
      });
      await apiFetch(`${BASE}/remote/sessions`, {
        method: "POST",
        body: JSON.stringify({ deviceId, technicianName: user?.fullName ?? "Technician", recorded: true }),
      });
      return {
        meetingCode: result.meetingCode as string,
        meetingId: result.meetingId as number,
        deviceId,
        deviceName: dev?.name ?? "Device",
      };
    },
    onSuccess: ({ meetingCode, meetingId, deviceId, deviceName }) => {
      qc.invalidateQueries({ queryKey: ["remote-sessions"] });
      setActiveSession({ deviceId, deviceName });
      setPendingSession({ meetingCode, meetingId, deviceName, status: "waiting" });
      toast({ title: "Session started", description: "Opening meeting room and waiting for the device to connect…" });
      window.open(`/meeting/${meetingCode}?remoteSession=true`, "_blank", "noopener");
    },
    onError: () => toast({ title: "Failed to start session", variant: "destructive" }),
  });

  // Poll participants list while waiting for the remote device to join
  const { data: pendingParticipants } = useQuery<Array<{ id: number; role: string }>>({
    queryKey: ["pending-session-participants", pendingSession?.meetingId],
    queryFn: () => apiFetch(`${BASE}/meetings/${pendingSession!.meetingId}/participants`),
    enabled: pendingSession?.status === "waiting" && !!pendingSession?.meetingId,
    refetchInterval: 2000,
  });

  // Transition to "connected" once a second participant joins (device joined the room)
  useEffect(() => {
    if (pendingSession?.status === "waiting" && (pendingParticipants?.length ?? 0) >= 2) {
      setPendingSession(prev => prev ? { ...prev, status: "connected" } : null);
    }
  }, [pendingParticipants?.length, pendingSession?.status]);

  const endSession = useMutation({
    mutationFn: (id: number) => apiFetch(`${BASE}/remote/sessions/${id}/end`, { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["remote-sessions"] }); setActiveSession(null); toast({ title: "Session ended" }); },
    onError: () => toast({ title: "Failed to end session", variant: "destructive" }),
  });

  const submitRequest = useMutation({
    mutationFn: (data: typeof requestForm) =>
      apiFetch(`${BASE}/remote/requests`, { method: "POST", body: JSON.stringify({ ...data, requesterName: user?.fullName ?? "User", deviceId: data.deviceId ? parseInt(data.deviceId) : undefined }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["remote-requests"] }); setShowNewRequest(false); setRequestForm({ message: "", priority: "normal", deviceId: "" }); toast({ title: "Support request submitted" }); },
    onError: () => toast({ title: "Failed to submit request", variant: "destructive" }),
  });

  const updateRequest = useMutation({
    mutationFn: ({ id, status }: { id: number; status: SupportRequest["status"] }) =>
      apiFetch(`${BASE}/remote/requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remote-requests"] }),
    onError: () => toast({ title: "Failed to update request", variant: "destructive" }),
  });

  const onlineDevices = devices.filter(d => d.status === "online").length;
  const activeSessionRow = sessions.find(s => s.status === "active");
  const pendingRequests = requests.filter(r => r.status === "pending").length;
  const filteredDevices = devices.filter(d => d.name.toLowerCase().includes(searchDevice.toLowerCase()));

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart2 className="h-4 w-4" /> },
    { id: "devices", label: "Devices", icon: <Monitor className="h-4 w-4" /> },
    { id: "sessions", label: "Sessions", icon: <Activity className="h-4 w-4" /> },
    { id: "requests", label: "Support Requests", icon: <MessageSquare className="h-4 w-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Monitor className="h-5 w-5 text-blue-600" />
                Remote Access
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Secure remote device management and support</p>
            </div>
            <div className="flex items-center gap-2">
              {activeSessionRow && activeSession && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-700 font-medium">Active session: {activeSession.deviceName}</span>
                  <button onClick={() => endSession.mutate(activeSessionRow.id)} className="text-xs text-red-600 hover:text-red-700 font-medium ml-1">End</button>
                </div>
              )}
              <Button size="sm" onClick={() => setShowAddDevice(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Register Device
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowNewRequest(true)} className="gap-2">
                <MessageSquare className="h-4 w-4" /> Request Support
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-4">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  tab === t.id ? "border-blue-600 text-blue-600 bg-blue-50/50" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.icon}{t.label}
                {t.id === "requests" && pendingRequests > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold">{pendingRequests}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Pending session panel ─────────────────────────────────────── */}
        {pendingSession && (
          <div className={`mx-6 mt-4 rounded-xl border p-4 flex items-center gap-4 ${
            pendingSession.status === "connected"
              ? "bg-green-50 border-green-200"
              : "bg-blue-50 border-blue-200"
          }`}>
            {pendingSession.status === "waiting" ? (
              <>
                <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-blue-900 text-sm">Waiting for {pendingSession.deviceName} to connect…</p>
                  <p className="text-blue-600 text-xs mt-0.5">The remote meeting is open in a new tab. The device must join to establish the session.</p>
                </div>
                <button onClick={() => setPendingSession(null)} className="text-blue-400 hover:text-blue-600 transition-colors" title="Dismiss">
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-green-900 text-sm">{pendingSession.deviceName} connected!</p>
                  <p className="text-green-600 text-xs mt-0.5">Session is active. Switch to the meeting tab to start the remote session.</p>
                </div>
                <button
                  onClick={() => window.open(`/meeting/${pendingSession.meetingCode}?remoteSession=true`, "_blank", "noopener")}
                  className="text-xs text-green-700 hover:text-green-900 border border-green-300 hover:border-green-400 rounded-lg px-3 py-1 font-medium transition-colors"
                >
                  Open Meeting
                </button>
                <button onClick={() => setPendingSession(null)} className="text-green-400 hover:text-green-600 transition-colors" title="Dismiss">
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">

          {/* ── Dashboard ── */}
          {tab === "dashboard" && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Registered Devices", value: devices.length, icon: <Monitor className="h-5 w-5 text-blue-600" />, color: "bg-blue-50" },
                  { label: "Online Now", value: onlineDevices, icon: <Wifi className="h-5 w-5 text-green-600" />, color: "bg-green-50" },
                  { label: "Sessions Today", value: sessions.filter(s => new Date(s.startedAt).toDateString() === new Date().toDateString()).length, icon: <Activity className="h-5 w-5 text-purple-600" />, color: "bg-purple-50" },
                  { label: "Open Requests", value: pendingRequests, icon: <MessageSquare className="h-5 w-5 text-orange-600" />, color: "bg-orange-50" },
                ].map(stat => (
                  <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl ${stat.color} flex items-center justify-center shrink-0`}>{stat.icon}</div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                      <p className="text-xs text-gray-500">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Feature cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { icon: <Shield className="h-5 w-5 text-blue-600" />, title: "End-to-End Encrypted", desc: "All remote sessions are AES-256 encrypted. No data passes through unencrypted intermediaries.", color: "bg-blue-50 border-blue-200" },
                  { icon: <Lock className="h-5 w-5 text-purple-600" />, title: "Session Authentication", desc: "Every connection requires multi-factor verification before granting access.", color: "bg-purple-50 border-purple-200" },
                  { icon: <Eye className="h-5 w-5 text-green-600" />, title: "Full Audit Trail", desc: "Every session, keystroke log, and file transfer is recorded and stored for compliance.", color: "bg-green-50 border-green-200" },
                  { icon: <Cpu className="h-5 w-5 text-orange-600" />, title: "Unattended Access", desc: "Connect to trusted devices without requiring user approval. Ideal for server management.", color: "bg-orange-50 border-orange-200" },
                  { icon: <Upload className="h-5 w-5 text-cyan-600" />, title: "File Transfer", desc: "Upload and download files during remote sessions with drag-and-drop support.", color: "bg-cyan-50 border-cyan-200" },
                  { icon: <Bell className="h-5 w-5 text-red-600" />, title: "Instant Notifications", desc: "Users are notified when a remote session starts, ends, or fails authentication.", color: "bg-red-50 border-red-200" },
                ].map(card => (
                  <div key={card.title} className={`rounded-xl border p-4 ${card.color}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{card.icon}</div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{card.title}</p>
                        <p className="text-gray-600 text-xs mt-1 leading-relaxed">{card.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent devices */}
              {devices.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 text-sm">Recent Devices</h2>
                    <button onClick={() => setTab("devices")} className="text-xs text-blue-600 hover:text-blue-700">View all</button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {devices.slice(0, 5).map(dev => (
                      <div key={dev.id} className="flex items-center gap-3 px-5 py-3">
                        <StatusDot status={dev.status} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{dev.name}</p>
                          <p className="text-xs text-gray-500">{dev.os} {dev.ip ? `· ${dev.ip}` : ""}</p>
                        </div>
                        {dev.trusted && <ShieldCheck className="h-3.5 w-3.5 text-green-500" />}
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { startSession.mutate({ deviceId: dev.id }); }}>
                          Connect
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Devices ── */}
          {tab === "devices" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="Search devices…"
                    value={searchDevice}
                    onChange={e => setSearchDevice(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={() => setShowAddDevice(true)} className="gap-2"><Plus className="h-4 w-4" /> Register Device</Button>
              </div>

              {filteredDevices.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 gap-3">
                  <Monitor className="h-12 w-12 text-gray-300" />
                  <p className="text-gray-500 font-medium">No devices registered</p>
                  <p className="text-gray-400 text-sm">Register a device to start managing remote access</p>
                  <Button size="sm" onClick={() => setShowAddDevice(true)} className="gap-2 mt-2"><Plus className="h-4 w-4" /> Register First Device</Button>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["Device", "OS", "IP Address", "Location", "Last Active", "Status", ""].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredDevices.map(dev => (
                        <tr key={dev.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Laptop className="h-4 w-4 text-gray-400 shrink-0" />
                              <div>
                                <p className="font-medium text-gray-900">{dev.name}</p>
                                {dev.trusted && <p className="text-xs text-green-600 flex items-center gap-0.5"><ShieldCheck className="h-2.5 w-2.5" /> Trusted</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{dev.os}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{dev.ip ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-500">{dev.location ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{dev.lastActiveAt ? new Date(dev.lastActiveAt).toLocaleString() : "Never"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <StatusDot status={dev.status} />
                              <span className="capitalize text-gray-600">{dev.status}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 justify-end">
                              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => startSession.mutate({ deviceId: dev.id })}>
                                <PlayCircle className="h-3 w-3" /> Connect
                              </Button>
                              <button
                                onClick={() => toggleTrust.mutate({ id: dev.id, trusted: !dev.trusted })}
                                className={`p-1.5 rounded-lg transition-colors ${dev.trusted ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}
                                title={dev.trusted ? "Revoke trust" : "Mark as trusted"}
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deleteDevice.mutate(dev.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Sessions ── */}
          {tab === "sessions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Session History & Audit Log</h2>
              </div>

              {sessions.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 gap-3">
                  <Activity className="h-12 w-12 text-gray-300" />
                  <p className="text-gray-500 font-medium">No sessions yet</p>
                  <p className="text-gray-400 text-sm">Connect to a device to start a remote session</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["Session ID", "Device", "Technician", "Started", "Duration", "Recorded", "Status", ""].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sessions.map(s => {
                        const dev = devices.find(d => d.id === s.deviceId);
                        return (
                          <tr key={s.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">#{s.id}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{dev?.name ?? `Device #${s.deviceId}`}</td>
                            <td className="px-4 py-3 text-gray-600">{s.technicianName}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{new Date(s.startedAt).toLocaleString()}</td>
                            <td className="px-4 py-3 text-gray-600">{s.status === "active" ? <span className="text-green-600 font-medium">Live</span> : formatDuration(s.duration)}</td>
                            <td className="px-4 py-3">{s.recorded ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-gray-300" />}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                {s.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {s.status === "active" && (
                                <button onClick={() => endSession.mutate(s.id)} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1">
                                  <StopCircle className="h-3.5 w-3.5" /> End
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Support Requests ── */}
          {tab === "requests" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Support Request Queue</h2>
                <Button size="sm" onClick={() => setShowNewRequest(true)} className="gap-2"><Plus className="h-4 w-4" /> New Request</Button>
              </div>

              {requests.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 gap-3">
                  <MessageSquare className="h-12 w-12 text-gray-300" />
                  <p className="text-gray-500 font-medium">No support requests</p>
                  <p className="text-gray-400 text-sm">Submit a request when you need remote assistance</p>
                  <Button size="sm" onClick={() => setShowNewRequest(true)} className="gap-2 mt-2"><Plus className="h-4 w-4" /> Request Support</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map(r => (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 text-sm">{r.requesterName}</span>
                            <PriorityBadge priority={r.priority} />
                            <StatusBadge status={r.status} />
                          </div>
                          <p className="text-gray-600 text-sm leading-relaxed">{r.message}</p>
                          <p className="text-gray-400 text-xs mt-1.5">{new Date(r.createdAt).toLocaleString()}</p>
                        </div>
                        {r.status === "pending" && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => updateRequest.mutate({ id: r.id, status: "active" })}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-medium"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Accept
                            </button>
                            <button
                              onClick={() => updateRequest.mutate({ id: r.id, status: "declined" })}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors font-medium"
                            >
                              <XCircle className="h-3 w-3" /> Decline
                            </button>
                          </div>
                        )}
                        {r.status === "active" && (
                          <button
                            onClick={() => updateRequest.mutate({ id: r.id, status: "resolved" })}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium shrink-0"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Settings ── */}
          {tab === "settings" && (
            <div className="space-y-6 max-w-2xl">
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="px-5 py-4">
                  <h2 className="font-semibold text-gray-900">Access Control</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Role-based permissions for remote access</p>
                </div>
                {[
                  { role: "Super Admin", perms: "Full system access — all devices, sessions, audit logs", color: "text-red-600 bg-red-50" },
                  { role: "Administrator", perms: "Manage users, devices, and access policies", color: "text-blue-600 bg-blue-50" },
                  { role: "Support Technician", perms: "Remote control assigned devices only", color: "text-purple-600 bg-purple-50" },
                  { role: "Project Manager", perms: "View sessions and reports — no remote control", color: "text-yellow-700 bg-yellow-50" },
                  { role: "End User", perms: "Request support and approve incoming sessions", color: "text-gray-600 bg-gray-100" },
                ].map(r => (
                  <div key={r.role} className="px-5 py-3 flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${r.color}`}>{r.role}</span>
                    <span className="text-sm text-gray-600 flex-1">{r.perms}</span>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="px-5 py-4">
                  <h2 className="font-semibold text-gray-900">Security Settings</h2>
                </div>
                {[
                  { label: "End-to-End Encryption", desc: "AES-256 for all remote sessions", enabled: true },
                  { label: "Session Authentication", desc: "Require MFA before each connection", enabled: true },
                  { label: "Session Recording", desc: "Auto-record all remote sessions", enabled: true },
                  { label: "Login Attempt Alerts", desc: "Notify on failed authentication", enabled: true },
                  { label: "Unattended Access", desc: "Allow connection without user approval on trusted devices", enabled: false },
                ].map(s => (
                  <div key={s.label} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.label}</p>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                    <div className={`w-10 h-5 rounded-full flex items-center transition-colors ${s.enabled ? "bg-blue-600 justify-end" : "bg-gray-200 justify-start"}`}>
                      <div className="h-4 w-4 rounded-full bg-white shadow mx-0.5" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <h2 className="font-semibold text-gray-900">Future Enhancements</h2>
                <p className="text-sm text-gray-500">Planned features coming to TanCom Remote Access:</p>
                <div className="grid grid-cols-2 gap-2">
                  {["Wake-on-LAN", "Multi-user collaboration", "Mobile-to-PC control", "Remote printing", "Clipboard sync", "Voice/video in session", "AI-assisted troubleshooting", "Remote app launch"].map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" /> {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Active Session UI ─────────────────────────────────────────────────── */}
      {activeSession && activeSessionRow && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-gray-950">
          {/* Session header */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-white font-semibold text-sm">Remote Session — {activeSession.deviceName}</span>
              <span className="text-xs text-gray-400 font-mono">End-to-End Encrypted</span>
              <Shield className="h-3.5 w-3.5 text-green-400" />
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors">
                <Upload className="h-3 w-3" /> Transfer Files
              </button>
              <button
                onClick={() => endSession.mutate(activeSessionRow.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
              >
                <StopCircle className="h-3.5 w-3.5" /> End Session
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Remote screen area */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-gray-950 p-6">
              {/* Status card */}
              <div className="w-full max-w-2xl bg-gray-900 rounded-2xl border border-gray-700 p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 border border-green-500/20">
                    <Monitor className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold">{activeSession.deviceName}</p>
                    <p className="text-xs text-green-400 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />Session Active · End-to-End Encrypted</p>
                  </div>
                </div>

                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 mb-5">
                  <p className="text-amber-300 text-sm font-medium mb-1">ℹ️ How this session works</p>
                  <p className="text-amber-200/80 text-xs leading-relaxed">
                    This session lets you coordinate with the person on <strong className="text-amber-200">{activeSession.deviceName}</strong> via the chat panel on the right.
                    For full <strong className="text-amber-200">screen sharing and remote control</strong>, start a TanCom meeting and ask the remote user to share their screen — that gives you live view of their desktop in real time.
                  </p>
                </div>

                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-3">How to see the remote screen</p>
                <div className="space-y-2 mb-5">
                  {[
                    { n: 1, text: 'Click "Start Screen Share Meeting" below — it opens a new TanCom meeting.' },
                    { n: 2, text: "Send the meeting link to the person on the remote device via the Session Chat." },
                    { n: 3, text: "Once they join, ask them to click Share Screen in the meeting controls." },
                    { n: 4, text: "You can now see their screen live. Use Annotate in the meeting toolbar to highlight anything." },
                  ].map(({ n, text }) => (
                    <div key={n} className="flex items-start gap-3 text-sm text-gray-300">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-300 text-xs font-bold">{n}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>

                <a
                  href="/meetings/new"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
                >
                  <PlayCircle className="h-4 w-4" /> Start Screen Share Meeting
                </a>
              </div>
            </div>

            {/* Session chat sidebar */}
            <div className="w-72 flex flex-col bg-gray-900 border-l border-gray-800">
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="text-white text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-gray-400" /> Session Chat</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {sessionChat.length === 0 && (
                  <p className="text-gray-500 text-xs text-center mt-4">Chat with the remote user here</p>
                )}
                {sessionChat.map((m, i) => (
                  <div key={i} className={`flex flex-col gap-0.5 ${m.from === "me" ? "items-end" : "items-start"}`}>
                    <span className="text-xs text-gray-500">{m.from === "me" ? "You" : m.from}</span>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.from === "me" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-200"}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-gray-800 flex gap-2">
                <input
                  className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none border border-gray-700 focus:border-blue-500"
                  placeholder="Send a message…"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && chatInput.trim()) {
                      setSessionChat(prev => [...prev, { from: "me", text: chatInput.trim(), time: new Date().toLocaleTimeString() }]);
                      setChatInput("");
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Register Device Modal ─────────────────────────────────────────────── */}
      {showAddDevice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Register New Device</h2>
              <button onClick={() => setShowAddDevice(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Device Name *</label>
                <SmartInput className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="e.g. Office Workstation" value={deviceForm.name} onChange={e => setDeviceForm(f => ({ ...f, name: e.target.value }))} context="device name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Operating System</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={deviceForm.os} onChange={e => setDeviceForm(f => ({ ...f, os: e.target.value }))}>
                  {["Windows", "macOS", "Linux", "Ubuntu", "CentOS", "Debian", "Other"].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                  <SmartInput className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="192.168.1.100" value={deviceForm.ip} onChange={e => setDeviceForm(f => ({ ...f, ip: e.target.value }))} context="device IP address" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <SmartInput className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="New York, US" value={deviceForm.location} onChange={e => setDeviceForm(f => ({ ...f, location: e.target.value }))} context="device location" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <SmartTextarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" rows={2} placeholder="Optional notes about this device" value={deviceForm.notes} onChange={e => setDeviceForm(f => ({ ...f, notes: e.target.value }))} context="device notes" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddDevice(false)}>Cancel</Button>
              <Button disabled={!deviceForm.name.trim() || addDevice.isPending} onClick={() => addDevice.mutate(deviceForm)}>
                {addDevice.isPending ? "Registering…" : "Register Device"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Support Request Modal ─────────────────────────────────────────── */}
      {showNewRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Request Remote Support</h2>
              <button onClick={() => setShowNewRequest(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Describe the issue *</label>
                <SmartTextarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" rows={4} placeholder="What do you need help with?" value={requestForm.message} onChange={e => setRequestForm(f => ({ ...f, message: e.target.value }))} context="remote support request description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={requestForm.priority} onChange={e => setRequestForm(f => ({ ...f, priority: e.target.value as SupportRequest["priority"] }))}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Device (optional)</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={requestForm.deviceId} onChange={e => setRequestForm(f => ({ ...f, deviceId: e.target.value }))}>
                    <option value="">Select device…</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowNewRequest(false)}>Cancel</Button>
              <Button disabled={!requestForm.message.trim() || submitRequest.isPending} onClick={() => submitRequest.mutate(requestForm)}>
                {submitRequest.isPending ? "Submitting…" : "Submit Request"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
