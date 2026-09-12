import { isAdminPassword, requestHasAdminSession } from '@/lib/admin-session';
import { createServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const pipelines = [
  { key: 'daily-radar', label: '每日信号', table: 'radar_items', schedule: '每天早晚各一次；调度可能延迟', empty: '本轮未新增草稿。可能无合格新素材或达到审核额度；不代表推送成功。' },
  { key: 'weekly-opportunities', label: '机会', table: 'opportunities', schedule: '每周三；也可手动生成', empty: '本轮未新增机会。至少需 3 条不同的已发布信号，并通过主题去重和原文证据校验。' },
  { key: 'weekly-newsletter', label: '周报', table: 'weekly_issues', schedule: '每周一；已有发布版本不重复生成', empty: '本轮未新增整期草稿。已有周报可能仅补充条目；本周已发布则跳过，证据不足不凑数。' },
];
type Run = { id: number; status: string; conclusion: string | null; created_at: string; run_started_at: string; updated_at: string };
export async function GET(request: Request) {
  if (!isAdminPassword(request.headers.get('x-admin-token')) && !requestHasAdminSession(request)) return Response.json({ error: '未授权' }, { status: 401, headers });
  const db = createServerSupabase(true);
  if (!db) return Response.json({ error: '后台数据服务未配置' }, { status: 503, headers });
  const pat = process.env.GITHUB_PAT;
  try {
    const rows = await Promise.all(pipelines.map(async pipeline => {
      const { count: pending, error } = await db.from(pipeline.table).select('id', { count: 'exact', head: true }).eq('status', 'draft').abortSignal(AbortSignal.timeout(8000));
      if (error) throw new Error('待审数量读取失败');
      const base = { key: pipeline.key, label: pipeline.label, schedule: pipeline.schedule, pending };
      if (!pat) return { ...base, state: 'unavailable', message: '执行状态不可读取：未配置任务访问凭证；待审核内容仍可正常查看。' };
      try {
        const response = await fetch(`https://api.github.com/repos/allenxie0510/ai-opc-weekly/actions/workflows/${pipeline.key}.yml/runs?branch=main&per_page=5`, {
          headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json', 'User-Agent': 'aiopc-admin' },
          cache: 'no-store', signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('任务状态服务暂不可用');
        const runs: Run[] = (await response.json()).workflow_runs || [];
        // A cancelled duplicate must not hide the scheduled run doing the work.
        const run = runs.find(row => row.status !== 'completed')
          || runs.find(row => row.conclusion !== 'cancelled') || runs[0];
        if (!run) return { ...base, state: 'not-run', message: '尚无运行记录' };
        if (run.conclusion === 'cancelled') return { ...base, runId: run.id, startedAt: run.run_started_at || run.created_at,
          state: 'cancelled', message: '最近任务已取消；取消不代表生成故障，已有草稿不受影响。' };
        const done = run.status === 'completed';
        const start = run.run_started_at || run.created_at;
        const { count: created, error: countError } = await db.from(pipeline.table).select('id', { count: 'exact', head: true })
          .gte('created_at', start).lte('created_at', done ? run.updated_at : new Date().toISOString()).abortSignal(AbortSignal.timeout(8000));
        if (countError) throw new Error('新增内容数量读取失败');
        const failed = done && run.conclusion !== 'success';
        return { ...base, runId: run.id, startedAt: start, finishedAt: done ? run.updated_at : null,
          state: !done ? 'running' : failed ? 'failed' : created ? 'delivered' : 'empty', created,
          message: !done ? '正在排队或生成，完成后自动刷新待审核内容。' : failed ? '执行异常，未完成交付。已有草稿不受影响，请重试或联系管理员排查。' : created ? `此运行时段新增 ${created} 条内容，当前待审核 ${pending} 条。` : pipeline.empty,
        };
      } catch {
        return { ...base, state: 'unavailable', message: '执行状态暂不可读取，请稍后刷新；不要将此状态当成零新增。' };
      }
    }));
    return Response.json({ pipelines: rows }, { headers });
  } catch {
    return Response.json({ error: '后台待审数量读取失败，请稍后重试' }, { status: 503, headers });
  }
}
