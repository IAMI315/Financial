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

export type DefaultCategoryTemplate = { type: TransactionType; name: string };
export type DefaultSubcategoryTemplate = { type: TransactionType; parentName: string; name: string };
export type DefaultCategoryConfigItem = {
  id: string;
  type: TransactionType;
  name: string;
  children: Array<{ id: string; name: string }>;
};

export const DEFAULT_CATEGORY_CONFIG_KEY = 'default_category_config_v1';

const defaultCategories: DefaultCategoryTemplate[] = [
  ...['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '学习', '通讯', '生活缴费', '人情/礼物', '其他', '经营'].map(
    (name) => ({ type: 'expense' as const, name }),
  ),
  ...['工资', '奖金', '兼职', '退款', '红包/礼金', '其他', '补贴', '经营'].map((name) => ({
    type: 'income' as const,
    name,
  })),
];

const defaultSubcategories: DefaultSubcategoryTemplate[] = [
  ...['早餐', '中餐', '晚餐'].map((name) => ({ type: 'expense' as const, parentName: '餐饮', name })),
  ...['公交', '地铁', '打车', '加油'].map((name) => ({ type: 'expense' as const, parentName: '交通', name })),
  ...['日用品', '服饰', '数码'].map((name) => ({ type: 'expense' as const, parentName: '购物', name })),
  ...['房租', '物业', '维修'].map((name) => ({ type: 'expense' as const, parentName: '居住', name })),
  ...['电影', '游戏', '旅游'].map((name) => ({ type: 'expense' as const, parentName: '娱乐', name })),
  ...['药品', '门诊'].map((name) => ({ type: 'expense' as const, parentName: '医疗', name })),
  ...['书籍', '课程'].map((name) => ({ type: 'expense' as const, parentName: '学习', name })),
  ...['话费', '宽带'].map((name) => ({ type: 'expense' as const, parentName: '通讯', name })),
  ...['进货', '推广', '设备'].map((name) => ({ type: 'expense' as const, parentName: '经营', name })),
  ...['基本工资', '加班工资'].map((name) => ({ type: 'income' as const, parentName: '工资', name })),
  ...['餐补', '交通补贴', '住房补贴'].map((name) => ({ type: 'income' as const, parentName: '补贴', name })),
  ...['商品销售', '服务收入', '其他经营收入'].map((name) => ({ type: 'income' as const, parentName: '经营', name })),
];

function builtInDefaultCategoryConfig(): DefaultCategoryConfigItem[] {
  return defaultCategories.map((category) => ({
    id: `builtin:${category.type}:${category.name}`,
    type: category.type,
    name: category.name,
    children: defaultSubcategories
      .filter((child) => child.type === category.type && child.parentName === category.name)
      .map((child) => ({ id: `builtin:${child.type}:${child.parentName}:${child.name}`, name: child.name })),
  }));
}

function isDefaultCategoryConfig(value: unknown): value is DefaultCategoryConfigItem[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const root of value) {
    if (!root || typeof root !== 'object') return false;
    const item = root as Record<string, unknown>;
    if (typeof item.id !== 'string' || ids.has(item.id)) return false;
    if (item.type !== 'expense' && item.type !== 'income') return false;
    if (typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.length > 40) return false;
    if (!Array.isArray(item.children)) return false;
    ids.add(item.id);
    for (const child of item.children) {
      if (!child || typeof child !== 'object') return false;
      const childItem = child as Record<string, unknown>;
      if (typeof childItem.id !== 'string' || ids.has(childItem.id)) return false;
      if (typeof childItem.name !== 'string' || childItem.name.trim().length === 0 || childItem.name.length > 40) return false;
      ids.add(childItem.id);
    }
  }
  return true;
}

export function getDefaultCategoryConfig(handle: DatabaseHandle): DefaultCategoryConfigItem[] {
  const raw = getSetting(handle, DEFAULT_CATEGORY_CONFIG_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isDefaultCategoryConfig(parsed)) return parsed.map((root) => ({ ...root, children: root.children.map((child) => ({ ...child })) }));
    } catch {
      // Fall back to the built-in defaults if the setting is corrupted.
    }
  }
  return builtInDefaultCategoryConfig();
}

