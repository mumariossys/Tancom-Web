import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recordingsTable = pgTable("recordings", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  meetingTitle: text("meeting_title").notNull(),
  initiatedByClerkId: text("initiated_by_clerk_id").notNull(),
  status: text("status").notNull().default("recording"), // recording, processing, available, failed
  fileUrl: text("file_url"),
  egressId: text("egress_id"),
  fileSizeBytes: integer("file_size_bytes"),
  durationSeconds: integer("duration_seconds"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertRecordingSchema = createInsertSchema(recordingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type Recording = typeof recordingsTable.$inferSelect;
