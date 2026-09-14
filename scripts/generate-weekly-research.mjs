import { appendFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { weeklyDb as sb } from './lib/weekly-db.mjs';
import { canonicalSourceUrl } from './lib/weekly-policy.mjs';
import { selectWeeklyCandidates, portfolioAllows, WEEKLY_TARGET, WEEKLY_MINIMUM } from './lib/weekly-research-policy.mjs';
import { enrichMaterial } from './lib/weekly-source-reader.mjs';
import { generateReport } from './lib/weekly-report-generator.mjs';
import { readWeeklyReviewCache, recentlyRejected, rememberRejection, cacheableRejection } from './lib/weekly-review-cache.mjs';
import { isWeeklyReport, weeklyDeliveryReady } from '../lib/weekly-report.mjs';

const dry=process.env.WEEKLY_DRY_RUN==='true';
const started=Date.now();
const audit={started_at:new Date().toISOString(),intake:0,read:0,accepted:0,rejections:[],complete:false};
// ISO week uses UTC throughout, including the week-year at New Year.
export function weekIdentity(date=new Date()) {
  const day=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  const mon=new Date(day);mon.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));
  const thu=new Date(mon);thu.setUTCDate(mon.getUTCDate()+3);
  const year=thu.getUTCFullYear();const jan4=new Date(Date.UTC(year,0,4));
  jan4.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()+6)%7));
  const week=Math.round((mon-jan4)/604800000)+1;const sun=new Date(mon);sun.setUTCDate(mon.getUTCDate()+6);
  return {slug:`${year}-w${week}`,year,week_number:week,week_start:mon.toISOString().slice(0,10),week_end:sun.toISOString().slice(0,10)};
}
export async function runWeeklyResearch({db=sb,read=enrichMaterial,generate=generateReport}={}){
 Object.assign(audit,{started_at:new Date().toISOString(),intake:0,read:0,accepted:0,rejections:[],complete:false,total:0,reports:0});
 const cachePath=process.env.WEEKLY_REVIEW_STATE_PATH;
 const reviewState=readWeeklyReviewCache(cachePath);
 const period=weekIdentity();
 let issue=(await db(`/weekly_issues?slug=eq.${period.slug}&select=*&limit=1`))?.[0];
 if(issue?.status==='published'){console.log('本周已发布，保留发布版本，不重复生成。');audit.complete=true;return;}
 const selected=issue?await db(`/news_items?weekly_issue_id=eq.${issue.id}&order=rank.asc`):[];
 // Previously saved drafts are preserved. Generate a report for them before adding cases.
 for(const item of selected.filter(x=>!isWeeklyReport(x.editorial_brief?.weekly_report))){
  try{
   const material=await read({title:item.title,source_url:item.refs?.[0]?.url,source_name:item.refs?.[0]?.label||'原始来源',snippet:item.description});
   const result=await generate(material);
   if(!result.ok)throw new Error(result.reason);
   const brief={...(item.editorial_brief||result.item.editorial_brief),weekly_report:result.item.editorial_brief.weekly_report};
   if(!dry)await db(`/news_items?id=eq.${item.id}`,{method:'PATCH',body:JSON.stringify({editorial_brief:brief})});
   item.editorial_brief=brief;console.log(`已有草稿报告已补齐：${item.title}`);
  }catch(e){audit.rejections.push({title:item.title,stage:'backfill',reason:e.message});}
 }
 const cutoff=new Date(Date.now()-90*86400000).toISOString();
 const pool=[];
 for(let offset=0;offset<3000;offset+=500){
  const rows=await db(`/radar_candidates?fetched_at=gte.${cutoff}&order=fetched_at.desc&limit=500&offset=${offset}`);
  pool.push(...rows);if(rows.length<500)break;
 }
 const research=await db('/editorial_research?status=eq.verified&order=verified_at.desc&limit=40');
 pool.push(...research.map(r=>({title:r.title,source_url:r.source_url,snippet:r.excerpt,source_name:'编辑核实案例',fetched_at:r.verified_at,source_access:r.rights_basis==='author-permission'?'authorized':'public',permission_verified:r.rights_basis==='author-permission',editor_verified_at:r.verified_at,research_id:r.id})));
 const history=await db('/news_items?select=title,refs&order=created_at.desc&limit=300');
 const used=new Set([...history,...selected].flatMap(x=>(x.refs||[]).map(r=>canonicalSourceUrl(r.url))));
 const candidates=selectWeeklyCandidates(pool,used);
 audit.intake=candidates.length;console.log(`独立周报研究池：${pool.length} → ${candidates.length}；现有 ${selected.length} 篇；目标 ${WEEKLY_TARGET} 篇`);
 const historicalNames=new Set(history.map(x=>x.title.toLowerCase()));
 for(const lead of candidates){
  if(selected.length>=WEEKLY_TARGET || Date.now()-started>22*60*1000)break;
  if(historicalNames.has(lead.title.toLowerCase()))continue;
  // Enforce diversity before consuming model tokens where possible.
  if(selected.filter(x=>new URL(x.refs[0].url).hostname===new URL(lead.source_url).hostname).length>=2)continue;
  try{
   const material=await read(lead);audit.read++;
   if(recentlyRejected(material,reviewState))throw new Error('recent-content-rejection');
   const result=await generate(material);
   if(!result.ok){if(!dry&&cacheableRejection(result.reason))rememberRejection(material,reviewState,cachePath);throw new Error(result.reason);}
   if(!portfolioAllows(result.item,selected))throw new Error('portfolio-duplicate-or-concentration');
   if(!issue){
    const latest=await db('/weekly_issues?select=issue_number&order=issue_number.desc&limit=1');
    const number=(latest?.[0]?.issue_number||0)+1;
    if(!dry){
     await db('/weekly_issues',{method:'POST',body:JSON.stringify({...period,issue_number:number,title:`AI OPC Weekly #${number}`,summary:'研究草稿整理中',status:'draft',published_at:new Date().toISOString(),cover_image:''})});
     issue=(await db(`/weekly_issues?slug=eq.${period.slug}&select=*&limit=1`))?.[0];
     if(!issue)throw new Error('issue-not-created');
    }else issue={id:'dry-run',issue_number:number,status:'draft'};
   }
   // Check the issue has not been published by an editor while this long job was running.
   if(!dry && (await db(`/weekly_issues?id=eq.${issue.id}&select=status`))?.[0]?.status!=='draft')throw new Error('issue-no-longer-draft');
   const item={...result.item,weekly_issue_id:issue.id,rank:selected.length+1};
   if(!dry)await db('/news_items',{method:'POST',body:JSON.stringify(item)});
   selected.push(item);audit.accepted++; console.log(`已保存 ${selected.length}/${WEEKLY_TARGET}：${item.title} | 研究分 ${item.editorial_brief.weekly_report.score}`);
   if(!dry){
    await db(`/weekly_issues?id=eq.${issue.id}&status=eq.draft`,{method:'PATCH',body:JSON.stringify({summary:`本期 ${selected.length} 个创业案例 · ${selected.length<WEEKLY_MINIMUM?'正在补足研究':'附完整研究报告'} · 从事实到两周验证计划`})});
    if(lead.research_id)await db(`/editorial_research?id=eq.${lead.research_id}`,{method:'PATCH',body:JSON.stringify({status:'drafted',drafted_at:new Date().toISOString()})});
   }
  }catch(e){audit.rejections.push({title:lead.title,url:lead.source_url,stage:'research',reason:e.message});console.log(`未收录：${lead.title} / ${e.message}`);if(e.message==='issue-no-longer-draft')break;}
 }
 const reports=selected.filter(x=>isWeeklyReport(x.editorial_brief?.weekly_report)).length;
 audit.total=selected.length;audit.reports=reports;audit.complete=weeklyDeliveryReady(selected);
 console.log(`本周 ${selected.length} 篇 / 完整报告 ${reports} 篇 / ${dry?'仅预览':'已入库，等待人工审核'}。`);
 if(audit.complete)return {...audit};
 if(!audit.complete)throw new Error(`周报尚未达交付线：${selected.length}/${WEEKLY_MINIMUM} 篇、${reports} 份报告。已有草稿已保存，下轮从缺口继续。`);
}
if(process.argv[1] && fileURLToPath(import.meta.url)===realpathSync(process.argv[1])) runWeeklyResearch().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{
 audit.finished_at=new Date().toISOString();
 writeFileSync(process.env.WEEKLY_AUDIT_PATH||'/tmp/weekly-research-audit.json',JSON.stringify(audit,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## 周报研究交付\n候选 ${audit.intake} → 读原文 ${audit.read} → 新增 ${audit.accepted}。本期 ${audit.total??0} 篇，完整报告 ${audit.reports??0} 份。状态：${audit.complete?'达到交付线':'待补足（已保存成果）'}。\n\n${audit.rejections.map(r=>`- ${r.title}: ${r.reason}`).join('\n')}\n`);
});
