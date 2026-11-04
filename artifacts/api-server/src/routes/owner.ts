import { Router, type IRouter } from "express";
import { eq, desc, sql, gte, count, asc } from "drizzle-orm";
import {
  db,
  meetingsTable,
  userProfilesTable,
  userSessionsTable,
  recordingsTable,
  meetingNotesTable,
  meetingSummariesTable,
  featureTogglesTable,
  liveStreamsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

async function isProductOwner(clerkId: string): Promise<boolean> {
  const [profile] = await db
    .select({ role: userProfilesTable.role })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, clerkId));
  return profile?.role === "product_owner";
}

async function requireProductOwner(req: any, res: any, next: any): Promise<void> {
  const userId = req.userId as string;
  if (!(await isProductOwner(userId))) {
    res.status(403).json({ error: "Product Owner access required" });
    return;
  }
  next();
}

const DEFAULT_TOGGLES = [
  { key: "meetings_module", label: "Meetings Module", description: "Core meeting creation and management", category: "modules", enabled: true },
  { key: "meeting_notes", label: "Meeting Notes", description: "In-meeting note taking and export", category: "modules", enabled: true },
  { key: "voice_dictation", label: "Voice Dictation", description: "Speech-to-text input for notes", category: "ai", enabled: true },
  { key: "ai_summarization", label: "AI Summarization", description: "GPT-powered meeting summary generation", category: "ai", enabled: true },
  { key: "live_streaming", label: "Live Streaming Module", description: "Live marketing and streaming features", category: "modules", enabled: true },
  { key: "chat_module", label: "Chat Module", description: "Real-time messaging and group chat", category: "modules", enabled: true },
  { key: "recordings", label: "Recordings", description: "Meeting recording and playback", category: "modules", enabled: true },
  { key: "communities", label: "Communities", description: "Community and group management", category: "modules", enabled: true },
  { key: "contact_management", label: "Contact Management", description: "Contacts and address book", category: "modules", enabled: true },
  { key: "admin_panel", label: "Admin Panel", description: "Admin user management interface", category: "system", enabled: true },
];

// Seed default toggles if not present
async function seedToggles() {
  for (const t of DEFAULT_TOGGLES) {
    const existing = await db
      .select({ id: featureTogglesTable.id })
      .from(featureTogglesTable)
      .where(eq(featureTogglesTable.key, t.key))
      .limit(1);
    if (!existing[0]) {
      await db.insert(featureTogglesTable).values(t);
    }
  }
}

