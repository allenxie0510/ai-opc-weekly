'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/page-shell';

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
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-brand)', letterSpacing: '0.04em' }}>
          我的收藏
        </h1>
        <p className="text-sm text-[var(--color-steel)] mb-8">
          已收藏 {favs.length} 个项目
        </p>
        {favs.length === 0 ? (
          <p className="text-[var(--color-muted)] text-center py-16">
            还没有收藏任何项目。浏览周报时点击书签图标即可收藏。
          </p>
        ) : (
          <div className="space-y-2">
            {favs.map((f, i) => (
              <div key={f.id} className="bg-white rounded-xl p-4 border border-[var(--color-hairline)] text-sm text-[var(--color-slate)]">
                {f.title || `项目 #${f.id}`}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
