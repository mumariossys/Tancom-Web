# TanCom Desktop

Native Electron desktop app for TanCom with **true OS-level remote control** —
move the mouse, click, scroll, and type on a remote computer during a screen-share
session, just like Zoom.

## How remote control works

| Layer | Role |
|---|---|
| **LiveKit data channel** | Carries normalised (0–1) pointer/click/scroll/key events between participants (unchanged from the web app) |
| **Electron preload** | Exposes `window.electronRC` to the web app, converts normalised coords → screen pixels |
| **robotjs (main process)** | Calls the OS mouse/keyboard APIs (`moveMouse`, `mouseClick`, `scrollMouse`, `keyTap`) |

The web app **auto-detects** whether it is running inside the desktop app by checking
`window.electronRC?.isElectron`. When `true`, real OS events are injected instead of
showing only the visual cursor overlay.

## Quick start (development)

```bash
cd artifacts/tancom-desktop
npm install          # also runs electron-rebuild to compile robotjs
npm start            # compiles TypeScript + launches Electron
```

Set `TANCOM_URL` to point at a local or staging server:

```bash
TANCOM_URL=http://localhost:80 npm start
```

## Build installers

```bash
npm run dist:mac   # → release/TanCom-*.dmg  (macOS, x64 + arm64)
npm run dist:win   # → release/TanCom-Setup.exe  (Windows, x64 NSIS)
```

### macOS notarization (optional for distribution)

Set these environment variables before building:

```
APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
```

### Windows code-signing (optional)

Provide a `.pfx` certificate via `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`.

## CI — GitHub Actions

Pushing to `main` (when files under `artifacts/tancom-desktop/**` change)
triggers `.github/workflows/tancom-desktop-build.yml` which:

1. Builds on `windows-latest` (produces `.exe`) and `macos-latest` (produces `.dmg`)
2. Uploads both installers as downloadable GitHub Actions artifacts
3. Creates a **draft** GitHub Release with both installers attached

## Coordinate mapping

Remote control uses **normalised [0, 1] coordinates** relative to the shared
screen area. When the controlled machine is running the desktop app, the preload
converts these to absolute screen pixels using the primary display's resolution.

> **Best results with "Entire Screen" sharing.** Window-sharing may introduce
> a small offset because the sharer's screen might not fill the video tile 1:1.

## Remote control capabilities

| Action | Supported |
|---|---|
| Move cursor | ✅ |
| Left / right click | ✅ |
| Scroll (mouse wheel) | ✅ |
| Keyboard input (letters, numbers) | ✅ |
| Modifier keys (Ctrl, Shift, Alt, Cmd) | ✅ |
| Function keys (F1–F12) | ✅ |
| Arrow / Home / End / Page keys | ✅ |
| Double-click | ✅ |

## Dependencies

- **[Electron](https://www.electronjs.org/)** — desktop shell
- **[robotjs](https://github.com/octalmage/robotjs)** — OS-level mouse/keyboard injection
- **[electron-builder](https://www.electron.build/)** — cross-platform installer packaging
- **[@electron/rebuild](https://github.com/electron/rebuild)** — recompiles native modules against Electron's Node version
