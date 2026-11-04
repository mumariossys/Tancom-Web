import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, isNull, desc } from "drizzle-orm";
import crypto from "crypto";
import twilio from "twilio";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupJoinRequestsTable,
  groupMutesTable,
  groupPostsTable,
  userProfilesTable,
  participantsTable,
  notificationsTable,
} from "@workspace/db";
import { CreateGroupBody, AddGroupMemberBody, InviteGroupToMeetingBody, RespondToGroupInvitationBody } from "@workspace/api-zod";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth";
import { sendGroupInviteEmail } from "../lib/email";
import { ensureGroupChatRoom, ensureParticipant, postSystemMessage } from "../lib/chatHelpers";
import { buildPostResponse } from "./groupPosts";
import { resolveGroupMembership } from "../lib/groupHelpers";

function getTwilioClient() {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token) return null;
  return twilio(sid, token);
}

function getAppBaseUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  return "https://tancom.replit.app";
}

const router: IRouter = Router();

function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

function toGroupResponse(g: any, memberCount: number, role: "owner" | "admin" | "member" = "owner", isMuted = false) {
  return {
    id: g.id,
    ownerClerkId: g.ownerClerkId,
    name: g.name,
    description: g.description ?? null,
    requireApproval: g.requireApproval ?? false,
    memberCount,
    createdAt: g.createdAt.toISOString(),
    role,
    isMuted,
  };
}

function toMemberResponse(m: any) {
  return {
    id: m.id,
    groupId: m.groupId,
    name: m.name,
    email: m.email,
    phone: m.phone ?? null,
    addedAt: m.addedAt.toISOString(),
    invitedClerkId: m.invitedClerkId ?? null,
    invitationStatus: m.invitationStatus ?? null,
    memberRole: (m.memberRole ?? "member") as "owner" | "admin" | "member",
    canPost: m.canPost ?? true,
    canDeleteAnyPost: m.canDeleteAnyPost ?? false,
    canAddMembers: m.canAddMembers ?? false,
    canEditGroupInfo: m.canEditGroupInfo ?? false,
  };
}

type CallerRole = "owner" | "admin" | "member";

async function getCallerRole(
  groupId: number,
  userId: string
): Promise<{ group: typeof groupsTable.$inferSelect; callerRole: CallerRole | null; membership: typeof groupMembersTable.$inferSelect | null }> {
  const group = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId)).then(r => r[0]);
  if (!group) return { group: null as any, callerRole: null, membership: null };
  if (group.ownerClerkId === userId) return { group, callerRole: "owner", membership: null };
  const membership = await resolveGroupMembership(groupId, userId);
  if (!membership) return { group, callerRole: null, membership: null };
  const callerRole: CallerRole = membership.memberRole === "admin" ? "admin" : "member";
  return { group, callerRole, membership };
}

// ── List groups ───────────────────────────────────────────────────────────────
router.get("/groups", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  // Groups the user owns
  const ownedGroups = await db
    .select()
    .from(groupsTable)
    .where(eq(groupsTable.ownerClerkId, userId));

  // Groups the user joined as an accepted member (via invite link or accepted invitation)
  const memberRowsByClerkId = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.invitedClerkId, userId),
        eq(groupMembersTable.invitationStatus, "accepted")
      )
    );

  // Fallback path: look up by email for members added before they signed up
  const userProfile = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then((r) => r[0] ?? null);

  let emailMemberRows: typeof memberRowsByClerkId = [];
  if (userProfile?.email) {
    const byEmail = await db
      .select()
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.email, userProfile.email),
          isNull(groupMembersTable.invitedClerkId),
        )
      );
    if (byEmail.length > 0) {
      await db
        .update(groupMembersTable)
        .set({ invitedClerkId: userId, invitationStatus: "accepted" })
        .where(
          inArray(groupMembersTable.id, byEmail.map((m) => m.id))
        );
      emailMemberRows = byEmail.map((m) => ({
        ...m,
        invitedClerkId: userId,
        invitationStatus: "accepted" as const,
      }));
    }
  }

  const memberRows = [...memberRowsByClerkId, ...emailMemberRows];

  const ownedIds = new Set(ownedGroups.map((g) => g.id));
  const joinedMemberRows = memberRows.filter((m) => !ownedIds.has(m.groupId));
  const joinedGroupIds = [...new Set(joinedMemberRows.map((m) => m.groupId))];

  const joinedGroups = joinedGroupIds.length > 0
    ? await db.select().from(groupsTable).where(inArray(groupsTable.id, joinedGroupIds))
    : [];

  const joinedRoleMap = new Map<number, CallerRole>(
    joinedMemberRows.map((m) => [m.groupId, m.memberRole === "admin" ? "admin" : "member"])
  );

  // Fetch mute status for all groups in one batch
  const allGroupIds = [...ownedGroups.map(g => g.id), ...joinedGroups.map(g => g.id)];
  const muteRows = allGroupIds.length > 0
    ? await db.select().from(groupMutesTable).where(
        and(eq(groupMutesTable.clerkId, userId), inArray(groupMutesTable.groupId, allGroupIds))
      )
    : [];
  const mutedGroupIds = new Set(muteRows.map(m => m.groupId));

  const withCounts = await Promise.all([
    ...ownedGroups.map(async (g) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, g.id));
      return toGroupResponse(g, count, "owner", mutedGroupIds.has(g.id));
    }),
    ...joinedGroups.map(async (g) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, g.id));
      return toGroupResponse(g, count, joinedRoleMap.get(g.id) ?? "member", mutedGroupIds.has(g.id));
    }),
  ]);

  res.json(withCounts);
});

