import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Monitor, Smartphone, Download, CheckCircle2, Apple, Globe,
  Shield, Zap, Wifi, RefreshCw, Video, Users, MessageSquare,
  Check, ArrowRight, ExternalLink, Terminal, Package,
} from "lucide-react";

/** Pre-built installers — uploaded to public/ after CI builds them */
const DESKTOP_WIN_URL = "/tancom-setup-windows.exe";
const DESKTOP_MAC_URL = "/tancom-setup-mac.dmg";
/** Source zip with setup scripts — fallback for developers */
const DESKTOP_SOURCE_ZIP_URL = "/tancom-desktop-source.zip";
import tancomLogo from "@assets/TanCom_Logo_1780923314837.jpeg";

/**
 * Probe whether a pre-built installer is available by firing a HEAD
 * request.  Returns true only when the server responds 200 AND the
 * Content-Type is a binary type — this filters out the SPA fallback
 * (Vite/Nginx return 200 text/html for unknown routes, not the file).
 */
async function checkInstallerAvailable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    if (!r.ok) return false;
    const ct = r.headers.get("content-type") ?? "";
    return !ct.includes("text/html");
  } catch {
    return false;
  }
}

// ── Platform detection ────────────────────────────────────────────────────────
function detectPlatform(): "windows" | "mac" | "linux" | "android" | "ios" | "unknown" {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/ipad|iphone|ipod/i.test(ua)) return "ios";
  if (/win/i.test(ua)) return "windows";
  if (/mac/i.test(ua)) return "mac";
  if (/linux/i.test(ua)) return "linux";
  return "unknown";
}

// ── Platform config ───────────────────────────────────────────────────────────
const platforms = [
  {
    id: "windows",
    label: "Windows",
    version: "Windows 10 / 11",
    badge: "PWA · Install from browser",
    icon: Monitor,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    accentBg: "bg-blue-600",
    accentHover: "hover:bg-blue-700",
    size: null,
    requirements: "Windows 10 (64-bit) or later",
  },
  {
    id: "mac",
    label: "macOS",
    version: "macOS 12+",
    badge: "PWA · Install from browser",
    icon: Apple,
    iconBg: "bg-gray-100",
    iconColor: "text-gray-700",
    accentBg: "bg-gray-800",
    accentHover: "hover:bg-gray-900",
    size: null,
    requirements: "macOS 12 Monterey or later",
  },
  {
    id: "linux",
    label: "Linux",
    version: "Ubuntu / Debian / Fedora",
    badge: "PWA · Install from browser",
    icon: Monitor,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    accentBg: "bg-orange-600",
    accentHover: "hover:bg-orange-700",
    size: null,
    requirements: "Ubuntu 20.04+ / Fedora 34+ / Debian 11+",
  },
  {
    id: "android",
    label: "Android",
    version: "Android 9+",
    badge: "Google Play",
    icon: Smartphone,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    accentBg: "bg-green-600",
    accentHover: "hover:bg-green-700",
    size: null,
    requirements: "Android 9.0 (Pie) or later",
  },
  {
    id: "ios",
    label: "iPhone & iPad",
    version: "iOS 15+",
    badge: "App Store",
    icon: Smartphone,
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    accentBg: "bg-sky-500",
    accentHover: "hover:bg-sky-600",
    size: null,
    requirements: "iOS 15 or iPadOS 15 or later",
  },
];

const appFeatures = [
  { icon: Video,          label: "HD Video Meetings",     desc: "Up to 1080p with adaptive quality" },
  { icon: MessageSquare,  label: "In-call Chat & Emoji",  desc: "Private and group messaging" },
  { icon: Monitor,        label: "Screen Sharing",        desc: "Share your screen or specific apps" },
  { icon: Users,          label: "Host Controls",         desc: "Mute all, waiting room, recording" },
  { icon: Shield,         label: "End-to-End Encrypted",  desc: "DTLS-SRTP media + TLS signaling" },
  { icon: Wifi,           label: "Works Offline",         desc: "Access previous meetings without internet" },
  { icon: Zap,            label: "Low Latency",           desc: "Sub-100ms audio with WebRTC" },
  { icon: RefreshCw,      label: "Auto Updates",          desc: "Always on the latest version" },
];

