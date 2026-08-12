import { supabase, isConfigured } from './supabase';
import type { WeeklyIssue, NewsItem, IssueNav, Tweet, TwitterAccount, RadarItem, Opportunity, OpportunityCase, OpportunityScoreHistory } from './types';

export async function getWeeklyIssues(): Promise<WeeklyIssue[]> {
  if (!isConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from('weekly_issues')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (error) { console.error('getWeeklyIssues:', error.message); return []; }
  return data || [];
}

export async function getIssueBySlug(slug: string): Promise<WeeklyIssue | null> {
  if (!isConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('weekly_issues')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) return null;
  return data;
}

export async function getNewsItems(issueId: string): Promise<NewsItem[]> {
  if (!isConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from('news_items')
    .select('*')
    .eq('weekly_issue_id', issueId)
    .order('rank', { ascending: true });

  if (error) { console.error('getNewsItems:', error.message); return []; }
  return data || [];
}

export async function getLatestIssue(): Promise<WeeklyIssue | null> {
  if (!isConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('weekly_issues')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

export async function getIssueNav(slug: string): Promise<IssueNav> {
  const issues = await getWeeklyIssues();
  const currentIndex = issues.findIndex(i => i.slug === slug);
  return {
    current: currentIndex >= 0 ? issues[currentIndex] : null,
    newer: currentIndex > 0 ? issues[currentIndex - 1] : null,
    older: currentIndex < issues.length - 1 ? issues[currentIndex + 1] : null,
  };
}

export function formatDateRange(issue: WeeklyIssue): string {
  const start = new Date(issue.week_start);
  const end = new Date(issue.week_end);
  return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`;
}

export function formatShortLabel(issue: WeeklyIssue): string {
  return `W${issue.week_number} · ${formatDateRange(issue)}`;
}

// ═══ X 推文 ═══

export async function getTweets(options?: { limit?: number; before?: string }): Promise<Tweet[]> {
  if (!isConfigured() || !supabase) return [];
  let q = supabase.from('tweets').select('*').order('published_at', { ascending: false }).limit(options?.limit || 30);
  if (options?.before) q = q.lt('published_at', options.before);
  const { data, error } = await q;
  if (error) { console.error('getTweets:', error.message); return []; }
  return data || [];
}

export async function getTwitterAccounts(): Promise<TwitterAccount[]> {
  if (!isConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from('twitter_accounts')
    .select('*')
    .eq('enabled', true)
    .order('created_at', { ascending: true });
  if (error) { console.error('getTwitterAccounts:', error.message); return []; }
  return data || [];
}

// ═══ Opportunities · 机会情报 ═══

export async function getOpportunities(): Promise<Opportunity[]> {
  if (!isConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('status', 'published')
    .order('score_total', { ascending: false });

  if (error) { console.error('getOpportunities:', error.message); return []; }
  const opps = data || [];
  await fillScoreTrends(opps);
  return opps;
}

/**
 * P3 飞轮：批量拉所有机会的评分轨迹（一次 in 查询，无 N+1），
 * 按 opportunity_id 分组后取首条/最新条计算趋势标（±0.5 阈值，0–10 制）。
 * history 表不存在或查询失败时静默跳过（宁缺毋滥，不渲染趋势标）。
 */
async function fillScoreTrends(opps: Opportunity[]): Promise<void> {
  if (!supabase || opps.length === 0) return;
  const ids = opps.map(o => o.id);
  const { data, error } = await supabase
    .from('opportunity_score_history')
    .select('opportunity_id, score, created_at')
    .in('opportunity_id', ids)
    .order('created_at', { ascending: true });
  if (error || !data) return; // 含 42P01 表未建
  const byOpp = new Map<string, { score: number }[]>();
  for (const h of data) {
    const arr = byOpp.get(h.opportunity_id) || [];
    arr.push(h);
    byOpp.set(h.opportunity_id, arr);
  }
  for (const o of opps) {
    const arr = byOpp.get(o.id);
    if (!arr || arr.length < 2) continue;
    const delta = Number(arr[arr.length - 1].score) - Number(arr[0].score);
    if (delta >= 0.5) o.score_trend = 'up';
    else if (delta <= -0.5) o.score_trend = 'down';
  }
}

/** 详情页评分轨迹：按时间正序拉该机会全部记录；无记录/表未建返回 [] */
export async function getOpportunityScoreHistory(opportunityId: string): Promise<OpportunityScoreHistory[]> {
  if (!isConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from('opportunity_score_history')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true });
  if (error) return []; // 含 42P01 表未建（migration-002 未执行）
  return data || [];
}

export async function getOpportunityBySlug(slug: string): Promise<Opportunity | null> {
  if (!isConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) return null;
  return data;
}

export async function getOpportunityCases(ids: string[]): Promise<OpportunityCase[]> {
  if (!isConfigured() || !supabase || ids.length === 0) return [];
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .in('id', ids);

  if (error) { console.error('getOpportunityCases:', error.message); return []; }
  return data || [];
}

export async function getOpportunitySignals(ids: string[]): Promise<Pick<RadarItem, 'id' | 'title' | 'source_url' | 'source_name'>[]> {
  if (!isConfigured() || !supabase || ids.length === 0) return [];
  const { data, error } = await supabase
    .from('radar_items')
    .select('id, title, source_url, source_name')
    .in('id', ids);

  if (error) { console.error('getOpportunitySignals:', error.message); return []; }
  return data || [];
}

export async function getRadarItems(): Promise<RadarItem[]> {
  if (!isConfigured() || !supabase) return [];
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('radar_items')
    .select('*')
    .eq('status', 'published')
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false });

  if (error) { console.error('getRadarItems:', error.message); return []; }
  return data || [];
}

export async function getRadarRejected(): Promise<RadarItem[]> {
  if (!isConfigured() || !supabase) return [];
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('radar_items')
    .select('*')
    .eq('status', 'rejected')
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false });

  if (error) { console.error('getRadarRejected:', error.message); return []; }
  return data || [];
}
