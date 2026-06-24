/**
 * 推文抓取 — 从 AI HOT 公开 API 拉取 X 推文，匹配已追踪账号
 * 用法：node scripts/fetch-tweets.mjs
 *
 * 由 GitHub Actions 每 2 小时自动执行
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 缺少 SUPABASE 环境变量 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAihotPage(cursor) {
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);
  const url = `https://aihot.virxact.com/api/public/items?${params}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ai-opc-weekly/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`  ⚠️ AI HOT API 返回 ${res.status}`);
      return { items: [], nextCursor: null };
    }
    return await res.json();
  } catch (e) {
    console.error(`  ⚠️ AI HOT API 请求失败: ${e.message}`);
    return { items: [], nextCursor: null };
  }
}

// 从 source 字段解析 X 账号：X：DisplayName (@username) ...
function parseSource(source) {
  const m = source?.match(/^X[：:]\s*(.+?)\s*\(@(\w+)/);
  if (!m) return null;
  return { displayName: m[1].trim(), username: m[2] };
}

async function main() {
  console.log('🔄 开始拉取推文...\n');

  // 读取全部追踪账号
  const { data: accounts, error: acctErr } = await supabase.from('twitter_accounts').select('*');
  if (acctErr) {
    console.error('❌ 读取账号列表失败:', acctErr.message);
    process.exit(1);
  }
  if (!accounts?.length) {
    console.log('⚠️ twitter_accounts 表为空，请先运行迁移或添加种子数据');
    process.exit(0);
  }
  const trackedUsernames = new Set(accounts.map(a => a.username));

  console.log(`🔍 追踪 ${trackedUsernames.size} 个账号，从 AI HOT 拉取推文...\n`);

  let totalFetched = 0, matched = 0, cursor = null, pages = 0;

  while (pages < 10) {
    const { items, nextCursor } = await fetchAihotPage(cursor);
    if (!items?.length) break;
    pages++;

    // 只处理 X 来源且匹配追踪账号的
    for (const item of items) {
      const parsed = parseSource(item.source || '');
      if (!parsed || !trackedUsernames.has(parsed.username)) continue;
      if (!item.summary || !item.url) continue;

      const tweetId = item.url.split('/status/').pop() || item.id;

      // 提取图片（从 rawJson）
      const rj = item.rawJson || {};
      const mediaUrls = (rj.media || [])
        .filter(m => m.type === 'photo' && m.url)
        .map(m => m.url);

      const { error } = await supabase.from('tweets').upsert({
        tweet_id: tweetId,
        author_username: parsed.username,
        author_display_name: parsed.displayName,
        author_avatar_url: `https://unavatar.io/x/${parsed.username}`,
        content: item.summary.slice(0, 2000),
        published_at: item.publishedAt,
        url: item.url,
        media_urls: mediaUrls,
      }, { onConflict: 'tweet_id' });

      if (error) {
        console.warn(`  ⚠️ @${parsed.username} 写入失败: ${error.message}`);
      } else {
        matched++;
      }
      totalFetched++;
    }

    cursor = nextCursor;
  }

  console.log(`\n📊 ${pages} 页扫描, 匹配写入 ${matched} 条推文`);

  // 统计每个账号的推文数
  try {
    const { data: counts } = await supabase.rpc('tweet_count_by_author');
    if (counts) {
      for (const c of counts.slice(0, 10)) {
        console.log(`  @${c.author_username}: ${c.count} 条`);
      }
    }
  } catch { /* RPC 可能不存在，忽略 */ }

  // 14天自动清理
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: delErr, count: delCount } = await supabase
    .from('tweets')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (delErr) {
    console.error('⚠️ 清理失败:', delErr.message);
  } else {
    console.log(`🧹 清理完成: 删除 ${delCount ?? 0} 条 (created_at < ${cutoff.slice(0, 10)})`);
  }

  console.log('✅ 推文拉取完成');
}

main().catch(err => {
  console.error('❌ 未捕获异常:', err);
  process.exit(1);
});
