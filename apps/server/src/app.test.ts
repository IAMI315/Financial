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

    await app.close();
  });
});
