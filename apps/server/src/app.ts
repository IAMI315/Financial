import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  countAdmins,
  DEFAULT_CATEGORY_MIGRATIONS,
  DEFAULT_SUBCATEGORY_MIGRATIONS,
  createDefaultCategories,
  createUser,
  getSetting,
  listCategories,
  listUsers,
  reorderNamedSubcategories,
  setSetting,
  syncDefaultCategoryAdditions,
  syncDefaultSubcategoryAdditions,
} from '@financial/database';
import { assertValidPasswordLength, normalizeUsername } from '@financial/domain';
import { BackupService } from './backup.js';
import { loadConfig, type AppConfig } from './config.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBackupRoutes } from './routes/backups.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { registerImportRoutes } from './routes/imports.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerTransactionRoutes } from './routes/transactions.js';
import { DatabaseRuntime, type AppState } from './runtime.js';
import { hashPassword } from './security.js';

export type HealthResponse = {
  status: 'ok';
  service: 'financial-ledger-api';
};

async function bootstrapSystem(state: AppState): Promise<void> {
  if (countAdmins(state.database.current) === 0) {
    if (!state.config.adminPassword || state.config.adminPassword.startsWith('replace-')) {
      throw new Error('首次启动必须配置安全的 ADMIN_PASSWORD');
    }
    const usernameNormalized = normalizeUsername(state.config.adminUsername);
    assertValidPasswordLength(state.config.adminPassword);
    const admin = createUser(state.database.current, {
      username: state.config.adminUsername,
      usernameNormalized,
      email: null,
      emailNormalized: null,
      passwordHash: await hashPassword(state.config.adminPassword),
      role: 'admin',
    });
    createDefaultCategories(state.database.current, admin.id);
  }

  if (getSetting(state.database.current, 'default_categories_seed_v1') == null) {
    state.database.current.sqlite.transaction(() => {
      for (const user of listUsers(state.database.current)) {
        if (listCategories(state.database.current, user.id).length === 0) {
          createDefaultCategories(state.database.current, user.id);
        }
      }
      setSetting(state.database.current, 'default_categories_seed_v1', 'done');
    })();
  }

  for (const migration of DEFAULT_CATEGORY_MIGRATIONS) {
    const settingKey = `default_categories_seed_v${migration.version}`;
    if (getSetting(state.database.current, settingKey) != null) continue;
    state.database.current.sqlite.transaction(() => {
      for (const user of listUsers(state.database.current)) {
        syncDefaultCategoryAdditions(state.database.current, user.id, migration.categories);
      }
      setSetting(state.database.current, settingKey, 'done');
    })();
  }

  for (const migration of DEFAULT_SUBCATEGORY_MIGRATIONS) {
    const settingKey = `default_subcategories_seed_v${migration.version}`;
    if (getSetting(state.database.current, settingKey) != null) continue;
    state.database.current.sqlite.transaction(() => {
      for (const user of listUsers(state.database.current)) {
        syncDefaultSubcategoryAdditions(state.database.current, user.id, migration.categories);
      }
      setSetting(state.database.current, settingKey, 'done');
    })();
  }

  if (getSetting(state.database.current, 'default_subcategories_order_v5') == null) {
    state.database.current.sqlite.transaction(() => {
      for (const user of listUsers(state.database.current)) {
        reorderNamedSubcategories(state.database.current, user.id, 'expense', '餐饮', ['早餐', '中餐', '晚餐']);
      }
      setSetting(state.database.current, 'default_subcategories_order_v5', 'done');
    })();
  }

  if (getSetting(state.database.current, 'registration_open') == null) {
    setSetting(
      state.database.current,
      'registration_open',
      state.config.registrationOpen ? 'true' : 'false',
    );
  }
}

export async function buildApp(
  options: FastifyServerOptions = {},
  configOverrides: Partial<AppConfig> = {},
) {
  const config = { ...loadConfig(), ...configOverrides } as AppConfig;
  const app = Fastify({ bodyLimit: 12 * 1024 * 1024, ...options });
  const state: AppState = {
    config,
    database: new DatabaseRuntime(config.databasePath),
    maintenance: false,
  };
  await bootstrapSystem(state);
  const backups = new BackupService(state);

  await app.register(cookie, { secret: config.appSecret });
  await app.register(rateLimit, { global: false });
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 512 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );

  app.addHook('onRequest', async (request, reply) => {
    if (
      state.maintenance &&
      request.url.startsWith('/api/') &&
      !request.url.startsWith('/api/admin/')
    ) {
      return reply
        .code(503)
        .send({ error: 'MAINTENANCE', message: '系统正在执行数据维护，请稍后重试' });
    }
  });

  app.get<{ Reply: HealthResponse }>('/healthz', async () => ({
    status: 'ok',
    service: 'financial-ledger-api',
  }));

  registerAuthRoutes(app, state);
  registerCategoryRoutes(app, state);
  registerTransactionRoutes(app, state);
  registerStatsRoutes(app, state);
  registerImportRoutes(app, state);
  registerAdminRoutes(app, state, backups);
  registerBackupRoutes(app, state, backups);

  if (config.nodeEnv === 'production') {
    const webRoot = resolve(process.cwd(), 'apps/web/dist');
    if (existsSync(webRoot)) {
      await app.register(fastifyStatic, {
        root: webRoot,
        prefix: '/',
        setHeaders(response, filePath) {
          if (filePath.endsWith('sw.js')) {
            response.header('Cache-Control', 'no-store, no-cache, must-revalidate');
            response.header('Service-Worker-Allowed', '/');
          } else if (filePath.endsWith('index.html')) {
            response.header('Cache-Control', 'no-cache');
          }
        },
      });
      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'NOT_FOUND' });
        return reply.sendFile('index.html');
      });
    }
  }

  let backupTimer: NodeJS.Timeout | undefined;
  if (config.nodeEnv !== 'test' && state.database.databasePath !== ':memory:') {
    void backups.ensureAutomaticBackups().catch((error: unknown) => app.log.error(error));
    backupTimer = setInterval(
      () => {
        void backups.ensureAutomaticBackups().catch((error: unknown) => app.log.error(error));
      },
      60 * 60 * 1000,
    );
    backupTimer.unref();
  }

  app.addHook('onClose', async () => {
    if (backupTimer) clearInterval(backupTimer);
    state.database.close();
  });

  app.decorate('ledgerState', state);
  return app;
}
