import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const phoneOtpsTable = pgTable("phone_otps", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PhoneOtp = typeof phoneOtpsTable.$inferSelect;
