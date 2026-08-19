/**
 * 推文抓取 — 从 Nitter 公共实例拉取 X 推文写入 Supabase
 * 用法：node scripts/fetch-tweets.mjs
 *
 * 由 GitHub Actions 每 2 小时自动执行
 *
 * 机制（2026-08 从 RSS.app 迁移，RSS.app 订阅到期全线 402）：
 *   遍历 twitter_accounts 表所有账号，每个账号按序尝试：
 *     1. https://xcancel.com/<username>/rss   （实测 5/5 可用）
 *     2. https://nitter.net/<username>/rss    （部分账号可用，兜底）
 *     3. 该账号 rss_url（非空且不含 rss.app 时，可选高级兜底）
 *   第一个返回 200 且解析出 ≥1 条 item 的源胜出。
 *
 * 关键：xcancel / nitter 必须带 RSS 阅读器 UA，浏览器 UA 会被 400 拒绝。
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 缺少 SUPABASE 环境变量');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// xcancel/nitter 只接受 RSS 客户端 UA，浏览器 UA 返回 400
const RSS_UA = 'FreshRSS/1.24.0 (Linux; https://freshrss.org)';
// 账号间礼貌延时（约 15 个账号，全程 ~25s）
const SLEEP_MS = 1500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 基本 XML 实体反转义（Nitter 的 title 是纯文本含实体） */
function unescapeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * 解析 RSS XML，提取推文列表
 * 兼容两种格式：
 *   Nitter 系（xcancel/nitter.net）：
 *     <title>纯文本（含 XML 实体）</title>
 *     <dc:creator>@username</dc:creator>（无 CDATA）
 *     <guid isPermaLink="false">纯数字 tweet_id</guid>
 *     <link>https://<实例域名>/<user>/status/<id>#m</link>
 *     <description><![CDATA[HTML，<img src=".../pic/..."> 为媒体图]]></description>
 *   RSS.app（兜底自定义 rss_url 可能是同类格式）：
 *     <title><![CDATA[正文]]></title>
 *     <link>https://x.com/<user>/status/<id></link>
 *     <media:content url="...">
 * 统一输出：url 重写为 https://x.com/<username>/status/<tweet_id>
 */
function parseRSSFeed(xml, account) {
  const tweets = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    // 作者：feed 是按账号抓的，直接用账号 username（dc:creator 作参考，RT 条目可能不同）
    const cm = block.match(/<dc:creator><!\[CDATA\[\s*@?(\w+)/i)
            || block.match(/<dc:creator>\s*@?(\w+)/i);
    const author = account.username || cm?.[1] || '';
    if (!author) continue;

    // title → 推文正文（Nitter 是纯文本含实体，RSS.app 是 CDATA）
    const tm = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
            || block.match(/<title>([\s\S]*?)<\/title>/);
    let content = unescapeXml((tm?.[1] || '').trim());
    // 去掉 RT 前缀（RSS.app: "RT by @user:"；Nitter: "RT @user:"）
    content = content
      .replace(/^RT by @\w+:\s*/g, '')
      .replace(/^RT by @\w+\s+/g, '')
      .replace(/^RT @\w+:\s*/g, '')
      .trim();
    if (!content) continue;

    // tweet_id：优先 guid（Nitter 是纯数字），否则从 link 的 /status/ 提取
    const gm = block.match(/<guid[^>]*>\s*(\d+)\s*<\/guid>/);
    const lm = block.match(/<link>\s*(https?:\/\/[^<\s]+)\s*<\/link>/);
    const tweetId = gm?.[1] || lm?.[1]?.match(/\/status\/(\d+)/)?.[1] || '';
    if (!tweetId) continue;

    // pubDate
    const pm = block.match(/<pubDate>([^<]+)<\/pubDate>/);
    const publishedAt = pm?.[1] ? new Date(pm[1]).toISOString() : new Date().toISOString();

    // url 统一重写成 x.com（Nitter 的 link 是实例域名，保持下游卡片跳转一致）
    const url = `https://x.com/${author}/status/${tweetId}`;

    // 图片：Nitter 在 description HTML 的 <img src>（只收 /pic/ 媒体图，跳过 emoji/头像）；
    // RSS.app 在 <media:content url>。统一走 /api/img-proxy 包装。
    const imgs = [];
    const dm = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)
            || block.match(/<description>([\s\S]*?)<\/description>/);
    const desc = dm?.[1] || '';
    const irx = /<img[^>]+src="([^"]+)"/g;
    let im;
    while ((im = irx.exec(desc)) !== null) {
      const src = unescapeXml(im[1]);
      if (!src.includes('/pic/')) continue;
      imgs.push('/api/img-proxy?url=' + encodeURIComponent(src));
    }
    const mrx = /<media:content[^>]+url="([^"]+)"[^>]*\/>/g;
    while ((im = mrx.exec(block)) !== null) {
      imgs.push('/api/img-proxy?url=' + encodeURIComponent(im[1]));
    }

    tweets.push({
      tweet_id: tweetId,
      author_username: author,
      content: content.slice(0, 2000),
      published_at: publishedAt,
      url,
      media_urls: [...new Set(imgs)].slice(0, 4),
    });
  }

  return tweets;
}

