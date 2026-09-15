import { money } from '../api';
import type { MonthlyStats } from '../types';

export function IncomeExpenseTrend({
  stats,
  title = '每日收支',
}: {
  stats: MonthlyStats | null;
  title?: string;
}) {
  const byDate = new Map<string, { date: string; incomeFen: number; expenseFen: number }>();
  for (const item of stats?.dailyIncome ?? []) {
    byDate.set(item.date, { date: item.date, incomeFen: item.amountFen, expenseFen: 0 });
  }
  for (const item of stats?.dailyExpense ?? []) {
    const point = byDate.get(item.date) ?? { date: item.date, incomeFen: 0, expenseFen: 0 };
    point.expenseFen = item.amountFen;
    byDate.set(item.date, point);
  }
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const maxDaily = Math.max(1, ...points.flatMap((item) => [item.incomeFen, item.expenseFen]));
  const barHeight = (amountFen: number) => amountFen > 0 ? `${Math.max(4, amountFen / maxDaily * 100)}%` : '0%';

  return (
    <section className="panel trend-panel">
      <div className="panel-title trend-panel-title">
        <div><span className="eyebrow">趋势</span><h2>{title}</h2></div>
        <div className="trend-legend" aria-label="图例">
          <span><i className="trend-legend-dot income" />收入</span>
          <span><i className="trend-legend-dot expense" />支出</span>
        </div>
      </div>
      {points.length > 0 ? (
        <div className="daily-bars trend-bars">
          {points.map((item) => (
            <div
              className="daily-trend-day"
              key={item.date}
              title={`${item.date} · 收入 ${money(item.incomeFen)} · 支出 ${money(item.expenseFen)}`}
            >
              <div className="daily-trend-columns">
                <i className="income" style={{ height: barHeight(item.incomeFen) }} />
                <i className="expense" style={{ height: barHeight(item.expenseFen) }} />
              </div>
              <span>{item.date.slice(8)}</span>
            </div>
          ))}
        </div>
      ) : <p className="empty">本月暂无收支数据。</p>}
    </section>
  );
}
