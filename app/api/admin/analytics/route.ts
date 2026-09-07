import { requestHasAdminSession } from '@/lib/admin-session';
import { createServerSupabase } from '@/lib/server-supabase';
import { analyticsStart, buildAnalytics, type AnalyticsEvent } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export async function GET(request: Request) {
  if (!requestHasAdminSession(request)) return Response.json({ error: '请先登录管理员账号' }, { status: 401, headers });
  const db = createServerSupabase(true);
  if (!db) return Response.json({ error: '统计服务尚未配置', configured: false }, { status: 503, headers });
  const now = Date.now();
  try {
    const { data: setting, error: settingError } = await db.from('analytics_settings').select('started_at').eq('id', true).abortSignal(AbortSignal.timeout(4000)).single();
    if (settingError || !setting) return Response.json({ error: '请先执行管理员统计数据库迁移，现有数据不会被删除。', configured: false }, { status: 503, headers });
    const events: AnalyticsEvent[] = [];
    // Keyset pagination and fixed cutoff; never silently truncate the 1000-row default.
    let cursor = 0;
    for (;;) {
      const { data, error } = await db.from('analytics_events').select('id,kind,visitor_id,user_id,object_id,occurred_at')
        .gte('occurred_at', analyticsStart(30, now)).lte('occurred_at', new Date(now).toISOString())
        .gt('id', cursor).order('id').limit(1000).abortSignal(AbortSignal.timeout(4000));
      if (error) throw new Error('统计数据读取失败，请重试');
      if (!data?.length) break;
      events.push(...data as AnalyticsEvent[]);
      cursor = data[data.length - 1].id;
      if (events.length > 50000) throw new Error('数据量已超过当前统计上限，需要升级数据库聚合；未展示截断数据');
    }
    const { data: total, error: totalError } = await db.from('page_views').select('count').eq('key', 'total').abortSignal(AbortSignal.timeout(4000)).maybeSingle();
    return Response.json({ ...buildAnalytics(events, setting.started_at, now), legacyTotal: totalError ? null : total?.count ?? null, paymentsEnabled: false }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '统计暂时不可用' }, { status: 503, headers });
  }
}
