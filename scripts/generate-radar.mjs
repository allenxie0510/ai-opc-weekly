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

async function callGLMOnce(sysPrompt, userPrompt, model, temperature) {
  const res = await fetch(ZHIPU_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZK}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
      temperature,
      max_tokens: 4096
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
  if (!m) throw new Error(`无JSON: ${content.slice(0, 200)}`);
  const parsed = JSON.parse(m[0]);
  if (!Array.isArray(parsed.items)) throw new Error('items 字段不是数组');
  if (!Array.isArray(parsed.rejected)) parsed.rejected = [];
  console.log(`   ✅ 收录 ${parsed.items.length} 条 / 弃选 ${parsed.rejected.length} 条 | 模型=${model} | tok in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}`);
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

  // 3. 拼装素材清单（总量封顶 ~60 条）
  const material = [];
  for (const c of candidates || []) {
    material.push(`[${c.source_name}] ${c.title}${c.snippet ? ' — ' + c.snippet.slice(0, 200) : ''}\nURL: ${c.source_url}`);
  }
  for (const t of tweets || []) {
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

  const user = `以下是今天抓取到的素材（HN / GitHub / RSS / X 推文）：

${materialText}

任务：从以上素材中筛选与「AI × 一人公司 / 独立开发者 / solo 创业」直接相关的 5–10 条快讯。筛选标准：单人或小团队可复现的商业模式、已验证收入、独立开发者可用的 AI 工具/平台动态、影响 solo 创业者的政策或生态变化。

输出一个 JSON 对象（不要输出其他文字），结构如下：
{
  "items": [
    {
      "title": "中文标题（可改写素材原标题，30字以内）",
      "summary": "60–120字中文摘要，说清楚发生了什么、对一人创业者意味着什么",
      "source_name": "素材来源名",
      "source_url": "素材中的原始 URL（必须原样复制，不得编造）",
      "score": 0到100的整数（与主题相关度 + 创业参考价值）,
      "editor_note": "50–100字编辑点评，第一人称（我/我看），有明确立场，不中立和稀泥",
      "pick_reason": "收录理由标签，如：已验证收入 / 单人可复现 / 政策风向标 / 新工具红利 / 模式可迁移",
      "category": "必须是以下之一: micro-saas / design-assets / automation / content-monetize / indie-tool / digital-product"
    }
  ],
  "rejected": [
    {
      "title": "被弃选素材的标题",
      "source_name": "来源",
      "source_url": "原始 URL",
      "reject_reason": "一句话说明为什么弃选，如：大公司新闻与 solo 创业无关 / 纯技术论文无商业信号"
    }
  ]
}

要求：
- items 恰好 5–10 条，rejected 恰好 2–3 条（从剩余素材中选有代表性的弃选案例，用于显性化筛选逻辑）
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
    status: itemStatus,
    published_at: now,
  }));

  const rejected = (result.rejected || []).map(rj => ({
    title: String(rj.title || '').slice(0, 200),
    summary: '',
    source_name: String(rj.source_name || ''),
    source_url: String(rj.source_url || ''),
    score: 0,
    editor_note: '',
    pick_reason: '',
    category: null,
    status: 'rejected',
    reject_reason: String(rj.reject_reason || '').slice(0, 300),
    published_at: now,
  }));

  if (items.length > 0) {
    await sb('/radar_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(items) });
  }
  if (rejected.length > 0) {
    await sb('/radar_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rejected) });
  }

  // 6. 汇总
  console.log('\n📊 汇总:');
  console.log(`   收录 ${items.length} 条 → status = '${itemStatus}'`);
  console.log(`   弃选 ${rejected.length} 条 → status = 'rejected'`);
  if (!AUTO_PUBLISH) {
    console.log('\n⏳ 当前为 draft 模式：请到 Supabase 后台 radar_items 表人工审核，');
    console.log('   把 status 从 draft 改为 published 后才会出现在 /radar 页面。');
  }
  console.log('\n✅ OPC Radar 生成完成');
  console.log('🌐 https://www.aiopcnews.com/radar');
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
