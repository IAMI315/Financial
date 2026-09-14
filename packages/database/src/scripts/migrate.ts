import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '../migrate.js';

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const configuredPath = process.env.DATABASE_URL ?? './data/ledger.db';
const databasePath =
  configuredPath === ':memory:'
    ? configuredPath
    : isAbsolute(configuredPath)
      ? configuredPath
      : resolve(workspaceRoot, configuredPath);

if (databasePath !== ':memory:') {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const handle = migrateDatabase(databasePath);
handle.sqlite.close();
console.log(`Database migrated: ${databasePath}`);
