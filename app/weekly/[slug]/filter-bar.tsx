'use client';

import { useState } from 'react';

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
  };

  const catLabels: Record<string, string> = {
    'micro-saas': '微SaaS',
    'design-assets': '设计资产',
    'automation': '自动化',
    'content-monetize': '内容变现',
    'indie-tool': '小而美',
    'digital-product': '虚拟产品',
  };

  return (
    <div className="filter-section">
      <div className="filter-row">
        <span className="flabel">分类</span>
        <span className="vr">|</span>
        <button onClick={() => filterByCat('all')} className={`fbtn${activeCat === 'all' ? ' on' : ''}`}>全部</button>
        {categories.map(cat => (
          <button key={cat} onClick={() => filterByCat(cat)} className={`fbtn${activeCat === cat ? ' on' : ''}`}>
            {catLabels[cat] || cat}
          </button>
        ))}
      </div>
    </div>
  );
}
