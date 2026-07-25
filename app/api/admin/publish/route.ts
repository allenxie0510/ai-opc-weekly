/**
 * POST /api/admin/publish — 审核操作（发布 / 丢弃）
 * body: { action: 'publish' | 'discard', type: 'radar' | 'weekly', ids: string[] }
 *   radar  publish → status 改为 published
 *   radar  discard → 删除该 draft 行
 *   weekly publish → weekly_issues.status 改为 published
 *   weekly discard → 删除该期的 news_items 后删除 issue
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) return null;
  return createClient(url, srk);
}

function isAdmin(request: Request): boolean {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && token === expected;
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  const supabase = getAdminClient();
  if (!supabase) {
    return Response.json({ error: '服务端缺少 SUPABASE_SERVICE_ROLE_KEY（请在 Vercel 环境变量中配置）' }, { status: 500 });
  }

  try {
    const { action, type, ids } = await request.json();
    if (!['publish', 'discard'].includes(action)) {
      return Response.json({ error: 'action 必须是 publish 或 discard' }, { status: 400 });
    }
    if (!['radar', 'weekly'].includes(type)) {
      return Response.json({ error: 'type 必须是 radar 或 weekly' }, { status: 400 });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'ids 不能为空' }, { status: 400 });
    }

    let affected = 0;

    if (type === 'radar') {
      if (action === 'publish') {
        const { data, error } = await supabase
          .from('radar_items')
          .update({ status: 'published' })
          .in('id', ids)
          .eq('status', 'draft')  // 只允许草稿被发布，防误操作
          .select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        affected = data?.length || 0;
      } else {
        const { error, count } = await supabase
          .from('radar_items')
          .delete({ count: 'exact' })
          .in('id', ids)
          .in('status', ['draft', 'rejected']);  // 草稿和弃选都可删除，published 受保护
        if (error) return Response.json({ error: error.message }, { status: 500 });
        affected = count || 0;
      }
    } else {
      // weekly
      if (action === 'publish') {
        const { data, error } = await supabase
          .from('weekly_issues')
          .update({ status: 'published' })
          .in('id', ids)
          .eq('status', 'draft')
          .select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        affected = data?.length || 0;
      } else {
        for (const id of ids) {
          // 先删条目再删期数（防外键约束/孤儿数据）
          await supabase.from('news_items').delete().eq('weekly_issue_id', id);
          const { error } = await supabase
            .from('weekly_issues')
            .delete()
            .eq('id', id)
            .eq('status', 'draft');
          if (error) return Response.json({ error: error.message }, { status: 500 });
          affected++;
        }
      }
    }

    return Response.json({ status: 'ok', action, type, affected });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
