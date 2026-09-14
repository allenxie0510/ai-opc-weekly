'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

interface FavItem {
  id: string;
  title: string;
  category: string;
  description: string;
  insight: string;
  pricing?: string;
  mrr_range?: string;
  mvp_time?: string;
  savedAt?: string;
  created_at?: string;
}

const CAT_CSS: Record<string, string> = {
  'micro-saas': 'cat-microsaas',
  'design-assets': 'cat-design',
  'automation': 'cat-automation',
  'content-monetize': 'cat-content',
  'indie-tool': 'cat-tool',
  'digital-product': 'cat-digital',
};

const CAT_LABELS: Record<string, string> = {
  'micro-saas': '微SaaS',
  'design-assets': '设计资产',
  'automation': '自动化',
  'content-monetize': '内容变现',
  'indie-tool': '小而美',
  'digital-product': '虚拟产品',
};

export default function FavoritesPage() {
  const [favs, setFavs] = useState<FavItem[]>([]);

  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]'));
    } catch {}
  }, []);

  const fmtDate = (d?: string) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <>
      <Header />
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - var(--header-height, 56px))',
      }}>
        <div className="container page-wrap" style={{ flex: 1 }}>
          <header style={{ marginBottom: 48 }}>
            <h1 style={{ fontFamily: 'var(--font-brand)', fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>关注清单</h1>
            <p style={{ color: 'var(--color-steel)', fontSize: '0.95rem' }}>
              我的关注清单 · 已关注 <strong>{favs.length}</strong> 个项目
            </p>
          </header>

          {favs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-stone)' }}>
              关注清单还是空的。浏览周报或机会情报时点击书签图标即可加入关注。
              <br />
              <Link href="/" style={{ color: 'var(--color-blue)', fontSize: '0.9rem', textDecoration: 'underline', marginTop: '24px', display: 'inline-block' }}>返回首页</Link>
            </div>
          ) : (
            <div className="fav-list">
              {favs.map((f, idx) => (
                <article key={f.id || idx} className="fav-item">
                  {/* 标签行：分类 + 日期 + 深度拆解 */}
                  <div className="art-header" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`art-cat-pill ${CAT_CSS[f.category] || ''}`}>
                      {CAT_LABELS[f.category] || f.category || '—'}
                    </span>
                    <span className="art-idx" style={{ marginLeft: 0 }}>{fmtDate(f.savedAt || f.created_at)}</span>
                    <Link href={`/reports/${f.id}`} className="pill insight-tgl" style={{marginLeft:'auto'}}>阅读全文 · 创业研究 ↗</Link>
                  </div>

                  <h4 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 6 }}>
                    {f.title}
                  </h4>
                  <p className="desc" style={{ marginBottom: 8 }}>
                    {f.description?.slice(0, 150)}{(f.description?.length || 0) > 150 ? '…' : ''}
                  </p>

                  <div className="art-meta">
                    {f.mrr_range && (
                      <div className="mi"><span className="ml">单人 MRR</span><span className="mv">{f.mrr_range}</span></div>
                    )}
                    {f.pricing && (
                      <div className="mi"><span className="ml">定价</span><span className="mv">{f.pricing}</span></div>
                    )}
                    {f.mvp_time && (
                      <div className="mi"><span className="ml">MVP</span><span className="mv">{f.mvp_time}</span></div>
                    )}
                  </div>

                  {f.insight && (
                    <div className="insight-panel open" style={{ marginTop: 12 }}>
                      <strong>落地路径：</strong>{f.insight}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

        </div>
      </div>

    </>
  );
}
