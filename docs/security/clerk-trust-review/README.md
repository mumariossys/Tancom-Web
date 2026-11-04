# Clerk trust-boundary review

## Decision summary

**Critical source-level authentication bypass in the Bearer fallback.** The API
can accept a JWT signed by an attacker-owned key server, with a chosen `sub`.
The production runtime has NOT been probed or changed. This conclusion is
confirmed against the repository's actual `auth.ts` with local signing keys and
mocked network boundaries, not against a deployed API.

Keep the existing live mobile and web issuers, but bind each exact issuer to an
explicit, independently approved key source. Remove wildcard tenant and arbitrary
proxy-host trust. Apply the same policy to SDK-authenticated sessions as to the
fallback; otherwise the two authentication paths remain inconsistent.

**Status:** review and offline compatibility proposal complete; NOT approved for
production integration. No production auth, keys, user stores, DNS, databases,
deployments, or Clerk settings were modified. No real session token was collected.

## Evidence and consequences

Reviewed `artifacts/api-server/src/lib/auth.ts`, middleware configuration in
`src/app.ts`, `src/middlewares/clerkProxyMiddleware.ts`, web `src/App.tsx`,
mobile `app/_layout.tsx`, `eas.json`, and `lib/api.ts`. Also inspected the installed
Clerk backend 3.4.5 / Express 2.1.13 and jose 6.2.3 implementation.

1. `issuerAccepted()` accepts any string ending in `/api/__clerk`. There is no
   HTTPS, hostname, tenant, or exact URL restriction. The fallback then constructs
   the JWKS URL from that unverified claim. A token with
   `iss=https://attacker.invalid/api/__clerk` fetches attacker keys. A valid
   attacker signature is not evidence of a trusted TanCom identity.
   **Offline reproduction:** the actual middleware accepts a locally signed token
   with a synthetic victim `sub` using the mocked attacker's public key.
   Routes using `requireAuth` / `getUserId` trust that subject as the caller.
   If an attacker knows a real user ID, impersonation is possible on those routes;
   the review did not exercise any victim account or data.
2. The `*.accounts.dev` regex admits unrelated Clerk tenants, not just TanCom's
   development instance. A foreign tenant's genuine signed session can enter the
   fallback. Controlling that tenant's signing key is not necessary to cross the
   tenant boundary, though ordinary Clerk users cannot choose arbitrary subjects.
3. JWKS selection admits HTTP URLs and internal destinations ending in the proxy
   path. This creates server-side outbound-request exposure and an unbounded
   per-issuer cache. Actual reachability depends on deployment networking;
   internal services were NOT contacted. jose's HTTP/HTTPS checks do not fix
   application-level issuer trust.
4. The fallback supplies only `clockTolerance: 60` to `jwtVerify`. It does not pin
   algorithms, issuer, audience, authorized party, or require session ID, expiry,
   or issue time. jose checks `exp`/`nbf` when present, but missing `exp` is accepted.
   The current source accepts a nonempty string `sub` without proving it is a
   Clerk session token. A token missing `exp`, `iat`, and `sid` was accepted offline.
5. `getAuth(...).userId` short-circuits fallback verification. The SDK gets
   `acceptsToken: "session_token"` and 60-second skew, but no explicit audience or
   authorized-party list. The inspected SDK verifier checks signature using its
   configured key source, times and subject; it does not impose this proposed
   issuer map. Its audience/authorized-party assertions are inactive without
   configuration. Do NOT describe the SDK path as attacker-key-controlled like
   the fallback: its key source is different. It still needs consistent policy.
6. CORS is not an authentication defense: a non-browser client can omit Origin.
   `tokenPreview` logs a raw Authorization prefix on denial. Remove raw token
   fragments in a future approved change; keep structured reason codes and
   bounded/redacted claims only. Arbitrary issuer/azp strings in logs also need
   length limits and escaping.

## Exact issuer / JWKS / audience proposal

This is the proposed registry, not an assertion of deployed configuration.
Environment secret values and deployment-specific overrides were not inspected.
Repository configuration proves client intent, not which binaries or tenant keys
are currently active. Do not derive trust from request Host/X-Forwarded-Host,
Origin, a suffix match, or an arbitrary publishable key at request time.

