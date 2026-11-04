import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const participantsTable = pgTable("participants", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  clerkId: text("clerk_id"),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("participant"), // host, cohost, participant, guest
  status: text("status").notNull().default("waiting"), // waiting, admitted, active, left, removed, denied
  isMuted: boolean("is_muted").notNull().default(false),
  isVideoOff: boolean("is_video_off").notNull().default(false),
  isHandRaised: boolean("is_hand_raised").notNull().default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("participants_meeting_id_status_idx").on(t.meetingId, t.status),
]);

export const insertParticipantSchema = createInsertSchema(participantsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Participant = typeof participantsTable.$inferSelect;