export function setDefaultCategoryConfig(handle: DatabaseHandle, categories: DefaultCategoryConfigItem[]): void {
  setSetting(handle, DEFAULT_CATEGORY_CONFIG_KEY, JSON.stringify(categories));
}

export const DEFAULT_CATEGORY_MIGRATIONS: ReadonlyArray<{
  version: number;
  categories: ReadonlyArray<DefaultCategoryTemplate>;
}> = [
  {
    version: 2,
    categories: [
      { type: 'expense', name: '经营' },
      { type: 'income', name: '补贴' },
      { type: 'income', name: '经营' },
    ],
  },
  {
    version: 3,
    categories: [{ type: 'income', name: '工资' }],
  },
];

export const DEFAULT_SUBCATEGORY_MIGRATIONS: ReadonlyArray<{
  version: number;
  categories: ReadonlyArray<DefaultSubcategoryTemplate>;
}> = [{ version: 4, categories: defaultSubcategories }];

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
  const insertRoot = handle.sqlite.prepare(
    `insert into categories (user_id, type, name, parent_id, is_archived, sort_order, created_at, updated_at)
     values (?, ?, ?, null, 0, ?, ?, ?)`,
  );
  const insertChild = handle.sqlite.prepare(
    `insert into categories (user_id, type, name, parent_id, is_archived, sort_order, created_at, updated_at)
     values (?, ?, ?, ?, 0, ?, ?, ?)`,
  );
  const now = Date.now();
  const config = getDefaultCategoryConfig(handle);
  handle.sqlite.transaction(() => {
    const rootSortOrders: Record<TransactionType, number> = { expense: 0, income: 0 };
    for (const category of config) {
      const info = insertRoot.run(userId, category.type, category.name, rootSortOrders[category.type]++, now, now);
      const parentId = Number(info.lastInsertRowid);
      category.children.forEach((child, index) => {
        insertChild.run(userId, category.type, child.name, parentId, index, now, now);
      });
    }
  })();
}

export function syncDefaultCategoryAdditions(
  handle: DatabaseHandle,
  userId: number,
  additions: ReadonlyArray<DefaultCategoryTemplate>,
): number {
  const roots = handle.sqlite
    .prepare('select type, name, sort_order from categories where user_id = ? and parent_id is null')
    .all(userId) as Array<{ type: TransactionType; name: string; sort_order: number }>;
  const existing = new Set(roots.map((category) => `${category.type}\u0000${category.name}`));
  const nextSortOrder: Record<TransactionType, number> = {
    expense: Math.max(-1, ...roots.filter((category) => category.type === 'expense').map((category) => Number(category.sort_order))) + 1,
    income: Math.max(-1, ...roots.filter((category) => category.type === 'income').map((category) => Number(category.sort_order))) + 1,
  };
  const insert = handle.sqlite.prepare(
    `insert into categories (user_id, type, name, parent_id, is_archived, sort_order, created_at, updated_at)
     values (?, ?, ?, null, 0, ?, ?, ?)`,
  );
  const now = Date.now();
  let inserted = 0;
  for (const category of additions) {
    const key = `${category.type}\u0000${category.name}`;
    if (existing.has(key)) continue;
    insert.run(userId, category.type, category.name, nextSortOrder[category.type]++, now, now);
    existing.add(key);
    inserted += 1;
  }
  return inserted;
}

