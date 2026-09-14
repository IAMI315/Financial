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
  if (typeof value !== 'string') throw new Error('Missing session cookie');
  return value.split(';')[0]!;
}

async function register(username: string, password = 'password-12345') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password },
  });
  expect(response.statusCode).toBe(201);
  return cookieFrom(response);
}

async function login(name: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: name, password },
  });
  expect(response.statusCode).toBe(200);
  return cookieFrom(response);
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'financial-ledger-security-'));
  app = await buildApp(
    { logger: false },
    {
      nodeEnv: 'test',
      databasePath: join(tempDir, 'ledger.db'),
      backupDir: join(tempDir, 'backups'),
      appSecret: 'security-test-secret-12345678901234567890',
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

describe('V1 security boundaries', () => {
  it('rejects unauthenticated access and hides cross-user resources for read/update/delete', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/categories' })).statusCode).toBe(401);
    const alice = await register('BoundaryAlice');
    const bob = await register('BoundaryBob');
    const categoryResult = await app.inject({ method: 'GET', url: '/api/categories?includeArchived=false', headers: { cookie: alice } });
    const category = categoryResult.json().categories.find((item: { type: string }) => item.type === 'expense');
    const created = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { cookie: alice },
      payload: { type: 'expense', amount: '12.00', categoryId: category.id, occurredAtLocal: '2026-04-01T08:00:00' },
    });
    const id = created.json().transaction.id as number;

    expect((await app.inject({ method: 'GET', url: `/api/transactions/${id}`, headers: { cookie: bob } })).statusCode).toBe(404);
    expect((await app.inject({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      headers: { cookie: bob },
      payload: { type: 'expense', amount: '99.00', categoryId: category.id, occurredAtLocal: '2026-04-01T08:00:00' },
    })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/transactions/${id}`, headers: { cookie: bob } })).statusCode).toBe(404);
  });

  it('keeps admin cross-user access read-only through ordinary write routes', async () => {
    const owner = await register('AdminReadOnlyUser');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: owner } });
    const ownerId = me.json().user.id as number;
    const categories = await app.inject({ method: 'GET', url: '/api/categories?includeArchived=false', headers: { cookie: owner } });
    const category = categories.json().categories.find((item: { type: string }) => item.type === 'expense');
    const created = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { cookie: owner },
      payload: { type: 'expense', amount: '16.00', categoryId: category.id, occurredAtLocal: '2026-04-02T08:00:00' },
    });
    const id = created.json().transaction.id as number;
    const admin = await login('admin', 'test-admin-password');

    const readOnly = await app.inject({ method: 'GET', url: `/api/admin/users/${ownerId}/transactions`, headers: { cookie: admin } });
    expect(readOnly.statusCode).toBe(200);
    expect(readOnly.json().items.some((item: { id: number }) => item.id === id)).toBe(true);
    const serialized = readOnly.json().items.find((item: { id: number }) => item.id === id);
    expect(serialized.amount).toBe('16.00');
    expect(serialized.occurredAtLocal).toBe('2026-04-02T08:00:00');

    const adminWrite = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      headers: { cookie: admin },
      payload: { type: 'expense', amount: '77.00', categoryId: category.id, occurredAtLocal: '2026-04-02T08:00:00' },
    });
    expect(adminWrite.statusCode).toBe(404);
  });

  it('revokes other device sessions after password change while preserving the current one', async () => {
    const first = await register('PasswordSessionUser', 'password-12345');
    const second = await login('PasswordSessionUser', 'password-12345');
    const changed = await app.inject({
      method: 'POST',
      url: '/api/me/password',
      headers: { cookie: first },
      payload: { currentPassword: 'password-12345', newPassword: 'new-password-67890' },
    });
    expect(changed.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: first } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: second } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'PasswordSessionUser', password: 'password-12345' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'PasswordSessionUser', password: 'new-password-67890' } })).statusCode).toBe(200);
  });

  it('accepts seven-character passwords and rejects shorter passwords', async () => {
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'SevenPass', password: '1234567' },
    });
    expect(accepted.statusCode).toBe(201);

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'SixPass', password: '123456' },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().message).toContain('7');
  });

  it('enforces login rate limiting and transaction input boundaries', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'missing', password: 'wrong-password' } });
      expect(response.statusCode).toBe(401);
    }
    const limited = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'missing', password: 'wrong-password' } });
    expect(limited.statusCode).toBe(429);

    const user = await register('ValidationUser');
    const categories = await app.inject({ method: 'GET', url: '/api/categories?includeArchived=false', headers: { cookie: user } });
    const category = categories.json().categories.find((item: { type: string }) => item.type === 'expense');
    const precision = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { cookie: user },
      payload: { type: 'expense', amount: '1.001', categoryId: category.id, occurredAtLocal: '2026-04-01T08:00:00' },
    });
    expect(precision.statusCode).toBe(400);
    const future = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { cookie: user },
      payload: { type: 'expense', amount: '1.00', categoryId: category.id, occurredAtLocal: '2099-01-01T00:00:00' },
    });
    expect(future.statusCode).toBe(400);
  });
});
