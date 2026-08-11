/**
 * OPC Radar · 信源抓取脚本
 * 从多个公开信源抓取素材，写入 radar_candidates（按 source_url upsert 去重）
 *
 * 用法：node scripts/fetch-sources.mjs
 * 由 GitHub Actions 每日执行（daily-radar.yml）
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（缺失则报错退出）
 * 可选：GITHUB_TOKEN（GitHub Actions 内置；缺失时降级为无认证请求）
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) { console.error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }
if (!SRK) { console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

// ─── 信源列表（可自行增删）───────────────────────────────
const SOURCES = [
  {
    kind: 'hackernews',
    name: 'Hacker News',
    url: 'https://hn.algolia.com/api/v1/search?tags=front_page',
  },
  {
    kind: 'hackernews',
    name: 'Show HN',
    // 创始人一手发布的 0→1 新产品，OPC 最对口信号源
    url: 'https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=30',
  },
  {
    kind: 'github',
    name: 'GitHub Trending',
    // topic:artificial-intelligence + 近 7 天创建 + stars>50，按 stars 排序
    url: null, // URL 在抓取时动态生成（created:> 日期每天变化）
  },
  {
    kind: 'rss',
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
  },
  {
    kind: 'rss',
    name: 'The Verge AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
  },
  {
    kind: 'rss',
    name: '少数派',
    // 替代 36氪（36kr.com/feed 2026-08 起对服务器抓取返回反爬 HTML 页，确认失效）
    url: 'https://sspai.com/feed',
  },
  {
    kind: 'rss',
    name: 'AI + a16z',
    // a16z 文章 RSS 已失效（官网改版后 404），改接其 AI 旗舰播客 feed（Simplecast，结构标准）
    url: 'https://feeds.simplecast.com/Hb_IuXOo',
  },
];

// ─── 工具函数 ───────────────────────────────────────────

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
    headers: { 'User-Agent': 'ai-opc-weekly-radar/1.0', ...opts.headers },
    signal: AbortSignal.timeout(20000),
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(s) {
  return decodeEntities((s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/** 解析标准 RSS item 与 Atom entry 两种结构：title / link / description / pubDate */
function parseRSS(xml) {
  const items = [];

  // RSS 2.0 <item> 与 Atom <entry> 统一成 (block, isAtom) 处理
  const blocks = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) blocks.push([match[1], false]);
  while ((match = entryRegex.exec(xml)) !== null) blocks.push([match[1], true]);

  for (const [block, isAtom] of blocks) {
    const tm = block.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/);
    const title = decodeEntities(stripHtml(tm?.[1] || tm?.[2] || '').trim());
    if (!title) continue;

    // Atom 的 link 是 <link href="..."/> 空标签，RSS 是 <link>url</link>
    let link = '';
    if (isAtom) {
      const lm = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/);
      link = (lm?.[1] || '').trim();
    } else {
      const lm = block.match(/<link>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/);
      link = (lm?.[1] || lm?.[2] || '').trim();
    }
    if (!link || !/^https?:\/\//.test(link)) continue;

    const dm = block.match(/<(?:description|summary|content)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:description|summary|content)>/);
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

async function fetchHackerNews(source) {
  const txt = await fetchText(source.url);
  const data = JSON.parse(txt);
  const hits = (data.hits || []).filter(h => h.title && h.url);
  return hits.slice(0, 30).map(h => ({
    source_name: source.name,
    source_url: h.url,
    title: h.title,
    snippet: `[HN ▲${h.points || 0}] ${h.title}`.slice(0, 300),
    published_at: h.created_at || null,
  }));
}

async function fetchGitHubTrending(source) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`topic:artificial-intelligence created:>${since} stars:>50`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`;

  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  } else {
    console.warn('   ⚠️ 无 GITHUB_TOKEN，GitHub API 降级为无认证请求（限流更严格）');
  }

  const txt = await fetchText(url, { headers });
  const data = JSON.parse(txt);
  return (data.items || []).slice(0, 20).map(r => ({
    source_name: source.name,
    source_url: r.html_url,
    title: `${r.full_name} — ${r.name}`,
    snippet: `[GitHub ★${r.stargazers_count || 0}] ${(r.description || '').slice(0, 200)}`.slice(0, 300),
    published_at: r.created_at || null,
  }));
}

async function fetchRSS(source) {
  const xml = await fetchText(source.url);
  if (!xml.includes('<item>') && !xml.includes('<entry>')) throw new Error('无 item/entry 节点（feed 可能失效或格式变更）');
  return parseRSS(xml).slice(0, 20).map(it => ({
    source_name: source.name,
    source_url: it.source_url,
    title: it.title,
    snippet: it.snippet,
    published_at: it.published_at,
  }));
}

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('📡 OPC Radar · 信源抓取开始\n');

  let total = 0, written = 0, failed = 0;

  for (const source of SOURCES) {
    try {
      let items;
      if (source.kind === 'hackernews') items = await fetchHackerNews(source);
      else if (source.kind === 'github') items = await fetchGitHubTrending(source);
      else if (source.kind === 'rss') items = await fetchRSS(source);
      else { console.warn(`  ⚠️ 未知信源类型: ${source.kind}`); continue; }

      total += items.length;
      console.log(`  ✅ ${source.name}: ${items.length} 条素材`);

      // upsert 去重（按 source_url 唯一约束；必须带 on_conflict，否则批次中任意一条重复会导致整批 409）
      if (items.length > 0) {
        await sb('/radar_candidates?on_conflict=source_url', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(items),
        });
        written += items.length;
      }
    } catch (e) {
      // 单个源失败只警告，不中断整体
      console.warn(`  ⚠️ ${source.name} 抓取失败: ${e.message.slice(0, 120)}`);
      failed++;
    }
  }

  console.log(`\n📊 抓取完成: 共 ${total} 条素材，${written} 条 upsert 写入，${failed} 个信源失败`);
  console.log('✅ 信源抓取结束');
}

main().catch(err => {
  console.error('❌ 未捕获异常:', err);
  process.exit(1);
});
