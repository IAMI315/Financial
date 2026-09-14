import { useMemo, useState } from 'react';
import { ApiError, api, shanghaiNowLocal } from '../api';
import type { Category, TransactionType } from '../types';

export function QuickEntry({ categories, onSaved }: { categories: Category[]; onSaved: () => void }) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [subcategoryId, setSubcategoryId] = useState<number | ''>('');
  const [occurredAtLocal, setOccurredAtLocal] = useState(shanghaiNowLocal());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [duplicatePending, setDuplicatePending] = useState(false);
  const [saved, setSaved] = useState(false);

  const roots = useMemo(
    () => categories.filter((category) => category.type === type && category.parentId === null && !category.isArchived),
    [categories, type],
  );
  const children = useMemo(
    () => categories.filter((category) => category.parentId === categoryId && !category.isArchived),
    [categories, categoryId],
  );

  function reset() {
    setType('expense');
    setAmount('');
    setCategoryId('');
    setSubcategoryId('');
    setOccurredAtLocal(shanghaiNowLocal());
    setNote('');
    setDuplicatePending(false);
  }

  async function save(confirmDuplicate = false) {
    setError('');
    if (!categoryId) return setError('请选择一级分类');
    try {
      await api('/api/transactions', {
        method: 'POST',
        body: {
          type,
          amount,
          categoryId,
          subcategoryId: subcategoryId || null,
          occurredAtLocal,
          note: note.trim() || null,
          confirmDuplicate,
        },
      });
      reset();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 5000);
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.data.error === 'POTENTIAL_DUPLICATE') {
        setDuplicatePending(true);
        setError('发现相近时间、相同金额的记录。确认不是误点后仍可保存。');
      } else {
        setError(cause instanceof Error ? cause.message : '保存失败');
      }
    }
  }

  return (
    <section className="panel quick-entry">
      <div className="panel-title"><div><span className="eyebrow">快速记账</span><h2>记一笔</h2></div><span className="online-dot">联网</span></div>
      <div className="segmented compact">
        <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => { setType('expense'); setCategoryId(''); setSubcategoryId(''); }}>支出</button>
        <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => { setType('income'); setCategoryId(''); setSubcategoryId(''); }}>收入</button>
      </div>
      <div className="money-field"><span>¥</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" aria-label="金额" /></div>
      <div className="category-grid">
        {roots.map((category) => (
          <button key={category.id} type="button" className={categoryId === category.id ? 'category-chip selected' : 'category-chip'} onClick={() => { setCategoryId(category.id); setSubcategoryId(''); }}>{category.name}</button>
        ))}
      </div>
      {children.length > 0 && (
        <label>二级分类<select value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value ? Number(event.target.value) : '')}><option value="">不选择</option>{children.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      )}
      <label>交易时间<input type="datetime-local" step="1" value={occurredAtLocal} onChange={(event) => setOccurredAtLocal(event.target.value)} /></label>
      <details><summary>添加备注</summary><textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选" /></details>
      {error && <div className="notice error">{error}</div>}
      <button className="primary wide" type="button" onClick={() => void save(duplicatePending)}>{duplicatePending ? '确认仍然保存' : '保存'}</button>
      {saved && <button type="button" className="success-action" onClick={() => setSaved(false)}>✓ 记账成功 · 继续记一笔</button>}
    </section>
  );
}
