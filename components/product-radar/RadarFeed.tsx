'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DecisionLabel, OpportunityStage, ProductOpportunity, RiskLevel } from '@/lib/product-radar/domain';
import { calculateProfit } from '@/lib/product-radar/profit';
import { STAGE_LABELS } from '@/lib/product-radar/presentation';
import { trackProductRadarEvent } from '@/lib/product-radar/client-events';
import { ProductOpportunityCard } from './OpportunityCard';

const DECISIONS: Array<DecisionLabel | ''> = ['', '值得测试', '小规模测试', '保持关注', '谨慎进入', '暂不建议'];
const STAGES: Array<OpportunityStage | ''> = ['', 'emerging', 'accelerating', 'breakout', 'crowded', 'declining'];
const RISK_ORDER: RiskLevel[] = ['low', 'medium', 'high', 'blocked'];

export function RadarFeed({ items, categories }: { items: ProductOpportunity[]; categories: string[] }) {
  const [category, setCategory] = useState('');
  const [decision, setDecision] = useState<DecisionLabel | ''>('');
  const [stage, setStage] = useState<OpportunityStage | ''>('');
  const [dropshipOnly, setDropshipOnly] = useState(false);
  const [minMargin, setMinMargin] = useState(0);
  const [maxRisk, setMaxRisk] = useState<RiskLevel>('blocked');

  useEffect(() => { trackProductRadarEvent('view_radar_feed', { count: items.length }); }, [items.length]);

  const filtered = useMemo(() => items.filter((item) => {
    if (category && item.category !== category) return false;
    if (decision && item.decision !== decision) return false;
    if (stage && item.stage !== stage) return false;
    if (dropshipOnly && !item.supplyOffers.some((offer) => offer.onePieceDropship)) return false;
    if (calculateProfit(item.profitDefaults).contributionMargin < minMargin) return false;
    if (RISK_ORDER.indexOf(item.riskLevel) > RISK_ORDER.indexOf(maxRisk)) return false;
    return true;
  }), [items, category, decision, stage, dropshipOnly, minMargin, maxRisk]);

  const update = (name: string, value: string | number | boolean, setter: () => void) => {
    setter();
    trackProductRadarEvent('filter_radar', { filter: name, value });
  };

  const clear = () => {
    setCategory(''); setDecision(''); setStage(''); setDropshipOnly(false); setMinMargin(0); setMaxRisk('blocked');
  };

  return (
    <section aria-labelledby="radar-feed-heading">
      <div className="pr-feed-head"><div><span className="pr-kicker">TODAY&apos;S SHORTLIST</span><h2 id="radar-feed-heading">今日值得看的商品机会</h2></div><span className="pr-result-count">{filtered.length} / {items.length}</span></div>
      <div className="pr-filters" aria-label="商品机会筛选">
        <label><span>品类</span><select value={category} onChange={(event) => update('category', event.target.value, () => setCategory(event.target.value))}><option value="">全部品类</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>决策</span><select value={decision} onChange={(event) => update('decision', event.target.value, () => setDecision(event.target.value as DecisionLabel | ''))}>{DECISIONS.map((item) => <option key={item || 'all'} value={item}>{item || '全部决策'}</option>)}</select></label>
        <label><span>阶段</span><select value={stage} onChange={(event) => update('stage', event.target.value, () => setStage(event.target.value as OpportunityStage | ''))}>{STAGES.map((item) => <option key={item || 'all'} value={item}>{item ? STAGE_LABELS[item] : '全部阶段'}</option>)}</select></label>
        <label><span>最低贡献率</span><select value={minMargin} onChange={(event) => update('margin', Number(event.target.value), () => setMinMargin(Number(event.target.value)))}><option value={0}>不限</option><option value={20}>20%+</option><option value={30}>30%+</option><option value={40}>40%+</option></select></label>
        <label><span>最高风险</span><select value={maxRisk} onChange={(event) => update('risk', event.target.value, () => setMaxRisk(event.target.value as RiskLevel))}><option value="blocked">包含阻断</option><option value="high">高风险以下</option><option value="medium">中风险以下</option><option value="low">仅低风险</option></select></label>
        <label className="pr-check"><input type="checkbox" checked={dropshipOnly} onChange={(event) => update('dropship', event.target.checked, () => setDropshipOnly(event.target.checked))} /><span>仅一件代发</span></label>
      </div>
      {filtered.length ? <div className="pr-feed-grid">{filtered.map((item) => <ProductOpportunityCard key={item.id} opportunity={item} />)}</div> : (
        <div className="pr-empty"><strong>当前组合没有机会</strong><p>放宽利润或风险条件，不会自动混入无关品类。</p><button type="button" onClick={clear}>清空筛选</button></div>
      )}
    </section>
  );
}
