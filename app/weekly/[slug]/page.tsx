import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getIssueBySlug, getNewsItems, getWeeklyIssues } from '@/lib/data';
import { PageShell } from '@/components/page-shell';
import { ArticleCard } from '@/components/article-card';
import { ShareBar } from './share-bar';
import { FilterBar } from './filter-bar';
import { HeroSection } from './hero-section';

export const revalidate = 300; // ISR: 5 min

export async function generateStaticParams() {
  const issues = await getWeeklyIssues();
  return issues.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const issue = await getIssueBySlug(slug);
  if (!issue) return { title: 'Not Found' };

  return {
    title: `${issue.title} · AI OPC Weekly`,
    description: `AI 一人公司创业机会 · 第 ${issue.week_number} 周`,
    openGraph: {
      title: issue.title,
      description: `第 ${issue.week_number} 周 AI 创业趋势`,
      type: 'article',
      publishedTime: issue.published_at,
    },
  };
}

export default async function WeeklyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const issue = await getIssueBySlug(slug);
  if (!issue) notFound();

  const items = await getNewsItems(issue.id);
  const allIssues = await getWeeklyIssues();

  const dateStr = new Date(issue.week_start).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '.');

  return (
    <PageShell
      issue={{ slug: issue.slug, week_number: issue.week_number, week_start: issue.week_start, week_end: issue.week_end }}
      issues={allIssues.map(i => ({
        slug: i.slug,
        week_number: i.week_number,
        week_start: i.week_start,
        week_end: i.week_end,
      }))}
    >
      <HeroSection issue={issue} dateStr={dateStr} />
      <ShareBar slug={slug} />
      <div className="bg-white rounded-xl px-4 py-3 my-4 border border-[var(--color-hairline)] text-xs text-[var(--color-steel)]">
        <span className="font-semibold text-[var(--color-ink)]">数据来源：</span>
        X / Twitter · GitHub Trending · Product Hunt · Indie Hackers · TrustMRR
        <span className="mx-2">·</span>
        {dateStr}
      </div>
      <FilterBar categories={Array.from(new Set(items.map(i => i.category)))} />
      <div className="grid gap-4 mt-4">
        {items.map((item, idx) => (
          <ArticleCard key={item.id} item={item} index={idx + 1} />
        ))}
      </div>
      <footer className="mt-12 pt-6 border-t border-[var(--color-hairline)] text-center text-xs text-[var(--color-stone)]">
        <p>数据来源：X / Twitter · GitHub Trending · Product Hunt · Indie Hackers · TrustMRR</p>
        <p className="mt-1">本分析仅供方向参考。原创创造价值，不做搬运工。每周一自动更新。</p>
      </footer>
    </PageShell>
  );
}
