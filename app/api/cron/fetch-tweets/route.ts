/**
 * Vercel Cron Job — 每 2 小时从 AI HOT API 拉取匹配追踪账号的 X 推文
 * 无需认证，被 Vercel Cron 或手动 GET 请求触发
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function parseSource(source: string) {
  const m = source?.match(/^X[：:]\s*(.+?)\s*\(@(\w+)/);
  if (!m) return null;
  return { displayName: m[1].trim(), username: m[2] };
}

async function fetchPage(cursor?: string) {
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`https://aihot.virxact.com/api/public/items?${params}`, {
    headers: { 'User-Agent': 'ai-opc-weekly-cron/1.0' },
  });
  if (!res.ok) return { items: [], nextCursor: null };
  return await res.json();
}

export async function GET() {
  try {
    const { data: accounts } = await supabase.from('twitter_accounts').select('*').eq('enabled', true);
    if (!accounts?.length) {
      return Response.json({ status: 'no_accounts' });
    }
    const tracked = new Set(accounts.map(a => a.username));

    let matched = 0, cursor: string | undefined, pages = 0;

    while (pages < 8) {
      const { items, nextCursor } = await fetchPage(cursor);
      if (!items?.length) break;
      pages++;

      for (const item of items) {
        const p = parseSource(item.source || '');
        if (!p || !tracked.has(p.username)) continue;
        if (!item.summary || !item.url) continue;

        const tweetId = item.url.split('/status/').pop() || item.id;
        const rj = item.rawJson || {};
        const mediaUrls = (rj.media || [])
          .filter((m: { type: string; url: string }) => m.type === 'photo' && m.url)
          .map((m: { url: string }) => m.url);

        await supabase.from('tweets').upsert({
          tweet_id: tweetId,
          author_username: p.username,
          author_display_name: p.displayName,
          author_avatar_url: `https://unavatar.io/x/${p.username}`,
          content: item.summary.slice(0, 2000),
          published_at: item.publishedAt,
          url: item.url,
          media_urls: mediaUrls,
        }, { onConflict: 'tweet_id' });
        matched++;
      }
      cursor = nextCursor;
    }

    return Response.json({ status: 'ok', pages, matched });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ status: 'error', error: msg }, { status: 500 });
  }
}
