/**
 * GET /api/views — 获取总访问量
 * POST /api/views — 记录一次访问（按 uid/session 去重）
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 确保计数器表存在
async function ensureTable() {
  try {
    await supabase.from('page_views').select('count').limit(1);
  } catch {
    // 表不存在时忽略
  }
}

export async function GET() {
  await ensureTable();
  const { data, error } = await supabase
    .from('page_views')
    .select('count')
    .eq('key', 'total')
    .single();

  const count = error ? 0 : (data?.count || 0);
  return Response.json({ count });
}

export async function POST(req: Request) {
  const { uid } = await req.json().catch(() => ({}));
  if (!uid) return Response.json({ error: 'missing uid' }, { status: 400 });

  await ensureTable();

  // 今天这个 uid 来过吗？
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from('page_views_log')
    .select('id')
    .eq('uid', uid)
    .eq('date', today)
    .limit(1);

  if (!existing?.length) {
    // 新访客 → 写日志 + 加计数器
    try {
      await supabase.from('page_views_log').insert({ uid, date: today, created_at: new Date().toISOString() });
    } catch { /* 表可能不存在 */ }

    // 更新总计数
    await supabase.rpc('increment_view_count').catch(async () => {
      // fallback: 直接 upsert
      const { data: row } = await supabase.from('page_views').select('count').eq('key', 'total').single();
      const current = row?.count || 0;
      await supabase.from('page_views').upsert({ key: 'total', count: current + 1 }, { onConflict: 'key' });
    });
  }

  const { data } = await supabase.from('page_views').select('count').eq('key', 'total').single();
  return Response.json({ count: data?.count || 0 });
}
