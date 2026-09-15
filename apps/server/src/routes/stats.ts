import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getTransactionStatsForRange } from '@financial/database';
import { shanghaiDateTimeToEpochMs } from '@financial/domain';
import type { AppState } from '../runtime.js';
import { requireAuth } from '../security.js';

function monthBounds(month: string): { from: number; to: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new RangeError('月份格式无效');
  const year = Number(match[1]);
  const value = Number(match[2]);
  if (value < 1 || value > 12) throw new RangeError('月份格式无效');
  const nextYear = value === 12 ? year + 1 : year;
  const nextMonth = value === 12 ? 1 : value + 1;
  return {
    from: shanghaiDateTimeToEpochMs(`${year}-${String(value).padStart(2, '0')}-01T00:00:00`),
    to: shanghaiDateTimeToEpochMs(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00`),
  };
}

export function registerStatsRoutes(app: FastifyInstance, state: AppState): void {
  app.get('/api/stats/monthly', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const query = z.object({ month: z.string() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'INVALID_MONTH' });
    let bounds: { from: number; to: number };
    try {
      bounds = monthBounds(query.data.month);
    } catch (error) {
      return reply.code(400).send({ error: 'INVALID_MONTH', message: error instanceof Error ? error.message : '月份无效' });
    }
    const stats = getTransactionStatsForRange(state.database.current, auth.user.id, bounds.from, bounds.to);
    return {
      month: query.data.month,
      ...stats,
      balanceFen: stats.incomeFen - stats.expenseFen,
    };
  });
}
