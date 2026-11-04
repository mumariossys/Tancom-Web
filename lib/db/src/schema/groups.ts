import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const groupsTable = pgTable("groups", {
  id: serial("id").primaryKey(),
  ownerClerkId: text("owner_clerk_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  requireApproval: boolean("require_approval").notNull().default(false),
  inviteToken: text("invite_token").unique(),
  inviteTokenExpiresAt: timestamp("invite_token_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  // When the member's email matches a TanCom account, these fields are set so
  // they see the group invitation on their own Groups page.
  invitedClerkId: text("invited_clerk_id"),
  invitationStatus: text("invitation_status"), // 'pending' | 'accepted' | 'declined'
  memberRole: text("member_role").default("member"), // 'owner' | 'admin' | 'member'
  canPost: boolean("can_post").default(true).notNull(),
  canDeleteAnyPost: boolean("can_delete_any_post").default(false).notNull(),
  canAddMembers: boolean("can_add_members").default(false).notNull(),
  canEditGroupInfo: boolean("can_edit_group_info").default(false).notNull(),
});

// Join requests for groups with requireApproval=true
export const groupJoinRequestsTable = pgTable("group_join_requests", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  requesterClerkId: text("requester_clerk_id").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByClerkId: text("reviewed_by_clerk_id"),
});

// Per-user group mute preferences
export const groupMutesTable = pgTable("group_mutes", {
  clerkId: text("clerk_id").notNull(),
  groupId: integer("group_id")
    .notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  mutedAt: timestamp("muted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.clerkId, t.groupId] }),
]);

export const insertGroupSchema = createInsertSchema(groupsTable).omit({
  id: true,
  createdAt: true,
});
export const insertGroupMemberSchema = createInsertSchema(groupMembersTable).omit({
  id: true,
  addedAt: true,
});
export const insertGroupJoinRequestSchema = createInsertSchema(groupJoinRequestsTable).omit({
  id: true,
  requestedAt: true,
});

export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groupsTable.$inferSelect;
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupMember = typeof groupMembersTable.$inferSelect;
export type GroupJoinRequest = typeof groupJoinRequestsTable.$inferSelect;
export type GroupMute = typeof groupMutesTable.$inferSelect;
