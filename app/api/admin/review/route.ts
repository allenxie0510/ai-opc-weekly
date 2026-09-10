import { createServerSupabase } from '@/lib/server-supabase';
import { isAdminPassword, requestHasAdminSession } from '@/lib/admin-session';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

// Pending means still awaiting review, regardless of date. Page through every row.
async function readAll(read: (offset: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>) {
  const rows: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await read(rows.length);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
    if (rows.length > 20000) throw new Error('待办数据超过安全读取上限，请联系管理员分批整理；未展示截断数据');
  }
}
export async function GET(request: Request) {
  if (!isAdminPassword(request.headers.get('x-admin-token')) && !requestHasAdminSession(request)) return Response.json({ error: '未授权' }, { status: 401, headers });
  const db = createServerSupabase(true);
  if (!db) return Response.json({ error: '后台数据服务未配置' }, { status: 503, headers });
  try {
    const [radarDrafts, weeklyRows, opportunityDrafts, radarRejected] = await Promise.all([
      readAll(offset => db.from('radar_items').select(process.env.EDITORIAL_RESEARCH_ENABLED === 'true' ? 'id,title,summary,source_name,source_url,score,category,pick_reason,editor_note,published_at,editorial_brief' : 'id,title,summary,source_name,source_url,score,category,pick_reason,editor_note,published_at')
        .eq('status','draft').order('published_at', {ascending:false}).order('id').range(offset,offset+999).abortSignal(AbortSignal.timeout(8000)).overrideTypes<Record<string, unknown>[], { merge: false }>()),
      readAll(offset => db.from('weekly_issues').select('id,slug,issue_number,title,summary,published_at,week_start,week_end')
        .eq('status','draft').order('published_at', {ascending:false}).order('id').range(offset,offset+999).abortSignal(AbortSignal.timeout(8000))),
      readAll(offset => db.from('opportunities').select('id,slug,title,thesis,category,score_total,evidence_grade,recommendation,editor_conviction,editor_take,evidence,cover_url,created_at')
        .eq('status','draft').order('created_at', {ascending:false}).order('id').range(offset,offset+999).abortSignal(AbortSignal.timeout(8000))),
      readAll(offset => db.from('radar_items').select('id,title,source_name,source_url,reject_reason,published_at')
        .eq('status','rejected').gte('published_at',new Date(Date.now()-7*86400000).toISOString()).order('published_at', {ascending:false}).order('id').range(offset,offset+999).abortSignal(AbortSignal.timeout(8000))),
    ]);
    const weeklyDrafts = [];
    for (const issue of weeklyRows) {
      const items = await readAll(offset => db.from('news_items').select(process.env.EDITORIAL_RESEARCH_ENABLED === 'true' ? 'id, title, section, rank, editorial_brief' : 'id, title, section, rank').eq('weekly_issue_id',issue.id)
        .order('rank').order('id').range(offset,offset+999).abortSignal(AbortSignal.timeout(8000)).overrideTypes<Record<string, unknown>[], { merge: false }>());
      weeklyDrafts.push({...issue,items});
    }
    return Response.json({radarDrafts,weeklyDrafts,opportunityDrafts,radarRejected}, {headers});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : '待办读取失败'}, {status:503,headers});
  }
}
