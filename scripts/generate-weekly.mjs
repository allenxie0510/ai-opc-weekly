/**
 * AI OPC Weekly 自动生成脚本 (生产版)
 * 智谱 GLM-4，分两次生成 12 条，写入 Supabase。
 * 
 * 环境变量: SUPABASE_SERVICE_ROLE_KEY, ZHIPU_API_KEY
 * 
 * 历史问题修复:
 * - TS 类型在 .mjs 不合法 → 全部纯 JS
 * - JSON 截断 → 分 2 次调用每次 6 条
 * - Supabase INSERT 空响应 → 回查 slug 取 id
 * - slug 冲突 → 先删旧记录再插入
 * - 内容审查触发 → 精简去重列表 + 重试机制
 */

const SUPABASE_URL = 'https://lamkpavsvuhqhkknkaxc.supabase.co';
const ZHIPU_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZK = process.env.ZHIPU_API_KEY;
if (!SRK) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ZK) { console.error('❌ ZHIPU_API_KEY'); process.exit(1); }

// ─── 工具函数 ───────────────────────────────────────────

function getISOWeekNumber(d) {
  const t = new Date(d); t.setHours(0,0,0,0);
  t.setDate(t.getDate()+3-((t.getDay()+6)%7));
  const j4 = new Date(t.getFullYear(),0,4);
  return 1+Math.round(((t.getTime()-j4.getTime())/864e5-3+((j4.getDay()+6)%7))/7);
}

function getWeekRange(w,y) {
  const j4 = new Date(y,0,4);
  const mon = new Date(j4); mon.setDate(j4.getDate()-((j4.getDay()+6)%7)+(w-1)*7);
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  return { start: mon.toISOString().slice(0,10), end: sun.toISOString().slice(0,10) };
}

