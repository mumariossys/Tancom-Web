# Desktop installers (not git)

Upload packaged TanCom apps here on the Repl. Do **not** commit these binaries and do **not** put source zip/tar archives in this folder.

Suggested names:

- `TanCom.Setup.1.0.3.exe` (Windows)
- `TanCom-1.0.3-linux-x64.AppImage` (Linux)
- `TanCom-1.0.3.dmg` (macOS, only a real packaged DMG)

Optional sidecar next to a file, one SHA-256 hex digest:

```
TanCom.Setup.1.0.3.exe.sha256
```

Subfolders `windows/`, `mac/`, and `linux/` also work.

If Object Storage is enabled, public objects named `desktop/TanCom.Setup.1.0.3.exe` (and the Linux/macOS equivalents) are listed too.

Env fallback (only if a local file / object is missing): `DESKTOP_WINDOWS_URL`, `DESKTOP_MAC_URL`, `DESKTOP_LINUX_URL`, plus optional `_SHA256`, `_VERSION`, `_SIZE`, `_FILENAME`.
