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

const CANDIDATE_LIMIT = 40;   // radar_candidates 取最近 36h 最多 N 条
const TWEET_LIMIT = 20;       // tweets 取最近 24h 最多 N 条

// Source Tier（确定性映射，不让模型定级）：
// S 一手证据（GitHub 数据/官方源）/ A 创始人一手发布/结构化数据 / B 可靠媒体/机构分析 / C 社区信号 / D 二手
const SOURCE_TIER_MAP = {
  'GitHub Trending': 'S',
  'Show HN': 'A',        // 创始人一手发布的 0→1 产品
  'TechCrunch AI': 'B',
  'The Verge AI': 'B',
  '36氪': 'B',          // 已下线（feed 反爬），保留映射防历史数据失配
  '少数派': 'B',
  'AI + a16z': 'B',      // 机构一手分析（播客文字稿摘要）
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
      max_tokens: 8192,  // 10条快讯+弃选的JSON约4-6K tokens，4096 会截断导致解析失败
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
  console.log(`   ✅ 收录 ${parsed.items.length} 条 | 模型=${model} | tok in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}`);
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

  // 1. 取素材：radar_candidates 最近 36 小时
  console.log('📥 读取素材...');
  const candCutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const candidates = await sb(
    `/radar_candidates?fetched_at=gte.${encodeURIComponent(candCutoff)}&order=fetched_at.desc&limit=${CANDIDATE_LIMIT}`
  );
  console.log(`   radar_candidates(36h): ${(candidates || []).length} 条`);

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

  // 3. 拼装素材清单（总量封顶 ~60 条），跳过已处理 URL
  const material = [];
  for (const c of candidates || []) {
    if (c.source_url && seenUrls.has(c.source_url)) continue;
    material.push(`[${c.source_name}] ${c.title}${c.snippet ? ' — ' + c.snippet.slice(0, 200) : ''}\nURL: ${c.source_url}`);
  }
  for (const t of tweets || []) {
    if (t.url && seenUrls.has(t.url)) continue;
    material.push(`[X/@${t.author_username}] ${(t.content || '').slice(0, 300)}\nURL: ${t.url}`);
  }
  const materialText = material.slice(0, 60).join('\n---\n');
  console.log(`   拼入 prompt 素材: ${Math.min(material.length, 60)} 条`);

  if (!materialText) {
    console.log('\n⚠️ 没有可用素材，跳过本次生成');
    return;
  }

  // 4. GLM 筛选
  console.log('\n🤖 GLM 筛选...');
  const sys = `你是「OPC Radar · 一人雷达」的编辑，一份面向 AI 一人公司（OPC）创业者的日更快讯。你只从给定素材中筛选，绝不编造素材之外的新闻。只返回一个 JSON 对象。`;

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

  const user = `以下是今天抓取到的素材（HN / GitHub / RSS / X 推文）：

${materialText}

任务：从以上素材中筛选与「AI × 一人公司 / 独立开发者 / solo 创业」直接相关的 5–10 条快讯。筛选标准：单人或小团队可复现的商业模式、已验证收入、独立开发者可用的 AI 工具/平台动态、影响 solo 创业者的政策或生态变化。
${styleBlock}
输出一个 JSON 对象（不要输出其他文字），结构如下：
{
  "items": [
    {
      "title": "中文标题（可改写素材原标题，30字以内）",
      "summary": "60–120字中文摘要，说清楚发生了什么、对一人创业者意味着什么",
      "source_name": "素材来源名",
      "source_url": "素材中的原始 URL（必须原样复制，不得编造）",
      "score": 0到100的整数（与主题相关度 + 创业参考价值）,
      "editor_note": "50–100字编辑点评，第一人称（我/我看），有明确立场，不中立和稀泥${samples.length > 0 ? '，口吻严格对齐上方样本' : ''}",
      "pick_reason": "收录理由标签，如：已验证收入 / 单人可复现 / 政策风向标 / 新工具红利 / 模式可迁移",
      "signal_type": "必须是以下之一: product（新产品/功能）/ launch（发布上线）/ funding（融资）/ m-and-a（收购并购）/ model（模型或API变化）/ policy（政策监管）/ metric（收入或增长数据披露）",
      "category": "必须是以下之一: micro-saas / design-assets / automation / content-monetize / indie-tool / digital-product"
    }
  ]
}

要求：
- items 恰好 5–10 条；不符合筛选标准的素材直接忽略，不输出、不解释（弃选即舍弃）
- 所有 source_url 必须来自素材清单原文，不得编造
- summary 和 editor_note 用中文，不用「你/你的」
- 只返回 JSON 对象本身`;

  const result = await callGLM(sys, user);

  // 5. 写入 radar_items
  console.log('\n💾 写入 radar_items...');
  const now = new Date().toISOString();
  const itemStatus = AUTO_PUBLISH ? 'published' : 'draft';

  const items = (result.items || []).map(it => ({
    title: String(it.title || '').slice(0, 200),
    summary: String(it.summary || '').slice(0, 500),
    source_name: String(it.source_name || ''),
    source_url: String(it.source_url || ''),
    score: Math.max(0, Math.min(100, parseInt(it.score, 10) || 0)),
    editor_note: String(it.editor_note || '').slice(0, 500),
    pick_reason: String(it.pick_reason || '').slice(0, 100),
    category: String(it.category || 'indie-tool'),
    signal_type: ['product', 'launch', 'funding', 'm-and-a', 'model', 'policy', 'metric'].includes(it.signal_type) ? it.signal_type : 'product',
    source_tier: tierOf(String(it.source_name || '')),
    status: itemStatus,
    published_at: now,
  }));

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
        const stripped = items.map(({ image_url, signal_type, source_tier, ...rest }) => rest);
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
