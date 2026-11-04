import { Router, type IRouter } from "express";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  userProfilesTable,
  groupPostsTable,
  groupPostReactionsTable,
  groupPostRepliesTable,
  groupPostViewsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { resolveGroupMembership } from "../lib/groupHelpers";

const router: IRouter = Router();

function paramStr(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

// ── Access helper ─────────────────────────────────────────────────────────────
async function getGroupAccess(groupId: number, userId: string) {
  const group = await db.select().from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .then(r => r[0] ?? null);
  if (!group) return { group: null, callerRole: null as null, membership: null as null };
  if (group.ownerClerkId === userId) {
    return { group, callerRole: "owner" as const, membership: null as null };
  }
  // resolveGroupMembership handles both direct clerkId match AND email fallback
  // for members who were added before they created their TanCom account.
  const membership = await resolveGroupMembership(groupId, userId);
  if (!membership) return { group, callerRole: null as null, membership: null as null };
  const callerRole = membership.memberRole === "admin" ? "admin" as const : "member" as const;
  return { group, callerRole, membership };
}

async function getName(clerkId: string): Promise<string> {
  const p = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, clerkId))
    .then(r => r[0] ?? null);
  return p?.name ?? "Unknown";
}

export async function buildPostResponse(
  post: typeof groupPostsTable.$inferSelect,
  userId: string,
  callerRole: "owner" | "admin" | "member",
  membership: typeof groupMembersTable.$inferSelect | null,
) {
  const [
    authorName,
    reactions,
    myReactionRow,
    replyCount,
    viewCount,
    sharedPost,
  ] = await Promise.all([
    getName(post.authorClerkId),
    db.select({ emoji: groupPostReactionsTable.emoji, count: sql<number>`count(*)::int` })
      .from(groupPostReactionsTable)
      .where(eq(groupPostReactionsTable.postId, post.id))
      .groupBy(groupPostReactionsTable.emoji),
    db.select().from(groupPostReactionsTable)
      .where(and(
        eq(groupPostReactionsTable.postId, post.id),
        eq(groupPostReactionsTable.reactorClerkId, userId),
      ))
      .then(r => r[0] ?? null),
    db.select({ count: sql<number>`count(*)::int` })
      .from(groupPostRepliesTable)
      .where(and(
        eq(groupPostRepliesTable.postId, post.id),
        isNull(groupPostRepliesTable.deletedAt),
      ))
      .then(r => r[0]!.count),
    db.select({ count: sql<number>`count(*)::int` })
      .from(groupPostViewsTable)
      .where(eq(groupPostViewsTable.postId, post.id))
      .then(r => r[0]!.count),
    post.sharedFromPostId
      ? db.select().from(groupPostsTable)
          .where(eq(groupPostsTable.id, post.sharedFromPostId))
          .then(r => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const isOwn = post.authorClerkId === userId;
  const canDeleteAny =
    callerRole === "owner" ||
    callerRole === "admin" ||
    (membership?.canDeleteAnyPost ?? false);
  const canDelete = isOwn || canDeleteAny;

  let sharedFromContent: string | null = null;
  let sharedFromAuthorName: string | null = null;
  if (sharedPost) {
    [sharedFromContent, sharedFromAuthorName] = await Promise.all([
      Promise.resolve(sharedPost.content),
      getName(sharedPost.authorClerkId),
    ]);
  }

  return {
    id: post.id,
    groupId: post.groupId,
    authorClerkId: post.authorClerkId,
    authorName,
    content: post.content,
    sharedFromPostId: post.sharedFromPostId ?? null,
    sharedFromContent,
    sharedFromAuthorName,
    fileObjectPath: post.fileObjectPath ?? null,
    fileName: post.fileName ?? null,
    fileMimeType: post.fileMimeType ?? null,
    fileSizeBytes: post.fileSizeBytes ?? null,
    pinned: post.pinned ?? false,
    createdAt: post.createdAt.toISOString(),
    reactions: reactions.map(r => ({ emoji: r.emoji, count: r.count })),
    myReaction: myReactionRow?.emoji ?? null,
    replyCount,
    viewCount,
    isOwn,
    canDelete,
  };
}

// ── List posts ─────────────────────────────────────────────────────────────────
router.get("/groups/:groupId/posts", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(403).json({ error: "Forbidden" }); return; }

  const posts = await db.select().from(groupPostsTable)
    .where(and(eq(groupPostsTable.groupId, groupId), isNull(groupPostsTable.deletedAt)))
    .orderBy(desc(groupPostsTable.createdAt));

  const responses = await Promise.all(
    posts.map(p => buildPostResponse(p, userId, callerRole, membership)),
  );
  res.json(responses);
});

// ── Create post ────────────────────────────────────────────────────────────────
router.post("/groups/:groupId/posts", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(403).json({ error: "Forbidden" }); return; }

  if (callerRole === "member" && !(membership?.canPost ?? true)) {
    res.status(403).json({ error: "You do not have permission to post in this group" }); return;
  }

  const { content, sharedFromPostId, fileObjectPath, fileName, fileMimeType, fileSizeBytes } = req.body as {
    content?: string;
    sharedFromPostId?: number;
    fileObjectPath?: string;
    fileName?: string;
    fileMimeType?: string;
    fileSizeBytes?: number;
  };

  if (!content?.trim() && !fileObjectPath) {
    res.status(400).json({ error: "Content or an attachment is required" }); return;
  }

  if (sharedFromPostId) {
    const original = await db.select().from(groupPostsTable)
      .where(and(
        eq(groupPostsTable.id, sharedFromPostId),
        eq(groupPostsTable.groupId, groupId),
        isNull(groupPostsTable.deletedAt),
      ))
      .then(r => r[0] ?? null);
    if (!original) { res.status(404).json({ error: "Original post not found" }); return; }
  }

  const [post] = await db.insert(groupPostsTable).values({
    groupId,
    authorClerkId: userId,
    content: content?.trim() ?? "",
    sharedFromPostId: sharedFromPostId ?? null,
    fileObjectPath: fileObjectPath ?? null,
    fileName: fileName ?? null,
    fileMimeType: fileMimeType ?? null,
    fileSizeBytes: fileSizeBytes ?? null,
  }).returning();

  const response = await buildPostResponse(post, userId, callerRole, membership);
  res.status(201).json(response);
});

