import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/profile", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId));

  if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

  res.json(profile);
});

router.patch("/profile", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    name,
    phone,
    username,
    bio,
    companyName,
    contactPersonName,
    accountSubType,
    taxId,
    address,
    website,
  } = req.body as {
    name?: string;
    phone?: string | null;
    username?: string | null;
    bio?: string | null;
    companyName?: string | null;
    contactPersonName?: string | null;
    accountSubType?: string | null;
    taxId?: string | null;
    address?: string | null;
    website?: string | null;
  };

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "Invalid name" });
    return;
  }

  if (username !== undefined && username !== null) {
    const normalized = String(username).trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_.]{3,20}$/.test(normalized)) {
      res.status(400).json({
        error: "Username must be 3-20 characters using letters, numbers, dots or underscores",
      });
      return;
    }
    const taken = await db
      .select({ clerkId: userProfilesTable.clerkId })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.username, normalized))
      .then((r) => r[0]);
    if (taken && taken.clerkId !== userId) {
      res.status(409).json({ error: "That username is already taken" });
      return;
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch.name = name.trim();
  if (username !== undefined) {
    patch.username = username === null ? null : String(username).trim().toLowerCase().replace(/^@/, "");
  }
  if (phone !== undefined) patch.phone = phone?.trim() || null;
  if (bio !== undefined) patch.bio = bio?.trim() || null;
  if (companyName !== undefined) patch.companyName = companyName?.trim() || null;
  if (contactPersonName !== undefined) patch.contactPersonName = contactPersonName?.trim() || null;
  if (accountSubType !== undefined) patch.accountSubType = accountSubType?.trim() || null;
  if (taxId !== undefined) patch.taxId = taxId?.trim() || null;
  if (address !== undefined) patch.address = address?.trim() || null;
  if (website !== undefined) patch.website = website?.trim() || null;

  const [updated] = await db
    .update(userProfilesTable)
    .set(patch)
    .where(eq(userProfilesTable.clerkId, userId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Profile not found" }); return; }

  res.json(updated);
});

// ── Check username availability ───────────────────────────────────────────────
router.get("/profile/username-available", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = typeof req.query["username"] === "string" ? req.query["username"] : "";
  const normalized = raw.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_.]{3,20}$/.test(normalized)) {
    res.json({ available: false, valid: false });
    return;
  }
  const taken = await db
    .select({ clerkId: userProfilesTable.clerkId })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.username, normalized))
    .then((r) => r[0]);
  res.json({ available: !taken || taken.clerkId === userId, valid: true });
});

// ── Presence heartbeat: web client pings every 30s while active ───────────────
router.post("/presence/heartbeat", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  await db
    .update(userProfilesTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(userProfilesTable.clerkId, userId));
  res.json({ ok: true });
});

router.put("/profile/public-key", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { publicKey } = req.body as { publicKey?: unknown };
  if (typeof publicKey !== "string" || publicKey.trim().length === 0) {
    res.status(400).json({ error: "publicKey is required" });
    return;
  }
  await db
    .update(userProfilesTable)
    .set({ publicKey: publicKey.trim() })
    .where(eq(userProfilesTable.clerkId, userId));
  res.json({ ok: true });
});

export default router;
