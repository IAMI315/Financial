export type TransactionType = 'income' | 'expense';

export type User = {
  id: number;
  username: string;
  email: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt?: number;
};

export type Category = {
  id: number;
  userId: number;
  type: TransactionType;
  name: string;
  parentId: number | null;
  isArchived: boolean;
  sortOrder: number;
};

export type DefaultCategoryConfigItem = {
  id: string;
  type: TransactionType;
  name: string;
  children: Array<{ id: string; name: string }>;
};

export type Transaction = {
  id: number;
  userId: number;
  type: TransactionType;
  amountFen: number;
  amount: string;
  categoryId: number;
  categoryName: string;
  subcategoryId: number | null;
  subcategoryName: string | null;
  occurredAt: number;
  occurredAtLocal: string;
  note: string | null;
  importBatchId: number | null;
};

export type MonthlyStats = {
  month: string;
  incomeFen: number;
  expenseFen: number;
  balanceFen: number;
  incomeCategories: Array<{ id: number; name: string; amountFen: number }>;
  expenseCategories: Array<{ id: number; name: string; amountFen: number }>;
  subcategories: Array<{
    id: number;
    name: string;
    parentId: number;
    amountFen: number;
    type: TransactionType;
  }>;
  dailyIncome: Array<{ date: string; amountFen: number }>;
  dailyExpense: Array<{ date: string; amountFen: number }>;
};

export type BackupInfo = {
  name: string;
  size: number;
  modifiedAt: string;
  kind: 'daily' | 'weekly' | 'monthly' | 'manual' | 'pre-restore';
};

export type AdminStatus = {
  appVersion: string;
  database: string;
  databaseSize: number;
  users: number;
  transactions: number;
  registrationOpen: boolean;
  latestAutomaticBackup: string | null;
  latestBackupResult: string;
  backupCount: number;
  maintenance: boolean;
};
