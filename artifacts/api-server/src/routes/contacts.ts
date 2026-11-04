import { Router, type IRouter } from "express";
import { eq, and, isNull, inArray, ilike } from "drizzle-orm";
import { db, contactsTable, userProfilesTable } from "@workspace/db";
import {
  CreateContactBody,
  DeleteContactParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function toContactResponse(c: any) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/contacts", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const contacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.ownerClerkId, userId));

  // Live-resolve contactClerkId for contacts that don't have one yet
  // (the person may have signed up for TanCom after the contact was added)
  const needsLookup = contacts.filter((c) => !c.contactClerkId);
  if (needsLookup.length > 0) {
    const emails = needsLookup.map((c) => c.email).filter(Boolean) as string[];
    const emailsLower = emails.map((e) => e.toLowerCase());
    const tancomUsers = emailsLower.length > 0
      ? await db
          .select({ clerkId: userProfilesTable.clerkId, email: userProfilesTable.email })
          .from(userProfilesTable)
          .where(inArray(userProfilesTable.email, emailsLower))
      : [];
    const emailToClerkId = new Map(tancomUsers.map((u) => [u.email.toLowerCase(), u.clerkId]));
    for (const c of needsLookup) {
      const clerkId = c.email ? emailToClerkId.get(c.email.toLowerCase()) : undefined;
      if (clerkId) {
        (c as any).contactClerkId = clerkId;
        // Persist so next call is instant
        await db
          .update(contactsTable)
          .set({ contactClerkId: clerkId })
          .where(eq(contactsTable.id, c.id));
      }
    }
  }

  res.json(contacts.map(toContactResponse));
});

router.post("/contacts", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [contact] = await db
    .insert(contactsTable)
    .values({
      ownerClerkId: userId,
      contactClerkId: parsed.data.contactClerkId ?? null,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
    })
    .returning();

  res.status(201).json(toContactResponse(contact));
});

// ── Bulk import ────────────────────────────────────────────────────────────────
router.post("/contacts/import", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const body = req.body as { contacts?: unknown };

  if (!Array.isArray(body?.contacts) || body.contacts.length === 0) {
    res.status(400).json({ error: "No contacts provided" });
    return;
  }

  type ImportRow = { name: string; email?: string; phone?: string };
  const rows = (body.contacts as ImportRow[]).filter(
    (c) => typeof c.name === "string" && c.name.trim()
  );

  if (rows.length === 0) {
    res.status(400).json({ error: "No valid contacts found" });
    return;
  }

  // Skip contacts already in this user's list (match by email if present, else by name+phone)
  const existing = await db
    .select({ email: contactsTable.email, name: contactsTable.name, phone: contactsTable.phone })
    .from(contactsTable)
    .where(eq(contactsTable.ownerClerkId, userId));
  const existingEmails = new Set(
    existing.filter((c) => c.email).map((c) => c.email!.toLowerCase())
  );
  const existingNamePhone = new Set(
    existing
      .filter((c) => !c.email && c.phone)
      .map((c) => `${c.name.toLowerCase()}|${c.phone}`)
  );
  const newRows = rows.filter((c) => {
    if (c.email) return !existingEmails.has(c.email.toLowerCase());
    if (c.phone) return !existingNamePhone.has(`${c.name.toLowerCase()}|${c.phone}`);
    return true; // name-only: always attempt insert
  });

  const skipped = rows.length - newRows.length;
  if (newRows.length === 0) {
    res.json({ imported: 0, skipped, onTanCom: 0 });
    return;
  }

  // Resolve which emails are registered TanCom users
  const emailsToResolve = newRows.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[];
  const tancomUsers = emailsToResolve.length > 0
    ? await db
        .select({ clerkId: userProfilesTable.clerkId, email: userProfilesTable.email })
        .from(userProfilesTable)
        .where(inArray(userProfilesTable.email, emailsToResolve))
    : [];
  const emailToClerkId = new Map(tancomUsers.map((u) => [u.email.toLowerCase(), u.clerkId]));

  const values = newRows.map((c) => ({
    ownerClerkId: userId,
    contactClerkId: c.email ? (emailToClerkId.get(c.email.toLowerCase()) ?? null) : null,
    name: c.name.trim(),
    email: c.email?.trim() || null,
    phone: c.phone?.trim() || null,
  }));

  await db.insert(contactsTable).values(values);

  res.json({
    imported: values.length,
    skipped,
    onTanCom: values.filter((v) => v.contactClerkId).length,
  });
});

