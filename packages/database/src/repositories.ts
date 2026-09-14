import type { DatabaseHandle } from './database.js';

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'disabled';
export type TransactionType = 'income' | 'expense';

export type UserRecord = {
  id: number;
  username: string;
  usernameNormalized: string;
  email: string | null;
  emailNormalized: string | null;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type CategoryRecord = {
  id: number;
  userId: number;
  type: TransactionType;
  name: string;
  parentId: number | null;
  isArchived: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type TransactionRecord = {
  id: number;
  userId: number;
  type: TransactionType;
  amountFen: number;
  categoryId: number;
  categoryName: string;
  subcategoryId: number | null;
  subcategoryName: string | null;
  occurredAt: number;
  note: string | null;
  importBatchId: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TransactionFilters = {
  from?: number | undefined;
  to?: number | undefined;
  type?: TransactionType | undefined;
  categoryId?: number | undefined;
  subcategoryId?: number | undefined;
  keyword?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

export type NewTransaction = {
  type: TransactionType;
  amountFen: number;
  categoryId: number;
  subcategoryId?: number | null | undefined;
  occurredAt: number;
  note?: string | null | undefined;
  importBatchId?: number | null | undefined;
};

const defaultCategories: Array<{ type: TransactionType; name: string }> = [
  ...['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '学习', '通讯', '生活缴费', '人情/礼物', '其他'].map(
    (name) => ({ type: 'expense' as const, name }),
  ),
  ...['工资', '奖金', '兼职', '退款', '红包/礼金', '其他'].map((name) => ({
    type: 'income' as const,
    name,
  })),
];

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: Number(row.id),
    username: String(row.username),
    usernameNormalized: String(row.username_normalized),
    email: row.email == null ? null : String(row.email),
    emailNormalized: row.email_normalized == null ? null : String(row.email_normalized),
    passwordHash: String(row.password_hash),
    role: row.role as UserRole,
    status: row.status as UserStatus,
    mustChangePassword: Boolean(row.must_change_password),
    temporaryPasswordExpiresAt:
      row.temporary_password_expires_at == null ? null : Number(row.temporary_password_expires_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapCategory(row: Record<string, unknown>): CategoryRecord {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    type: row.type as TransactionType,
    name: String(row.name),
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    isArchived: Boolean(row.is_archived),
    sortOrder: Number(row.sort_order),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapTransaction(row: Record<string, unknown>): TransactionRecord {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    type: row.type as TransactionType,
    amountFen: Number(row.amount_fen),
    categoryId: Number(row.category_id),
    categoryName: String(row.category_name),
    subcategoryId: row.subcategory_id == null ? null : Number(row.subcategory_id),
    subcategoryName: row.subcategory_name == null ? null : String(row.subcategory_name),
    occurredAt: Number(row.occurred_at),
    note: row.note == null ? null : String(row.note),
    importBatchId: row.import_batch_id == null ? null : Number(row.import_batch_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function countAdmins(handle: DatabaseHandle): number {
  const row = handle.sqlite.prepare("select count(*) as count from users where role = 'admin'").get() as {
    count: number;
  };
  return Number(row.count);
}

export function getUserById(handle: DatabaseHandle, id: number): UserRecord | null {
  const row = handle.sqlite.prepare('select * from users where id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUser(row) : null;
}

export function getUserByLogin(handle: DatabaseHandle, loginNormalized: string): UserRecord | null {
  const row = handle.sqlite
    .prepare('select * from users where username_normalized = ? or email_normalized = ? limit 1')
    .get(loginNormalized, loginNormalized) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function createUser(
  handle: DatabaseHandle,
  input: {
    username: string;
    usernameNormalized: string;
    email: string | null;
    emailNormalized: string | null;
    passwordHash: string;
    role?: UserRole;
  },
): UserRecord {
  const now = Date.now();
  const info = handle.sqlite
    .prepare(
      `insert into users
        (username, username_normalized, email, email_normalized, password_hash, role, status, must_change_password, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
    )
    .run(
      input.username,
      input.usernameNormalized,
      input.email,
      input.emailNormalized,
      input.passwordHash,
      input.role ?? 'user',
      now,
      now,
    );
  const user = getUserById(handle, Number(info.lastInsertRowid));
  if (!user) throw new Error('Failed to read newly created user');
  return user;
}

export function createDefaultCategories(handle: DatabaseHandle, userId: number): void {
  const insert = handle.sqlite.prepare(
    `insert into categories (user_id, type, name, parent_id, is_archived, sort_order, created_at, updated_at)
     values (?, ?, ?, null, 0, ?, ?, ?)`,
  );
  const now = Date.now();
  handle.sqlite.transaction(() => {
    defaultCategories.forEach((category, index) => {
      insert.run(userId, category.type, category.name, index, now, now);
    });
  })();
}

export function listUsers(handle: DatabaseHandle): UserRecord[] {
  const rows = handle.sqlite.prepare('select * from users order by created_at desc, id desc').all() as Array<
    Record<string, unknown>
  >;
  return rows.map(mapUser);
}

export function updateUserPassword(
  handle: DatabaseHandle,
  userId: number,
  passwordHash: string,
  options: { mustChangePassword?: boolean; temporaryPasswordExpiresAt?: number | null } = {},
): void {
  handle.sqlite
    .prepare(
      `update users set password_hash = ?, must_change_password = ?, temporary_password_expires_at = ?, updated_at = ? where id = ?`,
    )
    .run(
      passwordHash,
      options.mustChangePassword ? 1 : 0,
      options.temporaryPasswordExpiresAt ?? null,
      Date.now(),
      userId,
    );
}

export function setUserStatus(handle: DatabaseHandle, userId: number, status: UserStatus): void {
  handle.sqlite.prepare('update users set status = ?, updated_at = ? where id = ?').run(status, Date.now(), userId);
}

export function deleteUser(handle: DatabaseHandle, userId: number): boolean {
  return handle.sqlite.prepare("delete from users where id = ? and role <> 'admin'").run(userId).changes > 0;
}

export function createSession(handle: DatabaseHandle, input: { id: string; userId: number; tokenHash: string }): void {
  const now = Date.now();
  handle.sqlite
    .prepare(
      'insert into sessions (id, user_id, token_hash, created_at, last_seen_at, revoked_at) values (?, ?, ?, ?, ?, null)',
    )
    .run(input.id, input.userId, input.tokenHash, now, now);
}

export function getSessionUserByTokenHash(
  handle: DatabaseHandle,
  tokenHash: string,
): { sessionId: string; user: UserRecord } | null {
  const row = handle.sqlite
    .prepare(
      `select s.id as session_id, u.* from sessions s join users u on u.id = s.user_id
       where s.token_hash = ? and s.revoked_at is null limit 1`,
    )
    .get(tokenHash) as Record<string, unknown> | undefined;
  if (!row) return null;
  handle.sqlite.prepare('update sessions set last_seen_at = ? where id = ?').run(Date.now(), row.session_id);
  return { sessionId: String(row.session_id), user: mapUser(row) };
}

export function revokeSession(handle: DatabaseHandle, sessionId: string): void {
  handle.sqlite.prepare('update sessions set revoked_at = ? where id = ? and revoked_at is null').run(Date.now(), sessionId);
}

export function revokeUserSessions(handle: DatabaseHandle, userId: number, exceptSessionId?: string): void {
  const now = Date.now();
  if (exceptSessionId) {
    handle.sqlite
      .prepare('update sessions set revoked_at = ? where user_id = ? and id <> ? and revoked_at is null')
      .run(now, userId, exceptSessionId);
  } else {
    handle.sqlite
      .prepare('update sessions set revoked_at = ? where user_id = ? and revoked_at is null')
      .run(now, userId);
  }
}

export function listActiveSessions(handle: DatabaseHandle): Array<{
  id: string;
  userId: number;
  tokenHash: string;
  createdAt: number;
  lastSeenAt: number;
}> {
  return handle.sqlite
    .prepare(
      'select id, user_id as userId, token_hash as tokenHash, created_at as createdAt, last_seen_at as lastSeenAt from sessions where revoked_at is null',
    )
    .all() as Array<{ id: string; userId: number; tokenHash: string; createdAt: number; lastSeenAt: number }>;
}

export function restoreSession(
  handle: DatabaseHandle,
  session: { id: string; userId: number; tokenHash: string; createdAt: number; lastSeenAt: number },
): void {
  const user = getUserById(handle, session.userId);
  if (!user || user.status !== 'active') return;
  handle.sqlite
    .prepare(
      `insert into sessions (id, user_id, token_hash, created_at, last_seen_at, revoked_at)
       values (?, ?, ?, ?, ?, null)
       on conflict(id) do update set token_hash = excluded.token_hash, last_seen_at = excluded.last_seen_at, revoked_at = null`,
    )
    .run(session.id, session.userId, session.tokenHash, session.createdAt, session.lastSeenAt);
}

export function getSetting(handle: DatabaseHandle, key: string): string | null {
  const row = handle.sqlite.prepare('select value from system_settings where key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(handle: DatabaseHandle, key: string, value: string): void {
  handle.sqlite
    .prepare(
      `insert into system_settings (key, value, updated_at) values (?, ?, ?)
       on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, Date.now());
}

export function listCategories(handle: DatabaseHandle, userId: number, includeArchived = true): CategoryRecord[] {
  const rows = handle.sqlite
    .prepare(
      `select * from categories where user_id = ? ${includeArchived ? '' : 'and is_archived = 0'} order by type, parent_id is not null, sort_order, name`,
    )
    .all(userId) as Array<Record<string, unknown>>;
  return rows.map(mapCategory);
}

export function getCategory(handle: DatabaseHandle, userId: number, categoryId: number): CategoryRecord | null {
  const row = handle.sqlite
    .prepare('select * from categories where id = ? and user_id = ?')
    .get(categoryId, userId) as Record<string, unknown> | undefined;
  return row ? mapCategory(row) : null;
}

export function createCategory(
  handle: DatabaseHandle,
  userId: number,
  input: {
    type: TransactionType;
    name: string;
    parentId?: number | null | undefined;
    sortOrder?: number | undefined;
  },
): CategoryRecord {
  const now = Date.now();
  const info = handle.sqlite
    .prepare(
      `insert into categories (user_id, type, name, parent_id, is_archived, sort_order, created_at, updated_at)
       values (?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(userId, input.type, input.name, input.parentId ?? null, input.sortOrder ?? 0, now, now);
  const category = getCategory(handle, userId, Number(info.lastInsertRowid));
  if (!category) throw new Error('Failed to read newly created category');
  return category;
}

export function updateCategory(
  handle: DatabaseHandle,
  userId: number,
  categoryId: number,
  input: {
    name?: string | undefined;
    isArchived?: boolean | undefined;
    sortOrder?: number | undefined;
  },
): CategoryRecord | null {
  const current = getCategory(handle, userId, categoryId);
  if (!current) return null;
  handle.sqlite
    .prepare('update categories set name = ?, is_archived = ?, sort_order = ?, updated_at = ? where id = ? and user_id = ?')
    .run(
      input.name ?? current.name,
      input.isArchived == null ? (current.isArchived ? 1 : 0) : input.isArchived ? 1 : 0,
      input.sortOrder ?? current.sortOrder,
      Date.now(),
      categoryId,
      userId,
    );
  return getCategory(handle, userId, categoryId);
}

export function deleteUnusedCategory(handle: DatabaseHandle, userId: number, categoryId: number): 'deleted' | 'used' | 'children' | 'not-found' {
  const category = getCategory(handle, userId, categoryId);
  if (!category) return 'not-found';
  const children = handle.sqlite.prepare('select count(*) as count from categories where parent_id = ? and user_id = ?').get(categoryId, userId) as { count: number };
  if (Number(children.count) > 0) return 'children';
  const used = handle.sqlite.prepare('select count(*) as count from transactions where user_id = ? and (category_id = ? or subcategory_id = ?)').get(userId, categoryId, categoryId) as { count: number };
  if (Number(used.count) > 0) return 'used';
  handle.sqlite.prepare('delete from categories where id = ? and user_id = ?').run(categoryId, userId);
  return 'deleted';
}

export function createTransaction(handle: DatabaseHandle, userId: number, input: NewTransaction): TransactionRecord {
  const now = Date.now();
  const info = handle.sqlite
    .prepare(
      `insert into transactions
       (user_id, type, amount_fen, category_id, subcategory_id, occurred_at, note, import_batch_id, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      input.type,
      input.amountFen,
      input.categoryId,
      input.subcategoryId ?? null,
      input.occurredAt,
      input.note ?? null,
      input.importBatchId ?? null,
      now,
      now,
    );
  const transaction = getTransaction(handle, userId, Number(info.lastInsertRowid));
  if (!transaction) throw new Error('Failed to read newly created transaction');
  return transaction;
}

export function getTransaction(handle: DatabaseHandle, userId: number, transactionId: number): TransactionRecord | null {
  const row = handle.sqlite
    .prepare(
      `select t.*, c.name as category_name, sc.name as subcategory_name
       from transactions t
       join categories c on c.id = t.category_id
       left join categories sc on sc.id = t.subcategory_id
       where t.id = ? and t.user_id = ?`,
    )
    .get(transactionId, userId) as Record<string, unknown> | undefined;
  return row ? mapTransaction(row) : null;
}

function transactionWhere(filters: TransactionFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.from != null) {
    clauses.push('t.occurred_at >= ?');
    params.push(filters.from);
  }
  if (filters.to != null) {
    clauses.push('t.occurred_at < ?');
    params.push(filters.to);
  }
  if (filters.type) {
    clauses.push('t.type = ?');
    params.push(filters.type);
  }
  if (filters.categoryId != null) {
    clauses.push('t.category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.subcategoryId != null) {
    clauses.push('t.subcategory_id = ?');
    params.push(filters.subcategoryId);
  }
  if (filters.keyword) {
    clauses.push("coalesce(t.note, '') like ? escape '\\'");
    const escaped = filters.keyword.replace(/[\\%_]/g, (value) => `\\${value}`);
    params.push(`%${escaped}%`);
  }
  return { sql: clauses.length ? ` and ${clauses.join(' and ')}` : '', params };
}

export function listTransactions(
  handle: DatabaseHandle,
  userId: number,
  filters: TransactionFilters = {},
): { items: TransactionRecord[]; total: number; page: number; pageSize: number } {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const where = transactionWhere(filters);
  const totalRow = handle.sqlite
    .prepare(`select count(*) as count from transactions t where t.user_id = ?${where.sql}`)
    .get(userId, ...where.params) as { count: number };
  const rows = handle.sqlite
    .prepare(
      `select t.*, c.name as category_name, sc.name as subcategory_name
       from transactions t
       join categories c on c.id = t.category_id
       left join categories sc on sc.id = t.subcategory_id
       where t.user_id = ?${where.sql}
       order by t.occurred_at desc, t.id desc limit ? offset ?`,
    )
    .all(userId, ...where.params, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>;
  return { items: rows.map(mapTransaction), total: Number(totalRow.count), page, pageSize };
}

export function listTransactionsForRange(handle: DatabaseHandle, userId: number, from: number, to: number): TransactionRecord[] {
  return listTransactions(handle, userId, { from, to, page: 1, pageSize: 100 }).items.concat(
    ...Array.from({ length: Math.max(0, Math.ceil((Number((handle.sqlite.prepare('select count(*) as count from transactions where user_id = ? and occurred_at >= ? and occurred_at < ?').get(userId, from, to) as { count: number }).count) - 100) / 100)) }, (_, index) =>
      listTransactions(handle, userId, { from, to, page: index + 2, pageSize: 100 }).items,
    ),
  );
}

export function updateTransaction(
  handle: DatabaseHandle,
  userId: number,
  transactionId: number,
  input: NewTransaction,
): TransactionRecord | null {
  const existing = getTransaction(handle, userId, transactionId);
  if (!existing) return null;
  handle.sqlite
    .prepare(
      `update transactions set type = ?, amount_fen = ?, category_id = ?, subcategory_id = ?, occurred_at = ?, note = ?, updated_at = ?
       where id = ? and user_id = ?`,
    )
    .run(
      input.type,
      input.amountFen,
      input.categoryId,
      input.subcategoryId ?? null,
      input.occurredAt,
      input.note ?? null,
      Date.now(),
      transactionId,
      userId,
    );
  return getTransaction(handle, userId, transactionId);
}

export function deleteTransaction(handle: DatabaseHandle, userId: number, transactionId: number): boolean {
  return handle.sqlite.prepare('delete from transactions where id = ? and user_id = ?').run(transactionId, userId).changes > 0;
}

export function findPotentialDuplicates(
  handle: DatabaseHandle,
  userId: number,
  input: { type: TransactionType; amountFen: number; occurredAt: number; toleranceMs?: number; excludeId?: number },
): TransactionRecord[] {
  const tolerance = input.toleranceMs ?? 5 * 60 * 1000;
  const excludeSql = input.excludeId == null ? '' : ' and t.id <> ?';
  const params: unknown[] = [userId, input.type, input.amountFen, input.occurredAt - tolerance, input.occurredAt + tolerance];
  if (input.excludeId != null) params.push(input.excludeId);
  const rows = handle.sqlite
    .prepare(
      `select t.*, c.name as category_name, sc.name as subcategory_name
       from transactions t join categories c on c.id = t.category_id left join categories sc on sc.id = t.subcategory_id
       where t.user_id = ? and t.type = ? and t.amount_fen = ? and t.occurred_at between ? and ?${excludeSql}
       order by abs(t.occurred_at - ?) asc limit 5`,
    )
    .all(...params, input.occurredAt) as Array<Record<string, unknown>>;
  return rows.map(mapTransaction);
}

export function createImportBatchWithTransactions(
  handle: DatabaseHandle,
  userId: number,
  sourceName: string | null,
  rows: NewTransaction[],
): { batchId: number; count: number } {
  return handle.sqlite.transaction(() => {
    const batch = handle.sqlite
      .prepare('insert into import_batches (user_id, source_name, created_at) values (?, ?, ?)')
      .run(userId, sourceName, Date.now());
    const batchId = Number(batch.lastInsertRowid);
    for (const row of rows) createTransaction(handle, userId, { ...row, importBatchId: batchId });
    return { batchId, count: rows.length };
  })();
}

export function rollbackImportBatch(handle: DatabaseHandle, userId: number, batchId: number): boolean {
  return handle.sqlite.transaction(() => {
    const exists = handle.sqlite.prepare('select id from import_batches where id = ? and user_id = ?').get(batchId, userId);
    if (!exists) return false;
    handle.sqlite.prepare('delete from transactions where import_batch_id = ? and user_id = ?').run(batchId, userId);
    handle.sqlite.prepare('delete from import_batches where id = ? and user_id = ?').run(batchId, userId);
    return true;
  })();
}

export function countUsers(handle: DatabaseHandle): number {
  return Number((handle.sqlite.prepare('select count(*) as count from users').get() as { count: number }).count);
}

export function countTransactions(handle: DatabaseHandle): number {
  return Number((handle.sqlite.prepare('select count(*) as count from transactions').get() as { count: number }).count);
}
