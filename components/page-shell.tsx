'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { WeeklyNav } from './weekly-nav';

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
      收藏
      {count > 0 && <span className="fav-badge">{count}</span>}
    </Link>
  );
}

export function Header() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-left">
          <Link href="/" className="brand">AI OPC WEEKLY</Link>
          <span className="nav-sep">|</span>
          <Link href="/x" className="x-link">X</Link>
        </div>
        <div className="nav-links">
          <Link href="/archive">归档</Link>
          <FavLinkWithBadge />
          <span className="nav-sep">|</span>
          <Link href="/x" className="x-link">X</Link>
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
