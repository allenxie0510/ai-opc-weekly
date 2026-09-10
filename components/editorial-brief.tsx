import { BUSINESS_LABELS, MARKET_LABELS, QUESTION_LABELS, type EditorialBrief as Brief } from '@/lib/editorial-policy.mjs';

export function EditorialBrief({ brief }: { brief?: Brief | null }) {
  if (!brief?.answers) return null;
  return <details className="editorial-brief">
    <summary>{MARKET_LABELS[brief.operating_market] || MARKET_LABELS.unknown} · {BUSINESS_LABELS[brief.business_form] || '其他'} <span>查看经营判断与证据</span></summary>
    <dl>{Object.entries(QUESTION_LABELS).map(([key, label]) => {
      const value = brief.answers[key];
      if (!value) return null;
      return <div key={key}><dt>{label} <small>{value.basis === 'source' ? '来源陈述' : value.basis === 'inference' ? '编辑推断' : '未披露'}</small></dt>
        <dd>{value.answer}{value.quote && <blockquote>{value.quote}</blockquote>}</dd></div>;
    })}</dl>
    <p className="editorial-evidence-note">证据 {brief.evidence_grade} · {brief.evidence_note}。证据等级与机会评分独立。</p>
    <a href={brief.source_url} target="_blank" rel="noopener noreferrer">查看证据来源</a>
  </details>;
}
