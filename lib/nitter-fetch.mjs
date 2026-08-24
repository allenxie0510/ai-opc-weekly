/**
 * Nitter 抓取核心 — scripts/fetch-tweets.mjs 与 app/api/admin/refresh/route.ts 共享
 *
 * 纯 ESM JS（无 TS 语法），两边直接 import：
 *   - Node 脚本:  import ... from '../lib/nitter-fetch.mjs'
 *   - Next route: import ... from '@/lib/nitter-fetch.mjs'（tsconfig allowJs: true）
 *
 * 免费多源策略：
 *   ① 每轮从 Nitter 社区状态 API 选出当前健康实例，RSS 优先；
 *   ② curl 跟随 30x 跳转（XCancel 会跳到独立 RSS 域名）；
 *   ③ RSS 失效时解析健康 Nitter 实例的 HTML 时间线；
 *   ④ 状态 API 失效时使用内置免费源列表，仍保留账号自定义 RSS 兜底。
 */

export const RSS_UA = 'FreshRSS/1.24.0 (Linux; https://freshrss.org)';
export const NITTER_STATUS_URL = 'https://status.d420.de/api/v1/instances';

const STATIC_SOURCES = [
  { name: 'xcancel.com RSS', baseUrl: 'https://xcancel.com', kind: 'rss' },
  { name: 'rss.xcancel.com RSS', baseUrl: 'https://rss.xcancel.com', kind: 'rss' },
  { name: 'nitter.poast.org RSS', baseUrl: 'https://nitter.poast.org', kind: 'rss' },
  { name: 'twiiit.com RSS 代理', baseUrl: 'https://twiiit.com', kind: 'rss' },
  { name: 'nitter.catsarch.com HTML', baseUrl: 'https://nitter.catsarch.com', kind: 'html' },
  { name: 'nitter.tiekoetter.com HTML', baseUrl: 'https://nitter.tiekoetter.com', kind: 'html' },
  { name: 'nitter.kareem.one HTML', baseUrl: 'https://nitter.kareem.one', kind: 'html' },
  { name: 'nitter.space HTML', baseUrl: 'https://nitter.space', kind: 'html' },
  { name: 'lightbrd.com HTML', baseUrl: 'https://lightbrd.com', kind: 'html' },
];

