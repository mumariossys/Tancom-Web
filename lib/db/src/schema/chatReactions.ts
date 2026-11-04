import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { chatMessagesTable } from "./chat";

export const chatReactionsTable = pgTable(
  "chat_reactions",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => chatMessagesTable.id, { onDelete: "cascade" }),
    clerkId: text("clerk_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique().on(t.messageId, t.clerkId, t.emoji),
  })
);

export type ChatReaction = typeof chatReactionsTable.$inferSelect;
