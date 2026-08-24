import type {
  ConfidenceInput,
  DecisionLabel,
  EvidenceGrade,
  OpportunityStage,
  RiskLevel,
  ScoreBreakdown,
  ScoreDimensions,
} from './domain';

export const SCORE_WEIGHTS = Object.freeze({
  momentum: 0.25,
  contentability: 0.2,
  competitionGap: 0.15,
  supplyFit: 0.15,
  margin: 0.15,
  timing: 0.1,
});

export const CONFIDENCE_WEIGHTS = Object.freeze({
  completeness: 0.3,
  freshness: 0.25,
  providerReliability: 0.25,
  crossSourceAgreement: 0.2,
});

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function calculateOpportunityScore(dimensions: ScoreDimensions, riskPenalty = 0): ScoreBreakdown {
  const normalized = Object.fromEntries(
    Object.entries(dimensions).map(([key, value]) => [key, clamp(value)]),
  ) as unknown as ScoreDimensions;
  const baseScore = Object.entries(SCORE_WEIGHTS).reduce(
    (total, [key, weight]) => total + normalized[key as keyof ScoreDimensions] * weight,
    0,
  );
  const penalty = clamp(riskPenalty, 0, 20);
  return {
    ...normalized,
    baseScore: Math.round(baseScore),
    riskPenalty: Math.round(penalty),
    finalScore: Math.round(clamp(baseScore - penalty)),
  };
}

export function calculateConfidenceScore(input: ConfidenceInput): number {
  return Math.round(Object.entries(CONFIDENCE_WEIGHTS).reduce(
    (total, [key, weight]) => total + clamp(input[key as keyof ConfidenceInput]) * weight,
    0,
  ));
}

const DECISIONS: DecisionLabel[] = ['暂不建议', '谨慎进入', '保持关注', '小规模测试', '值得测试'];

function decisionByScore(score: number): DecisionLabel {
  if (score >= 85) return '值得测试';
  if (score >= 75) return '小规模测试';
  if (score >= 60) return '保持关注';
  if (score >= 40) return '谨慎进入';
  return '暂不建议';
}

export function classifyDecision(
  score: number,
  confidence: number,
  risk: RiskLevel,
  evidenceGrade: EvidenceGrade = 'A',
): DecisionLabel {
  if (risk === 'blocked') return '暂不建议';
  let decision = decisionByScore(clamp(score));
  if (confidence < 50 || evidenceGrade === 'C') {
    const watchIndex = DECISIONS.indexOf('保持关注');
    decision = DECISIONS[Math.min(DECISIONS.indexOf(decision), watchIndex)];
  }
  return decision;
}

export interface StageSignals {
  trend7dGrowth: number;
  trend30dGrowth: number;
  acceleration: number;
  demandStrength: number;
  competitionDensity: number;
}

export function classifyOpportunityStage(signal: StageSignals): OpportunityStage {
  if (signal.trend7dGrowth < 0 && signal.trend30dGrowth < 0) return 'declining';
  if (signal.competitionDensity >= 80 && signal.demandStrength >= 65) return 'crowded';
  if (signal.demandStrength >= 80 && signal.acceleration >= 18) return 'breakout';
  if (signal.trend7dGrowth >= 20 && signal.acceleration >= 8) return 'accelerating';
  return 'emerging';
}
