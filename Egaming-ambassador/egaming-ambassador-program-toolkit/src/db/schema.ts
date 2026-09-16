import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const ambassadorApplications = pgTable("ambassador_applications", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 180 }).notNull(),
  handle: varchar("handle", { length: 100 }).notNull(),
  primaryPlatform: varchar("primary_platform", { length: 40 }).notNull(),
  audienceSize: varchar("audience_size", { length: 40 }).notNull(),
  motivation: text("motivation").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ambassadorActivities = pgTable(
  "ambassador_activities",
  {
    id: serial("id").primaryKey(),
    ambassadorId: varchar("ambassador_id", { length: 80 }).notNull().default("demo-ambassador"),
    actionType: varchar("action_type", { length: 24 }).notNull(),
    actionId: varchar("action_id", { length: 100 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    points: integer("points").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ambassador_action_unique").on(
      table.ambassadorId,
      table.actionType,
      table.actionId,
    ),
  ],
);

export type AmbassadorActivity = typeof ambassadorActivities.$inferSelect;
