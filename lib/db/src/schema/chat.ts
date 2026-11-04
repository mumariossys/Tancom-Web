import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { groupsTable } from "./groups";

export const chatRoomTypeEnum = pgEnum("chat_room_type", ["direct", "group"]);

export const chatRoomsTable = pgTable("chat_rooms", {
  id: serial("id").primaryKey(),
  type: chatRoomTypeEnum("type").notNull(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "cascade" }),
  communityId: integer("community_id"),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatParticipantsTable = pgTable("chat_participants", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id")
    .notNull()
    .references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id").notNull(),
  archived: boolean("archived").notNull().default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id")
    .notNull()
    .references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  senderClerkId: text("sender_clerk_id").notNull(),
  content: text("content"),
  messageType: text("message_type").notNull().default("text"),
  pollId: integer("poll_id"),
  pinned: boolean("pinned").notNull().default(false),
  fileObjectPath: text("file_object_path"),
  fileName: text("file_name"),
  fileMimeType: text("file_mime_type"),
  fileSizeBytes: integer("file_size_bytes"),
  replyToId: integer("reply_to_id"),
  replyToContent: text("reply_to_content"),
  replyToSenderName: text("reply_to_sender_name"),
  encryptedIv: text("encrypted_iv"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatConversationKeysTable = pgTable("chat_conversation_keys", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id")
    .notNull()
    .references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  iv: text("iv").notNull(),
  ephemeralPublicKey: text("ephemeral_public_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatRoom = typeof chatRoomsTable.$inferSelect;
export type ChatParticipant = typeof chatParticipantsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type ChatConversationKey = typeof chatConversationKeysTable.$inferSelect;
