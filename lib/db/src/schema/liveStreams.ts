import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const liveStreamsTable = pgTable("live_streams", {
  id: serial("id").primaryKey(),
  streamKey: text("stream_key").notNull().unique(),
  streamerClerkId: text("streamer_clerk_id").notNull(),
  streamerName: text("streamer_name").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category").notNull().default("general"),
  tags: text("tags"),
  status: text("status").notNull().default("idle"), // idle | live | ended
  privacy: text("privacy").notNull().default("public"), // public | followers | private
  chatEnabled: boolean("chat_enabled").notNull().default(true),
  viewerCount: integer("viewer_count").notNull().default(0),
  peakViewerCount: integer("peak_viewer_count").notNull().default(0),
  totalViews: integer("total_views").notNull().default(0),
  livekitRoomName: text("livekit_room_name"),
  livekitIngressId: text("livekit_ingress_id"),
  rtmpUrl: text("rtmp_url"),
  rtmpStreamKey: text("rtmp_stream_key"),
  isPremium: boolean("is_premium").notNull().default(false),
  premiumPriceCents: integer("premium_price_cents"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertLiveStreamSchema = createInsertSchema(liveStreamsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLiveStream = z.infer<typeof insertLiveStreamSchema>;
export type LiveStream = typeof liveStreamsTable.$inferSelect;
