import { useEffect, useState } from 'react';
import { api, download } from '../api';
import type { AdminStatus, BackupInfo, User } from '../types';

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const [userResult, statusResult, backupResult] = await Promise.all([
      api<{ users: User[] }>('/api/admin/users'),
      api<AdminStatus>('/api/admin/status'),
      api<{ backups: BackupInfo[] }>('/api/admin/backups'),
    ]);
    setUsers(userResult.users); setStatus(statusResult); setBackups(backupResult.backups);
  }
  useEffect(() => { void load(); }, []);

  async function toggleUser(user: User) {
    await api(`/api/admin/users/${user.id}/status`, { method: 'PATCH', body: { status: user.status === 'active' ? 'disabled' : 'active' } });
    setMessage(user.status === 'active' ? `${user.username} 已禁用，现有会话已失效。` : `${user.username} 已重新启用。`); await load();
  }

  async function resetPassword(user: User) {
    if (!window.confirm(`为 ${user.username} 重置密码？其所有旧会话会立即失效。`)) return;
    const result = await api<{ temporaryPassword: string; expiresInHours: number }>(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' });
    window.prompt(`临时密码（${result.expiresInHours} 小时内仅可成功使用一次）：`, result.temporaryPassword);
  }

  async function deleteUser(user: User) {
    const confirmUsername = window.prompt(`永久删除 ${user.username} 及其全部账目。请输入用户名确认：`);
    if (confirmUsername !== user.username) return;
    const adminPassword = window.prompt('请输入当前管理员密码进行最终确认：');
    if (!adminPassword) return;
    try { await api(`/api/admin/users/${user.id}`, { method: 'DELETE', body: { confirmUsername, adminPassword } }); setMessage(`${user.username} 已永久删除。`); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '删除失败'); }
  }

  async function createBackup() {
    const result = await api<{ backup: BackupInfo }>('/api/admin/backups', { method: 'POST' });
    setMessage(`备份已创建：${result.backup.name}`); await load();
  }

  async function restoreBackup(file?: File) {
    if (!file) return;
    if (!window.confirm('整库恢复会先自动创建恢复前备份，并在恢复期间进入维护模式。确认继续？')) return;
    try {
      const response = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-confirm-restore': 'RESTORE' },
        body: await file.arrayBuffer(),
        credentials: 'same-origin',
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message || '恢复失败');
      setMessage('整库恢复完成。恢复后的账号、密码与数据均已回到备份时状态。');
      window.setTimeout(() => window.location.reload(), 1000);
    } catch (error) { setMessage(error instanceof Error ? error.message : '恢复失败'); }
  }

  return <div className="page-stack">
    {message && <div className="notice">{message}</div>}
    <section className="summary-grid admin-metrics"><article className="metric"><span>用户</span><strong>{status?.users ?? 0}</strong></article><article className="metric"><span>交易</span><strong>{status?.transactions ?? 0}</strong></article><article className="metric"><span>数据库</span><strong>{status ? `${(status.databaseSize / 1024 / 1024).toFixed(1)} MB` : '—'}</strong></article><article className="metric"><span>备份</span><strong>{status?.backupCount ?? 0}</strong></article></section>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">系统</span><h2>运行状态</h2></div><label className="switch-line"><input type="checkbox" checked={status?.registrationOpen ?? false} onChange={async (event) => { await api('/api/admin/settings/registration', { method: 'PUT', body: { open: event.target.checked } }); await load(); }} />开放注册</label></div><div className="status-grid"><span>版本 <b>{status?.appVersion ?? '—'}</b></span><span>数据库 <b>{status?.database ?? '—'}</b></span><span>最近自动备份 <b>{status?.latestAutomaticBackup ? new Date(status.latestAutomaticBackup).toLocaleString('zh-CN') : '暂无'}</b></span><span>维护模式 <b>{status?.maintenance ? '是' : '否'}</b></span></div></section>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">账号管理</span><h2>用户列表</h2></div></div><p className="muted">查看普通用户流水请使用左侧“用户视图”；这里仅处理账号状态、密码重置和永久删除。</p><div className="admin-users">{users.map((user) => <div className="admin-user" key={user.id}><div><strong>{user.username}{user.role === 'admin' ? ' · 管理员' : ''}</strong><span>{user.email || '未填写邮箱'} · {user.status === 'active' ? '启用' : '禁用'}</span></div>{user.role !== 'admin' && <div className="row-actions"><button className="text-button" onClick={() => void resetPassword(user)}>重置密码</button><button className="text-button" onClick={() => void toggleUser(user)}>{user.status === 'active' ? '禁用' : '启用'}</button><button className="text-button danger" onClick={() => void deleteUser(user)}>永久删除</button></div>}</div>)}</div></section>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">数据保护</span><h2>本机备份与整库恢复</h2></div><div className="row-actions"><button className="secondary" onClick={() => void createBackup()}>立即备份</button><label className="secondary file-button">上传并恢复<input type="file" accept=".flb" onChange={(event) => void restoreBackup(event.target.files?.[0])} /></label></div></div><p className="muted">自动保留 7 个日备份、4 个周备份和 6 个月度备份。网页数据备份只包含业务数据库，不包含 .env 或 Compose 配置。</p><div className="backup-list">{backups.map((backup) => <div className="backup-row" key={backup.name}><div><strong>{backup.name}</strong><span>{new Date(backup.modifiedAt).toLocaleString('zh-CN')} · {(backup.size / 1024 / 1024).toFixed(2)} MB</span></div><button className="text-button" onClick={() => void download(`/api/admin/backups/${encodeURIComponent(backup.name)}`, backup.name)}>下载</button></div>)}{backups.length === 0 && <p className="empty">暂无备份。</p>}</div></section>
  </div>;
}
