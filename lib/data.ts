import { supabase, isConfigured } from './supabase';
import type { WeeklyIssue, NewsItem, IssueNav } from './types';

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
