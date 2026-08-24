/**
 * 推文抓取 — 从 Nitter 公共实例拉取 X 推文写入 Supabase
 * 用法：node scripts/fetch-tweets.mjs
 *
 * 由 GitHub Actions 每 2 小时自动执行
 *
 * 抓取核心（多实例降级 / curl 抓取 / 解析器）在 lib/nitter-fetch.mjs，
 * 与 app/api/admin/refresh/route.ts 共享，改逻辑只改那一处。
 */
import { createClient } from '@supabase/supabase-js';
import { discoverSources, fetchAccountTweets } from '../lib/nitter-fetch.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 缺少 SUPABASE 环境变量');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 账号间礼貌延时，减少免费公共实例的瞬时压力。
const SLEEP_MS = 2500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🔄 开始从免费 X 公共源拉取推文...\n');

  // 读取所有账号（不再依赖 rss_url，nitter 实例只需 username）
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

  const sources = await discoverSources({ forceRefresh: true });
  console.log(`📡 ${accounts.length} 个账号，${sources.length} 个免费候选源`);
  console.log(`   ${sources.map((source) => source.name).join(' → ')}\n`);

  const debug = process.env.FETCH_DEBUG === '1';
  // 同一轮中某源出现网络错误/403/429/5xx 后立即熔断，避免 18 个账号重复等待已故障源。
  const sourceState = new Map();
  let synced = 0, okAccounts = 0;
  const failed = [];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const r = await fetchAccountTweets(acc, {
      timeoutSec: 12,
      debug,
      sources,
      sourceState,
      failureThreshold: 1,
    });

    if (!r.ok) {
      failed.push(acc.username);
      console.warn(`  ⚠️ @${acc.username} 全部源失败: ${r.attempts.join(' | ')}`);
    } else {
      okAccounts++;
      let wrote = 0;
      for (const t of r.tweets) {
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
      console.log(`  ✅ @${acc.username} → ${r.source}（${r.transport}），解析 ${r.tweets.length} 条，写入 ${wrote} 条`);
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
    console.error(`\n❌ 全部账号失败（0/${accounts.length}），本轮免费 RSS/HTML 公共源均不可用`);
    process.exit(1);
  }

  console.log('✅ 推文拉取完成');
}

main().catch(err => {
  console.error('❌ 未捕获异常:', err);
  process.exit(1);
});
