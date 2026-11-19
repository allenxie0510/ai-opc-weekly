import Image from 'next/image';
import type { Metadata } from 'next';
import { Header } from '@/components/page-shell';
import { ExploreApp } from '@/modules/explore/ExploreApp';
import { getLatestOpportunity, getOpportunityBySlug } from '@/lib/data';

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
      <header className="explore-editorial-hero"><div><p className="reading-eyebrow">FROM INFORMATION TO ACTION</p><h1>方向探测器</h1><p>找到适合你的方向，明确下一步。</p></div><figure><Image src="/editorial/direction-compass.webp" alt="指南针与纸上岔路，指向一扇绿色的门" width={1200} height={800} sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1280px) 55vw, 643px" priority/><figcaption>AI 概念插图</figcaption></figure></header>
      <div className="container page-wrap explore-workspace">


        <ExploreApp example={example ? { title: example.title, slug: example.slug, customer: example.customer, thesis: example.thesis, risk: example.bear_case, firstStep: example.validation_plan?.steps?.[0] || '' } : null} initialDirection={imported?.title || ''} />

        <div className="page-disclaimer">
          <p>方向与规划由 AI 生成，仅供参考，不构成投资建议。</p>
        </div>
      </div>
    </>
  );
}
