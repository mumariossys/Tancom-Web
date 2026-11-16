import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  classifyFilename,
  envArtifact,
  envArtifacts,
  formatBytes,
  localArtifacts,
  mergeCatalog,
  normalizeSha,
  pickPreferredLocal,
  versionFromFilename,
  type DesktopArtifact,
  type LocalFileInfo,
} from "./desktopDownloads.ts";

describe("classifyFilename", () => {
  it("maps installer extensions and hides source archives", () => {
    assert.equal(classifyFilename("TanCom.Setup.1.0.3.exe"), "windows");
    assert.equal(classifyFilename("TanCom-1.0.3-linux-x64.AppImage"), "linux");
    assert.equal(classifyFilename("TanCom-1.0.3.dmg"), "mac");
    assert.equal(classifyFilename("TanCom-1.0.3-mac.zip"), "mac");
    assert.equal(classifyFilename("tancom-desktop-source.zip"), null);
    assert.equal(classifyFilename("TanCom-source.zip"), null);
    assert.equal(classifyFilename("README.md"), null);
    assert.equal(classifyFilename("TanCom.Setup.1.0.3.exe.sha256"), null);
  });
});

describe("versionFromFilename", () => {
  it("reads the dotted version and falls back", () => {
    assert.equal(versionFromFilename("TanCom.Setup.1.0.3.exe"), "1.0.3");
    assert.equal(versionFromFilename("TanCom.dmg"), "1.0.3");
  });
});

describe("normalizeSha and formatBytes", () => {
  it("accepts a 64-char hex digest", () => {
    const sha = "d4247652dfa2fde3c6bd314553c2f25a23a81ca513d396099a2bcf3046817b1e";
    assert.equal(normalizeSha(sha), sha);
    assert.equal(normalizeSha(`SHA-256:${sha}`), sha);
    assert.equal(normalizeSha("nope"), null);
  });

  it("formats byte sizes for the downloads page", () => {
    assert.equal(formatBytes(78382520), "74.8 MB");
    assert.equal(formatBytes(null), null);
  });
});

describe("envArtifact", () => {
  it("hides a platform when its URL is unset", () => {
    assert.equal(envArtifact("mac", {}), null);
  });

  it("builds a Windows row from env URLs", () => {
    const artifact = envArtifact("windows", {
      DESKTOP_WINDOWS_URL:
        "https://github.com/mumariossys/Tancom-Web/releases/download/desktop-1.0.3-windows/TanCom.Setup.1.0.3.exe",
      DESKTOP_WINDOWS_SHA256: "d4247652dfa2fde3c6bd314553c2f25a23a81ca513d396099a2bcf3046817b1e",
      DESKTOP_WINDOWS_SIZE: "78382520",
      DESKTOP_WINDOWS_VERSION: "1.0.3",
    });
    assert.ok(artifact);
    assert.equal(artifact.platform, "windows");
    assert.equal(artifact.filename, "TanCom.Setup.1.0.3.exe");
    assert.equal(artifact.source, "env");
    assert.equal(artifact.sizeBytes, 78382520);
  });
});

describe("mergeCatalog", () => {
  const windowsEnv: DesktopArtifact = {
    platform: "windows",
    label: "Windows",
    version: "1.0.3",
    filename: "TanCom.Setup.1.0.3.exe",
    sizeBytes: 1,
    sha256: null,
    downloadUrl: "https://example.com/win.exe",
    source: "env",
  };
  const windowsLocal: DesktopArtifact = {
    ...windowsEnv,
    downloadUrl: "/api/desktop-downloads/files/windows",
    source: "local",
  };

  it("keeps local files ahead of Object Storage and env URLs", () => {
    const catalog = mergeCatalog({
      local: { windows: windowsLocal },
      objectStorage: {},
      env: { windows: windowsEnv, linux: { ...windowsEnv, platform: "linux", label: "Linux", source: "env" } },
    });
    assert.equal(catalog.length, 2);
    assert.equal(catalog[0]?.source, "local");
    assert.equal(catalog[0]?.platform, "windows");
    assert.equal(catalog[1]?.platform, "linux");
  });

  it("omits platforms that have no artifact", () => {
    const catalog = mergeCatalog({
      local: {},
      objectStorage: {},
      env: { windows: windowsEnv },
    });
    assert.deepEqual(catalog.map((row) => row.platform), ["windows"]);
  });
});

describe("pickPreferredLocal", () => {
  it("prefers a 1.0.3 installer over an older file", () => {
    const older: LocalFileInfo = {
      platform: "windows",
      absPath: "/tmp/old.exe",
      filename: "TanCom.Setup.1.0.0.exe",
      sizeBytes: 10,
      mtimeMs: 9,
      sha256: null,
    };
    const newest: LocalFileInfo = {
      ...older,
      absPath: "/tmp/new.exe",
      filename: "TanCom.Setup.1.0.3.exe",
      mtimeMs: 1,
    };
    assert.equal(pickPreferredLocal([older, newest]).filename, "TanCom.Setup.1.0.3.exe");
  });
});

describe("localArtifacts", () => {
  it("reads installers and sha256 sidecars from downloads/", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tancom-downloads-"));
    const sha = "d4247652dfa2fde3c6bd314553c2f25a23a81ca513d396099a2bcf3046817b1e";
    await writeFile(path.join(dir, "TanCom.Setup.1.0.3.exe"), "fake-windows-installer");
    await writeFile(path.join(dir, "TanCom.Setup.1.0.3.exe.sha256"), `${sha}  TanCom.Setup.1.0.3.exe\n`);
    await mkdir(path.join(dir, "linux"));
    await writeFile(path.join(dir, "linux", "TanCom-1.0.3-linux-x64.AppImage"), "fake-linux");
    await writeFile(path.join(dir, "README.md"), "ignore me");
    await writeFile(path.join(dir, "tancom-desktop-source.zip"), "not an installer");

    const { artifacts } = await localArtifacts(dir, { hash: false });
    assert.equal(artifacts.windows?.filename, "TanCom.Setup.1.0.3.exe");
    assert.equal(artifacts.windows?.sha256, sha);
    assert.equal(artifacts.windows?.downloadUrl, "/api/desktop-downloads/files/windows");
    assert.equal(artifacts.linux?.filename, "TanCom-1.0.3-linux-x64.AppImage");
    assert.equal(artifacts.mac, undefined);
  });
});

describe("envArtifacts", () => {
  it("returns only platforms with URLs", () => {
    const found = envArtifacts({
      DESKTOP_WINDOWS_URL: "https://files.example/TanCom.Setup.1.0.3.exe",
    });
    assert.equal(Object.keys(found).join(","), "windows");
  });
});
