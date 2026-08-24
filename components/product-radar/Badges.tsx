import type { ProductOpportunity } from '@/lib/product-radar/domain';
import { DECISION_CLASS, EVIDENCE_DESCRIPTIONS, RISK_LABELS, STAGE_LABELS } from '@/lib/product-radar/presentation';

export function RadarBadges({ opportunity }: { opportunity: ProductOpportunity }) {
  return (
    <div className="pr-badges">
      <span className={`pr-decision ${DECISION_CLASS[opportunity.decision]}`}>{opportunity.decision}</span>
      <span className={`pr-stage stage-${opportunity.stage}`}>{STAGE_LABELS[opportunity.stage]}</span>
      <span className={`pr-evidence grade-${opportunity.evidenceGrade}`} title={EVIDENCE_DESCRIPTIONS[opportunity.evidenceGrade]}>证据 {opportunity.evidenceGrade}</span>
      <span className={`pr-risk risk-${opportunity.riskLevel}`}>{RISK_LABELS[opportunity.riskLevel]}</span>
    </div>
  );
}

export function ScoreDial({ score, label = '机会分' }: { score: number; label?: string }) {
  const value = Math.max(0, Math.min(100, score));
  return (
    <div className="pr-score-dial" style={{ '--score': value } as React.CSSProperties} aria-label={`${label} ${value} 分`}>
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}
