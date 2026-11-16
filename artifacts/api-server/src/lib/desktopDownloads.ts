import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type PlatformId = "windows" | "mac" | "linux";
export type ArtifactSource = "local" | "object-storage" | "env";

export type DesktopArtifact = {
  platform: PlatformId;
  label: string;
  version: string;
  filename: string;
  sizeBytes: number | null;
  sha256: string | null;
  downloadUrl: string;
  source: ArtifactSource;
};

export const PLATFORM_ORDER: PlatformId[] = ["windows", "mac", "linux"];

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
};

export type EnvMap = Record<string, string | undefined>;

export const ENV_KEYS: Record<
  PlatformId,
  { url: string; sha256: string; version: string; size: string; filename: string }
> = {
  windows: {
    url: "DESKTOP_WINDOWS_URL",
    sha256: "DESKTOP_WINDOWS_SHA256",
    version: "DESKTOP_WINDOWS_VERSION",
    size: "DESKTOP_WINDOWS_SIZE",
    filename: "DESKTOP_WINDOWS_FILENAME",
  },
  mac: {
    url: "DESKTOP_MAC_URL",
    sha256: "DESKTOP_MAC_SHA256",
    version: "DESKTOP_MAC_VERSION",
    size: "DESKTOP_MAC_SIZE",
    filename: "DESKTOP_MAC_FILENAME",
  },
  linux: {
    url: "DESKTOP_LINUX_URL",
    sha256: "DESKTOP_LINUX_SHA256",
    version: "DESKTOP_LINUX_VERSION",
    size: "DESKTOP_LINUX_SIZE",
    filename: "DESKTOP_LINUX_FILENAME",
  },
};

export const OBJECT_CANDIDATES: Record<PlatformId, string[]> = {
  windows: [
    "desktop/TanCom.Setup.1.0.3.exe",
    "desktop/windows.exe",
    "TanCom.Setup.1.0.3.exe",
  ],
  mac: [
    "desktop/TanCom-1.0.3.dmg",
    "desktop/TanCom.dmg",
    "desktop/mac.dmg",
    "TanCom-1.0.3.dmg",
  ],
  linux: [
    "desktop/TanCom-1.0.3-linux-x64.AppImage",
    "desktop/linux.AppImage",
    "TanCom-1.0.3-linux-x64.AppImage",
  ],
};

const SOURCE_ARCHIVE_RE = /(source|src)[-_.]|(^|[-_.])(zipball|tarball)/i;
const SHA_SIDECAR_RE = /\.sha256$/i;

export type LocalFileInfo = {
  platform: PlatformId;
  absPath: string;
  filename: string;
  sizeBytes: number;
  mtimeMs: number;
  sha256: string | null;
};

export function downloadsDirFromEnv(env: EnvMap = process.env, cwd = process.cwd()): string {
  const override = env.DESKTOP_DOWNLOADS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.resolve(cwd, "downloads");
}

export function classifyFilename(filename: string): PlatformId | null {
  const lower = filename.toLowerCase();
  if (SHA_SIDECAR_RE.test(lower)) return null;
  if (SOURCE_ARCHIVE_RE.test(lower) || lower.includes("tancom-desktop-source")) return null;
  if (lower === "readme.md" || lower === ".gitkeep") return null;
  if (lower.endsWith(".exe")) return "windows";
  if (lower.endsWith(".appimage")) return "linux";
  if (lower.endsWith(".dmg")) return "mac";
  if (lower.endsWith(".zip") && /tancom/i.test(filename) && !/source/i.test(filename)) {
    return "mac";
  }
  return null;
}

export function versionFromFilename(filename: string, fallback = "1.0.3"): string {
  const match = filename.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? fallback;
}

export function formatBytes(n: number | null): string | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function normalizeSha(value: string | undefined | null): string | null {
  if (!value) return null;
  const hex = value.trim().toLowerCase().replace(/^sha-?256:\s*/, "");
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

export function filenameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "https://example.invalid");
    const base = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return base || null;
  } catch {
    return null;
  }
}

export function defaultFilename(platform: PlatformId): string {
  switch (platform) {
    case "windows":
      return "TanCom.Setup.1.0.3.exe";
    case "mac":
      return "TanCom-1.0.3.dmg";
    case "linux":
      return "TanCom-1.0.3-linux-x64.AppImage";
  }
}

export function localDownloadUrl(platform: PlatformId): string {
  return `/api/desktop-downloads/files/${platform}`;
}

export function objectDownloadUrl(objectPath: string): string {
  return `/api/storage/public-objects/${objectPath.replace(/^\/+/, "")}`;
}

export function envArtifact(platform: PlatformId, env: EnvMap): DesktopArtifact | null {
  const keys = ENV_KEYS[platform];
  const url = env[keys.url]?.trim();
  if (!url) return null;
  const filename =
    env[keys.filename]?.trim() ||
    filenameFromUrl(url) ||
    defaultFilename(platform);
  const sizeRaw = env[keys.size]?.trim();
  const sizeBytes = sizeRaw && /^\d+$/.test(sizeRaw) ? Number(sizeRaw) : null;
  return {
    platform,
    label: PLATFORM_LABELS[platform],
    version: env[keys.version]?.trim() || versionFromFilename(filename),
    filename,
    sizeBytes,
    sha256: normalizeSha(env[keys.sha256]),
    downloadUrl: url,
    source: "env",
  };
}

