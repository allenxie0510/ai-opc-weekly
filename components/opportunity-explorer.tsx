'use client';

import { useMemo, useState } from 'react';
import { OpportunityCard } from './OpportunityCard';
import { CATEGORY_MAP, RECOMMENDATION_MAP, type Opportunity } from '@/lib/types';

export function OpportunityExplorer({ opportunities }: { opportunities: Opportunity[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [sort, setSort] = useState('recent');
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const list = opportunities.filter((o) => (!category || o.category === category) && (!recommendation || o.recommendation === recommendation) && terms.every((term) => [o.title, o.thesis, o.customer, o.pain, o.distribution, o.mvp_weeks, o.business_model].filter(Boolean).join(' ').toLowerCase().includes(term)));
    return sort === 'score' ? [...list].sort((a, b) => b.score_total - a.score_total) : list;
  }, [opportunities, query, category, recommendation, sort]);
  return <>
    <section className="opportunity-filters" aria-label="筛选机会">
      <label className="filter-query">客户、痛点或获客渠道<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例如：设计师、订阅、社区" /></label>
      <label>产品类型<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">全部类型</option>{Object.entries(CATEGORY_MAP).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
      <label>研究建议<select value={recommendation} onChange={(e) => setRecommendation(e.target.value)}><option value="">全部建议</option>{Object.entries(RECOMMENDATION_MAP).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
      <label>排序<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">最新发布</option><option value="score">OPC 评分</option></select></label>
    </section>
    <div className="filter-summary"><p role="status">找到 {filtered.length} / {opportunities.length} 条机会</p><button type="button" onClick={() => { setQuery(''); setCategory(''); setRecommendation(''); setSort('recent'); }}>重置筛选</button></div>
    {filtered.length ? <div className="opp-grid">{filtered.map((o) => <OpportunityCard key={o.id} opportunity={o} />)}</div> : <div className="radar-empty"><p>没有匹配的机会。试试更短的关键词，或重置筛选。</p></div>}
  </>;
}