export function syncDefaultSubcategoryAdditions(
  handle: DatabaseHandle,
  userId: number,
  additions: ReadonlyArray<DefaultSubcategoryTemplate>,
): number {
  const roots = handle.sqlite
    .prepare('select id, type, name, is_archived from categories where user_id = ? and parent_id is null')
    .all(userId) as Array<{ id: number; type: TransactionType; name: string; is_archived: number }>;
  const parentIds = new Map(
    roots
      .filter((category) => !category.is_archived)
      .map((category) => [`${category.type}\u0000${category.name}`, Number(category.id)]),
  );
  const children = handle.sqlite
    .prepare('select parent_id, name, sort_order from categories where user_id = ? and parent_id is not null')
    .all(userId) as Array<{ parent_id: number; name: string; sort_order: number }>;
  const existing = new Set(children.map((category) => `${category.parent_id}\u0000${category.name}`));
  const nextSortOrder = new Map<number, number>();
  for (const category of children) {
    nextSortOrder.set(
      Number(category.parent_id),
      Math.max(nextSortOrder.get(Number(category.parent_id)) ?? 0, Number(category.sort_order) + 1),
    );
  }
  const insert = handle.sqlite.prepare(
    `insert into categories (user_id, type, name, parent_id, is_archived, sort_order, created_at, updated_at)
     values (?, ?, ?, ?, 0, ?, ?, ?)`,
  );
  const now = Date.now();
  let inserted = 0;
  for (const category of additions) {
    const parentId = parentIds.get(`${category.type}\u0000${category.parentName}`);
    if (parentId == null) continue;
    const key = `${parentId}\u0000${category.name}`;
    if (existing.has(key)) continue;
    const sortOrder = nextSortOrder.get(parentId) ?? 0;
    insert.run(userId, category.type, category.name, parentId, sortOrder, now, now);
    nextSortOrder.set(parentId, sortOrder + 1);
    existing.add(key);
    inserted += 1;
  }
  return inserted;
}

