import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateDatabase } from './migrate.js';
import {
  createCategory,
  createUser,
  DEFAULT_CATEGORY_MIGRATIONS,
  DEFAULT_SUBCATEGORY_MIGRATIONS,
  listCategories,
  reorderNamedSubcategories,
  syncDefaultCategoryAdditions,
  syncDefaultSubcategoryAdditions,
  updateCategory,
} from './repositories.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('database migrations', () => {
  it('initializes a fresh SQLite database from migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'financial-ledger-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'ledger.db');

    const handle = migrateDatabase(databasePath);
    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(String(handle.sqlite.pragma('journal_mode', { simple: true })).toLowerCase()).toBe(
      'wal',
    );
    const rows = handle.sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
      )
      .all() as Array<{ name: string }>;
    handle.sqlite.close();

    const names = rows.map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining([
        '__drizzle_migrations',
        'categories',
        'common_transaction_pins',
        'import_batches',
        'sessions',
        'system_settings',
        'transactions',
        'users',
      ]),
    );

    const rerun = migrateDatabase(databasePath);
    const migrationCount = rerun.sqlite
      .prepare('select count(*) as count from __drizzle_migrations')
      .get() as { count: number };
    expect(migrationCount.count).toBe(3);
    const transactionIndexes = rerun.sqlite
      .prepare("select name from sqlite_master where type = 'index' and name like 'transactions_%' order by name")
      .all() as Array<{ name: string }>;
    expect(transactionIndexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'transactions_user_type_time_idx',
        'transactions_user_category_time_idx',
        'transactions_user_subcategory_time_idx',
        'transactions_duplicate_lookup_idx',
        'transactions_subcategory_idx',
      ]),
    );
    rerun.sqlite.close();
  });

  it('syncs newly introduced default categories to existing users without duplicates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'financial-ledger-defaults-'));
    tempDirs.push(dir);
    const handle = migrateDatabase(join(dir, 'ledger.db'));
    const user = createUser(handle, {
      username: 'existing-user',
      usernameNormalized: 'existing-user',
      email: null,
      emailNormalized: null,
      passwordHash: 'test-hash',
    });
    createCategory(handle, user.id, { type: 'expense', name: '经营', parentId: null, sortOrder: 0 });

    const migrationV2 = DEFAULT_CATEGORY_MIGRATIONS.find((item) => item.version === 2);
    const migrationV3 = DEFAULT_CATEGORY_MIGRATIONS.find((item) => item.version === 3);
    expect(migrationV2).toBeDefined();
    expect(migrationV3).toBeDefined();
    expect(syncDefaultCategoryAdditions(handle, user.id, migrationV2!.categories)).toBe(2);
    expect(syncDefaultCategoryAdditions(handle, user.id, migrationV2!.categories)).toBe(0);
    expect(syncDefaultCategoryAdditions(handle, user.id, migrationV3!.categories)).toBe(1);
    expect(syncDefaultCategoryAdditions(handle, user.id, migrationV3!.categories)).toBe(0);

    const categories = listCategories(handle, user.id);
    expect(categories.filter((item) => item.type === 'expense' && item.name === '经营')).toHaveLength(1);
    expect(categories.filter((item) => item.type === 'income' && item.name === '工资')).toHaveLength(1);
    expect(categories.filter((item) => item.type === 'income' && item.name === '补贴')).toHaveLength(1);
    expect(categories.filter((item) => item.type === 'income' && item.name === '经营')).toHaveLength(1);

    const dining = createCategory(handle, user.id, { type: 'expense', name: '餐饮', parentId: null, sortOrder: 1 });
    const wage = categories.find((item) => item.type === 'income' && item.name === '工资' && item.parentId === null);
    expect(wage).toBeDefined();
    createCategory(handle, user.id, { type: 'expense', name: '早餐', parentId: dining.id, sortOrder: 0 });
    const subcategoryMigration = DEFAULT_SUBCATEGORY_MIGRATIONS.find((item) => item.version === 4);
    expect(subcategoryMigration).toBeDefined();
    expect(syncDefaultSubcategoryAdditions(handle, user.id, subcategoryMigration!.categories)).toBe(13);
    expect(syncDefaultSubcategoryAdditions(handle, user.id, subcategoryMigration!.categories)).toBe(0);
    const synced = listCategories(handle, user.id);
    expect(synced.filter((item) => item.parentId === dining.id).map((item) => item.name)).toEqual(['早餐', '中餐', '晚餐']);
    const diningChildren = synced.filter((item) => item.parentId === dining.id);
    updateCategory(handle, user.id, diningChildren.find((item) => item.name === '早餐')!.id, { sortOrder: 2 });
    updateCategory(handle, user.id, diningChildren.find((item) => item.name === '中餐')!.id, { sortOrder: 0 });
    updateCategory(handle, user.id, diningChildren.find((item) => item.name === '晚餐')!.id, { sortOrder: 1 });
    expect(reorderNamedSubcategories(handle, user.id, 'expense', '餐饮', ['早餐', '中餐', '晚餐'])).toBe(true);
    expect(listCategories(handle, user.id).filter((item) => item.parentId === dining.id).map((item) => item.name)).toEqual(['早餐', '中餐', '晚餐']);
    expect(synced.filter((item) => item.parentId === wage!.id).map((item) => item.name)).toEqual(['基本工资', '加班工资']);
    handle.sqlite.close();
  });
});
