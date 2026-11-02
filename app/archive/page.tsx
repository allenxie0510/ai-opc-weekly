import type { Metadata } from 'next';
import { CategoryHero } from '@/components/category-hero';
import { Header } from '@/components/page-shell';
import { WeeklyIssueView } from '@/components/weekly-issue-view';
import { getWeeklyIssues, getNewsItems } from '@/lib/data';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const [latest] = await getWeeklyIssues();
  return {
    title: latest ? `${latest.title} · 每周深读 · AI OPC` : '每周深读 · AI OPC',
    description: latest?.summary || '从真实案例到经营方法，每周更新的一人公司创业研究。',
    alternates: { canonical: latest ? `https://www.aiopcnews.com/weekly/${latest.slug}` : 'https://www.aiopcnews.com/archive' },
    openGraph: { images: latest?.cover_image ? [{ url: latest.cover_image }] : undefined },
  };
}

export default async function ArchivePage() {
  const issues = await getWeeklyIssues();
  const latest = issues[0];
  if (!latest) return <>
    <Header />
    <CategoryHero section="weekly" title="每周深读"><p>从真实案例到经营方法，收藏值得反复拆解的创业研究。</p></CategoryHero>
    <main className="container page-wrap"><p className="weekly-empty">暂无已发布的周报，下一期发布后会在这里展示。</p></main>
  </>;
  const items = await getNewsItems(latest.id);
  return <WeeklyIssueView issue={latest} items={items} allIssues={issues} />;
}
