import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  deleteTransaction,
  getTransaction,
  listTransactions,
  listCommonTransactions,
  type TransactionFilters,
} from '@financial/database';
import { epochMsToShanghaiDateTime, formatFenToCny, shanghaiDateTimeToEpochMs } from '@financial/domain';
import type { AppState } from '../runtime.js';
import { requireAuth } from '../security.js';
import { createValidatedTransaction, updateValidatedTransaction } from '../transaction-service.js';

const transactionBody = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.string(),
  categoryId: z.number().int().positive(),
  subcategoryId: z.number().int().positive().nullable().optional(),
  occurredAtLocal: z.string(),
  note: z.string().nullable().optional(),
  confirmDuplicate: z.boolean().optional(),
});

function serializeTransaction(transaction: NonNullable<ReturnType<typeof getTransaction>>) {
  return {
    ...transaction,
    amount: formatFenToCny(transaction.amountFen),
    occurredAtLocal: epochMsToShanghaiDateTime(transaction.occurredAt),
  };
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseFilterQuery(query: unknown): TransactionFilters | null {
  const parsed = z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      type: z.enum(['income', 'expense']).optional(),
      categoryId: z.coerce.number().int().positive().optional(),
      subcategoryId: z.coerce.number().int().positive().optional(),
      keyword: z.string().max(100).optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
    })
    .safeParse(query);
  if (!parsed.success) return null;
  const filters: TransactionFilters = {};
  if (parsed.data.type) filters.type = parsed.data.type;
  if (parsed.data.categoryId != null) filters.categoryId = parsed.data.categoryId;
  if (parsed.data.subcategoryId != null) filters.subcategoryId = parsed.data.subcategoryId;
  if (parsed.data.keyword) filters.keyword = parsed.data.keyword;
  if (parsed.data.page != null) filters.page = parsed.data.page;
  if (parsed.data.pageSize != null) filters.pageSize = parsed.data.pageSize;
  try {
    if (parsed.data.from) filters.from = shanghaiDateTimeToEpochMs(`${parsed.data.from}T00:00:00`);
    if (parsed.data.to) {
      const next = new Date(shanghaiDateTimeToEpochMs(`${parsed.data.to}T00:00:00`) + 24 * 60 * 60 * 1000);
      filters.to = next.getTime();
    }
  } catch {
    return null;
  }
  return filters;
}

export function registerTransactionRoutes(app: FastifyInstance, state: AppState): void {
  app.get('/api/transactions', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const filters = parseFilterQuery(request.query);
    if (!filters) return reply.code(400).send({ error: 'INVALID_FILTER', message: '流水筛选参数无效' });
    const result = listTransactions(state.database.current, auth.user.id, filters);
    return { ...result, items: result.items.map(serializeTransaction) };
  });

  app.get('/api/transactions/common', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const query = z.object({ limit: z.coerce.number().int().min(1).max(12).optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'INVALID_LIMIT' });
    const items = listCommonTransactions(state.database.current, auth.user.id, query.data.limit ?? 6);
    return {
      items: items.map((item) => ({
        ...item,
        amount: formatFenToCny(item.amountFen),
      })),
    };
  });

  app.get('/api/transactions/:id', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'NOT_FOUND' });
    const transaction = getTransaction(state.database.current, auth.user.id, params.data.id);
    if (!transaction) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { transaction: serializeTransaction(transaction) };
  });

  app.post('/api/transactions', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const parsed = transactionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: '交易信息无效' });
    try {
      const result = createValidatedTransaction(state, auth.user.id, parsed.data, parsed.data.confirmDuplicate ?? false);
      if (result.duplicates) {
        return reply.code(409).send({
          error: 'POTENTIAL_DUPLICATE',
          message: '发现疑似重复交易',
          duplicates: result.duplicates.map(serializeTransaction),
        });
      }
      return reply.code(201).send({ transaction: serializeTransaction(result.transaction!) });
    } catch (error) {
      return reply.code(400).send({ error: 'INVALID_TRANSACTION', message: error instanceof Error ? error.message : '交易无效' });
    }
  });

  app.put('/api/transactions/:id', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    const parsed = transactionBody.omit({ confirmDuplicate: true }).safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: '交易信息无效' });
    try {
      const transaction = updateValidatedTransaction(state, auth.user.id, params.data.id, parsed.data);
      if (!transaction) return reply.code(404).send({ error: 'NOT_FOUND' });
      return { transaction: serializeTransaction(transaction) };
    } catch (error) {
      return reply.code(400).send({ error: 'INVALID_TRANSACTION', message: error instanceof Error ? error.message : '交易无效' });
    }
  });

  app.delete('/api/transactions/:id', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success || !deleteTransaction(state.database.current, auth.user.id, params.data.id)) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    return reply.code(204).send();
  });

  app.get('/api/transactions-export.csv', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const filters = parseFilterQuery(request.query);
    if (!filters) return reply.code(400).send({ error: 'INVALID_FILTER' });
    const all = listTransactions(state.database.current, auth.user.id, { ...filters, page: 1, pageSize: 100 });
    const items = [...all.items];
    for (let page = 2; items.length < all.total; page += 1) {
      items.push(...listTransactions(state.database.current, auth.user.id, { ...filters, page, pageSize: 100 }).items);
    }
    const rows = [
      ['类型', '金额', '一级分类', '二级分类', '交易时间', '备注'],
      ...items.map((item) => [
        item.type === 'income' ? '收入' : '支出',
        formatFenToCny(item.amountFen),
        item.categoryName,
        item.subcategoryName ?? '',
        epochMsToShanghaiDateTime(item.occurredAt).replace('T', ' '),
        item.note ?? '',
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="transactions.csv"');
    return csv;
  });
}
