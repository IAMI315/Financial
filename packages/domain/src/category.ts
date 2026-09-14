import type { TransactionType } from './transaction.js';

export function assertCategoryTypeMatchesParent(
  parentType: TransactionType,
  childType: TransactionType,
): void {
  if (parentType !== childType) {
    throw new RangeError('二级分类必须继承一级分类的收入/支出类型');
  }
}
