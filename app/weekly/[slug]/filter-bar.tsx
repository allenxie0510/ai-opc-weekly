'use client';

import { useState } from 'react';

const CAT_LABELS: Record<string, string> = {
  'micro-saas': '微SaaS',
  'design-assets': '设计资产',
  'automation': '自动化',
  'content-monetize': '内容变现',
  'indie-tool': '小而美',
  'digital-product': '虚拟产品',
};

export function FilterBar({ categories }: { categories: string[] }) {
  const [activeCat, setActiveCat] = useState('all');

  const filterByCat = (cat: string) => {
    setActiveCat(cat);
    const articles = document.querySelectorAll('.article');
    articles.forEach(a => {
      const catEl = a.querySelector('[data-category]');
      const articleCat = catEl?.getAttribute('data-category') || '';
      if (cat === 'all' || articleCat === cat) {
        (a as HTMLElement).classList.remove('hidden');
      } else {
        (a as HTMLElement).classList.add('hidden');
      }
    });
    // Update results hint
    const visible = document.querySelectorAll('.article:not(.hidden)');
    const hint = document.querySelector('.results-hint');
    if (hint) {
      hint.textContent = cat === 'all' ? '' : `显示 ${visible.length} 个项目`;
    }
  };

  // Only show categories that actually exist in the data
  const validCategories = categories.filter(c => CAT_LABELS[c]);

  if (validCategories.length === 0) return null;

  return (
    <div className="filter-section">
      <div className="filter-row">
        <span className="flabel">分类</span>
        <span className="vr">|</span>
        <button onClick={() => filterByCat('all')} className={`fbtn${activeCat === 'all' ? ' on' : ''}`}>全部</button>
        {validCategories.map(cat => (
          <button key={cat} onClick={() => filterByCat(cat)} className={`fbtn${activeCat === cat ? ' on' : ''}`}>
            {CAT_LABELS[cat] || cat}
          </button>
        ))}
      </div>
      <div className="results-hint"></div>
    </div>
  );
}
