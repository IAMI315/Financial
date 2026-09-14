import { randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  countTransactions,
  countUsers,
  deleteUser,
  getSetting,
  getUserById,
  listTransactions,
  listUsers,
  revokeUserSessions,
  setSetting,
  setUserStatus,
  updateUserPassword,
} from '@financial/database';
import { epochMsToShanghaiDateTime, formatFenToCny } from '@financial/domain';
import type { AppState } from '../runtime.js';
import { hashPassword, requireAdmin, verifyPassword } from '../security.js';
import type { BackupService } from '../backup.js';

function publicUser(user: NonNullable<ReturnType<typeof getUserById>>) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

function serializeTransaction(transaction: ReturnType<typeof listTransactions>['items'][number]) {
  return {
    ...transaction,
    amount: formatFenToCny(transaction.amountFen),
    occurredAtLocal: epochMsToShanghaiDateTime(transaction.occurredAt),
  };
}

export function registerAdminRoutes(app: FastifyInstance, state: AppState, backups: BackupService): void {
  app.get('/api/admin/users', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    return { users: listUsers(state.database.current).map(publicUser) };
  });

  app.get('/api/admin/users/:id/transactions', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    const query = z.object({ page: z.coerce.number().int().positive().optional(), pageSize: z.coerce.number().int().positive().max(100).optional() }).safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const target = getUserById(state.database.current, params.data.id);
    if (!target) return reply.code(404).send({ error: 'NOT_FOUND' });
    const result = listTransactions(state.database.current, target.id, query.data);
    return { ...result, items: result.items.map(serializeTransaction) };
  });

  app.post('/api/admin/users/:id/reset-password', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const target = getUserById(state.database.current, params.data.id);
    if (!target || target.role === 'admin') return reply.code(404).send({ error: 'NOT_FOUND' });
    const temporaryPassword = `Tmp-${randomBytes(12).toString('base64url')}`;
    updateUserPassword(state.database.current, target.id, await hashPassword(temporaryPassword), {
      mustChangePassword: true,
      temporaryPasswordExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    revokeUserSessions(state.database.current, target.id);
    return { temporaryPassword, expiresInHours: 24 };
  });

  app.patch('/api/admin/users/:id/status', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    const body = z.object({ status: z.enum(['active', 'disabled']) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const target = getUserById(state.database.current, params.data.id);
    if (!target || target.role === 'admin') return reply.code(404).send({ error: 'NOT_FOUND' });
    setUserStatus(state.database.current, target.id, body.data.status);
    if (body.data.status === 'disabled') revokeUserSessions(state.database.current, target.id);
    return { user: publicUser(getUserById(state.database.current, target.id)!) };
  });

  app.delete('/api/admin/users/:id', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    const body = z.object({ confirmUsername: z.string(), adminPassword: z.string() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const target = getUserById(state.database.current, params.data.id);
    if (!target || target.role === 'admin') return reply.code(404).send({ error: 'NOT_FOUND' });
    if (body.data.confirmUsername !== target.username || !(await verifyPassword(auth.user.passwordHash, body.data.adminPassword))) {
      return reply.code(403).send({ error: 'CONFIRMATION_FAILED', message: '删除确认失败' });
    }
    deleteUser(state.database.current, target.id);
    return reply.code(204).send();
  });

  app.get('/api/admin/settings/registration', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    return { open: getSetting(state.database.current, 'registration_open') === 'true' };
  });

  app.put('/api/admin/settings/registration', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    const body = z.object({ open: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    setSetting(state.database.current, 'registration_open', body.data.open ? 'true' : 'false');
    return { open: body.data.open };
  });

  app.get('/api/admin/status', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    const latest = backups.latestAutomatic();
    let databaseSize = 0;
    try {
      if (state.database.databasePath !== ':memory:') databaseSize = statSync(state.database.databasePath).size;
    } catch {
      databaseSize = 0;
    }
    return {
      appVersion: state.config.appVersion,
      database: 'ok',
      databaseSize,
      users: countUsers(state.database.current),
      transactions: countTransactions(state.database.current),
      registrationOpen: getSetting(state.database.current, 'registration_open') === 'true',
      latestAutomaticBackup: latest?.modifiedAt ?? null,
      latestBackupResult: latest ? 'ok' : 'none',
      backupCount: backups.list().length,
      maintenance: state.maintenance,
    };
  });
}
