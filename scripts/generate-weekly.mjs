/**
 * AI OPC Weekly 自动生成脚本 (P2 · grounded 版)
 * 周报不再凭空生成：全部素材来自 OPC Radar 数据池。
 *
 * 三段式结构（news_items.section）：
 *   picks    — 本周快讯精选：radar_items(published, 近7天) 按 score 取前 6，确定性映射，不用 LLM
 *   deepdive — 深度拆解：GLM + 联网搜索，从本周雷达素材选 2 个真实案例核实细节后撰写
 *   rejected — 本周弃选：radar_items(rejected, 近7天) 最多 3 条，显性化筛选逻辑
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

const PICKS_LIMIT = 6;     // 快讯精选最多 6 条
const DEEPDIVE_COUNT = 2;  // 深度拆解 2 条
const REJECTED_LIMIT = 3;  // 本周弃选最多 3 条

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

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('🚀 AI OPC Weekly — P2 grounded 版（Radar 素材 + GLM 联网检索）');
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

  // 3. 取素材：时间窗 = 运行时刻往前 7 天
  console.log('\n📥 读取 Radar 素材（近 7 天）...');
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const published = await sb(
    `/radar_items?status=eq.published&published_at=gte.${encodeURIComponent(cutoff)}&order=score.desc&limit=50`
  );
  const rejectedPool = await sb(
    `/radar_items?status=eq.rejected&published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=20`
  );
  console.log(`   published: ${(published || []).length} 条 | rejected: ${(rejectedPool || []).length} 条`);

  if (!published || published.length === 0) {
    console.log('\n⚠️ 时间窗内没有 published 雷达快讯，无法生成 grounded 周报，退出');
    return;
  }

  // 4. 快讯精选（确定性，不用 LLM）：按 score 降序取前 6
  console.log('\n📌 快讯精选（picks）...');
  const picks = published.slice(0, PICKS_LIMIT).map((r, i) => ({
    title: r.title,
    description: r.summary || '',
    insight: r.editor_note || '',
    category: VALID_CATEGORIES.includes(r.category) ? r.category : 'indie-tool',
    creator_level: 'medium',
    compound_potential: 'medium',
    mrr_range: '',
    pricing: '',
    mvp_time: '',
    refs: r.source_url ? [{ label: r.source_name || '来源', url: r.source_url }] : [],
    tags: [],
    rank: i + 1,
    section: 'picks',
  }));
  if (picks.length < 3) {
    console.log(`   ⚠️ 精选仅 ${picks.length} 条（< 3），雷达上线初期数据少属正常，继续`);
  } else {
    console.log(`   ✅ ${picks.length} 条`);
  }

  // 5. 深度拆解（GLM + 联网搜索，2 条）
  console.log('\n🔬 深度拆解（deepdive，GLM + 联网搜索）...');
  const materialText = published.slice(0, 30).map(r =>
    `[${r.source_name}] ${r.title}${r.summary ? ' — ' + String(r.summary).slice(0, 200) : ''}\nURL: ${r.source_url}`
  ).join('\n---\n');

  const sysPrompt = '你是「AI OPC Weekly」的主编，一份面向 AI 一人公司（OPC）创业者的周报。你只基于给定的真实素材和联网检索到的公开信息写作，绝不编造。只返回 JSON 数组。';
  const userPrompt = `以下是本周（${start}~${end}）OPC Radar 收录的真实快讯素材：

${materialText}

任务：从中选出 2 个与「AI × 一人公司创业」最相关的真实案例/产品/事件，通过联网搜索核实细节后，各写一篇深度拆解。

输出一个 JSON 数组（不要输出其他文字），恰好 2 项，每项字段：
- title: 中文标题（30字以内）
- description: 200-350字中文，讲清事实与数据（发生了什么、谁做的、规模/收入/增长等公开数字），不用「你/你的」
- insight: 100-150字中文，第一人称编辑判断（我/我看），有明确立场，不中立和稀泥
- category: 必须是以下之一: ${VALID_CATEGORIES.join(' / ')}
- mrr_range: 用搜索到的真实公开收入数据（如 "$10K/月"），查不到填 "未披露"
- pricing: 真实定价信息，查不到填 "未披露"
- mvp_time: 真实开发周期信息，查不到填 "未披露"
- refs: 2-3个真实 URL，格式 [{"label":"来源名","url":"https://..."}]，必须来自搜索结果或上方素材，严禁编造
- tags: 2-3个中文标签

要求：
- 严禁编造 URL 和数字；所有数字必须能在公开来源中找到
- description 和 insight 用中文
- 只返回 JSON 数组本身`;

  let deepdive = [];
  try {
    const raw = await callGLM(sysPrompt, userPrompt);
    deepdive = raw.slice(0, DEEPDIVE_COUNT).map((it, i) => ({
      title: String(it.title || '').slice(0, 200),
      description: String(it.description || '').slice(0, 800),
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
      rank: picks.length + i + 1,  // 接着精选编号：通常 7-8
      section: 'deepdive',
    }));
    if (deepdive.length === 0) console.log('   ⚠️ GLM 返回为空，本期无深度拆解');
  } catch (e) {
    // 深度拆解失败不阻塞整期：精选 + 弃选仍可发布
    console.log(`   ❌ 深度拆解生成失败（含无工具降级）：${e.message.slice(0, 120)}`);
    console.log('   ⚠️ 本期将只包含快讯精选 + 本周弃选');
  }

  // 6. 本周弃选（确定性，不用 LLM）：窗口内 rejected 最多 3 条
  console.log('\n🚫 本周弃选（rejected）...');
  const rejected = (rejectedPool || []).slice(0, REJECTED_LIMIT).map((r, i) => ({
    title: r.title,
    description: r.reject_reason || '',
    insight: '',
    category: 'indie-tool', // news_items.category 有 NOT NULL 约束；弃选条目前端不走 ArticleCard，分类不参与展示
    creator_level: 'medium',
    compound_potential: 'medium',
    mrr_range: '',
    pricing: '',
    mvp_time: '',
    refs: r.source_url ? [{ label: r.source_name || '来源', url: r.source_url }] : [],
    tags: [],
    rank: 90 + i,
    section: 'rejected',
  }));
  console.log(`   ✅ ${rejected.length} 条`);

  const news = [...picks, ...deepdive, ...rejected];
  const summary = `本周 ${picks.length} 条快讯精选 + ${deepdive.length} 个深度拆解，全部来自真实信源。`;

  // 7. 写入（DRY_RUN 跳过）
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
      cover_image: '', status: 'published', published_at: new Date().toISOString()
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

  // 8. 汇总
  console.log('\n📊 汇总:');
  console.log(`   picks(快讯精选): ${picks.length} 条`);
  console.log(`   deepdive(深度拆解): ${deepdive.length} 条`);
  console.log(`   rejected(本周弃选): ${rejected.length} 条`);
  console.log(`   DRY_RUN: ${DRY_RUN ? '是（未写入数据库）' : '否（已写入）'}`);
  console.log(`\n✅ W${ni} 完成！\n🌐 https://www.aiopcnews.com/weekly/${slug}`);
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
