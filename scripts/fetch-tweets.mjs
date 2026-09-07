/**
 * Free public X sources → Supabase. GitHub Actions owns scheduling.
 * Rate limits are respected; failed accounts are retried once after cooldown.
 */
import { appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { discoverSources, fetchAccountTweets, sourceCooldownDelay } from '../lib/nitter-fetch.mjs';
import { selectSyncAccounts, summarizeSync } from '../lib/x-sync-policy.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('缺少 Supabase 环境变量');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const INTERVAL_MS = 10_000;

async function main() {
  const startedAt = new Date().toISOString();
  const { data: tracked, error } = await supabase.from('twitter_accounts').select('*').order('created_at');
  if (error) throw error;
  const target = String(process.env.FETCH_ACCOUNT || '').trim().replace(/^@/, '');
  const accounts = selectSyncAccounts(tracked || [], target);
  if (!accounts.length) {
    if (target) throw new Error('未找到启用中的目标账号');
    console.log('没有启用的追踪账号，本轮无需同步');
    return;
  }
  const sources = await discoverSources({ forceRefresh: true });
  console.log('开始同步 ' + startedAt + '；' + accounts.length + ' 个账号，' + sources.length + ' 个免费源');
  const sourceState = new Map();
  const results = new Map();
  async function syncAccount(acc) {
    const delay = sourceCooldownDelay(acc, sources, sourceState);
    if (delay > 0) {
      if (delay > 300_000 || Date.now() + delay > Date.parse(startedAt) + 16 * 60_000) {
        throw new Error('来源仍需冷却，超出本轮等待预算；留待下轮，不提前请求');
      }
      console.log('@' + acc.username + ' 等待来源冷却 ' + Math.ceil(delay / 1000) + ' 秒，再继续同步');
      await sleep(delay);
    }
    const r = await fetchAccountTweets(acc, {
      timeoutSec: 12, debug: process.env.FETCH_DEBUG === '1',
      sources, sourceState, failureThreshold: 2,
    });
    if (!r.ok) {
      console.warn('@' + acc.username + ' 抓取失败: ' + r.attempts.join(' | '));
      results.set(acc.username, { ...results.get(acc.username), username: acc.username, ok: false });
      return;
    }
    const { data: existing, error: lookupError } = await supabase.from('tweets')
      .select('tweet_id').in('tweet_id', r.tweets.map((tweet) => tweet.tweet_id));
    if (lookupError) throw lookupError;
    const existingIds = new Set(existing.map((tweet) => tweet.tweet_id));
    let processed = 0, newTweets = 0, writeErrors = 0;
    for (const t of r.tweets) {
      const { error: writeError, data: written } = await supabase.from('tweets').upsert({
        tweet_id: t.tweet_id, author_username: t.author_username,
        author_display_name: acc.display_name || t.author_username,
        author_avatar_url: acc.avatar_url || 'https://unavatar.io/x/' + t.author_username,
        content: t.content, published_at: t.published_at, url: t.url, media_urls: t.media_urls,
      }, {
        onConflict: 'tweet_id',
        ignoreDuplicates: t.media_urls.length === 0,
      }).select('tweet_id');
      if (writeError) { writeErrors++; console.warn('@' + acc.username + ' 写入失败: ' + writeError.message); }
      else {
        processed++;
        if (written?.length && !existingIds.has(t.tweet_id)) {
          newTweets++;
          existingIds.add(t.tweet_id);
        }
      }
    }
    const previous = results.get(acc.username);
    results.set(acc.username, { username: acc.username, ok: writeErrors === 0,
      newTweets: newTweets + (previous?.newTweets || 0), processed,
      source: r.source, latest: r.tweets.map((tweet) => tweet.published_at).sort().at(-1) });
    console.log('@' + acc.username + ' → ' + r.source + '；解析 ' + r.tweets.length +
      '，处理成功 ' + processed + '，实际新增 ' + newTweets + '，写入失败 ' + writeErrors +
      '；源内最新发布时间 ' + results.get(acc.username).latest);
  }
  for (let pass = 0; pass < 2; pass++) {
    const pending = accounts.filter((account) => !results.get(account.username)?.ok);
    if (!pending.length) break;
    if (pass > 0) {
      const cooldowns = [...sourceState.values()].filter((state) => !state.blocked && state.retryAt > Date.now());
      const delay = Math.max(60_000, ...cooldowns.map((state) => state.retryAt - Date.now()));
      // Long Retry-After is deferred to a later run, never shortened to bypass the limit.
      if (delay > 300_000) { console.warn('服务端要求长时间冷却；留待下轮，不提前重试'); break; }
      console.log('等待 ' + Math.ceil(delay / 1000) + ' 秒后，仅重试失败的 ' + pending.length + ' 个账号');
      await sleep(delay);
    }
    for (let i = 0; i < pending.length; i++) {
      try { await syncAccount(pending[i]); }
      catch (error) {
        const previous = results.get(pending[i].username);
        results.set(pending[i].username, { ...previous, username: pending[i].username, ok: false });
        console.warn('@' + pending[i].username + ' 同步异常: ' + error.message);
      }
      if (i < pending.length - 1) await sleep(INTERVAL_MS);
    }
  }
  const summary = summarizeSync([...results.values()]);
  console.log('同步结果 ' + JSON.stringify(summary));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['## X 同步结果', '', '开始：' + startedAt, '完成：' + new Date().toISOString(),
      '账号覆盖：' + summary.succeeded + '/' + summary.total, '',
      '| 账号 | 状态 | 实际新增 | 源内最新发布时间 |', '| --- | --- | --- | --- |',
      ...[...results.values()].map((row) => '| @' + row.username + ' | ' + (row.ok ? '成功' : '失败') +
        ' | ' + (row.newTweets || 0) + ' | ' + (row.latest || '未知') + ' |')];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
  // Account deletion is enforced by the database cascade trigger. Do not infer
  // orphanhood from a target-account subset (that previously deleted other accounts).
  // Synchronization never deletes historical data. Any retention policy must be
  // separately authorized instead of being a side effect of a refresh.
  if (summary.failed > 0) {
    console.error('::error::X 同步不完整：' + summary.failed + '/' + summary.total + ' 个账号失败。已成功写入的推文保留。');
    process.exitCode = 1;
  }
}
main().catch((error) => { console.error('同步失败:', error.message); process.exitCode = 1; });
