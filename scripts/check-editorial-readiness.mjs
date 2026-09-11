/** Read-only deployment check. Never prints credentials or research content. */
import { appendFileSync } from 'node:fs';
import { readReviewLoad } from './lib/radar-budget.mjs';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function sb(path) {
  if (!url || !key) throw new Error('Missing database configuration');
  const response = await fetch(`${url}/rest/v1${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Schema/readiness query failed: HTTP ${response.status}, table=${path.split('?')[0]}`);
  return response.json();
}
try {
  if (process.env.EDITORIAL_RESEARCH_ENABLED !== 'true') throw new Error('EDITORIAL_RESEARCH_ENABLED must be true for this rollout');
  await Promise.all([
    sb('/radar_items?select=id,editorial_brief&limit=1'),
    sb('/news_items?select=id,editorial_brief&limit=1'),
    sb('/editorial_research?select=id,status&limit=1'),
  ]);
  const load = await readReviewLoad(sb);
  const legacy = await sb('/radar_items?select=id&status=eq.draft&editorial_brief=is.null&limit=1000');
  const published = await sb('/radar_items?select=id&status=eq.published&limit=3');
  const message = `数据库新字段/研究队列可读取；待审${load.pending}，今日新增${load.today}，本轮新增容量${load.capacity}。旧版缺六问草稿${legacy.length}${legacy.length === 1000 ? '+' : ''}。已发布信号至少${published.length}条。只读检查，未抓取、未调用模型、未写入内容。`;
  console.log(message);
  const radar = await sb('/radar_items?select=id,title,status,created_at&order=created_at.desc&limit=6');
  const opportunities = await sb('/opportunities?select=id,title,status,created_at&order=created_at.desc&limit=4');
  const weekly = await sb('/weekly_issues?select=id,slug,status,created_at&order=created_at.desc&limit=2');
  console.log('最近内容入库记录（用于确认后台交付）', JSON.stringify({ radar, opportunities, weekly }));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## 上线就绪检查\n\n${message}\n`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
