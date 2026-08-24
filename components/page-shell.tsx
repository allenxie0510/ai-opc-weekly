'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { WeeklyNav } from './weekly-nav';
import { getSession, onAuthChange, signOut } from '@/modules/explore/lib/auth';
import { isProductRadarEnabled } from '@/lib/product-radar/config';

/** 关注数量徽章：读 localStorage，供 AuthSlot 菜单内「⭐ 关注」项使用 */
function FavBadge() {
  const [count, setCount] = useState(0);

  const refresh = () => {
    try {
      const favs = JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]');
      setCount(favs.length);
    } catch {}
  };

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener('fav-count-change', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('fav-count-change', refresh);
    };
  }, []);
  return count > 0 ? <span className="fav-badge">{count}</span> : null;
}

/**
 * 全局登录态（2026-08-20 信息架构调整：从探索页工具栏上移全站 header；
 * 2026-08-21 再调整：归档/关注从 header 一级导航收进本菜单，header 只剩内容主导航 + 登录/头像）。
 * 未登录：紧凑「登录」文字链 → /explore?login=1（ExploreApp 自动开登录弹窗）。
 * 已登录：邮箱首字母圆形头像（28px，极紧凑不撑爆单行横滑 header），点击展开菜单：
 *   邮箱全文 / [内容入口] 我的探索 · 归档 · 关注(带计数徽章) / [账号操作] 退出登录。
 * 菜单用 position:fixed 定位——header 移动端 overflow-x:auto 会裁剪绝对定位下拉。
 * 图标统一放固定宽度 .nav-auth-ico 槽位保证文字列对齐；/archive、/favorites 路由
 * 本身公开可直访（favorites 基于 localStorage，匿名有空态提示）。
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
          <Link href="/explore" className="nav-auth-item" onClick={() => setMenuPos(null)}>
            <span className="nav-auth-ico" aria-hidden="true">📁</span>我的探索
          </Link>
          <Link href="/archive" className="nav-auth-item" onClick={() => setMenuPos(null)}>
            <span className="nav-auth-ico" aria-hidden="true">📥</span>归档
          </Link>
          <Link href="/favorites" className="nav-auth-item" onClick={() => setMenuPos(null)}>
            <span className="nav-auth-ico" aria-hidden="true">⭐</span>关注
            <FavBadge />
          </Link>
          <div className="nav-auth-divider" role="separator" />
          <button
            className="nav-auth-item nav-auth-signout"
            onClick={async () => { await signOut(); setMenuPos(null); }}
          >
            <span className="nav-auth-ico" aria-hidden="true" />退出登录
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const productRadarEnabled = isProductRadarEnabled();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-left">
          <Link href="/" className="brand">AI OPC</Link>
          <span className="nav-sep">|</span>
          <Link href="/opportunities" className="x-link">机会</Link>
          <Link href="/explore" className="x-link">方向</Link>
          <Link href="/radar" className="x-link">雷达</Link>
          {productRadarEnabled && <Link href="/tools" className="x-link">工具</Link>}
          <Link href="/x" className="x-link">X</Link>
        </div>
        <div className="nav-links">
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
