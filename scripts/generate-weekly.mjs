/**
 * AI OPC Weekly 自动生成脚本
 * 智谱 GLM-4 旗舰模型，分两次生成 12 条内容，写入 Supabase。
 * 
 * 环境变量: SUPABASE_SERVICE_ROLE_KEY, ZHIPU_API_KEY
 */

const SUPABASE_URL = 'https://lamkpavsvuhqhkknkaxc.supabase.co';
const ZHIPU_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZK = process.env.ZHIPU_API_KEY;
if (!SRK) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ZK) { console.error('❌ ZHIPU_API_KEY'); process.exit(1); }

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

async function supabaseFetch(path, opts={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey:SRK, Authorization:`Bearer ${SRK}`, 'Content-Type':'application/json', ...opts.headers }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0,200)}`);
  return { ok:true, text, json: ()=> text ? JSON.parse(text) : null };
}

async function callGLM(systemPrompt, userPrompt) {
  const res = await fetch(ZHIPU_API, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${ZK}` },
    body: JSON.stringify({
      model:'glm-4',
      messages: [{ role:'system', content:systemPrompt }, { role:'user', content:userPrompt }],
      temperature:0.7, max_tokens:4096
    })
  });
  if (!res.ok) { const e=await res.text(); throw new Error(`Zhipu ${res.status}: ${e.slice(0,300)}`); }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  const m = content.match(/\[[\s\S]*\]/);
  if (!m) throw new Error(`JSON提取失败: ${content.slice(0,300)}`);
  const items = JSON.parse(m[0]);
  if (!Array.isArray(items) || items.length < 5) throw new Error(`仅 ${items?.length||0} 条`);
  console.log(`   ✅ ${items.length} 条 | tokens in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}`);
  return items;
}

async function main() {
  console.log('🚀 AI OPC Weekly — 智谱 GLM-4 自动生成');
  console.log('');

  // 1. 期号 & slug 去重
  console.log('📋 查询最新期号...');
  const r = await supabaseFetch('/weekly_issues?select=id,slug,issue_number&order=issue_number.desc&limit=5');
  const issues = await r.json();
  const ni = (issues[0]?.issue_number||27) + 1;
  const year = new Date().getFullYear();
  const wn = getISOWeekNumber(new Date());
  const { start, end } = getWeekRange(wn, year);
  let slug = `${year}-w${String(wn).toLowerCase()}`;
  
  // 如果 slug 已存在，加后缀
  const existingSlugs = issues.map(i => i.slug);
  if (existingSlugs.includes(slug)) {
    slug = `${slug}-v2`;
    if (existingSlugs.includes(slug)) slug = `${slug.replace('-v2','')}-v3`;
    console.log(`   ⚠️  slug 已存在，使用备用: ${slug}`);
  }
  console.log(`   #${ni-1} → #${ni} | ${slug} | ${start}~${end}`);

  // 1.5 查历史标题去重
  console.log('');
  console.log('🔍 查询历史内容去重...');
  const histRes = await supabaseFetch('/news_items?select=title&limit=200');
  const history = await histRes.json();
  const dupTitles = history.map(h => h.title);
  console.log(`   已有 ${dupTitles.length} 条历史，生成时会避开`);

  // 2. 两次调用
  const sysPrompt = '你是AI创业趋势分析师。只返回 JSON 数组，禁止额外文字。';
  const baseSpec = `日期范围: ${start}~${end}。生成要求: title(项目名称), description(150-300字中文, 禁止用"你/你的"), insight(80-150字落地路径), category, creator_level(high/medium/low), compound_potential(high/medium/low), mrr_range, pricing, mvp_time, refs(2-3个真实URL), tags(2-3个), rank。`;
  const dedupNote = `⚠️ 去重：以下是往期已发布的项目标题，**绝对不要**生成相同或高度相似的内容：\n${dupTitles.map((t,i) => `${i+1}. ${t}`).join('\n')}`;

  console.log('');
  console.log('🤖 第 1 次调用 (GLM-4) — 微SaaS、设计资产、自动化 (6条)...');
  const batch1 = await callGLM(sysPrompt, `${baseSpec}\n${dedupNote}\n请生成3个分类各2条:\n- micro-saas\n- design-assets\n- automation\nrank: 1-6。只返回JSON数组。`);

  console.log('🤖 第 2 次调用 (GLM-4) — 内容变现、小而美、虚拟产品 (6条)...');
  const batch2 = await callGLM(sysPrompt, `${baseSpec}\n${dedupNote}\n请生成3个分类各2条:\n- content-monetize\n- indie-tool\n- digital-product\nrank: 7-12。只返回JSON数组。`);

  const items = [...batch1, ...batch2];
  console.log(`   总计 ${items.length} 条`);

  // 3. 写入
  console.log('');
  console.log('💾 写入 Supabase...');
  await supabaseFetch('/weekly_issues', { method:'POST', body:JSON.stringify({
    slug, issue_number:ni, year, week_number:wn, week_start:start, week_end:end,
    title:`AI OPC Weekly #${ni}`, summary:'本周精选 12 个独立创作者 AI 创业机会。',
    cover_image:'', status:'published', published_at:new Date().toISOString()
  })});

  // POST 不返 body，回查 id
  const q = await supabaseFetch(`/weekly_issues?select=id&slug=eq.${slug}&limit=1`);
  const qdata = q.json();
  const iid = Array.isArray(qdata) ? qdata[0]?.id : qdata?.id;
  if (!iid) throw new Error('创建 weekly_issue 后回查 id 失败');
  console.log(`   ✅ weekly_issue: ${iid}`);

  const news = items.slice(0,12).map((it,i)=>({...it, weekly_issue_id:iid, rank:it.rank||i+1}));
  await supabaseFetch('/news_items', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates' }, body:JSON.stringify(news) });
  console.log(`   ✅ ${news.length} 条 news_items`);

  const dist = {}; items.slice(0,12).forEach(i=>{dist[i.category]=(dist[i.category]||0)+1});
  console.log('\n📊 分类分布:');
  Object.entries(dist).forEach(([c,n])=>console.log(`   ${c}: ${n} 条`));
  console.log(`\n✅ W${ni} 完成！\n🌐 https://www.aiopcnews.com/weekly/${slug}`);
}

main().catch(e=>{ console.error('\n💥 失败:', e.message); process.exit(1); });
