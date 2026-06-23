/**
 * Vercel Cron — 每 2 小时从 RSS.app feeds 抓取 X 推文写入 Supabase
 * 
 * 前置条件：在 Supabase twitter_accounts 表的 rss_url 列填入 RSS.app 生成的 feed URL
 * RSS.app 免费版将所有账号聚合到同一 feed，通过 <dc:creator> 区分作者
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function parseRSSFeed(xml: string): {
  tweet_id: string; author_username: string;
  content: string; published_at: string;
  url: string; media_urls: string[];
}[] {
  const tweets: ReturnType<typeof parseRSSFeed> = [];

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    // dc:creator → @username (含 CDATA)
    const creatorMatch = block.match(/<dc:creator><!\[CDATA\[\s*@?(\w+)/i)
                      || block.match(/<dc:creator>\s*@?(\w+)/i);
    const authorUsername = creatorMatch?.[1] || '';

    // link → x.com 推文 URL
    const linkMatch = block.match(/<link>\s*(https?:\/\/x\.com\/\w+\/status\/\d+)[^<]*\s*<\/link>/);
    const link = linkMatch?.[1] || '';

    // title CDATA → 推文正文
    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/);
    let content = (titleMatch?.[1] || '').trim();

    // 去掉 "RT by @user: " 前缀
    content = content.replace(/^RT by @\w+:\s*/g, '').replace(/^RT by @\w+\s+/g, '').trim();

    // pubDate
    const pubDateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);
    const publishedAt = pubDateMatch?.[1]
      ? new Date(pubDateMatch[1]).toISOString()
      : new Date().toISOString();

    // 推文 ID
    const tweetId = link.split('/status/').pop()?.replace(/[?#].*$/, '') || '';

    // media:content → 提取图片 URL
    const descHtml = block; // 直接用整个 item block
    const imgs: string[] = [];
    const imgRegex = /<media:content[^>]+url="([^"]+)"[^>]*\/>/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(descHtml)) !== null) {
      if (imgMatch[1]) imgs.push(imgMatch[1]);
    }

    if (content && authorUsername && tweetId) {
      tweets.push({
        tweet_id: tweetId,
        author_username: authorUsername,
        content: content.slice(0, 2000),
        published_at: publishedAt,
        url: link,
        media_urls: imgs.slice(0, 4),
      });
    }
  }
  return tweets;
}

export async function GET() {
  try {
    // 读取所有有 rss_url 的账号 — 去重（免费版可能共用同一 URL）
    const { data: accounts } = await supabase
      .from('twitter_accounts')
      .select('*')
      .eq('enabled', true)
      .not('rss_url', 'is', null);

    if (!accounts?.length) {
      return Response.json({ status: 'no_rss_feeds', hint: '请在 Supabase 中填入 rss_url' });
    }

    // 建立 username → account 映射
    const accByUser: Record<string, typeof accounts[0]> = {};
    for (const a of accounts) accByUser[a.username] = a;

    // 去重 RSS URL
    const urls = [...new Set(accounts.map(a => a.rss_url))] as string[];

    let synced = 0, errors = 0;

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'ai-opc-weekly-cron/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) { errors++; continue; }

        const xml = await res.text();
        if (!xml.includes('<item>')) { errors++; continue; }

        const tweets = parseRSSFeed(xml);

        for (const t of tweets) {
          // 只处理我们追踪的账号
          const acc = accByUser[t.author_username];
          if (!acc) continue;

          await supabase.from('tweets').upsert({
            tweet_id: t.tweet_id,
            author_username: t.author_username,
            author_display_name: acc.display_name || t.author_username,
            author_avatar_url: acc.avatar_url || `https://unavatar.io/x/${t.author_username}`,
            content: t.content,
            published_at: t.published_at,
            url: t.url,
            media_urls: t.media_urls,
          }, { onConflict: 'tweet_id', ignoreDuplicates: true });
          synced++;
        }
      } catch { errors++; }
    }

    return Response.json({ status: 'ok', synced, errors, urls_checked: urls.length });
  } catch (e: unknown) {
    return Response.json({
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
