import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const workspaceEnv = resolve(process.cwd(), '../../.env');
dotenv.config({ path: workspaceEnv, quiet: true });
dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(7001),
  DATABASE_URL: z.string().min(1).default('./data/ledger.db'),
  BACKUP_DIR: z.string().min(1).default('./data/backups'),
  APP_SECRET: z.string().min(32).default('development-only-secret-change-me-123456'),
  ADMIN_USERNAME: z.string().min(3).default('admin'),
  ADMIN_PASSWORD: z.string().default(''),
  REGISTRATION_OPEN: z.enum(['true', 'false']).default('true'),
  PUBLIC_URL: z.string().url().optional(),
  APP_VERSION: z.string().min(1).default('0.1.0'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databasePath: string;
  backupDir: string;
  appSecret: string;
  adminUsername: string;
  adminPassword: string;
  registrationOpen: boolean;
  publicUrl?: string;
  appVersion: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  if (
    parsed.NODE_ENV === 'production' &&
    (parsed.APP_SECRET.startsWith('development-only') || parsed.APP_SECRET.startsWith('replace-'))
  ) {
    throw new Error('生产环境必须配置独立随机 APP_SECRET');
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_URL,
    backupDir: parsed.BACKUP_DIR,
    appSecret: parsed.APP_SECRET,
    adminUsername: parsed.ADMIN_USERNAME,
    adminPassword: parsed.ADMIN_PASSWORD,
    registrationOpen: parsed.REGISTRATION_OPEN === 'true',
    ...(parsed.PUBLIC_URL ? { publicUrl: parsed.PUBLIC_URL } : {}),
    appVersion: parsed.APP_VERSION,
  };
}
