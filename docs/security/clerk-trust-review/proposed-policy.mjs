// REVIEW-ONLY reference policy. Not imported by any application.
// Callers inject jwtVerify and a pinned key resolver; no network or env access.
// Real audience/azp inventories and approval are required before integration.
export async function verifyProposedSession(token, { policies, jwtVerify, resolvePinnedKeys }) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const { iss } = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  // No normalization, suffix matching, request Host, or token-derived URL.
  const policy = typeof iss === "string" ? policies.get(iss) : undefined;
  if (!policy) throw new Error("Untrusted issuer");
  const { payload } = await jwtVerify(token, await resolvePinnedKeys(policy.jwksUrl), {
    issuer: iss,
    algorithms: ["RS256"],
    clockTolerance: 60,
    requiredClaims: ["iss", "sub", "exp", "iat", "sid"],
  });
  if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_") ||
      typeof payload.sid !== "string" || !payload.sid.startsWith("sess_")) {
    throw new Error("Not a session principal");
  }
  if (payload.iat > Math.floor(Date.now() / 1000) + 60) {
    throw new Error("Issued in the future");
  }
  // Absence is explicitly allowed for legacy native sessions. A present claim
  // must match a per-issuer approved origin; Origin headers cannot grant trust.
  if (payload.azp === undefined ? !policy.allowMissingAzp :
    typeof payload.azp !== "string" || !policy.authorizedParties.includes(payload.azp)) {
    throw new Error("Unapproved authorized party");
  }
  // No invented production audience: callers must supply an audited list.
  // This illustrates legacy-optional audiences, not globally mandatory aud.
  if (payload.aud === undefined) {
    if (!policy.allowMissingAudience) throw new Error("Missing audience");
  } else {
    const aud = typeof payload.aud === "string" ? [payload.aud] : payload.aud;
    if (!Array.isArray(aud) || !aud.length || !aud.every(a => typeof a === "string") ||
        !aud.some(a => policy.audiences.includes(a))) throw new Error("Wrong audience");
  }
  return payload;
}
