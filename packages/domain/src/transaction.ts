export const transactionTypes = ['income', 'expense'] as const;

export type TransactionType = (typeof transactionTypes)[number];

export function isTransactionType(value: string): value is TransactionType {
  return transactionTypes.includes(value as TransactionType);
}
