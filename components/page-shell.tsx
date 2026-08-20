'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { WeeklyNav } from './weekly-nav';
import { getSession, onAuthChange, signOut } from '@/modules/explore/lib/auth';

function FavLinkWithBadge() {
  const [count, setCount] = useState(0);

  const refresh = () => {
    try {
      const favs = JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]');
      setCount(favs.length);
    } catch {}
  };

  useEffect(() => {
    refresh();
    window.addEventListener('fav-count-change', refresh);
    return () => window.removeEventListener('fav-count-change', refresh);
  }, []);
  return (
    <Link href="/favorites" className={`fav-link${count > 0 ? ' has-items' : ''}`}>
      关注
      {count > 0 && <span className="fav-badge">{count}</span>}
    </Link>
  );
}

/**
 * 全局登录态（2026-08-20 信息架构调整：从探索页工具栏上移全站 header）。
 * 未登录：紧凑「登录」文字链 → /explore?login=1（ExploreApp 自动开登录弹窗）。
 * 已登录：邮箱首字母圆形头像（28px，极紧凑不撑爆单行横滑 header），
 * 点击展开菜单（邮箱全文 / 我的探索 / 退出登录）。
 * 菜单用 position:fixed 定位——header 移动端 overflow-x:auto 会裁剪绝对定位下拉。
 */
function AuthSlot() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSession().then((s) => { setUser(s?.user ?? null); setReady(true); });
    return onAuthChange((s) => setUser(s?.user ?? null));
  }, []);

  // 点击菜单外关闭
  useEffect(() => {
    if (!menuPos) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuPos(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuPos]);

  if (!ready) return null;

  if (!user) {
    return <Link href="/explore?login=1" className="nav-auth-link">登录</Link>;
  }

  const label = user.email || user.phone || '已登录';
  const initial = label.slice(0, 1).toUpperCase();

  return (
    <div className="nav-auth" ref={wrapRef}>
      <button
        className="nav-avatar"
        aria-label={`账户：${label}`}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          if (menuPos) { setMenuPos(null); return; }
          const r = e.currentTarget.getBoundingClientRect();
          setMenuPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
        }}
      >
        {initial}
      </button>
      {menuPos && (
        <div className="nav-auth-menu" style={{ top: menuPos.top, right: menuPos.right }}>
          <div className="nav-auth-email">{label}</div>
          <Link href="/explore" className="nav-auth-item" onClick={() => setMenuPos(null)}>📁 我的探索</Link>
          <button
            className="nav-auth-item nav-auth-signout"
            onClick={async () => { await signOut(); setMenuPos(null); }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-left">
          <Link href="/" className="brand">AI OPC</Link>
          <span className="nav-sep">|</span>
          <Link href="/opportunities" className="x-link">机会</Link>
          <Link href="/explore" className="x-link">方向</Link>
          <Link href="/radar" className="x-link">雷达</Link>
          <Link href="/x" className="x-link">X</Link>
        </div>
        <div className="nav-links">
          <Link href="/archive">归档</Link>
          <FavLinkWithBadge />
          <AuthSlot />
        </div>
      </div>
    </nav>
  );
}

export function PageShell({
  issue,
  issues,
  children,
}: {
  issue: { slug: string; week_number: number; week_start: string; week_end: string };
  issues: { slug: string; week_number: number; week_start: string; week_end: string }[];
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <WeeklyNav currentSlug={issue.slug} issues={issues} />
      <div className="container">{children}</div>
    </>
  );
}
