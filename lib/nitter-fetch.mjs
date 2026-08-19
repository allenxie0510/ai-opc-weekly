/**
 * Nitter 抓取核心 — scripts/fetch-tweets.mjs 与 app/api/admin/refresh/route.ts 共享
 *
 * 纯 ESM JS（无 TS 语法），两边直接 import：
 *   - Node 脚本:  import ... from '../lib/nitter-fetch.mjs'
 *   - Next route: import ... from '@/lib/nitter-fetch.mjs'（tsconfig allowJs: true）
 *
 * 关键坑（2026-08-19 三轮 Actions 实测）：
 *   ① 必须带 RSS 阅读器 UA，浏览器 UA 被 400；
 *   ② nitter.net 按 TLS 指纹拦截 node fetch（返回 200 空 body）——优先用 curl 子进程；
 *      curl 不存在时（极端环境）退化 node fetch，空 body / 无 <item> 一律判失败走降级链；
 *   ③ xcancel.com 已转 RSS 阅读器白名单制（302/占位 item），保留在末位，恢复后自动启用；
 *   ④ nitter.privacyredirect.com 可用但连击限流（503），只作第二兜底。
 */

export const RSS_UA = 'FreshRSS/1.24.0 (Linux; https://freshrss.org)';

/** 基本 XML 实体反转义（Nitter 的 title 是纯文本含实体） */
export function unescapeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
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
    const publishedAt = pm?.[1] ? new Date(pm[1]).toISOString() : new Date().toISOString();

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
 * 账号的候选源按优先级排列
 * @param {{ username: string, rss_url?: string | null }} acc
 */
export function candidatesFor(acc) {
  const list = [
    { name: 'nitter.net', url: `https://nitter.net/${acc.username}/rss` },
    { name: 'nitter.privacyredirect.com', url: `https://nitter.privacyredirect.com/${acc.username}/rss` },
    { name: 'xcancel.com', url: `https://xcancel.com/${acc.username}/rss` },
  ];
  if (acc.rss_url && !acc.rss_url.includes('rss.app')) {
    list.push({ name: 'rss_url 兜底', url: acc.rss_url });
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

/**
 * curl 抓取单个 feed，返回 { ok, xml?, status, reason?, transport: 'curl' }
 * @param {string} url
 * @param {number} timeoutSec
 */
export async function fetchFeedCurl(url, timeoutSec = 20) {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile('curl', [
      '-s', '-m', String(timeoutSec),
      '-H', `User-Agent: ${RSS_UA}`,
      '-w', '\n__HTTP:%{http_code}',
      url,
    ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve({ ok: false, status: -1, reason: err.message, transport: 'curl' });
      const m = stdout.match(/\n__HTTP:(\d{3})\s*$/);
      const status = m ? parseInt(m[1], 10) : -1;
      const xml = m ? stdout.slice(0, m.index) : stdout;
      if (status !== 200) return resolve({ ok: false, status, transport: 'curl' });
      if (!xml.includes('<item>')) return resolve({ ok: false, status, reason: '无 item 节点', transport: 'curl' });
      resolve({ ok: true, status, xml, transport: 'curl' });
    });
  });
}

/**
 * node fetch 兜底抓取（仅 curl 不存在时用）。
 * 注意坑：nitter.net 按 TLS 指纹拦截 node fetch——返回 200 但 body 为空/无 <item>，
 * 这里一律判失败，让降级链走到下一个源。
 */
export async function fetchFeedNode(url, timeoutMs = 15000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': RSS_UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, status: res.status, transport: 'node-fetch' };
    const xml = await res.text();
    if (!xml.includes('<item>')) return { ok: false, status: res.status, reason: '无 item 节点（可能被 TLS 指纹拦截）', transport: 'node-fetch' };
    return { ok: true, status: res.status, xml, transport: 'node-fetch' };
  } catch (e) {
    return { ok: false, status: -1, reason: e.message, transport: 'node-fetch' };
  }
}

/** 统一入口：curl 优先，curl 不存在退化 node fetch */
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
 * @param {{ timeoutSec?: number, debug?: boolean }} [opts]
 */
export async function fetchAccountTweets(acc, { timeoutSec = 20, debug = false } = {}) {
  const attempts = [];
  for (const c of candidatesFor(acc)) {
    const r = await fetchFeed(c.url, { timeoutSec });
    if (r.ok) {
      const tweets = parseRSSFeed(r.xml, acc);
      if (tweets.length > 0) {
        return { ok: true, source: c.name, transport: r.transport, tweets };
      }
      attempts.push(`${c.name} 200 但解析 0 条`);
      if (debug) {
        const firstItem = r.xml.match(/<item>([\s\S]*?)<\/item>/);
        console.log(`  🔍 [debug] @${acc.username} ${c.name} 响应头 300 字: ${JSON.stringify(r.xml.slice(0, 300))}`);
        if (firstItem) console.log(`  🔍 [debug] 首个 item 前 800 字: ${JSON.stringify(firstItem[0].slice(0, 800))}`);
      }
    } else {
      attempts.push(`${c.name} HTTP ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
    }
  }
  return { ok: false, attempts };
}
