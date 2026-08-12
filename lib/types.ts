export interface WeeklyIssue {
  id: string;
  slug: string;
  issue_number: number;
  year: number;
  week_number: number;
  week_start: string;
  week_end: string;
  title: string;
  summary: string;
  cover_image: string;
  status: 'draft' | 'published';
  published_at: string;
}

export interface NewsItem {
  id: string;
  weekly_issue_id: string;
  title: string;
  description: string;
  insight: string;
  category: Category;
  creator_level: 'high' | 'medium' | 'low';
  compound_potential: 'high' | 'medium' | 'low';
  mrr_range: string;
  pricing: string;
  mvp_time: string;
  refs: { label: string; url: string }[];
  tags: string[];
  rank: number;
  /** P2 三段式分区；旧期数无此字段（undefined），前端按旧平铺布局兼容 */
  section?: 'picks' | 'deepdive' | 'rejected';
  /** P0 可信度：收入数字出处类型与证据（旧期数无此字段） */
  revenue_type?: 'founder_disclosed' | 'ai_estimate' | 'undisclosed';
  revenue_source_url?: string;
  claim_quote?: string;
}

export type Category = 'micro-saas' | 'design-assets' | 'automation' | 'content-monetize' | 'indie-tool' | 'digital-product';

// X 推文相关
export interface TwitterAccount {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  enabled: boolean;
  rss_url?: string;
  created_at: string;
}

export interface Tweet {
  id: string;
  tweet_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string;
  content: string;
  published_at: string;
  url: string;
  media_urls: string[];
  created_at: string;
}

export const CATEGORY_MAP: Record<Category, { label: string; cssClass: string }> = {
  'micro-saas': { label: '微SaaS', cssClass: 'cat-microsaas' },
  'design-assets': { label: '设计资产', cssClass: 'cat-design' },
  'automation': { label: '自动化', cssClass: 'cat-automation' },
  'content-monetize': { label: '内容变现', cssClass: 'cat-content' },
  'indie-tool': { label: '小而美', cssClass: 'cat-tool' },
  'digital-product': { label: '虚拟产品', cssClass: 'cat-digital' },
};

// OPC Radar · 一人雷达
export interface RadarItem {
  id: string;
  title: string;
  summary: string;
  source_name: string;
  source_url: string;
  score: number;
  editor_note: string;
  pick_reason: string;
  category: Category | null;
  status: 'draft' | 'published' | 'rejected';
  reject_reason: string | null;
  image_url?: string | null;
  published_at: string;
  created_at: string;
}

// ═══ Market Pulse · 赛道脉搏（P3.2，纯读取侧聚合，无新表） ═══
export interface MarketPulseItem {
  category: Category;
  label: string;               // CATEGORY_MAP 中文名
  cssClass: string;            // CATEGORY_MAP 胶囊样式
  weekCount: number;           // 近 7 天信号数
  prevWeekCount: number;       // 前 7 天信号数
  delta: number;               // weekCount - prevWeekCount
  deltaPct: number | null;     // 环比百分比；prevWeekCount=0 时为 null
  trend: 'up' | 'flat' | 'down';
  daily: number[];             // 近 14 天按天 bucket（最旧 → 最新），sparkline 用
  topSignals: string[];        // 近 7 天分数最高的 ≤2 条标题
}

// ═══ Opportunities · 机会情报（重构 P1） ═══

export type Recommendation = 'BUILD' | 'WATCH' | 'NICHE_ONLY' | 'SKIP';
export type EvidenceGrade = 'A' | 'B' | 'C' | 'D';

export interface OpportunityEvidence {
  claim: string;
  source_name: string;
  source_url: string;
  quote: string;
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
}

export interface ValidationPlan {
  hypothesis: string;
  steps: string[];
  success_threshold: string;
  kill_condition: string;
  niche_hint?: string;
  recommendation_reason?: string;
}

