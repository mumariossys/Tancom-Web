# TanCom Web — source export for review

This is a private-repository-ready source snapshot, not a deployment or a
production migration. No GitHub repository, push, database export, service
startup, account migration or deployment was performed to prepare it.

**Verification blocker:** fresh installation and both bundles build, and the
frontend typechecks, but the complete shared-library/backend TypeScript check
fails in existing generated validation source. This faithful snapshot is ready
for source review, not a clean-check production release. See `VERIFICATION.md`
for the exact missing files and declaration-order defects; none were silently
repaired in this export.

## Upload the correct directory

Extract the archive and open its `tancom-web` directory. Upload **all its
contents**, preserving the directories, into the root of the future private
`tancom-web` repository. Do not upload just the loose root files. The repository
must contain `artifacts`, `lib`, `attached_assets`, `tools`, `docs` and the root
configuration files. `isolated-testing` contains only two offline test-support
modules; it is not a provisioned staging environment.

```text
tancom-web/
  artifacts/
    tancom/                   React/Vite frontend, public assets
    api-server/               Express API, WebSockets, integrations
    tancom-desktop/            Separate Electron/robotjs companion source
  lib/
    api-client-react/         Shared generated API client/hooks
    api-spec/                 OpenAPI contract and codegen config
    api-zod/                  Server validation
    db/                       Drizzle schema and incremental SQL migrations
    object-storage-web/       Upload UI helpers
    integrations-openai-ai-server/
  attached_assets/            Only eight application-required images
  docs/                      Operating notes and existing offline auth review
  tools/                     Export-only local helpers and verification
  isolated-testing/backend/  Two offline fixture dependencies, NOT staging
  .env.example
  Caddyfile.example
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json
  tsconfig.base.json
```

Application TypeScript, API implementations, auth code, schema, migrations and
desktop source are copied byte-for-byte. `SOURCE-MANIFEST.json` records hashes.
The desktop source-download ZIP is rebuilt from the copied desktop source rather
than trusting an older opaque archive. Setup tooling, ignore rules, root package
configuration and documentation are export-only additions.

## Safety: read before running anything

**Do not supply live credentials or connect this checkout to live data.**
Starting the unchanged backend:

- May add native callback URLs in the configured Clerk instance.
- Runs meeting cleanup and other scheduled application work.
- Can send real email/SMS, make calls, create recordings or affect storage when
  relevant routes and services are used.

Copying a repository does not isolate its database, Clerk users, object storage,
notifications or third-party services. This export creates none of those
resources. Changing an endpoint or Clerk key is not an approved migration.

The root `dev:api` helper refuses to launch unless you explicitly acknowledge
test-side effects, use a localhost PostgreSQL URL and an approved Clerk TEST
key. It does not verify that those credentials or any other service are isolated.
It is only a basic guard, **not an isolation boundary**. Never tunnel a production
database through localhost. Raw commands in the original API package bypass
this helper and retain their original behavior.

## Requirements

- Node.js 22.13+; Node 24 LTS is recommended (used for export verification).
- pnpm **10.26.1**; install dependencies with pnpm, not npm or Yarn.
- New disposable local PostgreSQL for later backend testing.
- Optional Caddy installation for the local same-origin example.
- Separately approved Clerk and feature-service configuration for runtime use.

If your installation provides Corepack:

```sh
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm --version
```

Otherwise use a trusted installation method for exactly pnpm 10.26.1.

