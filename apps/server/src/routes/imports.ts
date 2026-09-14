import type { FastifyInstance } from 'fastify';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import {
  createImportBatchWithTransactions,
  findPotentialDuplicates,
  rollbackImportBatch,
  type NewTransaction,
  type TransactionType,
} from '@financial/database';
import { parseCnyToFen } from '@financial/domain';
import type { AppState } from '../runtime.js';
import { requireAuth } from '../security.js';
import { normalizeTransactionInput } from '../transaction-service.js';

const mappingSchema = z.object({
  timeColumn: z.string().min(1),
  amountColumn: z.string().min(1),
  typeColumn: z.string().optional(),
  fixedType: z.enum(['income', 'expense']).optional(),
  typeMap: z.record(z.string(), z.enum(['income', 'expense'])).optional(),
  categoryColumn: z.string().optional(),
  fixedCategoryId: z.number().int().positive().optional(),
  categoryMap: z.record(z.string(), z.number().int().positive()).optional(),
  subcategoryColumn: z.string().optional(),
  subcategoryMap: z.record(z.string(), z.number().int().positive()).optional(),
  noteColumn: z.string().optional(),
  positiveMeans: z.enum(['income', 'expense']).default('income'),
});

const analyzeSchema = z.object({
  sourceName: z.string().max(255).optional().nullable(),
  csv: z.string().min(1).max(10_000_000),
  mapping: mappingSchema,
});

const normalizedRowSchema = z.object({
  include: z.boolean().default(true),
  type: z.enum(['income', 'expense']),
  amountFen: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  subcategoryId: z.number().int().positive().nullable().optional(),
  occurredAt: z.number().int().positive(),
  note: z.string().nullable().optional(),
});

const commitSchema = z.object({
  sourceName: z.string().max(255).optional().nullable(),
  rows: z.array(normalizedRowSchema).min(1).max(50_000),
});

function parseSignedAmount(value: unknown): { fen: number; negative: boolean } {
  const text = String(value ?? '').trim().replace(/,/g, '');
  const match = /^([+-]?)(\d+(?:\.\d{1,2})?)$/.exec(text);
  if (!match) throw new RangeError('金额格式无效');
  const amount = match[2];
  if (!amount) throw new RangeError('金额格式无效');
  return { fen: parseCnyToFen(amount), negative: match[1] === '-' };
}

function completeTime(value: unknown): string {
  const raw = String(value ?? '').trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
}

function inferType(
  row: Record<string, string>,
  mapping: z.infer<typeof mappingSchema>,
  negative: boolean,
): TransactionType {
  if (mapping.typeColumn) {
    const raw = row[mapping.typeColumn]?.trim() ?? '';
    const mapped = mapping.typeMap?.[raw];
    if (mapped) return mapped;
    const lowered = raw.toLowerCase();
    if (['收入', 'income', 'in'].includes(lowered)) return 'income';
    if (['支出', 'expense', 'out'].includes(lowered)) return 'expense';
    throw new RangeError(`无法识别交易类型“${raw}”`);
  }
  if (mapping.fixedType) return mapping.fixedType;
  if (negative) return mapping.positiveMeans === 'income' ? 'expense' : 'income';
  return mapping.positiveMeans;
}

function mappedCategory(
  row: Record<string, string>,
  column: string | undefined,
  fixed: number | undefined,
  map: Record<string, number> | undefined,
): number {
  if (fixed) return fixed;
  if (!column) throw new RangeError('未指定分类列或固定分类');
  const raw = row[column]?.trim() ?? '';
  const value = map?.[raw];
  if (!value) throw new RangeError(`外部分类“${raw}”尚未映射`);
  return value;
}

function analyzeRows(state: AppState, userId: number, input: z.infer<typeof analyzeSchema>) {
  const records = parse(input.csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: false,
    trim: false,
  }) as Array<Record<string, string>>;
  const accepted: Array<NewTransaction & { sourceRow: number; duplicate: boolean }> = [];
  const results = records.map((row, index) => {
    const errors: string[] = [];
    try {
      const signed = parseSignedAmount(row[input.mapping.amountColumn]);
      const type = inferType(row, input.mapping, signed.negative);
      const categoryId = mappedCategory(
        row,
        input.mapping.categoryColumn,
        input.mapping.fixedCategoryId,
        input.mapping.categoryMap,
      );
      const subcategoryId = input.mapping.subcategoryColumn
        ? input.mapping.subcategoryMap?.[row[input.mapping.subcategoryColumn]?.trim() ?? ''] ?? null
        : null;
      const normalized = normalizeTransactionInput(state, userId, {
        type,
        amountFen: signed.fen,
        categoryId,
        subcategoryId,
        occurredAtLocal: completeTime(row[input.mapping.timeColumn]),
        note: input.mapping.noteColumn ? row[input.mapping.noteColumn] ?? null : null,
      });
      const databaseDuplicates = findPotentialDuplicates(state.database.current, userId, normalized);
      const localDuplicate = accepted.some(
        (candidate) =>
          candidate.type === normalized.type &&
          candidate.amountFen === normalized.amountFen &&
          Math.abs(candidate.occurredAt - normalized.occurredAt) <= 5 * 60 * 1000,
      );
      const duplicate = databaseDuplicates.length > 0 || localDuplicate;
      accepted.push({ ...normalized, sourceRow: index + 2, duplicate });
      return { sourceRow: index + 2, valid: true, duplicate, errors, normalized };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : '无法解析该行');
      return { sourceRow: index + 2, valid: false, duplicate: false, errors, normalized: null };
    }
  });
  return {
    rows: results,
    summary: {
      total: results.length,
      valid: results.filter((row) => row.valid).length,
      invalid: results.filter((row) => !row.valid).length,
      duplicates: results.filter((row) => row.duplicate).length,
    },
  };
}

export function registerImportRoutes(app: FastifyInstance, state: AppState): void {
  app.post('/api/imports/analyze', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const parsed = analyzeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_IMPORT', message: 'CSV 或字段映射配置无效' });
    try {
      return analyzeRows(state, auth.user.id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: 'CSV_PARSE_FAILED', message: error instanceof Error ? error.message : 'CSV 解析失败' });
    }
  });

  app.post('/api/imports/commit', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const parsed = commitSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_IMPORT_ROWS', message: '待导入记录无效' });
    const rows: NewTransaction[] = [];
    try {
      for (const row of parsed.data.rows) {
        if (!row.include) continue;
        rows.push(normalizeTransactionInput(state, auth.user.id, row, { allowArchived: false }));
      }
    } catch (error) {
      return reply.code(400).send({ error: 'INVALID_IMPORT_ROWS', message: error instanceof Error ? error.message : '导入记录无效' });
    }
    if (rows.length === 0) return reply.code(400).send({ error: 'EMPTY_IMPORT', message: '没有选择可导入记录' });
    const result = createImportBatchWithTransactions(state.database.current, auth.user.id, parsed.data.sourceName ?? null, rows);
    return reply.code(201).send({ ...result, rollbackAvailable: true });
  });

  app.delete('/api/imports/:batchId', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const params = z.object({ batchId: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success || !rollbackImportBatch(state.database.current, auth.user.id, params.data.batchId)) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    return reply.code(204).send();
  });
}
