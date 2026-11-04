import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { groupsTable } from "./groups";

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  meetingCode: text("meeting_code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  hostClerkId: text("host_clerk_id").notNull(),
  hostName: text("host_name").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled, active, ended, cancelled
  type: text("type").notNull().default("instant"), // instant, scheduled, recurring
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  duration: integer("duration"), // actual duration in minutes (set when meeting ends)
  plannedDuration: integer("planned_duration"), // planned duration in minutes (set at creation)
  timezone: text("timezone").notNull().default("UTC"),
  passcode: text("passcode"),
  isPasswordProtected: boolean("is_password_protected").notNull().default(false),
  waitingRoomEnabled: boolean("waiting_room_enabled").notNull().default(false),
  isLocked: boolean("is_locked").notNull().default(false),
  maxParticipants: integer("max_participants"),
  allowScreenShare: boolean("allow_screen_share").notNull().default(true),
  allowChat: boolean("allow_chat").notNull().default(true),
  muteOnEntry: boolean("mute_on_entry").notNull().default(false),
  videoOffOnEntry: boolean("video_off_on_entry").notNull().default(false),
  // Optional link to a TanCom group — when set, group members are auto-invited
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "set null" }),
  // Recurrence fields
  recurrencePattern: text("recurrence_pattern"), // daily, weekly, monthly
  recurrenceInterval: integer("recurrence_interval").default(1), // every N days/weeks/months
  recurrenceDays: text("recurrence_days"), // JSON array of weekday numbers for weekly recurrence e.g. "[1,3,5]"
  recurrenceEndDate: timestamp("recurrence_end_date", { withTimezone: true }),
  recurrenceCount: integer("recurrence_count"), // max occurrences
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;
