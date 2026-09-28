import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createDailyEntryTemplate,
  deleteDailyEntryTemplate,
  listDailyEntryTemplatesForDate,
  updateDailyEntryTemplate,
} from '@financial/database';
import { formatFenToCny, parseCnyToFen, shanghaiDateTimeToEpochMs } from '@financial/domain';
import type { AppState } from '../runtime.js';
import { requireAuth } from '../security.js';

const templateBody = z.object({
  name: z.string().trim().min(1).max(24),
  type: z.enum(['income', 'expense']),
  categoryId: z.number().int().positive(),
  subcategoryId: z.number().int().positive().nullable().optional(),
  amountMode: z.enum(['fixed', 'latest']),
  fixedAmount: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isEnabled: z.boolean().optional(),
});

function dateBounds(date: string): { from: number; to: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('日期格式无效');
  const from = shanghaiDateTimeToEpochMs(`${date}T00:00:00`);
  return { from, to: from + 24 * 60 * 60 * 1000 };
}

function serialize(items: ReturnType<typeof listDailyEntryTemplatesForDate>) {
  return items.map((item) => ({
    ...item,
    fixedAmount: item.fixedAmountFen == null ? null : formatFenToCny(item.fixedAmountFen),
    suggestedAmount: formatFenToCny(item.suggestedAmountFen),
    completedAmount: formatFenToCny(item.completedAmountFen),
  }));
}

function parseTemplateInput(body: unknown) {
  const parsed = templateBody.safeParse(body);
  if (!parsed.success) return null;
  let fixedAmountFen: number | null = null;
  if (parsed.data.amountMode === 'fixed') {
    try {
      fixedAmountFen = parseCnyToFen(parsed.data.fixedAmount ?? '');
    } catch {
      return null;
    }
  }
  return { ...parsed.data, fixedAmountFen };
}

export function registerDailyMustRoutes(app: FastifyInstance, state: AppState): void {
  app.get('/api/daily-must', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const query = z.object({ date: z.string() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'INVALID_DATE' });
    try {
      const bounds = dateBounds(query.data.date);
      return { date: query.data.date, items: serialize(listDailyEntryTemplatesForDate(state.database.current, auth.user.id, bounds.from, bounds.to)) };
    } catch (error) {
      return reply.code(400).send({ error: 'INVALID_DATE', message: error instanceof Error ? error.message : '日期无效' });
    }
  });

  app.post('/api/daily-must', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const input = parseTemplateInput(request.body);
    if (!input) return reply.code(400).send({ error: 'INVALID_INPUT', message: '今日必记信息无效' });
    const template = createDailyEntryTemplate(state.database.current, auth.user.id, input);
    if (!template) return reply.code(400).send({ error: 'INVALID_TEMPLATE', message: '分类或金额设置无效' });
    return reply.code(201).send({ template });
  });

  app.put('/api/daily-must/:id', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    const input = parseTemplateInput(request.body);
    if (!params.success || !input) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const template = updateDailyEntryTemplate(state.database.current, auth.user.id, params.data.id, input);
    if (!template) return reply.code(404).send({ error: 'NOT_FOUND', message: '今日必记项目不存在或设置无效' });
    return { template };
  });

  app.delete('/api/daily-must/:id', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    if (!deleteDailyEntryTemplate(state.database.current, auth.user.id, params.data.id)) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply.code(204).send();
  });
}
