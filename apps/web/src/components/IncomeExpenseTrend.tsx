import { money } from '../api';
import type { MonthlyStats } from '../types';
import { buildMonthDailySeries, niceMax } from '../utils/chart';

export function IncomeExpenseTrend({
  stats,
  title = '每日收支',
  month = stats?.month,
  onMonthChange,
}: {
  stats: MonthlyStats | null;
  title?: string;
  month?: string;
  onMonthChange?: (month: string) => void;
}) {
  const selectedMonth = month ?? stats?.month ?? '';
  const points = selectedMonth ? buildMonthDailySeries(selectedMonth, stats?.dailyIncome ?? [], stats?.dailyExpense ?? []) : [];
  const maxDaily = Math.max(0, ...points.flatMap((item) => [item.incomeFen, item.expenseFen]));
  const yMax = niceMax(maxDaily);
  const width = 720;
  const height = 250;
  const margin = { top: 8, right: 10, bottom: 34, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const step = points.length > 0 ? plotWidth / points.length : plotWidth;
  const barWidth = Math.min(5.5, Math.max(2.5, step * 0.28));
  const ticks = Array.from({ length: 5 }, (_, index) => index);
  const monthNumber = Number(selectedMonth.slice(5, 7));
  const labelDays = new Set([1, 5, 10, 15, 20, 25, points.length]);
  const yFor = (amountFen: number) => margin.top + plotHeight - amountFen / yMax * plotHeight;
  const hFor = (amountFen: number) => amountFen <= 0 ? 0 : Math.max(1.5, amountFen / yMax * plotHeight);

  return (
    <section className="panel trend-panel">
      <div className="panel-title trend-panel-title">
        <div><span className="eyebrow">趋势</span><h2>{title}</h2></div>
        <div className="trend-panel-meta">
          {onMonthChange && selectedMonth ? <input className="trend-month-input" type="month" value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} aria-label="趋势月份" /> : selectedMonth && <span>{selectedMonth.replace('-', '年')}月</span>}
          <div className="trend-legend" aria-label="图例"><span><i className="trend-legend-dot income" />收入</span><span><i className="trend-legend-dot expense" />支出</span></div>
        </div>
      </div>
      {points.length > 0 ? (
        <div className="trend-chart-wrap">
          <svg className="trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${selectedMonth} 每日收入支出趋势`}>
            {ticks.map((index) => {
              const ratio = index / 4;
              const value = yMax * (1 - ratio);
              const y = margin.top + plotHeight * ratio;
              return <g key={index}><line className="trend-grid-line" x1={margin.left} x2={width - margin.right} y1={y} y2={y} /><text className="trend-axis-label" x={margin.left - 9} y={y + 4} textAnchor="end">{Math.round(value / 100).toLocaleString('zh-CN')}</text></g>;
            })}
            {points.map((item, index) => {
              const center = margin.left + step * index + step / 2;
              return <g key={item.date}>
                <rect className="trend-bar income" x={center - barWidth - 1.2} y={yFor(item.incomeFen)} width={barWidth} height={hFor(item.incomeFen)} rx="2"><title>{`${item.date} · 收入 ${money(item.incomeFen)}`}</title></rect>
                <rect className="trend-bar expense" x={center + 1.2} y={yFor(item.expenseFen)} width={barWidth} height={hFor(item.expenseFen)} rx="2"><title>{`${item.date} · 支出 ${money(item.expenseFen)}`}</title></rect>
                {labelDays.has(item.day) && <text className="trend-axis-label x" x={center} y={height - 8} textAnchor="middle">{monthNumber}/{item.day}</text>}
              </g>;
            })}
          </svg>
        </div>
      ) : <p className="empty">本月暂无收支数据。</p>}
    </section>
  );
}
