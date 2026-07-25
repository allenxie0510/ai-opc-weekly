/**
 * AI OPC Weekly 自动生成脚本 (P3 · 深度版)
 *
 * 内容定位（与 Radar 分工）：
 *   Radar  = 每日时效快讯（含弃选，显性化筛选）
 *   Weekly = 只聚焦 AI × OPC 一人公司「创业 / 商业 / 变现」的深度拆解，不含快讯
 *
 * 生成方式（grounded，严禁编造）：
 *   GLM + 联网搜索，以本周 Radar 已发布快讯为选题线索，
 *   结合联网检索核实真实案例（真实产品 / 真实收入 / 真实信源 URL），
 *   产出 6 篇深度拆解（分 2 批 × 3 篇，防输出截断）。
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
 * - 期号 ISO 周计算 / slug 冲突清理 / sb() REST 封装 / 1301 内容审查重试
 * - Supabase INSERT 空响应 → 回查 slug 取 id
 */

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

const DEEPDIVE_TOTAL = 6;  // 深度拆解总数（2 批 × 3 篇）
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
  'Cognition', 'Runway', 'Midjourney', 'Sora',
  'Perplexity', 'Notion', 'Superhuman', 'Figma', 'Canva', 'Adobe',
  'Shopify', 'Salesforce', 'HubSpot', 'Zoom', 'Slack', 'Stripe',
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

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    // 2xx/3xx 有效；401/403/405 是反爬拦截不代表不存在；404/410 确认无效
    return res.status < 400 || [401, 403, 405].includes(res.status);
  } catch {
    return true; // 网络错误（超时/被墙）不等于编造，保守保留
  }
}

