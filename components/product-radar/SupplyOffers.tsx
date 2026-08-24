'use client';

import type { SupplyOffer } from '@/lib/product-radar/domain';
import { trackProductRadarEvent } from '@/lib/product-radar/client-events';

export function SupplyOffers({ offers, slug }: { offers: SupplyOffer[]; slug: string }) {
  if (!offers.length) return <div className="pr-supply-empty"><strong>暂无合格供应样本</strong><p>不会因为缺货源而伪造一件代发报价。请先保持观察，等待授权 Provider 补齐证据。</p></div>;
  return (
    <div className="pr-supply-grid">
      {offers.slice(0, 5).map((offer) => <article key={offer.id} className="pr-supply-card">
        <div className="pr-supply-source">{offer.provider}</div><h3>{offer.title}</h3>
        <div className="pr-supply-price"><strong>¥{offer.unitPrice.toFixed(2)}</strong><span>起订 {offer.minOrderQuantity} 件</span></div>
        <div className="pr-supply-tags">{offer.onePieceDropship && <span>一件代发</span>}{offer.attributes.map((item) => <span key={item}>{item}</span>)}</div>
        <p>预估运费 ¥{offer.shippingEstimate.toFixed(2)} · {offer.supplierLocation}</p>
        <a href={offer.url} target="_blank" rel="noreferrer nofollow" onClick={() => trackProductRadarEvent('open_supply_offer', { slug, offerId: offer.id })}>去 1688 公开搜索 <span aria-hidden="true">↗</span></a>
      </article>)}
    </div>
  );
}
