import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { chatRoomsTable } from "./chat";

export const pollsTable = pgTable("polls", {
  id: serial("id").primaryKey(),
  chatRoomId: integer("chat_room_id")
    .notNull()
    .references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  creatorClerkId: text("creator_clerk_id").notNull(),
  question: text("question").notNull(),
  options: jsonb("options").notNull().$type<string[]>(),
  allowMultiple: boolean("allow_multiple").notNull().default(false),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pollVotesTable = pgTable("poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id")
    .notNull()
    .references(() => pollsTable.id, { onDelete: "cascade" }),
  optionIndex: integer("option_index").notNull(),
  clerkId: text("clerk_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Poll = typeof pollsTable.$inferSelect;
export type PollVote = typeof pollVotesTable.$inferSelect;