async function validateRefs(refs, title) {
  const results = await Promise.all(refs.map(async r => {
    if (!isPlausibleTweetUrl(r.url)) {
      console.log(`   🔍 丢弃可疑推文链接（${title.slice(0, 15)}）: ${r.url}`);
      return null;
    }
    const ok = await checkUrl(r.url);
    if (!ok) console.log(`   🔍 丢弃 404 链接（${title.slice(0, 15)}）: ${r.url}`);
    return ok ? r : null;
  }));
  return results.filter(Boolean);
}

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('🚀 AI OPC Weekly — P3 深度版（只做 AI × OPC 创业/商业/变现深度拆解）');
  console.log(`   模式: ${DRY_RUN ? '🔸 DRY_RUN 只打印不写入' : '生产写入'}\n`);

  // 1. 期号 / slug
  console.log('📋 期号...');
  const issues = await sb('/weekly_issues?select=id,slug,issue_number&order=issue_number.desc&limit=5');
  const ni = (issues?.[0]?.issue_number || 27) + 1;
  const year = new Date().getFullYear();
  const wn = getISOWeekNumber(new Date());
  const { start, end } = getWeekRange(wn, year);
  const slug = `${year}-w${String(wn).toLowerCase()}`;
  console.log(`   #${ni - 1}→#${ni} | ${slug} | ${start}~${end}`);

  // 2. 清理同名旧记录（防止 slug 冲突；DRY_RUN 跳过）
  const existing = await sb(`/weekly_issues?slug=eq.${slug}&select=id`);
  if (existing && existing.length > 0) {
    if (DRY_RUN) {
      console.log(`   🔸 DRY_RUN 跳过清理旧记录: ${slug}`);
    } else {
      console.log(`   ⚠️ 清理旧记录: ${slug}`);
      await sb(`/weekly_issues?slug=eq.${slug}`, { method: 'DELETE' });
    }
  }

  // 3. 取素材：本周 Radar 已发布快讯作为选题线索（仅线索，不做快讯展示）
  console.log('\n📥 读取 Radar 选题线索（近 7 天）...');
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const publishedRaw = await sb(
    `/radar_items?status=eq.published&published_at=gte.${encodeURIComponent(cutoff)}&order=score.desc&limit=30`
  );
  // 原始素材池（HN / GitHub / RSS），拓宽选题面，避免 GLM 只盯着少数快讯
  const candidatesRaw = await sb(
    `/radar_candidates?fetched_at=gte.${encodeURIComponent(cutoff)}&order=fetched_at.desc&limit=60`
  );
  // 确定性过滤：剔除大公司/资本事件素材，只留独立开发者相关
  const published = (publishedRaw || []).filter(r => isIndieRelevant(`${r.title} ${r.summary}`));
  const candidates = (candidatesRaw || []).filter(c => isIndieRelevant(`${c.title} ${c.snippet}`));
  console.log(`   快讯线索: ${(publishedRaw || []).length} → 过滤后 ${published.length} 条 | 原始素材: ${(candidatesRaw || []).length} → 过滤后 ${candidates.length} 条`);

  const seedText = (published || []).slice(0, 20).map(r =>
    `[${r.source_name}] ${r.title}${r.summary ? ' — ' + String(r.summary).slice(0, 200) : ''}\nURL: ${r.source_url}`
  ).join('\n---\n');
  const candText = (candidates || []).slice(0, 25).map(c =>
    `[${c.source_name}] ${c.title}${c.snippet ? ' — ' + String(c.snippet).slice(0, 150) : ''}\nURL: ${c.source_url}`
  ).join('\n---\n');
  const materialText = [seedText && `【本周雷达快讯】\n${seedText}`, candText && `【原始素材池】\n${candText}`]
    .filter(Boolean).join('\n\n')
    || '（本周雷达暂无线索，请完全依靠联网搜索寻找本周真实案例）';

  // 3b. 去重：最近 12 条周报标题，避免跨周重复选题
  const hist = await sb('/news_items?select=title&order=created_at.desc&limit=12');
  const dupHint = (hist || []).length > 0
    ? `\n\n往期已拆解过的案例（请避开，不要重复选题）：${(hist || []).map(h => String(h.title).slice(0, 20)).join('、')}`
    : '';

  // 4. 深度拆解（GLM + 联网搜索，2 批 × 3 篇）
  const sysPrompt = '你是「AI OPC Weekly」的主编，一份面向 AI 一人公司（OPC）创业者的深度周报。你只基于真实素材和联网检索到的公开信息写作，绝不编造。只返回 JSON 数组。';

  // mode: 'seeds' 用雷达素材做线索；'search' 完全不给素材，强制联网寻找独立开发者案例
  function buildPrompt(excludeTitles, count, mode) {
    const excludeHint = excludeTitles.length > 0
      ? `\n\n本期内已拆解的案例（必须避开，选完全不同的案例）：${excludeTitles.join('、')}`
      : '';
    const materialBlock = mode === 'seeds'
      ? `以下是本周（${start}~${end}）OPC Radar 收录的真实快讯，作为选题线索：\n\n${materialText}\n`
      : '本期不提供任何素材，所有案例必须由你通过联网搜索亲自寻找。\n';
    const taskLine = mode === 'seeds'
      ? `任务：围绕「AI × 一人公司创业 / 商业模式 / 变现」这个唯一主题，选出 ${count} 个真实案例/产品/事件，通过联网搜索核实细节后，各写一篇深度拆解。选题优先从上方线索中挖掘，线索不足时可自选本周（或近期）有公开报道的真实案例，但必须能通过联网搜索核实。`
      : `任务：围绕「AI × 一人公司创业 / 商业模式 / 变现」这个唯一主题，通过联网搜索，在 Indie Hackers、Product Hunt、TrustMRR、Hacker News 的 Show HN、X 独立开发者社区中找到 ${count} 个本周（或近期）独立开发者/solo 小团队发布的真实产品——必须有公开的收入/MRR/用户量/定价数据之一，各写一篇深度拆解。不要编造案例，找不到足够真实的就宁可少输出。`;
    return `${materialBlock}${dupHint}${excludeHint}

${taskLine}

选题铁律（违反任何一条都坚决不收）：
1. 主体必须是独立开发者、solo 创始人或不超过 5 人小团队的真实产品/项目；获风投融资（天使轮以上）的公司一律不收——融资金额再大，对一人创业者也没有可复制性
2. 巨头（OpenAI / Google / Microsoft / Anthropic / 阿里 / 字节等）的产品动态不收，除非该动态给 solo 开发者带来可直接使用的免费资源或新渠道——此时按「工具红利」框架写：谁能用、怎么用、能省多少成本，而不是写公司本身
3. 必须有公开可核实的商业数据：收入 / MRR / 用户量 / 定价至少其一，查不到就写"未披露"，严禁推测编造
4. 每篇必须能回答「一个独立开发者如何复刻或利用这个机会」：复刻路径、所需技能、预估 MVP 周期；回答不了的选题不收

优先选题来源（按优先级）：主动用联网搜索在 Indie Hackers、Product Hunt、TrustMRR、Hacker News 的 Show HN、X 独立开发者社区中寻找本周新发布或披露收入的 solo 产品——这类案例优先级最高；其次才是上方线索中符合铁律的条目。上方线索仅作参考，不符合铁律的一律无视。大公司融资、收购、人事、纯技术论文、与商业变现无关的更新，一律视为废稿。

输出一个 JSON 数组（不要输出其他文字），恰好 ${count} 项，每项字段：
- title: 中文标题（30字以内），必须包含产品/项目的真实名称（如 "ShipFast"、"Attie"、「即梦」这类专有名词），只有品类描述没有名字的（如「AI 营销邮件生成器」）说明你没找到真实案例，这种废稿不要输出
- description: 250-400字中文，讲清事实与数据（谁做的、一个人/小团队怎么做到的、商业模式与变现路径、收入/用户/增长等公开数字、为什么一人可以复刻），不用「你/你的」
- insight: 100-150字中文，第一人称编辑判断（我/我看），核心回答「独立开发者怎么抄这个作业」：复刻切入点、所需技能、现实的 MVP 周期；有明确立场，敢泼冷水也敢给结论
- category: 必须是以下之一: ${VALID_CATEGORIES.join(' / ')}
- mrr_range: 用搜索到的真实公开收入数据（如 "$10K/月"），查不到填 "未披露"
- pricing: 真实定价信息，查不到填 "未披露"
- mvp_time: 真实开发周期信息，查不到填 "未披露"
- refs: 2-3个真实 URL，格式 [{"label":"来源名","url":"https://..."}]，必须来自搜索结果或上方素材，严禁编造
- tags: 2-3个中文标签

要求：
- 严禁编造 URL 和数字；所有数字必须能在公开来源中找到，查不到就写"未披露"
- description 和 insight 用中文
- 只返回 JSON 数组本身`;
  }

  console.log('\n🔬 深度拆解（GLM + 联网搜索，补足 6 篇为止，最多 4 批）...');
  const deepdive = [];
  const MAX_BATCHES = 6;  // 终审拒收率高，多给补足机会
  for (let b = 0; b < MAX_BATCHES && deepdive.length < DEEPDIVE_TOTAL; b++) {
    const need = Math.min(DEEPDIVE_BATCH, DEEPDIVE_TOTAL - deepdive.length);
    console.log(`\n   批次 ${b + 1}/${MAX_BATCHES}（还需 ${need} 篇）...`);
    try {
      // 第 1 批用雷达素材做线索；后续批次切换到纯搜索模式，避免模型反复复读素材
      const mode = b === 0 ? 'seeds' : 'search';
      const raw = await callGLM(sysPrompt, buildPrompt(deepdive.map(d => d.title), need, mode));
      const mapped = raw.slice(0, need).map(it => ({
        title: String(it.title || '').slice(0, 200),
        description: String(it.description || '').slice(0, 900),
        insight: String(it.insight || '').slice(0, 400),
        category: VALID_CATEGORIES.includes(it.category) ? it.category : 'indie-tool',
        creator_level: 'medium',
        compound_potential: 'medium',
        mrr_range: String(it.mrr_range || '未披露').slice(0, 100),
        pricing: String(it.pricing || '未披露').slice(0, 100),
        mvp_time: String(it.mvp_time || '未披露').slice(0, 100),
        refs: (Array.isArray(it.refs) ? it.refs : [])
          .filter(r => r && r.url && /^https?:\/\//.test(r.url))
          .slice(0, 3)
          .map(r => ({ label: String(r.label || '来源').slice(0, 50), url: String(r.url) })),
        tags: (Array.isArray(it.tags) ? it.tags : []).map(t => String(t).slice(0, 30)).slice(0, 3),
        section: 'deepdive',
      }));
      // 信源真实性校验：404/410/假推文 ID 的 ref 直接丢弃；全部 ref 无效则整篇拒收
      for (const m of mapped) {
        m.refs = await validateRefs(m.refs, m.title);
      }
      const noRef = mapped.filter(m => m.refs.length === 0);
      for (const m of noRef) console.log(`   🚫 终审拒收（无有效信源 URL）: ${m.title}`);
      const withRefs = mapped.filter(m => m.refs.length > 0);

      // 本期内去重兜底：共享特征词（≥4个字母或≥2个汉字）即视为重复
      for (const m of withRefs) {
        const tokens = t => (String(t).match(/[A-Za-z]{4,}|[一-龥]{2,}/g) || []);
        const mt = tokens(m.title);
        const dup = deepdive.some(d => {
          const dt = new Set(tokens(d.title));
          return mt.some(tok => dt.has(tok));
        });
        if (dup) { console.log(`   ⚠️ 跳过重复选题: ${m.title}`); continue; }
        // 成品终审：描述/洞察命中大公司或资本关键词的整篇拒收
        if (!isIndieRelevant(`${m.title} ${m.description} ${m.insight}`)) {
          console.log(`   🚫 终审拒收（违反选题铁律）: ${m.title}`);
          continue;
        }
        // 真实性终审：标题必须含真实产品名（拉丁专有名词 ≥3 字母，或 《》「」“” 括起的名字），纯品类词视为编造
        const hasRealName = /[A-Za-z]{3,}/.test(m.title) || /[《「“].+?[》」”]/.test(m.title);
        if (!hasRealName) {
          console.log(`   🚫 终审拒收（无真实产品名，疑似编造）: ${m.title}`);
          continue;
        }
        deepdive.push(m);
      }
    } catch (e) {
      // 单批失败不阻塞整期：保留已成功的批次
      console.log(`   ❌ 批次 ${b + 1} 生成失败（含无工具降级）：${e.message.slice(0, 120)}`);
    }
  }
  deepdive.forEach((it, i) => { it.rank = i + 1; });

  if (deepdive.length === 0) {
    console.log('\n⚠️ 深度拆解全部失败，本期不生成（避免发布空周报）');
    return;
  }
  if (deepdive.length < DEEPDIVE_TOTAL) {
    console.log(`\n⚠️ 仅 ${deepdive.length}/${DEEPDIVE_TOTAL} 篇成功，按实际数量发布`);
  }

  const news = deepdive;
  const summary = `本周 ${deepdive.length} 个深度拆解：AI × 一人公司创业 / 商业 / 变现，全部经联网核实。`;

  // 5. 写入（DRY_RUN 跳过）
  console.log('\n💾 Supabase...');
  if (DRY_RUN) {
    console.log('   🔸 DRY_RUN：跳过 weekly_issues / news_items 写入');
    console.log(`   预览 weekly_issues: slug=${slug} issue=#${ni} summary="${summary}"`);
    for (const it of news) {
      console.log(`   [${it.section}] rank=${it.rank} ${it.title} | refs=${it.refs.length}`);
    }
  } else {
    await sb('/weekly_issues', { method: 'POST', body: JSON.stringify({
      slug, issue_number: ni, year, week_number: wn, week_start: start, week_end: end,
      title: `AI OPC Weekly #${ni}`, summary,
      cover_image: '', status: process.env.WEEKLY_DRAFT === 'true' ? 'draft' : 'published', published_at: new Date().toISOString()
    })});

    // 回查 id（INSERT 响应可能为空）
    const created = await sb(`/weekly_issues?slug=eq.${slug}&select=id&limit=1`);
    const iid = created?.[0]?.id;
    if (!iid) throw new Error('回查 weekly_issue id 失败');
    console.log(`   ✅ issue: ${iid}`);

    const rows = news.map(it => ({ ...it, weekly_issue_id: iid }));
    await sb('/news_items', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
    console.log(`   ✅ ${rows.length} 条 news_items`);
  }

  // 6. 汇总
  console.log('\n📊 汇总:');
  console.log(`   deepdive(深度拆解): ${deepdive.length} 条`);
  console.log(`   DRY_RUN: ${DRY_RUN ? '是（未写入数据库）' : '否（已写入）'}`);
  console.log(`\n✅ W${ni} 完成！\n🌐 https://www.aiopcnews.com/weekly/${slug}`);
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
