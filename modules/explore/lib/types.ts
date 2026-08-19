export interface AIConfig {
  provider: 'server' | 'mock' | 'openai';
  endpoint: string;
  apiKey: string;
  model: string;
}

export type RiskTolerance = '保守' | '平衡' | '激进';

export interface ThemeProfile {
  vision: string;      // 人生/事业愿景（50年计划式）
  direction: string;   // 本次想探索的主题/方向（人类选定）
  interests: string;   // 兴趣与擅长领域
  resources: string;   // 已掌握资源：资金/人脉/技术/渠道
  constraints: string; // 硬约束：地域/时间/启动资金上限/不能做的事
  riskTolerance: RiskTolerance;
  horizonYears: number; // 时间跨度（年）
  strengths: string;    // 个人强项（用于强项契合打分）
}

export const EMPTY_PROFILE: ThemeProfile = {
  vision: '',
  direction: '',
  interests: '',
  resources: '',
  constraints: '',
  riskTolerance: '平衡',
  horizonYears: 10,
  strengths: '',
};

export type CriterionKind = 'subjective' | 'objective';

export interface Criterion {
  id: string;
  name: string;
  short: string;
  desc: string;
  question: string; // 给 AI 的打分提示
  weight: number;   // 0..5
  kind: CriterionKind;
  origin: string;   // 对应孙正义原始检查项的说明
}

export type CapitalNeed = '低' | '中' | '高';
export type Competition = '低' | '中' | '高';
export type Timing = '早' | '中' | '晚';

export type OppStatus = 'pool' | 'favorite' | 'rejected' | 'shortlist';

export interface Opportunity {
  id: string;
  name: string;
  oneLiner: string;
  category: string;
  targetUsers: string;
  painPoint: string;
  solution: string;
  businessModel: string;
  moat: string;
  marketNote: string;
  trend: string;
  capitalNeed: CapitalNeed;
  competition: Competition;
  timing: Timing;
  scores: Record<string, number>;      // criterionId -> 1..10（AI 初判）
  overrides: Record<string, number>;   // 人类覆盖
  status: OppStatus;
  source: 'mock' | 'ai';  // 数据来源：mock=演示假数据 / ai=真实模型生成
  createdAt: number;      // 生成时间戳（ms）
  note?: string;
}

export interface RankedOpportunity {
  opp: Opportunity;
  total: number;                       // 0..100
  detail: { criterionId: string; name: string; raw: number; weighted: number; human: boolean }[];
}

export interface DeepDive {
  thesis: string;      // 一句话投资/创业论点
  strengths: string[];
  risks: string[];
  verdict: '强烈推荐' | '推荐' | '谨慎' | '不推荐';
  verdictReason: string;
}

export interface PlanMilestone {
  timeLabel: string;    // 倒序：如「10年后」
  goal: string;
  keyResults: string[];
  resources: string;
  assumptions: string;  // 待验证假设
  risks: string;
}

export interface BackcastPlan {
  ideaId: string;
  finalVision: string;   // 终局愿景（时间跨度终点）
  successMetric: string; // 成功度量
  milestones: PlanMilestone[]; // 从远到近（倒序）
  firstStep: string;     // 本周第一步
}

/** 每个机会 id 对应一份逆向规划 */
export type PlansMap = Record<string, BackcastPlan>;

/** 一次保存下来的「方向探索」会话（多次探索） */
export interface ExploreSession {
  id: string;
  title: string;
  profile: ThemeProfile;
  weights: Record<string, number>;
  opportunities: Opportunity[];
  plans: PlansMap;
  created_at: string;
  updated_at: string;
}
