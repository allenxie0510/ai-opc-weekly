/**
 * 种子推文脚本 — 从 AI HOT 公开 API 拉取 X 频道推文写入 Supabase
 * 用法：npx tsx scripts/seed-tweets.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('请设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY 环境变量');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface RawItem {
  id: string;
  url: string;
  titleZh?: string;
  author: string;
  publishedAt: string;
  rawJson?: {
    content?: string;
    author?: {
      name?: string;
      screenName?: string;
      avatar?: string;
    };
    media?: { url: string; type: string }[];
  };
}

async function main() {
  console.log('🔄 从 AI HOT API 拉取 X 推文...');

  const res = await fetch('https://aihot.virxact.com/api/public/items?channel=x&limit=50', {
    headers: { 'User-Agent': 'ai-opc-weekly-seeder/1.0' },
  });

  if (!res.ok) {
    console.error(`API 请求失败: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = await res.json();
  const items: RawItem[] = data.items || data;

  if (!items || items.length === 0) {
    console.log('⚠️ 未获取到推文数据');
    process.exit(0);
  }

  console.log(`📥 获取到 ${items.length} 条推文`);

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const rj = item.rawJson || {};
    const screenName = rj.author?.screenName || item.author;
    const content = (rj.content || '').replace(/http:\/\/x\.com\/i\/article\/\d+/g, '').trim();
    const tweetUrl = item.url;
    const tweetId = tweetUrl.split('/status/').pop() || item.id;
    const mediaUrls = (rj.media || [])
      .filter((m: { type: string }) => m.type === 'photo')
      .map((m: { url: string }) => m.url);

    if (!content || !screenName) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from('tweets').upsert(
      {
        tweet_id: tweetId,
        author_username: screenName,
        author_display_name: rj.author?.name || screenName,
        author_avatar_url: rj.author?.avatar || '',
        content: content.slice(0, 2000),
        published_at: item.publishedAt,
        url: tweetUrl,
        media_urls: mediaUrls,
      },
      { onConflict: 'tweet_id' }
    );

    if (error) {
      console.warn(`  ⚠️ ${screenName}: ${error.message}`);
      skipped++;
    } else {
      inserted++;
    }
  }

  console.log(`✅ 完成 — 写入 ${inserted} 条, 跳过 ${skipped} 条`);
}

main().catch(console.error);
