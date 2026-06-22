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

      <FilterBar categories={Array.from(new Set(items.map(i => i.category)))} />
      <div className="article-list">
        {items.map((item, idx) => (
          <ArticleCard key={item.id} item={item} index={idx + 1} />
        ))}
      </div>

      <footer>
        <p>数据来源：X / Twitter · GitHub Trending · Product Hunt · Indie Hackers · TrustMRR</p>
        <p>本分析仅供方向参考。原创创造价值，不做搬运工。每周一自动更新。</p>
        <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        <div className="visitor-count">访问量：<span id="vc">—</span></div>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var k='aiopc_visits';
            if(!sessionStorage.getItem('v')){
              sessionStorage.setItem('v','1');
              var c=parseInt(localStorage.getItem(k)||'0')+1;
              localStorage.setItem(k,String(c));
            }
            document.getElementById('vc').textContent=localStorage.getItem(k);
          })();
        ` }} />
      </footer>
    </PageShell>
  );
}
