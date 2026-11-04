import { useRef, useState, useEffect, useCallback } from "react";
import { Upload, X } from "lucide-react";
import type { VirtualBg } from "@/hooks/useVirtualBackground";

const CUSTOM_BG_KEY = "tancom-custom-bgs";
const MAX_CUSTOM = 6;

interface Preset {
  id: string;
  label: string;
  bg: VirtualBg;
  thumb?: string;
}

export const VB_PRESETS: Preset[] = [
  { id: "none", label: "None", bg: null },
  { id: "blur", label: "Blur", bg: "blur" },
  {
    id: "marina",
    label: "Marina",
    bg: "/backgrounds/bg-marina.jpg",
    thumb: "/backgrounds/bg-marina.jpg",
  },
  {
    id: "greenroom",
    label: "Green Room",
    bg: "/backgrounds/bg-greenroom.jpg",
    thumb: "/backgrounds/bg-greenroom.jpg",
  },
  {
    id: "abstract",
    label: "Abstract",
    bg: "/backgrounds/bg-abstract.jpg",
    thumb: "/backgrounds/bg-abstract.jpg",
  },
  {
    id: "livingroom",
    label: "Living Room",
    bg: "/backgrounds/bg-livingroom.jpg",
    thumb: "/backgrounds/bg-livingroom.jpg",
  },
  {
    id: "bdit",
    label: "BDIT",
    bg: "/backgrounds/bg-bdit.png",
    thumb: "/backgrounds/bg-bdit.png",
  },
  {
    id: "birds-lake",
    label: "Safari Lake",
    bg: "/backgrounds/bg-birds-lake.png",
    thumb: "/backgrounds/bg-birds-lake.png",
  },
  {
    id: "river-village",
    label: "River Village",
    bg: "/backgrounds/bg-river-village.png",
    thumb: "/backgrounds/bg-river-village.png",
  },
  {
    id: "flamingo-lake",
    label: "Flamingo Lake",
    bg: "/backgrounds/bg-flamingo-lake.png",
    thumb: "/backgrounds/bg-flamingo-lake.png",
  },
  {
    id: "river-palms",
    label: "River Palms",
    bg: "/backgrounds/bg-river-palms.png",
    thumb: "/backgrounds/bg-river-palms.png",
  },
  {
    id: "village-pond",
    label: "Village Pond",
    bg: "/backgrounds/bg-village-pond.png",
    thumb: "/backgrounds/bg-village-pond.png",
  },
];