// GET /api/owner/overview
router.get("/owner/overview", requireAuth, requireProductOwner, async (req, res): Promise<void> => {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const [
    [totalUsersRow],
    [activeUsersRow],
    [newTodayRow],
    [newMonthRow],
    [totalMeetingsRow],
    [activeMeetingsRow],
    [endedMeetingsRow],
    [totalNotesRow],
    [totalSummariesRow],
    [totalRecordingsRow],
    [totalSessionsTodayRow],
    [sessionsWeekRow],
    [liveStreamsRow],
    roleDist,
    meetingsByDay,
    usersByDay,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(userProfilesTable),
    db.select({ count: sql<number>`count(*)` }).from(userProfilesTable).where(eq(userProfilesTable.isActive, true)),
    db.select({ count: sql<number>`count(*)` }).from(userProfilesTable).where(gte(userProfilesTable.createdAt, today)),
    db.select({ count: sql<number>`count(*)` }).from(userProfilesTable).where(gte(userProfilesTable.createdAt, thisMonth)),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(eq(meetingsTable.status, "active")),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(eq(meetingsTable.status, "ended")),
    db.select({ count: sql<number>`count(*)` }).from(meetingNotesTable),
    db.select({ count: sql<number>`count(*)` }).from(meetingSummariesTable),
    db.select({ count: sql<number>`count(*)` }).from(recordingsTable),
    db.select({ count: sql<number>`count(*)` }).from(userSessionsTable).where(gte(userSessionsTable.loginAt, today)),
    db.select({ count: sql<number>`count(*)` }).from(userSessionsTable).where(gte(userSessionsTable.loginAt, sevenDaysAgo)),
    db.select({ count: sql<number>`count(*)` }).from(liveStreamsTable),
    db.select({ role: userProfilesTable.role, count: sql<number>`count(*)` }).from(userProfilesTable).groupBy(userProfilesTable.role),
    db.select({ date: sql<string>`date_trunc('day', created_at)::text`, count: sql<number>`count(*)` })
      .from(meetingsTable).where(gte(meetingsTable.createdAt, thirtyDaysAgo))
      .groupBy(sql`date_trunc('day', created_at)`).orderBy(sql`date_trunc('day', created_at)`),
    db.select({ date: sql<string>`date_trunc('day', created_at)::text`, count: sql<number>`count(*)` })
      .from(userProfilesTable).where(gte(userProfilesTable.createdAt, thirtyDaysAgo))
      .groupBy(sql`date_trunc('day', created_at)`).orderBy(sql`date_trunc('day', created_at)`),
  ]);

  res.json({
    users: {
      total: Number(totalUsersRow.count),
      active: Number(activeUsersRow.count),
      newToday: Number(newTodayRow.count),
      newThisMonth: Number(newMonthRow.count),
      roleDist: roleDist.map(r => ({ role: r.role, count: Number(r.count) })),
      byDay: usersByDay.map(r => ({ date: r.date, count: Number(r.count) })),
    },
    meetings: {
      total: Number(totalMeetingsRow.count),
      active: Number(activeMeetingsRow.count),
      ended: Number(endedMeetingsRow.count),
      byDay: meetingsByDay.map(r => ({ date: r.date, count: Number(r.count) })),
    },
    notes: {
      total: Number(totalNotesRow.count),
      summariesGenerated: Number(totalSummariesRow.count),
    },
    recordings: { total: Number(totalRecordingsRow.count) },
    liveStreams: { total: Number(liveStreamsRow.count) },
    sessions: {
      today: Number(totalSessionsTodayRow.count),
      thisWeek: Number(sessionsWeekRow.count),
    },
    systemHealth: {
      status: "healthy",
      uptime: process.uptime(),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      memoryTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  });
});

// GET /api/owner/users
router.get("/owner/users", requireAuth, requireProductOwner, async (req, res): Promise<void> => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const users = await db
    .select({
      clerkId: userProfilesTable.clerkId,
      name: userProfilesTable.name,
      email: userProfilesTable.email,
      role: userProfilesTable.role,
      isActive: userProfilesTable.isActive,
      createdAt: userProfilesTable.createdAt,
      lastLoginAt: userProfilesTable.lastLoginAt,
    })
    .from(userProfilesTable)
    .orderBy(desc(userProfilesTable.createdAt))
    .limit(100);

  const meetingCounts = await db
    .select({ clerkId: meetingsTable.hostClerkId, count: sql<number>`count(*)` })
    .from(meetingsTable)
    .groupBy(meetingsTable.hostClerkId);

  const noteCounts = await db
    .select({ clerkId: meetingNotesTable.authorClerkId, count: sql<number>`count(*)` })
    .from(meetingNotesTable)
    .groupBy(meetingNotesTable.authorClerkId);

  const sessionCounts = await db
    .select({ clerkId: userSessionsTable.clerkId, count: sql<number>`count(*)` })
    .from(userSessionsTable)
    .where(gte(userSessionsTable.loginAt, thirtyDaysAgo))
    .groupBy(userSessionsTable.clerkId);

  const mcMap = new Map(meetingCounts.map(r => [r.clerkId, Number(r.count)]));
  const ncMap = new Map(noteCounts.map(r => [r.clerkId, Number(r.count)]));
  const scMap = new Map(sessionCounts.map(r => [r.clerkId, Number(r.count)]));

  res.json(users.map(u => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    meetingCount: mcMap.get(u.clerkId) ?? 0,
    noteCount: ncMap.get(u.clerkId) ?? 0,
    loginCount30d: scMap.get(u.clerkId) ?? 0,
  })));
});

// GET /api/owner/feature-toggles
router.get("/owner/feature-toggles", requireAuth, requireProductOwner, async (req, res): Promise<void> => {
  await seedToggles();
  const toggles = await db.select().from(featureTogglesTable).orderBy(asc(featureTogglesTable.category), asc(featureTogglesTable.label));
  res.json(toggles);
});