// ── Create group ──────────────────────────────────────────────────────────────
const CreateGroupExtendedBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  requireApproval: z.boolean().optional(),
});

router.post("/groups", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const parsed = CreateGroupExtendedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [group] = await db
    .insert(groupsTable)
    .values({
      ownerClerkId: userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      requireApproval: parsed.data.requireApproval ?? false,
    })
    .returning();

  // Insert creator as an explicit owner member row so they appear in member lists
  // and can be looked up by role consistently
  const ownerProfile = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId)).then(r => r[0]);
  await db.insert(groupMembersTable).values({
    groupId: group.id,
    name: ownerProfile?.name ?? "Group Owner",
    email: ownerProfile?.email ?? "",
    invitedClerkId: userId,
    invitationStatus: "accepted",
    memberRole: "owner",
    canPost: true,
    canDeleteAnyPost: true,
    canAddMembers: true,
    canEditGroupInfo: true,
  });

  res.status(201).json(toGroupResponse(group, 1));
});

// ── Update group ──────────────────────────────────────────────────────────────
const PatchGroupBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  requireApproval: z.boolean().optional(),
});

router.patch("/groups/:groupId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  // Owner can always edit; admins/members need canEditGroupInfo
  if (callerRole !== "owner") {
    if (!membership?.canEditGroupInfo) {
      res.status(403).json({ error: "You do not have permission to edit this group" }); return;
    }
  }

  const parsed = PatchGroupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, any> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if ("description" in parsed.data) updateData.description = parsed.data.description ?? null;
  if (parsed.data.requireApproval != null) updateData.requireApproval = parsed.data.requireApproval;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" }); return;
  }

  const [updated] = await db.update(groupsTable).set(updateData)
    .where(eq(groupsTable.id, groupId)).returning();

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));

  res.json(toGroupResponse(updated, count, callerRole ?? "owner"));
});

// ── Delete group ──────────────────────────────────────────────────────────────
router.delete("/groups/:groupId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(groupsTable)
    .where(and(eq(groupsTable.id, groupId), eq(groupsTable.ownerClerkId, userId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Group not found" }); return; }
  res.sendStatus(204);
});

// ── Leave group (member only, owner cannot leave — must transfer or delete) ───
router.delete("/groups/:groupId/leave", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Owners cannot leave — they must delete the group or transfer ownership
  const group = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId)).then(r => r[0]);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (group.ownerClerkId === userId) {
    res.status(400).json({ error: "Group owner cannot leave. Delete the group or transfer ownership first." });
    return;
  }

  const [deleted] = await db
    .delete(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.invitedClerkId, userId),
        eq(groupMembersTable.invitationStatus, "accepted")
      )
    )
    .returning();

  if (!deleted) { res.status(404).json({ error: "Membership not found" }); return; }
  res.sendStatus(204);
});

// ── List members ──────────────────────────────────────────────────────────────
router.get("/groups/:groupId/members", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const group = await db.select().from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .then(rows => rows[0]);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const isOwner = group.ownerClerkId === userId;
  if (!isOwner) {
    const membership = await resolveGroupMembership(groupId, userId);
    if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const members = await db.select().from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));

  res.json(members.map(toMemberResponse));
});