/** 基本 XML 实体反转义（Nitter 的 title 是纯文本含实体） */
export function unescapeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ');
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value.replace(/\s+·\s+/, ' '));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function htmlToText(value) {
  return unescapeXml(value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/**
 * 把 Nitter 实例的 /pic/ 代理图片 URL 还原为 pbs.twimg.com 直连 URL。
 * nitter 的 /pic/ 路径就是 pbs.twimg.com 路径的（可能多层）URL-encode：
 *   https://nitter.net/pic/media%2FHQC0....jpg
 *     → https://pbs.twimg.com/media/HQC0....jpg
 *   https://nitter.net/pic/card_img%2F2089...%2FheWUnNmO%3Fformat%3Djpg%26name%3D800x419
 *     → https://pbs.twimg.com/card_img/2089.../heWUnNmO?format=jpg&name=800x419
 * 非 /pic/ 路径（如 pbs.twimg.com 直链）原样返回。
 *
 * 为什么必须还原（2026-08-19 实测）：img-proxy 用 node fetch 拉上游，
 * nitter.net 按 TLS 指纹拦截 node fetch（连接失败 502）；
 * pbs.twimg.com 无此限制（RSS.app 时代旧图代理一直 200）。
 */
export function resolveImageUrl(src) {
  let u;
  try { u = new URL(src); } catch { return src; }
  if (!u.pathname.startsWith('/pic/')) return src;
  let p = u.pathname.slice('/pic/'.length);
  // query 可能套了两层 encode，解码到稳定为止（最多 3 轮防死循环）
  for (let i = 0; i < 3; i++) {
    let d;
    try { d = decodeURIComponent(p); } catch { break; }
    if (d === p) break;
    p = d;
  }
  return 'https://pbs.twimg.com/' + p + u.search;
}

/**
 * 解析 RSS XML，提取推文列表
 * 兼容两种格式：
 *   Nitter 系（nitter.net/privacyredirect/xcancel）：
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
 *
 * @param {string} xml
 * @param {{ username: string }} account
 */
export function parseRSSFeed(xml, account) {
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
    const publishedAt = validDate(pm?.[1] || '');
    // 不用“当前时间”伪造新鲜度：源没有可验证时间就丢弃该条。
    if (!publishedAt) continue;

    // url 统一重写成 x.com（Nitter 的 link 是实例域名，保持下游卡片跳转一致）
    const url = `https://x.com/${author}/status/${tweetId}`;

    // 图片：Nitter 在 description HTML 的 <img src>（只收 /pic/ 媒体图，跳过 emoji/头像）；
    // RSS.app 在 <media:content url>。nitter /pic/ 代理 URL 先还原成 pbs.twimg.com 直连
    // （nitter 实例按 TLS 指纹拦截 node fetch，img-proxy 拉不动），统一走 /api/img-proxy 包装。
    const imgs = [];
    const dm = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)
            || block.match(/<description>([\s\S]*?)<\/description>/);
    const desc = dm?.[1] || '';
    const irx = /<img[^>]+src="([^"]+)"/g;
    let im;
    while ((im = irx.exec(desc)) !== null) {
      const src = unescapeXml(im[1]);
      if (!src.includes('/pic/')) continue;
      imgs.push('/api/img-proxy?url=' + encodeURIComponent(resolveImageUrl(src)));
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

/**
 * 解析 Nitter HTML 时间线，作 RSS 全部失效时的免费兜底。
 * 只接受同时存在 status ID、正文和可验证发布时间的条目。
 *
 * @param {string} html
 * @param {{ username: string }} account
 * @param {string} sourceUrl
 */
export function parseNitterTimelineHtml(html, account, sourceUrl = 'https://nitter.net') {
  const tweets = [];
  const starts = [...html.matchAll(/<div\s+class="([^"]*\btimeline-item\b[^"]*)"([^>]*)>/gi)];

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = starts[i + 1]?.index ?? html.length;
    const block = html.slice(start.index, end);
    if (/\b(show-more|unavailable)\b/i.test(start[1])) continue;

    const link = block.match(/<a\s+class="tweet-link"\s+href="([^"]*\/status\/(\d+)[^"]*)"/i);
    if (!link) continue;
    const tweetId = link[2];

    const contentMatch = block.match(/<div\s+class="[^"]*\btweet-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const content = htmlToText(contentMatch?.[1] || '');
    if (!content) continue;

    const dateMatch = block.match(/<span\s+class="tweet-date"[\s\S]*?<a[^>]+title="([^"]+)"/i);
    const publishedAt = validDate(unescapeXml(dateMatch?.[1] || ''));
    if (!publishedAt) continue;

    const mediaUrls = [];
    const imgRegex = /<img[^>]+src="([^"]+)"/gi;
    let image;
    while ((image = imgRegex.exec(block)) !== null) {
      const raw = unescapeXml(image[1]);
      if (!raw.includes('/pic/') || /profile_images|emoji/i.test(raw)) continue;
      let absolute;
      try { absolute = new URL(raw, sourceUrl).toString(); } catch { continue; }
      mediaUrls.push('/api/img-proxy?url=' + encodeURIComponent(resolveImageUrl(absolute)));
    }

    tweets.push({
      tweet_id: tweetId,
      author_username: account.username,
      content: content.slice(0, 2000),
      published_at: publishedAt,
      url: `https://x.com/${account.username}/status/${tweetId}`,
      media_urls: [...new Set(mediaUrls)].slice(0, 4),
    });
  }

  return tweets;
}

