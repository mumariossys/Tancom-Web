import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";

export const featureTogglesTable = pgTable("feature_toggles", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export type FeatureToggle = typeof featureTogglesTable.$inferSelect;