| Exact `iss` | Proposed pinned JWKS URL | Environment / compatibility disposition |
|---|---|---|
| `https://clerk.tancom.us` | `https://clerk.tancom.us/.well-known/jwks.json` | Preserve existing live native/direct sessions. Both EAS release profiles encode this FAPI host. |
| `https://tancom.us/api/__clerk` | Prefer `https://clerk.tancom.us/.well-known/jwks.json` **only after proving same-tenant key ownership** | Preserve existing live proxy/browser and any proxy-issued mobile sessions. If alias equivalence cannot be proved, pin the exact `https://tancom.us/api/__clerk/.well-known/jwks.json` URL separately after ownership/key verification; never infer it from a token. |
| `https://grand-mudfish-37.clerk.accounts.dev` | `https://grand-mudfish-37.clerk.accounts.dev/.well-known/jwks.json` | Development-only by default; exact historical tenant is named in API comments. Do not silently remove from live if deployed clients legitimately depend on it: inventory first, then approve a time-bounded exact compatibility entry or migrate separately. |
| `https://clerk.account.tancom.us` | `https://clerk.account.tancom.us/.well-known/jwks.json` | Separate isolated staging tenant ONLY. Do not add to the live API during this hardening. |
| Any other URL, including other `accounts.dev` tenants and proxy hosts | None; reject before allocating resolver or doing network I/O | If another real deployed alias is found, verify ownership and tenant/key identity, obtain approval, then add its exact entry. No blanket `.replit.app` / `.replit.dev` trust. |

The live proxy forwards to `https://frontend-api.clerk.dev` with a configured
secret and a request-derived `Clerk-Proxy-Url`. That upstream address alone does
not prove its keys match `clerk.tancom.us`. Compare public JWK material/thumbprints
and verify sanitized representative sessions under the pinned key set, accounting
for rotation and cache age. Same `kid` alone is insufficient. Resolve host/proxy
configuration from an approved deployment inventory, not forwarded client headers.

**Audience:** no production audience value or requirement is configured in the
reviewed authentication code. Client calls shown use ordinary `getToken()`, not an
explicit audience template. Actual claim presence is unconfirmed. `aud`, `azp`,
and `iss` are different concepts; do not substitute an issuer URL for audience.
For each retained issuer, inventory audience presence/type and intended recipient.
Preserve absent `aud` for approved legacy session formats; if present, require
intersection with that issuer's approved audience set. Once issuance and all
clients consistently supply the intended API audience, making it mandatory is
a separate coordinated change. A shared issuer alone does not define audience.
The fixture `urn:review-fixture:tancom-api` is NOT a proposed production value.

**Authorized party:** inventory the actual web, native, Electron, and legacy
values for each issuer. Start with the known web origin `https://tancom.us` only
where evidenced; include any verified native FAPI-origin values explicitly, and
permit missing `azp` for verified legacy/native session formats. Missing `azp`
does not authenticate a client; the pinned signature and session claims still do.
Do not accept arbitrary `azp`, copy the current request Origin into the allowlist,
or whitelist all localhost/development origins in production. The local proposal
demonstrates both absent native azp and direct-FAPI azp as compatibility fixtures,
not claims observed from a real device.

## Compatibility-preserving integration design (approval required)

1. Freeze a reviewed per-environment registry before touching request handling.
   Fail startup on empty/malformed issuer/key-source configuration, duplicate
   entries, unexpected non-HTTPS production URLs, or unapproved dev/live mixing.
   Validate URLs once without normalizing incoming issuer claims.
2. Keep RS256, exact issuer, required `iss/sub/exp/iat/sid`, valid session-principal
   shapes, `exp`/`nbf`/future-`iat` checks, and the current 60-second skew initially.
   Tightening skew to the staging example's five seconds is unnecessary breakage.
   Confirm session version and claim formats before requiring new shapes.
3. Prebuild a finite resolver set from the registry. Use jose remote caching and
   key rotation, bounded fetch timeouts/cooldown and concurrency, HTTPS, and
   disabled redirects/allowlisted destinations. Unknown issuers must cause zero
   outbound fetches or cache allocation. A failed pinned-key fetch returns 401
   (or a deliberate documented transient auth-service error), never broader trust.
