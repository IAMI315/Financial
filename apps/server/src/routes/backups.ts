import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BackupService } from '../backup.js';
import type { AppState } from '../runtime.js';
import { requireAdmin } from '../security.js';

export function registerBackupRoutes(app: FastifyInstance, state: AppState, backups: BackupService): void {
  app.get('/api/admin/backups', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    return { backups: backups.list() };
  });

  app.post('/api/admin/backups', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    try {
      const backup = await backups.create('manual');
      return reply.code(201).send({ backup });
    } catch (error) {
      return reply.code(500).send({ error: 'BACKUP_FAILED', message: error instanceof Error ? error.message : '备份失败' });
    }
  });

  app.get('/api/admin/backups/:name', async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    const params = z.object({ name: z.string().min(1).max(255) }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'NOT_FOUND' });
    try {
      const buffer = backups.read(params.data.name);
      reply.header('content-type', 'application/octet-stream');
      reply.header('content-disposition', `attachment; filename="${params.data.name.replace(/"/g, '')}"`);
      return buffer;
    } catch {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  });

  app.post('/api/admin/backups/restore', { bodyLimit: 512 * 1024 * 1024 }, async (request, reply) => {
    const auth = requireAdmin(request, reply, state);
    if (!auth) return;
    if (request.headers['x-confirm-restore'] !== 'RESTORE') {
      return reply.code(400).send({ error: 'CONFIRMATION_REQUIRED', message: '需要明确确认整库恢复' });
    }
    if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'INVALID_BACKUP', message: '备份文件无效' });
    try {
      await backups.restore(request.body);
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: 'RESTORE_FAILED', message: error instanceof Error ? error.message : '恢复失败，已尝试回滚' });
    }
  });
}
