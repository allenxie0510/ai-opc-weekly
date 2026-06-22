'use client';

import { useState, useEffect } from 'react';
import type { NewsItem } from '@/lib/types';
import { CATEGORY_MAP } from '@/lib/types';

function BookmarkBtn({ id }: { id: string }) {
  const [faved, setFaved] = useState(false);

  useEffect(() => {
    try {
      const favs = JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]');
      setFaved(favs.some((f: { id: string }) => f.id === id));
    } catch {}
  }, [id]);

  const toggle = () => {
    try {
      const favs = JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]');
      if (faved) {
        const next = favs.filter((f: { id: string }) => f.id !== id);
        localStorage.setItem('ai_trends_favorites', JSON.stringify(next));
      } else {
        favs.push({ id, savedAt: new Date().toISOString() });
        localStorage.setItem('ai_trends_favorites', JSON.stringify(favs));
      }
      setFaved(!faved);
    } catch {}
  };

  return (
    <button onClick={toggle} title="收藏" className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#ff55300d] transition-colors">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={faved ? 'text-[var(--color-coral)]' : 'text-[var(--color-muted)]'}>
        <path d="M3.75 2.75C3.75 1.92157 4.42157 1.25 5.25 1.25H12.75C13.5784 1.25 14.25 1.92157 14.25 2.75V15.5L9 12.25L3.75 15.5V2.75Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
          fill={faved ? 'currentColor' : 'none'}
        />
      </svg>
    </button>
  );
}

export function ArticleCard({ item, index }: { item: NewsItem; index: number }) {
  const [insightOpen, setInsightOpen] = useState(false);
  const cat = CATEGORY_MAP[item.category] || { label: item.category, cssClass: '' };

  return (
    <article data-category={item.category} className="bg-white rounded-2xl p-5 shadow-sm border border-[var(--color-hairline)] transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface)] text-[var(--color-slate)]">
            {cat.label}
          </span>
          <span className="text-xs text-[var(--color-muted)] font-medium">{String(index).padStart(2, '0')}</span>
        </div>
        <BookmarkBtn id={item.id} />
      </div>

      <h3 className="text-base font-semibold text-[var(--color-ink)] mb-1.5">{item.title}</h3>
      <p className="text-sm text-[var(--color-slate)] leading-relaxed mb-3">{item.description}</p>

      <div className="flex flex-wrap gap-3 mb-3 text-xs">
        {item.mrr_range && (
          <div className="flex items-center gap-1">
            <span className="text-[var(--color-muted)]">单人 MRR</span>
            <span className="font-semibold text-[var(--color-ink)]">{item.mrr_range}</span>
          </div>
        )}
        {item.pricing && (
          <div className="flex items-center gap-1">
            <span className="text-[var(--color-muted)]">定价</span>
            <span className="font-semibold text-[var(--color-ink)]">{item.pricing}</span>
          </div>
        )}
        {item.mvp_time && (
          <div className="flex items-center gap-1">
            <span className="text-[var(--color-muted)]">MVP</span>
            <span className="font-semibold text-[var(--color-ink)]">{item.mvp_time}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-1">
        {item.refs?.map((ref, i) => (
          <a key={i} href={ref.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[var(--color-blue)] bg-[var(--color-surface)] px-2 py-0.5 rounded-full hover:underline">
            {ref.label}
          </a>
        ))}
        <button onClick={() => setInsightOpen(!insightOpen)}
          className="text-xs text-[var(--color-steel)] bg-[var(--color-surface)] px-2 py-0.5 rounded-full hover:text-[var(--color-ink)] transition-colors">
          {insightOpen ? '收起 ▴' : '展开洞察 ▾'}
        </button>
      </div>

      {insightOpen && (
        <div className="text-sm text-[var(--color-slate)] leading-relaxed border-t border-[var(--color-hairline)] pt-3 mt-2">
          <strong className="text-[var(--color-ink)]">落地路径：</strong>{item.insight}
        </div>
      )}
    </article>
  );
}
