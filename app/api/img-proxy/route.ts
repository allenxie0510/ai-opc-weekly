/**
 * GET /api/img-proxy?url=https://...
 * Vercel 服务器端代理图片：解决 OG 封面图防盗链 / 国内访问不稳定问题
 * 安全措施：仅允许 http(s) 且响应 Content-Type 必须为 image/*，体积上限 8MB
 * 带 7 天缓存
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return new Response('missing url', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response('bad url', { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const img = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
      headers: {
        // 部分站点按 UA/Referer 防盗链，浏览器 UA 命中率更高
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
    });
    if (!img.ok) return new Response('fetch failed', { status: 502 });

    const ct = img.headers.get('Content-Type') || '';
    if (!ct.toLowerCase().startsWith('image/')) {
      return new Response('not an image', { status: 403 });
    }
    const len = parseInt(img.headers.get('Content-Length') || '0', 10);
    if (len > MAX_BYTES) return new Response('too large', { status: 413 });

    const buffer = await img.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return new Response('too large', { status: 413 });

    return new Response(buffer, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=604800, s-maxage=604800', // 7天
        'CDN-Cache-Control': 'public, max-age=604800',
      },
    });
  } catch {
    return new Response('proxy error', { status: 502 });
  }
}