// ── Add member ────────────────────────────────────────────────────────────────
router.post("/groups/:groupId/members", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  // Owner and admin can always add; members need canAddMembers
  if (callerRole !== "owner" && callerRole !== "admin") {
    if (!membership?.canAddMembers) {
      res.status(403).json({ error: "Only group owners and admins can add members" }); return;
    }
  }

  const parsed = AddGroupMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [invitedProfile, ownerProfile] = await Promise.all([
    db.select().from(userProfilesTable)
      .where(eq(userProfilesTable.email, parsed.data.email))
      .then(rows => rows[0] ?? null),
    db.select().from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, userId))
      .then(rows => rows[0] ?? null),
  ]);

  const invitedClerkId = invitedProfile ? invitedProfile.clerkId : null;
  const invitationStatus = invitedProfile ? "pending" : null;
  const inviterName = ownerProfile?.name ?? ownerProfile?.email ?? "A TanCom user";
  const inviteeName = parsed.data.name;
  const inviteeEmail = parsed.data.email;
  const inviteePhone = parsed.data.phone ?? null;

  const [member] = await db
    .insert(groupMembersTable)
    .values({
      groupId,
      name: inviteeName,
      email: inviteeEmail,
      phone: inviteePhone,
      invitedClerkId,
      invitationStatus,
    })
    .returning();

  res.status(201).json(toMemberResponse(member));

  // ── In-app notification ───────────────────────────────────────────────────
  if (invitedClerkId) {
    db.insert(notificationsTable)
      .values({
        clerkId: invitedClerkId,
        type: "group_invitation",
        title: `You've been invited to "${group.name}"`,
        body: `${inviterName} added you to the group "${group.name}". Open your Groups page to accept or decline.`,
        relatedId: groupId,
        relatedType: "group",
      })
      .catch((err: unknown) => req.log.error({ err }, "Failed to insert group invitation notification"));
  }

  // ── System message in group chat ──────────────────────────────────────────
  ensureGroupChatRoom(groupId, group.name)
    .then(async (room) => {
      await postSystemMessage(room.id, `${inviterName} invited ${inviteeName} to this group.`);
    })
    .catch((err: unknown) => req.log.error({ err }, "Failed to post group invitation chat message"));

  // ── Email invitation ──────────────────────────────────────────────────────
  sendGroupInviteEmail({ toEmail: inviteeEmail, toName: inviteeName, groupName: group.name, inviterName, groupId })
    .catch((err: unknown) => req.log.error({ err }, "Failed to send group invitation email"));

  // ── SMS invitation ────────────────────────────────────────────────────────
  if (inviteePhone) {
    const twilioClient = getTwilioClient();
    const fromNumber = process.env["TWILIO_PHONE_NUMBER"];
    if (twilioClient && fromNumber) {
      const appUrl = getAppBaseUrl();
      const smsBody = `Hi ${inviteeName}! ${inviterName} has invited you to join the group "${group.name}" on TanCom. Visit ${appUrl}/groups to view your invitation.`;
      twilioClient.messages
        .create({ to: inviteePhone, from: fromNumber, body: smsBody })
        .then(msg => req.log.info({ sid: msg.sid, to: inviteePhone }, "Group invitation SMS sent"))
        .catch((err: unknown) => req.log.error({ err, to: inviteePhone }, "Failed to send group invitation SMS"));
    }
  }
});

// ── Update member (role + permissions) ───────────────────────────────────────
const UpdateMemberBody = z.object({
  role: z.enum(["member", "admin"]).optional(),
  canPost: z.boolean().optional(),
  canDeleteAnyPost: z.boolean().optional(),
  canAddMembers: z.boolean().optional(),
  canEditGroupInfo: z.boolean().optional(),
});

router.put("/groups/:groupId/members/:memberId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const memberId = parseInt(paramStr(req.params.memberId), 10);
  if (isNaN(groupId) || isNaN(memberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner") { res.status(403).json({ error: "Only the group owner can change member settings" }); return; }

  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const target = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.id, memberId), eq(groupMembersTable.groupId, groupId)))
    .then(r => r[0]);
  if (!target) { res.status(404).json({ error: "Member not found" }); return; }
  if (target.invitedClerkId === group.ownerClerkId) {
    res.status(400).json({ error: "Cannot change the owner's role" }); return;
  }

  const updateData: Record<string, any> = {};
  if (parsed.data.role != null) updateData.memberRole = parsed.data.role;
  if (parsed.data.canPost != null) updateData.canPost = parsed.data.canPost;
  if (parsed.data.canDeleteAnyPost != null) updateData.canDeleteAnyPost = parsed.data.canDeleteAnyPost;
  if (parsed.data.canAddMembers != null) updateData.canAddMembers = parsed.data.canAddMembers;
  if (parsed.data.canEditGroupInfo != null) updateData.canEditGroupInfo = parsed.data.canEditGroupInfo;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" }); return;
  }

  const [updated] = await db
    .update(groupMembersTable)
    .set(updateData)
    .where(and(eq(groupMembersTable.id, memberId), eq(groupMembersTable.groupId, groupId)))
    .returning();

  res.json(toMemberResponse(updated));
});

