/**
 * meetingReaper — auto-closes meetings that have been inactive for too long.
 *
 * A meeting is considered inactive when:
 *   1. Its status is "active" (not already ended/cancelled).
 *   2. No participant is currently present (no one with status
 *      "waiting", "admitted", or "active").
 *   3. The most recent activity timestamp (last leftAt across all
 *      participants, or startedAt if nobody ever joined) is older
 *      than INACTIVE_TIMEOUT_MS.
 *
 * The sweep runs on a configurable interval; the caller is responsible
 * for scheduling it. All DB errors are caught and logged so a transient
 * failure never crashes the server.
 */

import { eq, and, inArray, desc } from "drizzle-orm";
import { db, meetingsTable, participantsTable } from "@workspace/db";
import { logger } from "./logger";

/** How long a meeting may sit empty before being auto-closed (25 minutes). */
const INACTIVE_TIMEOUT_MS = 25 * 60 * 1000;

export async function sweepInactiveMeetings(): Promise<void> {
  const cutoff = new Date(Date.now() - INACTIVE_TIMEOUT_MS);

  // Step 1: fetch all currently-active meetings.
  const activeMeetings = await db
    .select({
      id: meetingsTable.id,
      startedAt: meetingsTable.startedAt,
    })
    .from(meetingsTable)
    .where(eq(meetingsTable.status, "active"));

  if (activeMeetings.length === 0) return;

  for (const meeting of activeMeetings) {
    // Step 2: is anyone still in the meeting?
    const present = await db
      .select({ id: participantsTable.id })
      .from(participantsTable)
      .where(
        and(
          eq(participantsTable.meetingId, meeting.id),
          inArray(participantsTable.status, ["waiting", "admitted", "active"])
        )
      )
      .limit(1);

    if (present.length > 0) {
      // Someone is still in the room — leave this meeting alone.
      continue;
    }

    // Step 3: what was the last activity timestamp?
    // Use the most recent leftAt among departed participants; if nobody
    // ever joined, fall back to startedAt so newly-created-but-empty
    // meetings are eventually reaped too.
    const [lastLeft] = await db
      .select({ leftAt: participantsTable.leftAt })
      .from(participantsTable)
      .where(
        and(
          eq(participantsTable.meetingId, meeting.id),
          eq(participantsTable.status, "left")
        )
      )
      .orderBy(desc(participantsTable.leftAt))
      .limit(1);

    const lastActivity: Date | null = lastLeft?.leftAt ?? meeting.startedAt;

    if (!lastActivity || lastActivity > cutoff) {
      // Within the 25-minute grace window — skip.
      continue;
    }

    // Step 4: the meeting has been empty for > 25 minutes — close it.
    const now = new Date();
    const durationMs = meeting.startedAt
      ? now.getTime() - meeting.startedAt.getTime()
      : 0;
    const durationMinutes = Math.round(durationMs / 60_000);

    // Mark any lingering participant rows as left (safety net — should be
    // none at this point, but guards against status mismatches).
    await db
      .update(participantsTable)
      .set({ status: "left", leftAt: now })
      .where(
        and(
          eq(participantsTable.meetingId, meeting.id),
          inArray(participantsTable.status, ["waiting", "admitted", "active", "denied"])
        )
      );

    await db
      .update(meetingsTable)
      .set({ status: "ended", endedAt: now, duration: durationMinutes })
      .where(eq(meetingsTable.id, meeting.id));

    logger.info(
      {
        meetingId: meeting.id,
        lastActivity: lastActivity.toISOString(),
        durationMinutes,
        inactiveForMs: now.getTime() - lastActivity.getTime(),
      },
      "Meeting auto-closed after 25 minutes of inactivity"
    );
  }
}
