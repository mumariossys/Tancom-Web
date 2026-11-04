import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Records every outbound Twilio phone call placed through TanCom.
 * Rows are created when the TwiML voice webhook fires, then updated
 * when Twilio POSTs the final call status to the action URL.
 */
export const callLogTable = pgTable("call_log", {
  id:              serial("id").primaryKey(),
  ownerClerkId:    text("owner_clerk_id").notNull(),      // Clerk user who placed the call
  contactId:       integer("contact_id"),                  // FK to contacts.id (nullable)
  phoneNumber:     text("phone_number").notNull(),         // E.164 number that was dialled
  callSid:         text("call_sid").notNull().unique(),    // Twilio parent call SID
  durationSeconds: integer("duration_seconds"),            // filled on completion
  status:          text("status").notNull().default("initiated"),
  // status values: initiated | ringing | in-progress | completed | busy | failed | no-answer | canceled
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CallLog = typeof callLogTable.$inferSelect;
