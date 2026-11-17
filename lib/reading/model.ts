import type { RadarItem, Tweet } from '../types';
export const LANES = { industry: '行业动态', tools: '工具与能力', business: '经营案例', other: '其他资讯' } as const;
export type ReadingLane = keyof typeof LANES;
export type ReadingItem = { id: string; kind: 'radar' | 'x'; title: string; summary: string; relevance: string; source: string; sourceUrl: string; lane: ReadingLane; publishedAt: string; sourcePublishedAt: string | null; reviewed: boolean; score?: number | null; imageUrl?: string | null };
export const safeHttp = (value: string) => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; } };
export function radarItem(r: RadarItem, metadata?: { lane?: string; sourcePublishedAt?: string | null; imageUrl?: string | null; scores?: number[] }): ReadingItem {
  const labels: Record<string, ReadingLane> = { '看懂行业': 'industry', '改进工作': 'tools', '做好经营': 'business' };
  const lane = metadata?.lane && metadata.lane in LANES ? metadata.lane as ReadingLane : labels[r.pick_reason] || ({ 'design-assets': 'tools', 'automation': 'tools', 'indie-tool': 'tools', 'content-monetize': 'business', 'micro-saas': 'business', 'digital-product': 'business' } as Record<string, ReadingLane>)[r.category || ''] || 'other';
  return { id: `r-${r.id}`, kind: 'radar', title: r.title, summary: r.summary || '', relevance: r.editor_note || '', source: r.source_name || '原始来源', sourceUrl: safeHttp(r.source_url) || '', lane, publishedAt: r.published_at, sourcePublishedAt: metadata?.sourcePublishedAt || null, reviewed: true, score: metadata?.scores?.length === 3 && metadata.scores.every(n=>Number.isFinite(n)&&n>=0&&n<=5) ? Math.round(metadata.scores.reduce((a,b)=>a+b,0)/15*100) : (Number.isFinite(r.score)&&r.score>0&&r.score<=100?r.score:null), imageUrl: safeHttp(r.image_url || metadata?.imageUrl || '') };
}
export function tweetItem(t: Tweet): ReadingItem {
  return { id: `x-${t.tweet_id}`, kind: 'x', title: `${t.author_display_name || t.author_username} 的动态`, summary: t.content, relevance: '来源动态，尚未进入本站精选。作者自述不等于独立核验结果。', source: `X · @${t.author_username}`, sourceUrl: safeHttp(t.url) || '', lane: 'other', publishedAt: t.published_at, sourcePublishedAt: t.published_at, reviewed: false, imageUrl: safeHttp(t.media_urls?.[0] || '') };
}
export function mergeReading(items: ReadingItem[]) {
  const seen = new Set<string>();
  // Reviewed coverage takes precedence over unreviewed duplicate source URLs.
  return [...items].sort((a,b) => Number(b.reviewed)-Number(a.reviewed) || b.publishedAt.localeCompare(a.publishedAt)).filter(i => {
    const url = i.sourceUrl ? new URL(i.sourceUrl) : null;
    if (url) { url.hash = ''; for (const name of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(name)) url.searchParams.delete(name); url.searchParams.sort(); }
    const key = url ? url.href.replace(/\/$/, '') : i.id;
    if (seen.has(key)) return false; seen.add(key); return true;
  }).sort((a,b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}
export function filterReading(items: ReadingItem[], options: { lane?: string; source?: string; view?: string }) {
  return items.filter(i => (options.view === 'all' || i.reviewed) && (!options.lane || options.lane === 'all' || i.lane === options.lane) && (!options.source || options.source === 'all' || (options.source === 'x' ? i.kind === 'x' : i.source === options.source)));
}
export function chinaDate(value: string) { return new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }); }
export function weekStart(value = new Date().toISOString()) {
  const day = new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0,10);
  const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0,10);
}
export const validWeek = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v && new Date(v+'T00:00:00Z').getUTCDay()===1;
export function sharePath(kind: 'news'|'briefs', id: string, channel='share') { return `/${kind}/${encodeURIComponent(id)}?from=${channel === 'wechat' ? 'wechat' : 'share'}`; }
export type Brief = { id: string; slug: string; title: string; summary: string; item_ids: string[]; status: 'draft'|'published'; version: number; published_at: string | null };
