import { PageShell } from '@/components/page-shell';
import { ArticleCard } from '@/components/article-card';
import { FilterBar } from '@/app/weekly/[slug]/filter-bar';
import { HeroSection } from '@/app/weekly/[slug]/hero-section';
import type { WeeklyIssue, NewsItem } from '@/lib/types';

export function WeeklyIssueView({ issue, items, allIssues }: {
  issue: WeeklyIssue; items: NewsItem[]; allIssues: WeeklyIssue[];
}) {
  const dateStr = new Date(issue.week_start).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '.');

  return (
    <PageShell
      hero={<HeroSection issue={issue} dateStr={dateStr} />}
      issue={{ slug: issue.slug, week_number: issue.week_number, week_start: issue.week_start, week_end: issue.week_end }}
      issues={allIssues.map(i => ({
        slug: i.slug,
        week_number: i.week_number,
        week_start: i.week_start,
        week_end: i.week_end,
      }))}
    >

      {(() => {
        // P2 三段式：存在 deepdive 条目 → 新版分区布局；否则（旧期数）保持平铺
        const picks = items.filter(i => !i.section || i.section === 'picks');
        const deepdive = items.filter(i => i.section === 'deepdive');
        const isSectioned = deepdive.length > 0;

        if (!isSectioned) {
          return (
            <>
              <FilterBar key={issue.id} categories={Array.from(new Set(items.map(i => i.category).filter(Boolean)))} />
              <div className="article-list">
                {items.map((item, idx) => (
                  <ArticleCard key={item.id} item={item} index={idx + 1} />
                ))}
              </div>
            </>
          );
        }

        const filterable = [...picks, ...deepdive];
        return (
          <>
            <FilterBar key={issue.id} categories={Array.from(new Set(filterable.map(i => i.category).filter(Boolean)))} />

            {picks.length > 0 && (
              <section className="weekly-section">
                <h2 className="weekly-section-title">
                  本周快讯精选
                </h2>
                <div className="article-list">
                  {picks.map((item, idx) => (
                    <ArticleCard key={item.id} item={item} index={idx + 1} />
                  ))}
                </div>
              </section>
            )}

            {deepdive.length > 0 && (
              <section className="weekly-section">
                <h2 className="weekly-section-title">
                  深度拆解
                </h2>
                <div className="article-list">
                  {deepdive.map((item, idx) => (
                    <ArticleCard key={item.id} item={item} index={picks.length + idx + 1} />
                  ))}
                </div>
              </section>
            )}
          </>
        );
      })()}

        <div className="page-disclaimer">
        <p>研究方法：公开来源与原文引用 · AI 辅助分析 · 编辑审核发布</p>
        <p>本分析仅供方向参考。原创创造价值，不做搬运工。每周一自动更新。</p>
      </div>

      {/* GEO: JSON-LD structured data for AI search engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: issue.title,
            description: issue.summary || `AI 一人公司创业机会 · 第 ${issue.week_number} 周`,
            datePublished: issue.published_at,
            dateModified: issue.published_at,
            image: issue.cover_image || undefined,
            author: {
              '@type': 'Organization',
              name: 'AI OPC 编辑部',
              url: 'https://www.aiopcnews.com',
            },
            publisher: {
              '@type': 'Organization',
              name: 'AI OPC',
              url: 'https://www.aiopcnews.com',
            },
            about: items.map(i => i.title).join(', '),
            keywords: Array.from(new Set(items.flatMap(i => i.tags || []))).join(', '),
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: '首页', item: 'https://www.aiopcnews.com' },
              { '@type': 'ListItem', position: 2, name: '每周深读', item: 'https://www.aiopcnews.com/weekly' },
              { '@type': 'ListItem', position: 3, name: `第 ${issue.week_number} 周 · ${issue.title}` },
            ],
          }),
        }}
      />
    </PageShell>
  );
}
