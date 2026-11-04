import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const NOTE_TYPES = ["note", "action", "decision", "highlight"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const meetingNotesTable = pgTable("meeting_notes", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull(),
  authorClerkId: text("author_clerk_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  noteType: text("note_type").notNull().default("note"), // note | action | decision | highlight
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertMeetingNoteSchema = createInsertSchema(meetingNotesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMeetingNote = z.infer<typeof insertMeetingNoteSchema>;
export type MeetingNote = typeof meetingNotesTable.$inferSelect;

export const meetingSummariesTable = pgTable("meeting_summaries", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().unique(),
  summary: text("summary").notNull(),
  keyPoints: text("key_points").notNull().default("[]"),    // JSON array
  actionItems: text("action_items").notNull().default("[]"), // JSON array
  decisions: text("decisions").notNull().default("[]"),      // JSON array
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMeetingSummarySchema = createInsertSchema(meetingSummariesTable).omit({
  id: true,
  generatedAt: true,
});
export type InsertMeetingSummary = z.infer<typeof insertMeetingSummarySchema>;
export type MeetingSummary = typeof meetingSummariesTable.$inferSelect;
