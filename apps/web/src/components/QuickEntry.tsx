import { useMemo, useState } from 'react';
import { ApiError, api, shanghaiNowLocal } from '../api';
import type { Category, TransactionType } from '../types';

export function QuickEntry({ categories, onSaved, onCategoryCreated }: { categories: Category[]; onSaved: () => void; onCategoryCreated: (category: Category) => void }) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [subcategoryId, setSubcategoryId] = useState<number | ''>('');
  const [occurredAtLocal, setOccurredAtLocal] = useState(shanghaiNowLocal());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [duplicatePending, setDuplicatePending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  const roots = useMemo(
    () => categories.filter((category) => category.type === type && category.parentId === null && !category.isArchived),
    [categories, type],
  );
  const children = useMemo(
    () => categories.filter((category) => category.parentId === categoryId && !category.isArchived),
    [categories, categoryId],
  );

  function switchType(nextType: TransactionType) {
    const selected = categoryId === '' ? undefined : categories.find((category) => category.id === categoryId && category.parentId === null && !category.isArchived);
    const matching = selected
      ? categories.find((category) => category.type === nextType && category.parentId === null && !category.isArchived && category.name === selected.name)
      : undefined;
    setType(nextType);
    setCategoryId(matching?.id ?? '');
    setSubcategoryId('');
    setAddingCategory(false);
    setNewCategoryName('');
  }

  function reset() {
    setType('expense');
    setAmount('');
    setCategoryId('');
    setSubcategoryId('');
    setOccurredAtLocal(shanghaiNowLocal());
    setNote('');
    setDuplicatePending(false);
  }

  async function createRootCategory() {
    const name = newCategoryName.trim();
    if (!name) return setError('请输入一级分类名称');
    setCreatingCategory(true);
    setError('');
    try {
      const result = await api<{ category: Category }>('/api/categories', { method: 'POST', body: { type, name, parentId: null, sortOrder: roots.reduce((highest, category) => Math.max(highest, category.sortOrder), -1) + 1 } });
      onCategoryCreated(result.category);
      setCategoryId(result.category.id);
      setSubcategoryId('');
      setNewCategoryName('');
      setAddingCategory(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分类创建失败');
    } finally {
      setCreatingCategory(false);
    }
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
        <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => switchType('expense')}>支出</button>
        <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => switchType('income')}>收入</button>
      </div>
      <div className="money-field"><span>¥</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" aria-label="金额" /></div>
      <div className="category-section-title"><span>一级分类</span></div>
      <div className="category-grid">
        {roots.map((category) => (
          <button key={category.id} type="button" className={categoryId === category.id ? 'category-chip selected' : 'category-chip'} onClick={() => { setCategoryId(category.id); setSubcategoryId(''); setAddingCategory(false); }}>{category.name}</button>
        ))}
        <button type="button" className="category-chip add-category-chip" onClick={() => { setAddingCategory(true); setCategoryId(''); setSubcategoryId(''); setError(''); }}>＋ 增加新分类</button>
      </div>
      {addingCategory && <div className="quick-category-form"><input autoFocus value={newCategoryName} maxLength={40} placeholder={`新增${type === 'expense' ? '支出' : '收入'}一级分类`} onChange={(event) => setNewCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createRootCategory(); if (event.key === 'Escape') { setAddingCategory(false); setNewCategoryName(''); } }} /><button type="button" className="primary" disabled={creatingCategory} onClick={() => void createRootCategory()}>{creatingCategory ? '添加中…' : '添加'}</button><button type="button" className="secondary" disabled={creatingCategory} onClick={() => { setAddingCategory(false); setNewCategoryName(''); }}>取消</button></div>}
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
