/**
 * /api/explore/sessions/[id] — 读取 / 更新 / 删除单个探索会话
 */
import { getAdminClient, requireUser } from '@/lib/explore-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = getAdminClient()!;

  const { data, error } = await supabase
    .from('explore_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: '会话不存在' }, { status: 404 });
  return Response.json({ session: data });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = getAdminClient()!;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '无效请求体' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (body?.profile != null) patch.profile = body.profile;
  if (body?.weights != null) patch.weights = body.weights;
  if (Array.isArray(body?.opportunities)) patch.opportunities = body.opportunities;
  if (body?.plans != null) patch.plans = body.plans;

  const { data, error } = await supabase
    .from('explore_sessions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', auth.userId)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ session: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = getAdminClient()!;

  const { error } = await supabase
    .from('explore_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
