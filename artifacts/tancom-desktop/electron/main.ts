import { app, BrowserWindow, ipcMain, Menu, shell, session, clipboard, desktopCapturer } from "electron";
import path from "path";

// robotjs ships prebuilt native binaries for Windows/macOS/Linux.
// Types are provided by electron/robotjs.d.ts (no @types package needed).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const robot = require("robotjs");

// Make mouse movement instantaneous for remote control (no animation delay).
robot.setMouseDelay(0);
robot.setKeyboardDelay(0);

// ── Config ────────────────────────────────────────────────────────────────────
const TANCOM_URL = process.env["TANCOM_URL"] ?? "https://tancom.us";

// Tracks which display is being shared so RC coordinate mapping stays correct
// on multi-monitor setups. Updated when the renderer calls rc:set-shared-display-id.
let sharedDisplayBounds = { x: 0, y: 0, width: 1920, height: 1080 };

// ── Key maps ──────────────────────────────────────────────────────────────────

// The web/mobile controller sends browser-style key names (Escape, ArrowUp, …).
// This map converts them to robotjs lowercase key names.
const BROWSER_KEY_MAP: Record<string, string> = {
  Escape: "escape", Enter: "enter", Return: "enter",
  Tab: "tab", Backspace: "backspace", BackSpace: "backspace",
  Delete: "delete", Home: "home", End: "end",
  PageUp: "pageup", PageDown: "pagedown",
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  " ": "space", Spacebar: "space", Insert: "insert",
  F1: "f1", F2: "f2", F3: "f3", F4: "f4",
  F5: "f5", F6: "f6", F7: "f7", F8: "f8",
  F9: "f9", F10: "f10", F11: "f11", F12: "f12",
};

// Modifier name strings (sent by controller) → robotjs modifier names
const MODIFIER_KEY_MAP: Record<string, string> = {
  ctrl: "control", control: "control",
  shift: "shift",
  alt: "alt", option: "alt",
  command: "command", cmd: "command", meta: "command",
  win: "win",
};

// ── Screen Share Picker ───────────────────────────────────────────────────────
// Electron 20+ requires setDisplayMediaRequestHandler to intercept getDisplayMedia().

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pendingDisplayCallback: ((response: any) => void) | null = null;
let pendingAudioRequested = false;
let cachedDesktopSources: Electron.DesktopCapturerSource[] = [];

function finishDisplayRequest(
  cb: (response: { video?: Electron.DesktopCapturerSource; audio?: "loopback" }) => void,
  source: Electron.DesktopCapturerSource | undefined,
  withAudio: boolean,
) {
  if (!source) {
    cb({});
    return;
  }
  // loopback is the system mix. Only attach it when the sharer asked for
  // computer audio — otherwise the meeting hears the whole desktop.
  cb(withAudio ? { video: source, audio: "loopback" } : { video: source });
}

function setupDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    // A second share request must not leave the first getDisplayMedia() hanging.
    if (pendingDisplayCallback) {
      const stale = pendingDisplayCallback;
      pendingDisplayCallback = null;
      try { stale({}); } catch { /* ignore */ }
    }
    pendingDisplayCallback = callback;
    pendingAudioRequested = Boolean((request as { audioRequested?: boolean }).audioRequested);

    desktopCapturer
      .getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false,
      })
      .then((sources) => {
        cachedDesktopSources = sources;
        // A pick, cancel, or newer request already settled this callback.
        if (pendingDisplayCallback !== callback) return;
        if (!mainWindow) {
          pendingDisplayCallback = null;
          callback({});
          return;
        }
        const serialized = sources.map((s) => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail.toDataURL(),
        }));
        mainWindow.webContents.send("screen:sources-ready", serialized);
      })
      .catch(() => {
        if (pendingDisplayCallback !== callback) return;
        pendingDisplayCallback = null;
        callback({});
      });
  });

  ipcMain.on("screen:pick-source", (_event, sourceId: string | null, withSystemAudio?: boolean) => {
    const cb = pendingDisplayCallback;
    pendingDisplayCallback = null;
    if (!cb) return;

    const wantAudio = typeof withSystemAudio === "boolean" ? withSystemAudio : pendingAudioRequested;

    if (!sourceId) {
      cb({});
      return;
    }

    const source = cachedDesktopSources.find((s) => s.id === sourceId);
    if (source) {
      finishDisplayRequest(cb, source, wantAudio);
    } else {
      desktopCapturer
        .getSources({ types: ["screen", "window"] })
        .then((fresh) => {
          const found = fresh.find((s) => s.id === sourceId);
          finishDisplayRequest(cb, found, wantAudio);
        })
        .catch(() => cb({}));
    }
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "TanCom",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Grant camera + mic permission automatically (user already trusts the app)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ["media", "microphone", "camera", "audioCapture", "videoCapture", "screen", "desktopCapture"];
    callback(allowed.includes(permission));
  });

  mainWindow.loadURL(TANCOM_URL);
  console.log(`[TanCom Desktop] main: loading ${TANCOM_URL}`);

  // Always allow DevTools via F12 or Ctrl+Shift+I regardless of NODE_ENV.
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (!mainWindow) return;
    const devToolsShortcut =
      (input.control && input.shift && input.key.toLowerCase() === "i") ||
      input.key === "F12";
    if (devToolsShortcut) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Open external links in the system browser rather than a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App menu ──────────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: "TanCom",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "forceReload" }, { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" }, { role: "togglefullscreen" },
        { type: "separator" }, { role: "toggleDevTools" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "TanCom Website",
          click: () => { shell.openExternal("https://tancom.us"); },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC: Remote Control ───────────────────────────────────────────────────────

/** Convert display-local pixel coords to absolute virtual-desktop coords. */
function toAbsolute(x: number, y: number): [number, number] {
  return [
    Math.round(x + sharedDisplayBounds.x),
    Math.round(y + sharedDisplayBounds.y),
  ];
}

ipcMain.on("rc:move-mouse", (_event, x: number, y: number) => {
  try {
    const [ax, ay] = toAbsolute(x, y);
    robot.moveMouse(ax, ay);
  } catch (err) {
    console.error("[TanCom Desktop] rc:move-mouse failed:", err);
  }
});

ipcMain.on("rc:click", (_event, x: number, y: number, button: "left" | "right") => {
  try {
    const [ax, ay] = toAbsolute(x, y);
    robot.moveMouse(ax, ay);
    robot.mouseClick(button === "right" ? "right" : "left");
  } catch (err) {
    console.error("[TanCom Desktop] rc:click failed:", err);
  }
});

ipcMain.on("rc:double-click", (_event, x: number, y: number) => {
  try {
    const [ax, ay] = toAbsolute(x, y);
    robot.moveMouse(ax, ay);
    robot.mouseClick("left", true); // second arg = double-click
  } catch (err) {
    console.error("[TanCom Desktop] rc:double-click failed:", err);
  }
});

ipcMain.on("rc:scroll", (_event, x: number, y: number, dx: number, dy: number) => {
  try {
    const [ax, ay] = toAbsolute(x, y);
    robot.moveMouse(ax, ay);
    // robotjs scrollMouse(x, y): positive y = scroll down, positive x = scroll right
    if (dy !== 0 || dx !== 0) {
      const scrollX = dx !== 0 ? Math.max(1, Math.abs(Math.round(dx))) * Math.sign(dx) : 0;
      const scrollY = dy !== 0 ? Math.max(1, Math.abs(Math.round(dy))) * Math.sign(dy) : 0;
      robot.scrollMouse(scrollX, scrollY);
    }
  } catch (err) {
    console.error("[TanCom Desktop] rc:scroll failed:", err);
  }
});

ipcMain.on("rc:key-tap", (_event, key: string, modifiers: string[]) => {
  try {
    // Normalize browser key name → canonical robotjs lowercase name
    const canonical = BROWSER_KEY_MAP[key] ?? key.toLowerCase();

    // Resolve modifier keys, filtering out any unrecognised names
    const modKeys = (modifiers ?? [])
      .map((m) => MODIFIER_KEY_MAP[m.toLowerCase()])
      .filter((k): k is string => k !== undefined);

    if (modKeys.length > 0) {
      robot.keyTap(canonical, modKeys);
    } else {
      robot.keyTap(canonical);
    }
  } catch (err) {
    console.error("[TanCom Desktop] rc:key-tap failed:", err);
  }
});

// Returns the size of the currently shared display (width/height only — no offset).
ipcMain.handle("rc:get-screen-size", () => {
  return { width: sharedDisplayBounds.width, height: sharedDisplayBounds.height };
});

// Returns info for all connected displays so the renderer can identify which
// one is being shared and call rc:set-shared-display-id with the correct id.
ipcMain.handle("rc:get-displays", () => {
  const { screen } = require("electron") as typeof import("electron");
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
  }));
});

