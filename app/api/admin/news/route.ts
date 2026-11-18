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
  const state = new URL(request.url).searchParams.get('state') || 'pending';
  if (!['pending','filtered','published','rejected','merged'].includes(state)) return Response.json({ error: '状态无效' }, { status: 400 });
  const results = await Promise.all([
    db.from('news_sources').select('*'),
    db.from('news_source_runs').select('*').order('checked_at', { ascending: false }).limit(200),
    db.from('news_queue').select('*,news_documents(article,url),news_sources(definition)').eq('state', state).order('created_at', { ascending: false }).limit(100),
    db.from('news_review_log').select('*').order('created_at', { ascending: false }).limit(30),
    db.from('news_processing_log').select('*,news_documents(url)').order('created_at', { ascending: false }).limit(30),
  ]);
  const error = results.find(r => r.error)?.error;
  if (error) return Response.json({ error: `采编数据不可用，请检查迁移：${error.message}` }, { status: 503 });
  return Response.json({ sources: results[0].data, runs: results[1].data, queue: results[2].data, history: results[3].data, processing: results[4].data }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: '未授权' }, { status: 401 });
  const db = createServerSupabase(true);
  if (!db) return Response.json({ error: '缺少数据库服务端配置' }, { status: 503 });
  try {
    const body = await request.json();
    if (!/^[a-f0-9-]{36}$/i.test(body.id || '') || !Number.isInteger(body.version) || !['save','publish','reject','restore','merge','unpublish'].includes(body.action) || typeof body.reason !== 'string' || body.reason.trim().length < 2 || body.reason.length > 1000) return Response.json({ error: '操作参数无效，必须填写审核理由' }, { status: 400 });
    if (body.draft && ['save','publish'].includes(body.action)) {
      const { data, error } = await db.from('news_queue').select('news_documents(article)').eq('id', body.id).single();
      if (error || !data) return Response.json({ error: '找不到原文' }, { status: 404 });
      const relation = data.news_documents as unknown as { article: Parameters<typeof validateDraft>[1] };
      const errors = validateDraft(body.draft, relation.article);
      if (errors.length) return Response.json({ error: errors.join('；') }, { status: 422 });
    }
    const { data, error } = await db.rpc('review_news', { p_id: body.id, p_version: body.version, p_action: body.action, p_draft: body.draft || null, p_reason: body.reason, p_confirmed: body.confirmed === true, p_target: body.target || null });
    if (error) return Response.json({ error: error.message }, { status: 409 });
    if (['publish','unpublish'].includes(body.action)) for (const path of ['/', '/news', '/radar', '/weekly', '/feed.xml']) revalidatePath(path);
    return Response.json(data);
  } catch { return Response.json({ error: '请求格式无效' }, { status: 400 }); }
}
