/**
 * /api/explore/storage — 方向探测器用户状态存储（兼容旧数据结构）
 * GET  读取当前登录用户状态
 * POST { state } 写入当前登录用户状态（upsert）
 */
import { getAdminClient, requireUser } from '@/lib/explore-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2_000_000; // 2MB，防灌爆

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = getAdminClient()!;

  const { data, error } = await supabase
    .from('explore_state')
    .select('state')
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ state: data?.state ?? null });
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

  const state = body?.state ?? null;
  if (JSON.stringify(state || {}).length > MAX_BYTES) {
    return Response.json({ error: '数据过大' }, { status: 413 });
  }

  const { error } = await supabase
    .from('explore_state')
    .upsert({ user_id: auth.userId, state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
