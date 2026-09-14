import { useState } from 'react';
import { api } from '../api';
import type { User } from '../types';

export function AuthPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        body:
          mode === 'login'
            ? { login: data.get('login'), password: data.get('password') }
            : {
                username: data.get('username'),
                email: String(data.get('email') ?? '').trim() || null,
                password: data.get('password'),
              },
      });
      onAuthenticated(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">账</div>
        <h1>轻账本</h1>
        <p className="muted">一个只关注日常收支的自托管个人账本。</p>
        <div className="segmented">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">登录</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} type="button">注册</button>
        </div>
        <form className="stack" onSubmit={submit}>
          {mode === 'login' ? (
            <label>用户名或邮箱<input name="login" autoComplete="username" required /></label>
          ) : (
            <>
              <label>用户名<input name="username" pattern="[A-Za-z0-9_]{3,32}" autoComplete="username" required /></label>
              <label>邮箱（可选）<input name="email" type="email" autoComplete="email" /></label>
            </>
          )}
          <label>密码<input name="password" type="password" minLength={10} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
          {error && <div className="notice error">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? '处理中…' : mode === 'login' ? '登录' : '创建账号'}</button>
        </form>
      </section>
    </main>
  );
}
