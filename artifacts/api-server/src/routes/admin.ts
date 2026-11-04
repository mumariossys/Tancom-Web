import { Router, type IRouter } from "express";
import { eq, desc, sql, gte, ilike, and, isNotNull } from "drizzle-orm";
import {
  db,
  meetingsTable,
  recordingsTable,
  userProfilesTable,
  userSessionsTable,
} from "@workspace/db";
import {
  AdminListUsersQueryParams,
  AdminListMeetingsQueryParams,
  AdminUpdateUserParams,
  AdminUpdateUserBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { isAdmin } from "../lib/permissions";

const router: IRouter = Router();

router.get("/admin/users", requireAuth, async (req, res): Promise<void> => {
  const params = AdminListUsersQueryParams.safeParse(req.query);
  const limit = (params.success && params.data.limit) ? params.data.limit : 50;
  const offset = (params.success && params.data.offset) ? params.data.offset : 0;
  const search = params.success ? params.data.search : undefined;

  let query = db.select().from(userProfilesTable).$dynamic();
  if (search) {
    query = query.where(ilike(userProfilesTable.name, `%${search}%`));
  }

  const users = await query.orderBy(desc(userProfilesTable.createdAt)).limit(limit).offset(offset);

  const withCounts = await Promise.all(
    users.map(async (u) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(meetingsTable)
        .where(eq(meetingsTable.hostClerkId, u.clerkId));
      return {
        clerkId: u.clerkId,
        email: u.email,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        meetingCount: Number(count),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      };
    })
  );

  res.json(withCounts);
});

