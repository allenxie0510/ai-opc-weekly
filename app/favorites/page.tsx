'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

interface Fav {
  id: string;
  savedAt: string;
  title?: string;
}

export default function FavoritesPage() {
  const [favs, setFavs] = useState<Fav[]>([]);

  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]'));
    } catch {}
  }, []);

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <header style={{ marginBottom: 48 }}>
          <h1 style={{ fontFamily: 'var(--font-brand)', fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>我的收藏</h1>
          <p style={{ color: 'var(--color-steel)', fontSize: '0.95rem' }}>
            已收藏 {favs.length} 个项目
          </p>
        </header>

        {favs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-stone)' }}>
            还没有收藏任何项目。浏览周报时点击书签图标即可收藏。
            <br />
            <Link href="/" style={{ color: 'var(--color-blue)', fontSize: '0.9rem', textDecoration: 'underline', marginTop: '24px', display: 'inline-block' }}>返回首页</Link>
          </div>
        ) : (
          <div className="fav-list">
            {favs.map((f) => (
              <div key={f.id} className="fav-item">
                {f.title || `项目 #${f.id}`}
                <span style={{ color: 'var(--color-stone)', fontSize: 12, marginLeft: 12 }}>
                  {f.savedAt ? new Date(f.savedAt).toLocaleDateString('zh-CN') : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem' }}>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
