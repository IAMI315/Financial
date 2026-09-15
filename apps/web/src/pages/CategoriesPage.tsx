import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { api } from '../api';
import type { Category, DefaultCategoryConfigItem, TransactionType } from '../types';

type PersonalDrag = { id: number; scope: string };
type DefaultDrag = { id: string; scope: string };

function moveToIndex<T>(items: T[], sourceIndex: number, targetIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  if (moved === undefined) return items;
  next.splice(targetIndex, 0, moved);
  return next;
}

function DragHandle({ label, onStart, onEnd }: { label: string; onStart: (event: DragEvent<HTMLSpanElement>) => void; onEnd: () => void }) {
  return <span className="drag-handle" draggable title="拖动排序" aria-label={label} onDragStart={onStart} onDragEnd={onEnd}><span className="drag-grip" /></span>;
}

function newDefaultId(): string {
  return `custom:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

export function CategoriesPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const [view, setView] = useState<'personal' | 'defaults'>('personal');
  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<TransactionType>('expense');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | ''>('');
  const [personalDrag, setPersonalDrag] = useState<PersonalDrag | null>(null);
  const [defaults, setDefaults] = useState<DefaultCategoryConfigItem[]>([]);
  const [defaultType, setDefaultType] = useState<TransactionType>('expense');
  const [defaultName, setDefaultName] = useState('');
  const [defaultParentId, setDefaultParentId] = useState('');
  const [defaultDrag, setDefaultDrag] = useState<DefaultDrag | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    setCategories((await api<{ categories: Category[] }>('/api/categories')).categories);
  }

  async function loadDefaults() {
    if (!isAdmin) return;
    setDefaults((await api<{ categories: DefaultCategoryConfigItem[] }>('/api/admin/default-categories')).categories);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (view === 'defaults') void loadDefaults(); }, [view]);

  const roots = useMemo(() => categories.filter((item) => item.parentId === null && item.type === type), [categories, type]);
  const defaultRoots = useMemo(() => defaults.filter((item) => item.type === defaultType), [defaults, defaultType]);

  async function create() {
    if (!name.trim()) return;
    try {
      await api('/api/categories', { method: 'POST', body: { type, name: name.trim(), parentId: parentId || null } });
      setName('');
      setParentId('');
      setMessage('分类已创建');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建失败');
    }
  }

  async function rename(category: Category) {
    const next = window.prompt('新的分类名称', category.name)?.trim();
    if (!next || next === category.name) return;
    await api(`/api/categories/${category.id}`, { method: 'PATCH', body: { name: next } });
    await load();
  }

  async function toggleArchive(category: Category) {
    await api(`/api/categories/${category.id}`, { method: 'PATCH', body: { isArchived: !category.isArchived } });
    await load();
  }

  async function remove(category: Category) {
    if (!window.confirm(`删除未使用分类“${category.name}”？若已有历史交易，系统会拒绝并要求归档。`)) return;
    try {
      await api(`/api/categories/${category.id}`, { method: 'DELETE' });
      setMessage('分类已删除');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
    }
  }

  function personalScope(category: Category): string {
    return category.parentId == null ? `${category.type}:root` : `${category.type}:parent:${category.parentId}`;
  }

  function startPersonalDrag(event: DragEvent<HTMLSpanElement>, category: Category) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(category.id));
    setPersonalDrag({ id: category.id, scope: personalScope(category) });
  }

  async function dropPersonal(target: Category) {
    if (!personalDrag || personalDrag.id === target.id || personalDrag.scope !== personalScope(target)) return;
    const siblings = categories.filter((item) => item.type === target.type && item.parentId === target.parentId);
    const sourceIndex = siblings.findIndex((item) => item.id === personalDrag.id);
    const targetIndex = siblings.findIndex((item) => item.id === target.id);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const ordered = moveToIndex(siblings, sourceIndex, targetIndex);
    const response = await api<{ categories: Category[] }>('/api/categories/reorder', { method: 'PUT', body: { ids: ordered.map((item) => item.id) } });
    setCategories(response.categories);
    setMessage('分类顺序已保存');
    setPersonalDrag(null);
  }

  async function saveDefaults(next: DefaultCategoryConfigItem[], successMessage: string) {
    try {
      const response = await api<{ categories: DefaultCategoryConfigItem[] }>('/api/admin/default-categories', { method: 'PUT', body: { categories: next } });
      setDefaults(response.categories);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '默认分类保存失败');
    }
  }

  async function createDefault() {
    const trimmed = defaultName.trim();
    if (!trimmed) return;
    let next = defaults.map((root) => ({ ...root, children: root.children.map((child) => ({ ...child })) }));
    if (defaultParentId) {
      next = next.map((root) => root.id === defaultParentId ? { ...root, children: [...root.children, { id: newDefaultId(), name: trimmed }] } : root);
    } else {
      next.push({ id: newDefaultId(), type: defaultType, name: trimmed, children: [] });
    }
    await saveDefaults(next, '默认分类已添加');
    setDefaultName('');
    setDefaultParentId('');
  }

  async function renameDefault(rootId: string, childId?: string) {
    const root = defaults.find((item) => item.id === rootId);
    const current = childId ? root?.children.find((item) => item.id === childId)?.name : root?.name;
    if (!root || !current) return;
    const renamed = window.prompt('新的默认分类名称', current)?.trim();
    if (!renamed || renamed === current) return;
    const next = defaults.map((item) => {
      if (item.id !== rootId) return item;
      if (!childId) return { ...item, name: renamed };
      return { ...item, children: item.children.map((child) => child.id === childId ? { ...child, name: renamed } : child) };
    });
    await saveDefaults(next, '默认分类已重命名');
  }

  async function removeDefault(rootId: string, childId?: string) {
    const root = defaults.find((item) => item.id === rootId);
    const targetName = childId ? root?.children.find((item) => item.id === childId)?.name : root?.name;
    if (!root || !targetName || !window.confirm(`删除默认分类“${targetName}”？这不会删除已有用户自己的分类。`)) return;
    const next = childId
      ? defaults.map((item) => item.id === rootId ? { ...item, children: item.children.filter((child) => child.id !== childId) } : item)
      : defaults.filter((item) => item.id !== rootId);
    await saveDefaults(next, '默认分类已删除');
  }

  function defaultScope(root: DefaultCategoryConfigItem, childId?: string): string {
    return childId ? `parent:${root.id}` : `${root.type}:root`;
  }

  function startDefaultDrag(event: DragEvent<HTMLSpanElement>, root: DefaultCategoryConfigItem, id: string, childId?: string) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDefaultDrag({ id, scope: defaultScope(root, childId) });
  }

  async function dropDefaultRoot(target: DefaultCategoryConfigItem) {
    if (!defaultDrag || defaultDrag.id === target.id || defaultDrag.scope !== defaultScope(target)) return;
    const positions = defaults.map((item, index) => item.type === target.type ? index : -1).filter((index) => index >= 0);
    const siblings = positions.map((index) => defaults[index]!);
    const sourceIndex = siblings.findIndex((item) => item.id === defaultDrag.id);
    const targetIndex = siblings.findIndex((item) => item.id === target.id);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const ordered = moveToIndex(siblings, sourceIndex, targetIndex);
    const next = [...defaults];
    positions.forEach((position, index) => { next[position] = ordered[index]!; });
    setDefaultDrag(null);
    await saveDefaults(next, '默认一级分类顺序已保存');
  }

  async function dropDefaultChild(root: DefaultCategoryConfigItem, targetId: string) {
    if (!defaultDrag || defaultDrag.id === targetId || defaultDrag.scope !== defaultScope(root, targetId)) return;
    const sourceIndex = root.children.findIndex((child) => child.id === defaultDrag.id);
    const targetIndex = root.children.findIndex((child) => child.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const children = moveToIndex(root.children, sourceIndex, targetIndex);
    const next = defaults.map((item) => item.id === root.id ? { ...item, children } : item);
    setDefaultDrag(null);
    await saveDefaults(next, '默认二级分类顺序已保存');
  }

  const personalManager = <>
    <section className="panel">
      <div className="panel-title"><div><span className="eyebrow">分类</span><h2>新建分类</h2></div></div>
      <div className="inline-form">
        <select value={type} onChange={(event) => { setType(event.target.value as TransactionType); setParentId(''); }}><option value="expense">支出</option><option value="income">收入</option></select>
        <select value={parentId} onChange={(event) => setParentId(event.target.value ? Number(event.target.value) : '')}><option value="">一级分类</option>{roots.filter((item) => !item.isArchived).map((item) => <option value={item.id} key={item.id}>作为“{item.name}”的二级分类</option>)}</select>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="分类名称" maxLength={40} />
        <button className="primary" onClick={() => void create()}>添加</button>
      </div>
    </section>
    <div className="two-column">{(['expense', 'income'] as const).map((groupType) => <section className="panel" key={groupType}>
      <div className="panel-title"><div><span className="eyebrow">{groupType === 'expense' ? '支出' : '收入'}</span><h2>{groupType === 'expense' ? '支出分类' : '收入分类'}</h2></div></div>
      {categories.filter((item) => item.type === groupType && item.parentId === null).map((root) => <div className={`category-tree ${root.isArchived ? 'archived' : ''}`} key={root.id}>
        <div className="category-line" onDragOver={(event) => { if (personalDrag?.scope === personalScope(root)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); void dropPersonal(root); }}>
          <div className="category-name-with-drag"><DragHandle label={`拖动${root.name}排序`} onStart={(event) => startPersonalDrag(event, root)} onEnd={() => setPersonalDrag(null)} /><strong>{root.name}</strong></div>
          <div className="row-actions"><button className="text-button" onClick={() => void rename(root)}>重命名</button><button className="text-button" onClick={() => void toggleArchive(root)}>{root.isArchived ? '启用' : '归档'}</button><button className="text-button danger" onClick={() => void remove(root)}>删除</button></div>
        </div>
        {categories.filter((item) => item.parentId === root.id).map((child) => <div className={`category-line child ${child.isArchived ? 'archived' : ''}`} key={child.id} onDragOver={(event) => { if (personalDrag?.scope === personalScope(child)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); void dropPersonal(child); }}>
          <div className="category-name-with-drag"><DragHandle label={`拖动${child.name}排序`} onStart={(event) => startPersonalDrag(event, child)} onEnd={() => setPersonalDrag(null)} /><span>{child.name}</span></div>
          <div className="row-actions"><button className="text-button" onClick={() => void rename(child)}>重命名</button><button className="text-button" onClick={() => void toggleArchive(child)}>{child.isArchived ? '启用' : '归档'}</button><button className="text-button danger" onClick={() => void remove(child)}>删除</button></div>
        </div>)}
      </div>)}
    </section>)}</div>
  </>;

  const defaultManager = <>
    <section className="panel">
      <div className="panel-title"><div><span className="eyebrow">管理员</span><h2>默认分类管理</h2></div></div>
      <p className="muted">这里维护新账号创建时使用的默认分类模板。调整默认分类不会覆盖已有用户已经自行修改的分类。</p>
      <div className="inline-form">
        <select value={defaultType} onChange={(event) => { setDefaultType(event.target.value as TransactionType); setDefaultParentId(''); }}><option value="expense">支出</option><option value="income">收入</option></select>
        <select value={defaultParentId} onChange={(event) => setDefaultParentId(event.target.value)}><option value="">一级默认分类</option>{defaultRoots.map((item) => <option value={item.id} key={item.id}>作为“{item.name}”的二级默认分类</option>)}</select>
        <input value={defaultName} onChange={(event) => setDefaultName(event.target.value)} placeholder="默认分类名称" maxLength={40} />
        <button className="primary" onClick={() => void createDefault()}>添加</button>
      </div>
    </section>
    <div className="two-column">{(['expense', 'income'] as const).map((groupType) => <section className="panel" key={groupType}>
      <div className="panel-title"><div><span className="eyebrow">默认 · {groupType === 'expense' ? '支出' : '收入'}</span><h2>{groupType === 'expense' ? '默认支出分类' : '默认收入分类'}</h2></div></div>
      {defaults.filter((item) => item.type === groupType).map((root) => <div className="category-tree" key={root.id}>
        <div className="category-line" onDragOver={(event) => { if (defaultDrag?.scope === defaultScope(root)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); void dropDefaultRoot(root); }}>
          <div className="category-name-with-drag"><DragHandle label={`拖动默认分类${root.name}排序`} onStart={(event) => startDefaultDrag(event, root, root.id)} onEnd={() => setDefaultDrag(null)} /><strong>{root.name}</strong></div>
          <div className="row-actions"><button className="text-button" onClick={() => void renameDefault(root.id)}>重命名</button><button className="text-button danger" onClick={() => void removeDefault(root.id)}>删除</button></div>
        </div>
        {root.children.map((child) => <div className="category-line child" key={child.id} onDragOver={(event) => { if (defaultDrag?.scope === defaultScope(root, child.id)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); void dropDefaultChild(root, child.id); }}>
          <div className="category-name-with-drag"><DragHandle label={`拖动默认分类${child.name}排序`} onStart={(event) => startDefaultDrag(event, root, child.id, child.id)} onEnd={() => setDefaultDrag(null)} /><span>{child.name}</span></div>
          <div className="row-actions"><button className="text-button" onClick={() => void renameDefault(root.id, child.id)}>重命名</button><button className="text-button danger" onClick={() => void removeDefault(root.id, child.id)}>删除</button></div>
        </div>)}
      </div>)}
    </section>)}</div>
  </>;

  return <div className="page-stack">
    {isAdmin && <section className="panel category-manager-switch"><div className="segmented compact"><button type="button" className={view === 'personal' ? 'active' : ''} onClick={() => setView('personal')}>我的分类</button><button type="button" className={view === 'defaults' ? 'active' : ''} onClick={() => setView('defaults')}>默认分类管理</button></div></section>}
    {message && <div className="notice">{message}</div>}
    {view === 'defaults' && isAdmin ? defaultManager : personalManager}
  </div>;
}
