/**
 * OPC Radar · 每日生成脚本
 * 从 radar_candidates（近36小时）+ tweets（近24小时）取素材，
 * 用智谱 GLM 筛选出「AI × 一人公司创业」相关快讯，写入 radar_items。
 *
 * 用法：node scripts/generate-radar.mjs
 * 由 GitHub Actions 每日执行（daily-radar.yml）
 *
 * 环境变量：
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（缺失则报错退出）
 *   ZHIPU_API_KEY（缺失则报错退出）
 *   RADAR_AUTO_PUBLISH = 'true' 时直接发布，否则写入 draft 待人工审核（默认 draft）
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterRadarItems, selectCandidateMaterials } from './lib/radar-policy.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZK = process.env.ZHIPU_API_KEY;

if (!SUPABASE_URL) { console.error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }
if (!SRK) { console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ZK) { console.error('❌ 缺少 ZHIPU_API_KEY'); process.exit(1); }

// 免费模型按顺序兜底：429/1305 拥挤或持续失败时换下一个
const GLM_MODELS = ['glm-4.7-flash', 'glm-4.5-flash'];
const ZHIPU_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const AUTO_PUBLISH = process.env.RADAR_AUTO_PUBLISH === 'true';

// 拉宽读取窗口，再由 radar-policy 做 founder/enabler/context 分层配额。
// 旧逻辑只取 fetched_at 最新 40 条，后抓的大媒体能直接挤掉 founder-first 来源。
const CANDIDATE_LIMIT = 500;
const TWEET_LIMIT = 100;

// Source Tier（确定性映射，不让模型定级）：
// S 一手证据（GitHub 数据/官方源）/ A 创始人一手发布/结构化数据 / B 可靠媒体/机构分析 / C 社区信号 / D 二手
const SOURCE_TIER_MAP = {
  'GitHub Trending': 'S',
  'Show HN': 'A',        // 创始人一手发布的 0→1 产品
  'Product Hunt': 'A',   // 新品类雷达，投票数据可佐证热度
  'BetaList AI': 'A',    // 早期产品结构化发布页
  'Reddit r/SideProject': 'C', // 创作者一手社区信号，真实性仍需原帖支撑
  'IH Podcast': 'A',     // 创始人亲述真实收入访谈
  'RevenueCat': 'A',     // 订阅经济一手数据/年度报告
  'YC RFS': 'A',         // YC 官方创业方向清单
  'TechCrunch AI': 'B',
  'The Verge AI': 'B',
  '36氪': 'B',          // 已下线（feed 反爬），保留映射防历史数据失配
  '少数派': 'B',
  'AI + a16z': 'B',      // 机构一手分析（播客文字稿摘要）
  'BVP Atlas': 'B',      // Bessemer 机构深度研究
  'Hacker News': 'C',
};
function tierOf(sourceName) {
  if (!sourceName) return 'C';
  if (sourceName.startsWith('X/@')) return 'C';
  return SOURCE_TIER_MAP[sourceName] || 'C';
}

// ─── 工具函数 ───────────────────────────────────────────

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${txt.slice(0, 200)}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 抓取原文页面的 Open Graph 封面图（og:image → twitter:image 兜底）
// 失败返回空串，不阻塞主流程
async function fetchOgImage(url) {
  try {
    if (!/^https?:\/\//i.test(url)) return '';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return '';
    const html = (await res.text()).slice(0, 200 * 1024); // OG meta 在 <head>，200KB 足够
    const m =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image/i) ||
      html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image/i);
    if (!m) return '';
    const img = m[1].trim().replace(/&amp;/g, '&');
    // 声明了 og:image:width 且低于 800px 的图太糊，宁缺毋滥
    const wm =
      html.match(/<meta[^>]+property=["']og:image:width["'][^>]*content=["'](\d+)["']/i) ||
      html.match(/<meta[^>]+content=["'](\d+)["'][^>]*property=["']og:image:width["']/i);
    if (wm && parseInt(wm[1], 10) > 0 && parseInt(wm[1], 10) < 800) return '';
    return /^https?:\/\//i.test(img) ? img : '';
  } catch {
    return '';
  }
}

// 读取主编点评风格样本（scripts/style-samples.md，以 "- " 开头的行为有效样本）
// 无有效样本时返回空数组，prompt 不注入，行为与之前一致
function loadStyleSamples() {
  try {
    const raw = readFileSync(join(SCRIPT_DIR, 'style-samples.md'), 'utf8');
    return raw.split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('- ') && !l.startsWith('#'))
      .map(l => l.slice(2).trim())
      .filter(l => l.length >= 20); // 过短的不像真实点评，忽略
  } catch {
    return [];
  }
}

async function callGLMOnce(sysPrompt, userPrompt, model, temperature) {
  const res = await fetch(ZHIPU_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZK}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
      temperature,
      max_tokens: 8192,  // 候选快讯 + 五维 fit JSON 约4-6K tokens，4096 可能截断
      thinking: { type: 'disabled' }  // 关闭推理模式：否则思考过程吃光 token，正文 content 为空
    })
  });
  const txt = await res.text();
  if (!res.ok) {
    const err = new Error(`GLM ${res.status}: ${txt.slice(0, 200)}`);
    err.congested = res.status === 429 || txt.includes('1305'); // 模型拥挤，可换模型
    err.censored = txt.includes('1301'); // 内容审查
    throw err;
  }
  const data = JSON.parse(txt);
  const content = data.choices?.[0]?.message?.content || '';
  // 匹配最外层 JSON 对象 {"items": [...], "rejected": [...]}
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) {
    const fr = data.choices?.[0]?.finish_reason;
    throw new Error(`无JSON(finish=${fr}): ${(content || txt).slice(0, 150)}`);
  }
  const parsed = JSON.parse(m[0]);
  if (!Array.isArray(parsed.items)) throw new Error('items 字段不是数组');
  console.log(`   ✅ 模型候选 ${parsed.items.length} 条 | 模型=${model} | tok in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}`);
  return parsed;
}

async function callGLM(sysPrompt, userPrompt) {
  let lastErr;
  for (const model of GLM_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callGLMOnce(sysPrompt, userPrompt, model, 0.5 + attempt * 0.1);
      } catch (e) {
        lastErr = e;
        if (e.congested) {
          const wait = 20 + attempt * 20; // 20s / 40s / 60s 退避
          console.log(`   ⚠️ ${model} 拥挤(429)，${wait}s 后重试 ${attempt + 1}/3...`);
          await sleep(wait * 1000);
          continue;
        }
        if (e.censored) {
          console.log(`   ⚠️ 内容审查触发，重试 ${attempt + 1}/3...`);
          continue;
        }
        console.log(`   ⚠️ ${e.message.slice(0, 80)}，重试 ${attempt + 1}/3...`);
        await sleep(5000);
      }
    }
    console.log(`   ⏭️ ${model} 连续失败，切换兜底模型...`);
  }
  throw lastErr;
}

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('🚀 OPC Radar · 每日生成');
  console.log(`   模型: ${GLM_MODELS.join(' → ')} | 发布模式: ${AUTO_PUBLISH ? '自动 published' : 'draft 待审核'}\n`);

  // 1. 取素材：radar_candidates 最近 72 小时（扩大召回，不等于扩大入模）
  console.log('📥 读取素材...');
  const candCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const candidates = await sb(
    `/radar_candidates?fetched_at=gte.${encodeURIComponent(candCutoff)}&order=fetched_at.desc&limit=${CANDIDATE_LIMIT}`
  );
  console.log(`   radar_candidates(72h): ${(candidates || []).length} 条`);

  // 2. 取素材：tweets 最近 24 小时（content 截断 300 字）
  const tweetCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const tweets = await sb(
    `/tweets?published_at=gte.${encodeURIComponent(tweetCutoff)}&order=published_at.desc&limit=${TWEET_LIMIT}`
  );
  console.log(`   tweets(24h): ${(tweets || []).length} 条`);

  // 2.5 排重：拉取近 48h 已处理（draft/published/rejected）的 source_url，
  // 防止手动触发 + 定时补跑在同一天内把同一素材重复生成
  const seenCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const seen = await sb(
    `/radar_items?select=source_url&published_at=gte.${encodeURIComponent(seenCutoff)}&limit=500`
  );
  const seenUrls = new Set((seen || []).map(r => r.source_url).filter(Boolean));
  console.log(`   近48h已处理 URL: ${seenUrls.size} 条（将跳过）`);

  // 3. founder-first 分层抽样，跳过已处理 URL。大媒体/大公司只占 context 小配额。
  const materials = selectCandidateMaterials(candidates || [], tweets || [], seenUrls, 54);
  const materialText = materials.map(c => {
    const laneLabel = { founder: '创始人/小团队一手', enabler: '工具与生态', context: '行业背景' }[c.policy.lane];
    return `[${c.source_name} | ${laneLabel}] ${c.title}${c.snippet ? ' — ' + c.snippet.slice(0, 220) : ''}\nURL: ${c.source_url}`;
  }).join('\n---\n');
  const laneCounts = materials.reduce((acc, c) => {
    acc[c.policy.lane] = (acc[c.policy.lane] || 0) + 1;
    return acc;
  }, {});
  console.log(`   分层入模: ${materials.length} 条 | founder=${laneCounts.founder || 0} enabler=${laneCounts.enabler || 0} context=${laneCounts.context || 0}`);

  if (!materialText) {
    console.log('\n⚠️ 没有可用素材，跳过本次生成');
    return;
  }

  // 4. GLM 筛选
  console.log('\n🤖 GLM 筛选...');
  const sys = `你是「OPC Radar · 一人雷达」的编辑。这不是泛 AI 新闻摘要，而是面向一人公司（OPC）和 2–5 人小团队的创业机会雷达。你的默认动作是拒绝；素材不能导向具体用户、痛点、产品、商业模式、分发或成本变化时，就不收录。你只从给定素材中筛选，绝不补写素材没有提供的事实、收入或团队规模。只返回一个 JSON 对象。`;

  // 主编风格样本（few-shot）：有样本时注入口吻要求
  const samples = loadStyleSamples();
  const styleBlock = samples.length > 0
    ? `\n写作风格（最高优先级）：以下是主编写过的点评样本。editor_note 必须模仿这些样本的口吻、节奏、用词习惯和立场强度。
主编口吻铁律：
- 克制书面语，不用"震撼/疯狂/炸裂/颠覆"等情绪词，也不说"值得注意的是""综上所述""赋能"这类 AI 腔
- 第一人称写主编自己的真实使用经历或判断（我目前也在…/我会尝试…/我始终认为…），但不口语化
- 指代读者用"个体创业者/独立开发者"，不用"你/你的"
- 结构：现象 → 对个体创业者的意义 → 自身实践或明确判断收尾；判断要落到方向或行动，不中立和稀泥
样本：
${samples.map(s => `- ${s}`).join('\n')}\n`
    : '';
  if (samples.length > 0) console.log(`   ✍️ 注入主编风格样本: ${samples.length} 条`);

  const user = `以下是今天抓取到的真实素材。每条已标注来源层：
- 创始人/小团队一手：优先，关注真实产品、做法、收入、客户和复盘
- 工具与生态：只有直接改变小团队能力、成本或分发时才收录
- 行业背景：默认不收录；只有可迁移成一人公司具体动作时才可作为例外

${materialText}

任务：筛选 0–8 条候选快讯，宁缺毋滥。优先级依次为：
1. 个人或 2–5 人团队用 AI 解决具体场景，并公开产品、客户、收入、定价、获客或构建过程；
2. 可由小团队在数周内验证的垂直机会，素材中能看出谁付费、为什么付费或从哪里触达；
3. 让一人公司在开发、交付、获客、运营上出现明确成本/能力变化的工具或平台；
4. 大公司动态仅作例外：必须写出一条素材直接支持的、可在 30 天内验证的迁移动作。只有“说明赛道很热”“可基于 API 做应用”“降低门槛”“关注生态”一律不算迁移价值。

直接拒绝：融资/估值/收购本身、模型榜单或新品发布本身、CEO 观点、宏观趋势、泛效率工具、把任何大公司功能牵强改写成“独立开发者可做垂直版”。如果素材没有团队规模或收入，不得猜测为单人项目或已验证商业模式。
${styleBlock}
输出一个 JSON 对象（不要输出其他文字），结构如下：
{
  "items": [
    {
      "title": "中文标题（可改写素材原标题，30字以内）",
      "summary": "60–120字中文摘要，说清楚已知事实及其对一人公司的直接意义",
      "source_name": "素材来源名",
      "source_url": "素材中的原始 URL（必须原样复制，不得编造）",
      "evidence_quote": "从该条素材的标题或摘要中逐字复制 8–80 个字符，作为事实锚点",
      "editor_note": "50–100字编辑点评，第一人称（我/我看），有明确立场，不中立和稀泥${samples.length > 0 ? '，口吻严格对齐上方样本' : ''}",
      "pick_reason": "收录理由标签，如：已验证收入 / 单人可复现 / 具体痛点 / 获客路径 / 成本变化 / 模式可迁移",
      "signal_type": "必须是以下之一: product（新产品/功能）/ launch（发布上线）/ funding（融资）/ m-and-a（收购并购）/ model（模型或API变化）/ policy（政策监管）/ metric（收入或增长数据披露）",
      "category": "必须是以下之一: micro-saas / design-assets / automation / content-monetize / indie-tool / digital-product / other",
      "company_scale": "必须是以下之一: solo / small-team / large-company / unknown；素材未写则 unknown",
      "migration_play": "仅 large-company 候选必填：素材直接支持的可迁移动作、目标用户和30天验证方式；其他候选填空字符串",
      "fit": {
        "audience_relevance": "0–5，是否直接服务 OPC 创业决策；泛 AI 新闻不得高于2",
        "actionability": "0–5，是否能明确说出下一步验证动作",
        "evidence_strength": "0–5，素材是否提供一手发布、数据、产品或具体案例",
        "solo_feasibility": "0–5，个人/2–5人是否能在有限资金下复现或利用",
        "transferability": "0–5，模式/做法是否能迁移，而非只值得围观"
      }
    }
  ]
}

分类桶定义（严格按边界归类；拿不准一律归 other，不要硬塞进相近桶）：
- micro-saas：订阅制微型软件服务。例：按月收费的 AI 写作工具、垂直行业小 SaaS
- design-assets：可售卖的设计素材/模板/字体/图标。例：UI 套件、图标包
- automation：工作流自动化与集成编排。例：Zapier 类工具、自动报表机器人
- content-monetize：内容创作与变现。例：付费 newsletter、在线课程、自媒体工具
- indie-tool：不属于以上四类的独立开发者小工具——仅在前四类都不沾边时使用，不要把所有"工具"都归这里
- digital-product：虚拟/数字商品。例：Notion 模板、电子书、提示词包
- other：以上六类都不是，或素材信息不足以判断

要求：
- items 可以为空，最多 8 条；不要为了数量降低标准
- 同一 source_name 最多 2 条；large-company 最多 1 条
- 所有 source_url 必须来自素材清单原文，不得编造
- evidence_quote 必须逐字存在于对应素材标题或摘要中；不得改写、翻译或拼接
- summary 和 editor_note 用中文，不用「你/你的」
- 每个 fit 维度必须独立评分，不得因为“AI 很重要”而全部给高分
- 只返回 JSON 对象本身`;

  const result = await callGLM(sys, user);

  // 4.5 硬门槛复核：来源 URL、五维 OPC fit、单源配额、大公司上限均由代码执行。
  // 模型无法用高总分绕过任一低维度，也不能把素材外 URL 写入数据库。
  const filtered = filterRadarItems(result.items || [], materials, { maxItems: 6, minimumScore: 70 });
  const rejectStats = filtered.rejected.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] || 0) + 1;
    return acc;
  }, {});
  console.log(`   🧭 硬门槛后保留 ${filtered.accepted.length}/${(result.items || []).length} 条${filtered.rejected.length ? ` | 拒绝 ${JSON.stringify(rejectStats)}` : ''}`);

  // 5. 写入 radar_items
  console.log('\n💾 写入 radar_items...');
  const now = new Date().toISOString();
  const itemStatus = AUTO_PUBLISH ? 'published' : 'draft';

  const items = filtered.accepted.map(it => {
    const baseNote = String(it.editor_note || '').trim();
    const migration = String(it.migration_play || '').trim();
    return {
      title: String(it.title || '').slice(0, 200),
      summary: String(it.summary || '').slice(0, 500),
      source_name: String(it.source_name || ''),
      source_url: String(it.source_url || ''),
      // 总分由五维 fit 按固定权重计算，不采用模型自报的“印象分”。
      score: it.score,
      // 大公司例外的迁移动作必须随内容进入审核台，不能只在过滤时看过即丢。
      editor_note: `${baseNote}${it._large_company && migration ? ` 迁移验证：${migration}` : ''}`.slice(0, 500),
      pick_reason: String(it._large_company ? '可迁移验证' : (it.pick_reason || '')).slice(0, 100),
      // 分类白名单校验（与 signal_type 同款）：缺失/不在桶列表 → 'other'（其他），
      // 不再兜底 indie-tool（小而美）——根因修复：兜底倒进最大桶 + 无边界定义导致小而美桶占比 ~40%
      category: ['micro-saas', 'design-assets', 'automation', 'content-monetize', 'indie-tool', 'digital-product', 'other'].includes(it.category) ? it.category : 'other',
      signal_type: ['product', 'launch', 'funding', 'm-and-a', 'model', 'policy', 'metric'].includes(it.signal_type) ? it.signal_type : 'product',
      source_tier: tierOf(String(it.source_name || '')),
      status: itemStatus,
      published_at: now,
    };
  });

  // 5.1 抓取封面图（OG image，并发，单条失败不影响整体）
  console.log('\n🖼️ 抓取封面图...');
  const covers = await Promise.all(items.map(it => fetchOgImage(it.source_url)));
  let coverOk = 0;
  items.forEach((it, i) => {
    it.image_url = covers[i] || '';
    if (covers[i]) coverOk++;
  });
  console.log(`   封面命中: ${coverOk}/${items.length}`);

  if (items.length > 0) {
    try {
      await sb('/radar_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(items) });
    } catch (e) {
      // 兼容：表缺新列时剥离后重试（请先执行 scripts/migration-001.sql）
      const msg = String(e.message);
      if (/image_url|signal_type|source_tier/.test(msg)) {
        console.log('   ⚠️ 表缺少新列（image_url/signal_type/source_tier），本次降级写入（请执行 scripts/migration-001.sql）');
        const stripped = items.map(item => {
          const compatible = { ...item };
          delete compatible.image_url;
          delete compatible.signal_type;
          delete compatible.source_tier;
          return compatible;
        });
        await sb('/radar_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(stripped) });
      } else {
        throw e;
      }
    }
  }

  // 6. 汇总
  console.log('\n📊 汇总:');
  console.log(`   收录 ${items.length} 条 → status = '${itemStatus}'`);
  if (!AUTO_PUBLISH) {
    console.log('\n⏳ 当前为 draft 模式：请到 Supabase 后台 radar_items 表人工审核，');
    console.log('   把 status 从 draft 改为 published 后才会出现在 /radar 页面。');
  }
  console.log('\n✅ OPC Radar 生成完成');
  console.log('🌐 https://www.aiopcnews.com/radar');
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
