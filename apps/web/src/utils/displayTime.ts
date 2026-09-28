export function formatRecentTransactionTime(occurredAtLocal: string, nowLocal: string): string {
  const date = occurredAtLocal.slice(0, 10);
  const nowDate = nowLocal.slice(0, 10);
  const toDayNumber = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
  };
  const delta = toDayNumber(nowDate) - toDayNumber(date);
  const time = occurredAtLocal.slice(11, 16);
  if (delta === 0) return `今天 ${time}`;
  if (delta === 1) return `昨天 ${time}`;
  return `${date.slice(5).replace('-', '/')} ${time}`;
}
