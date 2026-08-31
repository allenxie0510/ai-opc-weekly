/**
 * POST /api/admin/publish — 审核操作（发布 / 丢弃）
 * body: { action: 'publish' | 'discard', type: 'radar' | 'weekly' | 'news_item', ids: string[] }
 *   radar  publish → status 改为 published
 *   radar  discard → 删除该 draft 行
 *   weekly publish → weekly_issues.status 改为 published
 *   weekly discard → 删除该期的 news_items 后删除 issue
 *   news_item discard → 只删除指定周报条目，保留整期并重排剩余条目
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 */
import { createClient } from '@supabase/supabase-js';
import { buildWeeklyRankUpdates, updateGeneratedWeeklySummaryCount } from '@/lib/weekly-admin';

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
    if (!['publish', 'discard', 'unpublish', 'feature', 'unfeature'].includes(action)) {
      return Response.json({ error: 'action 必须是 publish / discard / unpublish / feature / unfeature' }, { status: 400 });
    }
    if (!['radar', 'weekly', 'news_item', 'opportunity'].includes(type)) {
      return Response.json({ error: 'type 必须是 radar / weekly / news_item / opportunity' }, { status: 400 });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'ids 不能为空' }, { status: 400 });
    }

    let affected = 0;

    if (type === 'news_item') {
      if (action !== 'discard') {
        return Response.json({ error: 'news_item 只支持 discard' }, { status: 400 });
      }

      // 先锁定条目所属期数；管理员可修正草稿或已发布周报，发布态删除后由前端触发缓存刷新。
      const { data: selectedItems, error: selectedErr } = await supabase
        .from('news_items')
        .select('id, weekly_issue_id')
        .in('id', ids);
      if (selectedErr) return Response.json({ error: selectedErr.message }, { status: 500 });
      if (!selectedItems?.length) {
        return Response.json({ error: '未找到要删除的周报条目' }, { status: 404 });
      }

      const { error, count } = await supabase
        .from('news_items')
        .delete({ count: 'exact' })
        .in('id', selectedItems.map((item) => item.id));
      if (error) return Response.json({ error: error.message }, { status: 500 });
      affected = count || 0;

      // 删除后重排各期 rank，并同步标准生成摘要里的条目数。
      const issueIds = [...new Set(selectedItems.map((item) => item.weekly_issue_id))];
      for (const issueId of issueIds) {
        const { data: remaining, error: remainingErr } = await supabase
          .from('news_items')
          .select('id, rank')
          .eq('weekly_issue_id', issueId)
          .order('rank', { ascending: true });
        if (remainingErr) return Response.json({ error: remainingErr.message }, { status: 500 });

        for (const update of buildWeeklyRankUpdates(remaining || [])) {
          const { error: rankErr } = await supabase
            .from('news_items')
            .update({ rank: update.rank })
            .eq('id', update.id);
          if (rankErr) return Response.json({ error: rankErr.message }, { status: 500 });
        }

        const { data: issue, error: issueErr } = await supabase
          .from('weekly_issues')
          .select('summary')
          .eq('id', issueId)
          .single();
        if (issueErr) return Response.json({ error: issueErr.message }, { status: 500 });
        const summary = updateGeneratedWeeklySummaryCount(issue.summary, remaining?.length || 0);
        if (summary !== issue.summary) {
          const { error: summaryErr } = await supabase
            .from('weekly_issues')
            .update({ summary })
            .eq('id', issueId);
          if (summaryErr) return Response.json({ error: summaryErr.message }, { status: 500 });
        }
      }
    } else if (type === 'radar') {
      if (action === 'publish') {
        const { data, error } = await supabase
          .from('radar_items')
          .update({ status: 'published' })
          .in('id', ids)
          .eq('status', 'draft')  // 只允许草稿被发布，防误操作
          .select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        affected = data?.length || 0;
      } else if (action === 'unpublish') {
        const { data, error } = await supabase
          .from('radar_items')
          .update({ status: 'draft' })  // 下架退回草稿箱，可编辑后重新发布
          .in('id', ids)
          .eq('status', 'published')
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
    } else if (type === 'opportunity') {
      if (action === 'feature') {
        // 先清除其它推荐，再设本条为唯一推荐（部分唯一索引保证至多一条 featured）
        await supabase.from('opportunities').update({ featured: false }).eq('featured', true);
        const { data, error } = await supabase
          .from('opportunities')
          .update({ featured: true })
          .in('id', ids)
          .eq('status', 'published')
          .select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        affected = data?.length || 0;
      } else if (action === 'unfeature') {
        const { data, error } = await supabase
          .from('opportunities')
          .update({ featured: false })
          .in('id', ids)
          .select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        affected = data?.length || 0;
      } else if (action === 'publish') {
        const { data, error } = await supabase
          .from('opportunities')
          .update({ status: 'published', published_at: new Date().toISOString() })
          .in('id', ids)
          .eq('status', 'draft')
          .select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        affected = data?.length || 0;
      } else if (action === 'unpublish') {
        const { data, error } = await supabase
          .from('opportunities')
          .update({ status: 'draft', featured: false })  // 下架同时取消推荐位
          .in('id', ids)
          .eq('status', 'published')
          .select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        affected = data?.length || 0;
      } else {
        // 删除：draft 或 published 均可（管理员已二次确认）
        const { error, count } = await supabase
          .from('opportunities')
          .delete({ count: 'exact' })
          .in('id', ids);
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
      } else if (action === 'unpublish') {
        const { data, error } = await supabase
          .from('weekly_issues')
          .update({ status: 'draft' })
          .in('id', ids)
          .eq('status', 'published')
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
