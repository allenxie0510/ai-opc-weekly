import type { ReactNode } from 'react';
import Image from 'next/image';

export type EditorialSection = 'opportunities' | 'radar' | 'weekly' | 'explore' | 'voices';
const labels: Record<EditorialSection, string> = {
  opportunities: 'OPPORTUNITY LIBRARY', radar: 'DAILY SIGNALS', weekly: 'WEEKLY RESEARCH',
  explore: 'FIND YOUR DIRECTION', voices: 'FOUNDER VOICES',
};

/** Original category art is decorative, never a claim about an article's subject. */
export function CategoryHero({ section, title, children }: { section: EditorialSection; title: string; children: ReactNode }) {
  return <header className={`category-hero category-hero--${section}`}>
    <div className="category-hero-copy"><p className="category-kicker">AI OPC / {labels[section]}</p><h1>{title}</h1><div className="category-dek">{children}</div></div>
    <div className="category-art"><Image src={`/editorial/${section}.webp`} alt="" fill priority sizes="(max-width: 600px) 45vw, 520px" /></div>
  </header>;
}

export function ResearchFrontispiece() {
  return <figure className="research-frontispiece"><Image src="/editorial/weekly.webp" alt="书页化为阶梯，透镜聚焦研究价值的概念插画" fill priority sizes="(max-width: 768px) 100vw, 1100px" /><figcaption>AI OPC / 创业研究 · 栏目插画</figcaption></figure>;
}