// ── Delete post ────────────────────────────────────────────────────────────────
router.delete("/groups/:groupId/posts/:postId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  if (isNaN(groupId) || isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(403).json({ error: "Forbidden" }); return; }

  const post = await db.select().from(groupPostsTable)
    .where(and(
      eq(groupPostsTable.id, postId),
      eq(groupPostsTable.groupId, groupId),
      isNull(groupPostsTable.deletedAt),
    ))
    .then(r => r[0] ?? null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const isOwn = post.authorClerkId === userId;
  const canDeleteAny =
    callerRole === "owner" ||
    callerRole === "admin" ||
    (membership?.canDeleteAnyPost ?? false);
  if (!isOwn && !canDeleteAny) {
    res.status(403).json({ error: "You cannot delete this post" }); return;
  }

  await db.update(groupPostsTable)
    .set({ deletedAt: new Date() })
    .where(eq(groupPostsTable.id, postId));
  res.sendStatus(204);
});

// ── Toggle reaction ────────────────────────────────────────────────────────────
router.post("/groups/:groupId/posts/:postId/reactions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  if (isNaN(groupId) || isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(403).json({ error: "Forbidden" }); return; }

  const post = await db.select().from(groupPostsTable)
    .where(and(
      eq(groupPostsTable.id, postId),
      eq(groupPostsTable.groupId, groupId),
      isNull(groupPostsTable.deletedAt),
    ))
    .then(r => r[0] ?? null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const { emoji } = req.body as { emoji?: string };
  if (!emoji?.trim()) { res.status(400).json({ error: "Emoji is required" }); return; }

  const existing = await db.select().from(groupPostReactionsTable)
    .where(and(
      eq(groupPostReactionsTable.postId, postId),
      eq(groupPostReactionsTable.reactorClerkId, userId),
      eq(groupPostReactionsTable.emoji, emoji),
    ))
    .then(r => r[0] ?? null);

  if (existing) {
    await db.delete(groupPostReactionsTable)
      .where(eq(groupPostReactionsTable.id, existing.id));
  } else {
    // One reaction per user per post — remove any prior one first
    await db.delete(groupPostReactionsTable)
      .where(and(
        eq(groupPostReactionsTable.postId, postId),
        eq(groupPostReactionsTable.reactorClerkId, userId),
      ));
    await db.insert(groupPostReactionsTable)
      .values({ postId, reactorClerkId: userId, emoji });
  }

  const response = await buildPostResponse(post, userId, callerRole, membership);
  res.json(response);
});

