import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { groupsTable } from "./groups";

export const groupPostsTable = pgTable("group_posts", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  authorClerkId: text("author_clerk_id").notNull(),
  content: text("content").notNull().default(""),
  sharedFromPostId: integer("shared_from_post_id"),
  fileObjectPath: text("file_object_path"),
  fileName: text("file_name"),
  fileMimeType: text("file_mime_type"),
  fileSizeBytes: integer("file_size_bytes"),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const groupPostReactionsTable = pgTable("group_post_reactions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .notNull()
    .references(() => groupPostsTable.id, { onDelete: "cascade" }),
  reactorClerkId: text("reactor_clerk_id").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupPostRepliesTable = pgTable("group_post_replies", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .notNull()
    .references(() => groupPostsTable.id, { onDelete: "cascade" }),
  authorClerkId: text("author_clerk_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const groupPostViewsTable = pgTable("group_post_views", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .notNull()
    .references(() => groupPostsTable.id, { onDelete: "cascade" }),
  viewerClerkId: text("viewer_clerk_id").notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
});
