import { appendFileSync } from 'node:fs';
import { parseRSS, stripHtml } from './lib/feed-parser.mjs';
import { WEEKLY_FEEDS, WEEKLY_PRIMARY_CASES } from './lib/weekly-research-policy.mjs';
import { readPublicUrl, enrichMaterial } from './lib/weekly-source-reader.mjs';
import { weeklyDb as sb } from './lib/weekly-db.mjs';
const report=[];
async function persist(name,rows) {
  const unique=[...new Map(rows.map(r=>[r.source_url,r])).values()];
  if(process.env.WEEKLY_DRY_RUN!=='true' && unique.length) await sb('/radar_candidates?on_conflict=source_url',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(unique.map(r=>({source_name:name,title:r.title.slice(0,200),source_url:r.source_url,snippet:r.snippet.slice(0,1600),published_at:r.published_at,fetched_at:new Date().toISOString()})))});
  report.push({source:name,count:unique.length}); console.log(`${name}: ${unique.length} 条（已有素材不刷新原始日期）`);
}
for(const lead of WEEKLY_PRIMARY_CASES){
 try{const material=await enrichMaterial(lead);await persist(`官方经营页：${new URL(lead.source_url).hostname}`,[{...material,published_at:null}]);}
 catch(e){report.push({source:lead.title,error:e.message});console.warn(`${lead.title}: ${e.message}`);}
}
for(const feed of WEEKLY_FEEDS) {
  try{const {body}=await readPublicUrl(feed.url);await persist(feed.name,parseRSS(body).slice(0,40));}
  catch(e){report.push({source:feed.name,error:e.message});console.warn(`${feed.name}: ${e.message}`);}
}
try {
  const {body}=await readPublicUrl('https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=100');
  await persist('Show HN',JSON.parse(body).hits.filter(h=>h.url&&h.title).map(h=>({title:h.title,source_url:h.url,snippet:stripHtml(h.story_text||h.title),published_at:h.created_at})));
}catch(e){report.push({source:'Show HN',error:e.message});}
if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## 周报独立研究池\n${report.map(r=>`- ${r.source}: ${r.error||`${r.count} 条`}`).join('\n')}\n`);
if(!report.some(r=>r.count>0)) throw new Error('所有周报信源均不可用');
