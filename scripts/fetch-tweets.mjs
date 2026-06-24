/**
 * 推文抓取 — 从 AI HOT 公开 API 拉取 X 推文，匹配已追踪账号
 * 用法：node scripts/fetch-tweets.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function fetchAihotPage(cursor) {
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);
  const url = `https://aihot.virxact.com/api/public/items?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'ai-opc-weekly/1.0' } });
  if (!res.ok) return { items: [], nextCursor: null };
  return await res.json();
}

// 从 source 字段解析 X 账号：X：DisplayName (@username) ...
function parseSource(source) {
  const m = source?.match(/^X[：:]\s*(.+?)\s*\(@(\w+)/);
  if (!m) return null;
  return { displayName: m[1].trim(), username: m[2] };
}

async function main() {
  // 读取全部追踪账号
  const { data: accounts } = await supabase.from('twitter_accounts').select('*');
  if (!accounts?.length) { console.log('⚠️ 无账号'); return; }
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

      if (!error) matched++;
      totalFetched++;
    }

    if (totalFetched > 0 && matched > 0) cursor = nextCursor;
    else cursor = nextCursor;
  }

  console.log(`\n✅ ${pages} 页, 匹配 ${matched} 条推文`);

  // 统计每个账号的推文数
  const { data: counts } = await supabase.rpc('tweet_count_by_author');
  if (counts) {
    for (const c of counts.slice(0, 10)) {
      console.log(`  @${c.author_username}: ${c.count} 条`);
    }
  }
}

main().catch(console.error);
