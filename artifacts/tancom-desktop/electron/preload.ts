/**
 * Preload script — runs in the renderer context with Node.js access.
 *
 * Exposes `window.electronRC` to the TanCom web app so it can trigger real
 * OS-level mouse / keyboard actions when it's running inside the desktop app.
 *
 * Coordinate contract:
 *   All public-facing methods (moveMouseTo, click, …) accept NORMALISED
 *   coordinates in [0, 1] relative to the shared screen area.  The preload
 *   converts these to absolute pixel values before sending IPC.
 */

import { contextBridge, ipcRenderer } from "electron";

console.log("[TanCom Desktop] preload: script started");

// Screen dimensions of the currently shared display.
// Populated from main process via rc:get-screen-size and updated whenever the
// user calls setSharedDisplayId() after starting screen sharing.
let screenW = 1920;
let screenH = 1080;

// Fetch initial screen size — .catch() prevents an unhandled rejection from
// crashing the preload before contextBridge.exposeInMainWorld is reached.
ipcRenderer.invoke("rc:get-screen-size")
  .then((size: { width: number; height: number }) => {
    if (size && typeof size.width === "number") {
      screenW = size.width;
      screenH = size.height;
      console.log(`[TanCom Desktop] preload: screen size ${screenW}×${screenH}`);
    }
  })
  .catch((err: unknown) => {
    console.error("[TanCom Desktop] preload: rc:get-screen-size failed (using 1920×1080 defaults):", err);
  });

function toPixels(normX: number, normY: number): [number, number] {
  return [
    Math.max(0, Math.min(screenW - 1, Math.round(normX * screenW))),
    Math.max(0, Math.min(screenH - 1, Math.round(normY * screenH))),
  ];
}

