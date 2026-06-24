/**
 * GET /api/img-proxy?url=https://pbs.twimg.com/...
 * Vercel 服务器端代理图片，国内可直连
 * 带 7 天缓存
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return new Response('missing url', { status: 400 });

  // 仅允许代理已知图片源
  const allowed = ['pbs.twimg.com', 'pbs.twimg.com'];
  const parsed = new URL(url);
  if (!allowed.some(h => parsed.hostname.endsWith(h))) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const img = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!img.ok) return new Response('fetch failed', { status: 502 });

    const buffer = await img.arrayBuffer();
    return new Response(buffer, {
      headers: {
        'Content-Type': img.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, s-maxage=604800', // 7天
        'CDN-Cache-Control': 'public, max-age=604800',
      },
    });
  } catch {
    return new Response('proxy error', { status: 502 });
  }
}
