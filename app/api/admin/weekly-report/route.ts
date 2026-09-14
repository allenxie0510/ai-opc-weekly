import { isAdminPassword, requestHasAdminSession } from '@/lib/admin-session';
import { createServerSupabase } from '@/lib/server-supabase';
import { isWeeklyReport } from '@/lib/weekly-report.mjs';
import { enrichMaterial } from '@/scripts/lib/weekly-source-reader.mjs';
import { generateReport } from '@/scripts/lib/weekly-report-generator.mjs';
export const runtime='nodejs';
export const maxDuration=300;
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 if(!isAdminPassword(request.headers.get('x-admin-token'))&&!requestHasAdminSession(request))return Response.json({error:'未授权'},{status:401,headers});
 const db=createServerSupabase(true);if(!db)return Response.json({error:'数据服务不可用'},{status:503,headers});
 let id:unknown;
 try{({id}=await request.json());}catch{return Response.json({error:'无效请求'},{status:400,headers});}
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))return Response.json({error:'无效条目'},{status:400,headers});
 const {data:item,error}=await db.from('news_items').select('*').eq('id',id).maybeSingle();
 if(error||!item)return Response.json({error:'条目不存在'},{status:404,headers});
 if(isWeeklyReport(item.editorial_brief?.weekly_report))return Response.json({url:`/reports/${id}`,cached:true},{headers});
 // Publicly released issues are immutable here; new analysis must first return to editorial review.
 const {data:issue}=await db.from('weekly_issues').select('status').eq('id',item.weekly_issue_id).maybeSingle();
 if(issue?.status!=='draft')return Response.json({error:'请先将本期转为草稿，再生成新报告并审核发布'},{status:409,headers});
 try{
  const material=await enrichMaterial({title:item.title,source_url:item.refs?.[0]?.url,source_name:item.refs?.[0]?.label||'原始来源',snippet:item.description});
  const result=await generateReport(material,{maxAttempts:2});
  if(!result.ok)return Response.json({error:`报告未通过证据审核：${result.reason}，原草稿未改动`},{status:422,headers});
  const {data:current}=await db.from('weekly_issues').select('status').eq('id',item.weekly_issue_id).maybeSingle();
  if(current?.status!=='draft')return Response.json({error:'本期状态已改变，请刷新审核台'},{status:409,headers});
  const {error:saveError}=await db.from('news_items').update({editorial_brief:{...(item.editorial_brief||result.item.editorial_brief),weekly_report:result.item.editorial_brief?.weekly_report}}).eq('id',id);
  if(saveError)throw saveError;
  return Response.json({url:`/reports/${id}`,cached:false},{headers});
 }catch{return Response.json({error:'研究服务暂不可用，原草稿已保留，请稍后重试'},{status:503,headers});}
}
