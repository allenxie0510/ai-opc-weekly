import { requestHasAdminSession } from '@/lib/admin-session';
import { createServerSupabase } from '@/lib/server-supabase';
import { CONTENT_SELECT, parseContentQuery } from '@/lib/admin-content';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export async function GET(request: Request) {
  if (!requestHasAdminSession(request)) return Response.json({ error: '请先登录管理员账号' }, { status: 401, headers });
  const params = parseContentQuery(new URL(request.url).searchParams);
  if (!params) return Response.json({ error: '筛选参数无效' }, { status: 400, headers });
  const db = createServerSupabase(true);
  if (!db) return Response.json({ error: '后台数据服务未配置' }, { status: 503, headers });
  try {
    const { type, page, pageSize, q, pattern } = params;
    const config = CONTENT_SELECT[type];
    let query = db.from(config.table).select(config.columns, { count: 'exact' }).eq('status', 'published');
    if (q) query = query.ilike('title', pattern);
    const { data, count, error } = await query.order('published_at', { ascending: false }).order('id')
      .range((page - 1) * pageSize, page * pageSize - 1).abortSignal(AbortSignal.timeout(8000));
    if (error) throw new Error('已发布内容读取失败，请重试');
    const rows = (data || []) as unknown as { id: string }[];
    const items = new Map<string, unknown[]>();
    if (type === 'weekly' && rows.length) {
      let offset = 0;
      for (;;) {
        const { data: entries, error: itemError } = await db.from('news_items').select('id,title,section,rank,weekly_issue_id')
          .in('weekly_issue_id', rows.map(row => row.id)).order('id').range(offset, offset + 999).abortSignal(AbortSignal.timeout(8000));
        if (itemError) throw new Error('周报条目读取失败，请重试');
        if (!entries?.length) break;
        for (const entry of entries) items.set(entry.weekly_issue_id, [...(items.get(entry.weekly_issue_id) || []), entry]);
        offset += entries.length;
      }
    }
    return Response.json({ rows: rows.map(row => type === 'weekly' ? { ...row, items: items.get(row.id) || [] } : row), total: count || 0, page, pageSize }, { headers });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '读取失败' }, { status: 503, headers }); }
}
