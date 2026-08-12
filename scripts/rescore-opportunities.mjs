/**
 * AI OPC · 机会评分周度复评（P3 飞轮 · Score 历史追踪 + P3.3 评分校准）
 * 拉取近 30 天发布的机会（最多 10 条，老的优先），找出上次评分以来
 * 雷达里的相关新信号，让 GLM 复评打分并落 opportunity_score_history，
 * 使"情报准不准"可回溯验证；同时对比初评判断与新证据输出校准判定
 * （verdict: confirmed/partially/refuted/too-early + 一句话复盘）。
 *
 * 用法：node scripts/rescore-opportunities.mjs
 *   RESCORE_SOURCE=weekly-rescore（workflow 周度）/ manual（手动，默认）
 *
 * 由 GitHub Actions 每周执行（weekly-opportunities.yml 生成 Stage 之后），
 * 也可 admin 后台「🔁 复评评分」按钮手动触发。
 *
 * 铁律：
 * - 单条失败跳过继续，全程 exit 0 不挂 workflow（错误汇总在 log）
 * - 无新信号的机会跳过不复评（没有理由的分数变化是噪音）
 * - 分数量纲：history 存 0–10 一位小数；opportunities.score_total 是 0–100，
 *   仅当复评分换算后差距 ≥10 才回写 score_total
 * - 校准列依赖 migration-003，未执行时自动降级为不带校准列落库（42703 容错）
 *
 * 前置条件：已执行 migrations/migration-002-score-history.sql（否则 42P01 全部跳过）
 *   migration-003-calibration.sql 可选（跑了才落 verdict/calibration_note）
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ZHIPU_API_KEY
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZK = process.env.ZHIPU_API_KEY;

if (!SUPABASE_URL) { console.error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }
if (!SRK) { console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ZK) { console.error('❌ 缺少 ZHIPU_API_KEY'); process.exit(1); }

const SOURCE = ['weekly-rescore', 'manual'].includes(process.env.RESCORE_SOURCE)
  ? process.env.RESCORE_SOURCE : 'manual';
// 强制模式（RESCORE_FORCE=1）：无相关新信号时不跳过，改用近 7 天全站雷达 top 10
// 直接喂 GLM——用于校准代码路径的端到端验证；信号无关时 GLM 应判 too-early
const FORCE = process.env.RESCORE_FORCE === '1';
const GLM_MODEL = 'glm-4.7-flash';
const ZHIPU_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MAX_OPPS = 10;        // 每轮最多复评 10 条
const WINDOW_DAYS = 30;     // 只复评近 30 天发布的机会
const MAX_SIGNALS = 10;     // 每条机会最多喂 10 条新信号
const UPDATE_THRESHOLD = 10; // 复评分 ×10 与 score_total 差距 ≥10 才回写（即 0–10 制差 1 分）

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${txt.slice(0, 200)}`);
  try { return txt ? JSON.parse(txt) : null } catch { return null; }
}

// ─── GLM：复评打分（thinking disabled + json 输出，429 退避重试 2 次）───
async function callGLM(userPrompt) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ZHIPU_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZK}` },
        body: JSON.stringify({
          model: GLM_MODEL,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.3,
          max_tokens: 1000,
          thinking: { type: 'disabled' }, // 简单评分任务关掉推理，否则 reasoning 烧光 max_tokens
        }),
        signal: AbortSignal.timeout(60000),
      });
      const txt = await res.text();
      if (!res.ok) {
        const err = new Error(`GLM ${res.status}: ${txt.slice(0, 150)}`);
        err.congested = res.status === 429 || txt.includes('1305');
        throw err;
      }
      const data = JSON.parse(txt);
      const content = data.choices?.[0]?.message?.content || '';
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`无JSON: ${content.slice(0, 100)}`);
      return JSON.parse(m[0]);
    } catch (e) {
      lastErr = e;
      if (e.congested && attempt < 2) {
        console.log(`   ⚠️ GLM 拥挤(429)，${(attempt + 1) * 20}s 后重试...`);
        await sleep((attempt + 1) * 20000);
        continue;
      }
      if (attempt < 2) { await sleep(5000); continue; }
    }
  }
  throw lastErr;
}

// ─── 关键词粗筛：从机会标题/论断提取英文关键词（≥4 字符），匹配新雷达条目 ───
const STOP_WORDS = new Set(['with', 'from', 'that', 'this', 'your', 'their', 'will', 'into', 'over', 'more', 'than', 'when', 'what', 'how', 'the', 'and', 'for', 'are']);
function keywordsOf(opp) {
  const text = `${opp.title || ''} ${opp.thesis || ''} ${String(opp.category || '').replace(/-/g, ' ')}`;
  const words = text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [];
  return [...new Set(words.filter(w => !STOP_WORDS.has(w)))].slice(0, 12);
}
function matchSignals(opp, items) {
  const kws = keywordsOf(opp);
  if (kws.length === 0) return [];
  return items.filter(it => {
    const hay = `${it.title || ''} ${it.summary || ''}`.toLowerCase();
    return kws.some(k => hay.includes(k));
  }).slice(0, MAX_SIGNALS);
}

async function rescoreOne(opp) {
  // 最近一次评分记录（决定 since 和当前分）；无记录则以机会创建时间为起点
  const hist = await sb(`/opportunity_score_history?opportunity_id=eq.${opp.id}&select=score,created_at&order=created_at.desc&limit=1`);
  const last = hist?.[0] || null;
  const since = last?.created_at || opp.created_at;
  const currentScore10 = last ? Number(last.score) : Math.round(opp.score_total) / 10;

  // 拉上次评分以来的新雷达条目，关键词粗筛相关性
  const items = await sb(`/radar_items?select=id,title,summary,source_name,score,created_at&status=eq.published&created_at=gt.${encodeURIComponent(since)}&order=score.desc&limit=100`);
  let signals = matchSignals(opp, items || []);
  let forced = false;
  if (signals.length === 0 && FORCE) {
    // 强制模式：近 7 天全站雷达 top 10 直接喂 GLM（不要求关键词匹配），
    // 信号无关时 GLM 应判 too-early——这本身就是对判定质量的测试
    const weekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    signals = await sb(`/radar_items?select=id,title,summary,source_name,score,created_at&status=eq.published&created_at=gte.${encodeURIComponent(weekCutoff)}&order=score.desc&limit=${MAX_SIGNALS}`) || [];
    forced = signals.length > 0;
    if (forced) console.log(`   🔧 强制模式：无相关信号，改用近 7 天全站 top ${signals.length} 条: ${opp.title.slice(0, 40)}`);
  }
  if (signals.length === 0) {
    console.log(`   ⏭️ 无新相关信号，跳过: ${opp.title.slice(0, 40)}`);
    return 'skipped';
  }
  const initialReason = String(opp.validation_plan?.recommendation_reason || '').slice(0, 150);
  const forceNote = forced ? `\n注意：这些信号是近 7 天全站雷达热点，可能与该机会无关；若无关或不足以判定，verdict 输出 too-early、signal_strength 输出 stable。` : '';
  const prompt = `你是 AI 创业情报分析师。以下是一条创业机会的初评判断、现有评分和自上次评分以来的新市场信号，请复评并校准初评判断。

机会：${opp.title}
初评论断：${String(opp.thesis || '').slice(0, 200)}
初评理由：${initialReason || '（无记录）'}
当前评分：${currentScore10}/10
新信号（${signals.length} 条）：
${signals.map((s, i) => `${i + 1}. ${s.title}（${s.source_name || '未知来源'}）`).join('\n')}${forceNote}

任务一：根据新信号判断这个机会的论据是变强、持平还是变弱，给出复评分。评分保持克制：默认 signal_strength=stable、分数不变；仅当新信号直接冲击论断核心（证实或证伪）时才调整分数，单次调整幅度不超过 ±0.5；禁止因"行业氛围利好"上调。
任务二（校准）：对比"当初的初评判断"（见上）和"本周新信号"，克制地判定初评是否站得住。
判定标准（严格，宁低勿高）：
- confirmed = 至少一条新信号【直接】证实初评论断（thesis）的【核心主张】——必须能点名哪条信号证实了哪句核心论断；只证实周边主张/背景条件（如"门槛降低""能变现"这类通用利好）不算 confirmed，最多判 partially；
- partially = 有信号支持初评的部分主张，但核心主张未被直接证实；仅证实周边主张而非核心主张时也应选 partially；
- refuted = 新信号与初评论断的具体主张相矛盾（如当初说"窗口期开启"，新证据显示大厂已封死该空间）；
- too-early = 信号数量不足、相关性弱、或无法点名对应关系——拿不准一律选它。
calibration_note 要求：必须引用具体信号标题，句式"当初认为X；本周《信号标题》表明Y，因此判定Z"（60字内）；禁止"证实了可行性""获得认可"这类无指向的套话。
reason 同样禁止套话——必须写明是哪条具体信号导致分数变化及方向（如"《X标题》显示Y，分数+0.3"）；信号与论断仅弱相关时宁可 stable 不硬找理由。
只返回 JSON 对象：{"score": 1到10的数字（可一位小数）, "reason": "一句话中文理由（不超过60字）", "signal_strength": "stronger或stable或weaker", "verdict": "confirmed或partially或refuted或too-early", "calibration_note": "一句话中文复盘：当初认为X，本周新信号Y证实/削弱了它（不超过60字）"}`;

  const r = await callGLM(prompt);
  const score = Math.max(1, Math.min(10, Math.round(Number(r.score) * 10) / 10));
  if (!Number.isFinite(score) || score <= 0) throw new Error(`GLM 返回非法分数: ${JSON.stringify(r).slice(0, 80)}`);
  const reason = String(r.reason || '').slice(0, 120);
  const strength = ['stronger', 'stable', 'weaker'].includes(r.signal_strength) ? r.signal_strength : 'stable';
  const verdict = ['confirmed', 'partially', 'refuted', 'too-early'].includes(r.verdict) ? r.verdict : 'too-early';
  const calibrationNote = String(r.calibration_note || '').slice(0, 120);

  // 校准列依赖 migration-003：未执行时 42703 降级为不带校准列 insert（复评不崩）
  const baseRow = {
    opportunity_id: opp.id,
    score,
    signal_count: signals.length,
    reason,
    source: SOURCE,
  };
  try {
    await sb('/opportunity_score_history', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...baseRow, verdict, calibration_note: calibrationNote }),
    });
  } catch (e) {
    if (/42703|column.*verdict|verdict.*column|PGRST204/i.test(e.message)) {
      await sb('/opportunity_score_history', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(baseRow),
      });
      console.log('   ⚠️ 校准列不存在，已降级落库（请执行 migration-003 后自动启用校准）');
    } else {
      throw e;
    }
  }
  const mark = strength === 'stronger' ? '↗' : strength === 'weaker' ? '↘' : '→';
  console.log(`   ${mark} ${opp.title.slice(0, 40)} | ${currentScore10} → ${score}（${strength}，新信号 ${signals.length} 条）${reason ? ` | ${reason.slice(0, 50)}` : ''}`);

  // 差距 ≥1 分（0–10 制）才回写 score_total（0–100 制）
  const newTotal = Math.round(score * 10);
  if (Math.abs(newTotal - opp.score_total) >= UPDATE_THRESHOLD) {
    await sb(`/opportunities?id=eq.${opp.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ score_total: newTotal }),
    });
    console.log(`   📝 score_total 已更新: ${opp.score_total} → ${newTotal}`);
  }
  return { result: 'ok', verdict };
}

async function main() {
  console.log(`🔁 复评${FORCE ? '（强制模式）' : ''} · source=${SOURCE}\n`);

  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const opps = await sb(`/opportunities?select=id,slug,title,thesis,category,score_total,created_at,validation_plan&status=eq.published&created_at=gte.${encodeURIComponent(cutoff)}&order=created_at.asc&limit=${MAX_OPPS}`);
  console.log(`📋 待复评机会: ${(opps || []).length} 条（近 ${WINDOW_DAYS} 天发布，最多 ${MAX_OPPS} 条，老的优先）`);
  if (!opps || opps.length === 0) { console.log('✅ 无需复评，结束'); return; }

  let ok = 0, skipped = 0, failed = 0;
  const verdicts = { confirmed: 0, partially: 0, refuted: 0, 'too-early': 0 };
  for (const opp of opps) {
    try {
      const r = await rescoreOne(opp);
      if (r === 'skipped') { skipped++; continue; }
      ok++;
      if (r.verdict && verdicts[r.verdict] !== undefined) verdicts[r.verdict]++;
    } catch (e) {
      failed++;
      console.log(`   ⚠️ 复评失败（跳过该条）: ${opp.title.slice(0, 40)} | ${e.message.slice(0, 100)}`);
    }
  }
  console.log(`\n📊 汇总: 复评 ${ok} 条 / 无新信号跳过 ${skipped} 条 / 失败 ${failed} 条`);
  if (ok > 0) {
    console.log(`   校准判定: ✓ 已验证 ${verdicts.confirmed} / ◐ 部分验证 ${verdicts.partially} / ✗ 被证伪 ${verdicts.refuted} / ⏳ 待观察 ${verdicts['too-early']}`);
  }
  console.log('✅ 复评完成');
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
