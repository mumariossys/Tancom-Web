/**
 * Pure decisions for meeting screen share.
 * Kept free of LiveKit and the DOM so the failure modes can be tested on their own.
 */

export type ScreenShareHold = "sender" | "link" | null;

export interface ScreenShareDecision {
  /** A share publication is still part of the session. */
  active: boolean;
  /**
   * `sender` — the sharer paused the capture (track muted). Do not render it;
   * a muted screen track is a black frame.
   * `link` — the publication is up but frames are missing or the network paused
   * them. Keep the session and show a reconnecting state instead of a black tile.
   */
  hold: ScreenShareHold;
}

export function decideScreenShare(input: {
  hasPublication: boolean;
  trackReadyState: "live" | "ended" | "missing";
  publicationMuted: boolean;
  trackMuted: boolean;
  streamPaused: boolean;
  /**
   * The sharer said the share stopped, or this exact capture track already
   * fired `ended`. macOS can leave the publication looking live and unmuted
   * while the stage is a black frame.
   */
  forceEnded?: boolean;
  /**
   * A live screen track was already on screen. Once that track disappears,
   * the share is over. The first subscribe still has a gap before the track
   * is attached; that gap is not an end.
   */
  hadLiveTrack?: boolean;
}): ScreenShareDecision {
  if (input.forceEnded || !input.hasPublication || input.trackReadyState === "ended") {
    return { active: false, hold: null };
  }
  if (input.trackReadyState !== "live") {
    if (input.hadLiveTrack) return { active: false, hold: null };
    return { active: true, hold: "link" };
  }
  if (input.publicationMuted || input.trackMuted) {
    return { active: true, hold: "sender" };
  }
  if (input.streamPaused) {
    return { active: true, hold: "link" };
  }
  return { active: true, hold: null };
}

export interface ScreenShareProfile {
  contentHint: "detail" | "motion";
  maxFramerate: number;
  maxBitrate: number;
  degradationPreference: "maintain-resolution" | "maintain-framerate";
}

/**
 * Capture size is intentionally not constrained. Forcing a 1920×1080 box crops
 * or pads windows and ultrawide displays, so the viewer sees the wrong aspect.
 * Bitrate and frame rate limit the encode; the source keeps its own ratio.
 */
export function screenShareProfile(optimizeForVideo: boolean): ScreenShareProfile {
  if (optimizeForVideo) {
    return {
      contentHint: "motion",
      maxFramerate: 30,
      maxBitrate: 4_500_000,
      degradationPreference: "maintain-framerate",
    };
  }
  return {
    contentHint: "detail",
    maxFramerate: 15,
    maxBitrate: 2_500_000,
    degradationPreference: "maintain-resolution",
  };
}

/** User dismissed the browser or Electron picker. Not a failed share. */
export function isScreenShareCancel(error: unknown): boolean {
  const name = error instanceof DOMException
    ? error.name
    : error instanceof Error
      ? error.name
      : "";
  return name === "NotAllowedError" || name === "AbortError";
}
