import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  envFallbackCatalog,
  formatBytes,
  parseDesktopDownloadsResponse,
} from "./desktopDownloadsCatalog.ts";

describe("parseDesktopDownloadsResponse", () => {
  it("keeps Windows and hides platforms that are missing", () => {
    const platforms = parseDesktopDownloadsResponse({
      platforms: [
        {
          platform: "windows",
          label: "Windows",
          version: "1.0.3",
          filename: "TanCom.Setup.1.0.3.exe",
          sizeBytes: 78382520,
          sha256: "d4247652dfa2fde3c6bd314553c2f25a23a81ca513d396099a2bcf3046817b1e",
          downloadUrl: "/api/desktop-downloads/files/windows",
          source: "local",
        },
        { platform: "mac", downloadUrl: "" },
      ],
    });
    assert.equal(platforms.length, 1);
    assert.equal(platforms[0]?.platform, "windows");
    assert.equal(platforms[0]?.version, "1.0.3");
  });

  it("returns an empty list for junk payloads", () => {
    assert.deepEqual(parseDesktopDownloadsResponse(null), []);
    assert.deepEqual(parseDesktopDownloadsResponse({ platforms: "nope" }), []);
  });
});

describe("envFallbackCatalog", () => {
  it("lists only platforms that have a VITE URL", () => {
    const platforms = envFallbackCatalog({
      VITE_DESKTOP_WINDOWS_URL:
        "https://github.com/mumariossys/Tancom-Web/releases/download/desktop-1.0.3-windows/TanCom.Setup.1.0.3.exe",
      VITE_DESKTOP_WINDOWS_SHA256: "d4247652dfa2fde3c6bd314553c2f25a23a81ca513d396099a2bcf3046817b1e",
      VITE_DESKTOP_WINDOWS_SIZE: "78382520",
      VITE_DESKTOP_WINDOWS_VERSION: "1.0.3",
    });
    assert.equal(platforms.length, 1);
    assert.equal(platforms[0]?.platform, "windows");
    assert.equal(platforms[0]?.source, "env");
    assert.match(platforms[0]?.downloadUrl ?? "", /TanCom\.Setup\.1\.0\.3\.exe/);
  });
});

describe("formatBytes", () => {
  it("shows the Windows installer size in MB", () => {
    assert.equal(formatBytes(78382520), "74.8 MB");
  });
});
