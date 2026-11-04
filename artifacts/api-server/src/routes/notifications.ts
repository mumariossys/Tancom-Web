import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

// ── List notifications ─────────────────────────────────────────────────────────
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.clerkId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  res.json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      relatedId: n.relatedId ?? null,
      relatedType: n.relatedType ?? null,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    }))
  );
});

// ── Unread count ───────────────────────────────────────────────────────────────
router.get("/notifications/unread-count", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.clerkId, userId), eq(notificationsTable.read, false)));
  res.json({ count: Number(result[0]?.count ?? 0) });
});

// ── Mark one read ──────────────────────────────────────────────────────────────
router.post("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(paramStr(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.clerkId, userId)));
  res.json({ ok: true });
});

// ── Mark all read ──────────────────────────────────────────────────────────────
router.post("/notifications/mark-all-read", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.clerkId, userId));
  res.json({ ok: true });
});

export default router;