// Also expose as PATCH for frontend convenience
router.patch("/groups/:groupId/members/:memberId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const memberId = parseInt(paramStr(req.params.memberId), 10);
  if (isNaN(groupId) || isNaN(memberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner") { res.status(403).json({ error: "Only the group owner can change member settings" }); return; }

  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const target = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.id, memberId), eq(groupMembersTable.groupId, groupId)))
    .then(r => r[0]);
  if (!target) { res.status(404).json({ error: "Member not found" }); return; }
  if (target.invitedClerkId === group.ownerClerkId) {
    res.status(400).json({ error: "Cannot change the owner's settings" }); return;
  }

  const updateData: Record<string, any> = {};
  if (parsed.data.role != null) updateData.memberRole = parsed.data.role;
  if (parsed.data.canPost != null) updateData.canPost = parsed.data.canPost;
  if (parsed.data.canDeleteAnyPost != null) updateData.canDeleteAnyPost = parsed.data.canDeleteAnyPost;
  if (parsed.data.canAddMembers != null) updateData.canAddMembers = parsed.data.canAddMembers;
  if (parsed.data.canEditGroupInfo != null) updateData.canEditGroupInfo = parsed.data.canEditGroupInfo;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" }); return;
  }

  const [updated] = await db
    .update(groupMembersTable)
    .set(updateData)
    .where(and(eq(groupMembersTable.id, memberId), eq(groupMembersTable.groupId, groupId)))
    .returning();

  res.json(toMemberResponse(updated));
});

// ── Remove member ─────────────────────────────────────────────────────────────
router.delete("/groups/:groupId/members/:memberId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const memberId = parseInt(paramStr(req.params.memberId), 10);
  if (isNaN(groupId) || isNaN(memberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner" && callerRole !== "admin") {
    res.status(403).json({ error: "Only group owners and admins can remove members" }); return;
  }

  const target = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.id, memberId), eq(groupMembersTable.groupId, groupId)))
    .then(r => r[0]);
  if (!target) { res.status(404).json({ error: "Member not found" }); return; }
  if (target.invitedClerkId === group.ownerClerkId) {
    res.status(403).json({ error: "The group owner cannot be removed" }); return;
  }

  await db.delete(groupMembersTable)
    .where(and(eq(groupMembersTable.id, memberId), eq(groupMembersTable.groupId, groupId)));

  res.sendStatus(204);
});

// ── Presence ──────────────────────────────────────────────────────────────────
router.get("/groups/:groupId/presence", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const group = await db.select().from(groupsTable)
    .where(and(eq(groupsTable.id, groupId), eq(groupsTable.ownerClerkId, userId)))
    .then(rows => rows[0]);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const members = await db.select().from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));

  const presence = await Promise.all(members.map(async (m) => {
    const profile = await db.select().from(userProfilesTable)
      .where(eq(userProfilesTable.email, m.email))
      .then(rows => rows[0]);

    let status: "available" | "in_meeting" = "available";
    if (profile) {
      const active = await db.select().from(participantsTable)
        .where(and(eq(participantsTable.clerkId, profile.clerkId), eq(participantsTable.status, "admitted")))
        .then(rows => rows[0]);
      if (active) status = "in_meeting";
    }

    return { memberId: m.id, name: m.name, email: m.email, status };
  }));

  res.json(presence);
});

// ── Invite group to meeting (stub — meeting integration via POST /meetings groupId) ──
router.post("/groups/:groupId/invite", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const group = await db.select().from(groupsTable)
    .where(and(eq(groupsTable.id, groupId), eq(groupsTable.ownerClerkId, userId)))
    .then(rows => rows[0]);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const parsed = InviteGroupToMeetingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const members = await db.select().from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));

  res.json({ invited: members.length });
});

