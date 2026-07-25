import { NextRequest, NextResponse } from 'next/server';

function isAdmin(req: NextRequest) {
  const token = req.headers.get('x-admin-token');
  return token && process.env.ADMIN_PASSWORD && token === process.env.ADMIN_PASSWORD;
}

const REPO = 'allenxie0510/ai-opc-weekly';

/**
 * POST /api/admin/trigger
 * body: { workflow: 'daily-radar' | 'weekly-newsletter' }
 * 通过 GitHub workflow_dispatch 手动触发工作流（抓取 + 生成雷达 / 周报）
 * 需要 Vercel 环境变量 GITHUB_PAT（classic PAT，repo scope 即可）
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return NextResponse.json(
      { error: '缺少 GITHUB_PAT 环境变量，请在 Vercel 配置 GitHub Personal Access Token（repo scope）' },
      { status: 500 },
    );
  }

  let body: { workflow?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
  }

  const workflowFile =
    body.workflow === 'weekly-newsletter' ? 'weekly-newsletter.yml' : 'daily-radar.yml';

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'aiopc-admin',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );

  if (res.status === 204) {
    return NextResponse.json({ status: 'ok', workflow: workflowFile });
  }

  const text = await res.text();
  return NextResponse.json(
    { error: `GitHub API ${res.status}: ${text.slice(0, 300)}` },
    { status: 502 },
  );
}
