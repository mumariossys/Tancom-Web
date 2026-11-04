import { db, chatRoomsTable, chatParticipantsTable, chatMessagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/** Find or create the group chat room for a given group. Returns the room. */
export async function ensureGroupChatRoom(
  groupId: number,
  groupName: string,
): Promise<typeof chatRoomsTable.$inferSelect> {
  const existing = await db
    .select()
    .from(chatRoomsTable)
    .where(eq(chatRoomsTable.groupId, groupId))
    .then((rows) => rows[0]);

  if (existing) return existing;

  const [room] = await db
    .insert(chatRoomsTable)
    .values({ type: "group", groupId, name: groupName })
    .returning();

  return room;
}

/** Ensure a user is a participant in a chat room. No-op if already present. */
export async function ensureParticipant(roomId: number, clerkId: string): Promise<void> {
  const existing = await db
    .select()
    .from(chatParticipantsTable)
    .where(
      and(
        eq(chatParticipantsTable.roomId, roomId),
        eq(chatParticipantsTable.clerkId, clerkId),
      ),
    )
    .then((rows) => rows[0]);

  if (!existing) {
    await db.insert(chatParticipantsTable).values({ roomId, clerkId });
  }
}

/** Post a system message into a chat room (e.g. "Alice joined the group"). */
export async function postSystemMessage(roomId: number, content: string): Promise<void> {
  await db.insert(chatMessagesTable).values({
    roomId,
    senderClerkId: "system",
    content,
    messageType: "system",
  });
}
