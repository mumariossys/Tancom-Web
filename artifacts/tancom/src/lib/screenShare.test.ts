import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideScreenShare, screenShareProfile } from "./screenShare.ts";

describe("decideScreenShare", () => {
  it("ignores a participant who is not sharing", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: false,
      trackReadyState: "missing",
      publicationMuted: false,
      trackMuted: false,
      streamPaused: false,
    }), { active: false, hold: null });
  });

  it("keeps the session only while the first track is still attaching", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "missing",
      publicationMuted: false,
      trackMuted: false,
      streamPaused: false,
      hadLiveTrack: false,
    }), { active: true, hold: "link" });
  });

  it("ends the session when a track that was already live disappears", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "missing",
      publicationMuted: false,
      trackMuted: false,
      streamPaused: false,
      hadLiveTrack: true,
    }), { active: false, hold: null });
  });

  it("ends the session when the sharer signals stop even if the track still looks live", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "live",
      publicationMuted: false,
      trackMuted: false,
      streamPaused: false,
      forceEnded: true,
      hadLiveTrack: true,
    }), { active: false, hold: null });
  });

  it("ends the session when the capture track has ended", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "ended",
      publicationMuted: false,
      trackMuted: false,
      streamPaused: false,
    }), { active: false, hold: null });
  });

  it("marks a muted live track as a sender pause so callers do not render black frames", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "live",
      publicationMuted: true,
      trackMuted: false,
      streamPaused: false,
    }), { active: true, hold: "sender" });
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "live",
      publicationMuted: false,
      trackMuted: true,
      streamPaused: true,
    }), { active: true, hold: "sender" });
  });

  it("marks a network-paused track as a link hold while keeping it active", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "live",
      publicationMuted: false,
      trackMuted: false,
      streamPaused: true,
    }), { active: true, hold: "link" });
  });

  it("plays a healthy live track", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "live",
      publicationMuted: false,
      trackMuted: false,
      streamPaused: false,
    }), { active: true, hold: null });
  });
});

describe("screenShareProfile", () => {
  it("preserves source aspect ratio by not forcing a capture size", () => {
    for (const optimize of [false, true]) {
      const profile = screenShareProfile(optimize);
      assert.equal("width" in profile, false);
      assert.equal("height" in profile, false);
    }
  });

  it("uses detail settings by default and motion settings when optimizing for video", () => {
    const detail = screenShareProfile(false);
    const motion = screenShareProfile(true);
    assert.equal(detail.contentHint, "detail");
    assert.equal(detail.degradationPreference, "maintain-resolution");
    assert.ok(detail.maxFramerate < motion.maxFramerate);
    assert.equal(motion.contentHint, "motion");
    assert.equal(motion.degradationPreference, "maintain-framerate");
    assert.ok(motion.maxBitrate > detail.maxBitrate);
  });
});