function loadCustomBgs(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_BG_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveCustomBgs(bgs: string[]): void {
  try {
    localStorage.setItem(CUSTOM_BG_KEY, JSON.stringify(bgs));
  } catch {}
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Normalize an uploaded image before storing it:
//  - Draws through an <img> element so the browser applies EXIF orientation
//    (fixes sideways/upside-down photos from phone cameras)
//  - Scales down to a 1920×1080 ceiling so large phone photos don't stall
//    the VB pipeline canvas at 30 fps
//  - Re-encodes as JPEG so the data URL is small enough for localStorage
const NORM_MAX_W = 1920;
const NORM_MAX_H = 1080;

async function normalizeImageFile(file: File): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not decode image"));
    i.src = rawDataUrl;
  });

  let w = img.naturalWidth;
  let h = img.naturalHeight;

  if (w === 0 || h === 0) throw new Error("Image has zero dimensions");

  // Scale down proportionally if larger than the ceiling
  if (w > NORM_MAX_W || h > NORM_MAX_H) {
    const scale = Math.min(NORM_MAX_W / w, NORM_MAX_H / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  // Drawing an <img> to canvas bakes in EXIF orientation automatically
  // (Chrome 84+, Firefox 26+, Safari 15+)
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);

  // JPEG at 85% quality — good fidelity, much smaller than PNG
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function VirtualBackgroundPicker({
  selected,
  onChange,
  onClose,
  compact = false,
}: {
  selected: VirtualBg;
  onChange: (bg: VirtualBg) => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const [customBgs, setCustomBgs] = useState<string[]>(loadCustomBgs);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveCustomBgs(customBgs);
  }, [customBgs]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!e.target) return;
      // reset so the same file can be re-selected
      (e.target as HTMLInputElement).value = "";
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setUploadError("Only image files are supported.");
        return;
      }
      // Warn if very large (> 4 MB) — data URLs eat localStorage space
      if (file.size > 4 * 1024 * 1024) {
        setUploadError("Image is too large (max 4 MB). Please choose a smaller file.");
        return;
      }

      setUploadError(null);
      setUploading(true);
      try {
        const dataUrl = await normalizeImageFile(file);
        setCustomBgs((prev) => {
          const next = [dataUrl, ...prev].slice(0, MAX_CUSTOM);
          return next;
        });
        onChange(dataUrl);
      } catch {
        setUploadError("Failed to load image. Please try another file.");
      } finally {
        setUploading(false);
      }
    },
    [onChange]
  );

  const removeCustom = useCallback(
    (dataUrl: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setCustomBgs((prev) => prev.filter((u) => u !== dataUrl));
      if (selected === dataUrl) onChange(null);
    },
    [selected, onChange]
  );

  return (
    <div className={compact ? "p-2" : "p-3"}>
      {!compact && (
        <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
          Virtual Background
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {/* ── Presets ── */}
        {VB_PRESETS.map((preset) => {
          const isSelected =
            selected === preset.bg ||
            (selected === null && preset.bg === null);

          return (
            <button
              key={preset.id}
              onClick={() => onChange(preset.bg)}
              onDoubleClick={() => { onChange(preset.bg); onClose?.(); }}
              className={`relative rounded-lg overflow-hidden aspect-video border-2 transition-all focus:outline-none ${
                isSelected
                  ? "border-blue-500 ring-2 ring-blue-500/30"
                  : "border-gray-700 hover:border-gray-500"
              }`}
              title={`${preset.label} — double-click to apply & close`}
            >
              {preset.id === "none" && (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <span className="text-gray-400 text-xs font-medium">None</span>
                </div>
              )}
              {preset.id === "blur" && (
                <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                  <span className="text-white text-xs font-medium blur-[1px] select-none">Blur</span>
                </div>
              )}
              {preset.thumb && (
                <img
                  src={preset.thumb}
                  alt={preset.label}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                  loading="lazy"
                />
              )}
              {isSelected && (
                <div className="absolute top-1 right-1 h-4 w-4 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                <span className="text-white text-[10px] font-medium">{preset.label}</span>
              </div>
            </button>
          );
        })}

        {/* ── Custom uploaded images ── */}
        {customBgs.map((dataUrl, idx) => {
          const isSelected = selected === dataUrl;
          return (
            <button
              key={idx}
              onClick={() => onChange(dataUrl)}
              onDoubleClick={() => { onChange(dataUrl); onClose?.(); }}
              className={`relative rounded-lg overflow-hidden aspect-video border-2 transition-all focus:outline-none group ${
                isSelected
                  ? "border-blue-500 ring-2 ring-blue-500/30"
                  : "border-gray-700 hover:border-gray-500"
              }`}
              title={`Custom ${idx + 1} — double-click to apply & close`}
            >
              <img
                src={dataUrl}
                alt={`Custom background ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              {isSelected && (
                <div className="absolute top-1 right-1 h-4 w-4 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {/* Remove button — visible on hover */}
              <button
                onClick={(e) => removeCustom(dataUrl, e)}
                className="absolute top-1 left-1 h-5 w-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/80"
                title="Remove"
              >
                <X className="h-3 w-3 text-white" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                <span className="text-white text-[10px] font-medium">Custom</span>
              </div>
            </button>
          );
        })}

        {/* ── Upload tile ── */}
        {customBgs.length < MAX_CUSTOM && (
          <button
            onClick={() => { setUploadError(null); fileInputRef.current?.click(); }}
            disabled={uploading}
            className="relative rounded-lg overflow-hidden aspect-video border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-gray-700/30 transition-all focus:outline-none flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-blue-400 disabled:opacity-50"
            title="Upload your own background"
          >
            {uploading ? (
              <div className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span className="text-[10px] font-medium">{uploading ? "Loading…" : "Add image"}</span>
          </button>
        )}
      </div>

      {/* Error message */}
      {uploadError && (
        <p className="mt-2 text-xs text-red-400 flex items-start gap-1">
          <span className="mt-px">⚠</span>
          <span>{uploadError}</span>
        </p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
