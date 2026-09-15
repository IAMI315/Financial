import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

describe('server port configuration', () => {
  it('defaults to 7001 and accepts a single PORT override', () => {
    expect(loadConfig({}).port).toBe(7001);
    expect(loadConfig({}).cookieSecure).toBe(false);
    expect(loadConfig({ PORT: '8123' }).port).toBe(8123);
    expect(loadConfig({ COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
  });
});

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
    expect(rawCookie).not.toContain('Secure');
    const cookie = rawCookie!.split(';')[0]!;

    const categories = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { cookie },
    });
    expect(categories.statusCode).toBe(200);
    const categoryItems = categories.json().categories as Array<{ id: number; type: string; name: string; parentId: number | null }>;
    expect(categoryItems.filter((category) => category.parentId === null)).toHaveLength(20);
    expect(categoryItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'expense', name: '餐饮', parentId: null }),
        expect.objectContaining({ type: 'expense', name: '经营', parentId: null }),
        expect.objectContaining({ type: 'income', name: '工资', parentId: null }),
        expect.objectContaining({ type: 'income', name: '补贴', parentId: null }),
        expect.objectContaining({ type: 'income', name: '经营', parentId: null }),
      ]),
    );
    const dining = categoryItems.find((category) => category.type === 'expense' && category.name === '餐饮' && category.parentId === null);
    expect(dining).toBeDefined();
    expect(categoryItems.filter((category) => category.parentId === dining!.id).map((category) => category.name)).toEqual(['早餐', '中餐', '晚餐']);

    await app.close();
  });
});
