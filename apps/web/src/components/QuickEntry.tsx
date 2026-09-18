import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ApiError, api, shanghaiNowLocal } from '../api';
import type { Category, CommonTransaction, TransactionType } from '../types';

export function QuickEntry({
  categories,
  commonEntries,
  onCommonEntriesChanged,
  onSaved,
  onCategoryCreated,
}: {
  categories: Category[];
  commonEntries: CommonTransaction[];
  onCommonEntriesChanged: (items: CommonTransaction[]) => void;
  onSaved: () => void;
  onCategoryCreated: (category: Category) => void;
}) {
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
  const [subcategoryPanelTop, setSubcategoryPanelTop] = useState<number | null>(null);
  const categoryGridRef = useRef<HTMLDivElement>(null);
  const [commonMenu, setCommonMenu] = useState<{ entry: CommonTransaction; x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressCommonClickRef = useRef(false);

  const roots = useMemo(
    () => categories.filter((category) => category.type === type && category.parentId === null && !category.isArchived),
    [categories, type],
  );
  const children = useMemo(
    () => categories.filter((category) => category.parentId === categoryId && !category.isArchived),
    [categories, categoryId],
  );

  useEffect(() => {
    if (!commonMenu) return;
    const close = () => setCommonMenu(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [commonMenu]);

  useLayoutEffect(() => {
    const grid = categoryGridRef.current;
    if (!grid || categoryId === '' || children.length === 0) {
      setSubcategoryPanelTop(null);
      return;
    }
    let scrollFrame = 0;
    const updatePanelPosition = () => {
      const button = grid.querySelector<HTMLElement>(`[data-category-id="${categoryId}"]`);
      const panelTop = button ? button.offsetTop + button.offsetHeight + 7 : null;
      setSubcategoryPanelTop(panelTop);
      if (button && panelTop !== null) {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = requestAnimationFrame(() => {
          const panel = grid.querySelector<HTMLElement>('.subcategory-panel');
          if (!panel) return;
          const visibleTop = grid.scrollTop;
          const visibleBottom = visibleTop + grid.clientHeight;
          const panelBottom = panel.offsetTop + panel.offsetHeight;
          if (button.offsetTop < visibleTop) {
            grid.scrollTo({ top: Math.max(0, button.offsetTop - 4), behavior: 'smooth' });
          } else if (panelBottom > visibleBottom) {
            grid.scrollTo({ top: panelBottom - grid.clientHeight + 4, behavior: 'smooth' });
          }
        });
      }
    };
    updatePanelPosition();
    const observer = new ResizeObserver(updatePanelPosition);
    observer.observe(grid);
    return () => {
      cancelAnimationFrame(scrollFrame);
      observer.disconnect();
    };
  }, [categoryId, children.length, roots.length]);

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

  function selectRootCategory(category: Category) {
    if (categoryId === category.id) {
      setCategoryId('');
      setSubcategoryId('');
      return;
    }
    setCategoryId(category.id);
    setSubcategoryId('');
    setAddingCategory(false);
    setError('');
  }

  function openCommonMenu(entry: CommonTransaction, x: number, y: number) {
    const menuWidth = 132;
    const menuHeight = 48;
    setCommonMenu({
      entry,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    });
  }

  function clearLongPress() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function startCommonLongPress(event: ReactPointerEvent<HTMLButtonElement>, entry: CommonTransaction) {
    if (event.pointerType !== 'touch') return;
    clearLongPress();
    suppressCommonClickRef.current = false;
    const { clientX, clientY } = event;
    longPressTimerRef.current = window.setTimeout(() => {
      suppressCommonClickRef.current = true;
      openCommonMenu(entry, clientX, clientY);
      longPressTimerRef.current = null;
    }, 550);
  }

  function handleCommonContextMenu(event: ReactMouseEvent<HTMLButtonElement>, entry: CommonTransaction) {
    event.preventDefault();
    clearLongPress();
    openCommonMenu(entry, event.clientX, event.clientY);
  }

  async function toggleCommonPin(entry: CommonTransaction) {
    setCommonMenu(null);
    setError('');
    try {
      const result = await api<{ items: CommonTransaction[] }>('/api/transactions/common/pin', {
        method: 'PUT',
        body: {
          type: entry.type,
          amountFen: entry.amountFen,
          categoryId: entry.categoryId,
          subcategoryId: entry.subcategoryId,
          pinned: !entry.isPinned,
        },
      });
      onCommonEntriesChanged(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '常用记账置顶操作失败');
    }
  }

  function applyCommonEntry(entry: CommonTransaction) {
    setType(entry.type);
    setAmount(entry.amount);
    setCategoryId(entry.categoryId);
    setSubcategoryId(entry.subcategoryId ?? '');
    setOccurredAtLocal(shanghaiNowLocal());
    setAddingCategory(false);
    setNewCategoryName('');
    setDuplicatePending(false);
    setError('');
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
      <div className="quick-category-layout">
        <div className="common-entry-workspace">
          <div className="category-section-title"><span>最近常用</span></div>
          <div className="common-entry-list">
            {commonEntries.map((entry, index) => (
              <button
                key={`${entry.type}-${entry.categoryId}-${entry.subcategoryId ?? 'root'}-${entry.amountFen}-${index}`}
                type="button"
                className={`common-entry-row ${entry.type}${entry.isPinned ? ' pinned' : ''}`}
                onClick={() => {
                  if (suppressCommonClickRef.current) {
                    suppressCommonClickRef.current = false;
                    return;
                  }
                  applyCommonEntry(entry);
                }}
                onContextMenu={(event) => handleCommonContextMenu(event, entry)}
                onPointerDown={(event) => startCommonLongPress(event, entry)}
                onPointerUp={clearLongPress}
                onPointerCancel={clearLongPress}
                onPointerLeave={clearLongPress}
                title={`${entry.isPinned ? '已置顶 · ' : ''}点击带入；右键或长按管理置顶`}
              >
                <span className={`common-entry-type ${entry.type}`}>{entry.type === 'income' ? '收' : '支'}</span>
                <span className="common-entry-name">{entry.categoryName}{entry.subcategoryName ? `-${entry.subcategoryName}` : ''}</span>
                <strong className="common-entry-amount">{entry.amount}</strong>
              </button>
            ))}
            {commonEntries.length === 0 && <p className="common-entry-empty">记几笔后，这里会显示常用组合。</p>}
          </div>
        </div>
        <div className="category-workspace">
          <div className="category-section-title"><span>一级分类</span></div>
          <div ref={categoryGridRef} className="category-grid">
            {roots.map((category) => {
              const selected = categoryId === category.id;
              const hasChildren = categories.some((item) => item.parentId === category.id && !item.isArchived);
              return (
                <button key={category.id} data-category-id={category.id} type="button" aria-expanded={selected && hasChildren} className={selected ? 'category-chip selected' : 'category-chip'} onClick={() => selectRootCategory(category)}>
                  <span className="category-chip-label">{category.name}</span><span className={selected && hasChildren ? 'category-chevron expanded' : 'category-chevron'} aria-hidden="true" />
                </button>
              );
            })}
            <button type="button" className="category-chip add-category-chip" onClick={() => { setAddingCategory(true); setCategoryId(''); setSubcategoryId(''); setError(''); }}>＋ 增加新分类</button>
            {children.length > 0 && categoryId !== '' && subcategoryPanelTop !== null && (
              <div className="subcategory-panel" style={{ top: subcategoryPanelTop }}>
                <div className="subcategory-panel-title">二级分类 <span>可选</span></div>
                <div className="subcategory-grid">
                  {children.map((item) => (
                    <button key={item.id} type="button" className={subcategoryId === item.id ? 'subcategory-chip selected' : 'subcategory-chip'} onClick={() => setSubcategoryId(subcategoryId === item.id ? '' : item.id)}>{item.name}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {addingCategory && <div className="quick-category-form"><input autoFocus value={newCategoryName} maxLength={40} placeholder={`新增${type === 'expense' ? '支出' : '收入'}一级分类`} onChange={(event) => setNewCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createRootCategory(); if (event.key === 'Escape') { setAddingCategory(false); setNewCategoryName(''); } }} /><button type="button" className="primary" disabled={creatingCategory} onClick={() => void createRootCategory()}>{creatingCategory ? '添加中…' : '添加'}</button><button type="button" className="secondary" disabled={creatingCategory} onClick={() => { setAddingCategory(false); setNewCategoryName(''); }}>取消</button></div>}
        </div>
      </div>
      <label>交易时间<input type="datetime-local" step="1" value={occurredAtLocal} onChange={(event) => setOccurredAtLocal(event.target.value)} /></label>
      {commonMenu && (
        <div className="common-entry-menu" style={{ left: commonMenu.x, top: commonMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => void toggleCommonPin(commonMenu.entry)}>{commonMenu.entry.isPinned ? '取消置顶' : '置顶'}</button>
        </div>
      )}
      <details><summary>添加备注</summary><textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选" /></details>
      {error && <div className="notice error">{error}</div>}
      <button className="primary wide" type="button" onClick={() => void save(duplicatePending)}>{duplicatePending ? '确认仍然保存' : '保存'}</button>
      {saved && <button type="button" className="success-action" onClick={() => setSaved(false)}>✓ 记账成功 · 继续记一笔</button>}
    </section>
  );
}