// ── Find TanCom users by exact email or by username (for starting new chats) ──
router.get("/users/search", requireAuth, async (req, res): Promise<void> => {
  const email = typeof req.query["email"] === "string" ? req.query["email"].trim().toLowerCase() : "";
  const username = typeof req.query["username"] === "string"
    ? req.query["username"].trim().toLowerCase().replace(/^@/, "")
    : "";

  if (email && email.includes("@")) {
    const profile = await db
      .select({
        clerkId: userProfilesTable.clerkId,
        name: userProfilesTable.name,
        email: userProfilesTable.email,
        username: userProfilesTable.username,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.email, email))
      .then((rows) => rows[0]);
    // Contract: always an array (empty when no match).
    res.json(profile ? [profile] : []);
    return;
  }

  if (username) {
    if (username.length < 2) { res.json([]); return; }
    const escaped = username.replace(/[%_\\]/g, (c) => `\\${c}`);
    const matches = await db
      .select({
        clerkId: userProfilesTable.clerkId,
        name: userProfilesTable.name,
        email: userProfilesTable.email,
        username: userProfilesTable.username,
      })
      .from(userProfilesTable)
      .where(ilike(userProfilesTable.username, `${escaped}%`))
      .limit(10);
    // exact match first
    matches.sort((a, b) => Number(b.username === username) - Number(a.username === username));
    res.json(matches);
    return;
  }

  res.status(400).json({ error: "email or username query param required" });
  return;
});

// ── Update a contact (edit fields + favorite/pin/block/mute toggles) ─────────
router.patch("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = req.body as Partial<{
    name: string; email: string; phone: string | null;
    isFavorite: boolean; isPinned: boolean; isBlocked: boolean; isMuted: boolean;
    category: string | null; labels: string[];
  }>;

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.email === "string" && body.email.includes("@")) updates.email = body.email.trim();
  if (body.phone === null || typeof body.phone === "string") updates.phone = body.phone?.trim() || null;
  for (const key of ["isFavorite", "isPinned", "isBlocked", "isMuted"] as const) {
    if (typeof body[key] === "boolean") updates[key] = body[key];
  }
  if (body.category !== undefined) {
    const allowed = ["family", "friend", "work", "client", "vendor"];
    if (body.category === null) {
      updates.category = null;
    } else if (typeof body.category === "string" && allowed.includes(body.category)) {
      updates.category = body.category;
    } else {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
  }
  if (body.labels !== undefined) {
    if (!Array.isArray(body.labels) || body.labels.some((l) => typeof l !== "string")) {
      res.status(400).json({ error: "labels must be an array of strings" });
      return;
    }
    const cleaned = Array.from(
      new Set(body.labels.map((l) => l.trim()).filter((l) => l.length > 0 && l.length <= 30))
    ).slice(0, 20);
    updates.labels = cleaned;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(contactsTable)
    .set(updates)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerClerkId, userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.json(toContactResponse(updated));
});

// ── Rich profile for a registered contact (photo/bio/about) ──────────────────
router.get("/contacts/:id/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const contact = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerClerkId, userId)))
    .then((r) => r[0]);
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  let profile = null;
  if (contact.contactClerkId) {
    profile = await db
      .select({
        name: userProfilesTable.name,
        email: userProfilesTable.email,
        username: userProfilesTable.username,
        bio: userProfilesTable.bio,
        lastLoginAt: userProfilesTable.lastLoginAt,
        lastSeenAt: userProfilesTable.lastSeenAt,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, contact.contactClerkId))
      .then((r) => r[0] ?? null);
  }

  const ONLINE_WINDOW_MS = 90_000;
  const online = !!(
    profile?.lastSeenAt && Date.now() - profile.lastSeenAt.getTime() < ONLINE_WINDOW_MS
  );
  res.json({ contact: toContactResponse(contact), profile, online });
});

router.delete("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteContactParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(contactsTable)
    .where(
      and(
        eq(contactsTable.id, params.data.id),
        eq(contactsTable.ownerClerkId, userId)
      )
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
