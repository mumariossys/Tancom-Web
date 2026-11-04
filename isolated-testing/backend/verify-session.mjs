import { CLERK_ISSUER } from "./safety.mjs";

export async function verifySession(token, { jwtVerify, jwks, origin }) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: CLERK_ISSUER, algorithms: ["RS256"], clockTolerance: 5,
    requiredClaims: ["sub", "exp", "iat"],
  });
  if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_") ||
      typeof payload.sid !== "string" ||
      (payload.azp !== undefined && payload.azp !== origin &&
       payload.azp !== CLERK_ISSUER)) throw new Error("Not an approved session token.");
  return payload;
}
