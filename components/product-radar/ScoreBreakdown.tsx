import type { ScoreBreakdown as ScoreBreakdownType } from '@/lib/product-radar/domain';

const DIMENSIONS: Array<{ key: keyof Pick<ScoreBreakdownType, 'momentum' | 'contentability' | 'competitionGap' | 'supplyFit' | 'margin' | 'timing'>; label: string; weight: string }> = [
  { key: 'momentum', label: '动量', weight: '25%' }, { key: 'contentability', label: '内容可表达性', weight: '20%' }, { key: 'competitionGap', label: '竞争窗口', weight: '15%' }, { key: 'supplyFit', label: '供应匹配', weight: '15%' }, { key: 'margin', label: '利润空间', weight: '15%' }, { key: 'timing', label: '时机', weight: '10%' },
];

export function ScoreBreakdown({ score, confidence }: { score: ScoreBreakdownType; confidence: number }) {
  return (
    <div className="pr-score-layout">
      <div className="pr-score-bars">{DIMENSIONS.map((item) => <div className="pr-score-row" key={item.key}><div><span>{item.label}</span><em>{item.weight}</em></div><span className="pr-score-track"><span style={{ width: `${score[item.key]}%` }} /></span><strong>{score[item.key]}</strong></div>)}</div>
      <dl className="pr-score-summary"><div><dt>加权基础分</dt><dd>{score.baseScore}</dd></div><div><dt>风险扣分</dt><dd>-{score.riskPenalty}</dd></div><div><dt>最终机会分</dt><dd>{score.finalScore}</dd></div><div className="confidence"><dt>证据置信度</dt><dd>{confidence}</dd></div></dl>
    </div>
  );
}
