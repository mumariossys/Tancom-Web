/**
 * Type declarations for the API exposed by the TanCom Electron preload script.
 *
 * `window.electronRC` is only present when the web app is running inside the
 * native desktop wrapper.  All coordinate parameters are normalised [0, 1]
 * values relative to the shared screen/surface.
 */

interface ElectronScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface ElectronRC {
  /** Always `true` — used to detect the Electron environment. */
  readonly isElectron: true;

  /** Move the controlled machine's OS cursor to a normalised position. */
  moveMouseTo(normX: number, normY: number): void;

  /** Click at a normalised position. Defaults to left button. */
  click(normX: number, normY: number, button?: "left" | "right"): void;

  /** Double-click at a normalised position. */
  doubleClick(normX: number, normY: number): void;

  /**
   * Scroll the mouse wheel.
   * @param dx  Horizontal scroll delta (lines)
   * @param dy  Vertical scroll delta (lines)
   */
  scroll(normX: number, normY: number, dx: number, dy: number): void;

  /**
   * Simulate a keyboard key tap.
   * @param key       robotjs key name ("a", "enter", "backspace", "f5", …)
   * @param modifiers robotjs modifier names ("control", "shift", "alt", "command")
   */
  keyTap(key: string, modifiers?: string[]): void;

  /**
   * Returns info about all connected displays on the host machine.
   * Call this after screen sharing starts to identify which display is being
   * shared, then pass its `id` to `setSharedDisplayId()`.
   */
  getDisplays(): Promise<
    Array<{
      id: number;
      x: number;
      y: number;
      width: number;
      height: number;
      isPrimary: boolean;
    }>
  >;

  /**
   * Tell the main process which display is being shared.
   * Updates the IPC coordinate offset so that RC mouse/keyboard events land on
   * the correct monitor, and refreshes the normalised→pixel scale factors in
   * the preload.
   *
   * @param displayId  The `id` of the display returned by `getDisplays()`.
   */
  setSharedDisplayId(displayId: number): Promise<void>;

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  /**
   * Press the left mouse button down at a normalised position.
   * Begins a drag operation — follow with `dragTo()` and `dragEnd()`.
   */
  dragStart(normX: number, normY: number): void;

  /**
   * Move the cursor to a new normalised position while the left button is held.
   * Send continuously during a drag gesture for smooth dragging.
   */
  dragTo(normX: number, normY: number): void;

  /**
   * Release the left mouse button at a normalised position to complete a drag.
   */
  dragEnd(normX: number, normY: number): void;

  /**
   * Forcefully release the left mouse button without moving.
   * Use on cleanup if RC is revoked or the controller disconnects mid-drag.
   */
  dragCancel(): void;

  // ── Clipboard Sync ──────────────────────────────────────────────────────────

  /**
   * Read text from the host machine's OS clipboard.
   * Returns an empty string if the clipboard is empty or the call fails.
   */
  getClipboard(): Promise<string>;

  /**
   * Write text to the host machine's OS clipboard.
   */
  setClipboard(text: string): void;

  /**
   * Ask the main process to start polling the OS cursor position at ~30 fps.
   * Incoming positions are delivered to callbacks registered via `onCursorMove`.
   * Call `stopCursorTracking` when tracking is no longer needed.
   */
  startCursorTracking(): void;

  /**
   * Ask the main process to stop the OS cursor position poll.
   */
  stopCursorTracking(): void;

  /**
   * Register a callback for OS cursor move events (normalised [0, 1] coords,
   * ~30 fps, relative to the shared display).
   *
   * Returns a cleanup/unsubscribe function — invoke it when the component
   * unmounts or tracking should stop.
   */
  onCursorMove(callback: (normX: number, normY: number) => void): () => void;

  // ── Screen Share Picker (Electron only) ─────────────────────────────────────

  /**
   * Register a callback that fires when the Electron main process has fetched
   * available screen/window sources for the user to choose from.
   *
   * Called automatically by Electron after the web app invokes getDisplayMedia().
   * Returns an unsubscribe function.
   */
  onScreenSourcesReady(
    callback: (sources: ElectronScreenSource[]) => void
  ): () => void;

  /**
   * Tell the Electron main process which source the user selected.
   * Pass `null` to cancel (getDisplayMedia will reject).
   * `withSystemAudio` captures the desktop mix when Share computer sound is on.
   */
  pickScreenSource(sourceId: string | null, withSystemAudio?: boolean): void;
}

interface Window {
  electronRC?: ElectronRC;
}
