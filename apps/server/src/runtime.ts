import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrateDatabase, type DatabaseHandle } from '@financial/database';
import type { AppConfig } from './config.js';

export class DatabaseRuntime {
  readonly databasePath: string;
  private handle: DatabaseHandle;

  constructor(databasePath: string) {
    this.databasePath = databasePath === ':memory:' ? databasePath : resolve(process.cwd(), databasePath);
    if (this.databasePath !== ':memory:') mkdirSync(dirname(this.databasePath), { recursive: true });
    this.handle = migrateDatabase(this.databasePath);
  }

  get current(): DatabaseHandle {
    return this.handle;
  }

  close(): void {
    if (this.handle.sqlite.open) this.handle.sqlite.close();
  }

  reopen(): void {
    this.close();
    this.handle = migrateDatabase(this.databasePath);
  }

  replaceDatabaseFile(writeReplacement: () => void): void {
    if (this.databasePath === ':memory:') throw new Error('内存数据库不支持整库恢复');
    this.close();
    rmSync(`${this.databasePath}-wal`, { force: true });
    rmSync(`${this.databasePath}-shm`, { force: true });
    writeReplacement();
    this.handle = migrateDatabase(this.databasePath);
  }
}

export type AppState = {
  config: AppConfig;
  database: DatabaseRuntime;
  maintenance: boolean;
};
