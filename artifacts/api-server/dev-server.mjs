/**
 * Development server runner with automatic crash recovery.
 *
 * Builds the server once on startup, then keeps the Node process alive by
 * restarting it whenever it exits unexpectedly.  Clean shutdowns (SIGTERM /
 * SIGINT / exit code 0) are passed through so the workflow can still stop the
 * server normally.
 */

import { spawn, spawnSync } from "child_process";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESTART_DELAY_MS = 2_000;
const MAX_RESTARTS     = 20;   // give up after 20 consecutive crashes

let restarts = 0;
let child    = null;

// ── Build ──────────────────────────────────────────────────────────────────────

function build() {
  console.log("[dev-server] Building…");
  const result = spawnSync("node", [path.join(__dirname, "build.mjs")], {
    stdio: "inherit",
    env: process.env,
    cwd: __dirname,
  });
  if (result.status !== 0) {
    console.error("[dev-server] Build failed — aborting.");
    process.exit(1);
  }
  console.log("[dev-server] Build complete.");
}

// ── Start ──────────────────────────────────────────────────────────────────────

function startServer() {
  const entry = path.join(__dirname, "dist", "index.mjs");

  if (!existsSync(entry)) {
    console.error(`[dev-server] Entry not found at ${entry} — rebuilding.`);
    build();
  }

  child = spawn("node", ["--enable-source-maps", entry], {
    stdio: "inherit",
    env:   process.env,
    cwd:   __dirname,
  });

  child.on("exit", (code, signal) => {
    child = null;

    // Clean shutdown — workflow or OS asked us to stop
    if (signal === "SIGTERM" || signal === "SIGINT" || code === 0) {
      console.log(`[dev-server] Server stopped cleanly (code=${code} signal=${signal}).`);
      process.exit(0);
    }

    restarts += 1;
    console.error(
      `[dev-server] Server exited unexpectedly (code=${code} signal=${signal}). ` +
      `Restart ${restarts}/${MAX_RESTARTS} in ${RESTART_DELAY_MS} ms…`
    );

    if (restarts >= MAX_RESTARTS) {
      console.error("[dev-server] Too many consecutive crashes — giving up.");
      process.exit(1);
    }

    setTimeout(startServer, RESTART_DELAY_MS);
  });
}

// ── Signal forwarding ──────────────────────────────────────────────────────────
// When Replit sends SIGTERM to stop the workflow, propagate it to the child so
// Express can shut down gracefully instead of being force-killed.

function forwardSignal(sig) {
  if (child) child.kill(sig);
}

process.on("SIGTERM", () => forwardSignal("SIGTERM"));
process.on("SIGINT",  () => forwardSignal("SIGINT"));

// ── Boot ───────────────────────────────────────────────────────────────────────

build();
startServer();
