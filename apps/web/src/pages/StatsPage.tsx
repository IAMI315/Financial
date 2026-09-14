import { useEffect, useMemo, useState } from 'react';
import { api, currentShanghaiMonth, money } from '../api';
import type { MonthlyStats } from '../types';

function Ranking({ title, items, total }: { title: string; items: Array<{ id: number; name: string; amountFen: number }>; total: number }) {
  return <section className="panel"><div className="panel-title"><div><span className="eyebrow">分类分析</span><h2>{title}</h2></div></div><div className="ranking">{items.map((item) => {
    const percent = total > 0 ? (item.amountFen / total) * 100 : 0;
    return <div className="rank-row" key={item.id}><div className="rank-label"><strong>{item.name}</strong><span>{money(item.amountFen)} · {percent.toFixed(1)}%</span></div><div className="bar"><i style={{ width: `${Math.min(100, percent)}%` }} /></div></div>;
  })}{items.length === 0 && <p className="empty">本月暂无数据。</p>}</div></section>;
}

export function StatsPage() {
  const [month, setMonth] = useState(currentShanghaiMonth());
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  useEffect(() => { void api<MonthlyStats>(`/api/stats/monthly?month=${month}`).then(setStats); }, [month]);
  const maxDaily = useMemo(() => Math.max(1, ...(stats?.dailyExpense.map((item) => item.amountFen) ?? [1])), [stats]);

  return <div className="page-stack">
    <section className="panel stats-header"><div><span className="eyebrow">统计</span><h2>月度收支</h2></div><label>月份<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></section>
    <section className="summary-grid"><article className="metric"><span>收入</span><strong>{money(stats?.incomeFen ?? 0)}</strong></article><article className="metric"><span>支出</span><strong>{money(stats?.expenseFen ?? 0)}</strong></article><article className="metric emphasis"><span>结余</span><strong>{money(stats?.balanceFen ?? 0)}</strong></article></section>
    <div className="two-column"><Ranking title="支出分类排行" items={stats?.expenseCategories ?? []} total={stats?.expenseFen ?? 0} /><Ranking title="收入分类排行" items={stats?.incomeCategories ?? []} total={stats?.incomeFen ?? 0} /></div>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">趋势</span><h2>每日支出</h2></div></div><div className="daily-bars">{stats?.dailyExpense.map((item) => <div className="daily-bar" key={item.date} title={`${item.date} ${money(item.amountFen)}`}><i style={{ height: `${Math.max(4, item.amountFen / maxDaily * 100)}%` }} /><span>{item.date.slice(8)}</span></div>)}{!stats?.dailyExpense.length && <p className="empty">本月暂无支出。</p>}</div></section>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">二级分类</span><h2>下钻明细</h2></div></div><div className="tag-list">{stats?.subcategories.map((item) => <span className="data-tag" key={`${item.type}-${item.id}`}>{item.name} · {money(item.amountFen)}</span>)}{!stats?.subcategories.length && <p className="empty">暂无二级分类数据。</p>}</div></section>
  </div>;
}
