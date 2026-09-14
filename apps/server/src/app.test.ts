import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('GET /healthz', () => {
  it('returns the service health payload', async () => {
    const app = await buildApp(
      { logger: false },
      {
        nodeEnv: 'test',
        databasePath: ':memory:',
        backupDir: './data/test-backups',
        appSecret: 'test-secret-123456789012345678901234567890',
        adminUsername: 'admin',
        adminPassword: 'test-admin-password',
        registrationOpen: true,
        appVersion: 'test',
      },
    );
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'financial-ledger-api',
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'admin', password: 'test-admin-password' },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = login.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(rawCookie).toBeTypeOf('string');
    const cookie = rawCookie!.split(';')[0]!;

    const categories = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { cookie },
    });
    expect(categories.statusCode).toBe(200);
    expect(categories.json().categories).toHaveLength(17);
    expect(categories.json().categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'expense', name: '餐饮' }),
        expect.objectContaining({ type: 'income', name: '工资' }),
      ]),
    );

    await app.close();
  });
});
