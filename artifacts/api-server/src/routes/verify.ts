import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, phoneOtpsTable, userProfilesTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

const router = Router();

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Send OTP ───────────────────────────────────────────────────────────────────
router.post("/verify/send-otp", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { phone } = req.body as { phone?: string };
  if (!phone || phone.trim().length < 6) {
    res.status(400).json({ error: "Valid phone number required" });
    return;
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db
    .update(phoneOtpsTable)
    .set({ used: true })
    .where(and(eq(phoneOtpsTable.clerkId, userId), eq(phoneOtpsTable.used, false)));

  await db.insert(phoneOtpsTable).values({
    clerkId: userId,
    phone: phone.trim(),
    code,
    expiresAt,
  });

  // NOTE: No SMS provider is configured yet (Twilio coming soon).
  // Return the code directly in the response so users can complete verification.
  console.log(`[TanCom OTP] Phone: ${phone.trim()} → Code: ${code}`);

  res.json({ sent: true, devCode: code });
});

// ── Verify OTP ─────────────────────────────────────────────────────────────────
router.post("/verify/verify-otp", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { phone, code } = req.body as { phone?: string; code?: string };
  if (!phone || !code) {
    res.status(400).json({ error: "Phone and code required" });
    return;
  }

  const now = new Date();
  const [otp] = await db
    .select()
    .from(phoneOtpsTable)
    .where(
      and(
        eq(phoneOtpsTable.clerkId, userId),
        eq(phoneOtpsTable.phone, phone.trim()),
        eq(phoneOtpsTable.code, code.trim()),
        eq(phoneOtpsTable.used, false),
        gt(phoneOtpsTable.expiresAt, now)
      )
    )
    .limit(1);

  if (!otp) {
    res.status(400).json({ error: "Invalid or expired code. Please try again." });
    return;
  }

  await db.update(phoneOtpsTable).set({ used: true }).where(eq(phoneOtpsTable.id, otp.id));

  res.json({ verified: true });
});

// ── Complete Onboarding ────────────────────────────────────────────────────────
router.post("/onboarding/complete", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    accountType,
    name,
    phone,
    companyName,
    contactPersonName,
    accountSubType,
    taxId,
    address,
    website,
  } = req.body as {
    accountType?: string;
    name?: string;
    phone?: string;
    companyName?: string;
    contactPersonName?: string;
    accountSubType?: string;
    taxId?: string;
    address?: string;
    website?: string;
  };

  const validTypes = ["individual", "business", "nonprofit"];
  if (!accountType || !validTypes.includes(accountType)) {
    res.status(400).json({ error: "Invalid account type" });
    return;
  }
  if (accountType !== "individual" && !companyName?.trim()) {
    res.status(400).json({ error: "Organization name is required" });
    return;
  }

  const [updated] = await db
    .update(userProfilesTable)
    .set({
      accountType,
      name: name?.trim() || undefined,
      phone: phone?.trim() || null,
      companyName: companyName?.trim() || null,
      contactPersonName: contactPersonName?.trim() || null,
      accountSubType: accountSubType?.trim() || null,
      taxId: taxId?.trim() || null,
      address: address?.trim() || null,
      website: website?.trim() || null,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    .where(eq(userProfilesTable.clerkId, userId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Profile not found" }); return; }

  res.json(updated);
});

export default router;
