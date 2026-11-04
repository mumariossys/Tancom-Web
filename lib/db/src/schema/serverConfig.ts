import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Key-value store for server-managed config (e.g. Twilio API key SID/secret).
export const serverConfigTable = pgTable("server_config", {
  id:        serial("id").primaryKey(),
  key:       text("key").notNull().unique(),
  value:     text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
