import { weeklyDb as db } from './lib/weekly-db.mjs';
import { weekIdentity } from './generate-weekly-research.mjs';
import { isWeeklyReport } from '../lib/weekly-report.mjs';
const period=weekIdentity();
for(const slug of [period.slug,`${period.slug}-supplement`]){
 const [issue]=await db(`/weekly_issues?slug=eq.${slug}&select=id,slug,status,issue_number`);
 if(!issue){console.log(JSON.stringify({slug,exists:false}));continue;}
 const items=await db(`/news_items?weekly_issue_id=eq.${issue.id}&select=id,title,editorial_brief&order=rank.asc`);
 console.log(JSON.stringify({...issue,count:items.length,reports:items.filter(x=>isWeeklyReport(x.editorial_brief?.weekly_report)).length,items:items.map(x=>({id:x.id,title:x.title,report_ready:isWeeklyReport(x.editorial_brief?.weekly_report),score:x.editorial_brief?.weekly_report?.score,model:x.editorial_brief?.weekly_report?.model}))},null,2));
}