## Install and offline verification

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:web
pnpm build:api
pnpm test
pnpm verify:source
pnpm scan:credentials
```

These commands do not require a database or real keys and do not start the
backend. Run them independently: the full `pnpm typecheck` currently fails on
pre-existing generated source defects. `pnpm --filter @workspace/tancom run
typecheck` passes after shared declaration generation has been attempted.
Building without a Clerk public key checks compilation only; opening that
bundle will require approved runtime configuration.

The existing auth-review tests document current security behavior and a proposed
policy. Passing them does **not** mean the proposed policy is active or the
current authentication is secure. See `docs/security/clerk-trust-review/README.md`.

The desktop companion is intentionally excluded from the main pnpm workspace:
installing the web/backend dependencies does not install Electron or compile
robotjs. Its standalone install/build needs a separate supported OS/toolchain
and approval. Native installers are not included.

## Environment configuration

Copy `.env.example` to `.env` locally. Every credential field is blank.

```sh
cp .env.example .env
```

Use PowerShell `Copy-Item` on Windows if needed. The root helpers load this file
using Node's env-file support. Original package commands do not automatically
load root backend variables; prefer the documented root commands.

### Frontend

- `VITE_CLERK_PUBLISHABLE_KEY`: public frontend key for the approved Clerk instance.
- `VITE_CLERK_PROXY_URL`: optional explicitly approved Clerk proxy URL.
- `BASE_PATH`: `/` for the included root-hosting example.
- `WEB_PORT`: `5174` for Vite behind the local proxy.
- The original Vite configuration embeds `LIVEKIT_URL` as `VITE_LIVEKIT_URL`.
  Setting only `VITE_LIVEKIT_URL` is not the documented source of that value.

`VITE_*` values are public browser-bundle configuration. Never use them for
Clerk secret keys, database passwords, Apple private keys or API secrets.
Configure values before building; changing a shell variable after deployment
does not reconfigure an already built frontend bundle.

### Backend and external services

| Purpose | Variable names |
|---|---|
| PostgreSQL | `DATABASE_URL`; optional `MIGRATE_DATABASE_URL` |
| Clerk | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, optional `CLERK_PROXY_URL`, `CLERK_API_URL` |
| Service | `API_PORT`, `NODE_ENV`, `LOG_LEVEL`; runtime `PORT` is assigned by the root helper |
| LiveKit video/live streaming | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| LiveKit recording storage | `EGRESS_S3_ENDPOINT`, `EGRESS_S3_REGION`, `EGRESS_S3_BUCKET`, `EGRESS_S3_ACCESS_KEY`, `EGRESS_S3_SECRET_KEY` |
| Existing application file storage | `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` |
| AI features | `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` |
| Twilio voice/SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| SMTP | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` |
| Existing Replit origin configuration | `REPLIT_DOMAINS` |
| Desktop frontend URL | `TANCOM_URL` |

Do not leave `CLERK_API_URL` explicitly empty for runtime use: remove that empty
line to use the original default `https://api.clerk.com`, or set that official
URL after review. The example deliberately carries no configured credentials.

### Known portability blockers

1. `artifacts/api-server/src/lib/objectStorage.ts` obtains credentials from a
   Replit-local sidecar at `127.0.0.1:1106`. That service will not exist in a normal
   Cursor/local checkout. A reviewed portable storage adapter is still needed;
   merely filling the storage path variables is not enough.
2. Replit AI integration access is not transferred by copying source. Obtain an
   independently authorized compatible service configuration or approve an adapter
   change. The backend imports an eagerly created OpenAI client, so missing
   AI-provider credentials may prevent startup even if no AI route is called.
   Do not copy inherited project credentials.
3. The original frontend expects a same-origin `/api` service; Vite does not
   contain a local backend proxy. Use a reverse proxy such as the supplied
   local-only Caddy example. WebSockets and the Clerk proxy must also be routed.
4. Existing live URLs/fallbacks and externally hosted assets remain in application
   source to preserve behavior. Do not consider this checkout isolated staging.
5. Local CORS defaults include `http://localhost:5173`; the example uses that
   browser origin intentionally. Do not expose this local setup publicly or
   change live CORS/Clerk settings to make local testing pass.

## Database setup — new empty local database only

The complete current Drizzle schema is in `lib/db/src/schema/`. The three tracked
SQL files under `lib/db/migrations/` are **incremental**, not a baseline:

- `0001_phase2_contact_features.sql`
- `0002_call_log.sql`
- `0002_group_foundation.sql`

For a separately approved, empty disposable local database:

1. Provision a new database without copying live data or credentials.
2. Set `DATABASE_URL` only in the ignored local `.env`.
3. Review the schema and generated SQL. An owner may use Drizzle's `push`
   against that empty database to create the current tables, or generate and
   review an initial SQL baseline. Neither was run during export verification.
4. Do **not** blindly run incremental migrations after a schema push. The
   existing runner tracks filenames in `schema_migrations`; bootstrap and
   baseline bookkeeping need review to avoid duplicate/conflicting operations.
5. Before using the existing migration runner on an established database, check
   which changes are already present and verify the target URL. Do not use
   `push-force` or run any migration against the live database.

After verifying `.env` targets only that new empty local database, the existing
schema-push CLI can be invoked explicitly:

```sh
pnpm --filter @workspace/db exec node --env-file=../../.env ./node_modules/drizzle-kit/bin.cjs push --config ./drizzle.config.ts
```

**That command writes schema changes.** It is documentation only and was not
executed during export preparation. Review its SQL prompts, never use `--force`,
and do not run it against the existing/live database. Provisioning/bootstrap
remains a deliberate manual task, not an install hook.

## Local run — only after isolated setup approval