// ── Mute group ────────────────────────────────────────────────────────────────
router.post("/groups/:groupId/mute", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Verify caller has access to this group
  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group || callerRole === null) { res.status(404).json({ error: "Group not found" }); return; }

  await db.insert(groupMutesTable)
    .values({ clerkId: userId, groupId })
    .onConflictDoNothing();

  res.json({ muted: true });
});

router.delete("/groups/:groupId/mute", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(groupMutesTable)
    .where(and(eq(groupMutesTable.clerkId, userId), eq(groupMutesTable.groupId, groupId)));

  res.json({ muted: false });
});

// ── Join requests ─────────────────────────────────────────────────────────────

// List pending join requests (owner/admin only)
router.get("/groups/:groupId/join-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner" && callerRole !== "admin") {
    res.status(403).json({ error: "Only owner/admin can view join requests" }); return;
  }

  const requests = await db.select().from(groupJoinRequestsTable)
    .where(and(eq(groupJoinRequestsTable.groupId, groupId), eq(groupJoinRequestsTable.status, "pending")))
    .orderBy(desc(groupJoinRequestsTable.requestedAt));

  res.json(requests.map(r => ({
    id: r.id,
    groupId: r.groupId,
    requesterClerkId: r.requesterClerkId,
    requesterName: r.requesterName,
    requesterEmail: r.requesterEmail,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedByClerkId: r.reviewedByClerkId ?? null,
  })));
});

// Submit a join request (any authenticated user)
router.post("/groups/:groupId/join-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const group = await db.select().from(groupsTable)
    .where(eq(groupsTable.id, groupId)).then(r => r[0]);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  // Check for duplicate request
  const existing = await db.select().from(groupJoinRequestsTable)
    .where(and(
      eq(groupJoinRequestsTable.groupId, groupId),
      eq(groupJoinRequestsTable.requesterClerkId, userId),
      eq(groupJoinRequestsTable.status, "pending"),
    )).then(r => r[0]);
  if (existing) {
    res.status(409).json({ status: "pending", message: "Join request already submitted" }); return;
  }

  const profile = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId)).then(r => r[0]);

  const [request] = await db.insert(groupJoinRequestsTable).values({
    groupId,
    requesterClerkId: userId,
    requesterName: profile?.name ?? "TanCom Member",
    requesterEmail: profile?.email ?? "",
    status: "pending",
  }).returning();

  // Notify group owner
  db.insert(notificationsTable).values({
    clerkId: group.ownerClerkId,
    type: "group_join_request",
    title: `New join request for "${group.name}"`,
    body: `${request.requesterName} wants to join your group.`,
    relatedId: groupId,
    relatedType: "group",
  }).catch(() => {});

  res.status(201).json({ status: "pending", requestId: request.id });
});

