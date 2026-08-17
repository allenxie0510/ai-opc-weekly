/**
 * /api/explore/sessions — 方向探测器「探索会话」
 * GET  列出当前登录用户的全部会话
 * POST 新建会话（title / profile / weights / opportunities / plans）
 * 认证：Authorization: Bearer <supabase access_token>
 */
import { getAdminClient, requireUser } from '@/lib/explore-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = getAdminClient()!;

  const { data, error } = await supabase
    .from('explore_sessions')
    .select('*')
    .eq('user_id', auth.userId)
    .order('updated_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sessions: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = getAdminClient()!;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '无效请求体' }, { status: 400 });
  }

  const row = {
    user_id: auth.userId,
    title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : '未命名探索',
    profile: body?.profile ?? {},
    weights: body?.weights ?? {},
    opportunities: Array.isArray(body?.opportunities) ? body.opportunities : [],
    plans: body?.plans ?? {},
  };

  const { data, error } = await supabase.from('explore_sessions').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ session: data });
}