router.patch("/admin/users/:userId", requireAuth, async (req, res): Promise<void> => {
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = AdminUpdateUserParams.safeParse({ userId: rawUserId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const parsed = AdminUpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, any> = {};
  if (parsed.data.role != null) updateData.role = parsed.data.role;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;

  const [updated] = await db
    .update(userProfilesTable)
    .set(updateData)
    .where(eq(userProfilesTable.clerkId, params.data.userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(meetingsTable)
    .where(eq(meetingsTable.hostClerkId, updated.clerkId));

  res.json({
    clerkId: updated.clerkId,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    isActive: updated.isActive,
    meetingCount: Number(count),
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.get("/admin/analytics", requireAuth, async (req, res): Promise<void> => {
  const [totalUsersRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userProfilesTable);

  const [activeUsersRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.isActive, true));

  const [totalMeetingsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(meetingsTable);

  const [activeMeetingsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(meetingsTable)
    .where(eq(meetingsTable.status, "active"));

  const [totalRecordingsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(recordingsTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  startOfWeek.setHours(0, 0, 0, 0);

  const [newUsersTodayRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userProfilesTable)
    .where(gte(userProfilesTable.createdAt, today));

  const [newUsersThisWeekRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userProfilesTable)
    .where(gte(userProfilesTable.createdAt, startOfWeek));

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const meetingsByDay = await db
    .select({
      date: sql<string>`date_trunc('day', created_at)::text`,
      count: sql<number>`count(*)`,
    })
    .from(meetingsTable)
    .where(gte(meetingsTable.createdAt, sevenDaysAgo))
    .groupBy(sql`date_trunc('day', created_at)`)
    .orderBy(sql`date_trunc('day', created_at)`);

  const registrationsByDay = await db
    .select({
      date: sql<string>`date_trunc('day', created_at)::text`,
      count: sql<number>`count(*)`,
    })
    .from(userProfilesTable)
    .where(gte(userProfilesTable.createdAt, sevenDaysAgo))
    .groupBy(sql`date_trunc('day', created_at)`)
    .orderBy(sql`date_trunc('day', created_at)`);

  res.json({
    totalUsers: Number(totalUsersRow.count),
    activeUsers: Number(activeUsersRow.count),
    totalMeetings: Number(totalMeetingsRow.count),
    activeMeetings: Number(activeMeetingsRow.count),
    totalRecordings: Number(totalRecordingsRow.count),
    storageUsedBytes: 0,
    newUsersToday: Number(newUsersTodayRow.count),
    newUsersThisWeek: Number(newUsersThisWeekRow.count),
    meetingsByDay: meetingsByDay.map((row) => ({
      date: row.date,
      count: Number(row.count),
    })),
    registrationsByDay: registrationsByDay.map((row) => ({
      date: row.date,
      count: Number(row.count),
    })),
  });
});

router.get("/admin/meetings", requireAuth, async (req, res): Promise<void> => {
  const params = AdminListMeetingsQueryParams.safeParse(req.query);
  const limit = (params.success && params.data.limit) ? params.data.limit : 50;
  const offset = (params.success && params.data.offset) ? params.data.offset : 0;

  const meetings = await db
    .select()
    .from(meetingsTable)
    .orderBy(desc(meetingsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const formatted = meetings.map((m) => ({
    ...m,
    scheduledAt: m.scheduledAt?.toISOString() ?? null,
    startedAt: m.startedAt?.toISOString() ?? null,
    endedAt: m.endedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    participantCount: 0,
    inviteLink: `${req.protocol}://${req.get("host")}/meetings/${m.meetingCode}/join`,
  }));

  res.json(formatted);
});

router.get("/admin/session-analytics", requireAuth, async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  startOfWeek.setHours(0, 0, 0, 0);

  const [todaySessions] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userSessionsTable)
    .where(gte(userSessionsTable.loginAt, today));

  // Avg session minutes today (only completed sessions)
  const [avgRow] = await db
    .select({ avg: sql<number>`coalesce(avg(duration_seconds), 0)` })
    .from(userSessionsTable)
    .where(
      and(
        gte(userSessionsTable.loginAt, today),
        isNotNull(userSessionsTable.durationSeconds)
      )
    );

  // Total login minutes today — use duration_seconds for completed sessions,
  // estimate ongoing sessions using NOW() - login_at
  const [todayMinutesRow] = await db
    .select({
      minutes: sql<number>`
        coalesce(sum(
          case
            when duration_seconds is not null then duration_seconds
            else extract(epoch from (now() - login_at))
          end
        ) / 60.0, 0)
      `,
    })
    .from(userSessionsTable)
    .where(gte(userSessionsTable.loginAt, today));

  const [weekMinutesRow] = await db
    .select({
      minutes: sql<number>`
        coalesce(sum(
          case
            when duration_seconds is not null then duration_seconds
            else extract(epoch from (now() - login_at))
          end
        ) / 60.0, 0)
      `,
    })
    .from(userSessionsTable)
    .where(gte(userSessionsTable.loginAt, startOfWeek));

  // Login minutes per day for last 14 days
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const loginMinutesByDay = await db
    .select({
      date: sql<string>`date_trunc('day', login_at)::text`,
      minutes: sql<number>`
        coalesce(sum(
          case
            when duration_seconds is not null then duration_seconds
            else extract(epoch from (now() - login_at))
          end
        ) / 60.0, 0)
      `,
      sessions: sql<number>`count(*)`,
    })
    .from(userSessionsTable)
    .where(gte(userSessionsTable.loginAt, fourteenDaysAgo))
    .groupBy(sql`date_trunc('day', login_at)`)
    .orderBy(sql`date_trunc('day', login_at)`);

  // Top users by login time this week
  const topUsers = await db
    .select({
      clerkId: userProfilesTable.clerkId,
      name: userProfilesTable.name,
      email: userProfilesTable.email,
      lastLoginAt: userProfilesTable.lastLoginAt,
      totalMinutesThisWeek: sql<number>`
        coalesce(sum(
          case
            when duration_seconds is not null then duration_seconds
            else extract(epoch from (now() - login_at))
          end
        ) / 60.0, 0)
      `,
      sessionCount: sql<number>`count(${userSessionsTable.id})`,
    })
    .from(userProfilesTable)
    .leftJoin(
      userSessionsTable,
      and(
        eq(userSessionsTable.clerkId, userProfilesTable.clerkId),
        gte(userSessionsTable.loginAt, startOfWeek)
      )
    )
    .groupBy(
      userProfilesTable.clerkId,
      userProfilesTable.name,
      userProfilesTable.email,
      userProfilesTable.lastLoginAt
    )
    .orderBy(sql`sum(
      case
        when duration_seconds is not null then duration_seconds
        else extract(epoch from (now() - login_at))
      end
    ) desc nulls last`)
    .limit(20);

  // Today's minutes per user (separate query)
  const todayByUser = await db
    .select({
      clerkId: userSessionsTable.clerkId,
      minutesToday: sql<number>`
        coalesce(sum(
          case
            when duration_seconds is not null then duration_seconds
            else extract(epoch from (now() - login_at))
          end
        ) / 60.0, 0)
      `,
    })
    .from(userSessionsTable)
    .where(gte(userSessionsTable.loginAt, today))
    .groupBy(userSessionsTable.clerkId);

  const todayMap = new Map(todayByUser.map((r) => [r.clerkId, Number(r.minutesToday)]));

  res.json({
    totalSessionsToday: Number(todaySessions.count),
    avgSessionMinutesToday: Number(avgRow.avg) / 60,
    totalLoginHoursToday: Number(todayMinutesRow.minutes) / 60,
    totalLoginHoursThisWeek: Number(weekMinutesRow.minutes) / 60,
    loginMinutesByDay: loginMinutesByDay.map((r) => ({
      date: r.date,
      minutes: Number(r.minutes),
      sessions: Number(r.sessions),
    })),
    topUsersByTime: topUsers.map((u) => ({
      clerkId: u.clerkId,
      name: u.name,
      email: u.email,
      totalMinutesToday: todayMap.get(u.clerkId) ?? 0,
      totalMinutesThisWeek: Number(u.totalMinutesThisWeek),
      sessionCount: Number(u.sessionCount),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
  });
});

export default router;
