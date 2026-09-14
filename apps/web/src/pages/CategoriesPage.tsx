import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Category, TransactionType } from '../types';

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<TransactionType>('expense');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | ''>('');
  const [message, setMessage] = useState('');

  async function load() { setCategories((await api<{ categories: Category[] }>('/api/categories')).categories); }
  useEffect(() => { void load(); }, []);
  const roots = useMemo(() => categories.filter((item) => item.parentId === null && item.type === type), [categories, type]);

  async function create() {
    if (!name.trim()) return;
    try {
      await api('/api/categories', { method: 'POST', body: { type, name: name.trim(), parentId: parentId || null } });
      setName(''); setParentId(''); setMessage('分类已创建'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : '创建失败'); }
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
    try { await api(`/api/categories/${category.id}`, { method: 'DELETE' }); setMessage('分类已删除'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '删除失败'); }
  }

  return <div className="page-stack">
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">分类</span><h2>新建分类</h2></div></div><div className="inline-form"><select value={type} onChange={(event) => { setType(event.target.value as TransactionType); setParentId(''); }}><option value="expense">支出</option><option value="income">收入</option></select><select value={parentId} onChange={(event) => setParentId(event.target.value ? Number(event.target.value) : '')}><option value="">一级分类</option>{roots.filter((item) => !item.isArchived).map((item) => <option value={item.id} key={item.id}>作为“{item.name}”的二级分类</option>)}</select><input value={name} onChange={(event) => setName(event.target.value)} placeholder="分类名称" maxLength={40} /><button className="primary" onClick={() => void create()}>添加</button></div>{message && <div className="notice">{message}</div>}</section>
    <div className="two-column">{(['expense', 'income'] as const).map((groupType) => <section className="panel" key={groupType}><div className="panel-title"><div><span className="eyebrow">{groupType === 'expense' ? '支出' : '收入'}</span><h2>{groupType === 'expense' ? '支出分类' : '收入分类'}</h2></div></div>{categories.filter((item) => item.type === groupType && item.parentId === null).map((root) => <div className={`category-tree ${root.isArchived ? 'archived' : ''}`} key={root.id}><div className="category-line"><strong>{root.name}</strong><div className="row-actions"><button className="text-button" onClick={() => void rename(root)}>重命名</button><button className="text-button" onClick={() => void toggleArchive(root)}>{root.isArchived ? '启用' : '归档'}</button><button className="text-button danger" onClick={() => void remove(root)}>删除</button></div></div>{categories.filter((item) => item.parentId === root.id).map((child) => <div className={`category-line child ${child.isArchived ? 'archived' : ''}`} key={child.id}><span>↳ {child.name}</span><div className="row-actions"><button className="text-button" onClick={() => void rename(child)}>重命名</button><button className="text-button" onClick={() => void toggleArchive(child)}>{child.isArchived ? '启用' : '归档'}</button><button className="text-button danger" onClick={() => void remove(child)}>删除</button></div></div>)}</div>)}</section>)}</div>
  </div>;
}
