import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "tancom-video-enhancement";

export interface VideoEnhancement {
  mirror: boolean;
  lowLight: boolean;
  touchUp: boolean;
  brightness: number;
  contrast: number;
}

const DEFAULTS: VideoEnhancement = {
  mirror: false,
  lowLight: false,
  touchUp: false,
  brightness: 0,
  contrast: 0,
};

export function loadEnhancement(): VideoEnhancement {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<VideoEnhancement>) };
  } catch {
    return DEFAULTS;
  }
}

function save(e: VideoEnhancement): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(e)); } catch { /* ignore */ }
}

/**
 * Compute a CSS filter string from the current enhancement settings.
 *
 * - brightness / contrast: direct slider offsets (percent)
 * - lowLight:  automatically lifts dark scenes without washing out highlights
 * - touchUp:   very subtle soft-focus + saturation boost (Zoom-style appearance)
 */
export function computeVideoFilter(e: VideoEnhancement): string {
  let brightness = 1 + e.brightness / 100;
  let contrast   = 1 + e.contrast   / 100;
  let saturation = 1.0;
  let blurPx     = 0;

  if (e.lowLight) {
    brightness = Math.min(brightness + 0.40, 2.5);
    contrast   = Math.min(contrast   + 0.12, 2.5);
  }
  if (e.touchUp) {
    blurPx     = 0.5;
    saturation = 1.15;
    brightness = Math.min(brightness + 0.06, 2.5);
  }

  const parts: string[] = [];
  if (blurPx > 0)                       parts.push(`blur(${blurPx}px)`);
  if (Math.abs(brightness - 1) > 0.005) parts.push(`brightness(${brightness.toFixed(3)})`);
  if (Math.abs(contrast   - 1) > 0.005) parts.push(`contrast(${contrast.toFixed(3)})`);
  if (Math.abs(saturation - 1) > 0.005) parts.push(`saturate(${saturation.toFixed(3)})`);
  return parts.join(" ");
}

export function isEnhancementActive(e: VideoEnhancement): boolean {
  return e.mirror || e.lowLight || e.touchUp || e.brightness !== 0 || e.contrast !== 0;
}

export function useVideoEnhancement() {
  const [enhancement, setEnhancement] = useState<VideoEnhancement>(loadEnhancement);

  useEffect(() => { save(enhancement); }, [enhancement]);

  const update = useCallback((patch: Partial<VideoEnhancement>) => {
    setEnhancement(prev => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setEnhancement(DEFAULTS), []);

  const cssFilter    = computeVideoFilter(enhancement);
  const cssTransform = enhancement.mirror ? "scaleX(-1)" : "";
  const anyActive    = isEnhancementActive(enhancement);

  return { enhancement, update, reset, cssFilter, cssTransform, anyActive };
}
