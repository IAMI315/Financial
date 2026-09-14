import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listTransactionsForRange } from '@financial/database';
import { epochMsToShanghaiDateTime, shanghaiDateTimeToEpochMs } from '@financial/domain';
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
    const items = listTransactionsForRange(state.database.current, auth.user.id, bounds.from, bounds.to);
    let incomeFen = 0;
    let expenseFen = 0;
    const categories = { income: new Map<string, { id: number; name: string; amountFen: number }>(), expense: new Map<string, { id: number; name: string; amountFen: number }>() };
    const daily = new Map<string, number>();
    const subcategories = new Map<string, { id: number; name: string; parentId: number; amountFen: number; type: 'income' | 'expense' }>();
    for (const item of items) {
      if (item.type === 'income') incomeFen += item.amountFen;
      else expenseFen += item.amountFen;
      const map = categories[item.type];
      const key = String(item.categoryId);
      const current = map.get(key) ?? { id: item.categoryId, name: item.categoryName, amountFen: 0 };
      current.amountFen += item.amountFen;
      map.set(key, current);
      if (item.subcategoryId && item.subcategoryName) {
        const subKey = `${item.type}:${item.subcategoryId}`;
        const sub = subcategories.get(subKey) ?? { id: item.subcategoryId, name: item.subcategoryName, parentId: item.categoryId, amountFen: 0, type: item.type };
        sub.amountFen += item.amountFen;
        subcategories.set(subKey, sub);
      }
      if (item.type === 'expense') {
        const day = epochMsToShanghaiDateTime(item.occurredAt).slice(0, 10);
        daily.set(day, (daily.get(day) ?? 0) + item.amountFen);
      }
    }
    const sortAmount = <T extends { amountFen: number }>(values: T[]) => values.sort((a, b) => b.amountFen - a.amountFen);
    return {
      month: query.data.month,
      incomeFen,
      expenseFen,
      balanceFen: incomeFen - expenseFen,
      incomeCategories: sortAmount([...categories.income.values()]),
      expenseCategories: sortAmount([...categories.expense.values()]),
      subcategories: sortAmount([...subcategories.values()]),
      dailyExpense: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amountFen]) => ({ date, amountFen })),
    };
  });
}
