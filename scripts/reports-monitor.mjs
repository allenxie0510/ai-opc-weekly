/**
 * Reports Monitor · 低频高价值信源周报监测
 * 每周一轮，抓取"报告型/访谈型"信源的最新内容，写入 radar_candidates（按 source_url upsert 去重）
 * 之后由 daily-radar 的 GLM 筛选环节自然吸收（候选池取最近 36h）
 *
 * 覆盖（2026-08-11 台账）：
 *   ✅ IH Podcast   — 真实 MRR 访谈，OPC 第一案例源（Transistor RSS）
 *   ✅ RevenueCat   — 订阅经济博客/年度报告（官方 RSS）
 *   ✅ YC RFS       — YC 官方创业方向清单（单页 HTML，按锚点主题拆条）
 *   ✅ BVP Atlas    — Bessemer 深度研究（列表页绝对链接正则提取）
 *   ❌ Carta        — Cloudflare JS 挑战拦截服务器抓取，暂缓（需浏览器渲染方案）
 *
 * 用法：node scripts/reports-monitor.mjs
 * 由 GitHub Actions 每周执行（reports-monitor.yml），也可手动触发
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) { console.error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }
if (!SRK) { console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

// ─── 工具函数（与 fetch-sources.mjs 同款，脚本保持自包含）───

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${txt.slice(0, 200)}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ai-opc-reports/1.0', ...opts.headers },
    signal: AbortSignal.timeout(25000),
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(s) {
  return decodeEntities((s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/** 解析 RSS item 与 Atom entry（与 fetch-sources 一致） */
function parseRSS(xml) {
  const items = [];
  const blocks = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) blocks.push([match[1], false]);
  while ((match = entryRegex.exec(xml)) !== null) blocks.push([match[1], true]);

  for (const [block, isAtom] of blocks) {
    const tm = block.match(/<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/);
    const title = decodeEntities(stripHtml(tm?.[1] || tm?.[2] || '').trim());
    if (!title) continue;

    let link = '';
    if (isAtom) {
      const lm = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/);
      link = (lm?.[1] || '').trim();
    } else {
      const lm = block.match(/<link>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/);
      link = (lm?.[1] || lm?.[2] || '').trim();
    }
    if (!link || !/^https?:\/\//.test(link)) continue;

    const dm = block.match(/<(?:description|summary|content|itunes:summary)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:description|summary|content|itunes:summary)>/);
    const snippet = stripHtml(dm?.[1] || dm?.[2] || '').slice(0, 300);

    const pm = block.match(/<(?:pubDate|published|updated)>([^<]+)<\/(?:pubDate|published|updated)>/) || block.match(/<dc:date>([^<]+)<\/dc:date>/);
    let publishedAt = null;
    if (pm?.[1]) {
      const d = new Date(pm[1].trim());
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    items.push({ title, source_url: link, snippet, published_at: publishedAt });
  }
  return items;
}

// ─── 各信源抓取 ─────────────────────────────────────────

/** IH Podcast：最新 8 期真实 MRR 访谈 */
async function fetchIhPodcast() {
  const xml = await fetchText('https://feeds.transistor.fm/the-indie-hackers-podcast');
  return parseRSS(xml).slice(0, 8).map(it => ({
    source_name: 'IH Podcast',
    source_url: it.source_url,
    title: `IH 访谈: ${it.title}`.slice(0, 200),
    snippet: `[真实收入访谈] ${it.snippet}`.slice(0, 300),
    published_at: it.published_at,
  }));
}

/** RevenueCat：最新 10 篇订阅经济文章 */
async function fetchRevenueCat() {
  const xml = await fetchText('https://www.revenuecat.com/rss.xml');
  return parseRSS(xml).slice(0, 10).map(it => ({
    source_name: 'RevenueCat',
    source_url: it.source_url,
    title: it.title.slice(0, 200),
    snippet: `[订阅经济数据] ${it.snippet}`.slice(0, 300),
    published_at: it.published_at,
  }));
}

/** YC RFS：单页按锚点主题拆条（页面是低频更新的创业方向清单） */
async function fetchYcRfs() {
  const html = await fetchText('https://www.ycombinator.com/rfs');
  const items = [];
  // 结构：<div id="anchor"><div ...><h3 ...>标题<span>...<a href="#anchor">... 正文 ...
  const chunks = html.split('<div id="');
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const anchor = (chunk.match(/^([a-z0-9-]+)"/) || [])[1];
    if (!anchor || anchor === 'the-primer') continue;  // the-primer 是导读页，不是创业方向
    const tm = chunk.match(/<h3[^>]*>([^<]+)</);
    const title = tm ? decodeEntities(tm[1].trim()) : '';
    if (!title || title.length < 6) continue;
    // 正文：去掉 h3 之前的部分后 strip
    const bodyStart = chunk.indexOf('</h3>');
    const body = bodyStart > 0 ? stripHtml(chunk.slice(bodyStart, bodyStart + 2000)) : '';
    items.push({
      source_name: 'YC RFS',
      source_url: `https://www.ycombinator.com/rfs#${anchor}`,
      title: `YC 创业方向: ${title}`.slice(0, 200),
      snippet: `[YC 官方 RFS] ${body.slice(0, 260)}`,
      published_at: null,
    });
  }
  return items;
}

/** BVP Atlas：从列表页提取文章绝对链接 + 锚文本标题 */
async function fetchBvpAtlas() {
  const html = await fetchText('https://www.bvp.com/atlas');
  const items = [];
  const seen = new Set();
  const aRegex = /<a[^>]+href="(https:\/\/www\.bvp\.com\/atlas\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = aRegex.exec(html)) !== null) {
    const url = match[1];
    if (seen.has(url)) continue;
    const title = stripHtml(match[2]);
    if (!title || title.length < 12 || /^read more/i.test(title)) continue;
    seen.add(url);
    items.push({
      source_name: 'BVP Atlas',
      source_url: url,
      title: title.slice(0, 200),
      snippet: `[Bessemer 深度研究] ${title}`.slice(0, 300),
      published_at: null,
    });
  }
  // 只保留最近 10 条（页面按时间倒序；upsert 去重，存量只在首次被吸收一轮）
  return items.slice(0, 10);
}

// ─── 主流程 ─────────────────────────────────────────────

const FETCHERS = [
  ['IH Podcast', fetchIhPodcast],
  ['RevenueCat', fetchRevenueCat],
  ['YC RFS', fetchYcRfs],
  ['BVP Atlas', fetchBvpAtlas],
];

async function main() {
  console.log('📰 Reports Monitor · 低频信源周报监测\n');

  let total = 0, written = 0, failed = 0;

  for (const [name, fn] of FETCHERS) {
    try {
      const items = await fn();
      total += items.length;
      console.log(`  ✅ ${name}: ${items.length} 条`);
      if (items.length > 0) {
        await sb('/radar_candidates?on_conflict=source_url', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(items),
        });
        written += items.length;
      }
    } catch (e) {
      console.warn(`  ⚠️ ${name} 抓取失败: ${e.message.slice(0, 120)}`);
      failed++;
    }
  }

  console.log('  ⏭️ Carta: 跳过（Cloudflare JS 挑战拦截服务器抓取，见 REFACTOR-PLAN 台账）');
  console.log(`\n📊 监测完成: 共 ${total} 条，${written} 条 upsert 写入，${failed} 个信源失败`);
  console.log('✅ Reports Monitor 结束');
}

main().catch(err => {
  console.error('❌ 未捕获异常:', err);
  process.exit(1);
});