// Approve a join request
router.post("/groups/:groupId/join-requests/:requestId/approve", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const requestId = parseInt(paramStr(req.params.requestId), 10);
  if (isNaN(groupId) || isNaN(requestId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner" && callerRole !== "admin") {
    res.status(403).json({ error: "Only owner/admin can approve join requests" }); return;
  }

  // Atomically claim the request (status: pending → approved) and insert the member row.
  // The UPDATE returns 0 rows if another admin already approved/rejected it, preventing
  // duplicate membership from concurrent requests. The unique index on
  // group_members(group_id, invited_clerk_id) provides a second safety net.
  let approvedRequest: typeof groupJoinRequestsTable.$inferSelect | undefined;
  try {
    approvedRequest = await db.transaction(async (tx) => {
      // Atomically flip pending → approved; returns nothing if already acted on
      const [updated] = await tx.update(groupJoinRequestsTable)
        .set({ status: "approved", reviewedAt: new Date(), reviewedByClerkId: userId })
        .where(and(
          eq(groupJoinRequestsTable.id, requestId),
          eq(groupJoinRequestsTable.groupId, groupId),
          eq(groupJoinRequestsTable.status, "pending"),
        ))
        .returning();

      if (!updated) {
        // Already acted on — check if it exists at all to choose 404 vs 409
        const [existing] = await tx.select().from(groupJoinRequestsTable)
          .where(and(eq(groupJoinRequestsTable.id, requestId), eq(groupJoinRequestsTable.groupId, groupId)));
        if (!existing) throw Object.assign(new Error("not_found"), { code: "not_found" });
        throw Object.assign(new Error("already_decided"), { code: "already_decided" });
      }

      // Upsert membership: if a pending/declined invitation row already exists for this
      // user (e.g. they were directly invited before requireApproval was enabled), promote
      // it to accepted. Otherwise insert a fresh member row.
      const [existingMemberRow] = await tx.select({ id: groupMembersTable.id })
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.invitedClerkId, updated.requesterClerkId),
        ));

      if (existingMemberRow) {
        await tx.update(groupMembersTable)
          .set({
            invitationStatus: "accepted",
            memberRole: "member",
            name: updated.requesterName,
            email: updated.requesterEmail,
          })
          .where(eq(groupMembersTable.id, existingMemberRow.id));
      } else {
        await tx.insert(groupMembersTable).values({
          groupId,
          name: updated.requesterName,
          email: updated.requesterEmail,
          invitedClerkId: updated.requesterClerkId,
          invitationStatus: "accepted",
          memberRole: "member",
          canAddMembers: false,
          canEditGroupInfo: false,
        });
      }

      return updated;
    });
  } catch (err: any) {
    if (err.code === "not_found") { res.status(404).json({ error: "Join request not found" }); return; }
    if (err.code === "already_decided") { res.status(409).json({ error: "Request is no longer pending" }); return; }
    throw err;
  }

  // Side effects outside the transaction (non-critical)
  const room = await ensureGroupChatRoom(groupId, group.name).catch(() => null);
  if (room) {
    await ensureParticipant(room.id, approvedRequest.requesterClerkId).catch(() => {});
    await postSystemMessage(room.id, `${approvedRequest.requesterName} joined the group.`).catch(() => {});
  }

  // Notify the requester
  db.insert(notificationsTable).values({
    clerkId: approvedRequest.requesterClerkId,
    type: "group_join_approved",
    title: `Your request to join "${group.name}" was approved`,
    body: `You are now a member of "${group.name}".`,
    relatedId: groupId,
    relatedType: "group",
  }).catch(() => {});

  res.json({ status: "approved" });
});

// Reject a join request (atomic: conditional on status = pending)
router.post("/groups/:groupId/join-requests/:requestId/reject", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const requestId = parseInt(paramStr(req.params.requestId), 10);
  if (isNaN(groupId) || isNaN(requestId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner" && callerRole !== "admin") {
    res.status(403).json({ error: "Only owner/admin can reject join requests" }); return;
  }

  // Atomically flip pending → rejected; returns nothing if already acted on
  const [rejectedRequest] = await db.update(groupJoinRequestsTable)
    .set({ status: "rejected", reviewedAt: new Date(), reviewedByClerkId: userId })
    .where(and(
      eq(groupJoinRequestsTable.id, requestId),
      eq(groupJoinRequestsTable.groupId, groupId),
      eq(groupJoinRequestsTable.status, "pending"),
    ))
    .returning();

  if (!rejectedRequest) {
    // Distinguish 404 (never existed) from 409 (already acted on)
    const [existing] = await db.select().from(groupJoinRequestsTable)
      .where(and(eq(groupJoinRequestsTable.id, requestId), eq(groupJoinRequestsTable.groupId, groupId)));
    if (!existing) { res.status(404).json({ error: "Join request not found" }); return; }
    res.status(409).json({ error: "Request is no longer pending" }); return;
  }

  // Notify the requester (non-critical)
  db.insert(notificationsTable).values({
    clerkId: rejectedRequest.requesterClerkId,
    type: "group_join_rejected",
    title: `Your request to join "${group.name}" was not approved`,
    body: `The group admin reviewed your request to join "${group.name}".`,
    relatedId: groupId,
    relatedType: "group",
  }).catch(() => {});

  res.json({ status: "rejected" });
});

// ── Pinned posts ──────────────────────────────────────────────────────────────

// Get all pinned posts for a group
router.get("/groups/:groupId/posts/pinned", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group || callerRole === null) { res.status(403).json({ error: "Forbidden" }); return; }

  const membership = callerRole === "owner" ? null : await db.select().from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, groupId),
      eq(groupMembersTable.invitedClerkId, userId),
      eq(groupMembersTable.invitationStatus, "accepted"),
    ))
    .then(r => r[0] ?? null);

  const posts = await db.select().from(groupPostsTable)
    .where(and(
      eq(groupPostsTable.groupId, groupId),
      eq(groupPostsTable.pinned, true),
      isNull(groupPostsTable.deletedAt),
    ))
    .orderBy(desc(groupPostsTable.createdAt));

  const responses = await Promise.all(
    posts.map(p => buildPostResponse(p, userId, callerRole as "owner" | "admin" | "member", membership))
  );
  res.json(responses);
});