export function pickPreferredLocal(files: LocalFileInfo[]): LocalFileInfo {
  const ranked = [...files].sort((a, b) => {
    const aLatest = a.filename.includes("1.0.3") ? 1 : 0;
    const bLatest = b.filename.includes("1.0.3") ? 1 : 0;
    if (aLatest !== bLatest) return bLatest - aLatest;
    if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
    return b.sizeBytes - a.sizeBytes;
  });
  return ranked[0]!;
}

export function mergeCatalog(input: {
  local: Partial<Record<PlatformId, DesktopArtifact>>;
  objectStorage: Partial<Record<PlatformId, DesktopArtifact>>;
  env: Partial<Record<PlatformId, DesktopArtifact>>;
}): DesktopArtifact[] {
  const out: DesktopArtifact[] = [];
  for (const platform of PLATFORM_ORDER) {
    const artifact =
      input.local[platform] ||
      input.objectStorage[platform] ||
      input.env[platform];
    if (artifact) out.push(artifact);
  }
  return out;
}

async function readShaSidecar(absPath: string): Promise<string | null> {
  try {
    const text = await readFile(`${absPath}.sha256`, "utf8");
    return normalizeSha(text.split(/\s+/)[0] ?? "");
  } catch {
    return null;
  }
}

export async function listLocalFiles(dir: string): Promise<LocalFileInfo[]> {
  const found: LocalFileInfo[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  for (const name of entries) {
    const abs = path.join(dir, name);
    let info;
    try {
      info = await stat(abs);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      if (!["windows", "mac", "linux", "macos"].includes(name.toLowerCase())) continue;
      let children: string[] = [];
      try {
        children = await readdir(abs);
      } catch {
        continue;
      }
      for (const child of children) {
        const childAbs = path.join(abs, child);
        let childInfo;
        try {
          childInfo = await stat(childAbs);
        } catch {
          continue;
        }
        if (!childInfo.isFile()) continue;
        const platform = classifyFilename(child);
        if (!platform) continue;
        found.push({
          platform,
          absPath: childAbs,
          filename: child,
          sizeBytes: childInfo.size,
          mtimeMs: childInfo.mtimeMs,
          sha256: await readShaSidecar(childAbs),
        });
      }
      continue;
    }
    if (!info.isFile()) continue;
    const platform = classifyFilename(name);
    if (!platform) continue;
    found.push({
      platform,
      absPath: abs,
      filename: name,
      sizeBytes: info.size,
      mtimeMs: info.mtimeMs,
      sha256: await readShaSidecar(abs),
    });
  }
  return found;
}

const shaCache = new Map<string, { sizeBytes: number; mtimeMs: number; sha256: string }>();

export async function sha256File(absPath: string, sizeBytes: number, mtimeMs: number): Promise<string> {
  const cached = shaCache.get(absPath);
  if (cached && cached.sizeBytes === sizeBytes && cached.mtimeMs === mtimeMs) {
    return cached.sha256;
  }
  const hash = createHash("sha256");
  const stream = createReadStream(absPath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  const sha256 = hash.digest("hex");
  shaCache.set(absPath, { sizeBytes, mtimeMs, sha256 });
  return sha256;
}

export async function localArtifacts(
  dir: string,
  options: { hash: boolean } = { hash: true },
): Promise<{ artifacts: Partial<Record<PlatformId, DesktopArtifact>>; files: Partial<Record<PlatformId, LocalFileInfo>> }> {
  const files = await listLocalFiles(dir);
  const grouped: Partial<Record<PlatformId, LocalFileInfo[]>> = {};
  for (const file of files) {
    (grouped[file.platform] ??= []).push(file);
  }
  const chosen: Partial<Record<PlatformId, LocalFileInfo>> = {};
  const artifacts: Partial<Record<PlatformId, DesktopArtifact>> = {};
  for (const platform of PLATFORM_ORDER) {
    const group = grouped[platform];
    if (!group?.length) continue;
    const file = pickPreferredLocal(group);
    chosen[platform] = file;
    let sha256 = file.sha256;
    if (!sha256 && options.hash) {
      sha256 = await sha256File(file.absPath, file.sizeBytes, file.mtimeMs);
    }
    artifacts[platform] = {
      platform,
      label: PLATFORM_LABELS[platform],
      version: versionFromFilename(file.filename),
      filename: file.filename,
      sizeBytes: file.sizeBytes,
      sha256,
      downloadUrl: localDownloadUrl(platform),
      source: "local",
    };
  }
  return { artifacts, files: chosen };
}

export function envArtifacts(env: EnvMap): Partial<Record<PlatformId, DesktopArtifact>> {
  const out: Partial<Record<PlatformId, DesktopArtifact>> = {};
  for (const platform of PLATFORM_ORDER) {
    const artifact = envArtifact(platform, env);
    if (artifact) out[platform] = artifact;
  }
  return out;
}

export function isSafePlatform(value: string): value is PlatformId {
  return PLATFORM_ORDER.includes(value as PlatformId);
}
