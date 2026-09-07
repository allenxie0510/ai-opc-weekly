/**
 * Optional authenticated external scheduler. The legacy public RSS.app writer
 * is retired: all scheduled writes use the same Actions pipeline.
 * No Vercel cron is configured; GitHub Actions is the primary free scheduler.
 */
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  const token = process.env.GITHUB_PAT;
  if (!token) return Response.json({ error: '未配置后台任务凭证' }, { status: 503 });
  try {
    const response = await fetch('https://api.github.com/repos/allenxie0510/ai-opc-weekly/actions/workflows/fetch-tweets.yml/dispatches', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }), signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 204) return Response.json({ error: '后台任务未启动' }, { status: 502 });
    return Response.json({ status: 'queued' }, { status: 202 });
  } catch {
    return Response.json({ error: '后台任务启动结果未确认' }, { status: 502 });
  }
}
