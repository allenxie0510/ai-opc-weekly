'use client';

import { useState, useEffect } from 'react';
import type { NewsItem } from '@/lib/types';

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

/**
 * 为收藏生成稳定 key：基于标题+分类的哈希。
 * 即使 Supabase 行被重建（UUID 变了），同一内容仍能匹配到旧收藏。
 */
function stableKey(item: NewsItem): string {
  // 简单确定性哈希，无需依赖 crypto
  let hash = 0;
  const str = `${item.title}|${item.category}`;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0; // → 32bit int
  }
  return `sk_${Math.abs(hash).toString(36)}`;
}

function showToast(msg: string) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2000);
}

function BookmarkBtn({ item }: { item: NewsItem }) {
  const [faved, setFaved] = useState(false);
  const sk = stableKey(item);

  useEffect(() => {
    try {
      const favs = JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]');
      // 兼容旧格式（id 匹配）和新格式（stableKey 匹配）
      setFaved(favs.some((f: { id?: string; _sk?: string }) =>
        f._sk === sk || (!f._sk && f.id === item.id)
      ));
    } catch {}
  }, [item.id, sk]);

  const toggle = () => {
    try {
      const favs: Record<string, unknown>[] = JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]');
      if (faved) {
        const next = favs.filter((f) => (f._sk as string) !== sk && f.id !== item.id);
        localStorage.setItem('ai_trends_favorites', JSON.stringify(next));
        showToast('已取消收藏');
      } else {
        const entry = { ...item, _sk: sk, savedAt: new Date().toISOString() };
        favs.push(entry);
        localStorage.setItem('ai_trends_favorites', JSON.stringify(favs));
        showToast('已收藏，在收藏页可查看深度拆解');
      }
      setFaved(!faved);
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      title="收藏"
      className={`bookmark-btn${faved ? ' faved' : ''}`}
      data-id={item.id}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
  const catLabel = CAT_LABELS[item.category] || item.category.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <article data-category={item.category} className="article">
      <div className="art-header">
        <span className={`art-cat-pill ${CAT_CSS[item.category] || ''}`}>{catLabel}</span>
        <span className="art-idx">{String(index).padStart(2, '0')}</span>
        <BookmarkBtn item={item} />
      </div>

      <h3>{item.title}</h3>
      <p className="desc">{item.description}</p>

      <div className="art-meta">
        {item.mrr_range && (
          <div className="mi"><span className="ml">单人 MRR</span><span className="mv">{item.mrr_range}</span></div>
        )}
        {item.pricing && (
          <div className="mi"><span className="ml">定价</span><span className="mv">{item.pricing}</span></div>
        )}
        {item.mvp_time && (
          <div className="mi"><span className="ml">MVP</span><span className="mv">{item.mvp_time}</span></div>
        )}
      </div>

      <div className="art-pills">
        {item.refs?.map((ref, i) => (
          <a key={i} href={ref.url} target="_blank" rel="noopener noreferrer" className="pill link">
            {ref.label}
          </a>
        ))}
        <button onClick={() => setInsightOpen(!insightOpen)} className="pill insight-tgl">
          {insightOpen ? '收起 ▴' : '展开洞察 ▾'}
        </button>
      </div>

      <div className={`insight-panel${insightOpen ? ' open' : ''}`}>
        <strong>落地路径：</strong>{item.insight}
      </div>
    </article>
  );
}
