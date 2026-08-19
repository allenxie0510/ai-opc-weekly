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
  const [newRssUrl, setNewRssUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [refreshFails, setRefreshFails] = useState<string[]>([]);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState(0);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/accounts', {
        headers: { 'x-admin-token': getToken() },
      });
      if (res.status === 401) {
        // 仅首次加载时清除 auth
        setToken('');
        setAuthed(false);
        return;
      }
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
      fetchAccounts();
    } else {
      setLoading(false);
    }
  }, [fetchAccounts]);

  const handleLogin = async () => {
    const pw = pwInput;
    setToken(pw);
    setPwInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/accounts', {
        headers: { 'x-admin-token': pw },
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
        setAuthed(true);
      } else {
        setToken('');
        setAuthed(false);
        alert('密码错误');
      }
    } catch {
      setToken('');
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const u = newUsername.trim().replace(/^@/, '');
    if (!u) return;
    // X 用户名不能有空格
    if (/\s/.test(u)) {
      alert('X 用户名不能包含空格，请使用真实 Twitter handle（如 karpathy，不是 Andrej Karpathy）');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': getToken(),
        },
        body: JSON.stringify({
          username: u,
          rss_url: newRssUrl.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // 直接用返回的 account 更新本地状态，不重新 fetch
        if (data.account) {
          setAccounts(prev => [...prev, data.account]);
        }
        setNewUsername('');
        setNewRssUrl('');
      } else if (res.status === 401) {
        setToken('');
        setAuthed(false);
      } else {
        const err = await res.json().catch(() => ({ error: '添加失败' }));
        alert(err.error || '添加失败');
      }
    } catch {
      alert('网络错误');
    } finally { setAdding(false); }
  };

  const handleDelete = async (username: string) => {
    if (deletingUser) return;
    // 防误触：明确说明级联删除推文 + 不可恢复
    if (!confirm(`确定删除 @${username}？\n\n将同时删除该账号的全部推文，删除后不可恢复。`)) return;
    setDeletingUser(username);
    setDeleteMsg(null);
    try {
      const res = await fetch(`/api/admin/accounts?username=${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': getToken() },
      });
      if (res.ok) {
        // 本地移除，列表即时更新
        setAccounts(prev => prev.filter(a => a.username !== username));
        setDeleteMsg(`✅ 已删除 @${username} 及其全部推文`);
      } else if (res.status === 401) {
        setToken('');
        setAuthed(false);
      } else {
        const err = await res.json().catch(() => ({ error: '删除失败' }));
        setDeleteMsg('❌ ' + (err.error || '删除失败'));
      }
    } catch {
      setDeleteMsg('❌ 网络错误');
    } finally {
      setDeletingUser(null);
      setSwipedId(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    setRefreshFails([]);
    try {
      const res = await fetch('/api/admin/refresh', {
        method: 'POST',
        headers: { 'x-admin-token': getToken() },
      });
      if (res.status === 401) { setToken(''); setAuthed(false); return; }
      const data = await res.json();
      if (data.error) {
        setRefreshMsg('❌ ' + data.error);
      } else {
        const fails: any[] = data.results?.filter((r: any) => r.status !== 200) || [];
        // 透传每账号失败原因（HTTP 码/超时/实例名），后台直接可见根因
        setRefreshFails(fails.map((f) => `@${f.username}：${f.error || `HTTP ${f.status}`}`));
        if (data.fallback === 'dispatched') {
          setRefreshMsg('⚠️ Vercel 直连抓取全灭（实例拦截机房 IP），已自动改为触发 GitHub Actions 抓取——约 2–3 分钟后生效，请稍后刷新 /x 查看');
        } else if (data.fallback) {
          setRefreshMsg(`❌ Vercel 直连全灭且 Actions 兜底失败（${data.fallback}），请检查 GITHUB_PAT 配置`);
        } else {
          setRefreshMsg(`✅ 写入 ${data.total} 条推文` + (fails.length ? `，${fails.length} 个 feed 失败` : ''));
        }
        await fetchAccounts();
      }
    } catch {
      setRefreshMsg('❌ 网络错误');
    } finally { setRefreshing(false); }
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

  if (!authed) {
    return (
      <>
        <Header />
        <div className="container page-wrap">
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

  return (
    <>
      <Header />
      <div className="container page-wrap">
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">X 账号管理</h1>
            <p className="x-pagehead-meta">追踪 {accounts.length} 个账号（上限 15）</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: '6px 16px', borderRadius: 12,
                border: '1px solid var(--color-blue)',
                background: 'none', color: 'var(--color-blue)',
                fontSize: 13, fontWeight: 500, cursor: refreshing ? 'default' : 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'inherit', opacity: refreshing ? 0.5 : 1,
              }}
            >
              {refreshing ? '更新中...' : '🔄 手动更新'}
            </button>
            <Link href="/x" className="x-manage-link">← 返回时间轴</Link>
          </div>
        </header>
        {refreshMsg && (
          <div style={{
            marginBottom: 16, padding: '8px 16px', borderRadius: 10,
            background: refreshMsg.startsWith('✅') ? 'var(--color-success-bg)' : 'var(--color-surface)',
            color: refreshMsg.startsWith('✅') ? 'var(--color-up)' : refreshMsg.startsWith('⚠️') ? 'var(--color-warn)' : 'var(--color-danger)',
            fontSize: 13, fontWeight: 500,
          }}>
            {refreshMsg}
            {refreshFails.length > 0 && (
              <details style={{ marginTop: 6, fontWeight: 400 }}>
                <summary style={{ cursor: 'pointer' }}>查看 {refreshFails.length} 个失败账号的原因</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--color-steel)' }}>
                  {refreshFails.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {deleteMsg && (
          <div style={{
            marginBottom: 16, padding: '8px 16px', borderRadius: 10,
            background: deleteMsg.startsWith('✅') ? 'var(--color-success-bg)' : 'var(--color-surface)',
            color: deleteMsg.startsWith('✅') ? 'var(--color-up)' : 'var(--color-danger)',
            fontSize: 13, fontWeight: 500,
          }}>{deleteMsg}</div>
        )}

        {/* 添加账号 */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="X 用户名（如 sama）"
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
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: newUsername.trim() ? 'pointer' : 'default',
                whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}
            >
              {adding ? '添加中...' : '+ 添加'}
            </button>
          </div>
          <input
            type="text"
            value={newRssUrl}
            onChange={e => setNewRssUrl(e.target.value)}
            placeholder="自定义 RSS Feed URL（可选 · 高级兜底，一般留空）"
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 12,
              border: '1px solid var(--color-hairline)', fontSize: 13,
              outline: 'none', fontFamily: 'inherit', color: 'var(--color-steel)',
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--color-stone)', marginTop: 6 }}>
            只需填用户名即可——系统会自动从公共 Nitter 实例（xcancel.com → nitter.net）抓取该账号推文。下方 RSS URL 仅作可选的高级兜底源，一般留空。
          </p>
        </div>

        {/* 账号列表 */}
        <section className="x-timeline">
          {accounts.map((a) => {
            const isSwiped = swipedId === a.id;

            return (
              <div key={a.id} className="x-acct-row" style={{ position: 'relative', overflow: 'hidden' }}>
                {/* 桌面端删除入口（悬停卡片显示，移动端用左滑手势露出下方红色按钮） */}
                <button
                  className="x-acct-delete"
                  title={`删除 @${a.username}（连同其全部推文）`}
                  aria-label={`删除 @${a.username}`}
                  disabled={deletingUser === a.username}
                  onClick={(e) => { e.stopPropagation(); handleDelete(a.username); }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(a.username)}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: 80, background: 'var(--color-danger)', color: '#fff',
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

                <article
                  className="x-card"
                  onTouchStart={e => handleTouchStart(a.id, e.touches[0].clientX)}
                  onTouchEnd={e => handleTouchEnd(a.id, e.changedTouches[0].clientX)}
                  style={{
                    transform: isSwiped ? 'translateX(-80px)' : 'translateX(0)',
                    transition: 'transform 0.25s ease',
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
                    </div>
                    {a.rss_url ? (
                      <span style={{ fontSize: 12, color: 'var(--color-success-text)' }}>✓ 定时抓取中（含自定义兜底源）</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--color-success-text)' }}>✓ 定时抓取中（公共实例）</span>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
          {accounts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-stone)' }}>
              暂无追踪账号
            </div>
          )}
        </section>

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p>© 2026 AI OPC. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
