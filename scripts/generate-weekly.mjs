/**
 * AI OPC Weekly 自动生成脚本 (P3 · 深度版)
 *
 * 内容定位（与 Radar 分工）：
 *   Radar  = 每日时效快讯
 *   Weekly = 只聚焦 AI × OPC 一人公司「创业 / 商业 / 变现」的深度拆解，不含快讯
 *
 * 生成方式（grounded，严禁编造）：
 *   每次先刷新真实来源池，再按 founder-first 配额抽样；GLM 只能从素材
 *   白名单选题并复用原始 URL。目标 6 篇，少于 5 篇不写入；已有不足
 *   5 篇的草稿会进入补足模式。
 *
 * 用法：node scripts/generate-weekly.mjs
 * 由 GitHub Actions 每周一执行（weekly-newsletter.yml）
 *
 * 环境变量：
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（缺失则报错退出）
 *   ZHIPU_API_KEY（缺失则报错退出）
 *   WEEKLY_DRY_RUN = 'true' 时只打印不写入数据库，用于安全测试
 *
 * 历史问题修复（保留）:
 * - 期号 ISO 周计算 / 草稿补足 / sb() REST 封装 / 1301 内容审查重试
 * - Supabase INSERT 空响应 → 回查 slug 取 id
 */

import { extractProductTerms, validateSourceUrl } from './lib/source-validation.mjs';
import { selectCandidateMaterials } from './lib/radar-policy.mjs';
import {
  MIN_WEEKLY_ITEMS,
  TARGET_WEEKLY_ITEMS,
  buildMaterialIndex,
  canonicalSourceUrl,
  filterGroundedRefs,
  productIdentity,
  weeklyIssuePlan,
} from './lib/weekly-policy.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZK = process.env.ZHIPU_API_KEY;

if (!SUPABASE_URL) { console.error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }
if (!SRK) { console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ZK) { console.error('❌ 缺少 ZHIPU_API_KEY'); process.exit(1); }

const ZHIPU_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DRY_RUN = process.env.WEEKLY_DRY_RUN === 'true';

// 免费模型按顺序兜底：429/1305 拥挤或持续失败时换下一个（与 generate-radar.mjs 一致）
const GLM_MODELS = ['glm-4.7-flash', 'glm-4.5-flash'];

const DEEPDIVE_TOTAL = TARGET_WEEKLY_ITEMS;
const DEEPDIVE_BATCH = 3;

const VALID_CATEGORIES = ['micro-saas', 'design-assets', 'automation', 'content-monetize', 'indie-tool', 'digital-product'];

// ─── 工具函数 ───────────────────────────────────────────

function getISOWeekNumber(d) {
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const j4 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - j4.getTime()) / 864e5 - 3 + ((j4.getDay() + 6) % 7)) / 7);
}