Use a dedicated test Clerk tenant; its user store and callbacks are still real.
Keep unused sending/media/storage fields empty. Review the eager AI-client
initialization and supply only separately approved test-service configuration
if needed for boot. Do not substitute any live key to bypass a startup error.
Once a new local schema exists, generated source defects are resolved and
test-side effects are understood, set
`TANCOM_ALLOW_LOCAL_BACKEND_START=I_UNDERSTAND_TEST_SIDE_EFFECTS`.

In separate terminals:

```sh
pnpm dev:web
pnpm dev:api
caddy run --config Caddyfile.example --adapter caddyfile
```

Open `http://localhost:5173`, not the direct Vite port. The example forwards
`/api` unchanged to port 8080 and everything else to Vite on 5174. Caddy forwards
WebSocket upgrades; both `/api/ws` and `/api/ws/rc-cursor` must reach the API.
The Clerk proxy remains `/api/__clerk`. No service was started here to test
runtime login, database writes or sending.

For later approved hosting, provide a corresponding HTTPS reverse proxy and SPA
history fallback, external services and independently reviewed production
configuration. Building the static frontend does not host the backend.

## Web and mobile share one backend

```text
Web browser --------\
                     > HTTPS /api + WebSockets --> Shared API --> PostgreSQL
TanCom Mobile ------/                              | Clerk
                                                   | LiveKit
                                                   | Storage, SMTP, Twilio, AI
```

This repository contains a backend source copy, not a newly provisioned backend.
Web/mobile repository separation does not migrate users, messages, meetings,
profiles, permissions or data. Keep one authoritative deployed backend source
and coordinate changes across repositories rather than deploying divergent copies.

The mobile release source currently has `https://tancom.us` fallbacks, including
release API behavior. Relocating this web repository will not redirect installed
mobile apps. A backend move, mobile endpoint change, Clerk instance change or
user-account migration requires a separate compatibility/ownership plan and
approval. Never merge identities based only on email, including Apple relay email.

## Feature status and known issues

- Meetings, waiting-room/participant controls, recording APIs, messaging, contacts,
  groups, communities, live streaming, meeting notes, profiles/settings, admin
  and business-tools source are included.
- Some business-tool settings are browser-local. There is no audited dedicated
  project/task-management/Kanban system; do not label business tools as one.
- Remote-access/device/request/session APIs and meeting remote-control data
  handling exist. The Electron preload and robotjs source can inject OS input.
- An ordinary browser cannot inject system-wide input; the controlled machine
  needs the desktop companion and OS permissions.
- The Remote Access launch page opens `/meeting/<code>` while the registered
  room route is `/room/<code>`. This likely route defect is preserved, not fixed.
- Remote-support marketing/settings labels do not establish enforced MFA,
  unattended access, automatic recording or complete file transfer. Real
  two-computer acceptance tests remain necessary.
- Current auth issuer/JWKS selection is overly permissive. The review proposal
  is included but not activated. A passing export build is not a security fix.
- Windows/macOS installers are not included. The existing Download page links
  to `/tancom-setup-windows.exe` and `/tancom-setup-mac.dmg`; those assets are
  absent in this source snapshot and need separately approved builds/hosting.
- Desktop build/runtime behavior was not tested. Review `main` versus compiler
  output path, robotjs compatibility, rebuild tooling, OS permissions and
  signing before distributing it. Do not assume its README's native-build
  instructions are verified by the main web/API checks.

The handwritten desktop source is included and its clean source ZIP remains
available at the existing Download-page path. No installer is generated or signed.

## Credential exclusions and verification

The root `.gitignore` excludes environment files, tokens/signing materials,
certificates, keystores, credential JSON, dependency/cache folders, logs, build
outputs and unrelated uploaded media independently of machine-global settings.
Only a blank `.env.example` is allowed. No original `.env`, database data, Git
history, server storage objects or automatic GitHub workflows are included.

`pnpm scan:credentials` inspects distributable files and nested source ZIP members.
It reads binary assets too, reports only paths/category names, and fails on
unsupported/encrypted archives. Installed dependencies and generated local build
directories are outside its source-export scope and are not in the download.
This is heuristic detection, not proof that all possible secret formats or
security vulnerabilities are absent.

`pnpm verify:source` checks copied files against their snapshot hashes; refresh
the manifest after intentional future edits. `VERIFICATION.md` contains actual
test results and limitations. The SHA-256 sidecar verifies the download.

No GitHub repository was created or pushed. No existing account, authentication
provider setting, production database or deployment was changed. Keep the future
repository private and review the full directory tree before uploading.
