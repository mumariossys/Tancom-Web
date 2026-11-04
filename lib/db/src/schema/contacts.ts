import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  ownerClerkId: text("owner_clerk_id").notNull(),
  contactClerkId: text("contact_clerk_id"),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  isPinned: boolean("is_pinned").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  isMuted: boolean("is_muted").notNull().default(false),
  category: text("category"), // "family" | "friend" | "work" | "client" | "vendor" | null
  labels: text("labels").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
