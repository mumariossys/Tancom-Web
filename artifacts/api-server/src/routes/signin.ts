import { Router } from "express";
import { clerkClient } from "@clerk/express";

const router = Router();

const CLERK_API_URL = (process.env.CLERK_API_URL ?? "https://api.clerk.com").replace(/\/$/, "");

async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  try {
    const resp = await fetch(`${CLERK_API_URL}/v1/users/${userId}/verify_password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { verified?: boolean };
    return data.verified === true;
  } catch {
    return false;
  }
}

async function createSignInTicket(
  userId: string,
  log: { error: (obj: object, msg: string) => void }
): Promise<string | null> {
  try {
    const resp = await fetch(`${CLERK_API_URL}/v1/sign_in_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 120 }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      log.error({ userId, status: resp.status, body }, "signin: Clerk sign_in_tokens error");
      return null;
    }
    const data = (await resp.json()) as { token?: string };
    return data.token ?? null;
  } catch (err) {
    log.error({ userId, err }, "signin: sign_in_tokens network error");
    return null;
  }
}

// Server-side sign-in: verifies password via Clerk Backend API, then issues a
// single-use sign-in ticket. This bypasses the Clerk instance's mandatory email
// OTP second factor, which fires for all client-side password sign-ins.
router.post("/auth/signin", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const result = await clerkClient.users.getUserList({
      emailAddress: [email.trim().toLowerCase()],
      limit: 1,
    });

    const user = result.data[0];
    if (!user) {
      // Intentionally vague to avoid user enumeration
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const valid = await verifyUserPassword(user.id, password);
    if (!valid) {
      // If the account has no password set but is linked to a social provider,
      // password sign-in can never succeed — guide the user to the right method
      // instead of the misleading "Invalid email or password".
      const externalProviders = (user.externalAccounts ?? []).map((a) => a.provider);
      const usesGoogle = externalProviders.some((p) => p.includes("google"));
      if (!user.passwordEnabled && externalProviders.length > 0) {
        req.log.info(
          { userId: user.id, externalProviders },
          "signin: account has no password, social-only"
        );
        res.status(409).json({
          error: usesGoogle
            ? 'This account was created with Google. Please tap "Continue with Google" to sign in.'
            : "This account uses social sign-in. Please sign in with your social provider.",
        });
        return;
      }
      req.log.info({ userId: user.id }, "signin: invalid password");
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const ticket = await createSignInTicket(user.id, req.log);
    if (!ticket) {
      req.log.error({ userId: user.id }, "signin: failed to generate ticket");
      res.status(500).json({ error: "Sign in failed. Please try again." });
      return;
    }

    req.log.info({ userId: user.id }, "signin: ticket generated");
    res.json({ ok: true, ticket });
  } catch (err: any) {
    req.log.error({ err }, "signin: unexpected error");
    res.status(500).json({ error: "Sign in failed. Please try again." });
  }
});

export default router;
