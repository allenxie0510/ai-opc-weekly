export const CONTENT_TYPES = ['opportunity', 'radar', 'weekly'] as const;
export type ContentType = typeof CONTENT_TYPES[number];
export const CONTENT_LABELS: Record<ContentType, string> = { opportunity: '机会', radar: '每日信号', weekly: '周报' };
export type PublishedContentRow = {
  id: string; title: string; slug?: string; summary?: string; thesis?: string;
  published_at?: string; source_name?: string; source_url?: string;
  score?: number; score_total?: number; category?: string; pick_reason?: string; editor_note?: string;
  editor_take?: string; recommendation?: string; editor_conviction?: string; featured?: boolean; cover_url?: string;
  items?: { id: string; title: string; section: string; rank: number }[];
};
export const CONTENT_SELECT = {
  radar: { table: 'radar_items', columns: 'id,title,summary,source_name,source_url,score,category,pick_reason,editor_note,published_at' },
  weekly: { table: 'weekly_issues', columns: 'id,slug,title,summary,published_at,issue_number' },
  opportunity: { table: 'opportunities', columns: 'id,slug,title,thesis,category,score_total,recommendation,editor_conviction,editor_take,featured,cover_url,published_at' },
};
export function parseContentQuery(params: URLSearchParams) {
  const type = params.get('type') || 'opportunity';
  const page = Number(params.get('page') || '1');
  const q = (params.get('q') || '').trim();
  if (!CONTENT_TYPES.includes(type as ContentType) || !Number.isInteger(page) || page < 1 || page > 10000 || q.length > 100) return null;
  return { type: type as ContentType, page, q, pageSize: 20, pattern: '%' + q.replace(/[\\%_]/g, '\\$&') + '%' };
}
