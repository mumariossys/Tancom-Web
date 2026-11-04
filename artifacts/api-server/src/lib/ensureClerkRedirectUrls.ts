// Ensures the native OAuth callback scheme(s) used by the Expo mobile app are
// present in the Clerk instance's redirect-URL allowlist. This runs against
// WHICHEVER Clerk instance the deployed server is bound to (via its runtime
// CLERK_SECRET_KEY) — which is the only way to configure the *production*
// instance, since the workspace only holds development keys. Without these
// entries, "Continue with Google" on native fails because Clerk refuses to
// redirect back to the app after the OAuth consent screen.
//
// Idempotent: lists existing redirect URLs first and only POSTs missing ones.

const CLERK_API_URL = (process.env.CLERK_API_URL ?? "https://api.clerk.com").replace(/\/$/, "");

// The Expo app registers scheme "tancom-mobile" and uses
// "tancom-mobile://oauth-native-callback" as its OAuth redirect.
const NATIVE_REDIRECT_URLS = [
  "tancom-mobile://oauth-native-callback",
  "tancom-mobile://",
];

type Log = {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export async function ensureClerkRedirectUrls(log: Log): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    log.warn({}, "ensureClerkRedirectUrls: no CLERK_SECRET_KEY — skipping");
    return;
  }

  try {
    const listResp = await fetch(`${CLERK_API_URL}/v1/redirect_urls`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!listResp.ok) {
      log.error(
        { status: listResp.status },
        "ensureClerkRedirectUrls: failed to list redirect URLs",
      );
      return;
    }

    const existing = (await listResp.json()) as Array<{ url?: string }>;
    const existingUrls = new Set(
      (Array.isArray(existing) ? existing : []).map((e) => e.url),
    );

    for (const url of NATIVE_REDIRECT_URLS) {
      if (existingUrls.has(url)) {
        log.info({ url }, "ensureClerkRedirectUrls: redirect URL already present");
        continue;
      }
      const addResp = await fetch(`${CLERK_API_URL}/v1/redirect_urls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      if (addResp.ok) {
        log.info({ url }, "ensureClerkRedirectUrls: added redirect URL");
      } else {
        const body = await addResp.json().catch(() => ({}));
        log.error(
          { url, status: addResp.status, body },
          "ensureClerkRedirectUrls: failed to add redirect URL",
        );
      }
    }
  } catch (err) {
    log.error({ err }, "ensureClerkRedirectUrls: unexpected error");
  }
}
