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

export type DesktopDownloadsResponse = {
  hostOnRepl?: boolean;
  platforms: DesktopArtifact[];
};

const PLATFORM_ORDER: PlatformId[] = ["windows", "mac", "linux"];

const LABELS: Record<PlatformId, string> = {
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
};

function isPlatform(value: string): value is PlatformId {
  return PLATFORM_ORDER.includes(value as PlatformId);
}

function asArtifact(value: unknown): DesktopArtifact | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.platform !== "string" || !isPlatform(row.platform)) return null;
  if (typeof row.downloadUrl !== "string" || !row.downloadUrl.trim()) return null;
  const filename =
    typeof row.filename === "string" && row.filename.trim()
      ? row.filename.trim()
      : row.platform;
  const source: ArtifactSource =
    row.source === "local" || row.source === "object-storage" || row.source === "env"
      ? row.source
      : "env";
  const sizeBytes = typeof row.sizeBytes === "number" && Number.isFinite(row.sizeBytes)
    ? row.sizeBytes
    : null;
  const sha256 = typeof row.sha256 === "string" && /^[0-9a-f]{64}$/i.test(row.sha256)
    ? row.sha256.toLowerCase()
    : null;
  return {
    platform: row.platform,
    label: typeof row.label === "string" && row.label.trim() ? row.label : LABELS[row.platform],
    version: typeof row.version === "string" && row.version.trim() ? row.version : "1.0.3",
    filename,
    sizeBytes,
    sha256,
    downloadUrl: row.downloadUrl.trim(),
    source,
  };
}

export function parseDesktopDownloadsResponse(data: unknown): DesktopArtifact[] {
  if (!data || typeof data !== "object") return [];
  const platforms = (data as DesktopDownloadsResponse).platforms;
  if (!Array.isArray(platforms)) return [];
  const found = new Map<PlatformId, DesktopArtifact>();
  for (const row of platforms) {
    const artifact = asArtifact(row);
    if (artifact && !found.has(artifact.platform)) found.set(artifact.platform, artifact);
  }
  return PLATFORM_ORDER.map((platform) => found.get(platform)).filter(
    (row): row is DesktopArtifact => !!row,
  );
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

type ViteEnv = Record<string, string | undefined>;

function envUrlArtifact(
  platform: PlatformId,
  url: string | undefined,
  sha256: string | undefined,
  version: string | undefined,
  size: string | undefined,
  filename: string | undefined,
): DesktopArtifact | null {
  const downloadUrl = url?.trim();
  if (!downloadUrl) return null;
  let parsedName = filename?.trim();
  if (!parsedName) {
    try {
      parsedName = decodeURIComponent(new URL(downloadUrl, "https://example.invalid").pathname.split("/").pop() || "");
    } catch {
      parsedName = "";
    }
  }
  const sizeBytes = size && /^\d+$/.test(size) ? Number(size) : null;
  const versionMatch = (parsedName || "").match(/(\d+\.\d+\.\d+)/);
  return {
    platform,
    label: LABELS[platform],
    version: version?.trim() || versionMatch?.[1] || "1.0.3",
    filename: parsedName || `${platform}-installer`,
    sizeBytes,
    sha256: sha256 && /^[0-9a-f]{64}$/i.test(sha256.trim()) ? sha256.trim().toLowerCase() : null,
    downloadUrl,
    source: "env",
  };
}

/** Frontend fallback when the API catalog is empty or the route is not applied yet. */
export function envFallbackCatalog(env: ViteEnv = import.meta.env as ViteEnv): DesktopArtifact[] {
  return [
    envUrlArtifact(
      "windows",
      env.VITE_DESKTOP_WINDOWS_URL,
      env.VITE_DESKTOP_WINDOWS_SHA256,
      env.VITE_DESKTOP_WINDOWS_VERSION,
      env.VITE_DESKTOP_WINDOWS_SIZE,
      env.VITE_DESKTOP_WINDOWS_FILENAME,
    ),
    envUrlArtifact(
      "mac",
      env.VITE_DESKTOP_MAC_URL,
      env.VITE_DESKTOP_MAC_SHA256,
      env.VITE_DESKTOP_MAC_VERSION,
      env.VITE_DESKTOP_MAC_SIZE,
      env.VITE_DESKTOP_MAC_FILENAME,
    ),
    envUrlArtifact(
      "linux",
      env.VITE_DESKTOP_LINUX_URL,
      env.VITE_DESKTOP_LINUX_SHA256,
      env.VITE_DESKTOP_LINUX_VERSION,
      env.VITE_DESKTOP_LINUX_SIZE,
      env.VITE_DESKTOP_LINUX_FILENAME,
    ),
  ].filter((row): row is DesktopArtifact => !!row);
}

export async function loadDesktopDownloads(): Promise<DesktopArtifact[]> {
  try {
    const response = await fetch("/api/desktop-downloads");
    if (response.ok) {
      const data: unknown = await response.json();
      const platforms = parseDesktopDownloadsResponse(data);
      if (platforms.length > 0) return platforms;
    }
  } catch {
    // Fall through to env URLs so a frontend-only overlay still works.
  }
  return envFallbackCatalog();
}
