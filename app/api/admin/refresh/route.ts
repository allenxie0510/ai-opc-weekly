/**
 * POST /api/admin/refresh — 手动触发推文拉取
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 *
 * 2026-08 迁移：与 scripts/fetch-tweets.mjs 共用 lib/nitter-fetch.mjs 的
 * Nitter 抓取核心（多实例降级 + curl 抓取 + 解析器），不再走 RSS.app。
 *
 * Vercel serverless 注意：
 * - curl 可用性：Node runtime 基于 Amazon Linux，自带 /usr/bin/curl；
 *   共享模块会探测，缺失时自动退化 node fetch（nitter.net 会 TLS 指纹拦截
 *   node fetch 返回 200 空 body，共享模块判空失败后走降级链）。
 * - 时长：serverless 有时长上限，这里并发 4 路、单源 8s 超时，
 *   典型情况 ~10-15s 完成（15 个账号多数命中首源）。
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { fetchAccountTweets, hasCurl } from '@/lib/nitter-fetch.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CONCURRENCY = 4;
const SOURCE_TIMEOUT_SEC = 8;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function isAdmin(request: Request): boolean {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }

  const { data: accounts, error: acctErr } = await supabase
    .from('twitter_accounts')
    .select('*');

  if (acctErr || !accounts?.length) {
    return Response.json({ error: acctErr?.message || '无账号' }, { status: 500 });
  }

  const results: any[] = [];
  let total = 0;
  let idx = 0;

  async function worker() {
    while (idx < accounts!.length) {
      const acc = accounts![idx++];
      try {
        const r: any = await fetchAccountTweets(acc, { timeoutSec: SOURCE_TIMEOUT_SEC });
        if (!r.ok) {
          results.push({ username: acc.username, status: -1, count: 0, error: r.attempts.join(' | ') });
          continue;
        }
        let count = 0;
        for (const t of r.tweets) {
          const { error } = await supabase.from('tweets').upsert({
            tweet_id: t.tweet_id,
            author_username: t.author_username,
            author_display_name: acc.display_name || t.author_username,
            author_avatar_url: acc.avatar_url || '',
            content: t.content,
            published_at: t.published_at,
            url: t.url,
            media_urls: t.media_urls,
          }, { onConflict: 'tweet_id', ignoreDuplicates: true });
          if (!error) count++;
        }
        results.push({ username: acc.username, status: 200, count, source: r.source, transport: r.transport });
        total += count;
      } catch (e: any) {
        results.push({ username: acc.username, status: -1, count: 0, error: e.message });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // 全灭兜底（2026-08-19 排查：nitter 实例对 Vercel/AWS 出口 IP 硬拦截，
  // 而 GitHub Actions 正常）——直连全部失败时自动改为 dispatch fetch-tweets.yml，
  // 由 Actions 环境完成抓取（异步，约 2-3 分钟生效）。需要 Vercel 环境变量 GITHUB_PAT。
  const allFailed = results.length > 0 && results.every((r) => r.status !== 200);
  let fallback: string | undefined;
  if (allFailed) {
    const pat = process.env.GITHUB_PAT;
    if (!pat) {
      fallback = 'no_github_pat';
    } else {
      try {
        const dres = await fetch(
          'https://api.github.com/repos/allenxie0510/ai-opc-weekly/actions/workflows/fetch-tweets.yml/dispatches',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${pat}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'aiopc-admin',
            },
            body: JSON.stringify({ ref: 'main' }),
          },
        );
        fallback = dres.status === 204 ? 'dispatched' : `dispatch_failed_${dres.status}`;
      } catch {
        fallback = 'dispatch_error';
      }
    }
  }

  return Response.json({
    status: 'ok',
    total,
    fallback,
    transport: (await hasCurl()) ? 'curl' : 'node-fetch',
    results: results.map(r => ({
      username: r.username,
      status: r.status,
      count: r.count,
      source: r.source,
      error: r.error,
    })),
  });
}
