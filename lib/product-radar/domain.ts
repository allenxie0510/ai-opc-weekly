export type ProductRadarDataMode = 'fixture' | 'live';
export type OpportunityStage = 'emerging' | 'accelerating' | 'breakout' | 'crowded' | 'declining';
export type EvidenceGrade = 'A' | 'B' | 'C';
export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';
export type DecisionLabel = '值得测试' | '小规模测试' | '保持关注' | '谨慎进入' | '暂不建议';

export interface ScoreDimensions {
  momentum: number;
  contentability: number;
  competitionGap: number;
  supplyFit: number;
  margin: number;
  timing: number;
}

export interface ScoreBreakdown extends ScoreDimensions {
  baseScore: number;
  riskPenalty: number;
  finalScore: number;
}

export interface ConfidenceInput {
  completeness: number;
  freshness: number;
  providerReliability: number;
  crossSourceAgreement: number;
}

export interface TrendPoint {
  date: string;
  normalizedInterest: number;
}

export interface ProductSignal {
  id: string;
  provider: string;
  capturedAt: string;
  metric: string;
  value: number | string;
  unit?: string;
  sourceUrl?: string;
  note: string;
}

export interface SupplyOffer {
  id: string;
  provider: string;
  title: string;
  url: string;
  unitPrice: number;
  minOrderQuantity: number;
  onePieceDropship: boolean;
  shippingEstimate: number;
  supplierLocation?: string;
  attributes: string[];
  capturedAt: string;
}

export interface RiskItem {
  id: string;
  level: RiskLevel;
  title: string;
  detail: string;
  mitigation: string;
  sourceUrl?: string;
}

export interface TestPlan {
  budget: string;
  duration: string;
  steps: string[];
  successThreshold: string;
  killCondition: string;
}

export interface ProfitDefaults {
  retailPrice: number;
  unitCost: number;
  shippingCost: number;
  packagingCost: number;
  platformFeeRate: number;
  returnAllowanceRate: number;
  promotionCost: number;
}

export interface ProductOpportunity {
  id: string;
  slug: string;
  title: string;
  category: string;
  shortDescription: string;
  imageUrl?: string;
  stage: OpportunityStage;
  score: ScoreBreakdown;
  confidence: number;
  evidenceGrade: EvidenceGrade;
  decision: DecisionLabel;
  decisionReason: string;
  whyNow: string;
  topSignals: ProductSignal[];
  trend7d: TrendPoint[];
  trend30d: TrendPoint[];
  contentabilityReasons: string[];
  contentAngles: string[];
  supplyOffers: SupplyOffer[];
  profitDefaults: ProfitDefaults;
  riskLevel: RiskLevel;
  risks: RiskItem[];
  testPlan: TestPlan;
  updatedAt: string;
  dataAsOf: string;
  providers: string[];
  dataMode: ProductRadarDataMode;
  limitations: string[];
}

export interface ProductRadarRunSummary {
  runId: string;
  status: 'success' | 'partial' | 'failed';
  mode: ProductRadarDataMode;
  startedAt: string;
  finishedAt: string;
  scannedSignals?: number;
  publishedOpportunities: number;
  providerStatus: Array<{ provider: string; status: 'ok' | 'fallback' | 'unavailable'; message: string }>;
}

export interface ProductRadarFilters {
  category?: string;
  stage?: OpportunityStage;
  decision?: DecisionLabel;
  onePieceDropship?: boolean;
  minMargin?: number;
  maxRisk?: Exclude<RiskLevel, 'blocked'>;
  limit?: number;
  offset?: number;
}

export interface ProductRadarFeed {
  items: ProductOpportunity[];
  total: number;
  categories: string[];
  run: ProductRadarRunSummary;
  stale: boolean;
  mode: ProductRadarDataMode;
}
