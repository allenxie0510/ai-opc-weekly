import { isAdminPassword, requestHasAdminSession } from '@/lib/admin-session';
import { createServerSupabase } from '@/lib/server-supabase';
import { validateDraft } from '@/lib/news/policy';
import { revalidatePath } from 'next/cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function authorized(request: Request) {
  return isAdminPassword(request.headers.get('x-admin-token')) || requestHasAdminSession(request);
}
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: '未授权' }, { status: 401 });
  const db = createServerSupabase(true);
  if (!db) return Response.json({ error: '缺少数据库服务端配置' }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const state = params.get('state') || 'published';
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
  const pageSize = 25;
  const query = (params.get('q') || '').trim().slice(0, 100);
  if (!['pending','filtered','published','rejected','merged'].includes(state)) return Response.json({ error: '状态无效' }, { status: 400 });
  let queueQuery = db.from('news_queue')
    .select('*,news_documents(article,url),news_sources(definition)', { count: 'exact' })
    .eq('state', state).order('created_at', { ascending: false }).order('id', { ascending: false });
  if (query) queueQuery = queueQuery.ilike('draft->>title', `%${query.replace(/[\\%_]/g, '\\$&')}%`);
  const results = await Promise.all([
    db.from('news_sources').select('*'),
    db.from('news_source_runs').select('*').order('checked_at', { ascending: false }).limit(200),
    queueQuery.range((page - 1) * pageSize, page * pageSize - 1),
    db.from('news_review_log').select('*').order('created_at', { ascending: false }).limit(30),
    db.from('news_processing_log').select('*,news_documents(url)').order('created_at', { ascending: false }).limit(30),
  ]);
  const error = results.find(r => r.error)?.error;
  if (error) return Response.json({ error: `采编数据不可用，请检查迁移：${error.message}` }, { status: 503 });
  return Response.json({ sources: results[0].data, runs: results[1].data, queue: results[2].data, total: results[2].count || 0, page, pageSize, query, history: results[3].data, processing: results[4].data }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: '未授权' }, { status: 401 });
  const db = createServerSupabase(true);
  if (!db) return Response.json({ error: '缺少数据库服务端配置' }, { status: 503 });
  try {
    const body = await request.json();
    if (!/^[a-f0-9-]{36}$/i.test(body.id || '') || !Number.isInteger(body.version) || !['update','delete'].includes(body.action)) return Response.json({ error: '操作参数无效' }, { status: 400 });
    if (body.action === 'update') {
      const { data, error } = await db.from('news_queue').select('news_documents(article)').eq('id', body.id).single();
      if (error || !data) return Response.json({ error: '找不到原文' }, { status: 404 });
      const relation = data.news_documents as unknown as { article: Parameters<typeof validateDraft>[1] };
      const errors = validateDraft(body.draft, relation.article);
      if (errors.length) return Response.json({ error: errors.join('；') }, { status: 422 });
    }
    const changes = body.action === 'delete'
      ? { state:'rejected', reasons:['管理员删除资讯：禁止自动重新推荐'], version:body.version+1, updated_at:new Date().toISOString() }
      : { draft:body.draft, version:body.version+1, updated_at:new Date().toISOString() };
    let mutation = db.from('news_queue').update(changes).eq('id',body.id).eq('version',body.version);
    if(body.action==='update') mutation=mutation.eq('state','published');
    const { data, error } = await mutation.select('id,version').maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 409 });
    if (!data) return Response.json({error:'内容已被更新或删除，请刷新后再操作'},{status:409});
    for (const path of ['/', '/news', '/radar', '/weekly', '/feed.xml']) revalidatePath(path);
    return Response.json(data);
  } catch { return Response.json({ error: '请求格式无效' }, { status: 400 }); }
}
