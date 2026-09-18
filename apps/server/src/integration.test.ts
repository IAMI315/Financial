import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

let app: FastifyInstance;
let tempDir: string;

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') throw new Error('Missing set-cookie header');
  return value.split(';')[0]!;
}

async function register(username: string, email: string | null, password = 'password-12345') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, email, password },
  });
  expect(response.statusCode).toBe(201);
  return { cookie: cookieFrom(response), user: response.json().user as { id: number } };
}

async function login(loginName: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: loginName, password },
  });
  expect(response.statusCode).toBe(200);
  return cookieFrom(response);
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'financial-ledger-api-'));
  app = await buildApp(
    { logger: false },
    {
      nodeEnv: 'test',
      databasePath: join(tempDir, 'ledger.db'),
      backupDir: join(tempDir, 'backups'),
      appSecret: 'test-secret-123456789012345678901234567890',
      adminUsername: 'admin',
      adminPassword: 'test-admin-password',
      registrationOpen: true,
      appVersion: 'test',
    },
  );
});

afterEach(async () => {
  await app.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('V1 API integration', () => {
  it('registers users, copies categories and enforces transaction isolation', async () => {
    const a = await register('Alice_01', 'alice@example.com');
    const b = await register('Bob_01', 'bob@example.com');

    const categoriesA = await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie: a.cookie } });
    const categoriesB = await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie: b.cookie } });
    expect(categoriesA.statusCode).toBe(200);
    const itemsA = categoriesA.json().categories as Array<{ id: number; type: string; name: string; parentId: number | null }>;
    const itemsB = categoriesB.json().categories as Array<{ id: number; type: string; name: string; parentId: number | null }>;
    expect(itemsA.filter((category) => category.parentId === null)).toHaveLength(20);
    expect(itemsB.filter((category) => category.parentId === null)).toHaveLength(20);
    const dining = itemsA.find((category) => category.type === 'expense' && category.name === '餐饮' && category.parentId === null);
    expect(dining).toBeDefined();
    expect(itemsA.filter((category) => category.parentId === dining!.id).map((category) => category.name)).toEqual(['早餐', '中餐', '晚餐']);
    const expense = itemsA.find((category) => category.type === 'expense' && category.parentId === null);

    const created = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { cookie: a.cookie },
      payload: {
        type: 'expense',
        amount: '25.50',
        categoryId: expense!.id,
        occurredAtLocal: '2026-01-01T12:00:00',
        note: '午餐',
      },
    });
    expect(created.statusCode).toBe(201);
    const transactionId = created.json().transaction.id as number;

    for (const request of [
      { method: 'GET', url: `/api/transactions/${transactionId}` },
      { method: 'DELETE', url: `/api/transactions/${transactionId}` },
    ] as const) {
      const response = await app.inject({ ...request, headers: { cookie: b.cookie } });
      expect(response.statusCode).toBe(404);
    }

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { cookie: a.cookie },
      payload: {
        type: 'expense',
        amount: '25.50',
        categoryId: expense!.id,
        occurredAtLocal: '2026-01-01T12:01:00',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toBe('POTENTIAL_DUPLICATE');
  });

  it('filters same-name root categories across income and expense when type is all', async () => {
    const user = await register('SharedCategoryFilter', null);
    const categoriesResponse = await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie: user.cookie } });
    const categories = categoriesResponse.json().categories as Array<{ id: number; type: string; name: string; parentId: number | null }>;
    const expenseBusiness = categories.find((item) => item.type === 'expense' && item.name === '经营' && item.parentId === null)!;
    const incomeBusiness = categories.find((item) => item.type === 'income' && item.name === '经营' && item.parentId === null)!;

    for (const payload of [
      { type: 'expense', amount: '12.00', categoryId: expenseBusiness.id, occurredAtLocal: '2026-01-02T10:00:00' },
      { type: 'income', amount: '30.00', categoryId: incomeBusiness.id, occurredAtLocal: '2026-01-03T10:00:00' },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/transactions', headers: { cookie: user.cookie }, payload });
      expect(response.statusCode).toBe(201);
    }

    const combined = await app.inject({
      method: 'GET',
      url: '/api/transactions?categoryName=%E7%BB%8F%E8%90%A5&page=1&pageSize=100',
      headers: { cookie: user.cookie },
    });
    expect(combined.statusCode).toBe(200);
    expect(combined.json().total).toBe(2);
    expect(new Set(combined.json().items.map((item: { type: string }) => item.type))).toEqual(new Set(['income', 'expense']));

    const incomeOnly = await app.inject({
      method: 'GET',
      url: '/api/transactions?type=income&categoryName=%E7%BB%8F%E8%90%A5&page=1&pageSize=100',
      headers: { cookie: user.cookie },
    });
    expect(incomeOnly.statusCode).toBe(200);
    expect(incomeOnly.json().total).toBe(1);
    expect(incomeOnly.json().items[0]).toMatchObject({ type: 'income', categoryName: '经营' });
  });

  it('persists drag ordering independently for root and child categories', async () => {
    const user = await register('OrderUser', null);
    const response = await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie: user.cookie } });
    const categories = response.json().categories as Array<{ id: number; type: string; name: string; parentId: number | null }>;
    const expenseRoots = categories.filter((category) => category.type === 'expense' && category.parentId === null);
    const reversedRoots = [...expenseRoots].reverse();
    const reorderedRoots = await app.inject({ method: 'PUT', url: '/api/categories/reorder', headers: { cookie: user.cookie }, payload: { ids: reversedRoots.map((category) => category.id) } });
    expect(reorderedRoots.statusCode).toBe(200);
    expect((reorderedRoots.json().categories as typeof categories).filter((category) => category.type === 'expense' && category.parentId === null).map((category) => category.name)).toEqual(reversedRoots.map((category) => category.name));

    const dining = categories.find((category) => category.type === 'expense' && category.name === '餐饮' && category.parentId === null)!;
    const diningChildren = categories.filter((category) => category.parentId === dining.id);
    const reversedChildren = [...diningChildren].reverse();
    const reorderedChildren = await app.inject({ method: 'PUT', url: '/api/categories/reorder', headers: { cookie: user.cookie }, payload: { ids: reversedChildren.map((category) => category.id) } });
    expect(reorderedChildren.statusCode).toBe(200);
    expect((reorderedChildren.json().categories as typeof categories).filter((category) => category.parentId === dining.id).map((category) => category.name)).toEqual(reversedChildren.map((category) => category.name));

    const incomeRoot = categories.find((category) => category.type === 'income' && category.parentId === null)!;
    const invalid = await app.inject({ method: 'PUT', url: '/api/categories/reorder', headers: { cookie: user.cookie }, payload: { ids: [expenseRoots[0]!.id, incomeRoot.id] } });
    expect(invalid.statusCode).toBe(400);
  });

  it('lets only admins edit the default category template used by new accounts', async () => {
    const regular = await register('RegularUser', null);
    const forbidden = await app.inject({ method: 'GET', url: '/api/admin/default-categories', headers: { cookie: regular.cookie } });
    expect(forbidden.statusCode).toBe(403);

    const adminCookie = await login('admin', 'test-admin-password');
    const defaultsResponse = await app.inject({ method: 'GET', url: '/api/admin/default-categories', headers: { cookie: adminCookie } });
    expect(defaultsResponse.statusCode).toBe(200);
    type DefaultRoot = { id: string; type: 'income' | 'expense'; name: string; children: Array<{ id: string; name: string }> };
    const defaults = defaultsResponse.json().categories as DefaultRoot[];
    const dining = defaults.find((item) => item.type === 'expense' && item.name === '餐饮')!;
    expect(dining.children.map((item) => item.name)).toEqual(['早餐', '中餐', '晚餐']);
    const edited = defaults.map((item) => item.id === dining.id ? { ...item, children: [item.children[2]!, item.children[0]!, item.children[1]!] } : item);
    edited.push({ id: 'test-default-root', type: 'expense', name: '测试默认', children: [{ id: 'test-default-child', name: '测试子类' }] });
    const saved = await app.inject({ method: 'PUT', url: '/api/admin/default-categories', headers: { cookie: adminCookie }, payload: { categories: edited } });
    expect(saved.statusCode).toBe(200);

    const newUser = await register('AfterDefaultEdit', null);
    const newCategoriesResponse = await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie: newUser.cookie } });
    const newCategories = newCategoriesResponse.json().categories as Array<{ id: number; type: string; name: string; parentId: number | null }>;
    const newDining = newCategories.find((item) => item.type === 'expense' && item.name === '餐饮' && item.parentId === null)!;
    expect(newCategories.filter((item) => item.parentId === newDining.id).map((item) => item.name)).toEqual(['晚餐', '早餐', '中餐']);
    const customRoot = newCategories.find((item) => item.type === 'expense' && item.name === '测试默认' && item.parentId === null)!;
    expect(customRoot).toBeDefined();
    expect(newCategories.filter((item) => item.parentId === customRoot.id).map((item) => item.name)).toEqual(['测试子类']);
  });

  it('returns recent common transaction combinations ordered by frequency', async () => {
    const user = await register('CommonUser', null);
    const categoriesResponse = await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie: user.cookie } });
    const categories = categoriesResponse.json().categories as Array<{ id: number; name: string; type: string; parentId: number | null }>;
    const food = categories.find((category) => category.name === '餐饮' && category.type === 'expense' && category.parentId === null)!;
    const breakfast = categories.find((category) => category.name === '早餐' && category.parentId === food.id)!;
    const salary = categories.find((category) => category.name === '工资' && category.type === 'income' && category.parentId === null)!;
    for (const payload of [
      { type: 'expense', amount: '4.50', categoryId: food.id, subcategoryId: breakfast.id, occurredAtLocal: '2026-03-01T08:00:00' },
      { type: 'expense', amount: '4.50', categoryId: food.id, subcategoryId: breakfast.id, occurredAtLocal: '2026-03-02T08:00:00' },
      { type: 'income', amount: '20.00', categoryId: salary.id, occurredAtLocal: '2026-03-03T08:00:00' },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/transactions', headers: { cookie: user.cookie }, payload });
      expect(response.statusCode).toBe(201);
    }
    const common = await app.inject({ method: 'GET', url: '/api/transactions/common?limit=3', headers: { cookie: user.cookie } });
    expect(common.statusCode).toBe(200);
    expect(common.json().items[0]).toMatchObject({
      type: 'expense', amountFen: 450, amount: '4.50', categoryId: food.id, categoryName: '餐饮', subcategoryId: breakfast.id, subcategoryName: '早餐', usageCount: 2, isPinned: false,
    });
    expect(common.json().items[1]).toMatchObject({
      type: 'income', amountFen: 2000, amount: '20.00', categoryId: salary.id, categoryName: '工资', usageCount: 1, isPinned: false,
    });

    const pin = await app.inject({
      method: 'PUT',
      url: '/api/transactions/common/pin',
      headers: { cookie: user.cookie },
      payload: { type: 'income', amountFen: 2000, categoryId: salary.id, subcategoryId: null, pinned: true },
    });
    expect(pin.statusCode).toBe(200);
    expect(pin.json().items[0]).toMatchObject({ type: 'income', categoryId: salary.id, amountFen: 2000, isPinned: true });

    const persisted = await app.inject({ method: 'GET', url: '/api/transactions/common?limit=3', headers: { cookie: user.cookie } });
    expect(persisted.json().items[0]).toMatchObject({ type: 'income', categoryId: salary.id, isPinned: true });

    const unpin = await app.inject({
      method: 'PUT',
      url: '/api/transactions/common/pin',
      headers: { cookie: user.cookie },
      payload: { type: 'income', amountFen: 2000, categoryId: salary.id, subcategoryId: null, pinned: false },
    });
    expect(unpin.statusCode).toBe(200);
    expect(unpin.json().items[0]).toMatchObject({ type: 'expense', categoryId: food.id, amountFen: 450, isPinned: false });
  });

  it('calculates statistics and supports CSV import rollback atomically', async () => {
    const user = await register('StatsUser', null);
    const categoriesResponse = await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie: user.cookie } });
    const categories = categoriesResponse.json().categories as Array<{ id: number; name: string; type: string }>;
    const food = categories.find((category) => category.name === '餐饮' && category.type === 'expense')!;
    const salary = categories.find((category) => category.name === '工资' && category.type === 'income')!;

    for (const payload of [
      { type: 'expense', amount: '10.00', categoryId: food.id, occurredAtLocal: '2026-02-01T10:00:00' },
      { type: 'income', amount: '100.00', categoryId: salary.id, occurredAtLocal: '2026-02-02T10:00:00' },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/transactions', headers: { cookie: user.cookie }, payload });
      expect(response.statusCode).toBe(201);
    }

    const pagedTransactions = await app.inject({ method: 'GET', url: '/api/transactions?page=1&pageSize=1', headers: { cookie: user.cookie } });
    expect(pagedTransactions.statusCode).toBe(200);
    expect(pagedTransactions.json().items).toHaveLength(1);
    expect(pagedTransactions.json().balances).toEqual({
      daily: [
        { period: '2026-02-02', balanceFen: 10_000 },
        { period: '2026-02-01', balanceFen: -1_000 },
      ],
      monthly: [{ period: '2026-02', balanceFen: 9_000 }],
    });

    const stats = await app.inject({ method: 'GET', url: '/api/stats/monthly?month=2026-02', headers: { cookie: user.cookie } });
    const statsBody = stats.json();
    expect(statsBody).toMatchObject({ incomeFen: 10_000, expenseFen: 1_000, balanceFen: 9_000 });
    expect(statsBody.expenseCategories).toEqual([{ id: food.id, name: '餐饮', amountFen: 1_000 }]);
    expect(statsBody.incomeCategories).toEqual([{ id: salary.id, name: '工资', amountFen: 10_000 }]);
    expect(statsBody.dailyIncome).toEqual([{ date: '2026-02-02', amountFen: 10_000 }]);
    expect(statsBody.dailyExpense).toEqual([{ date: '2026-02-01', amountFen: 1_000 }]);

    const analysis = await app.inject({
      method: 'POST',
      url: '/api/imports/analyze',
      headers: { cookie: user.cookie },
      payload: {
        sourceName: 'sample.csv',
        csv: 'time,amount,category,note\n2026-02-03 09:30,12.34,餐饮,早餐\ninvalid,5.00,餐饮,bad',
        mapping: {
          timeColumn: 'time',
          amountColumn: 'amount',
          fixedType: 'expense',
          categoryColumn: 'category',
          categoryMap: { 餐饮: food.id },
          noteColumn: 'note',
        },
      },
    });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().summary).toMatchObject({ total: 2, valid: 1, invalid: 1 });
    const normalized = analysis.json().rows.find((row: { valid: boolean }) => row.valid).normalized;

    const commit = await app.inject({
      method: 'POST',
      url: '/api/imports/commit',
      headers: { cookie: user.cookie },
      payload: { sourceName: 'sample.csv', rows: [{ ...normalized, include: true }] },
    });
    expect(commit.statusCode).toBe(201);
    const batchId = commit.json().batchId as number;
    const rollback = await app.inject({ method: 'DELETE', url: `/api/imports/${batchId}`, headers: { cookie: user.cookie } });
    expect(rollback.statusCode).toBe(204);
  });

  it('enforces admin operations, session revocation and registration switch', async () => {
    const user = await register('ManagedUser', 'managed@example.com');
    const adminCookie = await login('admin', 'test-admin-password');

    const users = await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: adminCookie } });
    expect(users.statusCode).toBe(200);
    const managed = users.json().users.find((item: { username: string }) => item.username === 'ManagedUser');

    const disable = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${managed.id}/status`,
      headers: { cookie: adminCookie },
      payload: { status: 'disabled' },
    });
    expect(disable.statusCode).toBe(200);
    const revoked = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: user.cookie } });
    expect(revoked.statusCode).toBe(401);

    await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${managed.id}/status`,
      headers: { cookie: adminCookie },
      payload: { status: 'active' },
    });
    const reset = await app.inject({ method: 'POST', url: `/api/admin/users/${managed.id}/reset-password`, headers: { cookie: adminCookie } });
    expect(reset.statusCode).toBe(200);
    const temporaryPassword = reset.json().temporaryPassword as string;
    const temporaryLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'ManagedUser', password: temporaryPassword } });
    expect(temporaryLogin.statusCode).toBe(200);
    const secondUse = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'ManagedUser', password: temporaryPassword } });
    expect(secondUse.statusCode).toBe(401);

    const closeRegistration = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings/registration',
      headers: { cookie: adminCookie },
      payload: { open: false },
    });
    expect(closeRegistration.statusCode).toBe(200);
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'BlockedUser', password: 'password-12345' },
    });
    expect(blocked.statusCode).toBe(403);
  });

  it('creates, downloads and restores a database backup and rejects invalid restore files', async () => {
    const user = await register('BackupUser', null);
    const categoriesResponse = await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie: user.cookie } });
    const category = categoriesResponse.json().categories.find((item: { type: string }) => item.type === 'expense');
    const transaction = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { cookie: user.cookie },
      payload: { type: 'expense', amount: '8.88', categoryId: category.id, occurredAtLocal: '2026-03-01T10:00:00' },
    });
    const transactionId = transaction.json().transaction.id as number;
    const adminCookie = await login('admin', 'test-admin-password');
    const created = await app.inject({ method: 'POST', url: '/api/admin/backups', headers: { cookie: adminCookie } });
    expect(created.statusCode).toBe(201);
    const name = created.json().backup.name as string;
    const downloaded = await app.inject({ method: 'GET', url: `/api/admin/backups/${encodeURIComponent(name)}`, headers: { cookie: adminCookie } });
    expect(downloaded.statusCode).toBe(200);

    await app.inject({ method: 'DELETE', url: `/api/transactions/${transactionId}`, headers: { cookie: user.cookie } });
    expect((await app.inject({ method: 'GET', url: `/api/transactions/${transactionId}`, headers: { cookie: user.cookie } })).statusCode).toBe(404);

    const restored = await app.inject({
      method: 'POST',
      url: '/api/admin/backups/restore',
      headers: { cookie: adminCookie, 'content-type': 'application/octet-stream', 'x-confirm-restore': 'RESTORE' },
      payload: downloaded.rawPayload,
    });
    expect(restored.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/transactions/${transactionId}`, headers: { cookie: user.cookie } })).statusCode).toBe(200);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/admin/backups/restore',
      headers: { cookie: adminCookie, 'content-type': 'application/octet-stream', 'x-confirm-restore': 'RESTORE' },
      payload: Buffer.from('not-a-backup'),
    });
    expect(invalid.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/api/transactions/${transactionId}`, headers: { cookie: user.cookie } })).statusCode).toBe(200);
  });
});