// Called by the renderer after screen sharing starts to tell the main process
// which display is being shared.
ipcMain.handle("rc:set-shared-display-id", (_event, displayId: number) => {
  const { screen } = require("electron") as typeof import("electron");
  const display = screen.getAllDisplays().find(d => d.id === displayId);
  if (display) {
    sharedDisplayBounds = { ...display.bounds };
  }
  return { width: sharedDisplayBounds.width, height: sharedDisplayBounds.height };
});

// ── Drag & Drop ───────────────────────────────────────────────────────────────
// Implements OS-level mouse drag via robotjs mouseToggle so remote
// controllers can drag windows, select text, reorder items, etc. on the host.

ipcMain.on("rc:drag-start", (_event, x: number, y: number) => {
  try {
    const [ax, ay] = toAbsolute(x, y);
    robot.moveMouse(ax, ay);
    robot.mouseToggle("down", "left");
  } catch (err) {
    console.error("[TanCom Desktop] rc:drag-start failed:", err);
  }
});

ipcMain.on("rc:drag-to", (_event, x: number, y: number) => {
  try {
    const [ax, ay] = toAbsolute(x, y);
    robot.moveMouse(ax, ay);
  } catch (err) {
    console.error("[TanCom Desktop] rc:drag-to failed:", err);
  }
});

ipcMain.on("rc:drag-end", (_event, x: number, y: number) => {
  try {
    const [ax, ay] = toAbsolute(x, y);
    robot.moveMouse(ax, ay);
    robot.mouseToggle("up", "left");
  } catch (err) {
    console.error("[TanCom Desktop] rc:drag-end failed:", err);
  }
});

// Safety net: if the controller disconnects mid-drag the mouse button stays
// held. This handler lets the renderer release it on cleanup.
ipcMain.on("rc:drag-cancel", () => {
  try { robot.mouseToggle("up", "left"); } catch { /* ignore */ }
});

// ── Clipboard Sync ────────────────────────────────────────────────────────────
ipcMain.handle("rc:get-clipboard", () => {
  try { return clipboard.readText(); } catch { return ""; }
});

ipcMain.on("rc:set-clipboard", (_event, text: string) => {
  try { clipboard.writeText(text); } catch { /* ignore */ }
});

// ── Cursor tracking for RC pointer relay ─────────────────────────────────────
// Polls the actual OS cursor position at ~30 fps and pushes normalised [0,1]
// coordinates back via the rc:cursor-pos channel.

let cursorTrackingInterval: ReturnType<typeof setInterval> | null = null;

ipcMain.on("rc:start-cursor-tracking", () => {
  if (cursorTrackingInterval) return;
  cursorTrackingInterval = setInterval(() => {
    if (!mainWindow) return;
    try {
      const pos = robot.getMousePos();
      const normX = (pos.x - sharedDisplayBounds.x) / sharedDisplayBounds.width;
      const normY = (pos.y - sharedDisplayBounds.y) / sharedDisplayBounds.height;
      mainWindow.webContents.send("rc:cursor-pos", normX, normY);
    } catch { /* non-fatal */ }
  }, 33); // ~30 fps
});

ipcMain.on("rc:stop-cursor-tracking", () => {
  if (cursorTrackingInterval) {
    clearInterval(cursorTrackingInterval);
    cursorTrackingInterval = null;
    console.info("[TanCom Desktop] rc:stop-cursor-tracking — interval cleared.");
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  setupDisplayMedia();
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
