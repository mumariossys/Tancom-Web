/**
 * Platform rules for the Electron screen-share picker.
 * Electron 28's display-media handler is not the same on macOS and Windows.
 */

export type ScreenCaptureDenial = "permission" | "empty" | "timeout";

export type ScreenAccess = "granted" | "blocked" | "prompt";

/**
 * `audio: "loopback"` is implemented on Windows only in Electron 28.
 * Passing it on macOS rejects the entire getDisplayMedia() request, so Share
 * never starts. Video-only capture still works.
 */
export function loopbackAudioSupported(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

/**
 * macOS Screen Recording status, as returned by
 * systemPreferences.getMediaAccessStatus("screen").
 * Other platforms do not have this permission.
 */
export function classifyScreenAccess(
  platform: NodeJS.Platform,
  status: string | null | undefined,
): ScreenAccess {
  if (platform !== "darwin") return "granted";
  if (status === "granted") return "granted";
  if (status === "denied" || status === "restricted") return "blocked";
  return "prompt";
}
