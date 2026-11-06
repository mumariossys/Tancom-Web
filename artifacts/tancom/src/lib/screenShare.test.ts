import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideScreenShare, screenShareProfile, shouldCommitLocalScreenShare } from "./screenShare.ts";

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

  it("keeps the session when the track drops briefly instead of treating it as ended", () => {
    assert.deepEqual(decideScreenShare({
      hasPublication: true,
      trackReadyState: "missing",
      publicationMuted: false,
      trackMuted: false,
      streamPaused: false,
    }), { active: true, hold: "link" });
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

describe("shouldCommitLocalScreenShare", () => {
  it("commits when this start is still current and the capture is live", () => {
    assert.equal(shouldCommitLocalScreenShare({
      attempt: 2,
      currentAttempt: 2,
      trackReadyState: "live",
    }), true);
  });

  it("does not commit after Stop advanced the epoch", () => {
    assert.equal(shouldCommitLocalScreenShare({
      attempt: 2,
      currentAttempt: 3,
      trackReadyState: "live",
    }), false);
  });

  it("does not commit when the capture already ended or never arrived", () => {
    assert.equal(shouldCommitLocalScreenShare({
      attempt: 1,
      currentAttempt: 1,
      trackReadyState: "ended",
    }), false);
    assert.equal(shouldCommitLocalScreenShare({
      attempt: 1,
      currentAttempt: 1,
      trackReadyState: "missing",
    }), false);
  });
});
