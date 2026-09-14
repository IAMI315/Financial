import { useEffect, useState } from 'react';
import { api } from './api';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import type { User } from './types';

type Page = 'home' | 'transactions' | 'stats' | 'categories' | 'import' | 'settings' | 'admin';

const navigation: Array<{ page: Page; label: string; icon: string }> = [
  { page: 'home', label: '首页', icon: '⌂' },
  { page: 'transactions', label: '流水', icon: '≡' },
  { page: 'stats', label: '统计', icon: '⌁' },
  { page: 'categories', label: '分类', icon: '◇' },
  { page: 'import', label: '导入', icon: '⇩' },
  { page: 'settings', label: '设置', icon: '⚙' },
];

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [page, setPage] = useState<Page>('home');

  useEffect(() => {
    void api<{ user: User }>('/api/me').then((result) => setUser(result.user)).catch(() => setUser(null));
  }, []);

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } finally { setUser(null); setPage('home'); }
  }

  if (user === undefined) return <main className="loading-screen"><div className="brand-mark">账</div><p>正在连接账本…</p></main>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;
  if (user.mustChangePassword) return <main className="forced-password"><SettingsPage forced onDeleted={() => setUser(null)} /></main>;

  const pages: Record<Page, React.ReactNode> = {
    home: <HomePage />,
    transactions: <TransactionsPage />,
    stats: <StatsPage />,
    categories: <CategoriesPage />,
    import: <ImportPage />,
    settings: <SettingsPage onDeleted={() => setUser(null)} />,
    admin: <AdminPage />,
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark small">账</div><div><strong>轻账本</strong><span>Financial Ledger</span></div></div>
      <nav>{navigation.map((item) => <button key={item.page} className={page === item.page ? 'nav-item active' : 'nav-item'} onClick={() => setPage(item.page)}><span>{item.icon}</span>{item.label}</button>)}{user.role === 'admin' && <button className={page === 'admin' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('admin')}><span>⌘</span>管理后台</button>}</nav>
      <div className="sidebar-user"><div><strong>{user.username}</strong><span>{user.role === 'admin' ? '管理员' : user.email || '普通用户'}</span></div><button className="text-button" onClick={() => void logout()}>退出</button></div>
    </aside>
    <main className="content"><header className="mobile-header"><div className="brand"><div className="brand-mark small">账</div><strong>轻账本</strong></div><button className="text-button" onClick={() => void logout()}>退出</button></header><div className="content-inner">{pages[page]}</div></main>
    <nav className="bottom-nav">{navigation.slice(0, 5).map((item) => <button key={item.page} className={page === item.page ? 'active' : ''} onClick={() => setPage(item.page)}><span>{item.icon}</span><small>{item.label}</small></button>)}<button className={page === (user.role === 'admin' ? 'admin' : 'settings') ? 'active' : ''} onClick={() => setPage(user.role === 'admin' ? 'admin' : 'settings')}><span>{user.role === 'admin' ? '⌘' : '⚙'}</span><small>{user.role === 'admin' ? '管理' : '设置'}</small></button></nav>
  </div>;
}
