import type { WeeklyIssue } from '@/lib/types';
import { CategoryHero } from '@/components/category-hero';

export function HeroSection({ issue, dateStr }: { issue: WeeklyIssue; dateStr: string }) {
  return <CategoryHero section="weekly" title={issue.title}>
    <p className="weekly-dateline">{dateStr} · 第 {issue.week_number} 周</p>
    <p>{issue.summary || '从公开原文出发，拆解客户、交付与获客，形成可验证的经营判断。'}</p>
  </CategoryHero>;
}
