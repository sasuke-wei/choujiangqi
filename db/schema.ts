import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(), host: text("host").notNull(),
  revision: integer("revision").notNull().default(0), state: text("state").notNull(),
});
export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  event: text("event").notNull().references(() => events.id),
  student: text("student").notNull(), name: text("name").notNull(),
  suffix: text("suffix").notNull(), eligible: integer("eligible").notNull(),
}, t => [uniqueIndex("person_per_event").on(t.event, t.student)]);
