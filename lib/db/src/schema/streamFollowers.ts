import {
  pgTable,
  text,
  serial,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const streamFollowersTable = pgTable(
  "stream_followers",
  {
    id: serial("id").primaryKey(),
    followerClerkId: text("follower_clerk_id").notNull(),
    streamerClerkId: text("streamer_clerk_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.followerClerkId, table.streamerClerkId)],
);

export const insertStreamFollowerSchema = createInsertSchema(streamFollowersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStreamFollower = z.infer<typeof insertStreamFollowerSchema>;
export type StreamFollower = typeof streamFollowersTable.$inferSelect;
