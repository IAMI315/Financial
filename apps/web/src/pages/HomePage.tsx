import { useCallback, useEffect, useState } from 'react';
import { api, currentShanghaiMonth, money, shanghaiNowLocal } from '../api';
import { QuickEntry } from '../components/QuickEntry';
import { IncomeExpenseTrend } from '../components/IncomeExpenseTrend';
import type { Category, CommonTransaction, DailyMustItem, MonthlyStats, Transaction } from '../types';
import type { Page } from '../App';

function MetricComparison({ value }: { value: number | null | undefined }) {
  if (value == null) return <small className="metric-comparison neutral">较上月 <b>—</b></small>;
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const sign = value > 0 ? '+' : '';
  return <small className={`metric-comparison ${direction}`}>较上月 <b>{sign}{value.toFixed(1)}%</b> <span aria-hidden="true">{value > 0 ? '↑' : value < 0 ? '↓' : '→'}</span></small>;
}

function MetricMiniBars({ values }: { values: number[] }) {
  const recent = values.slice(-7);
  const max = Math.max(1, ...recent.map((value) => Math.abs(value)));
  return <span className="metric-mini-bars" aria-hidden="true">{recent.map((value, index) => <i key={index} style={{ height: `${Math.max(5, Math.round(Math.abs(value) / max * 32))}px` }} />)}</span>;
}

function balanceSeries(stats: MonthlyStats | null): number[] {
  if (!stats) return [];
  const income = new Map(stats.dailyIncome.map((item) => [item.date, item.amountFen]));
  const expense = new Map(stats.dailyExpense.map((item) => [item.date, item.amountFen]));
  const dates = [...new Set([...income.keys(), ...expense.keys()])].sort();
  return dates.map((date) => (income.get(date) ?? 0) - (expense.get(date) ?? 0));
}

export function HomePage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentShanghaiMonth());
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [commonEntries, setCommonEntries] = useState<CommonTransaction[]>([]);
  const [dailyMustEntries, setDailyMustEntries] = useState<DailyMustItem[]>([]);

  const loadHomeActivity = useCallback(async () => {
    const date = shanghaiNowLocal().slice(0, 10);
    const [transactionResult, commonResult, dailyMustResult] = await Promise.all([
      api<{ items: Transaction[] }>('/api/transactions?page=1&pageSize=6'),
      api<{ items: CommonTransaction[] }>('/api/transactions/common?limit=8'),
      api<{ items: DailyMustItem[] }>(`/api/daily-must?date=${date}`),
    ]);
    setRecent(transactionResult.items);
    setCommonEntries(commonResult.items);
    setDailyMustEntries(dailyMustResult.items);
  }, []);

  const loadMonthlyStats = useCallback(async (month: string) => {
    setStats(await api<MonthlyStats>(`/api/stats/monthly?month=${month}`));
  }, []);

  const refreshAfterSave = useCallback(async () => {
    await loadHomeActivity();
    if (selectedMonth === currentShanghaiMonth()) await loadMonthlyStats(selectedMonth);
  }, [loadHomeActivity, loadMonthlyStats, selectedMonth]);

  useEffect(() => {
    void api<{ categories: Category[] }>('/api/categories?includeArchived=false').then((result) => setCategories(result.categories));
    void loadHomeActivity();
  }, [loadHomeActivity]);

  useEffect(() => {
    void loadMonthlyStats(selectedMonth);
  }, [loadMonthlyStats, selectedMonth]);

  return (
    <div className="page-grid home-grid">
      <QuickEntry categories={categories} commonEntries={commonEntries} dailyMustEntries={dailyMustEntries} onCommonEntriesChanged={setCommonEntries} onDailyMustChanged={() => void loadHomeActivity()} onSaved={() => void refreshAfterSave()} onOpenCategories={() => onNavigate('categories')} />
      <div className="dashboard-column">
        <section className="summary-grid home-summary-grid">
          <article className="metric home-metric income"><span className="home-metric-icon">↓</span><span className="home-metric-label">本月收入</span><strong>{money(stats?.incomeFen ?? 0)}</strong><MetricComparison value={stats?.comparison.incomePercent} /><MetricMiniBars values={stats?.dailyIncome.map((item) => item.amountFen) ?? []} /></article>
          <article className="metric home-metric expense"><span className="home-metric-icon">↑</span><span className="home-metric-label">本月支出</span><strong>{money(stats?.expenseFen ?? 0)}</strong><MetricComparison value={stats?.comparison.expensePercent} /><MetricMiniBars values={stats?.dailyExpense.map((item) => item.amountFen) ?? []} /></article>
          <article className="metric home-metric balance"><span className="home-metric-icon">▣</span><span className="home-metric-label">本月结余</span><strong>{money(stats?.balanceFen ?? 0)}</strong><MetricComparison value={stats?.comparison.balancePercent} /><MetricMiniBars values={balanceSeries(stats)} /></article>
        </section>
        <IncomeExpenseTrend stats={stats} title="本月收支趋势" month={selectedMonth} onMonthChange={setSelectedMonth} />
        <section className="panel home-recent-panel">
          <div className="panel-title"><div><span className="eyebrow">流水</span><h2>最近交易</h2></div><button type="button" className="dashboard-link" onClick={() => onNavigate('transactions')}>查看更多 <span aria-hidden="true">›</span></button></div>
          {recent.length === 0 ? <p className="empty">还没有交易，先记第一笔吧。</p> : (
            <div className="home-recent-table">
              <div className="home-recent-head"><span>时间</span><span>分类</span><span>备注</span><span>金额</span></div>
              {recent.map((item) => (
                <div className="home-recent-row" key={item.id}>
                  <span>{item.occurredAtLocal.slice(5, 10)} {item.occurredAtLocal.slice(11, 16)}</span>
                  <strong>{item.categoryName}{item.subcategoryName ? ` · ${item.subcategoryName}` : ''}</strong>
                  <span>{item.note || '—'}</span>
                  <b className={item.type}>{item.type === 'expense' ? '-' : '+'}{money(item.amountFen)}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
