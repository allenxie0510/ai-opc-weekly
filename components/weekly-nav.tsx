'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NavIssue {
  slug: string;
  week_number: number;
  week_start: string;
  week_end: string;
}

export function WeeklyNav({ currentSlug, issues }: { currentSlug: string; issues: NavIssue[] }) {
  const router = useRouter();
  const currentIdx = issues.findIndex(issue => issue.slug === currentSlug);
  const newer = currentIdx > 0 ? issues[currentIdx - 1] : null;
  const older = currentIdx >= 0 && currentIdx < issues.length - 1 ? issues[currentIdx + 1] : null;
  const href = (issue: NavIssue) => issue.slug === issues[0]?.slug ? '/archive' : `/weekly/${issue.slug}`;
  const fmt = (issue: NavIssue) => {
    const date = (value: string) => value.slice(5, 10).replace('-', '/');
    return `${issue.slug.slice(0, 4)} · 第 ${issue.week_number} 周 · ${date(issue.week_start)}–${date(issue.week_end)}`;
  };
  return <nav className="weekly-navigation" aria-label="周报期数导航">
    <div className="container weekly-navigation-inner">
      <Link className="weekly-nav-home" href="/archive">每周深读</Link>
      <div className="weekly-switcher">
        <label className="sr-only" htmlFor="weekly-issue-select">切换周报期数</label>
        <select id="weekly-issue-select" aria-label="切换周报期数" value={currentSlug} onChange={event => {
          const next = issues.find(issue => issue.slug === event.target.value);
          if (next) router.push(href(next));
        }}>
          {issues.map((issue, index) => <option key={issue.slug} value={issue.slug}>{index === 0 ? '最新 · ' : ''}{fmt(issue)}</option>)}
        </select>
        <div className="weekly-step-links">
          {older ? <Link href={href(older)} aria-label="阅读上一期周报">← 上一期</Link> : <span aria-disabled="true">← 上一期</span>}
          {newer ? <Link href={href(newer)} aria-label="阅读下一期周报">下一期 →</Link> : <span className="weekly-latest">最新一期</span>}
        </div>
      </div>
    </div>
  </nav>;
}