// ── PWA install hook ──────────────────────────────────────────────────────────
function usePWAInstall() {
  const [prompt, setPrompt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt?: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt || !prompt.prompt) return false;
    await prompt.prompt();
    setPrompt(null);
    return true;
  };

  return { canInstall: !!prompt, install, installed };
}

// ── Download page ─────────────────────────────────────────────────────────────
export default function DownloadPage() {
  const detected = detectPlatform();
  const [selected, setSelected] = useState<"windows" | "mac" | "linux" | "android" | "ios">(
    detected === "unknown" ? "windows" : detected
  );
  const [downloadState, setDownloadState] = useState<Record<string, "idle" | "downloading" | "done">>({});
  const { canInstall, install, installed } = usePWAInstall();

  const activePlatform = platforms.find(p => p.id === selected)!;

  // Check whether pre-built installers are available (uploaded to public/)
  const [winAvailable, setWinAvailable] = useState<boolean | null>(null);
  const [macAvailable, setMacAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    checkInstallerAvailable(DESKTOP_WIN_URL).then(setWinAvailable);
    checkInstallerAvailable(DESKTOP_MAC_URL).then(setMacAvailable);
  }, []);

  const handleDownload = async (platformId: string) => {
    setDownloadState(s => ({ ...s, [platformId]: "downloading" }));

    const isMobile = platformId === "android" || platformId === "ios";

    if (isMobile) {
      // Mobile apps are coming soon — scroll to the coming-soon notice instead
      setTimeout(() => {
        document.getElementById("mobile-coming-soon")?.scrollIntoView({ behavior: "smooth", block: "center" });
        setDownloadState(s => ({ ...s, [platformId]: "idle" }));
      }, 400);
      return;
    }

    // Desktop: try PWA installation prompt first
    if (canInstall) {
      const ok = await install();
      setDownloadState(s => ({ ...s, [platformId]: ok ? "done" : "idle" }));
      return;
    }

    // No PWA prompt available — show the PWA install instructions inline
    setDownloadState(s => ({ ...s, [platformId]: "done" }));
  };

  const getButtonLabel = (platformId: string) => {
    const state = downloadState[platformId];
    if (state === "downloading") return "Opening…";
    if (state === "done") return installed ? "Installed ✓" : "Show install steps ✓";
    if (platformId === "android") return "Android — Coming Soon";
    if (platformId === "ios") return "iOS — Coming Soon";
    if (canInstall) return "Install TanCom (one click)";
    return "How to install";
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <img src={tancomLogo} alt="TanCom" className="h-12 w-auto object-contain cursor-pointer" />
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

      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 text-white py-20 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-6">
            <Download className="h-3.5 w-3.5" />
            Available on all platforms
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">
            Download TanCom
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Install TanCom from your browser in one click — no app store needed. Works on Windows, macOS, Linux, Android, and iOS.
          </p>
          {canInstall && (
            <div className="mt-6 inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2 text-green-300 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              Your browser supports instant installation — no store needed!
            </div>
          )}
        </div>
      </section>

      {/* Platform selector + main download card */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        {/* Platform tabs */}
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {platforms.map(p => {
            const Icon = p.icon;
            const isSelected = selected === p.id;
            const isDetected = p.id === detected;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id as "windows" | "mac" | "linux" | "android" | "ios")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-blue-600 border-blue-600 text-white shadow-md"
                    : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                <Icon className="h-4 w-4" />
                {p.label}
                {isDetected && !isSelected && (
                  <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">Your OS</span>
                )}
              </button>
            );
          })}
        </div>

        {/* PWA vs Desktop capability notice */}
        <div className="mb-10 rounded-2xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
            {/* PWA — available now */}
            <div className="p-6 bg-green-50">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <Check className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="text-sm font-bold text-green-800">PWA — Available now</span>
                <span className="ml-auto text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Free</span>
              </div>
              <p className="text-xs text-green-700 mb-3 leading-relaxed">
                Install from your browser — no download needed.
              </p>
              <ul className="space-y-1.5">
                {[
                  "HD video meetings",
                  "Screen sharing",
                  "Chat, recordings & contacts",
                  "Remote Control UI (browser mode)",
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-green-800">
                    <Check className="h-3 w-3 text-green-500 shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Desktop .exe / .dmg — direct installer download */}
            <div id="desktop-app-section" className="p-6 bg-blue-50">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <Monitor className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="text-sm font-bold text-blue-900">Desktop App (.exe / .dmg)</span>
                {(winAvailable || macAvailable) && (
                  <span className="ml-auto text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Ready</span>
                )}
              </div>
              <ul className="space-y-1.5 mb-4">
                {[
                  "Full Remote Control (real OS mouse & keyboard)",
                  "Screen share picker + multi-monitor support",
                  "OS-level input injection",
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-blue-800">
                    <Check className="h-3 w-3 text-blue-500 shrink-0" />{f}
                  </li>
                ))}
              </ul>

              {/* Primary: pre-built installer buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                {winAvailable === true && (
                  <a
                    href={DESKTOP_WIN_URL}
                    download="TanCom-Setup.exe"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    TanCom-Setup.exe (Windows)
                  </a>
                )}
                {macAvailable === true && (
                  <a
                    href={DESKTOP_MAC_URL}
                    download="TanCom.dmg"
                    className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    TanCom.dmg (macOS)
                  </a>
                )}
                {/* Fallback while checking or when no installer is built yet */}
                {winAvailable === false && macAvailable === false && (
                  <a
                    href={DESKTOP_SOURCE_ZIP_URL}
                    download="tancom-desktop-source.zip"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download (.zip with setup script)
                  </a>
                )}
              </div>
              {winAvailable === false && macAvailable === false && (
                <p className="text-[10px] text-blue-500">
                  Pre-built installer coming soon. The zip includes a setup script — extract and double-click <strong>setup.bat</strong> (Windows) or <strong>setup.command</strong> (Mac).
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Active platform card */}
        <div className="bg-white border border-gray-200 rounded-3xl shadow-lg overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Left — info */}
            <div className="flex-1 p-8 md:p-10">
              <div className="flex items-center gap-3 mb-2">
                <div className={`h-12 w-12 rounded-2xl ${activePlatform.iconBg} flex items-center justify-center`}>
                  <activePlatform.icon className={`h-6 w-6 ${activePlatform.iconColor}`} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">TanCom for {activePlatform.label}</h2>
                  <p className="text-sm text-gray-500">{activePlatform.version}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4 mb-6">
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                  {activePlatform.badge}
                </span>
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Free
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-5">
                <span className="font-medium text-gray-800">System requirements:</span> {activePlatform.requirements}
              </p>

              {/* PWA install steps for desktop */}
              {!["android", "ios"].includes(activePlatform.id) && (
                <div className="mb-6 rounded-xl bg-blue-50 border border-blue-100 p-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">How to install on {activePlatform.label}</p>
                  <ol className="space-y-2">
                    {[
                      { n: "1", text: "Open tancom.us in Chrome, Edge, or Brave" },
                      { n: "2", text: "Look for the install icon ⊕ in the address bar (top right)" },
                      { n: "3", text: 'Click it and choose "Install"' },
                      { n: "4", text: "TanCom opens in its own window — no browser bar" },
                    ].map(s => (
                      <li key={s.n} className="flex items-start gap-2.5 text-sm text-blue-900">
                        <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                        {s.text}
                      </li>
                    ))}
                  </ol>
                  {canInstall && (
                    <p className="mt-3 text-xs text-blue-600 font-medium">✓ Your browser supports instant install — click the button below!</p>
                  )}
                </div>
              )}

              {/* Feature list */}
              <div className="space-y-2 mb-8">
                {[
                  "All meeting features included",
                  "Screen sharing & recording",
                  "Runs in its own window (no browser bar)",
                  "Push notifications",
                  "Automatic updates",
                ].map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {!["android", "ios"].includes(activePlatform.id) ? (
                  canInstall ? (
                    <button
                      onClick={() => handleDownload(activePlatform.id)}
                      disabled={downloadState[activePlatform.id] === "downloading"}
                      className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-60 ${activePlatform.accentBg} ${activePlatform.accentHover}`}
                    >
                      {downloadState[activePlatform.id] === "done"
                        ? <><CheckCircle2 className="h-4 w-4" /> Installed ✓</>
                        : <><Download className="h-4 w-4" /> Install TanCom — one click</>
                      }
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <a
                        href="https://tancom.us"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 ${activePlatform.accentBg} ${activePlatform.accentHover}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open tancom.us to install
                      </a>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Once open, look for the <span className="font-semibold text-gray-700">⊕ icon</span> in the browser address bar → click it → choose <span className="font-semibold text-gray-700">"Install"</span>.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide shrink-0">Coming soon</span>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        The native {activePlatform.label} app is not yet available. Use TanCom in your browser — it works great on mobile too.
                      </p>
                    </div>
                    <a
                      href="/"
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      <Globe className="h-4 w-4" />
                      Use TanCom in browser
                    </a>
                  </div>
                )}
                <Link href="/sign-up">
                  <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors w-full sm:w-auto">
                    <Globe className="h-4 w-4" />
                    Use in browser
                  </button>
                </Link>
              </div>
            </div>

            {/* Right — visual */}
            <div className="md:w-72 bg-gradient-to-br from-blue-600 to-blue-800 p-8 flex flex-col justify-center gap-5">
              <div className="text-white">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-200 mb-1">Why download?</p>
                <h3 className="text-lg font-bold leading-snug">Better performance. Native notifications. One click to join.</h3>
              </div>
              {[
                { icon: Zap,    label: "Faster launch" },
                { icon: Shield, label: "Enhanced security" },
                { icon: Wifi,   label: "Offline access" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <item.icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-white text-sm font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* All platforms quick-select grid */}
        <div className="mt-10">
          <p className="text-center text-sm text-gray-500 mb-6">All platforms</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {platforms.map(p => {
              const Icon = p.icon;
              const state = downloadState[p.id];
              const isDone = state === "done";
              const isMobile = p.id === "android" || p.id === "ios";
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id as "windows" | "mac" | "linux" | "android" | "ios")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all text-center hover:shadow-md active:scale-95 ${
                    selected === p.id ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"
                  }`}
                >
                  <div className={`h-10 w-10 rounded-xl ${p.iconBg} flex items-center justify-center`}>
                    {isDone
                      ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                      : <Icon className={`h-5 w-5 ${p.iconColor}`} />
                    }
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{p.label}</span>
                  <span className="text-[10px] text-gray-400">
                    {isMobile ? "Coming soon" : p.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Desktop App install instructions */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-3xl border border-blue-200 bg-blue-50 overflow-hidden">
          <div className="px-8 py-6 border-b border-blue-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                <Monitor className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-blue-900">TanCom Desktop App</h2>
                <p className="text-sm text-blue-600">Full Remote Control — OS-level mouse & keyboard</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {winAvailable && (
                <a href={DESKTOP_WIN_URL} download="TanCom-Setup.exe"
                  className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow">
                  <Download className="h-4 w-4" /> Windows (.exe)
                </a>
              )}
              {macAvailable && (
                <a href={DESKTOP_MAC_URL} download="TanCom.dmg"
                  className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow">
                  <Download className="h-4 w-4" /> macOS (.dmg)
                </a>
              )}
            </div>
          </div>

          {/* Setup script — primary path */}
          <div className="px-8 pt-7 pb-5">
            <div className="rounded-2xl bg-white border-2 border-blue-400 p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-bold bg-blue-600 text-white px-2.5 py-1 rounded-full uppercase tracking-wide">Easiest way</span>
                <span className="text-sm font-bold text-blue-900">Use the included setup script — no terminal needed</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Windows */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Monitor className="h-4 w-4 text-blue-700" />
                    <span className="text-sm font-bold text-blue-900">Windows</span>
                  </div>
                  <ol className="space-y-2.5">
                    {[
                      { n: "1", text: "Download & extract the zip" },
                      { n: "2", text: <span>Double-click <code className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono text-blue-900 text-xs">setup.bat</code></span> },
                      { n: "3", text: "If asked, install Node.js from the link it opens — then run setup.bat again" },
                      { n: "4", text: <span>When done, <code className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono text-blue-900 text-xs">release\</code> opens — double-click <strong>TanCom-Setup.exe</strong></span> },
                    ].map(s => (
                      <li key={s.n} className="flex items-start gap-2.5 text-sm text-blue-900">
                        <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                        <span>{s.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                {/* macOS */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Apple className="h-4 w-4 text-blue-700" />
                    <span className="text-sm font-bold text-blue-900">macOS</span>
                  </div>
                  <ol className="space-y-2.5">
                    {[
                      { n: "1", text: "Download & extract the zip" },
                      { n: "2", text: <span>Double-click <code className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono text-blue-900 text-xs">setup.command</code></span> },
                      { n: "3", text: 'If macOS blocks it: right-click → Open → "Open anyway"' },
                      { n: "4", text: <span>When done, <code className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono text-blue-900 text-xs">release/</code> opens — open <strong>TanCom.dmg</strong> and drag to Applications</span> },
                    ].map(s => (
                      <li key={s.n} className="flex items-start gap-2.5 text-sm text-blue-900">
                        <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                        <span>{s.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <p className="mt-4 text-xs text-blue-500 border-t border-blue-100 pt-3">
                The script installs all dependencies and builds the installer automatically. The only prerequisite is <strong>Node.js</strong> — the script links you to install it if it's missing.
              </p>
            </div>

            {/* Manual / advanced path */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-blue-600 font-semibold hover:text-blue-800 flex items-center gap-1 select-none">
                <ArrowRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                Advanced: run commands manually
              </summary>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Windows manual */}
                <div>
                  <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1"><Monitor className="h-3.5 w-3.5" /> Windows</p>
                  <ol className="space-y-2">
                    {[
                      { n: "1", label: "Install Node.js 20+", sub: "nodejs.org → LTS version" },
                      { n: "2", label: "Open Command Prompt in the extracted folder", sub: 'Click address bar → type "cmd" → Enter' },
                      { n: "3", label: "Install deps:", code: "npm install" },
                      { n: "4", label: "Build:", code: "npm run dist:win" },
                      { n: "5", label: "Run installer", sub: "release\\TanCom-Setup.exe" },
                    ].map(s => (
                      <li key={s.n} className="flex items-start gap-2 text-xs text-blue-900">
                        <span className="h-4 w-4 rounded-full bg-blue-400 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                        <div>
                          <span className="font-semibold">{s.label}</span>
                          {s.sub && <span className="text-blue-500 ml-1">— {s.sub}</span>}
                          {s.code && <code className="mt-0.5 block bg-blue-900 text-blue-100 px-2 py-1 rounded font-mono">{s.code}</code>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                {/* macOS manual */}
                <div>
                  <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1"><Apple className="h-3.5 w-3.5" /> macOS</p>
                  <ol className="space-y-2">
                    {[
                      { n: "1", label: "Install Node.js 20+", sub: "nodejs.org or: brew install node" },
                      { n: "2", label: "Open Terminal in the extracted folder", sub: "Drag folder onto Terminal icon" },
                      { n: "3", label: "Install deps:", code: "npm install" },
                      { n: "4", label: "Build:", code: "npm run dist:mac" },
                      { n: "5", label: "Open installer", sub: "release/TanCom.dmg → drag to Applications" },
                    ].map(s => (
                      <li key={s.n} className="flex items-start gap-2 text-xs text-blue-900">
                        <span className="h-4 w-4 rounded-full bg-blue-400 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                        <div>
                          <span className="font-semibold">{s.label}</span>
                          {s.sub && <span className="text-blue-500 ml-1">— {s.sub}</span>}
                          {s.code && <code className="mt-0.5 block bg-blue-900 text-blue-100 px-2 py-1 rounded font-mono">{s.code}</code>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* CI note */}
              <div className="mt-5 rounded-xl bg-white border border-blue-200 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Package className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-bold text-blue-900">Auto-build via GitHub Actions</p>
                </div>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Push the project to GitHub — a CI workflow at{" "}
                  <code className="bg-blue-100 px-1 rounded text-blue-900">.github/workflows/tancom-desktop-build.yml</code>{" "}
                  builds both <strong>.exe</strong> and <strong>.dmg</strong> automatically and attaches them to a GitHub Release.
                </p>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* App features */}
      <section className="bg-gray-50 py-16 px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Everything included in every download</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {appFeatures.map(f => (
              <div key={f.label} className="bg-white rounded-2xl p-5 border border-gray-200">
                <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                  <f.icon className="h-4.5 w-4.5 text-blue-600 h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-0.5">{f.label}</p>
                <p className="text-xs text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Install steps */}
      <section className="py-16 px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Get started in 3 steps</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Open in Chrome or Edge", desc: "Go to tancom.us in Chrome, Edge, or Brave. Look for the install icon ⊕ in the address bar and click Install." },
              { step: "2", title: "Sign In or Sign Up", desc: "Use your existing TanCom account or create a free one in seconds. No credit card required." },
              { step: "3", title: "Start Meeting", desc: "Click 'New Meeting' or join via an invite link. TanCom opens in its own window like a native app." },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="h-12 w-12 rounded-full bg-blue-600 text-white text-xl font-bold flex items-center justify-center mx-auto mb-4">{s.step}</div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-600 py-14 px-6 text-white text-center">
        <h2 className="text-2xl font-bold mb-3">Already have an account?</h2>
        <p className="text-blue-100 mb-6 text-sm">Jump straight into your dashboard and start a meeting in seconds.</p>
        <Link href="/sign-in">
          <button className="inline-flex items-center gap-2 bg-white text-blue-600 font-semibold px-8 py-3 rounded-xl hover:bg-blue-50 transition-colors shadow">
            Sign in to TanCom <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
        <p className="mt-4 text-xs text-blue-200">
          No account yet?{" "}
          <Link href="/sign-up">
            <span className="underline cursor-pointer hover:text-white">Create one free</span>
          </Link>
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 px-6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <Link href="/">
            <img src={tancomLogo} alt="TanCom" className="h-10 w-auto object-contain cursor-pointer" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/"><span className="hover:text-gray-800 cursor-pointer">Home</span></Link>
            <Link href="/sign-in"><span className="hover:text-gray-800 cursor-pointer">Sign in</span></Link>
            <Link href="/sign-up"><span className="hover:text-gray-800 cursor-pointer">Sign up</span></Link>
          </div>
          <span>© {new Date().getFullYear()} TanCom. All rights reserved.</span>
        </div>
      </footer>

      {/* Installed banner */}
      {installed && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-medium">
          <CheckCircle2 className="h-5 w-5" />
          TanCom has been installed on your device!
          <Link href="/dashboard">
            <span className="underline cursor-pointer ml-1">Open app →</span>
          </Link>
        </div>
      )}
    </div>
  );
}
