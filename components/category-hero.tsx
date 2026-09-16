import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';

export type EditorialSection = 'opportunities' | 'radar' | 'weekly' | 'explore' | 'voices';
const labels: Record<EditorialSection, string> = {
  opportunities: 'OPPORTUNITY LIBRARY', radar: 'DAILY SIGNALS', weekly: 'WEEKLY RESEARCH',
  explore: 'FIND YOUR DIRECTION', voices: 'FOUNDER VOICES',
};

// sRGB means sampled from the empty left edge of each original illustration.
// All current backgrounds have better contrast with ink. Future dark artwork can
// opt into inverse text without dimming or masking the illustration.
const backgrounds: Record<EditorialSection, string> = {
  opportunities: '#f7eddc', radar: '#8eb7d1', weekly: '#f6a979',
  explore: '#abba9f', voices: '#bab3e3',
};

/** Original category art is decorative, never a claim about an article's subject. */
export function CategoryHero({ section, title, children, tone = 'light' }: { section: EditorialSection; title: string; children: ReactNode; tone?: 'light' | 'dark' }) {
  return <header className={`category-hero category-hero--${section}`} data-tone={tone} style={{ '--hero-background': backgrounds[section] } as CSSProperties}>
    <div className="category-hero-inner">
    <div className="category-hero-copy"><p className="category-kicker">AI OPC / {labels[section]}</p><h1>{title}</h1><div className="category-dek">{children}</div></div>
    <div className="category-art"><Image src={`/editorial/${section}.webp`} alt="" fill priority sizes="(max-width: 768px) 55vw, 570px" /></div>
    </div>
  </header>;
}

export function ResearchFrontispiece() {
  return <figure className="research-frontispiece"><Image src="/editorial/weekly.webp" alt="书页化为阶梯，透镜聚焦研究价值的概念插画" fill priority sizes="(max-width: 768px) 100vw, 1100px" /><figcaption>AI OPC / 创业研究 · 栏目插画</figcaption></figure>;
}
