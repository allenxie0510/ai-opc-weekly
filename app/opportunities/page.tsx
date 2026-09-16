import { CategoryHero } from '@/components/category-hero';
import type { Metadata } from 'next';
import { getOpportunities } from '@/lib/data';
import { Header } from '@/components/page-shell';
import { OpportunityExplorer } from '@/components/opportunity-explorer';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Opportunities · AI OPC 机会情报',
  description: 'AI × 一人公司创业机会判断：OPC Score 七维评分、证据分级、BUILD/WATCH/NICHE_ONLY/SKIP 建议与验证计划',
};

export default async function OpportunitiesPage() {
  const opps = await getOpportunities();

  return (
    <>
      <Header />
      <CategoryHero section="opportunities" title="机会库"><p>从客户、痛点与获客渠道出发，发现值得验证的生意。评分是研究判断，不是成功概率。</p></CategoryHero>
      <div className="container page-wrap">


        {opps.length === 0 ? (
          <div className="radar-empty">
            <p className="radar-empty-title">机会引擎待机中</p>
            <p className="radar-empty-sub">每周三 09:30 扫描本周信号，聚类成机会</p>
          </div>
        ) : (
          <OpportunityExplorer opportunities={opps} />
        )}

        <div className="page-disclaimer">
          <p>机会判断由 AI 深研生成、主编拍板；分数与证据链见详情页。不构成投资建议。</p>
        </div>
      </div>
    </>
  );
}