try {
  contextBridge.exposeInMainWorld("electronRC", {
  /** True when the web app is running inside the TanCom desktop app. */
  isElectron: true as const,

  /** Move the remote machine's mouse cursor (normalised 0-1 coordinates). */
  moveMouseTo(normX: number, normY: number): void {
    const [x, y] = toPixels(normX, normY);
    ipcRenderer.send("rc:move-mouse", x, y);
  },

  /** Perform a mouse click at the given position. */
  click(normX: number, normY: number, button: "left" | "right" = "left"): void {
    const [x, y] = toPixels(normX, normY);
    ipcRenderer.send("rc:click", x, y, button);
  },

  /** Double-click at the given position. */
  doubleClick(normX: number, normY: number): void {
    const [x, y] = toPixels(normX, normY);
    ipcRenderer.send("rc:double-click", x, y);
  },

  /** Scroll the mouse wheel at the given position. dx/dy in "lines". */
  scroll(normX: number, normY: number, dx: number, dy: number): void {
    const [x, y] = toPixels(normX, normY);
    ipcRenderer.send("rc:scroll", x, y, dx, dy);
  },

  /**
   * Simulate a keyboard key tap.
   * @param key  robotjs key name, e.g. "a", "enter", "backspace", "f5"
   * @param modifiers  array of modifier strings: "control", "shift", "alt", "command"
   */
  keyTap(key: string, modifiers: string[] = []): void {
    ipcRenderer.send("rc:key-tap", key, modifiers);
  },

  /**
   * Returns info about all connected displays.
   * Call this after screen sharing starts to identify which display is being
   * shared, then pass its id to setSharedDisplayId().
   */
  getDisplays(): Promise<Array<{ id: number; x: number; y: number; width: number; height: number; isPrimary: boolean }>> {
    return ipcRenderer.invoke("rc:get-displays");
  },

  /**
   * Tell the main process which display is being shared.
   * Updates both the IPC coordinate offset (for the host robot) and the local
   * screenW/screenH (for this controller's normalised → pixel conversion).
   * Should be called right after screen sharing starts.
   */
  async setSharedDisplayId(displayId: number): Promise<void> {
    const bounds: { width: number; height: number } = await ipcRenderer.invoke("rc:set-shared-display-id", displayId);
    screenW = bounds.width;
    screenH = bounds.height;
  },

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  /**
   * Press the left mouse button down at a normalised position.
   * Call this to start a drag operation, then `dragTo` to move, then `dragEnd`.
   */
  dragStart(normX: number, normY: number): void {
    const [x, y] = toPixels(normX, normY);
    ipcRenderer.send("rc:drag-start", x, y);
  },

  /**
   * Move the mouse to a new position while the left button is held down.
   * Send this continuously during a drag gesture.
   */
  dragTo(normX: number, normY: number): void {
    const [x, y] = toPixels(normX, normY);
    ipcRenderer.send("rc:drag-to", x, y);
  },

  /**
   * Release the left mouse button at a normalised position to complete a drag.
   */
  dragEnd(normX: number, normY: number): void {
    const [x, y] = toPixels(normX, normY);
    ipcRenderer.send("rc:drag-end", x, y);
  },

  /**
   * Forcefully release the left mouse button without moving.
   * Call this on cleanup if a drag was interrupted (e.g. RC revoked mid-drag).
   */
  dragCancel(): void {
    ipcRenderer.send("rc:drag-cancel");
  },

  // ── Clipboard Sync ──────────────────────────────────────────────────────────

  /**
   * Read text from the host machine's OS clipboard.
   * Returns an empty string if the clipboard is empty or unavailable.
   */
  getClipboard(): Promise<string> {
    return ipcRenderer.invoke("rc:get-clipboard");
  },

  /**
   * Write text to the host machine's OS clipboard.
   */
  setClipboard(text: string): void {
    ipcRenderer.send("rc:set-clipboard", text);
  },

  /**
   * Ask the main process to start polling the OS cursor position at ~30 fps.
   * Incoming positions are delivered via `onCursorMove`.
   * Call `stopCursorTracking` when tracking is no longer needed.
   */
  startCursorTracking(): void {
    ipcRenderer.send("rc:start-cursor-tracking");
  },

  /**
   * Ask the main process to stop polling the OS cursor position.
   */
  stopCursorTracking(): void {
    ipcRenderer.send("rc:stop-cursor-tracking");
  },

  /**
   * Register a callback that fires whenever the OS cursor moves (normalised
   * coordinates, ~30 fps while tracking is active).
   *
   * Returns a cleanup function — call it to unsubscribe before unmounting.
   */
  onCursorMove(callback: (normX: number, normY: number) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, normX: number, normY: number) => {
      callback(normX, normY);
    };
    ipcRenderer.on("rc:cursor-pos", handler);
    return () => { ipcRenderer.off("rc:cursor-pos", handler); };
  },

  // ── Screen Share Picker ──────────────────────────────────────────────────────

  /**
   * Register a callback that fires when the Electron main process sends
   * available screen/window sources for the user to pick from.
   *
   * This fires after the web app calls navigator.mediaDevices.getDisplayMedia()
   * and Electron's handler fetches desktopCapturer sources.
   *
   * Returns an unsubscribe function.
   */
  onScreenSourcesReady(
    callback: (sources: Array<{ id: string; name: string; thumbnail: string }>) => void
  ): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      sources: Array<{ id: string; name: string; thumbnail: string }>
    ) => {
      callback(sources);
    };
    ipcRenderer.on("screen:sources-ready", handler);
    return () => { ipcRenderer.off("screen:sources-ready", handler); };
  },

  /**
   * Tell the Electron main process which source was selected.
   * Pass `null` to cancel — getDisplayMedia() will reject.
   */
  pickScreenSource(sourceId: string | null): void {
    ipcRenderer.send("screen:pick-source", sourceId);
  },
});
  console.log("[TanCom Desktop] preload: window.electronRC injected ✓");
} catch (err) {
  console.error("[TanCom Desktop] preload: contextBridge.exposeInMainWorld FAILED:", err);
}
