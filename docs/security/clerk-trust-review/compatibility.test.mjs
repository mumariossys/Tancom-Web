// Offline only: real jose signatures; no production keys, sessions or requests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { verifyProposedSession } from "./proposed-policy.mjs";
import { verifySession as verifyStagingSession } from "../../../isolated-testing/backend/verify-session.mjs";

const apiRequire = createRequire(new URL("../../../artifacts/api-server/package.json", import.meta.url));
const { build } = apiRequire("esbuild");
const jose = await import(pathToFileURL(apiRequire.resolve("jose")).href);
const { generateKeyPair, SignJWT, jwtVerify } = jose;
const trusted = await generateKeyPair("RS256");
const foreign = await generateKeyPair("RS256");
const devKey = await generateKeyPair("RS256");
const DIRECT = "https://clerk.tancom.us";
const PROXY = "https://tancom.us/api/__clerk";
const DEV = "https://grand-mudfish-37.clerk.accounts.dev";
const STAGING = "https://clerk.account.tancom.us";
// Synthetic audience, NOT a claim observed in a real TanCom token.
const AUD = "urn:review-fixture:tancom-api";
const pinnedUrl = `${DIRECT}/.well-known/jwks.json`;
const policies = new Map([DIRECT, PROXY].map(issuer => [issuer, {
  jwksUrl: pinnedUrl,
  authorizedParties: ["https://tancom.us", DIRECT],
  allowMissingAzp: true, allowMissingAudience: true, audiences: [AUD],
}]));
const developmentPolicies = new Map([[DEV, {
  jwksUrl: `${DEV}/.well-known/jwks.json`,
  authorizedParties: ["http://localhost:5173"],
  allowMissingAzp: true, allowMissingAudience: true, audiences: [AUD],
}]]);
const fetched = [];
const candidate = (token, selectedPolicies = policies) => verifyProposedSession(token, {
  policies: selectedPolicies, jwtVerify,
  resolvePinnedKeys: async url => {
    fetched.push(url);
    if (url === pinnedUrl) return trusted.publicKey;
    if (url === `${DEV}/.well-known/jwks.json`) return devKey.publicKey;
    throw new Error("Unconfigured pinned URL");
  },
});
async function sign(issuer = DIRECT, {
  key = trusted.privateKey, claims = {}, sub = "user_review_fixture",
  exp = Math.floor(Date.now() / 1000) + 300, alg = "RS256",
  sid = "sess_review_fixture", iat = Math.floor(Date.now() / 1000),
} = {}) {
  const payload = { iss: issuer, sub, sid, iat, exp, ...claims };
  // undefined fields deliberately model missing claims (JSON omits them).
  return new SignJWT(payload).setProtectedHeader({ alg }).sign(key);
}

// Compile the actual production source in memory, replacing only external
// boundaries. getAuth is controlled and RemoteJWKSet uses local public keys.
// No production function or claim checks are copied into this characterization.
const boundary = {
  jwtVerify,
  calls: [],
  createRemoteJWKSet(url) {
    boundary.calls.push(url.href);
    return async () => foreign.publicKey;
  },
};
globalThis.__tancomReviewBoundary = boundary;
const output = await build({
  entryPoints: [new URL("../../../artifacts/api-server/src/lib/auth.ts", import.meta.url).pathname],
  bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
  // Never inspect workspace secrets when evaluating production source.
  define: {
    "process.env.CLERK_PUBLISHABLE_KEY": JSON.stringify(
      `pk_live_${Buffer.from("clerk.tancom.us$").toString("base64")}`,
    ),
  },
  plugins: [{
    name: "offline-auth-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /^(@clerk\/express|jose)$/ }, args => ({ path: args.path, namespace: "review" }));
      builder.onLoad({ filter: /.*/, namespace: "review" }, args => ({
        contents: args.path === "jose"
          ? "export const {jwtVerify,createRemoteJWKSet}=globalThis.__tancomReviewBoundary;"
          : "export const getAuth=(req)=>({userId:req.reviewMiddlewareUserId??null});",
        loader: "js",
      }));
    },
  }],
});
const current = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
delete globalThis.__tancomReviewBoundary;
async function currentRequest(token, middlewareUserId = null) {
  let passed = false, status;
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    path: "/review-only", reviewMiddlewareUserId: middlewareUserId,
    log: { info() {}, warn() {} },
  };
  const res = { status(code) { status = code; return this; }, json() {} };
  await current.requireAuth(req, res, () => { passed = true; });
  return { passed, status, userId: req.userId };
}

