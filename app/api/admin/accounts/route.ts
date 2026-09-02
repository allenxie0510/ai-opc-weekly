/**
 * 管理员 API — 增删 Twitter 账号
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 */
import { createServerSupabase } from '@/lib/server-supabase';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function isAdmin(request: Request): boolean {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && token === expected;
}

function getAdminSupabase(): SupabaseClient | null {
  // 删除属于后台管理操作，优先使用 service role；保留 anon 回退以兼容
  // 尚未补齐 service role 环境变量的旧部署。
  return createServerSupabase(true) || createServerSupabase();
}

// GET — 获取所有账号（需管理员认证）
export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  const supabase = getAdminSupabase();
  if (!supabase) return Response.json({ error: '服务端未配置 Supabase' }, { status: 503 });
  const { data, error } = await supabase
    .from('twitter_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ accounts: data || [] });
}

// POST — 添加账号 { username: string, display_name?: string, rss_url?: string }
export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  const supabase = getAdminSupabase();
  if (!supabase) return Response.json({ error: '服务端未配置 Supabase' }, { status: 503 });

  try {
    const body = await request.json();
    const username = (body.username || '').trim().replace(/^@/, '');
    if (!username) return Response.json({ error: '缺少 username' }, { status: 400 });
    if (/\s/.test(username)) {
      return Response.json({ error: '用户名不能包含空格，请使用真实 Twitter handle' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('twitter_accounts')
      .upsert({
        username,
        display_name: body.display_name || username,
        avatar_url: `https://unavatar.io/x/${username}`,
        rss_url: body.rss_url || null,
        enabled: true,
      }, { onConflict: 'username' })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ status: 'ok', account: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// DELETE — 硬删除账号及其所有推文
export async function DELETE(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  const supabase = getAdminSupabase();
  if (!supabase) return Response.json({ error: '服务端未配置 Supabase' }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username')?.trim().replace(/^@/, '');
  if (!username) return Response.json({ error: '缺少 username' }, { status: 400 });

  // 新数据库通过 RPC 在一个事务中完成删除；数据库触发器同时保证：
  // 1) 直接在 Supabase 删除账号也会级联；2) 已在运行的抓取任务不能回写孤儿推文。
  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    'delete_twitter_account_with_tweets',
    { target_username: username },
  );

  if (!rpcError) {
    const row = Array.isArray(rpcRows) ? rpcRows[0] : null;
    if (!row) return Response.json({ error: `未找到 @${username}` }, { status: 404 });
    revalidatePath('/x');
    return Response.json({
      status: 'ok',
      username: row.deleted_username || username,
      deleted_tweets: Number(row.deleted_tweets || 0),
      account_deleted: Boolean(row.account_deleted),
    });
  }

  // 迁移尚未执行的部署仍要正确工作。只在 RPC 不存在时进入兼容路径，
  // 其他数据库错误直接暴露，避免误报删除成功。
  const rpcMissing = rpcError.code === 'PGRST202'
    || /could not find[^\n]*delete_twitter_account_with_tweets|schema cache/i.test(rpcError.message || '');
  if (!rpcMissing) return Response.json({ error: rpcError.message }, { status: 500 });

  const requestedLower = username.toLowerCase();
  const { data: accountRows, error: accountFindError } = await supabase
    .from('twitter_accounts')
    .select('id, username');
  if (accountFindError) return Response.json({ error: accountFindError.message }, { status: 500 });
  const account = accountRows?.find((row) => row.username.toLowerCase() === requestedLower);

  // 兼容历史大小写不一致的数据。分页读取 ID 后按本地 lowercase 精确匹配，
  // 不使用 ilike，避免 X 用户名中的下划线被 SQL 当作通配符而误删他人数据。
  const tweetIds: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: rows, error: findError } = await supabase
      .from('tweets')
      .select('id, author_username')
      .range(from, from + pageSize - 1);
    if (findError) return Response.json({ error: findError.message }, { status: 500 });
    for (const row of rows || []) {
      if (row.author_username.toLowerCase() === requestedLower) tweetIds.push(row.id);
    }
    if (!rows || rows.length < pageSize) break;
  }

  let deletedTweets = 0;
  for (let i = 0; i < tweetIds.length; i += 500) {
    const { count, error: tweetError } = await supabase
      .from('tweets')
      .delete({ count: 'exact' })
      .in('id', tweetIds.slice(i, i + 500));
    if (tweetError) return Response.json({ error: tweetError.message }, { status: 500 });
    deletedTweets += count || 0;
  }

  if (account) {
    const { error: accountError } = await supabase
      .from('twitter_accounts')
      .delete()
      .eq('id', account.id);
    if (accountError) return Response.json({ error: accountError.message }, { status: 500 });
  }

  if (!account && deletedTweets === 0) {
    return Response.json({ error: `未找到 @${username}` }, { status: 404 });
  }

  revalidatePath('/x');
  return Response.json({
    status: 'ok',
    username: account?.username || username,
    deleted_tweets: deletedTweets,
    account_deleted: Boolean(account),
    migration_pending: true,
  });
}
