import { useCallback, useEffect, useState } from 'react';
import { api, currentShanghaiMonth, money } from '../api';
import { QuickEntry } from '../components/QuickEntry';
import { IncomeExpenseTrend } from '../components/IncomeExpenseTrend';
import type { Category, CommonTransaction, MonthlyStats, Transaction } from '../types';

export function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [commonEntries, setCommonEntries] = useState<CommonTransaction[]>([]);

  const loadDashboard = useCallback(async () => {
    const [statResult, transactionResult, commonResult] = await Promise.all([
      api<MonthlyStats>(`/api/stats/monthly?month=${currentShanghaiMonth()}`),
      api<{ items: Transaction[] }>('/api/transactions?page=1&pageSize=10'),
      api<{ items: CommonTransaction[] }>('/api/transactions/common?limit=8'),
    ]);
    setStats(statResult);
    setRecent(transactionResult.items);
    setCommonEntries(commonResult.items);
  }, []);

  useEffect(() => {
    void api<{ categories: Category[] }>('/api/categories?includeArchived=false').then((result) => setCategories(result.categories));
    void loadDashboard();
  }, [loadDashboard]);

  const groups = recent.reduce<Record<string, Transaction[]>>((all, item) => {
    const day = item.occurredAtLocal.slice(0, 10);
    (all[day] ??= []).push(item);
    return all;
  }, {});

  return (
    <div className="page-grid home-grid">
      <QuickEntry categories={categories} commonEntries={commonEntries} onCommonEntriesChanged={setCommonEntries} onSaved={() => void loadDashboard()} onCategoryCreated={(category) => setCategories((current) => [...current, category])} />
      <div className="dashboard-column">
        <section className="summary-grid">
          <article className="metric"><span>本月收入</span><strong>{money(stats?.incomeFen ?? 0)}</strong></article>
          <article className="metric"><span>本月支出</span><strong>{money(stats?.expenseFen ?? 0)}</strong></article>
          <article className="metric emphasis"><span>本月结余</span><strong>{money(stats?.balanceFen ?? 0)}</strong></article>
        </section>
        <IncomeExpenseTrend stats={stats} title="本月收支趋势" />
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">最近交易</span><h2>最近 10 条</h2></div></div>
          {recent.length === 0 && <p className="empty">还没有交易，先记第一笔吧。</p>}
          {Object.entries(groups).map(([day, items]) => (
            <div className="transaction-day" key={day}><h3>{day}</h3>{items.map((item) => (
              <div className="transaction-row" key={item.id}><div><strong>{item.subcategoryName || item.categoryName}</strong><span>{item.note || item.occurredAtLocal.slice(11)}</span></div><b className={item.type}>{item.type === 'expense' ? '-' : '+'}{money(item.amountFen)}</b></div>
            ))}</div>
          ))}
        </section>
      </div>
    </div>
  );
}
