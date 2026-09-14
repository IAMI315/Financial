import {
  createTransaction,
  findPotentialDuplicates,
  getCategory,
  getTransaction,
  updateTransaction,
  type NewTransaction,
  type TransactionRecord,
  type TransactionType,
} from '@financial/database';
import { assertPositiveFen, assertTransactionTimeNotFuture, parseCnyToFen } from '@financial/domain';
import type { AppState } from './runtime.js';

export type TransactionInput = {
  type: TransactionType;
  amount?: string | undefined;
  amountFen?: number | undefined;
  categoryId: number;
  subcategoryId?: number | null | undefined;
  occurredAtLocal?: string | undefined;
  occurredAt?: number | undefined;
  note?: string | null | undefined;
};

export function normalizeTransactionInput(
  state: AppState,
  userId: number,
  input: TransactionInput,
  options: { existing?: TransactionRecord; allowArchived?: boolean } = {},
): NewTransaction {
  if (input.type !== 'income' && input.type !== 'expense') throw new RangeError('交易类型无效');
  const amountFen = input.amountFen ?? (input.amount == null ? NaN : parseCnyToFen(input.amount));
  assertPositiveFen(amountFen);
  const occurredAt =
    input.occurredAt ??
    (input.occurredAtLocal == null ? NaN : assertTransactionTimeNotFuture(input.occurredAtLocal));
  if (!Number.isSafeInteger(occurredAt) || occurredAt > Date.now()) throw new RangeError('交易时间不能晚于当前时间');
  const category = getCategory(state.database.current, userId, input.categoryId);
  if (!category || category.parentId !== null) throw new RangeError('一级分类不存在');
  if (category.type !== input.type) throw new RangeError('分类类型与交易类型不一致');
  const retainingArchivedCategory = options.existing?.categoryId === category.id;
  if (category.isArchived && !options.allowArchived && !retainingArchivedCategory) {
    throw new RangeError('归档分类不能用于新交易');
  }
  let subcategoryId: number | null = null;
  if (input.subcategoryId != null) {
    const subcategory = getCategory(state.database.current, userId, input.subcategoryId);
    if (!subcategory || subcategory.parentId !== category.id || subcategory.type !== input.type) {
      throw new RangeError('二级分类与一级分类不匹配');
    }
    const retainingArchivedSubcategory = options.existing?.subcategoryId === subcategory.id;
    if (subcategory.isArchived && !options.allowArchived && !retainingArchivedSubcategory) {
      throw new RangeError('归档二级分类不能用于新交易');
    }
    subcategoryId = subcategory.id;
  }
  const note = input.note?.trim() || null;
  if (note && Array.from(note).length > 500) throw new RangeError('备注不能超过 500 个字符');
  return { type: input.type, amountFen, categoryId: category.id, subcategoryId, occurredAt, note };
}

export function createValidatedTransaction(
  state: AppState,
  userId: number,
  input: TransactionInput,
  confirmDuplicate = false,
): { transaction?: TransactionRecord; duplicates?: TransactionRecord[] } {
  const normalized = normalizeTransactionInput(state, userId, input);
  const duplicates = findPotentialDuplicates(state.database.current, userId, normalized);
  if (duplicates.length > 0 && !confirmDuplicate) return { duplicates };
  return { transaction: createTransaction(state.database.current, userId, normalized) };
}

export function updateValidatedTransaction(
  state: AppState,
  userId: number,
  transactionId: number,
  input: TransactionInput,
): TransactionRecord | null {
  const existing = getTransaction(state.database.current, userId, transactionId);
  if (!existing) return null;
  const normalized = normalizeTransactionInput(state, userId, input, { existing });
  return updateTransaction(state.database.current, userId, transactionId, normalized);
}
