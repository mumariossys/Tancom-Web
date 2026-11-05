// electron/package.json sets "type": "module" so Node can run this file.
// The desktop app compiles the same sources to CommonJS under dist/electron.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyScreenAccess, loopbackAudioSupported } from "./screenCapturePolicy.ts";

describe("loopbackAudioSupported", () => {
  it("allows system-audio loopback on Windows only", () => {
    assert.equal(loopbackAudioSupported("win32"), true);
    assert.equal(loopbackAudioSupported("darwin"), false);
    assert.equal(loopbackAudioSupported("linux"), false);
  });
});

describe("classifyScreenAccess", () => {
  it("does not require a screen-recording grant on Windows", () => {
    assert.equal(classifyScreenAccess("win32", "denied"), "granted");
    assert.equal(classifyScreenAccess("win32", null), "granted");
  });

  it("blocks macOS when Screen Recording was denied", () => {
    assert.equal(classifyScreenAccess("darwin", "denied"), "blocked");
    assert.equal(classifyScreenAccess("darwin", "restricted"), "blocked");
  });

  it("lets a granted Mac capture proceed", () => {
    assert.equal(classifyScreenAccess("darwin", "granted"), "granted");
  });

  it("treats a missing Mac grant as a prompt instead of a successful capture", () => {
    assert.equal(classifyScreenAccess("darwin", "not-determined"), "prompt");
    assert.equal(classifyScreenAccess("darwin", null), "prompt");
    assert.equal(classifyScreenAccess("darwin", undefined), "prompt");
  });
});
