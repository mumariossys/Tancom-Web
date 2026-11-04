import { useEffect, useRef, useState, useCallback } from "react";
import { Phone, PhoneOff, Video, Mic } from "lucide-react";
import CallModal from "@/components/CallModal";
import { useUser } from "@clerk/react";

interface CallNotif {
  id: number;
  body: string | null;
  createdAt: string;
}

interface CallPayload {
  callRoomName: string;
  callType: "audio" | "video";
  callerName: string;
  callerClerkId?: string;
}

interface ActiveCall {
  callRoomName: string;
  token: string;
  livekitUrl: string;
  callType: "audio" | "video";
}

function parseCallBody(body: string | null): CallPayload | null {
  if (!body) return null;
  try {
    const d = JSON.parse(body) as CallPayload;
    if (d.callRoomName) return d;
  } catch {
    // legacy plain-text body — not actionable
  }
  return null;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export default function IncomingCallBanner() {
  const { user } = useUser();
  const [incoming, setIncoming] = useState<{ notifId: number; payload: CallPayload } | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [joining, setJoining] = useState(false);
  const dismissedRef = useRef<Set<number>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedIdsRef = useRef<Set<string>>(new Set());

  // Keep a set of muted contacts' clerkIds so we can silence their calls
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadMuted() {
      try {
        const res = await fetch("/api/contacts");
        if (!res.ok) return;
        const contacts = await res.json() as { contactClerkId?: string | null; isMuted?: boolean }[];
        if (cancelled) return;
        mutedIdsRef.current = new Set(
          contacts.filter((c) => c.isMuted && c.contactClerkId).map((c) => c.contactClerkId as string)
        );
      } catch {
        // keep previous set
      }
    }
    loadMuted();
    const t = setInterval(loadMuted, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user]);

  const dismiss = useCallback(async (notifId: number) => {
    dismissedRef.current.add(notifId);
    setIncoming(null);
    try {
      await fetch(`/api/notifications/${notifId}/read`, { method: "POST" });
    } catch {
      // best-effort
    }
  }, []);

  const accept = useCallback(async (notifId: number, payload: CallPayload) => {
    setJoining(true);
    try {
      const res = await fetch("/api/calls/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callRoomName: payload.callRoomName }),
      });
      if (!res.ok) throw new Error("Join failed");
      const data = await res.json() as { token: string; livekitUrl: string };
      dismissedRef.current.add(notifId);
      setIncoming(null);
      setActiveCall({
        callRoomName: payload.callRoomName,
        token: data.token,
        livekitUrl: data.livekitUrl,
        callType: payload.callType,
      });
      try {
        await fetch(`/api/notifications/${notifId}/read`, { method: "POST" });
      } catch {
        // best-effort
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not join call";
      alert(`Failed to join call: ${msg}`);
    } finally {
      setJoining(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    async function poll() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const notifs = await res.json() as CallNotif[];
        const cutoff = Date.now() - 90_000; // only ring for calls in the last 90s
        const callNotif = notifs.find(
          (n: any) =>
            n.type === "call" &&
            !n.read &&
            !dismissedRef.current.has(n.id) &&
            new Date(n.createdAt).getTime() > cutoff
        );
        if (callNotif && !activeCall) {
          const payload = parseCallBody(callNotif.body);
          if (payload) {
            // Muted contact → no banner, no chime; silently mark as read so
            // it remains a quiet entry in the notification bell history.
            if (payload.callerClerkId && mutedIdsRef.current.has(payload.callerClerkId)) {
              dismissedRef.current.add(callNotif.id);
              fetch(`/api/notifications/${callNotif.id}/read`, { method: "POST" }).catch(() => {});
              return;
            }
            setIncoming((prev) =>
              prev?.notifId === callNotif.id ? prev : { notifId: callNotif.id, payload }
            );
          }
        }
      } catch {
        // ignore
      }
    }

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, activeCall]);

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => dismiss(incoming.notifId), 30_000);
    return () => clearTimeout(t);
  }, [incoming, dismiss]);

  if (activeCall) {
    return (
      <CallModal
        callRoomName={activeCall.callRoomName}
        token={activeCall.token}
        livekitUrl={activeCall.livekitUrl}
        callType={activeCall.callType}
        displayName={user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Me"}
        onEnd={() => setActiveCall(null)}
      />
    );
  }

  if (!incoming) return null;

  const { notifId, payload } = incoming;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Pulsing ring */}
      <div className="relative flex flex-col items-center gap-6 rounded-3xl bg-white px-10 py-10 shadow-2xl max-w-sm w-full mx-4">
        {/* Caller avatar with pulse */}
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-green-400 opacity-30" style={{ transform: "scale(1.4)" }} />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white text-3xl font-bold shadow-lg">
            {initials(payload.callerName)}
          </div>
        </div>

        {/* Info */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
            Incoming {payload.callType === "video" ? "Video" : "Voice"} Call
          </p>
          <p className="text-2xl font-bold text-gray-900">{payload.callerName}</p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-8">
          {/* Decline */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => dismiss(notifId)}
              disabled={joining}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all shadow-lg"
            >
              <PhoneOff className="h-7 w-7 text-white" />
            </button>
            <span className="text-xs text-gray-500 font-medium">Decline</span>
          </div>

          {/* Accept audio (always available) */}
          {payload.callType === "video" && (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={async () => {
                  const payload2 = { ...payload, callType: "audio" as const };
                  await accept(notifId, payload2);
                }}
                disabled={joining}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 active:scale-95 transition-all shadow-lg"
              >
                <Mic className="h-7 w-7 text-white" />
              </button>
              <span className="text-xs text-gray-500 font-medium">Audio only</span>
            </div>
          )}

          {/* Accept */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => accept(notifId, payload)}
              disabled={joining}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 hover:bg-green-600 active:scale-95 transition-all shadow-lg"
            >
              {payload.callType === "video"
                ? <Video className="h-7 w-7 text-white" />
                : <Phone className="h-7 w-7 text-white" />}
            </button>
            <span className="text-xs text-gray-500 font-medium">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
