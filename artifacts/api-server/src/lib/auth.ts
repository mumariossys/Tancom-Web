import { getAuth } from "@clerk/express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { type Request, type Response, type NextFunction } from "express";

// The FAPI host encoded in the publishable key (e.g. "clerk.tancom.us").
// @clerk/clerk-expo ALWAYS talks directly to this host via Clerk's Native API
// and IGNORES any proxyUrl, so mobile-issued JWTs carry iss === "https://<host>".
// Web, by contrast, routes Clerk through the reverse proxy, so its JWTs carry
// iss === "https://<domain>/api/__clerk". To authenticate BOTH clients we accept
// either issuer when verifying Bearer tokens ourselves.
const PK_FAPI_HOST = (() => {
  const pk = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  try {
    const b64 = pk.replace(/^pk_(live|test)_/, "");
    return Buffer.from(b64, "base64").toString("utf8").replace(/\$$/, "");
  } catch {
    return "";
  }
})();

function issuerAccepted(iss: string | undefined): boolean {
  if (!iss) return false;
  // Web (proxy-issued): https://<domain>/api/__clerk
  if (iss.endsWith("/api/__clerk")) return true;
  // Mobile / clerk-expo (direct FAPI): https://clerk.tancom.us
  if (PK_FAPI_HOST && iss === `https://${PK_FAPI_HOST}`) return true;
  // Clerk-hosted development instances: https://<slug>.accounts.dev
  if (/^https:\/\/[^/]+\.accounts\.dev$/.test(iss)) return true;
  return false;
}

// Cache one RemoteJWKSet per issuer URL so we don't recreate it on every request.
// jose's RemoteJWKSet already caches JWKS internally with a 5-minute TTL.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(iss: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache.has(iss)) {
    // Derive the JWKS URL from the issuer:
    //   - Development instances (*.accounts.dev) → iss + "/.well-known/jwks.json"
    //   - Custom domain direct FAPI (clerk.tancom.us) → iss + "/.well-known/jwks.json"
    //   - Proxy issuer (…/api/__clerk) → same pattern; the proxy rewrites the path
    //     to the real Clerk FAPI so /.well-known/jwks.json works correctly.
    const jwksUrl = `${iss}/.well-known/jwks.json`;
    jwksCache.set(iss, createRemoteJWKSet(new URL(jwksUrl)));
  }
  return jwksCache.get(iss)!;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization ?? null;
  const hasHeader = !!authHeader;
  const tokenPreview = authHeader ? authHeader.slice(0, 48) + "…" : "none";

  // Decode JWT claims without signature verification so we can log the issuer
  // and expiry for every denied request — essential for diagnosing Android
  // Bearer-JWT failures in production without needing a full JWT library.
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const parts = authHeader.slice(7).split(".");
      if (parts[1]) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString(),
        );
        const nowSec = Math.floor(Date.now() / 1000);
        req.log.info(
          {
            jwtIss: payload.iss,
            jwtAzp: payload.azp,
            jwtExp: payload.exp,
            jwtExpInSec: payload.exp != null ? payload.exp - nowSec : null,
          },
          "requireAuth: JWT claims (no sig check)",
        );
      }
    } catch {
      // non-fatal — continue to normal auth check
    }
  }

  // Pass acceptsToken: "session_token" so getAuth honours the same flag set
  // on clerkMiddleware. Without this, getAuthObjectForAcceptedToken is called
  // with acceptsToken: undefined which may filter out the auth object even
  // when clerkMiddleware has already authenticated the Bearer JWT.
  let userId = getAuth(req, { acceptsToken: "session_token" })?.userId ?? null;
  let via = "clerkMiddleware";

  // Fallback: clerkMiddleware couldn't authenticate the Bearer token.
  //
  // Root cause: @clerk/backend's verifyToken({ secretKey }) fetches JWKS from
  // the Clerk Backend API (api.clerk.com/v1/jwks) which may return different
  // key IDs than the FAPI's public /.well-known/jwks.json endpoint used to
  // sign session tokens. This causes spurious "jwk-kid-mismatch" rejections.
  //
  // Fix: use jose to fetch the JWKS directly from the JWT issuer's own public
  // endpoint. This always returns the correct keys regardless of which Clerk
  // instance (test dev / live) issued the token.
  if (!userId && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    try {
      // Step 1: decode JWT payload WITHOUT signature check to get issuer.
      const parts = token.split(".");
      if (parts.length < 3 || !parts[1]) {
        throw new Error("malformed JWT");
      }
      const rawPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as {
        iss?: string;
        sub?: string;
      };
      const iss = rawPayload.iss ?? "";

      // Step 2: Validate the issuer before trusting any JWKS from it.
      if (!issuerAccepted(iss)) {
        req.log.warn(
          { path: req.path, jwtIss: iss },
          "requireAuth: issuer not accepted, skipping fallback",
        );
      } else {
        // Step 3: Verify the signature + expiry using JWKS fetched from the
        // issuer's public endpoint — guaranteed to contain the correct keys.
        const JWKS = getJWKS(iss);
        const { payload } = await jwtVerify(token, JWKS, {
          clockTolerance: 60, // allow 60 s of clock drift
        });

        const sub = typeof payload.sub === "string" ? payload.sub : undefined;
        if (sub) {
          userId = sub;
          via = "jose-jwks-fallback";
          req.log.info(
            { path: req.path, jwtIss: iss, sub },
            "requireAuth: jose-jwks-fallback OK",
          );
        }
      }
    } catch (e: unknown) {
      const err = e as { reason?: string; message?: string; code?: string };
      req.log.warn(
        { path: req.path, tokenPreview, reason: err?.reason ?? err?.code ?? err?.message },
        "requireAuth: jose-jwks-fallback rejected",
      );
    }
  }

  if (!userId) {
    req.log.warn(
      { path: req.path, hasAuthHeader: hasHeader, tokenPreview, clerkUserId: null },
      "requireAuth: DENIED",
    );
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.log.info(
    { path: req.path, hasAuthHeader: hasHeader, clerkUserId: userId, via },
    "requireAuth: OK",
  );
  (req as any).userId = userId;
  next();
}

export function getUserId(req: Request): string | null {
  const auth = getAuth(req, { acceptsToken: "session_token" });
  // Fall back to the userId set by requireAuth's jose fallback so that
  // routes using getUserId() also work for mobile Bearer-JWT clients.
  return auth?.userId ?? (req as any).userId ?? null;
}