export interface OpportunityScoreHistory {
  id: string;
  opportunity_id: string;
  /** 0–10 一位小数（opportunities.score_total 0–100 除以 10） */
  score: number;
  /** 本次评分依据的新信号数（初评=证据数） */
  signal_count: number;
  reason: string | null;
  source: 'initial' | 'weekly-rescore' | 'manual' | string;
  created_at: string;
  /** P3.3 校准判定（migration-003 后复评记录才有；初评记录恒为 null——它是被校准的对象） */
  verdict?: 'confirmed' | 'partially' | 'refuted' | 'too-early' | string | null;
  /** 一句话中文复盘："当初认为X，本周新信号Y证实/削弱了它" */
  calibration_note?: string | null;
}

export interface Opportunity {
  id: string;
  slug: string;
  title: string;
  thesis: string;
  why_now: string;
  customer: string;
  pain: string;
  who_pays: string;
  business_model: string;
  pricing_hint: string;
  mvp_weeks: string;
  distribution: string;
  competition: string;
  platform_risk: string;
  bull_case: string;
  bear_case: string;
  mvp_wedge: string;
  first_10_customers: string;
  score_demand: number;
  score_solo_fit: number;
  score_monetization: number;
  score_distribution: number;
  score_timing: number;
  score_defensibility: number;
  score_operating: number;
  score_total: number;
  evidence_grade: EvidenceGrade;
  recommendation: Recommendation;
  timing: 'early' | 'right-time' | 'late';
  validation_plan: ValidationPlan;
  evidence: OpportunityEvidence[];
  editor_take: string;
  editor_conviction: 'high' | 'medium' | 'low';
  category: Category;
  /** AI 概念图封面（Stage 4 生成；旧数据无此字段或为 null，前端用程序化兜底封面） */
  cover_url?: string | null;
  signal_ids: string[];
  case_ids: string[];
  status: 'draft' | 'published' | 'archived';
  published_at: string;
  created_at: string;
  /** 评分趋势标（P3 飞轮）：history ≥2 条且最新分-首条分 ≥0.5 → up，≤-0.5 → down；查询填充，非表字段 */
  score_trend?: 'up' | 'down';
}

export interface OpportunityCase {
  id: string;
  name: string;
  url: string;
  founder: string;
  team_size: string;
  mrr: string;
  arr?: string;
  revenue_type: 'founder_disclosed' | 'ai_estimate' | 'undisclosed';
  revenue_source_url: string;
  claim_quote: string;
  pricing: string;
  distribution: string;
  source_name: string;
  source_tier: string;
}

export const RECOMMENDATION_MAP: Record<Recommendation, { label: string; cssClass: string; desc: string }> = {
  BUILD: { label: '立即动手', cssClass: 'rec-build', desc: '值得立即动手验证' },
  WATCH: { label: '保持关注', cssClass: 'rec-watch', desc: '持续观察，等信号成熟' },
  NICHE_ONLY: { label: '垂直切入', cssClass: 'rec-niche', desc: '只建议从垂直细分切入' },
  SKIP: { label: '不建议', cssClass: 'rec-skip', desc: '不建议进入' },
};

export const CONVICTION_MAP: Record<Opportunity['editor_conviction'], string> = {
  high: '高', medium: '中', low: '低',
};

export const SCORE_DIMENSIONS: { key: keyof Opportunity; label: string; weight: number }[] = [
  { key: 'score_demand', label: '需求真实性', weight: 20 },
  { key: 'score_solo_fit', label: '单人可行性', weight: 20 },
  { key: 'score_monetization', label: '付费意愿', weight: 15 },
  { key: 'score_distribution', label: '获客可行性', weight: 15 },
  { key: 'score_timing', label: '时机', weight: 15 },
  { key: 'score_defensibility', label: '防御性', weight: 10 },
  { key: 'score_operating', label: '运营简单度', weight: 5 },
];

export interface IssueNav {
  current: WeeklyIssue | null;
  newer: WeeklyIssue | null;
  older: WeeklyIssue | null;
}
