import { pgTable, serial, text, integer, jsonb, timestamp, date } from "drizzle-orm/pg-core";

export type ProjectUpdate = { at: string; by: string; status: string; progress: number; note: string };

export const projects = pgTable("projects", {
  id: text().primaryKey(),
  name: text().notNull(),
  function: text("function_name").notNull(),
  owner: text().notNull(),
  status: text().notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  progress: integer().notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  updates: jsonb().$type<ProjectUpdate[]>().notNull().default([]),
});

export const digests = pgTable("digests", {
  id: serial().primaryKey(),
  at: timestamp({ withTimezone: true, mode: "string" }).notNull().defaultNow(),
  trigger: text().notNull(),
  data: jsonb().notNull(),
});

export const events = pgTable("events", {
  id: serial().primaryKey(),
  at: timestamp({ withTimezone: true, mode: "string" }).notNull().defaultNow(),
  kind: text().notNull(),
  text: text().notNull(),
});