// Pin a post
router.post("/groups/:groupId/posts/:postId/pin", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  if (isNaN(groupId) || isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner" && callerRole !== "admin") {
    res.status(403).json({ error: "Only owner/admin can pin posts" }); return;
  }

  const post = await db.select().from(groupPostsTable)
    .where(and(eq(groupPostsTable.id, postId), eq(groupPostsTable.groupId, groupId)))
    .then(r => r[0]);
  if (!post || post.deletedAt) { res.status(404).json({ error: "Post not found" }); return; }

  const [updated] = await db.update(groupPostsTable)
    .set({ pinned: true })
    .where(eq(groupPostsTable.id, postId))
    .returning();

  res.json({ id: updated.id, pinned: updated.pinned });
});

// Unpin a post
router.delete("/groups/:groupId/posts/:postId/pin", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  if (isNaN(groupId) || isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner" && callerRole !== "admin") {
    res.status(403).json({ error: "Only owner/admin can unpin posts" }); return;
  }

  const [updated] = await db.update(groupPostsTable)
    .set({ pinned: false })
    .where(and(eq(groupPostsTable.id, postId), eq(groupPostsTable.groupId, groupId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  res.json({ id: updated.id, pinned: updated.pinned });
});

// ── List group invitations (for the current user) ─────────────────────────────
router.get("/group-invitations", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const memberRows = await db.select().from(groupMembersTable)
    .where(eq(groupMembersTable.invitedClerkId, userId));

  const visible = memberRows.filter(m =>
    m.invitationStatus === "pending" || m.invitationStatus === "accepted"
  );

  const invitations = await Promise.all(visible.map(async (m) => {
    const group = await db.select().from(groupsTable)
      .where(eq(groupsTable.id, m.groupId))
      .then(rows => rows[0]);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, m.groupId));

    return {
      memberId: m.id,
      groupId: m.groupId,
      groupName: group?.name ?? "Unknown Group",
      ownerClerkId: group?.ownerClerkId ?? "",
      memberCount: count,
      invitedAt: m.addedAt.toISOString(),
      status: m.invitationStatus as "pending" | "accepted" | "declined",
    };
  }));

  res.json(invitations);
});

// ── Respond to group invitation ───────────────────────────────────────────────
router.put("/group-invitations/:memberId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const memberId = parseInt(paramStr(req.params.memberId), 10);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = RespondToGroupInvitationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const memberRow = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.id, memberId), eq(groupMembersTable.invitedClerkId, userId)))
    .then(rows => rows[0]);

  if (!memberRow) { res.status(404).json({ error: "Invitation not found" }); return; }

  const newStatus = parsed.data.action === "accept" ? "accepted" : "declined";

  const [updated] = await db
    .update(groupMembersTable)
    .set({ invitationStatus: newStatus })
    .where(eq(groupMembersTable.id, memberId))
    .returning();

  const [group, [{ count }]] = await Promise.all([
    db.select().from(groupsTable)
      .where(eq(groupsTable.id, updated.groupId))
      .then(rows => rows[0]),
    db.select({ count: sql<number>`count(*)::int` })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, updated.groupId)),
  ]);

  res.json({
    memberId: updated.id,
    groupId: updated.groupId,
    groupName: group?.name ?? "Unknown Group",
    ownerClerkId: group?.ownerClerkId ?? "",
    memberCount: count,
    invitedAt: updated.addedAt.toISOString(),
    status: updated.invitationStatus as "pending" | "accepted" | "declined",
  });

  if (newStatus === "accepted" && group) {
    const accepterProfile = await db.select().from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, userId))
      .then(rows => rows[0]);
    const accepterName = accepterProfile?.name ?? accepterProfile?.email ?? "A member";

    ensureGroupChatRoom(updated.groupId, group.name)
      .then(async (room) => {
        await ensureParticipant(room.id, userId);
        await postSystemMessage(room.id, `${accepterName} accepted the invitation and joined the group.`);
      })
      .catch(() => {});
  }
});

// ── Get / generate invite token ───────────────────────────────────────────────
router.get("/groups/:groupId/invite-token", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  // Owner can always get/generate; admins need canEditGroupInfo
  if (callerRole !== "owner" && !(callerRole === "admin" && membership?.canEditGroupInfo)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  let token = group.inviteToken;
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    await db.update(groupsTable)
      .set({ inviteToken: token })
      .where(eq(groupsTable.id, groupId));
  }

  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  const link = `${proto}://${host}/join-group/${token}`;

  res.json({ token, link });
});

