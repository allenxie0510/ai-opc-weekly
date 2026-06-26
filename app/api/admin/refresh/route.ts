/**
 * POST /api/admin/refresh — 手动触发推文拉取
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function isAdmin(request: Request): boolean {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && token === expected;
}

async function fetchAndUpsert(rssUrl: string, accByUser: Record<string, any>) {
  try {
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'ai-opc-weekly/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { status: res.status, username: '', count: 0 };
    const xml = await res.text();
    if (!xml.includes('<item>')) return { status: 0, username: '', count: 0 };

    const tweets = parseRSS(xml);
    let count = 0;
    for (const t of tweets) {
      const acc = accByUser[t.author_username];
      if (!acc) continue;
      const { error } = await supabase.from('tweets').upsert({
        tweet_id: t.tweet_id,
        author_username: t.author_username,
        author_display_name: acc.display_name || t.author_username,
        author_avatar_url: acc.avatar_url || '',
        content: t.content,
        published_at: t.published_at,
        url: t.url,
        media_urls: t.media_urls,
      }, { onConflict: 'tweet_id', ignoreDuplicates: true });
      if (!error) count++;
    }
    return { status: 200, username: tweets[0]?.author_username || '', count };
  } catch (e: any) {
    return { status: -1, username: '', count: 0, error: e.message };
  }
}

function parseRSS(xml: string) {
  const tweets: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const cm = block.match(/<dc:creator><!\[CDATA\[\s*@?(\w+)/i) || block.match(/<dc:creator>\s*@?(\w+)/i);
    const author = cm?.[1] || '';
    if (!author) continue;
    const lm = block.match(/<link>\s*(https?:\/\/x\.com\/\w+\/status\/\d+)[^<]*\s*<\/link>/);
    if (!lm) continue;
    const tm = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/);
    let content = (tm?.[1] || '').trim().replace(/^RT by @\w+:\s*/g, '').replace(/^RT by @\w+\s+/g, '').trim();
    if (!content) continue;
    const pm = block.match(/<pubDate>([^<]+)<\/pubDate>/);
    const publishedAt = pm?.[1] ? new Date(pm[1]).toISOString() : new Date().toISOString();
    const tweetId = lm[1].split('/status/').pop()?.replace(/[?#].*$/, '') || '';
    if (!tweetId) continue;
    const imgs: string[] = [];
    const irx = /<media:content[^>]+url="([^"]+)"[^>]*\/>/g;
    let im;
    while ((im = irx.exec(block)) !== null) imgs.push('/api/img-proxy?url=' + encodeURIComponent(im[1]));
    tweets.push({ tweet_id: tweetId, author_username: author, content: content.slice(0, 2000), published_at: publishedAt, url: lm[1], media_urls: imgs.slice(0, 4) });
  }
  return tweets;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }

  const { data: accounts, error: acctErr } = await supabase
    .from('twitter_accounts')
    .select('*')
    .not('rss_url', 'is', null);

  if (acctErr || !accounts?.length) {
    return Response.json({ error: acctErr?.message || '无账号' }, { status: 500 });
  }

  const accByUser: Record<string, any> = {};
  for (const a of accounts) accByUser[a.username] = a;

  const urls = [...new Set(accounts.map((a: any) => a.rss_url))];

  const results: any[] = [];
  let total = 0;

  // 逐个处理（避免 Vercel 10s 超时后丢结果，尽量多处理）
  for (const url of urls) {
    const r = await fetchAndUpsert(url, accByUser);
    results.push(r);
    total += r.count;
  }

  return Response.json({
    status: 'ok',
    total,
    results: results.map(r => ({
      username: r.username,
      status: r.status,
      count: r.count,
      error: r.error,
    })),
  });
}