export function reorderNamedSubcategories(
  handle: DatabaseHandle,
  userId: number,
  type: TransactionType,
  parentName: string,
  orderedNames: ReadonlyArray<string>,
): boolean {
  const parent = handle.sqlite
    .prepare('select id from categories where user_id = ? and type = ? and parent_id is null and name = ? limit 1')
    .get(userId, type, parentName) as { id: number } | undefined;
  if (!parent) return false;
  const children = handle.sqlite
    .prepare('select id, name from categories where user_id = ? and parent_id = ? order by sort_order, name, id')
    .all(userId, parent.id) as Array<{ id: number; name: string }>;
  const rank = new Map(orderedNames.map((name, index) => [name, index]));
  const ordered = [...children].sort((a, b) => {
    const aRank = rank.get(a.name);
    const bRank = rank.get(b.name);
    if (aRank != null && bRank != null) return aRank - bRank;
    if (aRank != null) return -1;
    if (bRank != null) return 1;
    return children.indexOf(a) - children.indexOf(b);
  });
  const update = handle.sqlite.prepare('update categories set sort_order = ?, updated_at = ? where id = ? and user_id = ?');
  const now = Date.now();
  handle.sqlite.transaction(() => ordered.forEach((child, index) => update.run(index, now, child.id, userId)))();
  return true;
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
  const parentId = input.parentId ?? null;
  let sortOrder = input.sortOrder;
  if (sortOrder == null) {
    const row = parentId == null
      ? (handle.sqlite.prepare('select coalesce(max(sort_order), -1) + 1 as next from categories where user_id = ? and type = ? and parent_id is null').get(userId, input.type) as { next: number })
      : (handle.sqlite.prepare('select coalesce(max(sort_order), -1) + 1 as next from categories where user_id = ? and parent_id = ?').get(userId, parentId) as { next: number });
    sortOrder = Number(row.next);
  }
  const info = handle.sqlite
    .prepare(
      `insert into categories (user_id, type, name, parent_id, is_archived, sort_order, created_at, updated_at)
       values (?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(userId, input.type, input.name, parentId, sortOrder, now, now);
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

export function reorderCategories(handle: DatabaseHandle, userId: number, orderedIds: ReadonlyArray<number>): boolean {
  if (orderedIds.length === 0 || new Set(orderedIds).size !== orderedIds.length) return false;
  const categories = listCategories(handle, userId);
  const byId = new Map(categories.map((category) => [category.id, category]));
  const first = byId.get(orderedIds[0]!);
  if (!first) return false;
  const siblings = categories.filter((category) => category.type === first.type && category.parentId === first.parentId);
  if (siblings.length !== orderedIds.length) return false;
  if (!orderedIds.every((id) => {
    const category = byId.get(id);
    return category?.type === first.type && category.parentId === first.parentId;
  })) return false;
  const siblingIds = new Set(siblings.map((category) => category.id));
  if (!orderedIds.every((id) => siblingIds.has(id))) return false;
  const update = handle.sqlite.prepare('update categories set sort_order = ?, updated_at = ? where id = ? and user_id = ?');
  const now = Date.now();
  handle.sqlite.transaction(() => orderedIds.forEach((id, index) => update.run(index, now, id, userId)))();
  return true;
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
  const rows = handle.sqlite
    .prepare(
      `select t.*, c.name as category_name, sc.name as subcategory_name
       from transactions t
       join categories c on c.id = t.category_id
       left join categories sc on sc.id = t.subcategory_id
       where t.user_id = ? and t.occurred_at >= ? and t.occurred_at < ?
       order by t.occurred_at desc, t.id desc`,
    )
    .all(userId, from, to) as Array<Record<string, unknown>>;
  return rows.map(mapTransaction);
}

export function getTransactionStatsForRange(handle: DatabaseHandle, userId: number, from: number, to: number) {
  const totals = handle.sqlite
    .prepare(
      `select
         coalesce(sum(case when type = 'income' then amount_fen else 0 end), 0) as income_fen,
         coalesce(sum(case when type = 'expense' then amount_fen else 0 end), 0) as expense_fen
       from transactions
       where user_id = ? and occurred_at >= ? and occurred_at < ?`,
    )
    .get(userId, from, to) as { income_fen: number; expense_fen: number };

  const categoryRows = handle.sqlite
    .prepare(
      `select t.type, t.category_id as id, c.name, sum(t.amount_fen) as amount_fen
       from transactions t
       join categories c on c.id = t.category_id
       where t.user_id = ? and t.occurred_at >= ? and t.occurred_at < ?
       group by t.type, t.category_id, c.name
       order by amount_fen desc`,
    )
    .all(userId, from, to) as Array<{ type: TransactionType; id: number; name: string; amount_fen: number }>;

  const subcategoryRows = handle.sqlite
    .prepare(
      `select t.type, t.subcategory_id as id, t.category_id as parent_id, sc.name, sum(t.amount_fen) as amount_fen
       from transactions t
       join categories sc on sc.id = t.subcategory_id
       where t.user_id = ? and t.occurred_at >= ? and t.occurred_at < ? and t.subcategory_id is not null
       group by t.type, t.subcategory_id, t.category_id, sc.name
       order by amount_fen desc`,
    )
    .all(userId, from, to) as Array<{
      type: TransactionType;
      id: number;
      parent_id: number;
      name: string;
      amount_fen: number;
    }>;

  const dailyRows = handle.sqlite
    .prepare(
      `select strftime('%Y-%m-%d', occurred_at / 1000.0, 'unixepoch', '+8 hours') as date,
              sum(amount_fen) as amount_fen
       from transactions
       where user_id = ? and type = 'expense' and occurred_at >= ? and occurred_at < ?
       group by date
       order by date`,
    )
    .all(userId, from, to) as Array<{ date: string; amount_fen: number }>;

  const mapCategory = (row: (typeof categoryRows)[number]) => ({
    id: Number(row.id),
    name: row.name,
    amountFen: Number(row.amount_fen),
  });

  return {
    incomeFen: Number(totals.income_fen),
    expenseFen: Number(totals.expense_fen),
    incomeCategories: categoryRows.filter((row) => row.type === 'income').map(mapCategory),
    expenseCategories: categoryRows.filter((row) => row.type === 'expense').map(mapCategory),
    subcategories: subcategoryRows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      parentId: Number(row.parent_id),
      amountFen: Number(row.amount_fen),
      type: row.type,
    })),
    dailyExpense: dailyRows.map((row) => ({ date: row.date, amountFen: Number(row.amount_fen) })),
  };
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
