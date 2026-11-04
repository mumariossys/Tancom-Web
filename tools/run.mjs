import { spawnSync } from "node:child_process";

// Export-only convenience commands. These do not change the copied app.
const command = process.argv[2];
const env = { ...process.env };
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
let args;
if (command === "build-web" || command === "dev-web") {
  env.PORT = env.WEB_PORT || "5174";
  env.BASE_PATH ||= "/";
  env.NODE_ENV = command === "build-web" ? "production" : "development";
  args = ["--filter", "@workspace/tancom", "run", command === "build-web" ? "build" : "dev"];
} else if (command === "dev-api") {
  let database;
  try { database = new URL(env.DATABASE_URL || ""); } catch { /* fail closed below */ }
  if (env.TANCOM_ALLOW_LOCAL_BACKEND_START !== "I_UNDERSTAND_TEST_SIDE_EFFECTS" ||
      !database || !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !(env.CLERK_SECRET_KEY || "").startsWith("sk_test_")) {
    console.error("REFUSED: local backend startup requires acknowledgement, a localhost PostgreSQL URL, and an explicitly approved Clerk TEST instance. Read README before proceeding. Never tunnel a live DB through localhost.");
    process.exit(1);
  }
  // Deliberately do not pretend that an acknowledgement can verify isolation of
  // external services. Owner review of every configured provider is required.
  env.PORT = env.API_PORT || "8080";
  env.NODE_ENV = "development";
  args = ["--filter", "@workspace/api-server", "exec", "node", "./dev-server.mjs"];
} else {
  console.error("Usage: node tools/run.mjs build-web|dev-web|dev-api");
  process.exit(1);
}
const result = spawnSync(pnpm, args, { env, stdio: "inherit", shell: process.platform === "win32" });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
