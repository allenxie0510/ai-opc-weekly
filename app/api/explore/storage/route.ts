/**
 * /api/explore/storage — 方向探测器匿名状态存储
 * GET  ?user_id=xxx  读取
 * POST { user_id, state }  写入（upsert）
 * 无账号系统：user_id 为客户端生成的匿名标识，服务端用 SERVICE_ROLE 读写
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) return null;
  return createClient(url, srk);
}

const MAX_BYTES = 2_000_000; // 2MB，防灌爆

export async function GET(request: Request) {
  const supabase = getClient();
  if (!supabase) {
    return Response.json({ error: '服务端未配置 Supabase（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）' }, { status: 503 });
  }
  const user_id = new URL(request.url).searchParams.get('user_id');
  if (!user_id) return Response.json({ error: '缺少 user_id' }, { status: 400 });

  const { data, error } = await supabase
    .from('explore_state')
    .select('state')
    .eq('user_id', user_id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ state: data?.state ?? null });
}

export async function POST(request: Request) {
  const supabase = getClient();
  if (!supabase) {
    return Response.json({ error: '服务端未配置 Supabase（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）' }, { status: 503 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '无效请求体' }, { status: 400 });
  }

  const user_id = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  if (!user_id) return Response.json({ error: '缺少 user_id' }, { status: 400 });

  const state = body?.state ?? null;
  if (JSON.stringify(state || {}).length > MAX_BYTES) {
    return Response.json({ error: '数据过大' }, { status: 413 });
  }

  const { error } = await supabase
    .from('explore_state')
    .upsert({ user_id, state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
