import { Router, type IRouter } from "express";
import { eq, desc, gte, lt, sql, and } from "drizzle-orm";
import { db, meetingsTable, recordingsTable, contactsTable, participantsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalMeetingsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(meetingsTable)
    .where(eq(meetingsTable.hostClerkId, userId));

  const [upcomingRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(meetingsTable)
    .where(
      and(
        eq(meetingsTable.hostClerkId, userId),
        eq(meetingsTable.status, "scheduled"),
        gte(meetingsTable.scheduledAt, now)
      )
    );

  const [recordingsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(recordingsTable)
    .where(eq(recordingsTable.initiatedByClerkId, userId));

  const [contactsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contactsTable)
    .where(eq(contactsTable.ownerClerkId, userId));

  const [monthRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(meetingsTable)
    .where(
      and(
        eq(meetingsTable.hostClerkId, userId),
        gte(meetingsTable.createdAt, startOfMonth)
      )
    );

  const minutesResult = await db
    .select({ total: sql<number>`coalesce(sum(duration), 0)` })
    .from(meetingsTable)
    .where(and(eq(meetingsTable.hostClerkId, userId), eq(meetingsTable.status, "ended")));

  res.json({
    totalMeetings: Number(totalMeetingsRow.count),
    upcomingMeetings: Number(upcomingRow.count),
    totalRecordings: Number(recordingsRow.count),
    totalContacts: Number(contactsRow.count),
    meetingsThisMonth: Number(monthRow.count),
    totalMeetingMinutes: Number(minutesResult[0]?.total ?? 0),
  });
});

router.get("/dashboard/upcoming-meetings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const now = new Date();

  const meetings = await db
    .select()
    .from(meetingsTable)
    .where(
      and(
        eq(meetingsTable.hostClerkId, userId),
        gte(meetingsTable.scheduledAt, now)
      )
    )
    .orderBy(meetingsTable.scheduledAt)
    .limit(5);

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

router.get("/dashboard/recent-activity", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const meetings = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.hostClerkId, userId))
    .orderBy(desc(meetingsTable.updatedAt))
    .limit(10);

  const activity = meetings.map((m, i) => {
    let type: string;
    let title: string;
    let description: string;

    if (m.status === "active") {
      type = "meeting_started";
      title = "Meeting started";
      description = `${m.title} is now active`;
    } else if (m.status === "ended") {
      type = "meeting_ended";
      title = "Meeting ended";
      description = `${m.title} ended${m.duration ? ` after ${m.duration} minutes` : ""}`;
    } else if (m.status === "scheduled") {
      type = "meeting_scheduled";
      title = "Meeting scheduled";
      description = `${m.title} scheduled`;
    } else {
      type = "meeting_scheduled";
      title = "Meeting updated";
      description = m.title;
    }

    return {
      id: m.id + i * 1000,
      type,
      title,
      description,
      meetingId: m.id,
      occurredAt: m.updatedAt.toISOString(),
    };
  });

  res.json(activity);
});

export default router;
