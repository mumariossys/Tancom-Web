export const CLERK_HOST = "clerk.account.tancom.us";
export const CLERK_ISSUER = `https://${CLERK_HOST}`;
export const MARKER = "tancom-isolated-auth-v1";

export function httpsOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash ||
      url.hostname === "tancom.us" || url.hostname.endsWith(".tancom.us") ||
      url.hostname === "tan-com-web.replit.app" ||
      url.hostname.endsWith(".invalid")) {
    throw new Error("A separate, configured HTTPS staging origin is required.");
  }
  return url.origin;
}

export function loadConfig(env) {
  if (env.TANCOM_ENVIRONMENT !== "isolated-auth-testing") {
    throw new Error("Explicit isolated-auth-testing environment required.");
  }
  if (!env.REPL_ID || env.REPL_ID !== env.STAGING_PROJECT_ID ||
      !env.STAGING_SOURCE_PROJECT_ID ||
      env.REPL_ID === env.STAGING_SOURCE_PROJECT_ID) {
    throw new Error("Run only in the approved separate staging Replit project.");
  }
  if (env.STAGING_CLERK_HOST !== CLERK_HOST) throw new Error("Wrong Clerk instance.");
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("The separate project's managed database is required.");
  const db = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(db.protocol)) throw new Error("PostgreSQL required.");
  if (!env.STAGING_DATABASE_NAME ||
      decodeURIComponent(db.pathname.slice(1)) !== env.STAGING_DATABASE_NAME) {
    throw new Error("Explicit staging database-name confirmation required.");
  }
  // These are not needed for token verification. Refuse an accidentally copied
  // live environment rather than silently using or stripping its credentials.
  const forbidden = [
    "CLERK_SECRET_KEY", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "TWILIO_AUTH_TOKEN",
    "TWILIO_ACCOUNT_SID", "AI_INTEGRATIONS_OPENAI_API_KEY",
    "DEFAULT_OBJECT_STORAGE_BUCKET_ID", "PRIVATE_OBJECT_DIR", "PUBLIC_OBJECT_SEARCH_PATHS",
    "SMTP_PASSWORD", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  ];
  if (forbidden.some(key => env[key])) throw new Error("Production/integration credentials must not be copied.");
  const testers = (env.STAGING_TESTER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!testers.length || testers.some(id => !/^user_[A-Za-z0-9]+$/.test(id))) {
    throw new Error("Explicit new-instance tester ID allowlist required.");
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port.");
  return {
    origin: httpsOrigin(env.STAGING_PUBLIC_ORIGIN),
    projectId: env.STAGING_PROJECT_ID,
    databaseUrl,
    databaseName: env.STAGING_DATABASE_NAME,
    testers: new Set(testers),
    port,
  };
}
