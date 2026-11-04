import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";

const PING_INTERVAL_MS = 2 * 60 * 1000; // ping every 2 minutes

export function useSessionTracking() {
  const { isSignedIn, getToken } = useAuth();
  const sessionIdRef = useRef<number | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function apiFetch(path: string, body?: object) {
    const token = await getToken();
    return fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      keepalive: true,
    });
  }

  async function startSession() {
    try {
      const res = await apiFetch("/api/sessions/start");
      if (res.ok) {
        const data = (await res.json()) as { sessionId: number };
        sessionIdRef.current = data.sessionId;
      }
    } catch {
      // non-critical — silently ignore
    }
  }

  async function endSession() {
    if (!sessionIdRef.current) return;
    try {
      await apiFetch("/api/sessions/end", { sessionId: sessionIdRef.current });
    } catch {
      // non-critical
    }
    sessionIdRef.current = null;
  }

  async function pingSession() {
    if (!sessionIdRef.current) return;
    try {
      await apiFetch("/api/sessions/ping", { sessionId: sessionIdRef.current });
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    if (!isSignedIn) return;

    startSession();

    pingTimerRef.current = setInterval(pingSession, PING_INTERVAL_MS);

    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        // sendBeacon with Blob + application/json so Express can parse it
        const blob = new Blob(
          [JSON.stringify({ sessionId: sessionIdRef.current })],
          { type: "application/json" }
        );
        navigator.sendBeacon("/api/sessions/end", blob);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(pingTimerRef.current ?? undefined);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      endSession();
    };
  }, [isSignedIn]);
}
