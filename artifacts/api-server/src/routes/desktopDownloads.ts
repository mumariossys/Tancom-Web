import { Router, type IRouter, type Request, type Response } from "express";
import {
  downloadsDirFromEnv,
  envArtifacts,
  isSafePlatform,
  localArtifacts,
  mergeCatalog,
  objectDownloadUrl,
  OBJECT_CANDIDATES,
  PLATFORM_LABELS,
  versionFromFilename,
  type DesktopArtifact,
  type PlatformId,
} from "../lib/desktopDownloads";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();

type CatalogCache = {
  expiresAt: number;
  platforms: DesktopArtifact[];
  localFiles: Partial<Record<PlatformId, string>>;
};

let cache: CatalogCache | null = null;
const CACHE_MS = 15_000;

async function objectStorageArtifacts(): Promise<Partial<Record<PlatformId, DesktopArtifact>>> {
  if (!process.env.PUBLIC_OBJECT_SEARCH_PATHS?.trim()) return {};
  const out: Partial<Record<PlatformId, DesktopArtifact>> = {};
  try {
    const storage = new ObjectStorageService();
    for (const [platform, candidates] of Object.entries(OBJECT_CANDIDATES) as [PlatformId, string[]][]) {
      for (const objectPath of candidates) {
        const file = await storage.searchPublicObject(objectPath);
        if (!file) continue;
        let sizeBytes: number | null = null;
        try {
          const [metadata] = await file.getMetadata();
          const size = Number(metadata.size);
          sizeBytes = Number.isFinite(size) ? size : null;
        } catch {
          sizeBytes = null;
        }
        const filename = objectPath.split("/").pop() || objectPath;
        out[platform] = {
          platform,
          label: PLATFORM_LABELS[platform],
          version: versionFromFilename(filename),
          filename,
          sizeBytes,
          sha256: null,
          downloadUrl: objectDownloadUrl(objectPath),
          source: "object-storage",
        };
        break;
      }
    }
  } catch {
    return {};
  }
  return out;
}

async function buildCatalog(): Promise<CatalogCache> {
  const dir = downloadsDirFromEnv();
  const local = await localArtifacts(dir, { hash: true });
  const platforms = mergeCatalog({
    local: local.artifacts,
    objectStorage: await objectStorageArtifacts(),
    env: envArtifacts(process.env),
  });
  const localFiles: Partial<Record<PlatformId, string>> = {};
  for (const [platform, file] of Object.entries(local.files) as [PlatformId, { absPath: string }][]) {
    localFiles[platform] = file.absPath;
  }
  return {
    expiresAt: Date.now() + CACHE_MS,
    platforms,
    localFiles,
  };
}

async function getCatalog(): Promise<CatalogCache> {
  if (cache && cache.expiresAt > Date.now()) return cache;
  cache = await buildCatalog();
  return cache;
}

/**
 * GET /desktop-downloads
 *
 * Public catalog of packaged TanCom desktop apps. Platforms without an
 * uploaded file or env URL are omitted. Does not use auth.
 */
router.get("/desktop-downloads", async (req: Request, res: Response) => {
  try {
    const catalog = await getCatalog();
    res.json({
      hostOnRepl: true,
      platforms: catalog.platforms,
    });
  } catch (error) {
    req.log.error({ err: error }, "desktop downloads catalog failed");
    res.status(500).json({ error: "Could not list desktop downloads" });
  }
});

/**
 * GET /desktop-downloads/files/:platform
 *
 * Streams a file from the local downloads/ directory (not git). Env URL
 * artifacts are not proxied — the catalog points at those URLs directly.
 */
router.get("/desktop-downloads/files/:platform", async (req: Request, res: Response) => {
  const platform = String(req.params.platform ?? "");
  if (!isSafePlatform(platform)) {
    res.status(404).json({ error: "Unknown platform" });
    return;
  }
  try {
    const catalog = await getCatalog();
    const absPath = catalog.localFiles[platform];
    if (!absPath) {
      res.status(404).json({ error: "No local installer for this platform" });
      return;
    }
    const artifact = catalog.platforms.find((row) => row.platform === platform && row.source === "local");
    const filename = artifact?.filename || absPath.split("/").pop() || "download";
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (artifact?.sha256) {
      res.setHeader("X-Checksum-SHA256", artifact.sha256);
    }
    res.download(absPath, filename);
  } catch (error) {
    req.log.error({ err: error }, "desktop download file failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Could not serve installer" });
    }
  }
});

export default router;
