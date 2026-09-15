import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { MonthlyTransactionTables } from '../components/MonthlyTransactionTables';
import type { Transaction, User } from '../types';

type TransactionList = {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
};

export function AdminUserViewPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [result, setResult] = useState<TransactionList>({ items: [], total: 0, page: 1, pageSize: 100 });
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void api<{ users: User[] }>('/api/admin/users')
      .then((result) => {
        const regularUsers = result.users.filter((user) => user.role !== 'admin');
        setUsers(regularUsers);
        setSelectedUserId((current) => current ?? regularUsers[0]?.id ?? null);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : '用户列表加载失败'));
  }, []);

  async function loadPage(userId: number, page: number, append = false) {
    const currentRequest = append ? requestId.current : ++requestId.current;
    setLoading(true);
    setMessage('');
    try {
      const pageResult = await api<TransactionList>(`/api/admin/users/${userId}/transactions?page=${page}&pageSize=100`);
      if (currentRequest !== requestId.current) return;
      setResult((current) => append
        ? { ...pageResult, items: [...current.items, ...pageResult.items] }
        : pageResult);
    } catch (error) {
      if (currentRequest === requestId.current) setMessage(error instanceof Error ? error.message : '流水加载失败');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedUserId == null) {
      requestId.current += 1;
      setResult({ items: [], total: 0, page: 1, pageSize: 100 });
      return;
    }
    void loadPage(selectedUserId, 1);
  }, [selectedUserId]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  return (
    <div className="page-stack">
      <section className="panel admin-user-view-toolbar">
        <div className="panel-title">
          <div><span className="eyebrow">管理员专属</span><h2>用户视图</h2></div>
          {selectedUser && <span className={`user-status ${selectedUser.status}`}>{selectedUser.status === 'active' ? '启用' : '禁用'}</span>}
        </div>
        <p className="muted">选择普通用户后，以只读方式查看其完整流水。此视图不会切换身份，也不能修改或删除该用户交易。</p>
        <label className="user-view-selector">
          选择用户
          <select value={selectedUserId ?? ''} onChange={(event) => setSelectedUserId(event.target.value ? Number(event.target.value) : null)}>
            {users.length === 0 && <option value="">暂无普通用户</option>}
            {users.map((user) => <option key={user.id} value={user.id}>{user.username}{user.email ? ` · ${user.email}` : ''}</option>)}
          </select>
        </label>
      </section>

      {message && <div className="notice error">{message}</div>}
      <section className="panel">
        <div className="panel-title">
          <div><span className="eyebrow">只读流水</span><h2>{selectedUser ? `${selectedUser.username} 的流水` : '请选择用户'}</h2></div>
          {selectedUser && <span className="muted">共 {result.total} 笔 · 已显示 {result.items.length}</span>}
        </div>
        {loading && result.items.length === 0 ? <p className="empty">正在加载流水…</p> : <MonthlyTransactionTables items={result.items} readOnly />}
        {selectedUserId != null && result.items.length < result.total && <div className="transaction-load-more"><button className="secondary" disabled={loading} onClick={() => void loadPage(selectedUserId, result.page + 1, true)}>{loading ? '加载中…' : '加载更多'}</button></div>}
      </section>
    </div>
  );
}
