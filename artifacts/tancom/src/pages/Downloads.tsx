import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Apple,
  CheckCircle2,
  Download,
  Monitor,
  Shield,
} from "lucide-react";
import tancomLogo from "@assets/TanCom_Logo_1780923314837.jpeg";
import {
  formatBytes,
  loadDesktopDownloads,
  type DesktopArtifact,
  type PlatformId,
} from "@/lib/desktopDownloadsCatalog";

const PLATFORM_ICON: Record<PlatformId, typeof Monitor> = {
  windows: Monitor,
  mac: Apple,
  linux: Monitor,
};

const PLATFORM_THEME: Record<PlatformId, { bg: string; icon: string; button: string }> = {
  windows: { bg: "bg-blue-100", icon: "text-blue-600", button: "bg-blue-600 hover:bg-blue-700" },
  mac: { bg: "bg-gray-100", icon: "text-gray-800", button: "bg-gray-800 hover:bg-gray-900" },
  linux: { bg: "bg-orange-100", icon: "text-orange-600", button: "bg-orange-600 hover:bg-orange-700" },
};

function PlatformCard({ artifact }: { artifact: DesktopArtifact }) {
  const Icon = PLATFORM_ICON[artifact.platform];
  const theme = PLATFORM_THEME[artifact.platform];
  const sizeLabel = formatBytes(artifact.sizeBytes);

  return (
    <article
      data-testid={`download-card-${artifact.platform}`}
      className="flex flex-col rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${theme.bg}`}>
          <Icon className={`h-6 w-6 ${theme.icon}`} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">TanCom for {artifact.label}</h2>
          <p className="text-sm text-gray-500">Version {artifact.version}</p>
        </div>
      </div>
      <dl className="mb-5 space-y-2 text-sm text-gray-600">
        <div className="flex justify-between gap-3">
          <dt>File</dt>
          <dd className="font-medium text-gray-900 break-all text-right">{artifact.filename}</dd>
        </div>
        {sizeLabel && (
          <div className="flex justify-between gap-3">
            <dt>Size</dt>
            <dd className="font-medium text-gray-900">{sizeLabel}</dd>
          </div>
        )}
        {artifact.sha256 && (
          <div>
            <dt className="mb-1">SHA-256</dt>
            <dd>
              <code
                data-testid={`download-sha-${artifact.platform}`}
                className="block break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-700"
              >
                {artifact.sha256}
              </code>
            </dd>
          </div>
        )}
      </dl>
      <a
        href={artifact.downloadUrl}
        download={artifact.filename}
        data-testid={`download-button-${artifact.platform}`}
        className={`mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-md transition-colors ${theme.button}`}
      >
        <Download className="h-4 w-4" />
        Download {artifact.label}
      </a>
    </article>
  );
}

export default function DownloadsPage() {
  const [platforms, setPlatforms] = useState<DesktopArtifact[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDesktopDownloads().then((rows) => {
      if (!cancelled) setPlatforms(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src={tancomLogo} alt="TanCom" className="h-12 w-auto cursor-pointer object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get started free</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 px-6 py-20 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-600/20 px-4 py-1.5 text-sm text-blue-300">
            <Download className="h-3.5 w-3.5" />
            Packaged desktop apps
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">Download TanCom</h1>
          <p className="mx-auto max-w-2xl text-lg text-gray-300">
            Install the latest TanCom desktop app for your computer. These are packaged builds only — not source code.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        {platforms === null && (
          <p className="text-center text-sm text-gray-500">Checking for desktop installers…</p>
        )}
        {platforms && platforms.length === 0 && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
            <p className="text-sm font-semibold text-amber-900">No desktop installers are uploaded yet.</p>
            <p className="mt-2 text-sm text-amber-800">
              Put the Windows, macOS, or Linux packages in the Repl <code className="rounded bg-white px-1.5 py-0.5">downloads/</code> folder (or Object Storage), then refresh this page. Do not publish source zip or tar archives.
            </p>
          </div>
        )}
        {platforms && platforms.length > 0 && (
          <div className={`grid grid-cols-1 gap-6 ${platforms.length > 1 ? "md:grid-cols-2" : "md:grid-cols-1 max-w-xl mx-auto"}`}>
            {platforms.map((artifact) => (
              <PlatformCard key={artifact.platform} artifact={artifact} />
            ))}
          </div>
        )}

        <div className="mt-12 rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Shield className="h-4 w-4 text-blue-600" />
            Hosted on this website
          </div>
          <p className="text-sm leading-relaxed text-gray-600">
            Prefer uploading the <code className="rounded bg-white px-1.5 py-0.5">.exe</code> / <code className="rounded bg-white px-1.5 py-0.5">.dmg</code> / <code className="rounded bg-white px-1.5 py-0.5">.AppImage</code> files into this Repl so people download from <strong>/downloads</strong>, not from GitHub. Env URLs are only a fallback if Object Storage is not ready. After install, the app still opens <strong>https://tancom.us</strong> until <code className="rounded bg-white px-1.5 py-0.5">TANCOM_URL</code> is set to this Repl’s HTTPS URL.
          </p>
        </div>
      </section>

      <section className="bg-blue-600 px-6 py-14 text-center text-white">
        <h2 className="mb-3 text-2xl font-bold">Already have an account?</h2>
        <p className="mb-6 text-sm text-blue-100">Sign in on the web after you install the desktop app.</p>
        <Link href="/sign-in">
          <button className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3 font-semibold text-blue-600 shadow hover:bg-blue-50">
            Sign in to TanCom
          </button>
        </Link>
      </section>

      <footer className="border-t border-gray-200 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-gray-500 sm:flex-row">
          <Link href="/">
            <img src={tancomLogo} alt="TanCom" className="h-10 w-auto cursor-pointer object-contain" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/"><span className="cursor-pointer hover:text-gray-800">Home</span></Link>
            <Link href="/sign-in"><span className="cursor-pointer hover:text-gray-800">Sign in</span></Link>
            <Link href="/sign-up"><span className="cursor-pointer hover:text-gray-800">Sign up</span></Link>
          </div>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            © {new Date().getFullYear()} TanCom. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
