import Link from 'next/link';
import type { ProductOpportunity } from '@/lib/product-radar/domain';
import { calculateProfit } from '@/lib/product-radar/profit';
import { ProductVisual } from './ProductVisual';
import { RadarBadges, ScoreDial } from './Badges';

export function ProductOpportunityCard({ opportunity }: { opportunity: ProductOpportunity }) {
  const profit = calculateProfit(opportunity.profitDefaults);
  return (
    <article className="pr-card">
      <Link href={`/tools/xhs-product-radar/${opportunity.slug}`} className="pr-card-visual-link" aria-label={`查看${opportunity.title}`}>
        <ProductVisual slug={opportunity.slug} title={opportunity.title} compact />
      </Link>
      <div className="pr-card-body">
        <div className="pr-card-topline"><span>{opportunity.category}</span><time dateTime={opportunity.updatedAt}>{new Date(opportunity.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} 更新</time></div>
        <RadarBadges opportunity={opportunity} />
        <div className="pr-card-heading">
          <div><h2><Link href={`/tools/xhs-product-radar/${opportunity.slug}`}>{opportunity.title}</Link></h2><p>{opportunity.shortDescription}</p></div>
          <ScoreDial score={opportunity.score.finalScore} />
        </div>
        <div className="pr-card-facts">
          <span><strong>{opportunity.confidence}</strong>置信度</span>
          <span><strong>{profit.contributionMargin.toFixed(0)}%</strong>试算贡献率</span>
          <span><strong>{opportunity.supplyOffers.filter((offer) => offer.onePieceDropship).length}</strong>一件代发样本</span>
        </div>
        <ul className="pr-signal-list">
          {opportunity.topSignals.slice(0, 3).map((signal) => <li key={signal.id}>{signal.note}</li>)}
        </ul>
        <p className="pr-card-why"><strong>为什么是现在</strong>{opportunity.whyNow}</p>
        <Link href={`/tools/xhs-product-radar/${opportunity.slug}`} className="pr-card-cta">打开完整决策卡 <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