// ── List replies ───────────────────────────────────────────────────────────────
router.get("/groups/:groupId/posts/:postId/replies", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  if (isNaN(groupId) || isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(403).json({ error: "Forbidden" }); return; }

  const replies = await db.select().from(groupPostRepliesTable)
    .where(and(
      eq(groupPostRepliesTable.postId, postId),
      isNull(groupPostRepliesTable.deletedAt),
    ))
    .orderBy(groupPostRepliesTable.createdAt);

  const responses = await Promise.all(replies.map(async r => ({
    id: r.id,
    postId: r.postId,
    authorClerkId: r.authorClerkId,
    authorName: await getName(r.authorClerkId),
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    isOwn: r.authorClerkId === userId,
  })));

  res.json(responses);
});

// ── Create reply ───────────────────────────────────────────────────────────────
router.post("/groups/:groupId/posts/:postId/replies", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  if (isNaN(groupId) || isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole, membership } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(403).json({ error: "Forbidden" }); return; }

  if (callerRole === "member" && !(membership?.canPost ?? true)) {
    res.status(403).json({ error: "You do not have permission to reply in this group" }); return;
  }

  const post = await db.select().from(groupPostsTable)
    .where(and(
      eq(groupPostsTable.id, postId),
      eq(groupPostsTable.groupId, groupId),
      isNull(groupPostsTable.deletedAt),
    ))
    .then(r => r[0] ?? null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content is required" }); return; }

  const [reply] = await db.insert(groupPostRepliesTable).values({
    postId,
    authorClerkId: userId,
    content: content.trim(),
  }).returning();

  res.status(201).json({
    id: reply.id,
    postId: reply.postId,
    authorClerkId: reply.authorClerkId,
    authorName: await getName(reply.authorClerkId),
    content: reply.content,
    createdAt: reply.createdAt.toISOString(),
    isOwn: true,
  });
});

// ── Delete reply ───────────────────────────────────────────────────────────────
router.delete("/groups/:groupId/posts/:postId/replies/:replyId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  const replyId = parseInt(paramStr(req.params.replyId), 10);
  if (isNaN(groupId) || isNaN(postId) || isNaN(replyId)) {
    res.status(400).json({ error: "Invalid id" }); return;
  }

  const { group, callerRole, membership } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(403).json({ error: "Forbidden" }); return; }

  const reply = await db.select().from(groupPostRepliesTable)
    .where(and(
      eq(groupPostRepliesTable.id, replyId),
      eq(groupPostRepliesTable.postId, postId),
      isNull(groupPostRepliesTable.deletedAt),
    ))
    .then(r => r[0] ?? null);
  if (!reply) { res.status(404).json({ error: "Reply not found" }); return; }

  const isOwn = reply.authorClerkId === userId;
  const canDeleteAny =
    callerRole === "owner" ||
    callerRole === "admin" ||
    (membership?.canDeleteAnyPost ?? false);
  if (!isOwn && !canDeleteAny) {
    res.status(403).json({ error: "You cannot delete this reply" }); return;
  }

  await db.update(groupPostRepliesTable)
    .set({ deletedAt: new Date() })
    .where(eq(groupPostRepliesTable.id, replyId));
  res.sendStatus(204);
});

