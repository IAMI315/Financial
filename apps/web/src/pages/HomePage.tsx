import { useCallback, useEffect, useState } from 'react';
import { api, currentShanghaiMonth, money, shanghaiNowLocal } from '../api';
import { QuickEntry } from '../components/QuickEntry';
import { IncomeExpenseTrend } from '../components/IncomeExpenseTrend';
import type { Category, CommonTransaction, DailyMustItem, MonthlyStats, Transaction } from '../types';

export function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [commonEntries, setCommonEntries] = useState<CommonTransaction[]>([]);
  const [dailyMustEntries, setDailyMustEntries] = useState<DailyMustItem[]>([]);

  const loadDashboard = useCallback(async () => {
    const date = shanghaiNowLocal().slice(0, 10);
    const [statResult, transactionResult, commonResult, dailyMustResult] = await Promise.all([
      api<MonthlyStats>(`/api/stats/monthly?month=${currentShanghaiMonth()}`),
      api<{ items: Transaction[] }>('/api/transactions?page=1&pageSize=6'),
      api<{ items: CommonTransaction[] }>('/api/transactions/common?limit=8'),
      api<{ items: DailyMustItem[] }>(`/api/daily-must?date=${date}`),
    ]);
    setStats(statResult);
    setRecent(transactionResult.items);
    setCommonEntries(commonResult.items);
    setDailyMustEntries(dailyMustResult.items);
  }, []);

  useEffect(() => {
    void api<{ categories: Category[] }>('/api/categories?includeArchived=false').then((result) => setCategories(result.categories));
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="page-grid home-grid">
      <QuickEntry categories={categories} commonEntries={commonEntries} dailyMustEntries={dailyMustEntries} onCommonEntriesChanged={setCommonEntries} onDailyMustChanged={() => void loadDashboard()} onSaved={() => void loadDashboard()} onCategoryCreated={(category) => setCategories((current) => [...current, category])} />
      <div className="dashboard-column">
        <section className="summary-grid home-summary-grid">
          <article className="metric home-metric income"><span className="home-metric-icon">↓</span><span>本月收入</span><strong>{money(stats?.incomeFen ?? 0)}</strong><small>本月累计</small></article>
          <article className="metric home-metric expense"><span className="home-metric-icon">↑</span><span>本月支出</span><strong>{money(stats?.expenseFen ?? 0)}</strong><small>本月累计</small></article>
          <article className="metric home-metric balance"><span className="home-metric-icon">▣</span><span>本月结余</span><strong>{money(stats?.balanceFen ?? 0)}</strong><small>收入 - 支出</small></article>
        </section>
        <IncomeExpenseTrend stats={stats} title="本月收支趋势" periodLabel={`${currentShanghaiMonth().replace('-', '年')}月`} />
        <section className="panel home-recent-panel">
          <div className="panel-title"><div><span className="eyebrow">流水</span><h2>最近交易</h2></div><span className="home-recent-count">最近 {recent.length} 笔</span></div>
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
