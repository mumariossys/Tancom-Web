import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userProfilesTable = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  username: text("username").unique(), // unique handle, lowercase [a-z0-9_.]{3,20}
  bio: text("bio"),
  accountType: text("account_type"), // "individual" | "business" | "nonprofit"
  companyName: text("company_name"),         // org/business name (business & nonprofit)
  contactPersonName: text("contact_person_name"), // primary contact (business & nonprofit)
  accountSubType: text("account_sub_type"),  // e.g. "LLC", "501c3"
  taxId: text("tax_id"),                     // Registration or Tax ID
  address: text("address"),                  // Full business/org address
  website: text("website"),                  // Website URL
  publicKey: text("public_key"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  role: text("role").notNull().default("user"), // user, admin
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
