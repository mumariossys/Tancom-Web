import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

export const userSessionsTable = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull(),
  loginAt: timestamp("login_at", { withTimezone: true }).notNull().defaultNow(),
  logoutAt: timestamp("logout_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
});

export type UserSession = typeof userSessionsTable.$inferSelect;
