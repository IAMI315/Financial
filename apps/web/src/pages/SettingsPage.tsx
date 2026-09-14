import { useState } from 'react';
import { api } from '../api';

export function SettingsPage({ onDeleted, forced = false }: { onDeleted: () => void; forced?: boolean }) {
  const [message, setMessage] = useState(forced ? '管理员已重置你的密码，请先设置新的正式密码。' : '');

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api('/api/me/password', { method: 'POST', body: { currentPassword: String(data.get('currentPassword') ?? '') || undefined, newPassword: data.get('newPassword') } });
      event.currentTarget.reset(); setMessage('密码已更新，其他已登录设备的会话已失效。');
      if (forced) window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : '修改失败'); }
  }

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!window.confirm('这会永久删除当前系统中的账号、分类和全部交易，且无法通过产品功能恢复。确认继续？')) return;
    try {
      await api('/api/me', { method: 'DELETE', body: { password: data.get('deletePassword') } });
      onDeleted();
    } catch (error) { setMessage(error instanceof Error ? error.message : '删除失败'); }
  }

  return <div className="page-stack narrow-page"><section className="panel"><div className="panel-title"><div><span className="eyebrow">安全</span><h2>{forced ? '设置新密码' : '修改密码'}</h2></div></div>{message && <div className="notice">{message}</div>}<form className="stack" onSubmit={changePassword}>{!forced && <label>当前密码<input name="currentPassword" type="password" autoComplete="current-password" required /></label>}<label>新密码<input name="newPassword" type="password" minLength={10} autoComplete="new-password" required /></label><button className="primary">保存新密码</button></form></section>{!forced && <section className="panel danger-zone"><div className="panel-title"><div><span className="eyebrow">危险区域</span><h2>永久删除账号</h2></div></div><p className="muted">当前运行系统中的账号与全部账目会立即永久删除；历史备份中的副本会随正常备份保留周期自然淘汰。</p><form className="stack" onSubmit={deleteAccount}><label>输入当前密码确认<input name="deletePassword" type="password" required /></label><button className="danger-button">永久删除我的账号</button></form></section>}</div>;
}
