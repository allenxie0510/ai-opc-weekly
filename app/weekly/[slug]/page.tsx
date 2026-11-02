import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getIssueBySlug, getNewsItems, getWeeklyIssues } from '@/lib/data';
import { WeeklyIssueView } from '@/components/weekly-issue-view';

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
    title: `${issue.title} · AI OPC 周报`,
    description: `AI 一人公司创业机会 · 第 ${issue.week_number} 周`,
    alternates: { canonical: `https://www.aiopcnews.com/weekly/${issue.slug}` },
    openGraph: {
      images: issue.cover_image ? [{ url: issue.cover_image }] : undefined,
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

  return <WeeklyIssueView issue={issue} items={items} allIssues={allIssues} />;
}
