import { useMemo, useState } from 'react';
import { api, shanghaiNowLocal } from '../api';
import type { Category, DailyMustItem, TransactionType } from '../types';

function DailyMustGlyph({ name }: { name: string }) {
  if (name.includes('早餐')) {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 11h15v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7z"/><path d="M22 13h2a4 4 0 0 1 0 8h-2M11 5c-2 2 2 3 0 5M16 5c-2 2 2 3 0 5"/></svg>;
  }
  if (name.includes('中餐') || name.includes('午餐')) {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 5v8M5 5v6a3 3 0 0 0 6 0V5M8 13v14M20 5v22M20 5c5 2 6 8 0 11"/></svg>;
  }
  if (name.includes('晚餐')) {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 17h22a10 10 0 0 1-20 0zM10 13c3-4 9-4 12 0M16 7v3"/></svg>;
  }
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 9h20v16H6zM10 9V6h12v3M10 15h12M10 20h8"/></svg>;
}

function displayDate() {
  const date = shanghaiNowLocal().slice(0, 10);
  const value = new Date(`${date}T00:00:00+08:00`);
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'Asia/Shanghai' }).format(value);
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日 · ${weekday}`;
}

type Editor = {
  id?: number;
  name: string;
  type: TransactionType;
  categoryId: number | '';
  subcategoryId: number | '';
  amountMode: 'fixed' | 'latest';
  fixedAmount: string;
  sortOrder: number;
};

const blankEditor: Editor = { name: '', type: 'expense', categoryId: '', subcategoryId: '', amountMode: 'latest', fixedAmount: '', sortOrder: 0 };

export function DailyMustEntry({
  items,
  categories,
  onSelect,
  onRefresh,
}: {
  items: DailyMustItem[];
  categories: Category[];
  onSelect: (item: DailyMustItem) => void;
  onRefresh: () => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const completed = items.filter((item) => item.isCompleted).length;
  const progress = items.length === 0 ? 0 : Math.round(completed / items.length * 100);
  const roots = useMemo(() => categories.filter((item) => item.parentId === null && item.type === (editor?.type ?? 'expense') && !item.isArchived), [categories, editor?.type]);
  const children = useMemo(() => categories.filter((item) => item.parentId === editor?.categoryId && !item.isArchived), [categories, editor?.categoryId]);

  function startEdit(item?: DailyMustItem) {
    setError('');
    if (!item) {
      setEditor({ ...blankEditor, sortOrder: items.length });
      return;
    }
    setEditor({
      id: item.id,
      name: item.name,
      type: item.type,
      categoryId: item.categoryId,
      subcategoryId: item.subcategoryId ?? '',
      amountMode: item.amountMode,
      fixedAmount: item.fixedAmount ?? '',
      sortOrder: item.sortOrder,
    });
  }

  async function saveEditor() {
    if (!editor || !editor.name.trim() || !editor.categoryId) return setError('请填写名称并选择一级分类');
    if (editor.amountMode === 'fixed' && !editor.fixedAmount.trim()) return setError('请输入固定金额');
    setSaving(true);
    setError('');
    try {
      await api(editor.id ? `/api/daily-must/${editor.id}` : '/api/daily-must', {
        method: editor.id ? 'PUT' : 'POST',
        body: {
          name: editor.name.trim(),
          type: editor.type,
          categoryId: editor.categoryId,
          subcategoryId: editor.subcategoryId || null,
          amountMode: editor.amountMode,
          fixedAmount: editor.amountMode === 'fixed' ? editor.fixedAmount : null,
          sortOrder: editor.sortOrder,
          isEnabled: true,
        },
      });
      setEditor(null);
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function removeEditor() {
    if (!editor?.id) return;
    setSaving(true);
    try {
      await api(`/api/daily-must/${editor.id}`, { method: 'DELETE' });
      setEditor(null);
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="daily-must-headline">
      <div className="daily-must-header">
        <div className="daily-must-heading">
          <span className="daily-must-calendar"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="8" width="20" height="18" rx="4"/><path d="M10 5v6M22 5v6M6 13h20M11 18h4M18 18h3M11 22h3"/></svg></span>
          <div><h3>今日必记</h3><span>{displayDate()}</span></div>
        </div>
        <div className="daily-must-header-actions"><div className="daily-must-progress-meta"><strong>{completed} / {items.length}</strong><span>已完成</span></div><button className="daily-must-add-button" type="button" onClick={() => startEdit()}>＋</button></div>
      </div>
      <div className="daily-must-progress"><i style={{ width: `${progress}%` }} /></div>
      <div className="daily-must-cards">
        {items.map((item) => (
          <article
            className={`daily-must-card${item.isCompleted ? ' completed' : ''}`}
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(item); }}
          >
            <span className={`daily-must-check${item.isCompleted ? ' checked' : ''}`}>{item.isCompleted ? '✓' : ''}</span>
            <span className="daily-must-glyph"><DailyMustGlyph name={item.name} /></span>
            <div className="daily-must-copy"><strong>{item.name}</strong><span>{item.categoryName}{item.subcategoryName ? ` · ${item.subcategoryName}` : ''}</span><b>{item.isCompleted ? item.completedAmount : (item.suggestedAmountFen > 0 ? item.suggestedAmount : '待填写')}</b></div>
            <button className="daily-must-edit" type="button" aria-label={`编辑${item.name}`} onClick={(event) => { event.stopPropagation(); startEdit(item); }}>···</button>
          </article>
        ))}
      </div>

      {editor && (
        <div className="modal-backdrop" onMouseDown={() => !saving && setEditor(null)}>
          <div className="modal daily-must-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-title"><div><span className="eyebrow">今日必记</span><h2>{editor.id ? '编辑项目' : '新增项目'}</h2></div><button type="button" className="secondary" onClick={() => setEditor(null)}>关闭</button></div>
            <div className="daily-must-form">
              <label>名称<input value={editor.name} maxLength={24} placeholder="例如：早餐" onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
              <label>类型<select value={editor.type} onChange={(event) => setEditor({ ...editor, type: event.target.value as TransactionType, categoryId: '', subcategoryId: '' })}><option value="expense">支出</option><option value="income">收入</option></select></label>
              <label>一级分类<select value={editor.categoryId} onChange={(event) => setEditor({ ...editor, categoryId: Number(event.target.value) || '', subcategoryId: '' })}><option value="">请选择</option>{roots.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>二级分类<select value={editor.subcategoryId} onChange={(event) => setEditor({ ...editor, subcategoryId: Number(event.target.value) || '' })}><option value="">不指定</option>{children.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>默认金额<select value={editor.amountMode} onChange={(event) => setEditor({ ...editor, amountMode: event.target.value as 'fixed' | 'latest' })}><option value="fixed">固定金额</option><option value="latest">最近一次金额</option></select></label>
              {editor.amountMode === 'fixed' && <label>固定金额<input inputMode="decimal" value={editor.fixedAmount} placeholder="0.00" onChange={(event) => setEditor({ ...editor, fixedAmount: event.target.value })} /></label>}
            </div>
            {error && <div className="notice error">{error}</div>}
            <div className="modal-actions">
              {editor.id && <button type="button" className="danger" disabled={saving} onClick={() => void removeEditor()}>删除</button>}
              <span />
              <button type="button" className="secondary" disabled={saving} onClick={() => setEditor(null)}>取消</button>
              <button type="button" className="primary" disabled={saving} onClick={() => void saveEditor()}>{saving ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
