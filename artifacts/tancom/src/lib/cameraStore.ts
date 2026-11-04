// Module-level singleton — passes the camera stream from PreJoinLobby to
// MeetingRoom so the camera is never released and re-acquired between pages.
// This eliminates the NotReadableError race condition on fast navigation.

let _pending: MediaStream | null = null;

export const cameraStore = {
  /** PreJoinLobby calls this before navigating away. */
  set(stream: MediaStream): void {
    _pending = stream;
  },

  /** MeetingRoom calls this once on mount to claim ownership. Returns the
   *  stream and clears the store so no one else can claim it. */
  take(): MediaStream | null {
    const s = _pending;
    _pending = null;
    return s;
  },
};