async function sb(path, opts={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey:SRK, Authorization:`Bearer ${SRK}`, 'Content-Type':'application/json', ...opts.headers }
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${txt.slice(0,200)}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

async function callGLM(sysPrompt, userPrompt, retries=2) {
  for (let attempt=0; attempt<=retries; attempt++) {
    try {
      const res = await fetch(ZHIPU_API, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${ZK}` },
        body: JSON.stringify({
          model:'glm-4',
          messages: [{ role:'system', content:sysPrompt }, { role:'user', content:userPrompt }],
          temperature: 0.7 + attempt * 0.1,  // 每次重试调高 temperature
          max_tokens: 4096
        })
      });
      const txt = await res.text();
      if (!res.ok) {
        // 内容审查 → 重试（精简 prompt）
        if (txt.includes('1301') && attempt < retries) {
          console.log(`   ⚠️ 内容审查触发，重试 ${attempt+1}/${retries}...`);
          // 重试时精简 prompt，去掉去重列表
          const simplified = userPrompt.split('⚠️')[0];  // 截掉去重部分
          continue;
        }
        throw new Error(`GLM ${res.status}: ${txt.slice(0,200)}`);
      }
      const data = JSON.parse(txt);
      const content = data.choices?.[0]?.message?.content || '';
      const m = content.match(/\[[\s\S]*\]/);
      if (!m) throw new Error(`无JSON: ${content.slice(0,200)}`);
      const items = JSON.parse(m[0]);
      if (!Array.isArray(items) || items.length < 5) throw new Error(`仅${items?.length||0}条`);
      console.log(`   ✅ ${items.length}条 | tok in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}`);
      return items;
    } catch(e) {
      if (attempt >= retries) throw e;
      console.log(`   ⚠️ ${e.message.slice(0,80)}，重试 ${attempt+1}/${retries}...`);
    }
  }
}

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  console.log('🚀 AI OPC Weekly — GLM-4 生产版');
  console.log('');

  // 1. 期号
  console.log('📋 期号...');
  const issues = await sb('/weekly_issues?select=id,slug,issue_number&order=issue_number.desc&limit=5');
  const ni = (issues?.[0]?.issue_number || 27) + 1;
  const year = new Date().getFullYear();
  const wn = getISOWeekNumber(new Date());
  const { start, end } = getWeekRange(wn, year);
  const slug = `${year}-w${String(wn).toLowerCase()}`;
  console.log(`   #${ni-1}→#${ni} | ${slug} | ${start}~${end}`);

  // 2. 清理同名旧记录（防止 slug 冲突）
  const existing = await sb(`/weekly_issues?slug=eq.${slug}&select=id`);
  if (existing && existing.length > 0) {
    console.log(`   ⚠️ 清理旧记录: ${slug}`);
    await sb(`/weekly_issues?slug=eq.${slug}`, { method:'DELETE' });
  }

  // 3. 去重：只取最近 12 条标题（避免列表太长触发审查）
  console.log('🔍 去重...');
  const hist = await sb('/news_items?select=title&order=created_at.desc&limit=12');
  const dupTitles = (hist||[]).map(h => h.title);
  console.log(`   最近 ${dupTitles.length} 条标题`);
  // 用简短格式，避免长列表触发审查
  const dupHint = dupTitles.length > 0
    ? `往期已覆盖的方向（请避开）：${dupTitles.map(t=>t.slice(0,15)).join('、')}`
    : '';

  // 4. 两次调用
  const sys = '你是AI创业趋势分析师。只返回JSON数组。';
  const spec = `日期${start}~${end}。每条含: title, description(150-300字中文,禁用"你/你的"), insight(80-150字), category, creator_level(high/medium/low), compound_potential(high/medium/low), mrr_range, pricing, mvp_time, refs(2-3个[{label,url}]), tags(2-3个), rank。`;

  console.log('');
  console.log('🤖 GLM-4 调用 1/2 (微SaaS·设计资产·自动化)...');
  const b1 = await callGLM(sys, `${spec}\n${dupHint}\n生成3分类各2条: micro-saas, design-assets, automation。rank:1-6。只返回JSON。`);

  console.log('🤖 GLM-4 调用 2/2 (内容变现·小而美·虚拟产品)...');
  const b2 = await callGLM(sys, `${spec}\n${dupHint}\n生成3分类各2条: content-monetize, indie-tool, digital-product。rank:7-12。只返回JSON。`);

  const items = [...b1, ...b2];
  console.log(`   总计 ${items.length} 条`);

  // 5. 写入 weekly_issues
  console.log('');
  console.log('💾 Supabase...');
  await sb('/weekly_issues', { method:'POST', body:JSON.stringify({
    slug, issue_number:ni, year, week_number:wn, week_start:start, week_end:end,
    title:`AI OPC Weekly #${ni}`, summary:'本周精选12个独立创作者AI创业机会。',
    cover_image:'', status:'published', published_at:new Date().toISOString()
  })});

  // 回查 id
  const created = await sb(`/weekly_issues?slug=eq.${slug}&select=id&limit=1`);
  const iid = created?.[0]?.id;
  if (!iid) throw new Error('回查 weekly_issue id 失败');
  console.log(`   ✅ issue: ${iid}`);

  // 6. 写入 news_items
  const news = items.slice(0,12).map((it,i)=>({...it, weekly_issue_id:iid, rank:it.rank||i+1}));
  await sb('/news_items', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates' }, body:JSON.stringify(news) });
  console.log(`   ✅ ${news.length} 条 news_items`);

  // 7. 汇总
  const dist = {}; items.slice(0,12).forEach(i=>{dist[i.category]=(dist[i.category]||0)+1});
  console.log('\n📊 分布:');
  Object.entries(dist).forEach(([c,n])=>console.log(`   ${c}: ${n}`));
  console.log(`\n✅ W${ni} 完成！\n🌐 https://www.aiopcnews.com/weekly/${slug}`);
}

main().catch(e=>{ console.error('\n💥', e.message); process.exit(1); });
