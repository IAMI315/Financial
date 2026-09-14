import { useEffect, useMemo, useState } from 'react';
import { api, download, shanghaiNowLocal } from '../api';
import type { Category, Transaction, TransactionType } from '../types';

type TransactionList = {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
};

type EditState = {
  id: number;
  type: TransactionType;
  amount: string;
  categoryId: number;
  subcategoryId: number | '';
  occurredAtLocal: string;
  note: string;
};

export function TransactionsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<TransactionList>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [filters, setFilters] = useState({ from: '', to: '', type: '', categoryId: '', subcategoryId: '', keyword: '' });
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [message, setMessage] = useState('');

  const search = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters, page]);

  async function load() {
    const [categoryResult, transactionResult] = await Promise.all([
      api<{ categories: Category[] }>('/api/categories'),
      api<TransactionList>(`/api/transactions?${search}`),
    ]);
    setCategories(categoryResult.categories);
    setResult(transactionResult);
  }

  useEffect(() => { void load(); }, [search]);

  const rootCategories = categories.filter((item) => item.parentId === null && (!filters.type || item.type === filters.type));
  const subcategories = categories.filter((item) => item.parentId === Number(filters.categoryId));
  const editRoots = categories.filter((item) => item.parentId === null && item.type === edit?.type);
  const editChildren = categories.filter((item) => item.parentId === edit?.categoryId);

  function updateFilter(name: string, value: string) {
    setFilters((current) => ({ ...current, [name]: value, ...(name === 'type' ? { categoryId: '', subcategoryId: '' } : {}), ...(name === 'categoryId' ? { subcategoryId: '' } : {}) }));
    setPage(1);
  }

  async function saveEdit() {
    if (!edit) return;
    setMessage('');
    try {
      await api(`/api/transactions/${edit.id}`, {
        method: 'PUT',
        body: {
          type: edit.type,
          amount: edit.amount,
          categoryId: edit.categoryId,
          subcategoryId: edit.subcategoryId || null,
          occurredAtLocal: edit.occurredAtLocal || shanghaiNowLocal(),
          note: edit.note.trim() || null,
        },
      });
      setEdit(null);
      setMessage('交易已更新');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  }

  async function remove(item: Transaction) {
    if (!window.confirm(`永久删除“${item.categoryName} ${item.amount}”这笔交易？此操作不可恢复。`)) return;
    await api(`/api/transactions/${item.id}`, { method: 'DELETE' });
    setMessage('交易已永久删除');
    await load();
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">流水</span><h2>筛选与导出</h2></div><button className="secondary" onClick={() => void download(`/api/transactions-export.csv?${search}`, 'transactions.csv')}>导出当前结果</button></div>
        <div className="filter-grid">
          <label>开始日期<input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
          <label>结束日期<input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
          <label>类型<select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="">全部</option><option value="expense">支出</option><option value="income">收入</option></select></label>
          <label>一级分类<select value={filters.categoryId} onChange={(event) => updateFilter('categoryId', event.target.value)}><option value="">全部</option>{rootCategories.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isArchived ? '（已归档）' : ''}</option>)}</select></label>
          <label>二级分类<select value={filters.subcategoryId} onChange={(event) => updateFilter('subcategoryId', event.target.value)}><option value="">全部</option>{subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>备注关键词<input value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} placeholder="搜索备注" /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">结果</span><h2>{result.total} 笔交易</h2></div></div>
        {message && <div className="notice">{message}</div>}
        <div className="transaction-list">
          {result.items.map((item) => (
            <div className="transaction-row roomy" key={item.id}>
              <div><strong>{item.subcategoryName || item.categoryName}</strong><span>{item.occurredAtLocal.replace('T', ' ')}{item.note ? ` · ${item.note}` : ''}</span></div>
              <b className={item.type}>{item.type === 'expense' ? '-' : '+'}¥{item.amount}</b>
              <div className="row-actions"><button className="text-button" onClick={() => setEdit({ id: item.id, type: item.type, amount: item.amount, categoryId: item.categoryId, subcategoryId: item.subcategoryId ?? '', occurredAtLocal: item.occurredAtLocal, note: item.note ?? '' })}>编辑</button><button className="text-button danger" onClick={() => void remove(item)}>删除</button></div>
            </div>
          ))}
          {result.items.length === 0 && <p className="empty">没有符合条件的交易。</p>}
        </div>
        <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {page} 页</span><button disabled={page * result.pageSize >= result.total} onClick={() => setPage((value) => value + 1)}>下一页</button></div>
      </section>

      {edit && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEdit(null)}>
          <section className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-title"><h2>编辑交易</h2><button className="icon-button" onClick={() => setEdit(null)}>×</button></div>
            <div className="stack">
              <label>类型<select value={edit.type} onChange={(event) => setEdit({ ...edit, type: event.target.value as TransactionType, categoryId: 0, subcategoryId: '' })}><option value="expense">支出</option><option value="income">收入</option></select></label>
              <label>金额<input inputMode="decimal" value={edit.amount} onChange={(event) => setEdit({ ...edit, amount: event.target.value })} /></label>
              <label>一级分类<select value={edit.categoryId || ''} onChange={(event) => setEdit({ ...edit, categoryId: Number(event.target.value), subcategoryId: '' })}><option value="">请选择</option>{editRoots.map((item) => <option value={item.id} key={item.id}>{item.name}{item.isArchived ? '（已归档）' : ''}</option>)}</select></label>
              <label>二级分类<select value={edit.subcategoryId} onChange={(event) => setEdit({ ...edit, subcategoryId: event.target.value ? Number(event.target.value) : '' })}><option value="">不选择</option>{editChildren.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label>交易时间<input type="datetime-local" step="1" value={edit.occurredAtLocal} onChange={(event) => setEdit({ ...edit, occurredAtLocal: event.target.value })} /></label>
              <label>备注<textarea rows={3} value={edit.note} onChange={(event) => setEdit({ ...edit, note: event.target.value })} /></label>
              <button className="primary" onClick={() => void saveEdit()}>保存修改</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
