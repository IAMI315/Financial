import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const nowMs = sql`(unixepoch() * 1000)`;

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    usernameNormalized: text('username_normalized').notNull(),
    email: text('email'),
    emailNormalized: text('email_normalized'),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    status: text('status', { enum: ['active', 'disabled'] })
      .notNull()
      .default('active'),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    temporaryPasswordExpiresAt: integer('temporary_password_expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (table) => [
    uniqueIndex('users_username_normalized_uq').on(table.usernameNormalized),
    uniqueIndex('users_email_normalized_uq').on(table.emailNormalized),
    check('users_role_check', sql`${table.role} in ('user', 'admin')`),
    check('users_status_check', sql`${table.status} in ('active', 'disabled')`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uq').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
  ],
);

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    name: text('name').notNull(),
    parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id, {
      onDelete: 'restrict',
    }),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (table) => [
    index('categories_user_id_idx').on(table.userId),
    index('categories_parent_id_idx').on(table.parentId),
    check('categories_type_check', sql`${table.type} in ('income', 'expense')`),
    check(
      'categories_not_self_parent_check',
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
    ),
  ],
);

export const importBatches = sqliteTable(
  'import_batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceName: text('source_name'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (table) => [index('import_batches_user_id_idx').on(table.userId)],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    amountFen: integer('amount_fen').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    subcategoryId: integer('subcategory_id').references(() => categories.id, {
      onDelete: 'restrict',
    }),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    note: text('note'),
    importBatchId: integer('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (table) => [
    index('transactions_user_time_idx').on(table.userId, table.occurredAt),
    index('transactions_user_type_time_idx').on(table.userId, table.type, table.occurredAt),
    index('transactions_user_category_time_idx').on(table.userId, table.categoryId, table.occurredAt),
    index('transactions_user_subcategory_time_idx').on(table.userId, table.subcategoryId, table.occurredAt),
    index('transactions_duplicate_lookup_idx').on(table.userId, table.type, table.amountFen, table.occurredAt),
    index('transactions_category_idx').on(table.categoryId),
    index('transactions_subcategory_idx').on(table.subcategoryId),
    index('transactions_import_batch_idx').on(table.importBatchId),
    check('transactions_type_check', sql`${table.type} in ('income', 'expense')`),
    check('transactions_amount_positive_check', sql`${table.amountFen} > 0`),
  ],
);

export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
});
