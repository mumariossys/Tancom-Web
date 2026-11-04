import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

router.delete("/account", (req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) {
        res.status(403).json({ error: "Cross-site account deletion is not allowed." });
        return;
      }
    } catch {
      res.status(403).json({ error: "Invalid request origin." });
      return;
    }
  }
  next();
}, requireAuth, async (req: any, res) => {
  const userId = req.userId as string;
  const tombstone = `deleted_${createHash("sha256").update(userId).digest("hex").slice(0, 24)}`;

  try {
    await db.transaction(async (tx) => {
      const objectRows = await tx.execute<{ path: string | null }>(sql`
        SELECT file_object_path AS path FROM chat_messages WHERE sender_clerk_id = ${userId}
        UNION
        SELECT file_object_path AS path FROM group_posts WHERE author_clerk_id = ${userId}
        UNION
        SELECT file_url AS path FROM recordings
          WHERE initiated_by_clerk_id = ${userId}
             OR meeting_id IN (SELECT id FROM meetings WHERE host_clerk_id = ${userId})
        UNION
        SELECT thumbnail_url AS path FROM live_streams WHERE streamer_clerk_id = ${userId}
      `);
      const objectPaths = objectRows.rows
        .map((row) => row.path)
        .filter((path): path is string => typeof path === "string" && path.startsWith("/objects/"));

      // Delete resources owned exclusively by this account.
      await tx.execute(sql`DELETE FROM chat_rooms WHERE community_id IN (SELECT id FROM communities WHERE owner_id = ${userId})`);
      await tx.execute(sql`DELETE FROM communities WHERE owner_id = ${userId}`);
      await tx.execute(sql`DELETE FROM groups WHERE owner_clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM stream_followers WHERE follower_clerk_id = ${userId} OR streamer_clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM live_streams WHERE streamer_clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM participants WHERE meeting_id IN (SELECT id FROM meetings WHERE host_clerk_id = ${userId})`);
      await tx.execute(sql`DELETE FROM recordings WHERE meeting_id IN (SELECT id FROM meetings WHERE host_clerk_id = ${userId})`);
      await tx.execute(sql`DELETE FROM meeting_notes WHERE meeting_id IN (SELECT id FROM meetings WHERE host_clerk_id = ${userId})`);
      await tx.execute(sql`DELETE FROM meeting_summaries WHERE meeting_id IN (SELECT id FROM meetings WHERE host_clerk_id = ${userId})`);
      await tx.execute(sql`DELETE FROM meetings WHERE host_clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM remote_devices WHERE owner_clerk_id = ${userId}`);

      // Remove private account data and memberships.
      await tx.execute(sql`DELETE FROM user_sessions WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM phone_otps WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM notifications WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM contacts WHERE owner_clerk_id = ${userId} OR contact_clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM call_log WHERE owner_clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM chat_participants WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM chat_conversation_keys WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM chat_reactions WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM poll_votes WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM community_members WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM community_event_rsvps WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM community_group_members WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM group_mutes WHERE clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM group_join_requests WHERE requester_clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM remote_sessions WHERE technician_clerk_id = ${userId} OR owner_clerk_id = ${userId}`);
      await tx.execute(sql`DELETE FROM remote_support_requests WHERE requester_clerk_id = ${userId}`);

      // Preserve shared conversation history without retaining the Clerk identity.
      await tx.execute(sql`UPDATE chat_messages SET sender_clerk_id = ${tombstone} WHERE sender_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE group_posts SET author_clerk_id = ${tombstone} WHERE author_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE group_post_replies SET author_clerk_id = ${tombstone} WHERE author_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE group_post_reactions SET reactor_clerk_id = ${tombstone} WHERE reactor_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE group_post_views SET viewer_clerk_id = ${tombstone} WHERE viewer_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE polls SET creator_clerk_id = ${tombstone} WHERE creator_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE meeting_notes SET author_clerk_id = ${tombstone}, author_name = 'Deleted user' WHERE author_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE participants SET clerk_id = NULL, display_name = 'Deleted user' WHERE clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE group_members SET invited_clerk_id = NULL WHERE invited_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE group_join_requests SET reviewed_by_clerk_id = NULL WHERE reviewed_by_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE remote_support_requests SET technician_clerk_id = NULL WHERE technician_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE rc_audit_log SET actor_clerk_id = ${tombstone} WHERE actor_clerk_id = ${userId}`);
      await tx.execute(sql`UPDATE rc_audit_log SET target_clerk_id = NULL WHERE target_clerk_id = ${userId}`);

      await tx.execute(sql`DELETE FROM user_profiles WHERE clerk_id = ${userId}`);

      // Keep Clerk identity deletion inside the transaction. If Clerk rejects
      // the request, all database changes roll back and the user can retry.
      for (const objectPath of objectPaths) {
        const file = await objectStorage.getObjectEntityFile(objectPath);
        await file.delete({ ignoreNotFound: true });
      }
      await clerkClient.users.deleteUser(userId);
    });

    res.json({ success: true });
  } catch (error) {
    req.log.error({ error, userId }, "delete account failed");
    res.status(500).json({ error: "Account deletion failed. Your account remains active; please try again." });
  }
});

export default router;