#!/usr/bin/env node
// Applies pending SQL migrations from ./migrations in filename order.
// Tracks applied migrations in schema_migrations. Safe to re-run.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) { console.log(`skip  ${file} (already applied)`); continue; }
    const sql = await readFile(path.join(dir, file), "utf8");
    console.log(`apply ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`FAILED ${file}:`, err.message);
      process.exit(1);
    }
  }
  console.log("migrations up to date");
} finally {
  await client.end();
}
