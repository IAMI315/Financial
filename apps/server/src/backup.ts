import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  SCHEMA_VERSION,
  countTransactions,
  countUsers,
  createDatabase,
  listActiveSessions,
  restoreSession,
} from '@financial/database';
import type { AppState } from './runtime.js';

const MAGIC = 'FINANCIAL_LEDGER_BACKUP_V1';

type BackupHeader = {
  magic: typeof MAGIC;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  sha256: string;
  users: number;
  transactions: number;
};

export type BackupInfo = {
  name: string;
  size: number;
  modifiedAt: string;
  kind: 'daily' | 'weekly' | 'monthly' | 'manual' | 'pre-restore';
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function timestampName(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function shanghaiDateParts(date = new Date()): { date: string; day: number; monthDay: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const dateText = `${value('year')}-${value('month')}-${value('day')}`;
  const week = value('weekday');
  const dayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { date: dateText, day: dayMap[week] ?? 1, monthDay: Number(value('day')) };
}

function packBackup(header: Omit<BackupHeader, 'sha256'>, database: Buffer): Buffer {
  const completed: BackupHeader = { ...header, sha256: sha256(database) };
  return Buffer.concat([Buffer.from(`${JSON.stringify(completed)}\n`, 'utf8'), database]);
}

function unpackBackup(buffer: Buffer): { header: BackupHeader; database: Buffer } {
  const newline = buffer.indexOf(0x0a);
  if (newline <= 0 || newline > 16_384) throw new Error('备份文件头无效');
  const header = JSON.parse(buffer.subarray(0, newline).toString('utf8')) as BackupHeader;
  if (header.magic !== MAGIC || header.schemaVersion !== SCHEMA_VERSION) throw new Error('备份格式或 schema 版本不兼容');
  const database = buffer.subarray(newline + 1);
  if (sha256(database) !== header.sha256) throw new Error('备份完整性校验失败');
  return { header, database };
}

function kindFromName(name: string): BackupInfo['kind'] {
  if (name.startsWith('daily-')) return 'daily';
  if (name.startsWith('weekly-')) return 'weekly';
  if (name.startsWith('monthly-')) return 'monthly';
  if (name.startsWith('pre-restore-')) return 'pre-restore';
  return 'manual';
}

export class BackupService {
  readonly directory: string;

  constructor(private readonly state: AppState) {
    this.directory = resolve(process.cwd(), state.config.backupDir);
    mkdirSync(this.directory, { recursive: true });
  }

  list(): BackupInfo[] {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory)
      .filter((name) => name.endsWith('.flb'))
      .map((name) => {
        const stats = statSync(join(this.directory, name));
        return {
          name,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          kind: kindFromName(name),
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async create(kind: BackupInfo['kind'] = 'manual', fixedLabel?: string): Promise<BackupInfo> {
    if (this.state.database.databasePath === ':memory:') throw new Error('内存数据库不能创建文件备份');
    const label = fixedLabel ?? timestampName();
    const name = `${kind}-${label}.flb`;
    const output = join(this.directory, name);
    const snapshot = join(this.directory, `.snapshot-${randomUUID()}.sqlite`);
    try {
      await this.state.database.current.sqlite.backup(snapshot);
      const database = readFileSync(snapshot);
      const payload = packBackup(
        {
          magic: MAGIC,
          schemaVersion: SCHEMA_VERSION,
          appVersion: this.state.config.appVersion,
          createdAt: new Date().toISOString(),
          users: countUsers(this.state.database.current),
          transactions: countTransactions(this.state.database.current),
        },
        database,
      );
      writeFileSync(output, payload, { mode: 0o600 });
      this.prune();
      return this.list().find((item) => item.name === name) ?? {
        name,
        size: payload.length,
        modifiedAt: new Date().toISOString(),
        kind,
      };
    } finally {
      rmSync(snapshot, { force: true });
    }
  }

  read(name: string): Buffer {
    const safeName = basename(name);
    if (safeName !== name || !safeName.endsWith('.flb')) throw new Error('备份文件名无效');
    const buffer = readFileSync(join(this.directory, safeName));
    unpackBackup(buffer);
    return buffer;
  }

  async ensureAutomaticBackups(): Promise<void> {
    if (this.state.database.databasePath === ':memory:') return;
    const parts = shanghaiDateParts();
    const names = new Set(this.list().map((item) => item.name));
    if (!names.has(`daily-${parts.date}.flb`)) await this.create('daily', parts.date);
    if (parts.day === 1 && !names.has(`weekly-${parts.date}.flb`)) await this.create('weekly', parts.date);
    if (parts.monthDay === 1 && !names.has(`monthly-${parts.date}.flb`)) await this.create('monthly', parts.date);
  }

  async restore(uploaded: Buffer): Promise<void> {
    if (this.state.database.databasePath === ':memory:') throw new Error('内存数据库不支持整库恢复');
    const pre = await this.create('pre-restore');
    const preservedSessions = listActiveSessions(this.state.database.current);
    this.state.maintenance = true;
    const temp = join(this.directory, `.restore-${randomUUID()}.sqlite`);
    try {
      const parsed = unpackBackup(uploaded);
      writeFileSync(temp, parsed.database, { mode: 0o600 });
      this.validateSqlite(temp);
      this.state.database.replaceDatabaseFile(() => copyFileSync(temp, this.state.database.databasePath));
      this.validateSqlite(this.state.database.databasePath);
      for (const session of preservedSessions) restoreSession(this.state.database.current, session);
    } catch (error) {
      const rollback = unpackBackup(this.read(pre.name));
      writeFileSync(temp, rollback.database, { mode: 0o600 });
      this.state.database.replaceDatabaseFile(() => copyFileSync(temp, this.state.database.databasePath));
      for (const session of preservedSessions) restoreSession(this.state.database.current, session);
      throw error;
    } finally {
      rmSync(temp, { force: true });
      this.state.maintenance = false;
    }
  }

  latestAutomatic(): BackupInfo | null {
    return this.list().find((item) => ['daily', 'weekly', 'monthly'].includes(item.kind)) ?? null;
  }

  private validateSqlite(path: string): void {
    const handle = createDatabase(path);
    try {
      const integrity = handle.sqlite.pragma('integrity_check', { simple: true });
      if (integrity !== 'ok') throw new Error('SQLite 完整性检查失败');
      const required = ['users', 'categories', 'transactions', 'sessions', 'import_batches', 'system_settings'];
      const rows = handle.sqlite.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>;
      const names = new Set(rows.map((row) => row.name));
      if (!required.every((table) => names.has(table))) throw new Error('备份缺少必要数据表');
    } finally {
      handle.sqlite.close();
    }
  }

  private prune(): void {
    const retention: Record<BackupInfo['kind'], number> = {
      daily: 7,
      weekly: 4,
      monthly: 6,
      manual: 50,
      'pre-restore': 10,
    };
    const grouped = new Map<BackupInfo['kind'], BackupInfo[]>();
    for (const item of this.list()) grouped.set(item.kind, [...(grouped.get(item.kind) ?? []), item]);
    for (const [kind, items] of grouped) {
      items.slice(retention[kind]).forEach((item) => rmSync(join(this.directory, item.name), { force: true }));
    }
  }
}
