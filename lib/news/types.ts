export type Lane = 'industry' | 'tools' | 'business';
export type SourceKind = 'rss' | 'index' | 'page';
export type Tier = 'official' | 'reporting' | 'practitioner' | 'discovery';
export interface Source {
  id: string; name: string; url: string; kind: SourceKind; tier: Tier; lane: Lane;
  language: 'en' | 'zh'; enabled: boolean; cadenceHours: number;
  linkPattern?: string; allowedHosts: string[]; note: string;
}
export interface Article {
  sourceId: string; url: string; title: string; publishedAt: string | null;
  snippet: string; body: string; bodyHash: string; fetchedAt: string;
  state: 'ready' | 'blocked'; issues: string[];
}
export interface Claim { text: string; quote: string; kind: 'fact' | 'attributed'; }
export interface Draft {
  title: string; summary: string; relevance: string; lane: Lane;
  importance: number; usefulness: number; evidence: number;
  eventKey: string; eventDate: string | null; claims: Claim[];
  sensitive: boolean;
}
export interface SourceRun {
  sourceId: string; checkedAt: string; state: 'healthy' | 'partial' | 'empty' | 'error';
  discovered: number; readable: number; durationMs: number; error: string | null;
  sampleUrls: string[]; latestPublishedAt: string | null;
}
export const LANE_LABELS: Record<Lane, string> = { industry: '看懂行业', tools: '改进工作', business: '做好经营' };