4. Enforce one decision for both cookie and Bearer sessions. Preserve SDK cookie,
   handshake, refresh, and sign-in behavior; do not simply make Bearer mandatory.
   After SDK verification, validate its verified session claims against the
   registry and key/tenant provenance. If the SDK cannot provide sufficient
   provenance, verify the underlying session JWT with the same pinned resolver.
   An explicitly supplied invalid Bearer should not be rescued by a different
   cookie identity; decide and test credential precedence deliberately.
5. Only expose a single verified principal to routes. `getUserId()` currently
   prefers SDK auth, so attaching a stricter fallback alone is insufficient.
   Audit direct `getAuth()` consumers (e.g. profile, verify, live routes); migrate
   protected handlers to the shared verified principal without changing public
   endpoints or allowing a second weaker route to bypass the gate.
6. Retain `sub` and existing user/store mappings unchanged. Do not switch tenants,
   regenerate keys, link accounts by email, force logouts, or ship an OTA/native
   rebuild to implement a server-side allowlist. Those are separate approval
   decisions. Verify Google Login independently without changing its providers.

## What was tested

Run from repository root:

```sh
node --test docs/security/clerk-trust-review/compatibility.test.mjs isolated-testing/backend/test/jwt.test.mjs
```

The review harness compiles the **actual** production `auth.ts` in memory with
the existing esbuild dependency. Only `getAuth` and remote key resolution are
stubbed; JWT signatures are real jose RS256 signatures with ephemeral local keys.
The publishable-key environment expression is replaced at compile time with a
fixture, so the harness does not inspect workspace secret values.
It imports no app/server/database and makes no network requests.

The suite covers current attacker-host and foreign-tenant acceptance, HTTP and
missing claims, SDK-path short-circuit characterization, unauthenticated denial;
candidate direct/proxy legacy/browser acceptance; explicit dev-only trust;
unknown/staging/internal/credential-host/URL-variant rejection before resolution;
pinned-key mismatch; absent, string, and array audience; unexpected azp;
malformed/expired/not-yet-valid/future-issued tokens; missing session claims;
algorithm rejection; and preserved clock tolerance.

`proposed-policy.mjs` is an unconnected **review-only** verifier, not production
middleware or a ready-to-copy configuration. The alias mapping in its test
fixtures assumes a common trusted key solely to test the intended design.
`isolated-testing/backend/verify-session.mjs` is tested as a narrow counterexample:
its single staging issuer rejects both existing live issuer fixtures. Copying it
would break legitimate live clients. It also has a different five-second skew
and staging-origin policy, not a universal TanCom audience policy.

### Required release evidence still to collect after approval

- Read-only inventory of approved deployed aliases, tenant/key provenance,
  sanitized claim shapes (never log full tokens), audience and authorized parties.
- Existing signed-in browser cookies **and** web Bearer requests, native iOS and
  Android current/older releases, Electron if deployed, Google sign-in and token
  refresh/reconnect. Verify no unexpected re-login and same existing user IDs.
- SDK-accepted cookie and Bearer paths versus fallback paths; conflicting
  credentials, direct `getAuth` routes and key rotation/JWKS-outage behavior.
- Staging-only canary with pinned production-like fixture keys and negative
  cases; no production tenant or user data copied into isolated staging.

These tests are **synthetic compatibility coverage, not proof of live-session
or device compatibility**. Production readiness remains gated on the above
evidence and explicit approval. No claim is made about the current deployed
revision, successful exploitation in production, or historical compromise.

## Safe rollout and rollback proposal

After approval, first collect redacted decision-only telemetry for a bounded
period (no tokens/subjects, no network fetch for unknown issuers), then resolve
every legitimate-policy mismatch before enforcement. Do not treat observation
mode as a remediation: the current vulnerability remains until enforcement.
Stage changes in the separate isolated project, verify both session paths, and
submit a reviewed patch. Release requires separate explicit approval.

On a legitimate outage, prefer rolling forward by adding the one verified exact
issuer/claim entry. Any rollback to the old wildcard code reopens the bypass and
must be explicitly risk-approved; never automatically broaden issuer trust on
verification failure. No rollback or deployment was performed by this review.
