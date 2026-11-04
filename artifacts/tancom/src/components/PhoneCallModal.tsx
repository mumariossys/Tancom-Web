import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic, MicOff, Volume2, Loader2 } from "lucide-react";

// Lazily import the Twilio Voice SDK to keep initial bundle small
async function loadDevice() {
  const { Device } = await import("@twilio/voice-sdk");
  return Device;
}

type CallState = "idle" | "connecting" | "ringing" | "active" | "ended" | "error";

interface Props {
  open: boolean;
  contactName: string;
  phoneNumber: string;
  onClose: () => void;
}

export default function PhoneCallModal({ open, contactName, phoneNumber, onClose }: Props) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [errorMsg, setErrorMsg]   = useState("");
  const [muted, setMuted]         = useState(false);
  const [duration, setDuration]   = useState(0);

  const deviceRef = useRef<InstanceType<Awaited<ReturnType<typeof loadDevice>>> | null>(null);
  const callRef   = useRef<any>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setCallState("idle");
      setErrorMsg("");
      setMuted(false);
      setDuration(0);
      startCall();
    }
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startTimer() {
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }

  function cleanup() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    callRef.current?.disconnect();
    callRef.current = null;
    deviceRef.current?.destroy();
    deviceRef.current = null;
  }

  async function startCall() {
    setCallState("connecting");
    try {
      // 1. Fetch access token from our API
      const res  = await fetch("/api/calls/phone/token");
      if (!res.ok) throw new Error(await res.text());
      const { token } = await res.json() as { token: string };

      // 2. Initialise Twilio Device
      const Device = await loadDevice();
      const device = new Device(token, { edge: "ashburn", logLevel: "error" });
      deviceRef.current = device;

      await device.register();
      setCallState("ringing");

      // 3. Place outbound call — To is forwarded to our TwiML webhook
      const call = await device.connect({ params: { To: phoneNumber } });
      callRef.current = call;

      call.on("ringing",    () => setCallState("ringing"));
      call.on("accept",     () => { setCallState("active"); startTimer(); });
      call.on("disconnect", () => { setCallState("ended"); cleanup(); });
      call.on("cancel",     () => { setCallState("ended"); cleanup(); });
      call.on("error",      (e: Error) => { setErrorMsg(e.message); setCallState("error"); cleanup(); });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setCallState("error");
    }
  }

  function hangUp() {
    callRef.current?.disconnect();
    cleanup();
    setCallState("ended");
  }

  function toggleMute() {
    if (!callRef.current) return;
    const next = !muted;
    callRef.current.mute(next);
    setMuted(next);
  }

  function handleClose() {
    cleanup();
    onClose();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const stateLabel: Record<CallState, string> = {
    idle:       "Initialising…",
    connecting: "Connecting…",
    ringing:    "Ringing…",
    active:     fmt(duration),
    ended:      "Call ended",
    error:      "Call failed",
  };

  const statusColor: Record<CallState, string> = {
    idle:       "text-gray-500",
    connecting: "text-blue-500",
    ringing:    "text-amber-500",
    active:     "text-green-600",
    ended:      "text-gray-400",
    error:      "text-red-500",
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-xs text-center select-none">
        <DialogHeader>
          <DialogTitle className="text-center">Phone Call</DialogTitle>
        </DialogHeader>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
            {contactName[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{contactName}</p>
            <p className="text-sm text-gray-500">{phoneNumber}</p>
          </div>

          {/* Status */}
          <div className={`flex items-center gap-1.5 text-sm font-medium ${statusColor[callState]}`}>
            {(callState === "connecting" || callState === "ringing") && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {callState === "active" && <Volume2 className="h-4 w-4 animate-pulse" />}
            {stateLabel[callState]}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-500 max-w-full text-center px-2 break-words">{errorMsg}</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6 pb-2">
          {callState === "active" && (
            <Button
              variant="outline"
              size="icon"
              className={`rounded-full h-12 w-12 ${muted ? "bg-red-50 border-red-300 text-red-600" : ""}`}
              onClick={toggleMute}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
          )}

          {(callState === "connecting" || callState === "ringing" || callState === "active") ? (
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full h-14 w-14"
              onClick={hangUp}
              title="Hang up"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          ) : (
            <div className="flex gap-3">
              {callState === "error" && (
                <Button variant="outline" onClick={startCall} className="gap-2">
                  <Phone className="h-4 w-4" /> Retry
                </Button>
              )}
              <Button variant="outline" onClick={handleClose}>Close</Button>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 pb-1">
          Calls use your TanCom phone number · Charges may apply
        </p>
      </DialogContent>
    </Dialog>
  );
}