function safePublicHttpsBase(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.port && url.port !== '443') return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.local')) return null;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** 从 Nitter 状态 API 数据中选出健康的公开源。 */
export function parseStatusSources(payload) {
  if (!payload || !Array.isArray(payload.hosts)) return [];
  return payload.hosts
    .filter((host) => host?.healthy === true && host?.is_bad_host !== true)
    .map((host) => {
      const baseUrl = safePublicHttpsBase(host.url);
      if (!baseUrl) return null;
      const kind = host.rss === true ? 'rss' : 'html';
      return {
        name: `${new URL(baseUrl).hostname} ${kind.toUpperCase()}`,
        baseUrl,
        kind,
        points: Number(host.points) || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.kind === b.kind ? b.points - a.points : a.kind === 'rss' ? -1 : 1));
}

function mergeSources(primary, fallback) {
  const seen = new Set();
  return [...primary, ...fallback].filter((source) => {
    const key = `${source.kind}:${source.baseUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let sourceCache = null;
let sourceCacheAt = 0;

/**
 * 发现当前免费源。状态结果缓存 15 分钟，状态服务失效不会阻断抓取。
 * @param {{ forceRefresh?: boolean, timeoutMs?: number, fetcher?: typeof fetch }} opts
 */
export async function discoverSources({ forceRefresh = false, timeoutMs = 8000, fetcher = fetch } = {}) {
  if (!forceRefresh && sourceCache && Date.now() - sourceCacheAt < 15 * 60 * 1000) return sourceCache;
  let dynamic = [];
  try {
    const res = await fetcher(NITTER_STATUS_URL, {
      headers: { 'User-Agent': RSS_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) dynamic = parseStatusSources(await res.json());
  } catch {
    // 非致命：下面会使用静态免费源。
  }
  const merged = mergeSources(dynamic, STATIC_SOURCES);
  // 限制单轮尝试数，避免所有公共源同时故障时超过 Actions/Vercel 时限。
  sourceCache = [
    ...merged.filter((source) => source.kind === 'rss').slice(0, 5),
    ...merged.filter((source) => source.kind === 'html').slice(0, 5),
  ];
  sourceCacheAt = Date.now();
  return sourceCache;
}

/**
 * 账号的候选源按优先级排列
 * @param {{ username: string, rss_url?: string | null }} acc
 * @param {{ name: string, baseUrl: string, kind: 'rss'|'html' }[]} sources
 */
export function candidatesFor(acc, sources = STATIC_SOURCES) {
  const username = encodeURIComponent(acc.username);
  const list = sources.map((source) => ({
    ...source,
    url: `${source.baseUrl}/${username}${source.kind === 'rss' ? '/rss' : ''}`,
  }));
  if (acc.rss_url && !acc.rss_url.includes('rss.app')) {
    list.unshift({ name: 'rss_url 自定义兜底', url: acc.rss_url, kind: 'rss', baseUrl: '' });
  }
  return list;
}

/** curl 是否可用（缓存结果；Vercel Node runtime 基于 Amazon Linux，自带 /usr/bin/curl） */
let curlOK = null;
export async function hasCurl() {
  if (curlOK !== null) return curlOK;
  try {
    const { execFile } = await import('node:child_process');
    curlOK = await new Promise((res) => {
      execFile('curl', ['--version'], { timeout: 5000 }, (err) => res(!err));
    });
  } catch {
    curlOK = false;
  }
  return curlOK;
}

/** curl 抓取文档，跟随最多 5 次跳转并记录最终 URL。 */
export async function fetchDocumentCurl(url, timeoutSec = 20) {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile('curl', [
      '-sS', '-L', '--max-redirs', '5', '--compressed',
      '--connect-timeout', String(Math.min(8, timeoutSec)),
      '-m', String(timeoutSec),
      '-H', `User-Agent: ${RSS_UA}`,
      '-H', 'Accept: application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8',
      '-w', '\n__HTTP:%{http_code}\n__FINAL:%{url_effective}',
      url,
    ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve({ ok: false, status: -1, reason: err.message, transport: 'curl' });
      const m = stdout.match(/\n__HTTP:(\d{3})\n__FINAL:([^\n]*)\s*$/);
      const status = m ? parseInt(m[1], 10) : -1;
      const body = m ? stdout.slice(0, m.index) : stdout;
      const finalUrl = m?.[2] || url;
      if (status !== 200) return resolve({ ok: false, status, finalUrl, transport: 'curl' });
      resolve({ ok: true, status, body, finalUrl, transport: 'curl' });
    });
  });
}

/** curl 抓取单个 feed。 */
export async function fetchFeedCurl(url, timeoutSec = 20) {
  const result = await fetchDocumentCurl(url, timeoutSec);
  if (!result.ok) return result;
  if (!result.body.includes('<item>')) {
    return { ...result, ok: false, reason: '无 item 节点' };
  }
  return { ...result, xml: result.body };
}

/**
 * node fetch 抓取文档（仅 curl 不存在时用）。
 * 注意坑：nitter.net 按 TLS 指纹拦截 node fetch——返回 200 但 body 为空/无 <item>，
 * 这里一律判失败，让降级链走到下一个源。
 */
export async function fetchDocumentNode(url, timeoutMs = 15000) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': RSS_UA,
        Accept: 'application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, status: res.status, finalUrl: res.url, transport: 'node-fetch' };
    return { ok: true, status: res.status, body: await res.text(), finalUrl: res.url, transport: 'node-fetch' };
  } catch (e) {
    return { ok: false, status: -1, reason: e.message, transport: 'node-fetch' };
  }
}

export async function fetchFeedNode(url, timeoutMs = 15000) {
  const result = await fetchDocumentNode(url, timeoutMs);
  if (!result.ok) return result;
  if (!result.body.includes('<item>')) {
    return { ...result, ok: false, reason: '无 item 节点（可能被 TLS 指纹拦截）' };
  }
  return { ...result, xml: result.body };
}

/** 统一入口：curl 优先，curl 不存在退化 node fetch。 */
export async function fetchDocument(url, { timeoutSec = 20 } = {}) {
  if (await hasCurl()) return fetchDocumentCurl(url, timeoutSec);
  return fetchDocumentNode(url, timeoutSec * 1000);
}

export async function fetchFeed(url, { timeoutSec = 20 } = {}) {
  if (await hasCurl()) return fetchFeedCurl(url, timeoutSec);
  return fetchFeedNode(url, timeoutSec * 1000);
}

/**
 * 按降级链抓取一个账号的推文。
 * 返回 { ok: true, source, transport, tweets }
 *   或 { ok: false, attempts: string[] }（全部源失败）
 *
 * @param {{ username: string, rss_url?: string | null }} acc
 * @param {{ timeoutSec?: number, debug?: boolean, sources?: any[], sourceState?: Map<string, any>, failureThreshold?: number }} [opts]
 */
export async function fetchAccountTweets(acc, {
  timeoutSec = 20,
  debug = false,
  sources,
  sourceState,
  failureThreshold = 1,
} = {}) {
  const attempts = [];
  const activeSources = sources || await discoverSources();
  for (const c of candidatesFor(acc, activeSources)) {
    const state = sourceState?.get(c.name);
    if (state?.blocked) {
      attempts.push(`${c.name} 本轮已熔断`);
      continue;
    }

    const r = c.kind === 'html'
      ? await fetchDocument(c.url, { timeoutSec })
      : await fetchFeed(c.url, { timeoutSec });
    if (r.ok) {
      const tweets = c.kind === 'html'
        ? parseNitterTimelineHtml(r.body, acc, r.finalUrl || c.url)
        : parseRSSFeed(r.xml, acc);
      if (tweets.length > 0) {
        if (sourceState) sourceState.set(c.name, { failures: 0, blocked: false });
        return { ok: true, source: c.name, transport: r.transport, finalUrl: r.finalUrl, tweets };
      }
      attempts.push(`${c.name} 200 但解析 0 条`);
      if (debug) {
        const body = r.xml || r.body || '';
        const firstItem = body.match(/<item>([\s\S]*?)<\/item>/);
        console.log(`  🔍 [debug] @${acc.username} ${c.name} 响应头 300 字: ${JSON.stringify(body.slice(0, 300))}`);
        if (firstItem) console.log(`  🔍 [debug] 首个 item 前 800 字: ${JSON.stringify(firstItem[0].slice(0, 800))}`);
      }
    } else {
      attempts.push(`${c.name} HTTP ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
      const systemic = r.status === -1 || r.status === 403 || r.status === 429 || r.status >= 500;
      if (sourceState && systemic) {
        const failures = (state?.failures || 0) + 1;
        sourceState.set(c.name, { failures, blocked: failures >= failureThreshold });
      }
    }
  }
  return { ok: false, attempts };
}
