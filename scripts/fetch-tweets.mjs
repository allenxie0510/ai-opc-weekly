/**
 * 推文抓取 — 从 RSS.app feeds 拉取 X 推文写入 Supabase
 * 用法：node scripts/fetch-tweets.mjs
 *
 * 由 GitHub Actions 每 2 小时自动执行
 *
 * 前置条件：twitter_accounts 表的 rss_url 列须填入 RSS.app 生成的 feed URL
 * 免费版 RSS.app 每个 feed 对应单个 X 账号
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 缺少 SUPABASE 环境变量');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * 解析 RSS XML，提取推文列表
 * RSS.app 格式：
 *   <dc:creator> → @username
 *   <link> → x.com 推文 URL
 *   <title><![CDATA[...]]> → 推文正文
 *   <pubDate> → 发布时间
 *   <media:content url="..."> → 图片
 */
function parseRSSFeed(xml) {
  const tweets = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    // dc:creator → @username
    const cm = block.match(/<dc:creator><!\[CDATA\[\s*@?(\w+)/i)
            || block.match(/<dc:creator>\s*@?(\w+)/i);
    const author = cm?.[1] || '';
    if (!author) continue;

    // link → x.com 推文 URL
    const lm = block.match(/<link>\s*(https?:\/\/x\.com\/\w+\/status\/\d+)[^<]*\s*<\/link>/);
    if (!lm) continue;

    // title CDATA → 推文正文
    const tm = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/);
    let content = (tm?.[1] || '').trim();
    // 去掉 "RT by @user: " 前缀
    content = content.replace(/^RT by @\w+:\s*/g, '').replace(/^RT by @\w+\s+/g, '').trim();
    if (!content) continue;

    // pubDate
    const pm = block.match(/<pubDate>([^<]+)<\/pubDate>/);
    const publishedAt = pm?.[1] ? new Date(pm[1]).toISOString() : new Date().toISOString();

    // tweet ID 从 URL 提取
    const tweetId = lm[1].split('/status/').pop()?.replace(/[?#].*$/, '') || '';
    if (!tweetId) continue;

    // media:content → 图片（走 Vercel 代理，国内可访问）
    const imgs = [];
    const irx = /<media:content[^>]+url="([^"]+)"[^>]*\/>/g;
    let im;
    while ((im = irx.exec(block)) !== null) {
      imgs.push('/api/img-proxy?url=' + encodeURIComponent(im[1]));
    }

    tweets.push({
      tweet_id: tweetId,
      author_username: author,
      content: content.slice(0, 2000),
      published_at: publishedAt,
      url: lm[1],
      media_urls: imgs.slice(0, 4),
    });
  }

  return tweets;
}

async function main() {
  console.log('🔄 开始从 RSS.app 拉取推文...\n');

  // 读取所有启用的、有 rss_url 的账号
  const { data: accounts, error: acctErr } = await supabase
    .from('twitter_accounts')
    .select('*')
    .eq('enabled', true)
    .not('rss_url', 'is', null);

  if (acctErr) {
    console.error('❌ 读取账号列表失败:', acctErr.message);
    process.exit(1);
  }
  if (!accounts?.length) {
    console.log('⚠️ 没有启用的账号或缺少 rss_url');
    process.exit(0);
  }

  // username → account 映射
  const accByUser = {};
  for (const a of accounts) accByUser[a.username] = a;

  // 去重 RSS URL
  const urls = [...new Set(accounts.map(a => a.rss_url))];
  console.log(`📡 ${accounts.length} 个账号，${urls.length} 个 RSS feed\n`);

  let synced = 0, errors = 0;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ai-opc-weekly/1.0' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        console.error(`  ⚠️ ${url.substring(0,50)}... → HTTP ${res.status}`);
        errors++;
        continue;
      }

      const xml = await res.text();
      if (!xml.includes('<item>')) {
        console.error(`  ⚠️ ${url.substring(0,50)}... → 无 item 节点`);
        errors++;
        continue;
      }

      const tweets = parseRSSFeed(xml);

      for (const t of tweets) {
        const acc = accByUser[t.author_username];
        if (!acc) continue; // 不是我们追踪的账号

        const { error } = await supabase.from('tweets').upsert({
          tweet_id: t.tweet_id,
          author_username: t.author_username,
          author_display_name: acc.display_name || t.author_username,
          author_avatar_url: acc.avatar_url || `https://unavatar.io/x/${t.author_username}`,
          content: t.content,
          published_at: t.published_at,
          url: t.url,
          media_urls: t.media_urls,
        }, { onConflict: 'tweet_id', ignoreDuplicates: true });

        if (error) {
          console.warn(`  ⚠️ @${t.author_username} 写入失败: ${error.message}`);
        } else {
          synced++;
        }
      }
    } catch (e) {
      console.error(`  ⚠️ ${url.substring(0,50)}... → ${e.message}`);
      errors++;
    }
  }

  console.log(`\n📊 同步完成: ${synced} 条写入, ${errors} 个 feed 失败`);

  // 按作者统计
  try {
    const { data: counts } = await supabase.from('tweets')
      .select('author_username');
    if (counts) {
      const tally = {};
      counts.forEach(t => { tally[t.author_username] = (tally[t.author_username] || 0) + 1; });
      Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([u, c]) => {
        console.log(`  @${u}: ${c} 条`);
      });
    }
  } catch { /* ignore */ }

  // 14天自动清理
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: delErr, count: delCount } = await supabase
    .from('tweets')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (delErr) {
    console.error('⚠️ 清理失败:', delErr.message);
  } else if (delCount) {
    console.log(`🧹 清理 ${delCount} 条超过14天的推文`);
  }

  console.log('✅ 推文拉取完成');
}

main().catch(err => {
  console.error('❌ 未捕获异常:', err);
  process.exit(1);
});
