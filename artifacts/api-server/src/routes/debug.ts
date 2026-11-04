import { Router } from "express";

const router = Router();

// Diagnostic endpoint — reveals SAFE, non-secret info about the server's Clerk
// configuration (key TYPE + publishable-key prefix + proxy URL + node env).
// It never returns secret-key material. Intentionally available in production
// too, so the mobile Auth Debug panel and `curl` can verify that the deployed
// server and the APK are pointed at the SAME Clerk instance + proxy URL. A
// dev/prod instance mismatch here is the classic cause of mobile 401s.
router.get("/debug/clerk", (_req, res) => {
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  const pk = process.env.CLERK_PUBLISHABLE_KEY ?? "";

  const keyType = (key: string) => {
    if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) return "live";
    if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) return "test";
    return "missing";
  };

  // Decode the FAPI host encoded in a Clerk publishable key (base64 after the
  // pk_live_/pk_test_ prefix, trailing "$"). Lets the client confirm WHICH
  // Clerk instance the server talks to without exposing any secret.
  const pkInstance = (() => {
    try {
      const b64 = pk.replace(/^pk_(live|test)_/, "");
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      return decoded.replace(/\$$/, "") || "(unknown)";
    } catch {
      return "(unknown)";
    }
  })();

  res.json({
    secretKey: {
      type: keyType(sk),
      // Do NOT expose secret-key material — only the type + whether it is set.
      ok: sk.startsWith("sk_test_") || sk.startsWith("sk_live_"),
      note: sk.startsWith("sk_test_")
        ? "✓ TEST secret key — a development Clerk instance."
        : sk.startsWith("sk_live_")
        ? "✓ LIVE secret key — a production Clerk instance."
        : "❌ Missing CLERK_SECRET_KEY",
    },
    publishableKey: {
      type: keyType(pk),
      prefix: pk.slice(0, 14) + "…",
      instance: pkInstance,
      ok: pk.startsWith("pk_live_") || pk.startsWith("pk_test_"),
    },
    proxyUrl: process.env.CLERK_PROXY_URL ?? "(not set — direct FAPI connection)",
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Device→server telemetry sink. The mobile app POSTs auth-flow events and
// errors here so on-device Clerk failures (which are otherwise invisible
// remotely) show up in the PRODUCTION server logs. Never authenticated — it
// only writes to logs and returns ok. Payloads are logged as-is but capped so
// a malicious client can't flood the log with megabytes per request.
router.post("/debug/client-log", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const event = typeof body.event === "string" ? body.event : "unknown";
  // Cap the serialized payload to keep log lines bounded.
  let safe: Record<string, unknown> = body;
  try {
    const s = JSON.stringify(body);
    if (s.length > 4000) safe = { truncated: true, preview: s.slice(0, 4000) };
  } catch {
    safe = { unserializable: true };
  }
  req.log.info({ clientLog: true, ...safe }, `client-log: ${event}`);
  res.json({ ok: true });
});

// Comprehensive Clerk production diagnostics — answers:
//   1. Is Google OAuth enabled in the Production instance?
//   2. Are custom Google OAuth credentials configured?
//   3. Are the redirect URLs present?
//   4. Does Clerk return externalVerificationRedirectURL for oauth_google?
// All checks run server-side so the production Clerk keys and FAPI host are used.
router.get("/debug/clerk-social", async (_req, res) => {
  const pk = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";

  // Decode FAPI host from publishable key (base64 encoded domain after prefix)
  const fapiHost = (() => {
    try {
      const b64 = pk.replace(/^pk_(live|test)_/, "");
      return Buffer.from(b64, "base64").toString("utf8").replace(/\$$/, "") || null;
    } catch { return null; }
  })();

  const pkType = pk.startsWith("pk_live_") ? "LIVE" : pk.startsWith("pk_test_") ? "TEST" : "unknown";
  const skType = sk.startsWith("sk_live_") ? "LIVE" : sk.startsWith("sk_test_") ? "TEST" : "unknown";

  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    keys: { pkType, skType, fapiHost },
  };

  if (!fapiHost) {
    res.status(500).json({ ...result, error: "Cannot decode FAPI host from CLERK_PUBLISHABLE_KEY" });
    return;
  }

  // ── Check 1+2: BAPI /v1/instance — confirms which instance + environment type
  try {
    const bapiResp = await fetch("https://api.clerk.com/v1/instance", {
      headers: { Authorization: `Bearer ${sk}` },
    });
    const bapi = (await bapiResp.json()) as Record<string, unknown>;
    result.bapi_instance = {
      id: bapi.id,
      environment_type: bapi.environment_type,
      home_url: bapi.home_url,
      status: bapiResp.status,
    };
  } catch (e) {
    result.bapi_instance = { error: e instanceof Error ? e.message : String(e) };
  }

  // ── Check 1+2: FAPI /v1/environment — lists which social connections are enabled
  //    and whether they have custom credentials (custom_credentials_available)
  try {
    const envResp = await fetch(`https://${fapiHost}/v1/environment`);
    const env = (await envResp.json()) as Record<string, unknown>;
    const social = ((env.user_settings as Record<string, unknown>)?.social ?? {}) as Record<string, Record<string, unknown>>;
    const socialSummary: Record<string, unknown> = {};
    for (const [provider, cfg] of Object.entries(social)) {
      socialSummary[provider] = {
        enabled: cfg.enabled,
        required: cfg.required,
        deprecated: cfg.deprecated,
        strategy: cfg.strategy,
        authenticatable: cfg.authenticatable,
        custom_credentials_available: cfg.custom_credentials_available,
      };
    }
    result.fapi_environment = { status: envResp.status, social: socialSummary };

    // ── Check 3: allowed redirect URIs from environment
    const authConfig = (env.auth_config ?? {}) as Record<string, unknown>;
    result.fapi_redirect_allowlist = authConfig.allowed_origins ?? authConfig.redirect_urls ?? "not_in_auth_config";
  } catch (e) {
    result.fapi_environment = { error: e instanceof Error ? e.message : String(e) };
  }

  // ── Check 4: simulate the exact APK call — POST /v1/client/sign_ins with oauth_google
  //    This is what the APK does; if Google is not configured, Clerk returns an error here.
  //    If configured, it returns externalVerificationRedirectURL.
  const testRedirectUrl = "tancom-mobile://oauth-native-callback";
  try {
    const signInResp = await fetch(`https://${fapiHost}/v1/client/sign_ins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Clerk-Frontend-Api": fapiHost,
      },
      body: new URLSearchParams({
        strategy: "oauth_google",
        redirect_url: testRedirectUrl,
        action_complete_redirect_url: testRedirectUrl,
      }).toString(),
    });
    const signIn = (await signInResp.json()) as Record<string, unknown>;
    const response = (signIn.response ?? signIn) as Record<string, unknown>;
    const firstFactor = (response.first_factor_verification ?? {}) as Record<string, unknown>;
    result.simulated_sign_in = {
      http_status: signInResp.status,
      clerk_status: response.status,
      first_factor_strategy: firstFactor.strategy,
      external_verification_redirect_url: firstFactor.external_verification_redirect_url,
      errors: (signIn.errors as unknown[]) ?? [],
    };
  } catch (e) {
    result.simulated_sign_in = { error: e instanceof Error ? e.message : String(e) };
  }

  res.json(result);
});

export default router;
