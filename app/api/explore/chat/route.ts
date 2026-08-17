/**
 * POST /api/explore/chat — 方向探测器 AI 服务端代理
 * 访客无需自带 Key；DeepSeek 密钥由站长配置在 Vercel 环境变量 DEEPSEEK_API_KEY
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = (process.env.DEEPSEEK_API_ENDPOINT || 'https://api.deepseek.com').replace(/\/$/, '');

// 简单内存限流（Vercel serverless 单实例内有效，MVP 够用）
const RATE_LIMIT = 30; // 每 IP 每分钟最多请求数
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; reset: number }>();

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: '服务端未配置 DEEPSEEK_API_KEY（请在 Vercel 环境变量中配置，或切换为「演示模式」）' },
      { status: 503 }
    );
  }

  // 限流
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const rec = hits.get(ip);
  if (rec && now < rec.reset) {
    if (rec.count >= RATE_LIMIT) {
      return Response.json({ error: '请求过于频繁，请稍后再试' }, { status: 429 });
    }
    rec.count++;
  } else {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '无效请求体' }, { status: 400 });
  }

  const messages = Array.isArray(body?.messages) ? body.messages.slice(0, 20) : [];
  if (messages.length === 0) {
    return Response.json({ error: '缺少 messages' }, { status: 400 });
  }

  const upstream = await fetch(`${ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: typeof body.model === 'string' && body.model ? body.model : 'deepseek-v4-flash',
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.85,
      max_tokens: 8000,
      response_format: body.response_format || undefined,
      messages,
    }),
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return Response.json({ error: `上游错误 (${upstream.status}): ${text.slice(0, 300)}` }, { status: 502 });
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return Response.json({ error: '上游返回无法解析' }, { status: 502 });
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content) {
    return Response.json({ error: '上游返回为空' }, { status: 502 });
  }
  return Response.json({ content });
}
