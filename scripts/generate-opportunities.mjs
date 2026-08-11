/**
 * AI OPC · 机会生产线（Decision Engine v1）
 * 每周从近 7 天 Signals（radar_items）聚类 + GLM 联网调研，
 * 生成 2–3 个 Opportunity 草稿（七维评分 + Evidence Grade + Recommendation），
 * 写入 opportunities / cases 表，人工在 /admin 审核后发布。
 *
 * 用法：node scripts/generate-opportunities.mjs
 * 由 GitHub Actions 每周执行（weekly-opportunities.yml）
 *
 * 铁律：
 * - 一个机会必须 ≥3 条信号聚类支撑（Signal ≠ Opportunity）
 * - score_total 由代码按权重计算，不让模型拍总分
 * - evidence/case 的数字来源 URL 必须 HTTP 可达，否则抹除（Textify 教训）
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ZHIPU_API_KEY
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

const GLM_MODELS = ['glm-4.7-flash', 'glm-4.5-flash'];
const ZHIPU_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const VALID_CATEGORIES = ['micro-saas', 'design-assets', 'automation', 'content-monetize', 'indie-tool', 'digital-product'];
const VALID_RECS = ['BUILD', 'WATCH', 'NICHE_ONLY', 'SKIP'];
const VALID_TIMINGS = ['early', 'right-time', 'late'];

// 七维权重：总分由代码计算（Demand20/Solo20/Monetization15/Distribution15/Timing15/Defensibility10/Operating5）
const WEIGHTS = {
  score_demand: 0.20,
  score_solo_fit: 0.20,
  score_monetization: 0.15,
  score_distribution: 0.15,
  score_timing: 0.15,
  score_defensibility: 0.10,
  score_operating: 0.05,
};

// Source Tier 确定性映射（S 一手 / A 结构化 / B 可靠媒体 / C 社区 / D 二手）
const TIER_MAP = {
  'GitHub': 'S', 'GitHub Trending': 'S', 'OpenAI': 'S', 'Anthropic': 'S', 'Hugging Face': 'S',
  'YC': 'A', 'Y Combinator': 'A', 'RevenueCat': 'A', 'Acquire.com': 'A', 'Carta': 'A', 'Dealroom': 'A',
  'TechCrunch': 'B', 'TechCrunch AI': 'B', 'The Verge': 'B', 'The Verge AI': 'B',
  'Reuters': 'B', 'Bloomberg': 'B', 'Financial Times': 'B', '36氪': 'B',
  'Hacker News': 'C', 'Indie Hackers': 'C', 'Product Hunt': 'C', 'Reddit': 'C', 'X': 'C',
};
function tierOf(name) {
  if (!name) return 'C';
  for (const [k, v] of Object.entries(TIER_MAP)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return 'C';
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

function loadStyleSamples() {
  try {
    const raw = readFileSync(join(SCRIPT_DIR, 'style-samples.md'), 'utf8');
    return raw.split('\n').map(l => l.trim())
      .filter(l => l.startsWith('- ') && !l.startsWith('#'))
      .map(l => l.slice(2).trim()).filter(l => l.length >= 20);
  } catch { return []; }
}

async function callGLMOnce(sysPrompt, userPrompt, model, temperature, useTools) {
  const body = {
    model,
    messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
    temperature,
    max_tokens: 8192,
    thinking: { type: 'disabled' },
  };
  if (useTools) body.tools = [{ type: 'web_search', web_search: { enable: true, search_result: true } }];
  const res = await fetch(ZHIPU_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZK}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) {
    const err = new Error(`GLM ${res.status}: ${txt.slice(0, 200)}`);
    err.congested = res.status === 429 || txt.includes('1305');
    err.censored = txt.includes('1301');
    throw err;
  }
  const data = JSON.parse(txt);
  const content = data.choices?.[0]?.message?.content || '';
  const m = content.match(/\{[\s\S]*\}/) || content.match(/\[[\s\S]*\]/);
  if (!m) {
    const fr = data.choices?.[0]?.finish_reason;
    throw new Error(`无JSON(finish=${fr}): ${(content || txt).slice(0, 150)}`);
  }
  return JSON.parse(m[0]);
}

async function callGLM(sysPrompt, userPrompt, useTools) {
  let lastErr;
  for (const model of GLM_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callGLMOnce(sysPrompt, userPrompt, model, 0.5 + attempt * 0.1, useTools);
      } catch (e) {
        lastErr = e;
        if (e.congested) {
          const wait = 20 + attempt * 20;
          console.log(`   ⚠️ ${model} 拥挤(429)，${wait}s 后重试 ${attempt + 1}/3...`);
          await sleep(wait * 1000);
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

// URL HTTP 可达性校验（与 generate-weekly 同标准）
async function urlOk(url) {
  try {
    if (/x\.com|twitter\.com/.test(url)) return /status\/\d{15,25}/.test(url); // 推文 ID 形态校验
    const res = await fetch(url, {
      method: 'GET', signal: AbortSignal.timeout(8000), redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' },
    });
    return res.status < 400;
  } catch { return false; }
}

const clamp = v => Math.max(0, Math.min(100, parseInt(v, 10) || 0));

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('🚀 AI OPC · 机会生产线（Decision Engine v1）\n');

  // 1. 读取近 14 天 Signals（用 created_at 兜底：早期在 Table Editor 手动改状态的条目 published_at 为 NULL）
  const WINDOW_DAYS = parseInt(process.env.OPP_WINDOW_DAYS || '14', 10);
  const MIN_SIGNALS = parseInt(process.env.OPP_MIN_SIGNALS || '6', 10);
  console.log(`📡 读取近 ${WINDOW_DAYS} 天 Signals...`);
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const signals = await sb(
    `/radar_items?select=id,title,summary,source_name,source_url,signal_type,source_tier,score,published_at,created_at&status=eq.published&created_at=gte.${encodeURIComponent(cutoff)}&order=score.desc&limit=60`
  );
  console.log(`   signals: ${(signals || []).length} 条`);
  if (!signals || signals.length < MIN_SIGNALS) {
    console.log(`⚠️ 信号不足（<${MIN_SIGNALS} 条），本期不生成机会`);
    return;
  }

  const digest = signals.map((s, i) =>
    `#${i} [${s.signal_type || 'product'}|${s.source_tier || 'C'}|${s.source_name}] ${s.title} — ${(s.summary || '').slice(0, 120)}`
  ).join('\n');

  // 2. Stage 1：信号聚类（不联网）
  console.log('\n🧩 Stage 1: 信号聚类...');
  const clusterSys = '你是 AI OPC 的机会分析师。你只基于给定信号做聚类，绝不编造信号之外的事实。只返回 JSON。';
  const clusterUser = `以下是本周采集到的 AI 领域商业信号（#编号 供引用）：

${digest}

任务：识别 2–3 个「AI × 一人公司创业机会」聚类主题。铁律：
- 每个机会必须由 ≥3 条信号共同支撑（Signal ≠ Opportunity，单条信号不许生成机会）
- 方向必须是单人或小团队可进入的；只能做大公司生意的方向直接放弃
- 优先选择信号中出现了收入/增长数据（metric 类）的方向

输出 JSON 对象：
{
  "clusters": [
    {
      "theme": "机会主题（中文，15字以内）",
      "signal_indexes": [0, 5, 12],
      "hypothesis": "为什么这些信号共同指向一个机会（80字以内）"
    }
  ]
}
只返回 JSON 对象本身`;

  const clusterResult = await callGLM(clusterSys, clusterUser, false);
  const clusters = (clusterResult.clusters || [])
    .map(c => ({
      theme: String(c.theme || '').slice(0, 50),
      signal_indexes: (Array.isArray(c.signal_indexes) ? c.signal_indexes : [])
        .filter(i => Number.isInteger(i) && i >= 0 && i < signals.length),
      hypothesis: String(c.hypothesis || '').slice(0, 200),
    }))
    .filter(c => c.signal_indexes.length >= 3)  // 聚类铁律：≥3 条信号
    .slice(0, 3);
  console.log(`   有效聚类: ${clusters.length} 个（${clusters.map(c => c.theme).join(' / ')}）`);
  if (clusters.length === 0) {
    console.log('⚠️ 没有满足 ≥3 信号支撑的聚类，本期不生成机会');
    return;
  }

  // 3. Stage 2：逐聚类深度调研（联网）
  const samples = loadStyleSamples();
  const styleHint = samples.length > 0
    ? `\neditor_take 口吻模仿以下主编样本（克制书面语、第一人称真实经历、敢下判断）：\n${samples.slice(0, 2).map(s => `- ${s}`).join('\n')}\n`
    : '';

  let created = 0;
  for (const [ci, cluster] of clusters.entries()) {
    console.log(`\n🔬 Stage 2 [${ci + 1}/${clusters.length}]: ${cluster.theme}（${cluster.signal_indexes.length} 条信号）...`);
    const clusterSignals = cluster.signal_indexes.map(i => `#${i} ${signals[i].title}\n   ${signals[i].summary || ''}\n   URL: ${signals[i].source_url}`).join('\n');

    const deepSys = '你是 AI OPC 的机会分析师，为 solo founder 做结构化机会判断。所有数字必须有公开出处，查不到就留空，绝不编造。只返回 JSON。';
    const deepUser = `以下信号共同指向一个创业机会方向「${cluster.theme}」：

${clusterSignals}

聚类假设：${cluster.hypothesis}

任务：用联网搜索深入调研这个方向，输出一个完整的机会判断（JSON 对象）。要求：
- 调研 Indie Hackers / Product Hunt / Show HN 上是否已有 solo 开发者在做并披露收入
- 调研竞争格局与被 OpenAI/Google 等平台直接吃掉的风险
- 所有 MRR/用户/定价数字必须给出来源 URL 和原文摘录；查不到就写 "未披露"
${styleHint}
【具体性铁律——这是本任务最重要的要求】
- 每个文字字段都必须锚定本方向的具体实体：信号或调研中出现的真实产品名、公司名、创始人名、数字、URL、社区名。不允许写"换个方向也成立"的通用分析
- 自检方法：每写完一段，把它套到另一个 AI 创业方向上读一遍，如果依然成立，说明是废话，必须重写到不成立为止
- why_now 必须包含 ≥1 个具体事件或数据点（来自信号或联网证据）
- bull_case / bear_case 必须引用具体公司或具体机制（如"X 已被 OpenAI 官方集成"），不写空泛利弊
- first_10_customers 必须给出可立即执行的具体动作：具体社区名（如 r/SideProject、V2EX、具体 Discord）、具体搜索关键词、具体话术方向
- validation_plan.steps 必须是带具体动作的步骤，不许出现"调研市场""验证需求"这类虚词
【套话黑名单——出现即视为失败】
随着AI技术的发展 / 赋能 / 降本增效 / 抓住风口 / 数字化转型 / AI时代 / 潜力巨大 / 前景广阔 / 机遇与挑战并存 / 深度融合
输出 JSON 对象，字段如下：
{
  "title": "中文机会名（20字以内，含具体方向而非泛泛品类）",
  "slug": "english-kebab-case-slug",
  "thesis": "一句话机会论断（40字以内）",
  "why_now": "为什么是现在（150字以内）",
  "customer": "目标客户（ICP，50字以内）",
  "pain": "痛点（80字以内）",
  "who_pays": "谁付钱（30字以内）",
  "business_model": "商业模式（50字以内）",
  "pricing_hint": "定价参考（30字以内，查不到写 未披露）",
  "mvp_weeks": "MVP 周期估计（如 2-3 周）",
  "distribution": "获客渠道（80字以内）",
  "competition": "low / medium / high + 一句话说明",
  "platform_risk": "low / medium / high + 一句话说明",
  "bull_case": "为什么能成（100字以内）",
  "bear_case": "为什么会败（100字以内，必须写，这是专业判断的标志）",
  "mvp_wedge": "最窄切入场景（60字以内）",
  "first_10_customers": "怎么找到前 10 个客户（80字以内）",
  "category": "${VALID_CATEGORIES.join(' / ')} 之一",
  "score_demand": "0-100 需求真实性",
  "score_solo_fit": "0-100 单人可行性",
  "score_monetization": "0-100 付费意愿",
  "score_distribution": "0-100 获客可行性",
  "score_timing": "0-100 时机",
  "score_defensibility": "0-100 防御性",
  "score_operating": "0-100 运营简单度（100=极简，一人无负担）",
  "recommendation": "BUILD / WATCH / NICHE_ONLY / SKIP 之一",
  "recommendation_reason": "一句话理由（60字以内）",
  "timing": "early / right-time / late 之一",
  "niche_hint": "若 recommendation 为 NICHE_ONLY：从哪个垂直切入（60字以内），否则空字符串",
  "validation_plan": {
    "hypothesis": "待验证假设（50字以内）",
    "steps": ["Day1 ...", "Day2-3 ...", "Day4-5 ..."],
    "success_threshold": "成功阈值（如 10回复/5访谈/2愿付）",
    "kill_condition": "止损条件（如 回复率<3%）"
  },
  "evidence": [
    { "claim": "该证据支撑的判断", "source_name": "来源名", "source_url": "https://...", "quote": "原文摘录(80字内)", "tier": "S/A/B/C/D" }
  ],
  "editor_take": "80-120字主编判断草稿，第一人称，有明确立场",
  "editor_conviction": "high / medium / low 之一",
  "cases": [
    {
      "name": "真实产品名", "url": "https://...", "founder": "创始人", "team_size": "如 1人",
      "mrr": "如 $5K/月，查不到写 未披露", "revenue_type": "founder_disclosed / ai_estimate / undisclosed",
      "revenue_source_url": "支撑收入数字的来源URL，无则空", "claim_quote": "含数字的原文摘录，无则空",
      "pricing": "定价", "distribution": "获客方式", "source_name": "信息来源"
    }
  ]
}

要求：
- evidence 恰好 2-4 条，每条 source_url 必须真实可访问（联网搜索验证过的）
- cases 0-2 个，必须是联网搜索到的真实 solo 产品，查不到就给空数组，绝不编造
- 只返回 JSON 对象本身`;

    let opp;
    try {
      opp = await callGLM(deepSys, deepUser, true);
    } catch (e) {
      console.log(`   ❌ 调研失败，跳过: ${e.message.slice(0, 100)}`);
      continue;
    }

    // 4. 终审与确定性计算
    // 4.1 evidence URL 校验 + tier 代码重定
    const rawEvidence = (Array.isArray(opp.evidence) ? opp.evidence : []).slice(0, 4);
    const evidence = [];
    for (const ev of rawEvidence) {
      if (!ev.source_url || !/^https?:\/\//.test(ev.source_url)) continue;
      if (!(await urlOk(ev.source_url))) {
        console.log(`   ⚠️ 丢弃不可达证据: ${String(ev.source_url).slice(0, 60)}`);
        continue;
      }
      evidence.push({
        claim: String(ev.claim || '').slice(0, 200),
        source_name: String(ev.source_name || '').slice(0, 60),
        source_url: ev.source_url,
        quote: String(ev.quote || '').slice(0, 200),
        tier: tierOf(ev.source_name),
      });
    }
    if (evidence.length === 0) {
      console.log(`   🚫 拒收（无有效证据）: ${opp.title}`);
      continue;
    }
    // Evidence Grade 代码计算：A=≥2条且≥1条S/A；B=≥1条有效；C=仅信号支撑
    const hasPrimary = evidence.some(e => e.tier === 'S' || e.tier === 'A');
    const evidenceGrade = evidence.length >= 2 && hasPrimary ? 'A' : evidence.length >= 1 ? 'B' : 'C';

    // 4.2 七维分数 + 代码加权总分
    const scores = {};
    for (const k of Object.keys(WEIGHTS)) scores[k] = clamp(opp[k]);
    const scoreTotal = Math.round(Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + scores[k] * w, 0));

    // 4.3 cases 校验 + 收入数字三件套终审
    const cases = [];
    for (const c of (Array.isArray(opp.cases) ? opp.cases : []).slice(0, 2)) {
      if (!c.name) continue;
      const hasNumber = /\d/.test(String(c.mrr || '')) && !String(c.mrr).includes('未披露');
      let revenueType = ['founder_disclosed', 'ai_estimate', 'undisclosed'].includes(c.revenue_type) ? c.revenue_type : 'undisclosed';
      let revUrl = /^https?:\/\//.test(String(c.revenue_source_url || '')) ? String(c.revenue_source_url) : '';
      let claimQuote = String(c.claim_quote || '').slice(0, 200);
      let mrr = String(c.mrr || '未披露').slice(0, 60);
      if (hasNumber) {
        const ok = revUrl && claimQuote && (await urlOk(revUrl));
        if (!ok) {
          console.log(`   ⚠️ 抹除案例无出处数字: ${c.name} mrr="${mrr}"`);
          mrr = '未披露'; revenueType = 'undisclosed'; revUrl = ''; claimQuote = '';
        }
      } else {
        mrr = '未披露'; revenueType = 'undisclosed'; revUrl = ''; claimQuote = '';
      }
      cases.push({
        name: String(c.name).slice(0, 100),
        url: /^https?:\/\//.test(String(c.url || '')) ? String(c.url) : '',
        founder: String(c.founder || '').slice(0, 60),
        team_size: String(c.team_size || '').slice(0, 30),
        mrr, revenue_type: revenueType, revenue_source_url: revUrl, claim_quote: claimQuote,
        pricing: String(c.pricing || '未披露').slice(0, 60),
        distribution: String(c.distribution || '').slice(0, 200),
        source_name: String(c.source_name || '').slice(0, 60),
        source_tier: tierOf(c.source_name),
      });
    }

    // 4.4 slug 去重
    let slug = String(opp.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    if (!slug) slug = `opp-${Date.now()}`;
    const existing = await sb(`/opportunities?slug=like.${encodeURIComponent(slug)}*&select=slug`);
    if ((existing || []).some(e => e.slug === slug)) slug = `${slug}-${Date.now() % 1000}`;

    // 5. 写入 cases → opportunities
    const caseIds = [];
    for (const c of cases) {
      try {
        const dup = await sb(`/cases?name=eq.${encodeURIComponent(c.name)}&select=id&limit=1`);
        if (dup && dup.length > 0) { caseIds.push(dup[0].id); continue; }
        await sb('/cases', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(c) });
        const back = await sb(`/cases?name=eq.${encodeURIComponent(c.name)}&select=id&limit=1`);
        if (back && back.length > 0) caseIds.push(back[0].id);
      } catch (e) {
        console.log(`   ⚠️ case 写入失败: ${c.name} ${e.message.slice(0, 60)}`);
      }
    }

    const row = {
      slug,
      title: String(opp.title || cluster.theme).slice(0, 100),
      thesis: String(opp.thesis || '').slice(0, 200),
      why_now: String(opp.why_now || '').slice(0, 400),
      customer: String(opp.customer || '').slice(0, 200),
      pain: String(opp.pain || '').slice(0, 200),
      who_pays: String(opp.who_pays || '').slice(0, 100),
      business_model: String(opp.business_model || '').slice(0, 200),
      pricing_hint: String(opp.pricing_hint || '未披露').slice(0, 100),
      mvp_weeks: String(opp.mvp_weeks || '').slice(0, 50),
      distribution: String(opp.distribution || '').slice(0, 200),
      competition: String(opp.competition || '').slice(0, 150),
      platform_risk: String(opp.platform_risk || '').slice(0, 150),
      bull_case: String(opp.bull_case || '').slice(0, 300),
      bear_case: String(opp.bear_case || '').slice(0, 300),
      mvp_wedge: String(opp.mvp_wedge || '').slice(0, 200),
      first_10_customers: String(opp.first_10_customers || '').slice(0, 200),
      ...scores,
      score_total: scoreTotal,
      evidence_grade: evidenceGrade,
      recommendation: VALID_RECS.includes(opp.recommendation) ? opp.recommendation : 'WATCH',
      timing: VALID_TIMINGS.includes(opp.timing) ? opp.timing : 'right-time',
      validation_plan: {
        hypothesis: String(opp.validation_plan?.hypothesis || '').slice(0, 200),
        steps: (Array.isArray(opp.validation_plan?.steps) ? opp.validation_plan.steps : []).map(s => String(s).slice(0, 150)).slice(0, 5),
        success_threshold: String(opp.validation_plan?.success_threshold || '').slice(0, 100),
        kill_condition: String(opp.validation_plan?.kill_condition || '').slice(0, 100),
        niche_hint: String(opp.niche_hint || '').slice(0, 150),
        recommendation_reason: String(opp.recommendation_reason || '').slice(0, 150),
      },
      evidence,
      editor_take: String(opp.editor_take || '').slice(0, 300),
      editor_conviction: ['high', 'medium', 'low'].includes(opp.editor_conviction) ? opp.editor_conviction : 'medium',
      category: VALID_CATEGORIES.includes(opp.category) ? opp.category : 'indie-tool',
      signal_ids: cluster.signal_indexes.map(i => signals[i].id),
      case_ids: caseIds,
      status: 'draft',
      published_at: new Date().toISOString(),
    };

    try {
      await sb('/opportunities', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      created++;
      console.log(`   ✅ ${row.title} | Score ${scoreTotal} / Evidence ${evidenceGrade} / ${row.recommendation} | 证据 ${evidence.length} 条 / 案例 ${cases.length} 个`);
    } catch (e) {
      console.log(`   ❌ opportunity 写入失败: ${e.message.slice(0, 100)}`);
    }
  }

  console.log(`\n📊 汇总: 生成 ${created}/${clusters.length} 个机会草稿（status=draft，请到 /admin 或 Supabase 审核）`);
  console.log('✅ 机会生产线完成');
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
