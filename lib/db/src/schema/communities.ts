import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const communityMemberRoleEnum = pgEnum("community_member_role", [
  "owner",
  "admin",
  "member",
]);

export const communityChannelTypeEnum = pgEnum("community_channel_type", [
  "text",
  "voice",
  "announcement",
]);

export const eventRsvpStatusEnum = pgEnum("event_rsvp_status", [
  "attending",
  "maybe",
  "not_attending",
]);

export const communitiesTable = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  iconUrl: text("icon_url"),
  ownerId: text("owner_id").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityMembersTable = pgTable("community_members", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id")
    .notNull()
    .references(() => communitiesTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id").notNull(),
  role: communityMemberRoleEnum("role").notNull().default("member"),
  customTags: text("custom_tags").array().notNull().default(sql`'{}'::text[]`),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityChannelsTable = pgTable("community_channels", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id")
    .notNull()
    .references(() => communitiesTable.id, { onDelete: "cascade" }),
  chatRoomId: integer("chat_room_id"),
  name: text("name").notNull(),
  type: communityChannelTypeEnum("type").notNull().default("text"),
  description: text("description"),
  position: integer("position").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityEventsTable = pgTable("community_events", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id")
    .notNull()
    .references(() => communitiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityEventRsvpsTable = pgTable("community_event_rsvps", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => communityEventsTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id").notNull(),
  status: eventRsvpStatusEnum("status").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityGroupsTable = pgTable("community_groups", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id")
    .notNull()
    .references(() => communitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityGroupMembersTable = pgTable("community_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => communityGroupsTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Community = typeof communitiesTable.$inferSelect;
export type CommunityMember = typeof communityMembersTable.$inferSelect;
export type CommunityChannel = typeof communityChannelsTable.$inferSelect;
export type CommunityEvent = typeof communityEventsTable.$inferSelect;
export type CommunityEventRsvp = typeof communityEventRsvpsTable.$inferSelect;
export type CommunityGroup = typeof communityGroupsTable.$inferSelect;
export type CommunityGroupMember = typeof communityGroupMembersTable.$inferSelect;
