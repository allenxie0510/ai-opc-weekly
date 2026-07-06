/**
 * AI OPC Weekly 自动生成脚本 v3 — 纯智谱 GLM
 * 
 * 使用智谱 GLM-4-Air + 内置联网搜索，一步到位生成周报。
 * 一个 API key，搜索+生成一条龙。
 * 
 * 需要的环境变量（GitHub Secrets）：
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service_role key
 *   ZHIPU_API_KEY             — 智谱 API key
 * 
 * API 文档：https://docs.bigmodel.cn/cn/api/introduction
 */

const SUPABASE_URL = 'https://lamkpavsvuhqhkknkaxc.supabase.co';
const ZHIPU_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZHIPU_KEY = process.env.ZHIPU_API_KEY;

if (!SERVICE_ROLE_KEY) { console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ZHIPU_KEY) { console.error('❌ 缺少 ZHIPU_API_KEY'); process.exit(1); }

// ─── 工具函数 ───────────────────────────────────────────

function getISOWeekNumber(d: Date): number {
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const jan4 = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

function getWeekRange(weekNum: number, year: number): { start: string; end: string } {
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNum - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY!}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

async function braveSearch(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  const res = await fetch(`${BRAVE_API}?q=${encodeURIComponent(query)}&count=5&search_lang=en`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_KEY!,
    },
  });
  if (!res.ok) throw new Error(`Brave Search ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.web?.results || []).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
  }));
}

// ─── 搜索关键词 ─────────────────────────────────────────

const SEARCH_QUERIES = [
  { key: 'micro-saas', q: 'AI micro SaaS indie hacker 2026 revenue' },
  { key: 'design-assets', q: 'AI design assets marketplace digital product 2026' },
  { key: 'automation', q: 'no code AI automation workflow tool 2026' },
  { key: 'content-monetize', q: 'AI content monetization solo creator 2026' },
  { key: 'indie-tool', q: 'indie developer AI tool one person business 2026' },
  { key: 'digital-product', q: 'AI digital product template notion prompt 2026' },
];

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('🚀 AI OPC Weekly — 智谱 GLM-4-Air 自动生成');
  console.log('');

  // 1. 查最新期号
  console.log('📋 查询最新期号...');
  const res1 = await supabaseFetch('/weekly_issues?select=issue_number&order=issue_number.desc&limit=1');
  const rows = await res1.json();
  const latestIssue = rows[0]?.issue_number || 27;
  const newIssue = latestIssue + 1;
  const year = new Date().getFullYear();
  const weekNum = getISOWeekNumber(new Date());
  const { start, end } = getWeekRange(weekNum, year);
  const slug = `${year}-w${String(weekNum).toLowerCase()}`;
  console.log(`   #${latestIssue} → #${newIssue} | ${slug} | ${start}~${end}`);

  // 2. 调智谱 GLM（联网搜索 + 生成，一步完成）
  console.log('');
  console.log('🤖 智谱 GLM-4-Air 联网搜索 + 生成 12 条内容...');

  const prompt = `你是一位 AI 创业趋势分析师。请先联网搜索最新趋势，然后为中文周报「AI OPC Weekly」生成 12 条 AI 创业机会（${start} 至 ${end} 当周）。

生成要求：
- 6 个分类各 2 条：micro-saas、design-assets、automation、content-monetize、indie-tool、digital-product
- 每条 title 为具体项目/方向名称，优先引用搜索结果中的真实项目
- description 为 150-300 字中文，客观第三人称，**禁止使用「你」「你的」等第二人称**
- insight 为 80-150 字中文落地路径分析
- mrr_range 为单人可实现月收入，pricing 为定价模式，mvp_time 为开发时间
- refs 引用搜索结果中的真实 URL（2-3 个），不要编造链接
- creator_level 和 compound_potential 用 high/medium/low
- rank 从 1 到 12 按推荐度排序

请先联网搜索以下方向的 2026 年 7 月最新趋势，再基于结果生成：
- AI micro SaaS indie hacker July 2026
- AI design assets marketplace July 2026
- no code AI automation tool July 2026
- AI content monetization solo creator July 2026
- indie developer AI tool one person business July 2026
- AI digital product template notion prompt July 2026

请只返回一个 JSON 数组，不要包含任何其他文字。格式：
[
  {
    "title": "...",
    "description": "...",
    "insight": "...",
    "category": "micro-saas",
    "creator_level": "medium",
    "compound_potential": "high",
    "mrr_range": "$500-2K",
    "pricing": "$9-49/月",
    "mvp_time": "2-3周",
    "refs": [{"label": "来源", "url": "https://..."}],
    "tags": ["AI", "SaaS"],
    "rank": 1
  }
]`;

  const aiRes = await fetch(ZHIPU_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4-air',
      messages: [
        { role: 'system', content: '你是一位 AI 创业趋势分析师。请基于你的知识生成内容，只返回 JSON 数组，不要包含任何额外文字。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!aiRes.ok) {
    const err = await aiRes.text();
    throw new Error(`Zhipu API ${aiRes.status}: ${err.slice(0, 300)}`);
  }

  const aiData = await aiRes.json();
  const content = aiData.choices?.[0]?.message?.content || '';

  // 提取 JSON
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('❌ 无法解析 AI 返回的 JSON');
    console.error('原始返回:', content.slice(0, 500));
    process.exit(1);
  }

  let items;
  try {
    items = JSON.parse(jsonMatch[0]);
  } catch {
    console.error('❌ JSON 解析失败');
    console.error('匹配内容:', jsonMatch[0].slice(0, 500));
    process.exit(1);
  }

  if (!Array.isArray(items) || items.length < 10) {
    console.error(`❌ 生成内容不足：${items?.length || 0} 条（需要 ≥10 条）`);
    process.exit(1);
  }

  console.log(`   ✅ 生成 ${items.length} 条内容`);
  const usage = aiData.usage || {};
  console.log(`   Tokens: in=${usage.prompt_tokens} out=${usage.completion_tokens}`);
  console.log(`   Web Search: ${usage.web_search ? '✅ 已使用' : '⚠️ 未触发'}`);

  // 4. 写入 Supabase
  console.log('');
  console.log('💾 写入 Supabase...');

  const issueRes = await supabaseFetch('/weekly_issues', {
    method: 'POST',
    body: JSON.stringify({
      slug,
      issue_number: newIssue,
      year,
      week_number: weekNum,
      week_start: start,
      week_end: end,
      title: `AI OPC Weekly #${newIssue}`,
      summary: `本周精选 12 个独立创作者 AI 创业机会，覆盖微SaaS、设计资产、自动化、内容变现、小而美工具、虚拟产品六大方向。`,
      cover_image: '',
      status: 'published',
      published_at: new Date().toISOString(),
    }),
  });

  const issueData = await issueRes.json();
  const issueId = Array.isArray(issueData) ? issueData[0]?.id : issueData?.id;
  if (!issueId) throw new Error('创建 weekly_issue 失败');
  console.log(`   ✅ weekly_issue: ${issueId}`);

  const newsItems = items.slice(0, 12).map((item: any, i: number) => ({
    ...item,
    weekly_issue_id: issueId,
    rank: item.rank || i + 1,
  }));

  await supabaseFetch('/news_items', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(newsItems),
  });
  console.log(`   ✅ ${newsItems.length} 条 news_items`);

  // 4. 汇总
  console.log('');
  const dist: Record<string, number> = {};
  items.slice(0, 12).forEach((i: any) => { dist[i.category] = (dist[i.category] || 0) + 1; });
  console.log('📊 分类分布:');
  Object.entries(dist).forEach(([cat, n]) => console.log(`   ${cat}: ${n} 条`));

  console.log('');
  console.log('✅ W' + newIssue + ' 周报生成完成！');
  console.log(`🌐 https://www.aiopcnews.com/weekly/${slug}`);
}

main().catch(err => {
  console.error('');
  console.error('💥 失败:', err.message);
  process.exit(1);
});
