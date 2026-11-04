import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const remoteDevicesTable = pgTable("remote_devices", {
  id: serial("id").primaryKey(),
  ownerClerkId: text("owner_clerk_id").notNull(),
  name: text("name").notNull(),
  os: text("os").notNull().default("Unknown"),
  ip: text("ip"),
  location: text("location"),
  status: text("status").notNull().default("offline"), // online | offline | idle
  trusted: boolean("trusted").notNull().default(false),
  agentVersion: text("agent_version"),
  notes: text("notes"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const remoteSessionsTable = pgTable("remote_sessions", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  technicianClerkId: text("technician_clerk_id").notNull(),
  technicianName: text("technician_name").notNull(),
  ownerClerkId: text("owner_clerk_id").notNull(),
  status: text("status").notNull().default("active"), // active | ended
  recorded: boolean("recorded").notNull().default(false),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  duration: integer("duration"), // seconds
});

export const remoteSupportRequestsTable = pgTable("remote_support_requests", {
  id: serial("id").primaryKey(),
  requesterClerkId: text("requester_clerk_id").notNull(),
  requesterName: text("requester_name").notNull(),
  deviceId: integer("device_id"),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"), // pending | active | resolved | declined
  technicianClerkId: text("technician_clerk_id"),
  priority: text("priority").notNull().default("normal"), // low | normal | high | urgent
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── RC Audit Log ──────────────────────────────────────────────────────────────
// Immutable record of all significant RC lifecycle events for compliance,
// debugging, and security review. One row per notable action.
export const rcAuditLogTable = pgTable("rc_audit_log", {
  id: serial("id").primaryKey(),
  roomName: text("room_name").notNull(),
  actorClerkId: text("actor_clerk_id").notNull(),
  action: text("action").notNull(),
  // e.g. 'rc-grant', 'rc-deny', 'rc-revoke', 'rc-request',
  //      'rc-clipboard-push', 'rc-clipboard-pull', 'rc-drag'
  targetClerkId: text("target_clerk_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RcAuditLog = typeof rcAuditLogTable.$inferSelect;

export const insertRemoteDeviceSchema = createInsertSchema(remoteDevicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRemoteDevice = z.infer<typeof insertRemoteDeviceSchema>;
export type RemoteDevice = typeof remoteDevicesTable.$inferSelect;

export const insertRemoteSessionSchema = createInsertSchema(remoteSessionsTable).omit({ id: true, startedAt: true });
export type InsertRemoteSession = z.infer<typeof insertRemoteSessionSchema>;
export type RemoteSession = typeof remoteSessionsTable.$inferSelect;

export const insertRemoteSupportRequestSchema = createInsertSchema(remoteSupportRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRemoteSupportRequest = z.infer<typeof insertRemoteSupportRequestSchema>;
export type RemoteSupportRequest = typeof remoteSupportRequestsTable.$inferSelect;
