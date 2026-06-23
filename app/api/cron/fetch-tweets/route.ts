/**
 * Vercel Cron — 每 2 小时从 RSS.app feeds 抓取 X 推文写入 Supabase
 * 
 * 前置条件：在 Supabase twitter_accounts 表的 rss_url 列填入 RSS.app 生成的 feed URL
 * RSS.app 使用方式：访问 https://rss.app → 添加 X 账号 → 获取 RSS 链接 → 填入 Supabase
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function parseRSS(xml: string, username: string) {
  const tweets: {
    tweet_id: string; content: string; published_at: string;
    url: string; media_urls: string[];
  }[] = [];

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const link   = (block.match(/<link>\s*(https?:\/\/[^<]+)\s*<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1] || '';
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';

    // 提取纯文本
    const plainText = title
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim();

    // 推文 ID
    const tweetId = link.split('/status/').pop()?.replace(/[?#].*$/, '') || '';

    // 图片（从 description / title 中的 img 标签）
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
    const imgs: string[] = [];
    let imgMatch;
    while ((imgMatch = imgRegex.exec(title)) !== null) {
      const src = imgMatch[1];
      if (!src.includes('avatar') && !src.includes('profile') && !src.includes('emoj')) {
        imgs.push(src);
      }
    }

    if (plainText && tweetId) {
      tweets.push({
        tweet_id: tweetId,
        content: plainText.slice(0, 2000),
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        url: link.includes('x.com') ? link : `https://x.com/${username}/status/${tweetId}`,
        media_urls: imgs.slice(0, 4),
      });
    }
  }
  return tweets;
}

export async function GET() {
  try {
    const { data: accounts } = await supabase
      .from('twitter_accounts')
      .select('*')
      .eq('enabled', true)
      .not('rss_url', 'is', null);

    if (!accounts?.length) {
      return Response.json({ status: 'no_rss_feeds', hint: '请在 Supabase 中为 twitter_accounts 填入 rss_url 字段' });
    }

    let synced = 0, errors = 0;

    for (const acc of accounts) {
      try {
        const res = await fetch(acc.rss_url, {
          headers: { 'User-Agent': 'ai-opc-weekly-cron/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) { errors++; continue; }

        const xml = await res.text();
        if (!xml.includes('<item>')) { errors++; continue; }

        const tweets = parseRSS(xml, acc.username);

        for (const t of tweets.slice(0, 20)) {
          await supabase.from('tweets').upsert({
            tweet_id: t.tweet_id,
            author_username: acc.username,
            author_display_name: acc.display_name || acc.username,
            author_avatar_url: acc.avatar_url || `https://unavatar.io/x/${acc.username}`,
            content: t.content,
            published_at: t.published_at,
            url: t.url,
            media_urls: t.media_urls,
          }, { onConflict: 'tweet_id', ignoreDuplicates: true });
          synced++;
        }
      } catch { errors++; }
    }

    return Response.json({ status: 'ok', synced, errors, total: accounts.length });
  } catch (e: unknown) {
    return Response.json({
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