// PATCH /api/owner/feature-toggles/:key
router.patch("/owner/feature-toggles/:key", requireAuth, requireProductOwner, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const key = String(req.params.key);
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) required" }); return;
  }
  const [updated] = await db
    .update(featureTogglesTable)
    .set({ enabled, updatedAt: new Date(), updatedBy: userId })
    .where(eq(featureTogglesTable.key, key))
    .returning();
  if (!updated) { res.status(404).json({ error: "Toggle not found" }); return; }
  res.json(updated);
});

// GET /api/owner/security-logs
router.get("/owner/security-logs", requireAuth, requireProductOwner, async (req, res): Promise<void> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const recentSessions = await db
    .select({
      id: userSessionsTable.id,
      clerkId: userSessionsTable.clerkId,
      name: userProfilesTable.name,
      email: userProfilesTable.email,
      role: userProfilesTable.role,
      loginAt: userSessionsTable.loginAt,
      durationSeconds: userSessionsTable.durationSeconds,
    })
    .from(userSessionsTable)
    .leftJoin(userProfilesTable, eq(userSessionsTable.clerkId, userProfilesTable.clerkId))
    .where(gte(userSessionsTable.loginAt, sevenDaysAgo))
    .orderBy(desc(userSessionsTable.loginAt))
    .limit(200);

  const [loginsByDay] = await Promise.all([
    db.select({
      date: sql<string>`date_trunc('day', login_at)::text`,
      count: sql<number>`count(*)`,
    })
      .from(userSessionsTable)
      .where(gte(userSessionsTable.loginAt, sevenDaysAgo))
      .groupBy(sql`date_trunc('day', login_at)`)
      .orderBy(sql`date_trunc('day', login_at)`),
  ]);

  res.json({
    recentLogins: recentSessions.map(s => ({
      id: s.id,
      clerkId: s.clerkId,
      name: s.name ?? "Unknown",
      email: s.email ?? "Unknown",
      role: s.role ?? "user",
      loginAt: s.loginAt.toISOString(),
      durationMinutes: s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
    })),
    loginsByDay: loginsByDay.map(r => ({ date: r.date, count: Number(r.count) })),
  });
});

// GET /api/owner/ai-usage
router.get("/owner/ai-usage", requireAuth, requireProductOwner, async (req, res): Promise<void> => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [
    [totalNotesRow],
    [totalSummariesRow],
    [notesMonthRow],
    [summariesMonthRow],
    notesByDay,
    summariesByDay,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(meetingNotesTable),
    db.select({ count: sql<number>`count(*)` }).from(meetingSummariesTable),
    db.select({ count: sql<number>`count(*)` }).from(meetingNotesTable).where(gte(meetingNotesTable.createdAt, thirtyDaysAgo)),
    db.select({ count: sql<number>`count(*)` }).from(meetingSummariesTable).where(gte(meetingSummariesTable.generatedAt, thirtyDaysAgo)),
    db.select({ date: sql<string>`date_trunc('day', created_at)::text`, count: sql<number>`count(*)` })
      .from(meetingNotesTable).where(gte(meetingNotesTable.createdAt, thirtyDaysAgo))
      .groupBy(sql`date_trunc('day', created_at)`).orderBy(sql`date_trunc('day', created_at)`),
    db.select({ date: sql<string>`date_trunc('day', generated_at)::text`, count: sql<number>`count(*)` })
      .from(meetingSummariesTable).where(gte(meetingSummariesTable.generatedAt, thirtyDaysAgo))
      .groupBy(sql`date_trunc('day', generated_at)`).orderBy(sql`date_trunc('day', generated_at)`),
  ]);

  const noteTypeBreakdown = await db
    .select({ noteType: meetingNotesTable.noteType, count: sql<number>`count(*)` })
    .from(meetingNotesTable)
    .groupBy(meetingNotesTable.noteType);

  res.json({
    totalNotes: Number(totalNotesRow.count),
    totalSummaries: Number(totalSummariesRow.count),
    notesThisMonth: Number(notesMonthRow.count),
    summariesThisMonth: Number(summariesMonthRow.count),
    noteTypeBreakdown: noteTypeBreakdown.map(r => ({ type: r.noteType, count: Number(r.count) })),
    notesByDay: notesByDay.map(r => ({ date: r.date, count: Number(r.count) })),
    summariesByDay: summariesByDay.map(r => ({ date: r.date, count: Number(r.count) })),
  });
});

export default router;