/** 抓取单个 feed，返回 { ok, xml?, status, reason? } */
async function fetchFeed(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': RSS_UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const xml = await res.text();
    if (!xml.includes('<item>')) return { ok: false, status: res.status, reason: '无 item 节点' };
    return { ok: true, status: res.status, xml };
  } catch (e) {
    return { ok: false, status: -1, reason: e.message };
  }
}

async function main() {
  console.log('🔄 开始从 Nitter 公共实例拉取推文...\n');

  // 读取所有账号（不再依赖 rss_url，xcancel/nitter 只需 username）
  const { data: accounts, error: acctErr } = await supabase
    .from('twitter_accounts')
    .select('*');

  if (acctErr) {
    console.error('❌ 读取账号列表失败:', acctErr.message);
    process.exit(1);
  }
  if (!accounts?.length) {
    console.log('⚠️ 没有追踪账号');
    process.exit(0);
  }

  console.log(`📡 ${accounts.length} 个账号，候选源: xcancel.com → nitter.net → rss_url 兜底\n`);

  let synced = 0, okAccounts = 0;
  const failed = [];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];

    // 候选源按优先级排列
    const candidates = [
      { name: 'xcancel.com', url: `https://xcancel.com/${acc.username}/rss` },
      { name: 'nitter.net', url: `https://nitter.net/${acc.username}/rss` },
    ];
    if (acc.rss_url && !acc.rss_url.includes('rss.app')) {
      candidates.push({ name: 'rss_url 兜底', url: acc.rss_url });
    }

    let hit = null; // { name, tweets }
    const attempts = [];
    for (const c of candidates) {
      const r = await fetchFeed(c.url);
      if (r.ok) {
        const tweets = parseRSSFeed(r.xml, acc);
        if (tweets.length > 0) {
          hit = { name: c.name, tweets };
          break;
        }
        attempts.push(`${c.name} 200 但解析 0 条`);
      } else {
        attempts.push(`${c.name} HTTP ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
      }
    }

    if (!hit) {
      failed.push(acc.username);
      console.warn(`  ⚠️ @${acc.username} 全部源失败: ${attempts.join(' | ')}`);
    } else {
      okAccounts++;
      let wrote = 0;
      for (const t of hit.tweets) {
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
          wrote++;
        }
      }
      synced += wrote;
      console.log(`  ✅ @${acc.username} → ${hit.name}，解析 ${hit.tweets.length} 条，写入 ${wrote} 条`);
    }

    // 账号间礼貌延时（最后一个不用等）
    if (i < accounts.length - 1) await sleep(SLEEP_MS);
  }

  console.log(`\n📊 同步完成: ${synced} 条写入, ${okAccounts}/${accounts.length} 个账号成功, ${failed.length} 个失败`);
  if (okAccounts > 0 && failed.length > 0) {
    console.warn(`⚠️ 部分账号失败（${failed.length}/${accounts.length}）: ${failed.map(u => '@' + u).join(', ')}，暂不阻塞，但请检查上面的警告`);
  }

  // 清理孤儿推文：删除不属于任何追踪账号的推文
  try {
    const trackedSet = new Set(accounts.map(a => a.username));
    const { data: allTweets, error: orphanFetchErr } = await supabase
      .from('tweets')
      .select('author_username');
    if (orphanFetchErr) {
      console.warn('⚠️ 孤儿查询失败:', orphanFetchErr.message);
    } else if (allTweets) {
      const orphanAuthors = [...new Set(allTweets.map(t => t.author_username))]
        .filter(u => !trackedSet.has(u));
      for (const orphan of orphanAuthors) {
        const { count: c, error: orphanDelErr } = await supabase
          .from('tweets')
          .delete({ count: 'exact' })
          .eq('author_username', orphan);
        if (orphanDelErr) {
          console.warn(`⚠️ 清理孤儿 @${orphan} 失败:`, orphanDelErr.message);
        } else if (c) {
          console.log(`🧹 清理孤儿 @${orphan}: ${c} 条推文`);
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ 孤儿清理异常:', e.message);
  }

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

  // 14天自动清理（非致命，失败仅警告）
  try {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error: delErr, count: delCount } = await supabase
      .from('tweets')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (delErr) {
      console.warn('⚠️ 14天清理失败:', delErr.message);
    } else if (delCount) {
      console.log(`🧹 清理 ${delCount} 条超过14天的推文`);
    }
  } catch (e) {
    console.warn('⚠️ 14天清理异常:', e.message);
  }

  // 全灭报警：0 个账号成功说明是系统性故障（公共实例全挂/网络全断），
  // exit 1 让 Actions 标红——只 log 警告会让故障被掩盖（RSS.app 402 曾静默失败两天）
  if (okAccounts === 0 && accounts.length > 0) {
    console.error(`\n❌ 全部账号失败（0/${accounts.length}），Nitter 公共实例可能整体不可用，考虑更换抓取源`);
    process.exit(1);
  }

  console.log('✅ 推文拉取完成');
}

main().catch(err => {
  console.error('❌ 未捕获异常:', err);
  process.exit(1);
});
