/**
 * AI OPC Weekly 自动生成脚本
 * 
 * 由 GitHub Actions 每周一 9:00 触发，调用 DeepSeek API 生成新一期周报，
 * 直接写入 Supabase。
 * 
 * 需要的环境变量：
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service_role key
 *   DEEPSEEK_API_KEY           — DeepSeek API key
 */

const SUPABASE_URL = 'https://lamkpavsvuhqhkknkaxc.supabase.co';
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!DEEPSEEK_KEY) {
  console.error('❌ 缺少 DEEPSEEK_API_KEY');
  process.exit(1);
}

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

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('🚀 AI OPC Weekly 自动生成开始');
  console.log('');

  // 1. 查最新期号
  console.log('📋 查询最新期号...');
  const res = await supabaseFetch('/weekly_issues?select=issue_number&order=issue_number.desc&limit=1');
  const rows = await res.json();
  const latestIssue = rows[0]?.issue_number || 26;
  const newIssue = latestIssue + 1;
  console.log(`   最新: #${latestIssue} → 新期: #${newIssue}`);

  const now = new Date();
  const year = now.getFullYear();
  const weekNum = getISOWeekNumber(now);
  const { start, end } = getWeekRange(weekNum, year);
  const slug = `${year}-w${String(weekNum).toLowerCase()}`;

  console.log(`   slug: ${slug} | ${start} ~ ${end}`);

  // 2. 调用 DeepSeek 生成内容
  console.log('');
  console.log('🤖 调用 DeepSeek 生成 12 条内容...');

  const prompt = `你是一位 AI 创业趋势分析师。请为中文周报「AI OPC Weekly」生成 12 条 AI 创业机会（${start} 至 ${end} 当周）。

要求：
- 6 个分类各 2 条：micro-saas、design-assets、automation、content-monetize、indie-tool、digital-product
- 每条 title 为具体项目/方向名称
- description 为 150-300 字中文，客观第三人称，**禁止使用「你」「你的」等第二人称**
- insight 为 80-150 字中文落地路径分析
- 数据要基于 2026 年 7 月的最新趋势
- mrr_range 为单人可实现月收入，pricing 为定价模式，mvp_time 为开发时间
- refs 提供 2-3 个真实可访问的参考链接
- creator_level 和 compound_potential 用 high/medium/low
- rank 从 1 到 12 按推荐度排序

请只返回一个 JSON 数组，不要包含任何其他文字。格式如下：
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

  const aiRes = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一位 AI 创业趋势分析师。只返回 JSON，不包含任何额外文字。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 8192,
    }),
  });

  if (!aiRes.ok) {
    const err = await aiRes.text();
    throw new Error(`DeepSeek API ${aiRes.status}: ${err.slice(0, 300)}`);
  }

  const aiData = await aiRes.json();
  const content = aiData.choices?.[0]?.message?.content || '';
  
  // 尝试提取 JSON（有时 AI 会用 markdown 代码块包裹）
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

  if (!Array.isArray(items) || items.length < 12) {
    console.error(`❌ 生成内容不足：${items?.length || 0} 条（需要 12 条）`);
    process.exit(1);
  }

  console.log(`   ✅ 生成 ${items.length} 条内容`);
  console.log(`   Tokens: in=${aiData.usage?.prompt_tokens} out=${aiData.usage?.completion_tokens}`);

  // 3. 写入 Supabase
  console.log('');
  console.log('💾 写入 Supabase...');

  // 创建 weekly_issue
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

  if (!issueId) {
    throw new Error('创建 weekly_issue 失败');
  }
  console.log(`   ✅ weekly_issue: ${issueId}`);

  // 批量插入 news_items
  const newsItems = items.map((item, i) => ({
    ...item,
    weekly_issue_id: issueId,
    rank: item.rank || i + 1,
  }));

  const itemsRes = await supabaseFetch('/news_items', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(newsItems),
  });

  if (!itemsRes.ok) {
    throw new Error('插入 news_items 失败');
  }

  console.log(`   ✅ ${items.length} 条 news_items`);

  // 4. 验证
  console.log('');
  console.log('✅ W' + newIssue + ' 周报生成完成！');
  console.log(`🌐 https://www.aiopcnews.com/weekly/${slug}`);
}

main().catch(err => {
  console.error('');
  console.error('💥 失败:', err.message);
  process.exit(1);
});
