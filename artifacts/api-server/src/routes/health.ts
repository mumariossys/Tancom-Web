import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/debug-clerk", (_req, res) => {
  res.json({
    fixVersion: "clerkMiddleware-no-args-v2",
    env: {
      NODE_ENV: process.env.NODE_ENV,
      hasPublishableKey: !!process.env.CLERK_PUBLISHABLE_KEY,
      hasSecretKey: !!process.env.CLERK_SECRET_KEY,
      hasClerkProxyUrl: !!process.env.CLERK_PROXY_URL,
      publishableKeyPrefix: process.env.CLERK_PUBLISHABLE_KEY?.slice(0, 12) ?? "not set",
    },
  });
});

export default router;
