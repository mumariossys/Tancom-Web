import { Router } from "express";
import { clerkClient } from "@clerk/express";

const router = Router();

// Clerk BAPI base URL — falls back to api.clerk.com if not explicitly set.
const CLERK_API_URL = (process.env.CLERK_API_URL ?? "https://api.clerk.com").replace(/\/$/, "");

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
      log.error({ userId, status: resp.status, body }, "register: Clerk sign_in_tokens error");
      return null;
    }
    const data = (await resp.json()) as { token?: string };
    return data.token ?? null;
  } catch (err) {
    log.error({ userId, err }, "register: sign_in_tokens network error");
    return null;
  }
}

router.post("/auth/register", async (req, res) => {
  const { firstName, lastName, email, password } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
  };

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  try {
    const user = await clerkClient.users.createUser({
      emailAddress: [email.trim().toLowerCase()],
      password,
      firstName: firstName?.trim() || undefined,
      lastName: lastName?.trim() || undefined,
    });

    req.log.info({ userId: user.id }, "register: user created");

    // Generate a single-use sign-in ticket so the mobile app can authenticate
    // immediately without a password round-trip (avoids strategy mismatch issues).
    const ticket = await createSignInTicket(user.id, req.log);
    req.log.info({ ticketOk: !!ticket }, "register: sign-in ticket generated");

    res.json({ ok: true, ticket: ticket ?? undefined });
  } catch (err: any) {
    req.log.error({ err }, "register: clerkClient.users.createUser failed");
    const clerkErrors = err?.errors ?? err?.clerkError?.errors;
    if (clerkErrors?.length) {
      const firstCode: string = clerkErrors[0]?.code ?? "";
      const msg: string =
        clerkErrors[0]?.longMessage ||
        clerkErrors[0]?.message ||
        "Registration failed.";

      // If the email already exists, check whether it's a Google-only account so
      // we can tell the client to show the "Continue with Google" button instead
      // of the generic "sign in instead" message.
      if (firstCode === "form_identifier_exists") {
        try {
          const existing = await clerkClient.users.getUserList({
            emailAddress: [email.trim().toLowerCase()],
            limit: 1,
          });
          const existingUser = existing.data[0];
          if (existingUser && !existingUser.passwordEnabled && existingUser.externalAccounts.length > 0) {
            const usesGoogle = existingUser.externalAccounts.some((a) =>
              a.provider.includes("google")
            );
            req.log.info(
              { userId: existingUser.id, usesGoogle },
              "register: email exists as social-only account"
            );
            res.status(409).json({
              error: usesGoogle
                ? 'This account was created with Google. Please tap "Continue with Google" to sign in.'
                : "This account uses social sign-in. Please use your social provider to sign in.",
              googleOnly: usesGoogle,
            });
            return;
          }
        } catch (lookupErr) {
          req.log.error({ lookupErr }, "register: user lookup failed after form_identifier_exists");
          // fall through to generic message below
        }
      }

      res.status(400).json({ error: msg });
    } else {
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  }
});

export default router;