// ── Get seen-by ────────────────────────────────────────────────────────────────
router.get("/groups/:groupId/posts/:postId/seen-by", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  if (isNaN(groupId) || isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(403).json({ error: "Forbidden" }); return; }

  const post = await db.select().from(groupPostsTable)
    .where(and(eq(groupPostsTable.id, postId), eq(groupPostsTable.groupId, groupId)))
    .then(r => r[0] ?? null);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const isAuthor = post.authorClerkId === userId;
  if (!isAuthor && callerRole !== "owner" && callerRole !== "admin") {
    res.status(403).json({ error: "Only the post author, admins and the owner can see viewers" });
    return;
  }

  const views = await db.select().from(groupPostViewsTable)
    .where(eq(groupPostViewsTable.postId, postId))
    .orderBy(groupPostViewsTable.seenAt);

  const responses = await Promise.all(views.map(async v => ({
    viewerClerkId: v.viewerClerkId,
    viewerName: await getName(v.viewerClerkId),
    seenAt: v.seenAt.toISOString(),
  })));

  res.json(responses);
});

// ── Mark seen ──────────────────────────────────────────────────────────────────
router.post("/groups/:groupId/posts/:postId/seen-by", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const postId = parseInt(paramStr(req.params.postId), 10);
  if (isNaN(groupId) || isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getGroupAccess(groupId, userId);
  if (!group || !callerRole) { res.status(204).end(); return; }

  const post = await db.select().from(groupPostsTable)
    .where(and(
      eq(groupPostsTable.id, postId),
      eq(groupPostsTable.groupId, groupId),
      isNull(groupPostsTable.deletedAt),
    ))
    .then(r => r[0] ?? null);
  if (!post || post.authorClerkId === userId) { res.status(204).end(); return; }

  const existing = await db.select().from(groupPostViewsTable)
    .where(and(
      eq(groupPostViewsTable.postId, postId),
      eq(groupPostViewsTable.viewerClerkId, userId),
    ))
    .then(r => r[0] ?? null);
  if (!existing) {
    await db.insert(groupPostViewsTable).values({ postId, viewerClerkId: userId });
  }
  res.sendStatus(204);
});

// ── Update member permissions ──────────────────────────────────────────────────
router.put("/groups/:groupId/members/:memberId/permissions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const groupId = parseInt(paramStr(req.params.groupId), 10);
  const memberId = parseInt(paramStr(req.params.memberId), 10);
  if (isNaN(groupId) || isNaN(memberId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { group, callerRole } = await getGroupAccess(groupId, userId);
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (callerRole !== "owner" && callerRole !== "admin") {
    res.status(403).json({ error: "Only group owners and admins can update permissions" }); return;
  }

  const { canPost, canDeleteAnyPost } = req.body as {
    canPost?: boolean;
    canDeleteAnyPost?: boolean;
  };
  if (typeof canPost !== "boolean" || typeof canDeleteAnyPost !== "boolean") {
    res.status(400).json({ error: "canPost and canDeleteAnyPost are required booleans" }); return;
  }

  const target = await db.select().from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.id, memberId),
      eq(groupMembersTable.groupId, groupId),
    ))
    .then(r => r[0] ?? null);
  if (!target) { res.status(404).json({ error: "Member not found" }); return; }
  if (target.invitedClerkId === group.ownerClerkId) {
    res.status(400).json({ error: "Cannot change the owner's permissions" }); return;
  }

  const [updated] = await db.update(groupMembersTable)
    .set({ canPost, canDeleteAnyPost })
    .where(and(
      eq(groupMembersTable.id, memberId),
      eq(groupMembersTable.groupId, groupId),
    ))
    .returning();

  res.json({
    id: updated.id,
    groupId: updated.groupId,
    name: updated.name,
    email: updated.email,
    phone: updated.phone ?? null,
    addedAt: updated.addedAt.toISOString(),
    invitedClerkId: updated.invitedClerkId ?? null,
    invitationStatus: updated.invitationStatus ?? null,
    memberRole: (updated.memberRole ?? "member") as "member" | "admin",
    canPost: updated.canPost,
    canDeleteAnyPost: updated.canDeleteAnyPost,
  });
});

export default router;
