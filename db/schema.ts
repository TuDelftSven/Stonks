import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("idx_users_email").on(table.email)]
);

export const imports = sqliteTable(
  "imports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileType: text("file_type").notNull(),
    originalName: text("original_name").notNull(),
    objectKey: text("object_key").notNull(),
    bytes: integer("bytes").notNull(),
    rowCount: integer("row_count").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_imports_user_file_type").on(table.userId, table.fileType),
  ]
);

export const mappings = sqliteTable(
  "mappings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isin: text("isin").notNull(),
    exchange: text("exchange").notNull().default(""),
    currency: text("currency").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_mappings_user_listing").on(
      table.userId,
      table.isin,
      table.exchange,
      table.currency
    ),
  ]
);
