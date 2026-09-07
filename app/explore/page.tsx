import type { Metadata } from 'next';
import { Header } from '@/components/page-shell';
import { PageViewCounter } from '@/components/page-view-counter';
import { ExploreApp } from '@/modules/explore/ExploreApp';
import { getLatestOpportunity, getOpportunityBySlug } from '@/lib/data';
import { EditorialLinks } from '@/components/editorial-links';

export const metadata: Metadata = {
  title: '方向探测器 · AI OPC',
  description:
    '结合你的技能、资源和限制，在选定方向内比较候选、理解取舍，并得到下一步验证计划。',
};

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const imported = typeof from === 'string' && from.length < 150 ? await getOpportunityBySlug(from) : null;
  const example = imported || await getLatestOpportunity();
  return (
    <>
      <Header />
      <div className="container page-wrap">
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">方向探测器</h1>
            <p className="x-pagehead-meta">
              从你的技能、资源和限制出发，比较候选方向，明确取舍，再安排下一步验证。
            </p>
          </div>
        </header>

        <ExploreApp example={example ? { title: example.title, slug: example.slug, customer: example.customer, thesis: example.thesis, risk: example.bear_case, firstStep: example.validation_plan?.steps?.[0] || '' } : null} initialDirection={imported?.title || ''} />

        <footer
          style={{
            textAlign: 'center',
            padding: '48px 0',
            color: 'var(--color-stone)',
            fontSize: '0.8rem',
            marginTop: 'auto',
          }}
        >
          <EditorialLinks />
          <p style={{ marginBottom: 6 }}>
            <PageViewCounter />
          </p>
          <p>方向与规划由 AI 生成，仅供参考，不构成投资建议。</p>
          <p>© 2026 AI OPC. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
