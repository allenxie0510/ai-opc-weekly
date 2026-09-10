import { createServerSupabase } from '@/lib/server-supabase';
import { isAdminPassword } from '@/lib/admin-session';
import { validateResearchIntake } from '@/lib/research-intake.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, X-Admin-Token' };
function context(request: Request) {
  if (!isAdminPassword(request.headers.get('x-admin-token'))) return Response.json({ error: '未授权' }, { status: 401, headers });
  if (process.env.EDITORIAL_RESEARCH_ENABLED !== 'true') return Response.json({ error: '请先执行 20260910_editorial_research.sql，再设置 EDITORIAL_RESEARCH_ENABLED=true' }, { status: 503, headers });
  const db = createServerSupabase(true);
  return db || Response.json({ error: '后台数据服务未配置' }, { status: 503, headers });
}
export async function GET(request: Request) {
  const db = context(request);
  if (db instanceof Response) return db;
  const { data, error } = await db.from('editorial_research').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return Response.json({ error: '案例队列读取失败，请检查迁移是否执行' }, { status: 503, headers });
  return Response.json({ items: data, limit: 200 }, { headers });
}
export async function POST(request: Request) {
  const db = context(request);
  if (db instanceof Response) return db;
  try {
    const body = await request.json();
    const record = validateResearchIntake(body);
    if (body.id && !/^[0-9a-f-]{36}$/i.test(body.id)) return Response.json({ error: '案例ID无效' }, { status: 400, headers });
    const query = body.id
      ? db.from('editorial_research').update(record).eq('id', body.id).neq('status', 'drafted').select('id')
      : db.from('editorial_research').insert(record).select('id');
    const { data, error } = await query;
    if (error) return Response.json({ error: '保存失败，请检查数据库迁移与字段约束' }, { status: 503, headers });
    if (!data?.length) return Response.json({ error: '记录不存在或已写入周报草稿；如需纠错请到周报审核' }, { status: 409, headers });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '输入格式无效' }, { status: 400, headers });
  }
}
