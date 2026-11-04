import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, MessageSquare, Phone, Users, Link, BarChart2 } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  relatedId: number | null;
  relatedType: string | null;
  read: boolean;
  createdAt: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function notifIcon(type: string) {
  if (type === "message") return <MessageSquare className="h-4 w-4 text-blue-500" />;
  if (type === "call") return <Phone className="h-4 w-4 text-green-500" />;
  if (type === "invite") return <Users className="h-4 w-4 text-purple-500" />;
  if (type === "poll") return <BarChart2 className="h-4 w-4 text-orange-500" />;
  return <Bell className="h-4 w-4 text-gray-400" />;
}

function formatNotifTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: countData } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => apiFetch<{ count: number }>("/api/notifications/unread-count"),
    refetchInterval: 10000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<NotificationItem[]>("/api/notifications"),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/api/notifications/mark-all-read", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unread = countData?.count ?? 0;

  function parseCallBody(body: string | null): string | null {
    if (!body) return null;
    try {
      const d = JSON.parse(body) as { callerName?: string; callType?: string };
      if (d.callerName) return `${d.callerName} is calling (${d.callType ?? "video"})`;
    } catch { /* plain text */ }
    return body;
  }

  function handleNotifClick(n: NotificationItem) {
    markRead.mutate(n.id);
    if (n.relatedType === "room") setLocation("/chat");
    else if (n.relatedType === "community") setLocation("/communities");
    else if (n.relatedType === "call") setLocation("/chat");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="Notifications"
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-80 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900 text-sm">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {!notifications || notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No notifications</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                    !n.read ? "bg-blue-50/50" : ""
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{notifIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${!n.read ? "text-gray-900" : "text-gray-700"}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {n.type === "call" ? parseCallBody(n.body) : n.body}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{formatNotifTime(n.createdAt)}</p>
                  </div>
                  {!n.read && <div className="mt-2 h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
