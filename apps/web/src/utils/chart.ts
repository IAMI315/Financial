export type MonthDailyPoint = {
  date: string;
  day: number;
  incomeFen: number;
  expenseFen: number;
};

export function buildMonthDailySeries(
  month: string,
  dailyIncome: Array<{ date: string; amountFen: number }>,
  dailyExpense: Array<{ date: string; amountFen: number }>,
): MonthDailyPoint[] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthValue = Number(match[2]);
  if (monthValue < 1 || monthValue > 12) return [];
  const days = new Date(Date.UTC(year, monthValue, 0)).getUTCDate();
  const income = new Map(dailyIncome.map((item) => [item.date, item.amountFen]));
  const expense = new Map(dailyExpense.map((item) => [item.date, item.amountFen]));
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return {
      date,
      day,
      incomeFen: income.get(date) ?? 0,
      expenseFen: expense.get(date) ?? 0,
    };
  });
}

export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 100;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const normalized = value / exponent;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 4 ? 4 : normalized <= 5 ? 5 : normalized <= 8 ? 8 : 10;
  return nice * exponent;
}
