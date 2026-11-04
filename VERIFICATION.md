# TanCom Web export verification

## Status

**Source archive ready for private review. Full TypeScript validation is
BLOCKED by existing generated-source defects. Not production-release-ready.**

No application/backend source fixes were silently applied. This preserves the
requested original snapshot while making clean-checkout problems explicit.

## Checks actually performed

| Check | Result |
|---|---|
| Fresh `pnpm install --frozen-lockfile` | PASS, in a separate temporary workspace |
| Original dependencies | PASS, all 134 direct resolution entries in the included workspace packages match the original lockfile |
| Shared-library TypeScript build | FAIL, generated `api-zod` defects detailed below |
| Frontend TypeScript | PASS, run independently after the library declaration build attempt |
| Backend TypeScript | BLOCKED/FAIL, missing `api-zod` declaration output due to the shared-library errors |
| Web production bundle | PASS, 3,204 modules transformed, Vite completed successfully |
| API production bundle | PASS, esbuild completed without starting the server |
| Offline tests | PASS, 18 total: 14 existing auth-review fixtures and four export-packaging checks |
| Source integrity | PASS, 417 original source/config/asset files are byte-for-byte unchanged |
| Repository ignore rules | PASS, 24 sensitive/generated path examples excluded and eight required paths retained with machine-global rules disabled |
| Credential-pattern scan | PASS, zero findings; scans source files, binary assets and all 13 members of the rebuilt desktop source ZIP |
| Final archive | ZIP integrity verified, freshly extracted, source hashes verified and credential scan rerun; SHA-256 sidecar supplied |
| Original project | No original application, configuration, dependency, database, auth or deployment changes |
| GitHub | No repository created, no remote configured, no push |
| Runtime/external services | No service startup, user login, live requests, database operations or sending/recording tests |

Verification used Node 24.22.1 and pnpm 10.26.1 on Linux. Installation/build/test
commands ran without inherited application secrets. The clean install did not
reuse the original workspace's node_modules links.

The frozen dependency install retains the original allowed-build policy; pnpm
reported ignored lifecycle scripts for Clerk shared packages and core-js.
esbuild's allowed install script ran successfully. No additional dependency
scripts were silently approved.

Vite emitted existing source-map-location warnings for some UI components and
large-chunk warnings. They did not fail the frontend bundle. API bundle-size
warnings are also retained, not addressed by this source export.

## Existing TypeScript blockers

### Declaration-order errors

`lib/api-zod/src/generated/api.ts` builds `SendChatMessageBody` before these
constants have been declared/initialized:

- `sendChatMessageBodyContactCardEmailMax`
- `sendChatMessageBodyContactCardPhoneMax`
- `sendChatMessageBodyContactCardPhoneRegExp`
- `sendChatMessageBodyContactCardUsernameMax`
- `sendChatMessageBodyContactCardUsernameRegExp`
- `sendChatMessageBodyContactCardContactClerkIdMax`

The clean shared-library check reports TS2448/TS2454. This is pre-existing
validation source, not a dependency-install or export-path error. A successful
transpiled API bundle does not prove these validators initialize correctly.

### Missing generated type source

`lib/api-zod/src/generated/types/index.ts` exports these absent files:

- `setGroupMemberRoleBody.ts`
- `setGroupMemberRoleBodyRole.ts`

The clean check reports TS2307. The original workspace has old compiled
declarations for these names under `lib/api-zod/dist`, but the corresponding
source files are absent. Stale generated build products were intentionally not
copied into the source export to conceal that problem.

The API's own check then reports TS6305 for missing
`lib/api-zod/dist/index.d.ts`, because the shared declaration build could not
complete. Other backend errors cannot be ruled out until that dependency is
repaired and the complete check is rerun.

**Recommended follow-up, requiring approval:** repair/regenerate the affected
validation source and missing types in an export-only working copy, review the
API-contract and validation diff, add focused validator tests and rerun all
TypeScript checks. Do not alter original/production source or call the currently
failing full check a PASS. `pnpm build` includes that check and therefore also
stops, despite the separate web/API bundle commands passing.

## Important interpretation of the auth tests

Several existing tests deliberately prove that the current fallback accepts
attacker-controlled or unrelated issuers. They pass when that vulnerability
remains reproducible. Other tests exercise a proposed policy that is not active
in runtime code. Eighteen green fixture tests are **not authentication security
approval**, a live-session compatibility test or proof that Google/Apple login
works on a new host. The original auth risk remains unresolved.

## Runtime and portability work still pending

- Approved empty-database schema bootstrap/baseline review; the three existing
  migrations are incremental, not a complete fresh-database history.
- Portable file-storage credentials/adapter outside Replit's local sidecar.
- Approved compatible AI service configuration; an OpenAI client is created
  eagerly during module import and missing credentials may prevent startup.
- Same-origin HTTP/WebSocket routing and approved Clerk origin/proxy/provider
  configuration on any new host. Caddy config is an example, not a tested
  deployed service.
- Fix/review remote-session launch navigation (`/meeting/<code>` versus the
  registered `/room/<code>` route).
- Real two-machine remote control, desktop native build/toolchain, permissions,
  installer paths/signing, and feature acceptance testing.
- No dedicated project/task-management/Kanban system was identified.
- Some business tools use browser-local storage; that data is not exported.
- Existing desktop installer URLs have no installer assets in this source
  snapshot. Their clean source-download ZIP is included.

The exported guarded backend command is a convenience check only. It cannot
verify provider ownership, prevent live credential misuse, validate a database
tunnel or prove service isolation. Starting the original backend can alter
Clerk redirect configuration and meeting rows. Do not use live resources.

## Scope of the credential scan

All distributed files, including binary assets and nested desktop ZIP members,
are read. Installed dependencies, local build output and Git/cache metadata
are excluded from distribution and scanning. Unsupported/encrypted nested ZIP
files cause the scanner to fail rather than skip their contents.

No original environment files, real Clerk public/secret key values, Apple keys,
signing materials, database contents or user-uploaded storage files are supplied.
Only eight specifically required application images from the original upload
directory are retained. Public product URLs/identifiers and source integration
code are preserved.

The scan uses known credential patterns and sensitive filenames. Zero findings
is not a guarantee that every possible secret or security flaw is absent.
No provider keys were read from environment values, revoked or rotated.