test("actual fallback accepts attacker-hosted keys and an arbitrary victim subject", async () => {
  const issuer = "https://attacker.invalid/api/__clerk";
  const result = await currentRequest(await sign(issuer, {
    key: foreign.privateKey, sub: "user_synthetic_victim",
  }));
  assert.equal(result.passed, true);
  assert.equal(result.userId, "user_synthetic_victim");
  assert.ok(boundary.calls.includes(`${issuer}/.well-known/jwks.json`));
});
test("actual fallback accepts an unrelated accounts.dev tenant", async () => {
  assert.equal((await currentRequest(await sign("https://foreign.clerk.accounts.dev", {
    key: foreign.privateKey,
  }))).passed, true);
});
test("actual fallback accepts HTTP proxy issuer and missing session/expiry claims", async () => {
  assert.equal((await currentRequest(await sign("http://attacker.invalid/api/__clerk", {
    key: foreign.privateKey, exp: undefined, iat: undefined, sid: undefined,
  }))).passed, true);
});
test("middleware-authenticated path bypasses fallback issuer validation", async () => {
  const before = boundary.calls.length;
  assert.equal((await currentRequest("invalid-bearer", "user_sdk_fixture")).passed, true);
  assert.equal((await currentRequest(null, "user_sdk_fixture")).passed, true);
  assert.equal(boundary.calls.length, before);
});
test("current unauthenticated request is denied", async () => {
  assert.equal((await currentRequest(null)).status, 401);
});
for (const issuer of [DIRECT, PROXY]) {
  test(`proposal preserves synthetic legacy/native and browser claims: ${issuer}`, async () => {
    for (const claims of [{}, { azp: "https://tancom.us" }, { azp: DIRECT }]) {
      assert.equal((await candidate(await sign(issuer, { claims }))).sub, "user_review_fixture");
    }
  });
}
test("known dev issuer works only in the explicit development policy", async () => {
  const token = await sign(DEV, { key: devKey.privateKey, claims: { azp: "http://localhost:5173" } });
  await assert.rejects(() => candidate(token));
  assert.equal((await candidate(token, developmentPolicies)).sub, "user_review_fixture");
});
test("untrusted issuers are rejected before resolving any keys", async () => {
  for (const issuer of [
    STAGING, DEV, "https://foreign.clerk.accounts.dev",
    "https://attacker.invalid/api/__clerk", "http://attacker.invalid/api/__clerk",
    "https://127.0.0.1/api/__clerk", "https://169.254.169.254/api/__clerk",
    `${DIRECT}.evil.invalid`, `${DIRECT}:443`, `${PROXY}/`, `${PROXY}?x=1`,
    `https://tancom.us@attacker.invalid/api/__clerk`,
  ]) {
    const before = fetched.length;
    const token = await sign(issuer);
    await assert.rejects(() => candidate(token));
    assert.equal(fetched.length, before);
  }
});
test("proposal pins proxy tokens to the approved direct FAPI keys", async () => {
  const before = fetched.length;
  await candidate(await sign(PROXY));
  assert.deepEqual(fetched.slice(before), [pinnedUrl]);
  await assert.rejects(async () => candidate(await sign(PROXY, { key: foreign.privateKey })));
});
test("proposal validates optional scalar/array audience without breaking missing legacy aud", async () => {
  for (const aud of [undefined, AUD, [AUD, "other"]]) {
    await candidate(await sign(DIRECT, { claims: { aud } }));
  }
  for (const aud of ["other-api", [], ["other-api"], 42]) {
    await assert.rejects(async () => candidate(await sign(DIRECT, { claims: { aud } })));
  }
});
test("proposal rejects wrong azp, missing session claims and expired/future tokens", async () => {
  for (const claims of [
    { azp: "https://attacker.invalid" }, { azp: 42 }, { exp: undefined },
    { iat: undefined }, { sid: undefined }, { sid: "" }, { sub: "" },
    { sub: "machine_fixture" }, { exp: Math.floor(Date.now() / 1000) - 120 },
    { iat: Math.floor(Date.now() / 1000) + 120 },
    { nbf: Math.floor(Date.now() / 1000) + 120 },
  ]) await assert.rejects(async () => candidate(await sign(DIRECT, { claims })));
  await assert.rejects(() => candidate("not.a.jwt"));
  const hmac = await sign(DIRECT, { alg: "HS256", key: new Uint8Array(32) });
  await assert.rejects(() => candidate(hmac));
});
test("proposal retains the current 60-second clock tolerance", async () => {
  await candidate(await sign(DIRECT, { exp: Math.floor(Date.now() / 1000) - 30 }));
});
test("staging verifier deliberately rejects existing live direct/proxy issuer fixtures", async () => {
  for (const issuer of [DIRECT, PROXY]) {
    await assert.rejects(async () => verifyStagingSession(await sign(issuer), {
      jwtVerify, jwks: trusted.publicKey, origin: "https://review-staging.invalid",
    }));
  }
});
