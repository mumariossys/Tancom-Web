import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

test("guarded backend starter refuses an unconfigured environment", () => {
  const result = spawnSync(process.execPath, ["tools/run.mjs", "dev-api"], { encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFUSED/);
});
test("frontend and backend sources, schema, migrations and companion are present", () => {
  for (const file of [
    "artifacts/tancom/src/App.tsx", "artifacts/api-server/src/index.ts",
    "lib/db/src/schema/index.ts", "lib/db/migrate.mjs",
    "lib/api-spec/openapi.yaml", "lib/api-client-react/src/index.ts",
    "artifacts/tancom-desktop/electron/main.ts",
    "artifacts/tancom/public/tancom-desktop-source.zip",
  ]) assert.ok(fs.existsSync(file), file);
});
test("required aliased frontend assets are present", () => {
  const root = "artifacts/tancom/src";
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = directory + "/" + entry.name;
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/["']@assets\/([^"']+)["']/g)) assert.ok(fs.existsSync("attached_assets/" + match[1]), match[1]);
    }
  };
  visit(root);
});
test("environment template contains no configured credentials", () => {
  const text = fs.readFileSync(".env.example", "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i);
    if (/KEY|TOKEN|SECRET|PASSWORD|PASS$|DATABASE_URL|CLERK|OBJECT|EMAIL_USER|TWILIO|S3_/.test(key)) assert.equal(line.slice(i + 1), "", key);
  }
});
