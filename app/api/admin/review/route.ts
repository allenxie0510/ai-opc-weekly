/**
 * GET /api/admin/review — 拉取待审核内容
 * 返回：雷达 draft 快讯 + 周报 draft 期数（含条目标题列表）
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 * 注意：使用 SERVICE_ROLE_KEY（radar_items 开了 RLS，anon 只能读不能写）
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  const supabase = getAdminClient();
  if (!supabase) {
    return Response.json({ error: '服务端缺少 SUPABASE_SERVICE_ROLE_KEY（请在 Vercel 环境变量中配置）' }, { status: 500 });
  }

  // 雷达草稿（最近 30 天）
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: radarDrafts, error: rErr } = await supabase
    .from('radar_items')
    .select('id, title, summary, source_name, source_url, score, category, pick_reason, editor_note, published_at')
    .eq('status', 'draft')
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false });
  if (rErr) return Response.json({ error: rErr.message }, { status: 500 });

  // 周报草稿
  const { data: weeklyDrafts, error: wErr } = await supabase
    .from('weekly_issues')
    .select('id, slug, issue_number, title, summary, week_start, week_end')
    .eq('status', 'draft')
    .order('published_at', { ascending: false });
  if (wErr) return Response.json({ error: wErr.message }, { status: 500 });

  // 每期草稿的条目标题
  const weekly = [];
  for (const iss of weeklyDrafts || []) {
    const { data: items } = await supabase
      .from('news_items')
      .select('title, section, rank')
      .eq('weekly_issue_id', iss.id)
      .order('rank', { ascending: true });
    weekly.push({ ...iss, items: items || [] });
  }

  // 弃选记录（最近 7 天，供清理）
  const rejCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: radarRejected, error: jErr } = await supabase
    .from('radar_items')
    .select('id, title, source_name, source_url, reject_reason, published_at')
    .eq('status', 'rejected')
    .gte('published_at', rejCutoff)
    .order('published_at', { ascending: false });
  if (jErr) return Response.json({ error: jErr.message }, { status: 500 });

  // 已发布雷达（最近 7 天，供在线编辑/下架）
  const { data: radarPublished, error: pErr } = await supabase
    .from('radar_items')
    .select('id, title, summary, source_name, source_url, score, category, pick_reason, editor_note, published_at')
    .eq('status', 'published')
    .gte('published_at', rejCutoff)
    .order('published_at', { ascending: false })
    .limit(50);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  // 已发布周报（最近 4 期，供在线编辑/下架）
  const { data: weeklyPublishedRows, error: wpErr } = await supabase
    .from('weekly_issues')
    .select('id, slug, issue_number, title, summary, week_start, week_end')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(4);
  if (wpErr) return Response.json({ error: wpErr.message }, { status: 500 });

  return Response.json({
    radarDrafts: radarDrafts || [],
    weeklyDrafts: weekly,
    radarRejected: radarRejected || [],
    radarPublished: radarPublished || [],
    weeklyPublished: weeklyPublishedRows || [],
  });
}
