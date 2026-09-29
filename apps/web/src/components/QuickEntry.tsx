import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ApiError, api, shanghaiNowLocal } from '../api';
import { DailyMustEntry } from './DailyMustEntry';
import { AmountCalculator } from './AmountCalculator';
import { CategoryIcon } from './CategoryIcon';
import type { Category, CommonTransaction, DailyMustItem, TransactionType } from '../types';

export function QuickEntry({
  categories,
  commonEntries,
  dailyMustEntries,
  onCommonEntriesChanged,
  onDailyMustChanged,
  onSaved,
  onOpenCategories,
}: {
  categories: Category[];
  commonEntries: CommonTransaction[];
  dailyMustEntries: DailyMustItem[];
  onCommonEntriesChanged: (items: CommonTransaction[]) => void;
  onDailyMustChanged: () => void;
  onSaved: () => void;
  onOpenCategories: () => void;
}) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [amountFromCommon, setAmountFromCommon] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showAllCommon, setShowAllCommon] = useState(false);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [subcategoryId, setSubcategoryId] = useState<number | ''>('');
  const [occurredAtLocal, setOccurredAtLocal] = useState(shanghaiNowLocal());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [duplicatePending, setDuplicatePending] = useState(false);
  const [saved, setSaved] = useState(false);
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
  }

  function selectRootCategory(category: Category) {
    if (categoryId === category.id) {
      setCategoryId('');
      setSubcategoryId('');
      return;
    }
    setCategoryId(category.id);
    setSubcategoryId('');
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

  function applyDailyMustEntry(entry: DailyMustItem) {
    setType(entry.type);
    setAmount(entry.suggestedAmountFen > 0 ? entry.suggestedAmount : '');
    setAmountFromCommon(entry.suggestedAmountFen > 0);
    setCategoryId(entry.categoryId);
    setSubcategoryId(entry.subcategoryId ?? '');
    setOccurredAtLocal(shanghaiNowLocal());
    setDuplicatePending(false);
    setError('');
  }

  function applyCommonEntry(entry: CommonTransaction) {
    setType(entry.type);
    setAmount(entry.amount);
    setAmountFromCommon(true);
    setCategoryId(entry.categoryId);
    setSubcategoryId(entry.subcategoryId ?? '');
    setOccurredAtLocal(shanghaiNowLocal());
    setDuplicatePending(false);
    setError('');
  }

  function reset() {
    setType('expense');
    setAmount('');
    setAmountFromCommon(false);
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
      <div className="panel-title quick-entry-panel-title"><div><h2>快速记账</h2><span>随手记录每一笔，让生活更清晰</span></div></div>
      <DailyMustEntry items={dailyMustEntries} categories={categories} onSelect={applyDailyMustEntry} onRefresh={onDailyMustChanged} />
      <div className="segmented compact">
        <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => switchType('expense')}>支出</button>
        <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => switchType('income')}>收入</button>
      </div>
      <div className="money-row"><div className="money-field"><span>¥</span><input value={amount} onChange={(event) => { setAmount(event.target.value); setAmountFromCommon(false); }} onClick={() => { if (amountFromCommon) { setAmount(''); setAmountFromCommon(false); } }} inputMode="decimal" placeholder="0.00" aria-label="金额" /></div><div className="calculator-anchor"><button type="button" className="calculator-trigger" onClick={() => setShowCalculator((value) => !value)} aria-expanded={showCalculator}><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="4" width="20" height="24" rx="4"/><rect x="10" y="8" width="12" height="5" rx="1"/><path d="M10 18h2M16 18h2M22 18h.01M10 23h2M16 23h2M22 23h.01"/></svg><span>计算器</span></button>{showCalculator && <AmountCalculator initialValue={amount} onClose={() => setShowCalculator(false)} onConfirm={(value) => { setAmount(value); setAmountFromCommon(false); }} />}</div></div>
      <div className="quick-entry-actions">
        {error && <div className="notice error">{error}</div>}
        <button className="primary wide" type="button" onClick={() => void save(duplicatePending)}>{duplicatePending ? '确认仍然保存' : '保存'}</button>
        {saved && <button type="button" className="success-action" onClick={() => setSaved(false)}>✓ 记账成功 · 继续记一笔</button>}
      </div>
      <div className="quick-entry-scroll">
        <div className="quick-category-layout">
          <div className="common-entry-workspace">
            <div className="category-section-title section-heading-row"><span>最近常用</span><button type="button" onClick={() => setShowAllCommon((value) => !value)}>{showAllCommon ? '收起' : '更多'} <span aria-hidden="true">›</span></button></div>
            <div className="common-entry-list">
              {commonEntries.slice(0, showAllCommon ? 8 : 5).map((entry, index) => (
                <button
                  key={`${entry.type}-${entry.categoryId}-${entry.subcategoryId ?? 'root'}-${index}`}
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
                  <CategoryIcon categoryName={entry.categoryName} type={entry.type} size="sm" />
                  <span className="common-entry-name">{entry.categoryName}{entry.subcategoryName ? `-${entry.subcategoryName}` : ''}</span>
                  <span className="common-entry-tail">{entry.isPinned && <i className="common-pin" aria-label="已置顶" />}<strong className="common-entry-amount">{entry.amount}</strong></span>
                </button>
              ))}
              {commonEntries.length === 0 && <p className="common-entry-empty">记几笔后，这里会显示常用组合。</p>}
            </div>
          </div>
          <div className="category-workspace">
            <div className="category-section-title section-heading-row"><span>一级分类</span><button type="button" onClick={onOpenCategories}>全部分类 <span aria-hidden="true">›</span></button></div>
            <div ref={categoryGridRef} className="category-grid">
              {roots.map((category) => {
                const selected = categoryId === category.id;
                const hasChildren = categories.some((item) => item.parentId === category.id && !item.isArchived);
                return (
                  <button key={category.id} data-category-id={category.id} type="button" aria-expanded={selected && hasChildren} className={selected ? 'category-chip selected' : 'category-chip'} onClick={() => selectRootCategory(category)}>
                    <CategoryIcon categoryName={category.name} type={category.type} size="sm" /><span className="category-chip-label">{category.name}</span><span className={selected && hasChildren ? 'category-chevron expanded' : 'category-chevron'} aria-hidden="true" />
                  </button>
                );
              })}
              {children.length > 0 && categoryId !== '' && subcategoryPanelTop !== null && (
                <div className="subcategory-panel" style={{ top: subcategoryPanelTop }}>
                  <div className="subcategory-panel-title">二级分类 <span>可选</span></div>
                  <div className="subcategory-grid">
                    {children.map((item) => (
                      <button key={item.id} type="button" className={subcategoryId === item.id ? 'subcategory-chip selected' : 'subcategory-chip'} onClick={() => setSubcategoryId(subcategoryId === item.id ? '' : item.id)}><CategoryIcon categoryName={item.name} type={item.type} size="sm" /><span>{item.name}</span></button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="quick-entry-footer-fields"><label>交易时间<input type="datetime-local" step="1" value={occurredAtLocal} onChange={(event) => setOccurredAtLocal(event.target.value)} /></label><label>添加备注（可选）<input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录一下这笔账…" /></label></div>
      </div>
      {commonMenu && (
        <div className="common-entry-menu" style={{ left: commonMenu.x, top: commonMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => void toggleCommonPin(commonMenu.entry)}>{commonMenu.entry.isPinned ? '取消置顶' : '置顶'}</button>
        </div>
      )}

    </section>
  );
}
