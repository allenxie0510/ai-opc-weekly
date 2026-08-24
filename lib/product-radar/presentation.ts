import type { DecisionLabel, EvidenceGrade, OpportunityStage, RiskLevel } from './domain';

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  emerging: '萌芽',
  accelerating: '加速',
  breakout: '突破',
  crowded: '拥挤',
  declining: '回落',
};

export const DECISION_CLASS: Record<DecisionLabel, string> = {
  '值得测试': 'test-now',
  '小规模测试': 'small-test',
  '保持关注': 'watch',
  '谨慎进入': 'caution',
  '暂不建议': 'avoid',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  blocked: '已阻断',
};

export const EVIDENCE_DESCRIPTIONS: Record<EvidenceGrade, string> = {
  A: '多来源、较新且互相印证',
  B: '主要信号可用，仍有部分缺口',
  C: '信号有限，不能用于强推荐',
};
