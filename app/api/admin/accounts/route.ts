/**
 * 管理员 API — 增删 Twitter 账号
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function isAdmin(request: Request): boolean {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && token === expected;
}

// GET — 获取所有账号（需管理员认证）
export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  const { data, error } = await supabase
    .from('twitter_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ accounts: data || [] });
}

// POST — 添加账号 { username: string, display_name?: string }
export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const username = (body.username || '').trim().replace(/^@/, '');
    if (!username) return Response.json({ error: '缺少 username' }, { status: 400 });

    const { error } = await supabase.from('twitter_accounts').upsert({
      username,
      display_name: body.display_name || username,
      avatar_url: `https://unavatar.io/x/${username}`,
      enabled: true,
    }, { onConflict: 'username' });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ status: 'ok', username });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// DELETE — 删除账号（按 username 查询参数）
export async function DELETE(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  if (!username) return Response.json({ error: '缺少 username' }, { status: 400 });

  // 软删除：设 enabled = false
  const { error } = await supabase
    .from('twitter_accounts')
    .update({ enabled: false })
    .eq('username', username);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ status: 'ok', username });
}
