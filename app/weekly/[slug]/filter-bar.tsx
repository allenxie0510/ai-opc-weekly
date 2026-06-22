'use client';

import { useState } from 'react';

export function FilterBar({ categories }: { categories: string[] }) {
  const [activeCat, setActiveCat] = useState('all');

  const filterByCat = (cat: string) => {
    setActiveCat(cat);
    const articles = document.querySelectorAll('.grid > article');
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
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => filterByCat('all')}
        className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
          activeCat === 'all'
            ? 'bg-[var(--color-ink)] text-white'
            : 'bg-white border border-[var(--color-hairline)] text-[var(--color-steel)] hover:border-[var(--color-muted)]'
        }`}
      >
        全部
      </button>
      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => filterByCat(cat)}
          className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
            activeCat === cat
              ? 'bg-[var(--color-ink)] text-white'
              : 'bg-white border border-[var(--color-hairline)] text-[var(--color-steel)] hover:border-[var(--color-muted)]'
          }`}
        >
          {catLabels[cat] || cat}
        </button>
      ))}
    </div>
  );
}
