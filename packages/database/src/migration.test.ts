import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateDatabase } from './migrate.js';
import {
  createCategory,
  createUser,
  DEFAULT_CATEGORY_MIGRATIONS,
  listCategories,
  syncDefaultCategoryAdditions,
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
    expect(migrationCount.count).toBe(1);
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
    handle.sqlite.close();
  });
});