function getWeekRange(w, y) {
  const j4 = new Date(y, 0, 4);
  const mon = new Date(j4); mon.setDate(j4.getDate() - ((j4.getDay() + 6) % 7) + (w - 1) * 7);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${txt.slice(0, 200)}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── GLM 调用（结构参考 generate-radar.mjs，增加联网搜索工具与降级）───

async function callGLMOnce(sysPrompt, userPrompt, model, temperature, useTools) {
  const body = {
    model,
    messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
    temperature,
    max_tokens: 8192,
    thinking: { type: 'disabled' }  // 关闭推理模式：否则思考过程吃光 token，正文 content 为空
  };
  if (useTools) {
    body.tools = [{ type: 'web_search', web_search: { enable: true, search_result: true } }];
  }
  const res = await fetch(ZHIPU_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZK}` },
    body: JSON.stringify(body)
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
  const m = content.match(/\[[\s\S]*\]/);
  if (!m) {
    const fr = data.choices?.[0]?.finish_reason;
    throw new Error(`无JSON(finish=${fr}): ${(content || txt).slice(0, 150)}`);
  }
  const items = JSON.parse(m[0]);
  if (!Array.isArray(items) || items.length === 0) throw new Error(`仅${items?.length || 0}条`);
  console.log(`   ✅ ${items.length} 条 | 模型=${model} | 联网=${useTools ? '开' : '关'} | tok in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}`);
  return items;
}

// 双模型 × 3 次重试；useTools=true 全部失败后降级为无工具调用（只靠素材）
async function callGLM(sysPrompt, userPrompt) {
  let lastErr;
  for (const useTools of [true, false]) {
    if (!useTools) console.log('   ⚠️ 联网搜索调用连续失败，降级为无工具调用（仅基于雷达素材）...');
    for (const model of GLM_MODELS) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await callGLMOnce(sysPrompt, userPrompt, model, 0.5 + attempt * 0.1, useTools);
        } catch (e) {
          lastErr = e;
          if (e.congested) {
            const wait = 20 + attempt * 20; // 20s / 40s / 60s 退避
            console.log(`   ⚠️ ${model} 拥挤(429)，${wait}s 后重试 ${attempt + 1}/3...`);
            await sleep(wait * 1000);
            continue;
          }
          if (e.censored) {
            console.log(`   ⚠️ 内容审查触发(1301)，重试 ${attempt + 1}/3...`);
            await sleep(5000);
            continue;
          }
          console.log(`   ⚠️ ${e.message.slice(0, 80)}，重试 ${attempt + 1}/3...`);
          await sleep(5000);
        }
      }
      console.log(`   ⏭️ ${model} 连续失败，切换兜底模型...`);
    }
  }
  throw lastErr;
}

// 大公司/资本事件关键词黑名单：命中即从选题素材中剔除（确定性过滤，不靠 LLM 自觉）
const BLOCK_KEYWORDS = [
  // 资本事件
  '融资', '获投', '领投', '跟投', '估值', '收购', '并购', 'IPO', '上市', '万美元', '亿美元',
  // 巨头及其产品（周报只聚焦 solo/小团队，巨头动态归 Radar）
  'OpenAI', 'ChatGPT', 'Google', 'Gemini', '微软', 'Microsoft', 'Copilot',
  'Anthropic', 'Claude', 'Meta', 'NVIDIA', '英伟达', 'Apple', '苹果',
  '字节', '抖音', '阿里', '腾讯', '百度', '华为', '京东', '美团', '小米',
  'Cognition', 'Runway', 'Midjourney', 'Sora', 'Perplexity',
  // 注意：Stripe/Slack/Notion/Figma 等是 indie 产品常见集成词，不放黑名单（会误杀），由 prompt 铁律把控
];
function isIndieRelevant(text) {
  const t = String(text || '');
  return !BLOCK_KEYWORDS.some(k => t.includes(k));
}

// ─── 信源 URL 校验 ──────────────────────────────────────

// x.com / twitter.com 状态 ID 是雪花 ID，目前为 18-20 位非连续数字；过短或连续序列视为编造
function isPlausibleTweetUrl(url) {
  const m = String(url).match(/(?:x|twitter)\.com\/\w+\/status\/(\d+)/);
  if (!m) return true; // 非推文链接不校验
  const id = m[1];
  if (id.length < 17 || id.length > 20) return false;
  if (/(\d)\1{5,}|1234567|7654321/.test(id)) return false; // 连续重复/顺序数字
  return true;
}

async function validateExternalRefs(refs, title, quote = '') {
  const expectedTerms = extractProductTerms(title);
  const results = await Promise.all(refs.map(async r => {
    if (!isPlausibleTweetUrl(r.url)) {
      console.log(`   🔍 丢弃可疑推文链接（${title.slice(0, 15)}）: ${r.url}`);
      return null;
    }
    const checked = await validateSourceUrl(r.url, { expectedTerms, quote });
    if (!checked.ok) {
      console.log(`   🔍 丢弃未通过实证校验的链接（${checked.reason}，${title.slice(0, 15)}）: ${r.url}`);
    }
    return checked.ok ? { ...r, url: checked.finalUrl || r.url } : null;
  }));
  return results.filter(Boolean);
}

function validateGroundedRefs(refs, title, materialIndex) {
  const plausible = (Array.isArray(refs) ? refs : []).filter(ref => {
    if (isPlausibleTweetUrl(ref?.url)) return true;
    console.log(`   🔍 丢弃可疑推文链接（${title.slice(0, 15)}）: ${ref?.url || ''}`);
    return false;
  });
  const grounded = filterGroundedRefs(plausible, materialIndex);
  if (grounded.length < plausible.length) {
    console.log(`   🔒 丢弃 ${plausible.length - grounded.length} 个不在已抓取素材池中的模型链接: ${title}`);
  }
  return grounded;
}

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('🚀 AI OPC Weekly — P3 深度版（只做 AI × OPC 创业/商业/变现深度拆解）');
  console.log(`   模式: ${DRY_RUN ? '🔸 DRY_RUN 只打印不写入' : '生产写入'}\n`);

  // 1. 期号 / slug
  console.log('📋 期号...');
  const issues = await sb('/weekly_issues?select=id,slug,issue_number&order=issue_number.desc&limit=5');
  const year = new Date().getFullYear();
  const wn = getISOWeekNumber(new Date());
  const { start, end } = getWeekRange(wn, year);
  const slug = `${year}-w${String(wn).toLowerCase()}`;
  const existing = await sb(`/weekly_issues?slug=eq.${slug}&select=id,slug,issue_number,status,summary&limit=1`);
  const existingIssue = existing?.[0] || null;
  const existingItems = existingIssue
    ? await sb(`/news_items?weekly_issue_id=eq.${existingIssue.id}&select=id,title,rank,refs&order=rank.asc`)
    : [];
  const plan = weeklyIssuePlan(existingIssue, existingItems?.length || 0);
  const ni = existingIssue?.issue_number || (issues?.[0]?.issue_number || 27) + 1;
  console.log(`   issue #${ni} | ${slug} | ${start}~${end} | 现有 ${plan.existingCount} 条`);

  if (plan.skip) {
    console.log(plan.reason === 'published'
      ? '   ✅ 本周周报已发布，跳过重复生成'
      : `   ✅ 本周草稿已有 ${plan.existingCount} 条，达到至少 ${MIN_WEEKLY_ITEMS} 条门槛`);
    return;
  }
  console.log(existingIssue
    ? `   🧩 补足模式：还需生成 ${plan.needed} 条，补到至少 ${MIN_WEEKLY_ITEMS} 条`
    : `   🆕 新建模式：目标 ${DEEPDIVE_TOTAL} 条，少于 ${MIN_WEEKLY_ITEMS} 条不落库`);

  // 3. 取素材：本周 Radar 已发布快讯作为选题线索（仅线索，不做快讯展示）
  console.log('\n📥 读取 Radar 选题线索（近 7 天）...');
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const publishedRaw = await sb(
    `/radar_items?status=eq.published&published_at=gte.${encodeURIComponent(cutoff)}&order=score.desc&limit=30`
  );
  // 原始素材池：先扩大召回，再复用 Radar 的 founder-first 多来源配额抽样。
  const candidatesRaw = await sb(
    `/radar_candidates?fetched_at=gte.${encodeURIComponent(cutoff)}&order=fetched_at.desc&limit=500`
  );
  const tweetsRaw = await sb(
    `/tweets?published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=200`
  );
  // 确定性过滤：剔除大公司/资本事件素材，只留独立开发者相关
  const published = (publishedRaw || []).filter(r => isIndieRelevant(`${r.title} ${r.summary}`));
  const candidates = (candidatesRaw || []).filter(c => isIndieRelevant(`${c.title} ${c.snippet}`));
  const tweets = (tweetsRaw || []).filter(t => isIndieRelevant(t.content));
  const publishedAsCandidates = published.map(r => ({
    ...r,
    snippet: r.summary,
    fetched_at: r.published_at,
  }));
  const materials = selectCandidateMaterials(
    [...publishedAsCandidates, ...candidates],
    tweets,
    new Set(),
    54,
  );
  const materialIndex = buildMaterialIndex(materials);
  const sourceCounts = materials.reduce((acc, material) => {
    acc[material.source_name] = (acc[material.source_name] || 0) + 1;
    return acc;
  }, {});
  console.log(`   快讯线索: ${(publishedRaw || []).length} → ${published.length} | 原始素材: ${(candidatesRaw || []).length} → ${candidates.length} | 推文: ${(tweetsRaw || []).length} → ${tweets.length}`);
  console.log(`   founder-first 入模: ${materials.length} 条 / ${Object.keys(sourceCounts).length} 个来源 | ${Object.entries(sourceCounts).map(([name, count]) => `${name}=${count}`).join(' · ')}`);

  if (materials.length < MIN_WEEKLY_ITEMS) {
    throw new Error(`可用真实素材仅 ${materials.length} 条，少于周报最低 ${MIN_WEEKLY_ITEMS} 条`);
  }
  const materialText = materials.map((material, index) =>
    `#${index + 1} [${material.source_name}] ${material.title}${material.snippet ? ` — ${String(material.snippet).slice(0, 260)}` : ''}\nURL: ${material.source_url}`
  ).join('\n---\n');

  // 3b. 去重：最近 12 条周报标题，避免跨周重复选题
  const hist = await sb('/news_items?select=title&order=created_at.desc&limit=12');
  const existingTitles = (existingItems || []).map(item => item.title).filter(Boolean);
  const dupHint = (hist || []).length > 0 || existingTitles.length > 0
    ? `\n\n已拆解过的案例（请避开，不要重复选题）：${[...existingTitles, ...(hist || []).map(h => String(h.title).slice(0, 40))].join('、')}`
    : '';

  // 4. 深度拆解：模型只能从已抓取、带真实 URL 的候选池选题。
  const sysPrompt = '你是「AI OPC Weekly」的主编。你只能从用户提供的真实候选素材中选题，并原样复制素材 URL；绝不能创造产品名、链接、收入或事实。只返回 JSON 数组。';

  function buildPrompt(excludeTitles, count) {
    const excludeHint = excludeTitles.length > 0
      ? `\n\n本期内已拆解的案例（必须避开，选完全不同的案例）：${excludeTitles.join('、')}`
      : '';
    return `以下是本周（${start}~${end}）由官方 API、RSS 或已跟踪账号实际抓取到的候选素材。URL 是唯一允许引用的证据白名单：

${materialText}${dupHint}${excludeHint}

任务：只能从上方候选素材中选择 ${count} 个不同的真实产品或案例，各写一篇面向一人公司的深度拆解。可以联网阅读和理解候选 URL，但不得选择候选清单之外的产品，也不得输出清单之外的 refs URL。

选题铁律（违反任何一条都坚决不收）：
1. 主体必须是独立开发者、solo 创始人或不超过 5 人小团队的真实产品/项目；获风投融资（天使轮以上）的公司一律不收——融资金额再大，对一人创业者也没有可复制性
2. 巨头（OpenAI / Google / Microsoft / Anthropic / 阿里 / 字节等）的产品动态不收，除非该动态给 solo 开发者带来可直接使用的免费资源或新渠道——此时按「工具红利」框架写：谁能用、怎么用、能省多少成本，而不是写公司本身
3. 商业数据只允许使用候选素材或其 URL 页面明确披露的收入 / MRR / 用户量 / 定价；查不到就写"未披露"，严禁推测编造
4. 每篇必须能回答「一个独立开发者如何复刻或利用这个机会」：复刻路径、所需技能、预估 MVP 周期；回答不了的选题不收

来源约束：refs 中每一个 URL 都必须逐字复制自上方候选清单。不要补充搜索结果 URL，不要猜测 Product Hunt、Indie Hackers、TrustMRR 或 X 链接。大公司融资、收购、人事、纯技术论文、与商业变现无关的更新，一律视为废稿。

输出一个 JSON 数组（不要输出其他文字），恰好 ${count} 项，每项字段：
- title: 中文标题（30字以内），必须包含产品/项目的真实名称（如 "ShipFast"、"Attie"、「即梦」这类专有名词），只有品类描述没有名字的（如「AI 营销邮件生成器」）说明你没找到真实案例，这种废稿不要输出
- description: 180-300字中文，只使用候选素材及其 URL 中能够确认的事实；团队规模、收入或增长没有明确证据时写「未披露」，不用「你/你的」
- insight: 100-150字中文，第一人称编辑判断（我/我看），核心回答「独立开发者怎么抄这个作业」：复刻切入点、所需技能、现实的 MVP 周期；有明确立场，敢泼冷水也敢给结论
- category: 必须是以下之一: ${VALID_CATEGORIES.join(' / ')}
- mrr_range: 用搜索到的真实公开收入数据（如 "$10K/月"），查不到填 "未披露"
- revenue_type: 必须是以下之一: founder_disclosed（创始人/官方公开披露的收入数字）/ ai_estimate（有公开依据的间接估算）/ undisclosed（查不到，即 mrr_range 为"未披露"）
- revenue_source_url: 直接支撑 mrr_range 数字的来源页面 URL（创始人原帖/官方页面/采访报道）；mrr_range 为"未披露"时必须填空字符串
- claim_quote: 上述来源中包含该数字的原文句子（照抄原文，80字以内）；无来源时填空字符串
- pricing: 真实定价信息，查不到填 "未披露"
- mvp_time: 真实开发周期信息，查不到填 "未披露"
- refs: 1-3个真实 URL，格式 [{"label":"来源名","url":"https://..."}]，每个 URL 必须逐字复制自上方候选清单；至少包含该案例对应的候选 URL
- tags: 2-3个中文标签

要求：
- 严禁编造 URL 和数字；所有数字必须能在公开来源中找到，查不到就写"未披露"
- 【数字三件套铁律】mrr_range 填了具体数字时，revenue_source_url 和 claim_quote 必须同时给出且互相印证（quote 中应能找到对应数字）；给不出三件套的，mrr_range 一律改填"未披露"、revenue_type 填 undisclosed——宁可不显示数字，也绝不写没出处的数字
- description 和 insight 用中文
- 只返回 JSON 数组本身`;
  }

  console.log(`\n🔬 深度拆解（真实素材白名单，需新增 ${plan.needed} 篇，最多 6 批）...`);
  const deepdive = [];
  const MAX_BATCHES = 6;  // 终审拒收率高，多给补足机会
  const existingIdentities = new Set(existingTitles.map(productIdentity).filter(Boolean));
  const usedSourceUrls = new Set((existingItems || []).flatMap(item =>
    (Array.isArray(item.refs) ? item.refs : []).map(ref => canonicalSourceUrl(ref?.url)).filter(Boolean)
  ));
  for (let b = 0; b < MAX_BATCHES && deepdive.length < plan.needed; b++) {
    const need = Math.min(DEEPDIVE_BATCH, plan.needed - deepdive.length);
    console.log(`\n   批次 ${b + 1}/${MAX_BATCHES}（还需 ${need} 篇）...`);
    try {
      const raw = await callGLM(sysPrompt, buildPrompt([...existingTitles, ...deepdive.map(d => d.title)], need));
      const mapped = raw.slice(0, need).map(it => ({
        title: String(it.title || '').slice(0, 200),
        description: String(it.description || '').slice(0, 900),
        insight: String(it.insight || '').slice(0, 400),
        category: VALID_CATEGORIES.includes(it.category) ? it.category : 'indie-tool',
        creator_level: 'medium',
        compound_potential: 'medium',
        mrr_range: String(it.mrr_range || '未披露').slice(0, 100),
        revenue_type: ['founder_disclosed', 'ai_estimate', 'undisclosed'].includes(it.revenue_type) ? it.revenue_type : 'undisclosed',
        revenue_source_url: /^https?:\/\//.test(String(it.revenue_source_url || '')) ? String(it.revenue_source_url) : '',
        claim_quote: String(it.claim_quote || '').slice(0, 200),
        pricing: String(it.pricing || '未披露').slice(0, 100),
        mvp_time: String(it.mvp_time || '未披露').slice(0, 100),
        refs: (Array.isArray(it.refs) ? it.refs : [])
          .filter(r => r && r.url && /^https?:\/\//.test(r.url))
          .slice(0, 3)
          .map(r => ({ label: String(r.label || '来源').slice(0, 50), url: String(r.url) })),
        tags: (Array.isArray(it.tags) ? it.tags : []).map(t => String(t).slice(0, 30)).slice(0, 3),
        section: 'deepdive',
      }));
      // 基础证据必须来自已抓取素材白名单；收入数字仍需直接打开原文逐字验证。
      for (const m of mapped) {
        m.refs = validateGroundedRefs(m.refs, m.title, materialIndex);

        // 【数字三件套终审】mrr_range 有具体数字 → revenue_source_url 必须 HTTP 可达且 claim_quote 非空，
        // 否则抹掉数字降级为"未披露"（宁可没数字，不要没出处的数字——Textify 教训）
        const hasNumber = /\d/.test(m.mrr_range) && !m.mrr_range.includes('未披露');
        if (hasNumber) {
          let verified = false;
          if (m.revenue_source_url && m.claim_quote) {
            const okRefs = await validateExternalRefs(
              [{ label: 'revenue', url: m.revenue_source_url }],
              m.title,
              m.claim_quote,
            );
            verified = okRefs.length > 0;
          }
          if (!verified) {
            console.log(`   ⚠️ 抹除无出处数字: ${m.title}（mrr="${m.mrr_range}" → 未披露）`);
            m.mrr_range = '未披露';
            m.revenue_type = 'undisclosed';
            m.revenue_source_url = '';
            m.claim_quote = '';
          } else {
            console.log(`   ✓ 收入数字已核实[${m.revenue_type}]: ${m.title} ${m.mrr_range}`);
          }
        } else {
          m.revenue_type = 'undisclosed';
          m.revenue_source_url = '';
          m.claim_quote = '';
        }
      }
      const noRef = mapped.filter(m => m.refs.length === 0);
      for (const m of noRef) console.log(`   🚫 终审拒收（无有效信源 URL）: ${m.title}`);
      const withRefs = mapped.filter(m => m.refs.length > 0);

      // 本期内按真实产品名与来源 URL 去重，不能再用“工具/助手”等泛词误杀。
      for (const m of withRefs) {
        const identity = productIdentity(m.title);
        const primaryUrl = canonicalSourceUrl(m.refs[0]?.url);
        if (!identity) {
          console.log(`   🚫 终审拒收（无真实产品名）: ${m.title}`);
          continue;
        }
        if (existingIdentities.has(identity) || usedSourceUrls.has(primaryUrl)) {
          console.log(`   ⚠️ 跳过重复选题: ${m.title}`);
          continue;
        }
        // 只根据选题主体拒绝巨头/资本事件；描述中提到所用 API 不应误杀 solo 产品。
        if (!isIndieRelevant(m.title)) {
          console.log(`   🚫 终审拒收（违反选题铁律）: ${m.title}`);
          continue;
        }
        deepdive.push(m);
        existingIdentities.add(identity);
        usedSourceUrls.add(primaryUrl);
        console.log(`   ✅ 收录: ${m.title} | ${m.refs.map(ref => ref.url).join(' | ')}`);
      }
    } catch (e) {
      // 单批失败不阻塞整期：保留已成功的批次
      console.log(`   ❌ 批次 ${b + 1} 生成失败（含无工具降级）：${e.message.slice(0, 120)}`);
    }
  }
  deepdive.forEach((it, i) => { it.rank = plan.existingCount + i + 1; });

  const totalAfterRun = plan.existingCount + deepdive.length;
  if (totalAfterRun < MIN_WEEKLY_ITEMS) {
    throw new Error(`真实性终审后合计仅 ${totalAfterRun} 条，未达到至少 ${MIN_WEEKLY_ITEMS} 条；本次不写入，保留后续自动补跑机会`);
  }

  const news = deepdive;
  const summary = `本周 ${totalAfterRun} 个深度拆解：AI × 一人公司创业 / 商业 / 变现，全部附已抓取的真实证据来源。`;

  // 5. 写入（DRY_RUN 跳过）
  console.log('\n💾 Supabase...');
  if (DRY_RUN) {
    console.log('   🔸 DRY_RUN：跳过 weekly_issues / news_items 写入');
    console.log(`   预览 weekly_issues: slug=${slug} issue=#${ni} summary="${summary}"`);
    for (const it of news) {
      console.log(`   [${it.section}] rank=${it.rank} ${it.title} | refs=${it.refs.length}`);
    }
  } else {
    let iid = existingIssue?.id;
    if (!iid) {
      await sb('/weekly_issues', { method: 'POST', body: JSON.stringify({
        slug, issue_number: ni, year, week_number: wn, week_start: start, week_end: end,
        title: `AI OPC Weekly #${ni}`, summary,
        cover_image: '', status: process.env.WEEKLY_DRAFT === 'true' ? 'draft' : 'published', published_at: new Date().toISOString()
      })});
      // 回查 id（INSERT 响应可能为空）
      const created = await sb(`/weekly_issues?slug=eq.${slug}&select=id&limit=1`);
      iid = created?.[0]?.id;
    }
    if (!iid) throw new Error('回查 weekly_issue id 失败');
    console.log(`   ✅ issue: ${iid}${existingIssue ? '（补足现有草稿）' : '（新建草稿）'}`);

    const rows = news.map(it => ({ ...it, weekly_issue_id: iid }));
    try {
      await sb('/news_items', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
    } catch (e) {
      // 兼容：news_items 缺可信度新列时剥离重试（请执行 scripts/migration-001.sql）
      if (/revenue_type|revenue_source_url|claim_quote/.test(String(e.message))) {
        console.log('   ⚠️ news_items 缺少可信度新列，降级写入（请执行 scripts/migration-001.sql）');
        const stripped = rows.map(row => {
          const compatible = { ...row };
          delete compatible.revenue_type;
          delete compatible.revenue_source_url;
          delete compatible.claim_quote;
          return compatible;
        });
        await sb('/news_items', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(stripped) });
      } else {
        throw e;
      }
    }
    console.log(`   ✅ ${rows.length} 条 news_items`);
    await sb(`/weekly_issues?id=eq.${iid}`, {
      method: 'PATCH',
      body: JSON.stringify({ summary, published_at: new Date().toISOString() }),
    });
  }

  // 6. 汇总
  console.log('\n📊 汇总:');
  console.log(`   本次新增: ${deepdive.length} 条 | 本周合计: ${totalAfterRun} 条`);
  console.log(`   DRY_RUN: ${DRY_RUN ? '是（未写入数据库）' : '否（已写入）'}`);
  console.log(`\n✅ W${ni} 完成！\n🌐 https://www.aiopcnews.com/weekly/${slug}`);
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
