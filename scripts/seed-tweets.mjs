import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const res = await fetch('https://aihot.virxact.com/api/public/items?channel=x&limit=30', {
  headers: { 'User-Agent': 'ai-opc-weekly-seeder/1.0' },
});
const data = await res.json();
const items = data.items || data || [];

// 只保留 X 来源的推文
const xItems = items.filter(item => {
  const src = (item.source || '');
  return src.startsWith('X：') || src.startsWith('X:');
});

console.log(`📥 共 ${items.length} 条，其中 X 推文 ${xItems.length} 条`);

let ok = 0, skip = 0;
for (const item of xItems) {
  // 从 source 解析：X：卡兹克 (@Khazix0918) 或 X：DisplayName (@username, extra)
  const srcMatch = item.source?.match(/^X[：:]\s*(.+?)\s*\(@(\w+)/);
  const displayName = srcMatch?.[1]?.trim() || item.source || '';
  const screenName = srcMatch?.[2] || '';

  // 用 summary 作为推文内容
  const content = item.summary || '';
  const tweetId = item.url?.split('/status/')?.pop() || item.id;

  if (!content || !screenName) {
    console.log(`  ❌ ${displayName}: no content/username`);
    skip++; continue;
  }

  // 尝试从 rawJson 提取图片 URL
  const rj = item.rawJson || {};
  const mediaUrls = (rj.media || [])
    .filter((m) => m.type === 'photo' && m.url)
    .map((m) => m.url);

  // 如果 rawJson 没有媒体，尝试从 summary 中提取 img 标签（备用）
  const extraUrls = mediaUrls.length > 0 ? [] : [];
  if (mediaUrls.length === 0 && content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/gi)) {
    const imgMatches = content.match(/https?:\/\/[^\s"'>]+\.(jpg|jpeg|png|gif|webp)/gi);
    if (imgMatches) extraUrls.push(...imgMatches.slice(0, 4));
  }

  const finalMedia = [...mediaUrls, ...extraUrls];

  const { error } = await supabase.from('tweets').upsert({
    tweet_id: tweetId,
    author_username: screenName,
    author_display_name: displayName,
    author_avatar_url: `https://unavatar.io/x/${screenName}`,
    content: content.slice(0, 2000),
    published_at: item.publishedAt,
    url: item.url,
    media_urls: finalMedia,
  }, { onConflict: 'tweet_id' });

  if (error) {
    console.warn(`  ⚠️ @${screenName}: ${error.message}`);
    skip++;
  } else {
    console.log(`  ✅ @${screenName}${finalMedia.length > 0 ? ` [${finalMedia.length}图]` : ''}: ${content.slice(0, 40)}...`);
    ok++;
  }
}
console.log(`✅ 写入 ${ok} 条, 跳过 ${skip} 条`);
