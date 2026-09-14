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
    expect(categoriesA.json().categories).toHaveLength(17);
    expect(categoriesB.json().categories).toHaveLength(17);
    const expense = categoriesA.json().categories.find((category: { type: string; parentId: number | null }) => category.type === 'expense' && category.parentId === null);

    const created = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { cookie: a.cookie },
      payload: {
        type: 'expense',
        amount: '25.50',
        categoryId: expense.id,
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
        categoryId: expense.id,
        occurredAtLocal: '2026-01-01T12:01:00',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toBe('POTENTIAL_DUPLICATE');
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

    const stats = await app.inject({ method: 'GET', url: '/api/stats/monthly?month=2026-02', headers: { cookie: user.cookie } });
    expect(stats.json()).toMatchObject({ incomeFen: 10_000, expenseFen: 1_000, balanceFen: 9_000 });

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
