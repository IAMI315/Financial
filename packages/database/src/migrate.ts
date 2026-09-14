import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDatabase } from './database.js';

const defaultMigrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export function migrateDatabase(databasePath: string, migrationsFolder = defaultMigrationsFolder) {
  const handle = createDatabase(databasePath);
  migrate(handle.db, { migrationsFolder });
  return handle;
}
