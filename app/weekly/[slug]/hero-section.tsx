import type { WeeklyIssue, NewsItem } from '@/lib/types';
import { CategoryHero } from '@/components/category-hero';
import { SourceCover } from '@/components/source-cover';

export function HeroSection({ issue, dateStr, items = [] }: { issue: WeeklyIssue; dateStr: string; items?: NewsItem[] }) {
  const coverItem = items.find(item => item.image_url === issue.cover_image) || items.find(item => item.image_url);
  const cover = issue.cover_image || coverItem?.image_url;
  if (!cover) return <CategoryHero section="weekly" title={issue.title}>
    <p className="weekly-dateline">{dateStr} · 第 {issue.week_number} 周</p>
    <p>{issue.summary || '从公开原文出发，拆解客户、交付与获客，形成可验证的经营判断。'}</p>
  </CategoryHero>;
  const sourceUrl = coverItem?.image_url === cover ? coverItem.image_source_url : undefined;
  return <header className="weekly-issue-hero">
    <div className="container weekly-issue-hero-inner">
      <div className="weekly-issue-copy">
        <p className="category-kicker">AI OPC / WEEKLY RESEARCH</p>
        <p className="weekly-dateline">{dateStr} · 第 {issue.week_number} 周</p>
        <h1>{issue.title}</h1>
        <p className="weekly-issue-summary">{issue.summary || '从真实案例出发，寻找一人公司的下一步。'}</p>
        <a className="weekly-read-link" href="#weekly-articles">阅读本期 {items.filter(item => item.section !== 'rejected').length} 个案例 ↓</a>
      </div>
      <SourceCover src={cover} alt={coverItem ? `${coverItem.title} · 本期来源配图` : `${issue.title}封面`} sourceUrl={sourceUrl} sourceLabel={coverItem?.refs?.find(ref => ref.url === sourceUrl)?.label} priority />
    </div>
  </header>;
}
