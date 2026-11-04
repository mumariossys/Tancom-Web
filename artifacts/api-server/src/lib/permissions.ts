import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";

export async function isAdmin(clerkId: string): Promise<boolean> {
  const [profile] = await db
    .select({ role: userProfilesTable.role })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, clerkId));
  return profile?.role === "admin";
}
