import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

/* Trust the Replit reverse proxy so express-rate-limit reads the real client IP */
app.set("trust proxy", 1);

/* Disable ETag generation for all API responses.
 * Express generates weak ETags by default; React Native's Android networking
 * stack (OkHttp) caches them and sends If-None-Match on repeat polls, causing
 * the server to reply 304 Not Modified with an empty body. The mobile
 * apiFetch treats any non-2xx as fatal, so the second poll of e.g.
 * /remote/rc-state or /meetings/:id/participants crashed the app ~3-4s after
 * joining a room ("Something went wrong"). JSON API responses are dynamic and
 * gain nothing from ETag revalidation — disable it outright. */
app.set("etag", false);

/* ── Security headers (helmet) ──────────────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

/* ── Rate limiting ──────────────────────────────────────────────────────────── */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.path.startsWith(CLERK_PROXY_PATH),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

app.use(globalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/sessions", authLimiter);

/* ── CORS ───────────────────────────────────────────────────────────────────── */
const allowedOrigins = (() => {
  const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()) ?? [];
  const extras = ["https://tancom.us", "http://localhost:18996", "http://localhost:5173"];
  return [...domains.map((d) => `https://${d}`), ...extras];
})();

app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("Origin not allowed by CORS"));
      }
    },
  }),
);

/* ── Logging ────────────────────────────────────────────────────────────────── */
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

/* ── Clerk proxy & middleware ───────────────────────────────────────────────── */
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// acceptsToken: "session_token" is required for Bearer JWT auth from mobile
// apps. Without it, clerkMiddleware() only accepts cookie-based browser
// sessions and returns signed-out for every Authorization: Bearer request.
// clockSkewInMs: 60000 tolerates up to 60 s of clock drift between the
// Android device and server.
// proxyUrl: only set when CLERK_PROXY_URL env var is explicitly configured
// AND the secret key is LIVE. Dev/test Clerk instances (e.g.
// grand-mudfish-37.clerk.accounts.dev) have no custom domain — JWTs carry
// iss="https://grand-mudfish-37.clerk.accounts.dev" and the SDK resolves
// JWKS from that domain directly, no proxy needed. Ignoring a stray
// CLERK_PROXY_URL when the key is test keeps this a guaranteed no-op during
// the test-only phase even if a deployment-level env var is left over.
const isLiveSecretKey = (process.env.CLERK_SECRET_KEY ?? "").startsWith("sk_live_");
app.use(
  clerkMiddleware({
    acceptsToken: "session_token",
    clockSkewInMs: 60000,
    ...(isLiveSecretKey && process.env.CLERK_PROXY_URL
      ? { proxyUrl: process.env.CLERK_PROXY_URL }
      : {}),
  }),
);

/* ── Routes ─────────────────────────────────────────────────────────────────── */
// The Replit deployment platform probes GET /api (the service's base path) as
// a runtime health check. Without an explicit handler here, the Clerk middleware
// fires on first request during startup (async JWKS init can throw) and Express
// falls through to the global error handler → 500. The platform then treats the
// server as unhealthy and issues a SIGTERM, creating a restart loop every ~10–15
// minutes. This explicit 200 response short-circuits all middleware and fixes
// the probe — the full /api/healthz route is still the authoritative check.
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", router);

/* ── Global error handler ───────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  if (!res.headersSent) {
    if (err instanceof Error && err.message === "Origin not allowed by CORS") {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