// ── Regenerate invite token ────────────────────────────────────────────────────
router.post("/groups/:groupId/invite-token/regenerate", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getCallerRole(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner" && !(callerRole === "admin" && membership?.canEditGroupInfo)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const token = crypto.randomBytes(16).toString("hex");
  await db.update(groupsTable)
    .set({ inviteToken: token })
    .where(eq(groupsTable.id, groupId));

  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  const link = `${proto}://${host}/join-group/${token}`;

  res.json({ token, link });
});

// ── Public: get group info by invite token (no auth) ──────────────────────────
router.get("/group-join/:token", async (req, res): Promise<void> => {
  const token = paramStr(req.params.token);

  const group = await db.select().from(groupsTable)
    .where(eq(groupsTable.inviteToken, token))
    .then(rows => rows[0]);

  if (!group) { res.status(404).json({ error: "Invalid invite link" }); return; }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, group.id));

  res.json({
    groupId: group.id,
    groupName: group.name,
    description: group.description ?? null,
    memberCount: count,
    requireApproval: group.requireApproval ?? false,
  });
});

// ── Join group via invite token ───────────────────────────────────────────────
router.post("/group-join/:token", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const token = paramStr(req.params.token);

  const group = await db.select().from(groupsTable)
    .where(eq(groupsTable.inviteToken, token))
    .then(rows => rows[0]);

  if (!group) { res.status(404).json({ error: "Invalid invite link" }); return; }

  // Check if already a member
  const existing = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.invitedClerkId, userId)))
    .then(rows => rows[0]);

  if (existing) {
    if (existing.invitationStatus === "accepted") {
      // Already a full member — idempotent join
      const room = await ensureGroupChatRoom(group.id, group.name);
      await ensureParticipant(room.id, userId);
      res.json({ groupId: group.id, groupName: group.name, alreadyMember: true, status: "joined" });
      return;
    }

    // Pending direct invitation: if approval is required, route through join-request flow
    // instead of auto-accepting, to honour the group's approval policy.
    if (group.requireApproval) {
      // Fall through to the join-request logic below (don't short-circuit here)
    } else {
      // No approval required — accept the pending invitation immediately
      await db.update(groupMembersTable)
        .set({ invitationStatus: "accepted" })
        .where(eq(groupMembersTable.id, existing.id));
      const room = await ensureGroupChatRoom(group.id, group.name);
      await ensureParticipant(room.id, userId);
      res.json({ groupId: group.id, groupName: group.name, alreadyMember: true, status: "joined" });
      return;
    }
  }

  // Check for an existing pending join request
  const pendingRequest = await db.select().from(groupJoinRequestsTable)
    .where(and(
      eq(groupJoinRequestsTable.groupId, group.id),
      eq(groupJoinRequestsTable.requesterClerkId, userId),
      eq(groupJoinRequestsTable.status, "pending"),
    )).then(r => r[0]);
  if (pendingRequest) {
    res.json({ groupId: group.id, groupName: group.name, status: "pending" }); return;
  }

  const profile = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, userId))
    .then(rows => rows[0]);

  const name = profile?.name ?? "TanCom Member";
  const email = profile?.email ?? "";

  // If approval required, create a join request instead of adding directly
  if (group.requireApproval) {
    const [request] = await db.insert(groupJoinRequestsTable).values({
      groupId: group.id,
      requesterClerkId: userId,
      requesterName: name,
      requesterEmail: email,
      status: "pending",
    }).returning();

    // Notify group owner
    db.insert(notificationsTable).values({
      clerkId: group.ownerClerkId,
      type: "group_join_request",
      title: `New join request for "${group.name}"`,
      body: `${name} wants to join your group.`,
      relatedId: group.id,
      relatedType: "group",
    }).catch(() => {});

    res.json({ groupId: group.id, groupName: group.name, status: "pending" });
    return;
  }

  // No approval required — join directly
  await db.insert(groupMembersTable).values({
    groupId: group.id,
    name,
    email,
    invitedClerkId: userId,
    invitationStatus: "accepted",
  });

  const room = await ensureGroupChatRoom(group.id, group.name);
  await ensureParticipant(room.id, userId);
  await postSystemMessage(room.id, `${name} joined the group via invite link.`);

  res.json({ groupId: group.id, groupName: group.name, alreadyMember: false });
});

export default router;
