'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

interface Acct {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  enabled: boolean;
  rss_url?: string;
  created_at: string;
}

const STORAGE_KEY = 'ai_opc_admin_token';

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

function setToken(t: string) {
  localStorage.setItem(STORAGE_KEY, t);
}

export default function XAccountsPage() {
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState(0);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/accounts', {
        headers: { 'x-admin-token': getToken() },
      });
      if (res.status === 401) { setAuthed(false); return; }
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
        setAuthed(true);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = getToken();
    if (t) {
      // 先去验证一下 token
      fetchAccounts();
    } else {
      setLoading(false);
    }
  }, [fetchAccounts]);

  const handleLogin = async () => {
    setToken(pwInput);
    await fetchAccounts();
    if (!authed) setToken(''); // 失败则清除
    setPwInput('');
  };

  const handleAdd = async () => {
    const u = newUsername.trim().replace(/^@/, '');
    if (!u) return;
    setAdding(true);
    try {
      await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': getToken(),
        },
        body: JSON.stringify({ username: u }),
      });
      setNewUsername('');
      await fetchAccounts();
    } catch {} finally { setAdding(false); }
  };

  const handleDelete = async (username: string) => {
    await fetch(`/api/admin/accounts?username=${username}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': getToken() },
    });
    setSwipedId(null);
    await fetchAccounts();
  };

  // 触屏左滑
  const handleTouchStart = (id: string, x: number) => {
    setSwipedId(null);
    setTouchStartX(x);
  };
  const handleTouchEnd = (id: string, x: number) => {
    if (x < touchStartX - 60) setSwipedId(id);
    setTouchStartX(0);
  };

  if (loading) {
    return <><Header /><div className="container" style={{ paddingTop: 48, textAlign: 'center', color: 'var(--color-stone)' }}>加载中...</div></>;
  }

  // 未登录 → 显示登录表单
  if (!authed) {
    return (
      <>
        <Header />
        <div className="container" style={{ paddingTop: 48, paddingBottom: 80 }}>
          <header className="x-pagehead">
            <div>
              <h1 className="x-pagehead-title">X 账号管理</h1>
              <p className="x-pagehead-meta">管理员登录</p>
            </div>
            <Link href="/x" className="x-manage-link">← 返回时间轴</Link>
          </header>
          <div style={{ maxWidth: 400, margin: '40px auto', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-steel)', fontSize: 14, marginBottom: 20 }}>
              输入管理员密码以增删追踪账号
            </p>
            <input
              type="password"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="管理员密码"
              autoFocus
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12,
                border: '1px solid var(--color-hairline)', fontSize: 15,
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleLogin}
              disabled={!pwInput}
              style={{
                width: '100%', marginTop: 12, padding: '12px', borderRadius: 12,
                border: 'none', background: pwInput ? 'var(--color-ink)' : 'var(--color-hairline)',
                color: '#fff', fontSize: 15, fontWeight: 600, cursor: pwInput ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              登录
            </button>
          </div>
        </div>
      </>
    );
  }

  const enabled = accounts.filter(a => a.enabled);

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">X 账号管理</h1>
            <p className="x-pagehead-meta">追踪 {enabled.length} 个账号 · {accounts.length - enabled.length} 个已停用</p>
          </div>
          <Link href="/x" className="x-manage-link">← 返回时间轴</Link>
        </header>

        {/* 添加账号输入框 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          <input
            type="text"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="输入 X 用户名（如 sama）"
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 12,
              border: '1px solid var(--color-hairline)', fontSize: 14,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newUsername.trim()}
            style={{
              padding: '10px 24px', borderRadius: 12, border: 'none',
              background: newUsername.trim() ? 'var(--color-blue)' : 'var(--color-hairline)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: newUsername.trim() ? 'pointer' : 'default',
              whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}
          >
            {adding ? '添加中...' : '+ 添加'}
          </button>
        </div>

        {/* 账号列表 */}
        <section className="x-timeline">
          {accounts.map((a) => {
            const isSwiped = swipedId === a.id;
            const disabled = !a.enabled;

            return (
              <div key={a.id} style={{ position: 'relative', overflow: 'hidden' }}>
                {/* 删除按钮（左滑露出） */}
                <button
                  onClick={() => handleDelete(a.username)}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: 80, background: 'var(--color-coral)', color: '#fff',
                    border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit',
                    opacity: isSwiped ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                    pointerEvents: isSwiped ? 'auto' : 'none',
                  }}
                >
                  删除
                </button>

                {/* 卡片 */}
                <article
                  className="x-card"
                  onTouchStart={e => handleTouchStart(a.id, e.touches[0].clientX)}
                  onTouchEnd={e => handleTouchEnd(a.id, e.changedTouches[0].clientX)}
                  style={{
                    transform: isSwiped ? 'translateX(-80px)' : 'translateX(0)',
                    transition: 'transform 0.25s ease',
                    opacity: disabled ? 0.45 : 1,
                    position: 'relative',
                    zIndex: 1,
                  }}
                  onClick={() => setSwipedId(null)}
                >
                  <div className="x-card-head">
                    <img
                      src={a.avatar_url || `https://unavatar.io/x/${a.username}`}
                      alt=""
                      className="x-card-avatar"
                      width={40} height={40}
                      loading="lazy"
                    />
                  </div>
                  <div className="x-card-body">
                    <div className="x-card-meta">
                      <span className="x-card-name">{a.display_name || a.username}</span>
                      <a
                        href={`https://x.com/${a.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="x-card-handle"
                      >
                        @{a.username}
                      </a>
                      {disabled && <span style={{ fontSize: 12, color: 'var(--color-coral)', fontWeight: 500 }}>已停用</span>}
                    </div>
                    {a.rss_url ? (
                      <span style={{ fontSize: 12, color: 'var(--color-success-text)' }}>✓ RSS 已配置</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--color-stone)' }}>⚠ 未配置 RSS（不会被抓取）</span>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
        </section>

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
